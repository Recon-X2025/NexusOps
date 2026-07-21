/**
 * G1 — Statutory-ceiling resolver tests.
 *
 * Verifies the versioned `statutory_ceilings` config resolves to the correct
 * `StatutoryCeilingOverrides` for a pay period:
 *   - no rows  → {} (payroll-math falls back to built-in constants)
 *   - platform default (orgId NULL) is applied
 *   - an org-scoped row overrides the platform default
 *   - effective-date window is honoured (from inclusive, to exclusive)
 *   - PT slab + LWF rate tables round-trip through slabsJson
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, testDb } from "./helpers";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { statutoryCeilings, eq } from "@coheronconnect/db";

describe("G1: statutory-ceiling resolver", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  afterEach(async () => {
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.orgId, orgId));
  });

  it("returns {} when no config rows apply (pre-Labour-Code period)", async () => {
    // Migration 0054 seeds platform-default ceilings effective 2025-11-21, so a
    // period BEFORE that date resolves to {} and payroll-math falls back to its
    // built-in constants.
    const out = await resolveStatutoryCeilings(testDb(), orgId, new Date("2025-01-01"));
    expect(out).toEqual({});
  });

  it("applies a platform-default PF wage ceiling", async () => {
    await testDb().insert(statutoryCeilings).values({
      orgId: null,
      metricKey: "pf_wage_ceiling",
      value: "15000",
      effectiveFrom: new Date("2020-04-01"),
    });
    const out = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    expect(out.pfWageCeiling).toBe(15000);
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.metricKey, "pf_wage_ceiling"));
  });

  it("org-scoped row overrides the platform default", async () => {
    await testDb().insert(statutoryCeilings).values([
      {
        orgId: null,
        metricKey: "pf_wage_ceiling",
        value: "15000",
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "pf_wage_ceiling",
        value: "21000",
        effectiveFrom: new Date("2020-04-01"),
      },
    ]);
    const out = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    expect(out.pfWageCeiling).toBe(21000);
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.metricKey, "pf_wage_ceiling"));
  });

  it("honours the effective-date window (from inclusive, to exclusive)", async () => {
    await testDb().insert(statutoryCeilings).values([
      {
        orgId,
        metricKey: "esi_wage_ceiling",
        value: "21000",
        effectiveFrom: new Date("2020-04-01"),
        effectiveTo: new Date("2026-04-01"),
      },
      {
        orgId,
        metricKey: "esi_wage_ceiling",
        value: "27000",
        effectiveFrom: new Date("2026-04-01"),
      },
    ]);
    const before = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-03-31"));
    const after = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-04-01"));
    expect(before.esiWageCeiling).toBe(21000);
    expect(after.esiWageCeiling).toBe(27000);
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.metricKey, "esi_wage_ceiling"));
  });

  it("round-trips PT slab and LWF rate tables", async () => {
    await testDb().insert(statutoryCeilings).values([
      {
        orgId,
        metricKey: "pt_slab",
        stateCode: "MAHARASHTRA",
        slabsJson: {
          annualCap: 2500,
          slabs: [
            { from: 0, to: 7500, monthly: 0 },
            { from: 7501, to: 99999999, monthly: 200 },
          ],
        },
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "lwf_rate",
        stateCode: "MAHARASHTRA",
        slabsJson: { employee: 12, employer: 36, frequency: "HALF_YEARLY" },
        effectiveFrom: new Date("2020-04-01"),
      },
    ]);
    const out = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    expect(out.ptSlabs?.MAHARASHTRA?.annualCap).toBe(2500);
    expect(out.lwfRates?.MAHARASHTRA?.employee).toBe(12);
  });
});
