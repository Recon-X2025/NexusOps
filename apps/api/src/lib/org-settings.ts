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

/** US-CRM-003: RevOps-configurable thresholds (same numeric basis as deal `value` / quotes). */
export type OrgCrmSettings = {
  /** ISO 4217 code for display / future multi-currency (amounts still one numeric column per org). */
  dealApprovalCurrency?: string;
  /**
   * Deal `value` **strictly below** this → may move to `closed_won` without recorded approval.
   * Default 500_000 (INR-style units when org uses lakhs/crores in copy).
   */
  dealCloseNoApprovalBelow?: number;
  /**
   * Deal `value` **greater than or equal to** this → requires **executive** tier approval before `closed_won`.
   * Between `dealCloseNoApprovalBelow` and this → **manager** tier. Default 5_000_000.
   */
  dealCloseExecutiveAbove?: number;
};

/** US-ITSM-001 — SLA pause reason catalog (codes stored on `tickets.sla_pause_reason_code`). */
export type SlaPauseReasonEntry = { code: string; label: string };

export type OrgItsmSettings = {
  slaPauseReasons?: SlaPauseReasonEntry[];
};

export type NexusOpsOrgSettings = {
  security?: OrgSecuritySettings;
  procurement?: OrgProcurementSettings;
  financial?: OrgFinancialSettings;
  crm?: OrgCrmSettings;
  itsm?: OrgItsmSettings;
};

export function parseOrgSettings(raw: unknown): NexusOpsOrgSettings {
  if (!raw || typeof raw !== "object") return {};
  return raw as NexusOpsOrgSettings;
}

/** Normalized catalog: non-empty codes, trimmed; invalid entries dropped. */
export function getSlaPauseReasonsCatalog(orgSettings: unknown): SlaPauseReasonEntry[] {
  const raw = parseOrgSettings(orgSettings).itsm?.slaPauseReasons;
  if (!Array.isArray(raw)) return [];
  const out: SlaPauseReasonEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const code = typeof (e as SlaPauseReasonEntry).code === "string" ? (e as SlaPauseReasonEntry).code.trim() : "";
    const label = typeof (e as SlaPauseReasonEntry).label === "string" ? (e as SlaPauseReasonEntry).label.trim() : "";
    if (!code || !label) continue;
    out.push({ code: code.slice(0, 64), label: label.slice(0, 200) });
  }
  return out;
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

const DEFAULT_DEAL_NO_APPROVAL_BELOW = 500_000;
const DEFAULT_DEAL_EXECUTIVE_ABOVE = 5_000_000;

export type DealCloseApprovalTier = "none" | "manager" | "executive";

/** Effective deal close approval tier from deal amount vs org CRM settings. */
export function getDealCloseApprovalTier(amount: number, orgSettings: unknown): DealCloseApprovalTier {
  const c = parseOrgSettings(orgSettings).crm;
  const low =
    typeof c?.dealCloseNoApprovalBelow === "number" &&
    Number.isFinite(c.dealCloseNoApprovalBelow) &&
    c.dealCloseNoApprovalBelow >= 0
      ? c.dealCloseNoApprovalBelow
      : DEFAULT_DEAL_NO_APPROVAL_BELOW;
  let execAbove =
    typeof c?.dealCloseExecutiveAbove === "number" &&
    Number.isFinite(c.dealCloseExecutiveAbove) &&
    c.dealCloseExecutiveAbove > low
      ? c.dealCloseExecutiveAbove
      : DEFAULT_DEAL_EXECUTIVE_ABOVE;
  if (execAbove <= low) execAbove = low + 1;
  if (amount < low) return "none";
  if (amount >= execAbove) return "executive";
  return "manager";
}

/** Exposed thresholds for admin GET + migrations from constants. */
export function getCrmDealApprovalThresholds(orgSettings: unknown): {
  dealCloseNoApprovalBelow: number;
  dealCloseExecutiveAbove: number;
  dealApprovalCurrency: string;
} {
  const c = parseOrgSettings(orgSettings).crm;
  const low =
    typeof c?.dealCloseNoApprovalBelow === "number" &&
    Number.isFinite(c.dealCloseNoApprovalBelow) &&
    c.dealCloseNoApprovalBelow >= 0
      ? c.dealCloseNoApprovalBelow
      : DEFAULT_DEAL_NO_APPROVAL_BELOW;
  let execAbove =
    typeof c?.dealCloseExecutiveAbove === "number" &&
    Number.isFinite(c.dealCloseExecutiveAbove) &&
    c.dealCloseExecutiveAbove > low
      ? c.dealCloseExecutiveAbove
      : DEFAULT_DEAL_EXECUTIVE_ABOVE;
  if (execAbove <= low) execAbove = low + 1;
  const cur =
    typeof c?.dealApprovalCurrency === "string" && c.dealApprovalCurrency.length === 3
      ? c.dealApprovalCurrency.toUpperCase()
      : "INR";
  return { dealCloseNoApprovalBelow: low, dealCloseExecutiveAbove: execAbove, dealApprovalCurrency: cur };
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
