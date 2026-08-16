import {
  type AnyPgColumn,
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations, users } from "./auth";
import { expenseCategoryEnum, expenseStatusEnum } from "./expenses";
import { ticketStatuses } from "./tickets";

// ── Enums ──────────────────────────────────────────────────────────────────
export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contractor",
  "intern",
]);

export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "probation",
  "on_leave",
  "resigned",
  "terminated",
  "offboarded",
]);

export const taxRegimeEnum = pgEnum("tax_regime", ["old", "new"]);

// Gender — statutory determinant, not HR demographics. Maharashtra Professional Tax
// has separate male/female brackets (women pay nil to ₹25,000 where men pay from
// ₹7,501), so this drives PT slab selection. `other` is a valid legal option; per the
// CA it resolves to the male (lower-threshold) slab like an unstated gender, to prevent
// structural under-deduction. See computePT / reports/fix-plan.md → C2.
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

export const payrollRunStatusEnum = pgEnum("payroll_run_status", [
  "draft",
  "under_review",
  "hr_approved",
  "finance_approved",
  "cfo_approved",
  "paid",
]);

export const hrCaseTypeEnum = pgEnum("hr_case_type", [
  "onboarding",
  "offboarding",
  "leave",
  "policy",
  "benefits",
  "workplace",
  "equipment",
]);

export const hrCaseStatusEnum = pgEnum("hr_case_status", ["open", "in_progress", "closed"]);

export const leaveTypeEnum = pgEnum("leave_type", [
  "primary",
  "annual",
  "vacation",
  "sick",
  "parental",
  "bereavement",
  "unpaid",
  "other",
  // LEAVE-MODEL (greytHR private-sector types). ADDED, never renamed — the destructive
  // rename of the legacy values (vacation→…, other→unpaid) stays blocked on live row counts
  // (LEAVE-ENUM-REBUILD). Adding values is additive/safe; `maternity`/`paternity` split the
  // conflated `parental`.
  "casual",
  "maternity",
  "paternity",
  "marriage",
  "compensatory_off",
]);

/** Encashment wage basis — company policy (greytHR): Basic+DA (the common convention) or Gross. */
export const leaveEncashmentBasisEnum = pgEnum("leave_encashment_basis", ["basic_da", "gross"]);

/** How a leave type's balance expires: at year-end close, or a fixed window (comp-off, 4–8 weeks). */
export const leaveExpiryModeEnum = pgEnum("leave_expiry_mode", ["year_end", "window_weeks"]);

/**
 * Exit-encashment treatment, keyed PER exit reason (CCS Rule 39 structure — resignation pays
 * half, dismissal forfeits, etc.; the QUANTA are CCS/government and do NOT bind private
 * employers, only the structure does). Absence of a rule = `encash_full` (behaviour-preserving).
 */
export const leaveExitRuleTreatmentEnum = pgEnum("leave_exit_rule_treatment", [
  "encash_full",   // whole available balance
  "proportion",    // param = fraction (CCS resignation = 0.5)
  "capped",        // param = max days
  "accrued_only",  // only this year's accrual
  "forfeit",       // nothing
]);

/**
 * Year-end treatment of the balance ABOVE the carry-forward cap. Independent of the
 * cap (a company can cap at 40 and encash the excess, or cap at 0 and forfeit): the cap
 * decides how much rolls over, this decides what happens to the rest at year-end close.
 *   - forfeit: lapse the excess (the current, and default, behaviour).
 *   - encash:  pay the excess out (encashable types only) at year-end close.
 * This governs the YEAR-END event only; it does NOT cap the exit payout (exit encashes
 * the whole balance — see routers/settlement.ts).
 */
export const leaveYearEndTreatmentEnum = pgEnum("leave_year_end_treatment", [
  "forfeit",
  "encash",
]);

/**
 * Exit treatment — what the leaver is paid for this leave type at offboarding. The THIRD
 * independent axis (alongside the cap and the year-end treatment): real company policies
 * vary, so this is configurable, not a constant.
 *   - encash_all:   the whole available balance (retained + accrued). Default.
 *   - capped:       limited to maxCarryForwardDays — a company that caps the exit payout.
 *   - accrued_only: only leave accrued in the exit year, ignoring carried-forward days.
 * NOTE: encashability still outranks this — a non-encashable type is never paid on exit,
 * whatever this says. A state-level statutory floor (Shops & Establishments Acts) may
 * override a company's choice — recorded as an open CA question, NOT enforced here.
 */
export const leaveExitTreatmentEnum = pgEnum("leave_exit_treatment", [
  "encash_all",
  "capped",
  "accrued_only",
]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ── Salary Structures ──────────────────────────────────────────────────────
export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Family identity (M-05 versioning). Every effective-dated version of the same
     * logical structure shares one `familyId`; a new financial-year version is a NEW
     * ROW with the SAME familyId and a later `effectiveFrom`. Employees link to the
     * FAMILY (`employees.salaryStructureId` holds a familyId), never to a version's
     * `id`, so a superseded version stays immutable/readable (Form-16, re-runs) while
     * payroll resolves the version whose [effectiveFrom, effectiveTo) window contains
     * the pay period — exactly like `resolveStatutoryCeilings`. The first version of a
     * family sets familyId = its own id (backfilled that way in migration 0065).
     */
    familyId: uuid("family_id").notNull(),
    structureName: text("structure_name").notNull(),
    ctcAnnual: decimal("ctc_annual", { precision: 14, scale: 2 }).notNull(),
    basicPercent: decimal("basic_percent", { precision: 5, scale: 2 }).notNull().default("40"),
    hraPercentOfBasic: decimal("hra_percent_of_basic", { precision: 5, scale: 2 }).notNull().default("50"),
    // Dearness Allowance as a % of monthly CTC. The employer elects the wage-base composition:
    // basic alone, or basic + DA. DA is part of "wages" (Code on Wages s.2(y) core) — it joins
    // basic in the PF/ESI wage base and is carved OUT of the special-allowance residual, so it
    // does not fall into the excluded allowances. Default 0 = basic-alone composition (unchanged).
    daPercent: decimal("da_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    ltaAnnual: decimal("lta_annual", { precision: 12, scale: 2 }).notNull().default("0"),
    medicalAllowanceAnnual: decimal("medical_allowance_annual", { precision: 12, scale: 2 }).notNull().default("15000"),
    conveyanceAllowanceAnnual: decimal("conveyance_allowance_annual", { precision: 12, scale: 2 }).notNull().default("19200"),
    bonusAnnual: decimal("bonus_annual", { precision: 12, scale: 2 }).notNull().default("0"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("salary_structures_org_idx").on(t.orgId),
    // Resolver index: family window lookup by pay period.
    familyEffectiveIdx: index("salary_structures_family_effective_idx").on(
      t.orgId,
      t.familyId,
      t.effectiveFrom,
    ),
  }),
);

