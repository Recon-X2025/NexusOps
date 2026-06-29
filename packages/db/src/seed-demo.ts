/**
 * seed-demo.ts — 100-employee / 24-month demo company generator
 * ─────────────────────────────────────────────────────────────
 * Populates the existing `coheron-demo` org with a realistic mid-size company:
 *  • 100 employees (with backing user accounts, org chart, salary structures)
 *  • 24 monthly payroll runs + payslips (invariant-correct: netPay = max(0, gross−deductions))
 *  • Accounting: chart of accounts + 24 months of BALANCED payroll journals (debit==credit)
 *  • GST invoices (intra-state CGST+SGST / inter-state IGST) via the canonical GST math
 *  • TDS challan records driven by payslip TDS
 *  • Procurement: vendors, POs, GRNs, invoices — 3-way matched within tolerance
 *
 * Design constraints (see CLAUDE.md):
 *  • Runs against the existing demo org (slug `coheron-demo`); run seed.ts first.
 *  • Fully IDEMPOTENT — every block is count-guarded; safe to re-run.
 *  • DETERMINISTIC — faker.seed() fixed; re-runs produce identical data.
 *  • Money-path invariants enforced in-code; a balanced-journal assertion guards
 *    every accounting insert so we never write an unbalanced entry.
 *  • All rows are orgId-scoped (CASCADE) so the demo company can be dropped cleanly.
 *
 * Usage:  pnpm --filter @coheronconnect/db db:seed:demo
 *         (or: DATABASE_URL=... tsx src/seed-demo.ts)
 */

import { getDb } from "./client";
import {
  organizations,
  users,
  employees,
  salaryStructures,
  payrollRuns,
  payslips,
  attendanceRecords,
  leaveRequests,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  gstinRegistry,
  vendors,
  purchaseOrders,
  poLineItems,
  goodsReceiptNotes,
  grnLineItems,
  invoices,
  assetTypes,
  assets,
  softwareLicenses,
  licenseAssignments,
  ciItems,
  eq,
  and,
  count,
} from "./schema";
import {
  computeEmployeePayslip,
  computeGST,
  type EmployeePayrollInput,
  type GSTRate,
} from "./lib/india-payroll-math";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";

// Deterministic — distinct seed from seed.ts (12345) / seed-modules.ts (54321)
faker.seed(99001);

const DEMO_ORG_SLUG = "coheron-demo";
const EMPLOYEE_COUNT = 100;
const MONTHS = 24;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (n: number) => n.toFixed(2);

function cntFrom(rows: { cnt: unknown }[]): number {
  return Number(rows[0]?.cnt ?? 0);
}

/** Calendar month (1-12) → Indian FY month (April=1 … March=12). */
function fyMonthOf(calMonth: number): number {
  return calMonth >= 4 ? calMonth - 3 : calMonth + 9;
}

/** Generate the list of {month, year} for the last `MONTHS` months ending last month. */
function monthSeries(): Array<{ month: number; year: number }> {
  const out: Array<{ month: number; year: number }> = [];
  const now = new Date();
  // Start from the month before the current month, go back MONTHS-1 further.
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed current; m (0-index) = previous month in 1-index terms is `now.getMonth()`
  for (let i = 0; i < MONTHS; i++) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    out.push({ month: m + 1, year: y });
  }
  return out.reverse(); // chronological order (oldest first) for YTD carry-forward
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/** Indian states used for PT/HRA variety. Keys must match india-payroll-math PT/LWF maps. */
const STATES: Array<{ name: string; code: string; metro: boolean }> = [
  { name: "Maharashtra", code: "MH", metro: true },   // Mumbai
  { name: "Karnataka", code: "KA", metro: false },
  { name: "Tamil Nadu", code: "TN", metro: true },    // Chennai
  { name: "Telangana", code: "TG", metro: false },
  { name: "West Bengal", code: "WB", metro: true },   // Kolkata
  { name: "Delhi", code: "DL", metro: true },
  { name: "Gujarat", code: "GJ", metro: false },
];

const DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Finance",
  "Human Resources",
  "Operations",
  "Customer Success",
  "Legal",
  "IT",
  "Product",
];

const TITLES: Record<string, string[]> = {
  Engineering: ["Software Engineer", "Senior Software Engineer", "Engineering Manager", "Staff Engineer"],
  Sales: ["Sales Executive", "Account Manager", "Sales Manager", "VP Sales"],
  Marketing: ["Marketing Associate", "Content Lead", "Marketing Manager"],
  Finance: ["Accountant", "Financial Analyst", "Finance Manager", "Controller"],
  "Human Resources": ["HR Associate", "HR Business Partner", "HR Manager"],
  Operations: ["Operations Associate", "Operations Manager"],
  "Customer Success": ["CSM", "Senior CSM", "CS Manager"],
  Legal: ["Legal Associate", "Legal Counsel"],
  IT: ["IT Support", "Systems Administrator", "IT Manager"],
  Product: ["Product Analyst", "Product Manager", "Senior PM"],
};

