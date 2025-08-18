"use server";

import "server-only";

import { createAdminClient } from "@/server/supabase/admin";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";
import type { Tables } from "@/lib/types/database.types";

export type RestSourceRow = Pick<
  Tables<"kb_sources">,
  "id" | "tenant_id" | "title" | "type" | "config" | "uri"
> & { backoffice_only?: boolean | null };

export type RestCursorRow = {
  source_id: string;
  next_cursor: string | null;
  page_count: number;
  item_count: number;
  last_status: "ok" | "error" | null;
  last_http_status: number | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type RestSourceWithState = {
  source: RestSourceRow;
  cursor: RestCursorRow | null;
  tenant: { id: string; name: string; slug: string } | null;
};

export async function listBackofficeRestSourcesWithCursor(): Promise<RestSourceWithState[]> {
  const ok = await isPlatformAdmin();
  if (!ok) throw new Error("403");

  // Use admin client to bypass RLS for operator backoffice reads
  const supabase = await createAdminClient();

  const { data: sources, error } = await supabase
    .from("kb_sources")
    .select("id, tenant_id, title, type, config, uri, backoffice_only")
    .eq("type", "rest")
    .eq("backoffice_only", true);
  if (error) throw new Error(error.message);

  const list = (sources || []) as RestSourceRow[];
  if (list.length === 0) return [];

  const ids = list.map((s) => s.id);
  const tenantIds = Array.from(new Set(list.map((s) => s.tenant_id)));

  const [cursorsRes, tenantsRes] = await Promise.all([
    supabase
      .from("kb_rest_cursors")
      .select("source_id, next_cursor, page_count, item_count, last_status, last_http_status, last_synced_at, last_error")
      .in("source_id", ids)
      .order("last_synced_at", { ascending: false }),
    supabase
      .from("tenants")
      .select("id, name, slug")
      .in("id", tenantIds),
  ]);

  if (cursorsRes.error) throw new Error(cursorsRes.error.message);
  if (tenantsRes.error) throw new Error(tenantsRes.error.message);

  const cursorBySource = new Map<string, RestCursorRow>();
  for (const c of (cursorsRes.data || []) as RestCursorRow[]) cursorBySource.set(c.source_id, c);

  const tenantById = new Map<string, { id: string; name: string; slug: string }>();
  for (const t of tenantsRes.data || []) tenantById.set(t.id, t as { id: string; name: string; slug: string });

  return list.map((s) => ({
    source: s,
    cursor: cursorBySource.get(s.id) || null,
    tenant: tenantById.get(s.tenant_id) || null,
  }));
}

export async function getRestSource(sourceId: string): Promise<RestSourceRow | null> {
  const ok = await isPlatformAdmin();
  if (!ok) throw new Error("403");
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("kb_sources")
    .select("id, tenant_id, title, type, config, uri, backoffice_only")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RestSourceRow) || null;
}

export async function getRestCursor(sourceId: string): Promise<RestCursorRow | null> {
  const ok = await isPlatformAdmin();
  if (!ok) throw new Error("403");
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("kb_rest_cursors")
    .select("source_id, next_cursor, page_count, item_count, last_status, last_http_status, last_synced_at, last_error")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RestCursorRow) || null;
}


