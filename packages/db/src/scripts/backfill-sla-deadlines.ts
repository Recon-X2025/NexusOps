/**
 * One-shot backfill: populate `sla_response_due_at` and `sla_resolve_due_at`
 * on existing open tickets that were created before the deadline columns were
 * being written (e.g. seeded data, raw SQL imports, ETL loads).
 *
 * Why this exists:
 *   The dashboard's SLA badge and the periodic deadline sweeper
 *   (apps/api/src/workflows/ticketLifecycleWorkflow.ts) both rely on
 *   `sla_*_due_at` being set. Tickets without those values are invisible to
 *   the sweeper and will sit forever showing "On Track" no matter how old.
 *
 * What it does:
 *   For every open ticket (resolved_at IS NULL AND closed_at IS NULL) where
 *   either deadline column is NULL, computes:
 *     sla_response_due_at = created_at + priority.sla_response_minutes
 *     sla_resolve_due_at  = created_at + priority.sla_resolve_minutes
 *   …rolling weekend / org-holiday days forward per the org's settings.
 *
 *   Existing non-NULL deadline values are left untouched (this script only
 *   *fills* gaps; it never overwrites an authoritative value already set by
 *   the API).
 *
 *   After updating, immediately recomputes `sla_breached` so the column
 *   matches the new deadlines without waiting for the next sweep tick.
 *
 * Usage:
 *   pnpm -C packages/db backfill:sla              # dry-run, prints what WOULD change
 *   pnpm -C packages/db backfill:sla -- --apply   # actually write changes
 *   pnpm -C packages/db backfill:sla -- --apply --org coheron-demo
 *
 * Safe to re-run — idempotent.
 */
// Load monorepo-root .env so DATABASE_URL is picked up the same way it is for
// `pnpm db:seed`. Node 20+ ships `process.loadEnvFile`; gracefully no-op if
// the file is missing or the runtime is older.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).loadEnvFile?.("../../.env");
} catch {
  /* file missing — caller is expected to have DATABASE_URL set */
}

import { getDb } from "../client";
import {
  tickets,
  ticketPriorities,
  organizations,
  eq,
  and,
  isNull,
  or,
} from "../schema";

// ── Args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const orgFlagIdx = argv.indexOf("--org");
const ORG_SLUG = orgFlagIdx >= 0 ? argv[orgFlagIdx + 1] : undefined;

// ── Calendar adjustment (inlined to avoid a cross-package import on @api) ────
//
// Mirrors apps/api/src/lib/sla-business-calendar.ts. Kept identical so the
// backfill produces deadlines that line up with what the live API would have
// computed at ticket-create time.
type CalendarSettings = { slaSkipWeekends: boolean; slaHolidayDates: Set<string> };

function parseCalendar(raw: unknown): CalendarSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { slaSkipWeekends: true, slaHolidayDates: new Set() };
  }
  const o = raw as Record<string, unknown>;
  const dates = Array.isArray(o["slaHolidayDates"])
    ? (o["slaHolidayDates"] as unknown[]).filter(
        (x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x),
      )
    : [];
  return {
    slaSkipWeekends: o["slaSkipWeekends"] !== false,
    slaHolidayDates: new Set(dates),
  };
}

