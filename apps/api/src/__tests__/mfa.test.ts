/**
 * MFA (TOTP) tests — Phase 3 security.
 *
 * Exercises the full enroll → confirm → login-gate → verify loop against the
 * real test Postgres + Redis (challenge/session stores). Each test seeds a fresh
 * org so isolation holds under the shared DB.
 *
 * TOTP codes are computed in-test with otplib against the (decrypted) secret so
 * we never depend on wall-clock windows beyond the ±1 step tolerance.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// Envelope secret codec reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-mfa-do-not-use-in-prod";

import { authenticator } from "otplib";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser as baseSeedUser, authedCaller, testDb } from "./helpers";
import { appRouter } from "../routers";
import { mfaEnrollments, users, eq } from "@coheronconnect/db";
import { decryptSecretEnvelope, isEnvelope } from "../services/encryption";

/**
 * Seed a user with a guaranteed-lowercase email. `login` normalizes email to
 * lowercase for lookup, but the default helper uses nanoid (mixed case), which
 * would never match at login. Mirror production signup (which normalizes) here.
 */
async function seedUser(orgId: string, opts: { password: string }) {
  const email = `mfa-${nanoid(8).toLowerCase()}@qa.coheronconnect.io`;
  return baseSeedUser(orgId, { ...opts, email });
}

/** Unauthenticated caller (for login / verifyMfa). */
function publicCaller() {
  const db = testDb();
  return appRouter.createCaller({
    db,
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    idempotencyKey: null,
    macToken: null,
  });
}

/** Read + decrypt the stored TOTP secret and produce a currently-valid code. */
async function currentCodeForUser(userId: string): Promise<string> {
  const db = testDb();
  const [row] = await db
    .select({ totpSecret: mfaEnrollments.totpSecret })
    .from(mfaEnrollments)
    .where(eq(mfaEnrollments.userId, userId))
    .limit(1);
  return authenticator.generate(await decryptSecretEnvelope(row!.totpSecret));
}

/** Full enroll helper: startEnroll + confirmEnroll, returns backup codes. */
async function enrollUser(token: string, userId: string): Promise<string[]> {
  const caller = await authedCaller(token);
  await caller.auth.mfa.startEnroll();
  const code = await currentCodeForUser(userId);
  const { backupCodes } = await caller.auth.mfa.confirmEnroll({ code });
  return backupCodes;
}

