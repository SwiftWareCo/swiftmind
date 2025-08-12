"use server";

import { createClient } from "@/server/supabase/server";

export type AcceptInviteResult = { ok: boolean; error?: string; tenant_slug?: string };


export async function acceptInviteAction(token: string, displayName?: string): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  const dn = (displayName || "").trim();
  // Call RPC with parameter names matching the SQL signature (e.g., p_token, p_display_name)
  const { data, error } = await supabase
    .rpc("accept_tenant_invite", { p_token: token, p_display_name: dn || null });

  if (error) return { ok: false, error: error.message };
  const slug = (data as { tenant_slug?: string } | null)?.tenant_slug;
  if (!slug) return { ok: false, error: "Missing tenant slug" };
  return { ok: true, tenant_slug: slug };
}


