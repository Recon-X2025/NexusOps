import { router, publicProcedure, macProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizations, users, sessions, eq, desc, count, and, sql } from "@coheronconnect/db";
import { ensureDefaultTicketStatusesForOrg } from "../lib/ensure-ticket-workflow";
import jwt from "jsonwebtoken";

/**
 * The MAC (platform super-admin) surface is disabled unless `MAC_ENABLED` is
 * explicitly set to "true". Defense-in-depth: even with valid operator creds,
 * the cross-tenant control plane is off by default (e.g. in production) and
 * must be deliberately turned on. Throws NOT_FOUND so a disabled MAC surface is
 * indistinguishable from one that does not exist.
 */
function assertMacEnabled(): void {
  if (process.env["MAC_ENABLED"] !== "true") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
}

function getPlanFeatureDefaults(plan: string): Record<string, boolean> {
  const base = { ai_features: false, advanced_workflows: false, custom_branding: false, sso: false, api_access: true, reports: true };
  if (plan === "starter") return { ...base, ai_features: false, advanced_workflows: true };
  if (plan === "professional") return { ...base, ai_features: true, advanced_workflows: true, custom_branding: true };
  if (plan === "enterprise") return { ...base, ai_features: true, advanced_workflows: true, custom_branding: true, sso: true };
  return base;
}

