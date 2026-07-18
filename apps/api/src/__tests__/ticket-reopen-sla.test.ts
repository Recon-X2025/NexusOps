/**
 * Reopen SLA re-arm (regression for the "frozen green" defect).
 *
 * Bug: the `tickets.update` mutation stamped `resolvedAt`/`closedAt` when a
 * ticket moved INTO a terminal category, but had no branch for the reverse
 * (reopen). A reopened ticket therefore kept its stale `resolvedAt`/`closedAt`,
 * so the 60s breach sweeper skipped it (it only scans non-terminal tickets), the
 * SLA clock was never re-armed, and `sla_breached` stayed frozen — the ticket
 * showed "On Track / green" forever regardless of age.
 *
 * Fix: on a resolved/closed → active transition, clear the terminal stamps,
 * recompute fresh SLA deadlines (identical semantics to create), and reset
 * `sla_breached`.
 *
 * These tests drive the real tRPC `tickets.update` mutation (via makeContext +
 * createCaller) so the whole transition path runs exactly as in production.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "@coheronconnect/db";
import { tickets } from "@coheronconnect/db";
import { appRouter } from "../routers";
import { seedFullOrg, makeContext, testDb } from "./helpers";

type Caller = ReturnType<typeof appRouter.createCaller>;

describe("Ticket reopen re-arms SLA (regression)", () => {
  let orgId: string;
  let adminId: string;
  let statusOpenId: string;
  let statusInProgressId: string;
  let statusResolvedId: string;
  let p2Id: string;
  let caller: Caller;

  beforeAll(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    statusOpenId = seeded.statusOpenId!;
    statusInProgressId = seeded.statusInProgressId!;
    statusResolvedId = seeded.statusResolvedId!;
    p2Id = seeded.p2Id!; // P2 - High: 60 / 480 minutes
    caller = appRouter.createCaller(makeContext(adminId, orgId));
  });

  async function readTicket(id: string) {
    const [row] = await testDb()
      .select()
      .from(tickets)
      .where(eq(tickets.id, id));
    return row!;
  }

  it("clears resolvedAt, resets slaBreached, and recomputes deadlines on reopen", async () => {
    // 1. Create — the ticket gets real SLA deadlines from the P2 tier.
    const created = await caller.tickets.create({
      title: "Reopen re-arm test",
      type: "incident",
      priorityId: p2Id,
    });
    const id = (created as { id: string }).id;

    const afterCreate = await readTicket(id);
    expect(afterCreate.slaResponseDueAt).not.toBeNull();
    expect(afterCreate.slaResolveDueAt).not.toBeNull();

    // 2. Resolve — stamps resolvedAt.
    await caller.tickets.update({ id, data: { statusId: statusResolvedId } });
    const afterResolve = await readTicket(id);
    expect(afterResolve.resolvedAt).not.toBeNull();

    // Simulate the frozen state the bug produced: the ticket had breached at some
    // point and the deadline is now in the past. (In the buggy code this stayed
    // frozen forever.) Force those columns directly to model a real stale ticket.
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);
    await testDb()
      .update(tickets)
      .set({
        slaBreached: true,
        slaResponseDueAt: pastDeadline,
        slaResolveDueAt: pastDeadline,
        slaRespondedAt: pastDeadline,
      })
      .where(eq(tickets.id, id));

    // 3. Reopen — move back to an active category.
    const beforeReopen = Date.now();
    await caller.tickets.update({ id, data: { statusId: statusInProgressId } });
    const afterReopen = await readTicket(id);

    // resolvedAt cleared.
    expect(afterReopen.resolvedAt).toBeNull();
    // Breach flag reset — the clock starts fresh.
    expect(afterReopen.slaBreached).toBe(false);
    // Response-taken marker cleared so first-response is measured again.
    expect(afterReopen.slaRespondedAt).toBeNull();
    // Deadlines recomputed to the future (P2 = 60 / 480 min ahead of "now").
    expect(afterReopen.slaResponseDueAt).not.toBeNull();
    expect(afterReopen.slaResolveDueAt).not.toBeNull();
    expect(new Date(afterReopen.slaResponseDueAt as Date).getTime()).toBeGreaterThan(beforeReopen);
    expect(new Date(afterReopen.slaResolveDueAt as Date).getTime()).toBeGreaterThan(beforeReopen);
    // Resolve deadline strictly after response deadline (monotonic pair invariant).
    expect(new Date(afterReopen.slaResolveDueAt as Date).getTime()).toBeGreaterThan(
      new Date(afterReopen.slaResponseDueAt as Date).getTime(),
    );
  });

  it("also clears closedAt when reopening a closed ticket", async () => {
    const created = await caller.tickets.create({
      title: "Reopen from closed",
      type: "incident",
      priorityId: p2Id,
    });
    const id = (created as { id: string }).id;

    // Resolve, then force closedAt to model a closed ticket (the reopen path
    // clears closedAt regardless of which terminal category it came from).
    await caller.tickets.update({ id, data: { statusId: statusResolvedId } });
    await testDb()
      .update(tickets)
      .set({ closedAt: new Date(), slaBreached: true })
      .where(eq(tickets.id, id));

    await caller.tickets.update({ id, data: { statusId: statusOpenId } });
    const afterReopen = await readTicket(id);
    expect(afterReopen.closedAt).toBeNull();
    expect(afterReopen.slaBreached).toBe(false);
  });

  it("writes resolvedAt/slaBreached changes into the activity log", async () => {
    const created = await caller.tickets.create({
      title: "Reopen audit trail",
      type: "incident",
      priorityId: p2Id,
    });
    const id = (created as { id: string }).id;

    await caller.tickets.update({ id, data: { statusId: statusResolvedId } });
    await testDb()
      .update(tickets)
      .set({ slaBreached: true })
      .where(eq(tickets.id, id));

    await caller.tickets.update({ id, data: { statusId: statusInProgressId } });

    const logs = (await testDb().execute(
      sql`SELECT changes FROM ticket_activity_logs WHERE ticket_id = ${id} ORDER BY created_at DESC LIMIT 1`,
    )) as unknown as Array<{ changes: Record<string, unknown> }>;
    const changes = logs[0]?.changes;
    expect(changes).toBeTruthy();
    expect(changes).toHaveProperty("slaBreached");
    expect(changes).toHaveProperty("resolvedAt");
  });
});
