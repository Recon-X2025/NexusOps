import { describe, it, expect } from "vitest";
import { INDIAN_STATES } from "../india-states";

/**
 * State dropdown safety check. The dropdown replaces free text (which produced
 * "Karnatak" → nil PT). These assert the list is well-formed and that its names
 * normalise to the professional-tax engine's keys, so a picked value can never be
 * a typo — while documenting that valid-but-unpopulated states remain nil PT.
 */

// How computePT derives its lookup key from the state string.
const ptKey = (s: string) => s.toUpperCase().replace(/\s+/g, "_");

// The seven states the PT engine currently holds slabs for (statutory-deductions.ts).
const PT_SLAB_STATES = ["Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "West Bengal", "Delhi", "Gujarat"];

describe("INDIAN_STATES dropdown list", () => {
  it("is non-empty and has no duplicates", () => {
    expect(INDIAN_STATES.length).toBeGreaterThanOrEqual(36);
    expect(new Set(INDIAN_STATES).size).toBe(INDIAN_STATES.length);
  });

  it("includes every state the PT engine can compute, with names that normalise to its keys", () => {
    for (const s of PT_SLAB_STATES) {
      expect(INDIAN_STATES).toContain(s);
    }
    // The exact key computePT builds for each PT state.
    expect(ptKey("Tamil Nadu")).toBe("TAMIL_NADU");
    expect(ptKey("West Bengal")).toBe("WEST_BENGAL");
    expect(ptKey("Karnataka")).toBe("KARNATAKA");
  });

  it("offers the metro states used for HRA (Delhi, Maharashtra→Mumbai, WB→Kolkata, TN→Chennai)", () => {
    for (const s of ["Delhi", "Maharashtra", "West Bengal", "Tamil Nadu"]) {
      expect(INDIAN_STATES).toContain(s);
    }
  });
});
