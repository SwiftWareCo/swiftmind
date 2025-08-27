"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTimeLocal } from "@/lib/utils/dates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createKbDocsPageQueryOptions } from "@/lib/queryOptions/kbQueryOptions";
import { PaginationControls } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/knowledge/StatusBadge";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { useActionState } from "react";
import { deleteKbDoc, type DeleteState, previewSearch, type PreviewSearchState } from "@/server/kb/kb.actions";
import { toast } from "sonner";
import { kbDocsKeys } from "@/lib/queryOptions/kbQueryOptions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { EditRolesDialog } from "./EditRolesDialog";

type Props = { tenantId: string; canWrite?: boolean };

export function KnowledgeTable({ tenantId, canWrite = false }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [deleteState, deleteAction] = useActionState<DeleteState, FormData>(deleteKbDoc, { ok: false });
  
  // Search functionality
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchState, searchAction, searchPending] = useActionState<PreviewSearchState, FormData>(previewSearch, { ok: true, results: [] });

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isFetching } = useQuery(createKbDocsPageQueryOptions(tenantId, supabase, page, pageSize));

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!deleteState) return;
    if (deleteState.ok) {
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: kbDocsKeys.list(tenantId) });
    } else if (deleteState.error) {
      toast.error(deleteState.error);
    }
  }, [deleteState, queryClient, tenantId]);

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Search Knowledge</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSearchExpanded(!isSearchExpanded)}
            className="flex items-center gap-2"
          >
            {isSearchExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {isSearchExpanded ? 'Hide' : 'Show'} Search
          </Button>
        </div>
        
        {isSearchExpanded && (
          <div className="space-y-3">
            <form action={searchAction} className="flex items-center gap-2">
              <Input 
                name="query" 
                placeholder="Search knowledge..." 
                className="flex-1" 
              />
              <input type="hidden" name="k" value="5" />
              <Button type="submit" disabled={searchPending} className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                {searchPending ? "Searching..." : "Search"}
              </Button>
            </form>
            
            {searchState && searchState.ok && searchState.results.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Found {searchState.results.length} results</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchState.results.map((result, index) => (
                    <div key={index} className="p-3 border rounded-md bg-muted/30">
                      <div className="font-medium text-sm mb-1">{result.title}</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">{result.snippet}</div>
                      {result.uri && (
                        <a 
                          href={result.uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-primary underline mt-1 inline-block"
                        >
                          View source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {searchState && searchState.ok && searchState.results.length === 0 && !searchPending && (
              <p className="text-sm text-muted-foreground">No results found.</p>
            )}
            
            {searchState && !searchState.ok && (
              <p className="text-sm text-destructive">{searchState.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Documents Table */}
      <div className="rounded-md border">
        <ScrollArea className="max-h-[70vh]">
        <Table>
           <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Created</TableHead>
              {canWrite ? <TableHead></TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  {d.uri ? (
                    <a href={d.uri} className="underline" target="_blank" rel="noreferrer">{d.title}</a>
                  ) : (
                    d.title
                  )}
                </TableCell>
                <TableCell>{d.version ?? 1}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell>{d.chunkCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {d.allowedRoles?.map((role) => (
                        <Badge key={role} variant="outline" className="text-xs">
                          {role}
                        </Badge>
                      )) || <span className="text-muted-foreground text-xs">No roles</span>}
                    </div>
                    {canWrite && (
                      <EditRolesDialog
                        docId={d.id}
                        docTitle={d.title || 'Untitled'}
                        currentRoles={d.allowedRoles || []}
                        onSuccess={() => queryClient.invalidateQueries({ queryKey: kbDocsKeys.list(tenantId) })}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[360px] text-red-600"><div className="line-clamp-2">{d.error ?? ""}</div></TableCell>
                <TableCell>
                  <time dateTime={d.created_at} title={new Date(d.created_at).toISOString()}>
                    {formatDateTimeLocal(d.created_at)}
                  </time>
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <form id={`del-doc-${d.id}`} action={deleteAction} className="inline">
                      <input type="hidden" name="doc_id" value={d.id} />
                      <DeleteButton
                        label="Delete"
                        title="Delete document?"
                        description="This will remove the document and its chunks. This action cannot be undone."
                        formId={`del-doc-${d.id}`}
                      />
                    </form>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ScrollArea>
      </div>
      <PaginationControls
        className="mt-3"
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        isLoading={isFetching}
      />
    </div>
  );
}


