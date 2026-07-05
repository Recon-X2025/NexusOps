/**
 * escalationWorkflow.ts — On-call escalation timers via BullMQ (Sprint 3.4a).
 *
 * Closes the third ITSM automation loop: an SLA breach previously only flipped
 * `tickets.sla_breached = true` (see ticketLifecycleWorkflow.ts) but nothing
 * ever *escalated* the breached ticket up the on-call chain. This sweeper walks
 * `oncall_schedules.escalationChain` and, for each breached-but-unresolved
 * ticket, notifies the chain member whose cumulative delay has elapsed.
 *
 * Escalation clock: the SLA breach starts the clock. We key off the existing
 * `sla_resolve_due_at` (falling back to `sla_response_due_at`) as the breach
 * instant — no new column. `elapsed = NOW() - breachInstant`.
 *
 * due_level = the highest chain level whose *cumulative* `delayMinutes` since
 * the breach instant has elapsed (capped at the chain length). A ticket is
 * bumped only while `due_level > escalation_level`, which makes the sweep
 * idempotent — the same level is never notified twice, and an immediate second
 * tick is a no-op.
 *
 * Chain resolution (v1): per org, the on-call schedule with a non-empty chain —
 * preferring one whose free-text `team` matches the ticket's team name, else
 * the org's first such schedule. No chain → the ticket is skipped.
 *
 * `sweepEscalations(db)` is exported directly so tests can drive it without a
 * Redis-backed queue/worker.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import { tickets, teams, oncallSchedules, eq, and, sql } from "@coheronconnect/db";
import { notifyActivity, writeWorkflowAuditLog } from "./activities";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const ESCALATION_QUEUE_NAME = "coheronconnect-escalation";

/** Job name used by the periodic escalation sweeper. */
export const ESCALATION_SWEEP_JOB_NAME = "escalation-sweep";
/** Sweep cadence — every minute, matching the SLA breach sweeper. */
const ESCALATION_SWEEP_INTERVAL_MS = 60_000;
/** Hard cap on tickets a single tick may escalate — protects DB + notification volume. */
const ESCALATION_SWEEP_BATCH_LIMIT = 500;

type EscalationStep = { level: number; userId: string; delayMinutes: number };

export interface EscalationJobData {
  /** Unused — the sweeper queries the DB directly. */
  _: string;
}

export interface EscalationSweepResult {
  /** Escalation-due tickets examined this tick. */
  examined: number;
  /** Tickets whose `escalation_level` was bumped. */
  escalated: number;
  /** Chain members notified. */
  notified: number;
  errors: number;
}

