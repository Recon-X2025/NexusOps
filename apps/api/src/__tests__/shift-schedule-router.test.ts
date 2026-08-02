/**
 * G8 — Shift-schedule admin CRUD + shift-aware self-service punch (end-to-end).
 *
 * Proves the admin surface and the punch wiring together:
 *   - create/list/update a shift,
 *   - setDefault demotes the incumbent (one default per org, index-safe),
 *   - assign links/unlinks a shift on an employee (org-scoped),
 *   - a self-service sign-in is classified against the EFFECTIVE shift:
 *       · assigned shift that already started long ago → `late`,
 *       · assigned shift starting in the future → `present`,
 *       · unassigned but an org default exists → default drives the status,
 *   - cross-tenant assignment / promotion is refused.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockContext, seedFullOrg, cleanupOrg, testDb } from "./helpers";
import { hrRouter } from "../routers/hr";
import { employees, salaryStructures, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("G8: shift-schedule admin CRUD + shift-aware punch", () => {
  let caller: any;
  let orgId: string;
  let adminUserId: string;
  let empId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminUserId = seeded.adminId;
    caller = hrRouter.createCaller(createMockContext(seeded.adminId, orgId));

    const [s] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "780000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();

    // Link an employee to the admin user so self-service resolves from ctx.user.
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: adminUserId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    empId = e!.id;

    // Pin the wall clock to local noon *after* all seeding I/O is done, so the
    // shift-start offsets below and the punch's own `new Date()` share one fixed
    // "now" that never sits near a midnight boundary. Fake only `Date` (not the
    // timer functions) so DB I/O and connection keep-alives run on the real clock.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"], now: noon });
  });

  afterEach(async () => {
    // Restore the real clock before any cleanup I/O.
    vi.useRealTimers();
    await cleanupOrg(orgId);
  });

  /**
   * A shift start `deltaMinutes` before/after "now", as a minutes-past-midnight
   * offset (the shift model's unit — see lib/india/shift-schedule.ts).
   *
   * The clock is pinned to local noon for this suite (see beforeEach), so "now"
   * is a fixed 12:00 = 720 min. That is the ONLY robust way to express offsets
   * like −60 / +120 min: `derivePunch` compares raw minute-of-day with no notion
   * of *which* day, so any offset taken from the live wall clock breaks the moment
   * `now ± delta` crosses 00:00 or 23:59 (a past offset near midnight clamps/wraps
   * to the wrong side and a "started 60 min ago" shift reads as on-time). Pinning
   * `now` to mid-day keeps 12:00 ± a couple of hours safely inside [0, 1439] and
   * makes the punch's own `new Date()` agree with the offset we compute here.
   */
  const NOON_MINUTE = 12 * 60;
  function minutesFromNow(deltaMinutes: number): number {
    return NOON_MINUTE + deltaMinutes;
  }

  it("create → list returns the shift; create is org-scoped", async () => {
    const created = await caller.shifts.create({
      name: "General",
      startMinutes: 540,
      durationMinutes: 480,
      graceMinutes: 10,
    });
    expect(created.name).toBe("General");
    expect(created.isDefault).toBe(false);

    const list = await caller.shifts.list();
    expect(list.map((s: any) => s.name)).toContain("General");
  });

  it("update patches only the given fields", async () => {
    const created = await caller.shifts.create({ name: "Night" });
    const updated = await caller.shifts.update({ id: created.id, graceMinutes: 30 });
    expect(updated.graceMinutes).toBe(30);
    expect(updated.name).toBe("Night"); // untouched
  });

  it("update on a foreign id is refused", async () => {
    await expect(
      caller.shifts.update({ id: crypto.randomUUID(), name: "x" }),
    ).rejects.toThrow(/not found/i);
  });

  it("setDefault demotes the incumbent (one default per org)", async () => {
    const a = await caller.shifts.create({ name: "A", isDefault: true });
    const b = await caller.shifts.create({ name: "B" });
    await caller.shifts.setDefault({ id: b.id });

    const list = await caller.shifts.list();
    const byId = new Map(list.map((s: any) => [s.id, s]));
    expect(byId.get(a.id).isDefault).toBe(false);
    expect(byId.get(b.id).isDefault).toBe(true);
    // exactly one default
    expect(list.filter((s: any) => s.isDefault)).toHaveLength(1);
  });

  it("creating a second default demotes the first at insert time", async () => {
    const a = await caller.shifts.create({ name: "A", isDefault: true });
    const b = await caller.shifts.create({ name: "B", isDefault: true });
    const list = await caller.shifts.list();
    const byId = new Map(list.map((s: any) => [s.id, s]));
    expect(byId.get(a.id).isDefault).toBe(false);
    expect(byId.get(b.id).isDefault).toBe(true);
  });

  it("assign links then unlinks a shift on an employee", async () => {
    const shift = await caller.shifts.create({ name: "General" });
    const linked = await caller.shifts.assign({ employeeId: empId, shiftScheduleId: shift.id });
    expect(linked.shiftScheduleId).toBe(shift.id);

    const unlinked = await caller.shifts.assign({ employeeId: empId, shiftScheduleId: null });
    expect(unlinked.shiftScheduleId).toBeNull();
  });

  it("assign refuses a foreign shift id", async () => {
    await expect(
      caller.shifts.assign({ employeeId: empId, shiftScheduleId: crypto.randomUUID() }),
    ).rejects.toThrow(/not found/i);
  });

  it("setDefault on a foreign id is refused", async () => {
    await expect(
      caller.shifts.setDefault({ id: crypto.randomUUID() }),
    ).rejects.toThrow(/not found/i);
  });

  it("assigned shift that started >grace ago → sign-in is late", async () => {
    // Shift started 60 min ago with a 10-min grace → punching now is late.
    const shift = await caller.shifts.create({
      name: "EarlyBird",
      startMinutes: minutesFromNow(-60),
      durationMinutes: 480,
      graceMinutes: 10,
    });
    await caller.shifts.assign({ employeeId: empId, shiftScheduleId: shift.id });

    const rec = await caller.attendance.signIn({});
    expect(rec.status).toBe("late");
    expect(rec.lateMinutes).toBeGreaterThanOrEqual(55);
  });

  it("assigned shift starting later → sign-in is present, not late", async () => {
    const shift = await caller.shifts.create({
      name: "LateStart",
      startMinutes: minutesFromNow(120), // starts 2h from now
      durationMinutes: 480,
      graceMinutes: 10,
    });
    await caller.shifts.assign({ employeeId: empId, shiftScheduleId: shift.id });

    const rec = await caller.attendance.signIn({});
    expect(rec.status).toBe("present");
    expect(rec.lateMinutes).toBe(0);
  });

  it("no assigned shift but an org default that already started → default drives late", async () => {
    // No assignment; a default shift started 60 min ago → punch is late via default.
    await caller.shifts.create({
      name: "OrgDefault",
      startMinutes: minutesFromNow(-60),
      durationMinutes: 480,
      graceMinutes: 10,
      isDefault: true,
    });

    const rec = await caller.attendance.signIn({});
    expect(rec.status).toBe("late");
  });
});