describe("MFA (TOTP)", () => {
  let orgId: string;

  beforeAll(async () => {
    // helpers initialize the test DB on first use via setup; seed touches it.
  });

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  it("startEnroll issues a QR + secret and leaves the user un-enrolled (pending)", async () => {
    const password = "TestPass123!";
    const { userId } = await seedUser(orgId, { password });
    const token = await createLoginToken(userId, password);

    const caller = await authedCaller(token);
    const res = await caller.auth.mfa.startEnroll();

    expect(res.secret).toBeTruthy();
    expect(res.otpauthUri).toContain("otpauth://totp/");
    expect(res.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const db = testDb();
    const [enr] = await db.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, userId));
    expect(enr?.status).toBe("pending");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u?.mfaEnrolled).toBe(false);
    // Secret is stored as a KMS envelope, not plaintext, and round-trips.
    expect(enr?.totpSecret).not.toBe(res.secret);
    expect(isEnvelope(enr!.totpSecret)).toBe(true);
    expect(await decryptSecretEnvelope(enr!.totpSecret)).toBe(res.secret);
  });

  it("confirmEnroll with a valid code activates MFA and returns 10 backup codes", async () => {
    const password = "TestPass123!";
    const { userId } = await seedUser(orgId, { password });
    const token = await createLoginToken(userId, password);

    const backupCodes = await enrollUser(token, userId);
    expect(backupCodes).toHaveLength(10);

    const db = testDb();
    const [enr] = await db.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, userId));
    expect(enr?.status).toBe("active");
    expect(enr?.backupCodes).toHaveLength(10);
    // Backup codes are hashed, not stored plaintext.
    expect(enr?.backupCodes).not.toContain(backupCodes[0]);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u?.mfaEnrolled).toBe(true);
  });

  it("confirmEnroll rejects a wrong code", async () => {
    const password = "TestPass123!";
    const { userId } = await seedUser(orgId, { password });
    const token = await createLoginToken(userId, password);
    const caller = await authedCaller(token);
    await caller.auth.mfa.startEnroll();
    await expect(caller.auth.mfa.confirmEnroll({ code: "000000" })).rejects.toThrow(/Invalid MFA code/);
  });

  it("login for an enrolled user returns a challenge (no session)", async () => {
    const password = "TestPass123!";
    const { userId, user } = await seedUser(orgId, { password });
    const token = await createLoginToken(userId, password);
    await enrollUser(token, userId);

    const res = await publicCaller().auth.login({ email: user.email, password });
    expect(res.mfaRequired).toBe(true);
    expect((res as { challengeToken: string }).challengeToken).toBeTruthy();
    expect((res as Record<string, unknown>)["sessionId"]).toBeUndefined();
  });

  it("verifyMfa exchanges a valid TOTP for a real session", async () => {
    const password = "TestPass123!";
    const { userId, user } = await seedUser(orgId, { password });
    const enrollToken = await createLoginToken(userId, password);
    await enrollUser(enrollToken, userId);

    const login = await publicCaller().auth.login({ email: user.email, password });
    const challengeToken = (login as { challengeToken: string }).challengeToken;

    const code = await currentCodeForUser(userId);
    const res = await publicCaller().auth.verifyMfa({ challengeToken, code });
    expect(res.sessionId).toBeTruthy();
    expect(res.user.id).toBe(userId);

    // The issued session actually works.
    const me = await (await authedCaller(res.sessionId)).auth.me();
    expect(me?.user.id).toBe(userId);
  });

  it("verifyMfa rejects a wrong code and a reused challenge", async () => {
    const password = "TestPass123!";
    const { userId, user } = await seedUser(orgId, { password });
    const enrollToken = await createLoginToken(userId, password);
    await enrollUser(enrollToken, userId);

    const login = await publicCaller().auth.login({ email: user.email, password });
    const challengeToken = (login as { challengeToken: string }).challengeToken;

    await expect(publicCaller().auth.verifyMfa({ challengeToken, code: "000000" })).rejects.toThrow(
      /Invalid MFA code/,
    );

    // Wrong code consumes the challenge (single-use) → a valid code now fails too.
    const good = await currentCodeForUser(userId);
    await expect(publicCaller().auth.verifyMfa({ challengeToken, code: good })).rejects.toThrow(
      /challenge expired or invalid/i,
    );
  });

  // Heaviest test: enrollment generates 10 bcrypt(cost 12) hashes and the second
  // verifyMfa scans all remaining hashes (no match) via sequential bcrypt.compare.
  // On a loaded machine that alone can exceed the 30s default, so allow more time.
  it("a backup code logs in once and is then consumed", async () => {
    const password = "TestPass123!";
    const { userId, user } = await seedUser(orgId, { password });
    const enrollToken = await createLoginToken(userId, password);
    const backupCodes = await enrollUser(enrollToken, userId);
    const backup = backupCodes[0]!;

    const login1 = await publicCaller().auth.login({ email: user.email, password });
    const t1 = (login1 as { challengeToken: string }).challengeToken;
    const res1 = await publicCaller().auth.verifyMfa({ challengeToken: t1, code: backup, isBackupCode: true });
    expect(res1.sessionId).toBeTruthy();

    // Second use of the same backup code fails.
    const login2 = await publicCaller().auth.login({ email: user.email, password });
    const t2 = (login2 as { challengeToken: string }).challengeToken;
    await expect(
      publicCaller().auth.verifyMfa({ challengeToken: t2, code: backup, isBackupCode: true }),
    ).rejects.toThrow(/Invalid MFA code/);

    const db = testDb();
    const [enr] = await db.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, userId));
    expect(enr?.backupCodes).toHaveLength(9);
  }, 90_000);

  it("disable removes the enrollment and clears the flag", async () => {
    const password = "TestPass123!";
    const { userId } = await seedUser(orgId, { password });
    const token = await createLoginToken(userId, password);
    await enrollUser(token, userId);

    const code = await currentCodeForUser(userId);
    const res = await (await authedCaller(token)).auth.mfa.disable({ code });
    expect(res.success).toBe(true);

    const db = testDb();
    const rows = await db.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, userId));
    expect(rows).toHaveLength(0);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u?.mfaEnrolled).toBe(false);
  });

  it("non-enrolled user login is unchanged (one-step, returns sessionId)", async () => {
    const password = "TestPass123!";
    const { user } = await seedUser(orgId, { password });
    const res = await publicCaller().auth.login({ email: user.email, password });
    expect(res.mfaRequired).toBe(false);
    expect((res as { sessionId: string }).sessionId).toBeTruthy();
  });
});

/**
 * Log a freshly-seeded (non-MFA) user in to obtain a session token used to call
 * the protected enrollment procedures. Because the user has no MFA yet, login is
 * one-step and returns a sessionId directly.
 */
async function createLoginToken(userId: string, password: string): Promise<string> {
  const db = testDb();
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const res = await publicCaller().auth.login({ email: u!.email, password });
  return (res as { sessionId: string }).sessionId;
}
