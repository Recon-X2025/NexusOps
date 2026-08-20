/**
 * CRM management view — CURRENT STATE ONLY.
 * ─────────────────────────────────────────
 *
 * Five aggregates over records that already exist: pipeline by stage, the
 * stage-probability weighting of that pipeline, deals by owner, win/loss with
 * the lost-reason breakdown, and quote status distribution.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY
 * ------------------------------------
 * `crm_deals` records the CURRENT stage and nothing else. `crm_deal_stage_history`
 * (migration 0099) started the forward record but STARTS EMPTY and is not
 * backfilled, so no prior stage or moment-of-move is recoverable for any deal
 * that exists today. Everything below is therefore NOT COMPUTABLE and is not
 * approximated here:
 *
 *   • average sales cycle          • time in stage / stage ageing
 *   • time between stages          • stage-to-stage conversion rate
 *   • forecast accuracy            • any trend or period-over-period change
 *
 * `createdAt`/`updatedAt` must NOT be pressed into service for these.
 * `updatedAt` moves on ANY edit — a title correction, a value change — so a
 * duration derived from it is a plausible, confident, wrong number. An absent
 * metric is honest; a fabricated one is not.
 *
 * AGGREGATED IN SQL, NOT IN THE BROWSER
 * -------------------------------------
 * The CRM page loads deals with `limit: 200`. Summing that client-side would
 * silently under-report the moment an org holds more than 200 deals, and would
 * do so without any visible symptom. These aggregates run over the whole table,
 * scoped to one org.
 */
import {
  crmDeals,
  crmQuotes,
  crmPipelineStages,
  users,
  eq,
  and,
  sql,
  asc,
  count,
  sum,
  type DbOrTx,
} from "@coheronconnect/db";
import { DEFAULT_PIPELINE_STAGES, type DealStageKey } from "../../routers/crm/deals";

const CLOSED_STAGES: DealStageKey[] = ["closed_won", "closed_lost"];

/** The schema's own five quote statuses. No invented values. */
const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

export interface ManagementView {
  /**
   * Where the stage list came from. The screen states this, because "your
   * configured stages" and "the factory defaults, because you have none saved"
   * are different claims and a reader cannot tell them apart from the rows.
   */
  stageConfigSource: "org-configured" | "factory-defaults";
  /** True when the org holds no deal rows at all — lets the screen say so in words. */
  hasAnyDeals: boolean;
  hasAnyQuotes: boolean;

  pipelineByStage: Array<{
    key: DealStageKey;
    label: string;
    /** Stage-config close probability, 0-100. Null when no stage row exists. */
    probability: number | null;
    /** Whether the org shows this stage as an active kanban column. */
    active: boolean;
    isClosed: boolean;
    dealCount: number;
    /** Sum of `crm_deals.value` over this stage. Excludes rows with a NULL value. */
    value: string;
    /** How many deals in this stage carry no value — see `dealsWithNoValue`. */
    dealsWithNoValue: number;
    /** value x probability/100. Null when probability is unknown. */
    weightedValue: string | null;
  }>;

  openPipeline: {
    dealCount: number;
    value: string;
    weightedValue: string | null;
    /** Set when at least one OPEN stage has no probability configured. */
    weightedIncomplete: boolean;
  };

  byOwner: Array<{
    ownerId: string | null;
    /** `users.name`, or null when the deal has no owner. */
    ownerName: string | null;
    dealCount: number;
    value: string;
    weightedValue: string | null;
  }>;

  winLoss: {
    won: { dealCount: number; value: string };
    lost: { dealCount: number; value: string };
    /** Grouped `crm_deals.lost_reason`. A null reason is reported, never dropped. */
    lostReasons: Array<{ reason: string | null; dealCount: number; value: string }>;
  };

  quotesByStatus: Array<{ status: (typeof QUOTE_STATUSES)[number]; quoteCount: number; value: string }>;

  /**
   * Deals whose `value` is NULL, across the whole org. Every money figure above
   * excludes them, so the count is surfaced rather than left to be discovered.
   */
  dealsWithNoValue: number;
}

const money = (v: unknown): string => String(v ?? "0");

/** value x probability/100, in string decimal, or null when probability is unknown. */
function weight(value: string, probability: number | null): string | null {
  if (probability === null) return null;
  return (Number(value) * (probability / 100)).toFixed(2);
}

