import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  legalMatters,
  legalRequests,
  investigations,
  boardMeetings,
  secretarialFilings,
  companyDirectors,
  contracts,
  eq,
  and,
  desc,
  asc,
  count,
  sql,
  inArray,
} from "@nexusops/db";
import { checkDbUserPermission } from "../lib/rbac-db";
import { getNextNumber } from "../lib/auto-number";
import { getRedis } from "../lib/redis";
import { rateLimit } from "../lib/rate-limit";

export const legalRouter = router({
  // ── Matters ────────────────────────────────────────────────────────────────
  listMatters: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), type: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(legalMatters.orgId, org!.id)];
      if (input.status) conditions.push(eq(legalMatters.status, input.status as any));
      if (input.type) conditions.push(eq(legalMatters.type, input.type as any));
      return db.select().from(legalMatters).where(and(...conditions)).orderBy(desc(legalMatters.createdAt)).limit(input.limit);
    }),

  getMatter: permissionProcedure("legal", "read").input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [matter] = await db.select().from(legalMatters)
      .where(and(eq(legalMatters.id, input.id), eq(legalMatters.orgId, org!.id)));
    if (!matter) throw new TRPCError({ code: "NOT_FOUND" });
    return matter;
  }),

  createMatter: permissionProcedure("legal", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["litigation", "employment", "ip", "regulatory", "ma", "data_privacy", "corporate", "commercial"]).default("commercial"),
      confidential: z.boolean().default(false),
      estimatedCost: z.string().optional(),
      externalCounsel: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const matterNumber = await getNextNumber(db, org!.id, "MAT");
      const [matter] = await db.insert(legalMatters).values({
        orgId: org!.id, matterNumber, ...input, assignedTo: user!.id,
      }).returning();
      return matter;
    }),

  updateMatter: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), phase: z.string().optional(), actualCost: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const updates: Record<string, any> = { ...data, updatedAt: new Date() };
      if (data.status === "closed" || data.status === "settled") updates.closedAt = new Date();
      const [matter] = await db.update(legalMatters).set(updates)
        .where(and(eq(legalMatters.id, id), eq(legalMatters.orgId, org!.id))).returning();
      return matter;
    }),

  // ── Legal Requests ─────────────────────────────────────────────────────────
  listRequests: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(legalRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(legalRequests.status, input.status as any));
      return db.select().from(legalRequests).where(and(...conditions)).orderBy(desc(legalRequests.createdAt)).limit(input.limit);
    }),

  createRequest: permissionProcedure("legal", "write")
    .input(z.object({ title: z.string(), description: z.string().optional(), type: z.string().optional(), priority: z.string().default("medium") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [req] = await db.insert(legalRequests).values({ orgId: org!.id, ...input, requesterId: user!.id }).returning();
      return req;
    }),

  updateRequest: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), assignedTo: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [req] = await db.update(legalRequests).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(legalRequests.id, id), eq(legalRequests.orgId, org!.id))).returning();
      return req;
    }),

  // ── Investigations ─────────────────────────────────────────────────────────
  listInvestigations: permissionProcedure("legal", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(investigations.orgId, org!.id)];
      if (input.status) conditions.push(eq(investigations.status, input.status as any));
      const rows = await db.select().from(investigations).where(and(...conditions)).orderBy(desc(investigations.createdAt)).limit(input.limit);
      // Filter confidential investigations: only the investigator or users with grc.admin can see them
      return rows.filter((investigation: any) => {
        if (!investigation.confidential) return true;
        const isInvestigator = investigation.investigatorId === ctx.user!.id;
        const canSeeAll = checkDbUserPermission(ctx.user!.role, "legal", "admin", ctx.user!.matrixRole);
        return isInvestigator || canSeeAll;
      });
    }),

  createInvestigation: permissionProcedure("legal", "write")
    .input(z.object({
      title: z.string(),
      type: z.enum(["ethics", "harassment", "fraud", "data_breach", "whistleblower", "discrimination"]).default("ethics"),
      anonymousReport: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [inv] = await db.insert(investigations).values({ orgId: org!.id, ...input, investigatorId: user!.id }).returning();
      return inv;
    }),

  closeInvestigation: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid(), findings: z.string(), recommendation: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inv] = await db.update(investigations)
        .set({ status: "closed", findings: input.findings, recommendation: input.recommendation, closedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(investigations.id, input.id), eq(investigations.orgId, org!.id))).returning();
      return inv;
    }),

  /** Legal & Governance hub: cross-module KPIs (RBAC-scoped; 60s Redis cache per org + visibility flags). */
  governanceSummary: permissionProcedure("legal", "read")
    .query(async ({ ctx }) => {
      const { db, org, user } = ctx;
      await rateLimit(user?.id, org?.id, "legal.governanceSummary");
      const role = String(user!.role ?? "");
      const matrixRole = user!.matrixRole as string | null | undefined;
      const canSec = checkDbUserPermission(role, "secretarial", "read", matrixRole);
      const canCont = checkDbUserPermission(role, "contracts", "read", matrixRole);
      const orgId = org!.id;
      const cacheKey = `legal:governanceSummary:${orgId}:${canSec ? 1 : 0}${canCont ? 1 : 0}`;

      const build = async () => {
        const today = new Date().toISOString();
        const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();

        const [activeMatters] = await db
          .select({ n: count() })
          .from(legalMatters)
          .where(and(eq(legalMatters.orgId, orgId), sql`${legalMatters.status} NOT IN ('closed','settled')`));
        const [totalMatters] = await db
          .select({ n: count() })
          .from(legalMatters)
          .where(eq(legalMatters.orgId, orgId));
        const [openRequests] = await db
          .select({ n: count() })
          .from(legalRequests)
          .where(
            and(eq(legalRequests.orgId, orgId), sql`${legalRequests.status} NOT IN ('completed','rejected')`),
          );
        const [openInvestigations] = await db
          .select({ n: count() })
          .from(investigations)
          .where(and(eq(investigations.orgId, orgId), sql`${investigations.status} != 'closed'`));

        let secretarial: {
          upcomingMeetings: number;
          overdueFilings: number;
          upcomingFilings: number;
          totalDirectors: number;
          kycExpiring: number;
        } | null = null;
        if (canSec) {
          const [upcomingMeetings] = await db
            .select({ n: count() })
            .from(boardMeetings)
            .where(
              and(
                eq(boardMeetings.orgId, orgId),
                sql`${boardMeetings.scheduledAt} >= ${today}::timestamptz`,
                eq(boardMeetings.status, "scheduled"),
              ),
            );
          const [overdueFilings] = await db
            .select({ n: count() })
            .from(secretarialFilings)
            .where(and(eq(secretarialFilings.orgId, orgId), eq(secretarialFilings.status, "overdue")));
          const [upcomingFilings] = await db
            .select({ n: count() })
            .from(secretarialFilings)
            .where(
              and(
                eq(secretarialFilings.orgId, orgId),
                sql`${secretarialFilings.dueDate} <= ${thirtyDays}::timestamptz`,
                sql`${secretarialFilings.status} IN ('upcoming','in_progress')`,
              ),
            );
          const [totalDirectors] = await db
            .select({ n: count() })
            .from(companyDirectors)
            .where(and(eq(companyDirectors.orgId, orgId), eq(companyDirectors.isActive, true)));
          const [kycExpiring] = await db
            .select({ n: count() })
            .from(companyDirectors)
            .where(
              and(
                eq(companyDirectors.orgId, orgId),
                eq(companyDirectors.isActive, true),
                sql`${companyDirectors.kycDueDate} <= ${thirtyDays}::timestamptz`,
              ),
            );
          secretarial = {
            upcomingMeetings: Number(upcomingMeetings.n),
            overdueFilings: Number(overdueFilings.n),
            upcomingFilings: Number(upcomingFilings.n),
            totalDirectors: Number(totalDirectors.n),
            kycExpiring: Number(kycExpiring.n),
          };
        }

        let contractsKpi: {
          active: number;
          expiringSoon: number;
          expiringWithin30: Array<{
            id: string;
            number: string | null;
            title: string;
            counterparty: string | null;
            endDate: string | null;
            status: string | null;
          }>;
        } | null = null;
        if (canCont) {
          const activeStatuses = [
            "under_review",
            "legal_review",
            "awaiting_signature",
            "active",
            "expiring_soon",
          ] as const;
          const [activeRow] = await db
            .select({ n: count() })
            .from(contracts)
            .where(and(eq(contracts.orgId, orgId), inArray(contracts.status, [...activeStatuses])));
          const [expiringSoonRow] = await db
            .select({ n: count() })
            .from(contracts)
            .where(
              and(
                eq(contracts.orgId, orgId),
                sql`${contracts.endDate} IS NOT NULL`,
                sql`${contracts.endDate} <= ${thirtyDays}::timestamptz`,
                sql`${contracts.endDate} >= ${today}::timestamptz`,
                sql`${contracts.status} NOT IN ('expired','terminated','draft')`,
              ),
            );
          const expiringRows = await db
            .select({
              id: contracts.id,
              contractNumber: contracts.contractNumber,
              title: contracts.title,
              counterparty: contracts.counterparty,
              endDate: contracts.endDate,
              status: contracts.status,
            })
            .from(contracts)
            .where(
              and(
                eq(contracts.orgId, orgId),
                sql`${contracts.endDate} IS NOT NULL`,
                sql`${contracts.endDate} <= ${thirtyDays}::timestamptz`,
                sql`${contracts.endDate} >= ${today}::timestamptz`,
                sql`${contracts.status} NOT IN ('expired','terminated')`,
              ),
            )
            .orderBy(asc(contracts.endDate))
            .limit(25);
          contractsKpi = {
            active: Number(activeRow.n),
            expiringSoon: Number(expiringSoonRow.n),
            expiringWithin30: expiringRows.map((r: {
              id: string;
              contractNumber: string | null;
              title: string;
              counterparty: string | null;
              endDate: Date | string | null;
              status: string | null;
            }) => ({
              id: r.id,
              number: r.contractNumber,
              title: r.title,
              counterparty: r.counterparty,
              endDate: r.endDate
                ? r.endDate instanceof Date
                  ? r.endDate.toISOString()
                  : String(r.endDate)
                : null,
              status: r.status,
            })),
          };
        }

        return {
          legal: {
            activeMatters: Number(activeMatters.n),
            totalMatters: Number(totalMatters.n),
            openRequests: Number(openRequests.n),
            openInvestigations: Number(openInvestigations.n),
          },
          secretarial,
          contracts: contractsKpi,
          generatedAt: new Date().toISOString(),
        };
      };

      try {
        const redis = getRedis();
        const hit = await redis.get(cacheKey);
        if (hit) {
          try {
            return JSON.parse(hit) as Awaited<ReturnType<typeof build>>;
          } catch {
            await redis.del(cacheKey).catch(() => {});
          }
        }
      } catch {
        /* Redis optional */
      }

      const result = await build();
      try {
        await getRedis().setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});
      } catch {
        /* Redis optional */
      }
      return result;
    }),
});
