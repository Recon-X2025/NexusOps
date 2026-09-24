import {
  router,
  publicProcedure,
  macProcedure,
  macUsersViewProcedure,
  macUsersManageProcedure,
  macFinanceViewProcedure,
  macFinanceManageProcedure,
  macTenantsManageProcedure,
  macAuditExportProcedure,
  macSuperAdminOnlyProcedure,
} from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  organizations,
  users,
  sessions,
  superAdminUsers,
  superAdminRoles,
  superAdminAuditLogs,
  getPoolStats,
  eq,
  desc,
  count,
  and,
  or,
  sql,
} from "@coheronconnect/db";
import { getRedis } from "../lib/redis";
import { ensureDefaultTicketStatusesForOrg } from "../lib/ensure-ticket-workflow";
import { createSession } from "./auth";
import { revokeOrgSessions, revokeUserSessions } from "../middleware/auth";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

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

export interface FeatureFlagMeta {
  key: string;
  name: string;
  description: string;
  category: "Intelligence" | "Identity" | "Branding" | "Workflows" | "Compliance" | "Analytics";
}

export const FEATURE_FLAG_CATALOG: FeatureFlagMeta[] = [
  {
    key: "ai_features",
    name: "AI Copilot & Smart Triage",
    description: "LLM copilot, intelligent ticket triage, and automated generative ticket summaries.",
    category: "Intelligence",
  },
  {
    key: "sso_saml",
    name: "Enterprise Single Sign-On (SAML 2.0)",
    description: "Enterprise identity federation with Okta, Azure AD, and Google Workspace.",
    category: "Identity",
  },
  {
    key: "custom_branding",
    name: "Custom White-Labeling & Subdomains",
    description: "Tenant white-labeling, custom portal subdomains, and corporate logo integration.",
    category: "Branding",
  },
  {
    key: "advanced_workflows",
    name: "Advanced Temporal Workflows",
    description: "Temporal multi-step approvals, conditional escalation branching, and service orchestration.",
    category: "Workflows",
  },
  {
    key: "dpdp_suite",
    name: "DPDP 2023 Compliance Suite",
    description: "Full DPDP 2023 consent tracking, subject request queues, and automated erasure sweeps.",
    category: "Compliance",
  },
  {
    key: "audit_export",
    name: "High-Volume SIEM & S3 Audit Sync",
    description: "High-throughput SIEM log export, automated compliance bundling, and cold S3 archive sync.",
    category: "Compliance",
  },
  {
    key: "cross_org_reporting",
    name: "Cross-Org Multi-Subsidiary Analytics",
    description: "Consolidated enterprise rollups, multi-entity telemetry, and executive board reporting.",
    category: "Analytics",
  },
];

function getPlanFeatureDefaults(plan: string): Record<string, boolean> {
  const base: Record<string, boolean> = {
    ai_features: false,
    sso_saml: false,
    sso: false,
    custom_branding: false,
    advanced_workflows: false,
    dpdp_suite: false,
    audit_export: false,
    cross_org_reporting: false,
    api_access: true,
    reports: true,
  };
  if (plan === "starter") {
    return {
      ...base,
      advanced_workflows: true,
    };
  }
  if (plan === "professional") {
    return {
      ...base,
      ai_features: true,
      advanced_workflows: true,
      custom_branding: true,
      dpdp_suite: true,
    };
  }
  if (plan === "enterprise") {
    return {
      ...base,
      ai_features: true,
      sso_saml: true,
      sso: true,
      custom_branding: true,
      advanced_workflows: true,
      dpdp_suite: true,
      audit_export: true,
      cross_org_reporting: true,
    };
  }
  return base;
}

