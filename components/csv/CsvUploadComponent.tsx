"use client";

import { useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MultiSelect } from '@/components/ui/multi-select';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Play } from 'lucide-react';
import { toast } from 'sonner';
import { beginCsvIngest, commitCsvMapping, streamCsvRows } from '@/server/csv/csv.actions';
import type { CsvColumn, CsvAnalysisResult } from '@/server/csv/csv.actions';

interface CsvUploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'mapping' | 'ingesting' | 'ready' | 'error';
  progress: number;
  error?: string;
  datasetId?: string;
  analysis?: CsvAnalysisResult;
  mapping?: {
    columns: CsvColumn[];
    treatFirstRowAsHeader: boolean;
    allowedRoles: string[];
  };
  batchToken?: string;
}

interface Props {
  tenantId: string;
  onComplete?: (datasetId: string) => void;
  availableRoles?: Array<{ key: string; name: string }>;
}

const DATA_TYPE_OPTIONS = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date/Time' },
  { value: 'currency', label: 'Currency' }
];

export function CsvUploadComponent({ onComplete, availableRoles = [] }: Props) {
  const [files, setFiles] = useState<CsvUploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.name.toLowerCase().endsWith('.csv')
    );
    
    if (droppedFiles.length === 0) {
      toast.error('Please drop CSV files only');
      return;
    }
    
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
      e.target.value = ''; // Reset input
    }
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    const csvFiles = newFiles.filter(file => file.name.toLowerCase().endsWith('.csv'));
    
    if (csvFiles.length !== newFiles.length) {
      toast.error('Only CSV files are supported');
    }
    
    const uploadFiles = csvFiles.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: 'pending' as const,
      progress: 0
    }));
    
    setFiles(prev => [...prev, ...uploadFiles]);
    
    // Start processing each file
    uploadFiles.forEach(uploadFile => {
      processFile(uploadFile);
    });
  }, []);

  const processFile = useCallback(async (uploadFile: CsvUploadFile) => {
    try {
      // Step 1: Begin ingestion and upload
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 10 }
          : f
      ));

      // Create FormData for direct processing (like UnifiedUploadComponent)
      const formData = new FormData();
      formData.append('file', uploadFile.file);

      const beginResult = await beginCsvIngest(formData);

      if (!beginResult.ok || !beginResult.datasetId || !beginResult.analysis) {
        throw new Error(beginResult.error || 'Failed to process CSV');
      }

      // Direct processing complete - skip to mapping step
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'mapping', 
              progress: 60,
              datasetId: beginResult.datasetId,
              analysis: beginResult.analysis,
              mapping: {
                columns: beginResult.analysis?.columns || [],
                treatFirstRowAsHeader: beginResult.analysis?.hasHeader || false,
                allowedRoles: ['admin'] // Default
              }
            }
          : f
      ));

    } catch (error) {
      console.error('File processing error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Processing failed'
            }
          : f
      ));
      toast.error(`Error processing ${uploadFile.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const commitMapping = useCallback(async (uploadFile: CsvUploadFile) => {
    if (!uploadFile.datasetId || !uploadFile.mapping) return;

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'ingesting', progress: 70 }
          : f
      ));

      // Commit the mapping
      const commitResult = await commitCsvMapping(
        uploadFile.datasetId,
        uploadFile.mapping,
        uploadFile.mapping.allowedRoles
      );

      if (!commitResult.ok) {
        throw new Error(commitResult.error || 'Failed to commit mapping');
      }

      // Start streaming ingestion
      await streamRows(uploadFile);

    } catch (error) {
      console.error('Mapping commit error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Mapping failed'
            }
          : f
      ));
      toast.error(`Error committing mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const streamRows = useCallback(async (uploadFile: CsvUploadFile, batchToken?: string) => {
    if (!uploadFile.datasetId) return;

    try {
      const streamResult = await streamCsvRows(uploadFile.datasetId, batchToken);

      if (!streamResult.ok) {
        throw new Error(streamResult.error || 'Streaming failed');
      }

      const progress = streamResult.total > 0 
        ? 70 + (streamResult.processed / streamResult.total) * 30 
        : 70;

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              progress,
              batchToken: streamResult.nextBatch
            }
          : f
      ));

      if (streamResult.isComplete) {
        // Ingestion complete
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'ready', progress: 100 }
            : f
        ));
        
        toast.success(`Successfully imported ${uploadFile.file.name}`);
        
        if (onComplete && uploadFile.datasetId) {
          onComplete(uploadFile.datasetId);
        }
      } else if (streamResult.nextBatch) {
        // Continue with next batch
        setTimeout(() => {
          streamRows(uploadFile, streamResult.nextBatch);
        }, 500); // Small delay between batches
      }

    } catch (error) {
      console.error('Streaming error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Ingestion failed'
            }
          : f
      ));
      toast.error(`Error during ingestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [onComplete]);

  const updateMapping = useCallback((fileId: string, updates: Partial<CsvUploadFile['mapping']>) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId && f.mapping
        ? { ...f, mapping: { ...f.mapping, ...updates } }
        : f
    ));
  }, []);

  const updateColumn = useCallback((fileId: string, columnIndex: number, updates: Partial<CsvColumn>) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId && f.mapping
        ? { 
            ...f, 
            mapping: {
              ...f.mapping,
              columns: f.mapping.columns.map((col, idx) => 
                idx === columnIndex ? { ...col, ...updates } : col
              )
            }
          }
        : f
    ));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const getStatusIcon = (status: CsvUploadFile['status']) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
      case 'analyzing':
      case 'ingesting':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: CsvUploadFile['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading...';
      case 'analyzing':
        return 'Analyzing...';
      case 'mapping':
        return 'Configure Mapping';
      case 'ingesting':
        return 'Importing Data...';
      case 'ready':
        return 'Complete';
      case 'error':
        return 'Error';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium mb-2">Upload CSV Files</h3>
        <p className="text-gray-600 mb-4">
          Drag and drop CSV files here, or click to select files
        </p>
                 <Button 
           onClick={() => fileInputRef.current?.click()}
         >
           Select Files
         </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Files</h3>
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              availableRoles={availableRoles}
              onRemove={() => removeFile(file.id)}
              onCommitMapping={() => commitMapping(file)}
              onUpdateMapping={(updates) => updateMapping(file.id, updates)}
              onUpdateColumn={(columnIndex, updates) => updateColumn(file.id, columnIndex, updates)}
              getStatusIcon={getStatusIcon}
              getStatusText={getStatusText}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileCardProps {
  file: CsvUploadFile;
  availableRoles: Array<{ key: string; name: string }>;
  onRemove: () => void;
  onCommitMapping: () => void;
  onUpdateMapping: (updates: Partial<CsvUploadFile['mapping']>) => void;
  onUpdateColumn: (columnIndex: number, updates: Partial<CsvColumn>) => void;
  getStatusIcon: (status: CsvUploadFile['status']) => React.ReactNode;
  getStatusText: (status: CsvUploadFile['status']) => string;
}

function FileCard({
  file,
  availableRoles,
  onRemove,
  onCommitMapping,
  onUpdateMapping,
  onUpdateColumn,
  getStatusIcon,
  getStatusText
}: FileCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {getStatusIcon(file.status)}
          <div>
            <p className="font-medium">{file.file.name}</p>
            <p className="text-sm text-gray-500">
              {(file.file.size / 1024 / 1024).toFixed(2)} MB • {getStatusText(file.status)}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={file.status === 'ingesting'}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress Bar */}
      {file.status !== 'pending' && file.status !== 'ready' && file.status !== 'error' && (
        <div className="mb-4">
          <Progress value={file.progress} className="h-2" />
          <p className="text-xs text-gray-500 mt-1">{file.progress}% complete</p>
        </div>
      )}

      {/* Error Display */}
      {file.status === 'error' && file.error && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{file.error}</AlertDescription>
        </Alert>
      )}

      {/* Mapping Interface */}
      {file.status === 'mapping' && file.mapping && file.analysis && (
        <MappingInterface
          analysis={file.analysis}
          mapping={file.mapping}
          availableRoles={availableRoles}
          onUpdateMapping={onUpdateMapping}
          onUpdateColumn={onUpdateColumn}
          onCommit={onCommitMapping}
        />
      )}
    </Card>
  );
}

interface MappingInterfaceProps {
  analysis: CsvAnalysisResult;
  mapping: CsvUploadFile['mapping'];
  availableRoles: Array<{ key: string; name: string }>;
  onUpdateMapping: (updates: Partial<CsvUploadFile['mapping']>) => void;
  onUpdateColumn: (columnIndex: number, updates: Partial<CsvColumn>) => void;
  onCommit: () => void;
}

function MappingInterface({
  analysis,
  mapping,
  availableRoles,
  onUpdateMapping,
  onUpdateColumn,
  onCommit
}: MappingInterfaceProps) {
  if (!mapping) return null;

  return (
    <div className="space-y-6 border-t pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium">Configure Data Mapping</h4>
        <Button onClick={onCommit} className="flex items-center space-x-2">
          <Play className="h-4 w-4" />
          <span>Import Data</span>
        </Button>
      </div>

      {/* Analysis Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <Label className="text-gray-500">Delimiter</Label>
          <p className="font-medium">{mapping.columns.length > 0 ? analysis.delimiter : 'Not detected'}</p>
        </div>
        <div>
          <Label className="text-gray-500">Total Rows</Label>
          <p className="font-medium">{analysis.totalRows.toLocaleString()}</p>
        </div>
        <div>
          <Label className="text-gray-500">Columns</Label>
          <p className="font-medium">{analysis.columns.length}</p>
        </div>
        <div>
          <Label className="text-gray-500">Has Header</Label>
          <p className="font-medium">{analysis.hasHeader ? 'Yes' : 'No'}</p>
        </div>
      </div>

      <Separator />

      {/* Global Settings */}
      <div className="space-y-4">
        <h5 className="font-medium">Import Settings</h5>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="header-row"
            checked={mapping.treatFirstRowAsHeader}
            onCheckedChange={(checked) => 
              onUpdateMapping({ treatFirstRowAsHeader: Boolean(checked) })
            }
          />
          <Label htmlFor="header-row">Treat first row as header</Label>
        </div>

        {availableRoles.length > 0 && (
          <div className="space-y-2">
            <Label>Access Roles</Label>
            <MultiSelect
              options={availableRoles.map(role => ({ value: role.key, label: role.name }))}
              value={mapping.allowedRoles}
              onValueChange={(roles) => onUpdateMapping({ allowedRoles: roles })}
              placeholder="Select roles..."
            />
          </div>
        )}
      </div>

      <Separator />

      {/* Column Mapping */}
      <div className="space-y-4">
        <h5 className="font-medium">Column Types</h5>
        
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {mapping.columns.map((column, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded">
              <div>
                <Label className="text-sm font-medium">{column.name}</Label>
                <p className="text-xs text-gray-500">
                  Examples: {column.examples.slice(0, 2).join(', ')}
                  {column.examples.length > 2 && '...'}
                </p>
              </div>
              
              <div>
                <Label className="text-xs text-gray-500">Data Type</Label>
                <Select
                  value={column.dataType}
                  onValueChange={(value) => 
                    onUpdateColumn(index, { dataType: value as CsvColumn['dataType'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`nullable-${index}`}
                  checked={column.isNullable}
                  onCheckedChange={(checked) => 
                    onUpdateColumn(index, { isNullable: Boolean(checked) })
                  }
                />
                <Label htmlFor={`nullable-${index}`} className="text-xs">
                  Allow null values
                </Label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
