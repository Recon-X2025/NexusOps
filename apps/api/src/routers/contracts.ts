import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { contracts, contractObligations, contractStatusEnum, contractTypeEnum, obligationStatusEnum, obligationFrequencyEnum, eq, and, desc, count, inArray, sql } from "@coheronconnect/db";
import { supportedCurrencyCodeSchema } from "@coheronconnect/types";
import { getNextNumber } from "../lib/auto-number";
import { runEntityBusinessRules } from "../services/business-rules-engine";
import { emitDomainEvent } from "../services/workflow-events";

const CONTRACT_STATE_MACHINE: Record<string, string[]> = {
  // FIX: 2026-03-25 — "cancelled" not in DB enum; replaced with "terminated" for draft→exit
  draft: ["under_review", "terminated"],
  under_review: ["legal_review", "draft"],
  legal_review: ["awaiting_signature", "under_review"],
  awaiting_signature: ["active", "legal_review"],
  active: ["expiring_soon", "terminated"],
  expiring_soon: ["active", "expired", "terminated"],
  expired: [],
  terminated: [],
};

export const contractsRouter = router({
  list: permissionProcedure("contracts", "read")
    .input(z.object({
      status: z.enum(contractStatusEnum.enumValues).optional(),
      type: z.enum(contractTypeEnum.enumValues).optional(),
      search: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(contracts.orgId, org!.id)];
      if (input.status) conditions.push(eq(contracts.status, input.status));
      if (input.type) conditions.push(eq(contracts.type, input.type));

      const rows = await db.select().from(contracts)
        .where(and(...conditions))
        .orderBy(desc(contracts.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      return { items: hasMore ? rows.slice(0, -1) : rows, nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null };
    }),

  get: permissionProcedure("contracts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contract] = await db.select().from(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.orgId, org!.id)));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      const obligations = await db.select().from(contractObligations)
        .where(eq(contractObligations.contractId, contract.id));

      return { ...contract, obligations };
    }),

  create: permissionProcedure("contracts", "write")
    .input(z.object({
      title: z.string().min(1),
      counterparty: z.string().min(1),
      type: z.enum(["nda", "msa", "sow", "license", "customer_agreement", "sla_support", "colocation", "employment", "vendor", "partnership"]).default("vendor"),
      value: z.string().optional(),
      currency: supportedCurrencyCodeSchema.default("USD"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      autoRenew: z.boolean().default(false),
      noticePeriodDays: z.coerce.number().default(30),
      governingLaw: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const contractNumber = await getNextNumber(db, org!.id, "CNTR");
      const [contract] = await db.insert(contracts).values({
        orgId: org!.id, contractNumber, ...input,
        internalOwnerId: user!.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      }).returning();

      // Fire-and-forget automation hooks (never roll back the create).
      if (contract) {
        const entity = contract as unknown as Record<string, unknown>;
        void runEntityBusinessRules(db, { orgId: org!.id, entityType: "contract", event: "created", entity, changes: {} });
        void emitDomainEvent(db, { orgId: org!.id, type: "contract_created", payload: { contractId: contract.id } });
      }

      return contract;
    }),

  createFromWizard: permissionProcedure("contracts", "write")
    .input(z.object({
      title: z.string(),
      counterparty: z.string(),
      type: z.enum(contractTypeEnum.enumValues),
      value: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      autoRenew: z.boolean().default(false),
      governingLaw: z.string().optional(),
      currency: supportedCurrencyCodeSchema.default("USD"),
      noticePeriodDays: z.coerce.number().default(30),
      submitForReview: z.boolean().default(false),
      clauses: z.array(z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        isEnabled: z.boolean(),
        fieldValues: z.record(z.union([z.string(), z.coerce.number()])),
        wasModified: z.boolean(),
      })).optional(),
      obligations: z.array(z.object({ title: z.string(), party: z.string(), frequency: z.enum(obligationFrequencyEnum.enumValues), dueDate: z.string().optional() })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const contractNumber = await getNextNumber(db, org!.id, "CNTR");

      const [contract] = await db.insert(contracts).values({
        orgId: org!.id, contractNumber,
        title: input.title,
        counterparty: input.counterparty,
        type: input.type,
        value: input.value,
        internalOwnerId: user!.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        autoRenew: input.autoRenew,
        governingLaw: input.governingLaw,
        currency: input.currency,
        noticePeriodDays: input.noticePeriodDays,
        clauses: input.clauses ?? [],
        status: input.submitForReview ? "under_review" : "draft",
      }).returning();

      if (input.obligations.length > 0) {
        await db.insert(contractObligations).values(
          input.obligations.map((o) => ({
            contractId: contract!.id,
            title: o.title,
            party: o.party,
            frequency: o.frequency,
            dueDate: o.dueDate ? new Date(o.dueDate) : undefined,
          })),
        );
      }

      return contract;
    }),

  transition: permissionProcedure("contracts", "write")
    .input(z.object({ id: z.string().uuid(), toStatus: z.enum(contractStatusEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contract] = await db.select().from(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.orgId, org!.id)));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      const allowed = CONTRACT_STATE_MACHINE[contract.status] ?? [];
      if (!allowed.includes(input.toStatus)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot transition from ${contract.status} to ${input.toStatus}` });
      }

      const [updated] = await db.update(contracts)
        .set({ status: input.toStatus, updatedAt: new Date() })
        .where(and(eq(contracts.id, input.id), eq(contracts.orgId, org!.id))).returning();
      return updated;
    }),

  /** Web UI uses `updateStatus` with `{ status }`; same rules as `transition`. Also supports `{ notes }`. */
  updateStatus: permissionProcedure("contracts", "write")
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(contractStatusEnum.enumValues).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.status === undefined && input.notes === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Provide status or notes" });
      }
      const { db, org } = ctx;
      const [contract] = await db.select().from(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.orgId, org!.id)));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.status !== undefined) {
        const allowed = CONTRACT_STATE_MACHINE[contract.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot transition from ${contract.status} to ${input.status}` });
        }
      }

      const [updated] = await db.update(contracts)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(contracts.id, input.id), eq(contracts.orgId, org!.id)))
        .returning();
      return updated;
    }),

  expiringWithin: permissionProcedure("contracts", "read")
    .input(z.object({ days: z.coerce.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const futureDate = new Date(Date.now() + input.days * 86400000);
      return db.select().from(contracts).where(
        and(
          eq(contracts.orgId, org!.id),
          sql`status NOT IN ('terminated', 'expired')`,
          sql`end_date IS NOT NULL AND end_date <= ${futureDate.toISOString()}`,
        ),
      ).orderBy(contracts.endDate);
    }),

  listObligations: permissionProcedure("contracts", "read")
    .input(z.object({ status: z.enum(obligationStatusEnum.enumValues).optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const contractsInOrg = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.orgId, org!.id));
      if (!contractsInOrg.length) return [];
      const ids = contractsInOrg.map((c: { id: string }) => c.id);
      const conditions = [inArray(contractObligations.contractId, ids)];
      if (input.status) conditions.push(eq(contractObligations.status, input.status));
      return db.select().from(contractObligations).where(and(...conditions)).orderBy(contractObligations.dueDate);
    }),

  completeObligation: permissionProcedure("contracts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // Tenant guard: `contract_obligations` has no orgId column, so verify the
      // parent contract belongs to the caller's org before mutating the row.
      // Without this an out-of-org caller could complete another tenant's obligation.
      const [parent] = await db
        .select({ id: contracts.id })
        .from(contracts)
        .innerJoin(contractObligations, eq(contractObligations.contractId, contracts.id))
        .where(and(eq(contractObligations.id, input.id), eq(contracts.orgId, org!.id)))
        .limit(1);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });

      const [ob] = await db.update(contractObligations)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(contractObligations.id, input.id)).returning();
      return ob;
    }),
});
