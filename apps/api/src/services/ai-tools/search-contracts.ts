import { contracts, eq, and, ilike, or, desc, inArray, lte, gte, isNotNull } from "@nexusops/db";
import type { AgentTool } from "./types";

export const searchContractsTool: AgentTool<{
  query?: string;
  status?: string[];
  expiringWithinDays?: number;
  limit?: number;
}> = {
  name: "search_contracts",
  description: "Search contracts. Returns counterparty, type, status, end date.",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      status: {
        type: "array",
        items: { type: "string" },
        description: "draft|under_review|legal_review|awaiting_signature|active|expiring_soon|expired|terminated",
      },
      expiringWithinDays: { type: "number", description: "Filter to contracts expiring within N days" },
      limit: { type: "number" },
    },
  },
  requiredPermission: { module: "contracts", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(contracts.orgId, ctx.orgId)];
    if (input.query) {
      conditions.push(
        or(
          ilike(contracts.contractNumber, `%${input.query}%`),
          ilike(contracts.title, `%${input.query}%`),
          ilike(contracts.counterparty, `%${input.query}%`),
        ),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.status?.length) conditions.push(inArray(contracts.status, input.status as any));
    if (input.expiringWithinDays !== undefined) {
      const horizon = new Date(Date.now() + input.expiringWithinDays * 86_400_000);
      conditions.push(isNotNull(contracts.endDate));
      conditions.push(lte(contracts.endDate, horizon));
      conditions.push(gte(contracts.endDate, new Date()));
    }
    const rows = await ctx.db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        counterparty: contracts.counterparty,
        type: contracts.type,
        status: contracts.status,
        endDate: contracts.endDate,
      })
      .from(contracts)
      .where(and(...conditions))
      .orderBy(desc(contracts.endDate))
      .limit(limit);
    return { count: rows.length, items: rows };
  },
};
