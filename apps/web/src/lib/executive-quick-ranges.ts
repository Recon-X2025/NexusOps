import {
  eachMonthOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
import { format } from "date-fns";

/** One quick range — `from` / `to` mirror Elasticsearch date-math style labels for traceability. */
export type ExecutiveQuickRangeDef = {
  id: string;
  from: string;
  to: string;
  display: string;
  group: string;
};

/**
 * Quick ranges aligned with NexusOps / Kibana-style date math.
 * IDs are stable; `from`/`to` store the original expression strings for docs/API parity.
 */
export const EXECUTIVE_QUICK_RANGES: ExecutiveQuickRangeDef[] = [
  // Year ranges (calendar)
  { id: "yr_this", from: "now/y", to: "now", display: "This year", group: "Year ranges" },
  { id: "yr_last", from: "now-1y/y", to: "now-1y/y", display: "Last year", group: "Year ranges" },
  ...[2, 3, 4, 5, 6, 7].map(
    (n) =>
      ({
        id: `yr_ago_${n}`,
        from: `now-${n}y/y`,
        to: `now-${n}y/y`,
        display: `${n} years ago`,
        group: "Year ranges",
      }) satisfies ExecutiveQuickRangeDef,
  ),
  // Rolling spans
  { id: "span_1y", from: "now-1y", to: "now", display: "Last 1 year", group: "Rolling year spans" },
  { id: "span_3y", from: "now-3y", to: "now", display: "Last 3 years", group: "Rolling year spans" },
  { id: "span_5y", from: "now-5y", to: "now", display: "Last 5 years", group: "Rolling year spans" },
  { id: "span_10y", from: "now-10y", to: "now", display: "Last 10 years", group: "Rolling year spans" },
  // Quarters
  { id: "q_this", from: "now/Q", to: "now", display: "This quarter", group: "Quarters" },
  { id: "q_last", from: "now-1Q/Q", to: "now-1Q/Q", display: "Last quarter", group: "Quarters" },
  ...[2, 3].map(
    (n) =>
      ({
        id: `q_ago_${n}`,
        from: `now-${n}Q/Q`,
        to: `now-${n}Q/Q`,
        display: `${n} quarters ago`,
        group: "Quarters",
      }) satisfies ExecutiveQuickRangeDef,
  ),
  // Same quarter, N years ago (full quarter)
  ...[1, 2, 3].map(
    (n) =>
      ({
        id: `qy_${n}`,
        from: `now-${n}y/Q`,
        to: `now-${n}y/Q`,
        display: `Same quarter - ${n} year${n === 1 ? "" : "s"} ago`,
        group: "Quarter (year-ago)",
      }) satisfies ExecutiveQuickRangeDef,
  ),
  // Months
  { id: "mo_this", from: "now/M", to: "now", display: "This month", group: "Months" },
  { id: "mo_last", from: "now-1M/M", to: "now-1M/M", display: "Last month", group: "Months" },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
    (n) =>
      ({
        id: `mo_ago_${n}`,
        from: `now-${n}M/M`,
        to: `now-${n}M/M`,
        display: `${n} months ago`,
        group: "Months",
      }) satisfies ExecutiveQuickRangeDef,
  ),
];

const RANGE_BY_ID = new Map(EXECUTIVE_QUICK_RANGES.map((r) => [r.id, r]));

export type ExecutiveQuickRangeResolved = ExecutiveQuickRangeDef & {
  fromDate: Date;
  toDate: Date;
};

function fullCalendarYearContaining(dateInYear: Date): { from: Date; to: Date } {
  return {
    from: startOfYear(dateInYear),
    to: endOfYear(dateInYear),
  };
}

function fullQuarterContaining(anchor: Date): { from: Date; to: Date } {
  return {
    from: startOfQuarter(anchor),
    to: endOfQuarter(anchor),
  };
}

function fullMonthContaining(anchor: Date): { from: Date; to: Date } {
  return {
    from: startOfMonth(anchor),
    to: endOfMonth(anchor),
  };
}

