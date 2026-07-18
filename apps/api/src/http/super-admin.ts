import type { FastifyPluginAsync } from "fastify";
import jwt from "jsonwebtoken";
import { getDb, eq } from "@coheronconnect/db";
import { organizations, gstinRegistry, legalEntities, superAdminAuditLogs } from "@coheronconnect/db/schema";
import { profileSchema, indiaSchema, itsmSchema } from "../routers/onboarding";
import { panColumns } from "../lib/pan";
import { z } from "zod";

const adminUpdateSchema = z.object({
  profile: profileSchema.partial().optional(),
  india: indiaSchema.partial().optional(),
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
      const payload = jwt.verify(token, macSecret) as { email?: string; role?: string };
      if (payload.role !== "mac_operator") {
        throw new Error("Invalid role");
      }
      (req as any).macOperator = payload.email;
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

    const rows = await db.select({
      org: organizations,
      gstin: gstinRegistry.gstin,
      cin: legalEntities.cin
    }).from(organizations)
      .leftJoin(gstinRegistry, eq(gstinRegistry.orgId, organizations.id))
      .leftJoin(legalEntities, eq(legalEntities.orgId, organizations.id))
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
    const rows = await db.select({
      org: organizations,
      gstin: gstinRegistry.gstin,
      cin: legalEntities.cin
    }).from(organizations)
      .leftJoin(gstinRegistry, eq(gstinRegistry.orgId, organizations.id))
      .leftJoin(legalEntities, eq(legalEntities.orgId, organizations.id))
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

    // Fetch before state for audit
    const beforeState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const beforeOrg = beforeState[0];
    if (!beforeOrg) return reply.status(404).send({ error: "Organization not found" });

    if (input.profile) {
      await db.update(organizations).set({
        industry: input.profile.industry,
        companySize: input.profile.size,
        city: input.profile.city,
        state: input.profile.state,
        website: input.profile.website,
        supportEmail: input.profile.supportEmail,
        updatedAt: new Date()
      }).where(eq(organizations.id, orgId));
    }

    if (input.itsm) {
      await db.update(organizations).set({
        slaP1Hours: input.itsm.p1,
        slaP2Hours: input.itsm.p2,
        slaP3Hours: input.itsm.p3,
        slaP4Hours: input.itsm.p4,
        updatedAt: new Date()
      }).where(eq(organizations.id, orgId));
    }

    if (input.india) {
      // DPDP: keep raw PAN (entity PAN, needed for filing) + stamp match hash/display.
      await db.update(organizations).set({
        ...panColumns(input.india.pan),
        tan: input.india.tan,
        epfCode: (input.india as any).pf,
        primaryStateCode: input.india.stateCode,
        updatedAt: new Date()
      }).where(eq(organizations.id, orgId));
      
      if (input.india.gstin || input.india.stateCode) {
        const gstinExisting = await db.select().from(gstinRegistry).where(eq(gstinRegistry.orgId, orgId)).limit(1);
        if (gstinExisting.length > 0) {
          const updateData: any = {};
          if (input.india.gstin) updateData.gstin = input.india.gstin;
          if (input.india.stateCode) updateData.stateCode = input.india.stateCode;
          await db.update(gstinRegistry).set(updateData).where(eq(gstinRegistry.orgId, orgId));
        } else if (input.india.gstin && input.india.stateCode) {
          await db.insert(gstinRegistry).values({ orgId, gstin: input.india.gstin, legalName: beforeOrg.name, stateCode: input.india.stateCode, isPrimary: true });
        }
      }

      const leExisting = await db.select().from(legalEntities).where(eq(legalEntities.orgId, orgId)).limit(1);
      if (leExisting.length > 0) {
        await db.update(legalEntities).set({ cin: input.india.cin, updatedAt: new Date() }).where(eq(legalEntities.orgId, orgId));
      } else {
        await db.insert(legalEntities).values({ orgId, name: beforeOrg.name, code: "HQ", cin: input.india.cin });
      }
    }

    const afterState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const afterOrg = afterState[0];

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator,
      orgId,
      action: "UPDATE_WIZARD_DATA",
      beforeJson: beforeOrg,
      afterJson: afterOrg
    });

    return { ok: true, message: "Organization updated successfully" };
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

    const beforeState = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (beforeState.length === 0) return reply.status(404).send({ error: "Organization not found" });

    const beforeSettings = beforeState[0]?.settings ?? {};
    const wasSuspended = beforeSettings.suspended ?? false;

    const newSettings = { ...beforeSettings, suspended: true } as any;

    await db.update(organizations).set({ settings: newSettings, updatedAt: new Date() }).where(eq(organizations.id, orgId));

    await db.insert(superAdminAuditLogs).values({
      actorEmail: (req as any).macOperator,
      orgId,
      action: "SUSPEND_ORG",
      beforeJson: { suspended: wasSuspended },
      afterJson: { suspended: true }
    });

    return { ok: true, message: "Organization suspended" };
  });
};
