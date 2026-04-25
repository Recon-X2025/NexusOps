/**
 * Auth contract tests (DB-backed). Layer 2 (`layer2-auth.test.ts`) is exhaustive;
 * this file replaces placeholders with a stable smoke set for CI discovery.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import {
  seedTestOrg,
  seedUser,
  cleanupOrg,
  authedCaller,
  createSession,
  testDb,
} from "./helpers";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";

const loginEmail = `auth-file-${nanoid(8)}@qa.nexusops.io`;
const password = "TestPass123!";

function publicCaller() {
  const db = testDb();
  const ctx: Context = {
    db,
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest-auth-file",
    idempotencyKey: null,
  };
  return appRouter.createCaller(ctx);
}

let orgId: string;
let seededUserId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
  const { orgId: oid } = await seedTestOrg(`auth-smoke-${nanoid(4)}`);
  orgId = oid;
  const { userId } = await seedUser(orgId, {
    email: loginEmail,
    role: "admin",
    matrixRole: "admin",
    password,
  });
  seededUserId = userId;
});

afterAll(async () => {
  await cleanupOrg(orgId);
});

describe.sequential("Auth (auth.test)", () => {
  it("rejects wrong password", async () => {
    await expect(
      publicCaller().auth.login({ email: loginEmail, password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects nonexistent user (same error family)", async () => {
    const ghostEmail = `ghost-${nanoid(10)}@example.invalid`;
    await expect(
      publicCaller().auth.login({ email: ghostEmail, password }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("session token from createSession authenticates (password login → layer2-auth.test.ts)", async () => {
    const token = await createSession(seededUserId);
    expect(token).toBeTruthy();
    const caller = await authedCaller(token);
    const metrics = await caller.dashboard.getMetrics();
    expect(metrics).toBeDefined();
  });

  it("requestPasswordReset does not error for unknown email", async () => {
    await expect(
      publicCaller().auth.requestPasswordReset({ email: `ghost-${nanoid(8)}@example.invalid` }),
    ).resolves.toBeDefined();
  });

  it("invalid bearer token fails authenticated procedures", async () => {
    await expect(
      (async () => {
        const caller = await authedCaller("totally-invalid-token-xyz");
        await caller.tickets.list({});
      })(),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
