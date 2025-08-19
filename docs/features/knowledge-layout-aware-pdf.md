# Knowledge — Layout-Aware PDF Extraction & Structure-Preserving Chunking

## Overview
- Replaces plain-text PDF parsing with a layout-aware pipeline using `pdfjs-dist`.
- Extracts tokens with coordinates, reconstructs lines and column order, detects generic label:value pairs, and chunks without breaking lines.
- Preserves structure in metadata: page ranges, union bounding boxes, line boxes, and KV candidates per chunk.
- Re-ingest path: same `doc_id`, bump `version`, delete/replace old chunks.

## Implementation
- File: `lib/kb/pdfLayout.ts`
  - `extractPdfLayout(buffer)` → `{ lines, text, pageCount, kv_candidates }`
    - Tokens: `{ text, page, x, y, w, h, fontSize }`.
    - Lines: y-banding into lines, x-clustering into columns; reading order preserved (left→right, top→bottom).
    - Spacing normalization: collapse spaces; insert `:` when label/value punctuation missing.
    - KV detection: labels ending with `:`, `#`, or common label tokens (`No.`, `ID`, `Ref`) followed by value-like tokens (alphanumeric with digits/uppercase).
  - `chunkLinesToLayoutChunks(lines, kvAll, targetTokens)` → `LayoutChunk[]`.
    - ~1k token target; never split lines; chunk metadata includes `page_start`, `page_end`, `bbox_union`, `line_bboxes`, and `kv_candidates`.
- Ingestion: `server/kb/kb.actions.ts`.
  - For PDFs, uses layout pipeline; builds embeddings from chunk content.
  - Stores metadata JSON in `kb_chunks.metadata` (no schema changes).
  - Re-ingest: if prior upload by same title exists, marks doc pending, wipes existing chunks, inserts new ones, and updates doc status and content_hash.

## Environment & Deps
- `pdfjs-dist` (v5) and `@ungap/with-resolvers`.
- Optional `PDFJS_STANDARD_FONTS_URL` to suppress standardFonts warning (defaults to jsDelivr CDN).

## Logging & Observability
- For the first N PDFs (env `PDF_INGEST_DEBUG_FIRST_N`), logs: page count, line count, chunk count, and first 3 KV candidates (label/value preview).
- No raw secrets logged.

## Acceptance Criteria
- Baseline PDF (“Business License.pdf”): distinct lines.
  - e.g., `Acct #: 1479581` and `Licence #: 24 009419` appear as separate, intact lines.
- Retrieval: “What is the licence number?” returns chunk containing the correct `Licence #` line (not account number).
- Multi-column PDFs: left column text appears before right; lines not interleaved.
- Numeric tables: numbers remain aligned; no mid-number splits.
- Re-ingest same PDF replaces old chunks and improves answers without breaking RLS/roles.

## Manual Test Plan
1) Baseline “Business Licence”.
   - Upload → Ask: “What’s the licence number? The account number?” → Distinct answers with correct citation chunk.
2) Two-column PDF.
   - Verify left column renders before right; reading order preserved.
3) Numeric tables.
   - Totals/amounts intact; values aren’t split across chunks.
4) Regression.
   - Previously OK PDF still ingests; chunk counts reasonable; search quality same or better.

## Notes
- Schema unchanged; metadata stored in JSONB.
- Generic heuristics only; do not add domain-specific templates here.
- All operations respect RLS and per-chunk `allowed_roles`.
