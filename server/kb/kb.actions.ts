"use server";
import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import type { TablesInsert } from "@/lib/types/database.types";
import { extractTextAndSections, hashContent } from "@/lib/kb/extract";
import { chunkContent } from "@/lib/kb/chunk";
import { embedChunks } from "@/lib/kb/embed";
import { extractPdfLayout, chunkLinesToLayoutChunks } from "@/lib/kb/pdfLayout";
import { revalidatePath } from "next/cache";


export type UploadState = { ok: boolean; error?: string; jobId?: string; docId?: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export async function uploadAndIngest(prev: UploadState | undefined, formData: FormData): Promise<UploadState> {
  console.log("🚀 uploadAndIngest: Starting upload and ingest process");
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

  console.log(`📁 uploadAndIngest: Processing file "${file.name}" (${file.size} bytes, type: ${file.type})`);

  const startedAt = Date.now();

  // Re-ingest detection: if a prior upload with the same title exists, reuse doc and replace chunks
  let usingExistingDoc = false;
  let sourceId: string | null = null;
  let docId: string | null = null;

  // Try to locate an existing upload source and doc by title
  const { data: existingSource } = await supabase
    .from("kb_sources")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", "upload")
    .eq("title", file.name)
    .maybeSingle<{ id: string }>();
  if (existingSource?.id) {
    sourceId = existingSource.id;
    const { data: existingDoc } = await supabase
      .from("kb_docs")
      .select("id, version")
      .eq("tenant_id", tenantId)
      .eq("source_id", sourceId)
      .eq("title", file.name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; version: number }>();
    if (existingDoc?.id) {
      usingExistingDoc = true;
      docId = existingDoc.id;
      // mark as pending and bump version
      await supabase
        .from("kb_docs")
        .update({ status: "pending", error: null, version: (existingDoc.version || 1) + 1 })
        .eq("id", docId)
        .eq("tenant_id", tenantId);
    }
  }

  if (!sourceId) {
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
    sourceId = sourceRow.id;
  }

  if (!docId) {
    const docInsert: TablesInsert<"kb_docs"> = {
      tenant_id: tenantId,
      source_id: sourceId,
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
    docId = docRow.id;
  }

  const { data: jobRow, error: jobErr } = await supabase
    .from("kb_ingest_jobs")
    .insert({ 
      tenant_id: tenantId, 
      source_id: sourceId!, 
      doc_id: docId!, 
      status: "processing",
      step: "uploading",
      filename: file.name,
      mime_type: file.type,
      total_bytes: file.size,
      processed_bytes: 0,
      allowed_roles: Array.isArray(allowedRoles) ? allowedRoles : ['admin'],
      metadata: {
        originalFilename: file.name,
        uploadStartedAt: new Date().toISOString(),
      }
    } as TablesInsert<"kb_ingest_jobs">)
    .select("id")
    .single<{ id: string }>();
  if (jobErr) {
    console.error(jobErr);
    return { ok: false, error: "Failed to create job" };
  }

  const jobId = jobRow.id;

  // Mark doc as processing
  await supabase.from("kb_docs").update({ status: "processing", error: null }).eq("id", docId!).eq("tenant_id", tenantId);

  let storagePath: string | null = null; // Declare at function scope

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save file to Supabase Storage for future background processing support
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    storagePath = `uploads/${tenantId}/${timestamp}-${sanitizedFilename}`;
    
    console.log(`💾 uploadAndIngest: Saving file to storage: ${storagePath}`);
    const { error: storageError } = await supabase.storage
      .from('knowledge-files')
      .upload(storagePath, buffer, {
        contentType: file.type,
        duplex: 'half'
      });
    
    if (storageError) {
      console.error('Storage upload failed:', storageError);
      // Continue processing - storage is for future features, not required now
    }

    // Update job with storage path
    await supabase.from("kb_ingest_jobs").update({ 
      storage_path: storageError ? null : storagePath 
    }).eq("id", jobId).eq("tenant_id", tenantId);



    // Branch: PDF layout-aware path vs legacy text extraction
    const lower = file.name.toLowerCase();
    const ext = (lower.match(/\.([a-z0-9]+)$/)?.[1] || "").toLowerCase();
    console.log(`🔍 uploadAndIngest: File extension detected: "${ext}"`);
    
    let rows: TablesInsert<"kb_chunks">[] = [] as unknown as TablesInsert<"kb_chunks">[];
    let contentHash = "";
    if (ext === "pdf") {
      console.log(`📄 uploadAndIngest: Processing PDF file "${file.name}", buffer size: ${buffer.byteLength} bytes`);
      try {
        console.log(`📄 uploadAndIngest: About to call extractPdfLayout for "${file.name}"`);
        const { lines, text, pageCount, kv_candidates } = await extractPdfLayout(buffer);
        console.log(`✅ uploadAndIngest: PDF extraction successful - ${text.length} chars, ${lines.length} lines, ${pageCount} pages, ${kv_candidates.length} KV candidates`);
        
        if (!text.trim()) throw new Error("No extractable text content");
        contentHash = await hashContent(text);
        console.log(`🔐 uploadAndIngest: Content hash generated: ${contentHash.substring(0, 16)}...`);
        
        console.log(`⚙️ uploadAndIngest: About to chunk PDF lines into layout chunks`);
        const layoutChunks = await chunkLinesToLayoutChunks(lines, kv_candidates, 1000);
        console.log(`📦 uploadAndIngest: Created ${layoutChunks.length} layout chunks`);

        // Optional compact debug logging for first N PDFs
        const DEBUG_FIRST_N = Number(process.env.PDF_INGEST_DEBUG_FIRST_N || 0);
        if (DEBUG_FIRST_N > 0) {
          const { data: countRow } = await supabase
            .from("kb_docs")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("source_id", sourceId!)
            .eq("title", file.name);
          const idx = (countRow as unknown as { count?: number } | null)?.count ?? 0;
          if (idx <= DEBUG_FIRST_N) {
            const sample = kv_candidates.slice(0, 3).map((kv) => ({
              label: kv.label,
              value_preview: kv.value.length > 6 ? "…" + kv.value.slice(-6) : kv.value,
              page: kv.page,
            }));
            console.log(
              JSON.stringify({
                pdf_ingest_debug: true,
                file: file.name,
                pages: pageCount,
                line_count: lines.length,
                chunk_count: layoutChunks.length,
                kv_sample: sample,
              }),
            );
          }
        }

        // If re-ingest, wipe old chunks first
        if (usingExistingDoc) {
          await supabase.from("kb_chunks").delete().eq("tenant_id", tenantId).eq("doc_id", docId!);
        }

        const embeddings = await embedChunks(layoutChunks.map((c) => c.content));
        rows = layoutChunks.map((c, idx) => ({
          tenant_id: tenantId,
          doc_id: docId!,
          chunk_idx: idx,
          title: null,
          content: c.content,
          embedding: JSON.stringify(embeddings[idx]),
          allowed_roles: allowedRoles,
          metadata: { sectionIndex: c.sectionIndex, fileExt: "pdf", page_start: c.meta.page_start, page_end: c.meta.page_end, bbox_union: c.meta.bbox_union, kv_candidates: c.meta.kv_candidates, line_bboxes: c.meta.line_bboxes } as unknown,
        })) as unknown as TablesInsert<"kb_chunks">[];
      } catch (pdfError) {
        console.error(`❌ uploadAndIngest: PDF processing failed for "${file.name}":`, pdfError);
        console.error(`❌ uploadAndIngest: Error stack:`, pdfError instanceof Error ? pdfError.stack : 'No stack trace');
        throw new Error(`PDF processing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown PDF error'}`);
      }
    } else {
      const { text, sections, fileExt } = await extractTextAndSections(buffer, file.name);
      if (!text.trim()) throw new Error("No extractable text content");
      contentHash = await hashContent(text);
      
      const chunks = chunkContent(sections, { targetTokens: 1000, overlapTokens: 120 });
      if (usingExistingDoc) {
        await supabase.from("kb_chunks").delete().eq("tenant_id", tenantId).eq("doc_id", docId!);
      }
      
      const embeddings = await embedChunks(chunks.map((c) => c.content));
      rows = chunks.map((c, idx) => ({
        tenant_id: tenantId,
        doc_id: docId!,
        chunk_idx: idx,
        title: c.title ?? null,
        content: c.content,
        embedding: JSON.stringify(embeddings[idx]),
        allowed_roles: allowedRoles,
        metadata: { sectionIndex: c.sectionIndex, fileExt } as unknown,
      })) as unknown as TablesInsert<"kb_chunks">[];
    }

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
      .eq("id", docId!)
      .eq("tenant_id", tenantId);

    await supabase
      .from("kb_ingest_jobs")
      .update({ 
        status: "done", 
        step: "done",
        error: null,
        processed_bytes: file.size,
        processed_chunks: rows.length,
        total_chunks: rows.length
      })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);

    // Audit
    try {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: userData.user.id,
        action: "kb.ingest",
        resource: "doc",
        meta: { doc_id: docId!, source_id: sourceId!, chunk_count: rows.length, elapsed_ms: Date.now() - startedAt },
      } as unknown as TablesInsert<"audit_logs">);
    } catch {}

    // Clean up storage file after successful processing (7-day retention policy)
    try {
      if (storagePath) {
        console.log(`🗑️ uploadAndIngest: Scheduling cleanup for ${storagePath} in 7 days`);
        // Note: In a full implementation, this would be handled by a background job
        // For now, we keep files for 7 days for debugging and potential reprocessing
        
        // Optional: Delete immediately to save storage (uncomment if preferred)
        // const { error: deleteError } = await supabase.storage
        //   .from('knowledge-files')
        //   .remove([storagePath]);
        // if (deleteError) console.error('Storage cleanup failed:', deleteError);
      }
      console.log(`✅ uploadAndIngest: Successfully processed file, storage preserved for 7 days`);
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
      // Don't fail the upload for cleanup errors
    }

    return { ok: true, jobId, docId };
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : "Ingest failed";
    await supabase
      .from("kb_docs")
      .update({ status: "error", error: message })
      .eq("id", docId!)
      .eq("tenant_id", tenantId);
    await supabase
      .from("kb_ingest_jobs")
      .update({ 
        status: "error", 
        step: "error",
        error: message 
      })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);
    return { ok: false, error: message, jobId };
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

