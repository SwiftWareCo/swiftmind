"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createInviteAction, revokeInviteAction, inviteLinkForTokenAction } from "@/server/memberships/invites.actions";
import { formatDateTimeLocal } from "@/lib/utils/dates";
import { Badge } from "@/components/ui/badge";

type InviteItem = {
  id: string;
  email: string;
  role_key: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export function InvitesPanel({ tenantId }: { tenantId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  const { data: invites } = useQuery({
    queryKey: ["invites", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, role_key, token, created_at, expires_at, accepted_at, revoked_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("key, name");
      if (error) return [{ key: "member", name: "Member" }, { key: "admin", name: "Admin" }];
      return data || [];
    },
  });

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Invites</h2>
        <Button size="sm" onClick={() => setOpen(true)}>Create invite</Button>
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(invites as InviteItem[] | undefined)?.map((it) => {
              const now = Date.now();
              const expired = it.expires_at ? new Date(it.expires_at).getTime() < now : false;
              const status = it.accepted_at ? "Accepted" : it.revoked_at ? "Revoked" : expired ? "Expired" : "Pending";
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">{it.email}</td>
                  <td className="px-3 py-2">{it.role_key}</td>
                  <td className="px-3 py-2">
                    <Badge variant={status === "Pending" ? "secondary" : status === "Accepted" ? "default" : status === "Revoked" ? "outline" : "destructive"}>
                      {status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{formatDateTimeLocal(it.created_at)}</td>
                  <td className="px-3 py-2">{it.expires_at ? formatDateTimeLocal(it.expires_at) : "—"}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const res = await inviteLinkForTokenAction(it.token);
                        if (res.ok && res.link) {
                          await navigator.clipboard.writeText(res.link);
                          toast.success("Invite link copied");
                        } else {
                          toast.error(res.error || "Failed to copy link");
                        }
                      }}
                    >
                      Copy link
                    </Button>
                    {!it.accepted_at && !it.revoked_at && !expired && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const res = await revokeInviteAction(tenantId, it.id);
                          if (res.ok) {
                            toast.success("Invite revoked");
                            qc.invalidateQueries({ queryKey: ["invites", tenantId] });
                          } else {
                            toast.error(res.error || "Failed to revoke");
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create invite</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" type="email" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm">Role</label>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                {(roles as { key: string; name: string }[] | undefined)?.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  const res = await createInviteAction(tenantId, email.trim(), role);
                  if (res.ok && res.link) {
                    await navigator.clipboard.writeText(res.link);
                    toast.success("Invite created. Link copied to clipboard.");
                    setOpen(false);
                    setEmail("");
                    setRole(roles?.[0]?.key || "member");
                    qc.invalidateQueries({ queryKey: ["invites", tenantId] });
                  } else {
                    toast.error(res.error || "Failed to create invite");
                  }
                }}
              >
                Create & Copy Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


