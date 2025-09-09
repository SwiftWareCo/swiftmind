"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DatasetDetailView } from '@/components/csv/DatasetDetailView';
import { createDatasetDetailQueryOptions } from '@/lib/queryOptions/csvQueryOptions';
import type { DatasetDetail, DatasetQueryOptions } from '@/server/csv/csv.data';
import { PaginationControls } from "@/components/ui/pagination";

interface Props {
  dataset: DatasetDetail;
  currentPage: number;
  pageSize: number;
  tenantId: string;
}

export function DatasetDetailPageClient({
  dataset: initialDataset,
  currentPage,
  pageSize,
  tenantId
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Use the same pagination pattern as MembersTable
  const [page, setPage] = useState(currentPage);
  
  // Parse current filters from URL - memoized to prevent re-renders
  const filters = useMemo(() => {
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'id';
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    
    return {
      page,
      limit: pageSize,
      search,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc',
      filters: {},
    };
  }, [searchParams, pageSize, page]);
  
  // Use TanStack Query for dataset details
  const { data: dataset = initialDataset } = useQuery({
    ...createDatasetDetailQueryOptions(tenantId, initialDataset.id),
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Use TanStack Query for rows with pagination (same pattern as MembersTable)
  const { 
    data: rowsData,
    isLoading
  } = useQuery({
    queryKey: ["dataset-rows", tenantId, dataset.id, filters.search, filters.sortBy, filters.sortOrder],
    queryFn: async () => {
      const { queryDatasetRows } = await import('@/server/csv/csv.data');
      const result = await queryDatasetRows(tenantId, dataset.id, {
        page,
        limit: pageSize,
        search: filters.search || undefined,
        filters: filters.filters,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      });
      return result;
    },
    staleTime: 30000, // Increase stale time to reduce refetches
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchOnMount: false, // Prevent refetch on mount
    refetchOnReconnect: false, // Prevent refetch on reconnect
  });

  // Use the same pagination logic as MembersTable - memoized to prevent recalculation
  const { allRows, pageCount, rows } = useMemo(() => {
    const allRows = rowsData?.rows ?? [];
    const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const rows = allRows.slice(from, to);
    
    return { allRows, pageCount, rows };
  }, [rowsData?.rows, page, pageSize]);

  const handleBack = useCallback(() => {
    router.push('/knowledge');
  }, [router]);

  const handleFiltersChange = useCallback((options: DatasetQueryOptions) => {
    const params = new URLSearchParams();
    
    if (options.page && options.page > 1) {
      params.set('page', options.page.toString());
    }
    
    if (options.limit && options.limit !== 50) {
      params.set('limit', options.limit.toString());
    }
    
    if (options.search) {
      params.set('search', options.search);
    }
    
    if (options.sortBy && options.sortBy !== 'row_index') {
      params.set('sortBy', options.sortBy);
    }
    
    if (options.sortOrder && options.sortOrder !== 'asc') {
      params.set('sortOrder', options.sortOrder);
    }
    
    // Add column filters
    if (options.filters) {
      Object.entries(options.filters).forEach(([column, value]) => {
        if (value) {
          params.set(`filter_${column}`, String(value));
        }
      });
    }

    const newUrl = params.toString() 
      ? `/knowledge/datasets/${dataset.id}?${params.toString()}`
      : `/knowledge/datasets/${dataset.id}`;
    
    router.push(newUrl);
  }, [router, dataset.id]);

  const handleExport = useCallback(async (filters?: DatasetQueryOptions) => {
    try {
      const { exportDatasetRows } = await import('@/server/csv/csv.data');
      const exportResult = await exportDatasetRows(tenantId, dataset.id, filters || {});
      
      // Create and trigger download
      const blob = new Blob([exportResult.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      const filterText = filters ? ' (filtered)' : '';
      toast.success(`Exported ${exportResult.rowCount} rows${filterText}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export dataset');
    }
  }, [tenantId, dataset.id]);

  return (
    <div className="space-y-4">
      <DatasetDetailView
        dataset={dataset}
        rows={rows}
        totalRows={allRows.length}
        currentPage={page}
        pageSize={pageSize}
        hasMore={page < pageCount}
        isLoading={isLoading}
        onBack={handleBack}
        onPageChange={setPage}
        onFiltersChange={handleFiltersChange}
        onExport={handleExport}
      />
      
      {/* Pagination Controls - same as MembersTable */}
      <PaginationControls
        className="px-3 py-2"
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}
