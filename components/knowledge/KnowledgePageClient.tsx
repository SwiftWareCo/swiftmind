"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Database, Settings } from "lucide-react";
import { toast } from "sonner";
import { UnifiedUploadComponent } from "@/components/knowledge/UnifiedUploadComponent";
import { KnowledgeTable } from "@/components/knowledge/KnowledgeTable";
import { DatasetTable } from "@/components/csv/DatasetTable";
import { createDatasetsListQueryOptions, createDeleteDatasetMutation, csvDatasetKeys, createCsvAnalysisQueryOptions } from "@/lib/queryOptions/csvQueryOptions";
import { CsvConfigurationModal } from "@/components/csv/CsvConfigurationModal";

interface Props {
  tenantId: string;
  canWrite?: boolean;
}

export function KnowledgePageClient({ tenantId, canWrite = false }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("upload");
  const [configureModal, setConfigureModal] = useState<{ open: boolean; datasetId?: string; title?: string }>({
    open: false
  });
  
  // Use TanStack Query for datasets - no polling needed, let natural staleness handle updates
  const { data: datasets = [] } = useQuery({
    ...createDatasetsListQueryOptions(tenantId)
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...createDeleteDatasetMutation(),
    onSuccess: () => {
      toast.success('Dataset deleted successfully');
      queryClient.invalidateQueries({ queryKey: csvDatasetKeys.list(tenantId) });
    },
    onError: (error) => {
      console.error('Delete dataset error:', error);
      toast.error(`Failed to delete dataset: ${error.message}`);
    },
  });
  
  // Dataset handlers
  const handleViewDataset = (datasetId: string) => {
    router.push(`/knowledge/datasets/${datasetId}`);
  };
  
  const handleConfigureDataset = (datasetId: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    setConfigureModal({
      open: true,
      datasetId,
      title: dataset.title
    });
  };
  
  // Get pending CSV configuration count
  const pendingDatasets = datasets.filter(d => d.status === 'pending');
  const pendingConfigCount = pendingDatasets.length;

  return (
    <div className="container mx-auto  space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Knowledge</h1>
        <p className="text-gray-600">
          Upload documents and datasets, manage your knowledge base, and configure data processing.
        </p>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload" className="flex items-center space-x-2">
            <Upload className="h-4 w-4" />
            <span>Upload</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>Documents</span>
          </TabsTrigger>
          <TabsTrigger value="datasets" className="flex items-center space-x-2">
            <Database className="h-4 w-4" />
            <span>Datasets</span>
          </TabsTrigger>
          <TabsTrigger value="configure" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Configure</span>
            {pendingConfigCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pendingConfigCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <UnifiedUploadComponent tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <KnowledgeTable tenantId={tenantId} canWrite={canWrite} />
        </TabsContent>

         <TabsContent value="datasets" className="space-y-6">
           <DatasetTable
             datasets={datasets}
             onView={handleViewDataset}
             deleteMutation={canWrite ? deleteMutation : undefined}
           />
         </TabsContent>

        <TabsContent value="configure" className="space-y-6">
          {pendingDatasets.length === 0 ? (
            <div className="text-center py-8">
              <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Pending Configurations
              </h3>
              <p className="text-gray-500">
                All your CSV files are configured. Upload new CSV files to see them here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Pending CSV Configurations</h3>
                  <p className="text-sm text-muted-foreground">
                    {pendingConfigCount} CSV file{pendingConfigCount !== 1 ? 's' : ''} waiting for column mapping configuration
                  </p>
                </div>
                <Badge variant="secondary">
                  {pendingConfigCount} pending
                </Badge>
              </div>
              
              <div className="grid gap-4">
                {pendingDatasets.map((dataset) => (
                  <div key={dataset.id} className="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-medium">{dataset.title}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{((dataset.size_bytes || 0) / 1024 / 1024).toFixed(1)} MB</span>
                          <span>Uploaded {new Date(dataset.created_at).toLocaleDateString()}</span>
                          {dataset.created_at && (
                            <span className="text-xs">
                              {Math.round((Date.now() - new Date(dataset.created_at).getTime()) / (1000 * 60 * 60))}h ago
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">
                          Ready to Configure
                        </Badge>
                        <Button
                          onClick={() => handleConfigureDataset(dataset.id)}
                          variant="default"
                          size="sm"
                        >
                          Configure
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-muted rounded-full p-1">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-medium text-foreground">Configuration Required</h4>
                    <p className="text-sm text-muted-foreground">
                      These CSV files need column mapping configuration before they can be used. 
                      Click &quot;Configure&quot; to set up data types and column mappings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* CSV Configuration Modal */}
      {configureModal.datasetId && (
        <CsvConfigurationModalWrapper
          isOpen={configureModal.open}
          onClose={() => setConfigureModal({ open: false })}
          datasetId={configureModal.datasetId}
          datasetTitle={configureModal.title || 'Unknown Dataset'}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}

// Wrapper component to handle loading the CSV analysis data
function CsvConfigurationModalWrapper({
  isOpen,
  onClose,
  datasetId,
  datasetTitle,
  tenantId
}: {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  datasetTitle: string;
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
        datasetTitle={`${datasetTitle} (Loading...)`}
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
      datasetTitle={datasetTitle}
      tenantId={tenantId}
      initialColumns={analysisResult?.analysis?.columns || []}
    />
  );
}
