/**
 * LOW2 — MAC operator impersonation actually works, securely.
 *
 * Auth is session-based, so the old self-signed JWT was inert. startImpersonation
 * now mints a REAL, short-lived, impersonation-marked session for the target, so
 * the token authenticates as that user; it refuses non-active targets; and the
 * action is audited (super_admin_audit_logs, via the MED2 mac middleware).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { sessions, eq } from "@coheronconnect/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";
import { initTestEnvironment, testDb, seedTestOrg, seedUser, authedCaller } from "./helpers";

const MAC_SECRET = "test-mac-secret-please-rotate";
const MAC_EMAIL = "operator@platform.test";

function macCaller() {
  const ctx: Context = {
    db: testDb(), mongoDb: null, databaseProvider: "postgres",
    user: null, org: null, orgId: null, sessionId: null, requestId: null,
    ipAddress: "127.0.0.1", userAgent: "vitest-impersonation", idempotencyKey: null,
    macToken: jwt.sign({ email: MAC_EMAIL, role: "mac_operator" }, MAC_SECRET, { expiresIn: "8h" }),
  };
  return appRouter.createCaller(ctx);
}

const saved = { MAC_ENABLED: process.env["MAC_ENABLED"], MAC_JWT_SECRET: process.env["MAC_JWT_SECRET"] };

describe("LOW2: MAC impersonation mints a working, marked, time-boxed session", () => {
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

  it("impersonating an active user yields a token that authenticates AS that user", async () => {
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId); // active by default

    const res = await macCaller().mac.startImpersonation({
      targetUserId: userId,
      reason: "support debugging session",
      durationMinutes: 15,
    });
    expect(typeof res.impersonationToken).toBe("string");

    // Session-based auth accepts the token AS the target user.
    const caller = await authedCaller(res.impersonationToken);
    const me = await caller.auth.me();
    expect(me?.user?.id).toBe(userId);

    // The session is marked as impersonation and short-lived (~15 min, not 8h/30d).
    const [sess] = await testDb().select().from(sessions).where(eq(sessions.userId, userId));
    expect(sess?.impersonatedBy).toBe(MAC_EMAIL);
    const ttlMin = (new Date(res.expiresAt).getTime() - Date.now()) / 60_000;
    expect(ttlMin).toBeGreaterThan(13);
    expect(ttlMin).toBeLessThan(16);
  });

  it("refuses to impersonate a non-active (disabled) user", async () => {
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId, { status: "disabled" });
    await expect(
      macCaller().mac.startImpersonation({ targetUserId: userId, reason: "should be blocked", durationMinutes: 15 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
