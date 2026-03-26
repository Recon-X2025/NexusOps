import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  crmAccounts,
  crmContacts,
  eq,
  and,
  desc,
  count,
} from "@nexusops/db";

// csmCases table does not exist in schema yet - CSM cases procedures return graceful fallbacks
// pending migration to add csmCases table

export const csmRouter = router({
  cases: router({
    list: permissionProcedure("csm", "read")
      .input(z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        accountId: z.string().uuid().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async () => {
        // csmCases table pending migration
        return { items: [], nextCursor: null };
      }),

    get: permissionProcedure("csm", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async () => {
        throw new TRPCError({ code: "NOT_FOUND", message: "CSM cases schema pending migration" });
      }),

    create: permissionProcedure("csm", "write")
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.string().default("medium"),
        accountId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
      }))
      .mutation(async () => {
        // csmCases table pending migration
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CSM cases schema pending migration" });
      }),

    update: permissionProcedure("csm", "write")
      .input(z.object({
        id: z.string().uuid(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.string().uuid().optional(),
        resolution: z.string().optional(),
      }))
      .mutation(async () => {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CSM cases schema pending migration" });
      }),
  }),

  accounts: router({
    list: permissionProcedure("csm", "read")
      .input(z.object({
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(crmAccounts.orgId, org!.id)];
        const rows = await db.select().from(crmAccounts)
          .where(and(...conditions))
          .orderBy(desc(crmAccounts.createdAt))
          .limit(input.limit + 1)
          .offset(input.cursor ? parseInt(input.cursor) : 0);
        const hasMore = rows.length > input.limit;
        return {
          items: hasMore ? rows.slice(0, -1) : rows,
          nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
        };
      }),
  }),

  contacts: router({
    list: permissionProcedure("csm", "read")
      .input(z.object({
        accountId: z.string().uuid().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(crmContacts.orgId, org!.id)];
        if (input.accountId) conditions.push(eq(crmContacts.accountId, input.accountId));
        const rows = await db.select().from(crmContacts)
          .where(and(...conditions))
          .orderBy(desc(crmContacts.createdAt))
          .limit(input.limit + 1)
          .offset(input.cursor ? parseInt(input.cursor) : 0);
        const hasMore = rows.length > input.limit;
        return {
          items: hasMore ? rows.slice(0, -1) : rows,
          nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
        };
      }),
  }),

  slaMetrics: permissionProcedure("csm", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [{ total }] = await db.select({ total: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, org!.id));
    return {
      totalCases: 0,
      openCases: 0,
      slaBreached: 0,
      avgResolutionHours: 0,
      totalAccounts: Number(total),
    };
  }),

  dashboard: permissionProcedure("csm", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [{ totalAccounts }] = await db.select({ totalAccounts: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, org!.id));
    const [{ totalContacts }] = await db.select({ totalContacts: count() }).from(crmContacts).where(eq(crmContacts.orgId, org!.id));
    return {
      totalCases: 0,
      openCases: 0,
      resolvedToday: 0,
      slaBreached: 0,
      avgCsat: 0,
      totalAccounts: Number(totalAccounts),
      totalContacts: Number(totalContacts),
    };
  }),
});
