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
import { relations, sql } from "drizzle-orm";
import { organizations, users } from "./auth";
import { ciItems } from "./assets";
import { knownErrors } from "./changes";

// ── Enums ──────────────────────────────────────────────────────────────────
export const ticketTypeEnum = pgEnum("ticket_type", [
  "incident",
  "request",
  "problem",
  "change",
]);

export const ticketImpactEnum = pgEnum("ticket_impact", ["high", "medium", "low"]);
export const ticketUrgencyEnum = pgEnum("ticket_urgency", ["high", "medium", "low"]);
export const ticketRequesterTypeEnum = pgEnum("ticket_requester_type", ["internal", "external"]);

export const ticketStatusCategoryEnum = pgEnum("ticket_status_category", [
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
]);

export const ticketRelationTypeEnum = pgEnum("ticket_relation_type", [
  "blocks",
  "blocked_by",
  "duplicate",
  "related",
]);

// ── Ticket Categories ──────────────────────────────────────────────────────
export const ticketCategories = pgTable(
  "ticket_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#6366f1"),
    icon: text("icon"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("ticket_categories_org_idx").on(t.orgId),
  }),
);

// ── Ticket Priorities ──────────────────────────────────────────────────────
export const ticketPriorities = pgTable(
  "ticket_priorities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6b7280"),
    slaResponseMinutes: integer("sla_response_minutes"),
    slaResolveMinutes: integer("sla_resolve_minutes"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("ticket_priorities_org_idx").on(t.orgId),
  }),
);

// ── Ticket Statuses ────────────────────────────────────────────────────────
export const ticketStatuses = pgTable(
  "ticket_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6b7280"),
    category: ticketStatusCategoryEnum("category").notNull().default("open"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("ticket_statuses_org_idx").on(t.orgId),
  }),
);

// ── Teams ──────────────────────────────────────────────────────────────────
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("teams_org_idx").on(t.orgId),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("team_members_pk").on(t.teamId, t.userId),
  }),
);

// ── Tickets ────────────────────────────────────────────────────────────────
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // ORG-0001 format
    title: text("title").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => ticketCategories.id, { onDelete: "set null" }),
    priorityId: uuid("priority_id").references(() => ticketPriorities.id, { onDelete: "set null" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => ticketStatuses.id),
    type: ticketTypeEnum("type").notNull().default("request"),
    impact: ticketImpactEnum("impact").notNull().default("medium"),
    urgency: ticketUrgencyEnum("urgency").notNull().default("medium"),
    subcategory: text("subcategory"),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    requesterType: ticketRequesterTypeEnum("requester_type").notNull().default("internal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    configurationItemId: uuid("configuration_item_id").references(() => ciItems.id, {
      onDelete: "set null",
    }),
    knownErrorId: uuid("known_error_id").references(() => knownErrors.id, {
      onDelete: "set null",
    }),
    isMajorIncident: boolean("is_major_incident").notNull().default(false),
    intakeChannel: text("intake_channel").notNull().default("portal"),
    resolutionNotes: text("resolution_notes"),
    escalationLevel: integer("escalation_level").notNull().default(0),
    reopenCount: integer("reopen_count").notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    slaBreached: boolean("sla_breached").notNull().default(false),
    slaResponseDueAt: timestamp("sla_response_due_at", { withTimezone: true }),
    slaResolveDueAt: timestamp("sla_resolve_due_at", { withTimezone: true }),
    slaRespondedAt: timestamp("sla_responded_at", { withTimezone: true }),
    slaPausedAt: timestamp("sla_paused_at", { withTimezone: true }),
    slaPauseDurationMins: integer("sla_pause_duration_mins").notNull().default(0),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    searchVector: text("search_vector"), // tsvector stored as text
    embeddingVector: text("embedding_vector"), // pgvector: stored as JSON float[]
    externalId: text("external_id"), // e.g. Jira issue key or SAP incident number
    externalSource: text("external_source"), // 'jira' | 'sap' | etc.
    idempotencyKey: text("idempotency_key"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("tickets_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("tickets_org_idx").on(t.orgId),
    statusIdx: index("tickets_status_idx").on(t.statusId),
    assigneeIdx: index("tickets_assignee_idx").on(t.assigneeId),
    requesterIdx: index("tickets_requester_idx").on(t.requesterId),
    createdAtIdx: index("tickets_created_at_idx").on(t.createdAt),
    // Partial unique index: only enforce uniqueness when the key is non-null.
    // Allows unlimited inserts without a key while deduplicating keyed requests.
    idempotencyKeyIdx: uniqueIndex("tickets_idempotency_key_idx")
      .on(t.orgId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  }),
);

// ── Ticket Comments ────────────────────────────────────────────────────────
export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size: number }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: index("ticket_comments_ticket_idx").on(t.ticketId),
  }),
);

// ── Ticket Watchers ────────────────────────────────────────────────────────
export const ticketWatchers = pgTable(
  "ticket_watchers",
  {
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("ticket_watchers_pk").on(t.ticketId, t.userId),
  }),
);

// ── Ticket Relations ───────────────────────────────────────────────────────
export const ticketRelations = pgTable(
  "ticket_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    type: ticketRelationTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index("ticket_relations_source_idx").on(t.sourceId),
    targetIdx: index("ticket_relations_target_idx").on(t.targetId),
  }),
);

// ── SLA Policies ───────────────────────────────────────────────────────────
export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    responseTimeMinutes: integer("response_time_minutes"),
    resolveTimeMinutes: integer("resolve_time_minutes"),
    escalationRules: jsonb("escalation_rules").$type<Array<Record<string, unknown>>>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("sla_policies_org_idx").on(t.orgId),
  }),
);

// ── Ticket Activity Log ────────────────────────────────────────────────────
export const ticketActivityLogs = pgTable(
  "ticket_activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: index("ticket_activity_logs_ticket_idx").on(t.ticketId),
    createdAtIdx: index("ticket_activity_logs_created_at_idx").on(t.createdAt),
  }),
);

/** OLA / handoff timer rows — created when assignee changes (Phase B2). */
export const ticketHandoffs = pgTable(
  "ticket_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    fromAssigneeId: uuid("from_assignee_id").references(() => users.id, { onDelete: "set null" }),
    toAssigneeId: uuid("to_assignee_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    metAt: timestamp("met_at", { withTimezone: true }),
  },
  (t) => ({
    orgTicketIdx: index("ticket_handoffs_org_ticket_idx").on(t.orgId, t.ticketId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  org: one(organizations, { fields: [tickets.orgId], references: [organizations.id] }),
  requester: one(users, { fields: [tickets.requesterId], references: [users.id], relationName: "requester" }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id], relationName: "assignee" }),
  category: one(ticketCategories, { fields: [tickets.categoryId], references: [ticketCategories.id] }),
  priority: one(ticketPriorities, { fields: [tickets.priorityId], references: [ticketPriorities.id] }),
  status: one(ticketStatuses, { fields: [tickets.statusId], references: [ticketStatuses.id] }),
  team: one(teams, { fields: [tickets.teamId], references: [teams.id] }),
  configurationItem: one(ciItems, {
    fields: [tickets.configurationItemId],
    references: [ciItems.id],
    relationName: "ticket_configuration_item",
  }),
  knownError: one(knownErrors, {
    fields: [tickets.knownErrorId],
    references: [knownErrors.id],
    relationName: "ticket_known_error",
  }),
  comments: many(ticketComments),
  watchers: many(ticketWatchers),
  activityLogs: many(ticketActivityLogs),
}));
