/**
 * Shared payslip view (C6).
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE place that resolves a payslip's amounts, attendance and identity from the stored
 * `payslips` row (+ optional employee/org/legal-entity identity). Both payslip renderers
 * consume it — the statutory PDF (`http/payroll-payslip-pdf.ts`) and the on-screen breakdown
 * (`payroll.ts` `mapPayslipRow`) — so they can no longer drift. Before C6 each renderer
 * independently assembled a view and each stubbed the hard parts (ESI = 0, LOP = 0,
 * TAN/PF/CIN = "—"), which is how a payslip came to contradict its own printed total.
 *
 * The `tenant` sub-object is a self-contained document header. It is deliberately NOT a
 * general `resolveTenantDocumentHeader` service — A17's branded invoice/PO PDFs do not exist
 * yet and are post go-live. It is structured so it can be lifted out cleanly when they do.
 */

import type { payslips } from "@coheronconnect/db";
import { amountInWords, type PayslipPDFInput } from "../services/payslip-pdf";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Masked bank account for display ("XXXX1234"), or "—" when absent/too short. */
export function maskBank(acct: string | null | undefined): string {
  if (!acct || acct.length < 4) return "—";
  return `XXXX${acct.slice(-4)}`;
}

/** Tenant identity for a statutory document header (see the file note on lift-out). */
export interface PayslipTenantIdentity {
  companyName: string;
  /** City + state today. TODO(CA/B17): whether a payslip needs the FULL registered address
   *  or city/state suffices is an open CA question; no address column exists yet. */
  address: string;
  tan: string;
  pfEstablishmentCode: string;
  cin: string;
  esiEstablishmentNumber: string;
}

export interface PayslipView {
  tenant: PayslipTenantIdentity;
  employee: {
    name: string;
    code: string;
    designation: string;
    department: string;
    pan: string;
    uan: string;
    esiIpNumber: string;
    bankAccountMasked: string;
    taxRegimeLabel: string;
  };
  period: {
    month: number;
    year: number;
    label: string; // "April 2026"
    daysInMonth: number;
    daysWorked: number;
    lopDays: number;
  };
  earnings: {
    basic: number;
    /** Dearness Allowance earned. Its own line: statutorily disclosable, part of the PF/ESI
     *  wage-base core (basic+DA), and already inside `gross`. 0 for a basic-alone composition. */
    da: number;
    hra: number;
    specialAllowance: number;
    lta: number;
    conveyance: number;
    medical: number;
    overtime: number;
    arrears: number;
    bonus: number;
    otherEarnings: number;
    gross: number;
  };
  deductions: {
    employeePF: number;
    employeeESI: number;
    professionalTax: number;
    lwf: number;
    tds: number;
    otherDeductions: number;
    total: number;
  };
  employer: { pf: number; esi: number };
  ytd: { gross: number; pf: number; tds: number; net: number };
  netPay: number;
}

/** Pre-fetched identity rows — supplied only when the caller renders identity (the PDF). The
 *  portal breakdown omits it; amounts/attendance resolve from the slip regardless. */
export interface PayslipIdentityInput {
  org: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    tan?: string | null;
    epfCode?: string | null;
    esiEstablishmentNumber?: string | null;
  };
  legalEntity?: { cin?: string | null } | null;
  /** Narrow structural type — the full `employees` row satisfies it; only these are read. */
  employee: {
    id: string;
    employeeId: string | null;
    title: string | null;
    department: string | null;
    pan: string | null;
    uan: string | null;
    esiIpNumber: string | null;
    bankAccountNumber: string | null;
  };
  userName: string;
  /** PAN decrypted by the caller (it is a KMS-envelope column). */
  decryptedPan: string | null;
}

function regimeLabel(v: string | null | undefined): string {
  return v === "old" ? "Old regime" : v === "new" ? "New regime" : String(v ?? "new");
}

/**
 * Resolve a payslip view from the stored row. Amounts and attendance come from the slip and are
 * ALWAYS resolved (the fields that were drifting: ESI, LOP, line items). Identity is resolved
 * only when `identity` is supplied; otherwise the tenant/employee blocks are empty placeholders
 * the caller does not render.
 */
