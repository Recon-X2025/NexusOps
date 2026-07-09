/**
 * Tests for the MAC (platform super-admin) action-auditing surface:
 *   1. Global tamper-evident chain integrity (append → seq/prevHash links, verify).
 *   2. Tamper + deletion detection.
 *   3. Login logging (bcrypt hash path, success + failure).
 *   4. Mutation instrumentation (createOrganization / suspendOrganization).
 *   5. Bulk feature-flag rollout (setFeatureFlagBulk).
 *   6. Deploy trigger (mocked fetch; GITHUB_PAT present vs. absent).
 *
 * Follows mac-auth.test.ts conventions: MAC_ENABLED=true, env save/restore,
 * self-isolating (each test seeds its own orgs and cleans the mac chain).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import {
  macAuditLogs,
  organizations,
  eq,
  desc,
  sql,
} from "@coheronconnect/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";
import { testDb } from "./helpers";
import {
  appendMacAuditEntry,
  verifyMacAuditChain,
  computeMacEntryHash,
} from "../lib/mac-audit-hash";

const MAC_SECRET = "test-mac-secret-please-rotate";
const MAC_EMAIL = "operator@platform.test";
const MAC_PASSWORD = "Sup3r-Secret-Op!";

function ctxWith(macToken: string | null): Context {
  return {
    db: testDb(),
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest-mac",
    idempotencyKey: null,
    macToken,
  };
}

function callerWith(macToken: string | null) {
  return appRouter.createCaller(ctxWith(macToken));
}

async function operatorToken(): Promise<string> {
  const { token } = await callerWith(null).mac.login({
    email: MAC_EMAIL,
    password: MAC_PASSWORD,
  });
  return token;
}

/** Wipe the global mac chain so each test starts from GENESIS. */
async function clearMacChain(): Promise<void> {
  await testDb().delete(macAuditLogs);
}

const savedEnv = {
  MAC_ENABLED: process.env["MAC_ENABLED"],
  MAC_JWT_SECRET: process.env["MAC_JWT_SECRET"],
  MAC_OPERATOR_EMAIL: process.env["MAC_OPERATOR_EMAIL"],
  MAC_OPERATOR_PASSWORD: process.env["MAC_OPERATOR_PASSWORD"],
  MAC_OPERATOR_PASSWORD_HASH: process.env["MAC_OPERATOR_PASSWORD_HASH"],
  GITHUB_PAT: process.env["GITHUB_PAT"],
};