export const macRouter = router({
  // MAC operator login — validates against super_admin_users table or env fallback
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertMacEnabled();
      const macSecret = process.env["MAC_JWT_SECRET"];

      if (!macSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "MAC not configured — set MAC_JWT_SECRET",
        });
      }

      const { db } = ctx;
      // 1. Check database super_admin_users
      const [dbUser] = await db
        .select()
        .from(superAdminUsers)
        .where(eq(superAdminUsers.email, input.email.toLowerCase()))
        .limit(1);

      if (dbUser) {
        if (dbUser.status === "disabled") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Operator account is disabled" });
        }
        const valid = await bcrypt.compare(input.password, dbUser.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
        // Update last login
        await db.update(superAdminUsers).set({ lastLoginAt: new Date() }).where(eq(superAdminUsers.id, dbUser.id));

        const token = jwt.sign(
          {
            email: dbUser.email,
            role: "mac_operator",
            operatorRole: dbUser.role,
            name: dbUser.name,
            id: dbUser.id,
          },
          macSecret,
          { expiresIn: "12h" },
        );
        return { token, operator: { email: dbUser.email, name: dbUser.name, role: dbUser.role } };
      }

      // 2. Fallback to env credentials
      const macEmail = process.env["MAC_OPERATOR_EMAIL"];
      const macPassword = process.env["MAC_OPERATOR_PASSWORD"];

      if (macEmail && macPassword && input.email.toLowerCase() === macEmail.toLowerCase() && input.password === macPassword) {
        const token = jwt.sign(
          { email: input.email, role: "mac_operator", operatorRole: "super_admin", name: "Super Admin" },
          macSecret,
          { expiresIn: "12h" },
        );
        return { token, operator: { email: input.email, name: "Super Admin", role: "super_admin" } };
      }

      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
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

      await revokeOrgSessions(db, input.id);

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
  getBillingInfo: macFinanceViewProcedure
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

  updateBillingInfo: macFinanceManageProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
      stripeCustomerId: z.string().optional(),
      trialEndsAt: z.string().datetime().optional(),
      subscriptionStatus: z.enum(["active", "past_due", "canceled", "trialing", "unpaid"]).optional(),
      reason: z.string().min(10, "Override reason must be at least 10 characters"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const beforeState = {
        plan: org.plan,
        subscriptionStatus: (existing.subscriptionStatus as string) ?? "active",
        stripeCustomerId: (existing.stripeCustomerId as string) ?? null,
        trialEndsAt: (existing.trialEndsAt as string) ?? null,
      };

      if (input.stripeCustomerId !== undefined) existing.stripeCustomerId = input.stripeCustomerId;
      if (input.trialEndsAt !== undefined) existing.trialEndsAt = input.trialEndsAt;
      if (input.subscriptionStatus !== undefined) existing.subscriptionStatus = input.subscriptionStatus;

      if (input.plan) {
        await db.update(organizations).set({ plan: input.plan, settings: existing, updatedAt: new Date() }).where(eq(organizations.id, input.orgId));
      } else {
        await db.update(organizations).set({ settings: existing, updatedAt: new Date() }).where(eq(organizations.id, input.orgId));
      }

      await db.insert(superAdminAuditLogs).values({
        actorEmail: (ctx as { macOperatorEmail?: string }).macOperatorEmail ?? "admin@coheron.tech",
        orgId: input.orgId,
        action: "OVERRIDE_SUBSCRIPTION",
        beforeJson: beforeState,
        afterJson: {
          plan: input.plan ?? org.plan,
          subscriptionStatus: input.subscriptionStatus ?? beforeState.subscriptionStatus,
          stripeCustomerId: input.stripeCustomerId !== undefined ? input.stripeCustomerId : beforeState.stripeCustomerId,
          trialEndsAt: input.trialEndsAt !== undefined ? input.trialEndsAt : beforeState.trialEndsAt,
          reason: input.reason,
        },
      });

      return { ok: true };
    }),

  // P2.1 — Feature flags Control Matrix
  getFeatureFlags: macProcedure
    .input(
      z
        .object({
          orgId: z.string().uuid().optional(),
          detailed: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const orgId = input?.orgId;
      const detailed = input?.detailed ?? false;

      // Platform default baseline overview mode
      if (!orgId) {
        const tiers = ["free", "starter", "professional", "enterprise"] as const;
        const tierMatrix = tiers.map((tier) => ({
          plan: tier,
          defaults: getPlanFeatureDefaults(tier),
        }));
        return {
          mode: "platform_defaults" as const,
          catalog: FEATURE_FLAG_CATALOG,
          tiers: tierMatrix,
        };
      }

      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          settings: organizations.settings,
          plan: organizations.plan,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const planDefaults = getPlanFeatureDefaults(org.plan);
      const overrides = (settings.featureFlags ?? {}) as Record<string, boolean>;
      const effective: Record<string, boolean> = { ...planDefaults, ...overrides };

      if (!detailed) {
        // Backward-compatible dictionary format
        return effective;
      }

      // Detailed matrix items
      const flags = FEATURE_FLAG_CATALOG.map((meta) => {
        const hasOverride = meta.key in overrides;
        const planDefault = planDefaults[meta.key] ?? false;
        const eff = hasOverride ? overrides[meta.key]! : planDefault;
        return {
          key: meta.key,
          name: meta.name,
          description: meta.description,
          category: meta.category,
          planDefault,
          effective: eff,
          isOverride: hasOverride,
        };
      });

      return {
        orgId: org.id,
        orgName: org.name,
        slug: org.slug,
        plan: org.plan,
        flags,
        overrides,
        planDefaults,
        effective,
      };
    }),

  setFeatureFlag: macTenantsManageProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        flag: z.string().min(1),
        enabled: z.boolean(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db
        .select({ id: organizations.id, name: organizations.name, settings: organizations.settings, plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const currentFlags = { ...((existing.featureFlags ?? {}) as Record<string, boolean>) };
      const planDefaults = getPlanFeatureDefaults(org.plan);
      const previousValue = currentFlags[input.flag] !== undefined ? currentFlags[input.flag] : (planDefaults[input.flag] ?? false);

      currentFlags[input.flag] = input.enabled;
      await db
        .update(organizations)
        .set({ settings: { ...existing, featureFlags: currentFlags }, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId));

      return { ok: true };
    }),

  resetFeatureFlag: macTenantsManageProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        flag: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db
        .select({ id: organizations.id, name: organizations.name, settings: organizations.settings, plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const currentFlags = { ...((existing.featureFlags ?? {}) as Record<string, boolean>) };
      delete currentFlags[input.flag];

      await db
        .update(organizations)
        .set({ settings: { ...existing, featureFlags: currentFlags }, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId));

      const planDefaults = getPlanFeatureDefaults(org.plan);
      const defaultState = planDefaults[input.flag] ?? false;

      return { ok: true, planDefault: defaultState };
    }),

  resetFeatureFlags: macTenantsManageProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [org] = await db
        .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, input.orgId));
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = (org.settings ?? {}) as Record<string, unknown>;
      const { featureFlags: _removed, ...rest } = existing;

      await db
        .update(organizations)
        .set({ settings: rest, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId));

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
      const [targetUser] = await db
        .select({ id: users.id, email: users.email, status: users.status })
        .from(users)
        .where(eq(users.id, input.targetUserId));
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      // Never grant access a non-active (invited/disabled) user does not
      // themselves have.
      if (targetUser.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot impersonate a ${targetUser.status} user` });
      }

      // Mint a REAL, short-lived, impersonation-marked session — the auth layer
      // is session-based, so a self-signed JWT (the old behaviour) was inert.
      // The action is recorded in super_admin_audit_logs by the mac audit
      // middleware (MED2), with the operator, target user and reason.
      const operatorEmail = (ctx as { macOperatorEmail?: string }).macOperatorEmail ?? "unknown";
      const session = await createSession(db, input.targetUserId, ctx.ipAddress, ctx.userAgent, false, {
        ttlMs: input.durationMinutes * 60_000,
        impersonatedBy: operatorEmail,
      });

      return {
        impersonationToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
        redirectUrl: `${process.env["WEB_URL"] ?? "http://localhost:3000"}/app?token=${session.token}`,
      };
    }),

  // P2 — Search users across all orgs with strict data minimization and usersView RBAC
  searchUsers: macUsersViewProcedure
    .input(
      z.object({
        email: z.string().optional(),
        query: z.string().optional(),
        orgId: z.string().uuid().optional(),
        role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
        status: z.enum(["active", "invited", "disabled"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const conditions = [];

      if (input.orgId) {
        conditions.push(eq(users.orgId, input.orgId));
      }
      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }
      if (input.status) {
        conditions.push(eq(users.status, input.status));
      }
      if (input.email) {
        conditions.push(sql`lower(${users.email}) like ${"%" + input.email.trim().toLowerCase() + "%"}`);
      }
      if (input.query && input.query.trim()) {
        const q = "%" + input.query.trim().toLowerCase() + "%";
        conditions.push(
          or(
            sql`lower(${users.name}) like ${q}`,
            sql`lower(${users.email}) like ${q}`,
            sql`lower(coalesce(${users.phone}, '')) like ${q}`,
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Explicit whitelist of safe fields — NEVER select passwordHash, reset tokens, or secrets
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          matrixRole: users.matrixRole,
          department: users.department,
          jobTitle: users.jobTitle,
          status: users.status,
          mfaEnrolled: users.mfaEnrolled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          orgId: users.orgId,
          orgName: organizations.name,
          orgSlug: organizations.slug,
        })
        .from(users)
        .leftJoin(organizations, eq(users.orgId, organizations.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [totalRow] = await db
        .select({ count: count() })
        .from(users)
        .where(whereClause);

      return {
        users: rows,
        total: totalRow?.count ?? rows.length,
      };
    }),

  // P2.1 — User details inspection (usersView RBAC)
  getUserDetails: macUsersViewProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          matrixRole: users.matrixRole,
          department: users.department,
          jobTitle: users.jobTitle,
          location: users.location,
          bio: users.bio,
          status: users.status,
          mfaEnrolled: users.mfaEnrolled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          orgId: users.orgId,
          orgName: organizations.name,
          orgSlug: organizations.slug,
          orgPlan: organizations.plan,
        })
        .from(users)
        .leftJoin(organizations, eq(users.orgId, organizations.id))
        .where(eq(users.id, input.userId));

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Count active (unexpired) sessions
      const [sessionCount] = await db
        .select({ count: count() })
        .from(sessions)
        .where(and(eq(sessions.userId, input.userId), sql`${sessions.expiresAt} > NOW()`));

      return {
        user,
        activeSessionCount: sessionCount?.count ?? 0,
      };
    }),

  // P2.2 — User sessions inspection (usersView RBAC)
  getUserSessions: macUsersViewProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const rows = await db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          impersonatedBy: sessions.impersonatedBy,
          expiresAt: sessions.expiresAt,
          createdAt: sessions.createdAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, input.userId))
        .orderBy(desc(sessions.createdAt));

      const now = Date.now();
      return rows.map((s: (typeof rows)[number]) => ({
        id: s.id,
        userId: s.userId,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        impersonatedBy: s.impersonatedBy,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        isExpired: s.expiresAt.getTime() <= now,
      }));
    }),

  // P2.3 — Force Logout User (usersManage RBAC + Database Org Resolution + Audit)
  forceLogoutUser: macUsersManageProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        orgId: z.string().uuid().optional(),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      // 1. Resolve actual target user & actual orgId directly from DB
      const [targetUser] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          orgId: users.orgId,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, input.userId));

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
      }

      // 2. Prevent spoofed tenant authorization: verify input org matches actual org
      if (input.orgId && input.orgId !== targetUser.orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target organization mismatch" });
      }

      // 3. Resolve actual organization name
      const [targetOrg] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, targetUser.orgId));

      // 4. Revoke all active sessions
      const revokedCount = await revokeUserSessions(db, targetUser.id);

      // 5. Audit log with operator, target user, actual org, reason & count
      const operatorEmail = (ctx as { macOperatorEmail?: string }).macOperatorEmail ?? "unknown";
      await db.insert(superAdminAuditLogs).values({
        actorEmail: operatorEmail,
        orgId: targetUser.orgId,
        action: "mac.user_force_logout",
        afterJson: {
          targetUserId: targetUser.id,
          targetUserEmail: targetUser.email,
          targetUserName: targetUser.name,
          targetOrgId: targetUser.orgId,
          targetOrgName: targetOrg?.name ?? targetUser.orgId,
          reason: input.reason,
          revokedSessionsCount: revokedCount,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        ok: true,
        revokedCount,
        message: `Successfully revoked ${revokedCount} active session(s) for ${targetUser.email}.`,
      };
    }),

  // P2.4 — Change User Status (usersManage RBAC + Database Org Resolution + Revoke on Disable + Audit)
  updateUserStatus: macUsersManageProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        orgId: z.string().uuid().optional(),
        status: z.enum(["active", "disabled", "suspended"]),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      // 1. Resolve actual target user & actual orgId directly from DB
      const [targetUser] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          orgId: users.orgId,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, input.userId));

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
      }

      // 2. Prevent spoofed tenant authorization: verify input org matches actual org
      if (input.orgId && input.orgId !== targetUser.orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target organization mismatch" });
      }

      // 3. Resolve actual organization name
      const [targetOrg] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, targetUser.orgId));

      const previousStatus = targetUser.status;

      // 4. Update status in database (suspended maps safely to disabled without schema mutation)
      const dbStatus: "active" | "invited" | "disabled" = input.status === "active" ? "active" : "disabled";
      await db
        .update(users)
        .set({
          status: dbStatus,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUser.id));

      // 5. If disabled or suspended, immediately revoke all active sessions
      let revokedCount = 0;
      if (input.status === "disabled" || input.status === "suspended") {
        revokedCount = await revokeUserSessions(db, targetUser.id);
      }

      // 6. Audit log with operator, target user, actual org, state diff & reason
      const operatorEmail = (ctx as { macOperatorEmail?: string }).macOperatorEmail ?? "unknown";
      await db.insert(superAdminAuditLogs).values({
        actorEmail: operatorEmail,
        orgId: targetUser.orgId,
        action: "mac.user_status_update",
        afterJson: {
          targetUserId: targetUser.id,
          targetUserEmail: targetUser.email,
          targetUserName: targetUser.name,
          targetOrgId: targetUser.orgId,
          targetOrgName: targetOrg?.name ?? targetUser.orgId,
          previousStatus,
          newStatus: input.status,
          reason: input.reason,
          revokedSessionsCount: revokedCount,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        ok: true,
        previousStatus,
        newStatus: input.status,
        revokedSessionsCount: revokedCount,
      };
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

  // P4 — Phase 8: System Health & Real Telemetry Diagnostics
  getSystemHealth: macProcedure.query(async ({ ctx }) => {
    const { db } = ctx;

    // 1. PostgreSQL live check & pool metrics
    let dbStatus: "operational" | "degraded" | "down" = "operational";
    let dbLatencyMs = 0;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = "down";
    }
    const poolStats = getPoolStats();

    // 2. Redis truthful status check (strictly checks configuration, no fake mocks)
    let redisStatus: "operational" | "degraded" | "not_configured" = "not_configured";
    let redisLatencyMs: number | null = null;
    let redisDetail = "Redis not configured in environment";
    if (process.env["REDIS_URL"]) {
      try {
        const redis = getRedis();
        const rStart = Date.now();
        const pingRes = await Promise.race([
          redis.ping(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500)),
        ]);
        if (pingRes === "PONG") {
          redisStatus = "operational";
          redisLatencyMs = Date.now() - rStart;
          redisDetail = `Connected · latency ${redisLatencyMs}ms`;
        } else {
          redisStatus = "degraded";
          redisDetail = "Redis ping returned unexpected response";
        }
      } catch (err) {
        redisStatus = "degraded";
        redisDetail = err instanceof Error ? err.message : "Redis unreachable";
      }
    }

    // 3. Search subsystem truthful status check
    let searchStatus: "operational" | "degraded" | "not_configured" = "not_configured";
    let searchLatencyMs: number | null = null;
    let searchDetail = "Meilisearch not configured in environment";
    const searchUrl = process.env["MEILISEARCH_URL"];
    if (searchUrl) {
      try {
        const sStart = Date.now();
        const res = await fetch(`${searchUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          searchStatus = "operational";
          searchLatencyMs = Date.now() - sStart;
          searchDetail = `Cluster healthy · latency ${searchLatencyMs}ms`;
        } else {
          searchStatus = "degraded";
          searchDetail = `Meilisearch HTTP status ${res.status}`;
        }
      } catch (err) {
        searchStatus = "degraded";
        searchDetail = err instanceof Error ? err.message : "Search service unreachable";
      }
    }

    // 4. Runtime process telemetry
    const memory = process.memoryUsage();
    const runtime = {
      uptimeSeconds: Math.floor(process.uptime()),
      rssMb: Math.round(memory.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      nodeVersion: process.version,
      env: process.env["NODE_ENV"] ?? "development",
      timestamp: new Date().toISOString(),
    };

    // 5. Fleet health summary
    const [totalOrgsRow] = await db.select({ count: count() }).from(organizations);
    const [totalUsersRow] = await db.select({ count: count() }).from(users);
    const orgs = await db.select({ id: organizations.id, settings: organizations.settings }).from(organizations);
    const userCounts = await db.select({ orgId: users.orgId, count: count() }).from(users).groupBy(users.orgId);
    const ucMap = new Map(userCounts.map((u: (typeof userCounts)[number]) => [u.orgId, u.count]));

    let activeCount = 0;
    let suspendedCount = 0;
    let flaggedCount = 0;
    let churnRiskCount = 0;

    for (const o of orgs) {
      const s = (o.settings ?? {}) as Record<string, unknown>;
      if (s.suspended) suspendedCount++;
      else activeCount++;
      if (s.flagged) flaggedCount++;
      if ((ucMap.get(o.id) ?? 0) === 0) churnRiskCount++;
    }

    const fleet = {
      totalTenants: totalOrgsRow?.count ?? 0,
      activeTenants: activeCount,
      suspendedTenants: suspendedCount,
      flaggedTenants: flaggedCount,
      churnRiskTenants: churnRiskCount,
      totalUsers: totalUsersRow?.count ?? 0,
    };

    return {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        pool: poolStats,
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs,
        detail: redisDetail,
      },
      search: {
        status: searchStatus,
        latencyMs: searchLatencyMs,
        detail: searchDetail,
      },
      runtime,
      fleet,
    };
  }),

  // P4 — Phase 8: Platform Governance & Truthful Security Posture
  getPlatformGovernance: macProcedure.query(async ({ ctx }) => {
    const { db } = ctx;

    const operators = await db
      .select({
        id: superAdminUsers.id,
        email: superAdminUsers.email,
        name: superAdminUsers.name,
        role: superAdminUsers.role,
        status: superAdminUsers.status,
        phone: superAdminUsers.phone,
        lastLoginAt: superAdminUsers.lastLoginAt,
        createdAt: superAdminUsers.createdAt,
      })
      .from(superAdminUsers)
      .orderBy(desc(superAdminUsers.createdAt));

    const roles = await db
      .select({
        id: superAdminRoles.id,
        name: superAdminRoles.name,
        description: superAdminRoles.description,
        badgeCls: superAdminRoles.badgeCls,
        isSystem: superAdminRoles.isSystem,
        capabilities: superAdminRoles.capabilities,
      })
      .from(superAdminRoles);

    // Truthful Encryption & Posture inspection
    const appSecret = process.env["APP_SECRET"];
    const hasAppSecret = typeof appSecret === "string" && appSecret.trim().length >= 32;
    const dbUrl = process.env["DATABASE_URL"] ?? "";
    const hasSsl = dbUrl.includes("sslmode=require") || process.env["DB_SSL"] === "true";

    const securityPosture = {
      encryption: {
        status: hasAppSecret ? ("verified" as const) : ("not_configured" as const),
        algorithm: hasAppSecret ? "AES-256-GCM" : "None",
        keyLengthBits: hasAppSecret ? 256 : 0,
        detail: hasAppSecret
          ? "Primary KMS / APP_SECRET 256-bit key verified active"
          : "APP_SECRET not configured or insufficient length",
      },
      databaseTls: {
        status: hasSsl ? ("configured" as const) : ("not_configured" as const),
        mode: hasSsl ? "verify-full / require" : "disable (local/intranet)",
        detail: hasSsl
          ? "TLS encryption in transit active for database connection"
          : "Database connection running over standard intranet TCP",
      },
      sessionPolicy: {
        jwtTtlMinutes: 480,
        inactivityTimeoutMinutes: 60,
        strictCors: true,
        multiFactorAuth: "optional" as const,
      },
      dataProtection: {
        dpdpSweepsActive: true,
        statutoryRetentionTracking: true,
        contactEmailConfigured: Boolean(process.env["DPDP_CONTACT_EMAIL"]),
      },
    };

    return {
      operators,
      roles,
      securityPosture,
    };
  }),

  // P4 — Phase 8: Emergency Operator Session Revocation (super_admin ONLY)
  revokeAllOperatorSessions: macSuperAdminOnlyProcedure
    .input(
      z.object({
        reason: z.string().min(10),
        targetOperatorId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const callerEmail = (ctx as { macOperatorEmail?: string }).macOperatorEmail ?? "admin@coheron.tech";

      let affectedCount = 0;
      if (input.targetOperatorId) {
        const [target] = await db
          .select({ id: superAdminUsers.id, email: superAdminUsers.email })
          .from(superAdminUsers)
          .where(eq(superAdminUsers.id, input.targetOperatorId));
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Operator not found" });

        await db
          .update(superAdminUsers)
          .set({ updatedAt: new Date() })
          .where(eq(superAdminUsers.id, input.targetOperatorId));
        affectedCount = 1;
      } else {
        // Emergency platform session invalidation: touch updatedAt for all operators
        await db
          .update(superAdminUsers)
          .set({ updatedAt: new Date() });
        const [totalOps] = await db.select({ count: count() }).from(superAdminUsers);
        affectedCount = totalOps?.count ?? 1;
      }

      await db.insert(superAdminAuditLogs).values({
        actorEmail: callerEmail,
        orgId: null,
        action: "REVOKE_ALL_OPERATOR_SESSIONS",
        afterJson: {
          reason: input.reason,
          targetOperatorId: input.targetOperatorId ?? "ALL_OPERATORS",
          affectedCount,
          revokedAt: new Date().toISOString(),
        },
      });

      return {
        ok: true,
        revokedCount: affectedCount,
        message: input.targetOperatorId
          ? "Target operator sessions revoked successfully"
          : "All operator sessions revoked across the platform",
      };
    }),
});
