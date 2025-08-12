"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { requirePermission } from "@/lib/utils/requirePermission";

export type UpdateRoleResult = { ok: boolean; error?: string };

export async function updateMemberRoleAction(
  tenantId: string,
  userId: string,
  newRoleKey: string,
): Promise<UpdateRoleResult> {
  const supabase = await createClient();

  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  if (!tenantId || !userId || !newRoleKey) return { ok: false, error: "Missing input" };

  // Prevent users from changing their own role
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, error: "500" };
  const currentUserId = auth?.user?.id || null;
  if (currentUserId && currentUserId === userId) {
    return { ok: false, error: "You cannot change your own role" };
  }


  // Ensure role exists for tenant
  const { data: role } = await supabase
    .from("roles")
    .select("key")
    .eq("tenant_id", tenantId)
    .eq("key", newRoleKey)
    .maybeSingle<{ key: string }>();
  if (!role) return { ok: false, error: "Role not found" };

  // Use admin client to ensure update is not blocked by RLS once permission check passes
  const admin = await createAdminClient();
  const { error, data: updated } = await admin
    .from("memberships")
    .update({ role_key: newRoleKey } as unknown as Record<string, unknown>)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { ok: false, error: error.message };

  // Supabase update may succeed but affect 0 rows; ensure at least one row returned
  if (!updated || !Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: "No membership updated" };
  }
  // Since we called .select, the return is data but we didn't capture it in this signature.
  // Re-query membership to validate update took effect.
  const { data: check } = await admin
    .from("memberships")
    .select("role_key")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle<{ role_key: string }>();
  if (!check) return { ok: false, error: "Membership not found" };
  if (check.role_key !== newRoleKey) return { ok: false, error: "Role update did not persist" };

  return { ok: true };
}


