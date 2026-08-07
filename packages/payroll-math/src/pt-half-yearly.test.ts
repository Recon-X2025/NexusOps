/**
 * C2-STRUCT — half-yearly Professional Tax (Kerala, Tamil Nadu).
 *
 * These states levy PT once per six-month period (H1 = Apr–Sep, H2 = Oct–Mar) on the WHOLE
 * period's income, collected in ONE month with nothing deducted in the other five. The core
 * safety rule this suite pins: the assessment MUST cover all six months, or it FLAGS and
 * deducts ₹0 — it never computes from a partial period (which would land a lower income in a
 * lower bracket → silent under-collection). "Partial" has two causes, kept distinct:
 *   - DATA    — an earlier period month is missing from history (a migration gap), and/or
 *   - TIMING  — a later period month has not yet elapsed (collection before the period end).
 *
 * Deposit-month defaults are Sep (H1) and Feb (H2) — see PT_HALF_YEARLY_DEPOSIT_MONTH; the
 * Aug-vs-Sep / Jan-vs-Feb choice is with the CA. NOTE: Feb precedes the H2 period end (March),
 * so H2 ALWAYS flags on timing under the current default — proven below.
 */

import { describe, it, expect } from "vitest";
import {
  computePT,
  ptPriorPeriodMonths,
  ptUnelapsedTailMonths,
  assessHalfYearlyPtAtCollection,
} from "./statutory-deductions";

// FY months: Apr=1 … Mar=12
const APR = 1, MAY = 2, AUG = 5, SEP = 6, OCT = 7, JAN = 10, FEB = 11, MAR = 12;

// Tamil Nadu half-yearly income bands (for the direct assessment tests).
const TN_SLABS = [
  { from: 0, to: 21_000, monthly: 0 },
  { from: 21_001, to: 30_000, monthly: 135 },
  { from: 30_001, to: 45_000, monthly: 315 },
  { from: 45_001, to: 60_000, monthly: 690 },
  { from: 60_001, to: 75_000, monthly: 1_025 },
  { from: 75_001, to: Infinity, monthly: 1_250 },
];

describe("ptUnelapsedTailMonths — the period tail not yet elapsed at a collection month", () => {
  it("is empty only at the period END (Sep for H1, Mar for H2) — fully assessable", () => {
    expect(ptUnelapsedTailMonths(SEP)).toEqual([]); // H1 ends in Sep
    expect(ptUnelapsedTailMonths(MAR)).toEqual([]); // H2 ends in Mar
  });
  it("is non-empty when collection falls before the period end (flags on timing)", () => {
    expect(ptUnelapsedTailMonths(AUG)).toEqual([6]); // Aug H1 collection → Sep unelapsed
    expect(ptUnelapsedTailMonths(FEB)).toEqual([12]); // Feb H2 collection → Mar unelapsed
    expect(ptUnelapsedTailMonths(JAN)).toEqual([11, 12]); // Jan H2 collection → Feb+Mar unelapsed
  });
});

describe("assessHalfYearlyPtAtCollection — full-period-or-flag, directly exercisable", () => {
  it("H1 at September (period end) with all earlier months → computes the lump", () => {
    // ₹40,000/mo → six-month income ₹240,000 → top band → ₹1,250.
    const r = assessHalfYearlyPtAtCollection(SEP, TN_SLABS, 40_000, 40_000 * 5, []);
    expect(r.deposited).toBe(true);
    expect(r.incompletePeriod).toBe(false);
    expect(r.ptAmount).toBe(1_250);
  });

  it("H1 FLIPPED TO AUGUST → flags on the unelapsed September tail, does NOT compute on 5 months", () => {
    // This is the regression proving the deposit-month constant is safe to change: if H1 were
    // collected in August, the six-month income is not yet known, so it MUST flag — never
    // assess the ₹200,000 (five-month) figure into a lower bracket.
    const r = assessHalfYearlyPtAtCollection(AUG, TN_SLABS, 40_000, 40_000 * 4, []);
    expect(r.deposited).toBe(false);
    expect(r.ptAmount).toBe(0);
    expect(r.incompletePeriod).toBe(true);
    expect(r.incompleteUnelapsedMonths).toEqual([6]); // September, not yet elapsed (TIMING)
    expect(r.incompleteMissingMonths).toEqual([]); // history was complete — not a data cause
  });

  it("flags on DATA cause when an earlier month is missing (even at the period end)", () => {
    const r = assessHalfYearlyPtAtCollection(SEP, TN_SLABS, 40_000, 40_000 * 4, [AUG]);
    expect(r.incompletePeriod).toBe(true);
    expect(r.incompleteMissingMonths).toEqual([AUG]);
    expect(r.incompleteUnelapsedMonths).toEqual([]);
    expect(r.ptAmount).toBe(0);
  });

  it("no prior income supplied at all → treats every earlier month as a data gap", () => {
    const r = assessHalfYearlyPtAtCollection(SEP, TN_SLABS, 40_000, null, undefined);
    expect(r.incompletePeriod).toBe(true);
    expect(r.incompleteMissingMonths).toEqual([1, 2, 3, 4, 5]); // Apr–Aug
    expect(r.ptAmount).toBe(0);
  });
});

