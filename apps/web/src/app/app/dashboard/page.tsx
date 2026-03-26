"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TicketIcon, AlertTriangle, CheckCircle2, Activity, Shield, RefreshCw, Loader2, ChevronRight,
  Wrench, GitBranch, Target, CheckCircle, XCircle,
  Layers, Scale,
  Monitor, ShieldCheck, Users, Handshake, Banknote, Code,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import type { Module } from "@nexusops/types";
import type { RbacAction } from "@nexusops/types";

const MODULE_GROUPS: Array<{
  id: string; label: string; icon: React.ElementType; href: string;
  modules: number; color: string;
  requiredModule: Module;
}> = [
  {
    id: "it_services",     label: "IT Services",          icon: Monitor,      href: "/app/it-services",
    modules: 5, color: "text-blue-700 bg-blue-50 border-blue-200",
    requiredModule: "incidents",
  },
  {
    id: "security",        label: "Security & Compliance", icon: ShieldCheck,  href: "/app/security-compliance",
    modules: 3, color: "text-red-700 bg-red-50 border-red-200",
    requiredModule: "security",
  },
  {
    id: "people",          label: "People & Workplace",    icon: Users,        href: "/app/people-workplace",
    modules: 3, color: "text-green-700 bg-green-50 border-green-200",
    requiredModule: "hr",
  },
  {
    id: "customer",        label: "Customer & Sales",      icon: Handshake,    href: "/app/customer-sales",
    modules: 4, color: "text-indigo-700 bg-indigo-50 border-indigo-200",
    requiredModule: "accounts",
  },
  {
    id: "finance",         label: "Finance & Procurement", icon: Banknote,     href: "/app/finance-procurement",
    modules: 2, color: "text-yellow-700 bg-yellow-50 border-yellow-200",
    requiredModule: "financial",
  },
  {
    id: "legal",           label: "Legal & Governance",    icon: Scale,        href: "/app/legal-governance",
    modules: 2, color: "text-purple-700 bg-purple-50 border-purple-200",
    requiredModule: "contracts",
  },
  {
    id: "strategy",        label: "Strategy & Projects",   icon: Target,       href: "/app/strategy-projects",
    modules: 3, color: "text-orange-700 bg-orange-50 border-orange-200",
    requiredModule: "reports",
  },
  {
    id: "devops",          label: "Developer & Ops",       icon: Code,         href: "/app/developer-ops",
    modules: 2, color: "text-cyan-700 bg-cyan-50 border-cyan-200",
    requiredModule: "knowledge",
  },
];


