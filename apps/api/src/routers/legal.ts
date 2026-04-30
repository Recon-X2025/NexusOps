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
  complianceCalendarItems,
  contracts,
  issuerProgrammeMatrix,
  relatedPartyTransactions,
  dpdpProcessingActivities,
  eq,
  and,
  desc,
  asc,
  count,
  sql,
  inArray,
  gte,
  lte,
  or,
  isNotNull,
} from "@coheronconnect/db";
import { checkDbUserPermission } from "../lib/rbac-db";
import { getNextNumber } from "../lib/auto-number";
import { getRedis } from "../lib/redis";
import { rateLimit } from "../lib/rate-limit";
import type { Context } from "../lib/trpc";

const ISSUER_MATRIX_SEED: Array<{
  matrixKey: string;
  title: string;
  closureCriterion: string;
  productRef: string;
}> = [
  { matrixKey: "3.1.statutory_registers", title: "Statutory registers & minute books", closureCriterion: "Register types modelled; minutes workflow to signed state", productRef: "statutory_register_entries" },
  { matrixKey: "3.1.mca21", title: "MCA21 V3 straight-through", closureCriterion: "Form prep + SRN capture + reconciliation", productRef: "mca_filing_records" },
  { matrixKey: "3.1.xbrl", title: "XBRL / tagging handoff", closureCriterion: "Export / vendor handoff from trial balance mapping", productRef: "xbrl_export_jobs" },
  { matrixKey: "3.1.group_graph", title: "Group company graph", closureCriterion: "Legal entities with CIN, parent/child, holdings", productRef: "legal_entities" },
  { matrixKey: "3.2.lodor", title: "LODOR event library", closureCriterion: "Configurable SEBI calendar entries", productRef: "lodor_calendar_entries" },
  { matrixKey: "3.2.rpt", title: "RPT lifecycle", closureCriterion: "Discover → approve → disclose with evidence", productRef: "related_party_transactions" },
  { matrixKey: "3.2.grievances", title: "Shareholder grievances", closureCriterion: "SCORES-style case log + SLA", productRef: "shareholder_grievances" },
  { matrixKey: "3.2.voting", title: "Voting / postal ballot", closureCriterion: "Results + ballot dates + outcomes", productRef: "shareholder_voting_results" },
  { matrixKey: "3.3.board", title: "Board lifecycle depth", closureCriterion: "Notice, quorum, attendance, VC checklist", productRef: "secretarial.board_meetings" },
  { matrixKey: "3.3.mbp1", title: "MBP-1 / interest disclosures", closureCriterion: "Director disclosure workflow + due dates", productRef: "director_interest_disclosures" },
  { matrixKey: "3.4.stamp_reg", title: "Stamp & registration", closureCriterion: "Challan / registration deadlines & status", productRef: "contracts.stamp_registration" },
  { matrixKey: "3.4.clauses", title: "India clause library", closureCriterion: "Curated templates + version control", productRef: "contract_clause_templates" },
  { matrixKey: "3.4.msme", title: "MSME compliance", closureCriterion: "Payment timelines & interest tracker", productRef: "msme_payment_trackers" },
  { matrixKey: "3.4.esign", title: "E-sign completion", closureCriterion: "Provider completion drives status + audit", productRef: "contract_esign_events" },
  { matrixKey: "3.5.litigation", title: "Litigation depth", closureCriterion: "CNR, court, hearing calendar, limitation", productRef: "legal_matters" },
  { matrixKey: "3.5.arbitration", title: "Arbitration", closureCriterion: "Seat, institution, tribunal, emergency flag", productRef: "legal_matters.arbitration" },
  { matrixKey: "3.6.dpdp", title: "DPDP programme", closureCriterion: "RoPA + breach clocks + DPO tasks", productRef: "dpdp_processing_activities" },
  { matrixKey: "3.6.whistle", title: "Whistleblower / vigil", closureCriterion: "Policy alignment + escalation matrix", productRef: "whistleblower_program_settings" },
  { matrixKey: "3.7.fema", title: "FEMA / RBI returns", closureCriterion: "Return types with due dates & filings", productRef: "fema_return_records" },
  { matrixKey: "3.7.cci", title: "CCI combinations", closureCriterion: "Notifiable tracker + deadlines", productRef: "cci_combination_filings" },
  { matrixKey: "3.7.licences", title: "Sector licences", closureCriterion: "Renewal + condition obligations", productRef: "sector_regulator_licences" },
  { matrixKey: "3.8.rbac", title: "RBAC segregation", closureCriterion: "legal / secretarial / issuer vs grc", productRef: "legal_rbac" },
  { matrixKey: "3.8.legal_hold", title: "Legal hold", closureCriterion: "Hold flag + custodian + release", productRef: "legal_hold_records" },
  { matrixKey: "3.8.unified_hub", title: "Unified Legal & Governance hub", closureCriterion: "Matters + secretarial + contracts + privacy KPIs", productRef: "legal.governanceSummary" },
];

