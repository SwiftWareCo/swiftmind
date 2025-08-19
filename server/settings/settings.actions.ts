"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import type { TablesInsert } from "@/lib/types/database.types";
import { requirePermission } from "@/lib/utils/requirePermission";

type ActionResult = { ok: true } | { ok: false; error: string };

export type CreatePromptVersionInput = {
  tenantId: string;
  prompt: string;
  roleOverrides?: Record<string, string>;
  notes?: string;
  autoActivate?: boolean;
};

export async function createPromptVersionAction(input: CreatePromptVersionInput): Promise<ActionResult> {
  const { tenantId, prompt } = input;
  if (!tenantId || !prompt) return { ok: false, error: "Missing input" };
  await requirePermission(tenantId, "settings.manage");

  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Compute next version
  const { data: maxRow, error: maxErr } = await supabase
    .from("assistant_prompt_versions")
    .select("version", { head: true, count: "exact" })
    .eq("tenant_id", tenantId);
  if (maxErr) return { ok: false, error: maxErr.message };

  // We cannot get max(version) via head/count; fetch max via RPC or query
  const { data: versions, error: vErr } = await supabase
    .from("assistant_prompt_versions")
    .select("version")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false })
    .limit(1)
    .returns<Array<{ version: number }>>();
  if (vErr) return { ok: false, error: vErr.message };
  const nextVersion = (versions?.[0]?.version ?? 0) + 1;

  const insertPayload = {
    tenant_id: tenantId,
    version: nextVersion,
    prompt: input.prompt,
    role_overrides: input.roleOverrides ?? {},
    notes: input.notes ?? null,
    created_by: user.id,
  } as unknown as Record<string, unknown>;

  const { error: insErr } = await supabase.from("assistant_prompt_versions").insert(insertPayload);
  if (insErr) return { ok: false, error: insErr.message };

  // Audit create
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "settings.prompt.create",
      resource: "settings",
      meta: { version: nextVersion },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  if (input.autoActivate) {
    const res = await activatePromptVersionAction({ tenantId, version: nextVersion });
    if (!res.ok) return res;
  }

  return { ok: true } as const;
}

export type ActivatePromptVersionInput = { tenantId: string; version: number };
export async function activatePromptVersionAction(input: ActivatePromptVersionInput): Promise<ActionResult> {
  const { tenantId, version } = input;
  if (!tenantId || !version) return { ok: false, error: "Missing input" };
  await requirePermission(tenantId, "settings.manage");
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Call SQL helper via RPC-like: use exposed function set_active_prompt_version
  const { error } = await supabase.rpc("set_active_prompt_version", { t: tenantId, v: version });
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "settings.prompt.activate",
      resource: "settings",
      meta: { version },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  return { ok: true } as const;
}

export type DeletePromptVersionInput = { tenantId: string; version: number };
export async function deletePromptVersionAction(input: DeletePromptVersionInput): Promise<ActionResult> {
  const { tenantId, version } = input;
  if (!tenantId || !version) return { ok: false, error: "Missing input" };
  await requirePermission(tenantId, "settings.manage");
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Prevent deleting the currently active version
  const { data: activeRow, error: activeErr } = await supabase
    .from("v_active_assistant_prompt")
    .select("version")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ version: number }>();
  if (activeErr) return { ok: false, error: activeErr.message };
  if ((activeRow?.version ?? -1) === version) return { ok: false, error: "Cannot delete the active version" };

  const { error: delErr } = await supabase
    .from("assistant_prompt_versions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("version", version);
  if (delErr) return { ok: false, error: delErr.message };

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "settings.prompt.delete",
      resource: "settings",
      meta: { version },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  return { ok: true } as const;
}

export type UpdatePromptVersionInput = {
  tenantId: string;
  version: number;
  prompt: string;
  roleOverrides?: Record<string, string>;
  notes?: string | null;
};
export async function updatePromptVersionAction(input: UpdatePromptVersionInput): Promise<ActionResult> {
  const { tenantId, version, prompt } = input;
  if (!tenantId || !version || !prompt) return { ok: false, error: "Missing input" };
  await requirePermission(tenantId, "settings.manage");
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  // Prevent editing the currently active version
  const { data: activeRow, error: activeErr } = await supabase
    .from("v_active_assistant_prompt")
    .select("version")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ version: number }>();
  if (activeErr) return { ok: false, error: activeErr.message };
  if ((activeRow?.version ?? -1) === version) return { ok: false, error: "Cannot edit the active version" };

  const payload = {
    prompt: input.prompt,
    role_overrides: input.roleOverrides ?? null,
    notes: input.notes ?? null,
  } as unknown as Record<string, unknown>;

  const { error: updErr } = await supabase
    .from("assistant_prompt_versions")
    .update(payload)
    .eq("tenant_id", tenantId)
    .eq("version", version);
  if (updErr) return { ok: false, error: updErr.message };

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "settings.prompt.update",
      resource: "settings",
      meta: { version },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  return { ok: true } as const;
}

export type UpdateRagSettingsInput = {
  tenantId: string;
  chat_model: string;
  temperature: number;
  max_context_tokens: number;
  embedding_model: string;
  retriever_top_k: number;
  overfetch: number;
  hybrid_enabled: boolean;
  rerank_enabled: boolean;
  default_allowed_roles: string[];
  retrieval_timeout_ms: number;
};

export async function updateRagSettingsAction(input: UpdateRagSettingsInput): Promise<ActionResult> {
  const { tenantId, ...fields } = input;
  if (!tenantId) return { ok: false, error: "Missing tenant" };
  await requirePermission(tenantId, "settings.manage");

  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  const { error } = await supabase
    .from("tenant_rag_settings")
    .update({ ...fields, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "settings.rag.update",
      resource: "settings",
      meta: { changed: Object.keys(fields) },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  return { ok: true } as const;
}


