import type { FastifyPluginAsync } from "fastify";
import jwt from "jsonwebtoken";
import { getDb, eq, desc, asc, and, sql } from "@coheronconnect/db";
import { alias } from "drizzle-orm/pg-core";
import {
  organizations,
  gstinRegistry,
  legalEntities,
  superAdminAuditLogs,
  superAdminUsers,
  superAdminRoles,
  users,
  complianceCalendarItems,
  dpdpDataSubjectRequests,
  dpdpBreachIncidents,
  dpdpConsentRecords,
  risks,
  policies,
} from "@coheronconnect/db/schema";
import { profileSchema, indiaObjectSchema, itsmSchema } from "../routers/onboarding";
import { writeWizardData, DuplicateGstinError } from "../services/orgWizardWrite";
import { revokeOrgSessions } from "../middleware/auth";
import bcrypt from "bcrypt";
import { z } from "zod";

const adminUpdateSchema = z.object({
  profile: profileSchema.partial().optional(),
  india: indiaObjectSchema.partial().optional(),
  itsm: itsmSchema.partial().optional()
});

export const superAdminRoutes: FastifyPluginAsync = async (app) => {
  // 1. Authentication
  app.addHook("preHandler", async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing or invalid Bearer token" });
    }
    const token = authHeader.substring(7);
    const macSecret = process.env["MAC_JWT_SECRET"];
    if (!macSecret) {
      return reply.status(500).send({ error: "MAC_JWT_SECRET not configured" });
    }
    try {
      const payload = jwt.verify(token, macSecret) as { email?: string; role?: string; operatorRole?: string };
      if (payload.role !== "mac_operator") {
        throw new Error("Invalid role");
      }
      (req as any).macOperator = payload.email;
      (req as any).macOperatorRole = payload.operatorRole ?? "super_admin";
    } catch (e) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  });

  // 2. Endpoint: List orgs and onboarding data
  app.get("/orgs", async (req, reply) => {
    const db = getDb();
    const query = req.query as any;
    const limit = parseInt(query.limit ?? "50", 10);
    const offset = parseInt(query.offset ?? "0", 10);

    const completedByUser = alias(users, "completed_by_user");
    const lastEditedByUser = alias(users, "last_edited_by_user");

    const rows = await db.select({
      org: organizations,
      gstin: gstinRegistry.gstin,
      cin: legalEntities.cin,
      completedEmail: completedByUser.email,
      lastEditedEmail: lastEditedByUser.email
    }).from(organizations)
      .leftJoin(gstinRegistry, eq(gstinRegistry.orgId, organizations.id))
      .leftJoin(legalEntities, eq(legalEntities.orgId, organizations.id))
      .leftJoin(completedByUser, eq(completedByUser.id, organizations.onboardingCompletedBy))
      .leftJoin(lastEditedByUser, eq(lastEditedByUser.id, organizations.onboardingLastEditedBy))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(r => ({
        id: r.org.id,
        name: r.org.name,
        slug: r.org.slug,
        plan: r.org.plan,
        suspended: r.org.settings?.suspended ?? false,
        flagged: (r.org.settings as any)?.flagged ?? false,
        flagNote: (r.org.settings as any)?.flagNote,
        onboardingStep: r.org.onboardingStep,
        onboardingCompletedAt: r.org.onboardingCompletedAt,
        onboardingCompletedBy: r.completedEmail,
        onboardingLastEditedBy: r.lastEditedEmail,
        profile: {
          industry: r.org.industry,
          companySize: r.org.companySize,
          city: r.org.city,
          state: r.org.state,
          website: r.org.website,
          supportEmail: r.org.supportEmail,
        },
        compliance: {
          pan: r.org.pan,
          tan: r.org.tan,
          epfCode: r.org.epfCode,
          primaryStateCode: r.org.primaryStateCode,
          gstin: r.gstin,
          cin: r.cin,
        },
        itsm: {
          slaP1Hours: r.org.slaP1Hours,
          slaP2Hours: r.org.slaP2Hours,
          slaP3Hours: r.org.slaP3Hours,
          slaP4Hours: r.org.slaP4Hours,
        },
        createdAt: r.org.createdAt,
        updatedAt: r.org.updatedAt,
      }))
    };
  });

  // 3. Endpoint: Get single org
  app.get("/orgs/:orgId", async (req, reply) => {
    const db = getDb();
    const { orgId } = req.params as { orgId: string };

    const completedByUser = alias(users, "completed_by_user");
    const lastEditedByUser = alias(users, "last_edited_by_user");

    const rows = await db.select({
      org: organizations,
      gstin: gstinRegistry.gstin,
      cin: legalEntities.cin,
      completedEmail: completedByUser.email,
      lastEditedEmail: lastEditedByUser.email
    }).from(organizations)
      .leftJoin(gstinRegistry, eq(gstinRegistry.orgId, organizations.id))
      .leftJoin(legalEntities, eq(legalEntities.orgId, organizations.id))
      .leftJoin(completedByUser, eq(completedByUser.id, organizations.onboardingCompletedBy))
      .leftJoin(lastEditedByUser, eq(lastEditedByUser.id, organizations.onboardingLastEditedBy))
      .where(eq(organizations.id, orgId))
      .limit(1);

    const r = rows[0];
    if (!r) return reply.status(404).send({ error: "Organization not found" });

    return {
      data: {
        id: r.org.id,
        name: r.org.name,
        slug: r.org.slug,
        plan: r.org.plan,
        suspended: r.org.settings?.suspended ?? false,
        flagged: (r.org.settings as any)?.flagged ?? false,
        flagNote: (r.org.settings as any)?.flagNote,
        onboardingStep: r.org.onboardingStep,
        onboardingCompletedAt: r.org.onboardingCompletedAt,
        onboardingCompletedBy: r.completedEmail,
        onboardingLastEditedBy: r.lastEditedEmail,
        profile: {
          industry: r.org.industry,
          companySize: r.org.companySize,
          city: r.org.city,
          state: r.org.state,
          website: r.org.website,
          supportEmail: r.org.supportEmail,
        },
        compliance: {
          pan: r.org.pan,
          tan: r.org.tan,
          epfCode: r.org.epfCode,
          primaryStateCode: r.org.primaryStateCode,
          gstin: r.gstin,
          cin: r.cin,
        },
        itsm: {
          slaP1Hours: r.org.slaP1Hours,
          slaP2Hours: r.org.slaP2Hours,
          slaP3Hours: r.org.slaP3Hours,
          slaP4Hours: r.org.slaP4Hours,
        },
        createdAt: r.org.createdAt,
        updatedAt: r.org.updatedAt,
      }
    };
  });

  // 4. Endpoint: PUT Update org wizard data
  app.put("/orgs/:orgId", async (req, reply) => {
    const db = getDb();
    const { orgId } = req.params as { orgId: string };
    
    const parsed = adminUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const input = parsed.data;

    try {
      await writeWizardData(db, orgId, input, {
        type: "mac_operator",
        id: (req as any).macOperator
      });
      return { ok: true, message: "Organization updated successfully" };
    } catch (e: any) { // any-ratchet-allow: custom postgres error handling
      if (e instanceof DuplicateGstinError) {
        return reply.status(400).send({
          error: "Validation failed",
          message: e.message
        });
      }
      throw e;
    }
  });

  // 5. Endpoint: POST flag
  app.post("/orgs/:orgId/flag", async (req, reply) => {
    const db = getDb();
    const { orgId } = req.params as { orgId: string };
    const { flagged, note } = req.body as { flagged: boolean; note?: string };
    
    const beforeState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const beforeOrg = beforeState[0];
    if (!beforeOrg) return reply.status(404).send({ error: "Organization not found" });

    const beforeSettings = beforeOrg.settings ?? {};
    // Add flagged to settings object
    const newSettings = { ...beforeSettings, flagged, flagNote: note } as any;

    await db.update(organizations).set({ settings: newSettings, updatedAt: new Date() }).where(eq(organizations.id, orgId));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator,
      orgId,
      action: flagged ? "FLAG_ORG" : "UNFLAG_ORG",
      beforeJson: { flagged: (beforeSettings as any).flagged, flagNote: (beforeSettings as any).flagNote },
      afterJson: { flagged, flagNote: note }
    });

    return { ok: true, message: "Organization flag updated" };
  });

  // 6. Endpoint: DELETE Soft Suspend
  app.delete("/orgs/:orgId", async (req, reply) => {
    const db = getDb();
    const { orgId } = req.params as { orgId: string };
    const query = (req.query ?? {}) as { activate?: string; action?: string };

    const beforeState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (beforeState.length === 0) return reply.status(404).send({ error: "Organization not found" });

    const beforeSettings = (beforeState[0]?.settings ?? {}) as Record<string, unknown>;
    const wasSuspended = (beforeSettings.suspended as boolean) ?? false;

    // Support toggle / activate if query parameter or if already suspended when toggle is intended
    let shouldSuspend = true;
    if (query.activate === "true" || query.action === "resume") {
      shouldSuspend = false;
    } else if (query.activate === "false" || query.action === "suspend") {
      shouldSuspend = true;
    } else if (wasSuspended) {
      shouldSuspend = false;
    }

    const newSettings = { ...beforeSettings, suspended: shouldSuspend } as any;

    await db.update(organizations).set({ settings: newSettings, updatedAt: new Date() }).where(eq(organizations.id, orgId));

    if (shouldSuspend) {
      await revokeOrgSessions(db, orgId);
    }

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator,
      orgId,
      action: shouldSuspend ? "SUSPEND_ORG" : "RESUME_ORG",
      beforeJson: { suspended: wasSuspended },
      afterJson: { suspended: shouldSuspend }
    });

    return { 
      ok: true, 
      suspended: shouldSuspend,
      message: shouldSuspend ? "Organization suspended and active sessions revoked" : "Organization activated" 
    };
  });

  // 6b. Endpoint: POST Resume
  app.post("/orgs/:orgId/resume", async (req, reply) => {
    const db = getDb();
    const { orgId } = req.params as { orgId: string };

    const beforeState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (beforeState.length === 0) return reply.status(404).send({ error: "Organization not found" });

    const beforeSettings = (beforeState[0]?.settings ?? {}) as Record<string, unknown>;
    const wasSuspended = (beforeSettings.suspended as boolean) ?? false;

    const newSettings = { ...beforeSettings, suspended: false } as any;

    await db.update(organizations).set({ settings: newSettings, updatedAt: new Date() }).where(eq(organizations.id, orgId));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator,
      orgId,
      action: "RESUME_ORG",
      beforeJson: { suspended: wasSuspended },
      afterJson: { suspended: false }
    });

    return { ok: true, suspended: false, message: "Organization activated" };
  });

  // Helper to sanitize sensitive fields for support_staff data minimization
  function sanitizeForSupportStaff(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) return data.map(sanitizeForSupportStaff);
    const SENSITIVE_KEYS = new Set([
      "password", "passwordhash", "password_hash", "token", "secret", "hash",
      "pan", "pan_masked_hash", "tan", "gstin", "backupcodes", "apikey",
      "keyhash", "keyprefix", "impersonationtoken"
    ]);
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        cleaned[k] = "[REDACTED]";
      } else if (v && typeof v === "object") {
        cleaned[k] = sanitizeForSupportStaff(v);
      } else {
        cleaned[k] = v;
      }
    }
    return cleaned;
  }

  // 7. Endpoint: GET Audit Logs (with role-sensitive data minimization)
  const auditLogsQuerySchema = z.object({
    orgId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get("/audit-logs", async (req, reply) => {
    const db = getDb();
    const callerRole = (req as any).macOperatorRole;
    const isSupportStaff = callerRole === "support_staff";

    const parsed = auditLogsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { orgId, limit, offset } = parsed.data;

    const { desc } = await import("@coheronconnect/db");

    let query = db
      .select({
        id: superAdminAuditLogs.id,
        actorEmail: superAdminAuditLogs.actorEmail,
        orgId: superAdminAuditLogs.orgId,
        orgName: organizations.name,
        action: superAdminAuditLogs.action,
        beforeJson: superAdminAuditLogs.beforeJson,
        afterJson: superAdminAuditLogs.afterJson,
        createdAt: superAdminAuditLogs.createdAt,
      })
      .from(superAdminAuditLogs)
      .leftJoin(organizations, eq(superAdminAuditLogs.orgId, organizations.id));

    if (orgId) {
      query = query.where(eq(superAdminAuditLogs.orgId, orgId)) as any;
    }
    const logs = await query.orderBy(desc(superAdminAuditLogs.createdAt)).limit(limit).offset(offset);

    const formatted = logs.map((log) => {
      const orgLabel = log.orgName || (log.orgId ? `Org ${log.orgId.slice(0, 8)}` : "Platform");
      let summary = `${log.action.replace(/_/g, " ")} on ${orgLabel}`;
      if (log.action === "SUSPEND_ORG") {
        summary = `Suspended tenant ${orgLabel}`;
      } else if (log.action === "RESUME_ORG") {
        summary = `Re-activated tenant ${orgLabel}`;
      } else if (log.action === "FLAG_ORG") {
        summary = `Flagged tenant ${orgLabel}`;
      } else if (log.action === "UNFLAG_ORG") {
        summary = `Removed flag from tenant ${orgLabel}`;
      } else if (log.action === "UPDATE_WIZARD_DATA") {
        summary = `Updated onboarding wizard data for ${orgLabel}`;
      }

      const before = isSupportStaff ? (sanitizeForSupportStaff(log.beforeJson) as Record<string, unknown>) : log.beforeJson;
      const after = isSupportStaff ? (sanitizeForSupportStaff(log.afterJson) as Record<string, unknown>) : log.afterJson;

      return {
        ...log,
        timestamp: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString(),
        admin: log.actorEmail,
        tenantId: log.orgId || "platform",
        tenantName: orgLabel,
        summary,
        before,
        after,
        isRedacted: isSupportStaff,
      };
    });

    return { data: formatted, isRedacted: isSupportStaff };
  });

  // 7b. Endpoint: POST Export Audit Logs (RBAC guarded: blocked for support_staff, audited)
  const auditLogsExportSchema = z.object({
    format: z.enum(["csv", "json"]).default("json"),
    orgId: z.string().uuid().optional(),
    action: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  });

  app.post("/audit-logs/export", async (req, reply) => {
    const callerRole = (req as any).macOperatorRole;
    if (callerRole === "support_staff") {
      return reply.status(403).send({ error: "Access restricted: auditExport permission required" });
    }

    const db = getDb();
    const parsed = auditLogsExportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { format, orgId, action, limit } = parsed.data;

    const { desc } = await import("@coheronconnect/db");

    let query = db
      .select({
        id: superAdminAuditLogs.id,
        actorEmail: superAdminAuditLogs.actorEmail,
        orgId: superAdminAuditLogs.orgId,
        orgName: organizations.name,
        action: superAdminAuditLogs.action,
        beforeJson: superAdminAuditLogs.beforeJson,
        afterJson: superAdminAuditLogs.afterJson,
        createdAt: superAdminAuditLogs.createdAt,
      })
      .from(superAdminAuditLogs)
      .leftJoin(organizations, eq(superAdminAuditLogs.orgId, organizations.id));

    if (orgId) {
      query = query.where(eq(superAdminAuditLogs.orgId, orgId)) as any;
    }

    const logs = await query.orderBy(desc(superAdminAuditLogs.createdAt)).limit(limit);

    // Filter by action in memory if specified
    const filtered = action ? logs.filter((l) => l.action.toLowerCase().includes(action.toLowerCase())) : logs;

    // Authoritative audit entry for the export action itself
    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: orgId ?? null,
      action: "EXPORT_AUDIT_LOGS",
      afterJson: {
        format,
        exportedCount: filtered.length,
        filters: { orgId: orgId ?? null, action: action ?? null },
        exportedAt: new Date().toISOString(),
      },
    });

    if (format === "csv") {
      const csvHeader = ["ID", "Timestamp", "Actor", "Tenant ID", "Tenant Name", "Action", "Before JSON", "After JSON"].join(",");
      const csvRows = filtered.map((l) => [
        `"${l.id}"`,
        `"${l.createdAt ? new Date(l.createdAt).toISOString() : ""}"`,
        `"${l.actorEmail}"`,
        `"${l.orgId ?? "platform"}"`,
        `"${(l.orgName ?? "Platform").replace(/"/g, '""')}"`,
        `"${l.action}"`,
        `"${JSON.stringify(l.beforeJson ?? {}).replace(/"/g, '""')}"`,
        `"${JSON.stringify(l.afterJson ?? {}).replace(/"/g, '""')}"`,
      ].join(","));
      const csvContent = [csvHeader, ...csvRows].join("\n");
      return { ok: true, format: "csv", count: filtered.length, data: csvContent };
    }

    const jsonItems = filtered.map((l) => ({
      id: l.id,
      timestamp: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
      actor: l.actorEmail,
      orgId: l.orgId,
      orgName: l.orgName ?? "Platform",
      action: l.action,
      before: l.beforeJson,
      after: l.afterJson,
    }));

    return { ok: true, format: "json", count: jsonItems.length, data: jsonItems };
  });

  // 8. Endpoint: GET Super-Admin Operators
  app.get("/operators", async () => {
    const db = getDb();
    const { desc } = await import("@coheronconnect/db");

    const rows = await db
      .select({
        id: superAdminUsers.id,
        email: superAdminUsers.email,
        name: superAdminUsers.name,
        role: superAdminUsers.role,
        status: superAdminUsers.status,
        phone: superAdminUsers.phone,
        lastLoginAt: superAdminUsers.lastLoginAt,
        createdAt: superAdminUsers.createdAt,
        updatedAt: superAdminUsers.updatedAt,
      })
      .from(superAdminUsers)
      .orderBy(desc(superAdminUsers.createdAt));

    return { data: rows };
  });

  // 9. Endpoint: POST Create Super-Admin Operator
  const createOperatorSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.string().min(2).default("operations_staff"),
    phone: z.string().optional(),
  });

  app.post("/operators", async (req, reply) => {
    const db = getDb();
    const parsed = createOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { name, email, password, role, phone } = parsed.data;

    const [roleExists] = await db
      .select({ id: superAdminRoles.id })
      .from(superAdminRoles)
      .where(eq(superAdminRoles.id, role))
      .limit(1);

    if (!roleExists) {
      return reply.status(400).send({ error: `Role '${role}' is not a valid console role` });
    }

    const [existing] = await db
      .select({ id: superAdminUsers.id })
      .from(superAdminUsers)
      .where(eq(superAdminUsers.email, email.toLowerCase()))
      .limit(1);

    if (existing) {
      return reply.status(400).send({ error: "Operator with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [created] = await db
      .insert(superAdminUsers)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
        status: "active",
        phone,
      })
      .returning({
        id: superAdminUsers.id,
        name: superAdminUsers.name,
        email: superAdminUsers.email,
        role: superAdminUsers.role,
        status: superAdminUsers.status,
        phone: superAdminUsers.phone,
        createdAt: superAdminUsers.createdAt,
      });

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      action: "CREATE_OPERATOR",
      afterJson: { id: created?.id, email: created?.email, role: created?.role },
    });

    return { ok: true, data: created };
  });

  // 10. Endpoint: PUT Update Super-Admin Operator
  const updateOperatorSchema = z.object({
    name: z.string().min(2).optional(),
    role: z.string().min(2).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    phone: z.string().optional().nullable(),
    password: z.string().min(6).optional(),
  });

  app.put("/operators/:id", async (req, reply) => {
    const db = getDb();
    const { id } = req.params as { id: string };
    const parsed = updateOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(superAdminUsers)
      .where(eq(superAdminUsers.id, id))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Operator not found" });
    }

    if (parsed.data.role !== undefined) {
      const [roleExists] = await db
        .select({ id: superAdminRoles.id })
        .from(superAdminRoles)
        .where(eq(superAdminRoles.id, parsed.data.role))
        .limit(1);

      if (!roleExists) {
        return reply.status(400).send({ error: `Role '${parsed.data.role}' is not a valid console role` });
      }
    }

    const updates: Partial<typeof superAdminUsers.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.password) {
      updates.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    }

    await db.update(superAdminUsers).set(updates).where(eq(superAdminUsers.id, id));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      action: "UPDATE_OPERATOR",
      beforeJson: { name: existing.name, role: existing.role, status: existing.status },
      afterJson: { name: updates.name ?? existing.name, role: updates.role ?? existing.role, status: updates.status ?? existing.status },
    });

    return { ok: true, message: "Operator updated successfully" };
  });

  // 11. Endpoint: DELETE Super-Admin Operator
  app.delete("/operators/:id", async (req, reply) => {
    const db = getDb();
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(superAdminUsers)
      .where(eq(superAdminUsers.id, id))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Operator not found" });
    }

    const currentActor = (req as any).macOperator;
    if (existing.email.toLowerCase() === currentActor?.toLowerCase()) {
      return reply.status(400).send({ error: "Cannot delete your own operator account" });
    }

    await db.delete(superAdminUsers).where(eq(superAdminUsers.id, id));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: currentActor ?? "admin@coheron.tech",
      action: "DELETE_OPERATOR",
      beforeJson: { id: existing.id, email: existing.email, role: existing.role },
    });

    return { ok: true, message: "Operator deleted" };
  });

  // 12. Endpoint: GET Operator Roles Definition & Permissions
  app.get("/operator-roles", async () => {
    const db = getDb();
    const roles = await db
      .select()
      .from(superAdminRoles)
      .orderBy(desc(superAdminRoles.isSystem), asc(superAdminRoles.name));

    return {
      data: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        badgeCls: r.badgeCls,
        isSystem: r.isSystem,
        permissions: r.capabilities,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  });

  // 12b. Endpoint: POST Create Custom Operator Role
  const createRoleSchema = z.object({
    name: z.string().min(2).max(50),
    description: z.string().min(3).max(300),
    permissions: z.record(z.boolean()),
    color: z.enum(["purple", "blue", "emerald", "amber", "rose", "cyan", "indigo", "slate"]).optional(),
    badgeCls: z.string().optional(),
  });

  const COLOR_BADGE_MAP: Record<string, string> = {
    purple: "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    blue: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    amber: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    rose: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
    cyan: "bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20",
    slate: "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600",
  };

  app.post("/operator-roles", async (req, reply) => {
    const db = getDb();
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { name, description, permissions, color, badgeCls } = parsed.data;

    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const slug = baseSlug || `role_${Date.now()}`;

    const [existing] = await db
      .select({ id: superAdminRoles.id })
      .from(superAdminRoles)
      .where(eq(superAdminRoles.id, slug))
      .limit(1);

    if (existing) {
      return reply.status(400).send({ error: `A role with identifier '${slug}' already exists` });
    }

    const computedBadgeCls =
      badgeCls ||
      (color && COLOR_BADGE_MAP[color]) ||
      COLOR_BADGE_MAP["indigo"];

    const [created] = await db
      .insert(superAdminRoles)
      .values({
        id: slug,
        name,
        description,
        badgeCls: computedBadgeCls,
        isSystem: false,
        capabilities: permissions,
      })
      .returning();

    if (!created) {
      return reply.status(500).send({ error: "Failed to create role" });
    }

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      action: "CREATE_OPERATOR_ROLE",
      afterJson: { id: created.id, name: created.name, capabilities: created.capabilities },
    });

    return {
      ok: true,
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        badgeCls: created.badgeCls,
        isSystem: created.isSystem,
        permissions: created.capabilities,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    };
  });

  // 12c. Endpoint: DELETE Custom Operator Role
  app.delete("/operator-roles/:id", async (req, reply) => {
    const db = getDb();
    const { id } = req.params as { id: string };

    const [existingRole] = await db
      .select()
      .from(superAdminRoles)
      .where(eq(superAdminRoles.id, id))
      .limit(1);

    if (!existingRole) {
      return reply.status(404).send({ error: "Role not found" });
    }

    if (existingRole.isSystem) {
      return reply.status(400).send({ error: "System roles cannot be deleted" });
    }

    const assignedOperators = await db
      .select({ id: superAdminUsers.id, email: superAdminUsers.email })
      .from(superAdminUsers)
      .where(eq(superAdminUsers.role, id));

    if (assignedOperators.length > 0) {
      return reply.status(400).send({
        error: `Cannot delete role '${existingRole.name}' because ${assignedOperators.length} operator(s) (${assignedOperators.map((o) => o.email).join(", ")}) are assigned to it. Please reassign them first.`,
      });
    }

    await db.delete(superAdminRoles).where(eq(superAdminRoles.id, id));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      action: "DELETE_OPERATOR_ROLE",
      beforeJson: { id: existingRole.id, name: existingRole.name },
    });

    return { ok: true, message: `Role '${existingRole.name}' deleted successfully` };
  });


  // ── FINANCE & SUBSCRIPTIONS RBAC GUARDS ──────────────────────────────────
  function assertFinanceView(req: any, reply: any): boolean {
    const role = req.macOperatorRole;
    if (role === "support_staff") {
      reply.status(403).send({ error: "Forbidden: role does not have financeView permission" });
      return false;
    }
    return true;
  }

  function assertFinanceManage(req: any, reply: any): boolean {
    const role = req.macOperatorRole;
    if (role !== "super_admin") {
      reply.status(403).send({ error: "Forbidden: role does not have financeManage permission" });
      return false;
    }
    return true;
  }

  // 13. Endpoint: GET Finance & Subscription Overview
  app.get("/finance/overview", async (req, reply) => {
    if (!assertFinanceView(req, reply)) return;
    const db = getDb();
    const { desc } = await import("@coheronconnect/db");

    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        settings: organizations.settings,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));

    const planPrices: Record<string, number> = {
      free: 0,
      starter: 49,
      professional: 199,
      enterprise: 499,
    };

    let totalMrr = 0;
    const planCounts: Record<string, number> = { free: 0, starter: 0, professional: 0, enterprise: 0 };
    const statusCounts: Record<string, number> = { active: 0, trialing: 0, past_due: 0, canceled: 0 };

    const subscriptions = orgs.map((org) => {
      const plan = org.plan ?? "free";
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const subscriptionStatus = (settings.subscriptionStatus as string) ?? (settings.suspended ? "canceled" : "active");
      const stripeCustomerId = (settings.stripeCustomerId as string) ?? null;
      const trialEndsAt = (settings.trialEndsAt as string) ?? null;
      const billingCycle = (settings.billingCycle as string) ?? "monthly";

      planCounts[plan] = (planCounts[plan] ?? 0) + 1;
      statusCounts[subscriptionStatus] = (statusCounts[subscriptionStatus] ?? 0) + 1;

      if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
        totalMrr += planPrices[plan] ?? 0;
      }

      return {
        orgId: org.id,
        orgName: org.name,
        slug: org.slug,
        plan,
        priceMonthly: planPrices[plan] ?? 0,
        billingCycle,
        subscriptionStatus,
        stripeCustomerId,
        trialEndsAt,
        createdAt: org.createdAt,
      };
    });

    return {
      data: {
        totalTenants: orgs.length,
        totalMrr,
        estimatedArr: totalMrr * 12,
        paidTenantsCount: (planCounts.starter ?? 0) + (planCounts.professional ?? 0) + (planCounts.enterprise ?? 0),
        planCounts,
        statusCounts,
        subscriptions,
      },
    };
  });

  // 14. Endpoint: PUT Update Tenant Subscription
  const updateSubscriptionSchema = z.object({
    plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
    subscriptionStatus: z.enum(["active", "trialing", "past_due", "canceled", "unpaid"]).optional(),
    stripeCustomerId: z.string().optional(),
    trialEndsAt: z.string().optional().nullable(),
    reason: z.string().min(10, "Override reason must be at least 10 characters"),
  });

  app.put("/finance/subscriptions/:orgId", async (req, reply) => {
    if (!assertFinanceManage(req, reply)) return;
    const db = getDb();
    const { orgId } = req.params as { orgId: string };
    const parsed = updateSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    const existingSettings = (org.settings ?? {}) as Record<string, unknown>;
    const newSettings = { ...existingSettings };

    if (parsed.data.subscriptionStatus !== undefined) newSettings.subscriptionStatus = parsed.data.subscriptionStatus;
    if (parsed.data.stripeCustomerId !== undefined) newSettings.stripeCustomerId = parsed.data.stripeCustomerId;
    if (parsed.data.trialEndsAt !== undefined) newSettings.trialEndsAt = parsed.data.trialEndsAt;

    await db
      .update(organizations)
      .set({
        plan: parsed.data.plan ?? org.plan,
        settings: newSettings,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId,
      action: "OVERRIDE_SUBSCRIPTION",
      beforeJson: {
        plan: org.plan,
        subscriptionStatus: (existingSettings.subscriptionStatus as string) ?? (existingSettings.suspended ? "canceled" : "active"),
        stripeCustomerId: (existingSettings.stripeCustomerId as string) ?? null,
        trialEndsAt: (existingSettings.trialEndsAt as string) ?? null,
      },
      afterJson: {
        plan: parsed.data.plan ?? org.plan,
        subscriptionStatus: parsed.data.subscriptionStatus ?? existingSettings.subscriptionStatus ?? "active",
        stripeCustomerId: parsed.data.stripeCustomerId !== undefined ? parsed.data.stripeCustomerId : (existingSettings.stripeCustomerId ?? null),
        trialEndsAt: parsed.data.trialEndsAt !== undefined ? parsed.data.trialEndsAt : (existingSettings.trialEndsAt ?? null),
        reason: parsed.data.reason,
      },
    });

    return { ok: true, message: "Subscription updated successfully" };
  });

  // ── COMPLIANCE & GRC ENDPOINTS ─────────────────────────────────────────────

  function assertComplianceView(req: any, reply: any): boolean {
    const role = req.macOperatorRole;
    if (role === "support_staff") {
      reply.status(403).send({ error: "Forbidden: role does not have complianceView permission" });
      return false;
    }
    return true;
  }

  function assertComplianceManage(req: any, reply: any): boolean {
    const role = req.macOperatorRole;
    if (role === "auditor" || role === "support_staff") {
      reply.status(403).send({ error: "Forbidden: role does not have complianceManage permission" });
      return false;
    }
    return true;
  }

  // 1. Overview metrics
  app.get("/compliance/overview", async (req, reply) => {
    if (!assertComplianceView(req, reply)) return;
    const db = getDb();

    // Risk metrics
    const allRisks = await db.select().from(risks);
    const highRisksCount = allRisks.filter((r) => r.riskRating === "high" || r.riskRating === "critical").length;
    const totalRisksCount = allRisks.length;

    // Statutory Deadlines
    const allDeadlines = await db.select().from(complianceCalendarItems);
    const overdueDeadlinesCount = allDeadlines.filter((d) => d.status === "overdue").length;
    const dueSoonDeadlinesCount = allDeadlines.filter((d) => d.status === "due_soon").length;
    const upcomingDeadlinesCount = allDeadlines.filter((d) => d.status === "upcoming").length;
    const filedDeadlinesCount = allDeadlines.filter((d) => d.status === "filed").length;

    // DPDP DSRs & Breaches
    const allDsrs = await db.select().from(dpdpDataSubjectRequests);
    const activeDsrsCount = allDsrs.filter((d) => !["fulfilled", "rejected", "closed"].includes(d.status)).length;
    const totalDsrsCount = allDsrs.length;

    const allBreaches = await db.select().from(dpdpBreachIncidents);
    const activeBreachesCount = allBreaches.filter((b) => !["contained", "closed"].includes(b.status)).length;

    // Policies
    const allPolicies = await db.select().from(policies);
    const publishedPoliciesCount = allPolicies.filter((p) => p.status === "published").length;
    const totalPoliciesCount = allPolicies.length;

    return {
      highRisksCount,
      totalRisksCount,
      overdueDeadlinesCount,
      dueSoonDeadlinesCount,
      upcomingDeadlinesCount,
      filedDeadlinesCount,
      activeDsrsCount,
      totalDsrsCount,
      activeBreachesCount,
      totalPoliciesCount,
      publishedPoliciesCount,
    };
  });

  // 2. Statutory calendar list
  app.get("/compliance/statutory-calendar", async (req, reply) => {
    if (!assertComplianceView(req, reply)) return;
    const db = getDb();

    const rows = await db
      .select({
        id: complianceCalendarItems.id,
        orgId: complianceCalendarItems.orgId,
        orgName: organizations.name,
        complianceType: complianceCalendarItems.complianceType,
        eventName: complianceCalendarItems.eventName,
        mcaForm: complianceCalendarItems.mcaForm,
        financialYear: complianceCalendarItems.financialYear,
        dueDate: complianceCalendarItems.dueDate,
        status: complianceCalendarItems.status,
        reminderDaysBefore: complianceCalendarItems.reminderDaysBefore,
        filedDate: complianceCalendarItems.filedDate,
        srn: complianceCalendarItems.srn,
        penaltyPerDayInr: complianceCalendarItems.penaltyPerDayInr,
        daysOverdue: complianceCalendarItems.daysOverdue,
        totalPenaltyInr: complianceCalendarItems.totalPenaltyInr,
        notes: complianceCalendarItems.notes,
        createdAt: complianceCalendarItems.createdAt,
      })
      .from(complianceCalendarItems)
      .leftJoin(organizations, eq(organizations.id, complianceCalendarItems.orgId))
      .orderBy(asc(complianceCalendarItems.dueDate));

    return { items: rows };
  });

  // 3. Create statutory calendar item
  app.post("/compliance/statutory-calendar", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const schema = z.object({
      orgId: z.string().uuid(),
      complianceType: z.enum(["annual", "event_based", "monthly", "quarterly"]).default("monthly"),
      eventName: z.string().min(1),
      mcaForm: z.string().optional(),
      financialYear: z.string().optional(),
      dueDate: z.string(),
      penaltyPerDayInr: z.string().default("0"),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const [created] = await db
      .insert(complianceCalendarItems)
      .values({
        orgId: parsed.data.orgId,
        complianceType: parsed.data.complianceType,
        eventName: parsed.data.eventName,
        mcaForm: parsed.data.mcaForm,
        financialYear: parsed.data.financialYear ?? "2025-26",
        dueDate: new Date(parsed.data.dueDate),
        status: "upcoming",
        penaltyPerDayInr: parsed.data.penaltyPerDayInr,
        notes: parsed.data.notes,
      })
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: parsed.data.orgId,
      action: "CREATE_STATUTORY_DEADLINE",
      beforeJson: {},
      afterJson: created,
    });

    return { ok: true, item: created };
  });

  // 4. Update statutory calendar item
  app.put("/compliance/statutory-calendar/:id", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const { id } = req.params as { id: string };
    const schema = z.object({
      status: z.enum(["upcoming", "due_soon", "overdue", "filed", "not_applicable"]).optional(),
      filedDate: z.string().optional().nullable(),
      srn: z.string().optional().nullable(),
      penaltyPerDayInr: z.string().optional(),
      daysOverdue: z.number().optional(),
      totalPenaltyInr: z.string().optional(),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const [existing] = await db.select().from(complianceCalendarItems).where(eq(complianceCalendarItems.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: "Statutory calendar item not found" });
    }

    const updates: any = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.filedDate) updates.filedDate = new Date(parsed.data.filedDate);
    if (parsed.data.status === "filed" && !parsed.data.filedDate) updates.filedDate = new Date();

    const [updated] = await db
      .update(complianceCalendarItems)
      .set(updates)
      .where(eq(complianceCalendarItems.id, id))
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: existing.orgId,
      action: "UPDATE_STATUTORY_DEADLINE",
      beforeJson: existing,
      afterJson: updated,
    });

    return { ok: true, item: updated };
  });

  // 5. DPDP List (DSRs & Breaches)
  app.get("/compliance/dpdp", async (req, reply) => {
    if (!assertComplianceView(req, reply)) return;
    const db = getDb();

    const dsrs = await db
      .select({
        id: dpdpDataSubjectRequests.id,
        orgId: dpdpDataSubjectRequests.orgId,
        orgName: organizations.name,
        reference: dpdpDataSubjectRequests.reference,
        requestType: dpdpDataSubjectRequests.requestType,
        status: dpdpDataSubjectRequests.status,
        principalName: dpdpDataSubjectRequests.principalName,
        principalEmail: dpdpDataSubjectRequests.principalEmail,
        principalPhone: dpdpDataSubjectRequests.principalPhone,
        details: dpdpDataSubjectRequests.details,
        responseWindowDays: dpdpDataSubjectRequests.responseWindowDays,
        receivedAt: dpdpDataSubjectRequests.receivedAt,
        dueAt: dpdpDataSubjectRequests.dueAt,
        closedAt: dpdpDataSubjectRequests.closedAt,
        resolutionNote: dpdpDataSubjectRequests.resolutionNote,
      })
      .from(dpdpDataSubjectRequests)
      .leftJoin(organizations, eq(organizations.id, dpdpDataSubjectRequests.orgId))
      .orderBy(asc(dpdpDataSubjectRequests.dueAt));

    const breaches = await db
      .select({
        id: dpdpBreachIncidents.id,
        orgId: dpdpBreachIncidents.orgId,
        orgName: organizations.name,
        reference: dpdpBreachIncidents.reference,
        title: dpdpBreachIncidents.title,
        description: dpdpBreachIncidents.description,
        severity: dpdpBreachIncidents.severity,
        status: dpdpBreachIncidents.status,
        jurisdictionCode: dpdpBreachIncidents.jurisdictionCode,
        affectedDataPrincipals: dpdpBreachIncidents.affectedDataPrincipals,
        dataCategories: dpdpBreachIncidents.dataCategories,
        detectedAt: dpdpBreachIncidents.detectedAt,
        notifyDueAt: dpdpBreachIncidents.notifyDueAt,
        boardNotifiedAt: dpdpBreachIncidents.boardNotifiedAt,
        principalsNotifiedAt: dpdpBreachIncidents.principalsNotifiedAt,
        containedAt: dpdpBreachIncidents.containedAt,
        closedAt: dpdpBreachIncidents.closedAt,
      })
      .from(dpdpBreachIncidents)
      .leftJoin(organizations, eq(organizations.id, dpdpBreachIncidents.orgId))
      .orderBy(desc(dpdpBreachIncidents.detectedAt));

    return { dsrs, breaches };
  });

  // 6. Create DPDP DSR
  app.post("/compliance/dpdp/dsr", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const schema = z.object({
      orgId: z.string().uuid(),
      requestType: z.enum(["access", "correction", "erasure", "grievance", "nomination"]),
      principalName: z.string().min(1),
      principalEmail: z.string().email().optional(),
      principalPhone: z.string().optional(),
      details: z.string().optional(),
      responseWindowDays: z.number().default(30),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const reference = `DSR-${year}-${randomSuffix}`;
    const now = new Date();
    const dueAt = new Date(now.getTime() + (parsed.data.responseWindowDays || 30) * 24 * 60 * 60 * 1000);

    const [created] = await db
      .insert(dpdpDataSubjectRequests)
      .values({
        orgId: parsed.data.orgId,
        reference,
        requestType: parsed.data.requestType,
        status: "received",
        principalName: parsed.data.principalName,
        principalEmail: parsed.data.principalEmail,
        principalPhone: parsed.data.principalPhone,
        details: parsed.data.details,
        responseWindowDays: parsed.data.responseWindowDays,
        receivedAt: now,
        dueAt,
      })
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: parsed.data.orgId,
      action: "CREATE_DPDP_DSR",
      beforeJson: {},
      afterJson: created,
    });

    return { ok: true, dsr: created };
  });

  // 7. Update DPDP DSR
  app.put("/compliance/dpdp/dsr/:id", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const { id } = req.params as { id: string };
    const schema = z.object({
      status: z.enum(["received", "verifying", "in_progress", "on_hold", "fulfilled", "rejected", "closed"]),
      resolutionNote: z.string().optional(),
      rejectionReason: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const [existing] = await db.select().from(dpdpDataSubjectRequests).where(eq(dpdpDataSubjectRequests.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: "DSR not found" });
    }

    const updates: any = {
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote ?? existing.resolutionNote,
      rejectionReason: parsed.data.rejectionReason ?? existing.rejectionReason,
      updatedAt: new Date(),
    };

    if (["fulfilled", "rejected", "closed"].includes(parsed.data.status) && !existing.closedAt) {
      updates.closedAt = new Date();
    }

    const [updated] = await db
      .update(dpdpDataSubjectRequests)
      .set(updates)
      .where(eq(dpdpDataSubjectRequests.id, id))
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: existing.orgId,
      action: "UPDATE_DPDP_DSR",
      beforeJson: existing,
      afterJson: updated,
    });

    return { ok: true, dsr: updated };
  });

  // 8. Create Data Breach
  app.post("/compliance/dpdp/breach", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const schema = z.object({
      orgId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      affectedDataPrincipals: z.number().optional(),
      dataCategories: z.string().optional(),
      notificationWindowHours: z.number().default(72),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const reference = `BRC-${year}-${randomSuffix}`;
    const now = new Date();
    const notifyDueAt = new Date(now.getTime() + (parsed.data.notificationWindowHours || 72) * 60 * 60 * 1000);

    const [created] = await db
      .insert(dpdpBreachIncidents)
      .values({
        orgId: parsed.data.orgId,
        reference,
        title: parsed.data.title,
        description: parsed.data.description,
        severity: parsed.data.severity,
        status: "detected",
        jurisdictionCode: "IN",
        affectedDataPrincipals: parsed.data.affectedDataPrincipals,
        dataCategories: parsed.data.dataCategories,
        detectedAt: now,
        notificationWindowHours: parsed.data.notificationWindowHours,
        notifyDueAt,
      })
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: parsed.data.orgId,
      action: "REPORT_DATA_BREACH",
      beforeJson: {},
      afterJson: created,
    });

    return { ok: true, breach: created };
  });

  // 9. Update Data Breach
  app.put("/compliance/dpdp/breach/:id", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const { id } = req.params as { id: string };
    const schema = z.object({
      status: z.enum(["detected", "assessing", "notifying", "notified", "contained", "closed"]),
      boardNotifiedAt: z.string().optional(),
      principalsNotifiedAt: z.string().optional(),
      containedAt: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const [existing] = await db.select().from(dpdpBreachIncidents).where(eq(dpdpBreachIncidents.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: "Breach incident not found" });
    }

    const updates: any = { status: parsed.data.status, updatedAt: new Date() };
    if (parsed.data.boardNotifiedAt) updates.boardNotifiedAt = new Date(parsed.data.boardNotifiedAt);
    if (parsed.data.principalsNotifiedAt) updates.principalsNotifiedAt = new Date(parsed.data.principalsNotifiedAt);
    if (parsed.data.status === "contained" && !existing.containedAt) updates.containedAt = new Date();
    if (parsed.data.status === "closed" && !existing.closedAt) updates.closedAt = new Date();

    const [updated] = await db
      .update(dpdpBreachIncidents)
      .set(updates)
      .where(eq(dpdpBreachIncidents.id, id))
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: existing.orgId,
      action: "UPDATE_DATA_BREACH",
      beforeJson: existing,
      afterJson: updated,
    });

    return { ok: true, breach: updated };
  });

  // 10. DPDP Sweeps Trigger
  app.post("/compliance/dpdp/sweeps", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const now = new Date();

    // Scan for overdue DSRs
    const pendingDsrs = await db.select().from(dpdpDataSubjectRequests).where(eq(dpdpDataSubjectRequests.status, "in_progress"));
    let overdueMarked = 0;
    for (const d of pendingDsrs) {
      if (new Date(d.dueAt).getTime() < now.getTime()) {
        overdueMarked++;
      }
    }

    // Scan for statutory deadlines
    const upcomingDeadlines = await db.select().from(complianceCalendarItems);
    let deadlinesUpdated = 0;
    for (const dl of upcomingDeadlines) {
      if (dl.status !== "filed") {
        const diffMs = new Date(dl.dueDate).getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0 && dl.status !== "overdue") {
          const daysOverdue = Math.abs(diffDays);
          const penalty = daysOverdue * parseFloat(dl.penaltyPerDayInr || "0");
          await db
            .update(complianceCalendarItems)
            .set({
              status: "overdue",
              daysOverdue,
              totalPenaltyInr: penalty.toFixed(2),
              updatedAt: now,
            })
            .where(eq(complianceCalendarItems.id, dl.id));
          deadlinesUpdated++;
        } else if (diffDays <= 7 && diffDays >= 0 && dl.status === "upcoming") {
          await db.update(complianceCalendarItems).set({ status: "due_soon", updatedAt: now }).where(eq(complianceCalendarItems.id, dl.id));
          deadlinesUpdated++;
        }
      }
    }

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      action: "RUN_COMPLIANCE_SWEEPS",
      beforeJson: {},
      afterJson: { overdueMarked, deadlinesUpdated, executedAt: now.toISOString() },
    });

    return {
      ok: true,
      message: `Compliance sweeps completed successfully. Evaluated DSR statutory clocks and updated ${deadlinesUpdated} statutory deadline statuses.`,
      overdueMarked,
      deadlinesUpdated,
    };
  });

  // 11. GRC Risks List
  app.get("/compliance/risks", async (req, reply) => {
    if (!assertComplianceView(req, reply)) return;
    const db = getDb();

    const rows = await db
      .select({
        id: risks.id,
        orgId: risks.orgId,
        orgName: organizations.name,
        number: risks.number,
        title: risks.title,
        description: risks.description,
        category: risks.category,
        likelihood: risks.likelihood,
        impact: risks.impact,
        riskScore: risks.riskScore,
        riskRating: risks.riskRating,
        status: risks.status,
        treatment: risks.treatment,
        reviewFrequency: risks.reviewFrequency,
        mitigationPlan: risks.mitigationPlan,
        reviewDate: risks.reviewDate,
        createdAt: risks.createdAt,
      })
      .from(risks)
      .leftJoin(organizations, eq(organizations.id, risks.orgId))
      .orderBy(desc(risks.riskScore));

    return { risks: rows };
  });

  // 12. Create GRC Risk
  app.post("/compliance/risks", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const schema = z.object({
      orgId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["operational", "financial", "strategic", "compliance", "technology", "reputational"]).default("operational"),
      likelihood: z.number().min(1).max(5).default(3),
      impact: z.number().min(1).max(5).default(3),
      treatment: z.enum(["accept", "mitigate", "transfer", "avoid"]).default("mitigate"),
      mitigationPlan: z.string().optional(),
      reviewFrequency: z.string().default("quarterly"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const likelihood = parsed.data.likelihood;
    const impact = parsed.data.impact;
    const riskScore = likelihood * impact;
    let riskRating: "low" | "medium" | "high" | "critical" = "medium";
    if (riskScore <= 6) riskRating = "low";
    else if (riskScore <= 9) riskRating = "medium";
    else if (riskScore <= 16) riskRating = "high";
    else riskRating = "critical";

    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const number = `RK-${randomSuffix}`;

    const [created] = await db
      .insert(risks)
      .values({
        orgId: parsed.data.orgId,
        number,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        likelihood,
        impact,
        riskScore,
        riskRating,
        status: "identified",
        treatment: parsed.data.treatment,
        mitigationPlan: parsed.data.mitigationPlan,
        reviewFrequency: parsed.data.reviewFrequency,
        reviewDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      })
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: parsed.data.orgId,
      action: "LOG_GRC_RISK",
      beforeJson: {},
      afterJson: created,
    });

    return { ok: true, risk: created };
  });

  // 13. Update GRC Risk
  app.put("/compliance/risks/:id", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const { id } = req.params as { id: string };
    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      likelihood: z.number().min(1).max(5).optional(),
      impact: z.number().min(1).max(5).optional(),
      treatment: z.enum(["accept", "mitigate", "transfer", "avoid"]).optional(),
      status: z.enum(["identified", "assessed", "mitigating", "accepted", "closed"]).optional(),
      mitigationPlan: z.string().optional(),
      reviewFrequency: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const [existing] = await db.select().from(risks).where(eq(risks.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: "Risk item not found" });
    }

    const updates: any = { ...parsed.data, updatedAt: new Date() };

    const newLikelihood = parsed.data.likelihood ?? existing.likelihood;
    const newImpact = parsed.data.impact ?? existing.impact;
    if (parsed.data.likelihood !== undefined || parsed.data.impact !== undefined) {
      const score = newLikelihood * newImpact;
      updates.riskScore = score;
      if (score <= 6) updates.riskRating = "low";
      else if (score <= 9) updates.riskRating = "medium";
      else if (score <= 16) updates.riskRating = "high";
      else updates.riskRating = "critical";
    }

    const [updated] = await db.update(risks).set(updates).where(eq(risks.id, id)).returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: existing.orgId,
      action: "UPDATE_GRC_RISK",
      beforeJson: existing,
      afterJson: updated,
    });

    return { ok: true, risk: updated };
  });

  // 14. Governance Policies List
  app.get("/compliance/policies", async (req, reply) => {
    if (!assertComplianceView(req, reply)) return;
    const db = getDb();

    const rows = await db
      .select({
        id: policies.id,
        orgId: policies.orgId,
        orgName: organizations.name,
        title: policies.title,
        content: policies.content,
        category: policies.category,
        version: policies.version,
        status: policies.status,
        reviewCycleMonths: policies.reviewCycleMonths,
        lastReviewed: policies.lastReviewed,
        nextReview: policies.nextReview,
        publishedAt: policies.publishedAt,
        createdAt: policies.createdAt,
      })
      .from(policies)
      .leftJoin(organizations, eq(organizations.id, policies.orgId))
      .orderBy(desc(policies.createdAt));

    return { policies: rows };
  });

  // 15. Create Governance Policy
  app.post("/compliance/policies", async (req, reply) => {
    if (!assertComplianceManage(req, reply)) return;
    const db = getDb();
    const schema = z.object({
      orgId: z.string().uuid(),
      title: z.string().min(1),
      content: z.string().optional(),
      category: z.string().optional(),
      reviewCycleMonths: z.number().default(12),
      status: z.enum(["draft", "review", "approved", "published", "retired"]).default("published"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const now = new Date();
    const [created] = await db
      .insert(policies)
      .values({
        orgId: parsed.data.orgId,
        title: parsed.data.title,
        content: parsed.data.content,
        category: parsed.data.category,
        version: 1,
        status: parsed.data.status,
        reviewCycleMonths: parsed.data.reviewCycleMonths,
        lastReviewed: now,
        nextReview: new Date(now.getTime() + parsed.data.reviewCycleMonths * 30 * 24 * 60 * 60 * 1000),
        publishedAt: parsed.data.status === "published" ? now : null,
      })
      .returning();

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator ?? "admin@coheron.tech",
      orgId: parsed.data.orgId,
      action: "CREATE_GOVERNANCE_POLICY",
      beforeJson: {},
      afterJson: created,
    });

    return { ok: true, policy: created };
  });
};
