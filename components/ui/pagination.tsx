"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";

type Props = {
  page: number;
  pageCount: number;
  onPageChange: (nextPage: number) => void;
  isLoading?: boolean;
  className?: string;
};

export function PaginationControls({ page, pageCount, onPageChange, isLoading, className }: Props) {
  const canPrev = page > 1;
  const canNext = page < pageCount;
  return (
    <div className={cn("flex items-center justify-between text-sm", className)}>
      <div className="text-muted-foreground">Page {page} of {pageCount}{isLoading ? " • Loading…" : ""}</div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}


