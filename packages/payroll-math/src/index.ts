/**
 * @coheronconnect/payroll-math
 * ──────────────────────────────
 * Single source of truth for India payroll / tax / GST money math.
 * Pure, dependency-free functions consumed by both `apps/api` (runtime)
 * and `packages/db` (demo seed).
 */

export * from "./statutory-deductions";
export * from "./tax-engine";
export * from "./payroll-cycle";
export * from "./gst-engine";
export * from "./validators";
export * from "./gratuity";
export * from "./leave-accrual";
export * from "./depreciation";
