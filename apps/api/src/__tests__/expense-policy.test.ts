/**
 * Unit tests for the expense-policy engine. The engine is a pure
 * function so these run without DB / Redis / network.
 */
import { describe, expect, it } from "vitest";
import { evaluateExpenseClaim } from "../lib/expense-policy";

const baseSettings = {
  expense: {
    baseCurrency: "INR",
    enforcement: "warn" as const,
    defaultPerItemCap: 50_000,
    defaultReceiptRequired: true,
    categories: {
      food: { perDiemCap: 1_500, receiptRequired: false },
      transport: { mileageRatePerKm: 12, receiptRequired: false },
      fuel: { mileageRatePerKm: 12, receiptRequired: false },
    },
  },
};

describe("evaluateExpenseClaim", () => {
  it("flags currency mismatch", () => {
    const r = evaluateExpenseClaim(
      { category: "food", amount: 100, currency: "USD" },
      baseSettings,
    );
    expect(r.ok).toBe(false);
    expect(r.violation?.code).toBe("currency_mismatch");
  });

  it("requires receipt when default policy is on", () => {
    const r = evaluateExpenseClaim(
      { category: "miscellaneous", amount: 1_000, currency: "INR" },
      baseSettings,
    );
    expect(r.ok).toBe(false);
    expect(r.violation?.code).toBe("receipt_required");
  });

  it("waives receipt when category overrides", () => {
    const r = evaluateExpenseClaim(
      { category: "food", amount: 800, currency: "INR" },
      baseSettings,
    );
    expect(r.ok).toBe(true);
    expect(r.violation).toBeNull();
  });

  it("flags per-diem cap exceedance", () => {
    const r = evaluateExpenseClaim(
      { category: "food", amount: 2_000, currency: "INR" },
      baseSettings,
    );
    expect(r.ok).toBe(false);
    expect(r.violation?.code).toBe("per_diem_cap_exceeded");
  });

  it("flags per-item cap exceedance from default", () => {
    const r = evaluateExpenseClaim(
      {
        category: "office_supplies",
        amount: 60_000,
        currency: "INR",
        receiptUrl: "https://r.example/x.pdf",
      },
      baseSettings,
    );
    expect(r.ok).toBe(false);
    expect(r.violation?.code).toBe("per_item_cap_exceeded");
  });

  it("requires mileageKm for transport claims with rate", () => {
    const r = evaluateExpenseClaim(
      { category: "transport", amount: 240, currency: "INR" },
      baseSettings,
    );
    expect(r.ok).toBe(false);
    expect(r.violation?.code).toBe("mileage_required");
  });

  it("computes mileage amount when km is supplied", () => {
    const r = evaluateExpenseClaim(
      { category: "transport", amount: 240, currency: "INR", mileageKm: 20 },
      baseSettings,
    );
    expect(r.ok).toBe(true);
    expect(r.computedMileageAmount).toBe(240);
  });

  it("returns block enforcement when configured", () => {
    const blockSettings = {
      expense: { ...baseSettings.expense, enforcement: "block" as const },
    };
    const r = evaluateExpenseClaim(
      { category: "food", amount: 5_000, currency: "INR" },
      blockSettings,
    );
    expect(r.enforcement).toBe("block");
    expect(r.ok).toBe(false);
  });

  it("falls back to defaults when org settings are empty", () => {
    const r = evaluateExpenseClaim(
      { category: "miscellaneous", amount: 100, currency: "INR" },
      {},
    );
    expect(r.ok).toBe(true);
  });
});
