"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getGoogleAccessToken } from "@/server/integrations/tokenManager";
import type { TablesInsert } from "@/lib/types/database.types";
import { ensureEmailPermissionProvisionedForTenant } from "@/server/permissions/permissions.actions";

export type SendEmailResult = { ok: true; messageId: string } | { ok: false; error: string };

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function auditSend(
  tenantId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "email.send",
      resource: "provider:google",
      meta,
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}
}

export async function sendTestEmailAction(
  tenantId: string,
  to?: string,
): Promise<SendEmailResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Ensure permission exists and guard
  try {
    await ensureEmailPermissionProvisionedForTenant(tenantId);
    await requirePermission(tenantId, "email.send");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  const toEmail = (to && String(to).trim()) || (user.email as string | undefined) || "";
  if (!toEmail) return { ok: false, error: "Recipient email is required" };

  const tokenRes = await getGoogleAccessToken(tenantId);
  if (!tokenRes.ok) {
    const needsReconnect = tokenRes.needsReconnect;
    await auditSend(tenantId, { to: toEmail, status: "failed", needsReconnect: Boolean(needsReconnect) });
    return { ok: false, error: needsReconnect ? "Reconnect required" : tokenRes.error };
  }

  const accessToken = tokenRes.accessToken; // Do not log

  // Minimal RFC 2822 message
  const subject = "Swiftmind test email";
  const body = "This is a test email from Swiftmind.";
  const raw =
    `To: ${toEmail}\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n` +
    `\r\n` +
    `${body}`;

  const rawEncoded = toBase64Url(Buffer.from(raw, "utf8"));

  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ raw: rawEncoded }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      await auditSend(tenantId, { to: toEmail, status: "failed", http: res.status });
      return { ok: false, error: "Failed to send email" };
    }
    const json = (await res.json()) as { id?: string };
    const messageId = json.id || "";
    await auditSend(tenantId, { to: toEmail, status: "success", messageId });
    return { ok: true, messageId };
  } catch {
    await auditSend(tenantId, { to: toEmail, status: "failed", error: "network_error" });
    return { ok: false, error: "Network error sending email" };
  }
}


