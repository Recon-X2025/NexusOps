"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase, Plus, Calendar, AlertTriangle, Loader2, Pencil, X,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatDate, formatCurrency, downloadCSV } from "@/lib/utils";

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
  planning: "text-blue-700 bg-blue-100",
  on_track: "text-green-700 bg-green-100",
  at_risk:  "text-yellow-700 bg-yellow-100",
  delayed:  "text-red-700 bg-red-100",
  complete: "text-muted-foreground bg-muted",
  completed: "text-muted-foreground bg-muted",
  cancelled: "text-muted-foreground bg-muted",
};

const STORY_COLS: Array<{ key: string; label: string; color: string }> = [
  { key: "todo",       label: "To Do",       color: "bg-muted" },
  { key: "in_progress",label: "In Progress", color: "bg-blue-50" },
  { key: "review",     label: "Review",      color: "bg-yellow-50" },
  { key: "done",       label: "Done",        color: "bg-green-50" },
];

export default function ProjectsPage() {
  const router = useRouter();
  const { can } = useRBAC();
  const visibleTabs = PPM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "portfolio");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  const { data, isLoading, refetch } = trpc.projects.list.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );

  const [showNewProject, setShowNewProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", department: "", startDate: "", endDate: "", budgetTotal: "" });
  const [projectMsg, setProjectMsg] = useState<string | null>(null);

  // Edit project state
  type ProjectItem = NonNullable<typeof data>[number];
  const [editProject, setEditProject] = useState<ProjectItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", status: "", health: "", phase: "", budgetTotal: "", endDate: "" });

  function openEdit(e: React.MouseEvent, p: ProjectItem) {
    e.stopPropagation();
    setEditProject(p);
    setEditForm({
      name: p.name ?? "",
      status: p.status ?? "",
      health: p.health ?? "green",
      phase: p.phase ?? "",
      budgetTotal: p.budgetTotal ? String(p.budgetTotal) : "",
      endDate: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : "",
    });
  }

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Project updated");
      setEditProject(null);
      refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Update failed"),
  });

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (p) => {
      setProjectMsg(`Project ${(p as any).number ?? "new"} created`);
      setShowNewProject(false);
      setProjectForm({ name: "", description: "", department: "", startDate: "", endDate: "", budgetTotal: "" });
      refetch();
      setTimeout(() => setProjectMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const projectList: ProjectItem[] = data ?? [];

  if (!can("projects", "read")) return <AccessDenied module="Project Portfolio Management" />;

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
          <button
            onClick={() => downloadCSV(projectList.map((p: any) => ({ Name: p.name, Status: p.status, Phase: p.phase ?? "", Department: p.department ?? "", Start: p.startDate ? new Date(p.startDate).toLocaleDateString("en-IN") : "", End: p.endDate ? new Date(p.endDate).toLocaleDateString("en-IN") : "", Budget: p.budgetTotal ?? "", Spent: p.budgetSpent ?? "" })), "project_roadmap")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Calendar className="w-3 h-3" /> Roadmap
          </button>
          <PermissionGate module="projects" action="write">
            <button
              onClick={() => setShowNewProject((v) => !v)}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> {showNewProject ? "Cancel" : "New Project"}
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Edit Project Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-foreground">Edit Project — {editProject.number}</h3>
              <button onClick={() => setEditProject(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Project Name *</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Status</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="planning">Planning</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="delayed">Delayed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Health</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editForm.health}
                  onChange={(e) => setEditForm((f) => ({ ...f, health: e.target.value }))}
                >
                  <option value="green">Green</option>
                  <option value="amber">Amber</option>
                  <option value="red">Red</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Phase</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  placeholder="e.g. Initiation, Execution…"
                  value={editForm.phase}
                  onChange={(e) => setEditForm((f) => ({ ...f, phase: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Target End Date</label>
                <input
                  type="date"
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Budget Total (₹)</label>
                <input
                  type="number"
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editForm.budgetTotal}
                  onChange={(e) => setEditForm((f) => ({ ...f, budgetTotal: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                disabled={!editForm.name || updateProject.isPending}
                onClick={() => updateProject.mutate({
                  id: editProject.id,
                  status: editForm.status || undefined,
                  health: editForm.health || undefined,
                  phase: editForm.phase || undefined,
                  budgetSpent: undefined,
                })}
                className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {updateProject.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => router.push(`/app/projects/${editProject.id}`)}
                className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent"
              >
                Open Full Detail
              </button>
              <button onClick={() => setEditProject(null)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {projectMsg && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-[12px] text-green-700 font-medium">{projectMsg}</div>
      )}

      {showNewProject && (
        <div className="bg-card border border-primary/30 rounded p-4">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">New Project</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Project Name *</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Department</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="IT / Finance / HR…" value={projectForm.department} onChange={(e) => setProjectForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Start Date</label>
              <input type="date" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={projectForm.startDate} onChange={(e) => setProjectForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">End Date</label>
              <input type="date" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={projectForm.endDate} onChange={(e) => setProjectForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Budget (₹)</label>
              <input type="number" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="0" value={projectForm.budgetTotal} onChange={(e) => setProjectForm((f) => ({ ...f, budgetTotal: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <textarea className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background h-14 resize-none" placeholder="Project objective…" value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button disabled={!projectForm.name || createProject.isPending} onClick={() => createProject.mutate({ name: projectForm.name, description: projectForm.description || undefined, department: projectForm.department || undefined, startDate: projectForm.startDate || undefined, endDate: projectForm.endDate || undefined, budgetTotal: projectForm.budgetTotal || undefined })} className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50">
              {createProject.isPending ? "Creating…" : "Create Project"}
            </button>
            <button onClick={() => setShowNewProject(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Portfolio Budget",  value: `₹${(totalBudget / 1000000).toFixed(1)}M`, color: "text-foreground/80" },
          { label: "Spent YTD",               value: `₹${(totalSpent / 1000).toFixed(0)}K`,     color: "text-blue-700" },
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
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {projectList.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${p.health === "red" ? "bg-red-50/30" : ""}`}
                    onClick={() => router.push(`/app/projects/${p.id}`)}
                  >
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
                    <td onClick={(e) => e.stopPropagation()} className="text-right pr-2">
                      <PermissionGate module="projects" action="write">
                        <button
                          onClick={(e) => openEdit(e, p)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/50 text-muted-foreground"
                        >
                          <Pencil className="w-2.5 h-2.5" /> Edit
                        </button>
                      </PermissionGate>
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
                <button
                  onClick={() => setShowNewProject(true)}
                  className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 mx-auto"
                >
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
                <button
                  onClick={() => setShowNewProject(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                >
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
