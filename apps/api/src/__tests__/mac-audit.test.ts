/**
 * MED2 — MAC super-admin mutations are audited.
 *
 * The mac.* tRPC surface previously wrote no audit trail (unlike the HTTP
 * super-admin surface). Every mac mutation now records a super_admin_audit_logs
 * row via the auditMacOperation middleware, attributed to the operator; queries
 * are not recorded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { superAdminAuditLogs, eq, and } from "@coheronconnect/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";
import { initTestEnvironment, testDb, seedTestOrg } from "./helpers";

const MAC_SECRET = "test-mac-secret-please-rotate";
const MAC_EMAIL = "operator@platform.test";

function callerWith(macToken: string | null) {
  const ctx: Context = {
    db: testDb(),
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest-mac-audit",
    idempotencyKey: null,
    macToken,
  };
  return appRouter.createCaller(ctx);
}

const saved = { MAC_ENABLED: process.env["MAC_ENABLED"], MAC_JWT_SECRET: process.env["MAC_JWT_SECRET"] };

describe("MED2: mac.* mutations are audited to super_admin_audit_logs", () => {
  beforeAll(async () => {
    await initTestEnvironment();
    process.env["MAC_ENABLED"] = "true";
    process.env["MAC_JWT_SECRET"] = MAC_SECRET;
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const token = () => jwt.sign({ email: MAC_EMAIL, role: "mac_operator" }, MAC_SECRET, { expiresIn: "8h" });

  it("records the operator, action and target org for a mutation", async () => {
    const { orgId } = await seedTestOrg();
    await callerWith(token()).mac.suspendOrganization({ id: orgId });

    const rows = await testDb()
      .select()
      .from(superAdminAuditLogs)
      .where(and(eq(superAdminAuditLogs.orgId, orgId), eq(superAdminAuditLogs.actorEmail, MAC_EMAIL)));

    expect(rows.length).toBe(1);
    expect(rows[0]!.action).toContain("suspendOrganization");
  });

  it("does not record queries", async () => {
    const before = (await testDb().select().from(superAdminAuditLogs)).length;
    await callerWith(token()).mac.stats();
    const after = (await testDb().select().from(superAdminAuditLogs)).length;
    expect(after).toBe(before);
  });
});