export function buildPayslipView(args: {
  slip: typeof payslips.$inferSelect;
  identity?: PayslipIdentityInput;
}): PayslipView {
  const { slip, identity } = args;
  const m = slip.month;
  const y = slip.year;
  const daysInMonth = new Date(y, m, 0).getDate();

  // Attendance from the stored columns (written by the run from computeAttendanceLopForPeriod).
  // Legacy rows with no attendance (0 paid, 0 LOP) fall back to a full paid month.
  const paidDays = Number(slip.paidDays || 0);
  const lopDays = Number(slip.lopDays || 0);
  const daysWorked = paidDays > 0 || lopDays > 0 ? paidDays : daysInMonth;

  const tenant: PayslipTenantIdentity = identity
    ? {
        companyName: identity.org.name || "Organization",
        address: [identity.org.city, identity.org.state].filter(Boolean).join(", ") || "—",
        tan: identity.org.tan || "—",
        pfEstablishmentCode: identity.org.epfCode || "—",
        cin: identity.legalEntity?.cin || "—",
        esiEstablishmentNumber: identity.org.esiEstablishmentNumber || "—",
      }
    : { companyName: "", address: "", tan: "—", pfEstablishmentCode: "—", cin: "—", esiEstablishmentNumber: "—" };

  const employee = identity
    ? {
        name: identity.userName || "Employee",
        code: identity.employee.employeeId ?? String(identity.employee.id).slice(0, 8),
        designation: identity.employee.title ?? "—",
        department: identity.employee.department ?? "—",
        pan: identity.decryptedPan ?? identity.employee.pan ?? "—",
        uan: identity.employee.uan ?? "—",
        esiIpNumber: identity.employee.esiIpNumber ?? "—",
        bankAccountMasked: maskBank(identity.employee.bankAccountNumber ?? undefined),
        taxRegimeLabel: regimeLabel(slip.taxRegimeUsed),
      }
    : {
        name: "",
        code: "",
        designation: "—",
        department: "—",
        pan: "—",
        uan: "—",
        esiIpNumber: "—",
        bankAccountMasked: "—",
        taxRegimeLabel: regimeLabel(slip.taxRegimeUsed),
      };

  return {
    tenant,
    employee,
    period: {
      month: m,
      year: y,
      label: `${MONTHS[(m - 1 + 12) % 12]!} ${y}`,
      daysInMonth,
      daysWorked,
      lopDays,
    },
    earnings: {
      basic: Number(slip.basic || 0),
      // DA was absent from this view entirely while `payslips.da` was written by the run and
      // included in gross — so for any Basic+DA employer (the composition WAGE-DA/C4 exists to
      // support) the printed earnings lines could not sum to the printed gross, and the
      // employee's DA did not appear on their payslip at all. Same defect class as the
      // hardcoded arrears/ESI zeroes.
      da: Number(slip.da || 0),
      hra: Number(slip.hra || 0),
      specialAllowance: Number(slip.specialAllowance || 0),
      lta: Number(slip.lta || 0),
      conveyance: Number(slip.conveyanceAllowance || 0),
      medical: Number(slip.medicalAllowance || 0),
      // Overtime is still not stored as its own column; kept in the shape for renderers.
      overtime: 0,
      // ARREARS: read the STORED column, not a hardcoded 0. Same defect class as the C6 ESI
      // fix below — gross already includes arrears, so a hardcoded 0 here makes the printed
      // earnings lines fail to sum to the printed gross whenever back-pay was paid.
      arrears: Number(slip.arrears || 0),
      bonus: Number(slip.bonus || 0),
      otherEarnings: 0,
      gross: Number(slip.grossEarnings || 0),
    },
    deductions: {
      employeePF: Number(slip.pfEmployee || 0),
      // The C6 fix: read the STORED ESI, not a hardcoded 0. The printed total already includes
      // it, so an ESI employee's lines must sum to the total.
      employeeESI: Number(slip.esiEmployee || 0),
      professionalTax: Number(slip.professionalTax || 0),
      lwf: Number(slip.lwf || 0),
      tds: Number(slip.tds || 0),
      otherDeductions: 0,
      total: Number(slip.totalDeductions || 0),
    },
    employer: {
      pf: Number(slip.pfEmployer || 0),
      esi: Number(slip.esiEmployer || 0),
    },
    ytd: {
      gross: Number(slip.ytdGross || 0),
      pf: Number(slip.ytdPf || 0),
      tds: Number(slip.ytdTds || 0),
      net: Number(slip.ytdNet || 0),
    },
    netPay: Number(slip.netPay || 0),
  };
}

