# Hybrid Retrieval (Vector + BM25) — Tenant & Role Scoped

@features/retrieval/hybrid

## Overview
- Server-only utility `server/kb/retrieve.ts` performs hybrid retrieval across `kb_chunks` using:
  - Vector search (cosine over `embedding_vec`)
  - Keyword search (BM25-ish via `ts_rank_cd` on `tsv` with `websearch_to_tsquery`)
- Results are merged, de-duplicated per `(doc_id, chunk_idx)`, normalized, and combined into a single score.
- Optional re-ranking with a lightweight LLM; disabled by default for latency.
- In-memory TTL cache (3 minutes) keyed by `(tenantId, normalizedQuery, k, useRerank)`.
- All queries run with the current user session; RLS enforces visibility.

## Why
- Pure vector search can miss rare or exact terms (IDs, codes). BM25 complements that.
- Pure keyword search can miss paraphrases. Embeddings complement that.
- Merging both improves robustness and retrieval quality.

## Data & SQL
- Tables: `kb_sources`, `kb_docs`, `kb_chunks`, `kb_ingest_jobs`.
- Vector column: `kb_chunks.embedding_vec vector(1536)` with HNSW/IVFFLAT index.
- Full-text column: `kb_chunks.tsv tsvector` generated from title/content.
- Role visibility: `kb_chunks.allowed_roles text[]` checked by RLS.
- See `docs/sql/kb_retrieval.sql` for DDL, indexes, RLS policies, view `v_kb_chunks_visible`, and RPCs:
  - `kb_vector_search(t uuid, q vector, limit_k int)`
  - `kb_keyword_search(t uuid, q text,  limit_k int)`

## Server Utility
- File: `server/kb/retrieve.ts`
- API:
```ts
type Params = { tenantId: string; query: string; k?: number; useRerank?: boolean; bypassCache?: boolean };
type Chunk = { doc_id: string; chunk_idx: number; title: string | null; content: string; source_uri?: string | null; score: number };
type Result = { chunks: Chunk[]; stats: { vectorMs: number; keywordMs: number; rerankMs: number } };
export async function retrieve(params: Params): Promise<Result>;
```
- Behavior:
  - Creates Supabase server client (user-scoped), verifies user, never uses service role.
  - Embeds the query once via OpenAI `text-embedding-3-small`.
  - Runs vector and keyword searches in parallel (RPCs; falls back to `textSearch` for keyword if RPC missing).
  - Merges with weights: `0.65 * vector + 0.35 * keyword`; deterministic tie-breakers.
  - Optional rerank over top ~50 (set `useRerank=true`).
  - Caching with TTL ~3 minutes; `bypassCache=true` to skip.

## Acceptance Criteria Coverage
- Relevant chunks for semantic questions: vector path.
- Rare/exact terms: keyword path.
- Admin-only visibility: enforced by RLS using current user session.
- Cache improves repeat latency; TTL naturally reflects ingests.

## Manual Test Plan
1) Semantic question: call `retrieve({ tenantId, query: "How do retries work?", k: 8 })` → expect coherent chunks.
2) Exact/ID query: `retrieve({ tenantId, query: "ACME-INV-49302" })` → keyword path surfaces exact match.
3) Role visibility: log in as Admin vs Support, query same phrase → results differ if admin-only chunks exist.
4) Caching: run same query twice without rerank; check `stats.vectorMs+keywordMs` reduction.

## Notes
- Ensure `OPENAI_API_KEY` is set server-side.
- If HNSW index creation fails (managed Postgres), the SQL falls back to IVFFLAT.
- You may tune weights, limits, and rerank model (`gpt-4o-mini` used by default). The chat layer also ensures inclusion of the single strongest keyword candidate (k_norm ≥ 0.5) when needed, to robustly handle exact-term queries without large token usage.


