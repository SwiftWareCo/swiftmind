# Assistant Prompt (Versioned) & RAG Settings — Per‑Tenant Controls

## Overview
- Per‑tenant, versioned assistant system prompt with optional role overrides
- Per‑tenant Retrieval‑Augmented Generation (RAG) knobs used by chat
- RLS enforced; any tenant member can view, only admins with `settings.manage` can mutate

## Data & SQL (assumed provisioned)
- Tables:
  - `assistant_prompts(tenant_id, active_version, created_by, created_at, updated_at)`
  - `assistant_prompt_versions(tenant_id, version, prompt, role_overrides, notes, created_by, created_at)`
  - `tenant_rag_settings(tenant_id, chat_model, temperature, max_context_tokens, embedding_model, retriever_top_k, overfetch, hybrid_enabled, rerank_enabled, default_allowed_roles, retrieval_timeout_ms, created_at, updated_at)`
- View:
  - `v_active_assistant_prompt(tenant_id, version, prompt, role_overrides, updated_at)`
- RPC:
  - `set_active_prompt_version(t uuid, v int)`
- RLS policies allow reads to members and mutations to users with `settings.manage`.

## Permissions
- **settings.manage**: required to create/activate prompt versions and update RAG settings
- Non‑admins can view both the active prompt and current RAG settings (read‑only)

## UI (Settings → Assistant & RAG Tabs)
- **Assistant**
  - Shows a prompt preview; choosing a historical version previews its text
  - “Compare with active” opens a side‑by‑side diff between the active and selected versions
  - Admins can “Activate” the selected version (confirm dialog)
  - “Create new version” dialog: prompt textarea, optional notes, and a Role overrides editor; optional auto‑activate
- **RAG**
  - Admins can edit; non‑admins see read‑only values
  - Fields include chat model select, temperature, max context, retriever top‑k, overfetch, hybrid/rerank toggles, allowed roles default, and timeout

## Server Actions
- `createPromptVersionAction({ tenantId, prompt, roleOverrides?, notes?, autoActivate? })`
- `activatePromptVersionAction({ tenantId, version })`
- `updateRagSettingsAction({ tenantId, ...fields })`
- All guarded by `requirePermission(tenantId, 'settings.manage')`
- Audit:
  - `settings.prompt.create`
  - `settings.prompt.activate`
  - `settings.rag.update`

## Chat Integration
- System prompt is read from `v_active_assistant_prompt` at answer time
- If `role_overrides[role_key]` exists for the current user’s role, it is appended to the base prompt
- RAG settings are fetched from `tenant_rag_settings` and applied end‑to‑end:
  - `retriever_top_k`, `overfetch`, `hybrid_enabled`, `rerank_enabled`
  - `chat_model`, `temperature`, `max_context_tokens`, `retrieval_timeout_ms`

## Role Overrides — Guidance
- Overrides are appended to the system prompt for users with that role
- Use to tailor tone, guardrails, or preferred behaviors, e.g.:
  - Support: “Prefer KB templates; do not reveal internal operational details.”
  - Operations: “Favor concise, actionable steps; avoid speculative answers.”
- Be explicit when prohibiting behaviors (“Do not …”) so the model treats them as constraints

## RAG Field Reference (what changing each does)
- **Chat model**: Primary LLM that composes answers
  - Options: `gpt-4o-mini` (fast/cheap), `gpt-4o` (stronger), `o4-mini` (reasoning‑lite)
  - Impact: Quality vs. latency/cost
- **Temperature**: Creativity vs. determinism
  - Lower (e.g., 0.2) → more factual/consistent; higher → more varied/creative
- **Max context tokens**: Upper bound on tokens used to build prompts
  - Prevents oversized inputs; too low can truncate context excessively
- **Embedding model**: Used to embed queries (and should match KB doc embeddings)
  - Keep consistent with how KB was embedded (e.g., `text-embedding-3-small`)
  - Changing this without re‑embedding KB will degrade retrieval quality
- **Retriever top K**: Number of passages returned after ranking
  - Lower favors precision; higher favors recall (more sources)
- **Overfetch**: Candidate pool size before final selection/rerank
  - Larger overfetch may improve quality at the cost of latency
- **Hybrid enabled**: Use both vector and keyword searches
  - Improves robustness for exact terms and paraphrases
- **Rerank enabled**: Secondary LLM pass to re‑score top candidates
  - Pros: Better ordering/precision when tops are borderline
  - Cons: Adds an extra LLM request → more latency and small token cost (even with `gpt‑4o‑mini`)
- **Default allowed roles**: Default visibility for ingested chunks
  - Controls which roles can see chunks unless overridden at ingest time
- **Retrieval timeout (ms)**: Abort retrieval beyond this limit
  - Reduces tail latency; too aggressive can drop useful candidates

## When (and why) to change Embedding Model
- Change only with a clear need:
  - Better semantic quality (e.g., move to `text-embedding-3-large`)
  - Improved multilingual performance
  - Provider/cost strategy change
- Always re‑embed KB documents with the new model; mixing models harms recall/precision

## Rerank — Cost & Latency Notes
- Rerank runs a separate LLM call over the top N candidates to produce scores
- Even with `gpt‑4o‑mini` (low cost), this adds:
  - Extra network + generation time (tens to hundreds of ms+)
  - Small token cost to serialize passages and output scores
- Enable when you need higher precision and can afford a slight slowdown

## Acceptance Criteria
- Any member can view active prompt & current RAG settings
- Admins can create/activate prompt versions; version history shows notes and timestamps
- Chat uses the active prompt and respects role overrides
- Retrieval obeys tenant RAG settings for K, hybrid/rerank, model, temperature, etc.
- Server actions are permission‑guarded and audited

## Manual Test Plan
1) Create a new prompt version with notes; activate it; ask a question → behavior matches new prompt
2) Set `retriever_top_k` from 8 → 5; ask a question → fewer citations/changed stats
3) Add role override for Support; log in as Support; ask same question → override guidance appears
4) Flip `rerank_enabled` on/off; observe precision/latency trade‑off
5) Try changing `embedding_model` without re‑embedding → confirm degraded retrieval (revert)

## Troubleshooting
- Seeing worse retrieval after changing `embedding_model`? Re‑embed KB documents with the same model.
- Activation fails? Confirm you have `settings.manage` and the RPC `set_active_prompt_version` exists.
- Rerank slow? Increase overfetch moderately, reduce K, or disable rerank.
