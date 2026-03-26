import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { ciItems, eq, asc } from "@nexusops/db";

// itomEvents table does not exist in the current schema.
// These procedures return graceful fallbacks pending migration.

export const eventsRouter = router({
  list: permissionProcedure("events", "read")
    .input(z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async () => {
      // itomEvents table pending migration
      return { items: [], nextCursor: null };
    }),

  acknowledge: permissionProcedure("events", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async () => {
      // itomEvents table pending migration
      return { success: true };
    }),

  suppress: permissionProcedure("events", "write")
    .input(z.object({ id: z.string().uuid(), suppressUntil: z.string().optional() }))
    .mutation(async () => {
      // itomEvents table pending migration
      return { success: true };
    }),

  healthNodes: permissionProcedure("events", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const cis = await db.select({
      id: ciItems.id,
      name: ciItems.name,
      ciType: ciItems.ciType,
      status: ciItems.status,
    }).from(ciItems).where(eq(ciItems.orgId, org!.id)).orderBy(asc(ciItems.name)).limit(100);

    return cis.map((ci: any) => ({
      id: ci.id,
      name: ci.name,
      type: ci.ciType,
      health: ci.status === "active" ? "healthy" : ci.status === "maintenance" ? "degraded" : "unknown",
    }));
  }),

  dashboard: permissionProcedure("events", "read").query(async () => {
    // itomEvents table pending migration - return empty aggregation
    return {
      total: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
      byStatus: { new: 0, acknowledged: 0, suppressed: 0, resolved: 0 },
      openCount: 0,
    };
  }),
});
