"use server";

import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";

export type RoleResult = { ok: boolean; error?: string };
export type UpdateRolePayload = { name?: string; description?: string | null };

export async function createRoleAction(
  tenantId: string,
  key: string,
  name: string,
  description?: string | null,
): Promise<RoleResult> {
  const supabase = await createClient();
  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  const k = (key || "").trim().toLowerCase();
  const n = (name || "").trim();
  if (!k || !n) return { ok: false, error: "Missing input" };

  const { error } = await supabase.from("roles").insert({
    tenant_id: tenantId,
    key: k,
    name: n,
    description: description ?? null,
  } as unknown as Record<string, unknown>);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteRoleAction(tenantId: string, key: string): Promise<RoleResult> {
  const supabase = await createClient();
  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  const k = (key || "").trim();
  if (!k) return { ok: false, error: "Missing key" };

  // Safety: prevent deleting the sentinel 'member' role
  if (k === "member") return { ok: false, error: "Cannot delete default role" };

  // Remove role grants, then role
  const { error: delPermsErr } = await supabase
    .from("role_permissions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("role_key", k);
  if (delPermsErr) return { ok: false, error: delPermsErr.message };

  const { error } = await supabase
    .from("roles")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", k);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateRoleAction(
  tenantId: string,
  key: string,
  payload: UpdateRolePayload,
): Promise<RoleResult> {
  const supabase = await createClient();
  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  const k = (key || "").trim();
  if (!k) return { ok: false, error: "Missing key" };

  const update: Record<string, unknown> = {};
  if (typeof payload.name !== "undefined") update.name = payload.name?.trim() || null;
  if (typeof payload.description !== "undefined") update.description = payload.description ?? null;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("roles")
    .update(update)
    .eq("tenant_id", tenantId)
    .eq("key", k);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}