// ── Employees ──────────────────────────────────────────────────────────────
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull(), // EMP-0001
    department: text("department"),
    title: text("title"),
    jobGrade: text("job_grade"),
    managerId: uuid("manager_id"),
    dottedLineManagerId: uuid("dotted_line_manager_id"),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    location: text("location"),
    city: text("city"),
    state: text("state"),
    isMetroCity: boolean("is_metro_city").notNull().default(false),
    pan: text("pan"),
    /**
     * DPDP PAN minimisation match aids, stored ALONGSIDE raw `pan` (raw is retained for
     * TDS/Form-16 filing). `panMaskedHash` = peppered HMAC-SHA256 (lib/pii-hash.ts) match key;
     * `panMaskedDisplay` = `XXXXXX234A` visual mask. Never a substitute for the raw value.
     */
    panMaskedHash: text("pan_masked_hash"),
    panMaskedDisplay: text("pan_masked_display"),
    /**
     * DPDP Aadhaar minimisation: raw Aadhaar is never stored (raw column dropped in migration
     * 0037 after backfill). `aadhaarMaskedHash` is a peppered HMAC-SHA256 of the raw value
     * (statutory match only, see apps/api lib/pii-hash.ts); `aadhaarMaskedDisplay` is the
     * `XXXX-XXXX-1234` visual mask. Mirrors `esigners.aadhaarMaskedHash`.
     */
    aadhaarMaskedHash: text("aadhaar_masked_hash"),
    aadhaarMaskedDisplay: text("aadhaar_masked_display"),
    uan: text("uan"),
    esiIpNumber: text("esi_ip_number"),
    // Voluntary Provident Fund: an EXTRA employee PF rate above the statutory 12% (a percentage,
    // e.g. 8.00 = 12% + 8%). Employee-only — the employer's statutory 12% is unchanged (the EPF
    // scheme does not oblige the employer to match VPF). Default 0 = no VPF (unchanged).
    voluntaryPfRate: decimal("voluntary_pf_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    // EPFO Para 26(6): a joint declaration lets PF be contributed on the FULL basic (uncapped),
    // above the ₹15,000 ceiling. The uncapped base is computed ONLY where an approval reference
    // exists AND the effective date has been reached — no reference = the ceiling applies. Record
    // the request, the employer undertaking, the approval reference, and when it takes effect.
    // Unlike VPF, this is not the employee's to change at will; revocation is warned, not refused
    // (irrevocability is EPFO administrative convention, not statute).
    para266JointRequest: boolean("para266_joint_request").notNull().default(false),
    para266EmployerUndertaking: boolean("para266_employer_undertaking").notNull().default(false),
    para266ApprovalReference: text("para266_approval_reference"),
    para266EffectiveFrom: timestamp("para266_effective_from", { withTimezone: true }),
    /**
     * ESI membership for the CURRENT contribution period (Apr–Sep or Oct–Mar).
     * ESI eligibility is not a month-by-month gross test: membership is assessed at
     * the period boundary (1 Apr / 1 Oct) from the gross snapshot and HELD for the
     * whole period — a member stays a member even if gross later crosses ₹21,000
     * (contributions continue on actual gross), and a non-member does not join
     * mid-period. `esiMember` = the held flag; `esiMemberPeriodStart` = the 1-Apr/
     * 1-Oct it was assessed for. NULL = never assessed (the run establishes it at
     * the next boundary; a first mid-period run approximates from that month's gross
     * and flags it). The payroll run reads and re-assesses these; the pure engine
     * decides eligibility from them.
     */
    esiMember: boolean("esi_member"),
    esiMemberPeriodStart: timestamp("esi_member_period_start", { withTimezone: true }),
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    bankName: text("bank_name"),
    bankAccountName: text("bank_account_name"),
    taxRegime: taxRegimeEnum("tax_regime").notNull().default("new"),
    /**
     * Statutory gender — drives Maharashtra Professional-Tax bracket selection
     * (male/female differ). Nullable: unstated resolves to the male (lower-threshold)
     * slab per the CA, so absence never causes structural under-deduction. Not an HR
     * demographic field; it exists for PT correctness. See computePT (C2-STRUCT).
     */
    gender: genderEnum("gender"),
    /**
     * Date of birth — the ONLY source for the over-65 Professional-Tax exemption
     * (age is not otherwise derivable for employees; DOB was previously on the
     * directors/DIN table only). Nullable; when unset, the age exemption cannot apply
     * and PT is computed normally. See computePT PT-exemption guard (C2-STRUCT).
     */
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    /**
     * Professional-Tax exemption flags (CA Tier-1). If ANY is true, PT is bypassed
     * entirely for that employee across ALL states. These are DECLARED flags backed
     * by required evidence (recorded as a policy, documents stored in a later item):
     *  - armed forces: military ID or discharge order
     *  - own disability certificate: Form 10-IA signed by a Government Civil Surgeon
     *  - dependent-with-disability guardian: same certificate for the dependant
     * The age-over-65 exemption is derived from `dateOfBirth`, not a flag.
     * Default false = "not exempt" — the safe direction (PT is charged unless a
     * verified exemption is declared). See computePT PT-exemption guard.
     */
    ptExemptArmedForces: boolean("pt_exempt_armed_forces").notNull().default(false),
    ptExemptDisability: boolean("pt_exempt_disability").notNull().default(false),
    ptExemptDependentDisability: boolean("pt_exempt_dependent_disability")
      .notNull()
      .default(false),
    /**
     * PT4 — Form 12B prior-employer figures for the CURRENT financial year. When a new
     * joiner submits Form 12B, the employer is legally bound (s.192(2)) to account for the
     * salary already paid and the TDS already deducted by the previous employer, so the
     * rolling annual tax and the monthly TDS are computed on the combined income and the
     * already-deducted tax is netted off. The payroll engine already consumes
     * `previousEmployerIncome` / `previousEmployerTDS`; these columns are the intake that
     * was missing, so the inputs were hardcoded to 0.
     *
     * Both are nullable/default 0. A NULL/0 baseline is the CORRECT behaviour when no
     * Form 12B was submitted (Form 12B is optional for the employee) — the prior fix
     * produced that same zero, but by accident rather than by design. Stored as annual
     * rupee amounts for the FY. Not effective-dated: a single declaration per joiner per
     * FY; a mid-year employer change is a fresh 12B captured by updating these.
     */
    previousEmployerIncome: decimal("previous_employer_income", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    previousEmployerTds: decimal("previous_employer_tds", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /**
     * HRA — annual rent paid by the employee, declared for the House Rent Allowance
     * exemption (s.10(13A)). HRA exemption is the least of: HRA received, rent paid − 10%
     * of basic, and 50%/40% of basic (metro/non-metro, `isMetroCity`). Without rent there
     * is no exemption, so this is the missing input: the payroll engine computed HRA
     * exemption from a caller-supplied figure that nothing populated (always 0), so every
     * old-regime renter had their taxable income and TDS overstated.
     *
     * Declared through the investment-declaration process (provisional in April, proofs by
     * January) — captured here as a single annual figure per employee per FY. Nullable/
     * default 0: no rent declared ⇒ no exemption, which is the correct behaviour. Exemption
     * applies only under the OLD regime; the tax engine already ignores it for NEW, so a
     * value here never reduces new-regime tax.
     */
    rentPaidAnnual: decimal("rent_paid_annual", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    /**
     * M-05: holds a salary-structure FAMILY id, not a version id. The FK targets
     * `salaryStructures.id` because a family's id equals its origin (first) version's
     * id, and versions are immutable and never deleted — so this always references a
     * live row. Payroll never uses this row directly; it calls
     * `resolveSalaryStructureForPeriod(familyId, period)` to pick the version whose
     * effective window contains the pay period.
     */
    salaryStructureId: uuid("salary_structure_id").references(() => salaryStructures.id, { onDelete: "set null" }),
    /**
     * Assigned working shift (G8). Drives late / half-day derivation on
     * self-service punches. Nullable — when unset, capture falls back to the
     * org's default shift (`shiftSchedules.isDefault`), then to a built-in
     * 09:00 / 8h / 10-min-grace baseline. `set null` on delete so retiring a
     * shift definition un-assigns rather than orphaning the employee.
     */
    shiftScheduleId: uuid("shift_schedule_id").references((): AnyPgColumn => shiftSchedules.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    confirmationDate: timestamp("confirmation_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: employeeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmployeeIdIdx: uniqueIndex("employees_org_employee_id_idx").on(t.orgId, t.employeeId),
    orgIdx: index("employees_org_idx").on(t.orgId),
    userIdx: uniqueIndex("employees_user_idx").on(t.userId),
  }),
);

// ── HR Cases ───────────────────────────────────────────────────────────────
export const hrCases = pgTable(
  "hr_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * User-facing case number, `HRC-0001`, allocated from `org_counters` via
     * `getNextNumber` — the same path tickets, changes, problems and CSM cases
     * use. Before this existed the list rendered `id.slice(-8).toUpperCase()`:
     * not a fallback but the ONLY path, because there was no number to show.
     * Unique per org (see the index below).
     */
    number: text("number").notNull(),
    caseType: hrCaseTypeEnum("case_type").notNull(),
    /**
     * What the case is about, in the case-owner's words.
     *
     * Previously the list "Subject" column rendered the NOTES BODY with
     * `[RESOLVED:…]` / `[ARCHIVED:…]` markers stripped by a regex — a subject
     * reconstructed from a free-text blob. `notes` remains the running commentary;
     * this is the one-line summary the list actually needs.
     */
    subject: text("subject"),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    statusId: uuid("status_id").references(() => ticketStatuses.id, { onDelete: "restrict" }),
    status: hrCaseStatusEnum("status").notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    priority: text("priority").notNull().default("medium"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("hr_cases_org_idx").on(t.orgId),
    employeeIdx: index("hr_cases_employee_idx").on(t.employeeId),
    // Per-org uniqueness, matching the nine indexes migration 0086 added for the
    // other user-facing identifiers. A racing generator behind a unique index is a
    // user-facing 500, so the generator (`getNextNumber` → org_counters) and this
    // index land together.
    orgNumberIdx: uniqueIndex("hr_cases_org_number_idx").on(t.orgId, t.number),
  }),
);

// ── HR Case Tasks ──────────────────────────────────────────────────────────
export const hrCaseTasks = pgTable(
  "hr_case_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => hrCases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"), // pending | in_progress | done
    dueDate: timestamp("due_date", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: index("hr_case_tasks_case_idx").on(t.caseId),
  }),
);

