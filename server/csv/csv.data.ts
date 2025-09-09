"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";

export type DatasetListItem = {
  id: string;
  title: string;
  status: string;
  rows_count: number | null;
  columns_count: number | null;
  size_bytes: number | null;
  allowed_roles: string[];
  created_at: string;
  created_by: string | null;
  description: string | null;
  version: number;
};

export type DatasetDetail = DatasetListItem & {
  settings: Record<string, unknown>;
  columns: Array<{
    id: string;
    name: string;
    data_type: string;
    nullable: boolean;
    ordinal: number;
    is_indexed: boolean;
  }>;
};

export type DatasetRow = {
  id: number;
  data: Record<string, unknown>;
  created_at: string;
};

export type DatasetQueryOptions = {
  page?: number;
  limit?: number;
  filters?: Record<string, string>;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

/**
 * List all datasets for a tenant with basic metadata
 */
export async function listDatasets(tenantId: string): Promise<DatasetListItem[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("tabular_datasets")
    .select(`
      id,
      title,
      status,
      rows_count,
      size_bytes,
      allowed_roles,
      created_at,
      created_by,
      description,
      version,
      settings
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("Failed to list datasets:", error);
    throw new Error(error.message);
  }
  
  // Transform data to match expected interface
  return (data || []).map(item => ({
    ...item,
    columns_count: 0 // Will be calculated from columns table if needed
  }));
}

/**
 * Get detailed dataset information including columns
 */
export async function getDatasetDetail(tenantId: string, datasetId: string): Promise<DatasetDetail | null> {
  const supabase = await createClient();
  
  // Get dataset
  const { data: dataset, error: datasetErr } = await supabase
    .from("tabular_datasets")
    .select("*")
    .eq("id", datasetId)
    .eq("tenant_id", tenantId)
    .single();
  
  if (datasetErr || !dataset) {
    return null;
  }
  
  // Get columns
  const { data: columns, error: columnsErr } = await supabase
    .from("tabular_columns")
    .select("id, name, data_type, nullable, ordinal, is_indexed")
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId)
    .order("ordinal");
  
  if (columnsErr) {
    console.error("Failed to get columns:", columnsErr);
    throw new Error(columnsErr.message);
  }
  
  return {
    ...dataset,
    columns_count: columns?.length || 0,
    columns: columns || []
  };
}

/**
 * Query dataset rows with pagination and filtering
 */
export async function queryDatasetRows(
  tenantId: string,
  datasetId: string,
  options: DatasetQueryOptions = {}
): Promise<{ rows: DatasetRow[]; total: number; hasMore: boolean }> {
  const supabase = await createClient();
  
  const {
    page = 1,
    limit = 50,
    filters = {},
    search,
    sortBy = 'id',
    sortOrder = 'asc'
  } = options;
  
  const offset = (page - 1) * limit;
  
  // Build base query
  let query = supabase
    .from("tabular_rows")
    .select("id, data, created_at", { count: 'exact' })
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId);
  
  // Apply filters
  if (Object.keys(filters).length > 0) {
    // For JSONB filtering, we need to use containment or specific operators
    Object.entries(filters).forEach(([column, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        // Use JSONB containment for exact matches
        query = query.contains('data', { [column]: value });
      }
    });
  }
  
  // Apply search across all text fields in data
  if (search && search.trim()) {
    // Use ILIKE search on the JSONB data for better reliability
    const searchTerm = search.trim();
    query = query.or(`data::text.ilike.%${searchTerm}%`);
  }
  
  // Apply sorting
  if (sortBy === 'id') {
    query = query.order('id', { ascending: sortOrder === 'asc' });
  } else {
    // For data column sorting, we'd need to use raw SQL or specific JSONB operators
    // For now, default to id
    query = query.order('id', { ascending: sortOrder === 'asc' });
  }
  
  // Apply pagination
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error("Failed to query dataset rows:", error);
    throw new Error(error.message);
  }
  
  const total = count || 0;
  const hasMore = offset + limit < total;
  
  return {
    rows: data || [],
    total,
    hasMore
  };
}

/**
 * Get dataset statistics for the explorer
 */
export async function getDatasetStats(
  tenantId: string,
  datasetId: string
): Promise<{
  totalRows: number;
  columnStats: Array<{
    name: string;
    dataType: string;
    nullCount: number;
    uniqueCount?: number;
    minValue?: string | number | null;
    maxValue?: string | number | null;
    avgValue?: number;
  }>;
}> {
  const supabase = await createClient();
  
  // Get basic row count
  const { count: totalRows, error: countErr } = await supabase
    .from("tabular_rows")
    .select("*", { count: 'exact', head: true })
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId);
  
  if (countErr) {
    throw new Error(countErr.message);
  }
  
  // For column statistics, we'd need custom SQL queries
  // For now, return basic info from the column definitions
  const { data: columns, error: columnsErr } = await supabase
    .from("tabular_columns")
    .select("name, data_type")
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId)
    .order("ordinal");
  
  if (columnsErr) {
    throw new Error(columnsErr.message);
  }
  
  // Calculate basic stats (this could be enhanced with SQL functions)
  const columnStats = (columns || []).map(col => ({
    name: col.name,
    dataType: col.data_type,
    nullCount: 0, // Would need custom query
    uniqueCount: undefined,
    minValue: undefined,
    maxValue: undefined,
    avgValue: undefined
  }));
  
  return {
    totalRows: totalRows || 0,
    columnStats
  };
}

/**
 * Export dataset rows as CSV with optional filtering
 */
export async function exportDatasetRows(
  tenantId: string,
  datasetId: string,
  options: DatasetQueryOptions = {},
  maxRows: number = 10000
): Promise<{ csv: string; filename: string; rowCount: number }> {
  const supabase = await createClient();
  
  // Get dataset info for filename
  const { data: dataset, error: datasetErr } = await supabase
    .from("tabular_datasets")
    .select("title")
    .eq("id", datasetId)
    .eq("tenant_id", tenantId)
    .single();
  
  if (datasetErr || !dataset) {
    throw new Error("Dataset not found");
  }
  
  // Get columns for header
  const { data: columns, error: columnsErr } = await supabase
    .from("tabular_columns")
    .select("name, ordinal")
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId)
    .order("ordinal");
  
  if (columnsErr) {
    throw new Error(columnsErr.message);
  }
  
  // Query rows with filters but no pagination limit (up to maxRows)
  const { rows } = await queryDatasetRows(tenantId, datasetId, {
    ...options,
    page: 1,
    limit: maxRows
  });
  
  // Generate CSV
  const headers = (columns || []).map(col => col.name);
  const csvLines = [
    headers.join(','), // Header row
    ...rows.map(row => 
      headers.map(header => {
        const value = row.data[header];
        // Escape values that contain commas or quotes
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];
  
  const csv = csvLines.join('\n');
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${dataset.title}-export-${timestamp}.csv`;
  
  return {
    csv,
    filename,
    rowCount: rows.length
  };
}

/**
 * Delete a dataset and all its data
 */
export async function deleteDataset(tenantId: string, datasetId: string): Promise<void> {
  const adminClient = await createAdminClient();
  
  // Delete in order: rows -> columns -> dataset
  await adminClient
    .from("tabular_rows")
    .delete()
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId);
  
  await adminClient
    .from("tabular_columns")
    .delete()
    .eq("dataset_id", datasetId)
    .eq("tenant_id", tenantId);
  
  const { error } = await adminClient
    .from("tabular_datasets")
    .delete()
    .eq("id", datasetId)
    .eq("tenant_id", tenantId);
  
  if (error) {
    throw new Error(error.message);
  }
}
