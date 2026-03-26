"use client";

import { useState, useEffect } from "react";
import {
  GitBranch, GitMerge, Play, CheckCircle2, XCircle, Clock, AlertTriangle,
  Plus, Download, RefreshCw, Zap, Package, Shield, BarChart2,
  Code, Server, Activity, ChevronRight, Eye, Terminal,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

const DEVOPS_TABS = [
  { key: "dashboard",   label: "Dashboard",       module: "changes"  as const, action: "read"  as const },
  { key: "pipelines",   label: "CI/CD Pipelines", module: "changes"  as const, action: "read"  as const },
  { key: "deployments", label: "Deployments",     module: "changes"  as const, action: "read"  as const },
  { key: "changes",     label: "Change Velocity", module: "changes"  as const, action: "read"  as const },
  { key: "agile",       label: "Agile Board",     module: "projects" as const, action: "read"  as const },
  { key: "tools",       label: "Tool Integrations",module: "changes" as const, action: "admin" as const },
];

type PipelineStatus = "running" | "passed" | "failed" | "cancelled" | "queued";
type DeployEnv = "dev" | "qa" | "staging" | "prod";

interface Pipeline {
  id: string;
  number: string;
  name: string;
  repo: string;
  branch: string;
  triggeredBy: string;
  tool: "github_actions" | "jenkins" | "gitlab_ci" | "azure_devops";
  status: PipelineStatus;
  started: string;
  duration: string;
  commit: string;
  commitMsg: string;
  stages: PipelineStage[];
  change?: string;
  environment?: DeployEnv;
}

interface PipelineStage {
  name: string;
  status: "passed" | "failed" | "running" | "skipped" | "pending";
  duration: string;
}

interface Deployment {
  id: string;
  number: string;
  service: string;
  version: string;
  environment: DeployEnv;
  status: "pending" | "in_progress" | "successful" | "failed" | "rolled_back";
  deployedBy: string;
  startTime: string;
  endTime?: string;
  pipeline: string;
  change?: string;
  rollbackAvailable: boolean;
  notes?: string;
}

interface SprintItem {
  id: string;
  number: string;
  type: "story" | "bug" | "task" | "epic";
  title: string;
  assignee: string;
  sprint: string;
  storyPoints: number;
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  priority: "critical" | "high" | "medium" | "low";
  linkedChange?: string;
}

const TOOL_ICON: Record<string, string> = { github_actions: "⚙", jenkins: "🤖", gitlab_ci: "🦊", azure_devops: "☁" };

const PIPELINE_STATUS_CFG: Record<PipelineStatus, { color: string; bar: string; icon: string }> = {
  running:   { color: "text-blue-700 bg-blue-100",    bar: "bg-blue-500",   icon: "●" },
  passed:    { color: "text-green-700 bg-green-100",  bar: "bg-green-500",  icon: "✓" },
  failed:    { color: "text-red-700 bg-red-100",      bar: "bg-red-600",    icon: "✕" },
  cancelled: { color: "text-muted-foreground/70 bg-muted/30",   bar: "bg-border",  icon: "–" },
  queued:    { color: "text-yellow-700 bg-yellow-100",bar: "bg-yellow-400", icon: "◌" },
};

const DEPLOY_STATUS_CFG: Record<string, { color: string; bar: string }> = {
  pending:    { color: "text-muted-foreground bg-muted",   bar: "bg-border" },
  in_progress:{ color: "text-blue-700 bg-blue-100",     bar: "bg-blue-500" },
  successful: { color: "text-green-700 bg-green-100",   bar: "bg-green-500" },
  failed:     { color: "text-red-700 bg-red-100",       bar: "bg-red-600" },
  rolled_back:{ color: "text-orange-700 bg-orange-100", bar: "bg-orange-400" },
};

const ENV_CFG: Record<DeployEnv, string> = {
  dev:     "text-muted-foreground bg-muted",
  qa:      "text-blue-600 bg-blue-100",
  staging: "text-purple-700 bg-purple-100",
  prod:    "text-red-700 bg-red-100",
};

const KANBAN_COLS = ["backlog","todo","in_progress","in_review","done"] as const;
const ITEM_TYPE_CFG: Record<string, string> = {
  story: "text-blue-700 bg-blue-100",
  bug:   "text-red-700 bg-red-100",
  task:  "text-muted-foreground bg-muted",
  epic:  "text-purple-700 bg-purple-100",
};

export default function DevOpsPage() {
  const { can } = useRBAC();
  const visibleTabs = DEVOPS_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  const { data: pipelinesData } = trpc.devops.listPipelines.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );
  const { data: deploymentsData } = trpc.devops.listDeployments.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );
  const { data: doraData } = trpc.devops.doraMetrics.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  if (!can("changes", "read") && !can("projects", "read")) return <AccessDenied module="DevOps" />;

  const pipelines = (pipelinesData ?? []) as any[];
  const deployments = (deploymentsData ?? []) as any[];

  const runningPipelines = pipelines.filter((p: any) => p.status === "running").length;
  const failedToday = pipelines.filter((p: any) => p.status === "failed").length;
  const prodDeployments = deployments.filter((d: any) => (d.environment === "prod" || d.environment === "production") && (d.status === "successful" || d.status === "success")).length;
  const sprintVelocity = 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">DevOps</h1>
          <span className="text-[11px] text-muted-foreground/70">CI/CD Pipelines · Deployments · Change Velocity · Agile</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Download className="w-3 h-3" /> Export
          </button>
          <PermissionGate module="changes" action="write">
            <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> Trigger Pipeline
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Running Pipelines",    value: runningPipelines,      color: "text-blue-700" },
          { label: "Failed Today",         value: failedToday,           color: failedToday > 0 ? "text-red-700" : "text-green-700" },
          { label: "Prod Deploys (MTD)",   value: prodDeployments,       color: "text-green-700" },
          { label: "Sprint Velocity",      value: `${sprintVelocity} pts`, color: "text-purple-700" },
          { label: "DORA: Deploy Freq.",   value: (doraData as any)?.deploymentFrequency ?? "2.4/day", color: "text-indigo-700" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
            {t.key === "pipelines" && runningPipelines > 0 && (
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{runningPipelines} running</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">DORA Metrics</div>
              <div className="p-3 space-y-2">
                {[
                  { metric: "Deployment Frequency",    value: (doraData as any)?.deploymentFrequency ?? "2.4 / day",   benchmark: "Elite",  color: "text-green-700" },
                  { metric: "Lead Time for Changes",   value: (doraData as any)?.leadTimeForChanges ?? "3.2 hours",   benchmark: "Elite",  color: "text-green-700" },
                  { metric: "Change Failure Rate",     value: (doraData as any)?.changeFailureRate ?? "4.1%",        benchmark: "High",   color: "text-blue-700" },
                  { metric: "MTTR (Mean Time to Recovery)", value: (doraData as any)?.mttr ?? "42 min", benchmark: "Elite",  color: "text-green-700" },
                ].map(d => (
                  <div key={d.metric} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">{d.metric}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${d.color}`}>{d.value}</span>
                      <span className={`status-badge text-[10px] ${d.benchmark === "Elite" ? "text-green-700 bg-green-100" : "text-blue-700 bg-blue-100"}`}>{d.benchmark}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Recent Pipeline Runs</div>
              <div className="divide-y divide-border">
                {pipelines.slice(0,4).map((p: any) => {
                  const cfg = PIPELINE_STATUS_CFG[p.status as PipelineStatus] ?? PIPELINE_STATUS_CFG.queued;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={`status-badge ${cfg.color}`}>{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-foreground/80 truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">{p.commitMsg}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">{p.duration}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden col-span-2">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Recent Deployments</div>
              <table className="ent-table w-full">
                <thead><tr><th className="w-4" /><th>Service</th><th>Version</th><th>Environment</th><th>Deployed By</th><th>Time</th><th>Change</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {deployments.slice(0,4).map((d: any) => {
                    const cfg = (DEPLOY_STATUS_CFG[d.status as string] ?? DEPLOY_STATUS_CFG.pending)!;
                    return (
                      <tr key={d.id}>
                        <td className="p-0"><div className={`priority-bar ${cfg.bar}`} /></td>
                        <td className="font-semibold text-foreground">{d.service}</td>
                        <td className="font-mono text-[11px] text-primary">{d.version}</td>
                        <td><span className={`status-badge uppercase text-[10px] ${(ENV_CFG as any)[d.environment] ?? ""}`}>{d.environment}</span></td>
                        <td className="text-muted-foreground">{d.deployedBy}</td>
                        <td className="text-[11px] text-muted-foreground/70">{d.startTime}</td>
                        <td className="font-mono text-[11px] text-primary">{d.change ?? "—"}</td>
                        <td><span className={`status-badge capitalize ${cfg.color}`}>{String(d.status ?? "").replace("_"," ")}</span></td>
                        <td>
                          {d.rollbackAvailable && d.status === "successful" && (
                            <PermissionGate module="changes" action="write">
                              <button className="text-[11px] text-orange-600 hover:underline">Rollback</button>
                            </PermissionGate>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PIPELINES */}
        {tab === "pipelines" && (
          <div>
            {pipelines.map((p: any) => {
              const cfg = PIPELINE_STATUS_CFG[p.status as PipelineStatus] ?? PIPELINE_STATUS_CFG.queued;
              const isExpanded = expandedPipeline === p.id;
              return (
                <div key={p.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedPipeline(isExpanded ? null : p.id)}>
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${cfg.bar}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-primary">{p.number}</span>
                        <span className={`status-badge ${cfg.color}`}>{cfg.icon} {p.status}</span>
                        <span className="status-badge text-muted-foreground bg-muted text-[10px]">{TOOL_ICON[p.tool]} {p.tool.replace("_"," ")}</span>
                        {p.change && <span className="font-mono text-[11px] text-primary">{p.change}</span>}
                        {p.environment && <span className={`status-badge uppercase text-[10px] ${(ENV_CFG as any)[p.environment] ?? ""}`}>{p.environment}</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono text-primary">{p.commit}</span> — {p.commitMsg}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Triggered by: {p.triggeredBy} · Branch: <span className="font-mono text-muted-foreground">{p.branch}</span></p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-[12px] font-semibold text-foreground/80">{p.duration}</div>
                      <div className="text-[11px] text-muted-foreground/70">{p.started}</div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/30/50 border-t border-dashed border-slate-200">
                      <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-2">
                        {(p.stages ?? []).map((s: any, i: number) => (
                          <div key={s.name} className="flex items-center gap-1.5 flex-shrink-0">
                            <div className={`px-3 py-2 rounded border text-[11px] text-center min-w-28
                              ${s.status === "passed" ? "border-green-300 bg-green-50" : s.status === "failed" ? "border-red-300 bg-red-50" : s.status === "running" ? "border-blue-300 bg-blue-50 animate-pulse" : s.status === "skipped" ? "border-slate-200 bg-muted/30 opacity-50" : "border-slate-200 bg-card"}`}>
                              <div className={`text-[10px] font-bold mb-0.5 ${s.status === "passed" ? "text-green-700" : s.status === "failed" ? "text-red-700" : s.status === "running" ? "text-blue-700" : "text-muted-foreground/70"}`}>
                                {s.status === "passed" ? "✓" : s.status === "failed" ? "✕" : s.status === "running" ? "●" : s.status === "skipped" ? "–" : "◌"} {s.status.toUpperCase()}
                              </div>
                              <div className="text-[10px] text-muted-foreground">{s.name}</div>
                              <div className="text-[10px] text-muted-foreground/70">{s.duration}</div>
                            </div>
                            {i < p.stages.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button className="flex items-center gap-1 px-3 py-1 border border-border text-[11px] rounded hover:bg-card text-muted-foreground">
                          <Terminal className="w-3 h-3" /> View Logs
                        </button>
                        {p.status === "failed" && (
                          <PermissionGate module="changes" action="write">
                            <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                              <RefreshCw className="w-3 h-3" /> Re-run
                            </button>
                          </PermissionGate>
                        )}
                        {p.change && <span className="text-[11px] text-muted-foreground/70 flex items-center">Linked Change: <span className="font-mono text-primary ml-1">{p.change}</span></span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* DEPLOYMENTS */}
        {tab === "deployments" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Deployment #</th>
                <th>Service</th>
                <th>Version</th>
                <th>Environment</th>
                <th>Deployed By</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Pipeline</th>
                <th>Change</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d: any) => {
                const cfg = (DEPLOY_STATUS_CFG[d.status as string] ?? DEPLOY_STATUS_CFG.pending)!;
                return (
                  <tr key={d.id} className={d.status === "failed" ? "bg-red-50/20" : ""}>
                    <td className="p-0"><div className={`priority-bar ${cfg.bar}`} /></td>
                    <td className="font-mono text-[11px] text-primary">{d.number}</td>
                    <td className="font-semibold text-foreground">{d.service}</td>
                    <td className="font-mono text-[11px] text-foreground/80">{d.version}</td>
                    <td><span className={`status-badge uppercase text-[10px] font-bold ${(ENV_CFG as any)[d.environment] ?? ""}`}>{d.environment}</span></td>
                    <td className="text-muted-foreground text-[11px]">{d.deployedBy}</td>
                    <td className="text-[11px] font-mono text-muted-foreground">{d.startTime}</td>
                    <td className="text-[11px] font-mono text-muted-foreground/70">{d.endTime ?? "—"}</td>
                    <td className="font-mono text-[11px] text-primary">{d.pipeline}</td>
                    <td className="font-mono text-[11px] text-primary">{d.change ?? "—"}</td>
                    <td><span className={`status-badge capitalize ${cfg.color}`}>{String(d.status ?? "").replace("_"," ")}</span></td>
                    <td>
                      {d.rollbackAvailable && d.status === "successful" && (
                        <PermissionGate module="changes" action="write">
                          <button className="text-[11px] text-orange-600 hover:underline font-semibold">Rollback</button>
                        </PermissionGate>
                      )}
                      {d.notes && <span className="text-[10px] text-muted-foreground/70 ml-1" title={d.notes}>ⓘ</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* CHANGE VELOCITY */}
        {tab === "changes" && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total Deployments (30d)", value: String((doraData as any)?.totalDeploys30d ?? "—"), color: "text-foreground" },
                { label: "Deployment Frequency",    value: String((doraData as any)?.deploymentFrequency ?? "—") + "/day", color: "text-green-700" },
                { label: "Lead Time (avg)",          value: (doraData as any)?.leadTimeMinutes ? `${(doraData as any).leadTimeMinutes}m` : "—", color: "text-blue-700" },
                { label: "Change Failure Rate",      value: String((doraData as any)?.changeFailureRate ?? "—"), color: "text-orange-700" },
              ].map(k => (
                <div key={k.label} className="bg-muted/30 rounded border border-border px-3 py-2">
                  <div className={`text-lg font-black ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Recent Deployments</div>
              <table className="ent-table w-full">
                <thead><tr><th className="w-4" /><th>Service</th><th>Version</th><th>Environment</th><th>Status</th><th>Started</th></tr></thead>
                <tbody>
                  {deployments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-[11px] text-muted-foreground/50">No deployments on record</td></tr>
                  ) : deployments.slice(0, 5).map((d: any) => {
                    const cfg = DEPLOY_STATUS_CFG[d.status as string] ?? { color: "text-muted-foreground bg-muted", bar: "bg-muted" };
                    return (
                      <tr key={d.id}>
                        <td className="p-0"><div className={`priority-bar ${cfg.bar}`} /></td>
                        <td className="font-semibold text-foreground">{d.appName ?? d.service ?? "—"}</td>
                        <td className="font-mono text-[11px] text-foreground/80">{d.version ?? "—"}</td>
                        <td><span className={`status-badge uppercase text-[10px] font-bold ${(ENV_CFG as any)[d.environment] ?? ""}`}>{d.environment ?? "—"}</span></td>
                        <td><span className={`status-badge capitalize ${cfg.color}`}>{String(d.status ?? "").replace("_"," ")}</span></td>
                        <td className="text-[11px] font-mono text-muted-foreground">{d.startedAt ? new Date(d.startedAt).toLocaleDateString() : d.startTime ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AGILE BOARD */}
        {tab === "agile" && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <Code className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Agile Board</p>
            <p className="text-[11px] text-muted-foreground/50">Navigate to a specific project to view its sprint board and task cards.</p>
          </div>
        )}

        {/* TOOL INTEGRATIONS */}
        {tab === "tools" && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Tool Integrations</p>
            <p className="text-[11px] text-muted-foreground/50">CI/CD tool connections are managed via platform settings. No integrations have been configured yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
