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
  auditFindings,
  controlTypeEnum,
  findingSeverityEnum,
  riskStatusEnum,
  riskCategoryEnum,
  riskTreatmentEnum,
  policyStatusEnum,
  questionnaireStatusEnum,
  eq,
  and,
  desc,
  count,
} from "@coheronconnect/db";
import { getNextNumber } from "../lib/auto-number";
import { assertSameOrg, assertSameOrgIfPresent } from "../lib/assert-same-org";
import { users } from "@coheronconnect/db";

export const grcRouter = router({
  // ── Risks ─────────────────────────────────────────────────────────────────
  listRisks: permissionProcedure("grc", "read")
    .input(z.object({ status: z.enum(riskStatusEnum.enumValues).optional(), category: z.enum(riskCategoryEnum.enumValues).optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(risks.orgId, org!.id)];
      if (input.status) conditions.push(eq(risks.status, input.status));
      if (input.category) conditions.push(eq(risks.category, input.category));
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
    .input(z.object({ id: z.string().uuid(), status: z.enum(riskStatusEnum.enumValues).optional(), likelihood: z.coerce.number().optional(), impact: z.coerce.number().optional(), mitigationPlan: z.string().optional(), treatment: z.enum(riskTreatmentEnum.enumValues).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, likelihood, impact, ...rest } = input;
      const updates: Partial<typeof risks.$inferInsert> = { ...rest, updatedAt: new Date() };
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
    .input(z.object({ status: z.enum(policyStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(policies.orgId, org!.id)];
      if (input.status) conditions.push(eq(policies.status, input.status));
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

  unpublishPolicy: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [policy] = await db.update(policies)
        .set({ status: "draft", updatedAt: new Date() })
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

  updateAuditStatus: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid(), status: z.enum(["planned", "in_progress", "completed", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [audit] = await db.update(auditPlans)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(auditPlans.id, input.id), eq(auditPlans.orgId, org!.id))).returning();
      return audit;
    }),

  // ── Vendor Risks ───────────────────────────────────────────────────────────
  listVendorRisks: permissionProcedure("grc", "read").query(async ({ ctx }) => {
    return ctx.db.select().from(vendorRisks).where(eq(vendorRisks.orgId, ctx.org!.id)).orderBy(desc(vendorRisks.riskScore));
  }),

  listControls: permissionProcedure("grc", "read")
    .input(z.object({ limit: z.coerce.number().default(200) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(riskControls)
        .where(eq(riskControls.orgId, ctx.org!.id))
        .orderBy(riskControls.controlNumber)
        .limit(input?.limit ?? 200);
    }),

  /**
   * Create a control.
   *
   * `risk_controls` held 40 rows on 5434/DEV with no writer anywhere in the repo
   * — not in a router, a seed or a migration — while `addControlEvidence` let
   * evidence be attached to them. Evidence could be filed against a control no
   * tenant was able to create. This closes that.
   */
  createControl: permissionProcedure("grc", "write")
    .input(z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      controlType: z.enum(controlTypeEnum.enumValues).default("preventive"),
      controlCategory: z.string().min(1).max(60).default("manual"),
      controlFrequency: z.string().min(1).max(60).default("monthly"),
      controlOwnerId: z.string().uuid().optional(),
      /** Risks this control mitigates. Stored as text ids on the row. */
      mappedRiskIds: z.array(z.string().uuid()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Both references arrive from the caller. `users` and `risks` are
      // org-scoped, so an unchecked id would attach this control to another
      // tenant's owner or risk — a row RLS accepts, because its own org_id is
      // legitimately ours.
      await assertSameOrgIfPresent(db, users, input.controlOwnerId, org!.id, "Control owner");
      for (const riskId of input.mappedRiskIds) {
        await assertSameOrg(db, risks, riskId, org!.id, "Mapped risk");
      }

      const controlNumber = await getNextNumber(db, org!.id, "CTL");
      const [control] = await db.insert(riskControls).values({
        orgId: org!.id,
        controlNumber,
        title: input.title,
        description: input.description ?? null,
        controlType: input.controlType,
        controlCategory: input.controlCategory,
        controlFrequency: input.controlFrequency,
        controlOwnerId: input.controlOwnerId ?? null,
        mappedRiskIds: input.mappedRiskIds,
      }).returning();
      return control;
    }),

  /**
   * List findings for an audit.
   *
   * There was no read path for `audit_findings` through the API at all — the GRC
   * workbench payload queried the table directly, so findings were visible on a
   * dashboard and reachable nowhere else. Adding a create path without this
   * would have reproduced the same fault in the opposite direction.
   */
  listFindings: permissionProcedure("grc", "read")
    .input(z.object({ auditPlanId: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(auditFindings.orgId, org!.id)];
      if (input.auditPlanId) conditions.push(eq(auditFindings.auditPlanId, input.auditPlanId));
      return db
        .select()
        .from(auditFindings)
        .where(and(...conditions))
        .orderBy(desc(auditFindings.createdAt));
    }),

  /**
   * Raise a finding against an audit.
   *
   * The four narrative fields are required by the table and by audit practice:
   * criteria (what should be true), condition (what is), cause (why), effect
   * (what it means). A finding missing any of them is not reviewable, so they
   * are required here rather than defaulted to an empty string.
   */
  createFinding: permissionProcedure("grc", "write")
    .input(z.object({
      auditPlanId: z.string().uuid(),
      title: z.string().min(1).max(200),
      findingSeverity: z.enum(findingSeverityEnum.enumValues).default("medium"),
      criteria: z.string().min(1),
      condition: z.string().min(1),
      cause: z.string().min(1),
      effect: z.string().min(1),
      recommendation: z.string().optional(),
      actionOwnerId: z.string().uuid().optional(),
      linkedRiskId: z.string().uuid().optional(),
      targetRemediationDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // The audit is the parent and arrives from the caller — without this the
      // finding attaches to another tenant's audit while carrying our org_id.
      await assertSameOrg(db, auditPlans, input.auditPlanId, org!.id, "Audit");
      await assertSameOrgIfPresent(db, users, input.actionOwnerId, org!.id, "Action owner");
      await assertSameOrgIfPresent(db, risks, input.linkedRiskId, org!.id, "Linked risk");

      const findingNumber = await getNextNumber(db, org!.id, "FND");
      const [finding] = await db.insert(auditFindings).values({
        orgId: org!.id,
        auditPlanId: input.auditPlanId,
        findingNumber,
        title: input.title,
        findingSeverity: input.findingSeverity,
        criteria: input.criteria,
        condition: input.condition,
        cause: input.cause,
        effect: input.effect,
        recommendation: input.recommendation ?? null,
        actionOwnerId: input.actionOwnerId ?? null,
        linkedRiskId: input.linkedRiskId ?? null,
        targetRemediationDate: input.targetRemediationDate ? new Date(input.targetRemediationDate) : null,
      }).returning();
      return finding;
    }),

  createVendorRisk: permissionProcedure("grc", "write")
    .input(z.object({ vendorName: z.string(), tier: z.enum(["critical", "high", "medium", "low"]).default("medium") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vr] = await db.insert(vendorRisks).values({ orgId: org!.id, ...input }).returning();
      return vr;
    }),

  updateVendorRisk: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid(), riskScore: z.coerce.number().optional(), questionnaireStatus: z.enum(questionnaireStatusEnum.enumValues).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [vr] = await db.update(vendorRisks).set({ ...data, updatedAt: new Date() })
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

  updatePolicy: permissionProcedure("grc", "write")
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      content: z.string().optional(),
      category: z.string().optional(),
      status: z.enum(policyStatusEnum.enumValues).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [row] = await db.update(policies)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(policies.id, id), eq(policies.orgId, org!.id)))
        .returning();
      return row;
    }),

  deletePolicy: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db.delete(policies).where(and(eq(policies.id, input.id), eq(policies.orgId, org!.id)));
      return { success: true };
    }),

  archivePolicy: permissionProcedure("grc", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db.update(policies)
        .set({ status: "retired", updatedAt: new Date() })
        .where(and(eq(policies.id, input.id), eq(policies.orgId, org!.id)))
        .returning();
      return row;
    }),
});

