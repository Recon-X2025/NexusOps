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

export function isInvoicePeriodClosed(orgSettings: unknown, invoiceDate: Date | null | undefined): boolean {
  if (!invoiceDate) return false;
  const closed = parseOrgSettings(orgSettings).financial?.closedPeriods;
  if (!closed?.length) return false;
  const y = invoiceDate.getUTCFullYear();
  const m = String(invoiceDate.getUTCMonth() + 1).padStart(2, "0");
  const key = `${y}-${m}`;
  return closed.includes(key);
}
