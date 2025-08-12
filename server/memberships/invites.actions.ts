"use server";

import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
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
  const supabase = await createClient();
  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }

  if (!email || !roleKey) return { ok: false, error: "Missing input" };

  // Safety: only allow roles that exist for the tenant; otherwise default to 'member'
  const { data: roleRow } = await supabase
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
  if (userErr || !user) return { ok: false, error: "401" };

  const { error } = await supabase.from("invites").insert({
    tenant_id: tenantId,
    email,
    role_key: safeRoleKey,
    token,
    created_by: user.id,
    expires_at: expires,
  } as unknown as Record<string, unknown>);
  if (error) return { ok: false, error: error.message };

  const base = await getApexBaseUrl();
  // Security: do not include role in link; acceptance RPC will use the stored role on the invite
  const link = `${base}/invite/accept?token=${encodeURIComponent(token)}`;
  return { ok: true, link };
}

export async function revokeInviteAction(tenantId: string, inviteId: string): Promise<RevokeInviteResult> {
  const supabase = await createClient();
  try {
    await requirePermission(tenantId, "members.manage");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "403" };
  }
  const { error } = await supabase
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


