"use client";

/**
 * HubCommandCenter — a Command-Center-style executive dashboard scoped to a
 * single hub (FunctionKey). Reuses every Command Center visual primitive
 * (KPI strip, heatmap, trends, bullets, flow, risks, narrative) so each hub
 * Overview matches the look and feel of `/app/command`, just narrowed to
 * the metrics that belong to that hub's `function`.
 *
 * The rest of the page (period selector, refresh, error/loading shells) is
 * deliberately copied from `app/command/page.tsx` so the two pages render
 * the same chrome — diverging here would defeat the purpose.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Radio } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

// All Command Center components type their `payload` prop off
// `inferRouterOutputs<AppRouter>["commandCenter"]["getView"]`. Reuse that
// instead of importing `@nexusops/metrics` directly so the web package's
// dependency surface stays unchanged.
type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];
type HubPayload = inferRouterOutputs<AppRouter>["commandCenter"]["getHubView"];
type FunctionKey = HubPayload["heatmap"][number]["function"];
import {
  ExecutivePeriodSelect,
  ExecutiveFooterQuote,
  ExecutiveHowToStrip,
} from "@/components/dashboard/executive-dashboard-template";
import { CommandCenterShell } from "@/components/command-center/command-center-shell";
import { CommandCenterKpiStrip } from "@/components/command-center/command-center-kpi-strip";
import { CommandCenterHeatmap } from "@/components/command-center/command-center-heatmap";
import { CommandCenterSidebarCharts } from "@/components/command-center/command-center-sidebar-charts";

import { CommandCenterBullets } from "@/components/command-center/command-center-bullets";
import { CommandCenterTrends } from "@/components/command-center/command-center-trends";
import { CommandCenterFlow } from "@/components/command-center/command-center-flow";
import { CommandCenterRisks } from "@/components/command-center/command-center-risks";
import { executiveDefaultQuickRangeId, granularityForRange, resolveExecutiveQuickRange } from "@/lib/executive-quick-ranges";
import { cn } from "@/lib/utils";
import { HubReportsTab } from "@/components/dashboard/hub-reports-tab";
import { getHubLayout } from "@/components/dashboard/hub-layouts";

type TabId = "overview" | "reports";

const VIEW_WAIT_MS = 5000;

export interface HubCommandCenterProps {
  functionKey: FunctionKey;
  /** Hub display name shown in the chrome bar (e.g. "IT Services"). */
  title: string;
  /** Single-line subtitle below the title. */
  subtitle: string;
  /** Optional copy shown in the page footer. */
  footerQuote?: string;
}

function CommandCenterQueryError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="alert"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-slate-700 dark:text-slate-300">{message}</p>
      <button
        type="button"
        className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}

class HubSectionBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <CommandCenterQueryError
          title="A section failed to render"
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Hub-scoped chrome bar. Mirrors `CommandCenterBar` but pins the title to
 * the hub instead of the org rollup.
 */