/** Resolve quick-range id to concrete [from, to] in local time (dashboard default). */
export function resolveExecutiveQuickRange(id: string, now = new Date()): ExecutiveQuickRangeResolved {
  const def = RANGE_BY_ID.get(id) ?? EXECUTIVE_QUICK_RANGES[0]!;
  let fromDate: Date;
  let toDate: Date;

  switch (def.id) {
    case "yr_this":
      fromDate = startOfYear(now);
      toDate = now;
      break;
    case "yr_last":
      ({ from: fromDate, to: toDate } = fullCalendarYearContaining(subYears(now, 1)));
      break;
    case "yr_ago_2":
    case "yr_ago_3":
    case "yr_ago_4":
    case "yr_ago_5":
    case "yr_ago_6":
    case "yr_ago_7": {
      const n = Number(def.id.replace("yr_ago_", ""));
      ({ from: fromDate, to: toDate } = fullCalendarYearContaining(subYears(now, n)));
      break;
    }
    case "span_1y":
      fromDate = subYears(now, 1);
      toDate = now;
      break;
    case "span_3y":
      fromDate = subYears(now, 3);
      toDate = now;
      break;
    case "span_5y":
      fromDate = subYears(now, 5);
      toDate = now;
      break;
    case "span_10y":
      fromDate = subYears(now, 10);
      toDate = now;
      break;
    case "q_this":
      fromDate = startOfQuarter(now);
      toDate = now;
      break;
    case "q_last":
      ({ from: fromDate, to: toDate } = fullQuarterContaining(subQuarters(now, 1)));
      break;
    case "q_ago_2":
      ({ from: fromDate, to: toDate } = fullQuarterContaining(subQuarters(now, 2)));
      break;
    case "q_ago_3":
      ({ from: fromDate, to: toDate } = fullQuarterContaining(subQuarters(now, 3)));
      break;
    case "qy_1":
    case "qy_2":
    case "qy_3": {
      const n = Number(def.id.replace("qy_", ""));
      const y = subYears(now, n);
      ({ from: fromDate, to: toDate } = fullQuarterContaining(y));
      break;
    }
    case "mo_this":
      fromDate = startOfMonth(now);
      toDate = now;
      break;
    case "mo_last":
      ({ from: fromDate, to: toDate } = fullMonthContaining(subMonths(now, 1)));
      break;
    case "mo_ago_2":
    case "mo_ago_3":
    case "mo_ago_4":
    case "mo_ago_5":
    case "mo_ago_6":
    case "mo_ago_7":
    case "mo_ago_8":
    case "mo_ago_9":
    case "mo_ago_10":
    case "mo_ago_11": {
      const n = Number(def.id.replace("mo_ago_", ""));
      ({ from: fromDate, to: toDate } = fullMonthContaining(subMonths(now, n)));
      break;
    }
    default:
      fromDate = startOfYear(now);
      toDate = now;
  }

  return { ...def, fromDate, toDate };
}

export function executiveDefaultQuickRangeId(): string {
  return "yr_this";
}

/** Grouped options for a &lt;select&gt; with optgroup. */
export function executiveQuickRangeSelectGroups(): { group: string; options: { id: string; label: string }[] }[] {
  const order: string[] = [];
  const map = new Map<string, { id: string; label: string }[]>();
  for (const r of EXECUTIVE_QUICK_RANGES) {
    if (!map.has(r.group)) {
      map.set(r.group, []);
      order.push(r.group);
    }
    map.get(r.group)!.push({ id: r.id, label: r.display });
  }
  return order.map((group) => ({ group, options: map.get(group)! }));
}

/**
 * Pick the bucket granularity that best matches a range span.
 *
 * Rule of thumb (matches user spec for hub/workbench overviews):
 *   - quarter/year/multi-year (>= ~75 days) -> month-on-month buckets
 *   - single month range (14-75 days)       -> week-on-week buckets
 *   - sub-fortnight (<= 14 days)             -> day-on-day buckets
 *
 * The metrics resolver layer already honours `day | week | month`
 * (see `truncSqlExpression` in `packages/metrics/src/resolve-helpers.ts`),
 * so this is purely a client-side derivation.
 */
export function granularityForRange(from: Date, to: Date): "day" | "week" | "month" {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 14) return "day";
  if (days <= 75) return "week";
  return "month";
}

/**
 * Month buckets for chart X-axis — capped at `maxBuckets`.
 * Uses inclusive calendar months from range start through range end (clamped to `now` if needed).
 */
export function buildMonthBucketsForRange(
  from: Date,
  to: Date,
  now = new Date(),
  maxBuckets = 24,
): { label: string; start: Date }[] {
  const start = startOfMonth(from);
  const endRaw = to > now ? now : to;
  const end = endOfMonth(endRaw);
  if (start > end) {
    return [{ label: format(now, "MMM yyyy"), start: startOfMonth(now) }];
  }
  let months = eachMonthOfInterval({ start, end });
  if (months.length > maxBuckets) {
    months = months.slice(-maxBuckets);
  }
  return months.map((d) => ({ label: format(d, "MMM yyyy"), start: d }));
}
