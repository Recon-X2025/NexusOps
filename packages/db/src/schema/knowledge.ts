import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
// kbArticles and kbArticleStatusEnum already exist in portal.ts
// This file adds kb_feedback for article ratings

// ── KB Feedback ────────────────────────────────────────────────────────────
export const kbFeedback = pgTable(
  "kb_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    helpful: boolean("helpful").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ articleIdx: index("kb_feedback_article_idx").on(t.articleId) }),
);

export const kbFeedbackRelations = relations(kbFeedback, ({ one }) => ({
  user: one(users, { fields: [kbFeedback.userId], references: [users.id] }),
}));