export function createEscalationQueue(): Queue<EscalationJobData> {
  return new Queue(ESCALATION_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/**
 * Register the repeatable escalation sweeper. Idempotent — BullMQ deduplicates
 * repeatable jobs by (name, repeat options), so calling at every boot is safe.
 */
export async function scheduleEscalationSweep(queue: Queue<EscalationJobData>): Promise<void> {
  await queue.add(
    ESCALATION_SWEEP_JOB_NAME,
    { _: "" },
    {
      repeat: { every: ESCALATION_SWEEP_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

/** Normalise a raw escalation chain: sorted by level, valid steps only. */
function normalizeChain(raw: unknown): EscalationStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: EscalationStep[] = [];
  for (const s of raw as EscalationStep[]) {
    if (!s || typeof s.userId !== "string" || !s.userId) continue;
    const level = Number(s.level);
    const delayMinutes = Number(s.delayMinutes);
    if (!Number.isFinite(level) || !Number.isFinite(delayMinutes)) continue;
    steps.push({ level, userId: s.userId, delayMinutes });
  }
  return steps.sort((a, b) => a.level - b.level);
}

/**
 * The highest chain level whose CUMULATIVE delay since the breach instant has
 * elapsed. Returns 0 when nothing is yet due. Chain steps are cumulative: a
 * `[{level:1,delay:0},{level:2,delay:30}]` chain means level 1 at breach and
 * level 2 thirty minutes later.
 */
function dueLevel(chain: EscalationStep[], elapsedMinutes: number): number {
  let cumulative = 0;
  let due = 0;
  for (const step of chain) {
    cumulative += step.delayMinutes;
    if (elapsedMinutes >= cumulative) due = step.level;
    else break;
  }
  return due;
}

/** Resolve the escalation chain for a ticket from the org's on-call schedules. */
function resolveChain(
  schedules: Array<{ team: string | null; escalationChain: unknown }>,
  teamName: string | null,
): EscalationStep[] {
  const withChain = schedules
    .map((s) => ({ team: s.team, chain: normalizeChain(s.escalationChain) }))
    .filter((s) => s.chain.length > 0);
  if (withChain.length === 0) return [];
  if (teamName) {
    const match = withChain.find((s) => s.team === teamName);
    if (match) return match.chain;
  }
  return withChain[0]!.chain;
}

/**
 * Escalate breached-but-unresolved tickets up their on-call chain.
 *
 * Steps:
 *   1. Atomically claim escalation-due tickets (`FOR UPDATE SKIP LOCKED`):
 *      unresolved, unclosed, `sla_breached = true`, with a breach instant.
 *   2. For each, resolve its org's chain + compute `due_level` from elapsed.
 *   3. Where `due_level > escalation_level`: bump the level, notify the chain
 *      member at that level, write an audit log.
 *
 * Never throws to the caller — a per-ticket failure is counted and logged.
 */
export async function sweepEscalations(db: Db): Promise<EscalationSweepResult> {
  const result: EscalationSweepResult = { examined: 0, escalated: 0, notified: 0, errors: 0 };

  const claimed = await db.execute(sql`
    SELECT id, org_id, number, team_id, escalation_level,
           COALESCE(sla_resolve_due_at, sla_response_due_at) AS breach_instant
    FROM   ${tickets}
    WHERE  sla_breached = true
      AND  resolved_at  IS NULL
      AND  closed_at    IS NULL
      AND  COALESCE(sla_resolve_due_at, sla_response_due_at) IS NOT NULL
    ORDER  BY escalation_level ASC, sla_resolve_due_at NULLS LAST
    LIMIT  ${ESCALATION_SWEEP_BATCH_LIMIT}
    FOR    UPDATE SKIP LOCKED
  `);
  const rows = (Array.isArray(claimed) ? claimed : ((claimed as { rows?: unknown[] }).rows ?? [])) as Array<{
    id: string;
    org_id: string;
    number: string;
    team_id: string | null;
    escalation_level: number;
    breach_instant: string | Date;
  }>;

  // Cache per-org schedules so we don't re-query for every ticket.
  const scheduleCache = new Map<string, Array<{ team: string | null; escalationChain: unknown }>>();
  // Cache team name lookups (ticket.teamId uuid → teams.name text).
  const teamNameCache = new Map<string, string | null>();

  const now = Date.now();

  for (const row of rows) {
    result.examined++;
    try {
      let schedules = scheduleCache.get(row.org_id);
      if (!schedules) {
        schedules = await db
          .select({ team: oncallSchedules.team, escalationChain: oncallSchedules.escalationChain })
          .from(oncallSchedules)
          .where(eq(oncallSchedules.orgId, row.org_id));
        scheduleCache.set(row.org_id, schedules);
      }

      let teamName: string | null = null;
      if (row.team_id) {
        if (teamNameCache.has(row.team_id)) {
          teamName = teamNameCache.get(row.team_id) ?? null;
        } else {
          const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, row.team_id));
          teamName = t?.name ?? null;
          teamNameCache.set(row.team_id, teamName);
        }
      }

      const chain = resolveChain(schedules, teamName);
      if (chain.length === 0) continue; // no chain configured → skip

      const breachMs = new Date(row.breach_instant).getTime();
      const elapsedMinutes = (now - breachMs) / 60_000;
      const due = dueLevel(chain, elapsedMinutes);

      // Idempotency guard — only advance forward, never re-notify a level.
      if (due <= row.escalation_level) continue;

      await db
        .update(tickets)
        .set({ escalationLevel: due, updatedAt: new Date() })
        .where(eq(tickets.id, row.id));
      result.escalated++;

      const step = chain.find((s) => s.level === due);
      if (step) {
        await notifyActivity(
          { db, orgId: row.org_id, actorId: "system" },
          {
            userId: step.userId,
            title: `Escalation L${due}: ticket ${row.number}`,
            message: `Ticket ${row.number} has breached SLA and escalated to level ${due}.`,
            resourceType: "ticket",
            resourceId: row.id,
            link: `/app/tickets/${row.id}`,
          },
        );
        result.notified++;
      }

      await writeWorkflowAuditLog(
        { db, orgId: row.org_id, actorId: "system" },
        {
          resource: "ticket",
          resourceId: row.id,
          action: "escalation.level_up",
          changes: { from: row.escalation_level, to: due, notifiedUserId: step?.userId ?? null },
        },
      );
    } catch (err) {
      result.errors++;
      console.error("[escalation] ticket escalation failed", row.id, (err as Error).message);
    }
  }

  return result;
}

export function startEscalationWorker(db: Db): Worker<EscalationJobData> {
  return new Worker<EscalationJobData>(
    ESCALATION_QUEUE_NAME,
    async (job: Job<EscalationJobData>) => {
      if (job.name === ESCALATION_SWEEP_JOB_NAME) {
        await sweepEscalations(db);
      }
    },
    { connection: redisConnection(), concurrency: 5 },
  );
}