// ── Onboarding Templates ───────────────────────────────────────────────────
export const onboardingTemplates = pgTable(
  "onboarding_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    department: text("department"),
    tasks: jsonb("tasks")
      .$type<Array<{
        title: string;
        assigneeRole: string;
        dueDateOffsetDays: number;
        description?: string;
      }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("onboarding_templates_org_idx").on(t.orgId),
  }),
);

export const onboardingDetails = pgTable(
  "onboarding_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name"),
    primaryEmail: text("primary_email"),
    secondaryEmail: text("secondary_email"),
    phone: text("phone"),
    secondaryPhone: text("secondary_phone"),
    educationDocs: text("education_docs"),
    employeeDocs: text("employee_docs"),
    signedOfferLetter: text("signed_offer_letter"),
    photo: text("photo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("onboarding_details_org_idx").on(t.orgId),
    empIdx: index("onboarding_details_emp_idx").on(t.employeeId),
  }),
);

// ── Leave Requests ─────────────────────────────────────────────────────────
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    days: decimal("days", { precision: 5, scale: 1 }).notNull(),
    status: leaveStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("leave_requests_org_idx").on(t.orgId),
    employeeIdx: index("leave_requests_employee_idx").on(t.employeeId),
    statusIdx: index("leave_requests_status_idx").on(t.status),
  }),
);

