"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { PaginationControls } from "@/components/ui/pagination";

type Row = { id: string; role_key: string; user_id: string; created_at: string };

export default function MembersTable({ tenantId }: { tenantId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, isFetching } = useQuery({
    queryKey: ["members", tenantId, page, pageSize],
    queryFn: async () => {
      const res = await supabase
        .from("memberships")
        .select("id, role_key, user_id, created_at", { count: "exact" })
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
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{r.user_id}</td>
              <td className="px-3 py-2">{r.role_key}</td>
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


