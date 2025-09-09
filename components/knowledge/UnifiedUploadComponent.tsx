"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  X, 
  RotateCcw,
  Trash2 
} from "lucide-react";
import { formatBytes } from "@/lib/utils/utils";
import { toast } from "sonner";
import { CsvConfigurationModal } from "@/components/csv/CsvConfigurationModal";
import { createCsvAnalysisQueryOptions } from "@/lib/queryOptions/csvQueryOptions";
import { useQuery } from "@tanstack/react-query";

// Enhanced types for unified upload with CSV support
interface UploadFile {
  id: string;
  file: File;
  type: 'document' | 'csv';
  status: 'pending' | 'uploading' | 'processing' | 'ready_to_configure' | 'configuring' | 'done' | 'error' | 'canceled';
  step: 'queued' | 'uploading' | 'analyzing' | 'ready_to_configure' | 'configuring' | 'ingesting' | 'done' | 'error' | 'canceled';
  progress: number;
  error?: string;
  jobId?: string;
  datasetId?: string; // For CSV files
}

interface Props {
  tenantId: string;
}

export function UnifiedUploadComponent({ tenantId }: Props) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);
  const [configureModal, setConfigureModal] = useState<{ open: boolean; datasetId?: string; fileName?: string }>({
    open: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mark tenantId as used (for future features like batch tracking)
  console.log("Upload component for tenant:", tenantId);

  // Load any in-progress uploads on component mount
  useEffect(() => {
    const loadInProgressUploads = async () => {
      try {
        setIsLoadingProgress(true);
        
        // Check for pending CSV datasets
        const { listDatasets } = await import('@/server/csv/csv.data');
        const pendingCsvs = await listDatasets(tenantId);
        
        if (pendingCsvs && pendingCsvs.length > 0) {
          const recentPendingCsvs = pendingCsvs.filter((d: any) => 
            d.status === 'pending' && 
            d.created_at && 
            // Only show CSVs from last 2 hours to avoid clutter
            new Date(d.created_at).getTime() > Date.now() - (2 * 60 * 60 * 1000)
          );
          
          const csvUploadFiles: UploadFile[] = recentPendingCsvs.map((dataset: any) => ({
            id: dataset.id,
            file: new File([''], dataset.title + '.csv', { type: 'text/csv' }),
            type: 'csv' as const,
            status: 'ready_to_configure' as const,
            step: 'ready_to_configure' as const,
            progress: 100,
            datasetId: dataset.id
          }));
          
          setFiles(prev => [...prev, ...csvUploadFiles]);
        }
        
        // Check for in-progress document jobs
        const { getJobProgress } = await import('@/server/kb/kb.actions');
        // Note: We'd need to track job IDs in localStorage or similar to restore document progress
        // For now, document uploads that are interrupted will continue in background
        
      } catch (error) {
        console.error('Failed to load in-progress uploads:', error);
      } finally {
        setIsLoadingProgress(false);
      }
    };
    
    loadInProgressUploads();
  }, [tenantId]);

  // Process a single file - auto-detect document vs CSV
  const processFile = useCallback(async (uploadFile: UploadFile) => {
    try {
      // Update to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', step: 'uploading', progress: 10 }
          : f
      ));

      if (uploadFile.type === 'csv') {
        // Process CSV file
        const formData = new FormData();
        formData.append('file', uploadFile.file);
        formData.append('title', uploadFile.file.name.replace('.csv', ''));
        
        // Update to analyzing
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'processing', step: 'analyzing', progress: 30 }
            : f
        ));

        const { beginCsvIngest } = await import('@/server/csv/csv.actions');
        const result = await beginCsvIngest(formData);

        if (result.ok && result.datasetId) {
          // CSV analyzed successfully - ready for configuration
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { 
                  ...f, 
                  status: 'ready_to_configure', 
                  step: 'ready_to_configure', 
                  progress: 100,
                  datasetId: result.datasetId 
                }
              : f
          ));
          toast.success(`${uploadFile.file.name} analyzed successfully! Ready to configure column mappings.`);
        } else {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'error', step: 'error', error: result.error || 'CSV analysis failed' }
              : f
          ));
          toast.error(`Failed to analyze ${uploadFile.file.name}: ${result.error}`);
        }
      } else {
        // Process document file (existing logic)
        const formData = new FormData();
        formData.append('file', uploadFile.file);
        formData.append('allowed_roles', 'admin');

        // Simulate progress updates during upload
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id && f.status === 'uploading'
              ? { ...f, progress: Math.min(f.progress + 10, 90) }
              : f
          ));
        }, 500);

        const { uploadAndIngest } = await import('@/server/kb/kb.actions');
        const result = await uploadAndIngest(undefined, formData);
        
        clearInterval(progressInterval);

        if (result.ok) {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'done', step: 'done', progress: 100, jobId: result.jobId }
              : f
          ));
          toast.success(`${uploadFile.file.name} uploaded successfully! Default access: Admin only`);
        } else {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'error', step: 'error', error: result.error || 'Upload failed' }
              : f
          ));
          toast.error(`Failed to upload ${uploadFile.file.name}: ${result.error}`);
        }
      }
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error', step: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
          : f
      ));
      toast.error(`Error uploading ${uploadFile.file.name}`);
    }
  }, []);

  // Detect file type based on extension
  const detectFileType = (fileName: string): 'document' | 'csv' => {
    const extension = fileName.toLowerCase().split('.').pop();
    return extension === 'csv' ? 'csv' : 'document';
  };

  // Add files to queue with auto-detection
  const addFiles = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 15),
      file,
      type: detectFileType(file.name),
      status: 'pending',
      step: 'queued',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
    
    // Hybrid approach: 1-5 files = immediate processing, 6+ files = future background queue
    if (newFiles.length <= 5) {
      console.log(`📤 Processing ${newFiles.length} files immediately (≤5 files)`);
      // Start processing each file immediately
      uploadFiles.forEach(uploadFile => {
        processFile(uploadFile);
      });
    } else {
      console.log(`⏳ Queued ${newFiles.length} files for background processing (>5 files) - Feature coming soon!`);
      // For now, process immediately but show message about future background processing
      uploadFiles.forEach(uploadFile => {
        processFile(uploadFile);
      });
      toast.info(`Processing ${newFiles.length} files. Background processing for large batches coming soon!`);
    }
  }, [processFile]);

  // File operations
  const cancelFile = useCallback((fileId: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'canceled', step: 'canceled' }
        : f
    ));
  }, []);

  const retryFile = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      console.log(`🔄 Retrying file: ${file.file.name}`);
      const resetFile = { ...file, status: 'pending' as const, step: 'queued' as const, progress: 0, error: undefined };
      setFiles(prev => prev.map(f => f.id === fileId ? resetFile : f));
      await processFile(resetFile);
    }
  }, [files, processFile]);

  const removeFile = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    console.log(`🗑️ Removing file: ${fileId} (${file?.file.name})`);
    
    // If there's a job ID, delete from database
    if (file?.jobId) {
      try {
        console.log(`🗑️ Deleting job ${file.jobId} for file ${file.file.name}`);
        const { deleteIngestJob } = await import('@/server/kb/kb.actions');
        await deleteIngestJob(file.jobId);
        console.log(`✅ Successfully deleted job ${file.jobId} from database`);
      } catch (error) {
        console.error(`❌ Failed to delete job ${file.jobId}:`, error);
        // Continue with removal even if cleanup fails
      }
    }
    
    setFiles(prev => prev.filter(f => f.id !== fileId));
    toast.success(`Removed ${file?.file.name || 'file'} from queue`);
  }, [files]);

  const handleConfigureCsv = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || !file.datasetId) {
      toast.error('Dataset not found for configuration');
      return;
    }

    setConfigureModal({
      open: true,
      datasetId: file.datasetId,
      fileName: file.file.name
    });
  }, [files]);

  // Drag and drop handlers
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

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles);
      e.target.value = ''; // Reset input
    }
  }, [addFiles]);

  // Helper functions
  const getStepIcon = (step: UploadFile["step"]) => {
    switch (step) {
      case 'queued': return <Clock className="h-4 w-4" />;
      case 'uploading': return <Upload className="h-4 w-4" />;
      case 'analyzing': return <Upload className="h-4 w-4" />;
      case 'ready_to_configure': return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case 'configuring': return <Upload className="h-4 w-4" />;
      case 'ingesting': return <Upload className="h-4 w-4" />;
      case 'done': return <CheckCircle className="h-4 w-4" />;
      case 'error':
      case 'canceled': return <AlertCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStepLabel = (step: UploadFile["step"]) => {
    switch (step) {
      case 'queued': return 'Queued';
      case 'uploading': return 'Uploading';
      case 'analyzing': return 'Analyzing';
      case 'ready_to_configure': return 'Ready to Configure';
      case 'configuring': return 'Configuring';
      case 'ingesting': return 'Importing Data';
      case 'done': return 'Complete';
      case 'error': return 'Error';
      case 'canceled': return 'Canceled';
      default: return step;
    }
  };

  const getStatusColor = (status: UploadFile["status"]) => {
    switch (status) {
      case 'pending': return 'default';
      case 'uploading': return 'default';
      case 'processing': return 'default';
      case 'ready_to_configure': return 'secondary';
      case 'configuring': return 'default';
      case 'done': return 'default';
      case 'error': return 'destructive';
      case 'canceled': return 'secondary';
      default: return 'default';
    }
  };

  const summary = {
    total: files.length,
    done: files.filter(f => f.status === 'done').length,
    processing: files.filter(f => ['uploading', 'processing', 'configuring'].includes(f.status)).length,
    readyToConfigure: files.filter(f => f.status === 'ready_to_configure').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <Card className="h-fit max-h-[calc(95vh-12rem)] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Content
        </CardTitle>
        <CardDescription>
          Upload documents or CSV datasets. Documents get admin-only access by default (editable later). 
          CSV files will be analyzed and require column mapping configuration.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4 flex-1 overflow-hidden flex flex-col">
        {/* Upload Zone */}
        <div
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex-shrink-0
            ${isDragOver 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-muted-foreground/40'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <div className="space-y-2">
            <p className="text-base font-medium">
              Drop files here or click to select
            </p>
            <p className="text-sm text-muted-foreground">
              Supports documents (PDF, MD, HTML, TXT) and datasets (CSV) - max 50MB each<br/>
              CSV files will be analyzed for column mapping configuration
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.html,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Loading indicator for progress restoration */}
        {isLoadingProgress && (
          <div className="flex items-center justify-center py-4">
            <div className="text-sm text-muted-foreground">Loading previous uploads...</div>
          </div>
        )}

        {/* Upload Queue - appears below dotted lines */}
        {files.length > 0 && (
          <div
           className="space-y-4 border-t pt-4 flex flex-col min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between flex-shrink-0">
              <h3 className="font-medium">Upload Queue ({files.length} files)</h3>
              <div className="flex gap-2 text-sm">
                {summary.processing > 0 && (
                  <Badge variant="default">{summary.processing} processing</Badge>
                )}
                {summary.readyToConfigure > 0 && (
                  <Badge variant="secondary">{summary.readyToConfigure} ready to configure</Badge>
                )}
                {summary.done > 0 && (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {summary.done} done
                  </Badge>
                )}
                {summary.error > 0 && (
                  <Badge variant="destructive">{summary.error} errors</Badge>
                )}
              </div>
            </div>
            
            <ScrollArea className="flex-1 min-h-0 scrollbar-thin">
              <div className="space-y-3 pr-4">
                {files.map((file) => (
                  <Card key={file.id} className="transition-all p-2 hover:shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* File Info */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="mt-1">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          </div>
                          
                          <div className="flex-1 min-w-0 space-y-2">
                            {/* File name and size */}
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate" title={file.file.name}>
                                {file.file.name}
                              </span>
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatBytes(file.file.size)}
                              </span>
                            </div>

                            {/* Status and step */}
                            <div className="flex items-center gap-2">
                              <Badge variant={getStatusColor(file.status) as "default" | "destructive" | "secondary" | "outline"} className="gap-1">
                                {getStepIcon(file.step)}
                                {getStepLabel(file.step)}
                              </Badge>
                            </div>

                            {/* Progress bar for active uploads */}
                            {(file.status === 'uploading' || file.status === 'processing') && (
                              <div className="space-y-1">
                                <Progress value={file.progress} className="h-2" />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>{getStepLabel(file.step)}</span>
                                  <span>{Math.round(file.progress)}%</span>
                                </div>
                              </div>
                            )}

                            {/* Error message */}
                            {file.error && (
                              <div className="text-sm text-destructive">
                                {file.error}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {file.status === 'ready_to_configure' && file.type === 'csv' && (
                            <Button
                              onClick={() => handleConfigureCsv(file.id)}
                              variant="outline"
                              size="sm"
                              className="h-8 px-3"
                              title="Configure column mappings"
                            >
                              Configure
                            </Button>
                          )}
                          
                          {(file.status === 'uploading' || file.status === 'processing') && (
                            <Button
                              onClick={() => cancelFile(file.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {file.status === 'error' && (
                            <Button
                              onClick={() => retryFile(file.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Retry"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {(file.status === 'done' || file.status === 'error' || file.status === 'canceled' || file.status === 'ready_to_configure') && (
                            <Button
                              onClick={() => removeFile(file.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Remove from list"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
      
      {/* CSV Configuration Modal */}
      {configureModal.datasetId && (
        <CsvConfigurationModalWrapper
          isOpen={configureModal.open}
          onClose={() => setConfigureModal({ open: false })}
          datasetId={configureModal.datasetId}
          fileName={configureModal.fileName || 'CSV File'}
          tenantId={tenantId}
        />
      )}
    </Card>
  );
}

// Wrapper component to handle loading the CSV analysis data
function CsvConfigurationModalWrapper({
  isOpen,
  onClose,
  datasetId,
  fileName,
  tenantId
}: {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  fileName: string;
  tenantId: string;
}) {
  const { data: analysisResult, isLoading, error } = useQuery({
    ...createCsvAnalysisQueryOptions(datasetId),
    enabled: isOpen && !!datasetId
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <CsvConfigurationModal
        isOpen={isOpen}
        onClose={onClose}
        datasetId={datasetId}
        datasetTitle={`${fileName} (Loading...)`}
        tenantId={tenantId}
        initialColumns={[]}
      />
    );
  }

  if (error) {
    toast.error(`Failed to load CSV analysis: ${error.message}`);
    onClose();
    return null;
  }

  return (
    <CsvConfigurationModal
      isOpen={isOpen}
      onClose={onClose}
      datasetId={datasetId}
      datasetTitle={fileName}
      tenantId={tenantId}
      initialColumns={analysisResult?.analysis?.columns || []}
    />
  );
}
