"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import type { TablesInsert } from "@/lib/types/database.types";

// Types for CSV processing
export type CsvColumn = {
  name: string;
  dataType: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'currency';
  isNullable: boolean;
  examples: string[];
  metadata?: Record<string, unknown>;
};

export type CsvAnalysisResult = {
  delimiter: ',' | ';' | '\t';
  encoding: string;
  hasHeader: boolean;
  columns: CsvColumn[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  errors: string[];
};

export type BeginCsvIngestResult = {
  ok: boolean;
  error?: string;
  datasetId?: string;
  analysis?: CsvAnalysisResult;
};

export type AnalyzeCsvResult = {
  ok: boolean;
  error?: string;
  analysis?: CsvAnalysisResult;
};

export type CommitCsvMappingResult = {
  ok: boolean;
  error?: string;
};

export type StreamCsvRowsResult = {
  ok: boolean;
  error?: string;
  processed: number;
  total: number;
  isComplete: boolean;
  nextBatch?: string;
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB (Supabase global limit)

// Helper function for consistent error responses
function createStreamErrorResult(error: string, processed = 0, total = 0): StreamCsvRowsResult {
  return {
    ok: false,
    error,
    processed,
    total,
    isComplete: false
  };
}
const BATCH_SIZE = 500; // Rows per batch
const ANALYSIS_SAMPLE_SIZE = 200; // Rows to sample for analysis

/**
 * Step 1: Create dataset record and generate pre-signed upload URL
 */
export async function beginCsvIngest(
  formData: FormData,
  rolesOverride?: string[]
): Promise<{ ok: boolean; error?: string; datasetId?: string; analysis?: CsvAnalysisResult }> {
  console.log("🚀 beginCsvIngest: Starting direct CSV processing");
  
  const supabase = await createClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "Authentication error" };
  if (!userData.user) return { ok: false, error: "User not authenticated" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "Tenant not found" };
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "Tenant not found" };
  }

  // Permission check
  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Permission denied";
    return { ok: false, error: msg };
  }

  // Get file from FormData (like UnifiedUploadComponent)
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided" };
  }

  // File validation
  if (file.size === 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "File too large (max 50MB)" };
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { ok: false, error: "File must be a CSV" };
  }

  try {
    // Get default allowed roles from tenant settings or use override
    let allowedRoles = rolesOverride;
    if (!allowedRoles) {
      const { data: ragSettings } = await supabase
        .from("tenant_rag_settings")
        .select("default_allowed_roles")
        .eq("tenant_id", tenantId)
        .single();
      allowedRoles = ragSettings?.default_allowed_roles || ["admin"];
    }

    // Read file into memory for processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = buffer.toString('utf-8');

    // Save file to Supabase Storage for persistence during configuration
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${tenantId}/${timestamp}-${sanitizedFilename}`;
    
    console.log(`💾 beginCsvIngest: Saving CSV to storage: uploads/${storagePath}`);
    const { error: storageError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, buffer, {
        contentType: 'text/csv',
        duplex: 'half'
      });
    
    if (storageError) {
      console.error('CSV storage upload failed:', storageError);
      return { ok: false, error: `Storage upload failed: ${storageError.message}` };
    }

    // Create dataset record
    const { data: dataset, error: datasetErr } = await supabase
      .from("tabular_datasets")
      .insert({
        tenant_id: tenantId,
        title: file.name.replace(/\.csv$/i, ''),
        status: 'pending',
        size_bytes: file.size,
        allowed_roles: allowedRoles,
        created_by: userData.user.id,
        settings: {
          originalFilename: file.name,
          uploadStartedAt: new Date().toISOString(),
          workflowState: 'analyzing',
          storagePath: storagePath, // Store path for later retrieval
          // Store file content for smaller files as backup
          fileContent: file.size < 5 * 1024 * 1024 ? text : undefined // Only store if <5MB
        }
      } as TablesInsert<"tabular_datasets">)
      .select()
      .single();

    if (datasetErr) {
      console.error("Failed to create dataset:", datasetErr);
      return { ok: false, error: datasetErr.message };
    }

    // Analyze CSV immediately (no storage needed)
    const analysis = await analyzeCSVFromText(text, file.name);

    // Update dataset status
    await supabase
      .from("tabular_datasets")
      .update({ 
        status: 'pending',
        settings: {
          ...dataset.settings as Record<string, unknown>,
          workflowState: 'mapping',
          analysis: analysis,
          analyzedAt: new Date().toISOString()
        }
      })
      .eq("id", dataset.id)
      .eq("tenant_id", tenantId);

    // Audit log
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userData.user.id,
      action: "kb.csv.begin",
      resource: `dataset:${dataset.id}`,
      meta: {
        filename: file.name,
        size_bytes: file.size,
        allowed_roles: allowedRoles,
        columns: analysis.columns.length,
        rows: analysis.totalRows
      }
    });

    console.log(`✅ beginCsvIngest: Dataset created and analyzed with ID ${dataset.id}`);
    
    return {
      ok: true,
      datasetId: dataset.id,
      analysis: analysis
    };
    
  } catch (error) {
    console.error("beginCsvIngest error:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Processing failed" };
  }
}

/**
 * Helper: Analyze CSV content directly from text (for direct processing)
 */
async function analyzeCSVFromText(text: string, filename: string): Promise<CsvAnalysisResult> {
  console.log(`📊 analyzeCSVFromText: Analyzing ${filename}`);

  // Detect delimiter
  const delimiter = detectDelimiter(text);
  console.log(`📊 analyzeCSVFromText: Detected delimiter: "${delimiter}"`);
  
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error('CSV file appears to be empty');
  }
  
  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine, delimiter);
  
  // Sample rows for analysis (skip header)
  const dataLines = lines.slice(1);
  const sampleSize = Math.min(ANALYSIS_SAMPLE_SIZE, dataLines.length);
  const sampleRows = dataLines.slice(0, sampleSize).map(line => parseCSVLine(line, delimiter));
  
  // Infer column types
  const columns: CsvColumn[] = headers.map((header, index) => {
    const columnName = header.trim() || `Column_${index + 1}`;
    const columnValues = sampleRows.map(row => row[index] || '').filter(val => val.trim() !== '');
    
    return {
      name: columnName,
      dataType: inferColumnType(columnValues),
      isNullable: columnValues.length < sampleRows.length, // Has empty values
      examples: columnValues.slice(0, 5) // First 5 non-empty values
    };
  });

  // Create sample rows as objects
  const sampleRowObjects = sampleRows.slice(0, 10).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header.trim() || `Column_${index + 1}`] = row[index] || '';
    });
    return obj;
  });

  return {
    delimiter,
    encoding: 'utf-8', // We read as UTF-8
    hasHeader: true, // Assume first row is header for now
    columns,
    sampleRows: sampleRowObjects,
    totalRows: dataLines.length,
    errors: [] // No errors for direct processing
  };
}

/**
 * Step 2: Analyze uploaded CSV to detect structure and types (DEPRECATED - use direct processing)
 */
export async function analyzeCsv(datasetId: string): Promise<AnalyzeCsvResult> {
  console.log(`🔍 analyzeCsv: Analyzing dataset ${datasetId}`);
  
  const supabase = await createClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData.user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "404" };
  }

  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  try {
    // Get dataset record
    const { data: dataset, error: datasetErr } = await supabase
      .from("tabular_datasets")
      .select("*")
      .eq("id", datasetId)
      .eq("tenant_id", tenantId)
      .single();

    if (datasetErr || !dataset) {
      return { ok: false, error: "Dataset not found" };
    }

    const settings = dataset.settings as Record<string, unknown>;
    
    // For direct processing, we should have fileContent in settings
    const fileContent = settings?.fileContent as string;
    
    if (!fileContent) {
      return { ok: false, error: "File content not available - please re-upload" };
    }

    // Analyze CSV structure directly from stored content
    const analysis = await analyzeCsvContent(fileContent);
    
    console.log(`✅ analyzeCsv: Analysis complete for dataset ${datasetId}`);
    return {
      ok: true,
      analysis
    };
    
  } catch (error) {
    console.error("analyzeCsv error:", error);
    
    // Update dataset status to error
    await supabase
      .from("tabular_datasets")
      .update({ 
        status: 'error',
        error: error instanceof Error ? error.message : 'Analysis failed'
      })
      .eq("id", datasetId)
      .eq("tenant_id", tenantId);
    
    return { ok: false, error: "Analysis failed" };
  }
}

/**
 * Helper function to analyze CSV content
 */
async function analyzeCsvContent(text: string): Promise<CsvAnalysisResult> {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Detect delimiter
  const delimiter = detectDelimiter(lines[0]);
  
  // Parse header and sample rows
  const hasHeader = true; // For now, assume first row is header
  const headerRow = lines[0];
  const headers = parseCSVLine(headerRow, delimiter);
  
  // Sample data rows for type inference
  const sampleLines = lines.slice(1, Math.min(ANALYSIS_SAMPLE_SIZE + 1, lines.length));
  const sampleRows: string[][] = sampleLines.map(line => parseCSVLine(line, delimiter));
  
  // Infer column types
  const columns: CsvColumn[] = headers.map((header, index) => {
    const columnValues = sampleRows.map(row => row[index] || '').filter(val => val.trim() !== '');
    
    return {
      name: header.trim() || `Column_${index + 1}`,
      dataType: inferColumnType(columnValues),
      isNullable: sampleRows.some(row => !row[index] || row[index].trim() === ''),
      examples: columnValues.slice(0, 5),
      metadata: {}
    };
  });

  // Create sample rows as objects
  const sampleRowObjects = sampleRows.slice(0, 10).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header.trim() || `Column_${index + 1}`] = row[index] || '';
    });
    return obj;
  });

  return {
    delimiter,
    encoding: 'utf-8', // Assume UTF-8 for now
    hasHeader,
    columns,
    sampleRows: sampleRowObjects,
    totalRows: lines.length - (hasHeader ? 1 : 0),
    errors: []
  };
}

/**
 * Detect CSV delimiter
 */
function detectDelimiter(line: string): ',' | ';' | '\t' {
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

/**
 * Parse CSV line respecting quotes
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Infer column data type from sample values
 */
function inferColumnType(values: string[]): CsvColumn['dataType'] {
  if (values.length === 0) return 'string';
  
  // Check for boolean
  const booleanValues = values.filter(v => 
    /^(true|false|yes|no|1|0)$/i.test(v.trim())
  );
  if (booleanValues.length === values.length) return 'boolean';
  
  // Check for currency
  const currencyValues = values.filter(v => 
    /^[\$€£¥]?[\d,]+\.?\d*$/.test(v.trim().replace(/[,\s]/g, ''))
  );
  if (currencyValues.length > values.length * 0.8) return 'currency';
  
  // Check for integer
  const integerValues = values.filter(v => 
    /^-?\d+$/.test(v.trim())
  );
  if (integerValues.length === values.length) return 'integer';
  
  // Check for number
  const numberValues = values.filter(v => 
    /^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(v.trim())
  );
  if (numberValues.length === values.length) return 'number';
  
  // Check for date patterns
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
  ];
  
  const dateValues = values.filter(v => 
    datePatterns.some(pattern => pattern.test(v.trim()))
  );
  if (dateValues.length > values.length * 0.8) return 'date';
  
  // Check for datetime patterns
  const datetimeValues = values.filter(v => 
    /\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(v.trim())
  );
  if (datetimeValues.length > values.length * 0.8) return 'datetime';
  
  // Default to string
  return 'string';
}

/**
 * Step 3: Commit column mappings and start ingestion
 */
export async function commitCsvMapping(
  datasetId: string,
  mapping: { columns: CsvColumn[]; treatFirstRowAsHeader: boolean },
  allowedRoles?: string[]
): Promise<CommitCsvMappingResult> {
  console.log(`💾 commitCsvMapping: Committing mapping for dataset ${datasetId}`);
  
  const supabase = await createClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData.user) return { ok: false, error: "401" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "404" };
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "404" };
  }

  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "403";
    return { ok: false, error: msg };
  }

  try {
    // Update dataset with mapping and roles
    const updateData: Record<string, unknown> = {
      columns_count: mapping.columns.length,
      settings: {
        treatFirstRowAsHeader: mapping.treatFirstRowAsHeader,
        columnMapping: mapping.columns
      }
    };
    
    if (allowedRoles) {
      updateData.allowed_roles = allowedRoles;
    }

    await supabase
      .from("tabular_datasets")
      .update(updateData)
      .eq("id", datasetId)
      .eq("tenant_id", tenantId);

    // Insert column definitions
    const columnInserts = mapping.columns.map((col, index) => ({
      dataset_id: datasetId,
      tenant_id: tenantId,
      name: col.name,
      ordinal: index,
      data_type: col.dataType,
      nullable: col.isNullable,
      is_indexed: false
    })) as TablesInsert<"tabular_columns">[];

    const { error: colErr } = await supabase
      .from("tabular_columns")
      .insert(columnInserts);

    if (colErr) {
      console.error("Failed to insert columns:", colErr);
      return { ok: false, error: colErr.message };
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userData.user.id,
      action: "kb.csv.mapping.commit",
      resource: `dataset:${datasetId}`,
      meta: {
        columns_count: mapping.columns.length,
        allowed_roles: allowedRoles
      }
    });

    console.log(`✅ commitCsvMapping: Mapping committed for dataset ${datasetId}`);
    return { ok: true };
    
  } catch (error) {
    console.error("commitCsvMapping error:", error);
    return { ok: false, error: "Failed to commit mapping" };
  }
}

/**
 * Step 4: Stream CSV rows in batches
 */
export async function streamCsvRows(
  datasetId: string,
  batchToken?: string
): Promise<StreamCsvRowsResult> {
  console.log(`📊 streamCsvRows: Processing batch for dataset ${datasetId}`);
  
  const supabase = await createClient();
  const adminClient = await createAdminClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return createStreamErrorResult("Authentication error");
  if (!userData.user) return createStreamErrorResult("User not authenticated");

  const slug = await getTenantSlug();
  if (!slug) return createStreamErrorResult("Tenant not found");
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return createStreamErrorResult("Tenant not found");
  }

  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Permission denied";
    return createStreamErrorResult(msg);
  }

  try {
    // Get dataset and columns
    const { data: dataset, error: datasetErr } = await supabase
      .from("tabular_datasets")
      .select("*, settings")
      .eq("id", datasetId)
      .eq("tenant_id", tenantId)
      .single();

    if (datasetErr || !dataset) {
      return createStreamErrorResult("Dataset not found");
    }

    const { data: columns, error: columnsErr } = await supabase
      .from("tabular_columns")
      .select("*")
      .eq("dataset_id", datasetId)
      .eq("tenant_id", tenantId)
      .order("ordinal");

    if (columnsErr) {
      return createStreamErrorResult("Failed to get column definitions");
    }

    const settings = dataset.settings as Record<string, unknown>;
    const treatFirstRowAsHeader = settings?.treatFirstRowAsHeader !== false;

    // Parse batch token to determine starting position
    let startRow = 0;
    if (batchToken) {
      try {
        const tokenData = JSON.parse(Buffer.from(batchToken, 'base64').toString());
        startRow = tokenData.startRow || 0;
      } catch {
        startRow = 0;
      }
    }

    // Get file content from dataset settings or storage
    let fileContent = settings?.fileContent as string;
    const storagePath = settings?.storagePath as string;
    
    if (!fileContent && storagePath) {
      // Try to read from storage
      console.log(`📁 streamCsvRows: Reading CSV from storage: uploads/${storagePath}`);
      const { data: storageData, error: storageErr } = await supabase.storage
        .from('uploads')
        .download(storagePath);
      
      if (storageErr) {
        console.error('Failed to read from storage:', storageErr);
        await supabase
          .from("tabular_datasets")
          .update({ 
            status: 'error',
            description: 'File content not available - please re-upload'
          })
          .eq("id", datasetId)
          .eq("tenant_id", tenantId);
        return createStreamErrorResult("File content not available");
      }
      
      fileContent = await storageData.text();
    }
    
    if (!fileContent) {
      await supabase
        .from("tabular_datasets")
        .update({ 
          status: 'error',
          description: 'File content not available - please re-upload'
        })
        .eq("id", datasetId)
        .eq("tenant_id", tenantId);
      return createStreamErrorResult("File content not available");
    }

    const text = fileContent;
    const lines = text.split('\n').filter(line => line.trim());
    
    // Detect delimiter (should match analysis)
    const delimiter = detectDelimiter(lines[0]);
    
    // Calculate actual data bounds
    const headerOffset = treatFirstRowAsHeader ? 1 : 0;
    const totalDataRows = lines.length - headerOffset;
    const endRow = Math.min(startRow + BATCH_SIZE, totalDataRows);
    
    if (startRow >= totalDataRows) {
      // All rows processed, mark as ready and cleanup storage
      const updatedSettings = { ...dataset.settings as Record<string, unknown> };
      updatedSettings.workflowState = 'complete';
      
      // Clean up storage file to save space (free tier optimization)
      const storagePath = settings?.storagePath as string;
      if (storagePath) {
        console.log(`🗑️ streamCsvRows: Cleaning up storage file: uploads/${storagePath}`);
        const { error: deleteError } = await supabase.storage
          .from('uploads')
          .remove([storagePath]);
        
        if (deleteError) {
          console.error('Storage cleanup failed:', deleteError);
        } else {
          // Remove storage path from settings since file is deleted
          delete updatedSettings.storagePath;
          console.log(`✅ streamCsvRows: Storage file cleaned up successfully`);
        }
      }
      
      await supabase
        .from("tabular_datasets")
        .update({ 
          status: 'ready',
          rows_count: totalDataRows,
          settings: updatedSettings
        })
        .eq("id", datasetId)
        .eq("tenant_id", tenantId);
      
      return {
        ok: true,
        processed: totalDataRows,
        total: totalDataRows,
        isComplete: true
      };
    }

    // Process batch of rows
    const batchLines = lines.slice(headerOffset + startRow, headerOffset + endRow);
    const rowInserts: TablesInsert<"tabular_rows">[] = [];
    const errors: string[] = [];

    for (let i = 0; i < batchLines.length; i++) {
      const lineIndex = startRow + i;
      const line = batchLines[i];
      
      try {
        const values = parseCSVLine(line, delimiter);
        const rowData: Record<string, unknown> = {};
        
        // Convert values according to column types
        columns.forEach((col, colIndex) => {
          const rawValue = values[colIndex] || '';
          rowData[col.name] = convertValue(rawValue, col.data_type, col.nullable);
        });

        rowInserts.push({
          dataset_id: datasetId,
          tenant_id: tenantId,
          data: rowData,
          allowed_roles: dataset.allowed_roles
        } as TablesInsert<"tabular_rows">);
        
      } catch (error) {
        errors.push(`Row ${lineIndex + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }
    }

    // Insert batch using admin client for better performance
    if (rowInserts.length > 0) {
      const { error: insertErr } = await adminClient
        .from("tabular_rows")
        .insert(rowInserts);

      if (insertErr) {
        console.error("Failed to insert batch:", insertErr);
        return createStreamErrorResult(`Batch insert failed: ${insertErr.message}`, startRow, totalDataRows);
      }
    }

    // Update progress
    const processedTotal = startRow + batchLines.length;
    const isComplete = processedTotal >= totalDataRows;
    
    await supabase
      .from("tabular_datasets")
      .update({ 
        status: isComplete ? 'ready' : 'pending',
        rows_count: isComplete ? totalDataRows : processedTotal,
        settings: {
          ...dataset.settings as Record<string, unknown>,
          workflowState: isComplete ? 'complete' : 'ingesting'
        },
        ...(errors.length > 0 && { 
          error: `${errors.length} rows had errors. Last: ${errors[errors.length - 1]}` 
        })
      })
      .eq("id", datasetId)
      .eq("tenant_id", tenantId);

    // Generate next batch token
    let nextBatch: string | undefined;
    if (!isComplete) {
      const nextToken = {
        startRow: processedTotal,
        timestamp: Date.now()
      };
      nextBatch = Buffer.from(JSON.stringify(nextToken)).toString('base64');
    }

    // Audit log for batch completion
    if (isComplete) {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: userData.user.id,
        action: "kb.csv.ingest.complete",
        resource: `dataset:${datasetId}`,
        meta: {
          total_rows: totalDataRows,
          errors_count: errors.length
        }
      });
    } else {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: userData.user.id,
        action: "kb.csv.ingest.batch",
        resource: `dataset:${datasetId}`,
        meta: {
          batch_start: startRow,
          batch_size: batchLines.length,
          processed_total: processedTotal,
          total_rows: totalDataRows
        }
      });
    }

    console.log(`✅ streamCsvRows: Processed ${batchLines.length} rows for dataset ${datasetId}`);
    return {
      ok: true,
      processed: processedTotal,
      total: totalDataRows,
      isComplete,
      nextBatch
    };
    
  } catch (error) {
    console.error("streamCsvRows error:", error);
    
    // Update dataset status to error
    await supabase
      .from("tabular_datasets")
      .update({ 
        status: 'error',
        description: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq("id", datasetId)
      .eq("tenant_id", tenantId);
    
    return createStreamErrorResult("Processing failed");
  }
}

/**
 * Convert string value to appropriate type
 */
function convertValue(value: string, dataType: string, isNullable: boolean | null): unknown {
  const trimmed = value.trim();
  
  // Handle null/empty values
  if (!trimmed) {
    return isNullable ? null : '';
  }
  
  switch (dataType) {
    case 'boolean':
      return /^(true|yes|1)$/i.test(trimmed);
      
    case 'integer':
      const intVal = parseInt(trimmed, 10);
      return isNaN(intVal) ? null : intVal;
      
    case 'number':
    case 'currency':
      // Remove currency symbols and commas
      const cleanNumber = trimmed.replace(/[\$€£¥,\s]/g, '');
      const numVal = parseFloat(cleanNumber);
      return isNaN(numVal) ? null : numVal;
      
    case 'date':
      try {
        // Try to parse various date formats
        const dateVal = new Date(trimmed);
        return isNaN(dateVal.getTime()) ? null : dateVal.toISOString().split('T')[0];
      } catch {
        return null;
      }
      
    case 'datetime':
      try {
        const dateVal = new Date(trimmed);
        return isNaN(dateVal.getTime()) ? null : dateVal.toISOString();
      } catch {
        return null;
      }
      
          default: // string
      return trimmed;
  }
}

/**
 * Delete a dataset and all its associated data
 */
export async function deleteDataset(datasetId: string): Promise<{ ok: boolean; error?: string }> {
  console.log(`🗑️ deleteDataset: Deleting dataset ${datasetId}`);
  
  const supabase = await createClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "Authentication error" };
  if (!userData.user) return { ok: false, error: "User not authenticated" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, error: "Tenant not found" };
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, error: "Tenant not found" };
  }

  // Permission check
  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch {
    return { ok: false, error: "Insufficient permissions" };
  }

  try {
    // First, verify the dataset exists and belongs to this tenant
    const { data: dataset, error: datasetErr } = await supabase
      .from("tabular_datasets")
      .select("id, title, rows_count, settings")
      .eq("id", datasetId)
      .eq("tenant_id", tenantId)
      .single();

    if (datasetErr || !dataset) {
      return { ok: false, error: "Dataset not found" };
    }

    // Clean up storage file if it exists
    const settings = dataset.settings as Record<string, unknown>;
    const storagePath = settings?.storagePath as string;
    if (storagePath) {
      console.log(`🗑️ deleteDataset: Cleaning up storage file: uploads/${storagePath}`);
      const { error: deleteError } = await supabase.storage
        .from('uploads')
        .remove([storagePath]);
      
      if (deleteError) {
        console.error('Storage cleanup failed during dataset deletion:', deleteError);
        // Continue with deletion even if storage cleanup fails
      } else {
        console.log(`✅ deleteDataset: Storage file cleaned up successfully`);
      }
    }

    // Delete in transaction order (child records first)
    // 1. Delete all rows
    const { error: rowsErr } = await supabase
      .from("tabular_rows")
      .delete()
      .eq("dataset_id", datasetId)
      .eq("tenant_id", tenantId);

    if (rowsErr) {
      console.error("Failed to delete rows:", rowsErr);
      return { ok: false, error: "Failed to delete dataset rows" };
    }

    // 2. Delete all column definitions
    const { error: columnsErr } = await supabase
      .from("tabular_columns")
      .delete()
      .eq("dataset_id", datasetId)
      .eq("tenant_id", tenantId);

    if (columnsErr) {
      console.error("Failed to delete columns:", columnsErr);
      return { ok: false, error: "Failed to delete dataset columns" };
    }

    // 3. Finally delete the dataset itself
    const { error: datasetDeleteErr } = await supabase
      .from("tabular_datasets")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", datasetId);

    if (datasetDeleteErr) {
      console.error("Failed to delete dataset:", datasetDeleteErr);
      return { ok: false, error: "Failed to delete dataset" };
    }

    // Log the deletion
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userData.user.id,
      action: "kb.csv.delete",
      resource: `dataset:${datasetId}`,
      meta: {
        dataset_title: dataset.title,
        rows_deleted: dataset.rows_count || 0
      }
    });

    console.log(`✅ deleteDataset: Successfully deleted dataset ${datasetId}`);
    return { ok: true };

  } catch (error) {
    console.error("deleteDataset error:", error);
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "Failed to delete dataset" 
    };
  }
}
