/**
 * DetailGrid — Standard key/value info grid primitive
 *
 * Renders a list of labeled fields in a consistent card layout.
 * Used for detail sidebar panels (Account Details, Deal Financials, etc.)
 *
 * Usage:
 *   <DetailGrid
 *     title="Account Details"
 *     fields={[
 *       { label: "Website", icon: Globe, value: account.website, href: account.website },
 *       { label: "Employees", icon: Users, value: account.employees?.toLocaleString() ?? "—" },
 *     ]}
 *   />
 */

import type { ElementType, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Field Types ──────────────────────────────────────────────────────────────

interface BaseField {
  label: string;
  icon?: ElementType;
  className?: string;
}

interface TextFieldDef extends BaseField {
  type?: "text";
  value: ReactNode;
  href?: string;
}

interface ProgressFieldDef extends BaseField {
  type: "progress";
  value: number; // 0–100
  color?: "green" | "yellow" | "red" | "blue";
}

interface BadgeFieldDef extends BaseField {
  type: "badge";
  value: string;
  badgeClassName?: string;
}

export type FieldDef = TextFieldDef | ProgressFieldDef | BadgeFieldDef;

// ─── Props ────────────────────────────────────────────────────────────────────

interface DetailGridProps {
  title?: string;
  icon?: ElementType;
  items?: FieldDef[];
  fields?: FieldDef[];
  className?: string;
  footer?: ReactNode;
}

// ─── Field Renderers ──────────────────────────────────────────────────────────

function ProgressValue({ field }: { field: ProgressFieldDef }) {
  const colorMap = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
  };
  const auto = field.value >= 80 ? "green" : field.value >= 60 ? "yellow" : "red";
  const barColor = colorMap[field.color ?? auto];

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${field.value}%` }} />
      </div>
      <span className="text-sm font-bold">{field.value}</span>
    </div>
  );
}

function FieldRow({ field }: { field: FieldDef }) {
  const Icon = field.icon;

  const label = (
    <span className="text-sm text-muted-foreground flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {field.label}
    </span>
  );

  let valueNode: ReactNode;

  if (field.type === "progress") {
    valueNode = <ProgressValue field={field} />;
  } else if (field.type === "badge") {
    valueNode = (
      <span className={cn(
        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
        field.badgeClassName ?? "bg-muted text-muted-foreground",
      )}>
        {field.value}
      </span>
    );
  } else {
    const tf = field as TextFieldDef;
    valueNode = tf.href ? (
      <a
        href={tf.href}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-primary hover:underline flex items-center gap-1"
      >
        {tf.value} <ExternalLink className="w-3 h-3" />
      </a>
    ) : (
      <span className={cn("text-sm font-medium text-foreground", field.className)}>{tf.value}</span>
    );
  }

  return (
    <div className="flex items-center justify-between py-0.5">
      {label}
      {valueNode}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DetailGrid({ title, icon: Icon, items, fields, className, footer }: DetailGridProps) {
  const displayFields = items ?? fields ?? [];

  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", className)}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {title}
          </h3>
        </div>
      )}
      <div className="space-y-3">
        {displayFields.map((f, i) => (
          <FieldRow key={i} field={f} />
        ))}
      </div>
      {footer && <div className="mt-4 pt-4 border-t border-border">{footer}</div>}
    </div>
  );
}
