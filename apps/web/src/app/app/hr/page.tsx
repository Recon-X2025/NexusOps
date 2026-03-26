"use client";

import { useState, useEffect } from "react";
import { UserCheck, Plus, CheckCircle2, Clock, FileText, ChevronRight, Loader2 } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

const HR_TABS = [
  { key: "cases",       label: "HR Cases",          module: "hr"         as const, action: "read"  as const },
  { key: "onboarding",  label: "Onboarding",         module: "onboarding" as const, action: "read"  as const },
  { key: "offboarding", label: "Offboarding",        module: "hr"         as const, action: "write" as const },
  { key: "lifecycle",   label: "Lifecycle Events",   module: "hr"         as const, action: "write" as const },
  { key: "documents",   label: "Employee Documents", module: "hr"         as const, action: "read"  as const },
];

const ONBOARDING = [
  { id: "ONB-2026-031", employee: "Priya Sharma", role: "Senior Security Engineer", startDate: "2026-04-01", dept: "Security", progress: 68, totalTasks: 22, completedTasks: 15, buddy: "Alex Rivera", daysTilStart: 8, state: "active" },
  { id: "ONB-2026-030", employee: "Marcus Webb", role: "SAP FICO Consultant", startDate: "2026-03-25", dept: "ERP", progress: 91, totalTasks: 18, completedTasks: 16, buddy: "Sam Okafor", daysTilStart: 1, state: "active" },
  { id: "ONB-2026-029", employee: "Chen Li", role: "Data Engineer", startDate: "2026-03-18", dept: "Analytics", progress: 100, totalTasks: 20, completedTasks: 20, buddy: "Taylor Patel", daysTilStart: 0, state: "complete" },
  { id: "ONB-2026-028", employee: "Sofia Morales", role: "Product Manager — ITSM", startDate: "2026-04-14", dept: "Product", progress: 22, totalTasks: 25, completedTasks: 5, buddy: "Morgan Lee", daysTilStart: 21, state: "preparation" },
];

const OFFBOARDING = [
  { id: "OFB-2026-011", employee: "Chris Duncan", role: "Network Engineer", lastDay: "2026-03-31", reason: "Resignation", progress: 45, accessRevoked: false, equipmentReturned: false, kbDocumented: true, exitInterview: false },
  { id: "OFB-2026-010", employee: "Nancy Hill", role: "HR Generalist", lastDay: "2026-03-28", reason: "Retirement", progress: 78, accessRevoked: false, equipmentReturned: true, kbDocumented: true, exitInterview: true },
  { id: "OFB-2026-009", employee: "Devon Park", role: "Junior Developer", lastDay: "2026-03-20", reason: "Termination", progress: 100, accessRevoked: true, equipmentReturned: true, kbDocumented: false, exitInterview: false },
];

const LIFECYCLE = [
  { id: "LCE-0291", type: "Promotion", employee: "Jordan Chen", from: "Senior Engineer", to: "Lead Engineer", effective: "2026-04-01", approvedBy: "CTO", state: "approved", hrActions: 4, itActions: 2 },
  { id: "LCE-0290", type: "Department Transfer", employee: "Sam Okafor", from: "ERP", to: "Platform Engineering", effective: "2026-04-01", approvedBy: "VP Eng", state: "in_progress", hrActions: 3, itActions: 5 },
  { id: "LCE-0289", type: "Leave of Absence", employee: "Riley Brown", from: "Active", to: "Parental Leave (12 wk)", effective: "2026-04-15", approvedBy: "HR Director", state: "approved", hrActions: 6, itActions: 1 },
  { id: "LCE-0288", type: "Return from Leave", employee: "Alex Kim", from: "Medical Leave", to: "Active", effective: "2026-03-24", approvedBy: "HR", state: "complete", hrActions: 3, itActions: 3 },
];

