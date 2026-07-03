import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

// ── Valuation method ────────────────────────────────────────────────────────
// FIFO consumes the oldest cost layers first; WAC expenses at a running
// weighted-average unit cost. Set per item; drives COGS on issue.
export const inventoryValuationMethodEnum = pgEnum("inventory_valuation_method", [
  "FIFO",
  "WAC",
]);

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
    // Valuation state: method + running weighted-average cost (WAC) and the
    // current total book value of stock on hand (maintained on every costed
    // intake/issue). For FIFO the authoritative state is inventoryCostLayers;
    // avgUnitCost/stockValue are kept in step for reporting.
    valuationMethod: inventoryValuationMethodEnum("valuation_method")
      .notNull()
      .default("WAC"),
    avgUnitCost: numeric("avg_unit_cost", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    stockValue: numeric("stock_value", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
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
    // Costed movement fields: intakes carry the per-unit purchase cost; issues
    // carry the cost of goods sold (COGS) computed by the valuation engine.
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
    cogs: numeric("cogs", { precision: 15, scale: 2 }),
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

// ── FIFO cost layers ────────────────────────────────────────────────────────
// One row per undepleted purchase lot for a FIFO-valued item, oldest first.
// Issues consume from the lowest sequence upward; depleted lots keep qty 0 for
// audit. WAC items do not use this table.
export const inventoryCostLayers = pgTable(
  "inventory_cost_layers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    // Monotonic intake order; issues consume ascending.
    sequence: integer("sequence").notNull(),
    qty: integer("qty").notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("inventory_cost_layers_org_idx").on(t.orgId),
    itemIdx: index("inventory_cost_layers_item_idx").on(t.itemId),
  }),
);
// ── Reorder Policies ─────────────────────────────────────────────────────────
export const reorderPolicies = pgTable(
  "reorder_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    thresholdQty: integer("threshold_qty").notNull().default(5),
    reorderQty: integer("reorder_qty").notNull().default(20),
    isAutomated: boolean("is_automated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("reorder_policies_org_idx").on(t.orgId),
    itemIdx: index("reorder_policies_item_idx").on(t.itemId),
  }),
);
