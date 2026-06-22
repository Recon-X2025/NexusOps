import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  securityIncidents,
  vulnerabilities,
  secIncidentTicketLinks,
  vulnerabilityExceptions,
  privacyBreachNotificationProfiles,
  resourceReadAuditEvents,
  auditLogs,
  tickets,
  organizations,
  eq,
  and,
  desc,
  count,
  sql,
} from "@coheronconnect/db";
import { getNextNumber } from "../lib/auto-number";

const STATE_MACHINE: Record<string, string[]> = {
  new: ["triage"],
  triage: ["containment", "false_positive"],
  containment: ["eradication"],
  eradication: ["recovery"],
  recovery: ["closed"],
  closed: [],
  false_positive: [],
};

export const securityRouter = router({
  listIncidents: permissionProcedure("security", "read")
    .input(z.object({
      severity: z.string().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(securityIncidents.orgId, org!.id)];
      if (input.severity) conditions.push(eq(securityIncidents.severity, input.severity as any));
      if (input.status) conditions.push(eq(securityIncidents.status, input.status as any));

      const rows = await db.select().from(securityIncidents)
        .where(and(...conditions))
        .orderBy(desc(securityIncidents.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      return { items: hasMore ? rows.slice(0, -1) : rows, nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + (hasMore ? input.limit : rows.length)) : null };
    }),

  getIncident: permissionProcedure("security", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [incident] = await db.select().from(securityIncidents)
        .where(and(eq(securityIncidents.id, input.id), eq(securityIncidents.orgId, org!.id)));
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });
      return incident;
    }),

  createIncident: permissionProcedure("security", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low", "informational"]).default("medium"),
      attackVector: z.string().optional(),
      affectedSystems: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "SEC");
      const [incident] = await db.insert(securityIncidents).values({
        orgId: org!.id, number, ...input,
        reporterId: user!.id,
        affectedSystems: input.affectedSystems ?? [],
      }).returning();
      return incident;
    }),

  transition: permissionProcedure("security", "write")
    .input(z.object({ id: z.string().uuid(), toStatus: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [incident] = await db.select().from(securityIncidents)
        .where(and(eq(securityIncidents.id, input.id), eq(securityIncidents.orgId, org!.id)));
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });

      const allowed = STATE_MACHINE[incident.status] ?? [];
      if (!allowed.includes(input.toStatus)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot transition from ${incident.status} to ${input.toStatus}` });
      }

      const updates: Record<string, any> = { status: input.toStatus, updatedAt: new Date() };
      if (input.toStatus === "closed") updates.resolvedAt = new Date();

      const [updated] = await db.update(securityIncidents).set(updates)
        .where(eq(securityIncidents.id, input.id)).returning();
      return updated;
    }),

  addContainment: permissionProcedure("security", "write")
    .input(z.object({ id: z.string().uuid(), action: z.string(), performedBy: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [incident] = await db.select().from(securityIncidents)
        .where(and(eq(securityIncidents.id, input.id), eq(securityIncidents.orgId, org!.id)));
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });

      const newAction = { action: input.action, performedAt: new Date().toISOString(), performedBy: input.performedBy };
      const existing = (incident.containmentActions ?? []) as any[];
      const [updated] = await db.update(securityIncidents)
        .set({ containmentActions: [...existing, newAction], updatedAt: new Date() })
        .where(eq(securityIncidents.id, input.id)).returning();
      return updated;
    }),

  // ── Vulnerabilities ───────────────────────────────────────────────────────
  listVulnerabilities: permissionProcedure("vulnerabilities", "read")
    .input(z.object({ severity: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(vulnerabilities.orgId, org!.id)];
      if (input.severity) conditions.push(eq(vulnerabilities.severity, input.severity as any));
      if (input.status) conditions.push(eq(vulnerabilities.status, input.status as any));
      return db.select().from(vulnerabilities).where(and(...conditions)).orderBy(desc(vulnerabilities.createdAt)).limit(input.limit);
    }),

  createVulnerability: permissionProcedure("vulnerabilities", "write")
    .input(z.object({
      title: z.string(),
      cveId: z.string().optional(),
      description: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low", "none"]).default("medium"),
      cvssScore: z.string().optional(),
      affectedAssets: z.array(z.string()).default([]),
      remediation: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vuln] = await db.insert(vulnerabilities).values({ orgId: org!.id, ...input }).returning();
      return vuln;
    }),

  remediateVulnerability: permissionProcedure("vulnerabilities", "write")
    .input(z.object({ id: z.string().uuid(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vuln] = await db.update(vulnerabilities)
        .set({ status: "remediated", remediatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(vulnerabilities.id, input.id), eq(vulnerabilities.orgId, org!.id)))
        .returning();
      return vuln;
    }),

  statusCounts: permissionProcedure("security", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select({ severity: securityIncidents.severity, cnt: count() })
      .from(securityIncidents)
      .where(eq(securityIncidents.orgId, org!.id))
      .groupBy(securityIncidents.severity);
    return Object.fromEntries(
      rows.map((r: { severity: string; cnt: unknown }) => [r.severity, Number(r.cnt)]),
    );
  }),

  /** Open / in-progress security incidents (excludes closed & false positive). */
  openIncidentCount: permissionProcedure("security", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [row] = await db
      .select({ count: count() })
      .from(securityIncidents)
      .where(
        and(
          eq(securityIncidents.orgId, org!.id),
          sql`${securityIncidents.status} NOT IN ('closed', 'false_positive')`,
        ),
      );
    return row?.count ?? 0;
  }),

  // ── US-SEC-004 IR playbook + ITSM links ───────────────────────────────────
  setIrPlaybookChecklist: permissionProcedure("security", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        checklist: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .update(securityIncidents)
        .set({ irPlaybookChecklist: input.checklist, updatedAt: new Date() })
        .where(and(eq(securityIncidents.id, input.id), eq(securityIncidents.orgId, org!.id)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  linkIncidentToTicket: permissionProcedure("security", "write")
    .input(z.object({ incidentId: z.string().uuid(), ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inc] = await db
        .select({ id: securityIncidents.id })
        .from(securityIncidents)
        .where(and(eq(securityIncidents.id, input.incidentId), eq(securityIncidents.orgId, org!.id)));
      const [tk] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));
      if (!inc || !tk) throw new TRPCError({ code: "NOT_FOUND", message: "Incident or ticket not in org" });
      await db
        .insert(secIncidentTicketLinks)
        .values({ orgId: org!.id, incidentId: input.incidentId, ticketId: input.ticketId })
        .onConflictDoNothing();
      return { ok: true };
    }),

  listIncidentTicketLinks: permissionProcedure("security", "read")
    .input(z.object({ incidentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(secIncidentTicketLinks)
        .where(
          and(
            eq(secIncidentTicketLinks.orgId, org!.id),
            eq(secIncidentTicketLinks.incidentId, input.incidentId),
          ),
        );
    }),

  // ── US-SEC-005 vulnerability import / exceptions ───────────────────────────
  importVulnerabilities: permissionProcedure("vulnerabilities", "write")
    .input(
      z.object({
        source: z.string().default("scanner"),
        findings: z.array(
          z.object({
            fingerprint: z.string().min(4),
            title: z.string(),
            cveId: z.string().optional(),
            severity: z.enum(["critical", "high", "medium", "low", "none"]).default("medium"),
            remediationSlaDays: z.coerce.number().min(1).max(365).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const created: string[] = [];
      const updated: string[] = [];
      for (const f of input.findings) {
        const due = f.remediationSlaDays
          ? new Date(Date.now() + f.remediationSlaDays * 86400000)
          : undefined;
        const [existing] = await db
          .select({ id: vulnerabilities.id })
          .from(vulnerabilities)
          .where(
            and(
              eq(vulnerabilities.orgId, org!.id),
              eq(vulnerabilities.externalFingerprint, f.fingerprint),
            ),
          )
          .limit(1);
        if (existing) {
          await db
            .update(vulnerabilities)
            .set({
              title: f.title,
              cveId: f.cveId,
              severity: f.severity as any,
              scannerSource: input.source,
              remediationSlaDays: f.remediationSlaDays,
              remediationDueAt: due,
              updatedAt: new Date(),
            })
            .where(eq(vulnerabilities.id, existing.id));
          updated.push(existing.id);
        } else {
          const [row] = await db
            .insert(vulnerabilities)
            .values({
              orgId: org!.id,
              externalFingerprint: f.fingerprint,
              title: f.title,
              cveId: f.cveId,
              severity: f.severity as any,
              scannerSource: input.source,
              remediationSlaDays: f.remediationSlaDays,
              remediationDueAt: due,
            })
            .returning();
          if (row) created.push(row.id);
        }
      }
      return { created, updated };
    }),

  createVulnerabilityException: permissionProcedure("vulnerabilities", "write")
    .input(
      z.object({
        vulnerabilityId: z.string().uuid(),
        reason: z.string().min(3),
        expiresAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [v] = await db
        .select({ id: vulnerabilities.id })
        .from(vulnerabilities)
        .where(and(eq(vulnerabilities.id, input.vulnerabilityId), eq(vulnerabilities.orgId, org!.id)));
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const [row] = await db
        .insert(vulnerabilityExceptions)
        .values({
          orgId: org!.id,
          vulnerabilityId: input.vulnerabilityId,
          reason: input.reason,
          approvedBy: user!.id,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        })
        .returning();
      await db
        .update(vulnerabilities)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(vulnerabilities.id, input.vulnerabilityId));
      return row;
    }),

  // ── US-SEC-007 breach clocks ───────────────────────────────────────────────
  listPrivacyBreachProfiles: permissionProcedure("security", "read").query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(privacyBreachNotificationProfiles)
      .where(eq(privacyBreachNotificationProfiles.orgId, ctx.org!.id));
  }),

  upsertPrivacyBreachProfile: permissionProcedure("security", "write")
    .input(
      z.object({
        jurisdictionCode: z.string().min(2),
        regulatorName: z.string().optional(),
        notificationOffsetHours: z.coerce.number().min(1).max(720).default(72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select({ id: privacyBreachNotificationProfiles.id })
        .from(privacyBreachNotificationProfiles)
        .where(
          and(
            eq(privacyBreachNotificationProfiles.orgId, org!.id),
            eq(privacyBreachNotificationProfiles.jurisdictionCode, input.jurisdictionCode),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(privacyBreachNotificationProfiles)
          .set({
            regulatorName: input.regulatorName,
            notificationOffsetHours: input.notificationOffsetHours,
          })
          .where(eq(privacyBreachNotificationProfiles.id, existing.id));
      } else {
        await db.insert(privacyBreachNotificationProfiles).values({
          orgId: org!.id,
          jurisdictionCode: input.jurisdictionCode,
          regulatorName: input.regulatorName,
          notificationOffsetHours: input.notificationOffsetHours,
        });
      }
      return { ok: true };
    }),

  // ── US-SEC-003 SIEM-oriented export preview (structured JSON, no secrets) ──
  siemExportPreview: permissionProcedure("security", "read")
    .input(z.object({ limit: z.coerce.number().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - 7 * 86400000);
      const logs = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          resourceType: auditLogs.resourceType,
          resourceId: auditLogs.resourceId,
          userId: auditLogs.userId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(and(eq(auditLogs.orgId, org!.id), sql`${auditLogs.createdAt} >= ${since.toISOString()}::timestamptz`))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
      const incidents = await db
        .select({
          id: securityIncidents.id,
          number: securityIncidents.number,
          severity: securityIncidents.severity,
          status: securityIncidents.status,
          updatedAt: securityIncidents.updatedAt,
        })
        .from(securityIncidents)
        .where(eq(securityIncidents.orgId, org!.id))
        .orderBy(desc(securityIncidents.updatedAt))
        .limit(50);
      return {
        schema: "coheronconnect.security.siem_preview.v1",
        windowDays: 7,
        auditLogSample: logs,
        securityIncidentSnapshot: incidents,
      };
    }),

  /** Optional read-audit for sensitive modules (org.settings.security.sensitiveReadAuditEnabled). */
  recordSensitiveRead: permissionProcedure("security", "write")
    .input(z.object({ resourceType: z.string(), resourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [o] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const raw = (o?.settings ?? {}) as Record<string, unknown>;
      const sec = (raw["security"] as Record<string, unknown> | undefined) ?? {};
      if (sec["sensitiveReadAuditEnabled"] !== true) return { recorded: false };
      await db.insert(resourceReadAuditEvents).values({
        orgId: org!.id,
        userId: user!.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      });
      return { recorded: true };
    }),
});
