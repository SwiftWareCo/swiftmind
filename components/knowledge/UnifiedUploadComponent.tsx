"use client";

import { useCallback, useRef, useState } from "react";
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

// Simplified types for unified upload
interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error' | 'canceled';
  step: 'queued' | 'uploading' | 'done' | 'error' | 'canceled';
  progress: number;
  error?: string;
  jobId?: string;
}

interface Props {
  tenantId: string;
}

export function UnifiedUploadComponent({ tenantId }: Props) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mark tenantId as used (for future features like batch tracking)
  console.log("Upload component for tenant:", tenantId);

  // Process a single file using the working uploadAndIngest logic
  const processFile = useCallback(async (uploadFile: UploadFile) => {
    try {

      
      // Update to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', step: 'uploading', progress: 10 }
          : f
      ));

      // Create FormData like the working uploadAndIngest function expects
      const formData = new FormData();
      formData.append('file', uploadFile.file);
      // Default to admin only for security - users can change roles after upload
      formData.append('allowed_roles', 'admin');

      // Call the working upload function
      const { uploadAndIngest } = await import('@/server/kb/kb.actions');
      
      // Simulate progress updates during upload
      const progressInterval = setInterval(() => {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id && f.status === 'uploading'
            ? { ...f, progress: Math.min(f.progress + 10, 90) }
            : f
        ));
      }, 500);

      const result = await uploadAndIngest(undefined, formData);
      
      clearInterval(progressInterval);

      if (result.ok) {
        // Store jobId for potential future use (retry, delete, etc.)
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

    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error', step: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
          : f
      ));
      toast.error(`Error uploading ${uploadFile.file.name}`);
    }
  }, []);

  // Add files to queue with hybrid approach
  const addFiles = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 15),
      file,
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
      case 'done': return <CheckCircle className="h-4 w-4" />;
      case 'error':
      case 'canceled': return <AlertCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStepLabel = (step: UploadFile["step"]) => {
    switch (step) {
      case 'queued': return 'Queued';
      case 'uploading': return 'Processing';
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
      case 'done': return 'default';
      case 'error': return 'destructive';
      case 'canceled': return 'secondary';
      default: return 'default';
    }
  };

  const summary = {
    total: files.length,
    done: files.filter(f => f.status === 'done').length,
    processing: files.filter(f => f.status === 'uploading' || f.status === 'processing').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <Card className="h-fit max-h-[calc(95vh-12rem)] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Documents
        </CardTitle>
        <CardDescription>
          Drop files here or click to select. Files are uploaded with admin-only access by default. 
          You can edit roles after upload in Browse Documents.
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
              Supports PDF, Markdown, HTML, and TXT files (max 20MB each)<br/>
              Files persist across page refreshes during upload
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.html"
          className="hidden"
          onChange={handleFileSelect}
        />

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
                          
                          {(file.status === 'done' || file.status === 'error' || file.status === 'canceled') && (
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
    </Card>
  );
}
