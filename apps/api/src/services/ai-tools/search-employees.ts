import { employees, users, eq, and, ilike, or, desc } from "@coheronconnect/db";
import type { AgentTool } from "./types";

export const searchEmployeesTool: AgentTool<{ query: string; limit?: number }> = {
  name: "search_employees",
  description:
    "Find employees by name, employee id, email, or designation. Returns code, name, designation, manager id, status.",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  requiredPermission: { module: "hr", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    const rows = await ctx.db
      .select({
        id: employees.id,
        employeeId: employees.employeeId,
        name: users.name,
        email: users.email,
        designation: employees.title,
        department: employees.department,
        managerId: employees.managerId,
        status: employees.status,
      })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(
        and(
          eq(employees.orgId, ctx.orgId),
          or(
            ilike(users.name, `%${input.query}%`),
            ilike(users.email, `%${input.query}%`),
            ilike(employees.employeeId, `%${input.query}%`),
            ilike(employees.title, `%${input.query}%`),
          ),
        ),
      )
      .orderBy(desc(employees.updatedAt))
      .limit(limit);
    return { count: rows.length, items: rows };
  },
};
