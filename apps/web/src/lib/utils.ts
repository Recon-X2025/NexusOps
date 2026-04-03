import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Download an array of objects as a CSV file.
 * @param rows   Array of flat objects (values stringified automatically)
 * @param filename  Desired filename without extension
 * @param columns  Optional ordered column names; defaults to Object.keys(rows[0])
 */
export function downloadCSV(rows: Record<string, unknown>[], filename: string, columns?: string[]): void {
  if (!rows.length) {
    alert("No data to export.");
    return;
  }
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  };
  const csvContent = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function formatCurrency(amount: number | string, currency = "INR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(num);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-amber-600",
    low: "text-gray-500",
  };
  return map[priority.toLowerCase()] ?? "text-gray-500";
}

export function getStatusBadgeVariant(category: string): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "default",
    in_progress: "secondary",
    resolved: "outline",
    closed: "outline",
  };
  return map[category] ?? "default";
}
