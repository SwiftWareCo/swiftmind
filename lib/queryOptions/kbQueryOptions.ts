import type { SupabaseClient } from "@supabase/supabase-js";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Tables } from "@/lib/types/database.types";

export const kbDocsKeys = {
  list: (tenantId: string) => ["kb-docs", tenantId] as const,
} as const;

type DocItem = Pick<
  Tables<"kb_docs">,
  "id" | "title" | "status" | "error" | "created_at" | "content_hash" | "version" | "source_id"
>;
type JobItem = { doc_id: string; status: string; error: string | null; updated_at: string };
type ChunkItem = { doc_id: string };

export type KbDocsRow = DocItem & { chunkCount: number; latestJob: JobItem | null };

export function createKbDocsQueryOptions(
  tenantId: string,
  supabase: SupabaseClient,
): UseQueryOptions<
  { rows: KbDocsRow[]; hasPending: boolean },
  Error,
  { rows: KbDocsRow[]; hasPending: boolean },
  ReturnType<typeof kbDocsKeys.list>
> {
  return {
    queryKey: kbDocsKeys.list(tenantId),
    queryFn: async () => {
      const [docsRes, jobsRes, chunksRes] = await Promise.all([
        supabase
          .from("kb_docs")
          .select("id, title, status, error, created_at, content_hash, version, source_id")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("kb_ingest_jobs")
          .select("doc_id, status, error, updated_at")
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false }),
        supabase.from("kb_chunks").select("doc_id").eq("tenant_id", tenantId),
      ]);

      if (docsRes.error) throw new Error(docsRes.error.message);
      if (jobsRes.error) throw new Error(jobsRes.error.message);
      if (chunksRes.error) throw new Error(chunksRes.error.message);

      const docs = (docsRes.data || []) as DocItem[];
      const jobs = (jobsRes.data || []) as JobItem[];
      const chunks = (chunksRes.data || []) as ChunkItem[];

      const chunkCountByDoc = new Map<string, number>();
      for (const c of chunks) chunkCountByDoc.set(c.doc_id, (chunkCountByDoc.get(c.doc_id) || 0) + 1);

      const latestJobByDoc = new Map<string, JobItem>();
      for (const j of jobs) if (!latestJobByDoc.has(j.doc_id)) latestJobByDoc.set(j.doc_id, j);

      const rows: KbDocsRow[] = docs.map((d) => ({
        ...d,
        chunkCount: chunkCountByDoc.get(d.id) || 0,
        latestJob: latestJobByDoc.get(d.id) || null,
      }));
      const hasPending = rows.some((r) => r.status !== "ready");
      return { rows, hasPending };
    },
    refetchInterval: (q) => (q.state.data?.hasPending ? 5000 : false),
    staleTime: 2000,
  };
}


