/**
 * Computes payroll run totals from active employees + salary structures
 * using `payroll-cycle` (India statutory + TDS). Used when locking a run.
 */

import { employees, salaryStructures, payslips, organizations, eq, and, or, isNull, isNotNull, inArray } from "@coheronconnect/db";
import { resolveSalaryStructureForPeriod, structureNotEffectiveError } from "../lib/india/salary-structure-resolver";
import {
  computeEmployeePayslip,
  ptPriorPeriodMonths,
  type EmployeePayrollInput,
} from "../lib/payroll-cycle";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import { isMetroCity } from "@coheronconnect/payroll-math";

/**
 * Employee statuses that count as EMPLOYED for a pay period, and so are selected by a payroll run.
 * Anyone employed during the period is paid for the period they were employed — probation IS
 * employment, and a status of `on_leave` is employment too (whether that leave is paid or unpaid
 * is a LOSS-OF-PAY computation driven by ATTENDANCE, not by this status — see india/attendance-lop).
 * Previously the run filtered `status = "active"` only, so a probation or on_leave employee got no
 * payslip, no total and no flag — silently unpaid. Leavers (`resigned`/`terminated`/`offboarded`)
 * are deliberately NOT here: they need a pro-rata full-and-final settlement that does not exist yet,
 * so they stay excluded pending that separate decision rather than be paid a full month in error.
 */
export const PAYROLL_EMPLOYED_STATUSES = ["active", "probation", "on_leave"] as const;

/**
 * Leaver statuses — the run does NOT pay these (they are not employed at period end). But a leaver
 * who worked PART of the pay period is owed a final payslip for the days worked (Code on Wages:
 * settlement within two working days of exit). The system has **no last-working-day**: `endDate` is
 * declared on `employees` but never written by any path, and the offboarding flow records only a
 * status, no date. So a correct final payslip cannot be COMPUTED (there is nothing that says how
 * many days to pay), and inventing a date would be wrong. The honest floor is therefore to FLAG a
 * leaver in the run's errors — never silently drop them — naming the employee and the missing datum,
 * so an admin settles them manually. When `endDate` is populated (a follow-up), the run can select
 * by date range and pro-rate to the last working day; until then, flag.
 */
export const PAYROLL_LEAVER_STATUSES = ["resigned", "terminated", "offboarded"] as const;

/** India FY month: April = 1 … March = 12 */
export function calendarToFyMonth(calendarMonth: number): number {
  return calendarMonth >= 4 ? calendarMonth - 3 : calendarMonth + 9;
}

/** Inverse of `calendarToFyMonth`: an FY month (1=Apr … 12=Mar) plus the FY's START calendar
 *  year → the calendar month/year. FY months 1–9 (Apr–Dec) sit in the start year; 10–12
 *  (Jan–Mar) roll into the next. */
export function fyMonthToCalendar(fyMonth: number, fyStartYear: number): { month: number; year: number } {
  return fyMonth <= 9
    ? { month: fyMonth + 3, year: fyStartYear }
    : { month: fyMonth - 9, year: fyStartYear + 1 };
}

const FY_MONTH_NAMES = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];
/** Human month name for an FY month (1=April … 12=March), for warning messages. */
function fyMonthName(fyMonth: number): string {
  return FY_MONTH_NAMES[fyMonth - 1] ?? `FY month ${fyMonth}`;
}

/** Per-employee half-yearly PT context (the prior-period income the system holds). */
export type PtHalfYearlyContext = { periodPriorGross: number; periodMissingMonths: number[] };

/**
 * For a run in (`month`, `year`), determine each employee's half-yearly PT period income from
 * PAYSLIP HISTORY. Returns a map keyed by employee id, populated ONLY for employees whose state
 * levies PT half-yearly (Kerala, Tamil Nadu) AND whose run month is that state's collection
 * month. For those, it sums the gross of the period's earlier months found in `payslips` and
 * lists any required earlier month with no payslip on record (`periodMissingMonths`) — the
 * migration case, where the six-month PT cannot be assessed and must be flagged, not guessed.
 * Same reasoning as C3/ESI: the history already lives in payslips, so no new table is needed.
 */
