/**
 * Layer 7 — Row-Level Access: Sensitive data boundaries.
 * Verifies data visibility rules beyond module-level RBAC.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedTestOrg, seedUser, authedCaller, cleanupOrg, loginAndGetToken } from "./helpers";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import {
  tickets, ticketComments, ticketStatuses, ticketPriorities,
  users, notifications, investigations,
} from "@coheronconnect/db";
import { eq, and } from "@coheronconnect/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";

describe("Layer 7: Row-Level Access", () => {
  let orgId: string;
  let adminToken: string;
  let agentToken: string;
  let requesterToken: string;
  let requesterUserId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const db = testDb();
    const { orgId: oid } = await seedTestOrg();
    orgId = oid;
    const pass = "TestPass123!";

    const { userId: aid, user: admin } = await seedUser(orgId, {
      email: `admin-l7@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
      password: pass,
      status: "active",
    });
    adminUserId = aid;

    const { user: agent } = await seedUser(orgId, {
      email: `agent-l7@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "itil",
      password: pass,
      status: "active",
    });

    const { userId: rid, user: req } = await seedUser(orgId, {
      email: `requester-l7@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "requester",
      password: pass,
      status: "active",
    });
    requesterUserId = rid;

    await db.insert(ticketPriorities).values([
      { orgId, name: "P2", color: "#f97316", slaResponseMinutes: 60, slaResolveMinutes: 480, sortOrder: 2 },
    ]);
    await db.insert(ticketStatuses).values([
      { orgId, name: "Open", category: "open", color: "#6366f1", isDefault: true, sortOrder: 1 },
    ]);

    adminToken = await loginAndGetToken(admin.email, pass);
    agentToken = await loginAndGetToken(agent.email, pass);
    requesterToken = await loginAndGetToken(req.email, pass);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  // ── 7.1 Internal Ticket Comments ─────────────────────────────────────────

  describe("7.1 Internal Ticket Comments", () => {
    let ticketId: string;

    beforeAll(async () => {
      const agentCaller = await authedCaller(agentToken);
      const db = testDb();
      const [p] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, orgId)).limit(1);
      const ticket = await agentCaller.tickets.create({
        title: "Internal comment test ticket",
        type: "incident",
        priorityId: p!.id,
      }) as { id: string };
      ticketId = ticket.id;

      // Add a public comment
      await agentCaller.tickets.addComment({ ticketId, body: "This is public", isInternal: false });
      // Add an internal comment
      await agentCaller.tickets.addComment({ ticketId, body: "This is internal note", isInternal: true });
    });

    it("agent sees all comments (public + internal)", async () => {
      const agentCaller = await authedCaller(agentToken);
      const result = await agentCaller.tickets.get({ id: ticketId }) as { comments: { isInternal: boolean }[] };
      expect(result.comments.length).toBeGreaterThanOrEqual(2);
      const hasInternal = result.comments.some((c) => c.isInternal);
      expect(hasInternal).toBe(true);
    });

    it("requester sees ONLY public comments on their ticket", async () => {
      // Create a ticket as requester and add comments as admin
      const requesterCaller = await authedCaller(requesterToken);
      const db = testDb();
      const [p] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, orgId)).limit(1);

      const reqTicket = await requesterCaller.tickets.create({
        title: "Requester visibility test",
        type: "request",
        priorityId: p!.id,
      }) as { id: string };

      const adminCaller = await authedCaller(adminToken);
      await adminCaller.tickets.addComment({ ticketId: reqTicket.id, body: "Public comment", isInternal: false });
      await adminCaller.tickets.addComment({ ticketId: reqTicket.id, body: "Internal only", isInternal: true });

      // Requester fetches ticket
      const result = await requesterCaller.tickets.get({ id: reqTicket.id }) as { comments: { isInternal: boolean; body: string }[] };
      expect(result.comments.every((c) => !c.isInternal)).toBe(true);
      expect(result.comments.some((c) => c.body === "Internal only")).toBe(false);
    });

    it("admin sees all comments including internal", async () => {
      const adminCaller = await authedCaller(adminToken);
      const result = await adminCaller.tickets.get({ id: ticketId }) as { comments: { isInternal: boolean }[] };
      const hasInternal = result.comments.some((c) => c.isInternal);
      expect(hasInternal).toBe(true);
    });
  });

  // ── 7.2 Notification Isolation ───────────────────────────────────────────

  describe("7.2 Notification Isolation", () => {
    it("user only sees their own notifications", async () => {
      const db = testDb();
      // Insert notification for adminUserId
      await db.insert(notifications).values({
        orgId,
        userId: adminUserId,
        title: "Admin notification",
        message: "This is for admin only",
        type: "info",
        isRead: false,
      });

      // Requester fetches notifications — should not see admin's notification
      const requesterCaller = await authedCaller(requesterToken);
      const result = await requesterCaller.notifications.list({ limit: 50 }) as { items: { userId: string }[] };
      expect(result.items.every((n) => n.userId === requesterUserId)).toBe(true);
    });

    it("user cannot mark another user's notification as read (own notifications only)", async () => {
      const db = testDb();
      // Get admin's notification
      const adminNotifs = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, adminUserId)))
        .limit(1);

      if (adminNotifs.length > 0) {
        const requesterCaller = await authedCaller(requesterToken);
        // markRead should only affect the requesting user's notifications
        await expect(
          requesterCaller.notifications.markRead({ id: adminNotifs[0]!.id }),
        ).rejects.toBeDefined(); // Should not be able to mark admin's notif as read
      }
    });
  });

  // ── 7.3 Confidential Investigations ──────────────────────────────────────

  describe("7.3 Confidential Investigations", () => {
    it("confidential investigation structure: only admins and investigators can see it", async () => {
      // Create an investigation as admin (confidential)
      const adminCaller = await authedCaller(adminToken);
      const investigation = await adminCaller.legal.createInvestigation({
        title: "Confidential Fraud Investigation",
        description: "Internal investigation",
        type: "fraud",
        confidential: true,
      }) as { id: string; confidential: boolean };

      expect(investigation.confidential).toBe(true);

      // Admin can see it
      const adminList = await adminCaller.legal.listInvestigations({}) as { items?: { id: string }[]; length?: number };
      const adminItems = Array.isArray(adminList) ? adminList : (adminList as { items: { id: string }[] }).items ?? adminList;
      expect(JSON.stringify(adminItems)).toContain(investigation.id);

      // Requester should NOT see it
      const requesterCaller = await authedCaller(requesterToken);
      await expect(
        requesterCaller.legal.listInvestigations({}),
      ).rejects.toMatchObject({ code: "FORBIDDEN" }); // legal module needs grc.read
    });
  });

  // ── 7.4 Financial Data Gates ─────────────────────────────────────────────

  describe("7.4 Financial Data Gates", () => {
    it("user without financial.read cannot list invoices", async () => {
      const requesterCaller = await authedCaller(requesterToken);
      await expect(
        requesterCaller.financial.listInvoices({}),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("admin CAN list invoices", async () => {
      const adminCaller = await authedCaller(adminToken);
      await expect(
        adminCaller.financial.listInvoices({}),
      ).resolves.toBeDefined();
    });
  });
});
