import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

// ── Inventory Items (Parts & Stock) ────────────────────────────────────────

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    partNumber: text("part_number").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("spare"),
    unit: text("unit").notNull().default("each"),
    qty: integer("qty").notNull().default(0),
    minQty: integer("min_qty").notNull().default(5),
    location: text("location"),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    supplierId: text("supplier_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("inventory_items_org_idx").on(t.orgId),
    partNumIdx: index("inventory_items_part_num_idx").on(t.partNumber),
  }),
);

// ── Inventory Transactions ──────────────────────────────────────────────────

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // issue | reorder | intake | adjustment
    qty: integer("qty").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    performedById: uuid("performed_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("inventory_tx_org_idx").on(t.orgId),
    itemIdx: index("inventory_tx_item_idx").on(t.itemId),
  }),
);
