"use server";

import { createClient } from "@/server/supabase/server";
import type { Tables } from "@/lib/types";

export type MembershipRow = Tables<"memberships"> & {
  tenant: Pick<Tables<"tenants">, "id" | "slug" | "name">;
};

type RawMembership = Tables<"memberships"> & {
  tenants: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null;
};

export async function getCurrentUserMemberships(): Promise<MembershipRow[]> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, role_key, tenant_id, user_id, created_at, tenants:tenant_id(id, slug, name)"
    );

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawMembership[];
  const memberships: MembershipRow[] = rows.map((m) => {
    const tenantObj = Array.isArray(m.tenants) ? m.tenants[0] ?? null : m.tenants;
    return {
      id: m.id,
      role_key: m.role_key,
      tenant_id: m.tenant_id,
      user_id: m.user_id,
      created_at: m.created_at,
      tenant: {
        id: tenantObj?.id ?? "",
        slug: tenantObj?.slug ?? "",
        name: tenantObj?.name ?? "",
      },
    };
  });

  return memberships;
}


