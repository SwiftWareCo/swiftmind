"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft,
  Download, 
  Filter,
  Search,
  Database,
  Loader2,
  X
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DatasetDetail, DatasetRow, DatasetQueryOptions } from '@/server/csv/csv.data';

interface Props {
  dataset: DatasetDetail;
  rows: DatasetRow[];
  totalRows: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
  isLoading?: boolean;
  onBack: () => void;
  onPageChange: (page: number) => void;
  onFiltersChange: (options: DatasetQueryOptions) => void;
  onExport: (filters?: DatasetQueryOptions) => void;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
}

interface FilterState {
  search: string;
  columnFilters: Record<string, string>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export function DatasetDetailView({
  dataset,
  rows,
  totalRows,
  currentPage,
  pageSize,
  hasMore,
  isLoading,
  onBack,
  onPageChange,
  onFiltersChange,
  onExport,
  onLoadMore,
  isFetchingNextPage
}: Props) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    columnFilters: {},
    sortBy: 'id',
    sortOrder: 'asc'
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Scroll position persistence
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollPosition = useRef(0);

  // Update filters with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      const queryOptions: DatasetQueryOptions = {
        page: currentPage,
        limit: pageSize,
        search: filters.search || undefined,
        filters: Object.keys(filters.columnFilters).length > 0 ? filters.columnFilters : undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      };
      onFiltersChange(queryOptions);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters, currentPage, pageSize, onFiltersChange]);

  const updateFilter = useCallback((key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    // Reset to first page when filters change
    if (key !== 'sortBy' && key !== 'sortOrder') {
      onPageChange(1);
    }
  }, [onPageChange]);

  const updateColumnFilter = useCallback((column: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      columnFilters: value 
        ? { ...prev.columnFilters, [column]: value }
        : Object.fromEntries(Object.entries(prev.columnFilters).filter(([k]) => k !== column))
    }));
    onPageChange(1);
  }, [onPageChange]);

  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      columnFilters: {},
      sortBy: 'id',
      sortOrder: 'asc'
    });
    onPageChange(1);
  }, [onPageChange]);

  const hasActiveFilters = useMemo(() => {
    return filters.search || Object.keys(filters.columnFilters).length > 0;
  }, [filters]);

  // Save scroll position before loading more data
  const handleLoadMore = useCallback(() => {
    if (scrollContainerRef.current) {
      lastScrollPosition.current = scrollContainerRef.current.scrollTop;
    }
    onLoadMore?.();
  }, [onLoadMore]);

  // Restore scroll position after data loads
  useEffect(() => {
    if (lastScrollPosition.current > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = lastScrollPosition.current;
    }
  }, [rows.length]);



  const formatCellValue = (value: unknown, dataType: string) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">null</span>;
    }

    switch (dataType) {
      case 'boolean':
        return (
          <Badge variant={value ? 'default' : 'secondary'}>
            {value ? 'true' : 'false'}
          </Badge>
        );
      case 'date':
      case 'datetime':
        try {
          const dateValue = typeof value === 'string' || typeof value === 'number' ? value : String(value);
          return new Date(dateValue).toLocaleDateString();
        } catch {
          return String(value);
        }
      case 'currency':
        return typeof value === 'number' ? `$${value.toFixed(2)}` : String(value);
      case 'number':
      case 'integer':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      default:
        const str = String(value);
        return str.length > 100 ? (
          <span title={str}>{str.substring(0, 100)}...</span>
        ) : str;
    }
  };



  const renderColumnFilter = (column: { name: string; data_type: string }) => {
    const currentValue = filters.columnFilters[column.name] || '';

    if (column.data_type === 'boolean') {
      return (
        <Select
          value={currentValue}
          onValueChange={(value) => updateColumnFilter(column.name, value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        placeholder={`Filter ${column.name}...`}
        value={currentValue}
        onChange={(e) => updateColumnFilter(column.name, e.target.value)}
        className="h-8"
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Datasets
          </Button>
          
                     <div>
             <h1 className="text-2xl font-bold">{dataset.title}</h1>
             <p className="text-gray-600">{dataset.description || dataset.title}</p>
           </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport(hasActiveFilters ? {
              search: filters.search || undefined,
              filters: Object.keys(filters.columnFilters).length > 0 ? filters.columnFilters : undefined
            } : undefined)}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Dataset Info */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <Label className="text-gray-500">Status</Label>
            <div className="flex items-center space-x-2 mt-1">
              <Badge variant={dataset.status === 'ready' ? 'default' : 'secondary'}>
                {dataset.status}
              </Badge>
            </div>
          </div>
          
          <div>
            <Label className="text-gray-500">Total Rows</Label>
            <p className="font-medium">{dataset.rows_count?.toLocaleString() || 0}</p>
          </div>
          
          <div>
            <Label className="text-gray-500">Columns</Label>
            <p className="font-medium">{dataset.columns_count || 0}</p>
          </div>
          
          <div>
            <Label className="text-gray-500">File Size</Label>
            <p className="font-medium">
              {dataset.size_bytes ? `${(dataset.size_bytes / 1024 / 1024).toFixed(1)} MB` : '-'}
            </p>
          </div>
          
          <div>
            <Label className="text-gray-500">Access Roles</Label>
            <p className="font-medium">{dataset.allowed_roles?.length || 0} roles</p>
          </div>
          
          <div>
            <Label className="text-gray-500">Created</Label>
            <p className="font-medium">
              {formatDistanceToNow(new Date(dataset.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      </Card>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Filters</h3>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>

            {/* Global Search */}
            <div>
              <Label className="text-sm font-medium">Search all columns</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search across all data..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Separator />

            {/* Column Filters */}
            <div>
              <Label className="text-sm font-medium">Column Filters</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                {dataset.columns.map((column) => (
                  <div key={column.name}>
                    <Label className="text-xs text-gray-500">{column.name}</Label>
                    {renderColumnFilter(column)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Results Summary */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing filtered results ({totalRows.toLocaleString()} total matches)
          </span>
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Data Table */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400 mb-4" />
            <p>Loading data...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {hasActiveFilters ? 'No matching rows' : 'No data available'}
            </h3>
            <p className="text-gray-500">
              {hasActiveFilters 
                ? 'Try adjusting your filters'
                : 'This dataset appears to be empty'
              }
            </p>
          </div>
        ) : (
          <>
                         <ScrollArea className="w-full" ref={scrollContainerRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    {dataset.columns.map((column) => (
                      <TableHead key={column.name} className="min-w-32">
                        <div className="flex flex-col">
                          <span className="font-medium">{column.name}</span>
                          <span className="text-xs text-gray-500 font-normal">
                            {column.data_type}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                                             <TableCell className="font-mono text-sm">
                         {row.id}
                       </TableCell>
                      {dataset.columns.map((column) => (
                        <TableCell key={column.name} className="max-w-xs">
                          {formatCellValue(row.data[column.name], column.data_type)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Load More Button */}
            {hasMore && (
              <div className="border-t px-4 py-3 flex items-center justify-center">
                                 <Button
                   variant="outline"
                   size="sm"
                   onClick={handleLoadMore}
                   disabled={isFetchingNextPage}
                   className="flex items-center space-x-2"
                 >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More</span>
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {/* Row Count */}
            <div className="border-t px-4 py-2 text-center">
              <div className="text-sm text-gray-600">
                Showing {rows.length} of {totalRows.toLocaleString()} rows
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