async function ensureIssuerProgrammeMatrix(db: Context["db"], orgId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(issuerProgrammeMatrix)
    .where(eq(issuerProgrammeMatrix.orgId, orgId));
  if (Number(n ?? 0) >= 24) return;
  for (const row of ISSUER_MATRIX_SEED) {
    await db
      .insert(issuerProgrammeMatrix)
      .values({
        orgId,
        matrixKey: row.matrixKey,
        title: row.title,
        closureCriterion: row.closureCriterion,
        productRef: row.productRef,
        status: "implemented",
      })
      .onConflictDoNothing();
  }
}

export const legalRouter = router({
  // ── Matters ────────────────────────────────────────────────────────────────
  listMatters: permissionProcedure("legal", "read")
    .input(
      z.object({
        status: z.string().optional(),
        type: z.string().optional(),
        limit: z.coerce.number().default(50),
        hearingFrom: z.string().optional(),
        hearingTo: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(legalMatters.orgId, org!.id)];
      if (input.status) conditions.push(eq(legalMatters.status, input.status as any));
      if (input.type) conditions.push(eq(legalMatters.type, input.type as any));
      if (input.hearingFrom) {
        conditions.push(gte(legalMatters.nextHearingAt, new Date(input.hearingFrom)));
      }
      if (input.hearingTo) {
        conditions.push(lte(legalMatters.nextHearingAt, new Date(input.hearingTo)));
      }
      if (input.hearingFrom || input.hearingTo) {
        conditions.push(isNotNull(legalMatters.nextHearingAt));
      }
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
      cnr: z.string().optional(),
      courtName: z.string().optional(),
      forum: z.string().optional(),
      nextHearingAt: z.string().optional(),
      limitationDeadlineAt: z.string().optional(),
      arbitrationSeat: z.string().optional(),
      arbitrationInstitution: z.string().optional(),
      legalHold: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const matterNumber = await getNextNumber(db, org!.id, "MAT");
      const { nextHearingAt, limitationDeadlineAt, ...rest } = input;
      const [matter] = await db.insert(legalMatters).values({
        orgId: org!.id,
        matterNumber,
        ...rest,
        assignedTo: user!.id,
        nextHearingAt: nextHearingAt ? new Date(nextHearingAt) : undefined,
        limitationDeadlineAt: limitationDeadlineAt ? new Date(limitationDeadlineAt) : undefined,
      }).returning();
      return matter;
    }),

  updateMatter: permissionProcedure("legal", "write")
    .input(z.object({
      id: z.string().uuid(),
      status: z.string().optional(),
      phase: z.string().optional(),
      actualCost: z.string().optional(),
      cnr: z.string().optional(),
      courtName: z.string().optional(),
      forum: z.string().optional(),
      nextHearingAt: z.string().nullable().optional(),
      limitationDeadlineAt: z.string().nullable().optional(),
      arbitrationSeat: z.string().optional(),
      arbitrationInstitution: z.string().optional(),
      legalHold: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, nextHearingAt, limitationDeadlineAt, ...data } = input;
      const updates: Record<string, any> = { ...data, updatedAt: new Date() };
      if (nextHearingAt !== undefined) {
        updates.nextHearingAt = nextHearingAt ? new Date(nextHearingAt) : null;
      }
      if (limitationDeadlineAt !== undefined) {
        updates.limitationDeadlineAt = limitationDeadlineAt ? new Date(limitationDeadlineAt) : null;
      }
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
        // v3: contract India formalities attention (US-LEG-006 hub badge).
        const cacheKey = `legal:governanceSummary:v3:${orgId}:${canSec ? 1 : 0}${canCont ? 1 : 0}`;

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
          indiaFormalitiesAttention: number;
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
          const [formalitiesRow] = await db
            .select({ n: count() })
            .from(contracts)
            .where(
              and(
                eq(contracts.orgId, orgId),
                sql`${contracts.status} NOT IN ('expired','terminated','draft')`,
                or(
                  and(
                    isNotNull(contracts.registrationDueAt),
                    sql`${contracts.registrationDueAt} <= ${thirtyDays}::timestamptz`,
                  ),
                  sql`COALESCE(${contracts.stampDutyStatus}, '') NOT IN ('paid', 'not_applicable', '')`,
                  sql`COALESCE(${contracts.registrationStatus}, '') IN ('pending', 'in_progress', 'required')`,
                ),
              ),
            );
          contractsKpi = {
            active: Number(activeRow.n),
            expiringSoon: Number(expiringSoonRow.n),
            indiaFormalitiesAttention: Number(formalitiesRow?.n ?? 0),
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

        // ── India Compliance (US-LEG-004) ────────────────────────────────────
        // MCA/ROC statutory calendar items so a CS sees overdue + "due in 30d"
        // filings on the hub. Same `secretarial:read` gate as the rest of the
        // section because compliance_calendar_items lives under that module.
        let indiaCompliance: {
          overdue: number;
          dueWithin30: number;
          totalPenaltyInr: number;
          upcoming: Array<{
            id: string;
            eventName: string;
            mcaForm: string | null;
            complianceType: string;
            dueDate: string | null;
            status: string;
            daysOverdue: number;
            totalPenaltyInr: number;
          }>;
        } | null = null;
        if (canSec) {
          const [overdueRow] = await db
            .select({ n: count() })
            .from(complianceCalendarItems)
            .where(
              and(
                eq(complianceCalendarItems.orgId, orgId),
                eq(complianceCalendarItems.status, "overdue"),
              ),
            );
          const [dueSoonRow] = await db
            .select({ n: count() })
            .from(complianceCalendarItems)
            .where(
              and(
                eq(complianceCalendarItems.orgId, orgId),
                sql`${complianceCalendarItems.status} IN ('upcoming','due_soon')`,
                sql`${complianceCalendarItems.dueDate} <= ${thirtyDays}::timestamptz`,
                sql`${complianceCalendarItems.dueDate} >= ${today}::timestamptz`,
              ),
            );
          const [penaltyRow] = await db
            .select({
              total: sql<string | null>`COALESCE(SUM(${complianceCalendarItems.totalPenaltyInr}), 0)`,
            })
            .from(complianceCalendarItems)
            .where(
              and(
                eq(complianceCalendarItems.orgId, orgId),
                eq(complianceCalendarItems.status, "overdue"),
              ),
            );
          // Overdue first (most urgent), then nearest due — limit 5 for the hub panel.
          const upcomingItems = await db
            .select({
              id: complianceCalendarItems.id,
              eventName: complianceCalendarItems.eventName,
              mcaForm: complianceCalendarItems.mcaForm,
              complianceType: complianceCalendarItems.complianceType,
              dueDate: complianceCalendarItems.dueDate,
              status: complianceCalendarItems.status,
              daysOverdue: complianceCalendarItems.daysOverdue,
              totalPenaltyInr: complianceCalendarItems.totalPenaltyInr,
            })
            .from(complianceCalendarItems)
            .where(
              and(
                eq(complianceCalendarItems.orgId, orgId),
                sql`${complianceCalendarItems.status} IN ('upcoming','due_soon','overdue')`,
              ),
            )
            .orderBy(
              sql`CASE WHEN ${complianceCalendarItems.status} = 'overdue' THEN 0 ELSE 1 END`,
              asc(complianceCalendarItems.dueDate),
            )
            .limit(5);
          indiaCompliance = {
            overdue: Number(overdueRow.n),
            dueWithin30: Number(dueSoonRow.n),
            totalPenaltyInr: Number(penaltyRow?.total ?? 0),
            upcoming: upcomingItems.map((r: {
              id: string;
              eventName: string;
              mcaForm: string | null;
              complianceType: string;
              dueDate: Date | string | null;
              status: string;
              daysOverdue: number;
              totalPenaltyInr: string | null;
            }) => ({
              id: r.id,
              eventName: r.eventName,
              mcaForm: r.mcaForm,
              complianceType: r.complianceType,
              dueDate: r.dueDate
                ? r.dueDate instanceof Date
                  ? r.dueDate.toISOString()
                  : String(r.dueDate)
                : null,
              status: r.status,
              daysOverdue: Number(r.daysOverdue ?? 0),
              totalPenaltyInr: Number(r.totalPenaltyInr ?? 0),
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
          indiaCompliance,
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

  /** US-LEG-009+ — §3.9 programme matrix (per-org rows; seeded on first read). */
  programmeMatrix: permissionProcedure("legal", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    await ensureIssuerProgrammeMatrix(db, org!.id);
    return db
      .select()
      .from(issuerProgrammeMatrix)
      .where(eq(issuerProgrammeMatrix.orgId, org!.id))
      .orderBy(asc(issuerProgrammeMatrix.matrixKey));
  }),

  listRelatedPartyTransactions: permissionProcedure("legal", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(relatedPartyTransactions)
      .where(eq(relatedPartyTransactions.orgId, org!.id))
      .orderBy(desc(relatedPartyTransactions.createdAt));
  }),

  createRelatedPartyTransaction: permissionProcedure("legal", "write")
    .input(
      z.object({
        counterpartyName: z.string().min(1),
        amount: z.string().optional(),
        currency: z.string().default("INR"),
        transactionDate: z.string().optional(),
        approvalResolutionRef: z.string().optional(),
        status: z.string().default("draft"),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .insert(relatedPartyTransactions)
        .values({
          orgId: org!.id,
          counterpartyName: input.counterpartyName,
          amount: input.amount,
          currency: input.currency,
          transactionDate: input.transactionDate ? new Date(input.transactionDate) : undefined,
          approvalResolutionRef: input.approvalResolutionRef,
          status: input.status,
          notes: input.notes,
        })
        .returning();
      return row;
    }),

  exportRelatedPartyCsv: permissionProcedure("legal", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(relatedPartyTransactions)
      .where(eq(relatedPartyTransactions.orgId, org!.id));
    const esc = (s: string | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "id,counterparty_name,amount,currency,transaction_date,status,approval_resolution_ref",
      ...rows.map((r: (typeof rows)[number]) =>
        [
          r.id,
          r.counterpartyName,
          String(r.amount ?? ""),
          r.currency,
          r.transactionDate ? new Date(r.transactionDate).toISOString() : "",
          r.status,
          r.approvalResolutionRef ?? "",
        ]
          .map((c) => esc(typeof c === "string" ? c : String(c)))
          .join(","),
      ),
    ];
    return lines.join("\n");
  }),

  listDpdpProcessingActivities: permissionProcedure("legal", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(dpdpProcessingActivities)
      .where(eq(dpdpProcessingActivities.orgId, org!.id))
      .orderBy(desc(dpdpProcessingActivities.updatedAt));
  }),

  createDpdpProcessingActivity: permissionProcedure("legal", "write")
    .input(
      z.object({
        activityName: z.string().min(1),
        purpose: z.string().optional(),
        lawfulBasis: z.string().optional(),
        dataCategories: z.string().optional(),
        linkedPrivacyMatterId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db.insert(dpdpProcessingActivities).values({ orgId: org!.id, ...input }).returning();
      return row;
    }),

  signOffDpdpProcessingActivity: permissionProcedure("legal", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .update(dpdpProcessingActivities)
        .set({ dpoSignOffAt: new Date(), updatedAt: new Date() })
        .where(and(eq(dpdpProcessingActivities.id, input.id), eq(dpdpProcessingActivities.orgId, org!.id)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
});
