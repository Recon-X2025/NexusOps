import { bigint, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * Atomic per-org sequence counters used by auto-number generation.
 *
 * Each row tracks the highest sequence number issued for a given (org, entity)
 * pair. The INSERT ... ON CONFLICT DO UPDATE pattern guarantees atomicity under
 * any level of concurrency — no advisory locks, no MAX() scans needed.
 *
 * Entity key is the human-readable prefix (e.g. "TKT", "CHG", "PRJ").
 */
export const orgCounters = pgTable(
  "org_counters",
  {
    orgId:        text("org_id").notNull(),
    entity:       text("entity").notNull(),
    currentValue: bigint("current_value", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.entity] })],
);
