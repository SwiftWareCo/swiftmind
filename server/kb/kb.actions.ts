"use server";
import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import type { TablesInsert } from "@/lib/types/database.types";
import { extractTextAndSections, hashContent } from "@/lib/kb/extract";
import { chunkContent } from "@/lib/kb/chunk";
import { embedChunks } from "@/lib/kb/embed";
import { revalidatePath } from "next/cache";

export type UploadState = { ok: boolean; error?: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export async function uploadAndIngest(prev: UploadState | undefined, formData: FormData): Promise<UploadState> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData.user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "404" };
  }

  try {
    await requirePermission(tenantId, "kb.write");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  const file = formData.get("file");
  const rolesRaw = formData.getAll("allowed_roles");
  const allowedRoles = (rolesRaw.length > 0 ? rolesRaw : ["support", "operations", "admin"]).map(String);

  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  if (file.size === 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "File too large (max 20MB)" };

  const startedAt = Date.now();

  // Create or identify source
  const sourceInsert: TablesInsert<"kb_sources"> = {
    tenant_id: tenantId,
    created_by: userData.user.id,
    type: "upload",
    title: file.name,
    uri: null,
    config: null,
  } as unknown as TablesInsert<"kb_sources">;

  const { data: sourceRow, error: sourceErr } = await supabase
    .from("kb_sources")
    .insert(sourceInsert)
    .select("id")
    .single<{ id: string }>();
  if (sourceErr) {
    console.error(sourceErr);
    return { ok: false, error: "Failed to create source" };
  }

  const docInsert: TablesInsert<"kb_docs"> = {
    tenant_id: tenantId,
    source_id: sourceRow.id,
    title: file.name,
    status: "pending",
    uri: null,
    version: 1,
  } as unknown as TablesInsert<"kb_docs">;

  const { data: docRow, error: docErr } = await supabase
    .from("kb_docs")
    .insert(docInsert)
    .select("id")
    .single<{ id: string }>();
  if (docErr) {
    console.error(docErr);
    return { ok: false, error: "Failed to create document" };
  }

  const { data: jobRow, error: jobErr } = await supabase
    .from("kb_ingest_jobs")
    .insert({ tenant_id: tenantId, source_id: sourceRow.id, doc_id: docRow.id, status: "queued" } as TablesInsert<"kb_ingest_jobs">)
    .select("id")
    .single<{ id: string }>();
  if (jobErr) {
    console.error(jobErr);
    return { ok: false, error: "Failed to create job" };
  }

  const jobId = jobRow.id;

  // Flip to processing
  await supabase.from("kb_ingest_jobs").update({ status: "processing", error: null }).eq("id", jobId).eq("tenant_id", tenantId);
  await supabase.from("kb_docs").update({ status: "processing", error: null }).eq("id", docRow.id).eq("tenant_id", tenantId);


  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);



    const { text, sections, fileExt } = await extractTextAndSections(buffer, file.name);
    if (!text.trim()) throw new Error("No extractable text content");

    const contentHash = await hashContent(text);
    const chunks = chunkContent(sections, { targetTokens: 1000, overlapTokens: 120 });


    const embeddings = await embedChunks(chunks.map((c) => c.content));

    // Insert chunks
    const rows = chunks.map((c, idx) => ({
      tenant_id: tenantId,
      doc_id: docRow.id,
      chunk_idx: idx,
      title: c.title ?? null,
      content: c.content,
      embedding: JSON.stringify(embeddings[idx]),
      allowed_roles: allowedRoles,
      metadata: { sectionIndex: c.sectionIndex, fileExt } as unknown,
    })) as unknown as TablesInsert<"kb_chunks">[];

    // Batch insert to avoid payload limits
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: chunkErr } = await supabase.from("kb_chunks").insert(slice as TablesInsert<"kb_chunks">[]);
      if (chunkErr) throw new Error(chunkErr.message);
    }

    // Update doc + job
    await supabase
      .from("kb_docs")
      .update({ status: "ready", content_hash: contentHash, error: null })
      .eq("id", docRow.id)
      .eq("tenant_id", tenantId);

    await supabase
      .from("kb_ingest_jobs")
      .update({ status: "done", error: null })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);

    // Audit
    try {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: userData.user.id,
        action: "kb.ingest",
        resource: "doc",
        meta: { doc_id: docRow.id, source_id: sourceRow.id, chunk_count: rows.length, elapsed_ms: Date.now() - startedAt },
      } as unknown as TablesInsert<"audit_logs">);
    } catch {}

    return { ok: true };
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : "Ingest failed";
    await supabase
      .from("kb_docs")
      .update({ status: "error", error: message })
      .eq("id", docRow.id)
      .eq("tenant_id", tenantId);
    await supabase
      .from("kb_ingest_jobs")
      .update({ status: "error", error: message })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);
    return { ok: false, error: message };
  }
}

