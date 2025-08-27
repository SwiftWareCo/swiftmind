import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/kb/kb.data";
import { UnifiedUploadComponent } from "@/components/knowledge/UnifiedUploadComponent";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search } from "lucide-react";

export default async function KnowledgePage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  const canWrite = await hasPermission(tenant.id, "kb.write");

  if (!canWrite) {
    return (
      <div className="container mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Upload Documents</h1>
          <p className="text-muted-foreground">{`You don't have permission to upload documents.`}</p>
        </div>
        
        <div className="flex justify-center">
          <Link href="/knowledge/browse">
            <Button variant="outline" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Browse Existing Documents
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Upload Documents</h1>
          <p className="text-muted-foreground">Add documents to your knowledge base.</p>
        </div>
        
        <Link href="/knowledge/browse">
          <Button variant="outline" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Browse Documents
          </Button>
        </Link>
      </div>

      <UnifiedUploadComponent tenantId={tenant.id} />
    </div>
  );
}


