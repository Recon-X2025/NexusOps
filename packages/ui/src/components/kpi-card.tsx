import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "../utils";

export interface KPICardProps {
  label: string;
  value: string | number;
  /** Positive delta = increase (bad for "open incidents"), negative = decrease (good). Set `lowerIsBetter` to invert colouring. */
  delta?: number;
  /** Icon to render in top-left */
  icon?: React.ElementType;
  /** Tailwind colour class applied to the value text */
  color?: string;
  href?: string;
  className?: string;
  /** When true, a positive delta is shown green and negative is shown red */
  lowerIsBetter?: boolean;
  loading?: boolean;
  subtitle?: string;
}

export function KPICard({
  label,
  value,
  delta,
  icon: Icon,
  color = "text-foreground",
  href,
  className,
  lowerIsBetter = true,
  loading = false,
  subtitle,
}: KPICardProps) {
  const isGood = delta !== undefined ? (lowerIsBetter ? delta <= 0 : delta >= 0) : null;

  const content = (
    <div
      className={cn(
        "relative bg-card border border-border rounded-lg p-3 transition-shadow",
        href ? "hover:shadow-sm cursor-pointer" : "",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-1">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground/70" />}
        {delta !== undefined && (
          <span
            className={cn(
              "text-[10px] font-semibold flex items-center gap-0.5",
              isGood ? "text-green-600" : "text-red-600",
            )}
          >
            {isGood
              ? <TrendingDown className="w-3 h-3" />
              : <TrendingUp className="w-3 h-3" />}
            {Math.abs(delta)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-7 w-16 rounded bg-muted-foreground/15 animate-pulse mb-1" />
      ) : (
        <div className={cn("text-2xl font-bold leading-none", color)}>{value}</div>
      )}

      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</div>
      )}
    </div>
  );

  if (href) {
    return <a href={href} className="block no-underline">{content}</a>;
  }
  return content;
}
