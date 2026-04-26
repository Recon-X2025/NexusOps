import type { MetricDirection, MetricResolveCtx, MetricValue } from "./types";

/** Empty metric value — used when an underlying source has no data. */
export function emptyMetricValue(state: MetricValue["state"] = "no_data"): MetricValue {
  return {
    current: 0,
    series: [],
    state,
    lastUpdated: new Date(),
  };
}

/** Parse rows from `db.execute(sql\`...\`)` (postgres driver returns an array of column-shaped objects). */
export function seriesFromExecuteRows(
  rows: unknown,
  labelKey: string,
  valueKey: string,
): MetricValue["series"] {
  const list: unknown[] =
    rows == null
      ? []
      : Array.isArray(rows)
        ? rows
        : typeof (rows as { [Symbol.iterator]?: unknown })?.[Symbol.iterator] === "function"
          ? [...(rows as Iterable<unknown>)]
          : [];
  if (list.length === 0) return [];
  const out: MetricValue["series"] = [];
  for (const row of list as Record<string, unknown>[]) {
    const t = row[labelKey];
    const v = row[valueKey];
    if (typeof t !== "string") continue;
    const n = typeof v === "number" ? v : Number(v ?? 0);
    out.push({ t, v: Number.isFinite(n) ? n : 0 });
  }
  return out;
}

export function deriveStateFromTarget(
  current: number,
  target: number | undefined,
  direction: MetricDirection,
): MetricValue["state"] {
  if (target === undefined || Number.isNaN(target)) return "healthy";
  if (direction === "higher_is_better") {
    if (current >= target) return "healthy";
    if (current >= target * 0.85) return "watch";
    return "stressed";
  }
  if (current <= target) return "healthy";
  if (current <= target * 1.15) return "watch";
  return "stressed";
}

/** Bucket descriptor produced by {@link buildTimeBuckets}. */
export interface TimeBucket {
  /** ISO date string (YYYY-MM-DD) for the bucket start — used to join against `DATE_TRUNC` results. */
  key: string;
  /** Human-readable axis label, e.g. "Mar 4". */
  label: string;
  /** Inclusive bucket start. */
  start: Date;
  /** Exclusive bucket end. */
  end: Date;
}

const MS_PER_DAY = 86400000;

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfWeekUTC(d: Date): Date {
  const x = startOfDayUTC(d);
  // Postgres DATE_TRUNC('week', ...) snaps to Monday — match that here.
  const dow = x.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  x.setUTCDate(x.getUTCDate() - offset);
  return x;
}

function startOfMonthUTC(d: Date): Date {
  const x = startOfDayUTC(d);
  x.setUTCDate(1);
  return x;
}

function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortLabel(d: Date, granularity: MetricResolveCtx["range"]["granularity"]): string {
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Bucket the metric range into UTC time buckets aligned to the range's granularity.
 *
 * Bucket starts match Postgres `DATE_TRUNC(<granularity>, ...)` so callers can
 * group by the same expression and join the result back to {@link TimeBucket.key}.
 */
export function buildTimeBuckets(range: MetricResolveCtx["range"]): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  let cursor: Date;
  const end = range.end;

  if (range.granularity === "month") {
    cursor = startOfMonthUTC(range.start);
  } else if (range.granularity === "week") {
    cursor = startOfWeekUTC(range.start);
  } else {
    cursor = startOfDayUTC(range.start);
  }

  // Hard cap to keep series bounded for very large ranges — keep the **tail** so long
  // windows still show recent history (e.g. multi-year span with weekly buckets).
  const MAX_BUCKETS = 60;
  while (cursor <= end) {
    const next = new Date(cursor);
    if (range.granularity === "day") next.setUTCDate(next.getUTCDate() + 1);
    else if (range.granularity === "week") next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    buckets.push({
      key: isoKey(cursor),
      label: shortLabel(cursor, range.granularity),
      start: new Date(cursor),
      end: next,
    });
    cursor = next;
  }
  if (buckets.length > MAX_BUCKETS) {
    return buckets.slice(-MAX_BUCKETS);
  }
  return buckets;
}

/**
 * Map bucketed query results onto a {@link buildTimeBuckets} skeleton, so that
 * empty buckets render as zero rather than disappearing from the series.
 *
 * `rows` items expose a `period` column holding the truncated bucket start
 * (Date or ISO string from Postgres `DATE_TRUNC`) and a numeric `value`.
 */
export function alignSeries(
  buckets: TimeBucket[],
  rows: Array<{ period: unknown; value: unknown }>,
): MetricValue["series"] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.period == null) continue;
    const key = r.period instanceof Date ? isoKey(r.period) : String(r.period).slice(0, 10);
    map.set(key, Number(r.value ?? 0));
  }
  return buckets.map((b) => ({ t: b.label, v: map.get(b.key) ?? 0 }));
}

/** Join snapshot query rows (bucket key = {@link TimeBucket.key}) onto bucket labels. */
export function alignSeriesFromKeys(
  buckets: TimeBucket[],
  rows: Array<{ period_key: string; value: unknown }>,
): MetricValue["series"] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.value ?? 0);
    map.set(r.period_key, Number.isFinite(n) ? n : 0);
  }
  return buckets.map((b) => ({ t: b.label, v: map.get(b.key) ?? 0 }));
}

/** JSON payload for `jsonb_to_recordset` with bucket bounds (UTC ISO) and keys. */
export function bucketsJsonForRecordset(buckets: TimeBucket[]): string {
  return JSON.stringify(
    buckets.map((b) => ({ s: b.start.toISOString(), e: b.end.toISOString(), k: b.key })),
  );
}

/** Escape a JSON string for use as a single-quoted SQL literal before `::jsonb`. */
export function sqlJsonbLiteral(json: string): string {
  return `'${json.replace(/\\/g, "\\\\").replace(/'/g, "''")}'::jsonb`;
}

/** Postgres `DATE_TRUNC` expression matching {@link buildTimeBuckets}. */
export function truncSqlExpression(granularity: MetricResolveCtx["range"]["granularity"]): string {
  if (granularity === "day") return "day";
  if (granularity === "week") return "week";
  return "month";
}