export const macRouter = router({
  // MAC operator login — validates against MAC_OPERATOR_EMAIL + MAC_OPERATOR_PASSWORD
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input }) => {
      assertMacEnabled();
      const macEmail = process.env["MAC_OPERATOR_EMAIL"];
      const macPassword = process.env["MAC_OPERATOR_PASSWORD"];
      const macSecret = process.env["MAC_JWT_SECRET"];

      if (!macEmail || !macPassword || !macSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "MAC not configured — set MAC_OPERATOR_EMAIL, MAC_OPERATOR_PASSWORD, MAC_JWT_SECRET",
        });
      }
      if (input.email !== macEmail || input.password !== macPassword) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { email: input.email, role: "mac_operator" },
        macSecret,
        { expiresIn: "15m" },
      );
      return { token };
    }),

  // Platform-wide stats
  stats: macProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const [orgCount] = await db.select({ count: count() }).from(organizations);
    const [userCount] = await db.select({ count: count() }).from(users);
    const recentOrgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(5);

    return {
      orgs: orgCount?.count ?? 0,
      users: userCount?.count ?? 0,
      recentOrgs,
    };
  }),

  // List all organizations (paginated, optional search)
  listOrganizations: macProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const limit = 50;
      const offset = (input.page - 1) * limit;

      const rows = await db
        .select()
        .from(organizations)
        .orderBy(desc(organizations.createdAt))
        .limit(limit)
        .offset(offset);

      if (input.search) {
        const q = input.search.toLowerCase();
        return rows.filter(
          (r: (typeof rows)[number]) =>
            r.name.toLowerCase().includes(q) ||
            r.slug.toLowerCase().includes(q),
        );
      }

      return rows;
    }),

  // Get a single organization by ID
  getOrganization: macProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1);

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }
      return org;
    }),

  // List users within a specific organization
  listOrgUsers: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.orgId, input.orgId))
        .orderBy(desc(users.createdAt));
    }),

  // Create a new organization and record admin email for provisioning
  createOrganization: macProcedure
    .input(
      z.object({
        name: z.string().min(2).max(200),
        plan: z.enum(["free", "starter", "professional", "enterprise"]).default("free"),
        adminEmail: z.string().email(),
        adminName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);

      const [org] = await db
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          plan: input.plan,
        })
        .returning();

      await ensureDefaultTicketStatusesForOrg(db, org!.id);

      return { org, adminEmail: input.adminEmail };
    }),

  // Suspend an organization by setting settings.suspended = true
  suspendOrganization: macProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const [existing] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      await db
        .update(organizations)
        .set({
          settings: { ...(existing.settings ?? {}), suspended: true },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, input.id));

      return { ok: true };
    }),

  // Resume an organization by clearing settings.suspended
  resumeOrganization: macProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const [existing] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const { suspended: _removed, ...rest } = (existing.settings ?? {}) as Record<string, unknown> & { suspended?: unknown };

      await db
        .update(organizations)
        .set({
          settings: rest,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, input.id));

      return { ok: true };
    }),

  // Revoke all sessions for users in an organization
  revokeOrgSessions: macProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      // Get all user IDs in this org
      const orgUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.orgId, input.id));

      if (orgUsers.length === 0) return { ok: true, revoked: 0 };

      // Delete sessions for each user
      let revoked = 0;
      for (const u of orgUsers) {
        const deleted = await db
          .delete(sessions)
          .where(eq(sessions.userId, u.id))
          .returning({ id: sessions.id });
        revoked += deleted.length;
      }

      return { ok: true, revoked };
    }),

  // P1.1 — Legal acceptance tracking
  recordLegalAcceptance: macProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      documentType: z.enum(["terms_of_service", "data_processing_agreement", "privacy_policy"]),
      version: z.string(),
      acceptedByEmail: z.string().email(),
      acceptedAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const legalAcceptance = (existing.legalAcceptance ?? {}) as Record<string, unknown>;
      legalAcceptance[input.documentType] = {
        version: input.version,
        acceptedByEmail: input.acceptedByEmail,
        acceptedAt: input.acceptedAt,
      };
      await db.update(organizations).set({ settings: { ...existing, legalAcceptance } }).where(eq(organizations.id, input.orgId));
      return { ok: true };
    }),

  getLegalAcceptance: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, input.orgId));
      return (org?.settings as Record<string, unknown>)?.legalAcceptance ?? {};
    }),

  // P1.2 — Stripe billing
  getBillingInfo: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      return {
        plan: org.plan,
        stripeCustomerId: settings.stripeCustomerId as string | undefined,
        trialEndsAt: settings.trialEndsAt as string | undefined,
        subscriptionStatus: settings.subscriptionStatus as string | undefined,
      };
    }),

  updateBillingInfo: macProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
      stripeCustomerId: z.string().optional(),
      trialEndsAt: z.string().datetime().optional(),
      subscriptionStatus: z.enum(["active", "past_due", "canceled", "trialing", "unpaid"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = (org.settings ?? {}) as Record<string, unknown>;
      if (input.stripeCustomerId) existing.stripeCustomerId = input.stripeCustomerId;
      if (input.trialEndsAt) existing.trialEndsAt = input.trialEndsAt;
      if (input.subscriptionStatus) existing.subscriptionStatus = input.subscriptionStatus;
      if (input.plan) {
        await db.update(organizations).set({ plan: input.plan, settings: existing }).where(eq(organizations.id, input.orgId));
      } else {
        await db.update(organizations).set({ settings: existing }).where(eq(organizations.id, input.orgId));
      }
      return { ok: true };
    }),

  // P2.1 — Feature flags
  getFeatureFlags: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select({ settings: organizations.settings, plan: organizations.plan }).from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const planDefaults = getPlanFeatureDefaults(org.plan);
      const overrides = (settings.featureFlags ?? {}) as Record<string, boolean>;
      return { ...planDefaults, ...overrides };
    }),

  setFeatureFlag: macProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      flag: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const flags = (existing.featureFlags ?? {}) as Record<string, boolean>;
      flags[input.flag] = input.enabled;
      await db.update(organizations).set({ settings: { ...existing, featureFlags: flags } }).where(eq(organizations.id, input.orgId));
      return { ok: true };
    }),

  resetFeatureFlags: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const { featureFlags: _removed, ...rest } = existing;
      await db.update(organizations).set({ settings: rest }).where(eq(organizations.id, input.orgId));
      return { ok: true };
    }),

  // P2.2 — Per-tenant health dashboard
  getOrgHealth: macProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const [userCount] = await db.select({ count: count() }).from(users).where(eq(users.orgId, input.orgId));
      return {
        org,
        userCount: userCount?.count ?? 0,
        status: org.settings?.suspended ? "suspended" : "healthy",
      };
    }),

  // P2.3 — Time-boxed operator impersonation
  startImpersonation: macProcedure
    .input(z.object({
      targetUserId: z.string().uuid(),
      reason: z.string().min(10),
      durationMinutes: z.number().int().min(5).max(60).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [targetUser] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, input.targetUserId));
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const jwtSecret = process.env["JWT_SECRET"];
      const macSecret = process.env["MAC_JWT_SECRET"];
      if (!jwtSecret || !macSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
      const impersonationToken = jwt.sign(
        { sub: input.targetUserId, impersonated: true, reason: input.reason, exp: Math.floor(expiresAt.getTime() / 1000) },
        jwtSecret,
      );

      return { impersonationToken, expiresAt: expiresAt.toISOString(), redirectUrl: `${process.env["WEB_URL"] ?? "http://localhost:3000"}/app?token=${impersonationToken}` };
    }),

  // P2 — Search users across all orgs
  searchUsers: macProcedure
    .input(z.object({ email: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          orgId: users.orgId,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(sql`lower(${users.email}) like ${"%" + input.email.toLowerCase() + "%"}`)
        .limit(20);
    }),

  // P3.1 — Analytics overview
  analyticsOverview: macProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const [orgCount] = await db.select({ count: count() }).from(organizations);
    const [userCount] = await db.select({ count: count() }).from(users);

    const orgsByPlan = await db
      .select({ plan: organizations.plan, count: count() })
      .from(organizations)
      .groupBy(organizations.plan);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const recentOrgs = await db
      .select()
      .from(organizations)
      .where(sql`${organizations.createdAt} >= ${twelveMonthsAgo.toISOString()}`)
      .orderBy(organizations.createdAt);

    return { orgCount: orgCount?.count ?? 0, userCount: userCount?.count ?? 0, orgsByPlan, recentOrgs };
  }),

  // P3 — All orgs with user counts (for churn risk)
  listOrgsWithHealth: macProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
    const userCounts = await db.select({ orgId: users.orgId, count: count() }).from(users).groupBy(users.orgId);
    const ucMap = new Map(userCounts.map((u: (typeof userCounts)[number]) => [u.orgId, u.count]));
    return orgs.map((org: (typeof orgs)[number]) => ({
      ...org,
      userCount: ucMap.get(org.id) ?? 0,
    }));
  }),
});
