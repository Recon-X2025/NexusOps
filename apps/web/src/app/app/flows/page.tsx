"use client";

import { useState } from "react";
import { Workflow, Plus, Play, Pause, CheckCircle2, AlertTriangle, Clock, Zap, Settings, ChevronRight, RefreshCw, GitBranch, Bell, Mail, Wrench, TicketIcon, Users, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

type Step = { type: string; name: string; config: string; icon: React.ElementType; color: string };

const SAMPLE_FLOW_STEPS: Step[] = [
  { type: "trigger", name: "SLA Timer Breached", config: "Priority: P1 or P2, SLA: Response or Resolution", icon: Zap, color: "bg-orange-100 text-orange-700 border-orange-300" },
  { type: "condition", name: "Check: Already Escalated?", config: "If escalation_level > 0 → Skip to Notify", icon: GitBranch, color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { type: "action", name: "Update Incident Priority", config: "Increment priority by 1 tier", icon: TicketIcon, color: "bg-blue-100 text-blue-700 border-blue-300" },
  { type: "action", name: "Assign to Escalation Group", config: "Set assignment_group = escalation_group[priority]", icon: Users, color: "bg-blue-100 text-blue-700 border-blue-300" },
  { type: "notification", name: "Page On-Call Engineer", config: "Via PagerDuty: escalation_policy[P1_Infra]", icon: Bell, color: "bg-purple-100 text-purple-700 border-purple-300" },
  { type: "notification", name: "Notify IT Manager + CISO", config: "Email + SMS: incident summary + link", icon: Mail, color: "bg-purple-100 text-purple-700 border-purple-300" },
];

const CATEGORY_COLOR: Record<string, string> = {
  Incident: "text-red-700 bg-red-100",
  HRSD: "text-blue-700 bg-blue-100",
  SecOps: "text-orange-700 bg-orange-100",
  Change: "text-yellow-700 bg-yellow-100",
  SAM: "text-green-700 bg-green-100",
  ITOM: "text-purple-700 bg-purple-100",
  "Service Catalog": "text-indigo-700 bg-indigo-100",
};

export default function FlowDesignerPage() {
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "designer">("list");
  const { can } = useRBAC();

  const canView = can("approvals", "read");
  const flowsQuery = trpc.workflows.list.useQuery(undefined, { enabled: canView });
  const createFlowMutation = trpc.workflows.create.useMutation({
    onSuccess: () => { flowsQuery.refetch(); toast.success("Flow created"); },
    onError: (e: any) => { console.error("workflows.create failed:", e); toast.error(e.message || "Failed to create flow"); },
  });

  if (!canView) return <AccessDenied module="Flow Designer" />;

  const FLOWS: any[] = flowsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Flow Designer</h1>
          <span className="text-[11px] text-muted-foreground/70">Workflow Automation · Process Triggers · Integration Flows</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView(view === "list" ? "designer" : "list")} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Settings className="w-3 h-3" /> {view === "list" ? "Open Designer" : "Back to List"}
          </button>
          <button
            onClick={() => createFlowMutation.mutate({ name: "New Flow", trigger: "Manual", category: "Other" } as any)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Flow
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Active Flows",       value: FLOWS.filter((f: any) => f.status === "active").length, color: "text-green-700" },
          { label: "Executions (30d)",   value: FLOWS.reduce((s: number, f: any) => s + (f.runs30d ?? f.executionCount30d ?? 0), 0), color: "text-blue-700" },
          { label: "Avg Success Rate",   value: FLOWS.length > 0 ? `${Math.round(FLOWS.reduce((s: number, f: any) => s + (f.successRate ?? 100), 0) / FLOWS.length)}%` : "—", color: "text-green-700" },
          { label: "Paused / Review",    value: FLOWS.filter((f: any) => f.status !== "active").length, color: "text-yellow-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {view === "list" ? (
        <div className="bg-card border border-border rounded overflow-hidden">
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Flow Name</th>
                <th>Category</th>
                <th>Trigger</th>
                <th className="text-center">Steps</th>
                <th>Status</th>
                <th>Last Run</th>
                <th className="text-center">Runs (30d)</th>
                <th>Success Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flowsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j}><div className="h-3 bg-muted animate-pulse rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : FLOWS.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground/70 text-[12px]">No flows found.</td>
                </tr>
              ) : (
                FLOWS.map((f: any) => (
                  <tr key={f.id} className={f.status !== "active" ? "opacity-70" : ""}>
                    <td className="p-0"><div className={`priority-bar ${f.status === "active" ? "bg-green-500" : "bg-yellow-500"}`} /></td>
                    <td>
                      <div>
                        <div className="font-medium text-foreground text-[12px]">{f.name}</div>
                        <div className="text-[10px] text-muted-foreground/70 truncate max-w-xs">{f.description}</div>
                      </div>
                    </td>
                    <td><span className={`status-badge ${CATEGORY_COLOR[f.category] ?? "text-muted-foreground bg-muted"}`}>{f.category}</span></td>
                    <td className="text-[11px] text-muted-foreground">{f.trigger}</td>
                    <td className="text-center text-muted-foreground">{f.steps ?? f.stepCount ?? 0}</td>
                    <td>
                      <span className={`status-badge ${f.status === "active" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                        {f.status === "active" ? "● Active" : "⏸ Paused"}
                      </span>
                    </td>
                    <td className="text-muted-foreground text-[11px]">{f.lastRun ?? f.lastExecutedAt ?? "—"}</td>
                    <td className="text-center font-semibold text-foreground/80">{f.runs30d ?? f.executionCount30d ?? 0}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${(f.successRate ?? 100) >= 95 ? "bg-green-500" : (f.successRate ?? 100) >= 80 ? "bg-yellow-400" : "bg-red-500"}`}
                            style={{ width: `${f.successRate ?? 100}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{f.successRate ?? 100}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => { setSelectedFlow(f.id); setView("designer"); }} className="text-[11px] text-primary hover:underline">Edit</button>
                        <span className="text-slate-300">|</span>
                        <button className="text-[11px] text-muted-foreground hover:text-foreground/80">
                          {f.status === "active" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
            <span className="text-[12px] font-semibold text-foreground/80">
              {selectedFlow ? (FLOWS.find((f: any) => f.id === selectedFlow)?.name ?? "Flow") : "New Flow"} — Visual Designer
            </span>
            <span className="text-[11px] text-muted-foreground/70">Click a step to configure</span>
            <div className="ml-auto flex gap-2">
              <button className="px-3 py-1 border border-border rounded text-[11px] text-muted-foreground hover:bg-muted/30">Test Flow</button>
              <button className="px-3 py-1 bg-primary text-white rounded text-[11px] hover:bg-primary/90">Activate</button>
            </div>
          </div>
          <div className="p-6 overflow-x-auto">
            <div className="flex items-start gap-3 min-w-max">
              {SAMPLE_FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`border rounded-lg p-3 w-44 cursor-pointer hover:shadow-md transition-shadow ${step.color}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wide opacity-60">{step.type}</span>
                      </div>
                      <div className="text-[12px] font-semibold leading-tight mb-1">{step.name}</div>
                      <div className="text-[10px] opacity-70 leading-snug">{step.config}</div>
                    </div>
                    {i < SAMPLE_FLOW_STEPS.length - 1 && (
                      <div className="flex items-center">
                        <div className="w-8 h-px bg-border" />
                        <ChevronRight className="w-3 h-3 text-muted-foreground/70 -ml-1" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-3">
                <div className="flex items-center">
                  <div className="w-8 h-px bg-border" />
                  <ChevronRight className="w-3 h-3 text-muted-foreground/70 -ml-1" />
                </div>
                <button className="w-44 h-16 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground/70 hover:border-primary hover:text-primary transition-colors gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Step
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