export async function buildManagementView(db: DbOrTx, orgId: string): Promise<ManagementView> {
  /*
   * Stage configuration is READ, never seeded here. `deals.stages.list` seeds
   * factory defaults on first read; doing that from a reporting query would
   * make opening a dashboard write to the tenant's configuration. When no rows
   * exist the factory defaults are used for ordering and labelling, and the
   * screen SAYS they are the factory defaults.
   */
  const configured = await db
    .select()
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.orgId, orgId))
    .orderBy(asc(crmPipelineStages.rank));

  const stageConfigSource = configured.length > 0 ? "org-configured" : "factory-defaults";
  const stageRows =
    configured.length > 0
      ? configured.map((s) => ({
          key: s.key as DealStageKey,
          label: s.label,
          probability: s.probability as number | null,
          active: s.active,
        }))
      : DEFAULT_PIPELINE_STAGES.map((s) => ({
          key: s.key,
          label: s.label,
          probability: s.probability as number | null,
          active: s.active,
        }));

  // ── Deals grouped by stage ────────────────────────────────────────────────
  const dealAgg = await db
    .select({
      stage: crmDeals.stage,
      dealCount: count(),
      value: sum(crmDeals.value),
      noValue: sql<number>`count(*) filter (where ${crmDeals.value} is null)`,
    })
    .from(crmDeals)
    .where(eq(crmDeals.orgId, orgId))
    .groupBy(crmDeals.stage);

  const byStage = new Map(dealAgg.map((r) => [r.stage as DealStageKey, r]));

  const pipelineByStage = stageRows.map((s) => {
    const row = byStage.get(s.key);
    const value = money(row?.value);
    return {
      key: s.key,
      label: s.label,
      probability: s.probability,
      active: s.active,
      isClosed: CLOSED_STAGES.includes(s.key),
      dealCount: Number(row?.dealCount ?? 0),
      value,
      dealsWithNoValue: Number(row?.noValue ?? 0),
      weightedValue: weight(value, s.probability),
    };
  });

  const openStages = pipelineByStage.filter((s) => !s.isClosed);
  const openValue = openStages.reduce((acc, s) => acc + Number(s.value), 0);
  const weightedIncomplete = openStages.some((s) => s.probability === null && s.dealCount > 0);
  const openWeighted = openStages.reduce(
    (acc, s) => acc + (s.weightedValue === null ? 0 : Number(s.weightedValue)),
    0,
  );

  // ── Deals by owner ────────────────────────────────────────────────────────
  /*
   * LEFT JOIN, not INNER: `crm_deals.owner_id` is nullable (SET NULL when a user
   * is removed). An inner join would silently DROP those deals, so the totals on
   * this panel would not reconcile with the pipeline panel above it — the exact
   * shape of quiet dashboard error this round exists to avoid. Unowned deals are
   * reported under a null owner and the screen labels them.
   */
  const ownerAgg = await db
    .select({
      ownerId: crmDeals.ownerId,
      ownerName: users.name,
      dealCount: count(),
      value: sum(crmDeals.value),
      // Weighted per owner needs the STAGE probability, so it is summed here
      // rather than derived from a single owner-level probability (there is no
      // such thing). `crm_deals.probability` is the rep's own per-deal number and
      // is deliberately NOT used: this panel is stage-probability weighting, and
      // mixing the two would make the owner totals disagree with the stage totals.
      weighted: sql<string>`coalesce(sum(${crmDeals.value} * (${crmPipelineStages.probability}::numeric / 100)), 0)`,
    })
    .from(crmDeals)
    .leftJoin(users, eq(users.id, crmDeals.ownerId))
    .leftJoin(
      crmPipelineStages,
      and(eq(crmPipelineStages.orgId, orgId), eq(crmPipelineStages.key, crmDeals.stage)),
    )
    .where(eq(crmDeals.orgId, orgId))
    .groupBy(crmDeals.ownerId, users.name);

  const byOwner = ownerAgg
    .map((r) => ({
      ownerId: r.ownerId,
      ownerName: r.ownerName ?? null,
      dealCount: Number(r.dealCount ?? 0),
      value: money(r.value),
      weightedValue: configured.length > 0 ? money(r.weighted) : null,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  // ── Win / loss ────────────────────────────────────────────────────────────
  const won = pipelineByStage.find((s) => s.key === "closed_won");
  const lost = pipelineByStage.find((s) => s.key === "closed_lost");

  const lostReasonAgg = await db
    .select({
      reason: crmDeals.lostReason,
      dealCount: count(),
      value: sum(crmDeals.value),
    })
    .from(crmDeals)
    .where(and(eq(crmDeals.orgId, orgId), eq(crmDeals.stage, "closed_lost")))
    .groupBy(crmDeals.lostReason);

  // ── Quotes by status ──────────────────────────────────────────────────────
  const quoteAgg = await db
    .select({ status: crmQuotes.status, quoteCount: count(), value: sum(crmQuotes.total) })
    .from(crmQuotes)
    .where(eq(crmQuotes.orgId, orgId))
    .groupBy(crmQuotes.status);
  const quoteMap = new Map(quoteAgg.map((r) => [r.status, r]));

  const totalDeals = dealAgg.reduce((acc, r) => acc + Number(r.dealCount ?? 0), 0);
  const totalQuotes = quoteAgg.reduce((acc, r) => acc + Number(r.quoteCount ?? 0), 0);

  return {
    stageConfigSource,
    hasAnyDeals: totalDeals > 0,
    hasAnyQuotes: totalQuotes > 0,
    pipelineByStage,
    openPipeline: {
      dealCount: openStages.reduce((acc, s) => acc + s.dealCount, 0),
      value: openValue.toFixed(2),
      weightedValue: weightedIncomplete ? null : openWeighted.toFixed(2),
      weightedIncomplete,
    },
    byOwner,
    winLoss: {
      won: { dealCount: won?.dealCount ?? 0, value: won?.value ?? "0" },
      lost: { dealCount: lost?.dealCount ?? 0, value: lost?.value ?? "0" },
      lostReasons: lostReasonAgg
        .map((r) => ({
          reason: r.reason,
          dealCount: Number(r.dealCount ?? 0),
          value: money(r.value),
        }))
        .sort((a, b) => b.dealCount - a.dealCount),
    },
    quotesByStatus: QUOTE_STATUSES.map((status) => ({
      status,
      quoteCount: Number(quoteMap.get(status)?.quoteCount ?? 0),
      value: money(quoteMap.get(status)?.value),
    })),
    dealsWithNoValue: dealAgg.reduce((acc, r) => acc + Number(r.noValue ?? 0), 0),
  };
}