const CASE_STATE_COLOR: Record<string, string> = {
  open:              "text-blue-700 bg-blue-100",
  in_progress:       "text-orange-700 bg-orange-100",
  pending_approval:  "text-yellow-700 bg-yellow-100",
  awaiting_employee: "text-muted-foreground bg-muted",
  resolved:          "text-green-700 bg-green-100",
  closed:            "text-muted-foreground bg-muted",
};

export default function HRPage() {
  const { can } = useRBAC();

  const visibleTabs = HR_TABS.filter((t) => can(t.module, t.action));

  const defaultTab = visibleTabs[0]?.key ?? "";
  const [tab, setTab] = useState(defaultTab);

  // If the active tab is no longer visible after a role switch, reset to first visible
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) {
      setTab(visibleTabs[0]?.key ?? "");
    }
  }, [visibleTabs, tab]);

  if (!can("hr", "read") && !can("onboarding", "read")) {
    return <AccessDenied module="HR Service Delivery" />;
  }

  const { data: casesData, isLoading: casesLoading } = trpc.hr.cases.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  // employees list wired — available for onboarding/headcount features
  const { data: _employeesData } = trpc.hr.employees.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );

  // cases.list returns { hrCase, employee }[] join — access via c.hrCase.xxx / c.employee.xxx
  type HRCaseRow = NonNullable<typeof casesData>[number];
  const hrCases: HRCaseRow[] = casesData ?? [];

  // statusId is null when no status ticket is linked (treated as open)
  const openCases = hrCases.filter((c) => !c.hrCase?.statusId).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">HR Service Delivery</h1>
          <span className="text-[11px] text-muted-foreground/70">HR Cases · Onboarding · Offboarding · Lifecycle</span>
        </div>
        {can("hr", "write") && (
          <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> New HR Case
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Open HR Cases",      value: openCases,                                                     color: "text-blue-700" },
          { label: "Active Onboardings", value: ONBOARDING.filter(o => o.state === "active").length,           color: "text-green-700" },
          { label: "Pending Offboarding",value: OFFBOARDING.filter(o => o.progress < 100).length,             color: "text-orange-700" },
          { label: "Lifecycle Events",   value: LIFECYCLE.filter(l => l.state !== "complete").length,          color: "text-purple-700" },
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
        {tab === "cases" && (
          casesLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading HR cases…</span>
            </div>
          ) : hrCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <FileText className="w-5 h-5 opacity-30" />
              <span className="text-xs">No HR cases found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Case #</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Employee</th>
                  <th>Dept</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Opened</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {hrCases.map((c) => {
                  // DB returns nested { hrCase: {...}, employee: {...} } from the inner join
                  const caseStatus = c.hrCase?.statusId ? "in_progress" : "open";
                  const casePriority = c.hrCase?.priority ?? "low";
                  return (
                    <tr key={c.hrCase?.id ?? ""}>
                      <td className="p-0"><div className={`priority-bar ${casePriority === "high" ? "bg-orange-500" : casePriority === "medium" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{c.hrCase?.id?.slice(-8)?.toUpperCase() ?? "—"}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{c.hrCase?.caseType ?? "—"}</span></td>
                      <td className="max-w-xs"><span className="truncate block text-foreground">{c.hrCase?.notes ?? "—"}</span></td>
                      <td className="text-muted-foreground">{c.employee?.employeeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{c.employee?.department ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${CASE_STATE_COLOR[caseStatus] ?? "text-muted-foreground bg-muted"}`}>{caseStatus.replace(/_/g, " ")}</span></td>
                      <td><span className={`status-badge capitalize ${casePriority === "high" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{casePriority}</span></td>
                      <td className="text-muted-foreground">{c.hrCase?.assigneeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">
                        {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toISOString().split("T")[0] : "—"}
                      </td>
                      <td className="text-muted-foreground text-[11px]">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "onboarding" && (
          <div className="divide-y divide-border">
            {ONBOARDING.map((o) => (
              <div key={o.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[11px]">
                      {o.employee.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-semibold text-foreground">{o.employee}</span>
                        <span className={`status-badge capitalize ${o.state === "complete" ? "text-green-700 bg-green-100" : o.state === "active" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>{o.state}</span>
                        {o.daysTilStart <= 1 && o.state !== "complete" && (
                          <span className="status-badge text-red-700 bg-red-100 font-semibold">⚠ Starts {o.daysTilStart === 0 ? "today" : "tomorrow"}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{o.role} · {o.dept} · Buddy: {o.buddy}</div>
                      <div className="text-[11px] text-muted-foreground/70">Start Date: {o.startDate} · Tasks: {o.completedTasks}/{o.totalTasks}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${o.progress === 100 ? "bg-green-500" : o.daysTilStart <= 1 ? "bg-orange-500" : "bg-primary"}`}
                          style={{ width: `${o.progress}%` }} />
                      </div>
                      <span className="text-[12px] font-semibold text-foreground/80">{o.progress}%</span>
                    </div>
                    <button className="flex items-center gap-1 px-2 py-1 text-[11px] text-primary border border-primary/30 rounded hover:bg-primary/5">
                      View Tasks <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "offboarding" && (
          <div className="divide-y divide-border">
            {OFFBOARDING.map((o) => (
              <div key={o.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-foreground">{o.employee}</span>
                      <span className="text-[11px] text-muted-foreground">{o.role}</span>
                      <span className="status-badge text-muted-foreground bg-muted">{o.reason}</span>
                      <span className={`status-badge ${o.progress === 100 ? "text-green-700 bg-green-100" : o.progress < 50 ? "text-red-700 bg-red-100" : "text-yellow-700 bg-yellow-100"}`}>
                        {o.progress}% complete
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-2">Last Day: {o.lastDay}</div>
                    <div className="flex gap-4 text-[11px]">
                      {[
                        { label: "Access Revoked",      done: o.accessRevoked },
                        { label: "Equipment Returned",  done: o.equipmentReturned },
                        { label: "KB Documented",       done: o.kbDocumented },
                        { label: "Exit Interview",      done: o.exitInterview },
                      ].map((item) => (
                        <div key={item.label} className={`flex items-center gap-1 ${item.done ? "text-green-700" : "text-red-600"}`}>
                          {item.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-20 h-2 bg-border rounded-full overflow-hidden self-center">
                    <div className={`h-full rounded-full ${o.progress === 100 ? "bg-green-500" : o.progress < 50 ? "bg-red-500" : "bg-yellow-400"}`}
                      style={{ width: `${o.progress}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "lifecycle" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Event Type</th>
                <th>Employee</th>
                <th>Transition</th>
                <th>Effective Date</th>
                <th>Approved By</th>
                <th>State</th>
                <th className="text-center">HR Tasks</th>
                <th className="text-center">IT Tasks</th>
              </tr>
            </thead>
            <tbody>
              {LIFECYCLE.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-[11px] text-primary">{l.id}</td>
                  <td><span className="status-badge text-blue-700 bg-blue-100">{l.type}</span></td>
                  <td className="font-medium text-foreground">{l.employee}</td>
                  <td className="text-[11px] text-muted-foreground">{l.from} → {l.to}</td>
                  <td className="text-[11px] text-muted-foreground">{l.effective}</td>
                  <td className="text-muted-foreground">{l.approvedBy}</td>
                  <td>
                    <span className={`status-badge capitalize ${l.state === "complete" ? "text-green-700 bg-green-100" : l.state === "approved" ? "text-blue-700 bg-blue-100" : "text-orange-700 bg-orange-100"}`}>
                      {l.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="text-center font-semibold">{l.hrActions}</td>
                  <td className="text-center font-semibold">{l.itActions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "documents" && (
          <div className="p-4 text-center text-muted-foreground text-[12px]">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            Employee document repository — contracts, offer letters, performance reviews, and compliance certifications.
            <div className="mt-3">
              <button className="px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">Browse Documents</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
