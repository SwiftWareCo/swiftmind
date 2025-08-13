"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { PaginationControls } from "@/components/ui/pagination";
import { formatDateTimeLocal } from "@/lib/utils/dates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// local type removed; using inline RpcRow below

export default function MembersTable({ tenantId, onUpdateMemberRole }: { tenantId: string; onUpdateMemberRole: (userId: string, newRoleKey: string) => Promise<{ ok: boolean; error?: string }> }) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["members", tenantId, page, pageSize],
    queryFn: async () => {
      // Use RPC: public.list_tenant_members(p_tenant uuid)
      type RpcRow = { user_id: string; role_key: string; created_at: string; email: string; display_name: string | null };
      const { data, error } = await supabase
        .rpc("list_tenant_members", { p_tenant: tenantId })
        .overrideTypes<RpcRow[]>();
      if (error) throw new Error(error.message);
      const rows = (data || []) as RpcRow[];
      return { rows };
    },
    staleTime: 2000,
  });

  const { data: roles } = useQuery({
    queryKey: ["roles", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("key, name")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const updateRole = useMutation({
    mutationFn: async (vars: { userId: string; newRole: string }) => {
      return onUpdateMemberRole(vars.userId, vars.newRole);
    },
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success("Role updated");
      } else {
        toast.error(res?.error || "Failed to update role");
      }
      qc.invalidateQueries({ queryKey: ["members", tenantId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      toast.error(msg);
    },
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
              <td className="px-3 py-2">
                <Select value={r.role_key} onValueChange={(newRole) => updateRole.mutate({ userId: r.user_id, newRole })}>
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles as { key: string; name: string }[] | undefined)?.map((role) => {
                      const isMember = role.key === "member";
                      const label = isMember ? "No role assigned" : role.name;
                      return (
                        <SelectItem key={role.key} value={role.key}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {updateRole.isPending && (
                  <span className="ml-2 text-xs text-muted-foreground">Saving…</span>
                )}
              </td>
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


