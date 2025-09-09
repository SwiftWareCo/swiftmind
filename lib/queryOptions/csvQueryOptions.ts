
import type { UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import type { DatasetListItem, DatasetDetail, DatasetRow, DatasetQueryOptions } from "@/server/csv/csv.data";
import type { CsvColumn, AnalyzeCsvResult, CommitCsvMappingResult, StreamCsvRowsResult, CsvAnalysisResult } from "@/server/csv/csv.actions";

export const csvDatasetKeys = {
  all: (tenantId: string) => ["csv-datasets", tenantId] as const,
  list: (tenantId: string) => ["csv-datasets", tenantId, "list"] as const,
  detail: (datasetId: string) => ["csv-datasets", "detail", datasetId] as const,
  rows: (datasetId: string, options?: DatasetQueryOptions) => ["csv-datasets", "rows", datasetId, options] as const,
} as const;

export const csvUploadKeys = {
  upload: (tenantId: string) => ["csv-upload", tenantId] as const,
  analysis: (datasetId: string) => ["csv-analysis", datasetId] as const,
  progress: (datasetId: string) => ["csv-progress", datasetId] as const,
} as const;

/**
 * Query options for listing datasets
 */
export function createDatasetsListQueryOptions(
  tenantId: string,
): UseQueryOptions<
  DatasetListItem[],
  Error,
  DatasetListItem[],
  ReturnType<typeof csvDatasetKeys.list>
> {
  return {
    queryKey: csvDatasetKeys.list(tenantId),
    queryFn: async () => {
      const { listDatasets } = await import('@/server/csv/csv.data');
      return await listDatasets(tenantId);
    },
    staleTime: 60000, // Cache for 60 seconds - CSV processing isn't real-time
    refetchOnWindowFocus: false, // Don't refetch on window focus
  };
}

/**
 * Query options for dataset detail view
 */
export function createDatasetDetailQueryOptions(
  tenantId: string,
  datasetId: string,
): UseQueryOptions<
  DatasetDetail,
  Error,
  DatasetDetail,
  ReturnType<typeof csvDatasetKeys.detail>
> {
  return {
    queryKey: csvDatasetKeys.detail(datasetId),
    queryFn: async () => {
      const { getDatasetDetail } = await import('@/server/csv/csv.data');
      const result = await getDatasetDetail(tenantId, datasetId);
      if (!result) {
        throw new Error('Dataset not found');
      }
      return result;
    },
    staleTime: 60000, // Cache for 60 seconds
    enabled: !!datasetId && !!tenantId,
  };
}

/**
 * Query options for dataset rows with pagination and filtering
 */
export function createDatasetRowsQueryOptions(
  tenantId: string,
  datasetId: string,
  options: DatasetQueryOptions = {},
): UseQueryOptions<
  { rows: DatasetRow[]; count: number; page: number; limit: number },
  Error,
  { rows: DatasetRow[]; count: number; page: number; limit: number },
  ReturnType<typeof csvDatasetKeys.rows>
> {
  return {
    queryKey: csvDatasetKeys.rows(datasetId, options),
    queryFn: async () => {
      const { queryDatasetRows } = await import('@/server/csv/csv.data');
      const result = await queryDatasetRows(tenantId, datasetId, options);
      return {
        rows: result.rows,
        count: result.total,
        page: options.page || 1,
        limit: options.limit || 50,
      };
    },
    staleTime: 60000, // Cache rows for 60 seconds
    enabled: !!datasetId && !!tenantId,
  };
}

/**
 * Infinite query options for getting dataset rows with infinite scrolling
 */



/**
 * Mutation options for beginning CSV upload (direct processing)
 */
export function createBeginCsvUploadMutation(): UseMutationOptions<
  { ok: boolean; error?: string; datasetId?: string; analysis?: CsvAnalysisResult },
  Error,
  { formData: FormData; rolesOverride?: string[] }
> {
  return {
    mutationFn: async ({ formData, rolesOverride }) => {
      const { beginCsvIngest } = await import('@/server/csv/csv.actions');
      return await beginCsvIngest(formData, rolesOverride);
    },
  };
}

/**
 * Mutation options for analyzing CSV file
 */
export function createAnalyzeCsvMutation(): UseMutationOptions<
  AnalyzeCsvResult,
  Error,
  string // datasetId
> {
  return {
    mutationFn: async (datasetId) => {
      const { analyzeCsv } = await import('@/server/csv/csv.actions');
      return await analyzeCsv(datasetId);
    },
  };
}

/**
 * Mutation options for committing CSV column mapping
 */
export function createCommitCsvMappingMutation(): UseMutationOptions<
  CommitCsvMappingResult,
  Error,
  {
    datasetId: string;
    mapping: {
      columns: CsvColumn[];
      treatFirstRowAsHeader: boolean;
    };
    allowedRoles?: string[];
  }
> {
  return {
    mutationFn: async ({ datasetId, mapping, allowedRoles }) => {
      const { commitCsvMapping } = await import('@/server/csv/csv.actions');
      return await commitCsvMapping(datasetId, mapping, allowedRoles);
    },
  };
}

/**
 * Mutation options for streaming CSV rows (batched ingestion)
 */
export function createStreamCsvRowsMutation(): UseMutationOptions<
  StreamCsvRowsResult,
  Error,
  { datasetId: string; batchToken?: string }
> {
  return {
    mutationFn: async ({ datasetId, batchToken }) => {
      const { streamCsvRows } = await import('@/server/csv/csv.actions');
      return await streamCsvRows(datasetId, batchToken);
    },
  };
}

/**
 * Complete CSV configuration and ingestion workflow
 */
export function createCompleteCSVWorkflowMutation(): UseMutationOptions<
  { ok: boolean; error?: string },
  Error,
  {
    datasetId: string;
    mapping: {
      columns: CsvColumn[];
      treatFirstRowAsHeader: boolean;
    };
    allowedRoles?: string[];
  }
> {
  return {
    mutationFn: async ({ datasetId, mapping, allowedRoles }) => {
      // Step 1: Commit the column mapping
      const { commitCsvMapping } = await import('@/server/csv/csv.actions');
      const mappingResult = await commitCsvMapping(datasetId, mapping, allowedRoles);
      
      if (!mappingResult.ok) {
        return mappingResult;
      }

      // Step 2: Process all rows using streamCsvRows
      const { streamCsvRows } = await import('@/server/csv/csv.actions');
      let isComplete = false;
      let batchToken: string | undefined;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loops

      while (!isComplete && attempts < maxAttempts) {
        attempts++;
        const streamResult = await streamCsvRows(datasetId, batchToken);
        
        if (!streamResult.ok) {
          return { ok: false, error: streamResult.error || 'Row processing failed' };
        }

        isComplete = streamResult.isComplete;
        batchToken = streamResult.nextBatch;

        // Add a small delay to prevent overwhelming the server
        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (!isComplete) {
        return { ok: false, error: 'Processing timeout - too many rows' };
      }

      return { ok: true };
    },
  };
}

/**
 * Mutation options for deleting a dataset
 */
export function createDeleteDatasetMutation(): UseMutationOptions<
  { ok: boolean; error?: string },
  Error,
  string // datasetId
> {
  return {
    mutationFn: async (datasetId) => {
      const { deleteDataset } = await import('@/server/csv/csv.actions');
      return await deleteDataset(datasetId);
    },
  };
}

/**
 * Query options for getting CSV analysis data for configuration modal
 */
export function createCsvAnalysisQueryOptions(
  datasetId: string,
): UseQueryOptions<
  AnalyzeCsvResult,
  Error,
  AnalyzeCsvResult,
  ReturnType<typeof csvUploadKeys.analysis>
> {
  return {
    queryKey: csvUploadKeys.analysis(datasetId),
    queryFn: async () => {
      const { analyzeCsv } = await import('@/server/csv/csv.actions');
      return await analyzeCsv(datasetId);
    },
    staleTime: 300000, // Cache for 5 minutes - analysis data doesn't change
    enabled: !!datasetId,
  };
}

/**
 * Progress tracking for CSV ingestion - removed polling, using natural staleness
 */
export function createCsvProgressQueryOptions(
  tenantId: string,
  datasetId: string,
): UseQueryOptions<
  { status: string; processed: number; total: number; isComplete: boolean },
  Error,
  { status: string; processed: number; total: number; isComplete: boolean },
  ReturnType<typeof csvUploadKeys.progress>
> {
  return {
    queryKey: csvUploadKeys.progress(datasetId),
    queryFn: async () => {
      const { getDatasetDetail } = await import('@/server/csv/csv.data');
      const dataset = await getDatasetDetail(tenantId, datasetId);
      
      if (!dataset) {
        throw new Error('Dataset not found');
      }
      
      return {
        status: dataset.status,
        processed: dataset.rows_count || 0,
        total: dataset.rows_count || 0,
        isComplete: dataset.status === 'ready' || dataset.status === 'error',
      };
    },
    staleTime: 30000, // Cache for 30 seconds - users can refresh manually if needed
    enabled: !!datasetId && !!tenantId,
  };
}
