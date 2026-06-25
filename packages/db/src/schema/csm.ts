import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { crmAccounts, crmContacts } from "./crm";

export const csmCases = pgTable(
  "csm_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("new"),
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    requesterId: uuid("requester_id").references(() => users.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("csm_cases_org_idx").on(t.orgId),
    statusIdx: index("csm_cases_status_idx").on(t.status),
    priorityIdx: index("csm_cases_priority_idx").on(t.priority),
    accountIdx: index("csm_cases_account_idx").on(t.accountId),
  })
);