/** CTC bands (annual ₹) by seniority weight. */
function pickCTC(): number {
  const band = faker.helpers.weightedArrayElement([
    { weight: 40, value: [400_000, 900_000] },
    { weight: 35, value: [900_000, 1_800_000] },
    { weight: 20, value: [1_800_000, 3_500_000] },
    { weight: 5, value: [3_500_000, 7_000_000] },
  ]);
  return Math.round(faker.number.int({ min: band[0]!, max: band[1]! }) / 1000) * 1000;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function seedDemo() {
  const db = getDb();
  console.log("🏢 Seeding 100-employee / 24-month demo company into coheron-demo...\n");

  // ── Resolve org ────────────────────────────────────────────────────────────
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (!org) {
    console.error("❌ Org 'coheron-demo' not found. Run `pnpm db:seed` first.");
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`✅ Org: ${org.name} (${orgId})`);

  const months = monthSeries();
  const firstMonth = months[0]!;
  const companyStart = new Date(firstMonth.year, firstMonth.month - 1, 1);

  const passwordHash = await bcrypt.hash("demo1234!", 12);

  // ════════════════════════════════════════════════════════════════════════
  // 1. EMPLOYEES (+ backing users, salary structures, org chart)
  // ════════════════════════════════════════════════════════════════════════
  const empCnt = cntFrom(
    await db.select({ cnt: count() }).from(employees).where(eq(employees.orgId, orgId)),
  );

  type SeededEmp = {
    employeeRowId: string;
    userId: string;
    code: string;
    name: string;
    department: string;
    title: string;
    state: string;
    isMetro: boolean;
    regime: "OLD" | "NEW";
    ctcAnnual: number;
    basicMonthly: number;
    hraMonthly: number;
    specialMonthly: number;
    ltaAnnual: number;
    pan: string;
    uan: string;
    joiningDate: Date;
  };

  let seededEmps: SeededEmp[] = [];

  if (empCnt >= EMPLOYEE_COUNT) {
    console.log(`ℹ️  Employees already exist (${empCnt}), reusing for downstream seeds`);
    // Rebuild the in-memory list from DB so payroll/accounting can run idempotently.
    const rows = await db.select().from(employees).where(eq(employees.orgId, orgId));
    const structs = await db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.orgId, orgId));
    const structById = new Map(structs.map((s) => [s.id, s]));
    seededEmps = rows.slice(0, EMPLOYEE_COUNT).map((r) => {
      const s = r.salaryStructureId ? structById.get(r.salaryStructureId) : undefined;
      const ctc = s ? Number(s.ctcAnnual) : 1_200_000;
      const basicMonthly = Math.round((ctc * 0.4) / 12);
      const hraMonthly = Math.round(basicMonthly * 0.5);
      const ltaAnnual = s ? Number(s.ltaAnnual) : 0;
      const specialMonthly = Math.max(
        0,
        Math.round(ctc / 12 - basicMonthly - hraMonthly - ltaAnnual / 12),
      );
      return {
        employeeRowId: r.id,
        userId: r.userId,
        code: r.employeeId,
        name: r.title ?? "Employee",
        department: r.department ?? "Operations",
        title: r.title ?? "Associate",
        state: r.state ?? "Maharashtra",
        isMetro: r.isMetroCity,
        regime: r.taxRegime === "old" ? "OLD" : "NEW",
        ctcAnnual: ctc,
        basicMonthly,
        hraMonthly,
        specialMonthly,
        ltaAnnual,
        pan: r.pan ?? "AAAAA0000A",
        uan: r.uan ?? "100000000000",
        joiningDate: r.startDate ?? companyStart,
      };
    });
  } else {
    console.log(`→ Generating ${EMPLOYEE_COUNT} employees...`);

    // Build user rows first (employees.userId is NOT NULL + unique).
    const userRows = Array.from({ length: EMPLOYEE_COUNT }).map((_, i) => {
      const name = faker.person.fullName();
      const email = `demo.emp${String(i + 1).padStart(3, "0")}@coheron-demo.example`;
      return { name, email };
    });
    const insertedUsers = await db
      .insert(users)
      .values(
        userRows.map((u) => ({
          orgId,
          email: u.email,
          name: u.name,
          passwordHash,
          role: "member" as const,
          status: "active" as const,
        })),
      )
      .onConflictDoNothing()
      .returning();

    // onConflictDoNothing may return fewer rows on re-run; re-fetch by email to be safe.
    const userByEmail = new Map(insertedUsers.map((u) => [u.email, u]));
    const missingEmails = userRows.map((u) => u.email).filter((e) => !userByEmail.has(e));
    if (missingEmails.length > 0) {
      const existing = await db.select().from(users).where(eq(users.orgId, orgId));
      for (const u of existing) userByEmail.set(u.email, u);
    }

    // Salary structures (one per employee for fidelity).
    const empPlans = userRows.map((u, i) => {
      const dept = faker.helpers.arrayElement(DEPARTMENTS);
      const title = faker.helpers.arrayElement(TITLES[dept] ?? ["Associate"]);
      const st = faker.helpers.arrayElement(STATES);
      const ctc = pickCTC();
      const basicMonthly = Math.round((ctc * 0.4) / 12);
      const hraMonthly = Math.round(basicMonthly * 0.5);
      const ltaAnnual = Math.round(basicMonthly * 0.6);
      const specialMonthly = Math.max(
        0,
        Math.round(ctc / 12 - basicMonthly - hraMonthly - ltaAnnual / 12),
      );
      // Stagger joining dates across the 24-month window (most before start, some mid-life).
      const joinOffsetMonths = faker.number.int({ min: -6, max: MONTHS - 3 });
      const joiningDate = new Date(companyStart);
      joiningDate.setMonth(joiningDate.getMonth() + joinOffsetMonths);
      return {
        email: u.email,
        name: u.name,
        dept,
        title,
        st,
        ctc,
        basicMonthly,
        hraMonthly,
        specialMonthly,
        ltaAnnual,
        regime: faker.helpers.weightedArrayElement([
          { weight: 70, value: "new" as const },
          { weight: 30, value: "old" as const },
        ]),
        joiningDate,
      };
    });

    const structRows = await db
      .insert(salaryStructures)
      .values(
        empPlans.map((p) => ({
          orgId,
          structureName: `${p.name} — ${p.title}`,
          ctcAnnual: money(p.ctc),
          basicPercent: "40",
          hraPercentOfBasic: "50",
          ltaAnnual: money(p.ltaAnnual),
          bonusAnnual: "0",
          effectiveFrom: p.joiningDate < companyStart ? companyStart : p.joiningDate,
        })),
      )
      .returning();

    // Employees
    const empRows = await db
      .insert(employees)
      .values(
        empPlans.map((p, i) => {
          const user = userByEmail.get(p.email)!;
          return {
            orgId,
            userId: user.id,
            employeeId: `EMP-${String(i + 1).padStart(4, "0")}`,
            department: p.dept,
            title: p.title,
            location: p.st.name,
            city: p.st.name,
            state: p.st.name,
            isMetroCity: p.st.metro,
            pan: faker.string.alpha({ length: 5, casing: "upper" }) +
              faker.string.numeric(4) +
              faker.string.alpha({ length: 1, casing: "upper" }),
            uan: faker.string.numeric(12),
            bankAccountNumber: faker.finance.accountNumber(),
            bankIfsc: `HDFC0${faker.string.numeric(6)}`,
            bankName: "HDFC Bank",
            taxRegime: p.regime,
            salaryStructureId: structRows[i]!.id,
            startDate: p.joiningDate,
            status: "active" as const,
          };
        }),
      )
      .returning();

    // Assign managers (~10 managers; rest report to them).
    const managerIds = empRows.slice(0, 10).map((e) => e.id);
    for (let i = 10; i < empRows.length; i++) {
      const mgr = faker.helpers.arrayElement(managerIds);
      await db.update(employees).set({ managerId: mgr }).where(eq(employees.id, empRows[i]!.id));
    }

    seededEmps = empPlans.map((p, i) => {
      const user = userByEmail.get(p.email)!;
      return {
        employeeRowId: empRows[i]!.id,
        userId: user.id,
        code: empRows[i]!.employeeId,
        name: p.name,
        department: p.dept,
        title: p.title,
        state: p.st.name,
        isMetro: p.st.metro,
        regime: p.regime === "old" ? "OLD" : "NEW",
        ctcAnnual: p.ctc,
        basicMonthly: p.basicMonthly,
        hraMonthly: p.hraMonthly,
        specialMonthly: p.specialMonthly,
        ltaAnnual: p.ltaAnnual,
        pan: empRows[i]!.pan ?? "AAAAA0000A",
        uan: empRows[i]!.uan ?? "100000000000",
        joiningDate: p.joiningDate,
      };
    });

    console.log(`✅ Employees: ${empRows.length} (+ users, salary structures, org chart)`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. CHART OF ACCOUNTS (minimal payroll/GST/AP set, idempotent)
  // ════════════════════════════════════════════════════════════════════════
  const coaSpec: Array<{
    code: string;
    name: string;
    type: "asset" | "liability" | "equity" | "income" | "expense";
  }> = [
    { code: "1100", name: "Bank — Current Account", type: "asset" },
    { code: "1200", name: "Input GST Receivable", type: "asset" },
    { code: "2100", name: "Accounts Payable", type: "liability" },
    { code: "2110", name: "Salaries Payable", type: "liability" },
    { code: "2120", name: "PF Payable", type: "liability" },
    { code: "2130", name: "Professional Tax Payable", type: "liability" },
    { code: "2140", name: "TDS Payable", type: "liability" },
    { code: "2150", name: "Output GST Payable", type: "liability" },
    { code: "2160", name: "ESI Payable", type: "liability" },
    { code: "2170", name: "Labour Welfare Fund Payable", type: "liability" },
    { code: "5100", name: "Salary & Wages Expense", type: "expense" },
    { code: "5110", name: "Employer Statutory Contributions", type: "expense" },
    { code: "5200", name: "Purchases / COGS", type: "expense" },
    { code: "4100", name: "Sales Revenue", type: "income" },
  ];

  const coaByCode = new Map<string, string>();
  for (const a of coaSpec) {
    const [existing] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, a.code)));
    if (existing) {
      coaByCode.set(a.code, existing.id);
    } else {
      const [ins] = await db
        .insert(chartOfAccounts)
        .values({ orgId, code: a.code, name: a.name, type: a.type, isSystem: true })
        .returning();
      coaByCode.set(a.code, ins!.id);
    }
  }
  console.log(`✅ Chart of accounts: ${coaByCode.size} accounts`);

  // ════════════════════════════════════════════════════════════════════════
  // 3. PAYROLL — 24 monthly runs + payslips (invariant-correct)
  // ════════════════════════════════════════════════════════════════════════
  const existingRuns = cntFrom(
    await db.select({ cnt: count() }).from(payrollRuns).where(eq(payrollRuns.orgId, orgId)),
  );

  // Track YTD per employee across the FY (resets each April).
  const ytd = new Map<string, { gross: number; pf: number; tds: number; net: number; fy: string }>();

  if (existingRuns >= MONTHS) {
    console.log(`ℹ️  Payroll runs already exist (${existingRuns}), skipping payroll`);
  } else {
    let totalPayslips = 0;
    for (const { month, year } of months) {
      // Idempotency: skip if this run already exists.
      const [runExists] = await db
        .select()
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.orgId, orgId),
            eq(payrollRuns.month, month),
            eq(payrollRuns.year, year),
          ),
        );
      if (runExists) continue;

      const fyMonth = fyMonthOf(month);
      const fyLabel =
        month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
      const dim = daysInMonth(month, year);

      // Only employees who had joined by this month are paid.
      const active = seededEmps.filter((e) => {
        const j = new Date(e.joiningDate);
        return j.getFullYear() < year || (j.getFullYear() === year && j.getMonth() + 1 <= month);
      });

      const [run] = await db
        .insert(payrollRuns)
        .values({
          orgId,
          month,
          year,
          status: "paid" as const,
          pipelineStatus: "COMPLETED",
          paidAt: new Date(year, month - 1, 28),
          approvedAt: new Date(year, month - 1, 26),
        })
        .returning();

      const slipRows: (typeof payslips.$inferInsert)[] = [];
      let runGross = 0,
        runDed = 0,
        runNet = 0,
        runPfEmp = 0,
        runPfEr = 0,
        runPt = 0,
        runTds = 0,
        runEsiEmp = 0,
        runEsiEr = 0,
        runLwfEmp = 0,
        runLwfEr = 0;

      for (const e of active) {
        const key = e.code;
        const prior = ytd.get(key);
        const ytdState =
          prior && prior.fy === fyLabel
            ? prior
            : { gross: 0, pf: 0, tds: 0, net: 0, fy: fyLabel };

        // Occasional LOP for realism (deterministic via faker).
        const lopDays = faker.helpers.weightedArrayElement([
          { weight: 90, value: 0 },
          { weight: 8, value: 1 },
          { weight: 2, value: 2 },
        ]);
        const daysWorked = dim - lopDays;

        const input: EmployeePayrollInput = {
          id: e.employeeRowId,
          name: e.name,
          employeeCode: e.code,
          pan: e.pan,
          uan: e.uan,
          designation: e.title,
          department: e.department,
          state: e.state,
          isMetro: e.isMetro,
          joiningDate: e.joiningDate,
          basicMonthly: e.basicMonthly,
          hraMonthly: e.hraMonthly,
          specialAllowance: e.specialMonthly,
          ltaAnnual: e.ltaAnnual,
          regime: e.regime,
          section80C: e.regime === "OLD" ? 150_000 : 0,
          section80D: e.regime === "OLD" ? 25_000 : 0,
          section80CCD1B: 0,
          section80TTA: 0,
          section24b: 0,
          hraExemption: e.regime === "OLD" ? Math.round(e.hraMonthly * 12 * 0.5) : 0,
          otherExemptions: 0,
          rentPaid: e.regime === "OLD" ? Math.round(e.hraMonthly * 1.1) : 0,
          daysInMonth: dim,
          daysWorked,
          lopDays,
          overtime: 0,
          arrears: 0,
          bonus: 0,
          otherEarnings: 0,
          otherDeductions: 0,
          isVoluntaryHigherPF: false,
          previousEmployerIncome: 0,
          previousEmployerTDS: 0,
          ytdGross: ytdState.gross,
          ytdPF: ytdState.pf,
          ytdTDS: ytdState.tds,
          ytdNetPay: ytdState.net,
          month,
          year,
        };

        // Compute the payslip with the real FY month so PF/ESI/PT/LWF reflect the
        // correct month (LWF is only deducted in FY months 3 & 9).
        const ps = computeEmployeePayslip(input, fyMonth);

        // ── Stable monthly TDS ──
        // computeTax() spreads the *remaining* annual tax over the *remaining*
        // FY months, so a single-month projection late in the FY concentrates the
        // whole year's tax into one month (net would floor at 0). For a realistic
        // monthly payslip we instead spread the full-year tax evenly: call the
        // engine with fyMonth=1 (monthsInFY=12) and take that per-month figure.
        const tdsBasis = computeEmployeePayslip(input, 1);
        const monthlyTDS = tdsBasis.tds;

        // Rebuild deductions/net from the real statutory components + stable TDS,
        // so netPay never floors for realistic salaries and the books stay clean.
        const employeeStatutory =
          ps.employeePF + ps.employeeESI + ps.professionalTax + ps.lwf;
        const totalDeductions = employeeStatutory + monthlyTDS;
        const netPay = Math.max(0, ps.grossEarnings - totalDeductions);

        // ── INVARIANT: netPay = max(0, gross − deductions) ──
        const expectedNet = Math.max(0, ps.grossEarnings - totalDeductions);
        if (netPay !== expectedNet) {
          throw new Error(
            `Payroll invariant violated for ${e.code} ${month}/${year}: netPay ${netPay} ≠ ${expectedNet}`,
          );
        }

        const newYtdGross = ytdState.gross + ps.grossEarnings;
        const newYtdPF = ytdState.pf + ps.employeePF;
        const newYtdTDS = ytdState.tds + monthlyTDS;
        const newYtdNet = ytdState.net + netPay;

        slipRows.push({
          orgId,
          employeeId: e.employeeRowId,
          payrollRunId: run!.id,
          month,
          year,
          basic: money(ps.basicEarned),
          hra: money(ps.hraEarned),
          specialAllowance: money(ps.specialAllowance),
          lta: money(ps.lta),
          bonus: money(ps.bonus),
          grossEarnings: money(ps.grossEarnings),
          pfEmployee: money(ps.employeePF),
          pfEmployer: money(ps.employerPF),
          professionalTax: money(ps.professionalTax),
          lwf: money(ps.lwf),
          tds: money(monthlyTDS),
          totalDeductions: money(totalDeductions),
          netPay: money(netPay),
          ytdGross: money(newYtdGross),
          ytdTds: money(newYtdTDS),
          taxRegimeUsed: e.regime === "OLD" ? ("old" as const) : ("new" as const),
        });

        ytd.set(key, {
          gross: newYtdGross,
          pf: newYtdPF,
          tds: newYtdTDS,
          net: newYtdNet,
          fy: fyLabel,
        });

        runGross += ps.grossEarnings;
        runDed += totalDeductions;
        runNet += netPay;
        runPfEmp += ps.employeePF;
        runPfEr += ps.employerPF;
        runPt += ps.professionalTax;
        runTds += monthlyTDS;
        runEsiEmp += ps.employeeESI;
        runEsiEr += ps.employerESI;
        runLwfEmp += ps.lwf;
        runLwfEr += ps.employerLWF;
      }

      if (slipRows.length > 0) {
        await db.insert(payslips).values(slipRows);
        totalPayslips += slipRows.length;
      }

      // Update run aggregates.
      await db
        .update(payrollRuns)
        .set({
          totalGross: money(runGross),
          totalDeductions: money(runDed),
          totalNet: money(runNet),
          totalPfEmployee: money(runPfEmp),
          totalPfEmployer: money(runPfEr),
          totalPt: money(runPt),
          totalTds: money(runTds),
        })
        .where(eq(payrollRuns.id, run!.id));

      // ── Payroll journal entry (BALANCED) ──
      // Credit lines mirror the ACTUAL payslip totals so the entry always balances
      // no matter which statutory deductions (ESI/LWF) are nonzero this month.
      //
      //   Dr Salary & Wages Expense ........... gross
      //   Dr Employer Statutory Contributions . employer PF + employer ESI + employer LWF
      //   Cr Salaries Payable ................. net pay
      //   Cr PF Payable ....................... employee PF + employer PF
      //   Cr ESI Payable ...................... employee ESI + employer ESI
      //   Cr PT Payable ....................... professional tax
      //   Cr LWF Payable ...................... employee LWF + employer LWF
      //   Cr TDS Payable ...................... TDS
      //
      // Balance identity (net = gross − empPF − empESI − PT − empLWF − TDS):
      //   gross + erPF + erESI + erLWF
      //     = net + (empPF+erPF) + (empESI+erESI) + PT + (empLWF+erLWF) + TDS
      await postBalancedJournal(db, {
        orgId,
        number: `JE-PAY-${year}-${String(month).padStart(2, "0")}`,
        date: new Date(year, month - 1, 28),
        type: "payroll",
        description: `Payroll ${month}/${year}`,
        financialYear: fyLabel,
        period: month,
        lines: [
          { code: "5100", debit: runGross },
          { code: "5110", debit: runPfEr + runEsiEr + runLwfEr },
          { code: "2110", credit: runNet },
          { code: "2120", credit: runPfEmp + runPfEr },
          { code: "2160", credit: runEsiEmp + runEsiEr },
          { code: "2130", credit: runPt },
          { code: "2170", credit: runLwfEmp + runLwfEr },
          { code: "2140", credit: runTds },
        ],
        coaByCode,
      });
    }
    console.log(`✅ Payroll: ${MONTHS} runs, ${totalPayslips} payslips (+ balanced journals)`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. GST + PROCUREMENT (vendors, POs, GRNs, 3-way matched invoices)
  // ════════════════════════════════════════════════════════════════════════
  const COMPANY_STATE = "Maharashtra"; // buyer state for GST determination
  const GST_RATES: GSTRate[] = [5, 12, 18, 18, 18, 28];

  // GSTIN registry (primary).
  const gstinCnt = cntFrom(
    await db.select({ cnt: count() }).from(gstinRegistry).where(eq(gstinRegistry.orgId, orgId)),
  );
  if (gstinCnt === 0) {
    await db.insert(gstinRegistry).values({
      orgId,
      gstin: "27AABCC1234D1Z5",
      legalName: org.name,
      stateCode: "27",
      stateName: COMPANY_STATE,
      isPrimary: true,
      invoiceSeriesPrefix: "INV",
    });
  }

  // Vendors.
  const vendorCnt = cntFrom(
    await db.select({ cnt: count() }).from(vendors).where(eq(vendors.orgId, orgId)),
  );
  let vendorRows: (typeof vendors.$inferSelect)[] = [];
  if (vendorCnt < 15) {
    const toCreate = 15 - vendorCnt;
    const vrows = Array.from({ length: toCreate }).map(() => {
      const st = faker.helpers.arrayElement(STATES);
      return {
        orgId,
        name: faker.company.name() + " " + faker.helpers.arrayElement(["Pvt Ltd", "LLP", "Industries", "Enterprises"]),
        vendorType: "goods_supplier",
        gstin: faker.string.numeric(2) + faker.string.alpha({ length: 5, casing: "upper" }) + faker.string.numeric(4) + faker.string.alpha({ length: 1, casing: "upper" }) + "1Z" + faker.string.numeric(1),
        state: st.name,
        contactEmail: faker.internet.email().toLowerCase(),
        contactPhone: faker.phone.number(),
        contactPersonName: faker.person.fullName(),
        paymentTerms: faker.helpers.arrayElement(["Net 30", "Net 45", "Net 60"]),
        status: "active",
      };
    });
    await db.insert(vendors).values(vrows);
  }
  vendorRows = await db.select().from(vendors).where(eq(vendors.orgId, orgId));

  // POs + GRNs + invoices (3-way matched). One per month for ~18 months.
  const poCnt = cntFrom(
    await db.select({ cnt: count() }).from(purchaseOrders).where(eq(purchaseOrders.orgId, orgId)),
  );
  if (poCnt < MONTHS) {
    let made = 0;
    for (const { month, year } of months) {
      const poNumber = `PO-${year}-${String(month).padStart(2, "0")}`;
      const [exists] = await db
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.poNumber, poNumber)));
      if (exists) continue;

      const vendor = faker.helpers.arrayElement(vendorRows);
      const supplierState = vendor.state ?? "Maharashtra";

      // Build 1-3 line items with GST.
      const lineCount = faker.number.int({ min: 1, max: 3 });
      let poTaxable = 0,
        poGst = 0;
      const lineSpecs = Array.from({ length: lineCount }).map(() => {
        const qty = faker.number.int({ min: 1, max: 50 });
        const unitPrice = faker.number.int({ min: 500, max: 25_000 });
        const taxable = qty * unitPrice;
        const rate = faker.helpers.arrayElement(GST_RATES);
        const gst = computeGST({
          taxableValue: taxable,
          gstRate: rate,
          supplierState,
          buyerState: COMPANY_STATE,
        });
        poTaxable += taxable;
        poGst += gst.totalTaxAmount;
        return { qty, unitPrice, taxable, rate, gst, description: faker.commerce.productName() };
      });

      const poTotal = poTaxable + poGst;
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          orgId,
          poNumber,
          vendorId: vendor.id,
          vendorGstin: vendor.gstin,
          taxableValue: money(poTaxable),
          gstAmount: money(poGst),
          totalAmount: money(poTotal),
          status: "invoiced",
          expectedDelivery: new Date(year, month - 1, 15),
        })
        .returning();

      const poLines = await db
        .insert(poLineItems)
        .values(
          lineSpecs.map((l) => ({
            poId: po!.id,
            description: l.description,
            quantity: l.qty,
            unitPrice: money(l.unitPrice),
            taxableValue: money(l.taxable),
            gstRate: money(l.rate),
            cgstAmount: money(l.gst.cgstAmount),
            sgstAmount: money(l.gst.sgstAmount),
            igstAmount: money(l.gst.igstAmount),
            receivedQuantity: l.qty,
            acceptedQuantity: l.qty,
          })),
        )
        .returning();

      // GRN — full receipt (so 3-way match passes).
      const [grn] = await db
        .insert(goodsReceiptNotes)
        .values({
          orgId,
          grnNumber: `GRN-${year}-${String(month).padStart(2, "0")}`,
          poId: po!.id,
          status: "accepted",
          grnDate: new Date(year, month - 1, 16),
        })
        .returning();

      await db.insert(grnLineItems).values(
        poLines.map((pl, idx) => ({
          grnId: grn!.id,
          poLineItemId: pl.id,
          orderedQuantity: lineSpecs[idx]!.qty,
          receivedQuantity: lineSpecs[idx]!.qty,
          acceptedQuantity: lineSpecs[idx]!.qty,
        })),
      );

      // Invoice — matches PO totals exactly (3-way match within any tolerance).
      const totalCgst = lineSpecs.reduce((s, l) => s + l.gst.cgstAmount, 0);
      const totalSgst = lineSpecs.reduce((s, l) => s + l.gst.sgstAmount, 0);
      const totalIgst = lineSpecs.reduce((s, l) => s + l.gst.igstAmount, 0);
      const isInterstate = lineSpecs.some((l) => l.gst.isInterstate);

      await db.insert(invoices).values({
        orgId,
        invoiceNumber: `BILL-${year}-${String(month).padStart(2, "0")}`,
        invoiceFlow: "payable",
        vendorId: vendor.id,
        poId: po!.id,
        grnId: grn!.id,
        supplierGstin: vendor.gstin,
        buyerGstin: "27AABCC1234D1Z5",
        placeOfSupply: COMPANY_STATE,
        isInterstate,
        taxableValue: money(poTaxable),
        cgstAmount: money(totalCgst),
        sgstAmount: money(totalSgst),
        igstAmount: money(totalIgst),
        totalTaxAmount: money(poGst),
        amount: money(poTotal),
        status: "matched",
        matchingStatus: "matched",
        invoiceDate: new Date(year, month - 1, 18),
        dueDate: new Date(year, month - 1 + 1, 18),
      });

      // ── AP journal for the invoice (BALANCED) ──
      // Dr Purchases (taxable) + Dr Input GST (gst) ; Cr Accounts Payable (total)
      await postBalancedJournal(db, {
        orgId,
        number: `JE-AP-${year}-${String(month).padStart(2, "0")}`,
        date: new Date(year, month - 1, 18),
        type: "invoice",
        description: `Vendor invoice ${vendor.name} ${month}/${year}`,
        financialYear: month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`,
        period: month,
        lines: [
          { code: "5200", debit: poTaxable },
          { code: "1200", debit: poGst },
          { code: "2100", credit: poTotal },
        ],
        coaByCode,
      });

      made++;
    }
    console.log(`✅ Procurement: ${made} POs + GRNs + 3-way-matched invoices (+ balanced AP journals)`);
  } else {
    console.log(`ℹ️  Purchase orders already exist (${poCnt}), skipping procurement`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. ATTENDANCE + LEAVE (representative, current-month sample)
  // ════════════════════════════════════════════════════════════════════════
  const attCnt = cntFrom(
    await db.select({ cnt: count() }).from(attendanceRecords).where(eq(attendanceRecords.orgId, orgId)),
  );
  if (attCnt === 0) {
    const last = months[months.length - 1]!;
    const dim = daysInMonth(last.month, last.year);
    const attRows: (typeof attendanceRecords.$inferInsert)[] = [];
    for (const e of seededEmps.slice(0, 40)) {
      for (let day = 1; day <= Math.min(dim, 20); day++) {
        const date = new Date(last.year, last.month - 1, day);
        const dow = date.getDay();
        attRows.push({
          orgId,
          employeeId: e.employeeRowId,
          date,
          status:
            dow === 0 || dow === 6
              ? ("weekend" as const)
              : faker.helpers.weightedArrayElement([
                  { weight: 92, value: "present" as const },
                  { weight: 5, value: "on_leave" as const },
                  { weight: 3, value: "late" as const },
                ]),
        });
      }
    }
    if (attRows.length > 0) await db.insert(attendanceRecords).values(attRows);

    const leaveRows = seededEmps.slice(0, 30).map((e) => {
      const start = new Date(last.year, last.month - 1, faker.number.int({ min: 1, max: 20 }));
      const days = faker.number.int({ min: 1, max: 4 });
      const end = new Date(start);
      end.setDate(end.getDate() + days - 1);
      return {
        orgId,
        employeeId: e.employeeRowId,
        type: faker.helpers.arrayElement(["vacation", "sick", "other"] as const),
        startDate: start,
        endDate: end,
        days: days.toFixed(1),
        status: faker.helpers.arrayElement(["approved", "pending"] as const),
        reason: faker.lorem.sentence(),
      };
    });
    await db.insert(leaveRequests).values(leaveRows);
    console.log(`✅ Attendance: ${attRows.length} records, Leave: ${leaveRows.length} requests`);
  } else {
    console.log(`ℹ️  Attendance already exists (${attCnt}), skipping`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. IT ASSETS — hardware (assigned to employees), CMDB, software licenses
  // ════════════════════════════════════════════════════════════════════════
  const assetCnt = cntFrom(
    await db.select({ cnt: count() }).from(assets).where(eq(assets.orgId, orgId)),
  );
  if (assetCnt === 0) {
    // ── Asset types ──
    const typeSpecs = [
      { name: "Laptop", icon: "laptop" },
      { name: "Monitor", icon: "monitor" },
      { name: "Mobile Phone", icon: "smartphone" },
      { name: "Server", icon: "server" },
    ];
    const typeRows = await db
      .insert(assetTypes)
      .values(typeSpecs.map((t) => ({ orgId, name: t.name, icon: t.icon })))
      .returning();
    const typeByName = new Map(typeRows.map((t) => [t.name, t.id]));

    // ── Hardware assets ──
    // Every employee gets a laptop; ~60% also get a monitor; ~40% a phone.
    // Plus a handful of shared servers (unassigned, in a datacenter).
    const LAPTOP_MODELS = ["MacBook Pro 14\"", "MacBook Air M3", "Dell Latitude 7440", "ThinkPad X1 Carbon"];
    const MONITOR_MODELS = ["Dell U2723QE", "LG 27UP850", "Samsung ViewFinity"];
    const PHONE_MODELS = ["iPhone 15", "Samsung Galaxy S24", "Google Pixel 8"];
    const assetRows: (typeof assets.$inferInsert)[] = [];
    let tag = 1;
    const nextTag = () => `AST-${String(tag++).padStart(4, "0")}`;

    for (const e of seededEmps) {
      const purchase = new Date(e.joiningDate);
      // Laptop (deployed to the employee's backing user).
      assetRows.push({
        orgId,
        assetTag: nextTag(),
        name: faker.helpers.arrayElement(LAPTOP_MODELS),
        typeId: typeByName.get("Laptop")!,
        status: "deployed" as const,
        ownerId: e.userId,
        location: e.state,
        purchaseDate: purchase,
        purchaseCost: money(faker.number.int({ min: 80_000, max: 250_000 })),
        warrantyExpiry: new Date(purchase.getFullYear() + 3, purchase.getMonth(), purchase.getDate()),
        vendor: faker.helpers.arrayElement(["Apple India", "Dell India", "Lenovo India"]),
      });
      if (faker.datatype.boolean({ probability: 0.6 })) {
        assetRows.push({
          orgId,
          assetTag: nextTag(),
          name: faker.helpers.arrayElement(MONITOR_MODELS),
          typeId: typeByName.get("Monitor")!,
          status: "deployed" as const,
          ownerId: e.userId,
          location: e.state,
          purchaseDate: purchase,
          purchaseCost: money(faker.number.int({ min: 15_000, max: 60_000 })),
          vendor: faker.helpers.arrayElement(["Dell India", "LG India", "Samsung India"]),
        });
      }
      if (faker.datatype.boolean({ probability: 0.4 })) {
        assetRows.push({
          orgId,
          assetTag: nextTag(),
          name: faker.helpers.arrayElement(PHONE_MODELS),
          typeId: typeByName.get("Mobile Phone")!,
          status: "deployed" as const,
          ownerId: e.userId,
          location: e.state,
          purchaseDate: purchase,
          purchaseCost: money(faker.number.int({ min: 30_000, max: 150_000 })),
          vendor: faker.helpers.arrayElement(["Apple India", "Samsung India", "Reliance Digital"]),
        });
      }
    }
    // A few unassigned spare laptops (in stock).
    for (let i = 0; i < 8; i++) {
      assetRows.push({
        orgId,
        assetTag: nextTag(),
        name: faker.helpers.arrayElement(LAPTOP_MODELS),
        typeId: typeByName.get("Laptop")!,
        status: "in_stock" as const,
        location: "IT Store — HQ",
        purchaseDate: companyStart,
        purchaseCost: money(faker.number.int({ min: 80_000, max: 200_000 })),
        vendor: "Dell India",
      });
    }
    // Servers (deployed, datacenter).
    const hwServerNames = ["app-prod-01", "app-prod-02", "db-primary", "db-replica", "build-runner"];
    for (const sn of hwServerNames) {
      assetRows.push({
        orgId,
        assetTag: nextTag(),
        name: sn,
        typeId: typeByName.get("Server")!,
        status: "deployed" as const,
        location: "AWS ap-south-1",
        purchaseDate: companyStart,
        purchaseCost: money(faker.number.int({ min: 200_000, max: 800_000 })),
        vendor: "Amazon Web Services",
      });
    }
    await db.insert(assets).values(assetRows);
    console.log(`✅ Assets: ${assetRows.length} hardware items`);
  } else {
    console.log(`ℹ️  Hardware assets already exist (${assetCnt}), skipping`);
  }

  // ── CMDB CI items (independently guarded so a partial run self-heals) ──
  const serverNames = ["app-prod-01", "app-prod-02", "db-primary", "db-replica", "build-runner"];
  const ciCnt = cntFrom(
    await db.select({ cnt: count() }).from(ciItems).where(eq(ciItems.orgId, orgId)),
  );
  if (ciCnt === 0) {
    const ciRows: (typeof ciItems.$inferInsert)[] = [
      ...serverNames.map((sn) => ({
        orgId,
        name: sn,
        externalKey: `ci-${sn}`,
        ciType: (sn.startsWith("db") ? "database" : "server") as "database" | "server",
        status: "operational" as const,
        environment: "production",
      })),
      { orgId, name: "CoheronConnect API", externalKey: "ci-api", ciType: "application" as const, status: "operational" as const, environment: "production" },
      { orgId, name: "CoheronConnect Web", externalKey: "ci-web", ciType: "application" as const, status: "operational" as const, environment: "production" },
      { orgId, name: "PostgreSQL Cluster", externalKey: "ci-pg", ciType: "database" as const, status: "operational" as const, environment: "production" },
    ];
    await db.insert(ciItems).values(ciRows);
    console.log(`✅ CMDB: ${ciRows.length} CI items`);
  } else {
    console.log(`ℹ️  CMDB items already exist (${ciCnt}), skipping`);
  }

  // ── Software licenses + seat assignments (independently guarded) ──
  const licCnt = cntFrom(
    await db.select({ cnt: count() }).from(softwareLicenses).where(eq(softwareLicenses.orgId, orgId)),
  );
  if (licCnt === 0) {
    const licenseSpecs: Array<{
      name: string;
      vendor: string;
      type: "per_seat" | "device" | "site" | "enterprise";
      acquisition: "perpetual" | "subscription" | "trial" | "open_source" | "freeware";
      seats: number;
      cost: number;
    }> = [
      { name: "Microsoft 365 Business", vendor: "Microsoft", type: "per_seat", acquisition: "subscription", seats: 100, cost: 900_000 },
      { name: "Slack Pro", vendor: "Salesforce", type: "per_seat", acquisition: "subscription", seats: 100, cost: 720_000 },
      { name: "GitHub Enterprise", vendor: "GitHub", type: "per_seat", acquisition: "subscription", seats: 40, cost: 960_000 },
      { name: "Adobe Creative Cloud", vendor: "Adobe", type: "per_seat", acquisition: "subscription", seats: 10, cost: 600_000 },
      { name: "Zoom Business", vendor: "Zoom", type: "per_seat", acquisition: "subscription", seats: 50, cost: 360_000 },
      { name: "Figma Organization", vendor: "Figma", type: "per_seat", acquisition: "subscription", seats: 20, cost: 300_000 },
    ];
    const licenseRows = await db
      .insert(softwareLicenses)
      .values(
        licenseSpecs.map((l) => ({
          orgId,
          name: l.name,
          vendor: l.vendor,
          type: l.type,
          acquisitionType: l.acquisition,
          totalSeats: String(l.seats),
          cost: money(l.cost),
          purchaseDate: companyStart,
          expiryDate: new Date(companyStart.getFullYear() + 3, companyStart.getMonth(), companyStart.getDate()),
          isActive: true,
        })),
      )
      .returning();

    // Assign seats to the first N employees per license (deterministic).
    const assignRows: (typeof licenseAssignments.$inferInsert)[] = [];
    for (let li = 0; li < licenseRows.length; li++) {
      const seats = Math.min(licenseSpecs[li]!.seats, seededEmps.length);
      for (let s = 0; s < seats; s++) {
        assignRows.push({
          licenseId: licenseRows[li]!.id,
          userId: seededEmps[s]!.userId,
        });
      }
    }
    if (assignRows.length > 0) await db.insert(licenseAssignments).values(assignRows);
    console.log(
      `✅ Licenses: ${licenseRows.length} software licenses (${assignRows.length} seat assignments)`,
    );
  } else {
    console.log(`ℹ️  Software licenses already exist (${licCnt}), skipping`);
  }

  console.log("\n🎉 Demo company seed complete.");
}

// ─── Balanced-journal helper (enforces debit==credit invariant) ────────────────

async function postBalancedJournal(
  db: ReturnType<typeof getDb>,
  args: {
    orgId: string;
    number: string;
    date: Date;
    type: "manual" | "invoice" | "payment" | "payroll" | "depreciation" | "closing" | "opening" | "reversal" | "gst_liability" | "tds_deduction";
    description: string;
    financialYear: string;
    period: number;
    lines: Array<{ code: string; debit?: number; credit?: number }>;
    coaByCode: Map<string, string>;
  },
): Promise<void> {
  // Idempotency: skip if a JE with this number already exists.
  const [exists] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, args.orgId), eq(journalEntries.number, args.number)));
  if (exists) return;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totalDebit = round2(args.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = round2(args.lines.reduce((s, l) => s + (l.credit ?? 0), 0));

  // ── INVARIANT: debits must equal credits (canonical tolerance 0.001) ──
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Unbalanced journal ${args.number}: debit ${totalDebit} ≠ credit ${totalCredit}`,
    );
  }

  const [je] = await db
    .insert(journalEntries)
    .values({
      orgId: args.orgId,
      number: args.number,
      date: args.date,
      type: args.type,
      status: "posted",
      description: args.description,
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
      postedAt: args.date,
      financialYear: args.financialYear,
      period: args.period,
    })
    .returning();

  await db.insert(journalEntryLines).values(
    args.lines.map((l, i) => {
      const accountId = args.coaByCode.get(l.code);
      if (!accountId) throw new Error(`COA code ${l.code} not found for journal ${args.number}`);
      return {
        journalEntryId: je!.id,
        orgId: args.orgId,
        accountId,
        debitAmount: money(round2(l.debit ?? 0)),
        creditAmount: money(round2(l.credit ?? 0)),
        sortOrder: i,
      };
    }),
  );
}

// ─── CLI entrypoint ────────────────────────────────────────────────────────────

seedDemo()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ seed-demo failed:", err);
    process.exit(1);
  });
