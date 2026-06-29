import { okrObjectives, okrKeyResults, eq, and, inArray, desc } from "@coheronconnect/db";
import type { AgentTool } from "./types";

/**
 * Read tool: list OKR objectives (with their key results) for the org.
 * OKRs live in the HR schema, so this is gated behind `hr.read` to match
 * the rest of the people-ops read tools (search_employees, get_payslip).
 */
export const getOkrsTool: AgentTool<{
  status?: string[];
  cycle?: string[];
  year?: number;
  limit?: number;
}> = {
  name: "get_okrs",
  description:
    "List OKR objectives and their key results. Returns objective title, owner, cycle, year, status, overall progress, and each key result's target/current value and status.",
  inputJsonSchema: {
    type: "object",
    properties: {
      status: {
        type: "array",
        items: { type: "string" },
        description: "draft|active|completed|cancelled",
      },
      cycle: {
        type: "array",
        items: { type: "string" },
        description: "q1|q2|q3|q4|annual",
      },
      year: { type: "number", description: "Filter to a specific OKR year" },
      limit: { type: "number" },
    },
  },
  requiredPermission: { module: "hr", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(okrObjectives.orgId, ctx.orgId)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.status?.length) conditions.push(inArray(okrObjectives.status, input.status as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.cycle?.length) conditions.push(inArray(okrObjectives.cycle, input.cycle as any));
    if (input.year !== undefined) conditions.push(eq(okrObjectives.year, input.year));

    const objectives = await ctx.db
      .select({
        id: okrObjectives.id,
        title: okrObjectives.title,
        ownerId: okrObjectives.ownerId,
        cycle: okrObjectives.cycle,
        year: okrObjectives.year,
        status: okrObjectives.status,
        overallProgress: okrObjectives.overallProgress,
      })
      .from(okrObjectives)
      .where(and(...conditions))
      .orderBy(desc(okrObjectives.year), desc(okrObjectives.overallProgress))
      .limit(limit);

    if (objectives.length === 0) return { count: 0, items: [] };

    const keyResults = await ctx.db
      .select({
        id: okrKeyResults.id,
        objectiveId: okrKeyResults.objectiveId,
        title: okrKeyResults.title,
        targetValue: okrKeyResults.targetValue,
        currentValue: okrKeyResults.currentValue,
        unit: okrKeyResults.unit,
        status: okrKeyResults.status,
        dueDate: okrKeyResults.dueDate,
      })
      .from(okrKeyResults)
      .where(
        and(
          eq(okrKeyResults.orgId, ctx.orgId),
          inArray(
            okrKeyResults.objectiveId,
            objectives.map((o) => o.id),
          ),
        ),
      );

    const krByObjective = new Map<string, typeof keyResults>();
    for (const kr of keyResults) {
      const list = krByObjective.get(kr.objectiveId) ?? [];
      list.push(kr);
      krByObjective.set(kr.objectiveId, list);
    }

    const items = objectives.map((o) => ({
      ...o,
      keyResults: (krByObjective.get(o.id) ?? []).map(({ objectiveId: _objectiveId, ...kr }) => kr),
    }));

    return { count: items.length, items };
  },
};
