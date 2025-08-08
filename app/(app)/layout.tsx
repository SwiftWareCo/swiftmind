import { ReactNode } from "react";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { TenantProvider } from "@/components/tenant/TenantProvider";
import { notFound } from "next/navigation";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const slug = await getTenantSlug();
  if (!slug) {
    notFound();
  }

  let tenant;
  try {
    tenant = await getTenantBySlug(slug);
  } catch (err: unknown) {
    console.error(err);
    notFound();
  }

  return (
    <TenantProvider value={{ tenantId: tenant.id, slug: tenant.slug }}>
      {children}
    </TenantProvider>
  );
}


