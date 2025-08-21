# Retrieval Scoring & Guardrails — Current Behavior and Proposed Thresholds

## Current behavior (as implemented)
- Hybrid retrieval in `server/kb/retrieve.ts`:
  - Runs vector (cosine) and keyword (BM25/websearch) in parallel.
  - Normalizes each path independently (min–max) and combines with weights: 0.65 * vector + 0.35 * keyword.
  - De-duplicates by (doc_id, chunk_idx), deterministic sort/tie-breakers, truncates to k (default 8).
  - Optional in-memory cache (~3 minutes TTL) keyed by (tenantId, normalizedQuery, k, useRerank).
  - Optional LLM rerank exists in code but is off by default (latency tradeoff).
- Chat server action `server/chat/chat.actions.ts#askTenantAction`:
  - Calls retrieve({ k: 8, useRerank: false }).
  - If zero chunks, returns a conservative text: "I couldn't find relevant documents ..." with no citations.
  - Otherwise: synthesizes an answer with instructions to cite, returns { text, citations } where each citation includes doc_id, chunk_idx, title, source_uri, snippet, and raw score.
  - Post-gating inclusion: ensure the single strongest keyword candidate is included if reasonably strong (k_norm ≥ 0.5) even if it would otherwise be filtered by floors. This guards ID-like queries without regex heuristics and keeps token usage bounded.
- UI surface:
  - SourcesPanel shows a percentage (rounded from score×100) with a tooltip “Relative relevance among returned sources.”
  - Snippets are collapsed with expand/collapse; citations in the message scroll/highlight the source.

### Known limitations
- No query-quality gate: chitchat or stopword-heavy queries still trigger retrieval; the top item of a weak set can appear as ~30–40% after normalization.
- No minimum-score threshold: low-signal results still produce citations.
- Rerank is disabled by default; borderline queries don’t get a second pass.
- No diversity control (e.g., MMR) across adjacent chunks.

## Proposal: Guardrails & thresholds (v1)
These changes aim to avoid weak citations and improve robustness without overfitting. All numbers are defaults and configurable.

1) Query-quality gate (pre-retrieval)
- Heuristics: minimum non-stopword token count ≥ 3 OR presence of domain-like tokens (emails, IDs, file names). If not met → skip retrieval and respond with “Ask a tenant-specific question (topic, doc, ID…) to get grounded answers.”
- Config: RETRIEVAL_MIN_CONTENT_TOKENS (default 3) and language-agnostic stopword list.

2) Score floors (post-merge)
- Combined score floor: score ≥ 0.45 to accept a source.
- Vector floor: vectorNorm ≥ 0.15 unless keyword rank is very strong (top-1 keyword with ≥0.9 normalized). This avoids keyword-only weak matches.
- Behavior: if no chunks pass floors → return the same conservative “no relevant docs” response (no citations). Separately, we include at most one strongest keyword candidate if k_norm ≥ 0.5 to handle exact-term questions.
- Config: RETRIEVAL_SCORE_FLOOR=0.45, RETRIEVAL_VECTOR_FLOOR=0.15, RETRIEVAL_ALLOW_KEYWORD_TOP1_OVERRIDE=true.

3) Opportunistic rerank
- If the top merged score is in [0.45, 0.60), run a fast rerank over top N (e.g., 20) and take top K after rerank; otherwise skip rerank for high-confidence hits.
- Config: RETRIEVAL_RERANK_ENABLE=true, RETRIEVAL_RERANK_WINDOW=20, RETRIEVAL_RERANK_TRIGGER_MAX=0.60.

4) Diversity (MMR-lite)
- When multiple chunks from the same doc are adjacent with similar scores, pick at most 2 per doc before considering others, unless the scores drop sharply (>0.15 delta).
- Goal: avoid redundant snippets; surface breadth across sources.

5) UI labels for low relevance
- If a citation survives but is near the floor (<0.50), show a subtle “Low relevance” badge next to the percentage; keep the explanatory tooltip.

6) Telemetry & audit
- Write meta on chat.answer with raw vectorMax, keywordMax, combinedTop, rerankMs, usedRerank: boolean, filteredByFloor: boolean, and counts.
- Enables tuning with real distributions per tenant.

## Rollout & risk mitigation
- Feature flags via env:
  - RETRIEVAL_GUARDRAILS_ENABLE=true|false
  - Individual toggles for floors and rerank as above.
- Tenant overrides (optional later): allow per-tenant relaxed floors if needed.
- Safe fallback: when guardrails filter out all results, we already return the conservative, non-hallucinated guidance (present today for zero-chunk cases).
- Stepwise rollout: start with the query gate + combined floor; measure; then enable rerank window if needed.

## Why this won’t make answers worse
- Floors only hide low-signal citations; they never remove clearly relevant, high-score chunks.
- The query-quality gate filters chitchat from triggering misleading sources.
- Opportunistic rerank only runs on borderline cases to improve ordering; it’s skipped for strong hits.
- Everything is feature-flagged with fast rollback to today’s behavior.

## Implementation plan (small, safe edits)
1) server/kb/retrieve.ts
- Return both normalized vector and keyword scores per chunk (add fields in the local RetrievedChunk).
- Add MMR-lite selection and expose top-score stats for audit.

2) server/chat/chat.actions.ts
- Apply query-quality gate (simple tokenizer+stopwords).
- Apply floors using chunk scores; if none pass, return conservative text.
- Log metrics in audit_logs.meta.

3) UI (optional polish)
- Add “Low relevance” badge when score < 0.50 (non-blocking change).

4) Config & docs
- Read env flags with sensible defaults; document in docs/features/retrieval-guardrails.md (this file).

## Manual test plan
- Chitchat: “hey this is a test message” → returns guidance, no citations.
- Borderline: vague query about a tenant topic → may trigger rerank; citations only if scores ≥ floors.
- Strong: exact phrase/ID → high percentage, citations present.
- Regression: flip flags off to confirm current behavior is preserved.
