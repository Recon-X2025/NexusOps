import { router, permissionProcedure, protectedProcedure, adminProcedure, paginationInput, type Context } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { checkDbUserPermission } from "../lib/rbac-db";
import { assertSelfOrPermitted, type SelfServiceCtx as SharedSelfServiceCtx } from "../lib/self-or-permitted";
import { z } from "zod";
import { assertSameOrg, assertSameOrgIfPresent } from "../lib/assert-same-org";
import { resolveAssignment } from "../services/assignment";
import { evaluateExpenseClaim } from "../lib/expense-policy";
import { extractReceipt } from "../services/ai-receipt-ocr";
import { decryptPan, panColumnsTolerant, employeePanField } from "../lib/pan";
import { getNextEmployeeNumber, getNextNumber } from "../lib/auto-number";
import {
  employees,
  organizations,
  hrCases,
  hrCaseTasks,
  leaveRequests,
  leaveBalances,
  leavePolicies,
  attendanceRecords,
  shiftSchedules,
  onboardingTemplates,
  onboardingDetails,
  offboardingDetails,
  lifecycleEvents,
  users,
  jobRequisitions,
  candidateApplications,
  surveys,
  surveyResponses,
  performanceReviews,
  reviewCycles,
  employeeStatusEnum,
  leaveStatusEnum,
  expenseStatusEnum,
  eq,
  ne,
  and,
  desc,
  asc,
  count,
  sql,
  isNull,
  gte,
  inArray,
  type SQL,
  type DbOrTx,
  salaryStructures,
} from "@coheronconnect/db";
import { getTableColumns } from "drizzle-orm";
import { collectReportSubtreeEmployeeIds } from "../lib/employee-subtree";
import { expandLeaveToAttendance } from "../lib/india/leave-attendance";
import { normaliseFeed, type RawAttendanceFeedRow } from "../lib/india/attendance-ingest";
import { resolveShift, derivePunch, type ShiftDefinition } from "../lib/india/shift-schedule";
import { resolveSalaryStructureForPeriod } from "../lib/india/salary-structure-resolver";
// Account number is encrypted at rest, same envelope mechanism as PAN. IFSC stays plaintext.
import { bankAccountColumns } from "../lib/bank-account";
import { CreateLeaveRequestSchema, LeaveTypeEnum } from "@coheronconnect/types";
import { normaliseStateToCode } from "@coheronconnect/payroll-math";
import { runEntityBusinessRules } from "../services/business-rules-engine";
import { emitDomainEvent } from "../services/workflow-events";

// ── Employee intake guards (2a), reused by create + update ────────────────────
// Server-side because a form-only rule is bypassable by any tRPC caller.
const MIN_EMPLOYEE_AGE_YEARS = 18; // company POLICY, not a statutory minimum — see fix-plan.

// LEAVE-TYPES / LEAVE-MODEL: these types grant leave as a separate statutory/policy entitlement and
// must NOT draw down a leave balance, even when a tenant has not configured an explicit policy row.
// (CCS Leave Rules: maternity/paternity/child-care are not debited to the leave account.) An explicit
// policy row still wins in either direction — this only sets the default when none exists.
const NON_DEBITING_DEFAULT_TYPES = new Set<string>(["maternity", "paternity", "parental"]);
/** Whether a created/approved leave request debits a balance. Explicit policy wins; absent a policy
 *  row, maternity/paternity/parental default to non-debiting and every other type to debiting. */