function HubBar({
  title,
  subtitle,
  rangeId,
  onRangeId,
  onRefresh,
  isFetching,
  tab,
  onTab,
}: {
  title: string;
  subtitle: string;
  rangeId: string;
  onRangeId: (id: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  tab: TabId;
  onTab: (next: TabId) => void;
}) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "reports", label: "Analytics & Reporting" },
  ];
  return (
    <div className="sticky top-0 z-20 mb-5">
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm relative group">
        <div className="px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10 border-b border-slate-200/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#00BCFF]/10 border border-[#00BCFF]/20 rounded-lg">
              <Radio className="w-5 h-5 text-[#00BCFF] animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
            <ExecutivePeriodSelect id="hub-range" value={rangeId} onChange={onRangeId} className="h-8 text-xs min-w-[140px] bg-transparent border-none text-slate-700 focus:ring-0" />
            <div className="w-px h-5 bg-slate-300" />
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-all"
            >
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
              Sync
            </button>
          </div>
        </div>
        <div className="px-6 relative z-10 bg-slate-50/50">
          <nav className="flex gap-6" role="tablist" aria-label="Hub sections">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTab(t.id)}
                  className={cn(
                    "py-3 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2",
                    active
                      ? "border-[#00BCFF] text-[#004FFB] drop-shadow-sm"
                      : "border-transparent text-slate-400 hover:text-slate-700",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

export function HubCommandCenter({ functionKey, title, subtitle, footerQuote }: HubCommandCenterProps) {
  const { mergeTrpcQueryOpts, canAccess } = useRBAC();
  const [rangeId, setRangeId] = useState(executiveDefaultQuickRangeId);
  const [tab, setTab] = useState<TabId>("overview");
  const range = useMemo(() => {
    const r = resolveExecutiveQuickRange(rangeId);
    return {
      start: r.fromDate,
      end: r.toDate,
      granularity: granularityForRange(r.fromDate, r.toDate),
    };
  }, [rangeId]);

  if (!canAccess("command_center")) {
    return <AccessDenied module="command_center" />;
  }

  return (
    <HubBody
      functionKey={functionKey}
      title={title}
      subtitle={subtitle}
      footerQuote={footerQuote}
      range={range}
      rangeId={rangeId}
      setRangeId={setRangeId}
      tab={tab}
      setTab={setTab}
      mergeTrpcQueryOpts={mergeTrpcQueryOpts}
    />
  );
}

function HubBody({
  functionKey,
  title,
  subtitle,
  footerQuote,
  range,
  rangeId,
  setRangeId,
  tab,
  setTab,
  mergeTrpcQueryOpts,
}: HubCommandCenterProps & {
  range: { start: Date; end: Date; granularity: "day" | "week" | "month" };
  rangeId: string;
  setRangeId: (id: string) => void;
  tab: TabId;
  setTab: (next: TabId) => void;
  mergeTrpcQueryOpts: ReturnType<typeof useRBAC>["mergeTrpcQueryOpts"];
}) {
  const [viewTimedOut, setViewTimedOut] = useState(false);

  // Hub-scoped Command Center payload. The API resolves only this hub's
  // metric pool and selects bullets/trends/risks from within that pool,
  // so the visual panels stay populated even when the hub owns just a
  // handful of metrics.
  const qView = trpc.commandCenter.getHubView.useQuery(
    { functionKey, range },
    mergeTrpcQueryOpts("commandCenter.getHubView"),
  );

  useEffect(() => {
    if (qView.isSuccess || qView.isError) {
      setViewTimedOut(false);
      return;
    }
    if (!qView.isFetching) return;
    const id = window.setTimeout(() => setViewTimedOut(true), VIEW_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [qView.isSuccess, qView.isError, qView.isFetching]);



  const scoped = useMemo<Payload | undefined>(() => {
    if (!qView.data) return undefined;
    return qView.data as unknown as Payload;
  }, [qView.data]);

  const refreshAll = () => {
    setViewTimedOut(false);
    void qView.refetch();
  };

  const bar = (
    <HubBar
      title={title}
      subtitle={subtitle}
      rangeId={rangeId}
      onRangeId={setRangeId}
      onRefresh={refreshAll}
      isFetching={qView.isFetching}
      tab={tab}
      onTab={setTab}
    />
  );

  if (qView.isError) {
    return (
      <CommandCenterShell>
        {bar}
        <CommandCenterQueryError
          title={`Couldn't load ${title}`}
          message={qView.error?.message ?? "Unknown error"}
          onRetry={() => void qView.refetch()}
        />
      </CommandCenterShell>
    );
  }

  if (viewTimedOut && !qView.data) {
    return (
      <CommandCenterShell>
        {bar}
        <CommandCenterQueryError
          title={`${title} is taking too long`}
          message="The dashboard did not respond in time. Check your connection or try again."
          onRetry={refreshAll}
        />
      </CommandCenterShell>
    );
  }

  return (
    <CommandCenterShell>
      {bar}

      {qView.isLoading || !scoped ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
          <div className="h-96 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
          <div className="h-64 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
        </div>
      ) : tab === "overview" ? (
        <HubSectionBoundary>
          <HubOverview payload={scoped!} hubPayload={qView.data!} functionKey={functionKey} granularity={range.granularity} />
        </HubSectionBoundary>
      ) : (
        <HubSectionBoundary>
          <HubReportsTab payload={qView.data!} hubTitle={title} />
        </HubSectionBoundary>
      )}


    </CommandCenterShell>
  );
}

/**
 * The Overview tab body. Composition is uniform across modules but the
 * primary visual is module-specific via the `hub-layouts` registry, so
 * each hub feels distinct while support panels (KPI strip, heatmap,
 * bullets/flow/risks, narrative, sidebar charts, trend deck) read off
 * the same payload shape.
 *
 * Layout flow:
 *   1. KPI strip — at-a-glance score + posture
 *   2. Module-specific PRIMARY visual (full-width, the "money shot")
 *   3. Posture strip (single-row heatmap of dimension cells)
 *   4. Three-up: Key targets (Bullets) · Throughput (Flow) · Risks
 *   5. Sidebar (Signal mix donut) + Narrative panel
 *   6. Trend Deck (canonical secondary trends), optional per module
 *   7. Attention is folded into Risks rail server-side; no separate row
 */
function HubOverview({
  payload,
  hubPayload,
  functionKey,
  granularity,
}: {
  payload: Payload;
  hubPayload: HubPayload;
  functionKey: FunctionKey;
  granularity: "day" | "week" | "month";
}) {
  const layout = getHubLayout(functionKey);
  const { Primary, showTrendDeck } = layout;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
         <div className="xl:col-span-12">
           <CommandCenterKpiStrip payload={payload} />
         </div>
      </div>
      
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden shadow-sm rounded-2xl p-4">
         <Primary payload={hubPayload} granularity={granularity} />
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 min-w-0">
          <CommandCenterHeatmap payload={payload} />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <CommandCenterSidebarCharts payload={payload} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <CommandCenterBullets payload={payload} />
        <CommandCenterFlow payload={payload} />
        <CommandCenterRisks payload={payload} />
        {showTrendDeck ? <CommandCenterTrends payload={payload} /> : <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 text-[10px] text-slate-400 flex items-center justify-center uppercase tracking-widest font-black">Trends Restricted</div>}
      </div>
    </div>
  );
}
