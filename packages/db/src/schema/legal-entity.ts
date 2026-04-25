import { boolean, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

export const legalEntities = pgTable(
  "legal_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    cin: text("cin"),
    parentLegalEntityId: uuid("parent_legal_entity_id"),
    holdingPercentage: numeric("holding_percentage", { precision: 6, scale: 2 }),
    materialSubsidiary: boolean("material_subsidiary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("legal_entities_org_idx").on(t.orgId),
    orgCodeIdx: uniqueIndex("legal_entities_org_code_idx").on(t.orgId, t.code),
  }),
);

export const legalEntitiesRelations = relations(legalEntities, ({ one }) => ({
  org: one(organizations, { fields: [legalEntities.orgId], references: [organizations.id] }),
}));
