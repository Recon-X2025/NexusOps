import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";

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
    toast.error("No data to export.");
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

/**
 * Result shape returned by the `payroll.exportBankFile` tRPC mutation.
 * `contentBase64` is the bank file body base64-encoded on the server; the other
 * fields report what actually went into (and got left out of) the file.
 */
export interface BankFileExport {
  filename: string;
  contentBase64: string;
  byteLength: number;
  recordCount: number;
  totalAmount: number;
  skipped: Array<{ employeeId: string; reason: string }>;
}

/**
 * Decode a base64 string to a Uint8Array of raw bytes (browser `atob`).
 * Kept separate so it is unit-testable without the DOM download machinery.
 */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Allocate over an explicit ArrayBuffer so the element type is Uint8Array<ArrayBuffer>
  // (a valid BlobPart) rather than the wider Uint8Array<ArrayBufferLike>.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Download a bank-disbursement file returned by `payroll.exportBankFile`.
 *
 * This deliberately does three things the naive `new Blob([contentBase64])`
 * handler did NOT:
 *  1. **Decodes the base64** so the saved file is the real bank file, not the
 *     base64 text of it.
 *  2. **Refuses a zero-record file** — a header-only file that looks like a
 *     successful export is worse than an error, so we surface an error and
 *     download nothing.
 *  3. **Surfaces the outcome**: "N paid" (with total), and every skipped
 *     employee with the reason, so the user sees who was left out and why
 *     before/alongside the download.
 *
 * @returns `true` if a file was downloaded, `false` if the download was refused.
 */
export function downloadBankFile(data: BankFileExport): boolean {
  const skippedCount = data.skipped.length;

  // (3) Refuse a header-only file. Report the skipped reasons so the user knows
  // why nothing was payable.
  if (data.recordCount === 0) {
    const detail = skippedCount
      ? ` ${skippedCount} employee${skippedCount === 1 ? "" : "s"} skipped: ` +
        data.skipped.map((s) => `${s.employeeId} — ${s.reason}`).join("; ")
      : "";
    toast.error(`No payable records — bank file not generated.${detail}`);
    return false;
  }

  // (2) Surface the outcome. Always show what was paid; if anyone was skipped,
  // list them with reasons as a warning so it is not silently dropped.
  const paidMsg =
    `${data.recordCount} paid (${formatCurrency(data.totalAmount, "INR")})` +
    (skippedCount ? `, ${skippedCount} skipped` : "");
  if (skippedCount) {
    toast.warning(
      `${paidMsg}. Skipped: ` +
        data.skipped.map((s) => `${s.employeeId} — ${s.reason}`).join("; "),
    );
  } else {
    toast.success(paidMsg);
  }

  // (1) Decode the base64 body before building the Blob.
  const bytes = base64ToBytes(data.contentBase64);
  const blob = new Blob([bytes], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
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

/**
 * Rupees with Indian digit grouping and no paise — `₹16,00,00,000`, `₹1,00,000`.
 * The single source of truth for whole-rupee display on the procurement/finance
 * dashboards, which previously hand-rolled abbreviations like `₹160000K` (divide-by-1000
 * + "K", which never actually abbreviates) and `₹0.1Cr`, and pasted `₹${…}` template
 * literals into JSX so a stray `$` printed (`₹$1L`). Route those call sites through this.
 */
export function formatInr(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const safe = Number.isFinite(num as number) ? (num as number) : 0;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(safe)}`;
}

/**
 * English pluralisation for the account-type filter chips, which pluralised by appending a
 * bare `s` (`liability` → `LIABILITYS`, `income` → `INCOMES`). Applies the consonant-`y` → `ies`
 * rule; everything else takes `s`. `liability`→`liabilities`, `income`→`incomes`, `asset`→`assets`.
 */
export function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
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
