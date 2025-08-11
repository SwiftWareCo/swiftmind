"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import type { TablesInsert } from "@/lib/types/database.types";
import { retrieve } from "@/server/kb/retrieve";

type AskInput = { tenantId: string; question: string };
type AskResult = { ok: true; text: string; citations: { doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null }[] } | { ok: false; error: string };

async function synthesizeAnswer(question: string, contextChunks: { title: string | null; content: string; source_uri?: string | null; doc_id: string; chunk_idx: number }[]): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Fallback: simple concatenation
    const joined = contextChunks.map((c, i) => `(${i + 1}) ${c.content}`).join("\n\n");
    return `Based on the following sources, here is an answer:\n\n${joined}`;
  }
  const sys = "You are a helpful assistant. Answer concisely using only the provided context. Cite sources as [1], [2], ... where relevant. If unsure, say you don't know.";
  const ctx = contextChunks.map((c, i) => `[#${i + 1}] ${c.title ? c.title + " — " : ""}${(c.content || "").slice(0, 2000)}`).join("\n\n");
  const user = `Question: ${question}\n\nContext:\n${ctx}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
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
    const result = await retrieve({ tenantId, query: q, k: 8, useRerank: false });
    const citations = result.chunks.map((c) => ({ doc_id: c.doc_id, chunk_idx: c.chunk_idx, title: c.title, source_uri: c.source_uri }));
    const answer = await synthesizeAnswer(q, result.chunks);

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

// quickAskAction removed along with Quick Ask UI


