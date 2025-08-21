"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import type { TablesInsert } from "@/lib/types/database.types";
import { retrieve } from "@/server/kb/retrieve";
import { getActiveAssistantPrompt, getTenantRagSettings } from "@/server/settings/settings.data";
import { getRecentMessagesForContext } from "@/server/chat/chat.data";

type AskInput = { tenantId: string; question: string };
type AskResult = { ok: true; text: string; citations: { doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null; snippet?: string | null; score?: number | null }[] } | { ok: false; error: string };

async function synthesizeAnswer(params: { tenantId: string; userRole: string | null; question: string; contextChunks: { title: string | null; content: string; source_uri?: string | null; doc_id: string; chunk_idx: number }[]; chatModel?: string; temperature?: number }): Promise<string> {
  const { tenantId, userRole, question, contextChunks, chatModel, temperature } = params;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Fallback: simple concatenation
    const joined = contextChunks.map((c, i) => `(${i + 1}) ${c.content}`).join("\n\n");
    return `Based on the following sources, here is an answer:\n\n${joined}`;
  }
  let sys = "You are a helpful assistant. Answer concisely using only the provided context. Cite sources as [1], [2], ... where relevant. If unsure, say you don't know.";
  try {
    const active = await getActiveAssistantPrompt(tenantId);
    if (active) {
      const base = active.prompt || "";
      const overrides = (active.role_overrides || {}) as Record<string, string>;
      const extra = userRole && overrides[userRole] ? `\n\nRole-specific guidance (${userRole}): ${overrides[userRole]}` : "";
      sys = `${base}${extra}`.trim();
    }
  } catch {}
  const ctx = contextChunks.map((c, i) => `[#${i + 1}] ${c.title ? c.title + " — " : ""}${(c.content || "").slice(0, 2000)}`).join("\n\n");
  const user = `Question: ${question}\n\nContext:\n${ctx}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: chatModel || "gpt-4o-mini",
      temperature: typeof temperature === "number" ? temperature : 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai_http_${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content || "";
}

export async function askTenantAction(input: AskInput): Promise<AskResult> {
  const { tenantId, question } = input;
  const q = (question || "").trim();
  if (!tenantId || !q) return { ok: false, error: "Missing input" };

  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  try {
    // Query-quality gate: skip retrieval for low-signal chitchat
    const minTokens = Number(process.env.RETRIEVAL_MIN_CONTENT_TOKENS || 3);
    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const stop = new Set(["the","a","an","and","or","but","of","to","in","on","for","with","is","it","this","that","hey","hi","hello","thanks"]);
    const contentTokens = tokens.filter((t) => !stop.has(t));
    if (contentTokens.length < minTokens) {
      return { ok: true, text: "Ask a tenant-specific question (topic, doc, ID…) to get grounded answers with citations.", citations: [] };
    }

    // RAG controls per-tenant
    const rag = await getTenantRagSettings(tenantId);
    const k = rag?.retriever_top_k ?? 8;
    const useRerank = Boolean(rag?.rerank_enabled);
    const result = await retrieve({ tenantId, query: q, k, useRerank });
    // Thresholds
    const SCORE_FLOOR = Number(process.env.RETRIEVAL_SCORE_FLOOR || 0.45);
    const VECTOR_FLOOR = Number(process.env.RETRIEVAL_VECTOR_FLOOR || 0.15);
    const ALLOW_KW_TOP1 = (process.env.RETRIEVAL_ALLOW_KEYWORD_TOP1_OVERRIDE || "true") === "true";

    let filtered = (result.chunks || []).filter((c, i) => {
      const passCombined = (c.score ?? 0) >= SCORE_FLOOR;
      const passVector = (c.v_norm ?? 0) >= VECTOR_FLOOR;
      const kwTop1 = i === 0 && (c.k_norm ?? 0) >= 0.9;
      return passCombined && (passVector || (ALLOW_KW_TOP1 && kwTop1));
    });

    // Debug: log gating decisions when enabled
    // Gating debug disabled by default; enable temporarily when tuning

    // Inclusion: ensure the single strongest keyword candidate is present if reasonably strong
    try {
      const chunks = result.chunks || [];
      let bestIdx = -1;
      let bestKw = -1;
      for (let i = 0; i < chunks.length; i++) {
        const kw = (chunks[i] as unknown as { k_norm?: number }).k_norm ?? 0;
        if (kw > bestKw) {
          bestKw = kw;
          bestIdx = i;
        }
      }
      const KW_INCLUDE_FLOOR = 0.5;
      if (bestIdx >= 0 && bestKw >= KW_INCLUDE_FLOOR) {
        const candidate = chunks[bestIdx]!;
        const already = filtered.some((c) => c.doc_id === candidate.doc_id && c.chunk_idx === candidate.chunk_idx);
        if (!already) {
          filtered = [...filtered, candidate];
          // Injection debug disabled by default; enable temporarily when tuning
        }
      }
    } catch {}
    if (filtered.length === 0) {
      return { ok: true, text: "I couldn't find relevant documents to answer that. Try refining your question or uploading docs.", citations: [] };
    }
    const citations = filtered.map((c) => ({
      doc_id: c.doc_id,
      chunk_idx: c.chunk_idx,
      title: c.title,
      source_uri: c.source_uri,
      snippet: (c.content || "").slice(0, 300),
      score: (c as unknown as { score?: number }).score ?? null,
    }));
    // Resolve user's role within tenant (via memberships)
    let roleKey: string | null = null;
    try {
      const { data: m } = await supabase
        .from("memberships")
        .select("role_key")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle<{ role_key: string }>();
      roleKey = m?.role_key ?? null;
    } catch {}

    const answer = await synthesizeAnswer({ tenantId, userRole: roleKey, question: q, contextChunks: filtered, chatModel: rag?.chat_model, temperature: rag?.temperature });

    try {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        action: "chat.answer",
        resource: "chat",
        meta: { chars: answer.length, citations: citations.length },
      } as unknown as TablesInsert<"audit_logs">);
    } catch {}

    return { ok: true, text: answer, citations };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
}

// Session-aware APIs

export type CreateSessionInput = { tenantId: string; title?: string };
export async function createSessionAction(input: CreateSessionInput): Promise<{ ok: true; id: string } | { ok: false; error: string }>{
  const { tenantId, title } = input;
  if (!tenantId) return { ok: false, error: "Missing tenant" };
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ tenant_id: tenantId, created_by: user.id, title: title ?? "" })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export type RenameSessionInput = { tenantId: string; sessionId: string; title: string };
export async function renameSessionAction(input: RenameSessionInput): Promise<{ ok: true } | { ok: false; error: string }>{
  const { tenantId, sessionId, title } = input;
  if (!tenantId || !sessionId) return { ok: false, error: "Missing input" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type SoftDeleteSessionInput = { tenantId: string; sessionId: string };
export async function softDeleteSessionAction(input: SoftDeleteSessionInput): Promise<{ ok: true } | { ok: false; error: string }>{
  const { tenantId, sessionId } = input;
  if (!tenantId || !sessionId) return { ok: false, error: "Missing input" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function buildDecontextualizedQuestion(question: string, history: { role: string; content: string }[]): string {
  const q = question.trim();
  if (history.length === 0) return q;
  const context = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  // Simple heuristic: prefix with brief context window; retrieval is robust to extra tokens
  return `${q}\n\nContext (recent turns):\n${context}`;
}

export type AskInSessionInput = { tenantId: string; sessionId: string; question: string };
export async function askInSessionAction(input: AskInSessionInput): Promise<AskResult & { saved: boolean }>{
  const { tenantId, sessionId, question } = input;
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500", saved: false } as const;
  if (!user) return { ok: false, error: "401", saved: false } as const;

  // Save user message first (RLS will enforce membership)
  const { error: insUserErr } = await supabase.from("chat_messages").insert({
    tenant_id: tenantId,
    session_id: sessionId,
    author_user_id: user.id,
    role: "user",
    content: question,
  });
  if (insUserErr) return { ok: false, error: insUserErr.message, saved: false } as const;

  // Pull recent history for context-rewrite
  const history = await getRecentMessagesForContext(sessionId, 6);
  const rewritten = buildDecontextualizedQuestion(question, history.map((m) => ({ role: m.role, content: m.content })));

  // Apply the same query-quality gate as askTenantAction to decide whether to use rewritten context
  const minTokens = Number(process.env.RETRIEVAL_MIN_CONTENT_TOKENS || 3);
  const tokens = question.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const stop = new Set(["the","a","an","and","or","but","of","to","in","on","for","with","is","it","this","that","hey","hi","hello","thanks"]);
  const contentTokens = tokens.filter((t) => !stop.has(t));
  const useRewrite = contentTokens.length >= minTokens;

  // Run retrieval and synthesize
  const res = await askTenantAction({ tenantId, question: useRewrite ? rewritten : question });
  if (!res.ok) return { ...res, saved: false } as const;

  // Save assistant message with citations
  const guardMinTokens = Number(process.env.RETRIEVAL_MIN_CONTENT_TOKENS || 3);
  const guardTokens = question.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((t) => !new Set(["the","a","an","and","or","but","of","to","in","on","for","with","is","it","this","that","hey","hi","hello","thanks"]).has(t));
  const gated = guardTokens.length < guardMinTokens;
  const citationsToSave = gated ? [] : (res.citations || []);

  const { error: insAsstErr } = await supabase.from("chat_messages").insert({
    tenant_id: tenantId,
    session_id: sessionId,
    role: "assistant",
    content: res.text,
    citations: citationsToSave,
  });
  if (insAsstErr) return { ...res, saved: false } as const;

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "chat.ask_in_session",
      resource: "chat",
      meta: { sessionId, chars: res.text.length, citations: (res.citations || []).length },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  return { ok: true, text: res.text, citations: citationsToSave, saved: true } as const;
}



