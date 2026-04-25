import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────
export const orgPlanEnum = pgEnum("org_plan", [
  "free",
  "starter",
  "professional",
  "enterprise",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "invited",
  "disabled",
]);

// ── Organizations ──────────────────────────────────────────────────────────
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    plan: orgPlanEnum("plan").notNull().default("free"),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(t.slug),
  }),
);

// ── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** bcrypt hash; null for OAuth-only users (future) */
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("member"),
    /** Fine-grained RBAC matrix role (e.g. hr_manager, finance_manager). Falls back to role→SystemRole mapping when null. */
    matrixRole: text("matrix_role"),
    status: userStatusEnum("status").notNull().default("invited"),
    /** US-SEC-001: set true after org-verified MFA enrollment (TOTP / IdP); enforced when `settings.security.requireMfaForMatrixRoles` matches. */
    mfaEnrolled: boolean("mfa_enrolled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmailIdx: uniqueIndex("users_org_email_idx").on(t.orgId, t.email),
    orgIdx: index("users_org_id_idx").on(t.orgId),
  }),
);

// ── Sessions ───────────────────────────────────────────────────────────────
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_id_idx").on(t.userId),
  }),
);

// ── Accounts (OAuth) ───────────────────────────────────────────────────────
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerIdx: uniqueIndex("accounts_provider_idx").on(t.provider, t.providerAccountId),
    userIdx: index("accounts_user_id_idx").on(t.userId),
  }),
);

// ── Verification Tokens ────────────────────────────────────────────────────
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(), // userId for password_reset, email for magic_link
  token: text("token").notNull(),           // SHA-256 hash of the raw token
  type: text("type").notNull().default("magic_link"), // magic_link | invite | password_reset
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── API Keys ───────────────────────────────────────────────────────────────
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
    permissions: jsonb("permissions").$type<Record<string, string[]>>().notNull().default({}),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("api_keys_org_id_idx").on(t.orgId),
    hashIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash),
  }),
);

// ── RBAC: Roles ────────────────────────────────────────────────────────────
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: uniqueIndex("roles_org_name_idx").on(t.orgId, t.name),
  }),
);

// ── RBAC: Permissions ──────────────────────────────────────────────────────
export const permissionActionEnum = pgEnum("permission_action", [
  "create",
  "read",
  "update",
  "delete",
  "manage",
]);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resource: text("resource").notNull(),
    action: permissionActionEnum("action").notNull(),
  },
  (t) => ({
    resourceActionIdx: uniqueIndex("permissions_resource_action_idx").on(t.resource, t.action),
  }),
);

// ── RBAC: Role Permissions ─────────────────────────────────────────────────
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("role_permissions_pk").on(t.roleId, t.permissionId),
  }),
);

// ── RBAC: User Roles ───────────────────────────────────────────────────────
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("user_roles_pk").on(t.userId, t.roleId),
  }),
);

// ── Audit Logs ─────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("audit_logs_org_id_idx").on(t.orgId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    resourceIdx: index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
  }),
);

// ── Invite Tokens ──────────────────────────────────────────────────────────
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    token: text("token").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("invites_token_idx").on(t.token),
    orgEmailIdx: index("invites_org_email_idx").on(t.orgId, t.email),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  roles: many(roles),
  apiKeys: many(apiKeys),
  auditLogs: many(auditLogs),
  invites: many(invites),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  sessions: many(sessions),
  accounts: many(accounts),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  org: one(organizations, { fields: [roles.orgId], references: [organizations.id] }),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));