// ── Leave Balances ─────────────────────────────────────────────────────────
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    year: integer("year").notNull(),
    totalDays: decimal("total_days", { precision: 5, scale: 1 }).notNull().default("0"),
    usedDays: decimal("used_days", { precision: 5, scale: 1 }).notNull().default("0"),
    pendingDays: decimal("pending_days", { precision: 5, scale: 1 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeTypeYearIdx: uniqueIndex("leave_balances_employee_type_year_idx").on(
      t.employeeId,
      t.type,
      t.year,
    ),
  }),
);

// ── Payroll Runs ───────────────────────────────────────────────────────────

export type PayrollWorkflowMeta = {
  errors: Array<{ employeeId?: string; message: string }>;
  /** Set when period is locked / aggregates computed from `payroll-cycle`. */
  payrollEmployeeCount?: number;
  approvals: Array<{
    id: string;
    step: string;
    status: string;
    decidedAt?: string;
    comments?: string | null;
  }>;
};

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    status: payrollRunStatusEnum("status").notNull().default("draft"),
    /** 12-step UI lifecycle (DRAFT, PERIOD_LOCKED, …, COMPLETED). */
    pipelineStatus: text("pipeline_status").notNull().default("DRAFT"),
    runNumber: integer("run_number").notNull().default(1),
    workflowMetadata: jsonb("workflow_metadata")
      .$type<PayrollWorkflowMeta>()
      .notNull()
      .default(sql`'{"errors":[],"approvals":[]}'::jsonb`),
    totalGross: decimal("total_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    totalDeductions: decimal("total_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
    totalNet: decimal("total_net", { precision: 14, scale: 2 }).notNull().default("0"),
    totalPfEmployee: decimal("total_pf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPfEmployer: decimal("total_pf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    totalEsiEmployee: decimal("total_esi_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    totalEsiEmployer: decimal("total_esi_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPt: decimal("total_pt", { precision: 12, scale: 2 }).notNull().default("0"),
    totalTds: decimal("total_tds", { precision: 12, scale: 2 }).notNull().default("0"),
    /**
     * How many approval steps THIS run requires — 2 (HR → Finance) or 3
     * (HR → Finance → CFO). Stamped from the org setting AT CREATION and read
     * from here by the approval procedure, never from the current org setting.
     * That is what makes "changing the setting cannot alter a run already in
     * flight" enforced rather than merely intended. Existing rows default to 3.
     */
    approvalChainLength: integer("approval_chain_length").notNull().default(3),
    approvedByHrId: uuid("approved_by_hr_id").references(() => users.id, { onDelete: "set null" }),
    approvedByFinanceId: uuid("approved_by_finance_id").references(() => users.id, { onDelete: "set null" }),
    approvedByCfoId: uuid("approved_by_cfo_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMonthYearIdx: uniqueIndex("payroll_runs_org_month_year_idx").on(t.orgId, t.month, t.year),
    orgIdx: index("payroll_runs_org_idx").on(t.orgId),
  }),
);

// ── Payslips ───────────────────────────────────────────────────────────────
export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    /** G8: attendance basis of this payslip's gross (paid days vs loss-of-pay days). */
    paidDays: decimal("paid_days", { precision: 5, scale: 1 }).notNull().default("0"),
    lopDays: decimal("lop_days", { precision: 5, scale: 1 }).notNull().default("0"),
    // Dearness Allowance earned this month (its own earnings line). Part of gross, carved from
    // the special-allowance residual; feeds the PF/ESI wage base as basic+DA. Default 0.
    da: decimal("da", { precision: 12, scale: 2 }).notNull().default("0"),
    basic: decimal("basic", { precision: 12, scale: 2 }).notNull().default("0"),
    hra: decimal("hra", { precision: 12, scale: 2 }).notNull().default("0"),
    specialAllowance: decimal("special_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    lta: decimal("lta", { precision: 12, scale: 2 }).notNull().default("0"),
    medicalAllowance: decimal("medical_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    conveyanceAllowance: decimal("conveyance_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    bonus: decimal("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    grossEarnings: decimal("gross_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    pfEmployee: decimal("pf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    pfEmployer: decimal("pf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    // PF wage base actually used for the contribution (the 50%-clamp result, capped at the
    // PF ceiling). Persisted — not reverse-engineered from pfEmployee — so the EPFO ECR states
    // the number the run computed on: epfWages here, and epfWages * 12% == pfEmployee.
    pfWageBase: decimal("pf_wage_base", { precision: 12, scale: 2 }).notNull().default("0"),
    // Employer PF split. `pfEmployer` is the TOTAL employer contribution (EPF+EPS+EDLI+admin);
    // the ECR needs the EPS (8.33%, capped) and EPF (3.67%) shares separately. Not storing them
    // is exactly why the ECR double-counted EPS (defect 6). pfEmployerEps + pfEmployerEpf are the
    // two ECR employer figures; they do NOT sum to pfEmployer (which also carries EDLI + admin).
    pfEmployerEps: decimal("pf_employer_eps", { precision: 12, scale: 2 }).notNull().default("0"),
    pfEmployerEpf: decimal("pf_employer_epf", { precision: 12, scale: 2 }).notNull().default("0"),
    esiEmployee: decimal("esi_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    esiEmployer: decimal("esi_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    professionalTax: decimal("professional_tax", { precision: 10, scale: 2 }).notNull().default("0"),
    lwf: decimal("lwf", { precision: 10, scale: 2 }).notNull().default("0"),
    tds: decimal("tds", { precision: 12, scale: 2 }).notNull().default("0"),
    totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
    netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    ytdGross: decimal("ytd_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    ytdTds: decimal("ytd_tds", { precision: 12, scale: 2 }).notNull().default("0"),
    // Real year-to-date net pay and employee PF, persisted per run alongside
    // ytd_gross. Previously the display layer fabricated these as (this month × 12),
    // which produced YTD Net > YTD Gross on any partial year (first-real-payroll-run
    // finding). Precision matches ytd_gross (net can be large; PF is capped but keep
    // headroom).
    ytdNet: decimal("ytd_net", { precision: 14, scale: 2 }).notNull().default("0"),
    ytdPf: decimal("ytd_pf", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRegimeUsed: taxRegimeEnum("tax_regime_used").notNull().default("new"),
    pdfUrl: text("pdf_url"),
    /**
     * DPDP retention floor: statutory retention expiry (run `paidAt` + 8y, fallback create
     * time + 8y). The erasure executor must not anonymise/delete this payslip's identity link
     * until this date passes (RBI / Income Tax payroll retention). Nullable legacy (backfilled).
     */
    retainUntilDate: timestamp("retain_until_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeMonthYearIdx: uniqueIndex("payslips_employee_month_year_idx").on(t.employeeId, t.month, t.year),
    orgIdx: index("payslips_org_idx").on(t.orgId),
    payrollRunIdx: index("payslips_payroll_run_idx").on(t.payrollRunId),
    orgRetainIdx: index("payslips_org_retain_idx").on(t.orgId, t.retainUntilDate),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const employeesRelations = relations(employees, ({ one, many }) => ({
  org: one(organizations, { fields: [employees.orgId], references: [organizations.id] }),
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  salaryStructure: one(salaryStructures, { fields: [employees.salaryStructureId], references: [salaryStructures.id] }),
  hrCases: many(hrCases),
  leaveRequests: many(leaveRequests),
  leaveBalances: many(leaveBalances),
  payslips: many(payslips),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ one, many }) => ({
  org: one(organizations, { fields: [payrollRuns.orgId], references: [organizations.id] }),
  payslips: many(payslips),
}));

export const payslipsRelations = relations(payslips, ({ one }) => ({
  employee: one(employees, { fields: [payslips.employeeId], references: [employees.id] }),
  payrollRun: one(payrollRuns, { fields: [payslips.payrollRunId], references: [payrollRuns.id] }),
}));

// ── Gratuity (Payment of Gratuity Act, 1972) ───────────────────────────────
// Monthly accrual provisioning: one row per (employee, year, month) recognising
// the incremental gratuity liability earned that month, so the liability builds
// evenly rather than as a lump sum at exit. Idempotent per period.
export const gratuityAccruals = pgTable(
  "gratuity_accruals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12 calendar month
    basicPlusDA: decimal("basic_plus_da", { precision: 12, scale: 2 }).notNull().default("0"),
    accrualAmount: decimal("accrual_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Running provisioned liability for this employee after this period. */
    cumulativeAccrued: decimal("cumulative_accrued", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empPeriodIdx: uniqueIndex("gratuity_accruals_emp_period_idx").on(
      t.employeeId,
      t.year,
      t.month,
    ),
    orgIdx: index("gratuity_accruals_org_idx").on(t.orgId),
  }),
);

// Final gratuity settlement computed at exit (Payment of Gratuity Act §4).
export const gratuitySettlements = pgTable(
  "gratuity_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    lastDrawnBasicPlusDA: decimal("last_drawn_basic_plus_da", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    completedYears: integer("completed_years").notNull().default(0),
    trailingMonths: integer("trailing_months").notNull().default(0),
    countedYears: integer("counted_years").notNull().default(0),
    eligible: boolean("eligible").notNull().default(false),
    /** Formula result before the statutory cap. */
    grossGratuity: decimal("gross_gratuity", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Payable gratuity after the statutory cap. */
    gratuityAmount: decimal("gratuity_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    cappedAtCeiling: boolean("capped_at_ceiling").notNull().default(false),
    reason: text("reason"), // resignation | retirement | death | disablement | termination
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
    settledById: uuid("settled_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empIdx: uniqueIndex("gratuity_settlements_emp_idx").on(t.employeeId),
    orgIdx: index("gratuity_settlements_org_idx").on(t.orgId),
  }),
);

// Full-and-final settlement composed at exit: last salary + leave encashment + gratuity −
// recoveries. One per employee (unique index → idempotent). COMPONENT figures are stored as
// they were AT settlement — not just the total — so the record is disputable and auditable and
// does not move when a rate later changes. Net floors at zero; any excess of recoveries over the
// payable parts is surfaced as `unrecoveredShortfall` (money must not vanish), the same
// invariant the payslip engine uses.
export const finalSettlements = pgTable(
  "final_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // ── Payable components (as at settlement) ──
    lastSalary: decimal("last_salary", { precision: 14, scale: 2 }).notNull().default("0"),
    leaveEncashment: decimal("leave_encashment", { precision: 14, scale: 2 }).notNull().default("0"),
    gratuity: decimal("gratuity", { precision: 14, scale: 2 }).notNull().default("0"),
    // ── Recoveries (each line stored; total derived) ──
    noticeShortfall: decimal("notice_shortfall", { precision: 14, scale: 2 }).notNull().default("0"),
    advanceRecovery: decimal("advance_recovery", { precision: 14, scale: 2 }).notNull().default("0"),
    assetRecovery: decimal("asset_recovery", { precision: 14, scale: 2 }).notNull().default("0"),
    totalRecoveries: decimal("total_recoveries", { precision: 14, scale: 2 }).notNull().default("0"),
    // ── Composition ──
    grossSettlement: decimal("gross_settlement", { precision: 14, scale: 2 }).notNull().default("0"),
    netSettlement: decimal("net_settlement", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Recoveries in excess of the payable parts — a debt the ex-employee owes; never lost. */
    unrecoveredShortfall: decimal("unrecovered_shortfall", { precision: 14, scale: 2 }).notNull().default("0"),
    // ── Statutory (Decision 1: settled as a separate event, so TDS is handled here) ──
    /** Gratuity above the ₹20,00,000 s.10(10) exemption. */
    taxableGratuity: decimal("taxable_gratuity", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Leave encashment above the ₹25,00,000 s.10(10AA) exemption. */
    taxableEncashment: decimal("taxable_encashment", { precision: 14, scale: 2 }).notNull().default("0"),
    tds: decimal("tds", { precision: 14, scale: 2 }).notNull().default("0"),
    reason: text("reason"), // resignation | retirement | death | disablement | termination
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
    settledById: uuid("settled_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empIdx: uniqueIndex("final_settlements_emp_idx").on(t.employeeId),
    orgIdx: index("final_settlements_org_idx").on(t.orgId),
  }),
);

export const finalSettlementsRelations = relations(finalSettlements, ({ one }) => ({
  employee: one(employees, {
    fields: [finalSettlements.employeeId],
    references: [employees.id],
  }),
}));

export const gratuityAccrualsRelations = relations(gratuityAccruals, ({ one }) => ({
  employee: one(employees, {
    fields: [gratuityAccruals.employeeId],
    references: [employees.id],
  }),
}));

export const gratuitySettlementsRelations = relations(gratuitySettlements, ({ one }) => ({
  employee: one(employees, {
    fields: [gratuitySettlements.employeeId],
    references: [employees.id],
  }),
}));

// ── Leave Accrual Policy & Ledger ──────────────────────────────────────────
// Per-org, per-leave-type policy that drives monthly accrual, the year-end
// carry-forward cap and whether the balance is encashable. One row per
// (org, leave type).
export const leavePolicies = pgTable(
  "leave_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    /** Total leave days credited per full year. */
    annualEntitlementDays: decimal("annual_entitlement_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    /** Explicit monthly rate; null = annualEntitlementDays / 12. */
    monthlyAccrualDays: decimal("monthly_accrual_days", { precision: 5, scale: 1 }),
    /** Maximum unused days that may roll into the next year (0 = none). */
    maxCarryForwardDays: decimal("max_carry_forward_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    /** Whether the leave type may be encashed. */
    encashable: boolean("encashable").notNull().default(false),
    /**
     * Year-end treatment of the balance above `maxCarryForwardDays` — encash it or
     * forfeit it. Independent of the cap. Default "forfeit" preserves today's close.run
     * behaviour (always lapsed). Does NOT affect the exit payout, which is uncapped.
     */
    yearEndTreatment: leaveYearEndTreatmentEnum("year_end_treatment")
      .notNull()
      .default("forfeit"),
    /**
     * Exit treatment — how much of this type is encashed on offboarding. Default
     * "encash_all" preserves settlement's current whole-balance behaviour (and never
     * underpays a leaver). Encashability still outranks it; a state statutory floor may
     * override it (open CA question, not enforced).
     */
    exitTreatment: leaveExitTreatmentEnum("exit_treatment")
      .notNull()
      .default("encash_all"),
    // ── LEAVE-MODEL axes (all default to today's behaviour) ──────────────────
    /** Encashment wage basis — Basic+DA (current) or Gross. */
    encashmentBasis: leaveEncashmentBasisEnum("encashment_basis").notNull().default("basic_da"),
    /** Per-day divisor for encashment: (wage / divisor). 26 today; 30 is the CCS convention. */
    encashmentDivisor: integer("encashment_divisor").notNull().default(26),
    /** Whether taking this leave DEBITS the balance. Maternity/paternity et al. must NOT — else
     *  they silently consume another balance. Default true preserves current behaviour. */
    debitsBalance: boolean("debits_balance").notNull().default(true),
    /** Balance expiry: at year-end (default) or a fixed rolling window (comp-off). */
    expiryMode: leaveExpiryModeEnum("expiry_mode").notNull().default("year_end"),
    /** Window length in weeks when expiryMode = window_weeks (comp-off: 4–8). Null otherwise. */
    expiryWindowWeeks: integer("expiry_window_weeks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgTypeIdx: uniqueIndex("leave_policies_org_type_idx").on(t.orgId, t.type),
    orgIdx: index("leave_policies_org_idx").on(t.orgId),
  }),
);

/**
 * Exit-encashment rule PER exit reason, per tenant, per leave type (LEAVE-MODEL headline —
 * CCS Rule 39 shows exit treatment varies by WHY the person left). One row overrides the
 * default `encash_full` for a (type, reason) pair. `reason` is free text matching settlement's
 * reason set (resignation | retirement | death | disablement | termination | dismissal) — kept
 * as text, not an enum, because it mirrors settlement's existing text `reason` column.
 */
export const leaveExitRules = pgTable(
  "leave_exit_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    reason: text("reason").notNull(),
    treatment: leaveExitRuleTreatmentEnum("treatment").notNull().default("encash_full"),
    /** proportion (fraction, e.g. 0.5) or cap (days) — meaning depends on `treatment`. */
    param: decimal("param", { precision: 8, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: uniqueIndex("leave_exit_rules_scope_idx").on(t.orgId, t.type, t.reason),
    orgIdx: index("leave_exit_rules_org_idx").on(t.orgId),
  }),
);

/**
 * National + per-state leave baseline (PT-STATES precedent: all 36 states/UTs present, those
 * following the national baseline recorded as a FACT — `followsBaseline` — not left absent, so
 * nobody rediscovers a gap). `orgId` null = the platform national baseline; a state that differs
 * carries an override row. Per-state QUANTA are verified per-state against each state's own Shops
 * & Establishments / Factories Act (a deferred CA data task) — every row ships as `baseline`.
 */
export const leaveStateBaselines = pgTable(
  "leave_state_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = platform national baseline; a tenant may hold overrides in future. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    stateCode: text("state_code").notNull(),
    stateName: text("state_name").notNull(),
    /** True = this state follows the national baseline (the recorded fact, pending verification). */
    followsBaseline: boolean("follows_baseline").notNull().default(true),
    /** Baseline entitlements (national defaults; overridden per verified state). */
    earnedLeaveDays: decimal("earned_leave_days", { precision: 5, scale: 1 }).notNull().default("0"),
    casualLeaveDays: decimal("casual_leave_days", { precision: 5, scale: 1 }).notNull().default("0"),
    sickLeaveDays: decimal("sick_leave_days", { precision: 5, scale: 1 }).notNull().default("0"),
    /** Some states (Delhi) combine CL+SL into one entitlement rather than separate. */
    casualSickCombined: boolean("casual_sick_combined").notNull().default(false),
    /** Some states (Tripura) permit 50% salary for CL/SL rather than full pay. */
    sickHalfPay: boolean("sick_half_pay").notNull().default(false),
    carryForwardFloorDays: decimal("carry_forward_floor_days", { precision: 5, scale: 1 }).notNull().default("0"),
    /** Provenance — must be the state's own act before a row is trusted beyond `baseline`. */
    provenance: text("provenance"),
    notes: text("notes"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: uniqueIndex("leave_state_baselines_scope_idx").on(t.stateCode, t.orgId, t.effectiveFrom),
    stateIdx: index("leave_state_baselines_state_idx").on(t.stateName),
  }),
);

// Immutable ledger of leave-accrual events. Each row is one recognised event:
// a monthly accrual, a year-end carry-forward, a lapse, or an encashment.
// Monthly accrual is idempotent per (employee, type, year, month).
export const leaveAccrualEventTypeEnum = pgEnum("leave_accrual_event_type", [
  "accrual",
  "carry_forward",
  "lapse",
  "encashment",
]);

export const leaveAccrualEvents = pgTable(
  "leave_accrual_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    eventType: leaveAccrualEventTypeEnum("event_type").notNull(),
    year: integer("year").notNull(),
    /** Calendar month 1-12 for accrual events; null for year-end events. */
    month: integer("month"),
    /** Signed day delta: +accrual/+carry-forward, −lapse/−encashment. */
    days: decimal("days", { precision: 6, scale: 1 }).notNull().default("0"),
    /** Rupee value for encashment events; 0 otherwise. */
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    /**
     * The day this event is anchored to. For comp-off (COMPOFF-EARN): the WORKED holiday/weekend
     * date an accrual credit was earned on, and the anchor its rolling window-expiry ages against
     * (year/month alone are too coarse for a weeks-based window). Null for the monthly-accrual /
     * year-end events, which are anchored by year/month.
     */
    eventDate: timestamp("event_date", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency for the monthly accrual event only.
    accrualPeriodIdx: uniqueIndex("leave_accrual_events_accrual_period_idx").on(
      t.employeeId,
      t.type,
      t.eventType,
      t.year,
      t.month,
    ),
    orgIdx: index("leave_accrual_events_org_idx").on(t.orgId),
    employeeIdx: index("leave_accrual_events_employee_idx").on(t.employeeId),
  }),
);

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  org: one(organizations, { fields: [leavePolicies.orgId], references: [organizations.id] }),
}));

export const leaveAccrualEventsRelations = relations(leaveAccrualEvents, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveAccrualEvents.employeeId],
    references: [employees.id],
  }),
}));

// ── India Public Holiday Calendar ─────────────────────────────────────────
export const publicHolidayTypeEnum = pgEnum("public_holiday_type", [
  "national",
  "restricted",
  "state",
  "company",
]);

export const publicHolidays = pgTable(
  "public_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: publicHolidayTypeEnum("type").notNull().default("national"),
    /** ISO 3166-2:IN state code, e.g. "MH", or null for all-India */
    stateCode: text("state_code"),
    year: integer("year").notNull(),
    isOptional: boolean("is_optional").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgYearIdx: index("public_holidays_org_year_idx").on(t.orgId, t.year),
    orgDateIdx: index("public_holidays_org_date_idx").on(t.orgId, t.date),
  }),
);

