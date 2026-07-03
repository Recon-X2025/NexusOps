/**
 * CoheronConnect Inventory Valuation Engine
 * ─────────────────────────────────────────
 * Pure, dependency-free cost-of-goods-sold (COGS) math for two inventory
 * valuation methods:
 *
 *   - FIFO (First-In, First-Out): issues consume the oldest cost layers first.
 *     Remaining stock is valued at the most recent purchase costs. Closer to
 *     replacement cost on the balance sheet; COGS lags current prices.
 *   - WAC (Weighted-Average Cost): every unit on hand carries the running
 *     average unit cost. Each intake re-weights the average; issues expense at
 *     that average. Smooths price volatility.
 *
 * The engine is stateless: callers pass the current cost layers (FIFO) or the
 * running on-hand qty + average (WAC) and receive the COGS plus the new state.
 * Rounding is to whole paise-free rupees at the money boundary (COGS + values).
 */

const r = (n: number) => Math.round(n * 100) / 100; // 2-dp money rounding

// ── FIFO ─────────────────────────────────────────────────────────────────────

/** A single purchase lot still (partly) on hand, oldest first. */
export interface CostLayer {
  /** Units remaining in this lot. */
  qty: number;
  /** Per-unit purchase cost of this lot. */
  unitCost: number;
}

export interface FifoIssueResult {
  /** Cost of goods sold for the issued quantity. */
  cogs: number;
  /** Cost layers after consumption (oldest first), with depleted lots dropped. */
  remainingLayers: CostLayer[];
  /** Units that could not be sourced (issue exceeded stock on hand). */
  shortfall: number;
}

/**
 * Consume `issueQty` units from FIFO cost layers (oldest first).
 * Layers are treated as immutable; a new array is returned.
 */
export function issueFifo(layers: CostLayer[], issueQty: number): FifoIssueResult {
  if (issueQty < 0) throw new Error("issueQty must be non-negative");
  const remaining = layers.map((l) => ({ ...l }));
  let toIssue = issueQty;
  let cogs = 0;

  while (toIssue > 0 && remaining.length > 0) {
    const lot = remaining[0]!;
    const take = Math.min(lot.qty, toIssue);
    cogs += take * lot.unitCost;
    lot.qty -= take;
    toIssue -= take;
    if (lot.qty <= 0) remaining.shift();
  }

  return {
    cogs: r(cogs),
    remainingLayers: remaining,
    shortfall: toIssue > 0 ? toIssue : 0,
  };
}

/** Append a purchase lot to the FIFO layer stack (newest last). */
export function intakeFifo(layers: CostLayer[], qty: number, unitCost: number): CostLayer[] {
  if (qty <= 0) return layers.map((l) => ({ ...l }));
  return [...layers.map((l) => ({ ...l })), { qty, unitCost }];
}

/** Total value of all cost layers on hand. */
export function fifoOnHandValue(layers: CostLayer[]): number {
  return r(layers.reduce((s, l) => s + l.qty * l.unitCost, 0));
}

/** Total units across all cost layers. */
export function fifoOnHandQty(layers: CostLayer[]): number {
  return layers.reduce((s, l) => s + l.qty, 0);
}

// ── WAC ──────────────────────────────────────────────────────────────────────

/** Running weighted-average state for one item. */
export interface WacState {
  qty: number;
  /** Weighted-average unit cost of the qty on hand. */
  avgUnitCost: number;
}

export interface WacIntakeResult extends WacState {
  totalValue: number;
}

/**
 * Fold a purchase into the running weighted average.
 * newAvg = (oldQty·oldAvg + inQty·inCost) / (oldQty + inQty)
 */
export function intakeWac(state: WacState, qty: number, unitCost: number): WacIntakeResult {
  if (qty <= 0) {
    return { qty: state.qty, avgUnitCost: r(state.avgUnitCost), totalValue: r(state.qty * state.avgUnitCost) };
  }
  const newQty = state.qty + qty;
  const newValue = state.qty * state.avgUnitCost + qty * unitCost;
  const avg = newQty > 0 ? newValue / newQty : 0;
  return { qty: newQty, avgUnitCost: r(avg), totalValue: r(newValue) };
}

export interface WacIssueResult extends WacState {
  cogs: number;
  shortfall: number;
}

/**
 * Issue units at the current weighted-average cost. The average is unchanged by
 * an issue (only quantity drops); a fully-depleted item resets the average to 0.
 */
export function issueWac(state: WacState, issueQty: number): WacIssueResult {
  if (issueQty < 0) throw new Error("issueQty must be non-negative");
  const take = Math.min(state.qty, issueQty);
  const cogs = r(take * state.avgUnitCost);
  const newQty = state.qty - take;
  return {
    qty: newQty,
    avgUnitCost: newQty > 0 ? r(state.avgUnitCost) : 0,
    cogs,
    shortfall: issueQty > take ? issueQty - take : 0,
  };
}
