import { Suspense } from "react";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/kb/kb.data";
import { UploadForm } from "./upload-form";
import { KnowledgeTable } from "@/components/knowledge/KnowledgeTable";

export default async function KnowledgePage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  const canWrite = await hasPermission(tenant.id, "kb.write");

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <h1 className="text-2xl font-semibold">Knowledge</h1>
      <p className="text-muted-foreground">Upload documents and track ingestion status.</p>

      {canWrite ? (
        <UploadForm tenantId={tenant.id} />
      ) : (
        <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">You do not have permission to upload (kb.write).</div>
      )}
      <Suspense fallback={<div>Loading...</div>}>
        <KnowledgeTable tenantId={tenant.id} />
      </Suspense>
    </div>
  );
}


