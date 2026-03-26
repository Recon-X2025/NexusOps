"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  UserCircle, ChevronLeft, Clock, CheckCircle2, AlertTriangle,
  FileText, Send, Paperclip, Calendar, Building2, Shield, Users,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";

export default function HRCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("tasks");
  const { can } = useRBAC();

  // @ts-ignore — hr.cases.get procedure is pending in the HR router (only list/create/triggerOnboarding exist currently)
  const caseQuery = trpc.hr.cases.get.useQuery({ id });

  if (!can("hr", "read")) return <AccessDenied module="HR Service Delivery" />;

  // Skeleton while fetching
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
            <div className="flex gap-2">
              <div className="h-5 bg-muted rounded w-32" />
              <div className="h-5 bg-muted rounded w-20" />
              <div className="h-5 bg-muted rounded w-16" />
            </div>
            <div className="h-6 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded p-4 h-40" />
            <div className="bg-card border border-border rounded p-4 h-40" />
          </div>
        </div>
      </div>
    );
  }

  // hr.cases.get is not yet implemented — show empty state when not found
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
          <p className="text-[11px] text-muted-foreground/40 mt-1">The HR case you are looking for does not exist or has been removed</p>
          <Link href="/app/hr" className="mt-3 inline-block text-[11px] text-primary hover:underline">← Back to HR cases</Link>
        </div>
      </div>
    );
  }
  const hrCase = caseQuery.data as any;

  const doneTasks = (hrCase.tasks ?? []).filter((t: any) => t.state === "done").length;
  const pct = hrCase.tasks?.length ? Math.round((doneTasks / hrCase.tasks.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <Link href="/app/hr" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> HR Service Delivery
        </Link>
        <span>/</span>
        <span className="text-muted-foreground font-medium">{hrCase.number}</span>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <UserCircle className="w-4 h-4 text-primary" />
              <span className="font-mono text-[11px] text-primary">{hrCase.number}</span>
              <span className="status-badge text-blue-700 bg-blue-100">{hrCase.type}</span>
              <span className={`status-badge ${hrCase.state === "open" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>● Open</span>
              <span className="status-badge text-yellow-700 bg-yellow-100">Priority: {hrCase.priority}</span>
            </div>
            <h1 className="text-[14px] font-bold text-foreground mb-1">{hrCase.subject}</h1>
            <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">{hrCase.description}</p>
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span>Assigned To: <strong className="text-foreground/80">{hrCase.assignedTo}</strong></span>
              <span>Opened: <strong className="text-foreground/80">{hrCase.opened}</strong></span>
              <span>Target Date: <strong className="text-foreground/80">{hrCase.dueDate}</strong></span>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[28px] font-black text-primary leading-none">{pct}%</div>
            <div className="text-[11px] text-muted-foreground/70">Tasks Complete</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{doneTasks} of {hrCase.tasks.length} done</div>
            <div className="w-28 h-2 bg-border rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Employee card */}
        <div className="bg-card border border-border rounded p-4">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Employee Details</p>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary text-white font-bold text-[14px] flex items-center justify-center flex-shrink-0">
              {hrCase.employee.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-1.5 text-[11px]">
              {[
                { label: "Full Name",    value: hrCase.employee.name },
                { label: "Employee ID", value: hrCase.employee.employeeId },
                { label: "Title",       value: hrCase.employee.title },
                { label: "Department",  value: hrCase.employee.department },
                { label: "Manager",     value: hrCase.employee.manager },
                { label: "Start Date",  value: hrCase.employee.startDate },
                { label: "Location",    value: hrCase.employee.location },
                { label: "Work Mode",   value: hrCase.employee.workMode },
                { label: "Email",       value: hrCase.employee.email },
              ].map((f) => (
                <div key={f.label}>
                  <span className="text-muted-foreground/70">{f.label}: </span>
                  <span className="text-foreground/80 font-medium">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-card border border-border rounded p-4">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Tasks by Category</p>
          <div className="space-y-2">
            {["HR","IT","Facilities","Security","Engineering","Procurement"].map((cat) => {
              const catTasks = hrCase.tasks.filter(t => t.category === cat);
              if (catTasks.length === 0) return null;
              const doneCat = catTasks.filter(t => t.state === "done").length;
              return (
                <div key={cat} className="flex items-center gap-2">
                  <span className={`status-badge w-20 justify-center ${CAT_COLOR[cat] ?? "text-muted-foreground bg-muted"}`}>{cat}</span>
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((doneCat/catTasks.length)*100)}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-10 text-right">{doneCat}/{catTasks.length}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {[
          { key: "tasks",     label: `Tasks (${hrCase.tasks.length})` },
          { key: "timeline",  label: "Timeline" },
          { key: "documents", label: "Documents" },
          { key: "notes",     label: "Work Notes" },
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
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Task ID</th>
                <th>Category</th>
                <th>Task</th>
                <th>Owner</th>
                <th>Due</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hrCase.tasks.map((t) => (
                <tr key={t.id} className={t.state === "done" ? "opacity-50" : ""}>
                  <td className="p-0"><div className={`priority-bar ${t.state === "done" ? "bg-green-500" : t.state === "in_progress" ? "bg-blue-500" : "bg-border"}`} /></td>
                  <td className="font-mono text-[11px] text-primary">{t.id}</td>
                  <td><span className={`status-badge ${CAT_COLOR[t.category] ?? "text-muted-foreground bg-muted"}`}>{t.category}</span></td>
                  <td className={`text-foreground ${t.state === "done" ? "line-through" : ""}`}>{t.title}</td>
                  <td className="text-muted-foreground">{t.owner}</td>
                  <td className="font-mono text-[11px] text-muted-foreground">{t.due}</td>
                  <td><span className={`status-badge capitalize ${TASK_STATE_COLOR[t.state]}`}>{t.state.replace("_", " ")}</span></td>
                  <td>
                    {t.state !== "done" && (
                      <PermissionGate module="hr" action="write">
                        <button className="text-[11px] text-primary hover:underline">Complete</button>
                      </PermissionGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "timeline" && (
          <div className="p-4">
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              {hrCase.timeline.map((e, i) => (
                <div key={i} className="flex gap-4 pl-8 relative mb-3">
                  <div className="absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-white bg-primary" />
                  <div>
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground/70">{e.date}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground">{e.actor}</span>
                    </div>
                    <p className="text-[12px] text-foreground/80 leading-relaxed">{e.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "documents" && (
          <table className="ent-table w-full">
            <thead>
              <tr><th>Document</th><th>Type</th><th>Uploaded By</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {hrCase.documents.map((d, i) => (
                <tr key={i}>
                  <td>
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
                      <span className="text-foreground">{d.name}</span>
                    </div>
                  </td>
                  <td><span className="status-badge text-muted-foreground bg-muted">{d.type}</span></td>
                  <td className="text-muted-foreground">{d.uploadedBy}</td>
                  <td className="text-muted-foreground/70 text-[11px]">{d.date}</td>
                  <td><button className="text-[11px] text-primary hover:underline">Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "notes" && (
          <div className="p-4">
            <PermissionGate module="hr" action="write">
              <div className="border border-border rounded overflow-hidden mb-4">
                <textarea rows={3} className="w-full px-3 py-2 text-[12px] outline-none resize-none"
                  placeholder="Add internal work note..." />
                <div className="flex justify-end px-3 py-2 bg-muted/30 border-t border-border">
                  <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                    <Send className="w-3 h-3" /> Add Note
                  </button>
                </div>
              </div>
            </PermissionGate>
            <p className="text-[11px] text-muted-foreground/70 text-center">No work notes yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
