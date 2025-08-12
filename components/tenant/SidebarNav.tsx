import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/permissions/permissions.data";
import { SidebarNavClient } from "@/components/tenant/SidebarNavClient";

export async function SidebarNav() {
  const slug = await getTenantSlug();
  if (!slug) return null;
  const tenant = await getTenantBySlug(slug);
  const isAdmin = await hasPermission(tenant.id, "members.manage");
  return <SidebarNavClient isAdmin={isAdmin} />;
}


