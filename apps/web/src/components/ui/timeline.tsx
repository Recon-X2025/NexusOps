/**
 * Timeline — Standard activity timeline primitive
 *
 * Renders a vertical timeline of activity/event entries with a consistent
 * connector line, icon slot, and content slot.
 *
 * Usage:
 *   <Timeline
 *     items={activities.map(a => ({
 *       id: a.id,
 *       icon: MessageSquare,
 *       title: a.subject,
 *       subtitle: a.description,
 *       timestamp: a.createdAt,
 *       tags: [a.type, a.outcome].filter(Boolean),
 *     }))}
 *     emptyMessage="No activities logged yet."
 *   />
 */

import type { ElementType, ReactNode } from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineItem {
  id: string;
  /** Icon to display in the timeline node bubble */
  icon?: ElementType;
  /** Primary line */
  title: string;
  /** Optional secondary line */
  subtitle?: string;
  /** ISO date string or Date */
  timestamp?: string | Date;
  /** Small tag pills shown below the title */
  tags?: string[];
  /** Fully custom content, replaces title/subtitle/tags */
  children?: ReactNode;
}

interface TimelineProps {
  items: TimelineItem[] | undefined;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ElementType;
  className?: string;
  /** Header rendered above the timeline body */
  header?: ReactNode;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function TimelineNode({ item }: { item: TimelineItem }) {
  const Icon = item.icon ?? Activity;
  const ts = item.timestamp ? new Date(item.timestamp) : null;

  return (
    <div className="relative flex items-start gap-4">
      {/* Node bubble */}
      <div className="absolute left-0 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center z-10 shadow-sm">
        <Icon className="w-4 h-4 text-primary" />
      </div>

      {/* Content */}
      <div className="ml-12 pt-1 flex-1">
        {item.children ? (
          item.children
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
              {ts && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {ts.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.subtitle}</p>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {item.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase font-bold tracking-wider"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Timeline({
  items,
  isLoading,
  emptyMessage = "No entries yet.",
  emptyIcon: EmptyIcon = Activity,
  className,
  header,
}: TimelineProps) {
  const inner = (() => {
    if (isLoading) {
      return (
        <div className="space-y-4 p-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2 mt-1">
                <div className="h-3 bg-muted rounded w-2/3" />
                <div className="h-2 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (!items || items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <EmptyIcon className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className={cn(
        "relative space-y-6 p-5",
        "before:absolute before:inset-0 before:ml-5 before:-translate-x-px",
        "before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent",
      )}>
        {items.map((item) => (
          <TimelineNode key={item.id} item={item} />
        ))}
      </div>
    );
  })();

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden", className)}>
      {header && (
        <div className="px-5 py-4 border-b border-border">
          {header}
        </div>
      )}
      {inner}
    </div>
  );
}
