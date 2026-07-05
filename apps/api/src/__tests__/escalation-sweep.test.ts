/**
 * On-call escalation sweeper (Sprint 3.4a).
 *
 * The SLA breach sweeper (ticketLifecycleWorkflow.ts) flips
 * `tickets.sla_breached = true` but never escalated anyone up the on-call
 * chain. `sweepEscalations(db)` closes that loop: for each breached,
 * unresolved ticket it computes the due escalation level from the elapsed time
 * since the SLA breach instant (keyed off `sla_resolve_due_at`) against the
 * org's `oncall_schedules.escalationChain`, bumps `escalation_level`, and
 * notifies the chain member at that level.
 *
 * Invariants asserted:
 *   • a breached ticket 45 min past its resolve-due, against a 2-level chain
 *     (delays 0 / 30), escalates to level 2;
 *   • an immediate second tick is a no-op (idempotent — `due_level >
 *     escalation_level` guard);
 *   • a not-yet-breached ticket is untouched;
 *   • no chain configured → skip;
 *   • no financial mutation as a side effect.
 *
 * Drives the exported `sweepEscalations` directly (no Redis).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { seedFullOrg, testDb } from "./helpers";
import { tickets, oncallSchedules, journalEntries } from "@coheronconnect/db";
import { sweepEscalations } from "../workflows/escalationWorkflow";

const MIN = 60_000;

describe("On-call escalation sweeper (Sprint 3.4a)", () => {
  let orgId: string;
  let requesterId: string;
  let agentId: string;
  let statusOpenId: string;
  let statusResolvedId: string;
  let priorityId: string;

  beforeEach(async () => {
    // The sweep is global (claims all due tickets DB-wide); clear leftovers so
    // counts are deterministic in the shared single-fork DB.
    await testDb().execute(sql`DELETE FROM tickets`);
    await testDb().execute(sql`DELETE FROM oncall_schedules`);
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    requesterId = seeded.requesterId;
    agentId = seeded.agentId;
    statusOpenId = seeded.statusOpenId!;
    statusResolvedId = seeded.statusResolvedId!;
    priorityId = seeded.p1Id!;
  });

  /** Seed an on-call schedule with a 2-level escalation chain (delays 0/30). */
  async function seedTwoLevelChain() {
    await testDb()
      .insert(oncallSchedules)
      .values({
        orgId,
        name: "Primary",
        escalationChain: [
          { level: 1, userId: agentId, delayMinutes: 0 },
          { level: 2, userId: requesterId, delayMinutes: 30 },
        ],
      });
  }

  /** Seed a ticket. Defaults to a breached ticket whose resolve-due is in the past. */
  async function seedTicket(opts: {
    slaBreached?: boolean;
    resolveDueMinutesAgo?: number | null;
    escalationLevel?: number;
    resolved?: boolean;
  } = {}): Promise<string> {
    const db = testDb();
    const resolveDue =
      opts.resolveDueMinutesAgo === null || opts.resolveDueMinutesAgo === undefined
        ? null
        : new Date(Date.now() - opts.resolveDueMinutesAgo * MIN);
    const [t] = await db
      .insert(tickets)
      .values({
        orgId,
        number: `INC-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        title: "Escalation test",
        statusId: opts.resolved ? statusResolvedId : statusOpenId,
        priorityId,
        requesterId,
        type: "incident",
        slaBreached: opts.slaBreached ?? true,
        slaResolveDueAt: resolveDue,
        escalationLevel: opts.escalationLevel ?? 0,
        resolvedAt: opts.resolved ? new Date() : null,
      })
      .returning();
    return t!.id;
  }

  async function getTicket(id: string) {
    const [row] = await testDb()
      .select({ escalationLevel: tickets.escalationLevel })
      .from(tickets)
      .where(eq(tickets.id, id));
    return row;
  }

  it("escalates a 45-min-breached ticket to level 2 and notifies once", async () => {
    await seedTwoLevelChain();
    const id = await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45, escalationLevel: 0 });

    const r = await sweepEscalations(testDb());
    expect(r.examined).toBe(1);
    expect(r.escalated).toBe(1);
    expect(r.notified).toBe(1);
    expect(r.errors).toBe(0);

    const t = await getTicket(id);
    expect(t!.escalationLevel).toBe(2);
  });

  it("is idempotent — an immediate second tick does not re-escalate", async () => {
    await seedTwoLevelChain();
    const id = await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45, escalationLevel: 0 });

    const first = await sweepEscalations(testDb());
    expect(first.escalated).toBe(1);

    const second = await sweepEscalations(testDb());
    // Still examined (it's breached + unresolved) but due_level == current level → no bump.
    expect(second.escalated).toBe(0);
    expect(second.notified).toBe(0);

    const t = await getTicket(id);
    expect(t!.escalationLevel).toBe(2);
  });

  it("only advances to level 1 when 45min < cumulative L2 delay", async () => {
    // Chain L1 at breach, L2 at +90min. 45 min in → only level 1 is due.
    await testDb()
      .insert(oncallSchedules)
      .values({
        orgId,
        name: "Slow chain",
        escalationChain: [
          { level: 1, userId: agentId, delayMinutes: 0 },
          { level: 2, userId: requesterId, delayMinutes: 90 },
        ],
      });
    const id = await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45, escalationLevel: 0 });

    const r = await sweepEscalations(testDb());
    expect(r.escalated).toBe(1);
    const t = await getTicket(id);
    expect(t!.escalationLevel).toBe(1);
  });

  it("does not touch a not-yet-breached ticket", async () => {
    await seedTwoLevelChain();
    const id = await seedTicket({ slaBreached: false, resolveDueMinutesAgo: 45, escalationLevel: 0 });

    const r = await sweepEscalations(testDb());
    expect(r.examined).toBe(0);
    expect(r.escalated).toBe(0);

    const t = await getTicket(id);
    expect(t!.escalationLevel).toBe(0);
  });

  it("skips a breached ticket when no escalation chain is configured", async () => {
    // No oncall_schedules seeded.
    const id = await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45, escalationLevel: 0 });

    const r = await sweepEscalations(testDb());
    // Examined (it's a claim candidate) but no chain → not escalated.
    expect(r.examined).toBe(1);
    expect(r.escalated).toBe(0);

    const t = await getTicket(id);
    expect(t!.escalationLevel).toBe(0);
  });

  it("ignores resolved tickets even if breached", async () => {
    await seedTwoLevelChain();
    await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45, resolved: true });

    const r = await sweepEscalations(testDb());
    expect(r.examined).toBe(0);
  });

  it("performs NO financial mutation as a side effect", async () => {
    const before = await testDb().select().from(journalEntries);
    await seedTwoLevelChain();
    await seedTicket({ slaBreached: true, resolveDueMinutesAgo: 45 });

    await sweepEscalations(testDb());

    const after = await testDb().select().from(journalEntries);
    expect(after.length).toBe(before.length);
  });
});
