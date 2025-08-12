"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { PaginationControls } from "@/components/ui/pagination";
import { formatDateTimeLocal } from "@/lib/utils/dates";

// local type removed; using inline RpcRow below

export default function MembersTable({ tenantId }: { tenantId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isFetching } = useQuery({
    queryKey: ["members", tenantId, page, pageSize],
    queryFn: async () => {
      // Use RPC: public.list_tenant_members(p_tenant uuid)
      type RpcRow = { user_id: string; role_key: string; created_at: string; email: string; display_name: string | null };
      const { data, error } = await supabase
        .rpc("list_tenant_members", { p_tenant: tenantId })
        .returns<RpcRow[]>();
      if (error) throw new Error(error.message);
      const rows = (data || []) as RpcRow[];
      return { rows };
    },
    staleTime: 2000,
  });

  const allRows = data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const rows = allRows.slice(from, to);

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
            <tr key={r.user_id + r.created_at} className="border-t">
              <td className="px-3 py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{r.display_name || r.email.split("@")[0]}</span>
                  <span className="text-xs text-muted-foreground">{r.email}</span>
                </div>
              </td>
              <td className="px-3 py-2">{r.role_key}</td>
              <td className="px-3 py-2">{formatDateTimeLocal(r.created_at)}</td>
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


