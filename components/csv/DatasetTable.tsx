"use client";

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { 
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Database,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DatasetListItem } from '@/server/csv/csv.data';

interface Props {
  datasets: DatasetListItem[];
  onView?: (datasetId: string) => void;
  deleteMutation?: {
    mutate: (datasetId: string) => void;
    isPending: boolean;
  };
}

type SortField = 'title' | 'created_at' | 'rows_count' | 'status';
type SortOrder = 'asc' | 'desc';

export function DatasetTable({ datasets, onView, deleteMutation }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const filteredAndSortedDatasets = useMemo(() => {
    let filtered = datasets;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(dataset =>
            dataset.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            dataset.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(dataset => dataset.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number | null = a[sortField];
      let bValue: string | number | null = b[sortField];

      // Handle null values
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortOrder === 'asc' ? -1 : 1;
      if (bValue === null) return sortOrder === 'asc' ? 1 : -1;

      // Convert to comparable types
      if (sortField === 'created_at') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [datasets, searchTerm, statusFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
      case 'analyzing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      ready: 'default',
      pending: 'secondary',
      analyzing: 'secondary',
      error: 'destructive'
    };

    return (
      <Badge variant={variants[status] || 'outline'} className="flex items-center space-x-1">
        {getStatusIcon(status)}
        <span className="capitalize">{status}</span>
      </Badge>
    );
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatRowCount = (count: number | null) => {
    if (!count) return '-';
    return count.toLocaleString();
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(field)}
      className="h-auto p-0 font-medium hover:bg-transparent"
    >
      <span className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortOrder === 'asc' ? 
            <SortAsc className="h-3 w-3" /> : 
            <SortDesc className="h-3 w-3" />
        )}
      </span>
    </Button>
  );


  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search datasets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="analyzing">Analyzing</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Showing {filteredAndSortedDatasets.length} of {datasets.length} datasets
        </span>
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchTerm('')}
          >
            Clear search
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        {filteredAndSortedDatasets.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No matching datasets' : 'No datasets yet'}
            </h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Upload your first CSV file to get started'
              }
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>
                  <SortButton field="title">Dataset</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="status">Status</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="rows_count">Rows</SortButton>
                </TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>
                  <SortButton field="created_at">Created</SortButton>
                </TableHead>
                <TableHead className="w-24">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedDatasets.map((dataset) => (
                <TableRow 
                  key={dataset.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onView?.(dataset.id)}
                >
                  <TableCell>
                    <Database className="h-4 w-4 text-gray-500" />
                  </TableCell>
                  
                  <TableCell>
                    <div>
                      <p className="font-medium">{dataset.title}</p>
                      <p className="text-sm text-gray-500">{dataset.description}</p>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {getStatusBadge(dataset.status)}
                  </TableCell>
                  
                  <TableCell className="text-right">
                    <div>
                      <p className="font-medium">{formatRowCount(dataset.rows_count)}</p>
                      {dataset.columns_count && (
                        <p className="text-sm text-gray-500">
                          {dataset.columns_count} columns
                        </p>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-right">
                    {formatFileSize(dataset.size_bytes)}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Users className="h-3 w-3 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {dataset.allowed_roles?.length || 0} roles
                      </span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div>
                      <p className="text-sm">
                        {formatDistanceToNow(new Date(dataset.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </TableCell>
                  
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {deleteMutation && (
                      <DeleteButton
                        size="sm"
                        label="Delete"
                        disabled={deleteMutation?.isPending}
                        title="Delete Dataset"
                        description={`Are you sure you want to delete "${dataset.title}"? This action cannot be undone and will permanently remove all data.`}
                        onConfirm={async () => {
                          deleteMutation?.mutate(dataset.id);
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
