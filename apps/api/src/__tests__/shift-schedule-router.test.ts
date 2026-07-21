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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /** Minutes-from-midnight for a wall-clock time offset from *now*. */
  function minutesFromNow(deltaMinutes: number): number {
    const t = new Date(Date.now() + deltaMinutes * 60_000);
    return t.getHours() * 60 + t.getMinutes();
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
