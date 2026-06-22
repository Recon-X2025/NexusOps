/**
 * Authenticated HTTP download for employee payslip PDF (employee self-service).
 * Proxied from Next.js at `/api/payroll/payslip-pdf/[id]`.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, payslips, employees, users } from "@coheronconnect/db";
import { createContext } from "../middleware/auth";
import { generatePayslipPDF, amountInWords, type PayslipPDFInput } from "../services/payslip-pdf";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function maskBank(acct: string | null | undefined): string {
  if (!acct || acct.length < 4) return "—";
  return `XXXX${acct.slice(-4)}`;
}

function buildPdfInput(args: {
  orgName: string;
  slip: typeof payslips.$inferSelect;
  emp: typeof employees.$inferSelect;
  userName: string;
}): PayslipPDFInput {
  const { orgName, slip, emp, userName } = args;
  const m = slip.month;
  const y = slip.year;
  const daysInMonth = new Date(y, m, 0).getDate();
  const gross = Number(slip.grossEarnings || 0);
  const net = Number(slip.netPay || 0);
  const regime =
    slip.taxRegimeUsed === "old" ? "Old regime" : slip.taxRegimeUsed === "new" ? "New regime" : String(slip.taxRegimeUsed ?? "new");

  return {
    companyName: orgName,
    companyAddress: "",
    tanNumber: "—",
    pfEstablishmentCode: "—",
    employeeName: userName,
    employeeCode: emp.employeeId ?? String(emp.id).slice(0, 8),
    designation: emp.title ?? "—",
    department: emp.department ?? "—",
    pan: emp.pan ?? "—",
    uan: emp.uan ?? "—",
    bankAccount: maskBank(emp.bankAccountNumber ?? undefined),
    month: `${MONTHS[(m - 1 + 12) % 12]!} ${y}`,
    daysInMonth,
    daysWorked: daysInMonth,
    lopDays: 0,
    basicEarned: Number(slip.basic || 0),
    hraEarned: Number(slip.hra || 0),
    specialAllowance: Number(slip.specialAllowance || 0),
    lta: Number(slip.lta || 0),
    conveyance: Number(slip.conveyanceAllowance || 0),
    medical: Number(slip.medicalAllowance || 0),
    overtime: 0,
    arrears: 0,
    bonus: Number(slip.bonus || 0),
    otherEarnings: 0,
    grossEarnings: gross,
    employeePF: Number(slip.pfEmployee || 0),
    employeeESI: 0,
    professionalTax: Number(slip.professionalTax || 0),
    lwf: Number(slip.lwf || 0),
    tds: Number(slip.tds || 0),
    otherDeductions: 0,
    totalDeductions: Number(slip.totalDeductions || 0),
    netPay: net,
    netPayWords: amountInWords(net),
    employerPF: Number(slip.pfEmployer || 0),
    employerESI: 0,
    ytdGross: Number(slip.ytdGross || 0),
    ytdPF: Number(slip.pfEmployee || 0) * 12,
    ytdTDS: Number(slip.ytdTds || 0),
    ytdNetPay: Number(slip.netPay || 0) * 12,
    taxRegime: regime,
    taxableIncome: Math.max(0, Math.round(gross * 12 - 75_000)),
    totalTaxLiability: Number(slip.tds || 0) * 12,
  };
}

export function registerPayrollPayslipPdfRoute(fastify: FastifyInstance): void {
  fastify.get<{ Params: { id: string } }>(
    "/payroll/payslip-pdf/:id",
    async (req, reply) => {
      const ctx = await createContext(req);
      if (!ctx.user?.id || !ctx.orgId) {
        return reply.status(401).send("Unauthorized");
      }

      const id = req.params.id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return reply.status(400).send("Invalid payslip id");
      }

      const { db, org, user } = ctx;
      const orgId = ctx.orgId;
      const userId = ctx.user.id as string;

      const [row] = await db
        .select({ slip: payslips, emp: employees, userRow: users })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(users, eq(employees.userId, users.id))
        .where(and(eq(payslips.id, id), eq(payslips.orgId, orgId), eq(employees.userId, userId)))
        .limit(1);

      if (!row) {
        return reply.status(404).send("Payslip not found");
      }

      const orgName = (org as { name?: string }).name ?? "Organization";
      const userName = (row.userRow.name as string) || "Employee";

      const pdfInput = buildPdfInput({
        orgName,
        slip: row.slip,
        emp: row.emp,
        userName,
      });

      try {
        const buffer = await generatePayslipPDF(pdfInput);
        reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", `inline; filename="payslip-${id}.pdf"`)
          .header("Cache-Control", "private, no-store");
        return reply.send(buffer);
      } catch (e) {
        req.log.error({ err: e }, "payslip_pdf_generation_failed");
        return reply.status(500).send("PDF generation failed");
      }
    },
  );
}
