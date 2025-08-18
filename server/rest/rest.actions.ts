"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/server/supabase/admin";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";

type ActionResult = { ok: boolean; error?: string };

// Note: Batch sync now runs via API route (/api/backoffice/rest-batch) and shared logic in server/rest/runBatch.ts
// This file keeps only the delete action for sources to avoid unused code and imports.

export async function deleteRestSourceAction(formData: FormData): Promise<ActionResult> {
  const ok = await isPlatformAdmin();
  if (!ok) return { ok: false, error: "forbidden" };
  const sourceId = (formData.get("sourceId") as string) || "";
  if (!sourceId) return { ok: false, error: "missing sourceId" };

  const admin = await createAdminClient();

  const { data: docs, error: dErr } = await admin
    .from("kb_docs")
    .select("id, tenant_id")
    .eq("source_id", sourceId);
  if (dErr) return { ok: false, error: dErr.message };

  for (const doc of docs || []) {
    const { error: cErr } = await admin.from("kb_chunks").delete().eq("doc_id", doc.id).eq("tenant_id", doc.tenant_id);
    if (cErr) return { ok: false, error: cErr.message };
  }

  const { error: delDocsErr } = await admin.from("kb_docs").delete().eq("source_id", sourceId);
  if (delDocsErr) return { ok: false, error: delDocsErr.message };

  await admin.from("kb_rest_cursors").delete().eq("source_id", sourceId);

  const { error: sErr } = await admin.from("kb_sources").delete().eq("id", sourceId);
  if (sErr) return { ok: false, error: sErr.message };

  revalidatePath("/backoffice/rest-sources");
  return { ok: true };
}

// File intentionally minimal after refactor


