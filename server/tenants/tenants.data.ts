"use server";

import { createAdminClient } from "@/server/supabase/admin";
import type { Tables } from "@/lib/types/database.types";

export type TenantRow = Pick<Tables<"tenants">, "id" | "slug" | "name">;

export async function getTenantBySlug(slug: string): Promise<TenantRow> {
  // Use admin client to bypass RLS for tenant lookup
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle<TenantRow>();
  
  if (error) {
    console.error(`❌ Database error looking for tenant "${slug}":`, error);
    throw new Error(error.message);
  }
  if (!data) {
    console.error(`❌ No tenant found for slug: "${slug}"`);
    const notFoundError = new Error("Tenant not found");
    // @ts-expect-error annotate for boundary
    notFoundError.statusCode = 404;
    throw notFoundError;
  }
  
  return data;
}

export type TenantListItem = TenantRow & { created_at: string; member_count: number };

export async function listTenantsWithMemberCounts(): Promise<TenantListItem[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .select("id, slug, name, created_at, memberships(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as unknown as Array<Tables<"tenants"> & { memberships: { count: number }[] }>;
  return rows.map((t) => ({
    id: (t as unknown as { id: string }).id,
    slug: (t as unknown as { slug: string }).slug,
    name: (t as unknown as { name: string }).name,
    created_at: (t as unknown as { created_at: string }).created_at,
    member_count: Array.isArray((t as unknown as { memberships: { count: number }[] }).memberships)
      ? ((t as unknown as { memberships: { count: number }[] }).memberships[0]?.count ?? 0)
      : 0,
  }));
}

export type TenantDetail = TenantRow & {
  created_at: string;
  members: { user_id: string; email: string; display_name: string | null; role_key: string; created_at: string }[];
  invites: { id: string; email: string; role_key: string; created_at: string; expires_at: string | null; accepted_at: string | null; revoked_at: string | null }[];
  integrations: { gmail: { status: "not_connected" | "connected" | "needs_attention"; updated_at?: string } };
};

export async function getTenantDetailBySlug(slug: string): Promise<TenantDetail> {
  const admin = await createAdminClient();
  const { data: tenant, error: terr } = await admin
    .from("tenants")
    .select("id, slug, name, created_at")
    .eq("slug", slug)
    .maybeSingle<{ id: string; slug: string; name: string; created_at: string }>();
  if (terr) throw new Error(terr.message);
  if (!tenant) throw new Error("Tenant not found");

  const [{ data: members }, { data: invites }, { data: secret }] = await Promise.all([
    admin
      .from("memberships")
      .select("user_id, role_key, created_at, users:user_id(email, display_name)")
      .eq("tenant_id", tenant.id),
    admin
      .from("invites")
      .select("id, email, role_key, created_at, expires_at, accepted_at, revoked_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("integration_secrets")
      .select("updated_at, provider")
      .eq("tenant_id", tenant.id)
      .eq("provider", "google")
      .maybeSingle<{ updated_at?: string; provider?: string }>(),
  ]);

  const gmail: TenantDetail["integrations"]["gmail"] = secret
    ? { status: "connected", updated_at: (secret as { updated_at?: string }).updated_at }
    : { status: "not_connected" };

  const rows = (members || []) as Array<{ user_id: string; role_key: string; created_at: string; users: { email: string; display_name: string | null } | { email: string; display_name: string | null }[] }>;
  const mappedMembers = rows.map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      user_id: m.user_id,
      role_key: m.role_key,
      created_at: m.created_at,
      email: u?.email || "",
      display_name: u?.display_name ?? null,
    };
  });

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    created_at: tenant.created_at,
    members: mappedMembers,
    invites: (invites || []) as TenantDetail["invites"],
    integrations: { gmail },
  };
}