function KPICard({ label, value, delta, color, href, icon: Icon }: {
  label: string; value: string | number; delta?: number; color: string; href?: string; icon: React.ElementType;
}) {
  const content = (
    <div className={`bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
        {delta !== undefined && (
          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${delta <= 0 ? "text-green-600" : "text-red-600"}`}>
            {delta <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const { can, canAccess, isAuthenticated } = useRBAC();
  return (
    <>
      <Suspense fallback={null}><OidcSessionHandler /></Suspense>
      <DashboardContent can={can} canAccess={canAccess} isAuthenticated={isAuthenticated} />
    </>
  );
}

function OidcSessionHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const session = searchParams.get("session");
    if (session) {
      localStorage.setItem("nexusops_session", session);
      document.cookie = `nexusops_session=${session}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      router.replace("/app/dashboard");
    }
  }, [searchParams, router]);
  return null;
}

function DashboardContent({ can, canAccess, isAuthenticated }: { can: (m: Module, a: RbacAction) => boolean; canAccess: (m: Module) => boolean; isAuthenticated: boolean }) {
  const { data: metrics, isPending, isError, error, refetch } = trpc.dashboard.getMetrics.useQuery(undefined, {
    enabled: isAuthenticated && can("reports", "read"),
    retry: 1,
  });

  // Distinguish a real network/infra error from an auth error.
  // UNAUTHORIZED / FORBIDDEN just means the session expired — not that the API is down.
  const errorCode = (error as any)?.data?.code as string | undefined;
  const isApiDown = isError && errorCode !== "UNAUTHORIZED" && errorCode !== "FORBIDDEN" && errorCode !== "NOT_FOUND";

  const { data: incidentsPage } = trpc.tickets.list.useQuery(
    { type: "incident", limit: 5 },
    { enabled: isAuthenticated && canAccess("incidents") },
  );
  const incidents = incidentsPage?.items ?? [];

  const { data: pendingApprovals } = trpc.approvals.myPending.useQuery(
    undefined,
    { enabled: isAuthenticated && canAccess("approvals") },
  );
  const approvalList = pendingApprovals ?? [];

  const { data: workOrdersPage } = trpc.workOrders.list.useQuery(
    { limit: 4 },
    { enabled: isAuthenticated && canAccess("work_orders") },
  );
  const workOrderList = workOrdersPage?.items ?? [];

  const { data: deploymentsData } = trpc.devops.listDeployments.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated && canAccess("projects") },
  );
  const deploymentList = deploymentsData ?? [];

  const { data: changesPage } = trpc.changes.list.useQuery(
    { limit: 3 },
    { enabled: isAuthenticated && canAccess("changes") },
  );
  const changeList = changesPage?.items ?? [];

  const visibleModuleGroups = MODULE_GROUPS.filter((g) => canAccess(g.requiredModule));
  const canViewTickets = canAccess("incidents") || canAccess("requests");
  const canViewSecurity = canAccess("security");

  const failedDeploys = deploymentList.filter((d) => d.status === "failed").length;
  const slaBreachedIncidents = incidents.filter((i) => i.slaBreached).length;

  return (
    <div className="flex flex-col gap-3 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">NexusOps Platform Home</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Real-time operational health across all platform modules</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/70">
            {isPending ? "Syncing metrics…" : isApiDown ? "Demo values (API offline)" : "Last updated: Just now"}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isPending}
            className="p-1.5 hover:bg-muted rounded border border-border disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isApiDown && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Could not reach the NexusOps API ({process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}). Start the API
          (<code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">pnpm --filter @nexusops/api dev</code>) and
          ensure Postgres/Redis match your <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">.env</code>.
          KPIs below use demo fallbacks until the connection works.
        </div>
      )}

      {/* Platform Module Groups — only show groups the current user can access */}
      <div className="grid grid-cols-8 gap-2">
        {visibleModuleGroups.map((g) => {
          const Icon = g.icon;
          return (
            <Link key={g.id} href={g.href}
              className={`flex flex-col gap-1.5 p-2.5 rounded border hover:shadow-sm transition-all ${g.color}`}>
              <div className="flex items-center justify-between">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px] font-semibold leading-tight">{g.label}</div>
              <div className="text-[9px] opacity-50">{g.modules} modules →</div>
            </Link>
          );
        })}
      </div>

      {/* Top KPIs — shown per role */}
      <div className="grid grid-cols-8 gap-2">
        {canViewTickets && (
          <KPICard label="Open P1/P2" value={slaBreachedIncidents} delta={slaBreachedIncidents > 0 ? slaBreachedIncidents : undefined} color="text-red-700" href="/app/tickets?priority=P1" icon={AlertTriangle} />
        )}
        {canViewTickets && (
          <KPICard label="Total Open"     value={metrics?.openTickets ?? 0}   color="text-blue-700"   href="/app/tickets"     icon={TicketIcon} />
        )}
        {canViewTickets && (
          <KPICard label="Resolved Today" value={metrics?.resolvedToday ?? 0} color="text-green-700" href="/app/tickets"     icon={CheckCircle2} />
        )}
        {can("reports", "read") && (
          <KPICard label="SLA Compliance" value={`${metrics?.slaCompliancePct ?? 0}%`} color="text-green-700" href="/app/reports?tab=sla" icon={Shield} />
        )}
        {canViewTickets && (
          <KPICard label="Active Events"  value={incidents.length} color="text-orange-700" href="/app/events" icon={Activity} />
        )}
        {canViewTickets && (
          <KPICard label="Open Work Orders" value={workOrderList.length} color="text-foreground/80" href="/app/work-orders" icon={Wrench} />
        )}
        {can("approvals", "read") && (
          <KPICard label="Pending Approvals" value={metrics?.pendingApprovals ?? approvalList.length} color="text-blue-700" href="/app/approvals" icon={CheckCircle2} />
        )}
        {canViewSecurity && (
          <KPICard label="Failed Deploys" value={failedDeploys} color="text-red-700" href="/app/developer-ops" icon={Target} />
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-3 gap-3 flex-1 items-start">
        {/* Left: Active incidents */}
        <div className="col-span-2 flex flex-col gap-3">
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Active Incidents</span>
                <span className="text-[10px] text-muted-foreground/70">{incidents.length} open</span>
              </div>
              <Link href="/app/tickets" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                All incidents <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Number</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>State</th>
                  <th>Assignee</th>
                  <th>Created</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[12px] text-muted-foreground">
                      No active incidents
                    </td>
                  </tr>
                ) : incidents.map((inc) => (
                  <tr key={inc.id} className={inc.slaBreached ? "bg-red-50/40" : ""}>
                    <td className="p-0">
                      <div className={`priority-bar bg-red-500`} />
                    </td>
                    <td>
                      <Link href={`/app/tickets/${inc.id}`} className="font-mono text-[11px] text-primary hover:underline">{inc.number}</Link>
                    </td>
                    <td className="max-w-xs"><span className="truncate block text-foreground">{inc.title}</span></td>
                    <td><span className="status-badge text-muted-foreground bg-muted capitalize">{inc.priorityId ?? "—"}</span></td>
                    <td><span className="status-badge text-blue-700 bg-blue-100 capitalize">{(inc.statusId ?? "open").replace(/_/g, " ")}</span></td>
                    <td className="text-muted-foreground text-[11px]">{inc.assigneeId ? inc.assigneeId.slice(0, 8) : "Unassigned"}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {inc.createdAt ? new Date(inc.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </td>
                    <td>
                      {inc.slaBreached ? (
                        <span className="status-badge text-red-700 bg-red-100 font-semibold">⚠ Breached</span>
                      ) : (
                        <span className="status-badge text-green-700 bg-green-100">On Track</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Work Orders snapshot */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Active Work Orders</span>
              </div>
              <Link href="/app/work-orders" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                All WOs <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {workOrderList.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-muted-foreground">No open work orders</div>
              ) : workOrderList.map((wo) => (
                <div key={wo.id} className={`flex items-center justify-between px-3 py-2.5 ${wo.slaBreached ? "bg-red-50/30" : ""}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[11px] text-primary">{wo.number}</span>
                      <span className={`status-badge capitalize ${wo.priority === "critical" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>{wo.priority}</span>
                      <span className="status-badge text-blue-700 bg-blue-100 capitalize">{wo.state.replace(/_/g," ")}</span>
                      {wo.slaBreached && <span className="status-badge text-red-700 bg-red-100">⚠ SLA</span>}
                    </div>
                    <p className="text-[12px] text-foreground/80">{wo.shortDescription}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70">{wo.assignedToId ? wo.assignedToId.slice(0, 8) : "Unassigned"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deployments + Change window */}
          <div className="grid grid-cols-2 gap-3">
            {/* Recent Deployments */}
            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Deployments</span>
                </div>
                <Link href="/app/developer-ops" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                  DevOps <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {deploymentList.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-muted-foreground">No deployments yet</div>
              ) : (
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>App</th>
                      <th>Env</th>
                      <th>Ver</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deploymentList.map((dep) => (
                      <tr key={dep.id}>
                        <td className="font-medium text-foreground max-w-[100px]">
                          <span className="truncate block">{dep.appName}</span>
                        </td>
                        <td>
                          <span className={`status-badge text-[10px] ${
                            dep.environment === "production" ? "text-red-700 bg-red-50" :
                            dep.environment === "staging"    ? "text-yellow-700 bg-yellow-50" :
                            "text-blue-700 bg-blue-50"
                          }`}>{dep.environment}</span>
                        </td>
                        <td className="font-mono text-[11px] text-muted-foreground">{dep.version}</td>
                        <td>
                          {dep.status === "success" && <span className="flex items-center gap-1 text-green-700 text-[11px]"><CheckCircle className="w-3 h-3" /> OK</span>}
                          {dep.status === "failed"  && <span className="flex items-center gap-1 text-red-600 text-[11px]"><XCircle className="w-3 h-3" /> Failed</span>}
                          {dep.status === "running" && <span className="flex items-center gap-1 text-blue-600 text-[11px]"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>}
                          {dep.status !== "success" && dep.status !== "failed" && dep.status !== "running" && (
                            <span className="text-muted-foreground text-[11px] capitalize">{dep.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* CAB / Change snapshot */}
            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Change Window</span>
                </div>
                <Link href="/app/changes" className="text-[11px] text-primary hover:underline">All changes</Link>
              </div>
              <div className="divide-y divide-border">
                {changeList.length === 0 ? (
                  <div className="py-8 text-center text-[12px] text-muted-foreground">No changes scheduled</div>
                ) : changeList.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] text-primary">{c.number}</span>
                        <span className={`status-badge text-[10px] ${c.risk === "critical" ? "text-red-700 bg-red-100" : c.risk === "high" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{c.risk ?? "—"}</span>
                      </div>
                      <p className="text-[11px] text-foreground/80 truncate max-w-[180px]">{c.title}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] text-muted-foreground/70">
                        {c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </div>
                      <span className={`status-badge text-[10px] capitalize ${
                        c.status === "complete" || c.status === "completed" ? "text-green-700 bg-green-100" :
                        c.status === "awaiting_cab" ? "text-yellow-700 bg-yellow-100" :
                        "text-blue-700 bg-blue-100"
                      }`}>
                        {(c.status ?? "—").replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          {/* Pending approvals */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Pending Approvals</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">{approvalList.length}</span>
              </div>
              <Link href="/app/approvals" className="text-[11px] text-primary hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {approvalList.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground">No pending approvals</div>
              ) : approvalList.slice(0, 4).map((ap) => (
                <div key={ap.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-[10px] text-primary">{ap.id.slice(0, 8)}</span>
                    <span className="status-badge text-muted-foreground bg-muted capitalize">{ap.entityType ?? "Request"}</span>
                    <span className="text-[10px] text-muted-foreground/70 ml-auto">
                      {ap.dueAt ? new Date(ap.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/80 truncate">{ap.title ?? ap.entityId}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[11px] hover:bg-green-200">Approve</button>
                    <button className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[11px] hover:bg-red-200">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Module Areas */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Module Areas</span>
            </div>
            <div className="divide-y divide-border">
              {MODULE_GROUPS.map((g) => {
                const Icon = g.icon;
                return (
                  <Link key={g.id} href={g.href}
                    className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="text-[12px] font-medium text-foreground/80">{g.label}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