describe("ptPriorPeriodMonths — earlier months a caller gathers from payslips", () => {
  it("Tamil Nadu at Sep needs Apr–Aug; at Feb needs Oct–Jan", () => {
    expect(ptPriorPeriodMonths("Tamil Nadu", SEP)).toEqual([1, 2, 3, 4, 5]);
    expect(ptPriorPeriodMonths("Tamil Nadu", FEB)).toEqual([7, 8, 9, 10]);
  });
  it("is empty in a non-collection month and for a MONTHLY state", () => {
    expect(ptPriorPeriodMonths("Tamil Nadu", MAY)).toEqual([]);
    expect(ptPriorPeriodMonths("Karnataka", SEP)).toEqual([]);
  });
});

describe("Tamil Nadu — half-yearly PT through computePT", () => {
  it("H1: deducts the six-month lump ONLY in September, on half-yearly income", () => {
    const prior = { periodPriorGross: 40_000 * 5, periodMissingMonths: [] };
    const sep = computePT(40_000, "Tamil Nadu", SEP, undefined, prior);
    expect(sep.ptAmount).toBe(1_250);
    expect(sep.deposited).toBe(true);
    expect(sep.levyPeriod).toBe("HALF_YEARLY");
  });

  it("picks the correct bracket from half-yearly income (₹30,000 → ₹135)", () => {
    const r = computePT(5_000, "Tamil Nadu", SEP, undefined, {
      periodPriorGross: 5_000 * 5,
      periodMissingMonths: [],
    });
    expect(r.ptAmount).toBe(135);
  });

  it("deducts NOTHING (unflagged) in the five non-collection months of H1", () => {
    for (const m of [APR, MAY, 3, 4, AUG]) {
      const r = computePT(40_000, "Tamil Nadu", m);
      expect(r.ptAmount).toBe(0);
      expect(r.deposited).toBe(false);
      expect(r.incompletePeriod).toBeFalsy();
    }
  });

  it("H1 cold start (Aug missing from history) → flags DATA cause, deducts ₹0", () => {
    const r = computePT(40_000, "Tamil Nadu", SEP, undefined, {
      periodPriorGross: 40_000 * 4,
      periodMissingMonths: [AUG],
    });
    expect(r.ptAmount).toBe(0);
    expect(r.incompletePeriod).toBe(true);
    expect(r.incompleteMissingMonths).toEqual([AUG]);
    expect(r.incompleteUnelapsedMonths).toBeUndefined();
  });

  it("no period context supplied in the collection month → flags, never assesses from one month", () => {
    const r = computePT(40_000, "Tamil Nadu", SEP);
    expect(r.ptAmount).toBe(0);
    expect(r.incompletePeriod).toBe(true);
  });
});

describe("Kerala — half-yearly PT through computePT", () => {
  it("H1: lump in September on half-yearly income (₹30,000 → ₹300)", () => {
    const r = computePT(5_000, "Kerala", SEP, undefined, {
      periodPriorGross: 5_000 * 5,
      periodMissingMonths: [],
    });
    expect(r.ptAmount).toBe(300);
    expect(r.deposited).toBe(true);
  });

  it("H2 in February ALWAYS flags on TIMING (March unelapsed), even with complete history", () => {
    // The correction: Feb precedes the H2 period end (March). Assessing Oct–Feb (5 months)
    // would under-collect vs the true Oct–Mar income, so it MUST flag rather than compute.
    const feb = computePT(6_000, "Kerala", FEB, undefined, {
      periodPriorGross: 6_000 * 4, // Oct–Jan all on record
      periodMissingMonths: [],
    });
    expect(feb.ptAmount).toBe(0);
    expect(feb.deposited).toBe(false);
    expect(feb.incompletePeriod).toBe(true);
    expect(feb.incompleteUnelapsedMonths).toEqual([MAR]); // March, not yet elapsed
    expect(feb.incompleteMissingMonths).toBeUndefined(); // history complete — timing only
  });

  it("deducts nothing (unflagged) in the non-collection months of H2 (Oct–Jan, Mar)", () => {
    for (const m of [OCT, 8, 9, JAN, MAR]) {
      const r = computePT(6_000, "Kerala", m);
      expect(r.ptAmount).toBe(0);
      expect(r.deposited).toBe(false);
      expect(r.incompletePeriod).toBeFalsy();
    }
  });
});

describe("Karnataka stays MONTHLY (must not regress)", () => {
  it("₹200 above ₹25,000, ₹300 in February, nil to ₹25,000", () => {
    const apr = computePT(30_000, "Karnataka", APR);
    expect(apr.ptAmount).toBe(200);
    expect(apr.levyPeriod).toBe("MONTHLY");
    expect(apr.deposited).toBeUndefined();
    expect(computePT(30_000, "Karnataka", FEB).ptAmount).toBe(300);
    expect(computePT(25_000, "Karnataka", APR).ptAmount).toBe(0);
    expect(computePT(20_000, "Karnataka", FEB).ptAmount).toBe(0);
  });
});

describe("Delhi still returns a silent nil (no warning), any month", () => {
  it("₹0 with no unknownState / incompletePeriod flags", () => {
    for (const m of [APR, SEP, FEB]) {
      const r = computePT(50_000, "Delhi", m);
      expect(r.ptAmount).toBe(0);
      expect(r.unknownState).toBeFalsy();
      expect(r.incompletePeriod).toBeFalsy();
    }
  });
});
