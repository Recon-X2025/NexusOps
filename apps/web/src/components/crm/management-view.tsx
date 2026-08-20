"use client";

/**
 * CRM management view — CURRENT STATE ONLY.
 *
 * Renders `crm.dashboard.managementView`: pipeline by stage, its
 * stage-probability weighting, deals by owner, win/loss with lost reasons, and
 * quote status distribution. Every figure comes from a column that exists.
 *
 * WHAT THIS SCREEN DOES NOT SHOW, AND WHY
 * ---------------------------------------
 * No velocity, no ageing, no cycle time, no conversion rate between stages, no
 * trend, no forecast. `crm_deals` records the CURRENT stage only, and
 * `crm_deal_stage_history` (migration 0099) starts empty and is not backfilled —
 * so nothing here can know WHEN a deal moved. Deriving any of those from
 * `updatedAt` would produce a confident wrong number, because `updatedAt` moves
 * on any edit at all.
 *
 * HONESTY RULES THIS FILE FOLLOWS
 * -------------------------------
 * 1. A metric with no data says so IN WORDS. Never a bare 0 or a dash, which
 *    cannot be told apart from "not wired" — a previous crawl of this codebase
 *    found 23 routes showing 0 and 18 showing a dash with no way to distinguish.
 * 2. Every panel states what it counts and over what set.
 * 3. Nothing is called forecast, projection, trend or velocity.
 * 4. A stage with no configured probability is NAMED as unset, never treated
 *    as zero — zero would quietly shrink the weighted total.
 */

