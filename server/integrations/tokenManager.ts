"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";
import { decryptJson, encryptJson } from "@/lib/utils/crypto.server";
import { GOOGLE_TOKEN_URL } from "@/lib/utils/oauth.server";
import type { Tables, TablesInsert } from "@/lib/types/database.types";

export type GoogleTokenBundle = {
  access_token: string;
  expires_in?: number; // seconds
  expires_at?: number; // epoch seconds
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  [key: string]: unknown;
};

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string; needsReconnect?: boolean };

export type IntegrationStatus =
  | { status: "not_connected" }
  | { status: "connected"; updatedAt?: string; emailAddress?: string }
  | { status: "needs_attention"; reason?: string; updatedAt?: string };

async function fetchSecretRow(
  tenantId: string,
): Promise<(Tables<"integration_secrets"> & { updated_at: string }) | null> {
  const supabase = await createClient();
  const { data, error } = (await supabase
    .from("integration_secrets")
    .select("id, tenant_id, provider, ciphertext, nonce, key_version, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "google")
    .maybeSingle()) as unknown as {
    data: (Tables<"integration_secrets"> & { updated_at: string }) | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data;
}

function computeExpiresAt(
  bundle: GoogleTokenBundle,
  secretUpdatedAt?: string,
): number | undefined {
  if (typeof bundle.expires_at === "number") return bundle.expires_at;
  if (typeof bundle.expires_in === "number") {
    const base = secretUpdatedAt
      ? Math.floor(new Date(secretUpdatedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    return base + bundle.expires_in;
  }
  return undefined;
}

function isExpiredSoon(expiresAt?: number, skewSeconds = 60): boolean {
  if (!expiresAt) return true; // Defensive: unknown means we should refresh
  const now = Math.floor(Date.now() / 1000);
  return now >= (expiresAt - skewSeconds);
}

async function audit(
  tenantId: string,
  action: string,
  resource: string,
  meta: Record<string, unknown> | null,
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action,
      resource,
      meta,
    } as unknown as TablesInsert<"audit_logs">);
  } catch {
    // swallow audit errors
  }
}

async function refreshGoogleToken(
  tenantId: string,
  bundle: GoogleTokenBundle,
): Promise<GoogleTokenBundle | { error: string; needsReconnect?: boolean }> {
  if (!bundle.refresh_token) {
    await audit(tenantId, "integration.refresh", "google", {
      status: "failed",
      error: "missing_refresh_token",
    });
    return { error: "Missing refresh token", needsReconnect: true };
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: bundle.refresh_token,
  });

  let json: unknown;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      const err = (json as { error?: string })?.error || `http_${res.status}`;
      const reconnect = err === "invalid_grant";
      await audit(tenantId, "integration.refresh", "google", {
        status: "failed",
        error: err,
      });
      return { error: "Token refresh failed", needsReconnect: reconnect };
    }
  } catch {
    await audit(tenantId, "integration.refresh", "google", {
      status: "failed",
      error: "network_error",
    });
    return { error: "Network error refreshing token" };
  }

  const resp = json as Partial<GoogleTokenBundle>;
  const now = Math.floor(Date.now() / 1000);
  const merged: GoogleTokenBundle = {
    ...bundle,
    ...resp,
    // Preserve existing refresh_token if Google omits it
    refresh_token: resp.refresh_token || bundle.refresh_token,
    expires_at: typeof resp.expires_in === "number" ? now + resp.expires_in : computeExpiresAt(bundle),
  };

  // Persist encrypted bundle
  const { ciphertext, nonce } = await encryptJson(merged);
  const supabase = await createClient();
  const upsert: TablesInsert<"integration_secrets"> = {
    tenant_id: tenantId,
    provider: "google",
    ciphertext,
    nonce,
    key_version: 1,
  };
  const { error: upsertErr } = await supabase
    .from("integration_secrets")
    .upsert(upsert as unknown as TablesInsert<"integration_secrets">, {
      onConflict: "tenant_id,provider",
    } as unknown as { onConflict: string });

  if (upsertErr) {
    await audit(tenantId, "integration.refresh", "google", {
      status: "failed",
      error: "persist_failed",
    });
    return { error: "Failed to persist refreshed token" };
  }

  await audit(tenantId, "integration.refresh", "google", { status: "success" });
  return merged;
}

export async function getGoogleAccessToken(tenantId: string): Promise<AccessTokenResult> {
  // Read current secret
  const secret = await fetchSecretRow(tenantId);
  if (!secret) return { ok: false, error: "Not connected" };

  let bundle: GoogleTokenBundle;
  try {
    bundle = await decryptJson<GoogleTokenBundle>(secret.ciphertext, secret.nonce);
  } catch {
    return { ok: false, error: "Failed to decrypt credentials" };
  }

  const expiresAt = computeExpiresAt(bundle, secret.updated_at);
  if (!isExpiredSoon(expiresAt)) {
    return { ok: true, accessToken: bundle.access_token };
  }

  const refreshed = await refreshGoogleToken(tenantId, bundle);
  if ("error" in refreshed) {
    // Parallel win handling: re-read and try again if someone else refreshed
    const latest = await fetchSecretRow(tenantId);
    if (latest) {
      try {
        const b = await decryptJson<GoogleTokenBundle>(latest.ciphertext, latest.nonce);
        const latestExpiresAt = computeExpiresAt(b, latest.updated_at);
        if (!isExpiredSoon(latestExpiresAt)) {
          return { ok: true, accessToken: b.access_token };
        }
      } catch {
        // ignore and fall through
      }
    }
    return { ok: false, error: refreshed.error as string, needsReconnect: refreshed.needsReconnect as boolean };
  }

  return { ok: true, accessToken: refreshed.access_token };
}

export async function getGoogleIntegrationStatus(tenantId: string): Promise<IntegrationStatus> {
  const secret = await fetchSecretRow(tenantId);
  if (!secret) return { status: "not_connected" };

  try {
    const bundle = await decryptJson<GoogleTokenBundle>(secret.ciphertext, secret.nonce);
    if (!bundle.refresh_token) {
      return { status: "needs_attention", reason: "missing_refresh_token", updatedAt: secret.updated_at };
    }

    // Check last refresh audit for failures
    try {
      const supabase = await createClient();
      const { data } = (await supabase
        .from("audit_logs")
        .select("action, created_at, meta")
        .eq("tenant_id", tenantId)
        .eq("resource", "google")
        .eq("action", "integration.refresh")
        .order("created_at", { ascending: false })
        .limit(1)) as unknown as {
        data: { action: string; created_at: string; meta: unknown }[] | null;
      };
      const last = data && data[0];
      if (last && (last.meta as { status?: string } | null)?.status === "failed") {
        return { status: "needs_attention", reason: "last_refresh_failed", updatedAt: secret.updated_at };
      }
    } catch {
      // ignore audit read issues; default to connected
    }

    // Optionally fetch profile email for display
    let emailAddress: string | undefined = undefined;
    try {
      const access = await getGoogleAccessToken(tenantId);
      if (access.ok) {
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${access.accessToken}` }, cache: "no-store" });
        if (res.ok) {
          const pj = (await res.json()) as { emailAddress?: string };
          emailAddress = pj.emailAddress;
        }
      }
    } catch {}

    return { status: "connected", updatedAt: secret.updated_at, emailAddress };
  } catch {
    return { status: "needs_attention", reason: "decrypt_failed", updatedAt: secret.updated_at };
  }
}


