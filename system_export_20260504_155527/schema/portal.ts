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
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";
import { ticketCategories } from "./tickets";

// ── Enums ──────────────────────────────────────────────────────────────────
export const kbArticleStatusEnum = pgEnum("kb_article_status", [
  "draft",
  "published",
  "archived",
]);

// ── KB Articles ────────────────────────────────────────────────────────────
export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    categoryId: uuid("category_id").references(() => ticketCategories.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default([]),
    status: kbArticleStatusEnum("status").notNull().default("draft"),
    viewCount: integer("view_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    notHelpfulCount: integer("not_helpful_count").notNull().default(0),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    embeddingVector: text("embedding_vector"), // stored as JSON string of number[]
    contentVersion: integer("content_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("kb_articles_org_idx").on(t.orgId),
    statusIdx: index("kb_articles_status_idx").on(t.orgId, t.status),
  }),
);

// ── KB article revisions (US-ITSM-008) ─────────────────────────────────────
export const kbArticleRevisions = pgTable(
  "kb_article_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => kbArticles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    articleIdx: index("kb_article_revisions_article_idx").on(t.articleId),
    articleVersionUidx: uniqueIndex("kb_article_revisions_article_version_uidx").on(
      t.articleId,
      t.version,
    ),
  }),
);

// ── Request Templates ──────────────────────────────────────────────────────
export const requestTemplates = pgTable(
  "request_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => ticketCategories.id, { onDelete: "set null" }),
    fields: jsonb("fields")
      .$type<Array<{
        key: string;
        label: string;
        type: "text" | "textarea" | "select" | "checkbox" | "date" | "file";
        required: boolean;
        options?: string[];
        placeholder?: string;
      }>>()
      .notNull()
      .default([]),
    defaultPriorityId: uuid("default_priority_id"),
    defaultAssigneeId: uuid("default_assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    workflowId: uuid("workflow_id"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("request_templates_org_idx").on(t.orgId),
  }),
);

// ── Announcements ──────────────────────────────────────────────────────────
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: text("type").notNull().default("info"), // info | warning | maintenance | outage
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("announcements_org_idx").on(t.orgId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const kbArticlesRelations = relations(kbArticles, ({ one, many }) => ({
  org: one(organizations, { fields: [kbArticles.orgId], references: [organizations.id] }),
  author: one(users, { fields: [kbArticles.authorId], references: [users.id] }),
  category: one(ticketCategories, { fields: [kbArticles.categoryId], references: [ticketCategories.id] }),
  revisions: many(kbArticleRevisions),
}));

export const kbArticleRevisionsRelations = relations(kbArticleRevisions, ({ one }) => ({
  article: one(kbArticles, { fields: [kbArticleRevisions.articleId], references: [kbArticles.id] }),
  org: one(organizations, { fields: [kbArticleRevisions.orgId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [kbArticleRevisions.createdBy], references: [users.id] }),
}));
