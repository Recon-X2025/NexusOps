import { changeRequests, eq, and, ilike, or, desc, inArray } from "@coheronconnect/db";
import type { AgentTool } from "./types";

/**
 * Read tool: search ITIL change requests. Gated behind `changes.read`.
 */
export const searchChangesTool: AgentTool<{
  query?: string;
  status?: string[];
  type?: string[];
  risk?: string[];
  limit?: number;
}> = {
  name: "search_changes",
  description:
    "Search change requests. Returns number, title, type, risk, status, scheduled window. Useful for CAB review, change calendars, and risk questions.",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Matches change number or title" },
      status: {
        type: "array",
        items: { type: "string" },
        description:
          "draft|submitted|cab_review|approved|scheduled|implementing|completed|failed|cancelled",
      },
      type: {
        type: "array",
        items: { type: "string" },
        description: "normal|standard|emergency|expedited",
      },
      risk: {
        type: "array",
        items: { type: "string" },
        description: "low|medium|high|critical",
      },
      limit: { type: "number" },
    },
  },
  requiredPermission: { module: "changes", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(changeRequests.orgId, ctx.orgId)];
    if (input.query) {
      conditions.push(
        or(
          ilike(changeRequests.number, `%${input.query}%`),
          ilike(changeRequests.title, `%${input.query}%`),
        ),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.status?.length) conditions.push(inArray(changeRequests.status, input.status as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.type?.length) conditions.push(inArray(changeRequests.type, input.type as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.risk?.length) conditions.push(inArray(changeRequests.risk, input.risk as any));

    const rows = await ctx.db
      .select({
        id: changeRequests.id,
        number: changeRequests.number,
        title: changeRequests.title,
        type: changeRequests.type,
        risk: changeRequests.risk,
        status: changeRequests.status,
        scheduledStart: changeRequests.scheduledStart,
        scheduledEnd: changeRequests.scheduledEnd,
      })
      .from(changeRequests)
      .where(and(...conditions))
      .orderBy(desc(changeRequests.createdAt))
      .limit(limit);

    return { count: rows.length, items: rows };
  },
};
