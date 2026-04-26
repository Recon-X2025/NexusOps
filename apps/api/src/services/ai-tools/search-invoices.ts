import { invoices, vendors, eq, and, ilike, or, desc, inArray } from "@nexusops/db";
import type { AgentTool } from "./types";

export const searchInvoicesTool: AgentTool<{
  query?: string;
  status?: string[];
  overdueOnly?: boolean;
  limit?: number;
}> = {
  name: "search_invoices",
  description: "Search vendor / AP / AR invoices. Filter by status (draft, approved, paid, overdue) or vendor name.",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Vendor name / invoice number free-text" },
      status: {
        type: "array",
        items: { type: "string" },
        description: "draft|approved|paid|overdue|cancelled",
      },
      overdueOnly: { type: "boolean" },
      limit: { type: "number" },
    },
  },
  requiredPermission: { module: "financial", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(invoices.orgId, ctx.orgId)];
    if (input.query) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${input.query}%`),
          ilike(vendors.name, `%${input.query}%`),
        ),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.status?.length) conditions.push(inArray(invoices.status, input.status as any));
    if (input.overdueOnly) {
      conditions.push(eq(invoices.status, "overdue"));
    }
    const rows = await ctx.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        vendor: vendors.name,
        amount: invoices.amount,
        tax: invoices.totalTaxAmount,
        status: invoices.status,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(and(...conditions))
      .orderBy(desc(invoices.invoiceDate))
      .limit(limit);
    return { count: rows.length, items: rows };
  },
};
