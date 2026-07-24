import { getDb } from "./packages/db/src/client";
import { organizations, employees, salaryStructures, payrollRuns, payslips } from "./packages/db/src/schema/hr";
import { users } from "./packages/db/src/schema/auth";
import { eq, and } from "drizzle-orm";
import { buildEmployeePayrollInput, computeEmployeePayslip } from "./packages/payroll-math/src/payroll-cycle";

require("dotenv").config({ path: "../../.env" });

async function run() {
  const db = getDb();
  
  // 1. Get default org
  const org = await db.query.organizations.findFirst();
  if (!org) throw new Error("No org found");

  const user = await db.query.users.findFirst();

  // 2. Insert salary structure for 20k gross
  const [st] = await db.insert(salaryStructures).values({
    orgId: org.id,
    structureName: "ESI Test Structure (20k)",
    ctcAnnual: "240000",
    effectiveFrom: new Date(),
  }).returning();

  // 3. Get an existing employee instead of creating one
  const emp = await db.query.employees.findFirst();
  if (!emp) throw new Error("No employee found");

  // 4. Run the payroll-math engine directly
  // Note: we'll simulate the ceilings object as would be retrieved
  const ceilings = {
    pfWageCeiling: 15000,
    esiWageCeiling: 21000,
    ptSlabs: {}, // PT 0 for test
    lwfRates: {}, // LWF 0 for test
  };

  const input: any = {
    id: emp.id,
    name: "ESI Tester",
    employeeCode: "EMP-ESI-002",
    pan: "TESTPAN",
    uan: "TESTUAN",
    designation: "Tester",
    department: "QA",
    state: "KA",
    isMetro: false,
    joiningDate: new Date(),
    basicMonthly: 10000,
    hraMonthly: 5000,
    specialAllowance: 5000,
    ltaAnnual: 0,
    regime: "NEW",
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    rentPaid: 0,
    daysInMonth: 31,
    daysWorked: 31,
    lopDays: 0,
    overtime: 0,
    arrears: 0,
    bonus: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    isVoluntaryHigherPF: false,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
    ytdGross: 0,
    ytdPF: 0,
    ytdTDS: 0,
    ytdNetPay: 0,
    month: 7,
    year: 2026,
  };

  const slip = computeEmployeePayslip(input, 4, ceilings as any);
  
  console.log("=== COMPUTE ENGINE OUTPUT ===");
  console.log(`Gross Earnings: ${slip.grossEarnings}`);
  console.log(`ESI Employee (0.75%): ${slip.employeeESI}`);
  console.log(`ESI Employer (3.25%): ${slip.employerESI}`);

  // 5. Create a fake payroll run to test DB persistence
  const [run] = await db.insert(payrollRuns).values({
    orgId: org.id,
    month: 7,
    year: 2026,
    pipelineStatus: "PAYSLIPS_GENERATED",
    totalGross: slip.grossEarnings.toString(),
    totalEsiEmployee: slip.employeeESI.toString(),
    totalEsiEmployer: slip.employerESI.toString(),
  }).returning();

  // 6. Create the payslip
  const [dbSlip] = await db.insert(payslips).values({
    orgId: org.id,
    employeeId: emp.id,
    payrollRunId: run.id,
    month: 7,
    year: 2026,
    grossEarnings: slip.grossEarnings.toString(),
    esiEmployee: slip.employeeESI.toString(),
    esiEmployer: slip.employerESI.toString(),
  }).returning();

  console.log("\n=== DATABASE PERSISTENCE ===");
  console.log(`Payslip ID: ${dbSlip.id}`);
  console.log(`payslip.esiEmployee: ${dbSlip.esiEmployee}`);
  console.log(`payslip.esiEmployer: ${dbSlip.esiEmployer}`);
  console.log(`payrollRuns.totalEsiEmployee: ${run.totalEsiEmployee}`);
  console.log(`payrollRuns.totalEsiEmployer: ${run.totalEsiEmployer}`);

  process.exit(0);
}
run().catch(console.error);
