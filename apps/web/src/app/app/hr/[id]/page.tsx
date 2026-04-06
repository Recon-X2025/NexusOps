"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  UserCircle, ChevronLeft, CheckCircle2,
  FileText, Send, Calendar, Building2, Shield, Users,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { formatRelativeTime } from "@/lib/utils";

export default function HRCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("tasks");
  const [noteText, setNoteText] = useState("");
  const { can } = useRBAC();

  const caseQuery = trpc.hr.cases.get.useQuery({ id }, { enabled: !!id });

  const completeTask = trpc.hr.cases.completeTask.useMutation({
    onSuccess: () => { toast.success("Task marked complete"); caseQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const addNote = trpc.hr.cases.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); setNoteText(""); caseQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  if (!can("hr", "read")) return <AccessDenied module="HR Service Delivery" />;

  if (caseQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <Link href="/app/hr" className="hover:text-primary flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> HR Service Delivery
          </Link>
          <span>/</span>
          <span className="text-muted-foreground font-medium">Loading…</span>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="bg-card border border-border rounded p-4 space-y-3">
            <div className="h-5 bg-muted rounded w-32" />
            <div className="h-6 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!caseQuery.data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <Link href="/app/hr" className="hover:text-primary flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> HR Service Delivery
          </Link>
          <span>/</span>
          <span className="text-muted-foreground font-medium">{id}</span>
        </div>
        <div className="p-8 text-center bg-card border border-border rounded">
          <p className="text-[12px] text-muted-foreground/50">Case not found</p>
          <Link href="/app/hr" className="mt-3 inline-block text-[11px] text-primary hover:underline">← Back to HR cases</Link>
        </div>
      </div>
    );
  }

  const { hrCase, employee, tasks } = caseQuery.data;
  const doneTasks = tasks.filter((t: any) => t.status === "done").length;
  const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const notesLines = hrCase.notes
    ? hrCase.notes.split("\n\n").filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <Link href="/app/hr" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> HR Service Delivery
        </Link>
        <span>/</span>
        <span className="text-muted-foreground font-medium">{hrCase.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <UserCircle className="w-4 h-4 text-primary" />
              <span className="font-mono text-[11px] text-primary">{hrCase.id.slice(0, 8).toUpperCase()}</span>
              <span className="status-badge text-blue-700 bg-blue-100">{hrCase.caseType}</span>
              <span className="status-badge text-yellow-700 bg-yellow-100">Priority: {hrCase.priority}</span>
            </div>
            <h1 className="text-[14px] font-bold text-foreground mb-1">
              {hrCase.caseType.charAt(0).toUpperCase() + hrCase.caseType.slice(1)} Case
            </h1>
            {hrCase.notes && (
              <p className="text-[12px] text-muted-foreground mb-2 leading-relaxed line-clamp-2">
                {hrCase.notes.split("\n\n")[0]?.replace(/^\[.+?\]\s*/, "")}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Opened: <strong className="text-foreground/80">{new Date(hrCase.createdAt).toLocaleDateString()}</strong></span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Assignee: <strong className="text-foreground/80">{hrCase.assigneeId ? hrCase.assigneeId.slice(0, 8) : "Unassigned"}</strong></span>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[28px] font-black text-primary leading-none">{pct}%</div>
            <div className="text-[11px] text-muted-foreground/70">Tasks Complete</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{doneTasks} of {tasks.length} done</div>
            <div className="w-28 h-2 bg-border rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Employee card */}
      <div className="bg-card border border-border rounded p-4">
        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Employee Details</p>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary text-white font-bold text-[14px] flex items-center justify-center flex-shrink-0">
            {employee.employeeId?.slice(0, 2).toUpperCase() ?? "EE"}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-1.5 text-[11px]">
            {[
              { label: "Employee ID", value: employee.employeeId },
              { label: "Department",  value: employee.department },
              { label: "Title",       value: employee.title },
              { label: "Location",    value: employee.location },
              { label: "Type",        value: employee.employmentType },
              { label: "Status",      value: employee.status },
            ].filter((f) => f.value).map((f) => (
              <div key={f.label}>
                <span className="text-muted-foreground/70">{f.label}: </span>
                <span className="text-foreground/80 font-medium">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {[
          { key: "tasks",  label: `Tasks (${tasks.length})` },
          { key: "notes",  label: "Work Notes" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "tasks" && (
          tasks.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-muted-foreground/60">No tasks for this case yet.</div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} className={t.status === "done" ? "opacity-50" : ""}>
                    <td className={`text-foreground ${t.status === "done" ? "line-through" : ""}`}>{t.title}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <span className={`status-badge capitalize ${
                        t.status === "done" ? "text-green-700 bg-green-100" :
                        t.status === "in_progress" ? "text-blue-700 bg-blue-100" :
                        "text-muted-foreground bg-muted"
                      }`}>{t.status.replace("_", " ")}</span>
                    </td>
                    <td>
                      {t.status !== "done" && (
                        <PermissionGate module="hr" action="write">
                          <button
                            onClick={() => completeTask.mutate({ taskId: t.id })}
                            disabled={completeTask.isPending}
                            className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Complete
                          </button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "notes" && (
          <div className="p-4">
            <PermissionGate module="hr" action="write">
              <div className="border border-border rounded overflow-hidden mb-4">
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] outline-none resize-none bg-background"
                  placeholder="Add internal work note..."
                />
                <div className="flex justify-end px-3 py-2 bg-muted/30 border-t border-border">
                  <button
                    onClick={() => {
                      if (!noteText.trim()) { toast.error("Note cannot be empty"); return; }
                      addNote.mutate({ caseId: hrCase.id, note: noteText.trim() });
                    }}
                    disabled={addNote.isPending || !noteText.trim()}
                    className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60"
                  >
                    <Send className="w-3 h-3" /> {addNote.isPending ? "Saving…" : "Add Note"}
                  </button>
                </div>
              </div>
            </PermissionGate>

            {notesLines.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 text-center">No work notes yet.</p>
            ) : (
              <div className="space-y-3">
                {notesLines.slice().reverse().map((line: any, i) => {
                  const match = line.match(/^\[(.+?)\]\s*([\s\S]*)/);
                  const ts = match ? match[1] : "";
                  const text = match ? match[2] : line;
                  return (
                    <div key={i} className="bg-muted/30 border border-border/50 rounded p-3">
                      {ts && <p className="text-[10px] text-muted-foreground/60 mb-1">{new Date(ts).toLocaleString()}</p>}
                      <p className="text-[12px] text-foreground/80 whitespace-pre-wrap">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
