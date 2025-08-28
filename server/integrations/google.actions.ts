"use server";
import { createClient } from "@/server/supabase/server";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { codeChallengeS256, GOOGLE_AUTH_BASE_URL, GOOGLE_TOKEN_URL, GMAIL_SCOPES, newCodeVerifier, newState } from "@/lib/utils/oauth.server";
import { encryptJson } from "@/lib/utils/crypto.server";
import type { TablesInsert } from "@/lib/types/database.types";

type StartResult = { ok: true; url: string } | { ok: false; error: string };

type ResolvedTenantUser =
  | { ok: true; user: { id: string }; tenant: { id: string } }
  | { ok: false; error: string };

async function getResolvedTenantAndUser(): Promise<ResolvedTenantUser> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  try {
    const tenant = await getTenantBySlug(slug);
    return { ok: true, user: { id: user.id }, tenant: { id: tenant.id } };
  } catch {
    return { ok: false, error: "404" };
  }
}

export async function startGoogleConnectAction(redirectTo?: string): Promise<StartResult> {
  const ctx = await getResolvedTenantAndUser();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { user, tenant } = ctx;

  try {
    await requirePermission(tenant.id, "members.manage");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  // Create state + PKCE
  const state = newState();
  const codeVerifier = newCodeVerifier();
  const challenge = await codeChallengeS256(codeVerifier);

  const supabase = await createClient();
  const redirect_to = redirectTo || "/connections";

  // Persist state for CSRF + PKCE
  const oauthInsert: TablesInsert<"oauth_states"> = {
    state,
    code_verifier: codeVerifier,
    tenant_id: tenant.id,
    user_id: user.id,
    redirect_to,
  };
  const { error: insertError } = await supabase.from("oauth_states").insert(oauthInsert);
  if (insertError) {
    console.error(insertError);
    return { ok: false, error: "500" };
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `${GOOGLE_AUTH_BASE_URL}?${params.toString()}`;
  return { ok: true, url: authUrl };
}

export async function disconnectGoogleAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getResolvedTenantAndUser();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { tenant } = ctx;
  try {
    await requirePermission(tenant.id, "members.manage");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("integration_secrets")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("provider", "google");

  if (delError) {
    console.error(delError);
    return { ok: false, error: "500" };
  }

  // Optional audit log
  try {
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (freshUser) {
      await supabase.from("audit_logs").insert({
        tenant_id: tenant.id,
        actor_user_id: freshUser.id,
        action: "integration.disconnect",
        resource: "google",
        meta: null,
      } as unknown as TablesInsert<"audit_logs">);
    }
  } catch {}

  return { ok: true };
}

export async function handleGoogleCallbackAction(params: { code?: string | null; state?: string | null; }): Promise<{ ok: boolean; error?: string; redirectTo?: string }> {
  const code = params.code ?? null;
  const state = params.state ?? null;
  if (!code || !state) return { ok: false, error: "Missing code/state" };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Look up oauth state by state only; derive tenant from row
  const { data: stateRow, error: stateErr } = await supabase
    .from("oauth_states")
    .select("state, code_verifier, tenant_id, user_id, redirect_to")
    .eq("state", state)
    .maybeSingle<{ state: string; code_verifier: string | null; tenant_id: string; user_id: string; redirect_to: string | null }>();

  if (stateErr) {
    console.error(stateErr);
    return { ok: false, error: "500" };
  }
  if (!stateRow) {
    return { ok: false, error: "Invalid or expired state" };
  }
  if (stateRow.user_id !== user.id) {
    return { ok: false, error: "State does not belong to current user" };
  }

  // Exchange code → tokens
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
    grant_type: "authorization_code",
    code,
  });
  if (stateRow.code_verifier) body.set("code_verifier", stateRow.code_verifier);

  let tokenResponse: unknown;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("Google token error", res.status, txt);
      return { ok: false, error: "Token exchange failed" };
    }
    tokenResponse = await res.json();
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Token exchange failed" };
  }

  // Encrypt tokens and upsert
  const { ciphertext, nonce } = await encryptJson(tokenResponse as object);
  const secretUpsert: TablesInsert<"integration_secrets"> = {
    tenant_id: stateRow.tenant_id,
    provider: "google",
    ciphertext,
    nonce,
    key_version: 1,
  };
  const { error: upsertError } = await supabase
    .from("integration_secrets")
    .upsert(secretUpsert as unknown as TablesInsert<"integration_secrets">, { onConflict: "tenant_id,provider" } as unknown as { onConflict: string });

  if (upsertError) {
    console.error(upsertError);
    return { ok: false, error: "Failed to save credentials" };
  }

  // Delete the state row
  await supabase
    .from("oauth_states")
    .delete()
    .eq("state", stateRow.state)
    .eq("tenant_id", stateRow.tenant_id)
    .eq("user_id", stateRow.user_id);

  // Optional audit log
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: stateRow.tenant_id,
      actor_user_id: user.id,
      action: "integration.connect",
      resource: "google",
      meta: null,
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

    // Build absolute tenant-aware redirect URL
  let redirectTo = stateRow.redirect_to || "/connections";
  try {
    // Try direct tenants read
    let slug: string | null = null;
    {
      const { data: tenantRecord } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", stateRow.tenant_id)
        .maybeSingle<{ slug: string }>();
      slug = tenantRecord?.slug ?? null;
    }
    // Fallback via memberships join when RLS blocks tenants select
    if (!slug) {
      const { data: m } = await supabase
        .from("memberships")
        .select("tenants!inner(slug)")
        .eq("tenant_id", stateRow.tenant_id)
        .eq("user_id", user.id)
        .maybeSingle<{ tenants: { slug: string } }>();
      slug = m?.tenants?.slug ?? null;
    }

    if (slug) {
      // Use centralized tenant URL builder
      const { buildTenantUrl } = await import("@/lib/utils/tenant");
      redirectTo = await buildTenantUrl(slug, redirectTo);
    }
  } catch {}

  return { ok: true, redirectTo };
}

export async function redirectToGoogleConnectAction(redirectTo?: string): Promise<void> {
  const res = await startGoogleConnectAction(redirectTo);
  if (!res.ok) {
    // Map to simple 403/500
    throw new Error(res.error);
  }
  redirect(res.url);
}


