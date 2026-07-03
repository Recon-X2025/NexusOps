/**
 * Gratuity router tests (Sprint 1.4) — Payment of Gratuity Act, 1972.
 *
 * The gratuity router (module: "hr") owns persistence for two surfaces:
 *   - accrual: idempotent monthly liability provisioning with a running
 *     cumulative, driven by computeMonthlyGratuityAccrual.
 *   - settlement: the final statutory payout at exit (one per employee),
 *     driven by computeGratuity (5-year eligibility, 15/26 formula, ₹20L cap).
 * Verifies the money math wiring, idempotency, tenant isolation and RBAC.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { gratuityRouter } from "../routers/gratuity";
import { employees, salaryStructures, gratuityAccruals, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Gratuity router (Sprint 1.4)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;
  let seeded: Awaited<ReturnType<typeof seedFullOrg>>;

  /**
   * Seeds an employee on a salary structure whose monthly Basic+DA is
   * ₹26,000 (ctc 780,000 × basic 40% / 12 = 26,000) with a chosen start date.
   */
  async function seedEmployee(startDate: Date, ctcAnnual = 780_000): Promise<string> {
    const db = testDb();
    const { userId } = await seedUser(orgId, {
      email: `emp-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "requester",
      password: "TestPass123!",
    });
    const [struct] = await db
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: String(ctcAnnual),
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await db
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate,
        status: "active",
      })
      .returning();
    return emp!.id;
  }

  beforeEach(async () => {
    seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = gratuityRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  // ── Accrual ────────────────────────────────────────────────────────────────
  it("provisions a monthly accrual of (15/26 × Basic+DA)/12 = ₹1,250 for ₹26k Basic+DA", async () => {
    const empId = await seedEmployee(new Date("2020-01-01"));
    const row = await caller.accrual.provision({ employeeId: empId, year: 2026, month: 4 });
    expect(Number(row.basicPlusDA)).toBe(26_000);
    expect(Number(row.accrualAmount)).toBe(1_250);
    expect(Number(row.cumulativeAccrued)).toBe(1_250);
  });

  it("is idempotent per period and accumulates across months", async () => {
    const empId = await seedEmployee(new Date("2020-01-01"));
    await caller.accrual.provision({ employeeId: empId, year: 2026, month: 4 });
    await caller.accrual.provision({ employeeId: empId, year: 2026, month: 5 });
    // re-run April — must NOT double-count
    const april2 = await caller.accrual.provision({ employeeId: empId, year: 2026, month: 4 });

    const ledger = await caller.accrual.list({ employeeId: empId });
    expect(ledger.length).toBe(2); // still just two periods — no double-insert
    // cumulative is the total provisioned liability (order-independent): with
    // both April + May present each carries the full ₹2,500.
    const may = ledger.find((r: any) => r.month === 5);
    expect(Number(may.cumulativeAccrued)).toBe(2_500);
    // re-running April recomputes prior (May) + April accrual = ₹2,500, and
    // crucially did not create a third row.
    expect(Number(april2.cumulativeAccrued)).toBe(2_500);
  });

  it("provisionAll provisions the active workforce idempotently", async () => {
    await seedEmployee(new Date("2020-01-01"));
    await seedEmployee(new Date("2019-06-01"));
    const r1 = await caller.accrual.provisionAll({ year: 2026, month: 4 });
    expect(r1.provisioned).toBe(2);
    expect(r1.totalAccrued).toBe(2_500);
    // re-run → same count, no duplicate rows
    const r2 = await caller.accrual.provisionAll({ year: 2026, month: 4 });
    expect(r2.provisioned).toBe(2);
    const db = testDb();
    const rows = await db
      .select()
      .from(gratuityAccruals)
      .where(eq(gratuityAccruals.orgId, orgId));
    expect(rows.length).toBe(2);
  });

  // ── Settlement ───────────────────────────────────────────────────────────
  it("previews the statutory payout from tenure + Basic+DA", async () => {
    // start 2016-04-01, asOf 2026-04-01 → 10y0m
    const empId = await seedEmployee(new Date("2016-04-01"));
    const p = await caller.settlement.preview({
      employeeId: empId,
      asOf: new Date("2026-04-01").toISOString(),
    });
    expect(p.eligible).toBe(true);
    expect(p.countedYears).toBe(10);
    expect(p.gratuity).toBe(150_000); // (15/26)*26000*10
  });

  it("settle persists a single settlement and blocks a duplicate", async () => {
    const empId = await seedEmployee(new Date("2016-04-01"));
    const s = await caller.settlement.settle({
      employeeId: empId,
      asOf: new Date("2026-04-01").toISOString(),
      reason: "resignation",
    });
    expect(s.eligible).toBe(true);
    expect(Number(s.gratuityAmount)).toBe(150_000);
    expect(s.settledById).toBe(adminId);

    const fetched = await caller.settlement.get({ employeeId: empId });
    expect(fetched.id).toBe(s.id);

    await expect(
      caller.settlement.settle({ employeeId: empId, asOf: new Date("2026-04-01").toISOString() }),
    ).rejects.toThrow(/already settled/i);
  });

  it("marks under-5-year service ineligible, but waives on death", async () => {
    // 3 years only
    const empId = await seedEmployee(new Date("2023-04-01"));
    const resign = await caller.settlement.preview({
      employeeId: empId,
      asOf: new Date("2026-04-01").toISOString(),
    });
    expect(resign.eligible).toBe(false);

    const death = await caller.settlement.settle({
      employeeId: empId,
      asOf: new Date("2026-04-01").toISOString(),
      reason: "death",
    });
    expect(death.eligible).toBe(true);
    // (15/26)*26000*3 = 45,000
    expect(Number(death.gratuityAmount)).toBe(45_000);
  });

  it("caps the settlement at the ₹20L statutory ceiling", async () => {
    // huge CTC → Basic+DA = 20,00,000/mo; 30y service far exceeds the cap
    const empId = await seedEmployee(new Date("1996-04-01"), 600_000_000);
    const s = await caller.settlement.settle({
      employeeId: empId,
      asOf: new Date("2026-04-01").toISOString(),
      reason: "retirement",
    });
    expect(s.cappedAtCeiling).toBe(true);
    expect(Number(s.gratuityAmount)).toBe(2_000_000);
    expect(Number(s.grossGratuity)).toBeGreaterThan(2_000_000);
  });

  // ── Tenancy + RBAC ─────────────────────────────────────────────────────────
  it("is tenant-isolated: another org cannot provision or read this employee", async () => {
    const empId = await seedEmployee(new Date("2016-04-01"));
    const other = await seedFullOrg();
    const foreign = gratuityRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    await expect(
      foreign.accrual.provision({ employeeId: empId, year: 2026, month: 4 }),
    ).rejects.toThrow(/not found/i);
    await expect(
      foreign.settlement.preview({ employeeId: empId }),
    ).rejects.toThrow(/not found/i);
    const foreignLedger = await foreign.accrual.list({ employeeId: empId });
    expect(foreignLedger.length).toBe(0);
  });

  it("denies access to a member without the hr module", async () => {
    const empId = await seedEmployee(new Date("2016-04-01"));
    const memberCtx = createMockContext(seeded.requesterId, orgId, {
      user: {
        id: seeded.requesterId,
        orgId,
        email: "member@coheronconnect.io",
        name: "Member",
        role: "member",
        matrixRole: null,
        status: "active",
      },
    } as any);
    const member = gratuityRouter.createCaller(memberCtx);
    await expect(
      member.accrual.provision({ employeeId: empId, year: 2026, month: 4 }),
    ).rejects.toThrow(/(FORBIDDEN|Permission denied)/i);
  });
});
