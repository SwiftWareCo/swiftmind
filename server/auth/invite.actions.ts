"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { ensureUserProfileAction } from "@/server/users/users.actions";
import { acceptInviteAction } from "@/server/tenants/tenants.actions";
import { headers } from "next/headers";

export type ActionResult = { ok: boolean; error?: string; tenant_slug?: string };

async function siteUrlWithNext(nextPath: string): Promise<string> {
  const hdrs = await headers();
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const base = envUrl ? envUrl.replace(/\/$/, "") : `${(hdrs.get("x-forwarded-proto") || "http").split(",")[0]}://${hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000"}`;
  return `${base}${nextPath}`;
}

export async function sendInviteMagicLinkAction(token: string): Promise<ActionResult> {
  if (!token) return { ok: false, error: "Missing token" };
  const supabase = await createClient();

  // Look up invite email by token
  const { data: invite, error: invErr } = await supabase
    .from("invites")
    .select("email, revoked_at, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle<{ email: string; revoked_at: string | null; expires_at: string | null; accepted_at: string | null }>();
  if (invErr) return { ok: false, error: "Invalid invite" };
  if (!invite) return { ok: false, error: "Invite not found" };

  // Basic status checks (more enforcement in DB/RPC during accept)
  if (invite.revoked_at) return { ok: false, error: "Invite revoked" };
  if (invite.accepted_at) return { ok: false, error: "Invite already accepted" };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, error: "Invite expired" };

  const email = invite.email;
  const redirectTo = await siteUrlWithNext(`/invite/accept?token=${encodeURIComponent(token)}`);

  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function completeInviteAction(token: string, displayName: string, newPassword: string): Promise<ActionResult | void> {
  const name = (displayName || "").trim();
  const pass = (newPassword || "").trim();
  if (!token || !name || pass.length < 8) return { ok: false, error: "Missing inputs" };

  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Set profile first
  const prof = await ensureUserProfileAction(name);
  if (!prof.ok) return prof;

  // Set password
  const { error: updErr } = await supabase.auth.updateUser({ password: pass });
  if (updErr) return { ok: false, error: updErr.message };

  // Accept invite
  const res = await acceptInviteAction(token, name);
  if (!res.ok) return { ok: false, error: res.error || "Failed to accept invite" };

  // Redirect to tenant dashboard after successful invite acceptance
  const { buildTenantUrl } = await import("@/lib/utils/tenant");
  const dashboardUrl = await buildTenantUrl(res.tenant_slug!, "/dashboard");
  
  const { redirect } = await import("next/navigation");
  redirect(dashboardUrl);
  

}

export async function completeInviteNewUserAction(token: string, displayName: string, password: string): Promise<ActionResult | void> {

  
  const name = (displayName || "").trim();
  const pass = (password || "").trim();
  if (!token || !name || pass.length < 8) {

    return { ok: false, error: "Missing inputs" };
  }

  // Admin client for RLS-bypassed reads and user creation

  const admin = await createAdminClient();

  // Look up invite to get email

  const { data: inv, error: invErr } = await admin
    .from("invites")
    .select("email, revoked_at, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle<{ email: string; revoked_at: string | null; expires_at: string | null; accepted_at: string | null }>();
  
  if (invErr || !inv) {

    return { ok: false, error: "Invalid invite" };
  }
  

  
  if (inv.revoked_at) {

    return { ok: false, error: "Invite revoked" };
  }
  if (inv.accepted_at) {

    return { ok: false, error: "Invite already accepted" };
  }
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {

    return { ok: false, error: "Invite expired" };
  }

  const email = inv.email;

  
  // Create the user and mark email confirmed
  const { error: signErr } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (signErr) {

    return { ok: false, error: signErr.message };
  }
  


  // Start a session for the new user using the request-scoped server client (sets cookies)

  const userClient = await createClient();
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({ email, password: pass });
  if (signInErr || !signInData?.session) {

    return { ok: false, error: "Failed to start session for new user" };
  }
  


  // Now authenticated as the new user; set profile and accept invite

  const prof = await ensureUserProfileAction(name);
  if (!prof.ok) {

    return prof;
  }
  

  
  const res = await acceptInviteAction(token, name);
  if (!res.ok) {

    return { ok: false, error: res.error || "Failed to accept invite" };
  }
  

  
  // Redirect to tenant dashboard after successful invite acceptance
  const { buildTenantUrl } = await import("@/lib/utils/tenant");
  const dashboardUrl = await buildTenantUrl(res.tenant_slug!, "/dashboard");
  
  const { redirect } = await import("next/navigation");
  redirect(dashboardUrl);
  

}