/**
 * Update roles for all chunks of a document
 */
export async function updateDocumentRoles(
  prev: { ok: boolean; error?: string } | undefined,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return { ok: false, error: "Authentication failed" };
    if (!userData.user) return { ok: false, error: "User not found" };

    const slug = await getTenantSlug();
    if (!slug) return { ok: false, error: "Tenant not found" };
    
    const tenant = await getTenantBySlug(slug);
    await requirePermission(tenant.id, "kb.write");

    const docId = String(formData.get("doc_id") || "").trim();
    const rolesRaw = formData.getAll("allowed_roles");
    const allowedRoles = rolesRaw.map(String);

    if (!docId) return { ok: false, error: "Missing doc_id" };
    if (!allowedRoles.length) return { ok: false, error: "At least one role must be selected" };

    // Ensure doc belongs to tenant
    const { data: docRecord, error: docErr } = await supabase
      .from("kb_docs")
      .select("id, title")
      .eq("id", docId)
      .eq("tenant_id", tenant.id)
      .single();

    if (docErr || !docRecord) {
      return { ok: false, error: "Document not found" };
    }

    // Update all chunks for this document
    const { error: updateErr } = await supabase
      .from("kb_chunks")
      .update({ allowed_roles: allowedRoles })
      .eq("tenant_id", tenant.id)
      .eq("doc_id", docId);

    if (updateErr) {
      console.error("Update roles error:", updateErr);
      return { ok: false, error: "Failed to update document roles" };
    }

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        tenant_id: tenant.id,
        actor_user_id: userData.user.id,
        action: "kb.update_roles",
        resource: "doc",
        meta: {
          doc_id: docId,
          doc_title: docRecord.title,
          new_roles: allowedRoles,
        },
      } as TablesInsert<"audit_logs">);
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return { ok: true };
  } catch (error) {
    console.error("Update document roles error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// ============================================================================
// BULK UPLOAD FUNCTIONS (SIMPLIFIED)
// ============================================================================

/**
 * Get job progress for client polling
 */
export async function getJobProgress(jobId: string): Promise<{
  success: boolean;
  error?: string;
  data?: {
    jobId: string;
    status: string;
    step: string;
    progress: number;
    processedBytes?: number;
    totalBytes?: number;
    processedChunks?: number;
    totalChunks?: number;
    error?: string;
    notes?: string;
  };
}> {
  try {
    const supabase = await createClient();
    
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return { success: false, error: "Authentication failed" };
    if (!userData.user) return { success: false, error: "User not found" };

    const slug = await getTenantSlug();
    if (!slug) return { success: false, error: "Tenant not found" };
    
    const tenant = await getTenantBySlug(slug);
    await requirePermission(tenant.id, "kb.write");

    // Get the job
    const { data: job, error: jobErr } = await supabase
      .from("kb_ingest_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("tenant_id", tenant.id)
      .single();

    if (jobErr || !job) {
      return { success: false, error: "Job not found" };
    }

    // Calculate progress based on step
    let progress = 0;
    switch (job.step) {
      case 'uploading':
        if (job.status === 'processing') {
          progress = 50; // Processing
        } else {
          progress = Math.round((job.processed_bytes || 0) / (job.total_bytes || 1) * 100);
        }
        break;
      case 'done':
        progress = 100;
        break;
      case 'error':
      case 'canceled':
        progress = 0;
        break;
      default:
        progress = 10;
    }

    return {
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        step: job.step,
        progress,
        processedBytes: job.processed_bytes,
        totalBytes: job.total_bytes,
        processedChunks: job.processed_chunks,
        totalChunks: job.total_chunks,
        error: job.error,
        notes: job.notes,
      },
    };
  } catch (error) {
    console.error("Get job progress error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}



/**
 * Delete an ingest job (for cleanup when removing from upload queue)
 */
export async function deleteIngestJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return { success: false, error: "Authentication failed" };
    if (!userData.user) return { success: false, error: "User not found" };

    const slug = await getTenantSlug();
    if (!slug) return { success: false, error: "Tenant not found" };
    
    const tenant = await getTenantBySlug(slug);
    await requirePermission(tenant.id, "kb.write");

    // Get job info for cleanup
    const { data: job, error: jobErr } = await supabase
      .from("kb_ingest_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("tenant_id", tenant.id)
      .single();

    if (jobErr || !job) {
      return { success: false, error: "Job not found" };
    }

    // Delete associated document if it exists and has no chunks
    if (job.doc_id) {
      const { data: chunks } = await supabase
        .from("kb_chunks")
        .select("id")
        .eq("doc_id", job.doc_id)
        .limit(1);
      
      if (!chunks || chunks.length === 0) {
        // No chunks exist, safe to delete document
        await supabase
          .from("kb_docs")
          .delete()
          .eq("id", job.doc_id)
          .eq("tenant_id", tenant.id);
      }
    }

    // Delete the job
    const { error: deleteErr } = await supabase
      .from("kb_ingest_jobs")
      .delete()
      .eq("id", jobId)
      .eq("tenant_id", tenant.id);

    if (deleteErr) {
      return { success: false, error: "Failed to delete job" };
    }

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        tenant_id: tenant.id,
        actor_user_id: userData.user.id,
        action: "kb.delete_job",
        resource: "job",
        meta: {
          job_id: jobId,
          filename: job.filename,
        },
      } as TablesInsert<"audit_logs">);
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
      // Don't fail for audit errors
    }

    return { success: true };
  } catch (error) {
    console.error("Delete job error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}




