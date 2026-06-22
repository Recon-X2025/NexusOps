import * as React from "react";
import { cn } from "../utils";

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
  /** Show a heading skeleton row above the table */
  showHeader?: boolean;
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
  className,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-lg border border-border", className)}>
      <table className="w-full text-sm">
        {showHeader && (
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-3 py-2.5 text-left">
                  <div className="h-3 w-20 rounded bg-muted-foreground/20 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri} className="bg-card">
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci} className="px-3 py-2.5">
                  <div
                    className="h-3 rounded bg-muted-foreground/15 animate-pulse"
                    style={{ width: `${55 + ((ri * cols + ci) * 17) % 40}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
