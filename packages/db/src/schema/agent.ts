/**
 * agent.ts — server-side memory for the CoheronConnect Copilot agent.
 *
 * Why server-side (vs round-tripping history from the client like the
 * read-only v1 did):
 *   - Lets users resume a conversation across devices / sessions.
 *   - Gives admins a tamper-evident audit log of write actions the agent
 *     took ("agent created ticket TKT-123" must be reconstructable).
 *   - Bounds prompt size at the server: we summarize + truncate stored
 *     history into the next prompt instead of trusting the client.
 *
 * `agent_messages.role` is stored as text (not enum) on purpose — Anthropic
 * sometimes adds new content kinds (e.g. "tool" / "system_reminder") and
 * we don't want a migration for every one. Validators in the API layer
 * keep the values constrained.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const agentConversations = pgTable(
  "agent_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    model: text("model").notNull(),
    /** Rolling LLM-generated summary of older turns; lets us drop old detail
     *  while keeping context. NULL until the conversation hits a length
     *  threshold (defaulted in the agent service). */
    summary: text("summary"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserIdx: index("agent_conversations_org_user_idx").on(t.orgId, t.userId),
    updatedIdx: index("agent_conversations_updated_idx").on(t.updatedAt),
  }),
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    /** `user` | `assistant` | `tool` */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** When `role = "tool"`, the tool that produced this result. */
    toolName: text("tool_name"),
    toolArgs: jsonb("tool_args"),
    toolResultPreview: text("tool_result_preview"),
    sequence: integer("sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationSeqIdx: index("agent_messages_conversation_idx").on(
      t.conversationId,
      t.sequence,
    ),
  }),
);

export const agentConversationsRelations = relations(agentConversations, ({ one, many }) => ({
  org: one(organizations, { fields: [agentConversations.orgId], references: [organizations.id] }),
  user: one(users, { fields: [agentConversations.userId], references: [users.id] }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [agentMessages.conversationId],
    references: [agentConversations.id],
  }),
}));
