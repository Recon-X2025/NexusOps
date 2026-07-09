import { router, publicProcedure, macProcedure } from "../lib/trpc";
import type { Context } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizations, users, sessions, macAuditLogs, eq, desc, count, and, sql, inArray } from "@coheronconnect/db";
import { ensureDefaultTicketStatusesForOrg } from "../lib/ensure-ticket-workflow";
import {
  appendMacAuditEntry,
  verifyMacAuditChain,
  type MacAuditAction,
} from "../lib/mac-audit-hash";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

/**
 * Decode the operator email from the verified MAC token. The token has already
 * been verified by `enforceMacOperator` (macProcedure), so we only decode here —
 * a malformed token cannot reach a macProcedure. Returns "unknown" defensively.
 */
function operatorEmailFromCtx(ctx: Context): string {
  const token = ctx.macToken;
  if (!token) return "unknown";
  try {
    const payload = jwt.decode(token);
    if (payload && typeof payload === "object" && typeof payload["email"] === "string") {
      return payload["email"];
    }
  } catch {
    /* fall through */
  }
  return "unknown";
}

/**
 * Record a MAC operator action to the platform-global tamper-evident audit
 * chain. Best-effort: a failed audit write must NEVER fail the underlying
 * action (mirrors the per-org auditMutation contract), so all errors are
 * swallowed.
 */