// ── Attendance ────────────────────────────────────────────────────────────
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "half_day",
  "late",
  "on_leave",
  "holiday",
  "weekend",
]);

export const shiftTypeEnum = pgEnum("shift_type", [
  "morning",
  "afternoon",
  "night",
  "flexible",
  "remote",
]);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    status: attendanceStatusEnum("status").notNull().default("present"),
    shiftType: shiftTypeEnum("shift_type").notNull().default("flexible"),
    checkIn: timestamp("check_in", { withTimezone: true }),
    checkOut: timestamp("check_out", { withTimezone: true }),
    /** Total hours worked (decimal, e.g. 8.5) */
    hoursWorked: decimal("hours_worked", { precision: 4, scale: 2 }),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmployeeDateIdx: uniqueIndex("attendance_org_employee_date_idx").on(t.orgId, t.employeeId, t.date),
    orgDateIdx: index("attendance_org_date_idx").on(t.orgId, t.date),
  }),
);

// ── Shift schedules (G8) ──────────────────────────────────────────────────
/**
 * A named working-shift definition. `startMinutes` is minutes-from-local-
 * midnight (e.g. 540 = 09:00) and `durationMinutes` the expected working span
 * (e.g. 480 = 8h) — stored as offsets (not a `time`/`timestamp`) so they are
 * timezone-agnostic and compare cleanly against a punch's local wall-clock.
 * `graceMinutes` is the lateness tolerance before a check-in counts as `late`.
 * Exactly one row per org may carry `isDefault = true` (partial unique index):
 * it is the fallback shift for employees with no explicit assignment.
 */
