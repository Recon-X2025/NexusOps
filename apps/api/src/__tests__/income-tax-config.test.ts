/**
 * C5 — Income-tax rate set → effective-dated config.
 * ──────────────────────────────────────────────────
 * The income-tax constants in `@coheronconnect/payroll-math` (`tax-engine.ts`)
 * are now injectable via the effective-dated `statutory_ceilings` table. This
 * suite proves the four properties the change must hold:
 *
 *  1. FALLBACK / BYTE-IDENTICAL (the most important): an org with NO tax rows (the
 *     state of every org today) resolves `taxConfig === undefined`, and
 *     `computeTax(profile)` output is IDENTICAL to `computeTax(profile, undefined)`.
 *     We reconstruct the expected figures from the constants and assert equality —
 *     not merely "no error".
 *  2. PROSPECTIVE-ONLY (a real scenario): a rate row seeded effective mid-year must
 *     leave a payroll for a period BEFORE it unchanged, and change only periods on
 *     or after it. A past payroll run is a legal record and must not be recomputed.
 *  3. ROUND-TRIP: a seeded slab set that DIFFERS from the constant actually takes
 *     effect (guards against the silent `?? constant` fallback when a blob is
 *     malformed).
 *  4. TWO-REGIME: OLD and NEW slab rows coexist, and each regime path reads its own.
 *
 * NOTE on migration 0064: it seeds PLATFORM-DEFAULT income-tax rows whose values
 * equal the current constants — OLD/agnostic eff. 2020-04-01, NEW eff. 2025-04-01.
 * So for any modern period the resolver returns a `taxConfig` that equals the
 * constants. The fallback test uses this to prove "config == constants" byte-for-byte.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, testDb } from "./helpers";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { statutoryCeilings, eq } from "@coheronconnect/db";
import {
  computeTax,
  type EmployeeTaxProfile,
  type TaxConfigOverride,
} from "../lib/india-tax-engine";

// ─── PROFILE HELPER ────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<EmployeeTaxProfile> = {}): EmployeeTaxProfile {
  return {
    regime: "NEW",
    annualCTC: 1_200_000,
    basicMonthly: 50_000,
    hraMonthly: 20_000,
    specialAllowance: 20_000,
    lta: 30_000,
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    employeePFMonthly: 1_800,
    employerPFMonthly: 1_800,
    professionalTax: 2_400,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
    ...overrides,
  };
}

// A spread of incomes chosen to exercise every rate branch: below rebate, above
// rebate, mid-slabs, and into each surcharge band (with marginal relief).
const INCOME_SWEEP = [
  375_000, 900_000, 1_200_000, 1_600_000, 2_500_000, 5_200_000, 10_500_000,
  21_000_000, 55_000_000,
];

describe("C5: income-tax config — fallback is byte-identical", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  afterEach(async () => {
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.orgId, orgId));
  });

  it("computeTax(profile) === computeTax(profile, undefined) for both regimes across the income sweep", () => {
    for (const regime of ["OLD", "NEW"] as const) {
      for (const annualCTC of INCOME_SWEEP) {
        const profile = makeProfile({ regime, annualCTC });
        const noArg = computeTax(profile);
        const explicitUndefined = computeTax(profile, undefined);
        const emptyConfig = computeTax(profile, {});
        // An absent config, an explicit undefined, and an empty object must all
        // resolve every value to the in-code constant — identical output.
        expect(explicitUndefined).toEqual(noArg);
        expect(emptyConfig).toEqual(noArg);
      }
    }
  });

  it("reconstructs the expected NEW-regime figure from the constants and matches (₹16L, no rebate)", () => {
    // Reconstruct taxable + slab tax from the FA-2025 NEW-regime constants by hand,
    // mirroring computeTax's per-slab Math.round, then assert equality — an A12-style
    // invariance check, not a "no throw" check.
    const grossSalary = 1_600_000;
    const standardDeduction = 75_000; // NEW std deduction constant
    // professionalTax is set to 0 here so taxable = gross - stdDeduction cleanly;
    // computeTax also subtracts profile.professionalTax in BOTH regimes.
    const taxable = grossSalary - standardDeduction; // 15,25,000
    // NEW slabs (FA-2025): 0 / 5 / 10 / 15 / 20 / 25 / 30 in ₹4L bands to ₹24L.
    const bands = [
      { from: 0, to: 400_000, rate: 0 },
      { from: 400_000, to: 800_000, rate: 0.05 },
      { from: 800_000, to: 1_200_000, rate: 0.1 },
      { from: 1_200_000, to: 1_600_000, rate: 0.15 },
      { from: 1_600_000, to: 2_000_000, rate: 0.2 },
      { from: 2_000_000, to: 2_400_000, rate: 0.25 },
      { from: 2_400_000, to: Infinity, rate: 0.3 },
    ];
    let remaining = taxable;
    let expectedTax = 0;
    for (const b of bands) {
      const width = b.to === Infinity ? remaining : b.to - b.from;
      const inBand = Math.min(remaining, width);
      expectedTax += Math.round(inBand * b.rate);
      remaining -= inBand;
      if (remaining <= 0) break;
    }
    const cess = Math.round(expectedTax * 0.04); // taxable < ₹50L → no surcharge
    const expectedLiability = Math.round(expectedTax + cess);

    const result = computeTax(
      makeProfile({ regime: "NEW", annualCTC: grossSalary, professionalTax: 0 })
    );
    expect(result.taxOnIncome).toBe(expectedTax);
    expect(result.rebate87A).toBe(0);
    expect(result.totalTaxLiability).toBe(expectedLiability);
  });

  it("the migration-0064 platform defaults resolve to a config that reproduces the constants exactly", async () => {
    // For a modern period the resolver returns the seeded platform defaults (which
    // equal the constants). Passing that config into computeTax MUST be identical to
    // passing no config — proving the seed values are the constants byte-for-byte.
    const period = new Date("2026-05-01");
    const resolved = await resolveStatutoryCeilings(testDb(), orgId, period);
    expect(resolved.taxConfig).toBeDefined();

    for (const regime of ["OLD", "NEW"] as const) {
      for (const annualCTC of INCOME_SWEEP) {
        const profile = makeProfile({ regime, annualCTC });
        const fromConstants = computeTax(profile);
        const fromSeededConfig = computeTax(profile, resolved.taxConfig);
        expect(fromSeededConfig).toEqual(fromConstants);
      }
    }
  });
});

describe("C5: income-tax config — prospective-only (mid-year rate change)", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  afterEach(async () => {
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.orgId, orgId));
  });

  it("a NEW-slab change effective mid-year leaves an earlier period unchanged and changes only later periods", async () => {
    // Contract: the org keeps the default (=constant) NEW slabs until 2026-10-01,
    // then switches to a punitive flat-30%-from-₹0 set. A payroll for a period
    // BEFORE the switch must be byte-identical to the constant path; a period ON/
    // AFTER it must reflect the new slabs. Re-resolving the earlier period after the
    // switch row exists must STILL return the old value (past run is a legal record).
    const switchDate = new Date("2026-10-01");

    // Org-scoped rows: the current NEW slabs until switchDate, then the new ones.
    const currentNewSlabs = {
      slabs: [
        { from: 0, to: 400_000, rate: 0 },
        { from: 400_000, to: 800_000, rate: 0.05 },
        { from: 800_000, to: 1_200_000, rate: 0.1 },
        { from: 1_200_000, to: 1_600_000, rate: 0.15 },
        { from: 1_600_000, to: 2_000_000, rate: 0.2 },
        { from: 2_000_000, to: 2_400_000, rate: 0.25 },
        { from: 2_400_000, to: null, rate: 0.3 },
      ],
    };
    const punitiveNewSlabs = {
      slabs: [{ from: 0, to: null, rate: 0.3 }], // flat 30% from ₹0
    };

    await testDb().insert(statutoryCeilings).values([
      {
        orgId,
        metricKey: "income_tax_slabs",
        stateCode: "NEW",
        slabsJson: currentNewSlabs,
        effectiveFrom: new Date("2020-04-01"),
        effectiveTo: switchDate,
      },
      {
        orgId,
        metricKey: "income_tax_slabs",
        stateCode: "NEW",
        slabsJson: punitiveNewSlabs,
        effectiveFrom: switchDate,
      },
    ]);

    // professionalTax: 0 so the after-period slab math is a clean gross - std.
    const profile = makeProfile({ regime: "NEW", annualCTC: 1_600_000, professionalTax: 0 });

    // Period BEFORE the switch — must equal the constant/no-config result.
    const beforePeriod = new Date("2026-09-01");
    const beforeCfg = await resolveStatutoryCeilings(testDb(), orgId, beforePeriod);
    const beforeTax = computeTax(profile, beforeCfg.taxConfig);
    const constantTax = computeTax(profile);
    expect(beforeTax.totalTaxLiability).toBe(constantTax.totalTaxLiability);
    expect(beforeTax.taxOnIncome).toBe(constantTax.taxOnIncome);

    // Period ON/AFTER the switch — must reflect the punitive slabs (flat 30%).
    const afterPeriod = new Date("2026-11-01");
    const afterCfg = await resolveStatutoryCeilings(testDb(), orgId, afterPeriod);
    const afterTax = computeTax(profile, afterCfg.taxConfig);
    // Taxable = 16L - 75K std = 15,25,000 → 30% flat = 4,57,500 (before cess).
    expect(afterTax.taxOnIncome).toBe(Math.round(1_525_000 * 0.3));
    expect(afterTax.totalTaxLiability).toBeGreaterThan(constantTax.totalTaxLiability);

    // Re-resolving the earlier period AFTER the switch row exists still returns the
    // old value — the historical run is not silently recomputed.
    const beforeCfgAgain = await resolveStatutoryCeilings(testDb(), orgId, beforePeriod);
    const beforeTaxAgain = computeTax(profile, beforeCfgAgain.taxConfig);
    expect(beforeTaxAgain.totalTaxLiability).toBe(constantTax.totalTaxLiability);
  });
});

describe("C5: income-tax config — round-trip + two-regime", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  afterEach(async () => {
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.orgId, orgId));
  });

  it("a seeded slab set that DIFFERS from the constant actually takes effect (not the fallback)", async () => {
    // A distinctive NEW slab: flat 10% from ₹0. If the resolver silently fell back
    // to the constant (e.g. blob mis-keyed), the assertion below would fail.
    await testDb().insert(statutoryCeilings).values({
      orgId,
      metricKey: "income_tax_slabs",
      stateCode: "NEW",
      slabsJson: { slabs: [{ from: 0, to: null, rate: 0.1 }] },
      effectiveFrom: new Date("2020-04-01"),
    });

    const cfg = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    expect(cfg.taxConfig?.newSlabs).toBeDefined();
    // Top band's `to: null` normalised back to Infinity.
    expect(cfg.taxConfig?.newSlabs?.[0]?.to).toBe(Infinity);

    const profile = makeProfile({ regime: "NEW", annualCTC: 1_600_000, professionalTax: 0 });
    const seeded = computeTax(profile, cfg.taxConfig);
    const constant = computeTax(profile);
    // Taxable 15,25,000 at flat 10% = 1,52,500 — distinct from the constant curve.
    expect(seeded.taxOnIncome).toBe(Math.round(1_525_000 * 0.1));
    expect(seeded.taxOnIncome).not.toBe(constant.taxOnIncome);
  });

  it("OLD and NEW slab rows coexist and each regime path reads its own row", async () => {
    // Distinct, mutually-exclusive markers: OLD = flat 20% from ₹0, NEW = flat 5%.
    await testDb().insert(statutoryCeilings).values([
      {
        orgId,
        metricKey: "income_tax_slabs",
        stateCode: "OLD",
        slabsJson: { slabs: [{ from: 0, to: null, rate: 0.2 }] },
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "income_tax_slabs",
        stateCode: "NEW",
        slabsJson: { slabs: [{ from: 0, to: null, rate: 0.05 }] },
        effectiveFrom: new Date("2020-04-01"),
      },
    ]);

    const cfg = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    expect(cfg.taxConfig?.oldSlabs?.[0]?.rate).toBe(0.2);
    expect(cfg.taxConfig?.newSlabs?.[0]?.rate).toBe(0.05);

    // OLD regime: taxable = 16L - 50K std = 15,50,000 → 20% flat = 3,10,000.
    // professionalTax: 0 so the slab math is a clean gross - std.
    const oldProfile = makeProfile({ regime: "OLD", annualCTC: 1_600_000, professionalTax: 0 });
    const oldTax = computeTax(oldProfile, cfg.taxConfig);
    expect(oldTax.taxOnIncome).toBe(Math.round(1_550_000 * 0.2));

    // NEW regime: taxable = 16L - 75K std = 15,25,000 → 5% flat = 76,250.
    const newProfile = makeProfile({ regime: "NEW", annualCTC: 1_600_000, professionalTax: 0 });
    const newTax = computeTax(newProfile, cfg.taxConfig);
    expect(newTax.taxOnIncome).toBe(Math.round(1_525_000 * 0.05));
  });

  it("standard_deduction, rebate_87a, surcharge_bands, and cess_rate all round-trip", async () => {
    // Regime-agnostic + regime-specific scalars/blobs, distinct from constants.
    await testDb().insert(statutoryCeilings).values([
      {
        orgId,
        metricKey: "standard_deduction",
        stateCode: "NEW",
        value: "100000", // vs constant 75,000
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "rebate_87a",
        stateCode: "NEW",
        slabsJson: { threshold: 1_500_000, maxRebate: 80_000 }, // vs 12L/60k
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "cess_rate",
        value: "0.05", // vs constant 0.04
        effectiveFrom: new Date("2020-04-01"),
      },
      {
        orgId,
        metricKey: "surcharge_bands",
        slabsJson: { bands: [{ threshold: 1_000_000, rate: 0.5 }] },
        effectiveFrom: new Date("2020-04-01"),
      },
    ]);

    const cfg = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-05-01"));
    const tc = cfg.taxConfig as TaxConfigOverride;
    expect(tc.stdDeductionNew).toBe(100_000);
    expect(tc.rebate87aNew).toEqual({ threshold: 1_500_000, maxRebate: 80_000 });
    expect(tc.cessRate).toBe(0.05);
    expect(tc.surchargeBands).toEqual([{ threshold: 1_000_000, rate: 0.5 }]);

    // Standard deduction takes effect: ₹13L NEW → taxable 12L with the 100k std
    // (vs 12.25L under the 75k constant), so the seeded std deduction is applied.
    const profile = makeProfile({ regime: "NEW", annualCTC: 1_300_000, professionalTax: 0 });
    const seeded = computeTax(profile, cfg.taxConfig);
    expect(seeded.standardDeduction).toBe(100_000);
    expect(seeded.taxableIncome).toBe(1_300_000 - 100_000);
  });
});
