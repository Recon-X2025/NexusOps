import { payslips, employees, eq, and, desc } from "@coheronconnect/db";
import type { AgentTool } from "./types";

export const getPayslipTool: AgentTool<{
  employeeCode?: string;
  month?: number;
  year?: number;
}> = {
  name: "get_payslip",
  description:
    "Fetch the most recent payslip for an employee. Defaults to the calling user (self-service). Returns gross, deductions, net pay, YTD figures.",
  inputJsonSchema: {
    type: "object",
    properties: {
      employeeCode: { type: "string", description: "Omit to fetch own payslip (self-service)" },
      month: { type: "number", description: "1-12" },
      year: { type: "number", description: "e.g. 2026" },
    },
  },
  requiredPermission: { module: "hr", action: "read" },
  async handler(ctx, input) {
    let empRow: { id: string } | undefined;
    if (input.employeeCode) {
      const [e] = await ctx.db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(eq(employees.orgId, ctx.orgId), eq(employees.employeeId, input.employeeCode)),
        )
        .limit(1);
      empRow = e;
    } else {
      const [e] = await ctx.db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.orgId, ctx.orgId), eq(employees.userId, ctx.userId)))
        .limit(1);
      empRow = e;
    }
    if (!empRow) return { found: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [
      eq(payslips.orgId, ctx.orgId),
      eq(payslips.employeeId, empRow.id),
    ];
    if (input.month) conditions.push(eq(payslips.month, input.month));
    if (input.year) conditions.push(eq(payslips.year, input.year));
    const [slip] = await ctx.db
      .select()
      .from(payslips)
      .where(and(...conditions))
      .orderBy(desc(payslips.year), desc(payslips.month))
      .limit(1);
    if (!slip) return { found: false };
    return { found: true, payslip: slip };
  },
};
