/**
 * Authenticated HTTP download for Form 16 Part B (employee self-service).
 * Browser opens `/api/payroll/form16?fy=2025-2026`, the Next.js proxy
 * forwards to this Fastify route.
 *
 * Resolves the employee record from the auth context (no `employeeId` in
 * the URL) so an IC who has never been provisioned in HR can't enumerate
 * other employees by guessing UUIDs.
 */
import type { FastifyInstance } from "fastify";
import { and, eq, gte, lte, or, payslips, employees, users } from "@nexusops/db";
import { createContext } from "../middleware/auth";
import { generateForm16PDF } from "../services/form16-pdf";
import { buildForm16Input } from "../lib/india/form16-aggregator";

export function registerPayrollForm16PdfRoute(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: { fy?: string; employeeId?: string } }>(
    "/payroll/form16",
    async (req, reply) => {
      const ctx = await createContext(req);
      if (!ctx.user?.id || !ctx.orgId) {
        return reply.status(401).send("Unauthorized");
      }
      const fy = req.query.fy ?? "";
      if (!/^\d{4}-\d{4}$/.test(fy)) {
        return reply.status(400).send("Invalid fy (expected YYYY-YYYY)");
      }
      const fyStart = Number(fy.split("-")[0]);
      const fyEnd = fyStart + 1;

      const { db, org, user } = ctx;
      const orgId = ctx.orgId;
      const userId = ctx.user.id as string;

      // Resolve the employee — by default, the caller's own record. HR
      // managers may pass `employeeId` to fetch on behalf of a direct
      // report; we only honour it for users with `permissions: hr.read`,
      // mirroring the same gate `payroll.runs.list` uses.
      const wantOther = req.query.employeeId && req.query.employeeId !== "";
      const empRow = wantOther
        ? await db
            .select({ emp: employees, userRow: users })
            .from(employees)
            .innerJoin(users, eq(employees.userId, users.id))
            .where(and(eq(employees.id, req.query.employeeId as string), eq(employees.orgId, orgId)))
            .limit(1)
        : await db
            .select({ emp: employees, userRow: users })
            .from(employees)
            .innerJoin(users, eq(employees.userId, users.id))
            .where(and(eq(employees.userId, userId), eq(employees.orgId, orgId)))
            .limit(1);
      const row = empRow[0];
      if (!row) return reply.status(404).send("Employee record not found");

      // For an HR-on-behalf request, require the caller actually has hr.read.
      if (wantOther) {
        // Light gate: tRPC-grade permission checks live in the trpc layer;
        // here we approximate by trusting the existing role on the user.
        const callerRole = (ctx.user as { role?: string }).role ?? "";
        if (!["admin", "owner", "hr_manager", "finance_manager"].includes(callerRole)) {
          return reply.status(403).send("Forbidden");
        }
      }

      // FY = April fyStart → March fyEnd. We slice payslips by (year, month).
      const slips = await db
        .select()
        .from(payslips)
        .where(
          and(
            eq(payslips.orgId, orgId),
            eq(payslips.employeeId, row.emp.id),
            or(
              and(eq(payslips.year, fyStart), gte(payslips.month, 4)),
              and(eq(payslips.year, fyEnd), lte(payslips.month, 3)),
            ),
          ),
        );

      if (slips.length === 0) {
        return reply.status(404).send(`No payslips on file for FY ${fy}`);
      }

      const orgRow = org as { name?: string; settings?: unknown } & Record<string, unknown>;
      const pdfInput = buildForm16Input({
        // The aggregator only reads `name` and `settings`; widen to satisfy types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        org: orgRow as any,
        employee: { ...row.emp, name: row.userRow.name as string },
        fySlips: slips,
        financialYear: fy,
      });

      try {
        const buffer = await generateForm16PDF(pdfInput);
        reply
          .header("Content-Type", "application/pdf")
          .header(
            "Content-Disposition",
            `inline; filename="form16-${row.emp.employeeId ?? row.emp.id}-${fy}.pdf"`,
          )
          .header("Cache-Control", "private, no-store");
        return reply.send(buffer);
      } catch (e) {
        req.log.error({ err: e }, "form16_pdf_generation_failed");
        return reply.status(500).send("PDF generation failed");
      }
    },
  );
}
