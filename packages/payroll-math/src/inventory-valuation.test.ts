/**
 * Inventory valuation engine tests (Sprint 2.4).
 * Pure money-math; no DB. FIFO cost-layer consumption + WAC running average,
 * COGS, on-hand value/qty, and shortfall handling.
 */
import { describe, it, expect } from "vitest";
import {
  issueFifo,
  intakeFifo,
  fifoOnHandValue,
  fifoOnHandQty,
  intakeWac,
  issueWac,
  type CostLayer,
} from "./inventory-valuation";

// ── FIFO ─────────────────────────────────────────────────────────────────────

describe("issueFifo", () => {
  it("consumes the oldest layer first and expenses at its cost", () => {
    // 10 @ ₹100 (old) then 10 @ ₹120 (new); issue 5.
    const layers: CostLayer[] = [
      { qty: 10, unitCost: 100 },
      { qty: 10, unitCost: 120 },
    ];
    const res = issueFifo(layers, 5);
    // 5 units all sourced from the ₹100 lot → COGS 500.
    expect(res.cogs).toBe(500);
    expect(res.shortfall).toBe(0);
    expect(res.remainingLayers).toEqual([
      { qty: 5, unitCost: 100 },
      { qty: 10, unitCost: 120 },
    ]);
  });

  it("spans multiple layers when the issue exceeds the oldest lot", () => {
    const layers: CostLayer[] = [
      { qty: 10, unitCost: 100 },
      { qty: 10, unitCost: 120 },
    ];
    // Issue 15: 10@100 + 5@120 = 1000 + 600 = 1600.
    const res = issueFifo(layers, 15);
    expect(res.cogs).toBe(1_600);
    expect(res.remainingLayers).toEqual([{ qty: 5, unitCost: 120 }]);
  });

  it("drops fully-depleted lots and reports a shortfall past stock", () => {
    const layers: CostLayer[] = [{ qty: 8, unitCost: 50 }];
    const res = issueFifo(layers, 12);
    // Only 8 available → COGS 400, 4 short, no layers left.
    expect(res.cogs).toBe(400);
    expect(res.shortfall).toBe(4);
    expect(res.remainingLayers).toEqual([]);
  });

  it("treats the input layers as immutable", () => {
    const layers: CostLayer[] = [{ qty: 10, unitCost: 100 }];
    issueFifo(layers, 5);
    expect(layers[0]!.qty).toBe(10); // original untouched
  });

  it("rejects a negative issue", () => {
    expect(() => issueFifo([], -1)).toThrow();
  });
});

describe("intakeFifo / on-hand rollups", () => {
  it("appends a new lot newest-last", () => {
    const layers = intakeFifo([{ qty: 5, unitCost: 100 }], 10, 120);
    expect(layers).toEqual([
      { qty: 5, unitCost: 100 },
      { qty: 10, unitCost: 120 },
    ]);
  });

  it("ignores a non-positive intake", () => {
    const layers = intakeFifo([{ qty: 5, unitCost: 100 }], 0, 120);
    expect(layers).toEqual([{ qty: 5, unitCost: 100 }]);
  });

  it("values and counts all layers on hand", () => {
    const layers: CostLayer[] = [
      { qty: 5, unitCost: 100 },
      { qty: 10, unitCost: 120 },
    ];
    expect(fifoOnHandQty(layers)).toBe(15);
    expect(fifoOnHandValue(layers)).toBe(500 + 1_200);
  });
});

// ── WAC ──────────────────────────────────────────────────────────────────────

describe("intakeWac", () => {
  it("re-weights the running average on each intake", () => {
    // Start empty; take in 10 @ ₹100 → avg 100.
    let s = intakeWac({ qty: 0, avgUnitCost: 0 }, 10, 100);
    expect(s.qty).toBe(10);
    expect(s.avgUnitCost).toBe(100);
    // Add 10 @ ₹120 → (1000 + 1200)/20 = 110.
    s = intakeWac(s, 10, 120);
    expect(s.qty).toBe(20);
    expect(s.avgUnitCost).toBe(110);
    expect(s.totalValue).toBe(2_200);
  });

  it("ignores a non-positive intake but reports current value", () => {
    const s = intakeWac({ qty: 20, avgUnitCost: 110 }, 0, 999);
    expect(s.qty).toBe(20);
    expect(s.avgUnitCost).toBe(110);
    expect(s.totalValue).toBe(2_200);
  });
});

describe("issueWac", () => {
  it("expenses at the average and leaves the average unchanged", () => {
    const res = issueWac({ qty: 20, avgUnitCost: 110 }, 5);
    expect(res.cogs).toBe(550);
    expect(res.qty).toBe(15);
    expect(res.avgUnitCost).toBe(110); // average unaffected by an issue
    expect(res.shortfall).toBe(0);
  });

  it("resets the average to zero when fully depleted", () => {
    const res = issueWac({ qty: 5, avgUnitCost: 110 }, 5);
    expect(res.qty).toBe(0);
    expect(res.avgUnitCost).toBe(0);
    expect(res.cogs).toBe(550);
  });

  it("caps the issue at stock on hand and reports the shortfall", () => {
    const res = issueWac({ qty: 5, avgUnitCost: 100 }, 8);
    expect(res.cogs).toBe(500); // only 5 available
    expect(res.qty).toBe(0);
    expect(res.shortfall).toBe(3);
  });

  it("rejects a negative issue", () => {
    expect(() => issueWac({ qty: 5, avgUnitCost: 100 }, -1)).toThrow();
  });
});
