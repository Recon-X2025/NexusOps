import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const woStateEnum = pgEnum("wo_state", [
  "draft",
  "open",
  "pending_dispatch",
  "dispatched",
  "work_in_progress",
  "on_hold",
  "complete",
  "cancelled",
  "closed",
]);

export const woPriorityEnum = pgEnum("wo_priority", [
  "1_critical",
  "2_high",
  "3_moderate",
  "4_low",
  "5_planning",
]);

export const woTaskStateEnum = pgEnum("wo_task_state", [
  "pending_dispatch",
  "open",
  "accepted",
  "work_in_progress",
  "complete",
  "cancelled",
  "closed",
]);

export const woTypeEnum = pgEnum("wo_type", [
  "corrective",
  "preventive",
  "installation",
  "inspection",
  "repair",
  "upgrade",
  "decommission",
]);

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description"),
    state: woStateEnum("state").default("open").notNull(),
    type: woTypeEnum("type").default("corrective").notNull(),
    priority: woPriorityEnum("priority").default("4_low").notNull(),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    requestedById: uuid("requested_by_id").references(() => users.id),
    location: text("location"),
    category: text("category"),
    subcategory: text("subcategory"),
    cmdbCi: text("cmdb_ci"),
    scheduledStartDate: timestamp("scheduled_start_date", {
      withTimezone: true,
    }),
    scheduledEndDate: timestamp("scheduled_end_date", { withTimezone: true }),
    actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
    actualEndDate: timestamp("actual_end_date", { withTimezone: true }),
    estimatedHours: integer("estimated_hours"),
    actualHours: integer("actual_hours"),
    slaBreached: boolean("sla_breached").default(false).notNull(),
    workNotes: text("work_notes"),
    closeNotes: text("close_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orgIdx: index("work_orders_org_idx").on(t.orgId),
    orgNumberIdx: uniqueIndex("work_orders_org_number_idx").on(
      t.orgId,
      t.number,
    ),
    stateIdx: index("work_orders_state_idx").on(t.state),
    assigneeIdx: index("work_orders_assignee_idx").on(t.assignedToId),
  }),
);

export const workOrderTasks = pgTable(
  "work_order_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    shortDescription: text("short_description").notNull(),
    state: woTaskStateEnum("state").default("pending_dispatch").notNull(),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    plannedStartDate: timestamp("planned_start_date", { withTimezone: true }),
    plannedEndDate: timestamp("planned_end_date", { withTimezone: true }),
    actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
    actualEndDate: timestamp("actual_end_date", { withTimezone: true }),
    estimatedHours: integer("estimated_hours"),
    actualHours: integer("actual_hours"),
    workNotes: text("work_notes"),
    order: integer("order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workOrderIdx: index("wo_tasks_wo_idx").on(t.workOrderId),
  }),
);

export const workOrderActivityLogs = pgTable("work_order_activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workOrderId: uuid("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  note: text("note"),
  isInternal: boolean("is_internal").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  org: one(organizations, {
    fields: [workOrders.orgId],
    references: [organizations.id],
  }),
  assignedTo: one(users, {
    fields: [workOrders.assignedToId],
    references: [users.id],
  }),
  requestedBy: one(users, {
    fields: [workOrders.requestedById],
    references: [users.id],
  }),
  tasks: many(workOrderTasks),
  activityLogs: many(workOrderActivityLogs),
}));

export const workOrderTasksRelations = relations(
  workOrderTasks,
  ({ one }) => ({
    workOrder: one(workOrders, {
      fields: [workOrderTasks.workOrderId],
      references: [workOrders.id],
    }),
    assignedTo: one(users, {
      fields: [workOrderTasks.assignedToId],
      references: [users.id],
    }),
  }),
);
