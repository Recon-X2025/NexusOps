"use client";

import { useState, useEffect } from "react";
import {
  Briefcase, Plus, Calendar, AlertTriangle, Loader2,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatDate, formatCurrency } from "@/lib/utils";

const PPM_TABS = [
  { key: "portfolio",  label: "Portfolio View",       module: "projects"  as const, action: "read"  as const },
  { key: "projects",   label: "All Projects",         module: "projects"  as const, action: "read"  as const },
  { key: "resources",  label: "Resource Management",  module: "resources" as const, action: "read"  as const },
  { key: "demand",     label: "Demand",               module: "demand"    as const, action: "read"  as const },
  { key: "agile",      label: "Agile Board",          module: "projects"  as const, action: "write" as const },
];


const HEALTH_COLOR: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-yellow-500",
  red:   "bg-red-600",
};

const STATUS_COLOR: Record<string, string> = {
  on_track: "text-green-700 bg-green-100",
  at_risk:  "text-yellow-700 bg-yellow-100",
  delayed:  "text-red-700 bg-red-100",
  complete: "text-muted-foreground bg-muted",
};

const STORY_COLS: Array<{ key: string; label: string; color: string }> = [
  { key: "todo",       label: "To Do",       color: "bg-muted" },
  { key: "in_progress",label: "In Progress", color: "bg-blue-50" },
  { key: "review",     label: "Review",      color: "bg-yellow-50" },
  { key: "done",       label: "Done",        color: "bg-green-50" },
];

export default function ProjectsPage() {
  const { can } = useRBAC();
  const visibleTabs = PPM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "portfolio");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("projects", "read")) return <AccessDenied module="Project Portfolio Management" />;

  const { data, isLoading } = trpc.projects.list.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );

  type ProjectItem = NonNullable<typeof data>[number];
  const projectList: ProjectItem[] = data ?? [];

  const taskList = [] as any[];

  const totalBudget = projectList.reduce((s, p) => s + Number(p.budgetTotal ?? 0), 0);
  const totalSpent  = projectList.reduce((s, p) => s + Number(p.budgetSpent ?? 0), 0);
  const atRisk = projectList.filter((p) => p.health !== "green").length;
  const overallocated = 0; // Resource allocation managed per-project

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Project Portfolio Management</h1>
          <span className="text-[11px] text-muted-foreground/70">PPM · Resources · Demand · Agile</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Calendar className="w-3 h-3" /> Roadmap
          </button>
          <PermissionGate module="projects" action="write">
            <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Project
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Portfolio Budget",  value: `$${(totalBudget / 1000000).toFixed(1)}M`, color: "text-foreground/80" },
          { label: "Spent YTD",               value: `$${(totalSpent / 1000).toFixed(0)}K`,     color: "text-blue-700" },
          { label: "Projects At Risk",        value: atRisk,                                    color: "text-orange-700" },
          { label: "Overallocated Resources", value: overallocated,                              color: "text-red-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {(tab === "portfolio" || tab === "projects") && (
          isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading projects…</span>
            </div>
          ) : projectList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Briefcase className="w-5 h-5 opacity-30" />
              <span className="text-xs">No projects yet.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>ID</th>
                  <th>Project Name</th>
                  <th>Phase</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Department</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>End Date</th>
                </tr>
              </thead>
              <tbody>
                {projectList.map((p) => (
                  <tr key={p.id} className={p.health === "red" ? "bg-red-50/30" : ""}>
                    <td className="p-0 relative">
                      <div className={`priority-bar ${HEALTH_COLOR[p.health] ?? "bg-muted"}`} />
                    </td>
                    <td className="font-mono text-[11px] text-primary">{p.number}</td>
                    <td className="max-w-xs">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_COLOR[p.health]}`} />
                        <span className="truncate text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td><span className="status-badge text-muted-foreground bg-muted">{p.phase ?? "—"}</span></td>
                    <td>
                      <span className={`w-3 h-3 rounded-full inline-block ${HEALTH_COLOR[p.health]}`} />
                    </td>
                    <td>
                      <span className={`status-badge capitalize ${STATUS_COLOR[p.status] ?? "text-muted-foreground bg-muted"}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="text-foreground/80 font-mono text-[11px]">
                      {p.budgetTotal ? formatCurrency(Number(p.budgetTotal)) : "—"}
                    </td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      {p.budgetSpent ? formatCurrency(Number(p.budgetSpent)) : "—"}
                    </td>
                    <td className={`text-[11px] ${p.status === "delayed" ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                      {p.endDate ? formatDate(p.endDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "resources" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Role</th>
                <th>Department</th>
                <th>Capacity %</th>
                <th>Allocated %</th>
                <th>Availability</th>
                <th>Projects</th>
                <th>Skills</th>
              </tr>
            </thead>
            <tbody>
              {projectList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground text-[12px]">
                    No team members assigned to projects yet. Assign users to projects to see resource allocation.
                  </td>
                </tr>
              ) : (
                projectList.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td className="text-foreground">{p.name}</td>
                    <td className="text-muted-foreground capitalize">{p.status?.replace(/_/g, " ")}</td>
                    <td className="text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="text-center font-mono text-muted-foreground">
                      {p.budgetTotal ? `₹${parseFloat(String(p.budgetTotal)).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="text-center">
                      <span className={`status-badge capitalize ${p.status === "at_risk" || p.status === "delayed" ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100"}`}>
                        {p.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{p.endDate ? new Date(p.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="text-muted-foreground">—</td>
                    <td className="text-muted-foreground">—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "demand" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 opacity-30" />
            <div className="text-center">
              <p className="text-[13px] font-semibold">Demand Management</p>
              <p className="text-[12px] text-muted-foreground/70 mt-1">Demand items will appear here once submitted through the intake process.</p>
              <PermissionGate module="projects" action="write">
                <button className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 mx-auto">
                  <Plus className="w-3 h-3" /> New Demand Request
                </button>
              </PermissionGate>
            </div>
          </div>
        )}

        {tab === "agile" && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-foreground/80">Agile Board</span>
                <span className="text-[11px] text-muted-foreground">Task board across all projects</span>
              </div>
              <PermissionGate module="projects" action="write">
                <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
                  <Plus className="w-3 h-3" /> Add Story
                </button>
              </PermissionGate>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {STORY_COLS.map((col) => {
                const stories = taskList.filter((s: any) => s.status === col.key);
                return (
                  <div key={col.key} className={`rounded border border-border ${col.color} min-h-40`}>
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-foreground/80">{col.label}</span>
                      <span className="text-[11px] text-muted-foreground bg-card border border-border rounded-full px-2">{stories.length}</span>
                    </div>
                    <div className="p-2 space-y-2">
                      {stories.length === 0 ? (
                        <div className="text-center text-[11px] text-muted-foreground/50 py-4">No items</div>
                      ) : stories.map((s: any) => (
                        <div key={s.id} className="bg-card rounded border border-border p-2 hover:shadow-sm transition-shadow cursor-pointer">
                          <p className="text-[11px] text-foreground/80 leading-tight">{s.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
