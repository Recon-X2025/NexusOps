/**
 * Runtime helpers for `organizations.settings` JSON (gap-closure: finance /
 * procurement / security).
 *
 * The **shape** types now live in the db schema package
 * (`@coheronconnect/db` → `packages/db/src/schema/org-settings.ts`) so the
 * Drizzle column `organizations.settings` is typed end-to-end with the same
 * canonical `OrgSettings`. This module re-exports those types (keeping the
 * historic `CoheronConnectOrgSettings` alias) and owns the parse/getter logic.
 */

import type {
  OrgSettings,
  OrgSecuritySettings,
  OrgProcurementSettings,
  OrgFinancialSettings,
  OrgCrmSettings,
  OrgItsmSettings,
  OrgExpenseSettings,
  OrgSsoSettings,
  OrgSamlSettings,
  ExpenseCategoryPolicy,
  SlaPauseReasonEntry,
} from "@coheronconnect/db";

export type {
  OrgSettings,
  OrgSecuritySettings,
  OrgProcurementSettings,
  OrgFinancialSettings,
  OrgCrmSettings,
  OrgItsmSettings,
  OrgExpenseSettings,
  OrgSsoSettings,
  OrgSamlSettings,
  ExpenseCategoryPolicy,
  SlaPauseReasonEntry,
};

/** Historic alias retained for existing imports; identical to the db `OrgSettings`. */
export type CoheronConnectOrgSettings = OrgSettings;

export function parseOrgSettings(raw: unknown): CoheronConnectOrgSettings {
  if (!raw || typeof raw !== "object") return {};
  return raw as CoheronConnectOrgSettings;
}

export type EffectiveSamlConfig = {
  entryPoint: string;
  idpCert: string;
  idpIssuer?: string;
  attributeMapping?: { email?: string; name?: string };
};

/**
 * Effective SAML config for an org, or null when SSO is disabled / incomplete.
 * Both the IdP endpoint and its signing cert are required — without the cert we
 * cannot verify assertion signatures, so we must not start a flow.
 */
export function getOrgSamlConfig(orgSettings: unknown): EffectiveSamlConfig | null {
  const saml = parseOrgSettings(orgSettings).sso?.saml;
  if (!saml || saml.enabled !== true) return null;
  const entryPoint = typeof saml.entryPoint === "string" ? saml.entryPoint.trim() : "";
  const idpCert = typeof saml.idpCert === "string" ? saml.idpCert.trim() : "";
  if (!entryPoint || !idpCert) return null;
  return {
    entryPoint,
    idpCert,
    ...(typeof saml.idpIssuer === "string" && saml.idpIssuer.trim()
      ? { idpIssuer: saml.idpIssuer.trim() }
      : {}),
    ...(saml.attributeMapping ? { attributeMapping: saml.attributeMapping } : {}),
  };
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

/**
 * Max taxable value of a Direct PO that may be raised WITHOUT a requisition (PO-GATE). An explicit
 * `directPoMaxValue` (including 0 — "force every PO through a requisition") wins; otherwise it
 * defaults to `prAutoApproveBelow` — a direct, un-approved PO is capped at what the org already
 * passes without approval, so the two gates move together and there is no second magic number.
 */
export function getDirectPoMaxValue(orgSettings: unknown): number {
  const raw = parseOrgSettings(orgSettings).procurement?.directPoMaxValue;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  return getProcurementApprovalTiers(orgSettings).prAutoApproveBelow;
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

/**
 * Payroll approval steps for a NEW run: 2 or 3, defaulting to 3.
 *
 * Callers must stamp the returned value onto the run at creation and read it back
 * from the run thereafter — changing this setting must never alter a run already
 * in flight. Anything stored that is not 2 or 3 (hand-edited JSON, an older
 * write) falls back to 3, the safer length.
 */
export const PAYROLL_APPROVAL_CHAIN_LENGTHS = [2, 3] as const;
export type PayrollApprovalChainLength = (typeof PAYROLL_APPROVAL_CHAIN_LENGTHS)[number];

export function getPayrollApprovalChainLength(orgSettings: unknown): PayrollApprovalChainLength {
  const n = parseOrgSettings(orgSettings).payroll?.approvalChainLength;
  return n === 2 ? 2 : 3;
}
