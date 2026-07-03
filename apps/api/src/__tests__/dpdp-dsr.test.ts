/**
 * DPDP Data Subject Request (DSR) lifecycle tests (Sprint 1.1).
 *
 * The compliance router (module: "compliance", role: privacy_officer) manages
 * DSRs per DPDP Act 2023 §11–14: intake with a statutory response clock, a
 * guarded status state machine, an append-only event trail, and an SLA summary.
 * Also verifies tenant isolation and RBAC gating.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { complianceRouter } from "../routers/compliance";
import { dpdpDataSubjectRequests, eq } from "@coheronconnect/db";

describe("DPDP DSR lifecycle (Sprint 1.1)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const mkDsr = (over: Record<string, unknown> = {}) =>
    caller.dsr.create({
      requestType: "access",
      principalName: "Asha Rao",
      principalEmail: "asha@example.com",
      responseWindowDays: 30,
      ...over,
    });

  it("creates a DSR with a generated reference and a due clock", async () => {
    const before = Date.now();
    const dsr = await mkDsr();
    expect(dsr.reference).toMatch(/^DSR-\d{4}-0001$/);
    expect(dsr.status).toBe("received");
    // due = received + 30d
    const due = new Date(dsr.dueAt).getTime();
    const received = new Date(dsr.receivedAt).getTime();
    const days = Math.round((due - received) / (24 * 60 * 60 * 1000));
    expect(days).toBe(30);
    expect(received).toBeGreaterThanOrEqual(before - 1000);

    // an event was written
    const full = await caller.dsr.get({ id: dsr.id });
    expect(full.events).toHaveLength(1);
    expect(full.events[0].eventType).toBe("created");
  });

  it("increments the reference sequence per org per year", async () => {
    const a = await mkDsr();
    const b = await mkDsr({ principalName: "Ravi K" });
    expect(a.reference).toMatch(/-0001$/);
    expect(b.reference).toMatch(/-0002$/);
  });

  it("walks a valid state machine path received→in_progress→fulfilled→closed", async () => {
    const dsr = await mkDsr();
    const s1 = await caller.dsr.transition({ id: dsr.id, toStatus: "in_progress" });
    expect(s1.status).toBe("in_progress");
    const s2 = await caller.dsr.transition({
      id: dsr.id,
      toStatus: "fulfilled",
      resolutionNote: "Data package delivered",
    });
    expect(s2.status).toBe("fulfilled");
    expect(s2.resolutionNote).toBe("Data package delivered");
    const s3 = await caller.dsr.transition({ id: dsr.id, toStatus: "closed" });
    expect(s3.status).toBe("closed");
    expect(s3.closedAt).not.toBeNull();

    // event trail records each transition (created + 3 transitions)
    const full = await caller.dsr.get({ id: dsr.id });
    expect(full.events.length).toBe(4);
  });

  it("rejects an invalid transition", async () => {
    const dsr = await mkDsr();
    // received → fulfilled is not allowed (must go via in_progress)
    await expect(
      caller.dsr.transition({ id: dsr.id, toStatus: "fulfilled" }),
    ).rejects.toThrow(/Invalid DSR transition/i);
  });

  it("requires a rejection reason to reject, and blocks transitions out of closed", async () => {
    const dsr = await mkDsr();
    await expect(
      caller.dsr.transition({ id: dsr.id, toStatus: "rejected" }),
    ).rejects.toThrow(/rejectionReason is required/i);

    const rejected = await caller.dsr.transition({
      id: dsr.id,
      toStatus: "rejected",
      rejectionReason: "Not a valid data principal",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("Not a valid data principal");

    const closed = await caller.dsr.transition({ id: dsr.id, toStatus: "closed" });
    expect(closed.status).toBe("closed");
    // terminal — no further transitions
    await expect(
      caller.dsr.transition({ id: dsr.id, toStatus: "in_progress" }),
    ).rejects.toThrow(/Invalid DSR transition/i);
  });

  it("assign and addNote append to the event trail without changing status", async () => {
    const dsr = await mkDsr();
    await caller.dsr.assign({ id: dsr.id, assignedToUserId: adminId });
    await caller.dsr.addNote({ id: dsr.id, note: "Called principal to verify identity" });
    const full = await caller.dsr.get({ id: dsr.id });
    expect(full.assignedToUserId).toBe(adminId);
    expect(full.status).toBe("received");
    const types = full.events.map((e: any) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(["created", "assigned", "note"]));
  });

  it("slaSummary counts overdue vs due-soon vs closed", async () => {
    // an overdue DSR: received 40d ago, 30d window → due 10d in the past
    const overdue = await mkDsr({
      principalName: "Overdue P",
      receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      responseWindowDays: 30,
    });
    // a due-soon DSR: received now, 3d window
    await mkDsr({ principalName: "Soon P", responseWindowDays: 3 });
    // a closed DSR
    const toClose = await mkDsr({ principalName: "Done P" });
    await caller.dsr.transition({ id: toClose.id, toStatus: "in_progress" });
    await caller.dsr.transition({ id: toClose.id, toStatus: "fulfilled" });
    await caller.dsr.transition({ id: toClose.id, toStatus: "closed" });

    const s = await caller.dsr.slaSummary();
    expect(s.total).toBe(3);
    expect(s.closed).toBe(1);
    expect(s.overdue).toBeGreaterThanOrEqual(1);
    expect(s.dueSoon).toBeGreaterThanOrEqual(1);

    // overdueOnly filter surfaces the overdue one
    const overdueList = await caller.dsr.list({ overdueOnly: true });
    expect(overdueList.some((r: any) => r.id === overdue.id)).toBe(true);
  });

  it("is tenant-isolated: another org cannot see or mutate this org's DSR", async () => {
    const dsr = await mkDsr();
    const other = await seedFullOrg();
    const foreign = complianceRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    const foreignList = await foreign.dsr.list();
    expect(foreignList.find((r: any) => r.id === dsr.id)).toBeUndefined();
    await expect(foreign.dsr.get({ id: dsr.id })).rejects.toThrow(/not found/i);
    await expect(
      foreign.dsr.transition({ id: dsr.id, toStatus: "in_progress" }),
    ).rejects.toThrow(/not found/i);

    // and the original row is untouched
    const db = testDb();
    const [row] = await db
      .select()
      .from(dpdpDataSubjectRequests)
      .where(eq(dpdpDataSubjectRequests.id, dsr.id));
    expect(row!.status).toBe("received");
  });

  it("denies access to a member without the compliance module", async () => {
    const seeded = await seedFullOrg();
    // Override the mock context's default admin role → a plain member with no
    // matrix role has no compliance permissions.
    const memberCtx = createMockContext(seeded.requesterId, seeded.orgId, {
      user: {
        id: seeded.requesterId,
        orgId: seeded.orgId,
        email: "member@coheronconnect.io",
        name: "Member",
        role: "member",
        matrixRole: null,
        status: "active",
      },
    } as any);
    const member = complianceRouter.createCaller(memberCtx);
    await expect(member.dsr.list()).rejects.toThrow(/(FORBIDDEN|Permission denied)/i);
  });
});
