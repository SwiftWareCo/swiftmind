import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getDatasetDetail, queryDatasetRows } from "@/server/csv/csv.data";
import { DatasetDetailPageClient } from "@/components/csv/DatasetDetailPageClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DatasetDetailPage({ params, searchParams }: Props) {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  
  const tenant = await getTenantBySlug(slug);
  
  // Check permissions
  await requirePermission(tenant.id, "kb.csv.read");
  
  // Await params and searchParams
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  // Parse search params
  const page = parseInt(String(resolvedSearchParams.page || '1'));
  const pageSize = parseInt(String(resolvedSearchParams.limit || '50'));
  const search = String(resolvedSearchParams.search || '');
  const sortBy = String(resolvedSearchParams.sortBy || 'id');
  const sortOrder = String(resolvedSearchParams.sortOrder || 'asc') as 'asc' | 'desc';
  
  try {
    // Get dataset details
    const dataset = await getDatasetDetail(tenant.id, resolvedParams.id);
    if (!dataset) {
      notFound();
    }

    // Get initial rows data
    const rowsResult = await queryDatasetRows(tenant.id, resolvedParams.id, {
      page,
      limit: pageSize,
      search: search || undefined,
      sortBy,
      sortOrder,
      filters: {}
    });

    return (
      <DatasetDetailPageClient
        dataset={dataset}
        currentPage={page}
        pageSize={pageSize}
        tenantId={tenant.id}
      />
    );
  } catch (error) {
    console.error('Dataset detail error:', error);
    notFound();
  }
}
