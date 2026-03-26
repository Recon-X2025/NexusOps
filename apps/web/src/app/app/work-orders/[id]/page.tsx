"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/lib/trpc";
import { toast } from "sonner";

type WOGetPayload = NonNullable<inferRouterOutputs<AppRouter>["workOrders"]["get"]>;
type WOTaskRow = WOGetPayload["tasks"][number];
type WOActivityLogRow = WOGetPayload["activityLogs"][number];
import {
  ChevronRight,
  Wrench,
  Clock,
  Flame,
  Edit2,
  CheckCircle2,
  XCircle,
  Plus,
  ChevronDown,
  AlertTriangle,
  User,
  MapPin,
  CalendarDays,
  Tag,
  Activity,
  Lock,
  Globe,
  Hourglass,
} from "lucide-react";

type WOTaskState =
  | "pending_dispatch" | "open" | "accepted" | "work_in_progress"
  | "complete" | "cancelled" | "closed";

const TASK_STATE: Record<WOTaskState, { label: string; color: string }> = {
  pending_dispatch: { label: "Pending Dispatch", color: "text-yellow-700 bg-yellow-100" },
  open:             { label: "Open",             color: "text-blue-700 bg-blue-100" },
  accepted:         { label: "Accepted",          color: "text-indigo-700 bg-indigo-100" },
  work_in_progress: { label: "In Progress",       color: "text-orange-700 bg-orange-100" },
  complete:         { label: "Complete",          color: "text-green-700 bg-green-100" },
  cancelled:        { label: "Cancelled",         color: "text-red-700 bg-red-100" },
  closed:           { label: "Closed",            color: "text-muted-foreground bg-muted" },
};

const PRIORITY_COLORS: Record<string, string> = {
  "1_critical": "bg-red-600",
  "2_high":     "bg-orange-500",
  "3_moderate": "bg-yellow-500",
  "4_low":      "bg-green-500",
  "5_planning": "bg-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  "1_critical": "1 - Critical",
  "2_high":     "2 - High",
  "3_moderate": "3 - Moderate",
  "4_low":      "4 - Low",
  "5_planning": "5 - Planning",
};

const STATE_TRANSITIONS: Record<string, string[]> = {
  open:             ["pending_dispatch", "on_hold", "cancelled"],
  pending_dispatch: ["dispatched", "on_hold", "cancelled"],
  dispatched:       ["work_in_progress", "on_hold"],
  work_in_progress: ["complete", "on_hold"],
  on_hold:          ["open", "work_in_progress", "cancelled"],
  complete:         ["closed"],
  closed:           [],
  cancelled:        [],
  draft:            ["open", "cancelled"],
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="field-label w-28 flex-shrink-0 mt-0.5">{label}</span>
      <span className="field-value flex-1">{children}</span>
    </div>
  );
}

