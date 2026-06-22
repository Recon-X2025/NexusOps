import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "../utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Show total item count alongside pages */
  totalItems?: number;
  pageSize?: number;
}

function pageRange(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", totalPages];
  if (page >= totalPages - 3) return [1, "…", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "…", page - 1, page, page + 1, "…", totalPages];
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  totalItems,
  pageSize,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageRange(page, totalPages);

  const startItem = pageSize ? (page - 1) * pageSize + 1 : undefined;
  const endItem   = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : undefined;

  return (
    <div className={cn("flex items-center justify-between gap-4 text-xs", className)}>
      {totalItems !== undefined ? (
        <span className="text-muted-foreground">
          {startItem && endItem
            ? `${startItem}–${endItem} of ${totalItems}`
            : `${totalItems} items`}
        </span>
      ) : (
        <span className="text-muted-foreground">Page {page} of {totalPages}</span>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="flex h-7 w-7 items-center justify-center text-muted-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex h-7 min-w-[1.75rem] items-center justify-center rounded border px-1.5 transition-colors",
                p === page
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border hover:bg-muted/50 text-foreground",
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
