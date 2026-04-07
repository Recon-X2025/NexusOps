/**
 * Custom Fields Framework
 *
 * Enables org admins to attach custom fields to any entity (tickets, assets,
 * employees, contracts, etc.) without schema migrations.
 *
 * Architecture:
 *  - `custom_field_definitions` — admin-defined field metadata
 *  - `custom_field_values`      — per-entity values (jsonb for flexibility)
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "textarea",
  "number",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "select",
  "multi_select",
  "url",
  "email",
  "phone",
  "user_reference",
  "file",
  "json",
]);

export const customFieldEntityEnum = pgEnum("custom_field_entity", [
  "ticket",
  "asset",
  "employee",
  "contract",
  "vendor",
  "project",
  "change_request",
  "lead",
  "invoice",
  "expense_claim",
  "okr_objective",
]);

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entity: customFieldEntityEnum("entity").notNull(),
    name: text("name").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").notNull().default("text"),
    /** JSON-encoded options for select/multi-select */
    options: jsonb("options"),
    /** Whether this field is required */
    isRequired: boolean("is_required").notNull().default(false),
    /** Whether visible on list views */
    isListColumn: boolean("is_list_column").notNull().default(false),
    /** Whether shown in forms (default true) */
    isFormField: boolean("is_form_field").notNull().default(true),
    /** Sort order in forms */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Default value (JSON-encoded) */
    defaultValue: text("default_value"),
    /** Field group / section name */
    groupName: text("group_name"),
    /** Placeholder text */
    placeholder: text("placeholder"),
    /** Help text shown below field */
    helpText: text("help_text"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEntityIdx: index("cfd_org_entity_idx").on(t.orgId, t.entity),
    orgEntityNameIdx: uniqueIndex("cfd_org_entity_name_idx").on(t.orgId, t.entity, t.name),
  }),
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    entity: customFieldEntityEnum("entity").notNull(),
    /** UUID of the record (ticket.id, asset.id, etc.) */
    entityId: uuid("entity_id").notNull(),
    /** JSON-encoded value — supports all types including arrays and objects */
    value: jsonb("value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEntityRecordIdx: index("cfv_org_entity_record_idx").on(t.orgId, t.entity, t.entityId),
    fieldEntityIdx: index("cfv_field_entity_idx").on(t.fieldId, t.entityId),
    uniqueFieldEntity: uniqueIndex("cfv_unique_field_entity_idx").on(t.fieldId, t.entityId),
  }),
);
