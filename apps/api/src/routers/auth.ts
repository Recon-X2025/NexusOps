import { router, publicProcedure, protectedProcedure, permissionProcedure } from "../lib/trpc";
import { invalidateSessionCache } from "../middleware/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logInfo, logWarn } from "../lib/logger";
import { withBcryptSlot } from "../lib/bcrypt-semaphore";
import {
  users,
  organizations,
  sessions,
  invites,
  verificationTokens,
  roles,
  userRoles,
  mfaEnrollments,
  auditLogs,
  eq,
  and,
  sql,
  asc,
  desc,
} from "@coheronconnect/db";
import { ensureDefaultTicketStatusesForOrg } from "../lib/ensure-ticket-workflow";
import { seedChartOfAccountsForOrg } from "./accounting";
import {
  SignupSchema,
  LoginSchema,
  InviteCreateSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@coheronconnect/types";
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from "../lib/login-rate-limit";
import { sendTransactionalEmail } from "../services/notifications";
import { hashSessionToken } from "../middleware/auth";
import { clearSessionStepUp, setSessionStepUpVerified } from "../lib/step-up-session";
import { setSessionMfaVerified, clearSessionMfa } from "../lib/mfa-session";
import { issueMfaChallenge, consumeMfaChallenge } from "../lib/mfa-challenge";
import {
  generateTotpSecret,
  buildQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  matchBackupCode,
} from "../lib/totp";
import { encryptSecret, decryptSecret } from "../services/encryption";

/** Never return password hashes to clients. */
function stripPasswordHash<T extends { passwordHash?: string | null }>(row: T) {
  const { passwordHash: _p, ...safe } = row;
  return safe;
}

/** Canonical form for lookups and storage (avoids duplicate accounts by casing). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateOrgSlug(orgName: string): string {
  return orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Create a session, store token hash in DB, return plaintext token to client.
 *  @param rememberMe  When true: 30-day persistent session; when false: 8-hour session-scoped token.
 */
export async function createSession(
  db: ReturnType<typeof import("@coheronconnect/db").getDb>,
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
  rememberMe = true,
) {
  const tokenPlaintext = nanoid(32);
  const tokenHash = hashSessionToken(tokenPlaintext);
  const ttlMs = rememberMe
    ? 30 * 24 * 60 * 60 * 1000  // 30 days
    :  8 * 60 * 60 * 1000;       // 8 hours (session-scoped)
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return { token: tokenPlaintext, expiresAt };
}

export const authRouter = router({
  signup: publicProcedure.input(SignupSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;
    const email = normalizeEmail(input.email);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
    }

    let slug = generateOrgSlug(input.orgName);
    const existingOrg = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (existingOrg.length > 0) {
      slug = `${slug}-${nanoid(6).toLowerCase()}`;
    }

    const [org] = await db
      .insert(organizations)
      .values({ name: input.orgName, slug, plan: "free" })
      .returning();

    await ensureDefaultTicketStatusesForOrg(db, org!.id);

    // Seed the default India chart of accounts so a brand-new org can post
    // journal entries (invoice GST, depreciation, COGS) from day one. Best-effort:
    // if accounting tables are absent (e.g. partial migration) signup must still
    // succeed — the COA can be seeded later via acc.coa.seed.
    try {
      await seedChartOfAccountsForOrg(db, org!.id);
    } catch (err) {
      logWarn("signup.seedChartOfAccounts.failed", { orgId: org!.id, err: String(err) });
    }

    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        orgId: org!.id,
        email,
        name: input.name,
        passwordHash,
        role: "owner",
        status: "active",
      })
      .returning();

    const [adminRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.orgId, org!.id), eq(roles.name, "Admin")))
      .limit(1);

    if (adminRole) {
      await db.insert(userRoles).values({ userId: user!.id, roleId: adminRole.id });
    }

    const sessionId = await createSession(db, user!.id, ctx.ipAddress, ctx.userAgent);
    return { user: stripPasswordHash(user!), org, sessionId: sessionId.token };
  }),

  login: publicProcedure.input(LoginSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;
    const t0 = Date.now();
    const email = normalizeEmail(input.email);

    // ── Pre-bcrypt gate: reject before touching the DB or bcrypt ─────────────
    // Limits ALL attempts (not just failures) so rapid-fire login storms cannot
    // saturate the bcrypt semaphore even when the password is correct.
    await checkLoginRateLimit(email);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const tDbUser = Date.now();

    if (!user) {
      await recordFailedLogin(email, ctx.ipAddress);
      logWarn("AUTH_LOGIN_FAIL", { reason: "user_not_found", email, db_ms: tDbUser - t0 });
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    if (user.status === "disabled") {
      await recordFailedLogin(email, ctx.ipAddress);
      logWarn("AUTH_LOGIN_FAIL", { reason: "account_disabled", user_id: user.id });
      throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled" });
    }

    if (!user.passwordHash) {
      await recordFailedLogin(email, ctx.ipAddress);
      logWarn("AUTH_LOGIN_FAIL", { reason: "no_password_hash", user_id: user.id });
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const tBcryptStart = Date.now();
    const passwordOk = await withBcryptSlot(() => verifyPassword(input.password, user.passwordHash!));
    const tBcryptEnd = Date.now();

    if (!passwordOk) {
      await recordFailedLogin(email, ctx.ipAddress);
      logWarn("AUTH_LOGIN_FAIL", {
        reason:    "wrong_password",
        user_id:   user.id,
        bcrypt_ms: tBcryptEnd - tBcryptStart,
      });
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    await clearLoginAttempts(email);

    // ── MFA gate ─────────────────────────────────────────────────────────────
    // If the user has an ACTIVE TOTP enrollment, do NOT create a session here.
    // Instead issue a short-lived challenge token the client exchanges via
    // `verifyMfa`. No usable session exists until TOTP (or a backup code) passes.
    const [mfa] = await db
      .select({ id: mfaEnrollments.id })
      .from(mfaEnrollments)
      .where(and(eq(mfaEnrollments.userId, user.id), eq(mfaEnrollments.status, "active")))
      .limit(1);

    if (mfa) {
      const challengeToken = await issueMfaChallenge(user.id);
      logInfo("AUTH_LOGIN_MFA_REQUIRED", {
        request_id: ctx.requestId,
        user_id: user.id,
        org_id: user.orgId,
      });
      return {
        mfaRequired: true as const,
        challengeToken,
        rememberMe: input.rememberMe ?? false,
      };
    }

    const session = await createSession(db, user.id, ctx.ipAddress, ctx.userAgent, input.rememberMe ?? false);
    const tSession = Date.now();

    await db
      .update(users)
      .set({ 
        lastLoginAt: new Date(),
        status: user.status === "invited" ? "active" : user.status
      })
      .where(eq(users.id, user.id));

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);

    const tTotal = Date.now();
    logInfo("AUTH_LOGIN_SUCCESS", {
      request_id: ctx.requestId,
      user_id:    user.id,
      org_id:     user.orgId,
      db_ms:      tDbUser - t0,
      bcrypt_ms:  tBcryptEnd - tBcryptStart,
      session_ms: tSession - tBcryptEnd,
      total_ms:   tTotal - t0,
    });

    return {
      mfaRequired: false as const,
      user: stripPasswordHash(user),
      org,
      sessionId: session.token,
      rememberMe: input.rememberMe ?? false,
    };
  }),

  logout: protectedProcedure.input(z.object({}).optional()).mutation(async ({ ctx }) => {
    if (ctx.sessionId) {
      await clearSessionStepUp(ctx.sessionId);
      await clearSessionMfa(ctx.sessionId);
      // DB delete must complete before responding (correctness)
      await ctx.db.delete(sessions).where(eq(sessions.id, ctx.sessionId));
      // L1 + L2: await so the next request cannot read a stale Redis session.
      await invalidateSessionCache(ctx.sessionId);
    }
    return { success: true };
  }),

  /**
   * Exchange an MFA challenge token (from `login` when `mfaRequired`) plus a TOTP
   * code (or a one-time backup code) for a real session. On success the session
   * is marked MFA-verified. Public: no session exists yet at this point.
   */
  verifyMfa: publicProcedure
    .input(
      z.object({
        challengeToken: z.string().min(1),
        code: z.string().min(1),
        isBackupCode: z.boolean().optional(),
        rememberMe: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const userId = await consumeMfaChallenge(input.challengeToken);
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "MFA challenge expired or invalid" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.status === "disabled") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const [enrollment] = await db
        .select()
        .from(mfaEnrollments)
        .where(and(eq(mfaEnrollments.userId, userId), eq(mfaEnrollments.status, "active")))
        .limit(1);
      if (!enrollment) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "MFA not enrolled" });
      }

      let ok = false;
      if (input.isBackupCode) {
        const idx = await matchBackupCode(input.code, enrollment.backupCodes);
        if (idx >= 0) {
          ok = true;
          const remaining = enrollment.backupCodes.filter((_, i) => i !== idx);
          await db
            .update(mfaEnrollments)
            .set({ backupCodes: remaining, updatedAt: new Date() })
            .where(eq(mfaEnrollments.id, enrollment.id));
        }
      } else {
        ok = verifyTotp(decryptSecret(enrollment.totpSecret), input.code);
      }

      if (!ok) {
        logWarn("AUTH_MFA_FAIL", { user_id: userId, backup: input.isBackupCode ?? false });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA code" });
      }

      const session = await createSession(
        db,
        userId,
        ctx.ipAddress,
        ctx.userAgent,
        input.rememberMe ?? false,
      );
      await setSessionMfaVerified(session.token);

      await db
        .update(mfaEnrollments)
        .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(mfaEnrollments.id, enrollment.id));

      await db
        .update(users)
        .set({ lastLoginAt: new Date(), status: user.status === "invited" ? "active" : user.status })
        .where(eq(users.id, userId));

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.orgId))
        .limit(1);

      logInfo("AUTH_MFA_SUCCESS", { user_id: userId, org_id: user.orgId, backup: input.isBackupCode ?? false });

      return {
        user: stripPasswordHash(user),
        org,
        sessionId: session.token,
        rememberMe: input.rememberMe ?? false,
      };
    }),

  /** TOTP enrollment + management. */
  mfa: router({
    /** Current MFA state for the settings UI. */
    status: protectedProcedure.query(async ({ ctx }) => {
      const { db, user } = ctx;
      const [row] = await db
        .select({ status: mfaEnrollments.status, backupCodes: mfaEnrollments.backupCodes })
        .from(mfaEnrollments)
        .where(eq(mfaEnrollments.userId, user!.id))
        .limit(1);
      return {
        enrolled: row?.status === "active",
        pending: row?.status === "pending",
        backupCodesRemaining: row?.status === "active" ? row.backupCodes.length : 0,
      };
    }),

    /**
     * Begin enrollment: generate a fresh (pending) TOTP secret and return a QR
     * data URL + the secret for manual entry. Does NOT flip `mfaEnrolled`.
     * Overwrites any prior pending/active enrollment for this user.
     */
    startEnroll: protectedProcedure.input(z.object({}).optional()).mutation(async ({ ctx }) => {
      const { db, user } = ctx;
      const email = typeof user!.email === "string" ? user!.email : user!.id;
      const { secret, otpauthUri } = generateTotpSecret(email);
      const qrDataUrl = await buildQrDataUrl(otpauthUri);

      await db.delete(mfaEnrollments).where(eq(mfaEnrollments.userId, user!.id));
      await db.insert(mfaEnrollments).values({
        orgId: ctx.orgId!,
        userId: user!.id,
        totpSecret: encryptSecret(secret),
        status: "pending",
        backupCodes: [],
      });

      return { qrDataUrl, secret, otpauthUri };
    }),

    /**
     * Confirm enrollment with the first TOTP code. On success: status → active,
     * `users.mfaEnrolled = true`, and 10 one-time backup codes are returned ONCE.
     */
    confirmEnroll: protectedProcedure
      .input(z.object({ code: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { db, user } = ctx;
        const [enrollment] = await db
          .select()
          .from(mfaEnrollments)
          .where(and(eq(mfaEnrollments.userId, user!.id), eq(mfaEnrollments.status, "pending")))
          .limit(1);
        if (!enrollment) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No pending MFA enrollment; call startEnroll first" });
        }

        if (!verifyTotp(decryptSecret(enrollment.totpSecret), input.code)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA code" });
        }

        const { plaintext, hashes } = await generateBackupCodes(10);

        await db
          .update(mfaEnrollments)
          .set({
            status: "active",
            backupCodes: hashes,
            confirmedAt: new Date(),
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mfaEnrollments.id, enrollment.id));

        await db.update(users).set({ mfaEnrolled: true }).where(eq(users.id, user!.id));

        await db.insert(auditLogs).values({
          orgId: ctx.orgId!,
          userId: user!.id,
          action: "mfa_enrolled",
          resourceType: "security",
          resourceId: user!.id,
        });

        return { backupCodes: plaintext };
      }),

    /**
     * Disable MFA. Requires a valid current TOTP code (or backup code) to prove
     * possession. Removes the enrollment and clears `users.mfaEnrolled`.
     */
    disable: protectedProcedure
      .input(z.object({ code: z.string().min(1), isBackupCode: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, user } = ctx;
        const [enrollment] = await db
          .select()
          .from(mfaEnrollments)
          .where(and(eq(mfaEnrollments.userId, user!.id), eq(mfaEnrollments.status, "active")))
          .limit(1);
        if (!enrollment) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MFA is not enabled" });
        }

        const ok = input.isBackupCode
          ? (await matchBackupCode(input.code, enrollment.backupCodes)) >= 0
          : verifyTotp(decryptSecret(enrollment.totpSecret), input.code);
        if (!ok) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA code" });
        }

        await db.delete(mfaEnrollments).where(eq(mfaEnrollments.id, enrollment.id));
        await db.update(users).set({ mfaEnrolled: false }).where(eq(users.id, user!.id));
        if (ctx.sessionId) await clearSessionMfa(ctx.sessionId);

        await db.insert(auditLogs).values({
          orgId: ctx.orgId!,
          userId: user!.id,
          action: "mfa_disabled",
          resourceType: "security",
          resourceId: user!.id,
        });

        return { success: true };
      }),
  }),

  /**
   * Password re-check for privileged flows (US-SEC-001). Extends session trust for ~15 minutes.
   * Org must set `organizations.settings.security.requireStepUpForMatrixRoles` (e.g. `["finance_manager"]`).
   */
  verifyStepUp: protectedProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db, user, sessionId } = ctx;
      if (!sessionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active session" });
      }
      const [row] = await db.select().from(users).where(eq(users.id, user!.id)).limit(1);
      if (!row?.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account" });
      }
      const valid = await verifyPassword(input.password, row.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
      }
      await setSessionStepUpVerified(sessionId);
      const until = new Date(Date.now() + 15 * 60 * 1000);
      return { stepUpVerifiedUntil: until.toISOString() };
    }),

  /** Returns null when unauthenticated (HTTP 200) so clients do not treat routine “no session” as a 401 error. */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || !ctx.org) return null;
    // ctx.user is already ContextUser (passwordHash omitted by auth middleware).
    // avatarUrl holds an S3 object key; resolve a short-lived signed URL for display.
    let user = ctx.user;
    if (ctx.user.avatarUrl && !/^https?:\/\//.test(ctx.user.avatarUrl)) {
      try {
        const { signedDownloadUrl } = await import("../services/storage.js");
        user = { ...ctx.user, avatarUrl: await signedDownloadUrl(ctx.user.avatarUrl, 3600) };
      } catch {
        // storage not configured (e.g. tests) — leave the key as-is
      }
    }
    return { user, org: ctx.org };
  }),

  // ── Profile Update ──────────────────────────────────────────────────────

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100).optional(),
        phone: z.string().max(30).optional(),
        location: z.string().max(100).optional(),
        department: z.string().max(100).optional(),
        jobTitle: z.string().max(100).optional(),
        bio: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const [updated] = await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, user!.id))
        .returning();
      return stripPasswordHash(updated!);
    }),

  // ── Avatar Upload ───────────────────────────────────────────────────────

  uploadAvatar: protectedProcedure
    .input(
      z.object({
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        contentBase64: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const body = Buffer.from(input.contentBase64, "base64");
      if (body.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Avatar must be 5MB or smaller" });
      }
      const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
      const { putObject, signedDownloadUrl } = await import("../services/storage.js");
      const put = await putObject({
        orgId: user!.orgId,
        key: `avatars/${user!.id}.${ext}`,
        body,
        mimeType: input.mimeType,
      });
      const [updated] = await db
        .update(users)
        .set({ avatarUrl: put.key, updatedAt: new Date() })
        .where(eq(users.id, user!.id))
        .returning();
      const signed = await signedDownloadUrl(put.key, 3600);
      return { ...stripPasswordHash(updated!), avatarUrl: signed };
    }),

  // ── Password Change (authenticated) ────────────────────────────────────

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const [row] = await db.select().from(users).where(eq(users.id, user!.id)).limit(1);
      if (!row?.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account" });
      }
      const valid = await verifyPassword(input.currentPassword, row.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }
      const newHash = await hashPassword(input.newPassword);
      await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, user!.id));

      // Invalidate ALL active sessions for this user — prevents session hijacking
      // where an attacker with an old token retains access after the victim changes password.
      const userSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user!.id));
      if (userSessions.length > 0) {
        await db.delete(sessions).where(eq(sessions.userId, user!.id));
        // Clear in-memory/Redis session cache for each session
        for (const s of userSessions) {
          invalidateSessionCache(s.id).catch(() => {});
        }
      }

      return { success: true };
    }),

  // ── Password Reset ──────────────────────────────────────────────────────

  requestPasswordReset: publicProcedure
    .input(ForgotPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const email = normalizeEmail(input.email);

      // Always return success to prevent email enumeration
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user) {
        // Invalidate any previous reset tokens for this user
        await db
          .delete(verificationTokens)
          .where(
            and(
              eq(verificationTokens.identifier, user.id),
              eq(verificationTokens.type, "password_reset"),
            ),
          );

        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.insert(verificationTokens).values({
          identifier: user.id,
          token: tokenHash,
          type: "password_reset",
          expiresAt,
        });

        const resetUrl = `${process.env["AUTH_URL"] ?? "http://localhost:3000"}/reset-password/${rawToken}`;
        await sendTransactionalEmail(
          email,
          "Reset your CoheronConnect password",
          "We received a request to reset your password. This link expires in 1 hour. " +
            "If you didn't request this, you can safely ignore this email.",
          resetUrl,
        );
      }

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(ResetPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const tokenHash = createHash("sha256").update(input.token).digest("hex");

      const [record] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, tokenHash),
            eq(verificationTokens.type, "password_reset"),
          ),
        )
        .limit(1);

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired reset link" });
      }

      if (record.usedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link already used" });
      }

      if (record.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link has expired" });
      }

      const passwordHash = await hashPassword(input.password);

      await db.update(users).set({ passwordHash }).where(eq(users.id, record.identifier));

      // Mark token as used
      await db
        .update(verificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(verificationTokens.id, record.id));

      // Invalidate all active sessions (cache entries are per-token so we
      // can't enumerate them here — Redis keys expire via TTL, good enough)
      await db.delete(sessions).where(eq(sessions.userId, record.identifier));

      return { success: true };
    }),

  // ── Invite ──────────────────────────────────────────────────────────────

  inviteUser: permissionProcedure("users", "write")
    .input(InviteCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, user, org } = ctx;

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const inviteEmail = normalizeEmail(input.email);

      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, inviteEmail), eq(users.orgId, org!.id)))
        .limit(1);

      if (existingUsers.length === 0) {
        await db.insert(users).values({
          orgId: org!.id,
          email: inviteEmail,
          name: input.name || inviteEmail.split("@")[0] || "User",
          role: input.role,
          matrixRole: input.matrixRole,
          status: "invited",
        });
      }

      const [invite] = await db
        .insert(invites)
        .values({
          orgId: org!.id,
          invitedByUserId: user!.id,
          email: inviteEmail,
          role: input.role,
          token,
          expiresAt,
        })
        .returning();

      const inviteUrl = `${process.env["AUTH_URL"] ?? "http://localhost:3000"}/invite/${token}`;
      await sendTransactionalEmail(
        inviteEmail,
        `You've been invited to join ${org!.name} on CoheronConnect`,
        `${user!.name ?? "A teammate"} invited you to join ${org!.name} as ${input.role}. ` +
          "This invite expires in 7 days.",
        inviteUrl,
      );

      return { invite, inviteUrl };
    }),

  acceptInvite: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(2).max(100),
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const [invite] = await db
        .select()
        .from(invites)
        .where(eq(invites.token, input.token))
        .limit(1);

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite token" });
      }
      if (invite.acceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      const passwordHash = await hashPassword(input.password);
      
      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, invite.email), eq(users.orgId, invite.orgId)))
        .limit(1);

      let user;
      const firstExistingUser = existingUsers[0];
      if (firstExistingUser) {
        const [updatedUser] = await db
          .update(users)
          .set({
            name: input.name,
            passwordHash,
            status: "active",
          })
          .where(eq(users.id, firstExistingUser.id))
          .returning();
        user = updatedUser;
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            orgId: invite.orgId,
            email: invite.email,
            name: input.name,
            passwordHash,
            role: invite.role,
            status: "active",
          })
          .returning();
        user = newUser;
      }

      await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

      const session = await createSession(db, user!.id, ctx.ipAddress, ctx.userAgent);
      return { user: stripPasswordHash(user!), sessionId: session.token };
    }),

  // ── User Management ─────────────────────────────────────────────────────

  listUsers: permissionProcedure("users", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.orgId, org!.id))
      .orderBy(asc(users.name));
    return rows.map(stripPasswordHash);
  }),

  updateUserRole: permissionProcedure("users", "write")
    .input(z.object({
      userId: z.string().uuid(),
      role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
      matrixRole: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { userId, ...updates } = input;

      // Ensure user belongs to this org
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.orgId, org!.id)))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [updated] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      return stripPasswordHash(updated!);
    }),

  // ── Session Management ──────────────────────────────────────────────────

  deactivateUser: permissionProcedure("users", "write")
    .input(z.object({ userId: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (input.userId === user!.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
      }
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.orgId, org!.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      const [updated] = await db
        .update(users)
        .set({ status: input.active ? "active" : "disabled", updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning();
      return stripPasswordHash(updated!);
    }),

  deleteUser: permissionProcedure("users", "delete")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (input.userId === user!.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.orgId, org!.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),

  listMySessions: protectedProcedure.query(async ({ ctx }) => {
    const { db, user } = ctx;
    const rows = await db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, user!.id), sql`${sessions.expiresAt} > NOW()`))
      .orderBy(desc(sessions.createdAt));

    return rows.map((s: typeof rows[number]) => ({
      ...s,
      isCurrent: s.id === ctx.sessionId,
    }));
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      await db
        .delete(sessions)
        .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, user!.id)));
      await invalidateSessionCache(input.sessionId);
      return { success: true };
    }),
});
