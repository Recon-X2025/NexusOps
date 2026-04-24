import {
  tickets,
  ticketStatuses,
  ticketPriorities,
  catalogRequests,
  catalogItems,
  eq,
  and,
  asc,
} from "@nexusops/db";
import { getNextSeq } from "./auto-number";
import { ensureDefaultTicketStatusesForOrg } from "./ensure-ticket-workflow";
import { resolveAssignment } from "../services/assignment";

function generateTicketNumber(orgSlug: string, seq: number): string {
  const prefix = orgSlug.toUpperCase().replace(/-/g, "").slice(0, 4);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Creates (or returns) the fulfilment ticket for a catalog request.
 * Idempotent via `tickets.idempotency_key` = `catalog-request:{requestId}`.
 */
export async function createCatalogFulfillmentTicket(
  db: any,
  args: { orgId: string; orgSlug: string; catalogRequestId: string },
): Promise<string> {
  const { orgId, orgSlug, catalogRequestId } = args;
  const idempotencyKey = `catalog-request:${catalogRequestId}`;

  const [existing] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.orgId, orgId), eq(tickets.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existing) {
    await db
      .update(catalogRequests)
      .set({ fulfillmentTicketId: existing.id, updatedAt: new Date() })
      .where(and(eq(catalogRequests.id, catalogRequestId), eq(catalogRequests.orgId, orgId)));
    return existing.id;
  }

  const rows = await db
    .select({
      req: catalogRequests,
      item: catalogItems,
    })
    .from(catalogRequests)
    .innerJoin(catalogItems, eq(catalogRequests.itemId, catalogItems.id))
    .where(and(eq(catalogRequests.id, catalogRequestId), eq(catalogRequests.orgId, orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Catalog request not found");
  }
  if (row.req.fulfillmentTicketId) {
    return row.req.fulfillmentTicketId;
  }

  await ensureDefaultTicketStatusesForOrg(db, orgId);
  const [defaultStatus] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "open")))
    .limit(1);
  if (!defaultStatus) {
    throw new Error("No open ticket status for organisation");
  }

  const priRows = await db
    .select({ id: ticketPriorities.id })
    .from(ticketPriorities)
    .where(eq(ticketPriorities.orgId, orgId))
    .orderBy(asc(ticketPriorities.sortOrder))
    .limit(1);
  const priorityId = priRows[0]?.id ?? null;

  const seq = await getNextSeq(db, orgId, "TKT");
  const number = generateTicketNumber(orgSlug, seq);

  let assigneeId: string | undefined;
  let teamId: string | undefined;
  try {
    const assignment = await resolveAssignment(db, orgId, {
      entityType: "ticket",
      matchValue: row.item.category ?? null,
    });
    if (assignment) {
      assigneeId = assignment.assigneeId ?? undefined;
      teamId = assignment.teamId ?? undefined;
    }
  } catch {
    // Non-fatal — same pattern as tickets.create
  }

  const formBlock =
    row.req.formData && typeof row.req.formData === "object"
      ? JSON.stringify(row.req.formData, null, 2)
      : "{}";
  const description = [
    `Service catalog fulfilment for **${row.item.name}**.`,
    row.item.fulfillmentGroup ? `Fulfillment group: ${row.item.fulfillmentGroup}` : null,
    "",
    "Requester-submitted fields:",
    "```json",
    formBlock,
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  let ticket: { id: string } | undefined;
  try {
    const inserted = await db
      .insert(tickets)
      .values({
        orgId,
        number,
        title: `Fulfil: ${row.item.name}`,
        description,
        statusId: defaultStatus.id,
        type: "request",
        impact: "medium",
        urgency: "medium",
        priorityId,
        requesterId: row.req.requesterId,
        assigneeId: assigneeId ?? null,
        teamId: teamId ?? null,
        tags: ["catalog", `catalog-req:${catalogRequestId}`],
        customFields: {
          catalogRequestId,
          catalogItemId: row.item.id,
          fulfillmentGroup: row.item.fulfillmentGroup ?? undefined,
        },
        idempotencyKey,
      })
      .returning({ id: tickets.id });
    ticket = inserted[0];
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "23505") {
      const [winner] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (winner) {
        await db
          .update(catalogRequests)
          .set({ fulfillmentTicketId: winner.id, updatedAt: new Date() })
          .where(and(eq(catalogRequests.id, catalogRequestId), eq(catalogRequests.orgId, orgId)));
        return winner.id;
      }
    }
    throw e;
  }

  if (!ticket) {
    throw new Error("Failed to create fulfilment ticket");
  }

  await db
    .update(catalogRequests)
    .set({ fulfillmentTicketId: ticket.id, updatedAt: new Date() })
    .where(and(eq(catalogRequests.id, catalogRequestId), eq(catalogRequests.orgId, orgId)));

  return ticket.id;
}
