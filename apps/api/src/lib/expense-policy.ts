/**
 * expense-policy.ts — pure-function policy evaluation for expense
 * claims. Used by `hr.expenses.createMine` to set
 * `policy_violation_code` / `policy_violation_reason` (or hard-reject
 * when enforcement = "block").
 *
 * Pure functions only — no DB, no I/O. Easy to unit-test.
 */
import { parseOrgSettings, type ExpenseCategoryPolicy } from "./org-settings";

export interface ExpenseClaimInput {
  category: string;
  amount: number; // major units (e.g. INR rupees, not paise)
  currency: string;
  receiptUrl?: string | null;
  mileageKm?: number | null;
}

export interface PolicyViolation {
  code:
    | "per_item_cap_exceeded"
    | "per_diem_cap_exceeded"
    | "mileage_required"
    | "receipt_required"
    | "currency_mismatch";
  reason: string;
}

export interface EvaluateExpenseResult {
  ok: boolean;
  enforcement: "warn" | "block";
  violation: PolicyViolation | null;
  /**
   * For mileage claims, the policy-implied amount given
   * `mileageKm * mileageRatePerKm`. If the user supplied a different
   * amount, the caller may choose to coerce or warn.
   */
  computedMileageAmount: number | null;
}

/** Evaluate a single claim against the org's expense policy. */
export function evaluateExpenseClaim(
  claim: ExpenseClaimInput,
  orgSettings: unknown,
): EvaluateExpenseResult {
  const settings = parseOrgSettings(orgSettings).expense ?? {};
  const baseCurrency = (settings.baseCurrency ?? "INR").toUpperCase();
  const enforcement: "warn" | "block" = settings.enforcement === "block" ? "block" : "warn";
  const categories = settings.categories ?? {};
  const cat: ExpenseCategoryPolicy = categories[claim.category] ?? {};

  // Currency must match base currency for cap comparisons to make
  // sense. If the org operates only in INR but a foreign-currency
  // claim is submitted, surface as a violation rather than silently
  // applying INR caps to USD amounts.
  if (claim.currency.toUpperCase() !== baseCurrency) {
    return {
      ok: false,
      enforcement,
      violation: {
        code: "currency_mismatch",
        reason: `Claim is in ${claim.currency} but policy is denominated in ${baseCurrency}. Convert before submitting or ask finance to add multi-currency support.`,
      },
      computedMileageAmount: null,
    };
  }

  // Mileage categories: derive the policy-implied amount, then check
  // that mileage was supplied at all.
  let computedMileageAmount: number | null = null;
  if ((claim.category === "transport" || claim.category === "fuel") && cat.mileageRatePerKm) {
    if (claim.mileageKm == null || claim.mileageKm <= 0) {
      return {
        ok: false,
        enforcement,
        violation: {
          code: "mileage_required",
          reason: `${claim.category} claims must include mileageKm when policy uses a per-km rate.`,
        },
        computedMileageAmount: null,
      };
    }
    computedMileageAmount = Math.round(claim.mileageKm * cat.mileageRatePerKm * 100) / 100;
  }

  const receiptRequired = cat.receiptRequired ?? settings.defaultReceiptRequired ?? false;
  if (receiptRequired && (!claim.receiptUrl || claim.receiptUrl.length === 0)) {
    return {
      ok: false,
      enforcement,
      violation: {
        code: "receipt_required",
        reason: `Org policy requires a receipt for ${claim.category} claims.`,
      },
      computedMileageAmount,
    };
  }

  const perItemCap =
    typeof cat.perItemCap === "number"
      ? cat.perItemCap
      : typeof settings.defaultPerItemCap === "number"
        ? settings.defaultPerItemCap
        : null;
  if (perItemCap != null && claim.amount > perItemCap) {
    return {
      ok: false,
      enforcement,
      violation: {
        code: "per_item_cap_exceeded",
        reason: `Claim amount ${claim.amount.toFixed(2)} ${baseCurrency} exceeds the per-item cap of ${perItemCap.toFixed(2)} for category "${claim.category}".`,
      },
      computedMileageAmount,
    };
  }

  if (typeof cat.perDiemCap === "number" && claim.amount > cat.perDiemCap) {
    return {
      ok: false,
      enforcement,
      violation: {
        code: "per_diem_cap_exceeded",
        reason: `Claim amount ${claim.amount.toFixed(2)} ${baseCurrency} exceeds the per-diem cap of ${cat.perDiemCap.toFixed(2)} for category "${claim.category}".`,
      },
      computedMileageAmount,
    };
  }

  return { ok: true, enforcement, violation: null, computedMileageAmount };
}
