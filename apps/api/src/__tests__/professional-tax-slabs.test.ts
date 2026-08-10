/**
 * Professional Tax — data-driven slabs from `professional_tax_slabs`.
 * ─────────────────────────────────────────────────────────────────────────────
 * PT slabs were an in-code lookup covering 8 states; states outside it (e.g. Haryana)
 * were indistinguishable from a misspelling — both surfaced as `unknownState`. They are
 * now seeded (36 states/UTs) into `professional_tax_slabs` and projected by
 * `resolveStatutoryCeilings` into `overrides.ptSlabs`, which `computePT` consumes. The
 * key invariant this suite locks: a NON-LEVYING state is a RECORDED NIL, distinct from an
 * UNKNOWN (unrecognised) state.
 *
 * Every seeded rate is SECONDARY-sourced (docs/reference/professional-tax-slabs.json) —
 * these tests assert the seeded behaviour, they do NOT certify any rate as verified.
 *
 * Real Postgres; platform-default PT rows are seeded by migration 0075.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { computePT } from "@coheronconnect/payroll-math";
import { seedTestOrg, testDb } from "./helpers";

const PERIOD = new Date(2026, 8, 1); // Sep 2026 — any date within the platform-default window

describe("professional tax — data-driven from professional_tax_slabs", () => {
  let orgId: string;
  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  it("a LEVYING state returns its slab for a salary and cadence", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    expect(ov.ptSlabs).toBeDefined();

    // West Bengal (already in-code): ₹200 at ₹65,000/month.
    expect(computePT(65000, "West Bengal", 6, ov.ptSlabs).ptAmount).toBe(200);
    // Assam — a state NOT in the old in-code table — now computes from the seed:
    // file band 25000+ = ₹208/month. (Before the seed this was an unknownState 0.)
    const assam = computePT(30000, "Assam", 6, ov.ptSlabs);
    expect(assam.ptAmount).toBe(208);
    expect(assam.unknownState).toBeUndefined();
  });

  it("a NON-LEVYING state returns a RECORDED NIL, distinct from unknown", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    for (const state of ["Haryana", "Delhi", "Uttar Pradesh"]) {
      const pt = computePT(65000, state, 6, ov.ptSlabs);
      expect(pt.ptAmount).toBe(0);
      // The distinguishing invariant: a recorded non-levy is NOT flagged unknown.
      expect(pt.unknownState).toBeUndefined();
    }
  });

  it("an UNRECOGNISED state is distinguishable from both (flagged unknown)", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    const bogus = computePT(65000, "Freedonia", 6, ov.ptSlabs);
    expect(bogus.ptAmount).toBe(0);
    expect(bogus.unknownState).toBe(true);
  });

  it("Karnataka: nil below ₹25,000 (unchanged), ₹200 above", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    // The disputed threshold: at ₹20,833/month PT is ₹0 (the earlier '₹200 below
    // ₹25,000' over-deduction does not occur — engine and file both exempt below ₹25k).
    expect(computePT(20833, "Karnataka", 6, ov.ptSlabs).ptAmount).toBe(0);
    expect(computePT(30000, "Karnataka", 6, ov.ptSlabs).ptAmount).toBe(200);
  });

  it("Kerala & Tamil Nadu are half-yearly and now carry the file's slabs", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    expect(ov.ptSlabs!.KERALA?.levyPeriod).toBe("HALF_YEARLY");
    expect(ov.ptSlabs!.TAMIL_NADU?.levyPeriod).toBe("HALF_YEARLY");
    // File values (differ from the old in-code slabs — the adopted-from-file deltas):
    // Kerala band [12000-17999] = ₹320 (was ₹120 in-code); TN band [21001-30000] = ₹180 (was ₹135).
    expect(ov.ptSlabs!.KERALA.slabs.find((s) => s.from === 12000)?.monthly).toBe(320);
    expect(ov.ptSlabs!.TAMIL_NADU.slabs.find((s) => s.from === 21001)?.monthly).toBe(180);
  });

  it("a cadence the engine cannot compute (annual/quarterly) is NOT projected", async () => {
    const ov = await resolveStatutoryCeilings(testDb(), orgId, PERIOD);
    // Bihar (annual) and Jharkhand (quarterly) are seeded as data but not projected into
    // the override — the engine flags them rather than compute a wrong monthly amount.
    expect(ov.ptSlabs!.BIHAR).toBeUndefined();
    expect(ov.ptSlabs!.JHARKHAND).toBeUndefined();
    expect(computePT(65000, "Bihar", 6, ov.ptSlabs).unknownState).toBe(true);
  });
});
