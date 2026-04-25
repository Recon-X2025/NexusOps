"use client";

import Link from "next/link";
import {
  Handshake, MessageSquare, Users2, ShoppingBag, Star,
  ChevronRight, TrendingUp, BarChart2, ClipboardList, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

function KPICard({ label, value, color, href, icon: Icon, isLoading }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean;
}) {
  const content = (
    <div className="bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    label: "Customer Service (CSM)", href: "/app/csm",     icon: MessageSquare, color: "text-blue-600 bg-blue-50",
    description: "Customer case management, SLA tracking, escalation, account service history.",
  },
  {
    label: "CRM & Sales",            href: "/app/crm",     icon: Users2,        color: "text-indigo-600 bg-indigo-50",
    description: "Lead management, deal pipeline, account relationships, revenue forecasting.",
  },
  {
    label: "Service Catalog",        href: "/app/catalog", icon: ShoppingBag,   color: "text-orange-600 bg-orange-50",
    description: "IT and business service requests, workflows, SLA-driven fulfillment.",
  },
  {
    label: "Surveys & Feedback",     href: "/app/surveys", icon: ClipboardList,  color: "text-green-600 bg-green-50",
    description: "Customer and employee satisfaction surveys, NPS tracking, feedback analysis.",
  },
];

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  prospect:      "bg-slate-400",
  qualified:     "bg-blue-500",
  proposal:      "bg-indigo-500",
  negotiation:   "bg-purple-500",
  closed_won:    "bg-green-500",
  closed_lost:   "bg-red-400",
};

