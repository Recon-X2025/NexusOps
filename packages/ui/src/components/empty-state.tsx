import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "../utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4 gap-2" : "py-16 px-6 gap-3",
        className,
      )}
    >
      <div className={cn(
        "flex items-center justify-center rounded-full bg-muted",
        compact ? "h-10 w-10" : "h-14 w-14",
      )}>
        <Icon className={cn("text-muted-foreground", compact ? "h-5 w-5" : "h-7 w-7")} />
      </div>
      <div className="flex flex-col gap-1">
        <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
          {title}
        </p>
        {description && (
          <p className={cn("text-muted-foreground", compact ? "text-xs max-w-xs" : "text-sm max-w-sm")}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
