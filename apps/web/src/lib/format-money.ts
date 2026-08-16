/**
 * Money formatting for financial statements.
 *
 * The 2026-08-16 parity audit (Sweep 3) recorded three competing idioms across
 * 12 files and no shared formatter: `toLocaleString("en-IN")` → `₹2,50,000`,
 * `(v/1000).toFixed(0)+"K"` → `₹250K`, and a local `fmtInr` in the accounting
 * and financial screens. The same 250,000 renders two ways on two tabs of one
 * page.
 *
 * This module does NOT try to unify all twelve — it is the formatter the
 * financial statements use, and the place to grow a shared one. For a balance
 * sheet or a P&L the abbreviating idiom is simply wrong: `₹250K` is not a
 * figure an accountant can tie back to a ledger, and rounding is not a display
 * choice on a statement that has to balance to the paisa. So: full figures,
 * Indian digit grouping, always two decimals.
 */

/** `1234567.5` → `₹12,34,567.50`. Negative → `-₹12,34,567.50`. */
export function formatStatementInr(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  // -0 renders as "-0" under ECMA-402; a statement line must not show "-₹0.00".
  const safe = n === 0 ? 0 : n;
  const sign = safe < 0 ? "-" : "";
  return `${sign}₹${Math.abs(safe).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The calendar-month period vocabulary the rest of finance already uses:
 * `YYYY-MM`, UTC boundaries — the same keys `financial.periodClose` stores in
 * `OrgSettings.financial.closedPeriods` and the same boundaries its `preflight`
 * computes with.
 */
export function monthKeyToday(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First instant of the `YYYY-MM` month, UTC. */
export function monthStart(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1, 0, 0, 0, 0));
}

/**
 * Last instant of the `YYYY-MM` month, UTC.
 *
 * Inclusive to the millisecond, because `journal_entries.date` is a timestamptz
 * and the statement filters are `lte`. An end bound of midnight on the last day
 * would silently drop anything stamped later that day.
 */
export function monthEnd(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0, 23, 59, 59, 999));
}

/** `2026-08` → `August 2026`. */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `2026-08-31T23:59:59.999Z` → `31 August 2026`. */
export function dateLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
