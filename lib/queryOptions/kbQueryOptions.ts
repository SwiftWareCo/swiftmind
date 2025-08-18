import type { SupabaseClient } from "@supabase/supabase-js";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Tables } from "@/lib/types/database.types";

export const kbDocsKeys = {
  list: (tenantId: string) => ["kb-docs", tenantId] as const,
} as const;

export const kbSourcesKeys = {
  list: (tenantId: string) => ["kb-sources", tenantId] as const,
} as const;

export const kbJobsKeys = {
  recent: (tenantId: string) => ["kb-jobs", tenantId, "recent"] as const,
} as const;

type DocItem = Pick<
  Tables<"kb_docs">,
  "id" | "title" | "status" | "error" | "created_at" | "content_hash" | "version" | "source_id" | "uri"
>;
type JobItem = { doc_id: string; status: string; error: string | null; updated_at: string };
type ChunkItem = { doc_id: string };

export type KbDocsRow = DocItem & { chunkCount: number; latestJob: JobItem | null };

type SourceItem = Pick<
  Tables<"kb_sources">,
  "id" | "type" | "title" | "uri" | "created_at" | "created_by" | "backoffice_only"
>;
type RestCursorItem = Pick<
  Tables<"kb_rest_cursors">,
  "source_id" | "page_count" | "item_count" | "last_synced_at" | "last_status" | "last_error"
>;
type UserLite = Pick<Tables<"users">, "id" | "display_name" | "email">;

export type KbSourceRow = SourceItem & {
  created_by_user: { display_name: string | null; email: string | null } | null;
  rest_cursor: RestCursorItem | null;
};

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
          .select("id, title, status, error, created_at, content_hash, version, source_id, uri")
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

export function createKbDocsPageQueryOptions(
  tenantId: string,
  supabase: SupabaseClient,
  page: number,
  pageSize: number,
): UseQueryOptions<
  { rows: KbDocsRow[]; total: number; page: number; pageSize: number; hasPending: boolean },
  Error,
  { rows: KbDocsRow[]; total: number; page: number; pageSize: number; hasPending: boolean },
  [...ReturnType<typeof kbDocsKeys.list>, number, number]
> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return {
    queryKey: [...kbDocsKeys.list(tenantId), page, pageSize],
    queryFn: async () => {
      const docsQuery = supabase
        .from("kb_docs")
        .select("id, title, status, error, created_at, content_hash, version, source_id, uri", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, to);

      const docsRes = await docsQuery;
      if (docsRes.error) throw new Error(docsRes.error.message);
      const total = docsRes.count ?? 0;
      const docs = (docsRes.data || []) as DocItem[];
      const docIds = docs.map((d) => d.id);

      const [jobsRes, chunksRes] = await Promise.all([
        docIds.length
          ? supabase
              .from("kb_ingest_jobs")
              .select("doc_id, status, error, updated_at")
              .eq("tenant_id", tenantId)
              .in("doc_id", docIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] as JobItem[], error: null } as { data: JobItem[]; error: null }),
        docIds.length
          ? supabase
              .from("kb_chunks")
              .select("doc_id")
              .eq("tenant_id", tenantId)
              .in("doc_id", docIds)
          : Promise.resolve({ data: [] as ChunkItem[], error: null } as { data: ChunkItem[]; error: null }),
      ]);
      if (jobsRes.error) throw new Error(jobsRes.error.message);
      if (chunksRes.error) throw new Error(chunksRes.error.message);

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
      return { rows, total, page, pageSize, hasPending };
    },
    refetchInterval: (q) => (q.state.data?.hasPending ? 5000 : false),
    staleTime: 2000,
  };
}


export function createKbSourcesPageQueryOptions(
  tenantId: string,
  supabase: SupabaseClient,
  page: number,
  pageSize: number,
): UseQueryOptions<
  { rows: KbSourceRow[]; total: number; page: number; pageSize: number },
  Error,
  { rows: KbSourceRow[]; total: number; page: number; pageSize: number },
  [...ReturnType<typeof kbSourcesKeys.list>, number, number]
> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return {
    queryKey: [...kbSourcesKeys.list(tenantId), page, pageSize],
    queryFn: async () => {
      const sourcesQuery = supabase
        .from("kb_sources")
        .select("id, type, title, uri, created_at, created_by, backoffice_only", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, to);

      const sourcesRes = await sourcesQuery;
      if (sourcesRes.error) throw new Error(sourcesRes.error.message);
      const total = sourcesRes.count ?? 0;
      const sources = (sourcesRes.data || []) as SourceItem[];
      const sourceIds = sources.map((s) => s.id);

      const createdByIds = Array.from(new Set(sources.map((s) => s.created_by).filter(Boolean))) as string[];

      const [cursorRes, usersRes] = await Promise.all([
        sourceIds.length
          ? supabase
              .from("kb_rest_cursors")
              .select("source_id, page_count, item_count, last_synced_at, last_status, last_error")
              .eq("tenant_id", tenantId)
              .in("source_id", sourceIds)
          : Promise.resolve({ data: [] as RestCursorItem[], error: null } as { data: RestCursorItem[]; error: null }),
        createdByIds.length
          ? supabase
              .from("users")
              .select("id, display_name, email")
              .in("id", createdByIds)
          : Promise.resolve({ data: [] as UserLite[], error: null } as { data: UserLite[]; error: null }),
      ]);

      if (cursorRes.error) throw new Error(cursorRes.error.message);
      if (usersRes.error) throw new Error(usersRes.error.message);

      const cursors = (cursorRes.data || []) as RestCursorItem[];
      const cursorBySource = new Map<string, RestCursorItem>();
      for (const c of cursors) {
        if (!cursorBySource.has(c.source_id)) cursorBySource.set(c.source_id, c);
      }

      const users = (usersRes.data || []) as UserLite[];
      const userById = new Map<string, UserLite>();
      for (const u of users) userById.set(u.id, u);

      const rows: KbSourceRow[] = sources.map((s) => ({
        ...s,
        created_by_user: s.created_by ? { display_name: userById.get(s.created_by!)?.display_name ?? null, email: userById.get(s.created_by!)?.email ?? null } : null,
        rest_cursor: cursorBySource.get(s.id) || null,
      }));

      return { rows, total, page, pageSize };
    },
    staleTime: 2000,
  };
}

export type KbJobRecentItem = Pick<
  Tables<"kb_ingest_jobs">,
  "id" | "status" | "error" | "created_at" | "updated_at" | "doc_id" | "source_id"
> & {
  doc: { id: string; title: string | null } | null;
  source: { id: string; title: string | null; type: string | null } | null;
};

export function createKbJobsRecentQueryOptions(
  tenantId: string,
  supabase: SupabaseClient,
  limit = 10,
): UseQueryOptions<
  { rows: KbJobRecentItem[]; hasActive: boolean },
  Error,
  { rows: KbJobRecentItem[]; hasActive: boolean },
  ReturnType<typeof kbJobsKeys.recent>
> {
  return {
    queryKey: kbJobsKeys.recent(tenantId),
    queryFn: async () => {
      const jobsRes = await supabase
        .from("kb_ingest_jobs")
        .select("id, status, error, created_at, updated_at, doc_id, source_id")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (jobsRes.error) throw new Error(jobsRes.error.message);
      const jobs = (jobsRes.data || []) as Array<Pick<Tables<"kb_ingest_jobs">, "id" | "status" | "error" | "created_at" | "updated_at" | "doc_id" | "source_id">>;
      const docIds = Array.from(new Set(jobs.map((j) => j.doc_id).filter(Boolean))) as string[];
      const sourceIds = Array.from(new Set(jobs.map((j) => j.source_id).filter(Boolean))) as string[];

      const [docsRes, sourcesRes] = await Promise.all([
        docIds.length
          ? supabase
              .from("kb_docs")
              .select("id, title")
              .eq("tenant_id", tenantId)
              .in("id", docIds)
          : Promise.resolve({ data: [] as { id: string; title: string | null }[], error: null } as {
              data: { id: string; title: string | null }[];
              error: null;
            }),
        sourceIds.length
          ? supabase
              .from("kb_sources")
              .select("id, title, type")
              .eq("tenant_id", tenantId)
              .in("id", sourceIds)
          : Promise.resolve({
              data: [] as { id: string; title: string | null; type: string | null }[],
              error: null,
            } as {
              data: { id: string; title: string | null; type: string | null }[];
              error: null;
            }),
      ]);
      if (docsRes.error) throw new Error(docsRes.error.message);
      if (sourcesRes.error) throw new Error(sourcesRes.error.message);

      const docs = new Map<string, { id: string; title: string | null }>();
      for (const d of (docsRes.data || []) as Array<{ id: string; title: string | null }>) docs.set(d.id, d);
      const sources = new Map<string, { id: string; title: string | null; type: string | null }>();
      for (const s of (sourcesRes.data || []) as Array<{ id: string; title: string | null; type: string | null }>) sources.set(s.id, s);

      const rows: KbJobRecentItem[] = jobs.map((j) => ({
        ...j,
        doc: j.doc_id ? docs.get(j.doc_id) || null : null,
        source: j.source_id ? sources.get(j.source_id) || null : null,
      }));

      const hasActive = rows.some((r) => r.status !== "done" && r.status !== "error");
      return { rows, hasActive };
    },
    refetchInterval: (q) => (q.state.data?.hasActive ? 5000 : false),
    staleTime: 2000,
  };
}


