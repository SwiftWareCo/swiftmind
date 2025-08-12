"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/server/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
// Input reserved for future inline role editing
import { toast } from "sonner";
// Select not used in this tab; permissions dialog implements its own
// Checkbox used in permissions dialog component
import { setRolePermissions } from "@/server/permissions/role-permissions.actions";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/server/permissions/roles.actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateRoleDialog } from "@/components/settings/CreateRoleDialog";
import { EditPermissionsDialog } from "@/components/settings/EditPermissionsDialog";

type Role = { key: string; name: string; description: string | null };
type Permission = { key: string; description: string | null };

export function RolesTab({ tenantId }: { tenantId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const { data: roles } = useQuery({
    queryKey: ["roles", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("key, name, description")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as Role[];
    },
  });

  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("key, description")
        .order("key", { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as Permission[];
    },
  });

  const { data: rolePerms } = useQuery({
    queryKey: ["role-permissions", tenantId, editRole],
    enabled: Boolean(editRole),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("tenant_id", tenantId)
        .eq("role_key", editRole);
      if (error) throw new Error(error.message);
      return (data || []).map((r) => r.permission_key) as string[];
    },
  });

  // Group permissions by prefix
  const grouped = (permissions || []).reduce((acc, p) => {
    const prefix = p.key.includes(".") ? p.key.split(".")[0] : "general";
    (acc[prefix] ||= []).push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Sync grants when dialog opens/changes
  const currentKeys = new Set(rolePerms || []);
  const grantsState: Record<string, boolean> = {};
  (permissions || []).forEach((p) => (grantsState[p.key] = currentKeys.has(p.key)));

  // Mutations
  const createRole = useMutation({
    mutationFn: async (payload: { key: string; name: string; description?: string | null }) =>
      createRoleAction(tenantId, payload.key, payload.name, payload.description ?? null),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Role created");
        qc.invalidateQueries({ queryKey: ["roles", tenantId] });
        setCreateOpen(false);
      } else {
        toast.error(res.error || "Failed to create role");
      }
    },
  });

  const deleteRole = useMutation({
    mutationFn: async (key: string) => deleteRoleAction(tenantId, key),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Role deleted");
        qc.invalidateQueries({ queryKey: ["roles", tenantId] });
      } else {
        toast.error(res.error || "Failed to delete role");
      }
    },
  });

  const savePerms = useMutation({
    mutationFn: async () => {
      const selected = Object.entries(grants)
        .filter(([, v]) => v)
        .map(([k]) => k);
      // Save metadata first (name/description), then permissions
      if (editRole) {
        await updateRoleAction(tenantId, editRole, { name: editName, description: editDesc || null });
      }
      return setRolePermissions(tenantId, editRole!, selected);
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Permissions updated");
        qc.invalidateQueries({ queryKey: ["role-permissions", tenantId, editRole] });
        qc.invalidateQueries({ queryKey: ["roles", tenantId] });
        setEditRole(null);
      } else {
        toast.error(res.error || "Failed to update permissions");
      }
    },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Manage per-tenant roles</div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>Create role</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(roles || []).map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-3 py-2">{r.key}</td>
                 <td className="px-3 py-2">{r.name}</td>
                 <td className="px-3 py-2">{r.description || "—"}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditRole(r.key);
                      setEditName(r.name);
                      setEditDesc(r.description || "");
                    }}
                  >
                    Edit
                  </Button>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="destructive" disabled={r.key === "member" || deleteRole.isPending}>Delete</Button>}
                    title="Delete role?"
                    description="This will remove the role and its permission grants. Users with this role will appear as 'No role assigned'."
                    onConfirm={async () => {
                      await deleteRole.mutateAsync(r.key);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Role Dialog */}
      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isPending={createRole.isPending}
        onCreate={(payload) => {
          if (!payload.key || !payload.name) return;
          createRole.mutate(payload);
        }}
      />

      {/* Edit Permissions Dialog */}
      <EditPermissionsDialog
        open={Boolean(editRole)}
        onOpenChange={(o) => !o && setEditRole(null)}
        roleKey={editRole}
        grouped={grouped}
        grants={grants}
        setGrants={setGrants}
        onSave={() => savePerms.mutate()}
        isSaving={savePerms.isPending}
        roleName={editName}
        roleDescription={editDesc}
        setRoleName={setEditName}
        setRoleDescription={setEditDesc}
      />
    </div>
  );
}


