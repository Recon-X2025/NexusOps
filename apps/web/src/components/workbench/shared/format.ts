/** Shared display formatters used by workbench primary visuals + panels. */

export function formatRelativeMs(ms: number | null): string {
  if (ms == null) return "—";
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const m = Math.floor(abs / 60_000);
  if (m < 60) return `${sign}${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return `${sign}${h}h ${rem}m`;
  const d = Math.floor(h / 24);
  return `${sign}${d}d ${h % 24}h`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat().format(num);
}