export default function CustomerSalesDashboard() {
  const { can, isAuthenticated, mergeTrpcQueryOpts } = useRBAC();

  const canAccounts = isAuthenticated && can("accounts", "read");
  const canCsm = isAuthenticated && can("csm", "read");
  const canCatalog = isAuthenticated && can("catalog", "read");
  const canSurveys = isAuthenticated && can("surveys", "read");

  const { data: csmDash, isLoading: loadingCsm } = trpc.csm.dashboard.useQuery(
    undefined,
    mergeTrpcQueryOpts("csm.dashboard", { enabled: canCsm }),
  );
  const { data: crmMetrics, isLoading: loadingCrm } = trpc.crm.dashboardMetrics.useQuery(undefined, mergeTrpcQueryOpts("crm.dashboardMetrics", {
    enabled: canAccounts,
  }));
  const { data: deals, isLoading: loadingDeals } = trpc.crm.listDeals.useQuery({ limit: 100 }, mergeTrpcQueryOpts("crm.listDeals", { enabled: canAccounts },));
  const { data: catalogRequests, isLoading: loadingCatalog } = trpc.catalog.listRequests.useQuery({}, mergeTrpcQueryOpts("catalog.listRequests", { enabled: canCatalog },));
  const { data: surveys, isLoading: loadingSurveys } = trpc.surveys.list.useQuery({}, mergeTrpcQueryOpts("surveys.list", { enabled: canSurveys }));

  if (!can("csm", "read") && !can("accounts", "read") && !can("catalog", "read")) {
    return <AccessDenied module="Customer & Sales" />;
  }

  const terminalCatalogStatuses = new Set(["completed", "rejected", "cancelled"]);
  const openCatalogRequests = catalogRequests
    ? catalogRequests.filter((r: any) => !terminalCatalogStatuses.has(String(r.status ?? ""))).length
    : 0;
  const activeSurveys = surveys ? surveys.filter((s: any) => s.status === "active" || s.status === "published").length : 0;

  // Build pipeline summary from deals
  const pipelineByStage = deals
    ? deals.reduce((acc: Record<string, { count: number; value: number }>, d: any) => {
        const stage = d.stage ?? "prospect";
        if (!acc[stage]) acc[stage] = { count: 0, value: 0 };
        acc[stage]!.count++;
        acc[stage]!.value += parseFloat(String(d.value ?? "0"));
        return acc;
      }, {})
    : {} as Record<string, { count: number; value: number }>;

  const pipelineRows = (Object.entries(pipelineByStage) as [string, { count: number; value: number }][])
    .filter(([stage]) => stage !== "closed_lost")
    .map(([stage, data]) => ({
      stage: stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      count: data.count,
      value: data.value,
      color: PIPELINE_STAGE_COLORS[stage] ?? "bg-slate-400",
    }))
    .sort((a, b) => a.stage.localeCompare(b.stage));

  const totalPipelineValue = pipelineRows.reduce((a, b) => a + b.value, 0);

  const alerts = [
    (csmDash?.openCases ?? 0) > 0
      ? { color: "bg-indigo-500", text: `${csmDash?.openCases} open customer case${csmDash?.openCases !== 1 ? "s" : ""}` }
      : null,
    deals && deals.filter((d: any) => d.stage !== "closed_won" && d.stage !== "closed_lost").length > 0
      ? { color: "bg-blue-500", text: `${crmMetrics?.openPipeline.count ?? 0} open deals in the sales pipeline` }
      : null,
    openCatalogRequests > 0
      ? { color: "bg-orange-500", text: `${openCatalogRequests} catalog request${openCatalogRequests !== 1 ? "s" : ""} open and awaiting fulfillment` }
      : null,
    activeSurveys > 0
      ? { color: "bg-green-500", text: `${activeSurveys} active survey${activeSurveys !== 1 ? "s" : ""} collecting responses` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Open cases", v: !canCsm ? "—" : loadingCsm ? "…" : String(csmDash?.openCases ?? 0) },
      { k: "Total", v: !canCsm ? "—" : loadingCsm ? "…" : String(csmDash?.totalCases ?? 0) },
    ],
    [
      { k: "Deals",    v: loadingCrm ? "…" : String(crmMetrics?.openPipeline.count ?? 0) },
      { k: "Leads",    v: loadingCrm ? "…" : String(crmMetrics?.newLeads ?? 0) },
    ],
    [
      { k: "Open",    v: loadingCatalog ? "…" : String(openCatalogRequests) },
      { k: "Total",   v: loadingCatalog ? "…" : String(catalogRequests?.length ?? 0) },
    ],
    [
      { k: "Active",    v: loadingSurveys ? "…" : String(activeSurveys) },
      { k: "Total",     v: loadingSurveys ? "…" : String(surveys?.length ?? 0) },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Handshake className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Customer & Sales</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Customer & Sales Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">4 modules · live data</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded text-[11px] text-foreground/80">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.color}`} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        <KPICard label="Open Customer Cases" value={canCsm ? (csmDash?.openCases ?? 0) : "—"} color="text-blue-700" icon={MessageSquare} href="/app/csm" isLoading={canCsm && loadingCsm} />
        <KPICard label="Open Deals / Pipeline" value={crmMetrics?.openPipeline.count ?? 0} color="text-indigo-700" icon={TrendingUp} href="/app/crm" isLoading={loadingCrm} />
        <KPICard label="Won Deals" value={crmMetrics?.closedWon.count ?? 0} color="text-green-700" icon={Star} href="/app/crm" isLoading={loadingCrm} />
        <KPICard label="Catalog Requests Open" value={openCatalogRequests} color="text-orange-700" icon={ShoppingBag} href="/app/catalog" isLoading={loadingCatalog} />
        <KPICard label="Active Surveys" value={activeSurveys} color="text-blue-700" icon={ClipboardList} href="/app/surveys" isLoading={loadingSurveys} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MODULES.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Link key={m.label} href={m.href}
              className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all group flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
              </div>
              <div className="flex gap-3 mt-auto pt-1 border-t border-border">
                {moduleStats[idx]?.map((s) => (
                  <div key={s.k} className="text-center">
                    <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Recent Deals */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Deals</span>
            </div>
            <Link href="/app/crm" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingDeals ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>Title</th><th>Stage</th><th>Value</th></tr></thead>
              <tbody>
                {(deals ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-muted-foreground py-4 text-[12px]">No deals found</td></tr>
                ) : (deals ?? []).slice(0, 5).map((d: any) => (
                  <tr key={d.id}>
                    <td className="max-w-[180px]"><span className="truncate block text-foreground">{d.title}</span></td>
                    <td>
                      <span className="status-badge capitalize text-muted-foreground bg-muted">{d.stage?.replace(/_/g, " ")}</span>
                    </td>
                    <td className="font-mono text-[11px] font-semibold text-foreground">{d.value ? `₹${parseFloat(String(d.value)).toLocaleString("en-IN")}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pipeline funnel */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Sales Pipeline</span>
            </div>
            <Link href="/app/crm" className="text-[11px] text-primary hover:underline">CRM →</Link>
          </div>
          {loadingDeals ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pipelineRows.length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-[12px]">No pipeline data</div>
              ) : pipelineRows.map((p) => (
                <div key={p.stage} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${p.color}`} />
                    <span className="text-[12px] text-foreground/80">{p.stage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[11px] text-muted-foreground">{p.count} deal{p.count !== 1 ? "s" : ""}</span>
                    <span className="text-[12px] font-semibold text-foreground w-20 text-right">
                      {p.value > 0 ? `₹${p.value.toLocaleString("en-IN")}` : "—"}
                    </span>
                  </div>
                </div>
              ))}
              {pipelineRows.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="text-[11px] font-bold text-foreground">Total Pipeline</span>
                  <span className="text-[13px] font-bold text-indigo-700">₹{totalPipelineValue.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
