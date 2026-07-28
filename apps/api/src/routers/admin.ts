import { router, adminProcedure, paginationInput } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  auditLogs,
  users,
  roles,
  permissions,
  rolePermissions,
  businessRules,
  slaDefinitions,
  systemProperties,
  notificationRules,
  organizations,
  sessions,
  eq,
  and,
  desc,
  asc,
  gte,
  lte,
  count,
  inArray,
} from "@coheronconnect/db";
import { BusinessRuleCreateSchema } from "../services/business-rules-engine";
import { parseOrgSettings } from "../lib/org-settings";
import { sanitizeForAudit } from "../lib/audit-sanitize";
import { invalidateSessionCache } from "../middleware/auth";

function getCategoryForKey(key: string) {
  if (key.startsWith("platform.")) return "Platform";
  if (key.startsWith("session.")) return "Auth";
  if (key.startsWith("rate_limit.")) return "Security";
  if (key.startsWith("email.")) return "Email";
  if (key.startsWith("itsm.")) return "ITSM";
  if (key.startsWith("meilisearch.")) return "Discovery";
  if (key.startsWith("procurement.")) return "Procurement";
  if (key.startsWith("analytics.")) return "Analytics";
  return "Platform";
}

export const adminRouter = router({
  auditLog: router({
    list: adminProcedure
      .input(
        z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          userId: z.string().uuid().optional(),
          action: z.string().optional(),
          resourceType: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { page, limit, dateFrom, dateTo, userId, action, resourceType } =
          input;
        const offset = (page - 1) * limit;

        const conditions = [eq(auditLogs.orgId, org!.id)];

        if (dateFrom)
          conditions.push(gte(auditLogs.createdAt, new Date(dateFrom)));
        if (dateTo) conditions.push(lte(auditLogs.createdAt, new Date(dateTo)));
        if (userId) conditions.push(eq(auditLogs.userId, userId));
        if (action) conditions.push(eq(auditLogs.action, action));
        if (resourceType)
          conditions.push(eq(auditLogs.resourceType, resourceType));

        const [totalRow] = await db
          .select({ total: count() })
          .from(auditLogs)
          .where(and(...conditions));
        const total = totalRow?.total ?? 0;

        const items = await db
          .select({
            id: auditLogs.id,
            orgId: auditLogs.orgId,
            action: auditLogs.action,
            resourceType: auditLogs.resourceType,
            resourceId: auditLogs.resourceId,
            changes: auditLogs.changes,
            ipAddress: auditLogs.ipAddress,
            userAgent: auditLogs.userAgent,
            createdAt: auditLogs.createdAt,
            userId: auditLogs.userId,
            userName: users.name,
            userEmail: users.email,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset(offset);

        return {
          items,
          total,
          page,
          pages: Math.ceil(total / limit),
        };
      }),
  }),

  users: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          matrixRole: users.matrixRole,
          status: users.status,
          mfaEnrolled: users.mfaEnrolled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.orgId, org!.id))
        .orderBy(users.name);
      return rows;
    }),

    update: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
          matrixRole: z.string().nullable().optional(),
          status: z.enum(["active", "invited", "disabled"]).optional(),
          /** US-SEC-001: admin attestation that MFA is enrolled for this user (invalidates session cache). */
          mfaEnrolled: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { userId, mfaEnrolled, ...rest } = input;
        let prevMfa: boolean | null = null;
        if (mfaEnrolled !== undefined) {
          const [p] = await db
            .select({ mfaEnrolled: users.mfaEnrolled })
            .from(users)
            .where(and(eq(users.id, userId), eq(users.orgId, org!.id)));
          prevMfa = p?.mfaEnrolled ?? null;
        }
        const patch: Record<string, unknown> = {
          ...rest,
          updatedAt: new Date(),
        };
        if (mfaEnrolled !== undefined) patch.mfaEnrolled = mfaEnrolled;
        const [user] = await db
          .update(users)
          .set(patch as typeof users.$inferInsert)
          .where(and(eq(users.id, userId), eq(users.orgId, org!.id)))
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            matrixRole: users.matrixRole,
            status: users.status,
            mfaEnrolled: users.mfaEnrolled,
          });

        if (
          user &&
          (mfaEnrolled !== undefined ||
            input.role !== undefined ||
            input.matrixRole !== undefined ||
            input.status !== undefined)
        ) {
          const sess = await db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.userId, userId));
          await db.delete(sessions).where(eq(sessions.userId, userId));
          await Promise.all(
            sess.map((s: { id: string }) => invalidateSessionCache(s.id)),
          );
        }

        if (mfaEnrolled !== undefined && user) {
          if (prevMfa !== mfaEnrolled) {
            await db.insert(auditLogs).values({
              orgId: org!.id,
              userId: ctx.user!.id as string,
              action: "user_mfa_attestation",
              resourceType: "user",
              resourceId: userId,
              changes: sanitizeForAudit({
                mfaEnrolled: { from: prevMfa, to: mfaEnrolled },
              }) as Record<string, unknown>,
              ipAddress: ctx.ipAddress ?? undefined,
              userAgent: ctx.userAgent ?? undefined,
            });
          }
        }
        return user;
      }),
      
    delete: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        
        // Users must never be hard-deleted from the database — archive (disable) instead.
        const [updatedUser] = await db
          .update(users)
          .set({ status: "disabled", updatedAt: new Date() })
          .where(and(eq(users.id, input.userId), eq(users.orgId, org!.id)))
          .returning();

        if (!updatedUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        await db.insert(auditLogs).values({
          orgId: org!.id,
          userId: ctx.user!.id as string,
          action: "user_archive",
          resourceType: "user",
          resourceId: input.userId,
          changes: sanitizeForAudit({ status: "disabled" }) as Record<string, unknown>,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        });

        return { success: true, archivedUser: updatedUser };
      }),
  }),

  /** Org `settings.security` — step-up + MFA matrix policies (US-SEC-001). */
  securityPolicy: router({
    get: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const sec = parseOrgSettings(row?.settings ?? org!.settings).security;
      return {
        requireStepUpForMatrixRoles: [
          ...(sec?.requireStepUpForMatrixRoles ?? []),
        ],
        requireMfaForMatrixRoles: [...(sec?.requireMfaForMatrixRoles ?? [])],
      };
    }),

    update: adminProcedure
      .input(
        z.object({
          requireStepUpForMatrixRoles: z
            .array(z.string().max(64))
            .max(40)
            .optional(),
          requireMfaForMatrixRoles: z
            .array(z.string().max(64))
            .max(40)
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (
          input.requireStepUpForMatrixRoles === undefined &&
          input.requireMfaForMatrixRoles === undefined
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No security policy fields to update",
          });
        }
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevSec =
          (raw.security as Record<string, unknown> | undefined) ?? {};
        const security: Record<string, unknown> = { ...prevSec };
        if (input.requireStepUpForMatrixRoles !== undefined) {
          security.requireStepUpForMatrixRoles =
            input.requireStepUpForMatrixRoles;
        }
        if (input.requireMfaForMatrixRoles !== undefined) {
          security.requireMfaForMatrixRoles = input.requireMfaForMatrixRoles;
        }
        await db
          .update(organizations)
          .set({
            settings: {
              ...raw,
              security,
            },
          })
          .where(eq(organizations.id, org!.id));
        await db.insert(auditLogs).values({
          orgId: org!.id,
          userId: ctx.user!.id as string,
          action: "security_policy_update",
          resourceType: "organization",
          resourceId: org!.id,
          changes: sanitizeForAudit({
            requireStepUpForMatrixRoles: {
              before: prevSec.requireStepUpForMatrixRoles ?? null,
              after: security.requireStepUpForMatrixRoles ?? null,
            },
            requireMfaForMatrixRoles: {
              before: prevSec.requireMfaForMatrixRoles ?? null,
              after: security.requireMfaForMatrixRoles ?? null,
            },
          }) as Record<string, unknown>,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        });
        return {
          ok: true as const,
          requireStepUpForMatrixRoles: security.requireStepUpForMatrixRoles,
          requireMfaForMatrixRoles: security.requireMfaForMatrixRoles,
        };
      }),
  }),

  /** Org `settings.sso.saml` — SAML 2.0 IdP connection config (US-SEC-002).
   *  Stored material is IdP-public (entryPoint, issuer, X.509 signing cert),
   *  never private keys, so it is safe to read back to admins. */
  ssoConfig: router({
    get: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const saml = parseOrgSettings(row?.settings ?? org!.settings).sso?.saml;
      return {
        enabled: saml?.enabled === true,
        entryPoint: saml?.entryPoint ?? "",
        idpIssuer: saml?.idpIssuer ?? "",
        idpCert: saml?.idpCert ?? "",
        attributeMapping: {
          email: saml?.attributeMapping?.email ?? "",
          name: saml?.attributeMapping?.name ?? "",
        },
        loginUrl: `/auth/saml/login?org=${encodeURIComponent(org!.slug)}`,
        metadataUrl: "/auth/saml/metadata",
      };
    }),

    update: adminProcedure
      .input(
        z.object({
          enabled: z.boolean(),
          entryPoint: z.string().max(2048).optional(),
          idpIssuer: z.string().max(2048).optional(),
          idpCert: z.string().max(16384).optional(),
          attributeMapping: z
            .object({
              email: z.string().max(256).optional(),
              name: z.string().max(256).optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Refuse to enable an incomplete config — without the IdP endpoint and
        // its signing cert, assertion signatures cannot be verified.
        if (
          input.enabled &&
          (!input.entryPoint?.trim() || !input.idpCert?.trim())
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "entryPoint and idpCert are required to enable SAML SSO",
          });
        }

        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevSso = (raw.sso as Record<string, unknown> | undefined) ?? {};
        const prevSaml =
          (prevSso.saml as Record<string, unknown> | undefined) ?? {};

        const saml: Record<string, unknown> = {
          ...prevSaml,
          enabled: input.enabled,
        };
        if (input.entryPoint !== undefined)
          saml.entryPoint = input.entryPoint.trim();
        if (input.idpIssuer !== undefined)
          saml.idpIssuer = input.idpIssuer.trim();
        if (input.idpCert !== undefined) saml.idpCert = input.idpCert.trim();
        if (input.attributeMapping !== undefined)
          saml.attributeMapping = input.attributeMapping;

        await db
          .update(organizations)
          .set({ settings: { ...raw, sso: { ...prevSso, saml } } })
          .where(eq(organizations.id, org!.id));

        // Never write the cert body into the audit log — record only state change.
        await db.insert(auditLogs).values({
          orgId: org!.id,
          userId: ctx.user!.id as string,
          action: "sso_saml_config_update",
          resourceType: "organization",
          resourceId: org!.id,
          changes: sanitizeForAudit({
            enabled: {
              before: prevSaml.enabled ?? false,
              after: input.enabled,
            },
            entryPoint: {
              before: prevSaml.entryPoint ?? null,
              after: saml.entryPoint ?? null,
            },
            idpCertChanged: input.idpCert !== undefined,
          }) as Record<string, unknown>,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        });

        return { ok: true as const, enabled: input.enabled };
      }),
  }),

  slaDefinitions: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(slaDefinitions)
        .where(
          and(
            eq(slaDefinitions.orgId, org!.id),
            eq(slaDefinitions.isArchived, false)
          )
        )
        .orderBy(asc(slaDefinitions.name));
    }),
    upsert: adminProcedure
      .input(
        z.object({
          id: z.string().uuid().optional(),
          name: z.string().min(1),
          priority: z.string().min(1).max(32),
          category: z.string().default("IT"),
          metric: z.string().default("Resolution Time"),
          schedule: z.string().default("24x7"),
          businessHoursOnly: z.boolean().default(false),
          pauseOnHold: z.boolean().default(true),
          responseMinutes: z.coerce.number().int().positive(),
          resolveMinutes: z.coerce.number().int().positive(),
          active: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        
        // Priority hierarchy validation (BUG-014)
        const priorityLevels: Record<string, number> = { "P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4, "P5": 5 };
        const inputLevel = priorityLevels[input.priority];
        
        if (inputLevel !== undefined) {
          const otherSlas = await db
            .select()
            .from(slaDefinitions)
            .where(
              and(
                eq(slaDefinitions.orgId, org!.id),
                eq(slaDefinitions.isArchived, false)
              )
            );
            
          for (const other of otherSlas) {
            const otherLevel = priorityLevels[other.priority];
            if (otherLevel !== undefined && other.id !== input.id) {
              // If input is higher priority (lower number) than other
              if (inputLevel < otherLevel) {
                if (input.responseMinutes > other.responseMinutes || input.resolveMinutes > other.resolveMinutes) {
                  throw new TRPCError({ code: "BAD_REQUEST", message: `Hierarchy violation: ${input.priority} SLA cannot have longer targets than existing ${other.priority} SLA (${other.name}).` });
                }
              }
              // If input is lower priority (higher number) than other
              else if (inputLevel > otherLevel) {
                if (input.responseMinutes < other.responseMinutes || input.resolveMinutes < other.resolveMinutes) {
                  throw new TRPCError({ code: "BAD_REQUEST", message: `Hierarchy violation: ${input.priority} SLA cannot have shorter targets than existing ${other.priority} SLA (${other.name}).` });
                }
              }
            }
          }
        }

        const displayId = `SLA-${input.priority}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

        const values = {
          name: input.name,
          priority: input.priority,
          category: input.category,
          metric: input.metric,
          schedule: input.schedule,
          businessHoursOnly: input.businessHoursOnly,
          pauseOnHold: input.pauseOnHold,
          responseMinutes: input.responseMinutes,
          resolveMinutes: input.resolveMinutes,
          active: input.active,
          updatedAt: new Date(),
        };
        if (input.id) {
          const [updated] = await db
            .update(slaDefinitions)
            .set(values)
            .where(
              and(
                eq(slaDefinitions.id, input.id),
                eq(slaDefinitions.orgId, org!.id),
              ),
            )
            .returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
          return updated;
        }
        const [created] = await db
          .insert(slaDefinitions)
          .values({ orgId: org!.id, displayId, ...values })
          .returning();
        return created;
      }),
    archive: adminProcedure
      .input(z.object({ id: z.string().uuid(), archive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(slaDefinitions)
          .set({ isArchived: input.archive, active: false, updatedAt: new Date() })
          .where(
            and(
              eq(slaDefinitions.id, input.id),
              eq(slaDefinitions.orgId, org!.id),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
    toggleActive: adminProcedure
      .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(slaDefinitions)
          .set({ active: input.active, updatedAt: new Date() })
          .where(
            and(
              eq(slaDefinitions.id, input.id),
              eq(slaDefinitions.orgId, org!.id),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  systemProperties: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select()
        .from(systemProperties)
        .where(eq(systemProperties.orgId, org!.id))
        .orderBy(asc(systemProperties.key));

      // Seed-on-read defaults so the screen is never empty for a fresh org.
      // Any default whose key already has a stored override is hidden.
      const defaults = [
        {
          key: "platform.name",
          value: "CoheronConnect",
          description: "Platform display name",
          environment: "all",
        },
        {
          key: "session.timeout_hours",
          value: "24",
          description: "Session sliding window hours",
          environment: "all",
        },
        {
          key: "rate_limit.login_attempts",
          value: "10",
          description: "Max failed login attempts before lockout",
          environment: "all",
        },
        {
          key: "email.from_address",
          value: process.env.SMTP_FROM ?? "noreply@coheronconnect.io",
          description: "Email from address",
          environment: "all",
        },
        {
          key: "meilisearch.enabled",
          value: process.env.MEILISEARCH_URL ? "true" : "false",
          description: "Global search enabled",
          environment: "all",
        },
      ];
      const storedKeys = new Set(rows.map((r) => r.key));
      const missingDefaults = defaults
        .filter((d) => !storedKeys.has(d.key))
        .map((d) => ({ id: null, ...d, isDefault: true }));
      const result = [
        ...rows.map((r) => ({ ...r, isDefault: false })),
        ...missingDefaults,
      ];
      return result.map(r => ({
        ...r,
        category: getCategoryForKey(r.key),
      }));
    }),
    update: adminProcedure
      .input(
        z.object({
          key: z.string().min(1),
          value: z.string(),
          description: z.string().optional(),
          environment: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [existing] = await db
          .select()
          .from(systemProperties)
          .where(
            and(
              eq(systemProperties.orgId, org!.id),
              eq(systemProperties.key, input.key),
            ),
          )
          .limit(1);
        if (existing) {
          const [updated] = await db
            .update(systemProperties)
            .set({
              value: input.value,
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
              ...(input.environment !== undefined
                ? { environment: input.environment }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(systemProperties.id, existing.id))
            .returning();
          return updated;
        }
        const [created] = await db
          .insert(systemProperties)
          .values({
            orgId: org!.id,
            key: input.key,
            value: input.value,
            description: input.description ?? null,
            environment: input.environment ?? "all",
          })
          .returning();
        return created;
      }),
  }),

  notificationRules: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(notificationRules)
        .where(eq(notificationRules.orgId, org!.id))
        .orderBy(desc(notificationRules.createdAt));
    }),
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          event: z.string().min(1),
          channel: z.enum(["email", "slack", "teams", "in_app"]),
          recipients: z.string().uuid(),
          conditions: z.string().optional(),
          active: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;

        // Ensure recipient exists and is active
        const [recipientUser] = await db
          .select()
          .from(users)
          .where(and(eq(users.id, input.recipients), eq(users.orgId, org!.id)));
        
        if (!recipientUser || recipientUser.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or inactive recipient selected." });
        }

        const [created] = await db
          .insert(notificationRules)
          .values({
            orgId: org!.id,
            name: input.name,
            event: input.event,
            channel: input.channel,
            recipients: input.recipients,
            conditions: input.conditions ?? null,
            active: input.active,
            createdBy: user!.id,
          })
          .returning();
        return created;
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).optional(),
          event: z.string().min(1).optional(),
          channel: z.enum(["email", "slack", "teams", "in_app"]).optional(),
          recipients: z.string().uuid().optional(),
          conditions: z.string().nullable().optional(),
          active: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...patch } = input;

        if (patch.recipients) {
          const [recipientUser] = await db
            .select()
            .from(users)
            .where(and(eq(users.id, patch.recipients), eq(users.orgId, org!.id)));
          
          if (!recipientUser || recipientUser.status !== "active") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or inactive recipient selected." });
          }
        }

        const [updated] = await db
          .update(notificationRules)
          .set({ ...patch, updatedAt: new Date() })
          .where(
            and(
              eq(notificationRules.id, id),
              eq(notificationRules.orgId, org!.id),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [deleted] = await db
          .delete(notificationRules)
          .where(
            and(
              eq(notificationRules.id, input.id),
              eq(notificationRules.orgId, org!.id),
            ),
          )
          .returning();
        if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
        return { ok: true as const };
      }),
  }),

  businessRules: router({
    list: adminProcedure
      .input(paginationInput)
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db
          .select()
          .from(businessRules)
          .where(eq(businessRules.orgId, org!.id))
          .orderBy(asc(businessRules.priority), asc(businessRules.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      }),

    create: adminProcedure
      .input(BusinessRuleCreateSchema)
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;

        if (!input.events || (input.events as unknown[]).length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "At least one trigger event is required." });
        }

        const [existingPriority] = await db
          .select()
          .from(businessRules)
          .where(and(
            eq(businessRules.orgId, org!.id),
            eq(businessRules.entityType, input.entityType),
            eq(businessRules.priority, input.priority)
          ))
          .limit(1);
        if (existingPriority) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A rule with this priority already exists. Priorities must be unique." });
        }

        const [row] = await db
          .insert(businessRules)
          .values({
            orgId: org!.id,
            createdBy: user!.id,
            name: input.name,
            description: input.description ?? null,
            entityType: input.entityType,
            events: input.events,
            conditions: input.conditions as unknown[],
            actions: input.actions as unknown[],
            priority: input.priority,
            enabled: input.enabled,
          })
          .returning();
        return row;
      }),

    update: adminProcedure
      .input(
        z
          .object({ id: z.string().uuid() })
          .merge(BusinessRuleCreateSchema.partial()),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...patch } = input;
        const keys = Object.keys(patch).filter(
          (k) => (patch as Record<string, unknown>)[k] !== undefined,
        );
        if (keys.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No fields to update",
          });
        }

        if (patch.events !== undefined) {
          const evArr = patch.events as unknown[];
          if (!evArr || evArr.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "At least one trigger event is required." });
          }
        }

        if (patch.priority !== undefined || patch.entityType !== undefined) {
          const [currentRule] = await db.select({ entityType: businessRules.entityType, priority: businessRules.priority }).from(businessRules).where(eq(businessRules.id, id)).limit(1);
          if (!currentRule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });

          const entityTypeToCheck = patch.entityType ?? currentRule.entityType;
          const priorityToCheck = patch.priority ?? currentRule.priority;

          const [existingPriority] = await db
            .select()
            .from(businessRules)
            .where(
              and(
                eq(businessRules.orgId, org!.id),
                eq(businessRules.entityType, entityTypeToCheck),
                eq(businessRules.priority, priorityToCheck)
              )
            )
            .limit(1);
          if (existingPriority && existingPriority.id !== id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A rule with this priority already exists. Priorities must be unique." });
          }
        }

        const [row] = await db
          .update(businessRules)
          .set({
            ...patch,
            updatedAt: new Date(),
          } as typeof businessRules.$inferInsert)
          .where(
            and(eq(businessRules.id, id), eq(businessRules.orgId, org!.id)),
          )
          .returning();
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        return row;
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .delete(businessRules)
          .where(
            and(
              eq(businessRules.id, input.id),
              eq(businessRules.orgId, org!.id),
            ),
          )
          .returning({ id: businessRules.id });
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        return { ok: true };
      }),

    toggle: adminProcedure
      .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        if (input.enabled) {
          const [rule] = await db
            .select()
            .from(businessRules)
            .where(and(eq(businessRules.id, input.id), eq(businessRules.orgId, org!.id)))
            .limit(1);
          if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
          if (!rule.events || !Array.isArray(rule.events) || rule.events.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot enable a rule without trigger events." });
          }
        }

        const [row] = await db
          .update(businessRules)
          .set({ enabled: input.enabled, updatedAt: new Date() })
          .where(
            and(
              eq(businessRules.id, input.id),
              eq(businessRules.orgId, org!.id),
            ),
          )
          .returning();
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        return row;
      }),
  }),

  scheduledJobs: router({
    list: adminProcedure.query(async () => {
      return [
        {
          id: "sla-checker",
          name: "SLA Breach Checker",
          schedule: "*/5 * * * *",
          lastRun: new Date(Date.now() - 5 * 60 * 1000),
          nextRun: new Date(Date.now() + 5 * 60 * 1000),
          status: "success",
        },
        {
          id: "notification-digest",
          name: "Notification Digest",
          schedule: "0 9 * * 1-5",
          lastRun: new Date(Date.now() - 86400 * 1000),
          nextRun: new Date(Date.now() + 3600 * 1000),
          status: "success",
        },
        {
          id: "contract-expiry",
          name: "Contract Expiry Alerts",
          schedule: "0 8 * * *",
          lastRun: new Date(Date.now() - 86400 * 1000),
          nextRun: new Date(Date.now() + 86400 * 1000),
          status: "success",
        },
        {
          id: "report-aggregator",
          name: "Executive Report Aggregation",
          schedule: "0 6 * * 1",
          lastRun: new Date(Date.now() - 7 * 86400 * 1000),
          nextRun: new Date(Date.now() + 86400 * 1000),
          status: "success",
        },
      ];
    }),

    trigger: adminProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        await db
          .insert(auditLogs)
          .values({
            orgId: org!.id,
            userId: user!.id,
            action: `scheduled_job.manual_trigger`,
            resourceType: "scheduled_job",
            resourceId: input.jobId,
            changes: {
              jobId: input.jobId,
              triggeredAt: new Date().toISOString(),
            } as Record<string, unknown>,
          })
          .catch(() => {});
        return { success: true, jobId: input.jobId, triggeredAt: new Date() };
      }),
  }),

  roles: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db } = ctx;
      const customRoles = await db
        .select()
        .from(roles)
        .where(eq(roles.isSystem, false));

      const perms = await db
        .select({
          roleId: rolePermissions.roleId,
          resource: permissions.resource,
          action: permissions.action,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));
        
      const counts = await db
        .select({ roleId: users.matrixRole, count: count() })
        .from(users)
        .groupBy(users.matrixRole);

      return customRoles.map((r) => ({
        ...r,
        permissions: perms.filter((p) => p.roleId === r.id).map(p => ({ resource: p.resource, action: p.action })),
        usersCount: counts.find((c) => c.roleId === r.id)?.count ?? 0,
      }));
    }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          permissions: z.array(z.object({ resource: z.string(), action: z.string() })),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.transaction(async (tx) => {
          const [newRole] = await tx
            .insert(roles)
            .values({ orgId: org!.id, name: input.name, description: input.description, isSystem: false })
            .returning();
            
          if (!newRole) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            
          for (const perm of input.permissions) {
            let [dbPerm] = await tx
              .select()
              .from(permissions)
              .where(and(eq(permissions.resource, perm.resource), eq(permissions.action, perm.action as any))) // any-ratchet-allow: dynamic input from admin payload
              .limit(1);
            if (!dbPerm) {
              [dbPerm] = await tx
                .insert(permissions)
                .values({ resource: perm.resource, action: perm.action as any }) // any-ratchet-allow: dynamic input from admin payload
                .returning();
            }
            if (!dbPerm) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            await tx.insert(rolePermissions).values({
              roleId: newRole.id,
              permissionId: dbPerm.id,
            });
          }
          
          return newRole;
        });
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1),
          description: z.string().optional(),
          permissions: z.array(z.object({ resource: z.string(), action: z.string() })),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.transaction(async (tx) => {
          const [updated] = await tx
            .update(roles)
            .set({ name: input.name, description: input.description })
            .where(and(eq(roles.id, input.id), eq(roles.orgId, org!.id)))
            .returning();
            
          if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

          await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.id));

          for (const perm of input.permissions) {
            let [dbPerm] = await tx
              .select()
              .from(permissions)
              .where(and(eq(permissions.resource, perm.resource), eq(permissions.action, perm.action as any))) // any-ratchet-allow: dynamic input from admin payload
              .limit(1);
            if (!dbPerm) {
              [dbPerm] = await tx
                .insert(permissions)
                .values({ resource: perm.resource, action: perm.action as any }) // any-ratchet-allow: dynamic input from admin payload
                .returning();
            }
            if (!dbPerm) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            await tx.insert(rolePermissions).values({
              roleId: input.id,
              permissionId: dbPerm.id,
            });
          }
          
          // Invalidate cache for users with this role
          const affectedUsers = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.matrixRole, input.id), eq(users.orgId, org!.id)));
            
          if (affectedUsers.length > 0) {
            const userIds = affectedUsers.map(u => u.id);
            const sess = await tx.select({ id: sessions.id }).from(sessions).where(inArray(sessions.userId, userIds));
            await Promise.all(sess.map((s: { id: string }) => invalidateSessionCache(s.id)));
          }

          return updated;
        });
      }),
      
    archive: adminProcedure
      .input(z.object({ id: z.string().uuid(), archive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        
        if (input.archive) {
          const [userCount] = await db.select({ count: count() }).from(users).where(and(eq(users.matrixRole, input.id), eq(users.orgId, org!.id)));
          if (userCount && userCount.count > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot archive a role that is assigned to users. Reassign the users first." });
          }
        }
        
        const [updated] = await db
          .update(roles)
          .set({ isArchived: input.archive })
          .where(and(eq(roles.id, input.id), eq(roles.orgId, org!.id)))
          .returning();
          
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),
});
