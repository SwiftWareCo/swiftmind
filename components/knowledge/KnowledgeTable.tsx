"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createKbDocsQueryOptions } from "@/lib/queryOptions/kbQueryOptions";
import { DeleteDocButton } from "@/components/knowledge/DeleteDocButton";

type Props = { tenantId: string };

export function KnowledgeTable({ tenantId }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const { data } = useQuery(createKbDocsQueryOptions(tenantId, supabase));


  const rows = data?.rows ?? [];

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
                <TableCell>{d.status}</TableCell>
                <TableCell>{d.chunkCount}</TableCell>
                <TableCell>{d.latestJob ? d.latestJob.status : "–"}</TableCell>
                <TableCell className="text-red-600">{d.error ?? ""}</TableCell>
                <TableCell>
                  <time dateTime={d.created_at}>{new Date(d.created_at).toISOString().replace("T", " ").slice(0, 19)}</time>
                </TableCell>
                 <TableCell>
                   <DeleteDocButton docId={d.id} tenantId={tenantId} />
                 </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


