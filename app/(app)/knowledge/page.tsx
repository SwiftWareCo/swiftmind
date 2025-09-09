import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import { hasPermission } from "@/server/permissions/permissions.data";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationProvider } from "@/components/providers/HydrationProvider";
import { KnowledgePageClient } from "@/components/knowledge/KnowledgePageClient";
import { createDatasetsListQueryOptions } from "@/lib/queryOptions/csvQueryOptions";
import { listDatasets } from "@/server/csv/csv.data";

export default async function KnowledgePage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  
  // Require at least read access to knowledge base
  await requirePermission(tenant.id, "kb.read");
  
  // Check write permissions for documents and CSV
  const canWrite = await hasPermission(tenant.id, "kb.write");

  // Pre-fetch data on the server for hydration
  const queryClient = new QueryClient();
  
  // Pre-populate the datasets query
  await queryClient.prefetchQuery({
    ...createDatasetsListQueryOptions(tenant.id),
    queryFn: () => listDatasets(tenant.id),
  });

  const dehydratedState = dehydrate(queryClient);

  return (
    <div className="">
      <HydrationProvider dehydratedState={dehydratedState}>
        <KnowledgePageClient tenantId={tenant.id} canWrite={canWrite} />
      </HydrationProvider>
    </div>
  );
}