export type DeleteState = { ok: boolean; error?: string };

export async function deleteKbDoc(prev: DeleteState | undefined, formData: FormData): Promise<DeleteState> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData.user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "404" };
  }

  try {
    await requirePermission(tenantId, "kb.write");
  } catch (e: unknown) {
    const msg: string = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  const docId = String(formData.get("doc_id") || "").trim();
  if (!docId) return { ok: false, error: "Missing doc_id" };

  // Ensure doc belongs to tenant
  const { data: docRecord, error: docErr } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ id: string }>();
  if (docErr) return { ok: false, error: "500" };
  if (!docRecord) return { ok: false, error: "Not found" };

  // Fetch source_id to consider cleanup of orphaned sources
  const { data: srcRow } = await supabase.from("kb_docs").select("source_id").eq("id", docId).eq("tenant_id", tenantId).maybeSingle<{ source_id: string | null }>();

  // Delete chunks first for clarity if cascade isn't present
  const { error: chunksErr } = await supabase.from("kb_chunks").delete().eq("tenant_id", tenantId).eq("doc_id", docId);
  if (chunksErr) return { ok: false, error: "Failed to delete chunks" };

  const { error: docDelErr } = await supabase.from("kb_docs").delete().eq("tenant_id", tenantId).eq("id", docId);
  if (docDelErr) return { ok: false, error: "Failed to delete document" };

  // Optionally delete kb_sources if no other docs reference it
  if (srcRow?.source_id) {
    const { data: remaining } = await supabase
      .from("kb_docs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_id", srcRow.source_id);
    if (!remaining || remaining.length === 0) {
      await supabase.from("kb_sources").delete().eq("tenant_id", tenantId).eq("id", srcRow.source_id);
    }
  }

  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userData.user.id,
      action: "kb.delete",
      resource: "doc",
      meta: { doc_id: docId },
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}

  try { revalidatePath("/knowledge"); } catch {}
  return { ok: true };
}


export type PreviewSearchState =
  | { ok: true; results: Array<{ doc_id: string; title: string; snippet: string; uri: string | null }>; stats?: { vectorMs: number; keywordMs: number; rerankMs: number } }
  | { ok: false; error: string };

import { retrieve } from "./retrieve";

/**
 * Read-only server action to preview search results for the compact search UI.
 * Uses existing retrieval util; respects RLS/roles via user session.
 */
export async function previewSearch(
  prev: PreviewSearchState | undefined,
  formData: FormData,
): Promise<PreviewSearchState> {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData?.user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "404" };
  }

  const query = String(formData.get("query") || "").trim();
  const kRaw = formData.get("k");
  const k = Math.max(1, Math.min(5, Number(kRaw) || 3));
  if (!query) return { ok: true, results: [] };

  try {
    const result = await retrieve({ tenantId, query, k });
    const chunks = result.chunks;
    const docIds = Array.from(new Set(chunks.map((c) => c.doc_id)));
    const { data: docsRes, error: docsErr } = await supabase
      .from("kb_docs")
      .select("id, title, uri")
      .eq("tenant_id", tenantId)
      .in("id", docIds);
    if (docsErr) throw new Error(docsErr.message);
    const docById = new Map<string, { id: string; title: string | null; uri: string | null }>();
    for (const d of (docsRes || []) as Array<{ id: string; title: string | null; uri: string | null }>) docById.set(d.id, d);

    function truncate(s: string, max = 220): string {
      const clean = s.replace(/\s+/g, " ").trim();
      return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
    }

    const results = chunks.map((c) => {
      const doc = docById.get(c.doc_id);
      const title = c.title || doc?.title || "Untitled";
      const uri = (c as { source_uri: string | null }).source_uri || doc?.uri || null;
      const snippet = truncate(c.content || "");
      return { doc_id: c.doc_id, title, snippet, uri };
    });

    return { ok: true, results, stats: result.stats };
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : "Search failed";
    return { ok: false, error: message };
  }
}


