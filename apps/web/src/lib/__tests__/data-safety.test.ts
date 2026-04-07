/**
 * Frontend Data Safety Tests
 *
 * Pure unit tests that validate the null/undefined safety of formatting helpers
 * used throughout the web UI — no database or network required.
 *
 * These tests guard against the class of runtime error observed in production:
 *   TypeError: Cannot read properties of undefined (reading 'toLocaleString')
 */
import { describe, it, expect } from "vitest";

// ── Safe numeric rendering helpers (inline, mirroring page patterns) ───────

/**
 * Mirrors the fixed rendering pattern used in CRM page:
 *   {a.employees != null ? (a.employees as number).toLocaleString() : "—"}
 */
function renderEmployeeCount(value: unknown): string {
  return value != null ? (value as number).toLocaleString() : "—";
}

/**
 * Mirrors the fixed rendering pattern for annualRevenue:
 *   ₹{((a.annualRevenue ?? 0)/10000000).toFixed(0)}Cr
 */
function renderAnnualRevenueCr(value: unknown): string {
  return `₹${((value as number ?? 0) / 10_000_000).toFixed(0)}Cr`;
}

/**
 * Mirrors the fixed rendering pattern for deal value:
 *   ₹{(d.value ?? 0).toLocaleString("en-IN")}
 */
function renderDealValue(value: unknown): string {
  return `₹${((value as number) ?? 0).toLocaleString("en-IN")}`;
}

/**
 * Mirrors the fixed weighted deal value:
 *   ₹{((d.value ?? 0)*((d.probability ?? 0)/100)).toLocaleString("en-IN")}
 */
function renderWeightedDealValue(value: unknown, probability: unknown): string {
  const v = (value as number) ?? 0;
  const p = (probability as number) ?? 0;
  return `₹${(v * (p / 100)).toLocaleString("en-IN")}`;
}

/**
 * Mirrors quote total rendering:
 *   ₹{(q.total ?? 0).toLocaleString("en-IN")}
 */
function renderQuoteTotal(value: unknown): string {
  return `₹${((value as number) ?? 0).toLocaleString("en-IN")}`;
}

// ── Employee count rendering ───────────────────────────────────────────────

describe("CRM employee count rendering (null safety)", () => {
  it("renders a valid number correctly", () => {
    expect(renderEmployeeCount(5000)).toBe("5,000");
  });

  it("returns '—' for undefined (DB field missing)", () => {
    expect(renderEmployeeCount(undefined)).toBe("—");
  });

  it("returns '—' for null", () => {
    expect(renderEmployeeCount(null)).toBe("—");
  });

  it("renders zero correctly", () => {
    expect(renderEmployeeCount(0)).toBe("0");
  });

  it("renders large numbers with locale separators", () => {
    const result = renderEmployeeCount(100_000);
    expect(result).toContain("100");
  });
});

// ── Annual revenue rendering ───────────────────────────────────────────────

describe("CRM annual revenue rendering (null safety)", () => {
  it("renders a valid revenue amount in Crore notation", () => {
    const result = renderAnnualRevenueCr(500_000_000); // 50 Cr
    expect(result).toBe("₹50Cr");
  });

  it("renders zero for undefined (DB field missing)", () => {
    expect(renderAnnualRevenueCr(undefined)).toBe("₹0Cr");
  });

  it("renders zero for null", () => {
    expect(renderAnnualRevenueCr(null)).toBe("₹0Cr");
  });

  it("renders zero for 0", () => {
    expect(renderAnnualRevenueCr(0)).toBe("₹0Cr");
  });
});

// ── Deal value rendering ───────────────────────────────────────────────────

describe("CRM deal value rendering (null safety)", () => {
  it("renders a valid deal value with currency prefix", () => {
    const result = renderDealValue(500_000);
    expect(result).toMatch(/₹/);
    expect(result).toContain("500");
  });

  it("returns ₹0 for undefined deal value", () => {
    expect(renderDealValue(undefined)).toBe("₹0");
  });

  it("returns ₹0 for null deal value", () => {
    expect(renderDealValue(null)).toBe("₹0");
  });
});

