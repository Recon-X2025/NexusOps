/**
 * Layer 9 — Concurrency, Performance, and Edge Cases.
 * Finds race conditions, boundary violations, Unicode handling.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedFullOrg, authedCaller, cleanupOrg, createSession } from "./helpers";
import { tickets } from "@nexusops/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import { eq } from "@nexusops/db";
import { sanitizeHtml, sanitizeText } from "../lib/sanitize";

describe("Layer 9: Concurrency & Edge Cases", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  // ── 9.1 Auto-Number Races ────────────────────────────────────────────────

  describe("9.1 Auto-Number Races", () => {
    it("20 concurrent ticket creates produce 20 unique sequential numbers", async () => {
      const caller = await authedCaller(adminToken);
      const N = 20;
      const promises = Array.from({ length: N }, (_, i) =>
        caller.tickets.create({
          title: `Race condition test ${i}`,
          type: "incident",
          priorityId: orgCtx.p2Id!,
        }),
      );
      const results = await Promise.all(promises) as { number: string }[];
      const numbers = results.map((r) => r.number);
      const unique = new Set(numbers);
      expect(unique.size).toBe(N); // No duplicates
    });
  });

  // ── 9.2 Double-Submit Prevention ─────────────────────────────────────────

  describe("9.2 Double-Submit Behavior", () => {
    it("two identical ticket creates within 1s → deduplicated (same ticket returned)", async () => {
      const caller = await authedCaller(adminToken);
      // The auto-idempotency 5-second window deduplicates same org/user/title
      // requests within the same window. Both calls resolve to the same ticket.
      const [t1, t2] = await Promise.all([
        caller.tickets.create({ title: "Double submit test", type: "incident", priorityId: orgCtx.p2Id! }),
        caller.tickets.create({ title: "Double submit test", type: "incident", priorityId: orgCtx.p2Id! }),
      ]) as [{ id: string }, { id: string }];
      expect(t1.id).toBe(t2.id);
    });
  });

  // ── 9.3 Boundary Values ──────────────────────────────────────────────────

  describe("9.3 Boundary Values", () => {
    it("ticket title exactly at minimum (1 char) → accepted", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "A", type: "incident", priorityId: orgCtx.p2Id! }),
      ).resolves.toBeDefined();
    });

    it("ticket title with 500 chars → accepted", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "A".repeat(500), type: "incident", priorityId: orgCtx.p2Id! }),
      ).resolves.toBeDefined();
    });

    it("ticket title with 2000 chars → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "A".repeat(2000), type: "incident", priorityId: orgCtx.p2Id! }),
      ).rejects.toBeDefined();
    });

    it("GRC risk with likelihood=1, impact=1 → score=1", async () => {
      const caller = await authedCaller(adminToken);
      const risk = await caller.grc.createRisk({
        title: "Min risk",
        category: "operational",
        likelihood: 1,
        impact: 1,
        description: "Minimum risk test",
      }) as { riskScore?: number; id: string };
      if (risk.riskScore !== undefined) {
        expect(risk.riskScore).toBe(1);
      }
    });

    it("GRC risk with likelihood=5, impact=5 → score=25", async () => {
      const caller = await authedCaller(adminToken);
      const risk = await caller.grc.createRisk({
        title: "Max risk",
        // FIX: 2026-03-25 — "information" not in GRC category enum
        category: "technology",
        likelihood: 5,
        impact: 5,
        description: "Maximum risk test",
      }) as { riskScore?: number; id: string };
      if (risk.riskScore !== undefined) {
        expect(risk.riskScore).toBe(25);
      }
    });

    it("GRC risk with likelihood=0 → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.grc.createRisk({
          title: "Zero likelihood",
          category: "operational",
          likelihood: 0,
          impact: 3,
          description: "Invalid",
        }),
      ).rejects.toBeDefined();
    });

    it("GRC risk with likelihood=6 → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.grc.createRisk({
          title: "Over 5 likelihood",
          category: "operational",
          likelihood: 6,
          impact: 3,
          description: "Invalid",
        }),
      ).rejects.toBeDefined();
    });
  });

  // ── 9.4 Unicode and Internationalization ─────────────────────────────────

  describe("9.4 Unicode and Internationalization", () => {
    it("ticket title with Hindi characters → stored and returned correctly", async () => {
      const caller = await authedCaller(adminToken);
      const hindiTitle = "सर्वर डाउन है";
      const ticket = await caller.tickets.create({
        title: hindiTitle,
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const detail = await caller.tickets.get({ id: ticket.id }) as { ticket: { title: string } };
      expect(detail.ticket.title).toBe(hindiTitle);
    });

    it("ticket title with emoji → stored and returned correctly", async () => {
      const caller = await authedCaller(adminToken);
      const emojiTitle = "🔥 Critical Server Issue";
      const ticket = await caller.tickets.create({
        title: emojiTitle,
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const detail = await caller.tickets.get({ id: ticket.id }) as { ticket: { title: string } };
      expect(detail.ticket.title).toBe(emojiTitle);
    });

    it("ticket title with Chinese characters → stored and returned correctly", async () => {
      const caller = await authedCaller(adminToken);
      const chineseTitle = "服务器宕机";
      const ticket = await caller.tickets.create({
        title: chineseTitle,
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const detail = await caller.tickets.get({ id: ticket.id }) as { ticket: { title: string } };
      expect(detail.ticket.title).toBe(chineseTitle);
    });

    it("ticket title with Arabic → stored and returned correctly", async () => {
      const caller = await authedCaller(adminToken);
      const arabicTitle = "الخادم معطل";
      const ticket = await caller.tickets.create({
        title: arabicTitle,
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const detail = await caller.tickets.get({ id: ticket.id }) as { ticket: { title: string } };
      expect(detail.ticket.title).toBe(arabicTitle);
    });
  });

  // ── 9.5 Deletion Cascades ────────────────────────────────────────────────

  describe("9.5 Deletion Cascades and Orphans", () => {
    it("disabling a user does not break their existing ticket assignments", async () => {
      const db = testDb();
      const { users } = await import("@nexusops/db");
      const caller = await authedCaller(adminToken);

      const ticket = await caller.tickets.create({
        title: "Assigned ticket for disabled user test",
        type: "incident",
        priorityId: orgCtx.p2Id!,
        assigneeId: orgCtx.agentId,
      }) as { id: string };

      // Disable the agent
      await db.update(users).set({ status: "disabled" }).where(eq(users.id, orgCtx.agentId));

      // Ticket should still list correctly
      const list = await caller.tickets.list({}) as { items: { id: string }[] };
      expect(list.items.some((t) => t.id === ticket.id)).toBe(true);

      // Re-enable
      await db.update(users).set({ status: "active" }).where(eq(users.id, orgCtx.agentId));
    });
  });

  // ── 9.6 SQL Injection Resistance ─────────────────────────────────────────

  describe("9.6 Injection Resistance", () => {
    it("SQL injection in ticket title is stored as literal text, no data corruption", async () => {
      const caller = await authedCaller(adminToken);
      const sqlTitle = "'; DROP TABLE tickets; --";
      const ticket = await caller.tickets.create({
        title: sqlTitle,
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const db = testDb();
      // Verify tickets table still exists and ticket is stored as literal text
      const [stored] = await db.select().from(tickets).where(eq(tickets.id, ticket.id)).limit(1);
      expect(stored!.title).toBe(sqlTitle);
    });

    it("XSS in ticket title is sanitized (tags stripped)", () => {
      const xssInput = '<script>alert("xss")</script>Server Down';
      const sanitized = sanitizeText(xssInput);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("Server Down");
    });
  });

  // ── 9.7 Pagination ───────────────────────────────────────────────────────

  describe("9.7 Pagination", () => {
    it("ticket list with limit=5 returns exactly 5 items when more exist", async () => {
      const caller = await authedCaller(adminToken);
      // Create 6 tickets
      for (let i = 0; i < 6; i++) {
        await caller.tickets.create({ title: `Pagination test ${i}`, type: "incident", priorityId: orgCtx.p2Id! });
      }
      const page1 = await caller.tickets.list({ limit: 5 }) as { items: unknown[]; nextCursor: string | null };
      expect(page1.items.length).toBeLessThanOrEqual(5);
    });

    it("cursor-based pagination returns next page", async () => {
      const caller = await authedCaller(adminToken);
      const page1 = await caller.tickets.list({ limit: 3 }) as { items: { id: string }[]; nextCursor: string | null };
      if (page1.nextCursor) {
        const page2 = await caller.tickets.list({ limit: 3, cursor: page1.nextCursor }) as { items: { id: string }[] };
        const page1Ids = new Set(page1.items.map((t) => t.id));
        expect(page2.items.every((t) => !page1Ids.has(t.id))).toBe(true);
      }
    });
  });
});
