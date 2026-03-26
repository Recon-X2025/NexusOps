import { eq } from "@nexusops/db";

/**
 * Returns a Drizzle `eq` condition scoping a query to a specific org.
 * Usage: .where(withOrg(tickets, orgId))
 *
 * This helper makes org scoping explicit and searchable — grep for `withOrg`
 * to find every query that is properly scoped.
 */
export function withOrg(table: { orgId: unknown }, orgId: string) {
  return eq(table.orgId as Parameters<typeof eq>[0], orgId);
}