/** Sum of the itemised employee-deduction lines. Must equal `deductions.total` — the
 *  reconciliation C6 restores (the pre-C6 renderers dropped ESI while the total kept it). */
export function sumItemisedDeductions(view: PayslipView): number {
  const d = view.deductions;
  return d.employeePF + d.employeeESI + d.professionalTax + d.lwf + d.tds + d.otherDeductions;
}

/** Map the shared view to the statutory PDF's input contract. Pure and exported so tests can
 *  assert field values + the deduction reconciliation without rendering PDF bytes. */
export function payslipViewToPdfInput(
  view: PayslipView,
  taxFigures: { taxableIncome: number; totalTaxLiability: number },
): PayslipPDFInput {
  return {
    companyName: view.tenant.companyName,
    companyAddress: view.tenant.address,
    tanNumber: view.tenant.tan,
    pfEstablishmentCode: view.tenant.pfEstablishmentCode,
    cin: view.tenant.cin,
    esiEstablishmentNumber: view.tenant.esiEstablishmentNumber,
    employeeName: view.employee.name,
    employeeCode: view.employee.code,
    designation: view.employee.designation,
    department: view.employee.department,
    pan: view.employee.pan,
    uan: view.employee.uan,
    esiIpNumber: view.employee.esiIpNumber,
    bankAccount: view.employee.bankAccountMasked,
    month: view.period.label,
    daysInMonth: view.period.daysInMonth,
    daysWorked: view.period.daysWorked,
    lopDays: view.period.lopDays,
    basicEarned: view.earnings.basic,
    daEarned: view.earnings.da,
    hraEarned: view.earnings.hra,
    specialAllowance: view.earnings.specialAllowance,
    lta: view.earnings.lta,
    conveyance: view.earnings.conveyance,
    medical: view.earnings.medical,
    overtime: view.earnings.overtime,
    arrears: view.earnings.arrears,
    bonus: view.earnings.bonus,
    otherEarnings: view.earnings.otherEarnings,
    grossEarnings: view.earnings.gross,
    employeePF: view.deductions.employeePF,
    employeeESI: view.deductions.employeeESI,
    professionalTax: view.deductions.professionalTax,
    lwf: view.deductions.lwf,
    tds: view.deductions.tds,
    otherDeductions: view.deductions.otherDeductions,
    totalDeductions: view.deductions.total,
    netPay: view.netPay,
    netPayWords: amountInWords(view.netPay),
    employerPF: view.employer.pf,
    employerESI: view.employer.esi,
    ytdGross: view.ytd.gross,
    ytdPF: view.ytd.pf,
    ytdTDS: view.ytd.tds,
    ytdNetPay: view.ytd.net,
    taxRegime: view.employee.taxRegimeLabel,
    taxableIncome: taxFigures.taxableIncome,
    totalTaxLiability: taxFigures.totalTaxLiability,
  };
}

/** Map the shared view to the on-screen portal breakdown row. The portal shows amounts +
 *  attendance (not tenant identity), so it reads the same drift-prone fields from the view. */
export function payslipViewToPortalRow(
  view: PayslipView,
  extras: { id: string; taxComputation: unknown; pdfUrl: string | null },
) {
  return {
    id: extras.id,
    month: view.period.month,
    year: view.period.year,
    daysInMonth: view.period.daysInMonth,
    daysWorked: view.period.daysWorked,
    lopDays: view.period.lopDays,
    basicEarned: view.earnings.basic,
    daEarned: view.earnings.da,
    hraEarned: view.earnings.hra,
    specialAllowance: view.earnings.specialAllowance,
    lta: view.earnings.lta,
    overtime: view.earnings.overtime,
    arrears: view.earnings.arrears,
    bonus: view.earnings.bonus,
    otherEarnings: view.earnings.otherEarnings,
    grossEarnings: view.earnings.gross,
    employeePF: view.deductions.employeePF,
    employeeESI: view.deductions.employeeESI,
    professionalTax: view.deductions.professionalTax,
    lwf: view.deductions.lwf,
    tds: view.deductions.tds,
    otherDeductions: view.deductions.otherDeductions,
    totalDeductions: view.deductions.total,
    netPay: view.netPay,
    ytdGross: view.ytd.gross,
    ytdPF: view.ytd.pf,
    ytdTDS: view.ytd.tds,
    ytdNetPay: view.ytd.net,
    taxComputation: extras.taxComputation,
    pdfUrl: extras.pdfUrl,
  };
}
