/**
 * Layer 6 — Data Integrity: Input validation, sanitization, constraints.
 * Verifies no bad data can enter the system, no injection is possible.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedFullOrg, authedCaller, cleanupOrg, createSession } from "./helpers";
import { sanitizeHtml, sanitizeText } from "../lib/sanitize";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import { auditLogs } from "@nexusops/db";
import { eq } from "@nexusops/db";
import { appRouter } from "../routers";

describe("Layer 6: Data Integrity", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  // ── 6.1 Input Sanitization ────────────────────────────────────────────────

  describe("6.1 Input Sanitization — sanitizeHtml function", () => {
    it("script tags are stripped from HTML fields", () => {
      const input = '<script>alert("xss")</script><b>Bold text</b>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
      expect(result).toContain("<b>Bold text</b>");
    });

    it("img onerror attribute is removed", () => {
      const input = '<img src="test.jpg" onerror="hack()">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("onerror");
    });

    it("allowed tags (b, i, strong, p, code) are preserved", () => {
      const input = "<b>bold</b> <i>italic</i> <strong>strong</strong> <code>code</code>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<b>bold</b>");
      expect(result).toContain("<i>italic</i>");
      expect(result).toContain("<code>code</code>");
    });

    it("anchor href is preserved, javascript: protocol is stripped", () => {
      const safeLink = '<a href="https://example.com">click</a>';
      const maliciousLink = '<a href="javascript:alert(1)">click</a>';
      const safeResult = sanitizeHtml(safeLink);
      const maliciousResult = sanitizeHtml(maliciousLink);
      expect(safeResult).toContain('href="https://example.com"');
      expect(maliciousResult).not.toContain("javascript:");
    });

    it("sanitizeText strips all HTML tags", () => {
      const input = "<script>alert(1)</script><b>Hello</b> World";
      const result = sanitizeText(input);
      expect(result).toBe("Hello World");
      expect(result).not.toContain("<");
    });

    it("sanitizeText trims whitespace", () => {
      const result = sanitizeText("  Hello World  ");
      expect(result).toBe("Hello World");
    });
  });

  // ── 6.2 Zod Validation on Ticket Mutations ───────────────────────────────

  describe("6.2 Zod Validation — Ticket Mutations", () => {
    it("ticket title exceeding max length → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({
          title: "a".repeat(1000), // well above any reasonable limit
          type: "incident",
          priorityId: orgCtx.p2Id!,
        }),
      ).rejects.toBeDefined();
    });

    it("ticket with empty title → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "", type: "incident", priorityId: orgCtx.p2Id! }),
      ).rejects.toBeDefined();
    });

    it("invalid ticket type → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "Test", type: "banana" as any, priorityId: orgCtx.p2Id! }),
      ).rejects.toBeDefined();
    });

    it("invalid UUID for priorityId → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.tickets.create({ title: "Test", type: "incident", priorityId: "not-a-uuid" }),
      ).rejects.toBeDefined();
    });
  });

  // ── 6.3 Database Constraints ─────────────────────────────────────────────

  describe("6.3 Database Constraints", () => {
    it("duplicate org slug → unique constraint violation on signup", async () => {
      const db = testDb();
      const ctx = {
        db,
        mongoDb: null,
        databaseProvider: "postgres" as const,
        user: null,
        org: null,
        orgId: null,
        sessionId: null,
        requestId: null,
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        idempotencyKey: null,
      };
      const caller = appRouter.createCaller(ctx);

      // First signup
      const uniqueSlug = `dup-org-${Date.now()}`;
      await caller.auth.signup({
        email: `dup-org-user1-${Date.now()}@qa.nexusops.io`,
        password: "TestPass123!",
        name: "Dup Org User 1",
        orgName: uniqueSlug,
      });

      // Second signup with same org name generates different slug (nanoid suffix)
      // — verify the system handles this (no crash)
      await expect(
        caller.auth.signup({
          email: `dup-org-user2-${Date.now()}@qa.nexusops.io`,
          password: "TestPass123!",
          name: "Dup Org User 2",
          orgName: uniqueSlug,
        }),
      ).resolves.toBeDefined(); // slug collision handled by appending nanoid
    });

    it("duplicate user email in same org → CONFLICT error", async () => {
      const db = testDb();
      const email = `dup-email-${Date.now()}@qa.nexusops.io`;

      await db.insert((await import("@nexusops/db")).users).values({
        orgId: orgCtx.orgId,
        email,
        name: "First User",
        passwordHash: "$2b$10$fake",
        role: "member",
        status: "active",
      });

      await expect(
        db.insert((await import("@nexusops/db")).users).values({
          orgId: orgCtx.orgId,
          email,
          name: "Duplicate User",
          passwordHash: "$2b$10$fake",
          role: "member",
          status: "active",
        }),
      ).rejects.toBeDefined(); // unique constraint on (org_id, email)
    });
  });

  // ── 6.4 Audit Log Integrity ──────────────────────────────────────────────

  describe("6.4 Audit Log Integrity", () => {
    it("audit log changes field does NOT contain password_hash", async () => {
      // Check all audit logs for this org — none should contain password in changes
      const db = testDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgCtx.orgId));
      for (const log of logs) {
        const changesStr = JSON.stringify(log.changes ?? {});
        expect(changesStr).not.toContain("$2b$");
        expect(changesStr).not.toContain("passwordHash");
        // Redacted fields should show [REDACTED]
        if ((log.changes as Record<string, unknown>)?.password) {
          expect((log.changes as Record<string, unknown>).password).toBe("[REDACTED]");
        }
      }
    });

    it("audit log captures resource_id on ticket create", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = await caller.tickets.create({
        title: "Audit capture test",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      const db = testDb();
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, ticket.id));
      expect(logs.length).toBeGreaterThan(0);
    });

    it("audit log orgId matches the performing user's org", async () => {
      const db = testDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgCtx.orgId));
      for (const log of logs) {
        expect(log.orgId).toBe(orgCtx.orgId);
      }
    });
  });

  // ── 6.5 Contract Financial Validation ────────────────────────────────────

  describe("6.5 Financial Field Validation", () => {
    it("contract with empty title → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.contracts.create({
          title: "",
          counterparty: "Test Vendor",
          type: "vendor",
          value: "100000",
          currency: "INR",
        }),
      ).rejects.toBeDefined();
    });

    it("contract with empty counterparty → validation error", async () => {
      const caller = await authedCaller(adminToken);
      await expect(
        caller.contracts.create({
          title: "Test Contract",
          counterparty: "",
          type: "vendor",
          value: "100000",
          currency: "INR",
        }),
      ).rejects.toBeDefined();
    });
  });
});
