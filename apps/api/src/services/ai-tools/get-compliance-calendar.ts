import { complianceCalendarItems, eq, and, gte, lte, asc } from "@nexusops/db";
import type { AgentTool } from "./types";

export const getComplianceCalendarTool: AgentTool<{
  monthOffset?: number;
  status?: string[];
}> = {
  name: "get_compliance_calendar",
  description:
    "List statutory / MCA / GST / TDS compliance items due in a window. Default = current month. Returns event name, MCA form, due date, days overdue, penalty.",
  inputJsonSchema: {
    type: "object",
    properties: {
      monthOffset: {
        type: "number",
        description: "0 = this month, 1 = next month, -1 = last month, etc. Default 0.",
      },
      status: {
        type: "array",
        items: { type: "string" },
        description: "upcoming|due_today|overdue|filed|waived",
      },
    },
  },
  requiredPermission: { module: "secretarial", action: "read" },
  async handler(ctx, input) {
    const offset = input.monthOffset ?? 0;
    const start = new Date();
    start.setMonth(start.getMonth() + offset);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [
      eq(complianceCalendarItems.orgId, ctx.orgId),
      gte(complianceCalendarItems.dueDate, start),
      lte(complianceCalendarItems.dueDate, end),
    ];
    const rows = await ctx.db
      .select({
        id: complianceCalendarItems.id,
        eventName: complianceCalendarItems.eventName,
        mcaForm: complianceCalendarItems.mcaForm,
        complianceType: complianceCalendarItems.complianceType,
        dueDate: complianceCalendarItems.dueDate,
        status: complianceCalendarItems.status,
        daysOverdue: complianceCalendarItems.daysOverdue,
        totalPenaltyInr: complianceCalendarItems.totalPenaltyInr,
      })
      .from(complianceCalendarItems)
      .where(and(...conditions))
      .orderBy(asc(complianceCalendarItems.dueDate));
    const filtered = input.status?.length
      ? rows.filter((r: { status: string }) => input.status?.includes(r.status))
      : rows;
    return { count: filtered.length, window: { start, end }, items: filtered };
  },
};
