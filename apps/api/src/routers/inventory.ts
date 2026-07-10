import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  inventoryItems,
  inventoryTransactions,
  inventoryCostLayers,
  reorderPolicies,
  eq,
  and,
  desc,
  asc,
  sql,
} from "@coheronconnect/db";
import {
  issueFifo,
  intakeWac,
  issueWac,
  type CostLayer,
} from "@coheronconnect/payroll-math";
import { postInventoryCogsJournalEntry } from "../lib/inventory-journal";
import { currentFY } from "./accounting";

export const inventoryRouter = router({
  list: permissionProcedure("inventory", "read")
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

  create: permissionProcedure("inventory", "write")
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
        poReference: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { poReference, ...itemInput } = input;
      // Atomicity: the item insert and the initial intake transaction must
      // commit together so an item is never created without its stock ledger
      // entry (and vice versa).
      return await db.transaction(async (tx) => {
        const [item] = await tx
          .insert(inventoryItems)
          .values({ orgId: org!.id, ...itemInput })
          .returning();

        if (input.qty > 0) {
          await tx.insert(inventoryTransactions).values({
            orgId: org!.id,
            itemId: item!.id,
            type: "intake",
            qty: input.qty,
            reference: poReference ?? null,
            notes: poReference
              ? `Initial stock intake — Ref: ${poReference}`
              : "Initial stock intake",
            performedById: ctx.user!.id,
          });
        }

        return item;
      });
    }),

  /** Update inventory item metadata (name, partNumber, category, unit, minQty, location, unitCost). */
  update: permissionProcedure("inventory", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        partNumber: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        minQty: z.number().int().min(0).optional(),
        location: z.string().optional(),
        unitCost: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...fields } = input;
      const [item] = await db
        .update(inventoryItems)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(inventoryItems.id, id), eq(inventoryItems.orgId, org!.id)))
        .returning();
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      return item;
    }),

  /** Delete an inventory item and all its transactions (cascade). */
  delete: permissionProcedure("inventory", "admin")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deleted] = await db
        .delete(inventoryItems)
        .where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.orgId, org!.id)))
        .returning({ id: inventoryItems.id });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      return { success: true };
    }),

  issueStock: permissionProcedure("inventory", "write")
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

      // Atomicity: the quantity decrement and the issue ledger entry must
      // commit together so stock levels never drift from the transaction log.
      return await db.transaction(async (trx) => {
        await trx
          .update(inventoryItems)
          .set({ qty: item.qty - input.qty, lastUsedAt: new Date(), updatedAt: new Date() })
          .where(eq(inventoryItems.id, input.itemId));

        const [tx] = await trx
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
      });
    }),

  reorder: permissionProcedure("inventory", "write")
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

  intake: permissionProcedure("inventory", "write")
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

      // Atomicity: the quantity increment and the intake ledger entry must
      // commit together so stock levels never drift from the transaction log.
      return await db.transaction(async (trx) => {
        await trx
          .update(inventoryItems)
          .set({ qty: item.qty + input.qty, updatedAt: new Date() })
          .where(eq(inventoryItems.id, input.itemId));

        const [tx] = await trx
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
      });
    }),

  transactions: permissionProcedure("inventory", "read")
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

  listPolicies: permissionProcedure("inventory", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(reorderPolicies)
        .where(eq(reorderPolicies.orgId, org!.id))
        .orderBy(desc(reorderPolicies.createdAt));
    }),

  createPolicy: permissionProcedure("inventory", "write")
    .input(z.object({
      itemId: z.string().uuid(),
      thresholdQty: z.number().int().min(0),
      reorderQty: z.number().int().min(1),
      isAutomated: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [policy] = await db
        .insert(reorderPolicies)
        .values({ orgId: org!.id, ...input })
        .returning();
      return policy;
    }),

  // ── Costed valuation (Sprint 2.4) ─────────────────────────────────────────
  // Costed intake/issue that maintain the item's valuation state and compute
  // COGS on issue via the pure-math FIFO/WAC engine in @coheronconnect/payroll-math.
  // FIFO keeps its authoritative state in inventoryCostLayers; WAC keeps a
  // running weighted-average on the item. Both keep avgUnitCost/stockValue in
  // step for reporting.
  valuation: router({
    /** Set the valuation method for an item (only before any costed stock exists). */
    setMethod: permissionProcedure("inventory", "write")
      .input(z.object({ itemId: z.string().uuid(), method: z.enum(["FIFO", "WAC"]) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [item] = await db
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
        if (Number(item.stockValue) > 0 || item.qty > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot change valuation method once the item carries stock.",
          });
        }
        const [updated] = await db
          .update(inventoryItems)
          .set({ valuationMethod: input.method, updatedAt: new Date() })
          .where(eq(inventoryItems.id, input.itemId))
          .returning();
        return updated;
      }),

    /** Costed intake: adds qty at a purchase unit cost, updating valuation state. */
    intake: permissionProcedure("inventory", "write")
      .input(
        z.object({
          itemId: z.string().uuid(),
          qty: z.number().int().min(1),
          unitCost: z.coerce.number().min(0),
          reference: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.transaction(async (tx) => {
          const [item] = await tx
            .select()
            .from(inventoryItems)
            .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)))
            .for("update");
          if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });

          const newQty = item.qty + input.qty;
          let avgUnitCost: number;
          let stockValue: number;

          if (item.valuationMethod === "FIFO") {
            // Append a new cost layer at the next sequence.
            const [maxRow] = await tx
              .select({ maxSeq: sql<number>`coalesce(max(${inventoryCostLayers.sequence}), 0)` })
              .from(inventoryCostLayers)
              .where(and(eq(inventoryCostLayers.itemId, input.itemId), eq(inventoryCostLayers.orgId, org!.id)));
            const nextSeq = Number(maxRow?.maxSeq ?? 0) + 1;
            await tx.insert(inventoryCostLayers).values({
              orgId: org!.id,
              itemId: input.itemId,
              sequence: nextSeq,
              qty: input.qty,
              unitCost: String(input.unitCost),
            });
            stockValue = Number(item.stockValue) + input.qty * input.unitCost;
            avgUnitCost = newQty > 0 ? stockValue / newQty : 0;
          } else {
            const wac = intakeWac(
              { qty: item.qty, avgUnitCost: Number(item.avgUnitCost) },
              input.qty,
              input.unitCost,
            );
            avgUnitCost = wac.avgUnitCost;
            stockValue = wac.totalValue;
          }

          await tx
            .update(inventoryItems)
            .set({
              qty: newQty,
              avgUnitCost: String(avgUnitCost),
              stockValue: String(Math.round(stockValue * 100) / 100),
              unitCost: String(input.unitCost),
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, input.itemId));

          const [txRow] = await tx
            .insert(inventoryTransactions)
            .values({
              orgId: org!.id,
              itemId: input.itemId,
              type: "intake",
              qty: input.qty,
              unitCost: String(input.unitCost),
              reference: input.reference,
              notes: input.notes,
              performedById: ctx.user!.id,
            })
            .returning();

          return { transaction: txRow, qty: newQty, avgUnitCost, stockValue: Math.round(stockValue * 100) / 100 };
        });
      }),

    /** Costed issue: consumes qty and expenses COGS via FIFO layers or WAC average. */
    issue: permissionProcedure("inventory", "write")
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
        return db.transaction(async (tx) => {
          const [item] = await tx
            .select()
            .from(inventoryItems)
            .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)))
            .for("update");
          if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
          if (item.qty < input.qty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient stock: ${item.qty} available, ${input.qty} requested`,
            });
          }

          const newQty = item.qty - input.qty;
          let cogs: number;
          let stockValue: number;
          let avgUnitCost = Number(item.avgUnitCost);

          if (item.valuationMethod === "FIFO") {
            const layerRows = await tx
              .select()
              .from(inventoryCostLayers)
              .where(and(eq(inventoryCostLayers.itemId, input.itemId), eq(inventoryCostLayers.orgId, org!.id)))
              .orderBy(asc(inventoryCostLayers.sequence))
              .for("update");
            const active = layerRows.filter((l) => l.qty > 0);
            const layers: CostLayer[] = active.map((l) => ({ qty: l.qty, unitCost: Number(l.unitCost) }));
            const res = issueFifo(layers, input.qty);
            cogs = res.cogs;

            // Persist the depleted/updated layers back by re-walking consumption.
            let toConsume = input.qty;
            for (const l of active) {
              if (toConsume <= 0) break;
              const take = Math.min(l.qty, toConsume);
              const remaining = l.qty - take;
              toConsume -= take;
              await tx
                .update(inventoryCostLayers)
                .set({ qty: remaining })
                .where(eq(inventoryCostLayers.id, l.id));
            }
            stockValue = Math.round((Number(item.stockValue) - cogs) * 100) / 100;
            avgUnitCost = newQty > 0 ? stockValue / newQty : 0;
          } else {
            const wac = issueWac(
              { qty: item.qty, avgUnitCost: Number(item.avgUnitCost) },
              input.qty,
            );
            cogs = wac.cogs;
            avgUnitCost = wac.avgUnitCost;
            stockValue = Math.round(newQty * avgUnitCost * 100) / 100;
          }

          await tx
            .update(inventoryItems)
            .set({
              qty: newQty,
              avgUnitCost: String(avgUnitCost),
              stockValue: String(stockValue),
              lastUsedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, input.itemId));

          const [txRow] = await tx
            .insert(inventoryTransactions)
            .values({
              orgId: org!.id,
              itemId: input.itemId,
              type: "issue",
              qty: -input.qty,
              cogs: String(cogs),
              reference: input.reference,
              notes: input.notes,
              performedById: ctx.user!.id,
            })
            .returning();

          // Post the COGS GL journal entry (Dr 5100 / Cr 1170) so the ledger
          // reflects the expensed stock. Skipped (null) when the accounts aren't
          // seeded or cogs is a no-op; the issue itself still succeeds.
          const jeDate = new Date();
          await postInventoryCogsJournalEntry(tx, {
            orgId: org!.id,
            createdById: ctx.user?.id ?? null,
            itemId: input.itemId,
            cogs,
            date: jeDate,
            financialYear: currentFY(jeDate),
            reference: input.reference,
          });

          return { transaction: txRow, cogs, qty: newQty, avgUnitCost, stockValue };
        });
      }),

    /** Cost layers for one FIFO item (oldest first, undepleted). */
    layers: permissionProcedure("inventory", "read")
      .input(z.object({ itemId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db
          .select()
          .from(inventoryCostLayers)
          .where(and(eq(inventoryCostLayers.itemId, input.itemId), eq(inventoryCostLayers.orgId, org!.id)))
          .orderBy(asc(inventoryCostLayers.sequence));
      }),

    /** Valuation report: per-item book value + org total stock value. */
    report: permissionProcedure("inventory", "read")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        const rows = await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.orgId, org!.id))
          .orderBy(inventoryItems.name);
        const items = rows.map((r) => ({
          id: r.id,
          name: r.name,
          partNumber: r.partNumber,
          method: r.valuationMethod,
          qty: r.qty,
          avgUnitCost: Number(r.avgUnitCost),
          stockValue: Number(r.stockValue),
        }));
        const totalStockValue = Math.round(items.reduce((s, i) => s + i.stockValue, 0) * 100) / 100;
        return { items, totalStockValue };
      }),
  }),
});
