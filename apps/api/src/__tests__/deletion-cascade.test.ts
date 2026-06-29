/**
 * Deletion-cascade behavior tests — locks in the Phase 2 FK onDelete rules
 * (migrations 0009 + 0010). These assert the *runtime database behavior* of the
 * three FK policies applied across the schema, using the `tickets` module as a
 * representative carrier of all three:
 *
 *   CASCADE   — orgId → organizations, ticketId → tickets
 *   SET NULL  — assigneeId → users, categoryId → ticket_categories
 *   RESTRICT  — statusId → ticket_statuses, requesterId → users
 *
 * Tests operate directly against the DB (not via tRPC) so they verify the SQL
 * constraints themselves rather than application-layer cleanup logic.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedTestOrg, seedUser } from "./helpers";
import {
  organizations,
  users,
  tickets,
  ticketComments,
  ticketStatuses,
  ticketCategories,
  ticketPriorities,
} from "@coheronconnect/db";
import { eq, and, sql } from "@coheronconnect/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});

/**
 * Seed a self-contained org with one status, one category, one priority,
 * a requester user, an assignee user, and a single ticket wired to all of them.
 * Each invocation is isolated (fresh org) so tests can delete freely.
 */
async function seedTicketGraph() {
  const db = testDb();
  const { orgId } = await seedTestOrg();

  const { userId: requesterId } = await seedUser(orgId, { role: "member" });
  const { userId: assigneeId } = await seedUser(orgId, { role: "member" });

  const [status] = await db
    .insert(ticketStatuses)
    .values({ orgId, name: "Open", category: "open", sortOrder: 1 })
    .returning();
  const [category] = await db
    .insert(ticketCategories)
    .values({ orgId, name: "Hardware", sortOrder: 1 })
    .returning();
  const [priority] = await db
    .insert(ticketPriorities)
    .values({ orgId, name: "P1", color: "#ef4444", sortOrder: 1 })
    .returning();

  const [ticket] = await db
    .insert(tickets)
    .values({
      orgId,
      number: `T-${Date.now()}`,
      title: "Cascade test ticket",
      statusId: status!.id,
      categoryId: category!.id,
      priorityId: priority!.id,
      requesterId,
      assigneeId,
      type: "incident",
    })
    .returning();

  return {
    orgId,
    requesterId,
    assigneeId,
    statusId: status!.id,
    categoryId: category!.id,
    priorityId: priority!.id,
    ticketId: ticket!.id,
  };
}

/** Best-effort teardown — remove org and any survivors regardless of FK rules. */
async function dropGraph(orgId: string) {
  const db = testDb();
  // Tickets reference RESTRICT targets (status, requester), so clear tickets first.
  await db.execute(sql`DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE org_id = ${orgId})`);
  await db.execute(sql`DELETE FROM tickets WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM ticket_statuses WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM ticket_categories WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM ticket_priorities WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM users WHERE org_id = ${orgId}`);
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe("Deletion-cascade behavior (Phase 2 FK rules)", () => {
  const orgs: string[] = [];

  afterAll(async () => {
    for (const orgId of orgs) {
      await dropGraph(orgId).catch(() => {
        /* already gone (e.g. org-cascade test) */
      });
    }
  });

  // ── CASCADE ────────────────────────────────────────────────────────────────

  describe("CASCADE", () => {
    it("deleting an organization cascades to its tickets and child rows", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      // org-cascade purges users too; do not register for normal teardown.

      // sanity: ticket exists
      const before = await db.select().from(tickets).where(eq(tickets.id, g.ticketId));
      expect(before.length).toBe(1);

      await db.delete(organizations).where(eq(organizations.id, g.orgId));

      const afterTickets = await db.select().from(tickets).where(eq(tickets.id, g.ticketId));
      expect(afterTickets.length).toBe(0);

      const afterStatuses = await db
        .select()
        .from(ticketStatuses)
        .where(eq(ticketStatuses.orgId, g.orgId));
      expect(afterStatuses.length).toBe(0);

      const afterUsers = await db.select().from(users).where(eq(users.orgId, g.orgId));
      expect(afterUsers.length).toBe(0);
    });

    it("deleting a ticket cascades to its comments", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      const [comment] = await db
        .insert(ticketComments)
        .values({ ticketId: g.ticketId, authorId: g.requesterId, body: "hello" })
        .returning();
      expect(comment).toBeDefined();

      await db.delete(tickets).where(eq(tickets.id, g.ticketId));

      const afterComments = await db
        .select()
        .from(ticketComments)
        .where(eq(ticketComments.id, comment!.id));
      expect(afterComments.length).toBe(0);
    });
  });

  // ── SET NULL ─────────────────────────────────────────────────────────────────

  describe("SET NULL", () => {
    it("deleting an assignee nulls assignee_id but keeps the ticket", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      await db.delete(users).where(eq(users.id, g.assigneeId));

      const [t] = await db.select().from(tickets).where(eq(tickets.id, g.ticketId));
      expect(t).toBeDefined();
      expect(t!.assigneeId).toBeNull();
      // requester (RESTRICT) untouched
      expect(t!.requesterId).toBe(g.requesterId);
    });

    it("deleting a category nulls category_id but keeps the ticket", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      await db.delete(ticketCategories).where(eq(ticketCategories.id, g.categoryId));

      const [t] = await db.select().from(tickets).where(eq(tickets.id, g.ticketId));
      expect(t).toBeDefined();
      expect(t!.categoryId).toBeNull();
    });
  });

  // ── RESTRICT ─────────────────────────────────────────────────────────────────

  describe("RESTRICT", () => {
    it("deleting a status referenced by a ticket is blocked", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      await expect(
        db.delete(ticketStatuses).where(eq(ticketStatuses.id, g.statusId)),
      ).rejects.toBeDefined();

      // status still present
      const rows = await db
        .select()
        .from(ticketStatuses)
        .where(eq(ticketStatuses.id, g.statusId));
      expect(rows.length).toBe(1);
    });

    it("deleting a requester referenced by a ticket is blocked", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      await expect(
        db.delete(users).where(eq(users.id, g.requesterId)),
      ).rejects.toBeDefined();

      const rows = await db.select().from(users).where(eq(users.id, g.requesterId));
      expect(rows.length).toBe(1);
    });

    it("a RESTRICT-protected status becomes deletable once dependents are gone", async () => {
      const db = testDb();
      const g = await seedTicketGraph();
      orgs.push(g.orgId);

      // remove the dependent ticket first
      await db.delete(tickets).where(eq(tickets.id, g.ticketId));

      await db.delete(ticketStatuses).where(eq(ticketStatuses.id, g.statusId));
      const rows = await db
        .select()
        .from(ticketStatuses)
        .where(eq(ticketStatuses.id, g.statusId));
      expect(rows.length).toBe(0);
    });
  });
});
