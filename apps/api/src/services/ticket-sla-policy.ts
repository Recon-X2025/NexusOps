import { and, desc, eq, slaPolicies } from "@nexusops/db";
import type { Db } from "@nexusops/db";

export type TicketSlaContext = {
  type: string;
  categoryId: string | null;
};

type PolicyConditions = {
  ticketTypes?: string[];
  categoryIds?: string[];
};

function parseConditions(raw: unknown): PolicyConditions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const ticketTypes = Array.isArray(o.ticketTypes)
    ? o.ticketTypes.filter((t): t is string => typeof t === "string")
    : undefined;
  const categoryIds = Array.isArray(o.categoryIds)
    ? o.categoryIds.filter((t): t is string => typeof t === "string")
    : undefined;
  return { ticketTypes, categoryIds };
}

function policyMatches(conditions: PolicyConditions, ctx: TicketSlaContext): boolean {
  if (conditions.ticketTypes?.length) {
    if (!conditions.ticketTypes.includes(ctx.type)) return false;
  }
  if (conditions.categoryIds?.length) {
    if (!ctx.categoryId || !conditions.categoryIds.includes(ctx.categoryId)) return false;
  }
  return true;
}

/**
 * Returns SLA minute overrides from the first matching active `sla_policies` row
 * for the org (newest first). Empty / {} conditions match any ticket.
 * If no policy matches, returns null — caller should fall back to priority SLA minutes.
 */
export async function resolveSlaPolicyMinutes(
  db: Db,
  orgId: string,
  ctx: TicketSlaContext,
): Promise<{ response: number | null; resolve: number | null } | null> {
  const rows = await db
    .select({
      conditions: slaPolicies.conditions,
      responseTimeMinutes: slaPolicies.responseTimeMinutes,
      resolveTimeMinutes: slaPolicies.resolveTimeMinutes,
    })
    .from(slaPolicies)
    .where(and(eq(slaPolicies.orgId, orgId), eq(slaPolicies.isActive, true)))
    .orderBy(desc(slaPolicies.createdAt));

  for (const row of rows) {
    const cond = parseConditions(row.conditions);
    if (policyMatches(cond, ctx)) {
      return {
        response: row.responseTimeMinutes ?? null,
        resolve: row.resolveTimeMinutes ?? null,
      };
    }
  }
  return null;
}