export const shiftSchedules = pgTable(
  "shift_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Minutes from local midnight the shift starts (e.g. 540 = 09:00). */
    startMinutes: integer("start_minutes").notNull().default(540),
    /** Expected working span in minutes (e.g. 480 = 8h). */
    durationMinutes: integer("duration_minutes").notNull().default(480),
    /** Lateness tolerance before a check-in is flagged `late`. */
    graceMinutes: integer("grace_minutes").notNull().default(10),
    /** The org fallback shift for employees with no assignment. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("shift_schedules_org_idx").on(t.orgId),
    orgNameIdx: uniqueIndex("shift_schedules_org_name_idx").on(t.orgId, t.name),
    // At most one default shift per org.
    orgDefaultIdx: uniqueIndex("shift_schedules_org_default_idx")
      .on(t.orgId)
      .where(sql`${t.isDefault} = true`),
  }),
);

// ── Expense Management (enums: ./expenses) ────────────────────────────────
export const expenseClaims = pgTable(
  "expense_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: expenseCategoryEnum("category").notNull().default("miscellaneous"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
    status: expenseStatusEnum("status").notNull().default("draft"),
    receiptUrl: text("receipt_url"),
    projectCode: text("project_code"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
    paymentMode: text("payment_mode"),
    notes: text("notes"),
    /** Free-text merchant string (OCR-extracted or manual). */
    merchant: text("merchant"),
    /** Distance for `transport`/`fuel` claims, used by the mileage policy. */
    mileageKm: decimal("mileage_km", { precision: 10, scale: 2 }),
    /** Stable code from {@link evaluateExpenseClaim} when a claim violates org policy. */
    policyViolationCode: text("policy_violation_code"),
    policyViolationReason: text("policy_violation_reason"),
    /** Raw structured output from receipt-OCR for audit / re-extraction; provider-specific shape. */
    ocrExtracted: jsonb("ocr_extracted").$type<Record<string, unknown>>(),
    ocrConfidence: decimal("ocr_confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("expense_claims_org_idx").on(t.orgId),
    employeeIdx: index("expense_claims_employee_idx").on(t.employeeId),
    statusIdx: index("expense_claims_status_idx").on(t.status),
    numberOrgIdx: uniqueIndex("expense_claims_number_org_idx").on(t.orgId, t.number),
  }),
);