function rollForward(deadline: Date, cal: CalendarSettings): Date {
  let d = new Date(deadline.getTime());
  for (let guard = 0; guard < 366; guard++) {
    const dow = d.getUTCDay();
    const weekend = cal.slaSkipWeekends && (dow === 0 || dow === 6);
    const holiday = cal.slaHolidayDates.has(d.toISOString().slice(0, 10));
    if (!weekend && !holiday) return d;
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return deadline;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const db = getDb();
  const now = new Date();

  console.log("─".repeat(72));
  console.log("  NexusOps — SLA deadline backfill");
  console.log("─".repeat(72));
  console.log(`  Mode:  ${APPLY ? "APPLY (will write)" : "DRY-RUN (no writes)"}`);
  console.log(`  Org:   ${ORG_SLUG ?? "(all orgs)"}`);
  console.log(`  Now:   ${now.toISOString()}`);
  console.log("─".repeat(72));

  // Scope to one org if requested.
  const orgRows = ORG_SLUG
    ? await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG))
    : await db.select().from(organizations);

  if (orgRows.length === 0) {
    console.log("No matching organisations. Nothing to do.");
    return;
  }

  let totalCandidates = 0;
  let totalUpdated = 0;
  let totalReclassifiedBreached = 0;
  let totalReclassifiedOnTrack = 0;

  for (const org of orgRows) {
    const cal = parseCalendar(org.settings);

    // Find candidate tickets: open (not resolved/closed), missing at least one
    // deadline column, with a priority that has SLA minutes set.
    const candidates = await db
      .select({
        id: tickets.id,
        number: tickets.number,
        createdAt: tickets.createdAt,
        slaResponseDueAt: tickets.slaResponseDueAt,
        slaResolveDueAt: tickets.slaResolveDueAt,
        slaBreached: tickets.slaBreached,
        slaPausedAt: tickets.slaPausedAt,
        priorityRespMin: ticketPriorities.slaResponseMinutes,
        priorityResMin: ticketPriorities.slaResolveMinutes,
      })
      .from(tickets)
      .leftJoin(ticketPriorities, eq(ticketPriorities.id, tickets.priorityId))
      .where(
        and(
          eq(tickets.orgId, org.id),
          isNull(tickets.resolvedAt),
          isNull(tickets.closedAt),
          or(isNull(tickets.slaResponseDueAt), isNull(tickets.slaResolveDueAt)),
        ),
      );

    if (candidates.length === 0) continue;

    let orgUpdated = 0;
    let orgRebreached = 0;
    let orgUnbreached = 0;

    for (const c of candidates) {
      totalCandidates++;
      const respMin = c.priorityRespMin ?? null;
      const resMin = c.priorityResMin ?? null;
      if (respMin == null && resMin == null) continue; // No SLA defined for this priority — skip.

      const created = new Date(c.createdAt as Date);

      // Only fill columns that are currently NULL — never overwrite an
      // already-authoritative value the API set.
      const nextResp =
        c.slaResponseDueAt == null && respMin != null && respMin > 0
          ? rollForward(new Date(created.getTime() + respMin * 60_000), cal)
          : c.slaResponseDueAt ?? null;

      const nextRes =
        c.slaResolveDueAt == null && resMin != null && resMin > 0
          ? rollForward(new Date(created.getTime() + resMin * 60_000), cal)
          : c.slaResolveDueAt ?? null;

      const filledRespOnly = c.slaResponseDueAt == null && nextResp != null;
      const filledResOnly = c.slaResolveDueAt == null && nextRes != null;
      if (!filledRespOnly && !filledResOnly) continue;

      // Recompute slaBreached against the new deadlines (paused tickets are
      // excluded, matching the sweeper's rule).
      const isPaused = c.slaPausedAt != null;
      const shouldBeBreached =
        !isPaused &&
        ((nextRes != null && nextRes.getTime() < now.getTime()) ||
          (nextResp != null && nextResp.getTime() < now.getTime()));

      const breachChanged = shouldBeBreached !== c.slaBreached;
      if (shouldBeBreached && !c.slaBreached) orgRebreached++;
      if (!shouldBeBreached && c.slaBreached) orgUnbreached++;

      orgUpdated++;
      if (!APPLY) continue;

      await db
        .update(tickets)
        .set({
          slaResponseDueAt: nextResp,
          slaResolveDueAt: nextRes,
          slaBreached: breachChanged ? shouldBeBreached : c.slaBreached,
          updatedAt: now,
        })
        .where(eq(tickets.id, c.id));
    }

    totalUpdated += orgUpdated;
    totalReclassifiedBreached += orgRebreached;
    totalReclassifiedOnTrack += orgUnbreached;

    if (orgUpdated > 0) {
      console.log(
        `  [${org.slug.padEnd(20)}] ${orgUpdated.toString().padStart(5)} tickets ` +
          `(→ breached: ${orgRebreached}, → on-track: ${orgUnbreached})`,
      );
    }
  }

  console.log("─".repeat(72));
  console.log(`  Candidates scanned: ${totalCandidates}`);
  console.log(`  Tickets ${APPLY ? "updated" : "to update"}: ${totalUpdated}`);
  console.log(`  Newly breached:     ${totalReclassifiedBreached}`);
  console.log(`  Cleared breach:     ${totalReclassifiedOnTrack}`);
  console.log("─".repeat(72));
  if (!APPLY && totalUpdated > 0) {
    console.log("  Dry-run only — re-run with --apply to write these changes.");
  }
}

main()
  .then(() => {
    // postgres-js holds the pool open; force exit so the script doesn't hang.
    process.exit(0);
  })
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
