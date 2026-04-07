import { and, eq, sql, ticketStatuses, type Db } from "@nexusops/db";

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ensures the organisation has the default ITSM status ladder (open → in_progress → resolved → closed).
 * Lives in the API package so `tsx watch` picks up changes without rebuilding `@nexusops/db` dist.
 */
export async function ensureDefaultTicketStatusesForOrg(db: Db, orgId: string): Promise<void> {
  if (!ORG_UUID_RE.test(orgId)) {
    throw new Error("ensureDefaultTicketStatusesForOrg: invalid org id");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(hashtext('${orgId}'))`));
    const [existing] = await tx
      .select({ id: ticketStatuses.id })
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "open")))
      .limit(1);
    if (existing) return;

    await tx.insert(ticketStatuses).values([
      { orgId, name: "Open", color: "#6366f1", category: "open", sortOrder: 0 },
      { orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
      { orgId, name: "Resolved", color: "#10b981", category: "resolved", sortOrder: 2 },
      { orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 3 },
    ]);
  });
}
