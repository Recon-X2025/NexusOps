"use client";

import React, { useState, useEffect } from "react";
import { UserCheck, Plus, CheckCircle2, Clock, FileText, ChevronRight, Loader2, IndianRupee, AlertTriangle, RefreshCw } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const HR_TABS = [
  { key: "cases",       label: "HR Cases",            module: "hr"         as const, action: "read"  as const },
  { key: "onboarding",  label: "Onboarding",           module: "onboarding" as const, action: "read"  as const },
  { key: "offboarding", label: "Offboarding",          module: "hr"         as const, action: "write" as const },
  { key: "lifecycle",   label: "Lifecycle Events",     module: "hr"         as const, action: "write" as const },
  { key: "payroll_compliance", label: "Payroll Compliance", module: "hr"   as const, action: "admin" as const },
  { key: "documents",   label: "Employee Documents",   module: "hr"         as const, action: "read"  as const },
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


  const { data: casesData, isLoading: casesLoading } = trpc.hr.cases.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  // employees list wired — available for onboarding/headcount features
  const { data: _employeesData } = trpc.hr.employees.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );

  // India payroll compliance — TDS challans + EPFO ECR
  const tdsChallansQuery = (trpc as any).indiaCompliance.tdsChallans.list.useQuery({}, { refetchOnWindowFocus: false });
  const epfoEcrQuery     = (trpc as any).indiaCompliance.epfoEcr.list.useQuery({}, { refetchOnWindowFocus: false });
  const markTdsPaid      = (trpc as any).indiaCompliance.tdsChallans.markPaid.useMutation({ onSuccess: () => { tdsChallansQuery.refetch(); setTdsPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const markEcrSubmitted = (trpc as any).indiaCompliance.epfoEcr.markSubmitted.useMutation({ onSuccess: () => { epfoEcrQuery.refetch(); setEcrPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const utils = trpc.useUtils();
  const createHRCase = trpc.hr.cases.create.useMutation({
    onSuccess: () => {
      toast.success("HR Case created successfully");
      utils.hr.cases.list.invalidate();
      setShowCaseForm(false);
      setCaseForm({ employeeId: "", caseType: "policy", notes: "" });
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const [caseForm, setCaseForm] = useState({ employeeId: "", caseType: "policy" as const, notes: "" });
  const tdsChallans: any[] = tdsChallansQuery.data ?? [];
  const epfoEcrs: any[]    = epfoEcrQuery.data ?? [];

  const [tdsPanel, setTdsPanel]   = useState<string | null>(null);
  const [tdsForm, setTdsForm]     = useState({ bsrCode: "", challanNumber: "", paymentDate: new Date().toISOString().split("T")[0], totalDeposited: "" });
  const [ecrPanel, setEcrPanel]   = useState<string | null>(null);
  const [ecrAck, setEcrAck]       = useState("");
  const [showCaseForm, setShowCaseForm] = useState(false);

  if (!can("hr", "read") && !can("onboarding", "read")) {
    return <AccessDenied module="HR Service Delivery" />;
  }

  const pendingTDS  = tdsChallans.filter((c: any) => c.status === "pending" || c.status === "overdue").length;
  const pendingECR  = epfoEcrs.filter((e: any) => e.status === "pending").length;

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
          <button
            onClick={() => setShowCaseForm(true)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New HR Case
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Open HR Cases",       value: openCases,                                                                                             color: "text-blue-700" },
          { label: "Active Onboardings",  value: hrCases.filter((c) => c.hrCase.caseType === "onboarding").length,                                        color: "text-green-700" },
          { label: "Pending Offboarding", value: hrCases.filter((c) => c.hrCase.caseType === "offboarding").length,                                       color: "text-orange-700" },
          { label: "TDS / ECR Pending",   value: pendingTDS + pendingECR,                                                                                 color: pendingTDS + pendingECR > 0 ? "text-red-600" : "text-muted-foreground" },
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
            {casesLoading ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">Loading onboarding cases…</div>
            ) : hrCases.filter((c) => c.hrCase.caseType === "onboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active onboarding cases.</div>
            ) : hrCases.filter((c) => c.hrCase.caseType === "onboarding").map((c) => (
              <div key={c.hrCase.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[11px]">
                      {c.employee.employeeId?.slice(0, 2).toUpperCase() ?? "EE"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-semibold text-foreground">{c.employee.employeeId ?? c.hrCase.employeeId.slice(0, 8)}</span>
                        <span className={`status-badge capitalize text-blue-700 bg-blue-100`}>Onboarding</span>
                        <span className={`status-badge ${c.hrCase.priority === "high" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>Priority: {c.hrCase.priority}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{c.employee.title ?? "—"} · {c.employee.department ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground/70">Opened: {new Date(c.hrCase.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <a
                    href={`/app/hr/${c.hrCase.id}`}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-primary border border-primary/30 rounded hover:bg-primary/5"
                  >
                    View Tasks <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "offboarding" && (
          <div className="divide-y divide-border">
            {casesLoading ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">Loading offboarding cases…</div>
            ) : hrCases.filter((c) => c.hrCase.caseType === "offboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active offboarding cases.</div>
            ) : hrCases.filter((c) => c.hrCase.caseType === "offboarding").map((c) => (
              <div key={c.hrCase.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-foreground">{c.employee.employeeId ?? c.hrCase.employeeId.slice(0, 8)}</span>
                      <span className="text-[11px] text-muted-foreground">{c.employee.title ?? "—"}</span>
                      <span className="status-badge text-muted-foreground bg-muted">Offboarding</span>
                      <span className={`status-badge ${c.hrCase.priority === "high" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>
                        Priority: {c.hrCase.priority}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-2">Opened: {new Date(c.hrCase.createdAt).toLocaleDateString()}</div>
                  </div>
                  <a
                    href={`/app/hr/${c.hrCase.id}`}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-primary border border-primary/30 rounded hover:bg-primary/5"
                  >
                    View Tasks <ChevronRight className="w-3 h-3" />
                  </a>
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
              {(hrCases.filter((c) => ["transfer","promotion","leave","return_from_leave","role_change"].includes(c.hrCase.caseType)).length > 0
                ? hrCases.filter((c) => ["transfer","promotion","leave","return_from_leave","role_change"].includes(c.hrCase.caseType)).map((c) => (
                    <tr key={c.hrCase.id}>
                      <td className="font-mono text-[11px] text-primary">{c.hrCase.number ?? c.hrCase.id?.slice(0,8)}</td>
                      <td><span className="status-badge text-blue-700 bg-blue-100 capitalize">{(c.hrCase.caseType ?? "lifecycle").replace(/_/g," ")}</span></td>
                      <td className="font-medium text-foreground">{c.employee?.name ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{c.hrCase.description ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{c.hrCase.targetDate ? new Date(c.hrCase.targetDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="text-muted-foreground">{c.hrCase.assignedToId ?? "HR"}</td>
                      <td><span className={`status-badge capitalize ${CASE_STATE_COLOR[c.hrCase.status] ?? ""}`}>{c.hrCase.status?.replace(/_/g," ")}</span></td>
                      <td className="text-center font-semibold">{c.hrCase.tasks?.filter((t: any) => t.category === "hr").length ?? "—"}</td>
                      <td className="text-center font-semibold">{c.hrCase.tasks?.filter((t: any) => t.category === "it").length ?? "—"}</td>
                    </tr>
                  ))
                : [].map((l: any) => (
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
                  ))
              )}
            </tbody>
          </table>
        )}

        {tab === "payroll_compliance" && (
          <div className="p-4 space-y-4">
            {(pendingTDS + pendingECR) > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span><strong>{pendingTDS} TDS challan(s)</strong> and <strong>{pendingECR} EPFO ECR(s)</strong> awaiting action.</span>
              </div>
            )}

            {/* TDS Challans */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">TDS Challans (ITNS 281)</span>
                {tdsChallansQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {tdsChallans.length === 0 && !tdsChallansQuery.isLoading ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground/50">
                  No TDS challans recorded. Run monthly payroll to generate TDS entries.
                </div>
              ) : (
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Form</th>
                      <th>FY</th>
                      <th>Quarter</th>
                      <th>Month</th>
                      <th>TDS Amount</th>
                      <th>Interest</th>
                      <th>Total</th>
                      <th>Due Date</th>
                      <th>BSR Code</th>
                      <th>Challan No.</th>
                      <th>Status</th>
                      <th className="w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tdsChallans.map((c: any) => (
                      <React.Fragment key={c.id}>
                      <tr>
                        <td className="font-mono text-[11px] text-primary">{c.formType}</td>
                        <td className="text-muted-foreground">{c.fy}</td>
                        <td className="text-center text-muted-foreground">Q{c.quarter}</td>
                        <td className="text-muted-foreground">{c.month ?? "—"}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(c.tdsAmount ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-orange-600">₹{Number(c.interestAmount ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right font-semibold text-foreground">₹{Number(c.totalPayable ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{c.dueDateDeposit ? new Date(c.dueDateDeposit).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{c.bsrCode ?? "—"}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{c.challanNumber ?? "—"}</td>
                        <td>
                          <span className={`status-badge text-[10px] ${c.status === "paid" ? "text-green-700 bg-green-100" : c.status === "overdue" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          {c.status !== "paid" && (
                            <button
                              onClick={() => { setTdsPanel(tdsPanel === c.id ? null : c.id); setTdsForm({ bsrCode: "", challanNumber: "", paymentDate: new Date().toISOString().split("T")[0], totalDeposited: "" }); }}
                              className="text-[11px] text-green-700 hover:underline"
                            >{tdsPanel === c.id ? "Cancel" : "Mark Paid"}</button>
                          )}
                        </td>
                      </tr>
                      {tdsPanel === c.id && (
                        <tr key={`${c.id}-tds-panel`}>
                          <td colSpan={13} className="bg-green-50/60 px-4 py-3 border-b border-green-200">
                            <div className="flex items-end gap-3 flex-wrap">
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">BSR Code (7 digits)</label>
                                <input className="border border-border rounded px-2 py-1 text-[12px] w-28" placeholder="0240019" maxLength={7} value={tdsForm.bsrCode} onChange={e => setTdsForm(f => ({ ...f, bsrCode: e.target.value }))} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Challan Serial No.</label>
                                <input className="border border-border rounded px-2 py-1 text-[12px] w-28" placeholder="00123" value={tdsForm.challanNumber} onChange={e => setTdsForm(f => ({ ...f, challanNumber: e.target.value }))} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Payment Date</label>
                                <input type="date" className="border border-border rounded px-2 py-1 text-[12px]" value={tdsForm.paymentDate} onChange={e => setTdsForm(f => ({ ...f, paymentDate: e.target.value }))} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Amount Deposited (₹)</label>
                                <input type="number" className="border border-border rounded px-2 py-1 text-[12px] w-32" placeholder={String(c.totalPayable ?? 0)} value={tdsForm.totalDeposited} onChange={e => setTdsForm(f => ({ ...f, totalDeposited: e.target.value }))} />
                              </div>
                              <button
                                disabled={markTdsPaid.isPending || !tdsForm.bsrCode || !tdsForm.challanNumber || !tdsForm.totalDeposited}
                                onClick={() => markTdsPaid.mutate({ id: c.id, bsrCode: tdsForm.bsrCode, challanSerialNumber: tdsForm.challanNumber, paymentDate: new Date(tdsForm.paymentDate || new Date()) as any, totalDeposited: Number(tdsForm.totalDeposited) } as any)}
                                className="px-3 py-1.5 bg-green-600 text-white text-[11px] rounded hover:bg-green-700 font-medium disabled:opacity-50"
                              >
                                {markTdsPaid.isPending ? "Saving…" : "Confirm Payment"}
                              </button>
                              {markTdsPaid.isError && <span className="text-[11px] text-red-600">{(markTdsPaid.error as any)?.message}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* EPFO ECR */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">EPFO Electronic Challan-cum-Return (ECR)</span>
                {epfoEcrQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {epfoEcrs.length === 0 && !epfoEcrQuery.isLoading ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground/50">
                  No ECR submissions recorded. Use <code className="bg-muted px-1 rounded text-[11px]">hr.payroll.generateECR</code> after running payroll.
                </div>
              ) : (
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Wage Month</th>
                      <th>FY</th>
                      <th>Employees</th>
                      <th>EPF (Employee)</th>
                      <th>EPS (Employer)</th>
                      <th>EDLI</th>
                      <th>Admin</th>
                      <th>Total</th>
                      <th>Due Date</th>
                      <th>TRRN</th>
                      <th>Status</th>
                      <th className="w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epfoEcrs.map((e: any) => (
                      <React.Fragment key={e.id}>
                      <tr>
                        <td className="font-mono text-[11px] text-primary">{e.wageMonth}</td>
                        <td className="text-muted-foreground">{e.fy}</td>
                        <td className="text-center font-semibold">{e.totalEmployees ?? "—"}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(e.totalEpfEmployee ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(e.totalEpsEmployer ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-muted-foreground">₹{Number(e.totalEdli ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-muted-foreground">₹{Number(e.adminCharges ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right font-semibold text-foreground">₹{Number(e.totalChallanAmount ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{e.dueDateDeposit ? new Date(e.dueDateDeposit).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{e.trrn ?? "—"}</td>
                        <td>
                          <span className={`status-badge text-[10px] ${e.status === "submitted" ? "text-green-700 bg-green-100" : e.status === "overdue" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>
                            {e.status}
                          </span>
                        </td>
                        <td>
                          {e.status !== "submitted" && (
                            <button
                              onClick={() => { setEcrPanel(ecrPanel === e.id ? null : e.id); setEcrAck(""); }}
                              className="text-[11px] text-green-700 hover:underline"
                            >{ecrPanel === e.id ? "Cancel" : "Mark Submitted"}</button>
                          )}
                        </td>
                      </tr>
                      {ecrPanel === e.id && (
                        <tr key={`${e.id}-ecr-panel`}>
                          <td colSpan={13} className="bg-blue-50/60 px-4 py-3 border-b border-blue-200">
                            <div className="flex items-end gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">EPFO Ack Number *</label>
                                <input className="border border-border rounded px-2 py-1 text-[12px] w-60" placeholder="EPFO/2025-26/MAR/ACK/..." value={ecrAck} onChange={e => setEcrAck(e.target.value)} />
                              </div>
                              <button
                                disabled={markEcrSubmitted.isPending || !ecrAck.trim()}
                                onClick={() => markEcrSubmitted.mutate({ id: e.id, epfoAckNumber: ecrAck, submittedAt: new Date() })}
                                className="px-3 py-1.5 bg-blue-600 text-white text-[11px] rounded hover:bg-blue-700 font-medium disabled:opacity-50"
                              >
                                {markEcrSubmitted.isPending ? "Saving…" : "Confirm Submission"}
                              </button>
                              {markEcrSubmitted.isError && <span className="text-[11px] text-red-600">{(markEcrSubmitted.error as any)?.message}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="p-4 text-center text-muted-foreground text-[12px]">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            Employee document repository — contracts, offer letters, performance reviews, and compliance certifications.
            <div className="mt-3">
              <button onClick={() => setTab("documents")} className="px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">Browse Documents</button>
            </div>
          </div>
        )}
      </div>

      {/* New HR Case Modal */}
      {showCaseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> New HR Case
              </h2>
              <button onClick={() => setShowCaseForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Case Type *</label>
                <select
                  value={caseForm.caseType}
                  onChange={(e) => setCaseForm((f) => ({ ...f, caseType: e.target.value as any }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="policy">Policy Question</option>
                  <option value="benefits">Benefits</option>
                  <option value="workplace">Workplace Issue</option>
                  <option value="equipment">Equipment Request</option>
                  <option value="leave">Leave Request</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Employee ID *</label>
                <select
                  value={caseForm.employeeId}
                  onChange={(e) => setCaseForm((f) => ({ ...f, employeeId: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="">— select employee —</option>
                  {hrCases.map((c) => c.employee && (
                    <option key={c.employee.employeeId} value={c.hrCase.employeeId}>
                      {c.employee.employeeId} {c.employee.title ? `— ${c.employee.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Description / Notes</label>
                <textarea
                  rows={4}
                  value={caseForm.notes}
                  onChange={(e) => setCaseForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Describe the HR case…"
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground resize-none outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCaseForm(false)}
                className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted/30"
              >
                Cancel
              </button>
              <button
                disabled={createHRCase.isPending || !caseForm.employeeId}
                onClick={() => createHRCase.mutate({ employeeId: caseForm.employeeId, caseType: caseForm.caseType, notes: caseForm.notes || undefined })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1"
              >
                {createHRCase.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
