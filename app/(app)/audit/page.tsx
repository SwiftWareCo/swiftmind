import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import AuditTable from "@/components/audit/AuditTable";

export default async function AuditPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">Audit Logs</h1>
      {/* Client table with pagination via TanStack Query */}
      <AuditTable tenantId={tenant.id} />
    </div>
  );
}


