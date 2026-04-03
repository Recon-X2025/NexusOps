"use client";

import Link from "next/link";
import {
  Code, GitBranch, BookOpen, CheckCircle, XCircle, Loader2,
  ChevronRight, Zap, Clock,
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
    label: "DevOps",              href: "/app/devops",     icon: GitBranch, color: "text-cyan-600 bg-cyan-50",
    description: "CI/CD pipelines, release management, environment tracking, change automation.",
  },
  {
    label: "Knowledge Management",href: "/app/knowledge",  icon: BookOpen,  color: "text-purple-600 bg-purple-50",
    description: "Knowledge base, article lifecycle, AI-assisted search, deflection analytics.",
  },
];

export default function DeveloperOpsDashboard() {
  const { can } = useRBAC();

  const { data: deployments, isLoading: loadingDeploys } = trpc.devops.listDeployments.useQuery({ limit: 6 });
  const { data: pipelines, isLoading: loadingPipelines } = trpc.devops.listPipelines.useQuery({ limit: 5 });
  const { data: doraMetrics, isLoading: loadingDora } = trpc.devops.doraMetrics.useQuery();
  const { data: kbArticles, isLoading: loadingKB } = trpc.knowledge.list.useQuery({ limit: 200 });

  if (!can("knowledge", "read")) {
    return <AccessDenied module="Developer & Ops" />;
  }

  const totalDeploymentsToday = deployments
    ? deployments.filter((d) => {
        const today = new Date();
        const deployDate = new Date(d.startedAt);
        return deployDate.toDateString() === today.toDateString();
      }).length
    : 0;

  const failedDeployments = deployments
    ? deployments.filter((d) => d.status === "failed").length
    : 0;

  const activeKBArticles = kbArticles ? kbArticles.filter((a) => a.status === "published").length : 0;

  const successRate = doraMetrics
    ? `${(100 - parseFloat(doraMetrics.changeFailureRate)).toFixed(1)}%`
    : "—";

  const alerts = [
    failedDeployments > 0
      ? { color: "bg-red-500", text: `${failedDeployments} deployment${failedDeployments !== 1 ? "s" : ""} failed recently` }
      : null,
    doraMetrics && parseFloat(doraMetrics.changeFailureRate) > 15
      ? { color: "bg-yellow-400", text: `Change failure rate at ${doraMetrics.changeFailureRate} — above 15% threshold` }
      : null,
    activeKBArticles > 0
      ? { color: "bg-blue-500", text: `${activeKBArticles} active knowledge article${activeKBArticles !== 1 ? "s" : ""} in the knowledge base` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Deploys (30d)", v: loadingDora ? "…" : String(doraMetrics?.totalDeploys30d ?? 0) },
      { k: "Success",       v: loadingDora ? "…" : successRate },
    ],
    [
      { k: "Articles",    v: loadingKB ? "…" : String(kbArticles?.length ?? 0) },
      { k: "Published",   v: loadingKB ? "…" : String(activeKBArticles) },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Code className="w-4 h-4 text-cyan-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Developer & Ops</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Developer & Ops Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">2 modules · live data</span>
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

      <div className="grid grid-cols-4 gap-2">
        <KPICard label="Pipeline Success Rate" value={successRate} color="text-green-700" icon={CheckCircle} href="/app/devops" isLoading={loadingDora} />
        <KPICard label="Deployments Today" value={totalDeploymentsToday} color="text-blue-700" icon={Zap} href="/app/devops" isLoading={loadingDeploys} />
        <KPICard label="KB Articles (Active)" value={activeKBArticles} color="text-purple-700" icon={BookOpen} href="/app/knowledge" isLoading={loadingKB} />
        <KPICard label="Failed Deployments" value={failedDeployments} color="text-red-700" icon={XCircle} href="/app/devops" isLoading={loadingDeploys} />
      </div>

      <div className="grid grid-cols-2 gap-2">
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
        {/* Recent Deployments */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Deployments</span>
            </div>
            <Link href="/app/devops" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              DevOps <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingDeploys ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>App</th><th>Env</th><th>Ver</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {(deployments ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-4 text-[12px]">No deployments found</td></tr>
                ) : (deployments ?? []).map((d) => (
                  <tr key={d.id}>
                    <td className="max-w-[110px]"><span className="truncate block font-medium text-foreground">{d.appName}</span></td>
                    <td>
                      <span className={`status-badge text-[10px] ${d.environment === "production" ? "text-red-700 bg-red-50" : d.environment === "staging" ? "text-yellow-700 bg-yellow-50" : "text-blue-700 bg-blue-50"}`}>
                        {d.environment}
                      </span>
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">{d.version}</td>
                    <td>
                      {d.status === "success"     && <span className="flex items-center gap-1 text-green-700 text-[11px]"><CheckCircle className="w-3 h-3" /> OK</span>}
                      {d.status === "failed"      && <span className="flex items-center gap-1 text-red-600 text-[11px]"><XCircle className="w-3 h-3" /> Failed</span>}
                      {d.status === "in_progress" && <span className="flex items-center gap-1 text-blue-600 text-[11px]"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>}
                      {d.status === "rolled_back" && <span className="flex items-center gap-1 text-orange-600 text-[11px]"><XCircle className="w-3 h-3" /> Rolled back</span>}
                      {!["success","failed","in_progress","rolled_back"].includes(d.status) && (
                        <span className="status-badge text-muted-foreground bg-muted capitalize">{d.status}</span>
                      )}
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {new Date(d.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pipeline Runs */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Pipeline Runs</span>
            </div>
            <Link href="/app/devops" className="text-[11px] text-primary hover:underline">All →</Link>
          </div>
          {loadingPipelines ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>Pipeline</th><th>Branch</th><th>Status</th><th>Duration</th><th>Started</th></tr></thead>
              <tbody>
                {(pipelines ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-4 text-[12px]">No pipeline runs found</td></tr>
                ) : (pipelines ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11px] text-foreground max-w-[110px]"><span className="truncate block">{p.pipelineName}</span></td>
                    <td className="font-mono text-[10px] text-muted-foreground">{p.branch ?? "—"}</td>
                    <td>
                      {p.status === "success"   && <span className="flex items-center gap-1 text-green-700 text-[11px]"><CheckCircle className="w-3 h-3" /> OK</span>}
                      {p.status === "failed"    && <span className="flex items-center gap-1 text-red-600 text-[11px]"><XCircle className="w-3 h-3" /> Failed</span>}
                      {p.status === "running"   && <span className="flex items-center gap-1 text-blue-600 text-[11px]"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>}
                      {p.status === "cancelled" && <span className="status-badge text-muted-foreground bg-muted">Cancelled</span>}
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {p.durationSeconds ? `${Math.floor(p.durationSeconds / 60)}m ${p.durationSeconds % 60}s` : "—"}
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(p.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
