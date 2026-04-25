import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  risks,
  policies,
  auditPlans,
  vendorRisks,
  riskControlEvidence,
  riskControls,
  eq,
  and,
  desc,
  count,
} from "@nexusops/db";
import { getNextNumber } from "../lib/auto-number";

export const grcRouter = router({
  // ── Risks ─────────────────────────────────────────────────────────────────
  listRisks: permissionProcedure("grc", "read")
    .input(z.object({ status: z.string().optional(), category: z.string().optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(risks.orgId, org!.id)];
      if (input.status) conditions.push(eq(risks.status, input.status as any));
      if (input.category) conditions.push(eq(risks.category, input.category as any));
      return db.select().from(risks).where(and(...conditions)).orderBy(desc(risks.riskScore)).limit(input.limit);
    }),

  getRisk: permissionProcedure("grc", "read").input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [risk] = await db.select().from(risks).where(and(eq(risks.id, input.id), eq(risks.orgId, org!.id)));
    if (!risk) throw new TRPCError({ code: "NOT_FOUND" });
    return risk;
  }),

  createRisk: permissionProcedure("grc", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["operational", "financial", "strategic", "compliance", "technology", "reputational"]).default("operational"),
      likelihood: z.coerce.number().min(1).max(5).default(3),
      impact: z.coerce.number().min(1).max(5).default(3),
      treatment: z.enum(["accept", "mitigate", "transfer", "avoid"]).optional(),
      mitigationPlan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "RK");
      const riskScore = input.likelihood * input.impact;
      const [risk] = await db.insert(risks).values({ orgId: org!.id, number, ...input, riskScore, ownerId: user!.id }).returning();
      return risk;
    }),

  updateRisk: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), likelihood: z.coerce.number().optional(), impact: z.coerce.number().optional(), mitigationPlan: z.string().optional(), treatment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, likelihood, impact, ...rest } = input;
      const updates: Record<string, any> = { ...rest, updatedAt: new Date() };
      if (likelihood !== undefined) updates.likelihood = likelihood;
      if (impact !== undefined) updates.impact = impact;
      // Recalculate riskScore if either value changes — fetch current for missing operand
      if (likelihood !== undefined || impact !== undefined) {
        const [current] = await db.select({ likelihood: risks.likelihood, impact: risks.impact }).from(risks).where(eq(risks.id, id)).limit(1);
        if (current) {
          const newLikelihood = likelihood ?? current.likelihood ?? 1;
          const newImpact = impact ?? current.impact ?? 1;
          updates.riskScore = newLikelihood * newImpact;
        }
      }
      const [risk] = await db.update(risks).set(updates).where(and(eq(risks.id, id), eq(risks.orgId, org!.id))).returning();
      return risk;
    }),

  // ── Policies ──────────────────────────────────────────────────────────────
  listPolicies: permissionProcedure("grc", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(policies.orgId, org!.id)];
      if (input.status) conditions.push(eq(policies.status, input.status as any));
      return db.select().from(policies).where(and(...conditions)).orderBy(desc(policies.createdAt)).limit(input.limit);
    }),

  createPolicy: permissionProcedure("grc", "write")
    .input(z.object({ title: z.string(), content: z.string().optional(), category: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [policy] = await db.insert(policies).values({ orgId: org!.id, ...input, ownerId: user!.id }).returning();
      return policy;
    }),

  publishPolicy: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [policy] = await db.update(policies)
        .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(policies.id, input.id), eq(policies.orgId, org!.id))).returning();
      return policy;
    }),

  // ── Audit Plans ────────────────────────────────────────────────────────────
  listAudits: permissionProcedure("grc", "read").query(async ({ ctx }) => {
    return ctx.db.select().from(auditPlans).where(eq(auditPlans.orgId, ctx.org!.id)).orderBy(desc(auditPlans.createdAt));
  }),

  createAudit: permissionProcedure("grc", "write")
    .input(z.object({ title: z.string(), scope: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [audit] = await db.insert(auditPlans).values({
        orgId: org!.id, ...input, auditorId: user!.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      }).returning();
      return audit;
    }),

  // ── Vendor Risks ───────────────────────────────────────────────────────────
  listVendorRisks: permissionProcedure("grc", "read").query(async ({ ctx }) => {
    return ctx.db.select().from(vendorRisks).where(eq(vendorRisks.orgId, ctx.org!.id)).orderBy(desc(vendorRisks.riskScore));
  }),

  createVendorRisk: permissionProcedure("grc", "write")
    .input(z.object({ vendorName: z.string(), tier: z.enum(["critical", "high", "medium", "low"]).default("medium") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vr] = await db.insert(vendorRisks).values({ orgId: org!.id, ...input }).returning();
      return vr;
    }),

  updateVendorRisk: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid(), riskScore: z.coerce.number().optional(), questionnaireStatus: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [vr] = await db.update(vendorRisks).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(vendorRisks.id, id), eq(vendorRisks.orgId, org!.id))).returning();
      return vr;
    }),

  riskMatrix: permissionProcedure("grc", "read").query(async ({ ctx }) => {
    const rows = await ctx.db.select({ status: risks.status, cnt: count(), avgScore: risks.riskScore })
      .from(risks).where(eq(risks.orgId, ctx.org!.id)).groupBy(risks.status, risks.riskScore);
    return rows;
  }),

  // ── US-SEC-006 control evidence ────────────────────────────────────────────
  listControlEvidence: permissionProcedure("grc", "read")
    .input(z.object({ controlId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(riskControlEvidence)
        .where(
          and(
            eq(riskControlEvidence.orgId, ctx.org!.id),
            eq(riskControlEvidence.controlId, input.controlId),
          ),
        )
        .orderBy(desc(riskControlEvidence.createdAt));
    }),

  addControlEvidence: permissionProcedure("grc", "write")
    .input(
      z.object({
        controlId: z.string().uuid(),
        title: z.string().min(1),
        storageUri: z.string().min(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [ctrl] = await db
        .select({ id: riskControls.id })
        .from(riskControls)
        .where(and(eq(riskControls.id, input.controlId), eq(riskControls.orgId, org!.id)));
      if (!ctrl) throw new TRPCError({ code: "NOT_FOUND", message: "Control not found" });
      const [row] = await db
        .insert(riskControlEvidence)
        .values({
          orgId: org!.id,
          controlId: input.controlId,
          title: input.title,
          storageUri: input.storageUri,
          createdBy: user!.id,
        })
        .returning();
      return row;
    }),
});