export async function buildPtHalfYearlyContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  empRows: Array<{ emp: typeof employees.$inferSelect }>,
  month: number,
  year: number,
): Promise<Map<string, PtHalfYearlyContext>> {
  const fyMonth = calendarToFyMonth(month);
  const fyStartYear = month >= 4 ? year : year - 1;

  // Which earlier FY months each employee needs (empty unless half-yearly + collection month).
  const needByEmp = new Map<string, number[]>();
  const neededFyMonths = new Set<number>();
  for (const { emp } of empRows) {
    const state = emp.state?.trim();
    if (!state) continue;
    const prior = ptPriorPeriodMonths(state, fyMonth);
    if (prior.length === 0) continue;
    needByEmp.set(emp.id, prior);
    for (const m of prior) neededFyMonths.add(m);
  }

  const result = new Map<string, PtHalfYearlyContext>();
  if (needByEmp.size === 0) return result;

  // One query: every payslip for this org at the needed (calendar month, year) pairs.
  const calPairs = [...neededFyMonths].map((fm) => fyMonthToCalendar(fm, fyStartYear));
  const rows = await db
    .select({
      employeeId: payslips.employeeId,
      month: payslips.month,
      year: payslips.year,
      gross: payslips.grossEarnings,
    })
    .from(payslips)
    .where(
      and(
        eq(payslips.orgId, orgId),
        or(...calPairs.map((p) => and(eq(payslips.month, p.month), eq(payslips.year, p.year)))),
      ),
    );

  // Index the found gross by (employeeId, FY month).
  const grossByEmpFy = new Map<string, number>();
  for (const r of rows) {
    grossByEmpFy.set(`${r.employeeId}:${calendarToFyMonth(r.month)}`, Number(r.gross || 0));
  }

  for (const [empId, prior] of needByEmp) {
    let periodPriorGross = 0;
    const periodMissingMonths: number[] = [];
    for (const fm of prior) {
      const g = grossByEmpFy.get(`${empId}:${fm}`);
      if (g == null) periodMissingMonths.push(fm);
      else periodPriorGross += g;
    }
    result.set(empId, { periodPriorGross, periodMissingMonths });
  }
  return result;
}

/**
 * Start date (1 Apr / 1 Oct) of the ESI six-month contribution period a given
 * calendar month falls in. Apr–Sep → 1 Apr of that year; Oct–Dec → 1 Oct of that
 * year; Jan–Mar → 1 Oct of the PREVIOUS year. Used to decide whether an employee's
 * stored ESI membership belongs to the current period (carry it) or is stale (unknown).
 */
export function esiContributionPeriodStart(month: number, year: number): Date {
  if (month >= 4 && month <= 9) return new Date(year, 3, 1); // April 1
  if (month >= 10) return new Date(year, 9, 1); // October 1 (this year)
  return new Date(year - 1, 9, 1); // Jan–Mar → October 1 of the previous year
}

/** Resolve the ESI membership to feed the engine: the stored flag when it was
 *  assessed for the CURRENT period, else null (unknown → engine re-assesses at a
 *  boundary month, or approximates mid-period and flags it). */
function esiMemberForCurrentPeriod(
  emp: typeof employees.$inferSelect,
  month: number,
  year: number,
): boolean | null {
  if (emp.esiMember == null || emp.esiMemberPeriodStart == null) return null;
  const stored = new Date(emp.esiMemberPeriodStart);
  const current = esiContributionPeriodStart(month, year);
  return stored.getFullYear() === current.getFullYear() && stored.getMonth() === current.getMonth()
    ? emp.esiMember
    : null;
}

export type PayrollAggregateTotals = {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalPfEmployee: number;
  totalPfEmployer: number;
  totalEsiEmployee: number;
  totalEsiEmployer: number;
  totalPt: number;
  totalTds: number;
  employeeCount: number;
  errors: Array<{ employeeId: string; message: string }>;
};

