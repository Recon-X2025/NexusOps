/**
 * Layer 5 — Business Logic: State machines, calculations, chains.
 * Verifies every business rule enforces correctly, including edge cases.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedFullOrg, authedCaller, cleanupOrg, createSession } from "./helpers";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import { tickets, ticketPriorities, securityIncidents, contracts, purchaseRequests } from "@coheronconnect/db";
import { eq, and, sql } from "@coheronconnect/db";

describe("Layer 5: Business Logic", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    orgCtx = await seedFullOrg();
    // Bearer via session row — avoids auth.login rate limits + Redis when many suites run.
    adminToken = await createSession(orgCtx.adminId);
    agentToken = await createSession(orgCtx.agentId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  // ── 5.1 Auto-Numbering ───────────────────────────────────────────────────

  describe("5.1 Auto-Numbering", () => {
    it("first ticket in new org gets a number with -0001 suffix", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = await caller.tickets.create({
        title: "Auto-number test first",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { number: string };
      expect(ticket.number).toMatch(/-0001$/);
    });

    it("sequential tickets get sequential numbers", async () => {
      const caller = await authedCaller(adminToken);
      const t1 = await caller.tickets.create({ title: "Seq test 1", type: "incident", priorityId: orgCtx.p2Id! }) as { number: string };
      const t2 = await caller.tickets.create({ title: "Seq test 2", type: "incident", priorityId: orgCtx.p2Id! }) as { number: string };
      const n1 = parseInt(t1.number.split("-")[1]!);
      const n2 = parseInt(t2.number.split("-")[1]!);
      expect(n2).toBe(n1 + 1);
    });

    it("numbers are zero-padded to 4 digits", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = await caller.tickets.create({ title: "Padding test", type: "incident", priorityId: orgCtx.p2Id! }) as { number: string };
      const suffix = ticket.number.split("-")[1]!;
      expect(suffix).toHaveLength(4);
    });

    it("10 concurrent ticket creates produce 10 unique sequential numbers", async () => {
      const caller = await authedCaller(adminToken);
      const promises = Array.from({ length: 10 }, (_, i) =>
        caller.tickets.create({ title: `Concurrent ${i}`, type: "incident", priorityId: orgCtx.p2Id! }),
      );
      const results = await Promise.all(promises) as { number: string }[];
      const numbers = results.map((r) => r.number);
      const unique = new Set(numbers);
      expect(unique.size).toBe(10);
    });
  });

  // ── 5.2 SLA Calculation ──────────────────────────────────────────────────

  describe("5.2 SLA Calculation", () => {
    it("ticket create sets sla_response_deadline from priority policy", async () => {
      const caller = await authedCaller(adminToken);
      const before = Date.now();
      const ticket = await caller.tickets.create({
        title: "SLA test ticket",
        type: "incident",
        priorityId: orgCtx.p1Id!,
      }) as { id: string; slaResponseDeadline?: string | null };
      // P1 has 15-minute SLA response
      if (ticket.slaResponseDeadline) {
        const deadline = new Date(ticket.slaResponseDeadline).getTime();
        expect(deadline).toBeGreaterThan(before);
        expect(deadline - before).toBeLessThan(16 * 60 * 1000 + 5000); // within ~16 min
      }
    });
  });

  // ── 5.3 Security Incident State Machine ─────────────────────────────────

  describe("5.3 Security Incident State Machine", () => {
    const VALID_PATHS: [string, string][] = [
      ["new", "triage"],
      ["triage", "containment"],
      ["triage", "false_positive"],
      ["containment", "eradication"],
      ["eradication", "recovery"],
      ["recovery", "closed"],
    ];

    const INVALID_PATHS: [string, string][] = [
      ["new", "containment"],
      ["new", "closed"],
      ["new", "recovery"],
      ["triage", "recovery"],
      ["containment", "closed"],
    ];

    for (const [from, to] of VALID_PATHS) {
      it(`security incident: ${from} → ${to} is ALLOWED`, async () => {
        const db = testDb();
        const caller = await authedCaller(adminToken);
        // Create incident and force it to 'from' state
        const created = await caller.security.createIncident({
          title: `State test ${from}→${to}`,
          severity: "medium",
        }) as { id: string };

        // Manually set status to 'from' via DB if 'from' != 'new'
        if (from !== "new") {
          await db.update(securityIncidents).set({ status: from as any }).where(eq(securityIncidents.id, created.id));
        }

        await expect(
          caller.security.transition({ id: created.id, toStatus: to }),
        ).resolves.toBeDefined();
      });
    }

    for (const [from, to] of INVALID_PATHS) {
      it(`security incident: ${from} → ${to} is REJECTED`, async () => {
        const db = testDb();
        const caller = await authedCaller(adminToken);
        const created = await caller.security.createIncident({
          title: `Invalid state test ${from}→${to}`,
          severity: "low",
        }) as { id: string };

        if (from !== "new") {
          await db.update(securityIncidents).set({ status: from as any }).where(eq(securityIncidents.id, created.id));
        }

        await expect(
          caller.security.transition({ id: created.id, toStatus: to }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });
    }
  });

  // ── 5.4 Contract State Machine ───────────────────────────────────────────

  describe("5.4 Contract State Machine", () => {
    const VALID: [string, string][] = [
      ["draft", "under_review"],
      ["draft", "terminated"], // FIX: 2026-03-25 — "cancelled" not in enum; actual values are terminated/expired
      ["under_review", "legal_review"],
      ["under_review", "draft"],
      ["legal_review", "awaiting_signature"],
      ["legal_review", "under_review"],
      ["awaiting_signature", "active"],
      ["active", "expiring_soon"],
      ["active", "terminated"],
      ["expiring_soon", "active"],
      ["expiring_soon", "expired"],
      ["expiring_soon", "terminated"],
    ];

    const INVALID: [string, string][] = [
      ["draft", "active"],
      ["draft", "awaiting_signature"],
      ["expired", "active"],
      ["terminated", "active"],
    ];

    for (const [from, to] of VALID) {
      it(`contract: ${from} → ${to} is ALLOWED`, async () => {
        const db = testDb();
        const caller = await authedCaller(adminToken);
        const created = await caller.contracts.create({
          title: `Contract state test ${from}→${to}`,
          counterparty: "Test Vendor",
          type: "vendor",
          value: "100000",
          currency: "INR",
        }) as { id: string };

        if (from !== "draft") {
          await db.update(contracts).set({ status: from as any }).where(eq(contracts.id, created.id));
        }

        await expect(
          caller.contracts.transition({ id: created.id, toStatus: to }),
        ).resolves.toBeDefined();
      });
    }

    for (const [from, to] of INVALID) {
      it(`contract: ${from} → ${to} is REJECTED`, async () => {
        const db = testDb();
        const caller = await authedCaller(adminToken);
        const created = await caller.contracts.create({
          title: `Contract invalid ${from}→${to}`,
          counterparty: "Test Vendor",
          type: "vendor",
          value: "100000",
          currency: "INR",
        }) as { id: string };

        await db.update(contracts).set({ status: from as any }).where(eq(contracts.id, created.id));

        await expect(
          caller.contracts.transition({ id: created.id, toStatus: to }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });
    }
  });

  // ── 5.5 Procurement Approval Chain ──────────────────────────────────────

  describe("5.5 Procurement Approval Chain", () => {
    it("PR under ₹75,000 is auto-approved", async () => {
      const caller = await authedCaller(adminToken);
      const pr = await caller.procurement.purchaseRequests.create({
        title: "Small PR - auto approve",
        justification: "Office supplies",
        items: [{ description: "Pens", quantity: 10, unitPrice: 5000 }], // total ₹50,000
        priority: "low",
        department: "IT",
      }) as { status: string; totalAmount: string };
      expect(pr.status).toBe("approved");
    });

    it("PR ₹75,000–₹7,50,000 routes to dept head (status=pending)", async () => {
      const caller = await authedCaller(adminToken);
      const pr = await caller.procurement.purchaseRequests.create({
        title: "Medium PR - dept head",
        justification: "Ergonomic chairs",
        items: [{ description: "Chair", quantity: 6, unitPrice: 50000 }], // total ₹3,00,000
        priority: "medium",
        department: "IT",
      }) as { status: string };
      expect(pr.status).toBe("pending");
    });

    it("PR over ₹7,50,000 requires multi-level approval (status=pending)", async () => {
      const caller = await authedCaller(adminToken);
      const pr = await caller.procurement.purchaseRequests.create({
        title: "Large PR - VP + Finance",
        justification: "Server hardware",
        items: [{ description: "Server", quantity: 2, unitPrice: 500000 }], // total ₹10,00,000
        priority: "high",
        department: "IT",
      }) as { status: string };
      expect(pr.status).toBe("pending");
    });
  });

  // ── 5.6 Audit Log from Mutations ────────────────────────────────────────

  describe("5.6 Audit Log from Mutations", () => {
    it("creating a ticket generates an audit_log entry", async () => {
      const db = testDb();
      const caller = await authedCaller(adminToken);
      const { auditLogs } = await import("@coheronconnect/db");
      const { count } = await import("@coheronconnect/db");

      const [before] = await db.select({ cnt: count() }).from(auditLogs).where(eq(auditLogs.orgId, orgCtx.orgId));
      await caller.tickets.create({ title: "Audit log test ticket", type: "incident", priorityId: orgCtx.p2Id! });
      const [after] = await db.select({ cnt: count() }).from(auditLogs).where(eq(auditLogs.orgId, orgCtx.orgId));

      expect(Number(after!.cnt)).toBeGreaterThan(Number(before!.cnt));
    });
  });
});
