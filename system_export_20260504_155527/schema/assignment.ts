import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { teams } from "./tickets";

// ── Assignment Rules ────────────────────────────────────────────────────────
// Configures how work items are auto-routed to a team and agent on creation.
//
// entity_type : 'ticket' | 'work_order' | 'hr_case'
// match_value : the category/type string that triggers this rule
//               • ticket    → ticketCategory UUID
//               • work_order→ WO type enum value (e.g. "corrective")
//               • hr_case   → hrCaseType enum value (e.g. "onboarding")
//               NULL = catch-all fallback for that entity_type
//
// algorithm   : how to pick the agent within the resolved team
//               'load_based'  — agent with fewest open items; tie-break oldest last_assigned_at
//               'round_robin' — cycle by oldest last_assigned_at regardless of load
//
// The Workflow Engine's ACTION_ASSIGN node calls resolveAssignment() directly,
// so this same table drives both immediate and deferred routing.
export const assignmentRules = pgTable(
  "assignment_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // 'ticket' | 'work_order' | 'hr_case'
    matchValue: text("match_value"),           // NULL = catch-all
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    algorithm: text("algorithm").notNull().default("load_based"), // 'load_based' | 'round_robin'
    capacityThreshold: integer("capacity_threshold").notNull().default(20),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("assignment_rules_org_idx").on(t.orgId),
    entityTypeIdx: index("assignment_rules_entity_type_idx").on(t.orgId, t.entityType),
  }),
);

// ── User Assignment Stats ───────────────────────────────────────────────────
// Tracks when each user was last auto-assigned a work item, per entity type.
// Used by round_robin (sort by last_assigned_at ASC) and as a tie-breaker
// for load_based. Updated atomically whenever resolveAssignment() picks a user.
export const userAssignmentStats = pgTable(
  "user_assignment_stats",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("user_assignment_stats_pk").on(t.orgId, t.userId, t.entityType),
  }),
);
