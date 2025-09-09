# CSV Datasets — Streaming Ingestion & Dataset Explorer

Short, high-signal reference for the CSV datasets feature with streaming ingestion, type mapping, and role-gated exploration.

## Overview
- Upload multiple CSVs with drag-drop interface
- Automatic analysis with delimiter detection and type inference
- Interactive column type mapping and role configuration
- Streaming ingestion in batches (500 rows per batch) for large files
- Dataset Explorer with pagination, filtering, search, and CSV export
- Full tenant isolation and role-based access control

## Data Model

### Tables
- `tabular_datasets(id, tenant_id, title, filename, status, rows_count, columns_count, size_bytes, allowed_roles, settings, error, created_by, created_at, updated_at)`
- `tabular_columns(id, dataset_id, tenant_id, name, column_index, data_type, is_nullable, metadata, created_at)`
- `tabular_rows(id, dataset_id, tenant_id, row_index, data, allowed_roles, created_at)`

### Permissions
- `kb.csv.write` - Upload and manage CSV datasets
- `kb.csv.read` - View and export CSV datasets

### Status Flow
```
pending → analyzing → mapping (manual) → ingesting → ready
                                      ↘ error
```

## Server Actions (server/csv/csv.actions.ts)

### Upload & Detection Phase
- `beginCsvIngest(fileMeta, rolesOverride?)` - Creates dataset record and pre-signed upload URL
- `analyzeCsv(datasetId)` - Analyzes uploaded CSV structure and infers column types

### Mapping & Ingestion Phase  
- `commitCsvMapping(datasetId, mapping, allowedRoles?)` - Saves column mappings and settings
- `streamCsvRows(datasetId, batchToken?)` - Processes CSV rows in streaming batches

### Type Detection
Automatic inference for: `string`, `number`, `integer`, `boolean`, `date`, `datetime`, `currency`

## UI Components

### Upload Interface (`components/csv/CsvUploadComponent.tsx`)
- Multi-file drag-drop with progress tracking
- Real-time analysis and type inference
- Interactive column mapping with type overrides
- Role selection and header row toggle
- Streaming ingestion with batch progress

### Dataset Explorer (`components/csv/DatasetTable.tsx`)
- List view with status, row counts, and metadata
- Search and filtering by status
- Sortable columns with export actions
- Role badges and error display

### Data Viewer (`components/csv/DatasetDetailView.tsx`)
- Paginated data table (50 rows per page)
- Column-specific filtering and global search
- CSV export with applied filters (max 10,000 rows)
- Statistics sidebar with row counts

## Pages & Routes

### Main Datasets Page (`/datasets`)
- Combined upload and dataset list interface
- Summary cards (ready, processing, errors, total rows)
- Tabbed interface switching between datasets and upload

### Dataset Detail Page (`/datasets/[id]`)
- Full data exploration with filtering and pagination
- URL-based filter state (shareable filtered views)
- Export functionality respecting current filters
- Back navigation to main datasets list

## Features & Capabilities

### Streaming Ingestion
- Processes large files (up to 100MB) without timeouts
- Batches of 500 rows processed in ~2-4 second chunks
- Resumable processing with batch tokens
- Real-time progress updates and error reporting

### Type System
- 7 supported data types with automatic inference
- Currency parsing (removes symbols, converts to number)
- Date/datetime parsing with multiple format support
- Boolean recognition (true/false, yes/no, 1/0)
- Null value handling per column

### Role Gating
- Dataset-level allowed_roles inherited by all rows
- RLS policies enforce tenant isolation
- Permission-based navigation visibility
- Role override during upload process

### Export & Filtering
- Server-side pagination and filtering
- JSONB column filtering with containment queries
- Text search across all columns
- CSV export with current filter state
- Capped exports (10,000 rows) for performance

## Error Handling

### Upload Errors
- File size validation (100MB limit)
- CSV format verification
- Storage upload failure graceful degradation
- Analysis errors with retry capability

### Processing Errors
- Malformed row detection and skipping
- Error count tracking and reporting
- Resume capability for interrupted ingestion
- Detailed error messages in dataset.error field

## Performance Considerations

### Batch Processing
- 500 rows per batch (tunable via `BATCH_SIZE`)
- Admin client for bulk inserts (bypasses RLS)
- Batch tokens for resumable processing
- Progress tracking with real-time updates

### Storage Strategy
- Supabase Storage for file persistence
- 7-day retention policy for uploaded files
- Separate bucket (`knowledge-files`) for CSV uploads
- Storage path pattern: `csv-uploads/{tenantId}/{timestamp}-{filename}`

### Database Optimization
- Indexes on tenant_id, dataset_id, status
- JSONB data column for flexible row storage
- RLS policies for security without performance impact
- Efficient pagination with range queries

## Manual QA Checklist

✅ **Big File Test**: Upload 25-50MB CSV, verify streaming ingestion completes
✅ **Type Mapping**: Override currency column to number, verify numeric storage
✅ **Role Gating**: Restrict dataset to admin-only, verify Support user cannot access
✅ **Resume Processing**: Close browser mid-ingestion, verify resumable on reload
✅ **Filtered Export**: Apply filters, export CSV, verify exported data matches filters
✅ **Error Handling**: Upload malformed CSV, verify error reporting and partial success
✅ **Performance**: Load 100k+ row dataset table in <1s with server-side pagination

## Integration Notes

### Navigation
- Added to main sidebar navigation with permission check
- Links appear only for users with `kb.csv.read` permission
- Consistent with existing knowledge base navigation patterns

### Tenant Context
- All operations properly scoped to current tenant
- Uses existing `x-tenant-slug` middleware pattern
- Integrates with existing role and permission system

### Audit Trail
- All operations logged to `audit_logs` table
- Actions: `kb.csv.begin`, `kb.csv.mapping.commit`, `kb.csv.ingest.batch`, `kb.csv.ingest.complete`
- Metadata includes row counts, file info, and error details

## Architecture Patterns

Follows existing SwiftMind patterns:
- Server Components + Server Actions (no route handlers)
- TanStack Query for client-side data management
- Tenant-scoped RLS with permission guards
- Admin client for bulk operations
- Streaming operations with progress tracking
- Role-based UI conditional rendering
