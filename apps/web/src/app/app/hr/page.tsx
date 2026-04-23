"use client";

import React, { useState, useEffect } from "react";
import { UserCheck, Plus, CheckCircle2, Clock, FileText, ChevronRight, Loader2, IndianRupee, AlertTriangle, RefreshCw, Pencil } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const HR_TABS = [
  { key: "directory",  label: "Employee Directory",   module: "hr"         as const, action: "read"  as const },
  { key: "cases",       label: "HR Cases",            module: "hr"         as const, action: "read"  as const },
  { key: "leave",       label: "Leave Management",    module: "hr"         as const, action: "read"  as const },
  { key: "onboarding",  label: "Onboarding",           module: "onboarding" as const, action: "read"  as const },
  { key: "offboarding", label: "Offboarding",          module: "hr"         as const, action: "write" as const },
  { key: "lifecycle",   label: "Lifecycle Events",     module: "hr"         as const, action: "write" as const },
  { key: "payroll_compliance", label: "Payroll Compliance", module: "hr"   as const, action: "admin" as const },
  { key: "documents",   label: "Employee Documents",   module: "hr"         as const, action: "read"  as const },
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
  // employees list — drives Employee Directory tab
  const { data: employeesData } = trpc.hr.employees.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Record<string, unknown> | null>(null);
  const [addEmpForm, setAddEmpForm] = useState({
    userId: "",
    department: "",
    title: "",
    location: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    managerId: "",
    startDate: "",
  });
  const [editEmpForm, setEditEmpForm] = useState({
    department: "",
    title: "",
    location: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    managerId: "",
  });

  const unlinkedUsersQuery = trpc.hr.employees.listUsersWithoutEmployee.useQuery(undefined, {
    enabled: showAddEmployee && can("hr", "write"),
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  const createEmployee = trpc.hr.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Employee record created");
      utils.hr.employees.list.invalidate();
      utils.hr.employees.listUsersWithoutEmployee.invalidate();
      setShowAddEmployee(false);
      setAddEmpForm({
        userId: "",
        department: "",
        title: "",
        location: "",
        employmentType: "full_time",
        managerId: "",
        startDate: "",
      });
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not create employee"),
  });

  const updateEmployee = trpc.hr.employees.update.useMutation({
    onSuccess: () => {
      toast.success("Employee updated");
      utils.hr.employees.list.invalidate();
      setEditingEmployee(null);
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not update employee"),
  });

  // Leave management
  const { data: leaveData, refetch: refetchLeave } = trpc.hr.leave.list.useQuery({}, { refetchOnWindowFocus: false });
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "" });
  const createLeave = trpc.hr.leave.create.useMutation({
    onSuccess: () => { toast.success("Leave request submitted"); setShowLeaveForm(false); setLeaveForm({ type: "annual", startDate: "", endDate: "", reason: "" }); refetchLeave(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit leave request"),
  });
  const approveLeave = trpc.hr.leave.approve.useMutation({
    onSuccess: () => { toast.success("Leave approved"); refetchLeave(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });
  const rejectLeave = trpc.hr.leave.reject.useMutation({
    onSuccess: () => { toast.success("Leave rejected"); refetchLeave(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  // India payroll compliance — TDS challans + EPFO ECR
  const tdsChallansQuery = trpc.indiaCompliance.tdsChallans.list.useQuery({}, { refetchOnWindowFocus: false });
  const epfoEcrQuery     = trpc.indiaCompliance.epfoEcr.list.useQuery({}, { refetchOnWindowFocus: false });
  const markTdsPaid      = trpc.indiaCompliance.tdsChallans.markPaid.useMutation({ onSuccess: () => { tdsChallansQuery.refetch(); setTdsPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const markEcrSubmitted = trpc.indiaCompliance.epfoEcr.markSubmitted.useMutation({ onSuccess: () => { epfoEcrQuery.refetch(); setEcrPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createHRCase = trpc.hr.cases.create.useMutation({
    onSuccess: () => {
      toast.success("HR Case created successfully");
      utils.hr.cases.list.invalidate();
      setShowCaseForm(false);
      setCaseForm({ employeeId: "", caseType: "policy", notes: "" });
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const resolveHRCase = trpc.hr.cases.resolve.useMutation({
    onSuccess: () => { toast.success("Case resolved"); utils.hr.cases.list.invalidate(); setResolvingCase(null); setResolveNote(""); },
    onError: (err: any) => toast.error(err?.message ?? "Failed to resolve case"),
  });

  const [caseForm, setCaseForm] = useState({ employeeId: "", caseType: "policy" as const, notes: "" });
  const [resolvingCase, setResolvingCase] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
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

      {/* Resolve Case Modal */}
      {resolvingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">Resolve Case</h3>
              <button onClick={() => { setResolvingCase(null); setResolveNote(""); }} className="text-muted-foreground hover:text-foreground">
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
            <label className="text-[11px] text-muted-foreground">Resolution Note (optional)</label>
            <textarea
              rows={3}
              className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background resize-none"
              placeholder="Describe how this case was resolved…"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                disabled={resolveHRCase.isPending}
                onClick={() => resolveHRCase.mutate({ id: resolvingCase, resolution: resolveNote || undefined })}
                className="px-4 py-1.5 rounded bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {resolveHRCase.isPending ? "Resolving…" : "Mark Resolved"}
              </button>
              <button onClick={() => { setResolvingCase(null); setResolveNote(""); }} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddEmployee && can("hr", "write") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">Add employee</h3>
              <button type="button" onClick={() => setShowAddEmployee(false)} className="text-muted-foreground hover:text-foreground text-xs">
                Close
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Links a platform user in your org to an HR employee record (required for directory, leave, and workforce analytics).
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-muted-foreground">User *</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.userId}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, userId: e.target.value }))}
                >
                  <option value="">Select user…</option>
                  {(unlinkedUsersQuery.data ?? []).map((u: { id: string; name: string | null; email: string }) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
                {unlinkedUsersQuery.isFetched && (unlinkedUsersQuery.data?.length ?? 0) === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">No users left without an employee record. Invite or add users first, then return here.</p>
                )}
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Department</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.department}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Title</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.title}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Location</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.location}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Employment type</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.employmentType}
                  onChange={(e) =>
                    setAddEmpForm((f) => ({
                      ...f,
                      employmentType: e.target.value as typeof f.employmentType,
                    }))
                  }
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contractor">Contractor</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Manager</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.managerId}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, managerId: e.target.value }))}
                >
                  <option value="">None</option>
                  {((employeesData as any[]) ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.name ?? e.email ?? e.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Start date</label>
                <input
                  type="date"
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.startDate}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={!addEmpForm.userId || createEmployee.isPending}
                onClick={() =>
                  createEmployee.mutate({
                    userId: addEmpForm.userId,
                    department: addEmpForm.department || undefined,
                    title: addEmpForm.title || undefined,
                    location: addEmpForm.location || undefined,
                    employmentType: addEmpForm.employmentType,
                    managerId: addEmpForm.managerId || undefined,
                    startDate: addEmpForm.startDate ? new Date(`${addEmpForm.startDate}T12:00:00`) : undefined,
                  })
                }
                className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
              >
                {createEmployee.isPending ? "Saving…" : "Create record"}
              </button>
              <button type="button" onClick={() => setShowAddEmployee(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEmployee && can("hr", "write") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">Edit employee</h3>
              <button type="button" onClick={() => setEditingEmployee(null)} className="text-muted-foreground hover:text-foreground text-xs">
                Close
              </button>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-muted-foreground">Department</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.department}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Title</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.title}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Location</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.location}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Employment type</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.employmentType}
                  onChange={(e) =>
                    setEditEmpForm((f) => ({
                      ...f,
                      employmentType: e.target.value as typeof f.employmentType,
                    }))
                  }
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contractor">Contractor</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Manager</label>
                <select
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.managerId}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, managerId: e.target.value }))}
                >
                  <option value="">None</option>
                  {((employeesData as any[]) ?? [])
                    .filter((e: any) => e.id !== editingEmployee.id)
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.name ?? e.email ?? e.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={updateEmployee.isPending}
                onClick={() =>
                  updateEmployee.mutate({
                    id: editingEmployee.id as string,
                    department: editEmpForm.department || undefined,
                    title: editEmpForm.title || undefined,
                    location: editEmpForm.location || undefined,
                    employmentType: editEmpForm.employmentType,
                    managerId: editEmpForm.managerId === "" ? null : editEmpForm.managerId,
                  })
                }
                className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
              >
                {updateEmployee.isPending ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditingEmployee(null)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
          { label: "Active Onboardings",  value: hrCases.filter((c) => c.hrCase?.caseType === "onboarding").length,                                        color: "text-green-700" },
          { label: "Pending Offboarding", value: hrCases.filter((c) => c.hrCase?.caseType === "offboarding").length,                                       color: "text-orange-700" },
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
        {tab === "directory" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                {((employeesData as any[]) ?? []).length} Employees
              </span>
              {can("hr", "write") && (
                <button
                  type="button"
                  onClick={() => setShowAddEmployee(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] rounded hover:opacity-90"
                >
                  <Plus className="w-3 h-3" /> Add employee
                </button>
              )}
            </div>
            {!employeesData || (employeesData as any[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
                <UserCheck className="w-5 h-5 opacity-30" />
                <span className="text-xs">No employees found.</span>
                {can("hr", "write") && (
                  <button
                    type="button"
                    onClick={() => setShowAddEmployee(true)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Add employee record
                  </button>
                )}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Title / Role</th>
                    <th>Location</th>
                    <th>Manager</th>
                    <th>Status</th>
                    <th>Joined</th>
                    {can("hr", "write") && <th className="text-right w-24">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(employeesData as any[]).map((emp: any) => {
                    const mgr = ((employeesData as any[]) ?? []).find((e: any) => e.id === emp.managerId);
                    const mgrLabel = mgr ? (mgr.name ?? mgr.email ?? "—") : emp.managerId ? `…${String(emp.managerId).slice(-8)}` : "—";
                    return (
                    <tr key={emp.id}>
                      <td className="p-0">
                        <div className={`priority-bar ${emp.status === "active" ? "bg-green-500" : emp.status === "on_leave" ? "bg-yellow-500" : "bg-red-400"}`} />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                            {(emp.firstName?.[0] ?? emp.name?.[0] ?? "?").toUpperCase()}{(emp.lastName?.[0] ?? "").toUpperCase()}
                          </span>
                          <div>
                            <div className="font-semibold text-foreground text-[12px]">
                              {emp.name ? emp.name : [emp.firstName, emp.lastName].filter(Boolean).join(" ") || "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground/70 font-mono">
                              {emp.employeeNumber ?? emp.employeeId ?? emp.id?.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{emp.department ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{emp.jobTitle ?? emp.title ?? emp.role ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{emp.location ?? emp.workLocation ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{mgrLabel}</td>
                      <td>
                        <span className={`status-badge capitalize ${
                          emp.status === "active" ? "text-green-700 bg-green-100" :
                          emp.status === "on_leave" ? "text-yellow-700 bg-yellow-100" :
                          emp.status === "inactive" ? "text-muted-foreground bg-muted" : "text-muted-foreground bg-muted"
                        }`}>{emp.status ?? "active"}</span>
                      </td>
                      <td className="text-[11px] text-muted-foreground/70">
                        {emp.startDate ? new Date(emp.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      {can("hr", "write") && (
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmployee(emp);
                              setEditEmpForm({
                                department: String(emp.department ?? ""),
                                title: String(emp.jobTitle ?? emp.title ?? ""),
                                location: String(emp.location ?? ""),
                                employmentType: (emp.employmentType ?? "full_time") as typeof editEmpForm.employmentType,
                                managerId: emp.managerId ? String(emp.managerId) : "",
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] hover:bg-accent"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "leave" && (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground">Leave Requests</span>
              <button
                onClick={() => setShowLeaveForm(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
              >
                <Plus className="w-3 h-3" /> {showLeaveForm ? "Cancel" : "Request Leave"}
              </button>
            </div>

            {showLeaveForm && (
              <div className="bg-card border border-primary/30 rounded p-4">
                <h3 className="text-[12px] font-semibold text-foreground mb-3">New Leave Request</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Leave Type</label>
                    <select
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.type}
                      onChange={(e) => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                    >
                      <option value="annual">Annual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="casual">Casual Leave</option>
                      <option value="maternity">Maternity Leave</option>
                      <option value="paternity">Paternity Leave</option>
                      <option value="compensatory">Compensatory Off</option>
                      <option value="unpaid">Unpaid Leave</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Start Date *</label>
                    <input
                      type="date"
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.startDate}
                      onChange={(e) => setLeaveForm(f => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">End Date *</label>
                    <input
                      type="date"
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.endDate}
                      onChange={(e) => setLeaveForm(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">Reason</label>
                    <input
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      placeholder="Brief reason for leave"
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={!leaveForm.startDate || !leaveForm.endDate || createLeave.isPending}
                    onClick={() => createLeave.mutate({ type: leaveForm.type, startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason || undefined })}
                    className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createLeave.isPending ? "Submitting…" : "Submit Request"}
                  </button>
                  <button onClick={() => setShowLeaveForm(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded overflow-hidden">
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                    {can("hr", "approve" as any) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {!leaveData || (leaveData as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[12px] text-muted-foreground">
                        No leave requests yet.
                      </td>
                    </tr>
                  ) : (leaveData as any[]).map((req: any) => (
                    <tr key={req.id}>
                      <td className="text-foreground text-[11px]">{req.employeeId?.slice(0,8) ?? "—"}</td>
                      <td>
                        <span className="status-badge capitalize bg-blue-100 text-blue-700">{req.type?.replace(/_/g," ")}</span>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{req.startDate ? new Date(req.startDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{req.endDate ? new Date(req.endDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—"}</td>
                      <td className="text-center font-medium text-foreground">{req.days ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px] max-w-[180px] truncate">{req.reason ?? "—"}</td>
                      <td>
                        <span className={`status-badge capitalize ${
                          req.status === "approved" ? "text-green-700 bg-green-100" :
                          req.status === "rejected" ? "text-red-700 bg-red-100" :
                          "text-yellow-700 bg-yellow-100"
                        }`}>{req.status}</span>
                      </td>
                      {can("hr", "approve" as any) && (
                        <td>
                          {req.status === "pending" && (
                            <div className="flex gap-1">
                              <button
                                disabled={approveLeave.isPending}
                                onClick={() => approveLeave.mutate({ id: req.id })}
                                className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-medium hover:bg-green-200 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                disabled={rejectLeave.isPending}
                                onClick={() => rejectLeave.mutate({ id: req.id })}
                                className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium hover:bg-red-200 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hrCases.map((c) => {
                  // DB returns nested { hrCase: {...}, employee: {...} } from the inner join
                  const isResolved = c.hrCase?.notes?.includes("[RESOLVED:") ?? false;
                  const caseStatus = isResolved ? "resolved" : c.hrCase?.statusId ? "in_progress" : "open";
                  const casePriority = c.hrCase?.priority ?? "low";
                  return (
                    <tr key={c.hrCase?.id ?? ""} className={isResolved ? "opacity-60" : ""}>
                      <td className="p-0"><div className={`priority-bar ${casePriority === "high" ? "bg-orange-500" : casePriority === "medium" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{c.hrCase?.id?.slice(-8)?.toUpperCase() ?? "—"}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{c.hrCase?.caseType ?? "—"}</span></td>
                      <td className="max-w-xs"><span className="truncate block text-foreground">{c.hrCase?.notes?.replace(/\[RESOLVED:.*?\]\s*/g, "") || "—"}</span></td>
                      <td className="text-muted-foreground">{c.employee?.employeeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{c.employee?.department ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${CASE_STATE_COLOR[caseStatus] ?? "text-muted-foreground bg-muted"}`}>{caseStatus.replace(/_/g, " ")}</span></td>
                      <td><span className={`status-badge capitalize ${casePriority === "high" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{casePriority}</span></td>
                      <td className="text-muted-foreground">{c.hrCase?.assigneeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">
                        {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toISOString().split("T")[0] : "—"}
                      </td>
                      <td className="text-muted-foreground text-[11px]">—</td>
                      <td>
                        {!isResolved && c.hrCase?.id && (
                          <button
                            onClick={() => { setResolvingCase(c.hrCase!.id); setResolveNote(""); }}
                            className="text-[11px] text-green-600 hover:underline font-medium"
                          >
                            Resolve
                          </button>
                        )}
                        {isResolved && <span className="text-[10px] text-green-600 font-medium">✓ Resolved</span>}
                      </td>
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
            ) : hrCases.filter((c) => c.hrCase?.caseType === "onboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active onboarding cases.</div>
            ) : hrCases.filter((c) => c.hrCase?.caseType === "onboarding").map((c) => (
              <div key={c.hrCase?.id ?? c.hrCase?.employeeId} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[11px]">
                      {c.employee?.employeeId?.slice(0, 2).toUpperCase() ?? "EE"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-semibold text-foreground">{c.employee?.employeeId ?? c.hrCase?.employeeId?.slice(0, 8) ?? "—"}</span>
                        <span className={`status-badge capitalize text-blue-700 bg-blue-100`}>Onboarding</span>
                        <span className={`status-badge ${c.hrCase?.priority === "high" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>Priority: {c.hrCase?.priority ?? "normal"}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{c.employee?.title ?? "—"} · {c.employee?.department ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground/70">Opened: {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toLocaleDateString() : "—"}</div>
                    </div>
                  </div>
                  <a
                    href={`/app/hr/${c.hrCase?.id ?? ""}`}
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
            ) : hrCases.filter((c) => c.hrCase?.caseType === "offboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active offboarding cases.</div>
            ) : hrCases.filter((c) => c.hrCase?.caseType === "offboarding").map((c) => (
              <div key={c.hrCase?.id ?? c.hrCase?.employeeId} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-foreground">{c.employee?.employeeId ?? c.hrCase?.employeeId?.slice(0, 8) ?? "—"}</span>
                      <span className="text-[11px] text-muted-foreground">{c.employee?.title ?? "—"}</span>
                      <span className="status-badge text-muted-foreground bg-muted">Offboarding</span>
                      <span className={`status-badge ${c.hrCase?.priority === "high" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>
                        Priority: {c.hrCase?.priority ?? "normal"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-2">Opened: {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toLocaleDateString() : "—"}</div>
                  </div>
                  <a
                    href={`/app/hr/${c.hrCase?.id ?? ""}`}
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
              {(hrCases.filter((c) => ["transfer","promotion","leave","return_from_leave","role_change"].includes(c.hrCase?.caseType ?? "")).length > 0
                ? hrCases.filter((c) => ["transfer","promotion","leave","return_from_leave","role_change"].includes(c.hrCase?.caseType ?? "")).map((c) => (
                    <tr key={c.hrCase?.id ?? c.hrCase?.employeeId}>
                      <td className="font-mono text-[11px] text-primary">{c.hrCase?.number ?? c.hrCase?.id?.slice(0,8) ?? "—"}</td>
                      <td><span className="status-badge text-blue-700 bg-blue-100 capitalize">{(c.hrCase?.caseType ?? "lifecycle").replace(/_/g," ")}</span></td>
                      <td className="font-medium text-foreground">{c.employee?.name ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{c.hrCase?.description ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{c.hrCase?.targetDate ? new Date(c.hrCase.targetDate).toLocaleDateString("en-IN") : "—"}</td>
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
