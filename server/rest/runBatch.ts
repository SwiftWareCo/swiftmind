"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { getRestSource, getRestCursor } from "./rest.data";
import { decryptJson } from "@/lib/utils/crypto.server";
import { chunkContent } from "@/lib/kb/chunk";
import { embedChunks } from "@/lib/kb/embed";
import { hashContent } from "@/lib/kb/extract";
import type { TablesInsert } from "@/lib/types/database.types";

type HeadersTemplate = Record<string, string>;

type RestSourceConfig = {
  baseUrl: string;
  cursorParam?: string;
  pageSizeParam?: string;
  defaultPageSize?: number;
  itemsPath?: string | null;
  nextCursorPath?: string | null;
  currentOffsetPath?: string | null;
  totalPath?: string | null;
  headersTemplate?: Record<string, string>;
  textFields?: string[];
  allowedRolesOverride?: string[];
  requiresAuth?: boolean;
  ifNoneMatchHeader?: string;
  ifModifiedSinceHeader?: string;
  cursorStyle?: string;
  provider?: string;
  etag?: string;
  modifiedSince?: string;
};

export type RunBatchOk = { ok: true; done: boolean; items: number; next: string | null; url: string; status: number };
export type RunBatchErr = { ok: false; error: string };
export type RunBatchResult = RunBatchOk | RunBatchErr;

function renderHeadersTemplate(tpl: HeadersTemplate, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(tpl || {})) headers[k] = v.replaceAll("{{API_KEY}}", apiKey || "");
  return headers;
}

function getFromPath<T = unknown>(obj: unknown, path: string | null | undefined): T | undefined {
  if (!path || path === "$") return obj as T;
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj as Record<string, unknown>;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur as T | undefined;
}

function normalizeItemsToText(items: Array<Record<string, unknown>>, textFields: string[]): string[] {
  const blocks: string[] = [];
  for (const it of items) {
    const parts: string[] = [];
    for (const f of textFields) {
      const val = getFromPath<unknown>(it, f as string);
      if (val == null) continue;
      parts.push(typeof val === "string" ? val : JSON.stringify(val));
    }
    const text = parts.join("\n\n").trim();
    if (text) blocks.push(text);
  }
  return blocks;
}