// ── OKR / Goal Management ─────────────────────────────────────────────────
export const okrCycleEnum = pgEnum("okr_cycle", ["q1", "q2", "q3", "q4", "annual"]);
export const okrStatusEnum = pgEnum("okr_status", ["draft", "active", "completed", "cancelled"]);
export const krStatusEnum = pgEnum("kr_status", ["on_track", "at_risk", "behind", "completed"]);

export const okrObjectives = pgTable(
  "okr_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Self-referential alignment link: a child objective (individual/team)
     * cascades up to a parent objective (team/org). SET NULL so detaching or
     * deleting a parent orphans the child rather than deleting it.
     */
    parentObjectiveId: uuid("parent_objective_id").references(
      (): AnyPgColumn => okrObjectives.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    cycle: okrCycleEnum("cycle").notNull().default("q1"),
    year: integer("year").notNull(),
    status: okrStatusEnum("status").notNull().default("draft"),
    /** Own progress: average attainment of this objective's own key results. */
    overallProgress: integer("overall_progress").notNull().default(0),
    /**
     * G12: persisted cascade rollup — average of this objective's own progress
     * and every descendant's own progress. Recomputed and walked up the parent
     * chain on every key-result change, so a parent always reflects how its
     * aligned children are tracking without an on-read traversal.
     */
    rollupProgress: integer("rollup_progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("okr_objectives_org_idx").on(t.orgId),
    ownerIdx: index("okr_objectives_owner_idx").on(t.ownerId),
    parentIdx: index("okr_objectives_parent_idx").on(t.parentObjectiveId),
  }),
);

