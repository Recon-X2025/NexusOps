import { router, publicProcedure, protectedProcedure, permissionProcedure } from "../lib/trpc";
import { invalidateSessionCache } from "../middleware/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  users,
  organizations,
  sessions,
  invites,
  verificationTokens,
  roles,
  userRoles,
  eq,
  and,
  sql,
  asc,
  desc,
} from "@nexusops/db";
import {
  SignupSchema,
  LoginSchema,
  InviteCreateSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@nexusops/types";
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import { recordFailedLogin, clearLoginAttempts } from "../lib/login-rate-limit";
import { hashSessionToken } from "../middleware/auth";

/** Never return password hashes to clients. */
function stripPasswordHash<T extends { passwordHash?: string | null }>(row: T) {
  const { passwordHash: _p, ...safe } = row;
  return safe;
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

/** Create a session, store token hash in DB, return plaintext token to client. */
export async function createSession(
  db: ReturnType<typeof import("@nexusops/db").getDb>,
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
) {
  const tokenPlaintext = nanoid(32);
  const tokenHash = hashSessionToken(tokenPlaintext);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
    ipAddress,
    userAgent,
  });

  console.log("SESSION INSERTED HASH:", tokenHash);

  return tokenPlaintext; // Return plaintext; DB stores hash
}

export const authRouter = router({
  signup: publicProcedure.input(SignupSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
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

    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        orgId: org!.id,
        email: input.email,
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
    return { user: stripPasswordHash(user!), org, sessionId };
  }),

  login: publicProcedure.input(LoginSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user) {
      await recordFailedLogin(input.email, ctx.ipAddress);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    if (user.status === "disabled") {
      await recordFailedLogin(input.email, ctx.ipAddress);
      throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled" });
    }

    if (!user.passwordHash) {
      await recordFailedLogin(input.email, ctx.ipAddress);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      await recordFailedLogin(input.email, ctx.ipAddress);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    await clearLoginAttempts(input.email);

    const sessionId = await createSession(db, user.id, ctx.ipAddress, ctx.userAgent);
    console.log("LOGIN SUCCESS USER:", user.id);
    console.log("SESSION PLAINTEXT:", sessionId);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);

    return { user: stripPasswordHash(user), org, sessionId };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionId) {
      await ctx.db.delete(sessions).where(eq(sessions.id, ctx.sessionId));
      await invalidateSessionCache(ctx.sessionId);
    }
    return { success: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return { user: stripPasswordHash(ctx.user!), org: ctx.org };
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
      return { success: true };
    }),

  // ── Password Reset ──────────────────────────────────────────────────────

  requestPasswordReset: publicProcedure
    .input(ForgotPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      // Always return success to prevent email enumeration
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, input.email))
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
        console.info(`[PASSWORD RESET] URL for ${input.email}: ${resetUrl}`);
        // TODO (Phase 2): send via notification service email
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

      const [invite] = await db
        .insert(invites)
        .values({
          orgId: org!.id,
          invitedByUserId: user!.id,
          email: input.email,
          role: input.role,
          token,
          expiresAt,
        })
        .returning();

      const inviteUrl = `${process.env["AUTH_URL"] ?? "http://localhost:3000"}/invite/${token}`;
      console.info(`[INVITE] URL for ${input.email}: ${inviteUrl}`);
      // TODO (Phase 2): send via notification service email

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
      const [user] = await db
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

      await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

      const sessionId = await createSession(db, user!.id, ctx.ipAddress, ctx.userAgent);
      return { user: stripPasswordHash(user!), sessionId };
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
