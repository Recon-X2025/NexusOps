import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { legalMatters, legalRequests, investigations, eq, and, desc, count, sql } from "@nexusops/db";
import { checkDbUserPermission } from "../lib/rbac-db";
import { getNextNumber } from "../lib/auto-number";

export const legalRouter = router({
  // ── Matters ────────────────────────────────────────────────────────────────
  listMatters: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), type: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(legalMatters.orgId, org!.id)];
      if (input.status) conditions.push(eq(legalMatters.status, input.status as any));
      if (input.type) conditions.push(eq(legalMatters.type, input.type as any));
      return db.select().from(legalMatters).where(and(...conditions)).orderBy(desc(legalMatters.createdAt)).limit(input.limit);
    }),

  getMatter: permissionProcedure("legal", "read").input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [matter] = await db.select().from(legalMatters)
      .where(and(eq(legalMatters.id, input.id), eq(legalMatters.orgId, org!.id)));
    if (!matter) throw new TRPCError({ code: "NOT_FOUND" });
    return matter;
  }),

  createMatter: permissionProcedure("legal", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["litigation", "employment", "ip", "regulatory", "ma", "data_privacy", "corporate", "commercial"]).default("commercial"),
      confidential: z.boolean().default(false),
      estimatedCost: z.string().optional(),
      externalCounsel: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const matterNumber = await getNextNumber(db, org!.id, "MAT");
      const [matter] = await db.insert(legalMatters).values({
        orgId: org!.id, matterNumber, ...input, assignedTo: user!.id,
      }).returning();
      return matter;
    }),

  updateMatter: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), phase: z.string().optional(), actualCost: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const updates: Record<string, any> = { ...data, updatedAt: new Date() };
      if (data.status === "closed" || data.status === "settled") updates.closedAt = new Date();
      const [matter] = await db.update(legalMatters).set(updates)
        .where(and(eq(legalMatters.id, id), eq(legalMatters.orgId, org!.id))).returning();
      return matter;
    }),

  // ── Legal Requests ─────────────────────────────────────────────────────────
  listRequests: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(legalRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(legalRequests.status, input.status as any));
      return db.select().from(legalRequests).where(and(...conditions)).orderBy(desc(legalRequests.createdAt)).limit(input.limit);
    }),

  createRequest: permissionProcedure("legal", "write")
    .input(z.object({ title: z.string(), description: z.string().optional(), type: z.string().optional(), priority: z.string().default("medium") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [req] = await db.insert(legalRequests).values({ orgId: org!.id, ...input, requesterId: user!.id }).returning();
      return req;
    }),

  updateRequest: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), assignedTo: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [req] = await db.update(legalRequests).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(legalRequests.id, id), eq(legalRequests.orgId, org!.id))).returning();
      return req;
    }),

  // ── Investigations ─────────────────────────────────────────────────────────
  listInvestigations: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(investigations.orgId, org!.id)];
      if (input.status) conditions.push(eq(investigations.status, input.status as any));
      const rows = await db.select().from(investigations).where(and(...conditions)).orderBy(desc(investigations.createdAt)).limit(input.limit);
      // Filter confidential investigations: only the investigator or users with grc.admin can see them
      return rows.filter((investigation: any) => {
        if (!investigation.confidential) return true;
        const isInvestigator = investigation.investigatorId === ctx.user!.id;
        const canSeeAll = checkDbUserPermission(ctx.user!.role, "legal", "admin", ctx.user!.matrixRole);
        return isInvestigator || canSeeAll;
      });
    }),

  createInvestigation: permissionProcedure("legal", "write")
    .input(z.object({
      title: z.string(),
      type: z.enum(["ethics", "harassment", "fraud", "data_breach", "whistleblower", "discrimination"]).default("ethics"),
      anonymousReport: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [inv] = await db.insert(investigations).values({ orgId: org!.id, ...input, investigatorId: user!.id }).returning();
      return inv;
    }),

  closeInvestigation: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), findings: z.string(), recommendation: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inv] = await db.update(investigations)
        .set({ status: "closed", findings: input.findings, recommendation: input.recommendation, closedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(investigations.id, input.id), eq(investigations.orgId, org!.id))).returning();
      return inv;
    }),
});
