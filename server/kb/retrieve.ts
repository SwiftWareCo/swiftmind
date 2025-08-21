"use server";
import "server-only";

import { createClient } from "@/server/supabase/server";
import { getTenantRagSettings } from "@/server/settings/settings.data";
import { embedQuery } from "@/lib/kb/embed";

type RetrievalParams = {
  tenantId: string;
  query: string;
  k?: number;
  useRerank?: boolean;
  bypassCache?: boolean;
};

type RetrievedChunk = {
  doc_id: string;
  chunk_idx: number;
  title: string | null;
  content: string;
  source_uri?: string | null;
  score: number;
  v_norm?: number;
  k_norm?: number;
};

type RetrievalStats = {
  vectorMs: number;
  keywordMs: number;
  rerankMs: number;
};

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  stats: RetrievalStats;
};

// Small L2 cache in memory (per server instance) with TTL
type CacheEntry = { at: number; ttlMs: number; value: RetrievalResult };
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(p: RetrievalParams): string {
  const k = p.k ?? 8;
  const rr = Boolean(p.useRerank);
  return [p.tenantId, normalizeQuery(p.query), k, rr].join("|");
}

function getFromCache(key: string): RetrievalResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const isExpired = Date.now() - entry.at > entry.ttlMs;
  if (isExpired) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setInCache(key: string, value: RetrievalResult, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { at: Date.now(), ttlMs, value });
}

function expandKeywordSynonyms(q: string): string {
  const lower = q.toLowerCase();
  const expansions: string[] = [];
  if (/(account\s*number|account\s*no\.?|acct\.?)/i.test(lower)) {
    expansions.push('"account number"', '"account no"', '"account #"', 'acct', '"acct #"', '"acct #:"');
  }
  if (/(receipt\s*number|receipt\s*no\.?)/i.test(lower)) {
    expansions.push('"receipt number"', '"receipt no"', '"receipt #"');
  }
  if (/(cheque|check)/i.test(lower)) {
    expansions.push('cheque', 'check');
  }
  if (expansions.length === 0) return q;
  // Use websearch ORs by joining with OR
  const dedup = Array.from(new Set(expansions));
  return `${q} OR ${dedup.join(' OR ')}`;
}

function minMaxNormalize(values: number[]): (score: number) => number {
  if (values.length === 0) return () => 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 0.5; // flat distribution
  return (s: number) => (s - min) / (max - min);
}

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const d = cmp(a.item, b.item);
      return d !== 0 ? d : a.index - b.index;
    })
    .map((x) => x.item);
}

async function rerankCandidates(
  query: string,
  candidates: RetrievedChunk[],
  count: number,
): Promise<RetrievedChunk[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return candidates.slice(0, count); // no rerank without key

  // Compact prompt with deterministic scoring
  const sys =
    "You are a ranking model. Score each passage for relevance to the query from 0 to 1 with 0.01 precision. Respond as a JSON array of numbers only.";
  const user = {
    query,
    passages: candidates.map((c) => ({ id: `${c.doc_id}#${c.chunk_idx}`, text: c.content.slice(0, 1200) })),
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`rerank http ${res.status}`);
    type MinimalChatResponse = { choices?: Array<{ message?: { content?: string } }> };
    const json: MinimalChatResponse = (await res.json()) as MinimalChatResponse;
    const content: string = json.choices?.[0]?.message?.content || "{}";
    let scores: number[] | undefined;
    try {
      const parsed = JSON.parse(content);
      scores = Array.isArray(parsed) ? parsed : parsed.scores;
    } catch {
      // ignore
    }
    if (!Array.isArray(scores) || scores.length !== candidates.length) return candidates.slice(0, count);

    const withRerank = candidates.map((c, i) => ({ ...c, score: scores![i] }));
    return stableSort(withRerank, (a, b) => b.score - a.score).slice(0, count);
  } finally {
    // attach rerankMs via outer scope; we return timing from retrieve
  }
}