export const okrKeyResults = pgTable(
  "okr_key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => okrObjectives.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull().default("100"),
    currentValue: decimal("current_value", { precision: 12, scale: 2 }).notNull().default("0"),
    unit: text("unit").notNull().default("%"),
    status: krStatusEnum("status").notNull().default("on_track"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("okr_key_results_org_idx").on(t.orgId),
    objectiveIdx: index("okr_key_results_objective_idx").on(t.objectiveId),
  }),
);

// ── Offboarding Details ───────────────────────────────────────────────────
export const offboardingDetails = pgTable(
  "offboarding_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name"),
    separationDocs: text("separation_docs"),
    clearanceDocs: text("clearance_docs"),
    securityClearance: text("security_clearance"),
    status: text("status").notNull().default("pending"), // pending | completed
    ffStatus: text("ff_status").notNull().default("pending"), // pending | initiated | completed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("offboarding_details_org_idx").on(t.orgId),
    empIdx: index("offboarding_details_emp_idx").on(t.employeeId),
  }),
);

// ── Lifecycle Events ───────────────────────────────────────────────────────
export const lifecycleEvents = pgTable(
  "lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    eventType: text("event_type").notNull().default("employee_transition"),
    hrTaskStatus: text("hr_task_status").notNull().default("pending"), // pending | completed
    itTaskStatus: text("it_task_status").notNull().default("pending"), // pending | completed
    payrollCompliance: text("payroll_compliance").notNull().default("no"), // yes | no
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("lifecycle_events_org_idx").on(t.orgId),
    empIdx: index("lifecycle_events_emp_idx").on(t.employeeId),
  }),
);

// ── Tax declarations (C1 Piece 1) ──────────────────────────────────────────
// Old-regime Chapter VI-A + 24(b) deductions an employee declares for a fiscal year. Per employee
// per FY — declarations are annual and must not be overwritten across years: the CA's mechanism
// (declared provisionally in April, physical proofs by January, else values zeroed with the extra
// tax spread over February–March) needs per-year scoping + provenance. `ingest.ts:174` anticipated it.
export const declarationProvenanceEnum = pgEnum("declaration_provenance", [
  "provisional", // declared in April; proofs not yet furnished
  "proven",      // physical proofs furnished (by January)
  "lapsed",      // proofs not furnished — values zeroed, extra tax spread over Feb–Mar (later unit)
]);

export const taxDeclarations = pgTable(
  "tax_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fiscalYear: integer("fiscal_year").notNull(), // FY start year, e.g. 2026 for FY 2026-27
    // Old-regime deductions (₹). Caps are enforced in computeTax, not here (80C ₹1.5L, 80D ₹75k,
    // 80CCD1B ₹50k, 80TTA ₹10k, 24b ₹2L) — this stores the raw declared value.
    section80C: decimal("section_80c", { precision: 14, scale: 2 }).notNull().default("0"),
    section80D: decimal("section_80d", { precision: 14, scale: 2 }).notNull().default("0"),
    section80CCD1B: decimal("section_80ccd1b", { precision: 14, scale: 2 }).notNull().default("0"),
    section80TTA: decimal("section_80tta", { precision: 14, scale: 2 }).notNull().default("0"),
    section24B: decimal("section_24b", { precision: 14, scale: 2 }).notNull().default("0"),
    provenance: declarationProvenanceEnum("provenance").notNull().default("provisional"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One declaration per employee per fiscal year.
    employeeFyIdx: uniqueIndex("tax_declarations_employee_fy_idx").on(t.employeeId, t.fiscalYear),
    orgIdx: index("tax_declarations_org_idx").on(t.orgId),
  }),
);
