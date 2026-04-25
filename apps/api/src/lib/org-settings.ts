/** Typed helpers for `organizations.settings` JSON (gap-closure: finance / procurement / security). */

export type OrgSecuritySettings = {
  /** Matrix roles (e.g. `finance_manager`, `admin`) that must call `auth.verifyStepUp` before privileged mutations. */
  requireStepUpForMatrixRoles?: string[];
};

export type OrgProcurementSettings = {
  /** Absolute currency tolerance for PO vs invoice total match (default 1). */
  poMatchToleranceAbs?: number;
  /** When `block`, duplicate vendor + invoice # on payable flow throws; `warn` only returns a flag for clients. */
  duplicatePayableInvoicePolicy?: "off" | "warn" | "block";
  /**
   * Purchase request total **strictly below** this amount (same currency as line math, typically INR) → auto-approved.
   * Default 75_000 (legacy constant).
   */
  prAutoApproveBelow?: number;
  /**
   * PR total **strictly below** this amount (and ≥ prAutoApproveBelow) → `dept_head` approval path; else `vp_finance`.
   * Must be greater than `prAutoApproveBelow`. Default 750_000.
   */
  prDeptHeadMax?: number;
};

export type OrgFinancialSettings = {
  /** Closed accounting periods as `YYYY-MM`; blocks mark-paid on invoices in those months. */
  closedPeriods?: string[];
};

export type NexusOpsOrgSettings = {
  security?: OrgSecuritySettings;
  procurement?: OrgProcurementSettings;
  financial?: OrgFinancialSettings;
};

export function parseOrgSettings(raw: unknown): NexusOpsOrgSettings {
  if (!raw || typeof raw !== "object") return {};
  return raw as NexusOpsOrgSettings;
}

export function getProcurementMatchToleranceAbs(orgSettings: unknown): number {
  const n = parseOrgSettings(orgSettings).procurement?.poMatchToleranceAbs;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return 1;
}

export function getDuplicatePayablePolicy(orgSettings: unknown): "off" | "warn" | "block" {
  const p = parseOrgSettings(orgSettings).procurement?.duplicatePayableInvoicePolicy;
  if (p === "warn" || p === "block" || p === "off") return p;
  return "warn";
}

const DEFAULT_PR_AUTO_BELOW = 75_000;
const DEFAULT_PR_DEPT_HEAD_MAX = 750_000;

/** Effective PR approval tier thresholds (matches legacy hardcoded defaults when unset). */
export function getProcurementApprovalTiers(orgSettings: unknown): {
  prAutoApproveBelow: number;
  prDeptHeadMax: number;
} {
  const p = parseOrgSettings(orgSettings).procurement;
  const rawAuto = p?.prAutoApproveBelow;
  const rawDept = p?.prDeptHeadMax;
  const prAutoApproveBelow =
    typeof rawAuto === "number" && Number.isFinite(rawAuto) && rawAuto >= 0 ? rawAuto : DEFAULT_PR_AUTO_BELOW;
  let prDeptHeadMax =
    typeof rawDept === "number" && Number.isFinite(rawDept) && rawDept > prAutoApproveBelow
      ? rawDept
      : DEFAULT_PR_DEPT_HEAD_MAX;
  if (prDeptHeadMax <= prAutoApproveBelow) {
    prDeptHeadMax = Math.max(DEFAULT_PR_DEPT_HEAD_MAX, prAutoApproveBelow + 1);
  }
  return { prAutoApproveBelow, prDeptHeadMax };
}

export function isInvoicePeriodClosed(orgSettings: unknown, invoiceDate: Date | null | undefined): boolean {
  if (!invoiceDate) return false;
  const closed = parseOrgSettings(orgSettings).financial?.closedPeriods;
  if (!closed?.length) return false;
  const y = invoiceDate.getUTCFullYear();
  const m = String(invoiceDate.getUTCMonth() + 1).padStart(2, "0");
  const key = `${y}-${m}`;
  return closed.includes(key);
}
