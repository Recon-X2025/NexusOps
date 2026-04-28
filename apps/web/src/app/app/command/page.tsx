"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ExecutiveFooterQuote, ExecutiveHowToStrip } from "@/components/dashboard/executive-dashboard-template";
import { CommandCenterShell, CommandCenterBar } from "@/components/command-center/command-center-shell";
import { CommandCenterKpiStrip } from "@/components/command-center/command-center-kpi-strip";
import { CommandCenterHeatmap } from "@/components/command-center/command-center-heatmap";
import { CommandCenterSidebarCharts } from "@/components/command-center/command-center-sidebar-charts";

import { CommandCenterBullets } from "@/components/command-center/command-center-bullets";
import { CommandCenterTrends } from "@/components/command-center/command-center-trends";
import { CommandCenterFlow } from "@/components/command-center/command-center-flow";
import { CommandCenterRisks } from "@/components/command-center/command-center-risks";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { executiveDefaultQuickRangeId, granularityForRange, resolveExecutiveQuickRange } from "@/lib/executive-quick-ranges";

const VIEW_WAIT_MS = 5000;

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

class CommandCenterSectionBoundary extends React.Component<
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
          title="A Command Center section failed to render"
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export default function CommandCenterPage() {
  const { mergeTrpcQueryOpts, canAccess } = useRBAC();
  const [rangeId, setRangeId] = useState(executiveDefaultQuickRangeId);
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
    <CommandCenterBody
      range={range}
      rangeId={rangeId}
      setRangeId={setRangeId}
      mergeTrpcQueryOpts={mergeTrpcQueryOpts}
    />
  );
}

function CommandCenterBody({
  range,
  rangeId,
  setRangeId,
  mergeTrpcQueryOpts,
}: {
  range: { start: Date; end: Date; granularity: "day" | "week" | "month" };
  rangeId: string;
  setRangeId: (id: string) => void;
  mergeTrpcQueryOpts: ReturnType<typeof useRBAC>["mergeTrpcQueryOpts"];
}) {
  const [viewTimedOut, setViewTimedOut] = useState(false);

  const qView = trpc.commandCenter.getView.useQuery({ range }, mergeTrpcQueryOpts("commandCenter.getView"));

  useEffect(() => {
    if (qView.isSuccess || qView.isError) {
      setViewTimedOut(false);
      return;
    }
    if (!qView.isFetching) return;
    const id = window.setTimeout(() => setViewTimedOut(true), VIEW_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [qView.isSuccess, qView.isError, qView.isFetching]);



  const displayPayload = qView.data;

  const refreshAll = () => {
    setViewTimedOut(false);
    void qView.refetch();
  };

  if (qView.isError) {
    return (
      <CommandCenterShell>
        <CommandCenterBar rangeId={rangeId} onRangeId={setRangeId} onRefresh={refreshAll} isFetching={qView.isFetching} />
        <CommandCenterQueryError
          title="Couldn't load command center"
          message={qView.error?.message ?? "Unknown error"}
          onRetry={() => void qView.refetch()}
        />
      </CommandCenterShell>
    );
  }

  if (viewTimedOut && !qView.data) {
    return (
      <CommandCenterShell>
        <CommandCenterBar rangeId={rangeId} onRangeId={setRangeId} onRefresh={refreshAll} isFetching={qView.isFetching} />
        <CommandCenterQueryError
          title="Command Center is taking too long"
          message="The dashboard did not respond in time. Check your connection or try again."
          onRetry={refreshAll}
        />
      </CommandCenterShell>
    );
  }

  return (
    <CommandCenterShell>
      <CommandCenterBar rangeId={rangeId} onRangeId={setRangeId} onRefresh={refreshAll} isFetching={qView.isFetching} />

      {qView.isLoading || !displayPayload ? (
        <div className="space-y-2 animate-pulse p-2">
          <div className="h-20 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-200 rounded" />
          <div className="h-48 bg-slate-200 rounded" />
        </div>
      ) : (
        <CommandCenterSectionBoundary>
          <div className="flex flex-col gap-2">
            {/* Top Row: Score + Primary KPIs */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
               <div className="xl:col-span-12">
                 <CommandCenterKpiStrip payload={displayPayload} />
               </div>
            </div>

            {/* Middle Row: Heatmap + Sidebar Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 items-stretch">
              <div className="xl:col-span-8 min-w-0">
                <CommandCenterHeatmap payload={displayPayload} />
              </div>
              <div className="xl:col-span-4 min-w-0">
                <CommandCenterSidebarCharts payload={displayPayload} />
              </div>
            </div>

            {/* Bottom Row: Detailed Signals */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
              <CommandCenterBullets payload={displayPayload} />
              <CommandCenterFlow payload={displayPayload} />
              <CommandCenterRisks payload={displayPayload} />
              <CommandCenterTrends payload={displayPayload} />
            </div>
          </div>
        </CommandCenterSectionBoundary>
      )}


    </CommandCenterShell>
  );
}
