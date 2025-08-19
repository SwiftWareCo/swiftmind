"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";

export type ActiveAssistantPrompt = {
  tenant_id: string;
  version: number;
  prompt: string;
  role_overrides: Record<string, string> | null;
  updated_at: string;
};

export type AssistantPromptVersion = {
  tenant_id: string;
  version: number;
  prompt: string;
  role_overrides: Record<string, string> | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type TenantRagSettings = {
  tenant_id: string;
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
  created_at: string;
  updated_at: string;
};

export async function getActiveAssistantPrompt(tenantId: string): Promise<ActiveAssistantPrompt | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_active_assistant_prompt")
    .select("tenant_id, version, prompt, role_overrides, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle<ActiveAssistantPrompt>();
  if (error) return null;
  return data ?? null;
}

export async function listAssistantPromptVersions(tenantId: string): Promise<AssistantPromptVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_prompt_versions")
    .select("tenant_id, version, prompt, role_overrides, notes, created_by, created_at")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });
  if (error) return [];
  const rows = (data || []) as unknown as AssistantPromptVersion[];
  return rows;
}

export async function getTenantRagSettings(tenantId: string): Promise<TenantRagSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_rag_settings")
    .select(
      "tenant_id, chat_model, temperature, max_context_tokens, embedding_model, retriever_top_k, overfetch, hybrid_enabled, rerank_enabled, default_allowed_roles, retrieval_timeout_ms, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantRagSettings>();
  if (error) return null;
  return data ?? null;
}


