import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const notificationTypeEnum = pgEnum("notification_type", [
  "info",
  "warning",
  "success",
  "error",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "in_app",
  "slack",
]);

// ── Notifications ──────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    type: notificationTypeEnum("type").notNull().default("info"),
    isRead: boolean("is_read").notNull().default(false),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
    orgIdx: index("notifications_org_idx").on(t.orgId),
    unreadIdx: index("notifications_unread_idx").on(t.userId, t.isRead),
    createdAtIdx: index("notifications_created_at_idx").on(t.createdAt),
  }),
);

// ── Notification Preferences ───────────────────────────────────────────────
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    eventType: text("event_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => ({ userIdx: index("notification_prefs_user_idx").on(t.userId) }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  org: one(organizations, { fields: [notifications.orgId], references: [organizations.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
