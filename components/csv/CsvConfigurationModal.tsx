"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Database, Type, Hash, Calendar, DollarSign, ToggleLeft, Search } from "lucide-react";
import type { CsvColumn } from "@/server/csv/csv.actions";
import { createCompleteCSVWorkflowMutation } from "@/lib/queryOptions/csvQueryOptions";
import { csvDatasetKeys } from "@/lib/queryOptions/csvQueryOptions";

const DATA_TYPE_OPTIONS = [
  { value: 'string' as const, label: 'Text', icon: Type, description: 'Any text or alphanumeric data' },
  { value: 'number' as const, label: 'Number', icon: Hash, description: 'Decimal numbers (e.g., 3.14, 42.5)' },
  { value: 'integer' as const, label: 'Integer', icon: Hash, description: 'Whole numbers only (e.g., 1, 2, 100)' },
  { value: 'boolean' as const, label: 'Boolean', icon: ToggleLeft, description: 'True/false values' },
  { value: 'date' as const, label: 'Date', icon: Calendar, description: 'Date only (e.g., 2024-01-01)' },
  { value: 'datetime' as const, label: 'Date & Time', icon: Calendar, description: 'Date and time (e.g., 2024-01-01 14:30)' },
  { value: 'currency' as const, label: 'Currency', icon: DollarSign, description: 'Monetary values (e.g., $12.34)' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  datasetTitle: string;
  tenantId: string;
  initialColumns?: CsvColumn[];
}

export function CsvConfigurationModal({
  isOpen,
  onClose,
  datasetId,
  datasetTitle,
  tenantId,
  initialColumns = []
}: Props) {
  const queryClient = useQueryClient();
  const [columns, setColumns] = useState<CsvColumn[]>(initialColumns);
  const [treatFirstRowAsHeader, setTreatFirstRowAsHeader] = useState(true);

  // Reset columns when modal opens with new data
  useEffect(() => {
    if (isOpen && initialColumns.length > 0) {
      setColumns(initialColumns);
    }
  }, [isOpen, initialColumns]);

  const workflowMutation = useMutation({
    ...createCompleteCSVWorkflowMutation(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: csvDatasetKeys.list(tenantId) });
      toast.success(`${datasetTitle} configured and processed successfully! All ${columns.length} columns and data rows are now ready to use.`);
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to process ${datasetTitle}: ${error.message}`);
    },
  });

  const handleColumnChange = (index: number, field: keyof CsvColumn, value: any) => {
    setColumns(prev => prev.map((col, i) => 
      i === index ? { ...col, [field]: value } : col
    ));
  };

  const handleSubmit = () => {
    if (columns.length === 0) {
      toast.error('No columns to configure');
      return;
    }

    // Show processing toast since this will take longer now
    toast.info(`Starting to process ${datasetTitle}... This may take a few moments.`);

    workflowMutation.mutate({
      datasetId,
      mapping: {
        columns,
        treatFirstRowAsHeader
      }
    });
  };

  const getDataTypeInfo = (dataType: CsvColumn['dataType']) => {
    return DATA_TYPE_OPTIONS.find(option => option.value === dataType);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Database className="h-5 w-5" />
            Configure CSV Dataset
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure column types and settings for <span className="font-medium text-slate-300">{datasetTitle}</span>.
            Review the auto-detected data types and adjust as needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Options */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="treat-header"
                checked={treatFirstRowAsHeader}
                onCheckedChange={setTreatFirstRowAsHeader}
                className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
              <Label htmlFor="treat-header" className="text-slate-300">
                First row contains column headers
              </Label>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Check this if your CSV file&apos;s first row contains column names instead of data.
            </p>
          </div>

          {/* Column Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <Type className="h-4 w-4" />
              Column Configuration ({columns.length} columns)
            </h3>
            
            <ScrollArea className="h-96 rounded-md border border-slate-700 bg-slate-800/30">
              <div className="space-y-1 p-4">
                {columns.map((column, index) => {
                  const dataTypeInfo = getDataTypeInfo(column.dataType);
                  const IconComponent = dataTypeInfo?.icon || Type;
                  
                  return (
                    <div
                      key={index}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 space-y-3"
                    >
                      {/* Column Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-medium text-slate-200 flex items-center gap-2">
                            <IconComponent className="h-4 w-4" />
                            {column.name}
                          </h4>
                          {column.examples.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-slate-500">Examples:</span>
                              {column.examples.slice(0, 3).map((example, i) => (
                                <Badge key={i} variant="outline" className="text-xs border-slate-600 text-slate-400">
                                  {example.length > 20 ? `${example.slice(0, 20)}...` : example}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="bg-slate-700 text-slate-300 border-slate-600"
                        >
                          Column {index + 1}
                        </Badge>
                      </div>

                      {/* Configuration Options */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Data Type */}
                        <div className="space-y-2">
                          <Label className="text-sm text-slate-300">Data Type</Label>
                          <Select
                            value={column.dataType}
                            onValueChange={(value) => handleColumnChange(index, 'dataType', value)}
                          >
                            <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {DATA_TYPE_OPTIONS.map((option) => {
                                const Icon = option.icon;
                                return (
                                  <SelectItem 
                                    key={option.value} 
                                    value={option.value}
                                    className="text-slate-200 focus:bg-slate-700"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Icon className="h-4 w-4" />
                                      <span>{option.label}</span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {dataTypeInfo && (
                            <p className="text-xs text-slate-500">{dataTypeInfo.description}</p>
                          )}
                        </div>

                        {/* Nullable */}
                        <div className="space-y-2">
                          <Label className="text-sm text-slate-300">Options</Label>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`nullable-${index}`}
                                checked={column.isNullable}
                                onCheckedChange={(checked) => handleColumnChange(index, 'isNullable', checked)}
                                className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                              <Label htmlFor={`nullable-${index}`} className="text-xs text-slate-300">
                                Allow empty values
                              </Label>
                            </div>
                          </div>
                        </div>

                        {/* Indexing */}
                        <div className="space-y-2">
                          <Label className="text-sm text-slate-300">Performance</Label>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`indexed-${index}`}
                                checked={!!(column.metadata as any)?.isIndexed}
                                onCheckedChange={(checked) => 
                                  handleColumnChange(index, 'metadata', { 
                                    ...column.metadata, 
                                    isIndexed: checked 
                                  })
                                }
                                className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                              <Label htmlFor={`indexed-${index}`} className="text-xs text-slate-300 flex items-center gap-1">
                                <Search className="h-3 w-3" />
                                Enable search indexing
                              </Label>
                            </div>
                            <p className="text-xs text-slate-500">
                              Improves search performance for this column
                            </p>
                          </div>
                        </div>
                      </div>

                      {index < columns.length - 1 && (
                        <Separator className="bg-slate-700/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-700 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={workflowMutation.isPending}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={workflowMutation.isPending || columns.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {workflowMutation.isPending ? 'Processing Data...' : 'Configure & Process Dataset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
