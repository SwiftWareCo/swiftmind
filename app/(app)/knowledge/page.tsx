import { Suspense } from "react";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/kb/kb.data";
import { UploadForm } from "./upload-form";
import { KnowledgeTable } from "@/components/knowledge/KnowledgeTable";
import { SearchPreview } from "@/components/knowledge/SearchPreview";
import { Card, CardContent } from "@/components/ui/card";

export default async function KnowledgePage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  const canWrite = await hasPermission(tenant.id, "kb.write");

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold">{tenant.name} Knowledge</h1>
      <p className="text-muted-foreground">Upload docs or verify what’s searchable.</p>

      <Card className="mt-4">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SearchPreview tenantId={tenant.id} />
            {canWrite ? <UploadForm tenantId={tenant.id} embedded /> : null}
          </div>
        </CardContent>
      </Card>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Documents</h2>
        </div>
        <Suspense fallback={<div>Loading documents…</div>}>
          <KnowledgeTable tenantId={tenant.id} canWrite={canWrite} />
        </Suspense>
      </section>
    </div>
  );
}


