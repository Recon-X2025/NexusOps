import { randomUUID } from "node:crypto";
import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { catalogItems, catalogRequests, eq, and, desc, count, inArray } from "@coheronconnect/db";
import { createCatalogFulfillmentTicket } from "../lib/catalog-fulfillment-ticket";

type CatalogFormField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

const DEFAULT_FULFILLMENT_CHECKLIST: Array<{ id: string; label: string; done: boolean }> = [
  { id: "verify", label: "Verify request details against catalog item", done: false },
  { id: "fulfill", label: "Complete technical / service fulfilment", done: false },
  { id: "notify", label: "Notify requester of completion", done: false },
];

function assertCatalogVariablesValid(fields: CatalogFormField[], data: Record<string, unknown>) {
  for (const f of fields) {
    const raw = data[f.id];
    if (f.required) {
      if (raw === undefined || raw === null || raw === "") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Missing required catalog field: ${f.label}` });
      }
    }
    if (raw === undefined || raw === null || raw === "") continue;
    if (f.type === "dropdown" || f.type === "radio") {
      const s = String(raw);
      if (f.options?.length && !f.options.includes(s)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid option for ${f.label}` });
      }
    }
  }
}

export const catalogRouter = router({
  listItems: permissionProcedure("catalog", "read")
    .input(z.object({ category: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(catalogItems.orgId, org!.id)];
      if (input.category) conditions.push(eq(catalogItems.category, input.category));
      if (input.status) conditions.push(eq(catalogItems.status, input.status as any));
      else conditions.push(eq(catalogItems.status, "active"));
      return db.select().from(catalogItems).where(and(...conditions)).orderBy(catalogItems.sortOrder, catalogItems.name);
    }),

  getItem: permissionProcedure("catalog", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const [item] = await ctx.db.select().from(catalogItems)
      .where(and(eq(catalogItems.id, input.id), eq(catalogItems.orgId, ctx.org!.id)));
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  }),

  createItem: permissionProcedure("catalog", "write")
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      price: z.string().optional(),
      approvalRequired: z.boolean().default(false),
      fulfillmentGroup: z.string().optional(),
      slaDays: z.coerce.number().default(3),
      formFields: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), required: z.boolean() })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db.insert(catalogItems).values({ orgId: org!.id, ...input }).returning();
      return item;
    }),

  /** Self-service order — requires catalog write so viewer role cannot submit. */
  submitRequest: permissionProcedure("catalog", "write")
    .input(z.object({ itemId: z.string().uuid(), formData: z.record(z.unknown()).default({}) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [item] = await db.select().from(catalogItems).where(and(eq(catalogItems.id, input.itemId), eq(catalogItems.orgId, org!.id)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const status = item.approvalRequired ? "pending_approval" : "submitted";
      const [req] = await db.insert(catalogRequests).values({
        orgId: org!.id, itemId: input.itemId, requesterId: user!.id, formData: input.formData, status,
        fulfillmentChecklist: DEFAULT_FULFILLMENT_CHECKLIST,
      }).returning();
      return req;
    }),

  /** US-ITSM-005 — multi-item cart in one transaction + variable validation + checklist. */
  submitCart: permissionProcedure("catalog", "write")
    .input(
      z.object({
        items: z
          .array(z.object({ itemId: z.string().uuid(), formData: z.record(z.unknown()).default({}) }))
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const batchId = randomUUID();
      return db.transaction(async (tx: typeof db) => {
        const created: unknown[] = [];
        for (const line of input.items) {
          const [item] = await tx
            .select()
            .from(catalogItems)
            .where(and(eq(catalogItems.id, line.itemId), eq(catalogItems.orgId, org!.id)));
          if (!item) throw new TRPCError({ code: "NOT_FOUND", message: `Catalog item ${line.itemId} not found` });
          assertCatalogVariablesValid((item.formFields ?? []) as CatalogFormField[], line.formData as Record<string, unknown>);
          const status = item.approvalRequired ? "pending_approval" : "submitted";
          const [req] = await tx
            .insert(catalogRequests)
            .values({
              orgId: org!.id,
              itemId: line.itemId,
              requesterId: user!.id,
              formData: line.formData,
              status,
              batchId,
              fulfillmentChecklist: DEFAULT_FULFILLMENT_CHECKLIST,
            })
            .returning();
          if (req) created.push(req);
        }
        return { batchId, requests: created };
      });
    }),

  listRequests: permissionProcedure("catalog", "read")
    .input(z.object({ status: z.string().optional(), myRequests: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const conditions = [eq(catalogRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(catalogRequests.status, input.status as any));
      if (input.myRequests) conditions.push(eq(catalogRequests.requesterId, user!.id));

      const rows = (await db
        .select({
          id: catalogRequests.id,
          orgId: catalogRequests.orgId,
          itemId: catalogRequests.itemId,
          requesterId: catalogRequests.requesterId,
          formData: catalogRequests.formData,
          status: catalogRequests.status,
          fulfillerId: catalogRequests.fulfillerId,
          approvalId: catalogRequests.approvalId,
          notes: catalogRequests.notes,
          fulfillmentTicketId: catalogRequests.fulfillmentTicketId,
          batchId: catalogRequests.batchId,
          fulfillmentChecklist: catalogRequests.fulfillmentChecklist,
          completedAt: catalogRequests.completedAt,
          createdAt: catalogRequests.createdAt,
          updatedAt: catalogRequests.updatedAt,
          itemName: catalogItems.name,
          itemCategory: catalogItems.category,
          itemSlaDays: catalogItems.slaDays,
        })
        .from(catalogRequests)
        .leftJoin(catalogItems, eq(catalogRequests.itemId, catalogItems.id))
        .where(and(...conditions))
        .orderBy(desc(catalogRequests.createdAt))) as Array<{
        id: string;
        orgId: string;
        itemId: string;
        requesterId: string;
        formData: unknown;
        status: string;
        fulfillerId: string | null;
        approvalId: string | null;
        notes: string | null;
        fulfillmentTicketId: string | null;
        batchId: string | null;
        fulfillmentChecklist: unknown;
        completedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        itemName: string | null;
        itemCategory: string | null;
        itemSlaDays: number | null;
      }>;

      return rows.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        itemId: r.itemId,
        requesterId: r.requesterId,
        formData: r.formData,
        status: r.status,
        fulfillerId: r.fulfillerId,
        approvalId: r.approvalId,
        notes: r.notes,
        fulfillmentTicketId: r.fulfillmentTicketId,
        batchId: r.batchId,
        fulfillmentChecklist: r.fulfillmentChecklist,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        item: r.itemName != null
          ? {
              id: r.itemId,
              name: r.itemName,
              category: r.itemCategory,
              slaDays: r.itemSlaDays ?? 3,
            }
          : null,
      }));
    }),

  fulfillRequest: permissionProcedure("catalog", "write")
    .input(z.object({ id: z.string().uuid(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [req] = await db
        .update(catalogRequests)
        .set({
          status: "completed",
          fulfillerId: user!.id,
          notes: input.notes,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(catalogRequests.id, input.id),
            eq(catalogRequests.orgId, org!.id),
            inArray(catalogRequests.status, ["fulfilling", "approved"]),
          ),
        )
        .returning();
      if (!req) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request must be in fulfilling or approved state before marking complete.",
        });
      }
      return req;
    }),

  /** Creates fulfilment ticket for auto-approved (`submitted`) or legacy `approved` rows without a ticket yet. */
  startFulfilment: permissionProcedure("catalog", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(catalogRequests)
        .where(and(eq(catalogRequests.id, input.id), eq(catalogRequests.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.fulfillmentTicketId) return row;
      if (!["submitted", "approved"].includes(row.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only submitted or approved requests can start fulfilment.",
        });
      }
      await createCatalogFulfillmentTicket(db, {
        orgId: org!.id,
        orgSlug: org!.slug,
        catalogRequestId: row.id,
      });
      const [updated] = await db
        .update(catalogRequests)
        .set({ status: "fulfilling", updatedAt: new Date() })
        .where(and(eq(catalogRequests.id, input.id), eq(catalogRequests.orgId, org!.id)))
        .returning();
      return updated ?? row;
    }),

  // ── Admin: update catalog item (form builder) ───────────────────────────────

  updateItem: permissionProcedure("catalog", "admin")
    .input(z.object({
      id:              z.string().uuid(),
      name:            z.string().optional(),
      description:     z.string().optional(),
      category:        z.string().optional(),
      status:          z.enum(["active","inactive","retired"]).optional(),
      price:           z.string().optional(),
      approvalRequired: z.boolean().optional(),
      fulfillmentGroup: z.string().optional(),
      slaDays:         z.coerce.number().optional(),
      sortOrder:       z.number().optional(),
      formFields: z.array(z.object({
        id:       z.string(),
        label:    z.string(),
        type:     z.enum(["text","textarea","number","email","date","dropdown","checkbox","radio","file","user_picker"]),
        required: z.boolean().default(false),
        options:  z.array(z.string()).optional(),    // for dropdown/radio
        helpText: z.string().optional(),
        defaultValue: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...rest } = input;
      const [item] = await db.update(catalogItems)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(catalogItems.id, id), eq(catalogItems.orgId, org!.id)))
        .returning();
      return item;
    }),

  deleteItem: permissionProcedure("catalog", "delete")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db.update(catalogItems)
        .set({ status: "retired", updatedAt: new Date() })
        .where(and(eq(catalogItems.id, input.id), eq(catalogItems.orgId, org!.id)));
      return { ok: true };
    }),

  approveRequest: permissionProcedure("catalog", "admin")
    .input(z.object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (!input.approve) {
        const [req] = await db
          .update(catalogRequests)
          .set({
            status: "rejected",
            fulfillerId: user!.id,
            notes: input.reason,
            updatedAt: new Date(),
          })
          .where(and(eq(catalogRequests.id, input.id), eq(catalogRequests.orgId, org!.id)))
          .returning();
        if (!req) throw new TRPCError({ code: "NOT_FOUND" });
        return req;
      }

      try {
        await createCatalogFulfillmentTicket(db, {
          orgId: org!.id,
          orgSlug: org!.slug,
          catalogRequestId: input.id,
        });
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "Could not create fulfilment ticket",
        });
      }

      const [req] = await db
        .update(catalogRequests)
        .set({
          status: "fulfilling",
          fulfillerId: user!.id,
          notes: input.reason,
          updatedAt: new Date(),
        })
        .where(and(eq(catalogRequests.id, input.id), eq(catalogRequests.orgId, org!.id)))
        .returning();
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      return req;
    }),

  stats: permissionProcedure("catalog", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [totalItems]   = await db.select({ n: count() }).from(catalogItems).where(and(eq(catalogItems.orgId, org!.id), eq(catalogItems.status, "active")));
      const [totalReqs]    = await db.select({ n: count() }).from(catalogRequests).where(eq(catalogRequests.orgId, org!.id));
      const [pendingReqs]  = await db.select({ n: count() }).from(catalogRequests).where(and(eq(catalogRequests.orgId, org!.id), eq(catalogRequests.status, "pending_approval")));
      const [completedReqs]= await db.select({ n: count() }).from(catalogRequests).where(and(eq(catalogRequests.orgId, org!.id), eq(catalogRequests.status, "completed")));
      return { totalItems: totalItems.n, totalRequests: totalReqs.n, pendingApproval: pendingReqs.n, completed: completedReqs.n };
    }),
});
