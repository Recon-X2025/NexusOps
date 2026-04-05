import { router, publicProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizations, users, sessions, eq, desc, count, and } from "@nexusops/db";
import jwt from "jsonwebtoken";

export const macRouter = router({
  // MAC operator login — validates against MAC_OPERATOR_EMAIL + MAC_OPERATOR_PASSWORD
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input }) => {
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
        { expiresIn: "8h" },
      );
      return { token };
    }),

  // Platform-wide stats
  stats: publicProcedure.query(async ({ ctx }) => {
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
  listOrganizations: publicProcedure
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
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.slug.toLowerCase().includes(q),
        );
      }

      return rows;
    }),

  // Get a single organization by ID
  getOrganization: publicProcedure
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
  listOrgUsers: publicProcedure
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
  createOrganization: publicProcedure
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

      return { org, adminEmail: input.adminEmail };
    }),

  // Suspend an organization by setting settings.suspended = true
  suspendOrganization: publicProcedure
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
  resumeOrganization: publicProcedure
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
  revokeOrgSessions: publicProcedure
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
});