export function buildEmployeePayrollInput(
  emp: typeof employees.$inferSelect,
  struct: typeof salaryStructures.$inferSelect,
  month: number,
  year: number,
  attendance?: { daysInMonth: number; daysWorked: number; lopDays: number },
  ptHalfYearly?: PtHalfYearlyContext,
  // C1 Piece 1: old-regime declared deductions for this employee's fiscal year (raw ₹; computeTax
  // caps them). Absent/lapsed ⇒ 0. Only affects OLD-regime tax; the engine ignores them for NEW.
  declarations?: {
    section80C: number;
    section80D: number;
    section80CCD1B: number;
    section80TTA: number;
    section24b: number;
  },
): EmployeePayrollInput {
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  const hraPctOfBasic = Number(struct.hraPercentOfBasic ?? 50) / 100;
  // Dearness Allowance as a % of monthly CTC (employer's composition election). DA joins basic
  // in the PF/ESI wage base and is carved OUT of the special-allowance residual below, so gross
  // total is unchanged — DA is just broken out of `special`. daPercent = 0 ⇒ basic-alone (unchanged).
  const daPct = Number(struct.daPercent ?? 0) / 100;
  const basicMonthly = (ctc * basicPct) / 12;
  const daMonthly = (ctc * daPct) / 12;
  const hraMonthly = basicMonthly * hraPctOfBasic;
  const ltaAnnual = Number(struct.ltaAnnual || 0);
  const ltaMonthly = ltaAnnual / 12;
  // PT1: special allowance is the residual of monthly Base Pay after basic + DA + HRA + LTA.
  // Every named component (DA and LTA, like Basic and HRA) is carved OUT of this residual and
  // sits INSIDE Base Pay, so gross stays Base Pay/12 — LTA no longer inflates gross on top of it.
  // (The `- 2500` once subtracted here was the ANNUAL Maharashtra PT cap applied MONTHLY — 12× too
  // large, in the wrong place, never added back; removed. PT is a separate statutory deduction and
  // does not belong in the earnings residual.)
  const specialAllowance = Math.max(0, ctc / 12 - basicMonthly - daMonthly - hraMonthly - ltaMonthly);
  const daysInMonth = new Date(year, month, 0).getDate();
  // G8: LOP derived from attendance. Absent a record, treat as a full paid month.
  const daysWorked = attendance ? attendance.daysWorked : daysInMonth;
  const lopDays = attendance ? attendance.lopDays : 0;
  const join = emp.startDate ? new Date(emp.startDate) : new Date(year, month - 1, 1);

  // Statutory state drives PT slab selection. There is no safe default — a silent
  // fallback (previously "Maharashtra") files the wrong PT with a state regulator, and
  // ~half of states levy no PT, so "unknown" must be distinguishable from "known non-
  // levying". Employees with no state are excluded from the run with a per-employee error
  // (owner-approved: "Error that employee row"). The API create boundary makes state
  // required going forward; this guard catches legacy rows.
  const state = emp.state?.trim();
  if (!state) {
    throw new Error(
      "Employee has no state on record; professional-tax state cannot be resolved. " +
        "Set the employee's state before locking payroll.",
    );
  }

  return {
    id: emp.id,
    name: emp.employeeId,
    employeeCode: emp.employeeId,
    pan: emp.pan ?? "",
    uan: emp.uan ?? "",
    designation: emp.title ?? "",
    department: emp.department ?? "",
    state,
    // HRA metro leg (50%) applies ONLY to Mumbai/Delhi/Kolkata/Chennai — derive it from the city,
    // not the free `isMetroCity` boolean (which let a Bangalore employee be flagged metro and
    // over-exempted → under-deducted TDS). Unknown city → non-metro (safe, over-deducting).
    isMetro: isMetroCity(emp.city),
    esiMemberAtPeriodStart: esiMemberForCurrentPeriod(emp, month, year),
    joiningDate: join,
    gender: emp.gender ?? null,
    dateOfBirth: emp.dateOfBirth ?? null,
    ptExemptArmedForces: emp.ptExemptArmedForces ?? false,
    ptExemptDisability: emp.ptExemptDisability ?? false,
    ptExemptDependentDisability: emp.ptExemptDependentDisability ?? false,
    basicMonthly,
    daMonthly,
    hraMonthly,
    specialAllowance,
    ltaAnnual,
    regime: emp.taxRegime === "old" ? "OLD" : "NEW",
    // C1 Piece 1: wired from `tax_declarations` (fetched per-employee for the run's FY by the caller).
    // Absent/lapsed ⇒ 0. Stops the old-regime over-deduction; computeTax applies the statutory caps.
    section80C: declarations?.section80C ?? 0,
    section80D: declarations?.section80D ?? 0,
    section80CCD1B: declarations?.section80CCD1B ?? 0,
    section80TTA: declarations?.section80TTA ?? 0,
    section24b: declarations?.section24b ?? 0,
    // hraExemption stays 0: the engine now COMPUTES it from rentPaid + isMetro + the
    // earned basic/HRA (s.10(13A) least-of-three), so this caller-supplied field is only
    // an explicit override. `rentPaid` is the declared annual rent (Form-12BB style); when
    // 0 (no declaration) the exemption is 0, unchanged for non-renters. Old-regime only.
    hraExemption: 0,
    otherExemptions: 0,
    rentPaid: Number(emp.rentPaidAnnual || 0),
    daysInMonth,
    daysWorked,
    lopDays,
    overtime: 0,
    arrears: 0,
    bonus: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    // EPFO Para 26(6): contribute on the UNCAPPED base only where an approval reference exists AND
    // the effective date has been reached. No reference ⇒ the ₹15,000 ceiling applies regardless of
    // what else is recorded (that reference is what makes the uncapped contribution lawful). Reuses
    // the engine's isVoluntaryHigherPF uncap path.
    isVoluntaryHigherPF:
      !!emp.para266ApprovalReference?.trim() &&
      !!emp.para266EffectiveFrom &&
      new Date(emp.para266EffectiveFrom) <= new Date(year, month - 1, 1),
    // Voluntary PF: extra employee rate above 12% (percentage on the employee record → fraction).
    // Employee-only; employer contribution unchanged. Default 0 = no VPF (byte-identical).
    voluntaryPfRate: Number(emp.voluntaryPfRate ?? 0) / 100,
    // PT4: feed the engine the Form 12B prior-employer figures declared on the employee
    // record. The rolling s.192 calc already nets `previousEmployerTDS` against the annual
    // liability; these were hardcoded to 0, so any prior-employer income/TDS was ignored.
    // A 0 default (no 12B on file) is correct and unchanged for existing employees.
    previousEmployerIncome: Number(emp.previousEmployerIncome || 0),
    previousEmployerTDS: Number(emp.previousEmployerTds || 0),
    ytdGross: 0,
    ytdPF: 0,
    ytdTDS: 0,
    ytdNetPay: 0,
    // C2-STRUCT: half-yearly PT (Kerala, Tamil Nadu) — the caller-resolved period income the
    // system holds. Undefined for monthly states and non-collection months; the engine then
    // deducts nothing (non-collection) or, in a collection month with no context, flags it.
    ptPeriodPriorGross: ptHalfYearly?.periodPriorGross,
    ptPeriodMissingMonths: ptHalfYearly?.periodMissingMonths,
    month,
    year,
  };
}

