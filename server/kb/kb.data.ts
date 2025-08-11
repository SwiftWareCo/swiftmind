"use server";

import { createClient } from "@/server/supabase/server";
import type { Tables } from "@/lib/types/database.types";

export type KbDocListItem = Pick<
  Tables<"kb_docs">,
  "id" | "title" | "status" | "error" | "created_at" | "content_hash" | "version" | "source_id"
> & {
  chunkCount: number;
  latestJob: { status: string; error: string | null; updated_at: string } | null;
};

export async function hasPermission(tenantId: string, perm: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = (await supabase.rpc("user_has_permission", { t: tenantId, perm })) as {
    data: boolean | null;
    error: { message: string } | null;
  };
  if (error) return false;
  return Boolean(data);
}

export async function listDocsWithMeta(tenantId: string): Promise<KbDocListItem[]> {
  const supabase = await createClient();

  const { data: docs, error: docsError } = await supabase
    .from("kb_docs")
    .select("id, title, status, error, created_at, content_hash, version, source_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<Pick<
      Tables<"kb_docs">,
      "id" | "title" | "status" | "error" | "created_at" | "content_hash" | "version" | "source_id"
    >[]>();

  if (docsError) throw new Error(docsError.message);

  const { data: chunkRows } = await supabase
    .from("kb_chunks")
    .select("doc_id")
    .eq("tenant_id", tenantId)
    .returns<Array<{ doc_id: string }>>();

  const chunkCountByDoc = new Map<string, number>();
  for (const row of chunkRows || []) {
    chunkCountByDoc.set(row.doc_id, (chunkCountByDoc.get(row.doc_id) || 0) + 1);
  }

  const { data: jobs } = await supabase
    .from("kb_ingest_jobs")
    .select("doc_id, status, error, updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .returns<Array<{ doc_id: string; status: string; error: string | null; updated_at: string }>>();

  const latestJobByDoc = new Map<string, { status: string; error: string | null; updated_at: string }>();
  for (const j of jobs || []) {
    if (!latestJobByDoc.has(j.doc_id)) latestJobByDoc.set(j.doc_id, { status: j.status, error: j.error, updated_at: j.updated_at });
  }

  return (docs || []).map((d) => ({
    ...d,
    chunkCount: chunkCountByDoc.get(d.id) || 0,
    latestJob: latestJobByDoc.get(d.id) || null,
  }));
}


