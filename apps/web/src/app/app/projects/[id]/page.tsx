"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Briefcase, ChevronRight, Plus, Loader2, CheckCircle2,
  Clock, AlertTriangle, X, Check, Edit2, Flag, Circle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import { formatDate } from "@/lib/utils";
import { TASK_BOARD_ENABLED } from "@/lib/feature-flags";

const STATUS_COLOR: Record<string, string> = {
  planning:  "text-blue-700 bg-blue-100",
  on_track:  "text-green-700 bg-green-100",
  at_risk:   "text-yellow-700 bg-yellow-100",
  delayed:   "text-red-700 bg-red-100",
  complete:  "text-muted-foreground bg-muted",
  completed: "text-muted-foreground bg-muted",
  cancelled: "text-muted-foreground bg-muted",
};

const HEALTH_COLOR: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-yellow-500",
  red:   "bg-red-600",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
};

const BOARD_COLS = [
  { key: "todo",        label: "To Do",       color: "bg-muted/40",    ring: "ring-muted" },
  { key: "in_progress", label: "In Progress",  color: "bg-blue-50",     ring: "ring-blue-200" },
  { key: "in_review",   label: "Review",       color: "bg-yellow-50",   ring: "ring-yellow-200" },
  { key: "done",        label: "Done",         color: "bg-green-50",    ring: "ring-green-200" },
];

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeId?: string | null;
  storyPoints?: number | null;
  sprint?: string | null;
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const utils = trpc.useUtils();

  const { data: project, isLoading, isError, refetch } = trpc.projects.get.useQuery({ id }, mergeTrpcQueryOpts("projects.get", { refetchOnWindowFocus: false },));

  // Task board (Layer A) is feature-flagged off by default — Strategy Center
  // is an oversight surface, not a Linear/Jira competitor. We only fetch the
  // board when the flag is on so the network call doesn't run for everyone.
  const boardQuery = trpc.projects.getAgileBoard.useQuery(
    { projectId: id },
    mergeTrpcQueryOpts("projects.getAgileBoard", {
      refetchOnWindowFocus: false,
      enabled: !!id && TASK_BOARD_ENABLED,
    }),
  );

  const [showAddTask, setShowAddTask] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    sprint: "",
  });
  
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "",
    health: "",
    phase: "",
  });

  const [movingTask, setMovingTask] = useState<string | null>(null);

  const createTask = trpc.projects.createTask.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setShowAddTask(false);
      setTaskForm({ title: "", description: "", priority: "medium", sprint: "" });
      boardQuery.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create task"),
  });

  const updateTask = trpc.projects.updateTask.useMutation({
    onSuccess: () => {
      boardQuery.refetch();
      setMovingTask(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update task"),
  });
  
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Project updated successfully");
      setIsEditing(false);
      refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update project"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading project…</span>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-2 text-muted-foreground">
        <Briefcase className="w-8 h-8 opacity-30" />
        <span className="text-sm">Project not found.</span>
        <Link href="/app/projects" className="text-primary text-[12px] hover:underline">
          ← Back to Projects
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_COLOR[project.status ?? "planning"];
  const tasks = (project as any).tasks ?? [];
  const milestones = (project as any).milestones ?? [];

  const board = boardQuery.data ?? {};
  const allBoardTasks: Task[] = Object.values(board).flat() as Task[];

  const isTerminal = project.status === "complete" || project.status === "completed" || project.status === "cancelled";

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Link href="/app/projects" className="hover:text-foreground">Projects</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">{project.number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_COLOR[project.health ?? "green"]}`} />
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground leading-snug">{project.name}</h1>
            {project.description && (
              <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`status-badge capitalize ${statusCfg}`}>{project.status?.replace(/_/g, " ") ?? "Planning"}</span>
              {project.department && (
                <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{project.department}</span>
              )}
              {project.startDate && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(project.startDate)} → {project.endDate ? formatDate(project.endDate) : "Ongoing"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PermissionGate module="projects" action="write">
            <button
              onClick={() => {
                setEditForm({
                  name: project.name,
                  description: project.description || "",
                  status: project.status || "planning",
                  health: project.health || "green",
                  phase: project.phase || "",
                });
                setIsEditing(v => !v);
              }}
              className="flex items-center gap-1 px-3 py-1.5 border border-border text-[11px] rounded hover:bg-muted font-medium"
            >
              <Edit2 className="w-3 h-3" /> Edit Project
            </button>
          </PermissionGate>
          {TASK_BOARD_ENABLED && (
            <PermissionGate module="projects" action="write">
              {!isTerminal && (
                <button
                  onClick={() => setShowAddTask(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                >
                  <Plus className="w-3 h-3" /> Add Task
                </button>
              )}
            </PermissionGate>
          )}
        </div>
      </div>

      {/* KPIs — task counts only when the task board is enabled. */}
      <div className="grid grid-cols-4 gap-2">
        {(TASK_BOARD_ENABLED
          ? [
              { label: "Total Tasks",  value: allBoardTasks.length },
              { label: "In Progress",  value: (board["in_progress"] ?? []).length },
              { label: "Done",         value: (board["done"] ?? []).length },
              { label: "Milestones",   value: milestones.length },
            ]
          : [
              { label: "Milestones",   value: milestones.length },
              { label: "Health",       value: project.health ?? "—" },
              { label: "Status",       value: (project.status ?? "—").replace(/_/g, " ") },
              { label: "Phase",        value: project.phase ?? "—" },
            ]
        ).map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className="text-lg font-bold text-foreground capitalize">{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Edit Project Form */}
      {isEditing && (
        <div className="bg-card border border-primary/30 rounded p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
            <h3 className="text-[13px] font-bold text-foreground">Edit Project Details</h3>
            <button onClick={() => setIsEditing(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Project Name *</label>
              <input
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background focus:ring-1 focus:ring-primary outline-none"
                value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
              <textarea
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background focus:ring-1 focus:ring-primary outline-none min-h-[80px] resize-y"
                value={editForm.description}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
              <select
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background"
                value={editForm.status}
                onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="proposed">Proposed</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Health</label>
              <select
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background"
                value={editForm.health}
                onChange={(e) => setEditForm(f => ({ ...f, health: e.target.value }))}
              >
                <option value="green">Green (Healthy)</option>
                <option value="amber">Amber (Watch)</option>
                <option value="red">Red (At Risk)</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Phase</label>
              <input
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background focus:ring-1 focus:ring-primary outline-none"
                placeholder="e.g. Discovery, Execution"
                value={editForm.phase}
                onChange={(e) => setEditForm(f => ({ ...f, phase: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-3 border-t border-border">
            <button
              disabled={!editForm.name || updateProject.isPending}
              onClick={() => updateProject.mutate({
                id,
                name: editForm.name,
                description: editForm.description || undefined,
                status: editForm.status || undefined,
                health: editForm.health || undefined,
                phase: editForm.phase || undefined,
              })}
              className="px-4 py-2 rounded bg-primary text-white text-[12px] font-semibold shadow hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {updateProject.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {updateProject.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded border border-border text-[12px] font-semibold hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Task Form */}
      {TASK_BOARD_ENABLED && showAddTask && (
        <div className="bg-card border border-primary/30 rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-foreground">New Task</h3>
            <button onClick={() => setShowAddTask(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Task Title *</label>
              <input
                className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                placeholder="What needs to be done?"
                value={taskForm.title}
                onChange={(e) => setTaskForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Priority</label>
              <select
                className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                value={taskForm.priority}
                onChange={(e) => setTaskForm(f => ({ ...f, priority: e.target.value as any }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <input
                className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                placeholder="Optional description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Sprint</label>
              <input
                className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                placeholder="e.g. Sprint 3"
                value={taskForm.sprint}
                onChange={(e) => setTaskForm(f => ({ ...f, sprint: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              disabled={!taskForm.title || createTask.isPending}
              onClick={() => createTask.mutate({
                projectId: id,
                title: taskForm.title,
                description: taskForm.description || undefined,
                priority: taskForm.priority,
                sprint: taskForm.sprint || undefined,
              })}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createTask.isPending ? "Creating…" : "Create Task"}
            </button>
            <button onClick={() => setShowAddTask(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="bg-card border border-border rounded">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Milestones
            </span>
          </div>
          <div className="divide-y divide-border">
            {milestones.map((ms: any) => (
              <div key={ms.id} className="flex items-center gap-3 px-3 py-2">
                {ms.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-[12px] font-medium ${ms.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {ms.title}
                  </span>
                </div>
                {ms.dueDate && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Flag className="w-3 h-3" /> {formatDate(ms.dueDate)}
                  </span>
                )}
                <span className={`status-badge capitalize ${ms.status === "completed" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {ms.status ?? "pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agile Board — opt-in via NEXT_PUBLIC_ENABLE_TASK_BOARD. */}
      {TASK_BOARD_ENABLED && (
      <div className="bg-card border border-border rounded">
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Task Board</span>
          {boardQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="p-3 grid grid-cols-4 gap-3">
          {BOARD_COLS.map((col) => {
            const colTasks: Task[] = (board[col.key] ?? []) as Task[];
            return (
              <div key={col.key} className={`rounded border border-border ${col.color} min-h-[140px]`}>
                <div className="px-2.5 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wide">{col.label}</span>
                  <span className="text-[10px] text-muted-foreground bg-card border border-border rounded-full px-1.5">{colTasks.length}</span>
                </div>
                <div className="p-2 space-y-2">
                  {colTasks.length === 0 ? (
                    <div className="text-center text-[10px] text-muted-foreground/50 py-6">No tasks</div>
                  ) : colTasks.map((task) => (
                    <div key={task.id} className="bg-card rounded border border-border p-2 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-[11px] text-foreground/90 leading-tight flex-1">{task.title}</p>
                        <span className={`text-[9px] px-1 py-0.5 rounded flex-shrink-0 capitalize font-medium ${PRIORITY_COLOR[task.priority] ?? "text-muted-foreground bg-muted"}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.sprint && (
                        <div className="text-[9px] text-muted-foreground mb-1">{task.sprint}</div>
                      )}
                      {!isTerminal && (
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          {BOARD_COLS.filter(c => c.key !== col.key).map(targetCol => (
                            <button
                              key={targetCol.key}
                              disabled={movingTask === task.id}
                              onClick={() => {
                                setMovingTask(task.id);
                                updateTask.mutate({ id: task.id, status: targetCol.key });
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              → {targetCol.label}
                            </button>
                          ))}
                        </div>
                      )}
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
  );
}
