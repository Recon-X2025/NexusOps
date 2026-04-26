"use client";

/**
 * WorkbenchReportsTab — the "Analytics & Reporting" tab content for each
 * workbench. This is intentionally distinct from the hub Reports tab in
 * one important way: it filters the hub's metric pool down to operator
 * KPIs only — backlog, throughput, SLA breach, queue age — i.e. the
 * `volume` and `sla` dimensions. Strategic `risk`/`trend` metrics belong
 * on the hub Overview, not on the operator's day-to-day surface.
 *
 * Implementation: we reuse `commandCenter.getHubView` (already scoped
 * server-side to a FunctionKey) and post-filter the bullets/trends to
 * operator dimensions. There is no separate workbench resolver because
 * the metric registry itself doesn't model the operator/strategic
 * split — we encode that in the UI.
 */

import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { executiveDefaultQuickRangeId, granularityForRange, resolveExecutiveQuickRange } from "@/lib/executive-quick-ranges";
import { HubReportsTab } from "@/components/dashboard/hub-reports-tab";
import { ExecutivePeriodSelect } from "@/components/dashboard/executive-dashboard-template";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkbenchKey } from "@nexusops/types";

type HubPayload = inferRouterOutputs<AppRouter>["commandCenter"]["getHubView"];
type FunctionKey = HubPayload["heatmap"][number]["function"];

/**
 * Workbench → parent function. Workbench reports pull from this hub's
 * metric pool. The mapping mirrors `HUB_TO_DEFAULT_WORKBENCH` (in
 * `@nexusops/types/workbench-defaults.ts`) but inverted — and adds
 * entries for workbenches whose hub doesn't have a default workbench
 * (change-release, field-service, recruiter, procurement, grc).
 */
const WORKBENCH_FUNCTION: Record<WorkbenchKey, FunctionKey> = {
  "service-desk": "it_services",
  "change-release": "it_services",
  "field-service": "it_services",
  secops: "security",
  grc: "security",
  "hr-ops": "people",
  recruiter: "people",
  csm: "customer",
  "finance-ops": "finance",
  procurement: "finance",
  "company-secretary": "legal",
  pmo: "strategy",
};

/**
 * Operator dimensions — the "what's flowing today" view. We exclude
 * `risk` and `trend` because those describe long-horizon posture and
 * belong on the hub Overview's dashboard tab.
 */
const OPERATOR_DIMENSIONS = new Set(["volume", "sla"]);

interface WorkbenchReportsTabProps {
  workbenchKey: WorkbenchKey;
  workbenchTitle: string;
}

export function WorkbenchReportsTab({ workbenchKey, workbenchTitle }: WorkbenchReportsTabProps) {
  const { mergeTrpcQueryOpts } = useRBAC();
  const [rangeId, setRangeId] = useState(executiveDefaultQuickRangeId);
  const range = useMemo(() => {
    const r = resolveExecutiveQuickRange(rangeId);
    return {
      start: r.fromDate,
      end: r.toDate,
      granularity: granularityForRange(r.fromDate, r.toDate),
    };
  }, [rangeId]);

  const functionKey = WORKBENCH_FUNCTION[workbenchKey];

  const qView = trpc.commandCenter.getHubView.useQuery(
    { functionKey, range },
    mergeTrpcQueryOpts("commandCenter.getHubView"),
  );

  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!qView.isFetching) return;
    const id = window.setTimeout(() => setWaited(true), 5000);
    return () => window.clearTimeout(id);
  }, [qView.isFetching]);

  /**
   * Build an "operator-only" payload by keeping bullets/trends whose
   * dimension is volume or sla. Heatmap/flow/risks/sidebar charts are
   * dropped — the table is the surface here. Backfill bullets from
   * trends so a workbench with sparse explicit `bullet` registrations
   * still renders something useful (mirror of the hub backfill).
   */
  const operatorPayload = useMemo(() => {
    if (!qView.data) return undefined;
    const filteredBullets = qView.data.bullets.filter((b) =>
      OPERATOR_DIMENSIONS.has(b.dimension),
    );
    const filteredTrends = qView.data.trends.filter((t) =>
      OPERATOR_DIMENSIONS.has(t.dimension),
    );
    return {
      ...qView.data,
      bullets: filteredBullets,
      trends: filteredTrends,
    };
  }, [qView.data]);

  if (qView.isError) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
        role="alert"
      >
        <p className="font-semibold">Couldn&apos;t load reports</p>
        <p className="mt-1">{qView.error?.message ?? "Unknown error"}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          onClick={() => void qView.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (qView.isLoading || (!qView.data && !waited)) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
        <div className="h-72 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
      </div>
    );
  }

  if (!operatorPayload) {
    return (
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm p-8 text-center text-sm text-slate-500 dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400">
        Reports are taking too long to load. Try a different period or refresh.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Operator KPIs for <span className="font-semibold">{workbenchTitle}</span> · backlog, throughput, SLA, queue age.
          Strategic posture lives on the hub Overview.
        </p>
        <div className="flex items-center gap-2">
          <ExecutivePeriodSelect id="wb-reports-range" value={rangeId} onChange={setRangeId} className="max-w-[min(100%,280px)]" />
          <button
            type="button"
            onClick={() => void qView.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", qView.isFetching && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </div>
      <HubReportsTab payload={operatorPayload} hubTitle={workbenchTitle} />
    </div>
  );
}
