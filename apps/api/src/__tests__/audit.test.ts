import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  cleanupOrg,
  createSession,
} from "./helpers";
import { sanitizeForAudit } from "../lib/audit-sanitize";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});

describe("Audit sanitization", () => {
  it("redacts sensitive keys at any depth", () => {
    const raw = {
      title: "x",
      password: "secret",
      nested: { token: "t", apiKey: "k", ok: 1 },
      list: [{ refresh_token: "rt" }],
    };
    const s = sanitizeForAudit(raw) as Record<string, unknown>;
    expect(s.password).toBe("[REDACTED]");
    expect((s.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((s.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((s.nested as Record<string, unknown>).ok).toBe(1);
    expect(((s.list as unknown[])[0] as Record<string, unknown>).refresh_token).toBe("[REDACTED]");
    expect(s.title).toBe("x");
  });
});

describe("Audit log integration", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("mutation creates audit row with resourceId and sanitized changes", async () => {
    const caller = await authedCaller(adminToken);
    const ticket = (await caller.tickets.create({
      title: `Audit trail ${nanoid(6)}`,
      type: "incident",
      priorityId: orgCtx.p1Id!,
    })) as { id: string };

    const page = await caller.admin.auditLog.list({ page: 1, limit: 30 });
    const hit = page.items.find(
      (e) => e.action === "tickets.create" && e.resourceId === ticket.id,
    );
    expect(hit, "expected tickets.create audit entry").toBeDefined();
    const changes = hit!.changes as Record<string, unknown> | null;
    expect(changes?.title).toBeDefined();
  });

  it("pagination returns at most limit items", async () => {
    const caller = await authedCaller(adminToken);
    const page = await caller.admin.auditLog.list({ page: 1, limit: 7 });
    expect(page.items.length).toBeLessThanOrEqual(7);
    expect(page.page).toBe(1);
  });
});