beforeEach(async () => {
  process.env["MAC_ENABLED"] = "true";
  process.env["MAC_JWT_SECRET"] = MAC_SECRET;
  process.env["MAC_OPERATOR_EMAIL"] = MAC_EMAIL;
  // Use the bcrypt-hash path (preferred) by default.
  process.env["MAC_OPERATOR_PASSWORD_HASH"] = bcrypt.hashSync(MAC_PASSWORD, 12);
  delete process.env["MAC_OPERATOR_PASSWORD"];
  delete process.env["GITHUB_PAT"];
  await clearMacChain();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearMacChain();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("MAC audit chain integrity", () => {
  it("appends links with monotonic seq + prevHash and verifies", async () => {
    const db = testDb();
    const r1 = await appendMacAuditEntry(db, {
      operatorEmail: MAC_EMAIL,
      action: "org_created",
      targetOrgName: "One",
    });
    const r2 = await appendMacAuditEntry(db, {
      operatorEmail: MAC_EMAIL,
      action: "org_suspended",
      targetOrgName: "Two",
    });
    const r3 = await appendMacAuditEntry(db, {
      operatorEmail: MAC_EMAIL,
      action: "org_resumed",
      targetOrgName: "Three",
    });

    expect([r1.seq, r2.seq, r3.seq]).toEqual([1, 2, 3]);

    const rows = await db
      .select()
      .from(macAuditLogs)
      .orderBy(macAuditLogs.seq);
    expect(rows[0]!.prevHash).toBeNull();
    expect(rows[1]!.prevHash).toBe(rows[0]!.entryHash);
    expect(rows[2]!.prevHash).toBe(rows[1]!.entryHash);

    const result = await verifyMacAuditChain(db);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(3);
    expect(result.brokenAtSeq).toBeNull();
  });

  it("detects a tampered middle row", async () => {
    const db = testDb();
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_created" });
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_suspended" });
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_resumed" });

    // Edit the semantic field of seq 2 without recomputing its hash.
    await db
      .update(macAuditLogs)
      .set({ action: "billing_updated" })
      .where(eq(macAuditLogs.seq, 2));

    const result = await verifyMacAuditChain(db);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it("detects a deleted row (seq gap / broken link)", async () => {
    const db = testDb();
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_created" });
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_suspended" });
    await appendMacAuditEntry(db, { operatorEmail: MAC_EMAIL, action: "org_resumed" });

    await db.delete(macAuditLogs).where(eq(macAuditLogs.seq, 2));

    const result = await verifyMacAuditChain(db);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(3);
  });

  it("computeMacEntryHash is deterministic and prevHash-sensitive", () => {
    const entry = {
      operatorEmail: MAC_EMAIL,
      action: "org_created" as const,
      targetOrgName: "Acme",
    };
    const a = computeMacEntryHash(null, 1, entry);
    const b = computeMacEntryHash(null, 1, entry);
    const c = computeMacEntryHash("some-prev", 1, entry);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("MAC login logging", () => {
  it("records a failed login attempt (bcrypt hash path)", async () => {
    await expect(
      callerWith(null).mac.login({ email: MAC_EMAIL, password: "wrong" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const rows = await testDb()
      .select()
      .from(macAuditLogs)
      .where(eq(macAuditLogs.action, "operator_login"));
    expect(rows.length).toBe(1);
    expect(rows[0]!.operatorEmail).toBe(MAC_EMAIL);
    expect((rows[0]!.details as { success?: boolean }).success).toBe(false);
  });

  it("records a successful login attempt", async () => {
    const { token } = await callerWith(null).mac.login({
      email: MAC_EMAIL,
      password: MAC_PASSWORD,
    });
    expect(typeof token).toBe("string");

    const rows = await testDb()
      .select()
      .from(macAuditLogs)
      .where(eq(macAuditLogs.action, "operator_login"));
    expect(rows.length).toBe(1);
    expect((rows[0]!.details as { success?: boolean }).success).toBe(true);
  });
});

describe("MAC mutation instrumentation", () => {
  it("records org_created + org_suspended with targetOrgId", async () => {
    const token = await operatorToken();
    const caller = callerWith(token);

    const name = `Audit Test ${nanoid(6)}`;
    const { org } = await caller.mac.createOrganization({
      name,
      plan: "professional",
      adminEmail: "admin@audit.test",
      adminName: "Audit Admin",
    });
    const orgId = (org as { id: string }).id;

    await caller.mac.suspendOrganization({ id: orgId });

    const rows = await testDb()
      .select()
      .from(macAuditLogs)
      .where(eq(macAuditLogs.targetOrgId, orgId))
      .orderBy(macAuditLogs.seq);

    const actions = rows.map((r) => r.action);
    expect(actions).toContain("org_created");
    expect(actions).toContain("org_suspended");
    // operator email is derived from the verified token
    expect(rows.every((r) => r.operatorEmail === MAC_EMAIL)).toBe(true);

    // chain still valid after instrumented writes (plus the login row)
    const result = await verifyMacAuditChain(testDb());
    expect(result.ok).toBe(true);

    await testDb().delete(organizations).where(eq(organizations.id, orgId));
  });

  it("listAuditLog returns flattened entries the UI expects", async () => {
    const token = await operatorToken();
    const caller = callerWith(token);
    const name = `List Test ${nanoid(6)}`;
    const { org } = await caller.mac.createOrganization({
      name,
      plan: "free",
      adminEmail: "admin2@audit.test",
      adminName: "Admin Two",
    });
    const orgId = (org as { id: string }).id;

    const page = await caller.mac.listAuditLog({ page: 1, action: "org_created" });
    expect(page.total).toBeGreaterThanOrEqual(1);
    const entry = page.entries.find((e) => e.targetOrg === name);
    expect(entry).toBeDefined();
    expect(entry!.operator).toBe(MAC_EMAIL);
    expect(entry!.action).toBe("org_created");
    expect(typeof entry!.timestamp).toBe("string");

    await testDb().delete(organizations).where(eq(organizations.id, orgId));
  });
});

describe("MAC bulk feature-flag rollout", () => {
  it("sets a flag across all orgs and audits the bulk action", async () => {
    const db = testDb();
    const token = await operatorToken();
    const caller = callerWith(token);

    const slugs = [nanoid(8), nanoid(8), nanoid(8)];
    const created = await db
      .insert(organizations)
      .values(slugs.map((s) => ({ name: `Bulk ${s}`, slug: s, plan: "free" })))
      .returning({ id: organizations.id });

    const { updated } = await caller.mac.setFeatureFlagBulk({
      flag: "sso",
      enabled: true,
      allOrgs: true,
    });
    expect(updated).toBeGreaterThanOrEqual(3);

    for (const c of created) {
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, c.id));
      const flags = ((row!.settings ?? {}) as { featureFlags?: Record<string, boolean> }).featureFlags ?? {};
      expect(flags["sso"]).toBe(true);
    }

    const bulkRows = await db
      .select()
      .from(macAuditLogs)
      .where(eq(macAuditLogs.action, "feature_flag_bulk_set"));
    expect(bulkRows.length).toBe(1);
    expect((bulkRows[0]!.details as { flag?: string }).flag).toBe("sso");

    await db.delete(organizations).where(
      sql`${organizations.id} in (${sql.join(created.map((c) => sql`${c.id}`), sql`, `)})`,
    );
  });

  it("rejects a bulk set with neither allOrgs nor orgIds", async () => {
    const token = await operatorToken();
    await expect(
      callerWith(token).mac.setFeatureFlagBulk({ flag: "sso", enabled: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("MAC deploy trigger", () => {
  it("dispatches the workflow and audits deploy_triggered (GITHUB_PAT set)", async () => {
    process.env["GITHUB_PAT"] = "ghp_test_token";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const token = await operatorToken();
    const res = await callerWith(token).mac.triggerDeploy({
      imageTag: "latest",
      deployMode: "pull",
    });
    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rows = await testDb()
      .select()
      .from(macAuditLogs)
      .where(eq(macAuditLogs.action, "deploy_triggered"));
    expect(rows.length).toBe(1);
    expect((rows[0]!.details as { imageTag?: string }).imageTag).toBe("latest");
  });

  it("fails with INTERNAL_SERVER_ERROR when GITHUB_PAT is absent", async () => {
    delete process.env["GITHUB_PAT"];
    const token = await operatorToken();
    await expect(
      callerWith(token).mac.triggerDeploy({ imageTag: "latest", deployMode: "pull" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
