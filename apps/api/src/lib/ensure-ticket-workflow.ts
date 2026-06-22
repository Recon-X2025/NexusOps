import { and, eq, inArray, sql, ticketStatuses, type Db } from "@coheronconnect/db";

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ensures the organisation has the default ITSM status ladder (open → in_progress → pending → resolved → closed).
 * Lives in the API package so `tsx watch` picks up changes without rebuilding `@coheronconnect/db` dist.
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
    if (existing) {
      const [pendingRow] = await tx
        .select({ id: ticketStatuses.id })
        .from(ticketStatuses)
        .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "pending")))
        .limit(1);
      if (!pendingRow) {
        await tx
          .update(ticketStatuses)
          .set({ sortOrder: sql`${ticketStatuses.sortOrder} + 1` })
          .where(
            and(
              eq(ticketStatuses.orgId, orgId),
              inArray(ticketStatuses.category, ["resolved", "closed"]),
              sql`${ticketStatuses.sortOrder} >= 2`,
            ),
          );
        await tx.insert(ticketStatuses).values({
          orgId,
          name: "Pending",
          color: "#94a3b8",
          category: "pending",
          sortOrder: 2,
        });
      }
      return;
    }

    await tx.insert(ticketStatuses).values([
      { orgId, name: "Open", color: "#6366f1", category: "open", sortOrder: 0 },
      { orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
      { orgId, name: "Pending", color: "#94a3b8", category: "pending", sortOrder: 2 },
      { orgId, name: "Resolved", color: "#10b981", category: "resolved", sortOrder: 3 },
      { orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 4 },
    ]);
  });
}