function formatDt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<"tasks" | "workNotes" | "activity">("tasks");
  const [noteText, setNoteText] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [stateDropdown, setStateDropdown] = useState(false);

  const { data, isLoading, refetch } = trpc.workOrders.get.useQuery({ id });
  const updateState = trpc.workOrders.updateState.useMutation({
    onSuccess: () => { refetch(); toast.success("Status updated"); },
    onError: (e: any) => { console.error("workOrders.updateState failed:", e); toast.error(e.message || "Failed to update status"); },
  });
  const addNote = trpc.workOrders.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      refetch();
      toast.success("Note added");
    },
    onError: (e: any) => { console.error("workOrders.addNote failed:", e); toast.error(e.message || "Failed to add note"); },
  });
  const updateTask = trpc.workOrders.updateTask.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e: any) => { console.error("workOrders.updateTask failed:", e); toast.error(e.message || "Failed to update task"); },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 text-[12px] text-muted-foreground/70">
        Loading work order...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-60 text-[12px] text-red-500">
        Work order not found.
      </div>
    );
  }

  const { workOrder: wo, tasks, activityLogs } = data;
  const pColor = PRIORITY_COLORS[wo.priority] ?? "bg-slate-400";
  const pLabel = PRIORITY_LABELS[wo.priority] ?? wo.priority;
  const taskProgress = tasks.length
    ? Math.round((tasks.filter((t: WOTaskRow) => t.state === "complete" || t.state === "closed").length / tasks.length) * 100)
    : 0;
  const transitions = STATE_TRANSITIONS[wo.state] ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/work-orders" className="hover:text-primary">
          Work Orders
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-muted-foreground font-medium">{wo.number}</span>
      </nav>

      {/* SLA breach banner */}
      {wo.slaBreached && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-[12px]">
          <Flame className="w-4 h-4 flex-shrink-0" />
          <strong>SLA Breached</strong> — This work order has exceeded its scheduled completion window.
          Escalate immediately.
        </div>
      )}

      {/* Record header */}
      <div className="bg-card border border-border rounded">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
          <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${pColor}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-muted-foreground">{wo.number}</span>
                  <span className="status-badge text-muted-foreground bg-muted">{wo.state.replace(/_/g, " ")}</span>
                  <span className="status-badge text-blue-700 bg-blue-100">
                    {wo.type?.replace(/_/g, " ")}
                  </span>
                  {wo.slaBreached && (
                    <span className="status-badge text-red-700 bg-red-100">
                      <Flame className="w-2.5 h-2.5 inline mr-0.5" />
                      SLA Breached
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-semibold text-foreground">{wo.shortDescription}</h2>
              </div>

              {/* Action toolbar */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {transitions.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setStateDropdown(!stateDropdown)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] font-medium rounded hover:bg-primary/90"
                    >
                      Transition State <ChevronDown className="w-3 h-3" />
                    </button>
                    {stateDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded shadow-lg z-20 min-w-40">
                        {transitions.map((s: string) => (
                          <button
                            key={s}
                            onClick={() => {
                              updateState.mutate({ id: wo.id, state: s as any });
                              setStateDropdown(false);
                            }}
                            className="block w-full text-left px-3 py-2 text-[12px] hover:bg-muted/30 capitalize"
                          >
                            {s.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3" /> Complete
                </button>
                <button className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-red-200 rounded hover:bg-red-50 text-red-600">
                  <XCircle className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>

            {/* Description */}
            {wo.description && (
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">{wo.description}</p>
            )}

            {/* Task progress bar */}
            {tasks.length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">Task Progress</span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-xs">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${taskProgress}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {tasks.filter((t: WOTaskRow) => t.state === "complete" || t.state === "closed").length}/{tasks.length} complete
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-3 flex-1">
        {/* Left — tabs */}
        <div className="flex-1 min-w-0 flex flex-col gap-0">
          {/* Tabs */}
          <div className="flex border-b border-border bg-card rounded-t border-x border-t">
            {(["tasks", "workNotes", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
                  ${activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground/80"
                  }`}
              >
                {tab === "tasks"
                  ? `Work Order Tasks (${tasks.length})`
                  : tab === "workNotes"
                    ? "Work Notes"
                    : `Activity (${activityLogs.length})`}
              </button>
            ))}
          </div>

          <div className="bg-card border-x border-b border-border rounded-b">
            {/* Tasks tab */}
            {activeTab === "tasks" && (
              <div>
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Task #</th>
                      <th>Short Description</th>
                      <th>State</th>
                      <th>Assignee</th>
                      <th>Est. Hrs</th>
                      <th>Actual Hrs</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task: WOTaskRow) => {
                      const tState = TASK_STATE[task.state as WOTaskState];
                      return (
                        <tr key={task.id}>
                          <td className="font-mono text-primary">{task.number}</td>
                          <td>{task.shortDescription}</td>
                          <td>
                            <span className={`status-badge ${tState?.color ?? ""}`}>
                              {tState?.label ?? task.state}
                            </span>
                          </td>
                          <td className="text-muted-foreground">
                            {task.assignedToId ? (
                              <span className="flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                                  TS
                                </span>
                                Tech Support
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="text-center">{task.estimatedHours ?? "—"}</td>
                          <td className="text-center">
                            <input
                              type="number"
                              defaultValue={task.actualHours ?? undefined}
                              className="w-12 text-center border border-border rounded px-1 py-0.5 text-[11px]"
                              onBlur={(e) =>
                                updateTask.mutate({
                                  id: task.id,
                                  actualHours: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </td>
                          <td>
                            {task.state !== "complete" && task.state !== "closed" && task.state !== "cancelled" && (
                              <button
                                onClick={() => updateTask.mutate({ id: task.id, state: "complete" })}
                                className="text-[11px] text-green-700 hover:underline flex items-center gap-0.5"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-muted-foreground/70 text-[12px]">
                          No tasks yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-border">
                  <button className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <Plus className="w-3 h-3" /> Add Task
                  </button>
                </div>
              </div>
            )}

            {/* Work Notes */}
            {activeTab === "workNotes" && (
              <div className="p-4 space-y-4">
                {/* Note composer */}
                <div className="border border-border rounded">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <button
                      onClick={() => setIsInternal(true)}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded ${isInternal ? "bg-yellow-100 text-yellow-700 font-medium" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Lock className="w-3 h-3" /> Internal Note
                    </button>
                    <button
                      onClick={() => setIsInternal(false)}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded ${!isInternal ? "bg-blue-100 text-blue-700 font-medium" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Globe className="w-3 h-3" /> Customer Note
                    </button>
                  </div>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={4}
                    placeholder="Add work notes or comments..."
                    className="w-full px-3 py-2 text-[12px] text-foreground/80 resize-none outline-none"
                  />
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
                    <span className="text-[11px] text-muted-foreground">
                      {isInternal ? (
                        <span className="text-yellow-600">Internal — not visible to customer</span>
                      ) : (
                        <span className="text-blue-600">Visible to requester</span>
                      )}
                    </span>
                    <button
                      disabled={!noteText.trim() || addNote.isPending}
                      onClick={() =>
                        addNote.mutate({ workOrderId: wo.id, note: noteText, isInternal })
                      }
                      className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-40"
                    >
                      {addNote.isPending ? "Saving..." : "Post Note"}
                    </button>
                  </div>
                </div>

                {/* Note list */}
                <div className="space-y-3">
                  {activityLogs
                    .filter((l: WOActivityLogRow) => l.action === "note")
                    .map((log: WOActivityLogRow) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded border ${log.isInternal ? "bg-yellow-50 border-yellow-200" : "bg-card border-border"}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                              SU
                            </span>
                            <span className="text-[11px] font-medium text-foreground/80">System User</span>
                            {log.isInternal && (
                              <span className="status-badge text-yellow-700 bg-yellow-100">
                                <Lock className="w-2.5 h-2.5 inline mr-0.5" /> Internal
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground/70">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">{log.note}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Activity */}
            {activeTab === "activity" && (
              <div className="p-4">
                <div className="space-y-0">
                  {activityLogs.map((log: WOActivityLogRow, i: number) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {i < activityLogs.length - 1 && (
                          <div className="w-px flex-1 bg-border my-0.5" />
                        )}
                      </div>
                      <div className="pb-3 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-foreground/80 capitalize">
                            {log.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {log.note && (
                          <p className="text-[12px] text-muted-foreground mt-0.5">{log.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/70 text-center py-6">
                      No activity yet
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right — details panel */}
        <div className="w-64 flex-shrink-0 space-y-3">
          {/* Details */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Work Order Details
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Number">{wo.number}</FieldRow>
              <FieldRow label="State">
                <span className="status-badge text-muted-foreground bg-muted capitalize">
                  {wo.state.replace(/_/g, " ")}
                </span>
              </FieldRow>
              <FieldRow label="Priority">
                <span className={`text-[11px] font-semibold`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${PRIORITY_COLORS[wo.priority]}`} />
                  {PRIORITY_LABELS[wo.priority]}
                </span>
              </FieldRow>
              <FieldRow label="Type">{wo.type?.replace(/_/g, " ") ?? "—"}</FieldRow>
              <FieldRow label="Category">{wo.category ?? "—"}</FieldRow>
              <FieldRow label="Subcategory">{wo.subcategory ?? "—"}</FieldRow>
              <FieldRow label="CI / Asset">{wo.cmdbCi ?? "—"}</FieldRow>
            </div>
          </div>

          {/* Assignment */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Assignment
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Assigned to">
                {wo.assignedToId ? (
                  <span className="flex items-center gap-1">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                      TS
                    </span>
                    Tech Support
                  </span>
                ) : (
                  <span className="text-muted-foreground/70 italic">Unassigned</span>
                )}
              </FieldRow>
              <FieldRow label="Requested by">
                <span className="text-muted-foreground">
                  {wo.requestedById ? "System Admin" : "—"}
                </span>
              </FieldRow>
              <FieldRow label="Location">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-3 h-3 text-muted-foreground/70" />
                  {wo.location ?? "—"}
                </span>
              </FieldRow>
            </div>
          </div>

          {/* Schedule & Time */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Schedule & Time
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Sched. Start">{formatDt(wo.scheduledStartDate)}</FieldRow>
              <FieldRow label="Sched. End">{formatDt(wo.scheduledEndDate)}</FieldRow>
              <FieldRow label="Actual Start">{formatDt(wo.actualStartDate)}</FieldRow>
              <FieldRow label="Actual End">{formatDt(wo.actualEndDate)}</FieldRow>
              <FieldRow label="Est. Hours">
                <span className="flex items-center gap-1">
                  <Hourglass className="w-3 h-3 text-muted-foreground/70" />
                  {wo.estimatedHours ?? "—"} hrs
                </span>
              </FieldRow>
              <FieldRow label="Actual Hours">
                {tasks.reduce((s: number, t: WOTaskRow) => s + (t.actualHours ?? 0), 0)} hrs
              </FieldRow>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Record Info
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Created">{formatDt(wo.createdAt)}</FieldRow>
              <FieldRow label="Updated">{formatDt(wo.updatedAt)}</FieldRow>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
