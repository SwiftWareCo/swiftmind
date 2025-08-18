# Backoffice REST Sync — Resumable, Batch-Based Ingestion (Operators Only)

## Overview
- Purpose: Pull external REST sources (per tenant) into Knowledge (kb_docs/kb_chunks) using small, resumable batches.
- Scope: Backoffice-only; guarded by platform admin.
- Transport: Robust API route with JSON responses for each batch.
- Storage: Cursor state in kb_rest_cursors; per-day kb_docs; kb_chunks appended per batch.

## Data
- kb_sources(id, tenant_id, type, title, config, backoffice_only)
  - type = 'rest', backoffice_only = true
  - Config (examples):
    - baseUrl, cursorParam, pageSizeParam, defaultPageSize
    - itemsPath, nextCursorPath OR cursorStyle: 'offset' with currentOffsetPath, totalPath
    - headersTemplate (supports {{API_KEY}}), requiresAuth, provider
    - textFields (fields to concatenate into text), allowedRolesOverride
    - Optional freshness: ifNoneMatchHeader, ifModifiedSinceHeader
- kb_rest_cursors(tenant_id, source_id, next_cursor, page_count, item_count, last_status, last_http_status, last_synced_at, last_error)
- kb_docs(id, tenant_id, source_id, title, status, error)
- kb_chunks(id, tenant_id, doc_id, chunk_idx, title, content, embedding, metadata, allowed_roles)

## Implementation
- Shared logic: server/rest/runBatch.ts
  - Resolves config + secret (if any), computes URL, fetches one page with 4s timeout
  - Normalizes items to text using textFields
  - Upserts daily doc: "<Source Title> — Sync YYYY-MM-DD"
  - Chunk (~1k tokens, ~120 overlap), embed (OpenAI text-embedding-3-small), insert chunks
  - Content hash per chunk stored in metadata.contentHash; duplicates skipped across batches
  - Cursor upsert (admin client): increments page_count/item_count, sets next_cursor, last_status, last_http_status, last_synced_at
  - Offset pagination supported via cursorStyle: 'offset' and body skip/total
- API route: POST /api/backoffice/rest-batch
  - Body: { sourceId }
  - Guard: isPlatformAdmin()
  - Returns { ok, done, items, next, url, status }
- UI:
  - Page: /backoffice/rest-sources
  - Sync button calls API route; toast shows url → next; page refreshes to show updated metrics
  - Delete button: removes chunks → docs → cursor → source (admin client)

## Why an API route (vs server actions)
- Each click guarantees a fresh HTTP request (no server-action dedupe on identical FormData)
- JSON response visible in DevTools; easy to debug url/status/items/next
- Cleaner retries and error handling for operator workflows

## Config Examples
- DummyJSON Products (multi-page):
{
  "baseUrl": "https://dummyjson.com/products",
  "cursorParam": "skip",
  "pageSizeParam": "limit",
  "defaultPageSize": 50,
  "itemsPath": "products",
  "nextCursorPath": null,
  "currentOffsetPath": "skip",
  "totalPath": "total",
  "headersTemplate": {},
  "textFields": ["title", "description", "brand", "category", "tags"],
  "allowedRolesOverride": ["member","support","operations","admin"],
  "requiresAuth": false,
  "cursorStyle": "offset"
}

## Notes
- Use admin client for all backoffice writes to avoid RLS friction.
- Keep batches small to meet hobby plan timeouts.
- No plaintext secrets in logs; secrets handled server-side only.

## FAQ
- Is contentHash in metadata OK?
  - Yes. It avoids schema changes; used for deduplication across batches. If needed later, we can promote to a dedicated column and index.
