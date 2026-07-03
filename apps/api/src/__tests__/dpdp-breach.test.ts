/**
 * DPDP personal-data breach register tests (Sprint 1.3).
 *
 * The compliance router (module: "compliance", role: privacy_officer) manages
 * breach incidents per DPDP Act 2023 §8(6): intake derives a notification clock
 * from the jurisdiction profile (falling back to 72h), a guarded status state
 * machine drives the notification workflow, notifications stamp the Board /
 * Principals clocks, and an append-only event trail + SLA summary give the DPO
 * oversight. Also verifies tenant isolation and RBAC gating.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { complianceRouter } from "../routers/compliance";
import {
  dpdpBreachIncidents,
  privacyBreachNotificationProfiles,
  eq,
} from "@coheronconnect/db";

describe("DPDP breach register (Sprint 1.3)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const mkBreach = (over: Record<string, unknown> = {}) =>
    caller.breach.create({
      title: "Exposed customer export",
      severity: "high",
      ...over,
    });

  it("creates a breach with a generated reference and a 72h default notify clock", async () => {
    const b = await mkBreach();
    expect(b.reference).toMatch(/^BR-\d{4}-0001$/);
    expect(b.status).toBe("detected");
    expect(b.notificationWindowHours).toBe(72);
    // notifyDueAt = detectedAt + 72h
    const due = new Date(b.notifyDueAt).getTime();
    const detected = new Date(b.detectedAt).getTime();
    const hours = Math.round((due - detected) / (60 * 60 * 1000));
    expect(hours).toBe(72);

    const full = await caller.breach.get({ id: b.id });
    expect(full.events).toHaveLength(1);
    expect(full.events[0].eventType).toBe("created");
  });

  it("derives the notify clock from the jurisdiction profile when present", async () => {
    // seed a 24h profile for jurisdiction "EU"
    const db = testDb();
    await db.insert(privacyBreachNotificationProfiles).values({
      orgId,
      jurisdictionCode: "EU",
      regulatorName: "Test DPA",
      notificationOffsetHours: 24,
    });
    const b = await mkBreach({ jurisdictionCode: "EU" });
    expect(b.notificationWindowHours).toBe(24);
    const hours = Math.round(
      (new Date(b.notifyDueAt).getTime() - new Date(b.detectedAt).getTime()) /
        (60 * 60 * 1000),
    );
    expect(hours).toBe(24);
  });

  it("honours an explicit notificationWindowHours override", async () => {
    const b = await mkBreach({ notificationWindowHours: 6 });
    expect(b.notificationWindowHours).toBe(6);
  });

  it("increments the reference sequence per org per year", async () => {
    const a = await mkBreach();
    const b = await mkBreach({ title: "Second breach" });
    expect(a.reference).toMatch(/-0001$/);
    expect(b.reference).toMatch(/-0002$/);
  });

  it("walks a valid state machine path detected→assessing→notifying→notified→contained→closed", async () => {
    const b = await mkBreach();
    const s1 = await caller.breach.transition({ id: b.id, toStatus: "assessing" });
    expect(s1.status).toBe("assessing");
    const s2 = await caller.breach.transition({ id: b.id, toStatus: "notifying" });
    expect(s2.status).toBe("notifying");
    const s3 = await caller.breach.transition({ id: b.id, toStatus: "notified" });
    expect(s3.status).toBe("notified");
    // reaching "notified" stamps both notification clocks
    expect(s3.boardNotifiedAt).not.toBeNull();
    expect(s3.principalsNotifiedAt).not.toBeNull();
    const s4 = await caller.breach.transition({ id: b.id, toStatus: "contained" });
    expect(s4.status).toBe("contained");
    expect(s4.containedAt).not.toBeNull();
    const s5 = await caller.breach.transition({ id: b.id, toStatus: "closed" });
    expect(s5.status).toBe("closed");
    expect(s5.closedAt).not.toBeNull();

    const full = await caller.breach.get({ id: b.id });
    // created + 5 transitions
    expect(full.events.length).toBe(6);
  });

  it("rejects an invalid transition and blocks transitions out of closed", async () => {
    const b = await mkBreach();
    // detected → notified is not allowed
    await expect(
      caller.breach.transition({ id: b.id, toStatus: "notified" }),
    ).rejects.toThrow(/Invalid breach transition/i);

    // drive to closed, then confirm terminal
    await caller.breach.transition({ id: b.id, toStatus: "closed" });
    await expect(
      caller.breach.transition({ id: b.id, toStatus: "assessing" }),
    ).rejects.toThrow(/Invalid breach transition/i);
  });

  it("notify stamps the Board / Principals clocks and appends to the trail", async () => {
    const b = await mkBreach();
    const afterBoard = await caller.breach.notify({ id: b.id, audience: "board" });
    expect(afterBoard.boardNotifiedAt).not.toBeNull();
    expect(afterBoard.principalsNotifiedAt).toBeNull();
    const afterPrincipals = await caller.breach.notify({ id: b.id, audience: "principals" });
    expect(afterPrincipals.principalsNotifiedAt).not.toBeNull();

    const full = await caller.breach.get({ id: b.id });
    const types = full.events.map((e: any) => e.eventType);
    expect(types).toEqual(
      expect.arrayContaining(["created", "board_notified", "principals_notified"]),
    );
  });

  it("assign and addNote append to the trail without changing status", async () => {
    const b = await mkBreach();
    await caller.breach.assign({ id: b.id, assignedToUserId: adminId });
    await caller.breach.addNote({ id: b.id, note: "Scoped the affected dataset" });
    const full = await caller.breach.get({ id: b.id });
    expect(full.assignedToUserId).toBe(adminId);
    expect(full.status).toBe("detected");
    const types = full.events.map((e: any) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(["created", "assigned", "note"]));
  });

  it("slaSummary counts overdue vs due-soon vs closed", async () => {
    // overdue: detected 4 days ago, 72h window → due 1 day in the past, unnotified
    const overdue = await mkBreach({
      title: "Overdue breach",
      detectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      notificationWindowHours: 72,
    });
    // due-soon: detected now, 12h window
    await mkBreach({ title: "Soon breach", notificationWindowHours: 12 });
    // closed
    const toClose = await mkBreach({ title: "Done breach" });
    await caller.breach.transition({ id: toClose.id, toStatus: "closed" });

    const s = await caller.breach.slaSummary();
    expect(s.total).toBe(3);
    expect(s.closed).toBe(1);
    expect(s.overdue).toBeGreaterThanOrEqual(1);
    expect(s.dueSoon).toBeGreaterThanOrEqual(1);

    const overdueList = await caller.breach.list({ overdueOnly: true });
    expect(overdueList.some((r: any) => r.id === overdue.id)).toBe(true);
  });

  it("notified breaches are no longer counted as overdue", async () => {
    // overdue clock but principals already notified → satisfied
    const b = await mkBreach({
      title: "Late but notified",
      detectedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      notificationWindowHours: 72,
    });
    await caller.breach.notify({ id: b.id, audience: "both" });
    const overdueList = await caller.breach.list({ overdueOnly: true });
    expect(overdueList.some((r: any) => r.id === b.id)).toBe(false);
  });

  it("is tenant-isolated: another org cannot see or mutate this org's breach", async () => {
    const b = await mkBreach();
    const other = await seedFullOrg();
    const foreign = complianceRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    const foreignList = await foreign.breach.list();
    expect(foreignList.find((r: any) => r.id === b.id)).toBeUndefined();
    await expect(foreign.breach.get({ id: b.id })).rejects.toThrow(/not found/i);
    await expect(
      foreign.breach.transition({ id: b.id, toStatus: "assessing" }),
    ).rejects.toThrow(/not found/i);

    const db = testDb();
    const [row] = await db
      .select()
      .from(dpdpBreachIncidents)
      .where(eq(dpdpBreachIncidents.id, b.id));
    expect(row!.status).toBe("detected");
  });

  it("denies access to a member without the compliance module", async () => {
    const seeded = await seedFullOrg();
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
    await expect(member.breach.list()).rejects.toThrow(/(FORBIDDEN|Permission denied)/i);
  });
});
