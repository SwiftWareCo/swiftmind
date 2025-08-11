"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { PaginationControls } from "@/components/ui/pagination";

type Row = { action: string; resource: string; created_at: string };

export default function AuditTable({ tenantId }: { tenantId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, isFetching } = useQuery({
    queryKey: ["audit", tenantId, page, pageSize],
    queryFn: async () => {
      const res = await supabase
        .from("audit_logs")
        .select("action, resource, created_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (res.error) throw new Error(res.error.message);
      return { rows: (res.data || []) as Row[], total: res.count ?? 0 };
    },
    staleTime: 2000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Resource</th>
            <th className="px-3 py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.created_at}_${i}`} className="border-t">
              <td className="px-3 py-2">{r.action}</td>
              <td className="px-3 py-2">{r.resource}</td>
              <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls
        className="px-3 py-2"
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        isLoading={isFetching}
      />
    </div>
  );
}


