/**
 * Three defects found by driving the product in a browser (audit 2026-08-23).
 * Each is reachable by an ordinary agent doing ordinary work, and each was
 * invisible to the existing suite because the suite never exercised the path.
 *
 * 1. FIRST RESPONSE IS NEVER RECORDED.
 *    Nothing in apps/api, apps/worker or packages/db ever writes a timestamp to
 *    `sla_responded_at` — the only assignment sets it to null. The breach sweep
 *    (ticketLifecycleWorkflow) marks `sla_breached = true` when that column is
 *    NULL past the response deadline, so EVERY open ticket eventually breaches
 *    no matter how fast an agent replies.
 *
 * 2. THE RESOLUTION NOTE IS DISCARDED.
 *    The resolve dialog marks the note required and blocks submit without one,
 *    then sends it as a top-level `comment` key. `tickets.update` accepts only
 *    `{ id, data }`, so zod strips it and `resolution_notes` stays NULL.
 *
 * 3. THE PRIORITY SHOWN IS NOT THE PRIORITY STORED.
 *    The form shows a 4x4 ITIL matrix ("2 - High") but compresses impact and
 *    urgency to a 3-value enum before sending, so the server re-derives from
 *    degraded input and lands on Critical — stamping Critical's much tighter
 *    SLA clocks on a ticket the user was told is High.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "@coheronconnect/db";
import { tickets, ticketPriorities } from "@coheronconnect/db";
import { appRouter } from "../routers";
import { seedFullOrg, makeContext, testDb } from "./helpers";

type Caller = ReturnType<typeof appRouter.createCaller>;

describe("Ticket pilot blockers", () => {
  let orgId: string;
  let adminId: string;
  let statusOpenId: string;
  let statusResolvedId: string;
  let caller: Caller;
  /** A DIFFERENT person from the requester — the service desk replying. */
  let agentCaller: Caller;

  beforeAll(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    statusOpenId = seeded.statusOpenId!;
    statusResolvedId = seeded.statusResolvedId!;
    caller = appRouter.createCaller(makeContext(adminId, orgId));
    agentCaller = appRouter.createCaller(makeContext(seeded.agentId!, orgId));
  });

  async function read(id: string) {
    const [row] = await testDb().select().from(tickets).where(eq(tickets.id, id));
    return row!;
  }

  async function newTicket(title: string, extra: Record<string, unknown> = {}) {
    return caller.tickets.create({
      type: "incident",
      title,
      description: "seeded by ticket-pilot-blockers spec",
      statusId: statusOpenId,
      ...extra,
    } as never);
  }

  it("stamps slaRespondedAt when an agent posts the first public reply", async () => {
    const t = await newTicket("first response stamps the SLA clock");
    expect((await read(t.id)).slaRespondedAt).toBeNull();

    await agentCaller.tickets.addComment({
      ticketId: t.id,
      body: "Agent acknowledging — investigating now.",
      isInternal: false,
    });

    const after = await read(t.id);
    expect(after.slaRespondedAt).toBeInstanceOf(Date);
  });

  it("does NOT count an internal note as the first response", async () => {
    const t = await newTicket("internal note is not a response");

    await agentCaller.tickets.addComment({
      ticketId: t.id,
      body: "Internal only — not visible to the requester.",
      isInternal: true,
    });

    expect((await read(t.id)).slaRespondedAt).toBeNull();
  });

  it("keeps the FIRST response time when a second reply is posted", async () => {
    const t = await newTicket("first response wins");

    await agentCaller.tickets.addComment({ ticketId: t.id, body: "First reply.", isInternal: false });
    const first = (await read(t.id)).slaRespondedAt;
    expect(first).toBeInstanceOf(Date);

    await agentCaller.tickets.addComment({ ticketId: t.id, body: "Second reply.", isInternal: false });
    expect((await read(t.id)).slaRespondedAt).toEqual(first);
  });

  it("persists the resolution note the resolve dialog demands", async () => {
    const t = await newTicket("resolution note must survive");
    const note = "Restarted the relay service; queue cleared.";

    await caller.tickets.update({
      id: t.id,
      data: { statusId: statusResolvedId, resolutionNotes: note },
    } as never);

    expect((await read(t.id)).resolutionNotes).toBe(note);
  });

  it("stores the SAME priority the ITIL matrix shows the user", async () => {
    // Impact "multiple groups" x urgency "high" is 2 - High on the ITIL matrix,
    // NOT Critical. Critical is reserved for enterprise-wide / cannot-work.
    const t = await newTicket("high, not critical", {
      impact: "high",
      urgency: "high",
      impactGrade: 2,
      urgencyGrade: 2,
    });

    const row = await read(t.id);
    const [prio] = await testDb()
      .select()
      .from(ticketPriorities)
      .where(eq(ticketPriorities.id, row.priorityId!));

    expect(prio!.name).toBe("P2 - High");
  });

  it("still reserves Critical for enterprise-wide impact with critical urgency", async () => {
    const t = await newTicket("genuinely critical", {
      impact: "high",
      urgency: "high",
      impactGrade: 1,
      urgencyGrade: 1,
    });

    const row = await read(t.id);
    const [prio] = await testDb()
      .select()
      .from(ticketPriorities)
      .where(eq(ticketPriorities.id, row.priorityId!));

    expect(prio!.name).toBe("P1 - Critical");
  });
});
