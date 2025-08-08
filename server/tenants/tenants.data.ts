"use server";

import { createClient } from "@/server/supabase/server";
import type { Tables } from "@/lib/types/database.types";

export type TenantRow = Pick<Tables<"tenants">, "id" | "slug" | "name">;

export async function getTenantBySlug(slug: string): Promise<TenantRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle<TenantRow>();

  if (error) throw new Error(error.message);
  if (!data) {
    const notFoundError = new Error("Tenant not found");
    // @ts-expect-error annotate for boundary
    notFoundError.statusCode = 404;
    throw notFoundError;
  }
  return data;
}


