import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
// approvalChains and approvalRequests live in procurement.ts (re-used cross-module)
// This file adds approval steps for multi-step sequential approvals

export const approvalStepStatusEnum = pgEnum("approval_step_status", [
  "pending",
  "approved",
  "rejected",
  "skipped",
]);

// ── Approval Steps ─────────────────────────────────────────────────────────
// Sequential steps within a single approval request
export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    approverId: uuid("approver_id").notNull().references(() => users.id),
    sequence: integer("sequence").notNull().default(1),
    status: approvalStepStatusEnum("status").notNull().default("pending"),
    comments: text("comments"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("approval_steps_request_idx").on(t.requestId),
    approverIdx: index("approval_steps_approver_idx").on(t.approverId),
  }),
);

export const approvalStepsRelations = relations(approvalSteps, ({ one }) => ({
  approver: one(users, { fields: [approvalSteps.approverId], references: [users.id] }),
}));