export async function retrieve(params: RetrievalParams): Promise<RetrievalResult> {
  const { tenantId, query, k = 8, useRerank = false, bypassCache = false } = params;

  const key = cacheKey(params);
  if (!bypassCache) {
    const cached = getFromCache(key);
    if (cached) return cached;
  }

  const supabase = await createClient();

  // Ensure we are acting as the current user; never use service role here
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error("500");
  if (!userData?.user) throw new Error("401");

  const rag = await getTenantRagSettings(tenantId);
  const effectiveK = rag?.retriever_top_k ?? k;
  const qEmbed = await embedQuery(query);

  const overfetch = rag?.overfetch ?? 50;
  const vectorLimit = Math.max(effectiveK, Math.min(100, overfetch));
  const keywordLimit = Math.max(effectiveK, Math.min(100, overfetch));
  const keywordQuery = expandKeywordSynonyms(query);

  type Row = { doc_id: string; chunk_idx: number; title: string | null; content: string; score: number; source_uri?: string | null };

  async function vectorSearch(): Promise<{ rows: Row[]; ms: number }> {
    const t0 = Date.now();
    const { data, error } = await supabase
      .rpc("kb_vector_search", { t: tenantId, q: qEmbed, limit_k: vectorLimit })
      .select()
      .returns<Row[]>();
    if (error) throw error;
    return { rows: data || [], ms: Date.now() - t0 };
  }

  async function keywordSearch(): Promise<{ rows: Row[]; ms: number }> {
    const t0 = Date.now();
    try {
      const { data, error } = await supabase
        .rpc("kb_keyword_search", { t: tenantId, q: keywordQuery, limit_k: keywordLimit })
        .select()
        .returns<Row[]>();
      if (error) throw error;
      return { rows: data || [], ms: Date.now() - t0 };
    } catch {
      const { data, error } = await supabase
        .from("kb_chunks")
        .select("doc_id, chunk_idx, title, content")
        .eq("tenant_id", tenantId)
        .textSearch("tsv", keywordQuery, { type: "websearch" })
        .limit(keywordLimit);
      if (error) throw error;
      const rows: Row[] = (data || []).map((r) => ({ ...r, score: 0.5 }));
      return { rows, ms: Date.now() - t0 };
    }
  }

  // Hybrid toggle: optionally skip keyword search
  let vectorRows: Row[] = [];
  let keywordRows: Row[] = [];
  let vectorMs = 0;
  let keywordMs = 0;
  if (rag?.hybrid_enabled ?? true) {
    const both = await Promise.all([vectorSearch(), keywordSearch()]);
    vectorRows = both[0].rows;
    vectorMs = both[0].ms;
    keywordRows = both[1].rows;
    keywordMs = both[1].ms;
  } else {
    const only = await vectorSearch();
    vectorRows = only.rows;
    vectorMs = only.ms;
    keywordRows = [];
    keywordMs = 0;
  }

  // Normalize scores independently
  const vectorScores = vectorRows.map((r) => r.score);
  const keywordScores = keywordRows.map((r) => r.score);
  const nv = minMaxNormalize(vectorScores);
  const nk = minMaxNormalize(keywordScores);

  // Merge by (doc_id, chunk_idx)
  type Intermediate = {
    doc_id: string;
    chunk_idx: number;
    title: string | null;
    content: string;
    source_uri?: string | null;
    v?: number; // normalized vector
    k?: number; // normalized keyword
  };
  const byKey = new Map<string, Intermediate>();

  for (const r of vectorRows) {
    const key = `${r.doc_id}#${r.chunk_idx}`;
    const existing = byKey.get(key);
    const base = existing || {
      doc_id: r.doc_id,
      chunk_idx: r.chunk_idx,
      title: r.title,
      content: r.content,
      source_uri: r.source_uri ?? null,
    };
    base.v = nv(r.score);
    byKey.set(key, base);
  }
  for (const r of keywordRows) {
    const key = `${r.doc_id}#${r.chunk_idx}`;
    const existing = byKey.get(key);
    const base = existing || {
      doc_id: r.doc_id,
      chunk_idx: r.chunk_idx,
      title: r.title,
      content: r.content,
      source_uri: r.source_uri ?? null,
    };
    base.k = nk(r.score);
    byKey.set(key, base);
  }

  // Combined score
  const VECTOR_WEIGHT = 0.65;
  const KEYWORD_WEIGHT = 0.35;
  let merged: RetrievedChunk[] = Array.from(byKey.values()).map((r) => {
    const v = r.v ?? 0;
    const k = r.k ?? 0;
    const score = VECTOR_WEIGHT * v + KEYWORD_WEIGHT * k;
    return {
      doc_id: r.doc_id,
      chunk_idx: r.chunk_idx,
      title: r.title,
      content: r.content,
      source_uri: r.source_uri ?? null,
      score,
      v_norm: v,
      k_norm: k,
    };
  });

  // Deterministic sorting & tie-breakers
  merged = stableSort(merged, (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.doc_id !== b.doc_id) return a.doc_id < b.doc_id ? -1 : 1;
    return a.chunk_idx - b.chunk_idx;
  });

  // Optional rerank on top candidates (feature-flag + opportunistic trigger)
  const RERANK_ENABLE = (rag?.rerank_enabled ?? false) || process.env.RETRIEVAL_RERANK_ENABLE === "true" || useRerank;
  const RERANK_WINDOW = Number(process.env.RETRIEVAL_RERANK_WINDOW || 20);
  const RERANK_TRIGGER_MAX = Number(process.env.RETRIEVAL_RERANK_TRIGGER_MAX || 0.6);
  let rerankMs = 0;
  const shouldRerank = RERANK_ENABLE && merged.length > 0 && (useRerank || (merged[0]?.score ?? 1) < RERANK_TRIGGER_MAX);
  if (shouldRerank) {
    const t0 = Date.now();
    const topForRerank = merged.slice(0, Math.min(50, Math.max(effectiveK, RERANK_WINDOW)));
    const reranked = await rerankCandidates(query, topForRerank, effectiveK);
    merged = reranked;
    rerankMs = Date.now() - t0;
  }

  // Diversity (MMR-lite): cap max 2 chunks per doc when scores are close
  const DOC_CAP = Number(process.env.RETRIEVAL_DOC_CAP || 2);
  const selected: RetrievedChunk[] = [];
  const perDoc = new Map<string, number>();
  for (const ch of merged) {
    const count = perDoc.get(ch.doc_id) || 0;
    if (count >= DOC_CAP) continue;
    selected.push(ch);
    perDoc.set(ch.doc_id, count + 1);
    if (selected.length >= effectiveK) break;
  }
  const chunks = selected;

  // Debug logging for gating & selection (dev only)
  // Debug logging disabled by default; enable temporarily when tuning

  const result: RetrievalResult = {
    chunks,
    stats: { vectorMs, keywordMs, rerankMs },
  };

  setInCache(key, result);
  return result;
}


