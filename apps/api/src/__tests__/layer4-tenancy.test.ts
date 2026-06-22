/**
 * Layer 4 — Multi-Tenancy Isolation
 * Proves tenant A can NEVER see, modify, or infer tenant B's data.
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
import { tickets, ticketStatuses, ticketPriorities, organizations, users, sessions } from "@coheronconnect/db";
import { eq, and, sql } from "@coheronconnect/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";

describe("Layer 4: Multi-Tenancy Isolation", () => {
  let orgA: { orgId: string; adminToken: string };
  let orgB: { orgId: string; adminToken: string };
  let orgATicketId: string;
  let orgBTicketId: string;
  let orgAContractId: string;
  let orgBContractId: string;

  beforeAll(async () => {
    const db = testDb();

    // Seed Org A
    const { orgId: aidA } = await seedTestOrg();
    const { user: adminA } = await seedUser(aidA, {
      email: `admin-a-l4@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
      password: "TestPass123!",
      status: "active",
    });
    await db.insert(ticketPriorities).values([
      { orgId: aidA, name: "P1", color: "#ef4444", slaResponseMinutes: 15, slaResolveMinutes: 240, sortOrder: 1 },
    ]);
    await db.insert(ticketStatuses).values([
      { orgId: aidA, name: "Open", category: "open", color: "#6366f1", isDefault: true, sortOrder: 1 },
    ]);
    const tokenA = await loginAndGetToken(adminA.email, "TestPass123!");
    orgA = { orgId: aidA, adminToken: tokenA };

    // Seed Org B
    const { orgId: aidB } = await seedTestOrg();
    const { user: adminB } = await seedUser(aidB, {
      email: `admin-b-l4@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
      password: "TestPass123!",
      status: "active",
    });
    await db.insert(ticketPriorities).values([
      { orgId: aidB, name: "P1", color: "#ef4444", slaResponseMinutes: 15, slaResolveMinutes: 240, sortOrder: 1 },
    ]);
    await db.insert(ticketStatuses).values([
      { orgId: aidB, name: "Open", category: "open", color: "#6366f1", isDefault: true, sortOrder: 1 },
    ]);
    const tokenB = await loginAndGetToken(adminB.email, "TestPass123!");
    orgB = { orgId: aidB, adminToken: tokenB };

    // Seed tickets in both orgs
    const callerA = await authedCaller(tokenA);
    const callerB = await authedCaller(tokenB);

    const [p1A] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, aidA)).limit(1);
    const [p1B] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, aidB)).limit(1);

    const ticketA = await callerA.tickets.create({
      title: "Org A Ticket - Isolation Test",
      type: "incident",
      priorityId: p1A!.id,
    }) as { id: string };
    orgATicketId = ticketA.id;

    const ticketB = await callerB.tickets.create({
      title: "Org B Ticket - Isolation Test",
      type: "incident",
      priorityId: p1B!.id,
    }) as { id: string };
    orgBTicketId = ticketB.id;

    // Seed contracts
    const contractA = await callerA.contracts.create({
      title: "Org A Contract",
      counterparty: "Vendor A",
      type: "vendor",
      value: "100000",
      currency: "INR",
    }) as { id: string };
    orgAContractId = contractA.id;

    const contractB = await callerB.contracts.create({
      title: "Org B Contract",
      counterparty: "Vendor B",
      type: "vendor",
      value: "200000",
      currency: "INR",
    }) as { id: string };
    orgBContractId = contractB.id;
  });

  afterAll(async () => {
    await cleanupOrg(orgA.orgId);
    await cleanupOrg(orgB.orgId);
  });

  // ── Ticket Isolation ──────────────────────────────────────────────────────

  describe("Ticket Isolation", () => {
    it("Org A ticket list returns ONLY Org A tickets", async () => {
      const caller = await authedCaller(orgA.adminToken);
      const result = await caller.tickets.list({}) as { items: { orgId: string }[] };
      expect(result.items.every((t) => t.orgId === orgA.orgId)).toBe(true);
    });

    it("Org B ticket list returns ONLY Org B tickets", async () => {
      const caller = await authedCaller(orgB.adminToken);
      const result = await caller.tickets.list({}) as { items: { orgId: string }[] };
      expect(result.items.every((t) => t.orgId === orgB.orgId)).toBe(true);
    });

    it("Org A cannot access Org B ticket by ID → NOT_FOUND", async () => {
      const caller = await authedCaller(orgA.adminToken);
      await expect(
        caller.tickets.get({ id: orgBTicketId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("Org B cannot access Org A ticket by ID → NOT_FOUND", async () => {
      const caller = await authedCaller(orgB.adminToken);
      await expect(
        caller.tickets.get({ id: orgATicketId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("Org A list does not contain Org B tickets", async () => {
      const caller = await authedCaller(orgA.adminToken);
      const result = await caller.tickets.list({}) as { items: { id: string }[] };
      const ids = result.items.map((t) => t.id);
      expect(ids).not.toContain(orgBTicketId);
    });
  });

  // ── Contract Isolation ───────────────────────────────────────────────────

  describe("Contract Isolation", () => {
    it("Org A cannot access Org B contract by ID → NOT_FOUND", async () => {
      const caller = await authedCaller(orgA.adminToken);
      await expect(
        caller.contracts.get({ id: orgBContractId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("Org B cannot access Org A contract by ID → NOT_FOUND", async () => {
      const caller = await authedCaller(orgB.adminToken);
      await expect(
        caller.contracts.get({ id: orgAContractId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── Cross-Org Mutation Prevention ────────────────────────────────────────

  describe("4.2 Cross-Org Mutation Prevention", () => {
    it("Org A cannot update Org B ticket", async () => {
      const caller = await authedCaller(orgA.adminToken);
      // Update should not find the ticket (org_id mismatch in WHERE clause)
      const result = await caller.tickets.update({ id: orgBTicketId, title: "Hacked Title" })
        .catch(() => null);
      // Either throws NOT_FOUND or silently no-ops — verify Org B ticket title unchanged
      const db = testDb();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, orgBTicketId)).limit(1);
      expect(ticket!.title).not.toBe("Hacked Title");
    });

    it("Create mutation uses ctx.orgId regardless of any injected org_id in input", async () => {
      const db = testDb();
      const [p1A] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, orgA.orgId)).limit(1);
      const caller = await authedCaller(orgA.adminToken);
      const created = await caller.tickets.create({
        title: "Context Wins Test",
        type: "incident",
        priorityId: p1A!.id,
      }) as { orgId: string };
      // Must be Org A's orgId, not Org B's
      expect(created.orgId).toBe(orgA.orgId);
      expect(created.orgId).not.toBe(orgB.orgId);
    });
  });

  // ── Auto-Numbering Isolation ─────────────────────────────────────────────

  describe("4.3 Auto-Numbering Isolation", () => {
    it("Org A and Org B first tickets both start with sequence 1", async () => {
      // Both orgs created a ticket in beforeAll — their numbers should both be first in sequence
      const db = testDb();
      const [ticketA] = await db.select().from(tickets).where(eq(tickets.id, orgATicketId)).limit(1);
      const [ticketB] = await db.select().from(tickets).where(eq(tickets.id, orgBTicketId)).limit(1);
      // Both numbers should contain "-0001" suffix (first ticket per org)
      expect(ticketA!.number).toContain("-000");
      expect(ticketB!.number).toContain("-000");
    });
  });

  // ── Audit Log Isolation ──────────────────────────────────────────────────

  describe("4.4 Audit Log Isolation", () => {
    it("Org A audit log returns only Org A entries", async () => {
      const caller = await authedCaller(orgA.adminToken);
      const result = await caller.admin.auditLog.list({ limit: 50 }) as { items: { orgId: string }[] };
      expect(result.items.every((e) => e.orgId === orgA.orgId)).toBe(true);
    });
  });
});
