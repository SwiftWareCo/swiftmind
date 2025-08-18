"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createKbDocsPageQueryOptions } from "@/lib/queryOptions/kbQueryOptions";
import { PaginationControls } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/knowledge/StatusBadge";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { useActionState } from "react";
import { deleteKbDoc, type DeleteState } from "@/server/kb/kb.actions";
import { toast } from "sonner";
import { kbDocsKeys } from "@/lib/queryOptions/kbQueryOptions";

type Props = { tenantId: string };

export function KnowledgeTable({ tenantId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [deleteState, deleteAction, deletePending] = useActionState<DeleteState, FormData>(deleteKbDoc, { ok: false });

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
    <div className="mt-6">
      <div className="overflow-x-auto rounded-md border">
        <Table>
           <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Created</TableHead>
               <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell>{d.chunkCount}</TableCell>
                <TableCell>{d.latestJob ? d.latestJob.status : "–"}</TableCell>
                <TableCell className="text-red-600">{d.error ?? ""}</TableCell>
                <TableCell>
                  <time dateTime={d.created_at}>{new Date(d.created_at).toISOString().replace("T", " ").slice(0, 19)}</time>
                </TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
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


