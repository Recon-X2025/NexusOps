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
  sql,
} from "@coheronconnect/db";
import { getNextNumber } from "../lib/auto-number";

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
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        try {
          const result = await db.execute(sql`
            SELECT * FROM csm_cases
            WHERE org_id = ${org!.id}
            ${input.status ? sql`AND status = ${input.status}` : sql``}
            ${input.priority ? sql`AND priority = ${input.priority}` : sql``}
            ORDER BY created_at DESC
            LIMIT ${input.limit}
          `);
          const items = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
          return { items: items as any[], nextCursor: null };
        } catch {
          return { items: [], nextCursor: null };
        }
      }),

    get: permissionProcedure("csm", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db } = ctx;
        const result = await db.execute(sql`SELECT * FROM csm_cases WHERE id = ${input.id}`);
        const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return row;
      }),

    create: permissionProcedure("csm", "write")
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.string().default("medium"),
        accountId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const number = await getNextNumber(db, org!.id, "CSM");
        const result = await db.execute(sql`
          INSERT INTO csm_cases (org_id, number, title, description, priority, account_id, contact_id, requester_id)
          VALUES (${org!.id}, ${number}, ${input.title}, ${input.description ?? null}, ${input.priority},
                  ${input.accountId ?? null}, ${input.contactId ?? null}, ${user!.id})
          RETURNING *
        `);
        const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create case" });
        return row;
      }),

    update: permissionProcedure("csm", "write")
      .input(z.object({
        id: z.string().uuid(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.string().uuid().optional(),
        resolution: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        await db.execute(sql`
          UPDATE csm_cases SET
            status = COALESCE(${input.status ?? null}, status),
            priority = COALESCE(${input.priority ?? null}, priority),
            assignee_id = COALESCE(${input.assigneeId ?? null}::uuid, assignee_id),
            resolution = COALESCE(${input.resolution ?? null}, resolution),
            updated_at = NOW()
          WHERE id = ${input.id} AND org_id = ${org!.id}
        `);
        return { id: input.id };
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
    let openCases = 0;
    let totalCases = 0;
    try {
      const rows = await db.execute(sql`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::text AS open_cnt
        FROM csm_cases
        WHERE org_id = ${org!.id}
      `);
      const r = (rows as { total: string; open_cnt: string }[])[0];
      totalCases = Number(r?.total ?? 0);
      openCases = Number(r?.open_cnt ?? 0);
    } catch {
      /* table missing in some envs */
    }
    return {
      totalCases,
      openCases,
      slaBreached: 0,
      avgResolutionHours: 0,
      totalAccounts: Number(total),
    };
  }),

  dashboard: permissionProcedure("csm", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [{ totalAccounts }] = await db.select({ totalAccounts: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, org!.id));
    const [{ totalContacts }] = await db.select({ totalContacts: count() }).from(crmContacts).where(eq(crmContacts.orgId, org!.id));

    let totalCases = 0;
    let openCases = 0;
    let resolvedToday = 0;
    try {
      const rows = await db.execute(sql`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::text AS open_cnt,
          COUNT(*) FILTER (
            WHERE status = 'resolved'
            AND updated_at >= date_trunc('day', now())
          )::text AS resolved_today
        FROM csm_cases
        WHERE org_id = ${org!.id}
      `);
      const r = (rows as { total: string; open_cnt: string; resolved_today: string }[])[0];
      totalCases = Number(r?.total ?? 0);
      openCases = Number(r?.open_cnt ?? 0);
      resolvedToday = Number(r?.resolved_today ?? 0);
    } catch {
      /* csm_cases */
    }

    return {
      totalCases,
      openCases,
      resolvedToday,
      slaBreached: 0,
      avgCsat: 0,
      totalAccounts: Number(totalAccounts),
      totalContacts: Number(totalContacts),
    };
  }),
});
