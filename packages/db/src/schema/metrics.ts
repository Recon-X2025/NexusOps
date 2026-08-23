import { pgTable, uuid, text, date, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

/**
 * Daily metric snapshots — the history layer.
 *
 * WHY THIS EXISTS. Sixteen of thirty metrics rendered a number and an empty
 * trend line, and the resolvers said why in a comment: "a point-in-time count;
 * without a daily snapshot table there is no honest history to backfill, so
 * leave the series empty." That was the correct call — a metric like "tickets
 * currently open" cannot be reconstructed from the past, because the rows that
 * were open last Tuesday are not distinguishable now. This table records the
 * figure each day so a trend can be drawn from real observations instead.
 *
 * NO BACKFILL, EVER. There is no historical data to derive and inventing one
 * would be the fabricated-figure problem the standing directive exists to stop.
 * Series begin empty and fill forward from the first capture. A surface showing
 * a short line should say so rather than imply the product is new.
 *
 * `value` is numeric, not integer: metrics include rates, percentages and
 * currency as well as counts.
 *
 * UNIQUE (org_id, metric_id, captured_on) makes a re-run idempotent — the job
 * upserts, so running it twice in a day corrects the figure rather than
 * doubling the series.
 */
export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Registry id, e.g. "tickets.open_total". Text, not an enum: the registry
     *  is code and changes with a deploy, while these rows outlive it. */
    metricId: text("metric_id").notNull(),
    /** The day observed, in the capture job's timezone. One row per day. */
    capturedOn: date("captured_on").notNull(),
    value: numeric("value", { precision: 20, scale: 4 }).notNull(),
    /** healthy | watch | stressed, as the resolver judged it that day. */
    state: text("state"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMetricDayIdx: uniqueIndex("metric_snapshots_org_metric_day_idx").on(
      t.orgId,
      t.metricId,
      t.capturedOn,
    ),
    orgMetricIdx: index("metric_snapshots_org_metric_idx").on(t.orgId, t.metricId),
  }),
);
