import { Suspense } from "react";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/kb/kb.data";
import { KnowledgeTable } from "@/components/knowledge/KnowledgeTable";

export default async function BrowseKnowledgePage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  const canWrite = await hasPermission(tenant.id, "kb.write");

  return (
    <div className="container mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Browse Knowledge</h1>
        <p className="text-muted-foreground">Search and manage your documents.</p>
      </div>

      <Suspense fallback={<div>Loading documents…</div>}>
        <KnowledgeTable tenantId={tenant.id} canWrite={canWrite} />
      </Suspense>
    </div>
  );
}