function policyDebits(policy: { debitsBalance: boolean } | undefined, type: string): boolean {
  if (policy) return policy.debitsBalance;
  return !NON_DEBITING_DEFAULT_TYPES.has(type);
}
/** Reject a future DOB, and a DOB under the policy minimum age. No-op when absent. */
function checkDob(d: Date | undefined, ctx: z.RefinementCtx): void {
  if (d === undefined) return;
  if (d.getTime() > Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date of birth cannot be in the future.", path: ["dateOfBirth"] });
    return;
  }
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MIN_EMPLOYEE_AGE_YEARS);
  if (d.getTime() > cutoff.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Employee must be at least ${MIN_EMPLOYEE_AGE_YEARS} (company policy — not a statutory minimum).`,
      path: ["dateOfBirth"],
    });
  }
}
/** STATE-UNKNOWN: a misspelled state silently computes ₹0 PT — reject anything not on the canonical list. */
const isRecognisedState = (s: string): boolean => normaliseStateToCode(s) !== null;
const STATE_UNKNOWN_MESSAGE =
  "Unrecognised state — check the spelling. An unknown state silently computes ₹0 professional tax.";

/**
 * Employee columns returned from read paths. Raw Aadhaar is no longer stored (dropped in
 * migration 0037 for DPDP minimisation), so this mirrors the table.
 */
const employeePublicColumns = getTableColumns(employees);

/**
 * Resolve the authenticated user's own employee record plus their *effective*
 * shift for self-service attendance (G8). Precedence: the employee's assigned
 * shift → the org's default shift (`shiftSchedules.isDefault`) → the built-in
 * baseline (handled by `resolveShift`). Returns `null` when the user has no
 * linked employee so the caller can raise the standard FORBIDDEN.
 */
async function resolveSelfEmployeeWithShift(
  db: DbOrTx,
  userId: string,
  orgId: string,
): Promise<{ id: string; shift: ShiftDefinition } | null> {
  const [emp] = await db
    .select({ id: employees.id, shiftScheduleId: employees.shiftScheduleId })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.orgId, orgId)))
    .limit(1);
  if (!emp) return null;

  let assigned: ShiftDefinition | null = null;
  if (emp.shiftScheduleId) {
    const [s] = await db
      .select({
        startMinutes: shiftSchedules.startMinutes,
        durationMinutes: shiftSchedules.durationMinutes,
        graceMinutes: shiftSchedules.graceMinutes,
      })
      .from(shiftSchedules)
      .where(and(eq(shiftSchedules.id, emp.shiftScheduleId), eq(shiftSchedules.orgId, orgId)))
      .limit(1);
    assigned = s ?? null;
  }

  let orgDefault: ShiftDefinition | null = null;
  if (!assigned) {
    const [d] = await db
      .select({
        startMinutes: shiftSchedules.startMinutes,
        durationMinutes: shiftSchedules.durationMinutes,
        graceMinutes: shiftSchedules.graceMinutes,
      })
      .from(shiftSchedules)
      .where(and(eq(shiftSchedules.orgId, orgId), eq(shiftSchedules.isDefault, true)))
      .limit(1);
    orgDefault = d ?? null;
  }

  return { id: emp.id, shift: resolveShift(assigned, orgDefault) };
}

/**
 * Self-service ownership guard.
 *
 * `hr:write` is the single gate on 34 procedures, mixing an employee's own
 * actions (submit my claim, clock myself in) with manager and statutory ones
 * (approve a claim, create a holiday, mark a PF challan paid). The base
 * `requester` role therefore had to grant all of it or none of it, and it
 * granted all of it — so any employee could approve expenses.
 *
 * `requester` now holds `hr:read` only. The genuinely self-service procedures
 * call this instead: anyone who really holds `hr:write` (hr_manager, admin,
 * owner) may act on any employee, and everyone else may act only on the employee
 * record that belongs to them.
 */
type SelfServiceCtx = SharedSelfServiceCtx;

/**
 * Round 4's helper, now expressed in terms of the shared one. The behaviour is
 * unchanged — hr:write, or your own record — but there is a single ownership
 * implementation in the codebase rather than one per module.
 */
async function assertSelfOrHrWriter(
  ctx: SelfServiceCtx,
  employeeId: string,
): Promise<void> {
  return assertSelfOrPermitted(ctx, employeeId, [["hr", "write"]]);
}

export const hrRouter = router({
  /** Compact counts for platform home (US-HCM-004). */
  platformHomeStrip: permissionProcedure("hr", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;
    const [caseCntRow] = await db
      .select({ caseCnt: count() })
      .from(hrCases)
      .where(eq(hrCases.orgId, orgId));
    const caseCnt = caseCntRow?.caseCnt ?? 0;
    const [totalEmpRow] = await db
      .select({ totalEmp: count() })
      .from(employees)
      .where(eq(employees.orgId, orgId));
    const totalEmp = totalEmpRow?.totalEmp ?? 0;
    const [onboardingCasesRow] = await db
      .select({ onboardingCases: count() })
      .from(hrCases)
      .where(and(eq(hrCases.orgId, orgId), eq(hrCases.caseType, "onboarding")));
    const onboardingCases = onboardingCasesRow?.onboardingCases ?? 0;
    const [offboardingCasesRow] = await db
      .select({ offboardingCases: count() })
      .from(hrCases)
      .where(and(eq(hrCases.orgId, orgId), eq(hrCases.caseType, "offboarding")));
    const offboardingCases = offboardingCasesRow?.offboardingCases ?? 0;
    return {
      hrCases: Number(caseCnt ?? 0),
      totalEmployees: Number(totalEmp ?? 0),
      onboardingCases: Number(onboardingCases ?? 0),
      offboardingCases: Number(offboardingCases ?? 0),
    };
  }),

  peopleWorkplace: router({
    getIntegrationFlags: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const raw = (row?.settings ?? {}) as Record<string, unknown>;
      const pw = (raw.peopleWorkplace as Record<string, unknown> | undefined) ?? {};
      return {
        facilitiesLive: pw.facilitiesLive !== false,
      };
    }),
    updateIntegrationFlags: adminProcedure
      .input(z.object({
        facilitiesLive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prev = (raw.peopleWorkplace as Record<string, unknown> | undefined) ?? {};
        const peopleWorkplace = { ...prev, ...input };
        await db
          .update(organizations)
          .set({ settings: { ...raw, peopleWorkplace } })
          .where(eq(organizations.id, org!.id));
        return {
          facilitiesLive: peopleWorkplace.facilitiesLive !== false,
        };
      }),
  }),

  employees: router({
    list: permissionProcedure("hr", "read")
      .input(
        z.object({
          department: z.string().optional(),
          status: z.enum(employeeStatusEnum.enumValues).optional(),
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(employees.orgId, org!.id)];
        if (input.status) conditions.push(eq(employees.status, input.status));
        if (input.department) conditions.push(eq(employees.department, input.department));

        const rows = await db
          .select({ emp: employees, userName: users.name, userEmail: users.email })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(and(...conditions))
          .orderBy(asc(users.name))
          .limit(input.limit)
          .offset(input.offset);

        return rows.map((row: (typeof rows)[number]) => {
          const { emp, userName, userEmail } = row;
          return {
            ...emp,
            // Never ship the raw ENCRYPTED PAN to the client. The masked display
            // (`panMaskedDisplay`, e.g. "XXXXXX999Z") is the safe value for the UI; sending the
            // `v2:` envelope let the edit form show ciphertext and re-encrypt it on Save
            // (double-encryption). The PAN is decrypted only where it is genuinely needed
            // (payslip / Form-16), never in the directory.
            pan: null,
            name: userName,
            email: userEmail,
            employeeNumber: emp.employeeId,
            jobTitle: emp.title,
          };
        });
      }),

    /** Org users who do not yet have an employee row (for linking a new employee record). */
    listUsersWithoutEmployee: permissionProcedure("hr", "assign")
      .input(paginationInput)
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .leftJoin(employees, eq(users.id, employees.userId))
          .where(and(eq(users.orgId, org!.id), isNull(employees.id)))
          .orderBy(asc(users.name))
          .limit(input.limit)
          .offset(input.offset);
      }),

    get: permissionProcedure("hr", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [employee] = await db
          .select(employeePublicColumns)
          .from(employees)
          .where(and(eq(employees.id, input.id), eq(employees.orgId, org!.id)));

        if (!employee) throw new TRPCError({ code: "NOT_FOUND" });

        const reportees = await db
          .select(employeePublicColumns)
          .from(employees)
          .where(and(eq(employees.managerId, input.id), eq(employees.orgId, org!.id)));

        // Strip the raw encrypted PAN from the wire (keep `panMaskedDisplay`); see the list query.
        return {
          employee: { ...employee, pan: null },
          reportees: reportees.map((r: typeof employee) => ({ ...r, pan: null })),
        };
      }),

    create: permissionProcedure("hr", "assign")
      .input(
        z.object({
          userId: z.string().uuid().optional(),
          userName: z.string().optional(),
          userEmail: z.string().email().optional(),
          department: z.string().optional(),
          title: z.string().optional(),
          managerId: z.string().uuid().nullable().optional(),
          jobGrade: z.string().optional(),
          dottedLineManagerId: z.string().uuid().nullable().optional(),
          employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]).default("full_time"),
          location: z.string().optional(),
          startDate: z.coerce.date().optional(),
          // ADD-EMP-STRUCT: a structure-less active employee cannot be paid — required at create.
          salaryStructureId: z.string().uuid("A salary structure is required — an employee without one cannot be paid."),
          // ── Statutory ingestion (C2-STRUCT / C1 / C3) ──
          // Location: state is required at this boundary — it drives PT slab selection
          // and there is no safe silent default (the old Maharashtra fallback filed the
          // wrong PT). city/isMetroCity feed HRA metro (50% vs 40%).
          state: z
            .string()
            .trim()
            .min(1, "State is required (drives professional-tax slab).")
            .refine(isRecognisedState, { message: STATE_UNKNOWN_MESSAGE }),
          city: z.string().optional(),
          isMetroCity: z.boolean().optional(),
          // Tax election: locked 12 months. TAX-REGIME-DEFAULT — no longer silently defaulted
          // (the importer already requires it; this closes the weaker form path).
          taxRegime: z.enum(["old", "new"], {
            required_error: "Tax regime (old or new) must be chosen — it is no longer defaulted silently.",
          }),
          // Statutory identity.
          pan: employeePanField,
          uan: z.string().optional(),
          esiIpNumber: z.string().optional(),
          bankAccountNumber: z.string().optional(),
          bankIfsc: z.string().optional(),
          bankName: z.string().optional(),
          bankAccountName: z.string().optional(),
          // Maharashtra PT is gender-split; DOB is the sole source for the over-65 PT exemption.
          gender: z.enum(["male", "female", "other"]).optional(),
          // DOB stays OPTIONAL at create (a payroll-readiness gate, not a creation gate), but when
          // supplied it must not be in the future and must meet the policy minimum age (checkDob).
          dateOfBirth: z.coerce.date().optional().superRefine(checkDob),
          // CA Tier-1 PT exemptions (evidence required at declaration; storage is a later item).
          ptExemptArmedForces: z.boolean().optional(),
          ptExemptDisability: z.boolean().optional(),
          ptExemptDependentDisability: z.boolean().optional(),
          // PT4 — Form 12B prior-employer FY income + TDS (annual ₹). Absent = no 12B on file.
          previousEmployerIncome: z.number().min(0).optional(),
          previousEmployerTds: z.number().min(0).optional(),
          // HRA — declared annual rent for the s.10(13A) exemption (old regime). 0 = none.
          rentPaidAnnual: z.number().min(0).optional(),
          // Voluntary PF: extra EMPLOYEE PF rate above the statutory 12% (percentage, e.g. 8 = +8%).
          // Employee-only; the employer's 12% is unchanged. 0/absent = no VPF.
          voluntaryPfRate: z.number().min(0).max(88).optional(),
          // EPFO Para 26(6): PF on the full basic (above ₹15,000). Uncapped ONLY where an approval
          // reference exists and the effective date is reached. Record request, undertaking, ref, date.
          para266JointRequest: z.boolean().optional(),
          para266EmployerUndertaking: z.boolean().optional(),
          para266ApprovalReference: z.string().optional(),
          para266EffectiveFrom: z.coerce.date().optional(),
          // EPF INTERNATIONAL WORKER (G27). Contributes on FULL wages — the ₹15,000 ceiling does
          // not apply — and coverage is MANDATORY BY STATUS, so unlike Para 26(6) no approval
          // reference is required for it to take effect. Default false = unchanged.
          internationalWorker: z.boolean().optional(),
          // Income-tax residential status; drives TDS treatment for a non-resident.
          residentialStatus: z.enum(["resident", "resident_not_ordinarily_resident", "non_resident"]).optional(),
          // PF membership start — distinct from the employment start date.
          pfJoinDate: z.coerce.date().optional(),
          // UAN KYC with EPFO. An un-KYC'd UAN is a leading cause of ECR upload rejection.
          pfKycStatus: z.enum(["pending", "done", "rejected"]).optional(),
          pfKycDocument: z.string().max(40).optional(),
          pfKycVerifiedAt: z.coerce.date().optional(),
          // Per-identifier verification state — a stored number is not a verified one.
          aadhaarVerification: z.enum(["unverified", "verified", "failed"]).optional(),
          panVerification: z.enum(["unverified", "verified", "failed"]).optional(),
          bankVerification: z.enum(["unverified", "verified", "failed"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        await assertSameOrgIfPresent(db, salaryStructures, input.salaryStructureId, org!.id, "Salary structure");

        let finalUserId = input.userId;

        if (!finalUserId) {
          if (!input.userName || !input.userEmail) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User ID or User Name/Email must be provided." });
          }
          const [newUser] = await db
            .insert(users)
            .values({
              orgId: org!.id,
              name: input.userName,
              email: input.userEmail,
              role: "member",
            })
            .returning();
          finalUserId = newUser!.id;
        } else {
          const [existing] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.userId, finalUserId), eq(employees.orgId, org!.id)))
            .limit(1);
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This user already has an employee record in your organization.",
            });
          }

          const [userInOrg] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, finalUserId), eq(users.orgId, org!.id)))
            .limit(1);
          if (!userInOrg) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User is not in this organization." });
          }
        }

        // Atomic, delete-proof allocation (shared with the bulk importer). The old
        // count(*)+1 collided with a surviving EMP-NNNN after any delete and raced under
        // concurrency; getNextEmployeeNumber seeds once from the max existing number then
        // hands out monotonically increasing ids.
        const employeeId = await getNextEmployeeNumber(db, org!.id);

        // DPDP: the employee PAN (an individual's personal data) is stored ENCRYPTED (KMS
        // envelope) with a peppered match-hash + masked display — never plaintext. A malformed
        // PAN degrades to encrypted-raw rather than aborting the create (shared helper, same as
        // importVendors / update).
        const panCols = await panColumnsTolerant(input.pan);

        // IDENTITY-UNIQUE: reject a duplicate PAN within the org. `panMaskedHash` is a deterministic
        // per-tenant match key derived from the plaintext (lib/pan.ts), so we de-dup on it — the raw
        // `pan` is encrypted non-deterministically and cannot be compared directly.
        if ("panMaskedHash" in panCols && panCols.panMaskedHash) {
          const [dupePan] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.orgId, org!.id), eq(employees.panMaskedHash, panCols.panMaskedHash)))
            .limit(1);
          if (dupePan) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "An employee with this PAN already exists in your organization.",
            });
          }
        }

        const [employee] = await db
          .insert(employees)
          .values({
            orgId: org!.id,
            userId: finalUserId,
            employeeId,
            department: input.department,
            title: input.title,
            managerId: input.managerId,
            jobGrade: input.jobGrade,
            dottedLineManagerId: input.dottedLineManagerId,
            employmentType: input.employmentType,
            location: input.location,
            startDate: input.startDate,
            salaryStructureId: input.salaryStructureId,
            state: input.state,
            city: input.city,
            isMetroCity: input.isMetroCity,
            taxRegime: input.taxRegime,
            ...panCols,
            uan: input.uan,
            esiIpNumber: input.esiIpNumber,
            ...(await bankAccountColumns(input.bankAccountNumber)),
            bankIfsc: input.bankIfsc,
            bankName: input.bankName,
            bankAccountName: input.bankAccountName,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth,
            ptExemptArmedForces: input.ptExemptArmedForces,
            ptExemptDisability: input.ptExemptDisability,
            ptExemptDependentDisability: input.ptExemptDependentDisability,
            previousEmployerIncome:
              input.previousEmployerIncome !== undefined ? String(input.previousEmployerIncome) : undefined,
            previousEmployerTds:
              input.previousEmployerTds !== undefined ? String(input.previousEmployerTds) : undefined,
            rentPaidAnnual:
              input.rentPaidAnnual !== undefined ? String(input.rentPaidAnnual) : undefined,
            voluntaryPfRate:
              input.voluntaryPfRate !== undefined ? String(input.voluntaryPfRate) : undefined,
            para266JointRequest: input.para266JointRequest,
            para266EmployerUndertaking: input.para266EmployerUndertaking,
            para266ApprovalReference: input.para266ApprovalReference,
            internationalWorker: input.internationalWorker,
            residentialStatus: input.residentialStatus,
            pfJoinDate: input.pfJoinDate,
            pfKycStatus: input.pfKycStatus,
            pfKycDocument: input.pfKycDocument,
            pfKycVerifiedAt: input.pfKycVerifiedAt,
            aadhaarVerification: input.aadhaarVerification,
            panVerification: input.panVerification,
            bankVerification: input.bankVerification,
            para266EffectiveFrom: input.para266EffectiveFrom,
            status: "active",
          })
          .returning();

        // Fire-and-forget automation hooks (never roll back the create).
        if (employee) {
          const entity = employee as unknown as Record<string, unknown>;
          void runEntityBusinessRules(db, { orgId: org!.id, entityType: "employee", event: "created", entity, changes: {} });
          void emitDomainEvent(db, { orgId: org!.id, type: "employee_created", payload: { employeeId: employee.id } });
        }

        return employee;
      }),

    update: permissionProcedure("hr", "assign")
      .input(z.object({
        id: z.string().uuid(),
        department: z.string().optional(),
        title: z.string().optional(),
        managerId: z.string().uuid().nullable().optional(),
        jobGrade: z.string().nullable().optional(),
        dottedLineManagerId: z.string().uuid().nullable().optional(),
        location: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]).optional(),
        salaryStructureId: z.string().uuid().nullable().optional(),
        // ── Statutory ingestion (C2-STRUCT / C1 / C3) ──
        // Partial update: state stays optional here, but must be non-empty when supplied
        // (clearing it would re-open the null-state hole the create boundary closes).
        state: z
          .string()
          .trim()
          .min(1, "State cannot be blank (drives professional-tax slab).")
          .refine(isRecognisedState, { message: STATE_UNKNOWN_MESSAGE })
          .optional(),
        city: z.string().optional(),
        isMetroCity: z.boolean().optional(),
        taxRegime: z.enum(["old", "new"]).optional(),
        pan: employeePanField,
        uan: z.string().optional(),
        esiIpNumber: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        bankIfsc: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountName: z.string().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        dateOfBirth: z.coerce.date().optional().superRefine(checkDob),
        ptExemptArmedForces: z.boolean().optional(),
        ptExemptDisability: z.boolean().optional(),
        ptExemptDependentDisability: z.boolean().optional(),
        // PT4 — Form 12B prior-employer FY income + TDS (annual ₹).
        previousEmployerIncome: z.number().min(0).optional(),
        previousEmployerTds: z.number().min(0).optional(),
        // HRA — declared annual rent for the s.10(13A) exemption (old regime). 0 = none.
        rentPaidAnnual: z.number().min(0).optional(),
        // Voluntary PF: extra employee PF rate above 12% (percentage). Employee-only.
        voluntaryPfRate: z.number().min(0).max(88).optional(),
        // EPFO Para 26(6) — recorded, not the employee's to change at will. Uncapped PF only with
        // an approval reference + reached effective date. Clearing an approved election is WARNED.
        para266JointRequest: z.boolean().optional(),
        para266EmployerUndertaking: z.boolean().optional(),
        para266ApprovalReference: z.string().optional(),
        para266EffectiveFrom: z.coerce.date().optional(),
        // G27 + statutory identity — see the create input for the reasoning on each.
        internationalWorker: z.boolean().optional(),
        residentialStatus: z.enum(["resident", "resident_not_ordinarily_resident", "non_resident"]).optional(),
        pfJoinDate: z.coerce.date().optional(),
        pfKycStatus: z.enum(["pending", "done", "rejected"]).optional(),
        pfKycDocument: z.string().max(40).optional(),
        pfKycVerifiedAt: z.coerce.date().optional(),
        aadhaarVerification: z.enum(["unverified", "verified", "failed"]).optional(),
        panVerification: z.enum(["unverified", "verified", "failed"]).optional(),
        bankVerification: z.enum(["unverified", "verified", "failed"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, pan, previousEmployerIncome, previousEmployerTds, rentPaidAnnual, voluntaryPfRate, ...rest } = input;
        // Para 26(6) revocation: irrevocability is EPFO administrative convention, not statute, so
        // we WARN rather than refuse. Detect clearing an approved election — a reference was on
        // record and this update blanks it — by reading the prior value before the write.
        const clearingPara266 =
          "para266ApprovalReference" in input && !input.para266ApprovalReference?.trim();
        let existingHadApproval = false;
        if (clearingPara266) {
          const [prev] = await db
            .select({ ref: employees.para266ApprovalReference })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.orgId, org!.id)));
          existingHadApproval = !!prev?.ref?.trim();
        }
        // DPDP: never write the PAN in plaintext. `panColumnsTolerant` returns the encrypted raw
        // + match-hash + masked display when a PAN is supplied, `{}` when it is omitted (so a
        // partial update leaves the columns untouched), and encrypted-raw for a malformed value.
        const panCols = await panColumnsTolerant(pan);
        // IDENTITY-UNIQUE (update): reject a PAN already held by ANOTHER employee in the org
        // (exclude this employee's own row via `ne`). Matches on the deterministic hash.
        if ("panMaskedHash" in panCols && panCols.panMaskedHash) {
          const [dupePan] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(
              and(
                eq(employees.orgId, org!.id),
                eq(employees.panMaskedHash, panCols.panMaskedHash),
                ne(employees.id, id),
              ),
            )
            .limit(1);
          if (dupePan) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Another employee already has this PAN in your organization.",
            });
          }
        }
        // Decimal columns take string values in Drizzle; convert only when supplied so an
        // omitted field is left untouched (spread would otherwise pass a number).
        const data = {
          ...rest,
          ...panCols,
          // AFTER `...rest`, so the plaintext `bankAccountNumber` that spread in is
          // overwritten by the encrypted blob + mask. An absent value yields `{}`,
          // leaving the stored columns untouched.
          ...(await bankAccountColumns((rest as { bankAccountNumber?: string }).bankAccountNumber)),
          ...(previousEmployerIncome !== undefined
            ? { previousEmployerIncome: String(previousEmployerIncome) }
            : {}),
          ...(previousEmployerTds !== undefined
            ? { previousEmployerTds: String(previousEmployerTds) }
            : {}),
          ...(rentPaidAnnual !== undefined
            ? { rentPaidAnnual: String(rentPaidAnnual) }
            : {}),
          ...(voluntaryPfRate !== undefined
            ? { voluntaryPfRate: String(voluntaryPfRate) }
            : {}),
        };
        const [emp] = await db.update(employees)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(employees.id, id), eq(employees.orgId, org!.id)))
          .returning();
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

        // Fire-and-forget automation hooks. `changes` keys off the supplied
        // update fields (the columns the caller intended to change).
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [k, v] of Object.entries(data)) changes[k] = { from: undefined, to: v };
        const entity = emp as unknown as Record<string, unknown>;
        void runEntityBusinessRules(db, { orgId: org!.id, entityType: "employee", event: "updated", entity, changes });
        void emitDomainEvent(db, { orgId: org!.id, type: "employee_updated", payload: { employeeId: emp.id } });

        const warnings: string[] = [];
        if (clearingPara266 && existingHadApproval) {
          warnings.push(
            "Para 26(6): you are clearing an approved joint-declaration election. This election is " +
              "understood to be irrevocable for the duration of this employment. The change has been " +
              "accepted, but confirm it is intended — PF will revert to the ₹15,000 ceiling.",
          );
        }
        return { ...emp, warnings };
      }),
  }),

  cases: router({
    list: permissionProcedure("hr", "read")
      .input(z.object({ caseType: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // Join through employees to filter by org.
        // `assigneeName` is joined here because the list rendered the raw
        // `assigneeId` UUID under an "Assignee" heading — the same defect the CRM
        // account/contact columns had. An alias on the users table costs one join
        // and turns a UUID into a person.
        // `users` is not otherwise part of this query, so it joins directly on the
        // assignee with no alias needed.
        const rows = await db
          .select({
            hrCase: hrCases,
            employee: employees,
            onboardingDetails: onboardingDetails,
            offboardingDetails: offboardingDetails,
            assigneeName: users.name,
            assigneeEmail: users.email,
          })
          .from(hrCases)
          .innerJoin(employees, eq(hrCases.employeeId, employees.id))
          .leftJoin(onboardingDetails, eq(employees.id, onboardingDetails.employeeId))
          .leftJoin(offboardingDetails, eq(employees.id, offboardingDetails.employeeId))
          .leftJoin(users, eq(hrCases.assigneeId, users.id))
          .where(eq(employees.orgId, org!.id))
          .orderBy(desc(hrCases.createdAt));
        return rows;
      }),

    get: permissionProcedure("hr", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select({ hrCase: hrCases, employee: employees })
          .from(hrCases)
          .innerJoin(employees, eq(hrCases.employeeId, employees.id))
          .where(and(eq(hrCases.id, input.id), eq(employees.orgId, org!.id)));

        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const tasks = await db
          .select()
          .from(hrCaseTasks)
          .where(eq(hrCaseTasks.caseId, input.id))
          .orderBy(hrCaseTasks.sortOrder);

        return { ...row, tasks };
      }),

    completeTask: permissionProcedure("hr", "write")
      .input(z.object({ taskId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // Verify the task belongs to a case in this org
        const [task] = await db
          .select({ t: hrCaseTasks, c: hrCases })
          .from(hrCaseTasks)
          .innerJoin(hrCases, eq(hrCaseTasks.caseId, hrCases.id))
          .where(and(eq(hrCaseTasks.id, input.taskId), eq(hrCases.orgId, org!.id)));

        if (!task) throw new TRPCError({ code: "NOT_FOUND" });

        const [updated] = await db
          .update(hrCaseTasks)
          .set({ status: "done", completedAt: new Date() })
          .where(eq(hrCaseTasks.id, input.taskId))
          .returning();
        return updated;
      }),

    addNote: permissionProcedure("hr", "write")
      .input(z.object({ caseId: z.string().uuid(), note: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [c] = await db
          .select({ id: hrCases.id })
          .from(hrCases)
          .where(and(eq(hrCases.id, input.caseId), eq(hrCases.orgId, org!.id)));
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        const existing = await db.select({ notes: hrCases.notes }).from(hrCases).where(eq(hrCases.id, input.caseId));
        const prev = existing[0]?.notes ?? "";
        const timestamp = new Date().toISOString();
        const appended = prev
          ? `${prev}\n\n[${timestamp}] ${input.note}`
          : `[${timestamp}] ${input.note}`;

        const [updated] = await db
          .update(hrCases)
          .set({ notes: appended, updatedAt: new Date() })
          .where(eq(hrCases.id, input.caseId))
          .returning();
        return updated;
      }),

    // Self-service: raising an HR case is the HR analogue of raising a ticket, and
    // is an explicit user story ("every user is a requester — can submit
    // self-service HR cases", rbac-user-stories.test.ts). It was gated on hr:write,
    // which is the same grant that carries expense approval, holidays and shift
    // schedules — so honouring the story forced the whole over-grant onto every
    // employee. Authentication is the correct gate for raising your own case.
    create: protectedProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          caseType: z.enum(["onboarding", "offboarding", "leave", "policy", "benefits", "workplace", "equipment"]),
          status: z.enum(["open", "in_progress", "closed"]).optional(),
          /** One-line summary. `notes` stays the running commentary. */
          subject: z.string().trim().min(1).max(200).optional(),
          notes: z.string().optional(),
          assigneeId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db } = ctx;

        // Auto-assign if no explicit assignee provided
        let resolvedAssigneeId = input.assigneeId;
        if (!resolvedAssigneeId) {
          const assignment = await resolveAssignment(db, ctx.org!.id, {
            entityType: "hr_case",
            matchValue: input.caseType,
          });
          if (assignment) {
            resolvedAssigneeId = assignment.assigneeId ?? undefined;
            if (assignment.parkedAtCapacity) {
              console.info("[assignment] HR case parked at capacity — team queue:", assignment.teamId);
            }
          }
        }

        // Case number from org_counters — the same atomic allocator tickets,
        // changes, problems and CSM cases use. Never count(*)+1, never random:
        // both shipped once and both produced duplicates (see 0086).
        const number = await getNextNumber(db, ctx.org!.id, "HRC");

        const [hrCase] = await db
          .insert(hrCases)
          .values({ orgId: ctx.org!.id, number, ...input, assigneeId: resolvedAssigneeId })
          .returning();
        return hrCase;
      }),

    archive: permissionProcedure("hr", "write")
      .input(z.object({ id: z.string().uuid(), resolution: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [existing] = await db.select({ notes: hrCases.notes }).from(hrCases)
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const prev = existing.notes ?? "";
        const ts = new Date().toISOString();
        const archiveNote = input.resolution
          ? `${prev ? prev + "\n\n" : ""}[ARCHIVED: ${ts}] ${input.resolution}`
          : `${prev ? prev + "\n\n" : ""}[ARCHIVED: ${ts}]`;
        const [updated] = await db.update(hrCases)
          .set({ notes: archiveNote, status: "closed", updatedAt: new Date() })
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)))
          .returning();
        return updated;
      }),

    update: permissionProcedure("hr", "write")
      .input(z.object({
        id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "closed"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db.update(hrCases)
          .set({ 
            ...(input.status && { status: input.status }), 
            ...(input.notes !== undefined && { notes: input.notes }), 
            updatedAt: new Date() 
          })
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)))
          .returning();
        return updated;
      }),

    delete: permissionProcedure("hr", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        await db.delete(hrCases)
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)));
        return { success: true };
      }),

    triggerOnboarding: permissionProcedure("onboarding", "write")
      .input(z.object({ employeeId: z.string().uuid(), templateId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        await assertSameOrg(db, employees, input.employeeId, org!.id, "Employee");

        const [template] = await db
          .select()
          .from(onboardingTemplates)
          .where(and(eq(onboardingTemplates.id, input.templateId), eq(onboardingTemplates.orgId, org!.id)));

        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

        const [hrCase] = await db
          .insert(hrCases)
          .values({
            orgId: org!.id,
            number: await getNextNumber(db, org!.id, "HRC"),
            caseType: "onboarding",
            employeeId: input.employeeId,
            priority: "high",
          })
          .returning();

        const now = new Date();
        const tasks = (template.tasks ?? []).map((task: { title: string; assigneeRole: string; dueDateOffsetDays: number }, i: number) => ({
          caseId: hrCase!.id,
          title: task.title,
          dueDate: new Date(now.getTime() + task.dueDateOffsetDays * 24 * 60 * 60 * 1000),
          sortOrder: i,
          status: "pending",
        }));

        if (tasks.length > 0) {
          await db.insert(hrCaseTasks).values(tasks);
        }

        return hrCase;
      }),
  }),

  leave: router({
    list: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid().optional(),
          status: z.enum(leaveStatusEnum.enumValues).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(leaveRequests.orgId, org!.id)];
        if (input.employeeId) conditions.push(eq(leaveRequests.employeeId, input.employeeId));
        if (input.status) conditions.push(eq(leaveRequests.status, input.status));

        // Join through employees → users so the list can show the person's name
        // (and EMP code) instead of a raw employeeId UUID. Left joins keep a row
        // even if the employee/user link is somehow missing.
        return db
          .select({
            ...getTableColumns(leaveRequests),
            employeeName: users.name,
            employeeCode: employees.employeeId,
          })
          .from(leaveRequests)
          .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
          .leftJoin(users, eq(employees.userId, users.id))
          .where(and(...conditions))
          .orderBy(desc(leaveRequests.createdAt));
      }),

    // Self-service: resolves the caller's OWN employee record below and never
    // accepts an employeeId, so authentication is the correct gate. It was
    // hr:write, which is why `requester` had to carry hr:write at all.
    create: protectedProcedure
      .input(CreateLeaveRequestSchema)
      .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.userId, ctx.user!.id), eq(employees.orgId, org!.id)));

      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const [request] = await db
        .insert(leaveRequests)
        .values({
          orgId: org!.id,
          employeeId: employee.id,
          type: input.type,
          startDate,
          endDate,
          days: String(days),
          reason: input.reason,
          status: "pending",
        })
        .returning();

      // LEAVE-MODEL / LEAVE-TYPES: a NON-DEBITING type (maternity/paternity/parental et al.) grants
      // leave WITHOUT consuming a balance — otherwise maternity silently eats another balance. An
      // explicit policy row wins; absent one, maternity/paternity/parental default to non-debiting
      // (policyDebits), so putting maternity in the picker never over-draws an unconfigured balance.
      const [reqPolicy] = await db
        .select({ debitsBalance: leavePolicies.debitsBalance })
        .from(leavePolicies)
        .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
        .limit(1);
      if (policyDebits(reqPolicy, input.type)) {
        await db
          .insert(leaveBalances)
          .values({
            employeeId: employee.id,
            type: input.type,
            year: startDate.getFullYear(),
            totalDays: "0",
            usedDays: "0",
            pendingDays: String(days),
          })
          .onConflictDoUpdate({
            target: [leaveBalances.employeeId, leaveBalances.type, leaveBalances.year],
            set: {
              pendingDays: sql`${leaveBalances.pendingDays} + ${String(days)}`,
            },
          });
      }

      return request;
    }),

    approve: permissionProcedure("hr", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;

        // Read-then-write must be exactly-once: the deciding read ("still
        // pending?") and the status flip + balance move + attendance reflex must
        // all be atomic. Without a row lock, two concurrent approves both read
        // "pending" and both apply the balance move (double count). Take the read
        // INSIDE the transaction with FOR UPDATE so the second caller blocks at
        // its read until the first commits, then wakes to see "approved" and
        // refuses. (Also keeps the G8 attendance reflex atomic with the flip.)
        const updated = await db.transaction(async (tx) => {
          const [request] = await tx
            .select()
            .from(leaveRequests)
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)))
            .for("update");

          if (!request) throw new TRPCError({ code: "NOT_FOUND" });
          if (request.status !== "pending") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Leave request is not pending" });
          }

          const [row] = await tx
            .update(leaveRequests)
            .set({ status: "approved", approvedById: user!.id, approvedAt: new Date() })
            .where(eq(leaveRequests.id, input.id))
            .returning();

          // Update balance: move from pending to used — but ONLY for a debiting type
          // (LEAVE-MODEL). A non-debiting type (maternity et al.) never touched pending on
          // request, so it must not move used here either.
          const [apPolicy] = await tx
            .select({ debitsBalance: leavePolicies.debitsBalance })
            .from(leavePolicies)
            .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, request.type)))
            .limit(1);
          if (policyDebits(apPolicy, request.type)) {
            await tx
              .update(leaveBalances)
              .set({
                usedDays: sql`${leaveBalances.usedDays} + ${request.days}`,
                pendingDays: sql`GREATEST(0, ${leaveBalances.pendingDays} - ${request.days})`,
              })
              .where(
                and(
                  eq(leaveBalances.employeeId, request.employeeId),
                  eq(leaveBalances.type, request.type),
                  eq(leaveBalances.year, request.startDate.getFullYear()),
                ),
              );
          }

          // G8: reflect the leave in attendance so payroll LOP picks it up.
          // unpaid → absent (LOP); every other type → on_leave (paid). Upsert so
          // the leave-derived status wins over any prior default `present` row and
          // re-approval stays idempotent.
          const attRows = expandLeaveToAttendance(
            request.employeeId,
            request.type,
            request.startDate,
            request.endDate,
          ).map((r) => ({ ...r, orgId: org!.id }));
          if (attRows.length > 0) {
            await tx
              .insert(attendanceRecords)
              .values(attRows)
              .onConflictDoUpdate({
                target: [
                  attendanceRecords.orgId,
                  attendanceRecords.employeeId,
                  attendanceRecords.date,
                ],
                set: { status: sql`excluded.status`, updatedAt: new Date() },
              });
          }

          return row;
        });

        return updated;
      }),

    reject: permissionProcedure("hr", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // Both writes (status flip + pending-balance release) must be atomic. The
        // request is also locked FOR UPDATE and re-checked inside the tx: reject
        // applies ONLY to a pending request. Rejecting an already-approved leave
        // would flip status without reversing the usedDays and attendance the
        // approval wrote — leaving the balance inflated and the employee still
        // marked on-leave — and two concurrent rejects would each release the
        // pending days twice.
        const updated = await db.transaction(async (tx) => {
          const [request] = await tx
            .select()
            .from(leaveRequests)
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)))
            .for("update");
          if (!request) throw new TRPCError({ code: "NOT_FOUND" });
          if (request.status !== "pending") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Only a pending leave request can be rejected" });
          }

          const [row] = await tx
            .update(leaveRequests)
            .set({ status: "rejected", updatedAt: new Date() })
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)))
            .returning();

          // Clear pending balance
          await tx
            .update(leaveBalances)
            .set({
              pendingDays: sql`GREATEST(0, ${leaveBalances.pendingDays} - ${request.days})`,
            })
            .where(
              and(
                eq(leaveBalances.employeeId, request.employeeId),
                eq(leaveBalances.type, request.type),
                eq(leaveBalances.year, request.startDate.getFullYear()),
              ),
            );

          return row;
        });

        return updated;
      }),

      update: permissionProcedure("hr", "write")
        // NOTE: `update` deliberately CANNOT approve. Approval is the only
        // transition that must also move the leave balance (pending → used) and
        // write the G8 attendance reflex (unpaid → `absent` so payroll LOP sees
        // it). That whole read-lock-flip-reflect sequence lives in `approve`.
        // If `update` were allowed to set status="approved" it would flip the
        // flag WITHOUT the balance move or attendance rows — an approved unpaid
        // leave would then never become Loss-of-Pay and the employee would be
        // over-paid a full month (the first-real-payroll-run EMP-0002 finding).
        // So the input only permits `pending`/`rejected`; approval goes through
        // `hr.leave.approve` or nowhere.
        .input(z.object({
          id: z.string().uuid(),
          status: z.enum(["pending", "rejected"]).optional(),
          type: LeaveTypeEnum.optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          reason: z.string().optional(),
        })
        // Same date-order guard the create path carries (CreateLeaveRequestSchema in @coheronconnect/
        // types): without it, an edit could reverse a valid range (end before start) — the exact
        // corruption A1 closed on create, reproduced on the update path. Only fires when BOTH dates are
        // supplied (either may be edited alone). NOTE: `days` is NOT recomputed here and the balance is
        // not moved — reported as an open question; this guard only blocks the reversed-range write.
        .refine(
          (d) => !(d.startDate && d.endDate) || new Date(d.endDate).getTime() >= new Date(d.startDate).getTime(),
          { message: "End date must be on or after the start date", path: ["endDate"] },
        ))
        .mutation(async ({ ctx, input }) => {
          const { db, org } = ctx;
          const [request] = await db
            .select()
            .from(leaveRequests)
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)));
          if (!request) throw new TRPCError({ code: "NOT_FOUND" });

          const [updated] = await db.update(leaveRequests)
            .set({
              ...(input.status && { status: input.status }),
              ...(input.type && { type: input.type }),
              ...(input.startDate && { startDate: new Date(input.startDate) }),
              ...(input.endDate && { endDate: new Date(input.endDate) }),
              ...(input.reason && { reason: input.reason }),
              updatedAt: new Date(),
            })
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)))
            .returning();
          return updated;
        }),

      delete: permissionProcedure("hr", "write")
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
          const { db, org } = ctx;
          await db.delete(leaveRequests)
            .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)));
          return { success: true };
        }),

    balance: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid().optional(), year: z.coerce.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const year = input.year ?? new Date().getFullYear();
        let employeeId = input.employeeId;
        if (!employeeId) {
          const [emp] = await db.select().from(employees)
            .where(and(eq(employees.userId, ctx.user!.id), eq(employees.orgId, org!.id)));
          employeeId = emp?.id;
        }
        if (!employeeId) return [];
        return db.select().from(leaveBalances)
          .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));
      }),
  }),

  onboardingTemplates: router({
    list: permissionProcedure("onboarding", "read").query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(onboardingTemplates)
        .where(eq(onboardingTemplates.orgId, ctx.org!.id));
    }),

    create: permissionProcedure("onboarding", "write")
      .input(
        z.object({
          name: z.string().min(1),
          department: z.string().optional(),
          tasks: z.array(
            z.object({
              title: z.string(),
              assigneeRole: z.string(),
              dueDateOffsetDays: z.coerce.number().int().nonnegative(),
              description: z.string().optional(),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [template] = await ctx.db
          .insert(onboardingTemplates)
          .values({ orgId: ctx.org!.id, ...input })
          .returning();
        return template;
      }),
  }),

  onboarding: router({
    getDetails: permissionProcedure("onboarding", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [details] = await db
          .select()
          .from(onboardingDetails)
          .where(
            and(
              eq(onboardingDetails.employeeId, input.employeeId),
              eq(onboardingDetails.orgId, org!.id)
            )
          );
        return details ?? null;
      }),

    saveDetails: permissionProcedure("onboarding", "write")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          name: z.string().optional(),
          primaryEmail: z.string().optional(),
          secondaryEmail: z.string().optional(),
          phone: z.string().optional(),
          secondaryPhone: z.string().optional(),
          educationDocs: z.string().optional(),
          employeeDocs: z.string().optional(),
          signedOfferLetter: z.string().optional(),
          photo: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { employeeId, ...details } = input;

        const [existing] = await db
          .select()
          .from(onboardingDetails)
          .where(
            and(
              eq(onboardingDetails.employeeId, employeeId),
              eq(onboardingDetails.orgId, org!.id)
            )
          );

        if (existing) {
          const [updated] = await db
            .update(onboardingDetails)
            .set({ ...details, updatedAt: new Date() })
            .where(
              and(
                eq(onboardingDetails.employeeId, employeeId),
                eq(onboardingDetails.orgId, org!.id)
              )
            )
            .returning();
          return updated;
        } else {
          const [inserted] = await db
            .insert(onboardingDetails)
            .values({
              orgId: org!.id,
              employeeId,
              ...details,
            })
            .returning();
          return inserted;
        }
      }),

    createOnboarding: permissionProcedure("onboarding", "write")
      .input(
        z.object({
          name: z.string(),
          primaryEmail: z.string().email(),
          secondaryEmail: z.string().email().optional(),
          phone: z.string(),
          secondaryPhone: z.string().optional(),
          educationDocs: z.string().optional(),
          employeeDocs: z.string().optional(),
          signedOfferLetter: z.string().optional(),
          photo: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // 1. Check if user already exists
        let [existingUser] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, input.primaryEmail), eq(users.orgId, org!.id)))
          .limit(1);

        let userId = existingUser?.id;
        if (!userId) {
          const [newUser] = await db
            .insert(users)
            .values({
              orgId: org!.id,
              name: input.name,
              email: input.primaryEmail,
              role: "member",
            })
            .returning();
          userId = newUser!.id;
        }

        // 2. Generate employee number (atomic, delete-proof — shared allocator) and create
        //    the employee record.
        const employeeId = await getNextEmployeeNumber(db, org!.id);

        const [employee] = await db
          .insert(employees)
          .values({
            orgId: org!.id,
            userId,
            employeeId,
            status: "active",
            startDate: new Date(),
          })
          .returning();

        if (!employee) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create employee record.",
          });
        }

        // 3. Create HR case of type "onboarding"
        const [hrCase] = await db
          .insert(hrCases)
          .values({
            orgId: org!.id,
            number: await getNextNumber(db, org!.id, "HRC"),
            employeeId: employee.id,
            caseType: "onboarding",
            status: "open",
            notes: `Onboarding case for ${input.name}`,
          })
          .returning();

        // 4. Create onboarding details record
        const [details] = await db
          .insert(onboardingDetails)
          .values({
            orgId: org!.id,
            employeeId: employee.id,
            name: input.name,
            primaryEmail: input.primaryEmail,
            secondaryEmail: input.secondaryEmail,
            phone: input.phone,
            secondaryPhone: input.secondaryPhone,
            educationDocs: input.educationDocs,
            employeeDocs: input.employeeDocs,
            signedOfferLetter: input.signedOfferLetter,
            photo: input.photo,
          })
          .returning();

        return { employee, hrCase, details };
      }),
  }),

  offboarding: router({
    getDetails: permissionProcedure("offboarding", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [details] = await db
          .select()
          .from(offboardingDetails)
          .where(
            and(
              eq(offboardingDetails.employeeId, input.employeeId),
              eq(offboardingDetails.orgId, org!.id)
            )
          );
        return details ?? null;
      }),

    saveDetails: permissionProcedure("offboarding", "write")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          name: z.string().optional(),
          separationDocs: z.string().optional(),
          clearanceDocs: z.string().optional(),
          securityClearance: z.string().optional(),
          status: z.string().optional(),
          ffStatus: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { employeeId, ...details } = input;

        const [existing] = await db
          .select()
          .from(offboardingDetails)
          .where(
            and(
              eq(offboardingDetails.employeeId, employeeId),
              eq(offboardingDetails.orgId, org!.id)
            )
          );

        if (existing) {
          const [updated] = await db
            .update(offboardingDetails)
            .set({
              ...details,
              updatedAt: new Date(),
            })
            .where(and(eq(offboardingDetails.id, existing.id), eq(offboardingDetails.orgId, org!.id)))
            .returning();
          return updated;
        } else {
          const [inserted] = await db
            .insert(offboardingDetails)
            .values({
              orgId: org!.id,
              employeeId,
              status: "pending",
              ffStatus: "pending",
              ...details,
            })
            .returning();
          return inserted;
        }
      }),

    createOffboarding: permissionProcedure("offboarding", "write")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          name: z.string(),
          // EXIT-DATE: the last working day is REQUIRED — an offboarding without a date is the
          // defect this closes. Validated server-side (below), not only in the form, because the
          // form rule is bypassable by any tRPC caller.
          endDate: z.string().min(1, "Last working day is required"),
          separationDocs: z.string().optional(),
          clearanceDocs: z.string().optional(),
          securityClearance: z.string().optional(),
          status: z.string().optional(),
          ffStatus: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // EXIT-DATE: validate the last working day server-side before writing anything. It must
        // parse, and must be on/after the join date. A FUTURE date is permitted (notice periods
        // legitimately fix an exit in advance) — the employee stays in an employed status until
        // the day passes; pro-ration and run-selection read employees.endDate, not the status.
        const lastWorkingDay = new Date(input.endDate);
        if (Number.isNaN(lastWorkingDay.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Last working day is not a valid date." });
        }
        const [emp] = await db
          .select({ startDate: employees.startDate })
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
        if (emp.startDate && lastWorkingDay < new Date(emp.startDate)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Last working day cannot be before the join date." });
        }

        // The three writes (HR case, offboarding details, employee exit date)
        // must land together — a mid-way failure otherwise orphans an HR case
        // and leaves the employee with no recorded exit date. One transaction.
        return await db.transaction(async (tx) => {
          // 1. Create HR case of type "offboarding"
          const [hrCase] = await tx
            .insert(hrCases)
            .values({
              orgId: org!.id,
              number: await getNextNumber(tx, org!.id, "HRC"),
              employeeId: input.employeeId,
              caseType: "offboarding",
              status: "open",
              notes: `Offboarding case for ${input.name}`,
            })
            .returning();

          // 2. Create offboarding details record
          const [details] = await tx
            .insert(offboardingDetails)
            .values({
              orgId: org!.id,
              employeeId: input.employeeId,
              name: input.name,
              separationDocs: input.separationDocs,
              clearanceDocs: input.clearanceDocs,
              securityClearance: input.securityClearance,
              status: input.status ?? "pending",
              ffStatus: input.ffStatus ?? "pending",
            })
            .returning();

          // 3. EXIT-DATE: record the last working day on the employee — this is the field the
          // payroll engine reads to pro-rate the final month and select the leaver into the run.
          // Flip status to "offboarded" ONLY once the last working day has passed; a future-dated
          // exit stays in its current status (working out notice) while endDate does the work.
          const hasLeft = lastWorkingDay.getTime() <= Date.now();
          await tx
            .update(employees)
            .set({
              endDate: lastWorkingDay,
              ...(input.status === "completed" && hasLeft ? { status: "offboarded" as const } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));

          return { hrCase, details };
        });
      }),
  }),

  lifecycle: router({
    list: permissionProcedure("hr", "read")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        return db
          .select({ lifecycleEvent: lifecycleEvents, employee: employees })
          .from(lifecycleEvents)
          .innerJoin(employees, eq(lifecycleEvents.employeeId, employees.id))
          .where(eq(employees.orgId, org!.id))
          .orderBy(desc(lifecycleEvents.createdAt));
      }),

    create: permissionProcedure("hr", "assign")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          name: z.string(),
          eventType: z.string().default("employee_transition"),
          hrTaskStatus: z.string().default("pending"),
          itTaskStatus: z.string().default("pending"),
          payrollCompliance: z.string().default("no"),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        await assertSameOrg(db, employees, input.employeeId, org!.id, "Employee");
        const [event] = await db
          .insert(lifecycleEvents)
          .values({
            orgId: org!.id,
            employeeId: input.employeeId,
            name: input.name,
            eventType: input.eventType,
            hrTaskStatus: input.hrTaskStatus,
            itTaskStatus: input.itTaskStatus,
            payrollCompliance: input.payrollCompliance,
            notes: input.notes,
          })
          .returning();
        return event;
      }),

    update: permissionProcedure("hr", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().optional(),
          eventType: z.string().optional(),
          hrTaskStatus: z.string().optional(),
          itTaskStatus: z.string().optional(),
          payrollCompliance: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [updated] = await db
          .update(lifecycleEvents)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(and(eq(lifecycleEvents.id, id), eq(lifecycleEvents.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  getEmployeeDocuments: permissionProcedure("hr", "read")
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [onb] = await db
        .select()
        .from(onboardingDetails)
        .where(and(eq(onboardingDetails.employeeId, input.employeeId), eq(onboardingDetails.orgId, org!.id)));
      const [offb] = await db
        .select()
        .from(offboardingDetails)
        .where(and(eq(offboardingDetails.employeeId, input.employeeId), eq(offboardingDetails.orgId, org!.id)));

      const docs: Array<{ type: string; category: "onboarding" | "offboarding"; filename: string }> = [];
      if (onb) {
        if (onb.educationDocs) docs.push({ type: "Education Documents", category: "onboarding", filename: onb.educationDocs });
        if (onb.employeeDocs) docs.push({ type: "Employee Documents", category: "onboarding", filename: onb.employeeDocs });
        if (onb.signedOfferLetter) docs.push({ type: "Signed Offer Letter", category: "onboarding", filename: onb.signedOfferLetter });
        if (onb.photo) docs.push({ type: "Photo", category: "onboarding", filename: onb.photo });
      }
      if (offb) {
        if (offb.separationDocs) docs.push({ type: "Separation Forms", category: "offboarding", filename: offb.separationDocs });
        if (offb.clearanceDocs) docs.push({ type: "Clearance Forms", category: "offboarding", filename: offb.clearanceDocs });
        if (offb.securityClearance) docs.push({ type: "Security Clearance", category: "offboarding", filename: offb.securityClearance });
      }
      return docs;
    }),

  payroll: router({
    listPayslips: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid().optional(),
          year: z.number().int().optional(),
          limit: z.number().int().min(1).max(60).default(12),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const { payslips: payslipsTable, desc: descOp } = await import("@coheronconnect/db");
        const conditions = [eq(payslipsTable.orgId, org!.id)];
        if (input.employeeId) {
          // Own record, or hr:write for anyone. Closes the hr:read leak where any
          // employee could read a colleague's payslip financials by id.
          await assertSelfOrHrWriter(ctx, input.employeeId);
          conditions.push(eq(payslipsTable.employeeId, input.employeeId));
        } else {
          // No target id: hr:write may list across the org; a self-service caller
          // is scoped to their own employee record (never the whole org).
          const hasHrWrite = checkDbUserPermission(
            String(user!.role ?? ""),
            "hr",
            "write",
            (user!.matrixRole as string | null | undefined) ?? null,
            user!.customPermissions,
          );
          if (!hasHrWrite) {
            const [own] = await db
              .select({ id: employees.id })
              .from(employees)
              .where(and(eq(employees.userId, user!.id), eq(employees.orgId, org!.id)))
              .limit(1);
            if (!own) {
              throw new TRPCError({ code: "FORBIDDEN", message: "No employee record for this user." });
            }
            conditions.push(eq(payslipsTable.employeeId, own.id));
          }
        }
        if (input.year) conditions.push(eq(payslipsTable.year, input.year));
        return db
          .select()
          .from(payslipsTable)
          .where(and(...conditions))
          .orderBy(descOp(payslipsTable.year), descOp(payslipsTable.month))
          .limit(input.limit);
      }),

    computeCurrentSlip: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        // Self-service by design: your OWN slip, or hr:write for anyone. Without
        // this, hr:read (which every employee holds) let any coworker read this
        // employee's decrypted PAN, UAN and full salary.
        await assertSelfOrHrWriter(ctx, input.employeeId);
        const { db, org } = ctx;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const fyMonth = month >= 4 ? month - 3 : month + 9;

        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });
        if (!emp.salaryStructureId) return null;

        // M-05: resolve the structure version in force for the current pay period
        // (salaryStructureId is a familyId), not by bare id.
        const structure = await resolveSalaryStructureForPeriod(
          db,
          org!.id,
          emp.salaryStructureId,
          new Date(year, month - 1, 1),
        );
        if (!structure) return null;

        // Rerouted onto the live engine (`computeEmployeePayslip` from payroll-math,
        // via the same `buildEmployeePayrollInput` bridge `payroll.runs.computePayslips`
        // uses). The retired second engine produced stale figures; this preview now
        // matches what a real run writes. `slip` is remapped to the previous response
        // shape so the endpoint contract is unchanged.
        const { computeEmployeePayslip } = await import("../lib/payroll-cycle.js");
        const { buildEmployeePayrollInput, buildYtdContext } = await import("../services/payroll-run-aggregates.js");
        const { resolveStatutoryCeilings } = await import("../lib/india/statutory-ceilings.js");
        const ceilings = await resolveStatutoryCeilings(db, org!.id, new Date(year, month - 1, 1));
        // PR5: this preview must show the same running YTD as the stored payslip.
        const ytd = (await buildYtdContext(db, org!.id, [{ emp }], month, year)).get(emp.id);
        const empInput = buildEmployeePayrollInput(emp, structure, month, year, undefined, undefined, undefined, ytd);
        const ps = computeEmployeePayslip(empInput, fyMonth, ceilings);
        const tc = ps.taxComputation;

        const slip = {
          basic: ps.basicEarned,
          hra: ps.hraEarned,
          specialAllowance: ps.specialAllowance,
          lta: ps.lta,
          medicalAllowance: 0,
          conveyanceAllowance: 0,
          bonus: ps.bonus,
          grossEarnings: ps.grossEarnings,
          pfEmployee: ps.employeePF,
          pfEmployer: ps.employerPF,
          professionalTax: ps.professionalTax,
          lwf: ps.lwf,
          tds: ps.tds,
          totalDeductions: ps.totalDeductions,
          netPay: ps.netPay,
        };

        return {
          month, year,
          slip,
          taxSummary: {
            regime: emp.taxRegime ?? "new",
            projectedAnnualGross: tc.grossSalary,
            taxableIncome: tc.taxableIncome,
            totalTaxLiability: tc.totalTaxLiability,
            rebate87A: tc.rebate87A,
            surcharge: tc.surcharge,
            cess: tc.cess,
            effectiveRate: tc.grossSalary > 0 ? tc.totalTaxLiability / tc.grossSalary : 0,
            monthlyTds: ps.tds,
          },
          employeeInfo: {
            // Decrypt the stored (envelope) PAN; legacy plaintext rows pass through unchanged.
            pan: await decryptPan(emp.pan),
            uan: emp.uan,
            taxRegime: emp.taxRegime,
            state: emp.state,
          },
          ctcAnnual: Number(structure.ctcAnnual),
        };
      }),

    computeTax: permissionProcedure("hr", "read")
      .input(
        z.object({
          grossAnnualIncome: z.number().positive(),
          regime: z.enum(["old", "new"]),
          deductions: z
            .object({
              section80C: z.number().min(0).max(150000).default(0),
              section80D: z.number().min(0).max(50000).default(0),
              section24b: z.number().min(0).max(200000).default(0),
              section80CCD1B: z.number().min(0).max(50000).default(0),
              hraExemption: z.number().min(0).default(0),
              ltaExemption: z.number().min(0).default(0),
            })
            .optional(),
          npsEmployer: z.number().min(0).default(0),
        }),
      )
      .query(async ({ input }) => {
        // Rerouted onto the canonical engine (`@coheronconnect/payroll-math`) — the
        // same one `payroll.runs.computePayslips` uses — so this preview reflects the
        // current-FY slabs, capped new-regime surcharge, and s.87A marginal relief.
        // The retired second engine carried the stale FY2024-25 versions of all three.
        const { computeTax } = await import("@coheronconnect/payroll-math");
        const d = input.deductions ?? {
          section80C: 0, section80D: 0, section24b: 0, section80CCD1B: 0,
          hraExemption: 0, ltaExemption: 0,
        };
        // Full-year, single-employer profile: `computeTax` derives gross from
        // `annualCTC` when `joiningMonth === 1`, so the component fields stay 0 and
        // only the declared reliefs feed the deduction stack. New-regime NPS employer
        // (80CCD(2)) maps to `otherExemptions` (a pre-computed exempt amount).
        return computeTax({
          regime: input.regime === "old" ? "OLD" : "NEW",
          annualCTC: input.grossAnnualIncome,
          basicMonthly: 0,
          hraMonthly: 0,
          specialAllowance: 0,
          lta: 0,
          section80C: d.section80C,
          section80D: d.section80D,
          section80CCD1B: d.section80CCD1B,
          section80TTA: 0,
          section24b: d.section24b,
          hraExemption: d.hraExemption,
          otherExemptions: input.regime === "new" ? input.npsEmployer : d.ltaExemption,
          employeePFMonthly: 0,
          employerPFMonthly: 0,
          professionalTax: 0,
          joiningMonth: 1,
          monthsInFY: 12,
          previousEmployerIncome: 0,
          previousEmployerTDS: 0,
        });
      }),

    computeMonthlySlip: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          month: z.number().int().min(1).max(12),
          year: z.number().int().min(2020),
        }),
      )
      .query(async ({ ctx, input }) => {
        // Self-service by design: your OWN slip, or hr:write for anyone.
        await assertSelfOrHrWriter(ctx, input.employeeId);
        const { db, org } = ctx;
        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        if (!emp.salaryStructureId) throw new TRPCError({ code: "BAD_REQUEST", message: "No salary structure assigned" });

        // M-05: resolve the version in force for the requested month/year (familyId),
        // not by bare id — a past-month slip uses the structure that applied then.
        const structure = await resolveSalaryStructureForPeriod(
          db,
          org!.id,
          emp.salaryStructureId,
          new Date(input.year, input.month - 1, 1),
        );
        if (!structure) throw new TRPCError({ code: "NOT_FOUND", message: "Salary structure not found" });

        // Determine FY month (April = 1, March = 12)
        const fyMonth = input.month >= 4 ? input.month - 3 : input.month + 9;

        // Rerouted onto the live engine (same bridge as `computeCurrentSlip` and
        // `payroll.runs.computePayslips`). Remapped to the previous `SalarySlipOutput`
        // shape so the endpoint contract is unchanged.
        const { computeEmployeePayslip } = await import("../lib/payroll-cycle.js");
        const { buildEmployeePayrollInput, buildYtdContext } = await import("../services/payroll-run-aggregates.js");
        const { resolveStatutoryCeilings } = await import("../lib/india/statutory-ceilings.js");
        const ceilings = await resolveStatutoryCeilings(db, org!.id, new Date(input.year, input.month - 1, 1));
        // PR5: this preview must show the same running YTD as the stored payslip.
        const ytd = (await buildYtdContext(db, org!.id, [{ emp }], input.month, input.year)).get(emp.id);
        const empInput = buildEmployeePayrollInput(emp, structure, input.month, input.year, undefined, undefined, undefined, ytd);
        const ps = computeEmployeePayslip(empInput, fyMonth, ceilings);

        return {
          basic: ps.basicEarned,
          hra: ps.hraEarned,
          specialAllowance: ps.specialAllowance,
          lta: ps.lta,
          medicalAllowance: 0,
          conveyanceAllowance: 0,
          bonus: ps.bonus,
          grossEarnings: ps.grossEarnings,
          pfEmployee: ps.employeePF,
          pfEmployer: ps.employerPF,
          professionalTax: ps.professionalTax,
          lwf: ps.lwf,
          tds: ps.tds,
          totalDeductions: ps.totalDeductions,
          netPay: ps.netPay,
        };
      }),

    // `runMonthlyPayroll` (retired 2026-08-05): this endpoint ran a second, stale
    // India payroll engine (`india/payroll-engine.ts`) to insert payslips + run
    // totals — a duplicate money-writing path with pre-fix slabs/surcharge/rebate,
    // no ESI, no LOP, no effective-dated ceilings, and YTD hardcoded to 0. No UI
    // control invoked it (the app runs payroll through the `payroll.runs` pipeline
    // → `computePayslips`, the live engine). Removed so there is exactly one path
    // that writes payslips. Callers must use `payroll.runs` (createRun → advance
    // steps → computePayslips).

    // Org-wide statutory export (every member's name, UAN and PF wages). Not
    // self-service and not a read any employee should reach — require hr:write.
    generateECR: permissionProcedure("hr", "write")
      .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { payrollRuns, payslips: payslipsTable } = await import("@coheronconnect/db");
        const { formatECRFile, buildEcrLine, ecrPreflight } = await import("../lib/india/ecr-format.js");

        const [run] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, input.month),
              eq(payrollRuns.year, input.year),
            ),
          );
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });

        const slips = await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.payrollRunId, run.id));

        // Collected for the pre-flight below, so the identity rows are read once, not twice.
        const ecrEmployees: Array<typeof employees.$inferSelect> = [];
        const ecrLines = await Promise.all(
          slips.map(async (slip) => {
            const [emp] = await db
              .select()
              .from(employees)
              .where(eq(employees.id, slip.employeeId));
            if (emp) ecrEmployees.push(emp);
            // ONE ECR line builder, shared with `india-compliance.filing.submit`.
            //
            // This path used to build its lines inline from the RAW BASIC:
            //   pfWages = min(Number(slip.basic), 15000)   → epfWages/epsWages/edliWages
            // while the contribution beside it (`slip.pfEmployee`) had been computed on the
            // RESOLVED wage base (the Labour-Codes 50% clamp). Those are different numbers, so
            // the file reported a wage the contribution did not correspond to — e.g. basic
            // ₹8,000 with ₹12,000 of exclusions resolves a ₹10,000 base and ₹1,200 of EPF, and
            // the line claimed ₹8,000 against ₹1,200, i.e. 15%. Reallocating pay between basic
            // and allowances moved the reported WAGE while the contribution stayed put, so the
            // two could disagree by any amount. EPFO's revamped ECR validates exactly this and
            // rejects the upload.
            //
            // `buildEcrLine` reads the PERSISTED `pfWageBase` (and the persisted employer
            // EPS/EPF split, which this path also used to recompute from the wrong wage), so
            // the reported wage is by construction the one the run computed on.
            return buildEcrLine(slip, {
              uan: emp?.uan ?? "UNKNOWN",
              memberName: emp?.employeeId ?? "EMPLOYEE",
            });
          }),
        );

        // ECR PRE-FLIGHT. This is a PREVIEW, so it lists blockers rather than refusing — an
        // operator needs to see every problem at once to go and fix them, not hit them one at a
        // time. The portal SUBMIT path refuses on the same list (india-compliance.filing.submit).
        const blockers = ecrPreflight(
          ecrEmployees.map((e) => ({
            id: e.id,
            employeeId: e.employeeId,
            uan: e.uan,
            pfKycStatus: e.pfKycStatus,
          })),
        );

        const orgEpfoId = `EPFO_${org!.id.slice(0, 8).toUpperCase()}`;
        return {
          ecrContent: formatECRFile(orgEpfoId, input.month, input.year, ecrLines),
          totalLines: ecrLines.length,
          totalEmployeeContribution: slips.reduce((s, sl) => s + Number(sl.pfEmployee), 0),
          totalEmployerContribution: slips.reduce((s, sl) => s + Number(sl.pfEmployer), 0),
          /** Named employees this file would be rejected for. Empty = clean to upload. */
          blockers,
        };
      }),
  }),


  // ── Public Holiday Calendar ─────────────────────────────────────────────
  holidays: router({
    list: permissionProcedure("hr", "read").input(z.object({ year: z.number().int().optional() })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays, gte, lte, and: dbAnd, eq: dbEq, asc: dbAsc } = await import("@coheronconnect/db");
      const year = input.year ?? new Date().getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59);
      return db.select().from(publicHolidays)
        .where(dbAnd(dbEq(publicHolidays.orgId, org!.id), gte(publicHolidays.date, start), lte(publicHolidays.date, end)))
        .orderBy(dbAsc(publicHolidays.date));
    }),

    create: permissionProcedure("hr", "write").input(z.object({
      name: z.string().min(1),
      date: z.coerce.date(),
      type: z.enum(["national", "restricted", "state", "company"]).default("national"),
      stateCode: z.string().length(2).nullable().optional(),
      year: z.number().int(),
      isOptional: z.boolean().default(false),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays } = await import("@coheronconnect/db");
      const [h] = await db.insert(publicHolidays).values({ ...input, orgId: org!.id }).returning();
      return h!;
    }),

    delete: permissionProcedure("hr", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      await db.delete(publicHolidays).where(dbAnd(dbEq(publicHolidays.id, input.id), dbEq(publicHolidays.orgId, org!.id)));
      return { success: true };
    }),

    seedIndiaHolidays: permissionProcedure("hr", "write").input(z.object({ year: z.number().int() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays } = await import("@coheronconnect/db");
      const year = input.year;
      const national = [
        { name: "New Year Day", date: new Date(year, 0, 1) },
        { name: "Republic Day", date: new Date(year, 0, 26) },
        { name: "Holi", date: new Date(year, 2, 14) },
        { name: "Ambedkar Jayanti", date: new Date(year, 3, 14) },
        { name: "Good Friday", date: new Date(year, 3, 18) },
        { name: "Labour Day", date: new Date(year, 4, 1) },
        { name: "Independence Day", date: new Date(year, 7, 15) },
        { name: "Gandhi Jayanti", date: new Date(year, 9, 2) },
        { name: "Diwali", date: new Date(year, 9, 20) },
        { name: "Christmas Day", date: new Date(year, 11, 25) },
        { name: "Eid ul-Fitr", date: new Date(year, 3, 10) },
        { name: "Eid ul-Adha", date: new Date(year, 5, 17) },
      ];
      const rows = national.map(h => ({ ...h, orgId: org!.id, type: "national" as const, year, isOptional: false }));
      await db.insert(publicHolidays).values(rows).onConflictDoNothing();
      return { seeded: rows.length };
    }),
  }),

  // ── Attendance ──────────────────────────────────────────────────────────
  attendance: router({
    list: permissionProcedure("hr", "read").input(z.object({
      employeeId: z.string().uuid().optional(),
      month: z.number().int().min(1).max(12).optional(),
      year: z.number().int().optional(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords, employees: emps, gte, lte, and: dbAnd, eq: dbEq, desc: dbDesc } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(attendanceRecords.orgId, org!.id)];
      if (input.employeeId) conds.push(dbEq(attendanceRecords.employeeId, input.employeeId));
      if (input.month && input.year) {
        const start = new Date(input.year, input.month - 1, 1);
        const end   = new Date(input.year, input.month, 0, 23, 59, 59);
        conds.push(gte(attendanceRecords.date, start), lte(attendanceRecords.date, end));
      }
      return db.select({ record: attendanceRecords, employee: emps })
        .from(attendanceRecords).leftJoin(emps, dbEq(attendanceRecords.employeeId, emps.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(attendanceRecords.date));
    }),

    clockIn: protectedProcedure.input(z.object({
      employeeId: z.string().uuid(),
      date: z.coerce.date().optional(),
      shiftType: z.enum(["morning", "afternoon", "night", "flexible", "remote"]).default("flexible"),
    })).mutation(async ({ ctx, input }) => {
      // Clock yourself in; only an hr:write holder may clock somebody else.
      await assertSelfOrHrWriter(ctx, input.employeeId);
      const { org, db } = ctx;
      const { attendanceRecords, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const date = input.date ?? new Date();
      const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const [rec] = await db.insert(attendanceRecords).values({ orgId: org!.id, employeeId: input.employeeId, date: dateStart, status: "present", shiftType: input.shiftType, checkIn: new Date() }).returning();
      return rec!;
    }),

    clockOut: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const [rec] = await db.select().from(attendanceRecords).where(dbAnd(dbEq(attendanceRecords.id, input.id), dbEq(attendanceRecords.orgId, org!.id))).limit(1);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      // Clock yourself out; only an hr:write holder may clock somebody else out.
      await assertSelfOrHrWriter(ctx, rec.employeeId);
      const checkOut = new Date();
      const hoursWorked = rec.checkIn ? ((checkOut.getTime() - new Date(rec.checkIn).getTime()) / 3600000).toFixed(2) : "0";
      const [updated] = await db.update(attendanceRecords).set({ checkOut, hoursWorked, updatedAt: new Date() }).where(dbEq(attendanceRecords.id, input.id)).returning();
      return updated!;
    }),

    /**
     * Employee self-service sign-in (G8). First-party HRMS capture: the
     * authenticated employee punches their OWN attendance — no `hr.write`,
     * no passing someone else's id. Resolves the employee from `ctx.user`
     * (`employees.userId`) and upserts today's row.
     *
     * One row per (org, employee, day). Idempotent: signing in again the same
     * day is a no-op that keeps the EARLIEST `checkIn` (first-in) — the upsert
     * only writes `check_in` when the existing value is null, so a double-punch
     * never resets the clock or wipes a later `check_out`.
     */
    signIn: protectedProcedure
      .input(z.object({
        shiftType: z.enum(["morning", "afternoon", "night", "flexible", "remote"]).default("flexible"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { org, db, user } = ctx;
        const emp = await resolveSelfEmployeeWithShift(db, user!.id, org!.id);
        if (!emp) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No employee record linked to this user account. Ask HR to provision your profile.",
          });
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // Derive late-ness at sign-in against the effective shift (open shift:
        // no check-out yet, so only present/late + lateMinutes are meaningful).
        const punch = derivePunch(now, null, emp.shift);
        const [rec] = await db
          .insert(attendanceRecords)
          .values({
            orgId: org!.id,
            employeeId: emp.id,
            date: today,
            status: punch.status,
            shiftType: input.shiftType,
            checkIn: now,
            lateMinutes: punch.lateMinutes,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.orgId, attendanceRecords.employeeId, attendanceRecords.date],
            set: {
              // First-in wins: only stamp check_in if the day has none yet, so a
              // re-punch keeps the earliest sign-in and never disturbs check_out.
              checkIn: sql`coalesce(${attendanceRecords.checkIn}, excluded.check_in)`,
              updatedAt: new Date(),
            },
          })
          .returning();
        return rec!;
      }),

    /**
     * Employee self-service sign-out (G8). Sets `check_out = now` (last-out)
     * and recomputes `hours_worked` from the day's `check_in`. Errors clearly
     * when the employee never signed in, so payroll never sees a check_out
     * without a matching check_in.
     */
    signOut: protectedProcedure
      .input(z.object({}))
      .mutation(async ({ ctx }) => {
        const { org, db, user } = ctx;
        const emp = await resolveSelfEmployeeWithShift(db, user!.id, org!.id);
        if (!emp) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No employee record linked to this user account. Ask HR to provision your profile.",
          });
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [rec] = await db
          .select()
          .from(attendanceRecords)
          .where(and(
            eq(attendanceRecords.orgId, org!.id),
            eq(attendanceRecords.employeeId, emp.id),
            eq(attendanceRecords.date, today),
          ))
          .limit(1);
        if (!rec?.checkIn) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You have not signed in today.",
          });
        }

        // Recompute the whole day against the effective shift now that both
        // punches exist: status (present/late/half_day), hoursWorked, overtime,
        // and late minutes all derive from the check-in→check-out pair.
        const punch = derivePunch(new Date(rec.checkIn), now, emp.shift);
        const [updated] = await db
          .update(attendanceRecords)
          .set({
            checkOut: now,
            status: punch.status,
            hoursWorked: punch.hoursWorked,
            lateMinutes: punch.lateMinutes,
            overtimeMinutes: punch.overtimeMinutes,
            updatedAt: new Date(),
          })
          .where(eq(attendanceRecords.id, rec.id))
          .returning();
        return updated!;
      }),

    /** The authenticated employee's own attendance row for today (UI state). */
    myToday: protectedProcedure
      .query(async ({ ctx }) => {
        const { org, db, user } = ctx;
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, user!.id), eq(employees.orgId, org!.id)))
          .limit(1);
        if (!emp) return null;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [rec] = await db
          .select()
          .from(attendanceRecords)
          .where(and(
            eq(attendanceRecords.orgId, org!.id),
            eq(attendanceRecords.employeeId, emp.id),
            eq(attendanceRecords.date, today),
          ))
          .limit(1);
        return rec ?? null;
      }),

    bulkMark: permissionProcedure("hr", "write").input(z.object({
      records: z.array(z.object({
        employeeId: z.string().uuid(),
        date: z.coerce.date(),
        status: z.enum(["present", "absent", "half_day", "late", "on_leave", "holiday", "weekend"]),
        shiftType: z.enum(["morning", "afternoon", "night", "flexible", "remote"]).default("flexible"),
      })),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const rows = input.records.map(r => ({ ...r, orgId: org!.id, date: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()) }));
      if (rows.length === 0) return { count: 0 };
      // Upsert so a correction (e.g. re-marking a wrongly-`absent` day as
      // `present`) actually updates the existing row instead of being dropped.
      await db
        .insert(attendanceRecords)
        .values(rows)
        .onConflictDoUpdate({
          target: [attendanceRecords.orgId, attendanceRecords.employeeId, attendanceRecords.date],
          set: {
            status: sql`excluded.status`,
            shiftType: sql`excluded.shift_type`,
            updatedAt: new Date(),
          },
        });
      return { count: rows.length };
    }),

    /**
     * External daily-attendance ingest (G8). Accepts a raw feed as a
     * biometric device or upstream HRMS would emit it — keyed by the human
     * `employeeCode` (employees.employeeId, e.g. "EMP-0001"), not our UUID.
     *
     * The feed is normalised (`normaliseFeed`: derives status/hours/late/
     * overtime, last-write-wins per employee+day), codes are resolved to
     * UUIDs scoped to this org, and rows are idempotently upserted on the
     * unique (orgId, employeeId, date) index so a device can safely re-send
     * a batch. Unknown/foreign codes are skipped and reported, never inserted.
     */
    ingest: permissionProcedure("hr", "write").input(z.object({
      records: z.array(z.object({
        employeeCode: z.string().min(1),
        date: z.coerce.date(),
        checkIn: z.coerce.date().nullish(),
        checkOut: z.coerce.date().nullish(),
        status: z.enum(["present", "absent", "half_day", "late", "on_leave", "holiday", "weekend"]).nullish(),
        shiftStart: z.coerce.date().nullish(),
        shiftMinutes: z.number().int().positive().nullish(),
        notes: z.string().max(2000).nullish(),
      })).min(1).max(5000),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;

      const normalised = normaliseFeed(input.records as RawAttendanceFeedRow[]);

      // Resolve the distinct employee codes in this batch to UUIDs, scoped to
      // the tenant, in a single query. A code that resolves to no org employee
      // is a foreign/unknown code and is skipped (never silently mis-attributed).
      const codes = [...new Set(normalised.map((r) => r.employeeCode))];
      const found = await db
        .select({ id: employees.id, code: employees.employeeId })
        .from(employees)
        .where(and(eq(employees.orgId, org!.id), inArray(employees.employeeId, codes)));
      const codeToId = new Map(found.map((e) => [e.code, e.id]));

      const skipped: string[] = [];
      const rows = normalised.flatMap((r) => {
        const employeeId = codeToId.get(r.employeeCode);
        if (!employeeId) {
          skipped.push(r.employeeCode);
          return [];
        }
        return [{
          orgId: org!.id,
          employeeId,
          date: r.date,
          status: r.status,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          hoursWorked: r.hoursWorked,
          lateMinutes: r.lateMinutes,
          overtimeMinutes: r.overtimeMinutes,
          notes: r.notes,
        }];
      });

      if (rows.length === 0) {
        return { ingested: 0, skipped: [...new Set(skipped)] };
      }

      await db
        .insert(attendanceRecords)
        .values(rows)
        .onConflictDoUpdate({
          target: [attendanceRecords.orgId, attendanceRecords.employeeId, attendanceRecords.date],
          set: {
            status: sql`excluded.status`,
            checkIn: sql`excluded.check_in`,
            checkOut: sql`excluded.check_out`,
            hoursWorked: sql`excluded.hours_worked`,
            lateMinutes: sql`excluded.late_minutes`,
            overtimeMinutes: sql`excluded.overtime_minutes`,
            notes: sql`excluded.notes`,
            updatedAt: new Date(),
          },
        });

      return { ingested: rows.length, skipped: [...new Set(skipped)] };
    }),
  }),

  // ── Shift Schedules (G8) ────────────────────────────────────────────────
  // Admin-managed working-time definitions. A shift is stored as minute
  // offsets from local midnight (timezone-agnostic) so a self-service punch's
  // wall-clock minute can be compared to derive late/half-day/overtime.
  // Precedence at punch time: employee-assigned shift → org default → built-in.
  shifts: router({
    list: permissionProcedure("hr", "read").query(async ({ ctx }) => {
      const { org, db } = ctx;
      return db
        .select()
        .from(shiftSchedules)
        .where(eq(shiftSchedules.orgId, org!.id))
        .orderBy(desc(shiftSchedules.isDefault), shiftSchedules.name);
    }),

    create: permissionProcedure("hr", "write").input(z.object({
      name: z.string().min(1).max(120),
      startMinutes: z.number().int().min(0).max(1439).default(540),
      durationMinutes: z.number().int().min(1).max(1440).default(480),
      graceMinutes: z.number().int().min(0).max(240).default(10),
      isDefault: z.boolean().default(false),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      // A new default demotes the incumbent so the partial unique index
      // (one is_default=true per org) is never violated.
      return db.transaction(async (tx) => {
        if (input.isDefault) {
          await tx
            .update(shiftSchedules)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(shiftSchedules.orgId, org!.id), eq(shiftSchedules.isDefault, true)));
        }
        const [created] = await tx
          .insert(shiftSchedules)
          .values({
            orgId: org!.id,
            name: input.name,
            startMinutes: input.startMinutes,
            durationMinutes: input.durationMinutes,
            graceMinutes: input.graceMinutes,
            isDefault: input.isDefault,
          })
          .returning();
        return created!;
      });
    }),

    update: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      startMinutes: z.number().int().min(0).max(1439).optional(),
      durationMinutes: z.number().int().min(1).max(1440).optional(),
      graceMinutes: z.number().int().min(0).max(240).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { id, ...patch } = input;
      const [updated] = await db
        .update(shiftSchedules)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(shiftSchedules.id, id), eq(shiftSchedules.orgId, org!.id)))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Shift schedule not found" });
      }
      return updated;
    }),

    setDefault: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      return db.transaction(async (tx) => {
        // Target must belong to this org before we touch the incumbent.
        const [target] = await tx
          .select({ id: shiftSchedules.id })
          .from(shiftSchedules)
          .where(and(eq(shiftSchedules.id, input.id), eq(shiftSchedules.orgId, org!.id)))
          .limit(1);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Shift schedule not found" });
        }
        // Clear the prior default first (partial unique index rejects two).
        await tx
          .update(shiftSchedules)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(shiftSchedules.orgId, org!.id), eq(shiftSchedules.isDefault, true)));
        const [promoted] = await tx
          .update(shiftSchedules)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(and(eq(shiftSchedules.id, input.id), eq(shiftSchedules.orgId, org!.id)))
          .returning();
        return promoted!;
      });
    }),

    assign: permissionProcedure("hr", "write").input(z.object({
      employeeId: z.string().uuid(),
      shiftScheduleId: z.string().uuid().nullable(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      // A non-null shift must belong to this org (no cross-tenant assignment).
      if (input.shiftScheduleId) {
        const [shift] = await db
          .select({ id: shiftSchedules.id })
          .from(shiftSchedules)
          .where(and(eq(shiftSchedules.id, input.shiftScheduleId), eq(shiftSchedules.orgId, org!.id)))
          .limit(1);
        if (!shift) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Shift schedule not found" });
        }
      }
      const [updated] = await db
        .update(employees)
        .set({ shiftScheduleId: input.shiftScheduleId, updatedAt: new Date() })
        .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
        .returning({ id: employees.id, shiftScheduleId: employees.shiftScheduleId });
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      return updated;
    }),
  }),

  // ── Expense Claims ──────────────────────────────────────────────────────
  expenses: router({
    list: permissionProcedure("hr", "read").input(z.object({
      employeeId: z.string().uuid().optional(),
      status: z.enum(expenseStatusEnum.enumValues).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, employees: emps, users, eq: dbEq, and: dbAnd, desc: dbDesc } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(expenseClaims.orgId, org!.id)];
      if (input.employeeId) conds.push(dbEq(expenseClaims.employeeId, input.employeeId));
      if (input.status) conds.push(dbEq(expenseClaims.status, input.status));
      const res = await db.select({ claim: expenseClaims, employee: emps, userName: users.name })
        .from(expenseClaims)
        .leftJoin(emps, dbEq(expenseClaims.employeeId, emps.id))
        .leftJoin(users, dbEq(emps.userId, users.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(expenseClaims.createdAt)).limit(input.limit);
      return res.map(r => ({ claim: r.claim, employee: r.employee ? { ...r.employee, name: r.userName } : null }));
    }),

    create: protectedProcedure.input(z.object({
      employeeId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["travel", "accommodation", "food", "fuel", "communication", "office_supplies", "client_entertainment", "training", "medical", "miscellaneous"]).default("miscellaneous"),
      amount: z.number().positive(),
      currency: z.string().default("INR"),
      expenseDate: z.coerce.date(),
      receiptUrl: z.string().optional(),
      projectCode: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // An employee may raise their own claim; hr:write holders may raise anyone's.
      await assertSelfOrHrWriter(ctx, input.employeeId);
      const { org, db } = ctx;
      const { expenseClaims, count: dbCount, eq: dbEq } = await import("@coheronconnect/db");
      const [c] = await db.select({ n: dbCount() }).from(expenseClaims).where(dbEq(expenseClaims.orgId, org!.id));
      const seq = (c?.n ?? 0) + 1;
      const number = "EXP-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
      const [claim] = await db.insert(expenseClaims).values({ ...input, orgId: org!.id, number, amount: String(input.amount), status: "submitted" }).returning();
      return claim!;
    }),

    /**
     * Employee self-serve creation. Resolves the employee record from the
     * authenticated user (`employees.userId`) so an IC without `hr.write`
     * can file their own claim. Status starts as "submitted" — going to
     * "draft" first then submit-on-save adds friction without value for
     * the self-serve flow. Approval still requires `financial.write`.
     */
    createMine: protectedProcedure.input(z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      category: z.enum(["travel", "accommodation", "food", "fuel", "communication", "office_supplies", "client_entertainment", "training", "medical", "miscellaneous"]).default("miscellaneous"),
      amount: z.number().positive(),
      currency: z.string().length(3).default("INR"),
      expenseDate: z.coerce.date(),
      receiptUrl: z.string().optional(),
      projectCode: z.string().optional(),
      merchant: z.string().max(200).optional(),
      mileageKm: z.number().positive().optional(),
      ocrExtracted: z.unknown().optional(),
      ocrConfidence: z.number().min(0).max(1).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { employees, expenseClaims, count: dbCount, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");

      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(dbAnd(dbEq(employees.userId, user!.id), dbEq(employees.orgId, org!.id)))
        .limit(1);
      if (!emp) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No employee record linked to this user account. Ask HR to provision your profile.",
        });
      }

      // Run org expense policy. `block` enforcement throws; `warn`
      // tags the claim with `policy_violation_*` so an approver sees
      // the issue and can still approve manually.
      const policy = evaluateExpenseClaim(
        {
          category: input.category,
          amount: input.amount,
          currency: input.currency,
          receiptUrl: input.receiptUrl,
          mileageKm: input.mileageKm,
        },
        org!.settings,
      );
      if (!policy.ok && policy.enforcement === "block") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Policy violation: ${policy.violation?.reason ?? "claim rejected by org policy"}`,
        });
      }

      const [c] = await db
        .select({ n: dbCount() })
        .from(expenseClaims)
        .where(dbEq(expenseClaims.orgId, org!.id));
      const seq = (c?.n ?? 0) + 1;
      const number = "EXP-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
      const [claim] = await db
        .insert(expenseClaims)
        .values({
          orgId: org!.id,
          employeeId: emp.id,
          number,
          title: input.title,
          description: input.description,
          category: input.category,
          amount: String(input.amount),
          currency: input.currency,
          expenseDate: input.expenseDate,
          receiptUrl: input.receiptUrl,
          projectCode: input.projectCode,
          merchant: input.merchant,
          mileageKm: input.mileageKm != null ? String(input.mileageKm) : null,
          policyViolationCode: policy.violation?.code ?? null,
          policyViolationReason: policy.violation?.reason ?? null,
          ocrExtracted: input.ocrExtracted as Record<string, unknown> | undefined,
          ocrConfidence: input.ocrConfidence != null ? String(input.ocrConfidence) : null,
          status: "submitted",
        })
        .returning();
      return { ...claim!, policy };
    }),

    /**
     * Run vision OCR on a receipt the user has uploaded but not yet
     * submitted. Stateless: callers paste back the returned values
     * into the form, then submit via `createMine` which persists the
     * raw extraction in `ocr_extracted`.
     */
    ocrReceipt: protectedProcedure.input(z.object({
      imageBase64: z.string().min(20).max(8 * 1024 * 1024 / 3 + 100), // ~8MB image
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    })).mutation(async ({ ctx, input }) => {
      const { org } = ctx;
      const baseCurrency = (() => {
        const settings = (org!.settings ?? {}) as { expense?: { baseCurrency?: string } };
        return settings.expense?.baseCurrency ?? "INR";
      })();
      const result = await extractReceipt({
        imageBase64: input.imageBase64,
        mediaType: input.mediaType,
        defaultCurrency: baseCurrency,
      });
      if (!result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "OCR is unavailable right now. Fill the form manually and submit.",
        });
      }
      return result;
    }),

    /**
     * List the current user's own expense claims. Self-serve read,
     * gated only by authentication. Used by the employee portal.
     */
    listMine: protectedProcedure.input(z.object({
      status: z.enum(expenseStatusEnum.enumValues).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    })).query(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { employees, expenseClaims, eq: dbEq, and: dbAnd, desc: dbDesc } = await import("@coheronconnect/db");
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(dbAnd(dbEq(employees.userId, user!.id), dbEq(employees.orgId, org!.id)))
        .limit(1);
      if (!emp) return [];
      const conds: SQL[] = [dbEq(expenseClaims.orgId, org!.id), dbEq(expenseClaims.employeeId, emp.id)];
      if (input.status) conds.push(dbEq(expenseClaims.status, input.status));
      return db
        .select()
        .from(expenseClaims)
        .where(dbAnd(...conds))
        .orderBy(dbDesc(expenseClaims.createdAt))
        .limit(input.limit);
    }),

    submit: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      // Ownership is resolved from the claim itself — a requester may submit only
      // their own claim, an hr:write holder may submit any.
      const [existing] = await db.select({ employeeId: expenseClaims.employeeId }).from(expenseClaims)
        .where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense claim not found" });
      await assertSelfOrHrWriter(ctx, existing.employeeId);
      const [c] = await db.update(expenseClaims).set({ status: "submitted", updatedAt: new Date() }).where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).returning();
      return c!;
    }),

    /**
     * Manager first-level approval. Moves a `submitted` claim to
     * `under_review` (forward to Finance) or `rejected`.
     * Gated on `hr.write` — a manager/HR admin can approve but
     * Finance (`financial.write`) does the final sign-off.
     */
    managerApprove: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      approved: z.boolean(),
      rejectionReason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const [existing] = await db.select({ status: expenseClaims.status })
        .from(expenseClaims)
        .where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense claim not found" });
      if (existing.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted claims can be manager-approved." });
      }
      const newStatus = input.approved ? "under_review" as const : "rejected" as const;

      const updateData: Partial<typeof expenseClaims.$inferInsert> = {
        status: newStatus,
        approvedById: input.approved ? user!.id : null,
        rejectionReason: input.approved ? null : (input.rejectionReason ?? "Rejected by manager"),
        updatedAt: new Date(),
      };

      const [c] = await db.update(expenseClaims)
        .set(updateData)
        .where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id)))
        .returning();
      return c!;
    }),

    /**
     * Approve / reject an expense claim. Owned by Finance, not HR — moving
     * money out of the org bank account is a finance-controlled action even
     * though the underlying entity sits in the HR schema. Gated on
     * `financial.write` so HR coordinators who can file claims cannot
     * self-approve them. Only operates on `under_review` claims (manager already approved).
     */
    approve: permissionProcedure("financial", "write").input(z.object({
      id: z.string().uuid(),
      approved: z.boolean(),
      rejectionReason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const status = input.approved ? "approved" as const : "rejected" as const;

      const updateData: Partial<typeof expenseClaims.$inferInsert> = {
        status,
        approvedById: input.approved ? user!.id : null,
        approvedAt: input.approved ? new Date() : null,
        rejectionReason: input.rejectionReason,
        updatedAt: new Date()
      };

      const [updated] = await db.update(expenseClaims)
        .set(updateData)
        .where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id)))
        .returning();
      return updated!;
    }),

    /**
     * Mark a claim reimbursed (money sent). Finance-owned for the same
     * reason as approve(). Gated on `financial.write`.
     */
    markReimbursed: permissionProcedure("financial", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const [c] = await db.update(expenseClaims).set({ status: "reimbursed", reimbursedAt: new Date(), updatedAt: new Date() }).where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).returning();
      return c!;
    }),
  }),

  // ── OKR / Goal Management ───────────────────────────────────────────────
  okr: router({
    listObjectives: permissionProcedure("hr", "read").input(z.object({
      year: z.number().int().optional(),
      cycle: z.enum(["q1", "q2", "q3", "q4", "annual"]).optional(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives, okrKeyResults, users: usersT, eq: dbEq, and: dbAnd, desc: dbDesc, inArray: dbInArray } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(okrObjectives.orgId, org!.id)];
      if (input.year) conds.push(dbEq(okrObjectives.year, input.year));
      if (input.cycle) conds.push(dbEq(okrObjectives.cycle, input.cycle));
      const objectives = await db.select({ objective: okrObjectives, owner: usersT })
        .from(okrObjectives).leftJoin(usersT, dbEq(okrObjectives.ownerId, usersT.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(okrObjectives.createdAt));
      if (objectives.length === 0) return [];
      const ids = objectives.map((o: (typeof objectives)[number]) => o.objective.id);
      const krs = await db.select().from(okrKeyResults).where(dbInArray(okrKeyResults.objectiveId, ids));
      return objectives.map((o: (typeof objectives)[number]) => ({
        ...o,
        keyResults: krs.filter((k: (typeof krs)[number]) => k.objectiveId === o.objective.id),
      }));
    }),

    createObjective: permissionProcedure("hr", "write").input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      ownerId: z.string().uuid(),
      cycle: z.enum(["q1", "q2", "q3", "q4", "annual"]).default("q1"),
      year: z.number().int(),
      /** Optional alignment: cascade this objective under a parent (team/org) OKR. */
      parentObjectiveId: z.string().uuid().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      // Tenant guard: a parent objective must belong to the caller's org.
      if (input.parentObjectiveId) {
        const [parent] = await db.select({ id: okrObjectives.id }).from(okrObjectives)
          .where(dbAnd(dbEq(okrObjectives.id, input.parentObjectiveId), dbEq(okrObjectives.orgId, org!.id))).limit(1);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent objective not found" });
      }
      const [obj] = await db.insert(okrObjectives).values({ ...input, orgId: org!.id, status: "active" }).returning();
      return obj!;
    }),

    /**
     * Align (or detach) an objective under a parent, forming the org→team→
     * individual OKR cascade. Guards against cycles: a parent may not be the
     * objective itself nor any of its descendants.
     */
    setParent: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      parentObjectiveId: z.string().uuid().nullable(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");

      const [child] = await db.select().from(okrObjectives)
        .where(dbAnd(dbEq(okrObjectives.id, input.id), dbEq(okrObjectives.orgId, org!.id))).limit(1);
      if (!child) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.parentObjectiveId) {
        if (input.parentObjectiveId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An objective cannot be its own parent" });
        }
        const [parent] = await db.select({ id: okrObjectives.id }).from(okrObjectives)
          .where(dbAnd(dbEq(okrObjectives.id, input.parentObjectiveId), dbEq(okrObjectives.orgId, org!.id))).limit(1);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent objective not found" });

        // Cycle guard: walk up from the proposed parent; if we reach the child
        // we'd create a loop. Bounded by org objective count.
        const all = await db.select({ id: okrObjectives.id, parentObjectiveId: okrObjectives.parentObjectiveId })
          .from(okrObjectives).where(dbEq(okrObjectives.orgId, org!.id));
        const parentOf = new Map(all.map((o: { id: string; parentObjectiveId: string | null }) => [o.id, o.parentObjectiveId]));
        let cursor: string | null = input.parentObjectiveId;
        let hops = 0;
        while (cursor && hops <= all.length) {
          if (cursor === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Alignment would create a cycle" });
          }
          cursor = parentOf.get(cursor) ?? null;
          hops++;
        }
      }

      const [updated] = await db.update(okrObjectives)
        .set({ parentObjectiveId: input.parentObjectiveId, updatedAt: new Date() })
        .where(dbAnd(dbEq(okrObjectives.id, input.id), dbEq(okrObjectives.orgId, org!.id)))
        .returning();
      // G12: re-parenting moves this subtree, changing which ancestors' rollups
      // include it — re-persist the whole org's rollup.
      const { persistOrgRollup } = await import("../lib/hr/okr-rollup.js");
      await persistOrgRollup(db, org!.id);
      return updated!;
    }),

    /**
     * Cascade view: the org's objectives as an alignment forest. Each node
     * carries its own `overallProgress` plus a `rollupProgress` = average of
     * its own progress and all descendants' progress, so a parent reflects how
     * its aligned children are tracking.
     */
    cascade: permissionProcedure("hr", "read").input(z.object({
      year: z.number().int().optional(),
      cycle: z.enum(["q1", "q2", "q3", "q4", "annual"]).optional(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives, users: usersT, eq: dbEq, and: dbAnd, desc: dbDesc } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(okrObjectives.orgId, org!.id)];
      if (input.year) conds.push(dbEq(okrObjectives.year, input.year));
      if (input.cycle) conds.push(dbEq(okrObjectives.cycle, input.cycle));
      const rows = await db.select({ objective: okrObjectives, owner: usersT })
        .from(okrObjectives).leftJoin(usersT, dbEq(okrObjectives.ownerId, usersT.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(okrObjectives.createdAt));

      type Row = (typeof rows)[number];
      type Node = Row & { children: Node[]; rollupProgress: number };
      const nodes = new Map<string, Node>();
      // G12: rollupProgress is now a persisted column, kept fresh on every KR /
      // re-parent change, so we surface the stored value directly rather than
      // recomputing the forest on read.
      for (const r of rows) nodes.set(r.objective.id, { ...r, children: [], rollupProgress: r.objective.rollupProgress });

      const roots: Node[] = [];
      for (const node of nodes.values()) {
        const parentId = node.objective.parentObjectiveId;
        // Attach to parent only if the parent is in this filtered set; otherwise
        // treat as a root so nothing is dropped when filtered by cycle/year.
        if (parentId && nodes.has(parentId)) nodes.get(parentId)!.children.push(node);
        else roots.push(node);
      }

      return { roots };
    }),

    createKeyResult: permissionProcedure("hr", "write").input(z.object({
      objectiveId: z.string().uuid(),
      title: z.string().min(1),
      targetValue: z.number().positive().default(100),
      unit: z.string().default("%"),
      dueDate: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrKeyResults, okrObjectives, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      // Tenant guard: don't let a caller attach a key-result to another org's objective.
      const [parent] = await db.select({ id: okrObjectives.id }).from(okrObjectives)
        .where(dbAnd(dbEq(okrObjectives.id, input.objectiveId), dbEq(okrObjectives.orgId, org!.id))).limit(1);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      const [kr] = await db.insert(okrKeyResults).values({ ...input, orgId: org!.id, targetValue: String(input.targetValue), status: "on_track" }).returning();
      // G12: a new KR shifts this objective's own progress; recompute + roll up.
      const { recomputeAfterKeyResultChange } = await import("../lib/hr/okr-rollup.js");
      await recomputeAfterKeyResultChange(db, org!.id, input.objectiveId);
      return kr!;
    }),

    updateKeyResult: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      currentValue: z.number().min(0),
      status: z.enum(["on_track", "at_risk", "behind", "completed"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { okrKeyResults, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      // Tenant guard: scope the key-result update to the caller's org so an
      // out-of-org caller cannot mutate another tenant's KR (and cascade into
      // their objective's progress below).
      const [kr] = await db.update(okrKeyResults).set({ currentValue: String(input.currentValue), status: input.status, notes: input.notes, updatedAt: new Date() }).where(dbAnd(dbEq(okrKeyResults.id, input.id), dbEq(okrKeyResults.orgId, org!.id))).returning();
      if (kr) {
        // G12: refresh this objective's own progress, then re-persist the whole
        // org's rollup so every ancestor reflects the change (not on-read only).
        const { recomputeAfterKeyResultChange } = await import("../lib/hr/okr-rollup.js");
        await recomputeAfterKeyResultChange(db, org!.id, kr.objectiveId);
      }
      return kr!;
    }),
  }),

  /** US-HCM-003 — manager snapshot (primary reporting chain). */
  managerHub: permissionProcedure("hr", "read").query(async ({ ctx }) => {
    const { db, org, user } = ctx;
    const [me] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.orgId, org!.id), eq(employees.userId, user!.id)));
    if (!me) return { ok: false as const, reason: "no_employee_record" as const };
    const subtree = await collectReportSubtreeEmployeeIds(db, org!.id, me.id);
    const teamEmployeeFilter =
      subtree.length > 0 ? inArray(employees.id, subtree) : sql<boolean>`false`;

    const [directReports] = await db
      .select({ n: count() })
      .from(employees)
      .where(and(eq(employees.orgId, org!.id), eq(employees.managerId, me.id)));

    const [teamHeadcount] = await db
      .select({ n: count() })
      .from(employees)
      .where(
        and(eq(employees.orgId, org!.id), eq(employees.status, "active"), teamEmployeeFilter),
      );

    const leaveFilter =
      subtree.length > 0 ? inArray(leaveRequests.employeeId, subtree) : sql<boolean>`false`;
    const [pendingLeave] = await db
      .select({ n: count() })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.orgId, org!.id),
          eq(leaveRequests.status, "pending"),
          leaveFilter,
        ),
      );

    const caseFilter =
      subtree.length > 0 ? inArray(hrCases.employeeId, subtree) : sql<boolean>`false`;
    const [onboardingCases] = await db
      .select({ n: count() })
      .from(hrCases)
      .where(
        and(eq(hrCases.orgId, org!.id), eq(hrCases.caseType, "onboarding"), caseFilter),
      );

    const teamUserRows =
      subtree.length > 0
        ? await db
            .select({ userId: employees.userId })
            .from(employees)
            .where(and(eq(employees.orgId, org!.id), inArray(employees.id, subtree)))
        : [];
    const teamUserIds = teamUserRows.map((r: (typeof teamUserRows)[number]) => r.userId).filter(Boolean) as string[];

    let performanceCycle: {
      cycleId: string;
      cycleName: string;
      cycleStatus: string;
      teamReviewsOpen: number;
      teamReviewsCompleted: number;
    } | null = null;

    if (teamUserIds.length > 0) {
      const [cycle] = await db
        .select()
        .from(reviewCycles)
        .where(
          and(
            eq(reviewCycles.orgId, org!.id),
            inArray(reviewCycles.status, ["active", "calibration"]),
          ),
        )
        .orderBy(desc(reviewCycles.updatedAt))
        .limit(1);

      if (cycle) {
        const reviewRows = await db
          .select({ status: performanceReviews.status })
          .from(performanceReviews)
          .where(
            and(
              eq(performanceReviews.orgId, org!.id),
              eq(performanceReviews.cycleId, cycle.id),
              inArray(performanceReviews.revieweeId, teamUserIds),
            ),
          );
        const teamReviewsCompleted = reviewRows.filter(
          (r: (typeof reviewRows)[number]) => r.status === "completed",
        ).length;
        performanceCycle = {
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleStatus: cycle.status,
          teamReviewsOpen: reviewRows.length - teamReviewsCompleted,
          teamReviewsCompleted,
        };
      }
    }

    return {
      ok: true as const,
      directReports: Number(directReports?.n ?? 0),
      teamHeadcountActive: Number(teamHeadcount?.n ?? 0),
      pendingLeaveInTeam: Number(pendingLeave?.n ?? 0),
      onboardingCasesInTeam: Number(onboardingCases?.n ?? 0),
      performanceCycle,
      deepLinkHr: "/app/hr",
      deepLinkPerformance: "/app/performance",
      note: "Team = primary reporting chain; HRBP org scope is `workforce.headcount` with `scope: org` (US-HCM-005).",
    };
  }),

  /** US-HCM-007 — org chart payload (client lays out graph). */
  orgChartSnapshot: permissionProcedure("hr", "read")
    .input(z.object({ maxNodes: z.coerce.number().min(10).max(800).default(400) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          id: employees.id,
          employeeId: employees.employeeId,
          managerId: employees.managerId,
          dottedLineManagerId: employees.dottedLineManagerId,
          department: employees.department,
          title: employees.title,
          name: users.name,
        })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(eq(employees.orgId, org!.id))
        .orderBy(asc(users.name))
        .limit(input.maxNodes);
      const roots = rows
        .filter((r: (typeof rows)[number]) => r.managerId == null)
        .map((r: (typeof rows)[number]) => r.id);
      return {
        nodes: rows.map((r: (typeof rows)[number]) => ({
          id: r.id,
          label: `${r.name} (${r.employeeId})`,
          managerId: r.managerId,
          dottedLineManagerId: r.dottedLineManagerId,
          department: r.department,
          title: r.title,
        })),
        roots,
      };
    }),

  /** US-HCM-006 — onboarding journey progress from HR case tasks. */
  onboardingJourneyProgress: permissionProcedure("hr", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const cases = await db
      .select({ id: hrCases.id })
      .from(hrCases)
      .where(and(eq(hrCases.orgId, org!.id), eq(hrCases.caseType, "onboarding")));
    let totalPct = 0;
    for (const c of cases) {
      const tasks = await db.select().from(hrCaseTasks).where(eq(hrCaseTasks.caseId, c.id));
      const done = tasks.filter((t: (typeof tasks)[number]) => t.status === "done").length;
      totalPct += tasks.length ? (done / tasks.length) * 100 : 0;
    }
    const n = cases.length;
    return {
      onboardingCaseCount: n,
      averageTemplateProgressPct: n ? Math.round(totalPct / n) : 0,
      deepLink: "/app/hr",
    };
  }),

  /** US-HCM-008 — privacy-safe engagement + recruitment signals for People hub. */
  peopleHubTalentSignals: permissionProcedure("hr", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const since = new Date(Date.now() - 30 * 86400000);
    const byType = await db
      .select({ type: surveys.type, n: count() })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(and(eq(surveys.orgId, org!.id), gte(surveyResponses.submittedAt, since)))
      .groupBy(surveys.type);
    const [openReqs] = await db
      .select({ n: count() })
      .from(jobRequisitions)
      .where(and(eq(jobRequisitions.orgId, org!.id), eq(jobRequisitions.status, "open")));
    const [apps] = await db
      .select({ n: count() })
      .from(candidateApplications)
      .innerJoin(jobRequisitions, eq(candidateApplications.jobId, jobRequisitions.id))
      .where(eq(jobRequisitions.orgId, org!.id));
    return {
      surveyResponsesLast30dByType: byType.map((r: { type: string; n: unknown }) => ({
        type: r.type,
        count: Number(r.n),
      })),
      openRequisitions: Number(openReqs?.n ?? 0),
      activeApplications: Number(apps?.n ?? 0),
    };
  }),

  /** Flat alias for `hr.employees.list` — supports an optional `limit` used by OKR, Expenses, and Attendance pages. */
  listEmployees: permissionProcedure("hr", "read")
    .input(
      z.object({
        limit: z.number().int().positive().optional(),
        department: z.string().optional(),
        status: z.enum(employeeStatusEnum.enumValues).optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(employees.orgId, org!.id)];
      if (input.status) conditions.push(eq(employees.status, input.status));
      if (input.department) conditions.push(eq(employees.department, input.department));

      const query = db
        .select({ emp: employees, userName: users.name, userEmail: users.email })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(users.name));

      const rows = input.limit ? await query.limit(input.limit) : await query;

      return rows.map((row: (typeof rows)[number]) => {
        const { emp, userName, userEmail } = row;
        return {
          ...emp,
          name: userName,
          email: userEmail,
          employeeNumber: emp.employeeId,
          jobTitle: emp.title,
        };
      });
    }),
});
