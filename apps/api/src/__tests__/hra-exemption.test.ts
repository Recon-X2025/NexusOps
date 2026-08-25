/**
 * MED6 — HRA exemption under section 10(13A) / Rule 2A.
 * The exemption is the LEAST of: actual HRA received, rent paid − 10% of salary,
 * and 50% (metro) / 40% (non-metro) of salary, where salary = Basic + DA.
 */
import { describe, it, expect } from "vitest";
import { computeHraExemption } from "../lib/india/hra-exemption";

describe("computeHraExemption (§10(13A))", () => {
  it("returns 0 when rent is below 10% of salary (nothing exempt)", () => {
    expect(
      computeHraExemption({ hraReceived: 240000, salaryBasicDa: 600000, rentPaid: 50000, isMetro: true }),
    ).toBe(0);
  });

  it("binds on rent − 10% of salary when that is the least", () => {
    // actual HRA 240000; rent−10% = 300000−60000 = 240000; metro cap = 300000.
    expect(
      computeHraExemption({ hraReceived: 240000, salaryBasicDa: 600000, rentPaid: 300000, isMetro: true }),
    ).toBe(240000);
  });

  it("binds on the metro 50% cap when that is the least", () => {
    // actual HRA 400000; rent−10% = 500000−60000 = 440000; metro cap = 300000 → 300000.
    expect(
      computeHraExemption({ hraReceived: 400000, salaryBasicDa: 600000, rentPaid: 500000, isMetro: true }),
    ).toBe(300000);
  });

  it("uses the 40% cap for non-metro", () => {
    // metro cap would be 300000; non-metro cap = 240000, which now binds.
    expect(
      computeHraExemption({ hraReceived: 400000, salaryBasicDa: 600000, rentPaid: 500000, isMetro: false }),
    ).toBe(240000);
  });

  it("binds on actual HRA received when that is the least", () => {
    expect(
      computeHraExemption({ hraReceived: 100000, salaryBasicDa: 600000, rentPaid: 300000, isMetro: true }),
    ).toBe(100000);
  });

  it("grants nothing under the new regime", () => {
    expect(
      computeHraExemption({ hraReceived: 240000, salaryBasicDa: 600000, rentPaid: 300000, isMetro: true, regime: "new" }),
    ).toBe(0);
  });

  it("never returns a negative amount on degenerate input", () => {
    expect(
      computeHraExemption({ hraReceived: -5, salaryBasicDa: 0, rentPaid: -5, isMetro: false }),
    ).toBe(0);
  });
});