// ── Weighted deal value rendering ─────────────────────────────────────────

describe("CRM weighted deal value rendering (null safety)", () => {
  it("calculates weighted value correctly", () => {
    const result = renderWeightedDealValue(1_000_000, 50);
    expect(result).toMatch(/₹/);
    expect(result).toContain("500");
  });

  it("returns ₹0 when value is undefined", () => {
    expect(renderWeightedDealValue(undefined, 50)).toBe("₹0");
  });

  it("returns ₹0 when probability is undefined", () => {
    expect(renderWeightedDealValue(1_000_000, undefined)).toBe("₹0");
  });

  it("returns ₹0 when both are undefined", () => {
    expect(renderWeightedDealValue(undefined, undefined)).toBe("₹0");
  });

  it("returns ₹0 when both are null", () => {
    expect(renderWeightedDealValue(null, null)).toBe("₹0");
  });
});

// ── Quote total rendering ──────────────────────────────────────────────────

describe("CRM quote total rendering (null safety)", () => {
  it("renders a valid total", () => {
    const result = renderQuoteTotal(250_000);
    expect(result).toMatch(/₹/);
    expect(result).toContain("250");
  });

  it("returns ₹0 for undefined total", () => {
    expect(renderQuoteTotal(undefined)).toBe("₹0");
  });

  it("returns ₹0 for null total", () => {
    expect(renderQuoteTotal(null)).toBe("₹0");
  });
});

// ── OKR key result value rendering ────────────────────────────────────────

/**
 * Mirrors the fixed OKR KR rendering:
 *   {Number(kr.currentValue ?? 0).toLocaleString()}
 */
function renderKRValue(value: unknown): string {
  return Number(value ?? 0).toLocaleString();
}

describe("OKR key result value rendering (null safety)", () => {
  it("renders a valid KR value", () => {
    expect(renderKRValue(750)).toBe("750");
  });

  it("renders 0 for undefined currentValue", () => {
    expect(renderKRValue(undefined)).toBe("0");
  });

  it("renders 0 for null currentValue", () => {
    expect(renderKRValue(null)).toBe("0");
  });

  it("renders decimal values", () => {
    expect(renderKRValue(99.5)).toBe("99.5");
  });

  it("does not return 'NaN' for undefined input", () => {
    // This was the exact bug: Number(undefined).toLocaleString() === "NaN"
    // The fix: Number(undefined ?? 0).toLocaleString() === "0"
    expect(renderKRValue(undefined)).not.toBe("NaN");
  });
});

// ── General toLocaleString safety pattern tests ───────────────────────────

describe("toLocaleString null safety patterns", () => {
  it("Number(undefined).toLocaleString() returns 'NaN' (demonstrates the bug without the fix)", () => {
    // This test documents the root cause of the TypeError class of bug:
    // if you call .toLocaleString() directly on undefined, it throws;
    // if you first cast via Number(), it returns 'NaN' instead.
    // The ?? 0 guard prevents both outcomes.
    expect(Number(undefined).toLocaleString()).toBe("NaN");
  });

  it("(undefined as number).toLocaleString() would throw TypeError", () => {
    // The original CRM bug: a.employees is undefined from DB, .toLocaleString() throws
    expect(() => {
      const val = undefined as unknown as number;
      return val.toLocaleString();
    }).toThrow(TypeError);
  });

  it("(undefined ?? 0).toLocaleString() safely returns '0'", () => {
    const val = undefined as unknown as number;
    expect((val ?? 0).toLocaleString()).toBe("0");
  });

  it("(null ?? 0).toLocaleString() safely returns '0'", () => {
    const val = null as unknown as number;
    expect((val ?? 0).toLocaleString()).toBe("0");
  });
});
