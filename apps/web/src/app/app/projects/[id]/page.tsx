"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen, ChevronLeft,
  Circle, TrendingUp, Loader2, AlertTriangle, Send, Paperclip,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

const STATE_CFG: Record<string, { label: string; color: string; dot: string }> = {
  completed:   { label: "Complete",    color: "text-green-700 bg-green-100",     dot: "bg-green-500" },
  in_progress: { label: "In Progress", color: "text-blue-700 bg-blue-100",       dot: "bg-blue-500"  },
  upcoming:    { label: "Upcoming",    color: "text-muted-foreground bg-muted",   dot: "bg-border"    },
  overdue:     { label: "Overdue",     color: "text-red-700 bg-red-100",          dot: "bg-red-500"   },
  done:        { label: "Done",        color: "text-green-700 bg-green-100",      dot: "bg-green-500" },
  backlog:     { label: "Backlog",     color: "text-muted-foreground bg-muted",   dot: "bg-border"    },
  todo:        { label: "To Do",       color: "text-muted-foreground bg-muted",   dot: "bg-slate-400" },
  in_review:   { label: "In Review",   color: "text-purple-700 bg-purple-100",    dot: "bg-purple-500"},
  cancelled:   { label: "Cancelled",   color: "text-muted-foreground bg-muted",   dot: "bg-muted"     },
};

const PROJECT_STATUS_COLOR: Record<string, string> = {
  on_track:  "text-green-700 bg-green-100",
  at_risk:   "text-orange-700 bg-orange-100",
  delayed:   "text-red-700 bg-red-100",
  planning:  "text-blue-700 bg-blue-100",
  completed: "text-muted-foreground bg-muted",
  cancelled: "text-muted-foreground bg-muted",
};

export default function ProjectDetailPage() {
  const [tab, setTab] = useState("overview");
  const [updateText, setUpdateText] = useState("");
  const params = useParams();
  const id = params?.id as string;
  const { can } = useRBAC();

  if (!can("projects", "read")) return <AccessDenied module="Projects" />;

  const { data: project, isLoading } = trpc.projects.get.useQuery(
    { id },
    { enabled: !!id },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <AlertTriangle className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-[13px] text-muted-foreground">Project not found</p>
        <Link href="/app/projects" className="text-[12px] text-primary hover:underline">← Back to Projects</Link>
      </div>
    );
  }

  const milestones = project.milestones ?? [];
  const tasks = project.tasks ?? [];

  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const completedMilestones = milestones.filter((m) => m.status === "completed").length;
  const completionPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const budgetTotal = parseFloat(String(project.budgetTotal ?? "0"));
  const budgetSpent = parseFloat(String(project.budgetSpent ?? "0"));
  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <Link href="/app/projects" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> Projects
        </Link>
        <span>/</span>
        <span className="text-muted-foreground font-medium">{project.number}</span>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <FolderOpen className="w-4 h-4 text-primary" />
              <span className="font-mono text-[11px] text-primary">{project.number}</span>
              <span className={`status-badge capitalize ${PROJECT_STATUS_COLOR[project.status] ?? "text-muted-foreground bg-muted"}`}>
                {project.status?.replace(/_/g, " ")}
              </span>
            </div>
            <h1 className="text-[15px] font-bold text-foreground mb-1">{project.name}</h1>
            {project.description && (
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{project.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span>Started: <strong className="text-foreground/80">{project.createdAt ? new Date(project.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</strong></span>
              {project.endDate && (
                <span>Target End: <strong className="text-foreground/80">{new Date(project.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</strong></span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[32px] font-black text-primary leading-none">{completionPct}%</div>
            <div className="text-[11px] text-muted-foreground/70">Complete</div>
            <div className="w-32 h-2 bg-border rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-3">
          {[
            { label: "Budget",         value: budgetTotal > 0 ? `₹${budgetTotal.toLocaleString("en-IN")}` : "—", sub: "Total approved" },
            { label: "Spent",          value: budgetSpent > 0 ? `₹${budgetSpent.toLocaleString("en-IN")}` : "—", sub: `${budgetPct}% of budget` },
            { label: "Tasks Complete", value: `${completedTasks}/${tasks.length}`, sub: "Tasks done" },
            { label: "Milestones",     value: `${completedMilestones}/${milestones.length}`, sub: "Milestones done" },
          ].map((k) => (
            <div key={k.label} className="bg-muted/30 rounded p-2.5">
              <div className="text-[15px] font-bold text-foreground">{k.value}</div>
              <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
              <div className="text-[10px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {[
          { key: "overview",    label: "Overview & Milestones" },
          { key: "tasks",       label: `Tasks (${tasks.length})` },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "overview" && (
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-3">
              Project Milestones ({completedMilestones}/{milestones.length} complete)
            </p>
            {milestones.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-[12px]">
                No milestones defined for this project.
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-3 bottom-3 w-px bg-border" />
                <div className="space-y-2">
                  {milestones.map((ms) => {
                    const cfg = (STATE_CFG[ms.status] ?? STATE_CFG.upcoming)!;
                    const isPast = !ms.completedAt && ms.dueDate && new Date(ms.dueDate) < new Date() && ms.status !== "completed";
                    return (
                      <div key={ms.id} className="flex gap-4 pl-10 relative">
                        <div className={`absolute left-2 top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${cfg.dot}`}>
                          {ms.status === "completed" && <span className="text-white text-[8px]">✓</span>}
                        </div>
                        <div className="flex-1 flex items-center justify-between py-2 px-3 rounded border border-transparent hover:border-border hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className={`text-[12px] font-medium ${ms.status === "completed" ? "text-muted-foreground/70 line-through" : "text-foreground"}`}>
                              {ms.title}
                            </span>
                            {isPast && (
                              <span className="text-[10px] text-red-600 font-semibold">OVERDUE</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {ms.dueDate && (
                              <span className="text-[11px] text-muted-foreground/70">
                                Due: {new Date(ms.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                            )}
                            {ms.completedAt && (
                              <span className="text-[11px] text-green-600">
                                Done: {new Date(ms.completedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                            )}
                            <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          tasks.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-[12px]">
              No tasks defined for this project.
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const cfg = (STATE_CFG[t.status] ?? STATE_CFG.backlog)!;
                  const isOverdue = t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date();
                  return (
                    <tr key={t.id} className={t.status === "done" ? "opacity-50" : isOverdue ? "bg-red-50/20" : ""}>
                      <td className="p-0"><div className={`priority-bar ${cfg.dot}`} /></td>
                      <td className={`text-foreground ${t.status === "done" ? "line-through" : ""}`}>{t.title}</td>
                      <td>
                        <span className={`status-badge capitalize text-[10px] ${t.priority === "critical" ? "text-red-700 bg-red-100" : t.priority === "high" ? "text-orange-700 bg-orange-100" : t.priority === "low" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className={`text-[11px] font-mono ${isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                        {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </td>
                      <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                      <td>
                        {t.status !== "done" && (
                          <PermissionGate module="projects" action="write">
                            <button className="text-[11px] text-primary hover:underline">Complete</button>
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
