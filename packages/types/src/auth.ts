import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const OrgPlanEnum = z.enum(["free", "starter", "professional", "enterprise"]);
export const UserRoleEnum = z.enum(["owner", "admin", "member", "viewer"]);
export const UserStatusEnum = z.enum(["active", "invited", "disabled"]);

export type OrgPlan = z.infer<typeof OrgPlanEnum>;
export type UserRole = z.infer<typeof UserRoleEnum>;
export type UserStatus = z.infer<typeof UserStatusEnum>;

// ── Organization ───────────────────────────────────────────────────────────
export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
  plan: OrgPlanEnum,
  settings: z.record(z.unknown()).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Org = z.infer<typeof OrgSchema>;

// ── User ───────────────────────────────────────────────────────────────────
export const UserSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable().optional(),
  role: UserRoleEnum,
  matrixRole: z.string().nullable().optional(),
  status: UserStatusEnum,
  lastLoginAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

// ── Auth Input Schemas ─────────────────────────────────────────────────────
export const SignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[0-9]/, "Must contain number"),
  orgName: z.string().min(2, "Organization name required").max(100),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
});

/** Request a password reset email (input only; delivery is wired in API later). */
export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/** Submit a new password using the reset token from email. */
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export const MagicLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const InviteAcceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(100),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const InviteCreateSchema = z.object({
  email: z.string().email(),
  role: UserRoleEnum,
  name: z.string().min(1).max(100).optional(),
});

// ── RBAC ───────────────────────────────────────────────────────────────────
export const ResourceEnum = z.enum([
  "tickets",
  "assets",
  "cmdb",
  "workflows",
  "hr",
  "procurement",
  "reports",
  "settings",
  "users",
  "integrations",
]);

export const ActionEnum = z.enum(["create", "read", "update", "delete", "manage"]);

export type Resource = z.infer<typeof ResourceEnum>;
export type Action = z.infer<typeof ActionEnum>;

export const PermissionSchema = z.object({
  id: z.string().uuid(),
  resource: ResourceEnum,
  action: ActionEnum,
});

export type Permission = z.infer<typeof PermissionSchema>;

// ── API Key ────────────────────────────────────────────────────────────────
export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).max(100),
  permissions: z.record(z.array(ActionEnum)),
  lastUsedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
