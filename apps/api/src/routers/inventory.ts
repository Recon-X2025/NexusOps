import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  inventoryItems,
  inventoryTransactions,
  eq,
  and,
  desc,
  sql,
} from "@nexusops/db";

export const inventoryRouter = router({
  list: permissionProcedure("work_orders", "read")
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        lowStock: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const rows = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.orgId, org!.id))
        .orderBy(inventoryItems.name)
        .limit(input?.limit ?? 100);

      const filtered = rows.filter((r: (typeof rows)[number]) => {
        if (input?.category && r.category !== input.category) return false;
        if (input?.lowStock && r.qty > r.minQty) return false;
        if (input?.search) {
          const s = input.search.toLowerCase();
          if (!r.name.toLowerCase().includes(s) && !r.partNumber.toLowerCase().includes(s)) return false;
        }
        return true;
      });

      return { items: filtered, total: filtered.length };
    }),

  create: permissionProcedure("work_orders", "write")
    .input(
      z.object({
        partNumber: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().default("spare"),
        unit: z.string().default("each"),
        qty: z.number().int().min(0).default(0),
        minQty: z.number().int().min(0).default(5),
        location: z.string().optional(),
        unitCost: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db
        .insert(inventoryItems)
        .values({ orgId: org!.id, ...input })
        .returning();

      if (input.qty > 0) {
        await db.insert(inventoryTransactions).values({
          orgId: org!.id,
          itemId: item!.id,
          type: "intake",
          qty: input.qty,
          notes: "Initial stock intake",
          performedById: ctx.user!.id,
        });
      }

      return item;
    }),

  issueStock: permissionProcedure("work_orders", "write")
    .input(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().int().min(1),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)));

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      if (item.qty < input.qty) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient stock: ${item.qty} available, ${input.qty} requested`,
        });
      }

      await db
        .update(inventoryItems)
        .set({ qty: item.qty - input.qty, lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryItems.id, input.itemId));

      const [tx] = await db
        .insert(inventoryTransactions)
        .values({
          orgId: org!.id,
          itemId: input.itemId,
          type: "issue",
          qty: -input.qty,
          reference: input.reference,
          notes: input.notes,
          performedById: ctx.user!.id,
        })
        .returning();

      return tx;
    }),

  reorder: permissionProcedure("work_orders", "write")
    .input(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().int().min(1),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)));

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });

      const [tx] = await db
        .insert(inventoryTransactions)
        .values({
          orgId: org!.id,
          itemId: input.itemId,
          type: "reorder",
          qty: input.qty,
          notes: input.notes ?? `Reorder requested for ${input.qty} × ${item.name}`,
          performedById: ctx.user!.id,
        })
        .returning();

      return tx;
    }),

  intake: permissionProcedure("work_orders", "write")
    .input(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().int().min(1),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)));

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });

      await db
        .update(inventoryItems)
        .set({ qty: item.qty + input.qty, updatedAt: new Date() })
        .where(eq(inventoryItems.id, input.itemId));

      const [tx] = await db
        .insert(inventoryTransactions)
        .values({
          orgId: org!.id,
          itemId: input.itemId,
          type: "intake",
          qty: input.qty,
          reference: input.reference,
          notes: input.notes,
          performedById: ctx.user!.id,
        })
        .returning();

      return tx;
    }),

  transactions: permissionProcedure("work_orders", "read")
    .input(z.object({ itemId: z.string().uuid().optional(), limit: z.number().int().max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(inventoryTransactions.orgId, org!.id)];
      if (input.itemId) conditions.push(eq(inventoryTransactions.itemId, input.itemId));
      return db
        .select()
        .from(inventoryTransactions)
        .where(and(...conditions))
        .orderBy(desc(inventoryTransactions.createdAt))
        .limit(input.limit);
    }),
});
