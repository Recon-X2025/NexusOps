/**
 * Canonical type for `organizations.settings` (the only org-level JSONB blob
 * with a stable, knowable shape). Wired into the schema via `.$type<OrgSettings>()`
 * so every read/write of `org.settings` is typed end-to-end instead of being an
 * opaque `Record<string, unknown>`.
 *
 * The API's `lib/org-settings.ts` re-exports this type and provides the runtime
 * parse/getter helpers. Keep this the single source of truth for the shape.
 */

/** Step-up / MFA policies keyed by matrix role (US-SEC-001). */
export type OrgSecuritySettings = {
  /** Matrix roles that must call `auth.verifyStepUp` before privileged mutations. */
  requireStepUpForMatrixRoles?: string[];
  /** Matrix roles that must have `users.mfa_enrolled` before privileged mutations. */
  requireMfaForMatrixRoles?: string[];
  /** Opt-in read-audit for sensitive modules. */
  sensitiveReadAuditEnabled?: boolean;
};

export type OrgProcurementSettings = {
  /** Absolute currency tolerance for PO vs invoice total match (default 1). */
  poMatchToleranceAbs?: number;
  /** Duplicate vendor+invoice policy on payable flow. */
  duplicatePayableInvoicePolicy?: "off" | "warn" | "block";
  /** PR total strictly below this → auto-approved (default 75_000). */
  prAutoApproveBelow?: number;
  /** PR total below this (and ≥ prAutoApproveBelow) → dept_head path; else vp_finance (default 750_000). */
  prDeptHeadMax?: number;
  /**
   * Max taxable value (pre-GST, same basis as PR line totals) of a Direct PO that may be raised
   * WITHOUT a requisition. Above it the create procedure refuses and points to the requisition path.
   * Default = `prAutoApproveBelow` (a direct, un-approved PO is capped at what the org already passes
   * without approval). 0 = force every PO through a requisition.
   */
  directPoMaxValue?: number;
};

export type OrgFinancialSettings = {
  /** Closed accounting periods as `YYYY-MM`; blocks mark-paid on invoices in those months. */
  closedPeriods?: string[];
  /**
   * Opt IN to the automatic month-end depreciation sweep.
   *
   * Default is `false` — ABSENT MEANS OFF. A background job that posts to the
   * general ledger must never start running against a tenant because they
   * upgraded; a controller has to ask for it. Setting it back to false stops the
   * sweep immediately (it is read per-org on every run, not cached), and the
   * manual Run control on the depreciation screen is unaffected either way.
   */
  depreciationAutoRunEnabled?: boolean;
};

/** US-CRM-003: RevOps-configurable deal-close approval thresholds. */
export type OrgCrmSettings = {
  dealApprovalCurrency?: string;
  dealCloseNoApprovalBelow?: number;
  dealCloseExecutiveAbove?: number;
};

/** US-ITSM-001 — SLA pause reason catalog. */
export type SlaPauseReasonEntry = { code: string; label: string };

export type OrgItsmSettings = {
  slaPauseReasons?: SlaPauseReasonEntry[];
};

/** Per-category caps for expense self-service policy (US-FIN-EXP-001). */
export type ExpenseCategoryPolicy = {
  perDiemCap?: number;
  perItemCap?: number;
  mileageRatePerKm?: number;
  receiptRequired?: boolean;
};

export type OrgExpenseSettings = {
  baseCurrency?: string;
  defaultPerItemCap?: number;
  enforcement?: "warn" | "block";
  defaultReceiptRequired?: boolean;
  categories?: Record<string, ExpenseCategoryPolicy>;
};

/** Per-org SAML 2.0 SP→IdP SSO config (US-SEC-002); IdP-public material only. */
export type OrgSamlSettings = {
  enabled?: boolean;
  entryPoint?: string;
  idpIssuer?: string;
  idpCert?: string;
  attributeMapping?: {
    email?: string;
    name?: string;
  };
};

export type OrgSsoSettings = {
  saml?: OrgSamlSettings;
};

/** Platform-admin (MAC) billing fields stamped onto org settings. */
export type OrgBillingSettings = {
  stripeCustomerId?: string;
  trialEndsAt?: string;
  subscriptionStatus?: "active" | "past_due" | "canceled" | "trialing" | "unpaid";
};

/** People/Workplace (facilities-lite) module toggles (HR module config). */
export type OrgPeopleWorkplaceSettings = {
  facilitiesLive?: boolean;
} & Record<string, unknown>;

/** A single document's acceptance record stamped by platform admin (MAC). */
export type LegalAcceptanceRecord = {
  version: string;
  acceptedByEmail: string;
  acceptedAt: string;
};

/** Per-document legal acceptance map (MAC `recordLegalAcceptance`). */
export type OrgLegalAcceptance = Partial<
  Record<"terms_of_service" | "data_processing_agreement" | "privacy_policy", LegalAcceptanceRecord>
>;

/**
 * Payroll settings.
 *
 * `approvalChainLength` is how many approval steps a payroll run requires: 2
 * (HR → Finance) or 3 (HR → Finance → CFO). Nothing else is permitted — 1 would
 * defeat segregation of duties, which requires two DIFFERENT people at any length.
 *
 * Default 3, so an existing tenant upgrading sees no change. A 30-person company
 * with no CFO sets 2; the stored status names (`cfo_approved`, `approvedByCfoId`)
 * are unchanged at either length — the final step of the configured chain lands on
 * them, which is what keeps statutory generation and bank-file generation firing.
 */
export type OrgPayrollSettings = {
  /** 2 or 3. Read WHEN A RUN IS CREATED and stamped onto the run. */
  approvalChainLength?: 2 | 3;
};

export type OrgSettings = {
  security?: OrgSecuritySettings;
  procurement?: OrgProcurementSettings;
  financial?: OrgFinancialSettings;
  crm?: OrgCrmSettings;
  itsm?: OrgItsmSettings;
  expense?: OrgExpenseSettings;
  payroll?: OrgPayrollSettings;
  sso?: OrgSsoSettings;
  /** Platform suspension flag (MAC). When true, org access is blocked. */
  suspended?: boolean;
  /** Per-org feature-flag overrides (MAC). */
  featureFlags?: Record<string, boolean>;
  /** Billing metadata (MAC). */
  stripeCustomerId?: string;
  trialEndsAt?: string;
  subscriptionStatus?: OrgBillingSettings["subscriptionStatus"];
  /** SLA business-calendar config. */
  slaSkipWeekends?: boolean;
  slaHolidayDates?: string[];
  /** People/Workplace (facilities-lite) module toggles (HR). */
  peopleWorkplace?: OrgPeopleWorkplaceSettings;
  /** Legal document acceptance records (MAC). */
  legalAcceptance?: OrgLegalAcceptance;
};
