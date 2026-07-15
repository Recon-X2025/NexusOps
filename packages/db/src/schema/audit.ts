import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const superAdminAuditLogs = pgTable("super_admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email").notNull(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