export async function computePayrollRunTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  month: number,
  year: number,
): Promise<PayrollAggregateTotals> {
  const errors: Array<{ employeeId: string; message: string }> = [];
  const fyMonth = calendarToFyMonth(month);

  // ONE resolver, shared with payslip generation (payroll.ts computePayslips). Lock must
  // resolve the salary-structure VERSION in force for the period exactly as the write path
  // does — via resolveSalaryStructureForPeriod — so the headcount and totals it reports are
  // the employees who will ACTUALLY be paid. A direct `innerJoin` on salaryStructureId (the
  // old approach) ignored the effective window: it counted an employee whose structure is not
  // yet effective (effectiveFrom after the period start), who payslip generation then silently
  // dropped — a headcount that shrank at payslip time with no explanation. The status
  // selection (PAYROLL_EMPLOYED_STATUSES) is unchanged and already matches the write path.
  const periodDate = new Date(year, month - 1, 1);
  const employedWithStructure = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.orgId, orgId),
        inArray(employees.status, [...PAYROLL_EMPLOYED_STATUSES]),
        isNotNull(employees.salaryStructureId),
      ),
    );
  const rows: Array<{ emp: typeof employees.$inferSelect; st: typeof salaryStructures.$inferSelect }> = [];
  for (const emp of employedWithStructure) {
    const st = await resolveSalaryStructureForPeriod(db, orgId, emp.salaryStructureId!, periodDate);
    if (st) {
      rows.push({ emp, st });
    } else {
      // Excluded for want of an EFFECTIVE structure — named in the same errors[] channel the
      // structureless flag below uses (by employee code, never a raw UUID). Identical message to
      // the write path so the two de-dup to a single flag on the run.
      errors.push({ employeeId: emp.id, message: structureNotEffectiveError(emp.employeeId, month, year) });
    }
  }

  // The inner join above SILENTLY DROPS an employed employee with no salary structure — they would
  // be excluded from the run entirely (unpaid, no error, invisible). A separate lookup finds them
  // BEFORE the join loses them, so we can flag each by name and continue (loud, not blocking, and
  // no invented default structure). `salaryStructureId` is FK set-null on delete and, when set, is
  // always the origin-version id, so IS NULL is exactly the set the join drops.
  const structurelessEmps = await db
    .select({ id: employees.id, code: employees.employeeId, state: employees.state })
    .from(employees)
    .where(
      and(
        eq(employees.orgId, orgId),
        inArray(employees.status, [...PAYROLL_EMPLOYED_STATUSES]),
        isNull(employees.salaryStructureId),
      ),
    );
  for (const e of structurelessEmps) {
    // Name EVERY field the row is missing — not just the structure. Assigning a salary structure to
    // a row that also lacks a state (the createOnboarding shape) makes it PAYABLE on incomplete
    // data: ₹0 PT from the unresolved state, plus a defaulted (not chosen) tax regime. So the fix
    // for the flag is not "add a structure" — it is "complete the record".
    const missing = ["a salary structure"];
    if (!e.state || String(e.state).trim() === "") missing.push("a state (professional tax cannot be computed without it)");
    errors.push({
      employeeId: e.id,
      message:
        `Employee "${e.code}" is missing ${missing.join(" and ")} and was excluded from this payroll ` +
        `run — they will not be paid. Assigning ONLY a salary structure would make them payable on ` +
        `incomplete data (and their tax regime defaults to "new" unless deliberately set); complete ` +
        `every field before locking.`,
    });
  }

  // Leavers — flag, never silently drop. A resigned/terminated/offboarded employee is not selected
  // for pay (they are not in PAYROLL_EMPLOYED_STATUSES), but if they worked part of THIS period they
  // are owed a final payslip. There is no last-working-day recorded anywhere (employees.endDate is
  // never written; offboarding stores only a status), so final pay cannot be computed and must not
  // be guessed — surface each such employee so an admin settles them by hand (Code on Wages: within
  // two working days of exit). We skip any leaver who already has a payslip for this period (e.g. a
  // re-run). NOTE: with no departure date the run cannot tell a THIS-period leaver from one who left
  // long ago, so this flags every unpaid leaver; populating endDate is the follow-up that both pays
  // them pro-rata and bounds this flag.
  const paidThisPeriod = await db
    .select({ employeeId: payslips.employeeId })
    .from(payslips)
    .where(and(eq(payslips.orgId, orgId), eq(payslips.month, month), eq(payslips.year, year)));
  const paidIds = new Set(paidThisPeriod.map((p: { employeeId: string }) => p.employeeId));
  const leavers = await db
    .select({ id: employees.id, code: employees.employeeId, status: employees.status })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), inArray(employees.status, [...PAYROLL_LEAVER_STATUSES])));
  for (const l of leavers) {
    if (paidIds.has(l.id)) continue;
    errors.push({
      employeeId: l.id,
      message:
        `Employee "${l.code}" has status "${l.status}" and was NOT paid by this run. If they worked ` +
        `part of this period they are owed a final payslip, but no last working day is recorded, so ` +
        `it cannot be computed — record their last working day and settle manually (Code on Wages: ` +
        `within two working days of exit).`,
    });
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let totalPfEmployee = 0;
  let totalPfEmployer = 0;
  let totalEsiEmployee = 0;
  let totalEsiEmployer = 0;
  let totalPt = 0;
  let totalTds = 0;
  let employeeCount = 0;

  // G1: resolve effective-dated statutory ceilings so previews match the run.
  const ceilings = await resolveStatutoryCeilings(db, orgId, new Date(year, month - 1, 1));
  // G8: derive LOP from attendance for the period so previews match the run.
  const lopMap = await computeAttendanceLopForPeriod(db, orgId, month, year);
  // C2-STRUCT: half-yearly PT (Kerala, Tamil Nadu) — the period income each employee's
  // payslip history supports, only in a state's collection month (empty otherwise).
  const ptHalfYearlyMap = await buildPtHalfYearlyContext(db, orgId, rows, month, year);
  // C6: the org's ESI employer establishment number — mandatory on the payslip for any ESI
  // member. Resolved once; a missing value is surfaced per ESI-member employee below.
  const [orgRow] = await db
    .select({ esiEstablishmentNumber: organizations.esiEstablishmentNumber })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const orgEsiEstablishmentNumber = orgRow?.esiEstablishmentNumber?.trim() || null;

  for (const { emp, st } of rows) {
    try {
      const input = buildEmployeePayrollInput(emp, st, month, year, lopMap.get(emp.id), ptHalfYearlyMap.get(emp.id));
      const slip = computeEmployeePayslip(input, fyMonth, ceilings);

      // An unknown/misspelled state (e.g. "Karnatak") resolves to ₹0 PT — the same
      // number a genuinely non-levying state (Delhi) returns. computePT flags the
      // unresolved case so we surface it here rather than file a plausible-wrong ₹0
      // nobody sees. This is a WARNING, not a hard error: the row still computes and is
      // counted in the totals; the flag rides the same errors[] channel a missing state
      // uses, so a payroll admin sees every state problem before locking.
      if (slip.statutoryDeductions.pt.unknownState) {
        errors.push({
          employeeId: emp.id,
          message:
            `Employee state "${emp.state ?? ""}" did not match any known professional-tax ` +
            `state, so PT was computed as ₹0. Verify the spelling before locking payroll.`,
        });
      }

      // C2-STRUCT: a half-yearly PT state (Kerala, Tamil Nadu) reached its collection month but
      // the WHOLE six-month period could not be assessed. PT was NOT deducted — surface it
      // loudly rather than file a plausible-but-too-small amount computed from a partial period
      // (a lower income lands in a lower bracket → silent under-collection, the employer's
      // liability). The two causes need different operator action, so the message names each:
      //   • DATA — earlier months missing from history (a migration gap): supply that payroll.
      //   • TIMING — later months not yet elapsed (collection falls before the period ends):
      //     the period cannot close yet; record this period's PT manually or await the CA's
      //     ruling on the collection month.
      const ptSlip = slip.statutoryDeductions.pt;
      if (ptSlip.incompletePeriod) {
        const missing = ptSlip.incompleteMissingMonths ?? [];
        const unelapsed = ptSlip.incompleteUnelapsedMonths ?? [];
        const causes: string[] = [];
        if (missing.length > 0) {
          causes.push(`earlier payroll is missing (${missing.map(fyMonthName).join(", ")}) — a data/migration gap`);
        }
        if (unelapsed.length > 0) {
          causes.push(
            `later month(s) have not yet elapsed (${unelapsed.map(fyMonthName).join(", ")}) — a timing issue, ` +
              `the collection month falls before the six-month period ends`,
          );
        }
        errors.push({
          employeeId: emp.id,
          message:
            `Half-yearly professional tax for "${emp.state ?? ""}" could not be computed this ` +
            `collection month because the full six-month income is not available: ` +
            `${causes.join("; and ")}. No PT was deducted. ` +
            `Supply the missing months' payroll and/or record this period's PT manually before locking.`,
        });
      }

      // C6: ESI is a member-only levy, and its two identity numbers are MANDATORY payslip
      // fields for a member. They are settable but not required at intake (not every org is
      // ESI-registered), so a member can slip through with a blank number that would print on
      // a statutory payslip. Flag it per-member — naming WHOSE number is missing, because the
      // fix differs: the establishment number is a wizard (org) field, the IP number is on the
      // employee record. A non-member with no IP number is correct, so it is NOT flagged.
      const esi = slip.statutoryDeductions.esi;
      const isEsiMember = esi.memberForPeriod === true || Number(esi.employeeESI || 0) > 0;
      if (isEsiMember) {
        if (!orgEsiEstablishmentNumber) {
          errors.push({
            employeeId: emp.id,
            message:
              `Employee is an ESI member this period, but the ORGANISATION has no ESI establishment ` +
              `number — a mandatory payslip field would print blank. Set it in Organisation Settings → ` +
              `Statutory Identity (org-level fix).`,
          });
        }
        if (!emp.esiIpNumber?.trim()) {
          errors.push({
            employeeId: emp.id,
            message:
              `Employee is an ESI member this period, but has no ESI IP number on their record — a ` +
              `mandatory payslip field would print blank. Set the employee's ESI IP number ` +
              `(employee-record fix).`,
          });
        }
      }

      totalGross += slip.grossEarnings;
      totalDeductions += slip.totalDeductions;
      totalNet += slip.netPay;
      totalPfEmployee += slip.employeePF;
      totalPfEmployer += slip.employerPF;
      totalEsiEmployee += slip.employeeESI;
      totalEsiEmployer += slip.employerESI;
      totalPt += slip.professionalTax;
      totalTds += slip.tds;
      employeeCount += 1;
    } catch (e) {
      errors.push({
        employeeId: emp.id,
        message: e instanceof Error ? e.message : "Computation failed",
      });
    }
  }

  return {
    totalGross,
    totalDeductions,
    totalNet,
    totalPfEmployee,
    totalPfEmployer,
    totalEsiEmployee,
    totalEsiEmployer,
    totalPt,
    totalTds,
    employeeCount,
    errors,
  };
}
