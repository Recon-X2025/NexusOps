import {
  decimal,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";
import { tickets } from "./tickets";

export const surveyTypeEnum = pgEnum("survey_type", [
  "csat",
  "nps",
  "employee_pulse",
  "post_incident",
  "onboarding",
  "exit_interview",
  "training",
  "vendor_review",
]);

export const surveyStatusEnum = pgEnum("survey_status", [
  "draft",
  "active",
  "paused",
  "completed",
]);

// ── Surveys ────────────────────────────────────────────────────────────────
export const surveys = pgTable(
  "surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: surveyTypeEnum("type").notNull().default("csat"),
    status: surveyStatusEnum("status").notNull().default("draft"),
    questions: jsonb("questions").$type<Array<{
      id: string;
      type: "rating" | "text" | "nps" | "multiple_choice" | "yes_no";
      question: string;
      required: boolean;
      options?: string[];
    }>>().default([]),
    triggerEvent: text("trigger_event"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("surveys_org_idx").on(t.orgId),
    statusIdx: index("surveys_status_idx").on(t.orgId, t.status),
  }),
);

// ── Survey Responses ───────────────────────────────────────────────────────
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
    respondentId: uuid("respondent_id").references(() => users.id, { onDelete: "set null" }),
    answers: jsonb("answers").$type<Record<string, string | number | string[]>>().notNull().default({}),
    score: decimal("score", { precision: 5, scale: 2 }),
    comments: text("comments"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdx: index("survey_responses_survey_idx").on(t.surveyId),
    respondentIdx: index("survey_responses_respondent_idx").on(t.respondentId),
  }),
);

// ── Survey invites (public CSAT deeplinks) ──────────────────────────────────
export const surveyInvites = pgTable(
  "survey_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    requesterId: uuid("requester_id").references(() => users.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("sent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUidx: index("survey_invites_token_hash_uidx").on(t.tokenHash),
    orgIdx: index("survey_invites_org_idx").on(t.orgId, t.createdAt),
    ticketIdx: index("survey_invites_ticket_idx").on(t.ticketId),
  }),
);

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  org: one(organizations, { fields: [surveys.orgId], references: [organizations.id] }),
  createdBy: one(users, { fields: [surveys.createdById], references: [users.id] }),
  responses: many(surveyResponses),
}));