async function recordMacAudit(
  ctx: Context,
  entry: {
    action: MacAuditAction;
    targetOrgId?: string | null;
    targetOrgName?: string | null;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await appendMacAuditEntry(ctx.db, {
      operatorEmail: operatorEmailFromCtx(ctx),
      action: entry.action,
      targetOrgId: entry.targetOrgId ?? null,
      targetOrgName: entry.targetOrgName ?? null,
      details: entry.details ?? null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch {
    /* non-fatal — never block the actual MAC action */
  }
}

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
  // MAC operator login. Credentials are checked against MAC_OPERATOR_EMAIL plus
  // EITHER a bcrypt hash (MAC_OPERATOR_PASSWORD_HASH, preferred) OR a plaintext
  // MAC_OPERATOR_PASSWORD (back-compat fallback). Every attempt — success and
  // failure — is written to the platform audit chain. Token TTL is short (1h)
  // so a leaked operator token expires quickly.
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertMacEnabled();
      const macEmail = process.env["MAC_OPERATOR_EMAIL"];
      const macPasswordHash = process.env["MAC_OPERATOR_PASSWORD_HASH"];
      const macPassword = process.env["MAC_OPERATOR_PASSWORD"];
      const macSecret = process.env["MAC_JWT_SECRET"];

      if (!macEmail || !macSecret || (!macPasswordHash && !macPassword)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "MAC not configured — set MAC_OPERATOR_EMAIL, MAC_JWT_SECRET, and MAC_OPERATOR_PASSWORD_HASH (or MAC_OPERATOR_PASSWORD)",
        });
      }

      // Log the attempt regardless of outcome. Best-effort — a failed audit
      // write must not turn a valid login into an error.
      const logAttempt = async (success: boolean): Promise<void> => {
        try {
          await appendMacAuditEntry(ctx.db, {
            operatorEmail: input.email,
            action: "operator_login",
            details: { success },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          });
        } catch {
          /* non-fatal */
        }
      };

      const emailOk = input.email === macEmail;
      const passwordOk = macPasswordHash
        ? await bcrypt.compare(input.password, macPasswordHash)
        : input.password === macPassword;

      if (!emailOk || !passwordOk) {
        await logAttempt(false);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      await logAttempt(true);

      const token = jwt.sign(
        { email: input.email, role: "mac_operator" },
        macSecret,
        { expiresIn: "1h" },
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

      await recordMacAudit(ctx, {
        action: "org_created",
        targetOrgId: org!.id,
        targetOrgName: org!.name,
        details: { plan: input.plan, adminEmail: input.adminEmail },
      });

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

      await recordMacAudit(ctx, { action: "org_suspended", targetOrgId: input.id });

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

      await recordMacAudit(ctx, { action: "org_resumed", targetOrgId: input.id });

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

      await recordMacAudit(ctx, {
        action: "sessions_revoked",
        targetOrgId: input.id,
        details: { revoked },
      });

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
      await recordMacAudit(ctx, {
        action: "legal_recorded",
        targetOrgId: input.orgId,
        details: { documentType: input.documentType, version: input.version },
      });
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
      await recordMacAudit(ctx, {
        action: "billing_updated",
        targetOrgId: input.orgId,
        details: {
          plan: input.plan ?? null,
          subscriptionStatus: input.subscriptionStatus ?? null,
        },
      });
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
      await recordMacAudit(ctx, {
        action: "feature_flag_set",
        targetOrgId: input.orgId,
        details: { flag: input.flag, enabled: input.enabled },
      });
      return { ok: true };
    }),

  // Bulk feature-flag rollout — set one flag across many orgs (or all of them)
  // in a single operation. Used by the console's phased-rollout workflow.
  setFeatureFlagBulk: macProcedure
    .input(
      z.object({
        flag: z.string().min(1),
        enabled: z.boolean(),
        orgIds: z.array(z.string().uuid()).optional(),
        allOrgs: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      if (!input.allOrgs && (!input.orgIds || input.orgIds.length === 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide orgIds or set allOrgs: true",
        });
      }

      const targets = input.allOrgs
        ? await db.select({ id: organizations.id, settings: organizations.settings }).from(organizations)
        : await db
            .select({ id: organizations.id, settings: organizations.settings })
            .from(organizations)
            .where(inArray(organizations.id, input.orgIds ?? []));

      let updated = 0;
      for (const org of targets) {
        const existing = (org.settings ?? {}) as Record<string, unknown>;
        const flags = (existing.featureFlags ?? {}) as Record<string, boolean>;
        flags[input.flag] = input.enabled;
        await db
          .update(organizations)
          .set({ settings: { ...existing, featureFlags: flags } })
          .where(eq(organizations.id, org.id));
        updated += 1;
      }

      await recordMacAudit(ctx, {
        action: "feature_flag_bulk_set",
        details: {
          flag: input.flag,
          enabled: input.enabled,
          count: updated,
          scope: input.allOrgs ? "all" : "selected",
        },
      });

      return { updated };
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
      const [targetUser] = await db.select({ id: users.id, email: users.email, name: users.name, orgId: users.orgId }).from(users).where(eq(users.id, input.targetUserId));
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const jwtSecret = process.env["JWT_SECRET"];
      const macSecret = process.env["MAC_JWT_SECRET"];
      if (!jwtSecret || !macSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
      const impersonationToken = jwt.sign(
        { sub: input.targetUserId, impersonated: true, reason: input.reason, exp: Math.floor(expiresAt.getTime() / 1000) },
        jwtSecret,
      );

      await recordMacAudit(ctx, {
        action: "user_impersonated",
        targetOrgId: targetUser.orgId ?? null,
        details: {
          targetUserId: input.targetUserId,
          targetEmail: targetUser.email,
          reason: input.reason,
          durationMinutes: input.durationMinutes,
        },
      });

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

  // Platform-wide user directory (paginated, optional search across name/email),
  // joined to the owning org's name.
  listAllUsers: macProcedure
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

      const where = input.search
        ? sql`(lower(${users.name}) like ${"%" + input.search.toLowerCase() + "%"} or lower(${users.email}) like ${"%" + input.search.toLowerCase() + "%"})`
        : undefined;

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          orgId: users.orgId,
          orgName: organizations.name,
        })
        .from(users)
        .leftJoin(organizations, eq(users.orgId, organizations.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [total] = await db.select({ count: count() }).from(users).where(where);

      return {
        users: rows.map((r) => ({
          ...r,
          lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        })),
        total: total?.count ?? 0,
        page: input.page,
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

  // ── MAC audit trail ───────────────────────────────────────────────────────

  // Paginated, filterable view of the platform audit chain. Flattened to the
  // shape the console's Audit Log page renders.
  listAuditLog: macProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        action: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const limit = 50;
      const offset = (input.page - 1) * limit;

      const conds = [];
      if (input.action && input.action !== "all") {
        conds.push(eq(macAuditLogs.action, input.action));
      }
      if (input.search) {
        const q = `%${input.search.toLowerCase()}%`;
        conds.push(
          sql`(lower(${macAuditLogs.operatorEmail}) like ${q} or lower(coalesce(${macAuditLogs.targetOrgName}, '')) like ${q})`,
        );
      }
      if (input.dateFrom) {
        conds.push(sql`${macAuditLogs.createdAt} >= ${input.dateFrom}`);
      }
      if (input.dateTo) {
        conds.push(sql`${macAuditLogs.createdAt} <= ${input.dateTo}`);
      }
      const where = conds.length > 0 ? and(...conds) : undefined;

      const rows = await db
        .select()
        .from(macAuditLogs)
        .where(where)
        .orderBy(desc(macAuditLogs.seq))
        .limit(limit)
        .offset(offset);

      const [total] = await db
        .select({ count: count() })
        .from(macAuditLogs)
        .where(where);

      const entries = rows.map((r) => ({
        id: r.id,
        timestamp: r.createdAt.toISOString(),
        operator: r.operatorEmail,
        action: r.action,
        targetOrg: r.targetOrgName ?? (r.targetOrgId ? r.targetOrgId : "—"),
        details: r.details ?? {},
        ipAddress: r.ipAddress ?? "—",
      }));

      return { entries, total: total?.count ?? 0, page: input.page };
    }),

  // Verify the platform audit chain's integrity (tamper/deletion/reorder).
  verifyAuditChain: macProcedure.query(async ({ ctx }) => {
    return verifyMacAuditChain(ctx.db);
  }),

  // ── Deployment control ──────────────────────────────────────────────────────

  // Trigger the Vultr deploy GitHub Action (workflow_dispatch). Requires a
  // GITHUB_PAT (actions:write) env var — the operator provisions this out of
  // band; it is never entered through the UI.
  triggerDeploy: macProcedure
    .input(
      z.object({
        imageTag: z.string().min(1).default("latest"),
        deployMode: z.enum(["pull", "build"]).default("pull"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const pat = process.env["GITHUB_PAT"];
      if (!pat) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "GITHUB_PAT not configured — cannot trigger deploy",
        });
      }
      const repo = process.env["GITHUB_REPO"] ?? "Recon-X2025/NexusOps";
      const workflow = "deploy-vultr.yml";
      const ref = process.env["GITHUB_DEPLOY_REF"] ?? "main";

      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "coheronconnect-mac",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref,
            inputs: { image_tag: input.imageTag, deploy_mode: input.deployMode },
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `GitHub dispatch failed (${res.status}): ${body.slice(0, 200)}`,
        });
      }

      await recordMacAudit(ctx, {
        action: "deploy_triggered",
        details: { imageTag: input.imageTag, deployMode: input.deployMode, ref },
      });

      return { ok: true };
    }),

  // Live deployment status: version + component health from the API's own
  // health endpoints, plus recent workflow runs when a GITHUB_PAT is present.
  getDeployStatus: macProcedure.query(async () => {
    const self = process.env["API_SELF_URL"] ?? "http://localhost:3001";

    let version = "unknown";
    let health: unknown = null;
    try {
      const [h, detailed] = await Promise.all([
        fetch(`${self}/health`).then((r) => r.json() as Promise<Record<string, unknown>>),
        fetch(`${self}/health/detailed`)
          .then((r) => r.json() as Promise<Record<string, unknown>>)
          .catch(() => null),
      ]);
      version = typeof h["version"] === "string" ? h["version"] : "unknown";
      health = detailed ?? h;
    } catch {
      /* health unreachable — leave defaults */
    }

    let recentRuns: unknown = null;
    const pat = process.env["GITHUB_PAT"];
    if (pat) {
      const repo = process.env["GITHUB_REPO"] ?? "Recon-X2025/NexusOps";
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/workflows/deploy-vultr.yml/runs?per_page=5`,
          {
            headers: {
              Authorization: `Bearer ${pat}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "coheronconnect-mac",
            },
          },
        );
        if (runsRes.ok) {
          const json = (await runsRes.json()) as {
            workflow_runs?: Array<Record<string, unknown>>;
          };
          recentRuns = (json.workflow_runs ?? []).map((r) => ({
            id: r["id"],
            status: r["status"],
            conclusion: r["conclusion"],
            createdAt: r["created_at"],
            htmlUrl: r["html_url"],
            displayTitle: r["display_title"],
          }));
        }
      } catch {
        /* GitHub unreachable — omit runs */
      }
    }

    return { version, health, recentRuns };
  }),
});
