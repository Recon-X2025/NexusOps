import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { securityIncidents, vulnerabilities, eq, and, desc, count, sql } from "@nexusops/db";
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
});
