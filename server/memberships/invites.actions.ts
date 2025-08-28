"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { requirePermission } from "@/lib/utils/requirePermission";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";
import crypto from "node:crypto";
import { headers } from "next/headers";

export type CreateInviteResult = { ok: boolean; error?: string; link?: string };
export type RevokeInviteResult = { ok: boolean; error?: string };
export type InviteLinkResult = { ok: boolean; error?: string; link?: string };

async function getApexBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = (hdrs.get("x-forwarded-proto") ?? "http").split(",")[0];
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function createInviteAction(
  tenantId: string,
  email: string,
  roleKey: string,
): Promise<CreateInviteResult> {
  // Check if user is platform admin first
  const isPlatformAdminUser = await isPlatformAdmin();
  
  // Use appropriate client and permission checking
  const supabase = await createClient();
  const clientForInsert = isPlatformAdminUser ? await createAdminClient() : supabase;
  
  if (!isPlatformAdminUser) {
    try {
      await requirePermission(tenantId, "members.manage");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "403" };
    }
  }

  if (!email || !roleKey) {
    return { ok: false, error: "Missing input" };
  }

  // Safety: only allow roles that exist for the tenant; otherwise default to 'member'
  // Use admin client for role lookup to bypass RLS
  const admin = await createAdminClient();
  const { data: roleRow } = await admin
    .from("roles")
    .select("key")
    .eq("tenant_id", tenantId)
    .eq("key", roleKey)
    .maybeSingle<{ key: string }>();
  
  const safeRoleKey = roleRow?.key || "member";

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: "401" };
  }

  const inviteData = {
    tenant_id: tenantId,
    email,
    role_key: safeRoleKey,
    token,
    created_by: user.id,
    expires_at: expires,
  };

  const { error } = await clientForInsert.from("invites").insert(inviteData as unknown as Record<string, unknown>);
  
  if (error) {
    return { ok: false, error: error.message };
  }

  const base = await getApexBaseUrl();
  // Security: do not include role in link; acceptance RPC will use the stored role on the invite
  const link = `${base}/invite/accept?token=${encodeURIComponent(token)}`;
  return { ok: true, link };
}

export async function revokeInviteAction(tenantId: string, inviteId: string): Promise<RevokeInviteResult> {
  // Check if user is platform admin first
  const isPlatformAdminUser = await isPlatformAdmin();
  
  // Use appropriate client and permission checking
  const supabase = await createClient();
  const clientForUpdate = isPlatformAdminUser ? await createAdminClient() : supabase;
  
  if (!isPlatformAdminUser) {
    try {
      await requirePermission(tenantId, "members.manage");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "403" };
    }
  }
  
  const { error } = await clientForUpdate
    .from("invites")
    .update({ revoked_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id", inviteId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function inviteLinkForTokenAction(token: string): Promise<InviteLinkResult> {
  if (!token) return { ok: false, error: "Missing token" };
  const base = await getApexBaseUrl();
  return { ok: true, link: `${base}/invite/accept?token=${encodeURIComponent(token)}` };
}


