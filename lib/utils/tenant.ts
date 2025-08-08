import { headers } from "next/headers";

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
};

export async function getTenantSlug(): Promise<string | null> {
  const hdrs = await headers();
  const slug = hdrs.get("x-tenant-slug");
  return slug ?? null;
}


