"use server";

import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";

export type Permission = { key: string; description: string | null };
export type Role = { key: string; name: string; description: string | null };

export async function listPermissions(): Promise<Permission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("permissions").select("key, description").order("key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Permission[];
}

export async function listRoles(tenantId: string): Promise<Role[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("key, name, description")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}

export async function getRolePermissions(tenantId: string, roleKey: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("tenant_id", tenantId)
    .eq("role_key", roleKey);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.permission_key);
}

export async function setRolePermissions(
  tenantId: string,
  roleKey: string,
  permissionKeys: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  // Ensure role exists for tenant
  const { data: role } = await supabase
    .from("roles")
    .select("key")
    .eq("tenant_id", tenantId)
    .eq("key", roleKey)
    .maybeSingle<{ key: string }>();
  if (!role) return { ok: false, error: "Role not found" };

  // Replace strategy: delete existing then insert new grants
  const { error: delErr } = await supabase
    .from("role_permissions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("role_key", roleKey);
  if (delErr) return { ok: false, error: delErr.message };

  if (permissionKeys.length === 0) return { ok: true };

  const rows = permissionKeys.map((perm) => ({
    tenant_id: tenantId,
    role_key: roleKey,
    permission_key: perm,
  })) as unknown as Record<string, unknown>[];

  const { error: insErr } = await supabase.from("role_permissions").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}


