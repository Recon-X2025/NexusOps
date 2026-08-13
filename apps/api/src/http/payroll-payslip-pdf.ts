/**
 * Authenticated HTTP download for employee payslip PDF (employee self-service).
 * Proxied from Next.js at `/api/payroll/payslip-pdf/[id]`.
 *
 * Assembles the statutory PDF from the SHARED payslip view (`lib/payslip-view.ts`) so it can
 * never drift from the on-screen breakdown (`payroll.ts` mapPayslipRow), which reads the same
 * builder. Tenant identity (TAN / PF code / CIN / ESI est. no. / address) comes from the org +
 * legal-entity rows; amounts and attendance come from the stored payslip row.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, payslips, employees, users, organizations, legalEntities, taxDeclarations } from "@coheronconnect/db";
import { createContext } from "../middleware/auth";
import { generatePayslipPDF } from "../services/payslip-pdf";
import { buildPayslipView, payslipViewToPdfInput } from "../lib/payslip-view";
import { computePayslipTaxFigures } from "../lib/payslip-tax";
import { decryptPan } from "../lib/pan";

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

      const { db } = ctx;
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

      // Tenant identity: org (name/address/TAN/PF/ESI est. no.) + legal entity (CIN).
      const [orgRow] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const [leRow] = await db
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.orgId, orgId))
        .limit(1);

      const userName = (row.userRow.name as string) || "Employee";
      // Decrypt the stored (envelope) PAN for the payslip; legacy plaintext rows read through.
      const decryptedPan = await decryptPan(row.emp.pan);

      // PT2: annual tax figures from the same engine-backed helper the on-screen payslip uses,
      // so the PDF and the screen agree. C1: pass the employee's FY declarations so the annual tax
      // projection matches the actual TDS the run deducted (lapsed ⇒ treated as 0).
      const fyStartYear = row.slip.month >= 4 ? row.slip.year : row.slip.year - 1;
      const [decl] = await db
        .select()
        .from(taxDeclarations)
        .where(and(eq(taxDeclarations.employeeId, row.slip.employeeId), eq(taxDeclarations.fiscalYear, fyStartYear)));
      const declarations =
        decl && decl.provenance !== "lapsed"
          ? {
              section80C: Number(decl.section80C || 0),
              section80D: Number(decl.section80D || 0),
              section80CCD1B: Number(decl.section80CCD1B || 0),
              section80TTA: Number(decl.section80TTA || 0),
              section24b: Number(decl.section24B || 0),
            }
          : undefined;
      // F9: pass the employee context so the printed annual liability is projected on the
      // employee's actual FY span (join → March) with the real HRA exemption — the SAME
      // projection the run used for the deducted TDS, so the two figures on the PDF agree.
      const taxFigures = computePayslipTaxFigures(row.slip, declarations, {
        startDate: row.emp.startDate,
        city: row.emp.city,
        rentPaidAnnual: Number(row.emp.rentPaidAnnual || 0),
        previousEmployerIncome: Number(row.emp.previousEmployerIncome || 0),
        previousEmployerTds: Number(row.emp.previousEmployerTds || 0),
      });

      const view = buildPayslipView({
        slip: row.slip,
        identity: {
          org: {
            name: orgRow?.name,
            city: orgRow?.city,
            state: orgRow?.state,
            tan: orgRow?.tan,
            epfCode: orgRow?.epfCode,
            esiEstablishmentNumber: orgRow?.esiEstablishmentNumber,
          },
          legalEntity: leRow ? { cin: leRow.cin } : null,
          employee: row.emp,
          userName,
          decryptedPan: decryptedPan ?? null,
        },
      });

      const pdfInput = payslipViewToPdfInput(view, taxFigures);

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