import { AlertCircle, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/** Full rupee figures, en-IN, two decimals. No abbreviated "250K". */
function inr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A panel shell with a heading and a mandatory scope line. */
function Panel({
  title,
  scope,
  children,
  className,
}: {
  title: string;
  /** What this panel counts, over what set. Required — never optional. */
  scope: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border rounded overflow-hidden bg-card", className)}>
      <div className="px-3 py-2 bg-muted/30 border-b border-border">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
        <div className="text-[10px] text-muted-foreground/80 mt-0.5">{scope}</div>
      </div>
      {children}
    </div>
  );
}

/** The "no data" statement. Words, never a 0 or a dash. */
function NoData({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
      <span>{children}</span>
    </div>
  );
}

export function CrmManagementView() {
  const q = trpc.crm.dashboard.managementView.useQuery();

  if (q.isLoading) {
    return (
      <div className="p-4 grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-border rounded h-48 animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="p-4">
        <div className="border border-red-200 bg-red-50 rounded p-4 text-[11px] text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            This view could not be loaded, so no figures are shown rather than
            partial ones: {q.error.message}
          </span>
        </div>
      </div>
    );
  }

  const d = q.data;
  if (!d) return null;

  const openStages = d.pipelineByStage.filter((s) => !s.isClosed);
  const maxOpenValue = Math.max(...openStages.map((s) => Number(s.value)), 0);

  return (
    <div className="p-4 space-y-4" data-testid="crm-management-view">
      {/* ── What this screen is, stated before any number is read ──────────── */}
      <div className="border border-border rounded bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground/80">Current state only.</span>{" "}
        Every figure below is a count or a sum of records as they stand right now.
        This screen shows no sales cycle, stage ageing, conversion rate, trend or
        forecast: deals record their current stage only, and the stage-history
        table began recording on its first move after migration 0099, so no
        earlier movement exists to measure.
        {d.stageConfigSource === "factory-defaults" && (
          <>
            {" "}
            <span className="text-amber-700 font-medium">
              This org has no saved pipeline-stage configuration, so stage names,
              order and probabilities below are the factory defaults.
            </span>
          </>
        )}
      </div>

      {!d.hasAnyDeals && (
        <div
          data-testid="mgmt-no-deals"
          className="border border-border rounded p-6 text-center text-[12px] text-muted-foreground leading-relaxed"
        >
          <p className="font-medium text-foreground/80">This org has no deals recorded.</p>
          <p className="mt-1">
            Pipeline, weighted pipeline, owner and win/loss figures need at least
            one deal before they can say anything. They are not shown as zero
            because there is nothing to count, not because the count is nil.
          </p>
        </div>
      )}

      {d.dealsWithNoValue > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded px-3 py-2 text-[10px] text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>{d.dealsWithNoValue}</strong>{" "}
            {d.dealsWithNoValue === 1 ? "deal carries" : "deals carry"} no value.
            They are included in every COUNT below and excluded from every money
            total, so the two do not describe the same set of deals.
          </span>
        </div>
      )}

      {d.hasAnyDeals && (
        <>
          {/* ── 1 + 2. Pipeline by stage, and its weighting ──────────────── */}
          <Panel
            title="Pipeline by stage"
            scope={`All deals in this org, every owner, grouped by current stage — in ${
              d.stageConfigSource === "org-configured" ? "this org's configured" : "the factory-default"
            } stage order. Weighted = value x the stage's own close probability.`}
          >
            <table className="ent-table w-full" data-testid="mgmt-pipeline-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="text-right">Deals</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Stage probability</th>
                  <th className="text-right">Weighted</th>
                  <th className="w-40" />
                </tr>
              </thead>
              <tbody>
                {d.pipelineByStage.map((s) => (
                  <tr key={s.key} className={s.isClosed ? "opacity-70" : ""} data-testid={`mgmt-stage-${s.key}`}>
                    <td className="font-medium text-foreground">
                      {s.label}
                      {s.isClosed && <span className="ml-1.5 text-[9px] text-muted-foreground uppercase">closed</span>}
                      {!s.active && !s.isClosed && (
                        <span className="ml-1.5 text-[9px] text-muted-foreground uppercase">hidden on board</span>
                      )}
                    </td>
                    <td className="text-right font-mono" data-testid={`mgmt-count-${s.key}`}>
                      {s.dealCount === 0 ? <span className="text-muted-foreground/70">none</span> : s.dealCount}
                    </td>
                    <td className="text-right font-mono" data-testid={`mgmt-value-${s.key}`}>
                      {s.dealCount === 0 ? (
                        <span className="text-muted-foreground/70">no deals</span>
                      ) : (
                        inr(s.value)
                      )}
                    </td>
                    <td className="text-right font-mono text-muted-foreground">
                      {/* Unset is NAMED. Rendering it as 0% would silently zero
                          the weighted column and look like a real answer. */}
                      {s.probability === null ? (
                        <span className="text-amber-700">not set</span>
                      ) : (
                        `${s.probability}%`
                      )}
                    </td>
                    <td className="text-right font-mono font-semibold text-primary" data-testid={`mgmt-weighted-${s.key}`}>
                      {s.dealCount === 0 ? (
                        <span className="text-muted-foreground/70 font-normal">no deals</span>
                      ) : s.weightedValue === null ? (
                        <span className="text-amber-700 font-normal">probability not set</span>
                      ) : (
                        inr(s.weightedValue)
                      )}
                    </td>
                    <td>
                      {!s.isClosed && maxOpenValue > 0 && (
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          {/* Scaled to the largest OPEN stage in this org — not to
                              a hardcoded ceiling. The previous panel here divided
                              by a literal 500000, so every bar was meaningless on
                              any org whose pipeline was not that size. */}
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(Number(s.value) / maxOpenValue) * 100}%` }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="text-foreground">Open pipeline (excludes closed won and closed lost)</td>
                  <td className="text-right font-mono" data-testid="mgmt-open-count">{d.openPipeline.dealCount}</td>
                  <td className="text-right font-mono" data-testid="mgmt-open-value">{inr(d.openPipeline.value)}</td>
                  <td />
                  <td className="text-right font-mono text-primary" data-testid="mgmt-open-weighted">
                    {d.openPipeline.weightedValue === null ? (
                      <span className="text-amber-700 font-normal text-[10px]">
                        incomplete — a stage holding deals has no probability set
                      </span>
                    ) : (
                      inr(d.openPipeline.weightedValue)
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
              The weighted column is <strong>stage-probability weighting</strong>,
              not a forecast: each stage&rsquo;s value multiplied by the close
              probability configured for that stage. It says nothing about when
              anything will close, and is not adjusted for how long a deal has sat.
            </div>
          </Panel>

          {/* ── 3. Deals by owner ────────────────────────────────────────── */}
          <Panel
            title="Deals by owner"
            scope="All deals in this org including closed ones, grouped by the deal's owner. Weighted uses each deal's stage probability, the same basis as the panel above."
          >
            {d.byOwner.length === 0 ? (
              <NoData>No deals carry an owner, so there is nothing to group.</NoData>
            ) : (
              <table className="ent-table w-full" data-testid="mgmt-owner-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th className="text-right">Deals</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byOwner.map((o) => (
                    <tr key={o.ownerId ?? "unassigned"}>
                      <td className="font-medium text-foreground">
                        {/* An unowned deal is reported, not dropped. `owner_id` is
                            nullable (SET NULL when a user is removed), so these
                            rows are real and their value belongs in the totals. */}
                        {o.ownerName ?? (
                          <span className="text-amber-700">Unassigned (no owner on the deal)</span>
                        )}
                      </td>
                      <td className="text-right font-mono">{o.dealCount}</td>
                      <td className="text-right font-mono">{inr(o.value)}</td>
                      <td className="text-right font-mono font-semibold text-primary">
                        {o.weightedValue === null ? (
                          <span className="text-amber-700 font-normal text-[10px]">no stage config saved</span>
                        ) : (
                          inr(o.weightedValue)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* ── 4. Win / loss ────────────────────────────────────────────── */}
          <Panel
            title="Win / loss"
            scope="Deals currently sitting in closed won or closed lost, all owners, all time. This is a standing count of where deals are now, not a rate over any period."
          >
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Closed won</div>
                {d.winLoss.won.dealCount === 0 ? (
                  <p className="text-[11px] text-muted-foreground mt-1">No deals have been marked closed won.</p>
                ) : (
                  <>
                    <div className="text-[18px] font-bold text-green-700 font-mono" data-testid="mgmt-won-count">
                      {d.winLoss.won.dealCount}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground" data-testid="mgmt-won-value">
                      {inr(d.winLoss.won.value)}
                    </div>
                  </>
                )}
              </div>
              <div className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Closed lost</div>
                {d.winLoss.lost.dealCount === 0 ? (
                  <p className="text-[11px] text-muted-foreground mt-1">No deals have been marked closed lost.</p>
                ) : (
                  <>
                    <div className="text-[18px] font-bold text-red-700 font-mono" data-testid="mgmt-lost-count">
                      {d.winLoss.lost.dealCount}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">{inr(d.winLoss.lost.value)}</div>
                  </>
                )}
              </div>
            </div>

            <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide border-b border-border">
              Lost reasons
            </div>
            {d.winLoss.lostReasons.length === 0 ? (
              <NoData>
                No deals are in closed lost, so no reasons have been captured. A
                reason is required whenever a deal is moved to closed lost.
              </NoData>
            ) : (
              <div className="divide-y divide-border">
                {d.winLoss.lostReasons.map((r) => (
                  <div key={r.reason ?? "__none__"} className="px-3 py-2 flex items-center gap-3 text-[11px]">
                    <span className="flex-1">
                      {r.reason ?? (
                        /* Pre-guard rows. The lost-reason requirement validates the
                           TRANSITION, so deals closed before it existed were never
                           re-validated and legitimately carry no reason. */
                        <span className="text-amber-700">
                          No reason recorded (closed before a reason was required)
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-muted-foreground">{r.dealCount}</span>
                    <span className="font-mono w-32 text-right">{inr(r.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── 5. Quote status distribution ──────────────────────────────────── */}
      <Panel
        title="Quote status"
        scope="All quotes in this org, counted by their current status. These are the five statuses the schema defines; there are no others."
      >
        {!d.hasAnyQuotes ? (
          <NoData>
            No quotes exist in this org yet, so there is no distribution to show.
            Quotes appear here as soon as one is raised against a deal.
          </NoData>
        ) : (
          <div className="grid grid-cols-5 divide-x divide-border" data-testid="mgmt-quote-status">
            {d.quotesByStatus.map((s) => (
              <div key={s.status} className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.status}</div>
                {s.quoteCount === 0 ? (
                  <p className="text-[10px] text-muted-foreground/70 mt-1">none in this status</p>
                ) : (
                  <>
                    <div className="text-[16px] font-bold font-mono" data-testid={`mgmt-quote-${s.status}`}>
                      {s.quoteCount}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">{inr(s.value)}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
