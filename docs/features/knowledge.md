# Knowledge (tenant-scoped upload → ingest → search)

Short, high-signal reference for the Knowledge ingestion feature (multi-tenant, RLS-safe). Built with server components + server actions for mutations, and client-side reads via TanStack Query.

## Overview
- Admin-only page: `/(app)/knowledge`
- Uploads: PDF, Markdown, HTML, TXT
- Pipeline: extract → normalize → chunk (~1k token eq, ~120 overlap) → embed (OpenAI `text-embedding-3-small`, 1536 dims) → store
- Tenant isolation: all reads/writes are tenant-scoped; RLS enforced via Supabase
- Visibility: per-chunk `allowed_roles` (default: `support, operations, admin`)

## Data
- `kb_sources(id, tenant_id, type, title, created_by, uri, config, created_at)`
- `kb_docs(id, tenant_id, source_id, title, status, error, content_hash, version, created_at)`
- `kb_chunks(id, tenant_id, doc_id, chunk_idx, title, content, embedding, metadata, allowed_roles, created_at)`
- `kb_ingest_jobs(id, tenant_id, source_id, doc_id, status, error, created_at, updated_at)`
- Audit: `audit_logs(tenant_id, actor_user_id, action, resource, meta, created_at)`

## Server actions (server/kb/kb.actions.ts)
- `uploadAndIngest(formData)`
  - Resolve tenant via `x-tenant-slug` → `getTenantBySlug`
  - Guard: `requirePermission(tenantId, 'kb.write')`
  - Insert `kb_sources(type='upload')`, `kb_docs(status='pending')`, `kb_ingest_jobs(status='queued')`
  - Extract text (server-only), chunk, embed, insert `kb_chunks`
  - Update: doc → `ready`, job → `done`; audit `kb.ingest`
  - On failure: doc → `error`, job → `error`
- `deleteKbDoc(formData)`
  - Guard: `requirePermission(tenantId, 'kb.write')`
  - Delete `kb_chunks` then `kb_docs`; if source becomes orphaned, delete `kb_sources`
  - Audit `kb.delete`

## UI
- Page (server): `app/(app)/knowledge/page.tsx` — resolves tenant/permission; renders `UploadForm` + `KnowledgeTable`
- Upload (client): `app/(app)/knowledge/upload-form.tsx` — calls `uploadAndIngest`; on success: invalidate `['kb-docs', tenantId]` and toast
- Table (client): `components/knowledge/KnowledgeTable.tsx` — Supabase browser client + TanStack Query; conditional refetch only while pending; per-row delete via `components/knowledge/DeleteDocButton.tsx` (shadcn `AlertDialog` + toast)
- Provider: `components/providers/QueryProvider.tsx` (wired in `app/(app)/layout.tsx`)
- UI primitives: `components/ui/table.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/button.tsx`, `components/ui/sonner.tsx`

## Extraction & Chunking
- `lib/kb/extract.ts` — PDF (layout-aware via `pdfjs-dist`), MD (remark + strip-markdown), HTML (jsdom), TXT; computes `sha256` content hash
- `lib/kb/pdfLayout.ts` — layout tokenization (tokens with page/x/y/w/h/font), line reconstruction by y-bands and x-clusters, generic KV detection, structure-preserving chunking with bbox and page metadata
- `lib/kb/chunk.ts` — ~1k token equivalent chunks (chars≈tokens×4) with ~120 overlap
- `lib/kb/embed.ts` — batches to OpenAI embeddings and stores vector JSON

## Permissions
- Upload/delete require `kb.write`
- Listing relies on RLS; retrieval later uses `v_kb_chunks_visible` + `allowed_roles`

## Error handling & Audit
- Errors surface on the doc row (`kb_docs.error`) and job status
- No plaintext contents in logs; only counts/hashes
- Audit: `kb.ingest`, `kb.delete`

## Manual test plan
- Upload 1× PDF (5–20 pages) and 1× Markdown → verify chunk counts and `Ready`
- Upload restricted doc (`['admin']`) → Support should not see chunks in retrieval
- Upload empty/broken file → status `error`
- Tenant isolation: same filename in A vs B should list separately

## Env & deps
- Env: `OPENAI_API_KEY`, optional `PDFJS_STANDARD_FONTS_URL` (defaults to CDN)
- Deps: `@tanstack/react-query`, `pdfjs-dist`, `@ungap/with-resolvers`, `jsdom`, `unified`, `remark-parse`, `strip-markdown`