export async function runRestSyncBatch(sourceId: string): Promise<RunBatchResult> {
  const supabase = await createClient();
  const admin = await createAdminClient();

  const source = await getRestSource(sourceId);
  if (!source || source.type !== "rest") return { ok: false, error: "not found" };

  const raw = source.config as unknown;
  const config: RestSourceConfig = raw && typeof raw === "object" ? (raw as RestSourceConfig) : ({} as RestSourceConfig);
  const baseUrl: string = String(config.baseUrl || "");
  if (!baseUrl) return { ok: false, error: "missing baseUrl in source config" };
  const cursorParam: string = (config.cursorParam as string) || "page";
  const pageSizeParam: string | undefined = (config.pageSizeParam as string | undefined);
  const defaultPageSize: number = Math.min(Number(config.defaultPageSize ?? 100), 100);
  const itemsPath: string | null = (config.itemsPath as string | null | undefined) ?? "$";
  const nextCursorPath: string | null = (config.nextCursorPath as string | null | undefined) ?? null;
  const currentOffsetPath: string | null = (config.currentOffsetPath as string | null | undefined) ?? null;
  const totalPath: string | null = (config.totalPath as string | null | undefined) ?? null;
  const headersTemplate: HeadersTemplate = (config.headersTemplate as HeadersTemplate) || {};
  const textFields: string[] = Array.isArray(config.textFields) ? (config.textFields as string[]) : ["title", "body", "name", "description"];
  const allowedRoles: string[] = Array.isArray(config.allowedRolesOverride) ? (config.allowedRolesOverride as string[]) : ["support", "operations", "admin"];
  const requiresAuth: boolean = Boolean(config.requiresAuth);
  const ifNoneMatchHeader: string | undefined = config.ifNoneMatchHeader as string | undefined;
  const ifModifiedSinceHeader: string | undefined = config.ifModifiedSinceHeader as string | undefined;
  const cursorStyle: string | undefined = config.cursorStyle as string | undefined;

  // Secret
  let apiKey: string | undefined;
  if (requiresAuth) {
    const { data: secret, error: sErr } = await supabase
      .from("integration_secrets")
      .select("ciphertext, nonce")
      .eq("tenant_id", source.tenant_id)
      .eq("provider", config.provider || "rest")
      .maybeSingle<{ ciphertext: string; nonce: string }>();
    if (sErr) return { ok: false, error: sErr.message };
    if (!secret) return { ok: false, error: "missing integration secret" };
    try {
      const decrypted = await decryptJson<{ api_key?: string; token?: string }>(secret.ciphertext, secret.nonce);
      apiKey = decrypted.api_key || decrypted.token;
      if (!apiKey) return { ok: false, error: "secret missing api key" };
    } catch {
      return { ok: false, error: "failed to decrypt secret" };
    }
  }

  // Cursor
  const cursorRow = await getRestCursor(sourceId);
  const nextCursor: string | null = cursorRow?.next_cursor ?? null;

  // Build URL
  const url = new URL(nextCursor && nextCursor.startsWith("http") ? nextCursor : baseUrl);
  if (!nextCursor || !nextCursor.startsWith("http")) {
    const initialCursor = cursorStyle === "offset" ? (nextCursor ?? "0") : nextCursor;
    if (initialCursor !== undefined && initialCursor !== null) url.searchParams.set(cursorParam, String(initialCursor));
    if (pageSizeParam) url.searchParams.set(pageSizeParam, String(defaultPageSize));
  }

  // Fetch one page (4s timeout)
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 4000);
  let httpStatus = 0;
  let items: Array<Record<string, unknown>> = [];
  let nextFromBody: string | null | undefined = null;
  const requestUrlForDebug = url.toString();
  try {
    const h: Record<string, string> = renderHeadersTemplate(headersTemplate, apiKey);
    if (config.etag && ifNoneMatchHeader) h[ifNoneMatchHeader] = String(config.etag);
    if (config.modifiedSince && ifModifiedSinceHeader) h[ifModifiedSinceHeader] = String(config.modifiedSince);
    const res = await fetch(requestUrlForDebug, { method: "GET", headers: h, signal: ac.signal, cache: "no-store" });
    httpStatus = res.status;
    if (res.status === 304) {
      items = [];
      nextFromBody = undefined;
    } else if (!res.ok) {
      const text = await res.text();
      throw new Error(text.slice(0, 500));
    } else {
      const json = await res.json();
      const arr = getFromPath(json, itemsPath);
      if (Array.isArray(arr)) items = arr;
      if (nextCursorPath) {
        const n = getFromPath(json, nextCursorPath);
        nextFromBody = typeof n === "string" || n == null ? n : null;
      } else if (Array.isArray(arr) && arr.length < defaultPageSize) {
        nextFromBody = null; // done
      } else {
        nextFromBody = undefined; // defer to cursorStyle
      }
      // Persist ETag/Last-Modified
      const newEtag = res.headers.get("etag");
      const newLastMod = res.headers.get("last-modified");
      if (newEtag || newLastMod) {
        const nextConfig = { ...config };
        if (newEtag) nextConfig.etag = newEtag;
        if (newLastMod) nextConfig.modifiedSince = newLastMod;
        await admin.from("kb_sources").update({ config: nextConfig as unknown }).eq("id", source.id).eq("tenant_id", source.tenant_id);
      }
      // Compute next for offset with total
      if (cursorStyle === "offset") {
        const bodySkip = currentOffsetPath ? Number(getFromPath<number>(json, currentOffsetPath)) : NaN;
        const bodyTotal = totalPath ? Number(getFromPath<number>(json, totalPath)) : NaN;
        const cur = Number.isFinite(bodySkip) ? bodySkip : Number(nextCursor ?? "0");
        if (!Number.isNaN(cur)) {
          const nextOffset = cur + defaultPageSize;
          if (Number.isFinite(bodyTotal)) nextFromBody = (cur + items.length) >= bodyTotal ? null : String(nextOffset);
        }
      }
    }
  } catch (e) {
    clearTimeout(to);
    // error cursor upsert (admin)
    const { data: existErr } = await admin
      .from("kb_rest_cursors")
      .select("id")
      .eq("tenant_id", source.tenant_id)
      .eq("source_id", sourceId)
      .maybeSingle<{ id: string }>();
    if (existErr?.id) {
      await admin.from("kb_rest_cursors").update({
        next_cursor: nextCursor ?? null,
        page_count: cursorRow?.page_count ?? 0,
        item_count: cursorRow?.item_count ?? 0,
        last_status: "error",
        last_http_status: httpStatus || null,
        last_error: e instanceof Error ? e.message : String(e),
        last_synced_at: new Date().toISOString(),
      }).eq("id", existErr.id).eq("tenant_id", source.tenant_id);
    } else {
      await admin.from("kb_rest_cursors").insert({
        source_id: sourceId,
        tenant_id: source.tenant_id,
        next_cursor: nextCursor ?? null,
        page_count: 0,
        item_count: 0,
        last_status: "error",
        last_http_status: httpStatus || null,
        last_error: e instanceof Error ? e.message : String(e),
        last_synced_at: new Date().toISOString(),
      } as unknown as TablesInsert<"kb_rest_cursors">);
    }
    return { ok: false, error: "fetch_failed" };
  } finally {
    clearTimeout(to);
  }

  // Ingest
  const blocks = normalizeItemsToText(items, textFields);
  if (blocks.length > 0) {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    const dailyTitle = `${source.title} — Sync ${ymd}`;
    const { data: doc, error: docErr } = await admin
      .from("kb_docs")
      .select("id")
      .eq("tenant_id", source.tenant_id)
      .eq("source_id", source.id)
      .eq("title", dailyTitle)
      .maybeSingle<{ id: string }>();
    if (docErr) return { ok: false, error: docErr.message };
    let docId = doc?.id ?? null;
    if (!docId) {
      const { data: ins, error: insErr } = await admin
        .from("kb_docs")
        .insert({ tenant_id: source.tenant_id, source_id: source.id, title: dailyTitle, status: "ready", error: null } as unknown as TablesInsert<"kb_docs">)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (insErr) return { ok: false, error: insErr.message };
      docId = ins?.id ?? null;
    }
    if (!docId) return { ok: false, error: "failed to resolve doc id" };
    const chunks = blocks.map((content, idx) => ({ title: null as string | null, content, sectionIndex: idx }));
    const expanded = chunkContent(chunks.map((c, i) => ({ title: c.title, content: c.content, sectionIndex: i })), { targetTokens: 1000, overlapTokens: 120 });

    // Build set of existing content hashes to avoid duplicate inserts across batches
    const { data: existingMetaRows, error: metaErr } = await admin
      .from("kb_chunks")
      .select("metadata")
      .eq("tenant_id", source.tenant_id)
      .eq("doc_id", docId);
    if (metaErr) return { ok: false, error: metaErr.message };
    const existingHashes = new Set<string>();
    for (const r of existingMetaRows || []) {
      const h = (r as { metadata: unknown }).metadata as Record<string, unknown> | null;
      const hv = h && typeof h === "object" ? (h as Record<string, unknown>)["contentHash"] : undefined;
      if (typeof hv === "string" && hv) existingHashes.add(hv);
    }

    // Compute content hashes for new expanded chunks and filter out duplicates
    const expandedWithHash = await Promise.all(
      expanded.map(async (c) => ({
        ...c,
        contentHash: await hashContent(c.content),
      })),
    );
    const filtered = expandedWithHash.filter((c) => !existingHashes.has(c.contentHash));
    if (filtered.length === 0) {
      // Nothing new to insert; skip embeddings/insert path
    }

    const embeddings = filtered.length > 0 ? await embedChunks(filtered.map((c) => c.content)) : [];

    // Determine starting chunk index to avoid unique constraint collisions per (tenant_id, doc_id, chunk_idx)
    const { data: lastIdxRows, error: lastIdxErr } = await admin
      .from("kb_chunks")
      .select("chunk_idx")
      .eq("tenant_id", source.tenant_id)
      .eq("doc_id", docId)
      .order("chunk_idx", { ascending: false })
      .limit(1);
    if (lastIdxErr) return { ok: false, error: lastIdxErr.message };
    const startIdx = Array.isArray(lastIdxRows) && lastIdxRows.length > 0 && typeof (lastIdxRows[0] as { chunk_idx: number }).chunk_idx === "number"
      ? (lastIdxRows[0] as { chunk_idx: number }).chunk_idx + 1
      : 0;

    const rows = filtered.map((c, idx) => ({
      tenant_id: source.tenant_id,
      doc_id: docId!,
      chunk_idx: startIdx + idx,
      title: c.title,
      content: c.content,
      embedding: JSON.stringify(embeddings[idx]),
      allowed_roles: allowedRoles,
      metadata: { sectionIndex: c.sectionIndex, sourceId: source.id, contentHash: c.contentHash } as unknown,
    })) as unknown as TablesInsert<"kb_chunks">[];
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: chunkErr } = await admin.from("kb_chunks").insert(slice as TablesInsert<"kb_chunks">[]);
      if (chunkErr) return { ok: false, error: chunkErr.message };
    }

    // Recompute doc-level content hash based on all chunk content hashes (ordered by chunk_idx)
    const { data: allChunkRows, error: allErr } = await admin
      .from("kb_chunks")
      .select("chunk_idx, metadata")
      .eq("tenant_id", source.tenant_id)
      .eq("doc_id", docId)
      .order("chunk_idx", { ascending: true });
    if (allErr) return { ok: false, error: allErr.message };
    const hashList: string[] = [];
    for (const r of allChunkRows || []) {
      const meta = (r as { metadata: unknown }).metadata as Record<string, unknown> | null;
      const hv = meta && typeof meta === "object" ? (meta as Record<string, unknown>)["contentHash"] : undefined;
      if (typeof hv === "string" && hv) hashList.push(hv);
    }
    if (hashList.length > 0) {
      const docHash = await hashContent(hashList.join("|"));
      const { error: updDocErr } = await admin
        .from("kb_docs")
        .update({ content_hash: docHash as unknown })
        .eq("id", docId)
        .eq("tenant_id", source.tenant_id);
      if (updDocErr) return { ok: false, error: updDocErr.message };
    }
  }

  // Compute next
  let computedNext: string | null = null;
  if (typeof nextFromBody === "string") computedNext = nextFromBody;
  else if (nextFromBody === null) computedNext = null;
  else if (cursorStyle === "offset") {
    const cur = Number(nextCursor ?? "0");
    if (!Number.isNaN(cur)) {
      const nextOffset = cur + defaultPageSize;
      computedNext = items.length < defaultPageSize ? null : String(nextOffset);
    } else computedNext = null;
  } else if (!nextCursor) computedNext = "2";
  else {
    const curNum = Number(nextCursor);
    computedNext = Number.isNaN(curNum) ? nextCursor : String(curNum + 1);
  }

  // Upsert cursor (admin)
  const { data: existing } = await admin
    .from("kb_rest_cursors")
    .select("id,page_count,item_count")
    .eq("tenant_id", source.tenant_id)
    .eq("source_id", sourceId)
    .maybeSingle<{ id: string; page_count: number; item_count: number }>();
  if (existing?.id) {
    const { error: updErr } = await admin
      .from("kb_rest_cursors")
      .update({
        next_cursor: computedNext,
        page_count: (existing.page_count ?? 0) + 1,
        item_count: (existing.item_count ?? 0) + (items?.length || 0),
        last_status: "ok",
        last_http_status: httpStatus || 200,
        last_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("tenant_id", source.tenant_id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await admin
      .from("kb_rest_cursors")
      .insert({
        source_id: sourceId,
        tenant_id: source.tenant_id,
        next_cursor: computedNext,
        page_count: 1,
        item_count: (items?.length || 0),
        last_status: "ok",
        last_http_status: httpStatus || 200,
        last_error: null,
        last_synced_at: new Date().toISOString(),
      } as unknown as TablesInsert<"kb_rest_cursors">);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true, done: computedNext == null, items: items.length, next: computedNext, url: requestUrlForDebug, status: httpStatus || 200 };
}


