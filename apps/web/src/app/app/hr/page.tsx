"use client";

import React, { useState, useEffect } from "react";
import { UserCheck, Plus, CheckCircle2, Clock, FileText, ChevronRight, Loader2, IndianRupee, AlertTriangle, RefreshCw, Pencil, FileSignature, X, CheckCircle } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { EsignPanel } from "@/components/esign/EsignPanel";

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
  archived:          "text-muted-foreground bg-muted",
  resolved:          "text-green-700 bg-green-100",
  closed:            "text-muted-foreground bg-muted",
};

export default function HRPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const visibleTabs = HR_TABS.filter((t) => can(t.module, t.action));

  const defaultTab = visibleTabs[0]?.key ?? "";
  const [tab, setTab] = useState(defaultTab);

  // If the active tab is no longer visible after a role switch, reset to first visible
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) {
      setTab(visibleTabs[0]?.key ?? "");
    }
  }, [visibleTabs, tab]);


  const { data: casesData, isLoading: casesLoading } = trpc.hr.cases.list.useQuery({}, mergeTrpcQueryOpts("hr.cases.list", { refetchOnWindowFocus: false },));
  // employees list — drives Employee Directory tab
  const { data: employeesData } = trpc.hr.employees.list.useQuery({ limit: 200 }, mergeTrpcQueryOpts("hr.employees.list", { refetchOnWindowFocus: false },));

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Record<string, unknown> | null>(null);
  const [policyEsignFor, setPolicyEsignFor] = useState<Record<string, unknown> | null>(null);
  const [addEmpForm, setAddEmpForm] = useState({
    userId: "",
    userName: "",
    userEmail: "",
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

  const unlinkedUsersQuery = trpc.hr.employees.listUsersWithoutEmployee.useQuery(undefined, mergeTrpcQueryOpts("hr.employees.listUsersWithoutEmployee", {
    enabled: showAddEmployee && can("hr", "write"),
    refetchOnWindowFocus: false,
  }));

  const utils = trpc.useUtils();

  const createEmployee = trpc.hr.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Employee record created");
      utils.hr.employees.list.invalidate();
      utils.hr.employees.listUsersWithoutEmployee.invalidate();
      setShowAddEmployee(false);
      setAddEmpForm({
        userId: "",
        userName: "",
        userEmail: "",
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
  const { data: leaveData, refetch: refetchLeave } = trpc.hr.leave.list.useQuery({}, mergeTrpcQueryOpts("hr.leave.list", { refetchOnWindowFocus: false }));
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: "vacation", startDate: "", endDate: "", reason: "" });
  const createLeave = trpc.hr.leave.create.useMutation({
    onSuccess: () => { toast.success("Leave request submitted"); setShowLeaveForm(false); setLeaveForm({ type: "vacation", startDate: "", endDate: "", reason: "" }); refetchLeave(); },
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
  const updateLeave = trpc.hr.leave.update.useMutation({
    onSuccess: () => { toast.success("Leave updated"); setEditingLeave(null); refetchLeave(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update leave"),
  });
  const deleteLeave = trpc.hr.leave.delete.useMutation({
    onSuccess: () => { toast.success("Leave deleted"); refetchLeave(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete leave"),
  });

  const [editingLeave, setEditingLeave] = useState<any>(null);

  const saveOnboardingDetails = trpc.hr.onboarding.saveDetails.useMutation({
    onSuccess: () => {
      toast.success("Onboarding details saved");
      setEditingOnboardingEmployee(null);
      utils.hr.cases.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save onboarding details"),
  });
  const [editingOnboardingEmployee, setEditingOnboardingEmployee] = useState<any>(null);
  const [onboardingForm, setOnboardingForm] = useState({
    name: "",
    primaryEmail: "",
    secondaryEmail: "",
    phone: "",
    secondaryPhone: "",
    educationDocs: "",
    employeeDocs: "",
    signedOfferLetter: "",
    photo: "",
  });
  const loadOnboardingDetails = trpc.hr.onboarding.getDetails.useQuery(
    { employeeId: editingOnboardingEmployee?.id || "" },
    mergeTrpcQueryOpts("hr.onboarding.getDetails", { 
      enabled: !!editingOnboardingEmployee?.id,
      refetchOnWindowFocus: false,
    })
  );

  useEffect(() => {
    if (loadOnboardingDetails.data) {
      setOnboardingForm({
        name: loadOnboardingDetails.data.name || "",
        primaryEmail: loadOnboardingDetails.data.primaryEmail || "",
        secondaryEmail: loadOnboardingDetails.data.secondaryEmail || "",
        phone: loadOnboardingDetails.data.phone || "",
        secondaryPhone: loadOnboardingDetails.data.secondaryPhone || "",
        educationDocs: loadOnboardingDetails.data.educationDocs || "",
        employeeDocs: loadOnboardingDetails.data.employeeDocs || "",
        signedOfferLetter: loadOnboardingDetails.data.signedOfferLetter || "",
        photo: loadOnboardingDetails.data.photo || "",
      });
    } else if (editingOnboardingEmployee) {
      setOnboardingForm({
        name: "",
        primaryEmail: "",
        secondaryEmail: "",
        phone: "",
        secondaryPhone: "",
        educationDocs: "",
        employeeDocs: "",
        signedOfferLetter: "",
        photo: "",
      });
    }
  }, [loadOnboardingDetails.data, editingOnboardingEmployee]);

  const [showOnboardingForm, setShowOnboardingForm] = useState(false);
  const [onboardingCreateForm, setOnboardingCreateForm] = useState({
    name: "",
    primaryEmail: "",
    secondaryEmail: "",
    phone: "",
    secondaryPhone: "",
    educationDocs: "",
    employeeDocs: "",
    signedOfferLetter: "",
    photo: "",
  });

  const createOnboarding = trpc.hr.onboarding.createOnboarding.useMutation({
    onSuccess: () => {
      toast.success("Onboarding process started");
      utils.hr.cases.list.invalidate();
      setShowOnboardingForm(false);
      setOnboardingCreateForm({
        name: "",
        primaryEmail: "",
        secondaryEmail: "",
        phone: "",
        secondaryPhone: "",
        educationDocs: "",
        employeeDocs: "",
        signedOfferLetter: "",
        photo: "",
      });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to create onboarding");
    },
  });

  // Offboarding state & mutations
  const [editingOffboardingEmployee, setEditingOffboardingEmployee] = useState<any>(null);
  const [offboardingForm, setOffboardingForm] = useState({
    name: "",
    separationDocs: "",
    clearanceDocs: "",
    securityClearance: "",
    status: "pending",
    ffStatus: "pending",
  });
  
  const loadOffboardingDetails = trpc.hr.offboarding.getDetails.useQuery(
    { employeeId: editingOffboardingEmployee?.id || "" },
    mergeTrpcQueryOpts("hr.offboarding.getDetails", {
      enabled: !!editingOffboardingEmployee?.id,
      refetchOnWindowFocus: false,
    })
  );

  useEffect(() => {
    if (loadOffboardingDetails.data) {
      setOffboardingForm({
        name: loadOffboardingDetails.data.name || "",
        separationDocs: loadOffboardingDetails.data.separationDocs || "",
        clearanceDocs: loadOffboardingDetails.data.clearanceDocs || "",
        securityClearance: loadOffboardingDetails.data.securityClearance || "",
        status: loadOffboardingDetails.data.status || "pending",
        ffStatus: loadOffboardingDetails.data.ffStatus || "pending",
      });
    } else if (editingOffboardingEmployee) {
      setOffboardingForm({
        name: editingOffboardingEmployee.name || "",
        separationDocs: "",
        clearanceDocs: "",
        securityClearance: "",
        status: "pending",
        ffStatus: "pending",
      });
    }
  }, [loadOffboardingDetails.data, editingOffboardingEmployee]);

  const saveOffboardingDetails = trpc.hr.offboarding.saveDetails.useMutation({
    onSuccess: () => {
      toast.success("Offboarding details saved");
      setEditingOffboardingEmployee(null);
      utils.hr.cases.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save offboarding details"),
  });

  const [showOffboardingForm, setShowOffboardingForm] = useState(false);
  const [offboardingCreateForm, setOffboardingCreateForm] = useState({
    employeeId: "",
    name: "",
    separationDocs: "",
    clearanceDocs: "",
    securityClearance: "",
    status: "pending",
    ffStatus: "pending",
  });

  const createOffboarding = trpc.hr.offboarding.createOffboarding.useMutation({
    onSuccess: () => {
      toast.success("Offboarding process started");
      utils.hr.cases.list.invalidate();
      setShowOffboardingForm(false);
      setOffboardingCreateForm({
        employeeId: "",
        name: "",
        separationDocs: "",
        clearanceDocs: "",
        securityClearance: "",
        status: "pending",
        ffStatus: "pending",
      });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to create offboarding");
    },
  });

  // Lifecycle Events state & mutations
  const { data: lifecycleEvents, refetch: refetchLifecycle } = trpc.hr.lifecycle.list.useQuery(
    undefined,
    mergeTrpcQueryOpts("hr.lifecycle.list", { refetchOnWindowFocus: false })
  );

  const [showLifecycleForm, setShowLifecycleForm] = useState(false);
  const [lifecycleForm, setLifecycleForm] = useState({
    employeeId: "",
    name: "",
    eventType: "employee_transition",
    hrTaskStatus: "pending",
    itTaskStatus: "pending",
    payrollCompliance: "no",
    notes: "",
  });

  const createLifecycleEvent = trpc.hr.lifecycle.create.useMutation({
    onSuccess: () => {
      toast.success("Lifecycle event created");
      refetchLifecycle();
      setShowLifecycleForm(false);
      setLifecycleForm({
        employeeId: "",
        name: "",
        eventType: "employee_transition",
        hrTaskStatus: "pending",
        itTaskStatus: "pending",
        payrollCompliance: "no",
        notes: "",
      });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to create event"),
  });

  const [editingLifecycleEvent, setEditingLifecycleEvent] = useState<any>(null);
  const updateLifecycleEvent = trpc.hr.lifecycle.update.useMutation({
    onSuccess: () => {
      toast.success("Lifecycle event updated");
      refetchLifecycle();
      setEditingLifecycleEvent(null);
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to update event"),
  });

  // Employee documents state
  const [selectedDocEmployeeId, setSelectedDocEmployeeId] = useState("");
  const { data: employeeDocuments } = trpc.hr.getEmployeeDocuments.useQuery(
    { employeeId: selectedDocEmployeeId },
    mergeTrpcQueryOpts("hr.getEmployeeDocuments", {
      enabled: !!selectedDocEmployeeId,
      refetchOnWindowFocus: false,
    })
  );

  // India payroll compliance — TDS challans + EPFO ECR
  const tdsChallansQuery = trpc.indiaCompliance.tdsChallans.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.tdsChallans.list", { refetchOnWindowFocus: false }));
  const epfoEcrQuery     = trpc.indiaCompliance.epfoEcr.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.epfoEcr.list", { refetchOnWindowFocus: false }));
  const markTdsPaid      = trpc.indiaCompliance.tdsChallans.markPaid.useMutation({ onSuccess: () => { tdsChallansQuery.refetch(); setTdsPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const markEcrSubmitted = trpc.indiaCompliance.epfoEcr.markSubmitted.useMutation({ onSuccess: () => { epfoEcrQuery.refetch(); setEcrPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createHRCase = trpc.hr.cases.create.useMutation({
    onSuccess: () => {
      toast.success("HR Case created successfully");
      utils.hr.cases.list.invalidate();
      setShowCaseForm(false);
      setCaseForm({ employeeId: "", caseType: "policy", notes: "", status: "open" });
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const archiveHRCase = trpc.hr.cases.archive.useMutation({
    onSuccess: () => { toast.success("Case archived"); utils.hr.cases.list.invalidate(); setArchivingCase(null); setArchiveNote(""); },
    onError: (err: any) => toast.error(err?.message ?? "Failed to archive case"),
  });

  const updateHRCase = trpc.hr.cases.update.useMutation({
    onSuccess: () => {
      toast.success("HR Case updated");
      utils.hr.cases.list.invalidate();
      setEditingCase(null);
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to update case"),
  });

  const deleteHRCase = trpc.hr.cases.delete.useMutation({
    onSuccess: () => {
      toast.success("HR Case deleted");
      utils.hr.cases.list.invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to delete case"),
  });

  const [caseForm, setCaseForm] = useState({ employeeId: "", caseType: "policy" as const, notes: "", status: "open" as "open" | "in_progress" | "closed" });
  const [editingCase, setEditingCase] = useState<{id: string, notes: string, status: "open" | "in_progress" | "closed"} | null>(null);
  const [archivingCase, setArchivingCase] = useState<string | null>(null);
  const [archiveNote, setArchiveNote] = useState("");
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

      {/* Archive Case Modal */}
      {archivingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">Archive Case</h3>
              <button onClick={() => { setArchivingCase(null); setArchiveNote(""); }} className="text-muted-foreground hover:text-foreground">
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
            <label className="text-[11px] text-muted-foreground">Archival Note (optional)</label>
            <textarea
              rows={3}
              className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background resize-none"
              placeholder="Describe how this case was archived…"
              value={archiveNote}
              onChange={(e) => setArchiveNote(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                disabled={archiveHRCase.isPending}
                onClick={() => archiveHRCase.mutate({ id: archivingCase, resolution: archiveNote || undefined })}
                className="px-4 py-1.5 rounded bg-zinc-700 text-white text-[11px] font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {archiveHRCase.isPending ? "Archiving…" : "Archive Case"}
              </button>
              <button onClick={() => { setArchivingCase(null); setArchiveNote(""); }} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Onboarding Details Modal */}
      {editingOnboardingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Onboarding Details - {editingOnboardingEmployee.name}</h2>
              <button onClick={() => setEditingOnboardingEmployee(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            {loadOnboardingDetails.isFetching ? (
              <div className="p-10 text-center text-[12px] text-muted-foreground">Loading details...</div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    value={onboardingForm.name}
                    onChange={(e) => setOnboardingForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    placeholder="Enter full name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Primary Email</label>
                    <input
                      type="email"
                      value={onboardingForm.primaryEmail}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, primaryEmail: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Secondary Email</label>
                    <input
                      type="email"
                      value={onboardingForm.secondaryEmail}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, secondaryEmail: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Phone</label>
                    <input
                      type="tel"
                      value={onboardingForm.phone}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Secondary Phone</label>
                    <input
                      type="tel"
                      value={onboardingForm.secondaryPhone}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, secondaryPhone: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-3">Attachments</h3>
                  <div className="grid grid-cols-2 gap-3 font-normal">
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Education Docs</label>
                      <input
                        type="text"
                        value={onboardingForm.educationDocs}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, educationDocs: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-xs bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Employee Docs</label>
                      <input
                        type="text"
                        value={onboardingForm.employeeDocs}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, employeeDocs: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-xs bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Signed Offer Letter</label>
                      <input
                        type="text"
                        value={onboardingForm.signedOfferLetter}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, signedOfferLetter: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-xs bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Passport Photo</label>
                      <input
                        type="text"
                        value={onboardingForm.photo}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, photo: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-xs bg-card text-foreground"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setEditingOnboardingEmployee(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
              <button
                disabled={saveOnboardingDetails.isPending || loadOnboardingDetails.isFetching}
                onClick={() => saveOnboardingDetails.mutate({ employeeId: editingOnboardingEmployee.id, ...onboardingForm })}
                className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {saveOnboardingDetails.isPending ? "Saving..." : "Save Details"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Onboarding Modal */}
      {showOnboardingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Start New Onboarding
              </h2>
              <button onClick={() => setShowOnboardingForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={onboardingCreateForm.name}
                    onChange={(e) => setOnboardingCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Primary Email (Login) *</label>
                  <input
                    type="email"
                    required
                    value={onboardingCreateForm.primaryEmail}
                    onChange={(e) => setOnboardingCreateForm(prev => ({ ...prev, primaryEmail: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Secondary Email</label>
                  <input
                    type="email"
                    value={onboardingCreateForm.secondaryEmail}
                    onChange={(e) => setOnboardingCreateForm(prev => ({ ...prev, secondaryEmail: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    placeholder="personal@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Primary Phone *</label>
                  <input
                    type="tel"
                    required
                    value={onboardingCreateForm.phone}
                    onChange={(e) => setOnboardingCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Secondary Phone</label>
                  <input
                    type="tel"
                    value={onboardingCreateForm.secondaryPhone}
                    onChange={(e) => setOnboardingCreateForm(prev => ({ ...prev, secondaryPhone: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Required Attachments</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Education Docs</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={onboardingCreateForm.educationDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOnboardingCreateForm(prev => ({ ...prev, educationDocs: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Employee ID/Address Docs</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={onboardingCreateForm.employeeDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOnboardingCreateForm(prev => ({ ...prev, employeeDocs: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Signed Offer Letter</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={onboardingCreateForm.signedOfferLetter}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOnboardingCreateForm(prev => ({ ...prev, signedOfferLetter: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Passport Photo</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={onboardingCreateForm.photo}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOnboardingCreateForm(prev => ({ ...prev, photo: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowOnboardingForm(false)}
                className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                disabled={createOnboarding.isPending || !onboardingCreateForm.name || !onboardingCreateForm.primaryEmail || !onboardingCreateForm.phone}
                onClick={() => createOnboarding.mutate(onboardingCreateForm)}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1 font-semibold"
              >
                {createOnboarding.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Submit Onboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Leave Modal */}
      {editingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Edit Leave Request</h2>
              <button onClick={() => setEditingLeave(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={editingLeave.status}
                  onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, status: e.target.value } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Type</label>
                <select
                  value={editingLeave.type}
                  onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, type: e.target.value } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick</option>
                  <option value="parental">Parental</option>
                  <option value="bereavement">Bereavement</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editingLeave.startDate}
                    onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, startDate: e.target.value } : null)}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    value={editingLeave.endDate}
                    onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, endDate: e.target.value } : null)}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Reason</label>
                <textarea
                  rows={2}
                  value={editingLeave.reason}
                  onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, reason: e.target.value } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setEditingLeave(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded">Cancel</button>
              <button
                disabled={updateLeave.isPending}
                onClick={() => updateLeave.mutate({ id: editingLeave.id, status: editingLeave.status, type: editingLeave.type, startDate: editingLeave.startDate, endDate: editingLeave.endDate, reason: editingLeave.reason })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {updateLeave.isPending ? "Saving..." : "Save Changes"}
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
                  <option value="">Create new user...</option>
                  {(unlinkedUsersQuery.data ?? []).map((u: { id: string; name: string | null; email: string }) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
                {unlinkedUsersQuery.isFetched && (unlinkedUsersQuery.data?.length ?? 0) === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">No unlinked users found. You can create a new user below.</p>
                )}
              </div>
              {!addEmpForm.userId && (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="text-[11px] text-muted-foreground">New User Name *</label>
                    <input
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={addEmpForm.userName}
                      onChange={(e) => setAddEmpForm((f) => ({ ...f, userName: e.target.value }))}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="text-[11px] text-muted-foreground">New User Email *</label>
                    <input
                      type="email"
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={addEmpForm.userEmail}
                      onChange={(e) => setAddEmpForm((f) => ({ ...f, userEmail: e.target.value }))}
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
              )}
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
                disabled={
                  (!addEmpForm.userId && (!addEmpForm.userName || !addEmpForm.userEmail)) ||
                  createEmployee.isPending
                }
                onClick={() =>
                  createEmployee.mutate({
                    userId: addEmpForm.userId || undefined,
                    userName: addEmpForm.userName || undefined,
                    userEmail: addEmpForm.userEmail || undefined,
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">HR Service Delivery</h1>
          <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">HR Cases · Onboarding · Offboarding · Lifecycle</span>
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

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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

      <div className="flex overflow-x-auto border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-x-auto">
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
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPolicyEsignFor(emp)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] hover:bg-accent"
                            >
                              <FileSignature className="w-3 h-3" /> Policy
                            </button>
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
                          </div>
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

        {/* Policy acknowledgement e-sign modal */}
        {policyEsignFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold">Policy acknowledgement e-sign</h2>
                  <p className="text-xs text-muted-foreground">
                    {(policyEsignFor.name as string) ??
                      ([policyEsignFor.firstName, policyEsignFor.lastName].filter(Boolean).join(" ") ||
                        "Employee")}
                  </p>
                </div>
                <button onClick={() => setPolicyEsignFor(null)} className="p-2 rounded-lg hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <EsignPanel
                  sourceType="policy_ack"
                  sourceId={policyEsignFor.id as string}
                  defaultTitle={`Policy acknowledgement — ${
                    (policyEsignFor.name as string) ??
                    ([policyEsignFor.firstName, policyEsignFor.lastName].filter(Boolean).join(" ") ||
                      "Employee")
                  }`}
                  subject="Employee policy acknowledgement"
                  defaultSigners={
                    policyEsignFor.email
                      ? [
                          {
                            name:
                              (policyEsignFor.name as string) ??
                              ([policyEsignFor.firstName, policyEsignFor.lastName].filter(Boolean).join(" ") ||
                                (policyEsignFor.email as string)),
                            email: policyEsignFor.email as string,
                            role: "employee",
                          },
                        ]
                      : []
                  }
                />
              </div>
            </div>
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Leave Type</label>
                    <select
                      className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.type}
                      onChange={(e) => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                    >
                      <option value="vacation">Vacation</option>
                      <option value="sick">Sick Leave</option>
                      <option value="parental">Parental Leave</option>
                      <option value="bereavement">Bereavement Leave</option>
                      <option value="unpaid">Unpaid Leave</option>
                      <option value="other">Other</option>
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
                    onClick={() =>
                      createLeave.mutate({
                        type: leaveForm.type as any,
                        startDate: new Date(leaveForm.startDate),
                        endDate: new Date(leaveForm.endDate),
                        reason: leaveForm.reason || undefined,
                      })
                    }
                    className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createLeave.isPending ? "Submitting…" : "Submit Request"}
                  </button>
                  <button onClick={() => setShowLeaveForm(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded overflow-x-auto">
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
                          <div className="flex items-center gap-2">
                            {req.status === "pending" && (
                              <>
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
                              </>
                            )}
                            <button onClick={() => setEditingLeave({ id: req.id, status: req.status, type: req.type, startDate: req.startDate?.split("T")[0] || "", endDate: req.endDate?.split("T")[0] || "", reason: req.reason || "" })} className="text-[11px] text-blue-600 hover:underline font-medium">
                              Edit
                            </button>
                            <button onClick={() => { if(confirm("Are you sure you want to delete this leave request?")) deleteLeave.mutate({ id: req.id }); }} className="text-[11px] text-red-600 hover:underline font-medium">
                              Delete
                            </button>
                          </div>
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
                  const isArchived = c.hrCase?.status === "closed" || (c.hrCase?.notes?.includes("[RESOLVED:") ?? false) || (c.hrCase?.notes?.includes("[ARCHIVED:") ?? false);
                  const caseStatus = c.hrCase?.status || (isArchived ? "closed" : c.hrCase?.statusId ? "in_progress" : "open");
                  const displayStatus = caseStatus === "closed" ? "archived" : caseStatus;
                  const casePriority = c.hrCase?.priority ?? "low";
                  return (
                    <tr key={c.hrCase?.id ?? ""} className={isArchived ? "opacity-60" : ""}>
                      <td className="p-0"><div className={`priority-bar ${casePriority === "high" ? "bg-orange-500" : casePriority === "medium" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{c.hrCase?.id?.slice(-8)?.toUpperCase() ?? "—"}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{c.hrCase?.caseType ?? "—"}</span></td>
                      <td className="max-w-xs"><span className="truncate block text-foreground">{c.hrCase?.notes?.replace(/\[(RESOLVED|ARCHIVED):.*?\]\s*/g, "") || "—"}</span></td>
                      <td className="text-muted-foreground">{c.employee?.employeeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{c.employee?.department ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${CASE_STATE_COLOR[displayStatus] ?? "text-muted-foreground bg-muted"}`}>{displayStatus.replace(/_/g, " ")}</span></td>
                      <td><span className={`status-badge capitalize ${casePriority === "high" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{casePriority}</span></td>
                      <td className="text-muted-foreground">{c.hrCase?.assigneeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">
                        {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toISOString().split("T")[0] : "—"}
                      </td>
                      <td className="text-muted-foreground text-[11px]">—</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {!isArchived && c.hrCase?.id && (
                            <button
                              onClick={() => { setArchivingCase(c.hrCase!.id); setArchiveNote(""); }}
                              className="text-[11px] text-green-600 hover:underline font-medium"
                            >
                              Archive
                            </button>
                          )}
                          {isArchived && <span className="text-[10px] text-green-600 font-medium">✓ Archived</span>}
                          {c.hrCase?.id && (
                            <>
                              <button onClick={() => setEditingCase({ id: c.hrCase!.id, notes: c.hrCase!.notes || "", status: c.hrCase!.status || "open" })} className="text-[11px] text-blue-600 hover:underline font-medium">
                                Edit
                              </button>
                              <button onClick={() => { if(confirm("Are you sure you want to delete this case?")) deleteHRCase.mutate({ id: c.hrCase!.id }); }} className="text-[11px] text-red-600 hover:underline font-medium">
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "onboarding" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[11px] text-muted-foreground font-normal">Active employee onboarding pipeline, statutory document checks, and templates.</span>
              {can("hr", "write") && (
                <button
                  onClick={() => setShowOnboardingForm(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 font-medium transition-all"
                >
                  <Plus className="w-3 h-3" /> New Onboarding
                </button>
              )}
            </div>

            {casesLoading ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">Loading onboarding cases…</div>
            ) : hrCases.filter((c) => c.hrCase?.caseType === "onboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active onboarding cases.</div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Employee / ID</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Contact Info</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Edu Docs</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Address/ID Docs</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Offer Letter</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Photo</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hrCases.filter((c) => c.hrCase?.caseType === "onboarding").map((c) => {
                      const details = c.onboardingDetails;
                      const hasEdu = !!details?.educationDocs;
                      const hasEmp = !!details?.employeeDocs;
                      const hasOffer = !!details?.signedOfferLetter;
                      const hasPhoto = !!details?.photo;

                      return (
                        <tr key={c.hrCase?.id ?? c.hrCase?.employeeId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[11px]">
                                {details?.name?.slice(0, 2).toUpperCase() || c.employee?.employeeId?.slice(0, 2).toUpperCase() || "EE"}
                              </div>
                              <div>
                                <div className="text-[13px] font-semibold text-foreground">{details?.name || "Unnamed"}</div>
                                <div className="text-[10px] font-mono text-muted-foreground">{c.employee?.employeeId ?? c.hrCase?.employeeId?.slice(0, 8) ?? "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-foreground">{details?.primaryEmail || "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{details?.phone || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasEdu ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasEdu ? `✓ ${details.educationDocs}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasEmp ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasEmp ? `✓ ${details.employeeDocs}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasOffer ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasOffer ? `✓ ${details.signedOfferLetter}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasPhoto ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasPhoto ? `✓ ${details.photo}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <a
                                href={`/app/hr/${c.hrCase?.id ?? ""}`}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-primary border border-primary/20 rounded-lg hover:bg-primary/5 font-medium transition-all"
                              >
                                Tasks
                              </a>
                              <button
                                onClick={() => setEditingOnboardingEmployee({ id: c.hrCase?.employeeId, name: details?.name || c.employee?.employeeId })}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-blue-600 border border-blue-600/20 rounded-lg hover:bg-blue-600/5 font-medium transition-all"
                              >
                                Edit Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "offboarding" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[11px] text-muted-foreground font-normal">Active employee offboarding processes, exit clearance tracking, and document check status.</span>
              {can("hr", "write") && (
                <button
                  onClick={() => setShowOffboardingForm(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 font-medium transition-all"
                >
                  <Plus className="w-3 h-3" /> New Offboarding
                </button>
              )}
            </div>

            {casesLoading ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">Loading offboarding cases…</div>
            ) : hrCases.filter((c) => c.hrCase?.caseType === "offboarding").length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">No active offboarding cases.</div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Employee / ID</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Separation Forms</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Clearance Forms</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Security Clearance</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">F&F Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hrCases.filter((c) => c.hrCase?.caseType === "offboarding").map((c) => {
                      const details = c.offboardingDetails;
                      const hasSeparation = !!details?.separationDocs;
                      const hasClearance = !!details?.clearanceDocs;
                      const hasSecurity = !!details?.securityClearance;

                      return (
                        <tr key={c.hrCase?.id ?? c.hrCase?.employeeId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[11px]">
                                {details?.name?.slice(0, 2).toUpperCase() || c.employee?.employeeId?.slice(0, 2).toUpperCase() || "EE"}
                              </div>
                              <div>
                                <div className="text-[13px] font-semibold text-foreground">{details?.name || "Unnamed"}</div>
                                <div className="text-[10px] font-mono text-muted-foreground">{c.employee?.employeeId ?? c.hrCase?.employeeId?.slice(0, 8) ?? "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasSeparation ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasSeparation ? `✓ ${details.separationDocs}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasClearance ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasClearance ? `✓ ${details.clearanceDocs}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${hasSecurity ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {hasSecurity ? `✓ ${details.securityClearance}` : '⚠️ Missing'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`status-badge capitalize ${details?.status === "completed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                              {details?.status ?? "pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`status-badge capitalize ${details?.ffStatus === "completed" ? "text-green-700 bg-green-100" : details?.ffStatus === "initiated" ? "text-blue-700 bg-blue-100" : "text-yellow-700 bg-yellow-100"}`}>
                              {details?.ffStatus ?? "pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <a
                                href={`/app/hr/${c.hrCase?.id ?? ""}`}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-primary border border-primary/20 rounded-lg hover:bg-primary/5 font-medium transition-all"
                              >
                                Tasks
                              </a>
                              <button
                                onClick={() => setEditingOffboardingEmployee({ id: c.hrCase?.employeeId, name: details?.name || c.employee?.employeeId })}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-blue-600 border border-blue-600/20 rounded-lg hover:bg-blue-600/5 font-medium transition-all"
                              >
                                Edit Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "lifecycle" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[11px] text-muted-foreground font-normal">Track employee lifecycle transitions, role changes, and IT/HR provisioning tasks.</span>
              {can("hr", "write") && (
                <button
                  onClick={() => setShowLifecycleForm(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 font-medium transition-all"
                >
                  <Plus className="w-3 h-3" /> Create Event
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Event Name</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Event Type</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">HR Task</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">IT Task</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Payroll Compliance</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!lifecycleEvents || lifecycleEvents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No lifecycle events recorded.
                      </td>
                    </tr>
                  ) : (
                    lifecycleEvents.map((evt: any) => (
                      <tr key={evt.lifecycleEvent.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-[13px] font-semibold text-foreground">{evt.lifecycleEvent.name}</div>
                          {evt.lifecycleEvent.notes && <div className="text-[10px] text-muted-foreground">{evt.lifecycleEvent.notes}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-semibold text-foreground">{evt.employee?.name || "Unnamed"}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{evt.employee?.employeeId || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{evt.lifecycleEvent.eventType}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`status-badge capitalize ${evt.lifecycleEvent.hrTaskStatus === "completed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                            {evt.lifecycleEvent.hrTaskStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`status-badge capitalize ${evt.lifecycleEvent.itTaskStatus === "completed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                            {evt.lifecycleEvent.itTaskStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`status-badge capitalize ${evt.lifecycleEvent.payrollCompliance === "yes" ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>
                            {evt.lifecycleEvent.payrollCompliance === "yes" ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setEditingLifecycleEvent({
                              id: evt.lifecycleEvent.id,
                              name: evt.lifecycleEvent.name,
                              eventType: evt.lifecycleEvent.eventType,
                              hrTaskStatus: evt.lifecycleEvent.hrTaskStatus,
                              itTaskStatus: evt.lifecycleEvent.itTaskStatus,
                              payrollCompliance: evt.lifecycleEvent.payrollCompliance,
                              notes: evt.lifecycleEvent.notes,
                            })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-blue-600 border border-blue-600/20 rounded-lg hover:bg-blue-600/5 font-medium transition-all"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    TDS Challans (ITNS 281)
                  </h3>
                  {tdsChallansQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {tdsChallans.length === 0 && !tdsChallansQuery.isLoading ? (
                  <div className="py-12 border border-dashed border-border rounded-xl text-center flex flex-col items-center justify-center bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 text-2xl">📝</div>
                    <p className="text-sm font-medium text-foreground">No TDS challans recorded</p>
                    <p className="text-[12px] text-muted-foreground mt-1">Run monthly payroll to generate TDS entries.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tdsChallans.map((c: any) => (
                      <div key={c.id} className="relative group bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                        {/* Header Banner */}
                        <div className={`h-1.5 w-full ${c.status === "paid" ? "bg-green-500" : c.status === "overdue" ? "bg-red-500" : "bg-orange-500"}`}></div>
                        
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary mb-1">
                                {c.formType}
                              </span>
                              <h4 className="text-sm font-semibold text-foreground">
                                {c.month ? `${c.month} ` : ""}Q{c.quarter} FY {c.fy}
                              </h4>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium capitalize border ${
                              c.status === "paid" ? "bg-green-50 border-green-200 text-green-700" : 
                              c.status === "overdue" ? "bg-red-50 border-red-200 text-red-700" : 
                              "bg-orange-50 border-orange-200 text-orange-700"
                            }`}>
                              {c.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-y-3 gap-x-2 my-4 p-3 bg-muted/30 rounded-lg border border-border/50">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">TDS Amount</p>
                              <p className="text-[13px] font-mono text-foreground font-medium">₹{Number(c.tdsAmount ?? 0).toLocaleString("en-IN")}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Interest</p>
                              <p className="text-[13px] font-mono text-orange-600 font-medium">₹{Number(c.interestAmount ?? 0).toLocaleString("en-IN")}</p>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-border/50">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Payable</p>
                              <p className="text-lg font-mono text-foreground font-bold">₹{Number(c.totalPayable ?? 0).toLocaleString("en-IN")}</p>
                            </div>
                          </div>

                          <div className="mt-auto space-y-1.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Due Date:</span>
                              <span className={`font-mono font-medium ${c.status === "overdue" ? "text-red-600" : "text-foreground"}`}>
                                {c.dueDateDeposit ? new Date(c.dueDateDeposit).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' }) : "—"}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">BSR Code:</span>
                              <span className="font-mono text-foreground">{c.bsrCode || "—"}</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Challan No:</span>
                              <span className="font-mono text-foreground">{c.challanNumber || "—"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Footer */}
                        <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-end">
                          {c.status !== "paid" ? (
                            <button
                              onClick={() => { setTdsPanel(tdsPanel === c.id ? null : c.id); setTdsForm({ bsrCode: "", challanNumber: "", paymentDate: new Date().toISOString().split("T")[0], totalDeposited: "" }); }}
                              className="w-full py-1.5 text-[12px] font-medium bg-primary text-white rounded hover:bg-primary/90 transition-colors shadow-sm"
                            >
                              {tdsPanel === c.id ? "Cancel Payment" : "Mark as Paid"}
                            </button>
                          ) : (
                            <div className="w-full py-1.5 text-[12px] font-medium text-green-700 bg-green-50 rounded flex items-center justify-center gap-1 border border-green-100">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Payment Completed
                            </div>
                          )}
                        </div>

                        {/* Payment Panel */}
                        {tdsPanel === c.id && (
                          <div className="absolute inset-0 z-10 bg-card/95 backdrop-blur-sm p-4 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-200">
                            <h4 className="text-[13px] font-bold text-foreground mb-3 flex items-center gap-2">
                              Record TDS Payment
                            </h4>
                            <div className="space-y-3 flex-1">
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase">BSR Code</label>
                                <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={tdsForm.bsrCode} onChange={e => setTdsForm(f => ({ ...f, bsrCode: e.target.value }))} placeholder="7 digits" />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Challan Number</label>
                                <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={tdsForm.challanNumber} onChange={e => setTdsForm(f => ({ ...f, challanNumber: e.target.value }))} placeholder="5 digits" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Date</label>
                                  <input type="date" className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={tdsForm.paymentDate} onChange={e => setTdsForm(f => ({ ...f, paymentDate: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Amount</label>
                                  <input type="number" className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={tdsForm.totalDeposited} onChange={e => setTdsForm(f => ({ ...f, totalDeposited: e.target.value }))} placeholder={c.totalPayable} />
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                              <button onClick={() => setTdsPanel(null)} className="flex-1 py-1.5 text-[11px] font-medium border border-border rounded hover:bg-muted text-foreground">Cancel</button>
                              <button
                                disabled={markTdsPaid.isPending || !tdsForm.bsrCode || !tdsForm.challanNumber || !tdsForm.totalDeposited}
                                onClick={() => markTdsPaid.mutate({ id: c.id, bsrCode: tdsForm.bsrCode, challanSerialNumber: tdsForm.challanNumber, paymentDate: new Date(tdsForm.paymentDate || new Date()) as any, totalDeposited: Number(tdsForm.totalDeposited) })}
                                className="flex-1 py-1.5 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {markTdsPaid.isPending ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-2 max-w-md">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase">Select Employee to View Documents</label>
              <select
                value={selectedDocEmployeeId}
                onChange={(e) => setSelectedDocEmployeeId(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
              >
                <option value="">— select employee —</option>
                {((employeesData as any[]) ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNumber ?? e.employeeId ?? e.id.slice(0, 8)} {e.name ? `— ${e.name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedDocEmployeeId ? (
              <div className="mt-4 border border-border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Document Type</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Process</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">File Name</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!employeeDocuments || employeeDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                          No documents collected for this employee.
                        </td>
                      </tr>
                    ) : (
                      employeeDocuments.map((doc, idx) => (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs font-semibold text-foreground">{doc.type}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{doc.category}</td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{doc.filename}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => toast.success(`Downloading ${doc.filename} (${doc.type})`)}
                              className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] rounded hover:bg-primary/95 transition-all font-medium"
                            >
                              Download
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-[12px]">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                Select an employee from the dropdown above to view and download their onboarding and offboarding documents.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit HR Case Modal */}
      {editingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Edit HR Case</h2>
              <button onClick={() => setEditingCase(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={editingCase.status}
                  onChange={(e) => setEditingCase((prev) => prev ? { ...prev, status: e.target.value as any } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Notes</label>
                <textarea
                  rows={4}
                  value={editingCase.notes}
                  onChange={(e) => setEditingCase((prev) => prev ? { ...prev, notes: e.target.value } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setEditingCase(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded">Cancel</button>
              <button
                disabled={updateHRCase.isPending}
                onClick={() => updateHRCase.mutate({ id: editingCase.id, status: editingCase.status, notes: editingCase.notes })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {updateHRCase.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {((employeesData as any[]) ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNumber ?? e.id.slice(0,8)} {e.name ? `— ${e.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={caseForm.status}
                  onChange={(e) => setCaseForm((f) => ({ ...f, status: e.target.value as "open" | "in_progress" | "closed" }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
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
                onClick={() => createHRCase.mutate({ employeeId: caseForm.employeeId, caseType: caseForm.caseType, notes: caseForm.notes || undefined, status: caseForm.status })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1"
              >
                {createHRCase.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Offboarding Modal */}
      {editingOffboardingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Edit Offboarding Details</h2>
              <button onClick={() => setEditingOffboardingEmployee(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Employee Name</label>
                <input
                  type="text"
                  value={offboardingForm.name}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Separation Forms</label>
                <input
                  type="text"
                  value={offboardingForm.separationDocs}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, separationDocs: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Clearance Forms</label>
                <input
                  type="text"
                  value={offboardingForm.clearanceDocs}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, clearanceDocs: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Security Clearance</label>
                <input
                  type="text"
                  value={offboardingForm.securityClearance}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, securityClearance: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={offboardingForm.status}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">F&F Status</label>
                <select
                  value={offboardingForm.ffStatus}
                  onChange={(e) => setOffboardingForm((prev) => ({ ...prev, ffStatus: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="pending">Pending</option>
                  <option value="initiated">Initiated</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setEditingOffboardingEmployee(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
              <button
                disabled={saveOffboardingDetails.isPending}
                onClick={() => saveOffboardingDetails.mutate({ employeeId: editingOffboardingEmployee.id, ...offboardingForm })}
                className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {saveOffboardingDetails.isPending ? "Saving..." : "Save Details"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Offboarding Modal */}
      {showOffboardingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Start New Offboarding
              </h2>
              <button onClick={() => setShowOffboardingForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Select Employee *</label>
                <select
                  value={offboardingCreateForm.employeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = ((employeesData as any[]) ?? []).find((x) => x.id === empId);
                    setOffboardingCreateForm((prev) => ({
                      ...prev,
                      employeeId: empId,
                      name: emp ? (emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`.trim()) : "",
                    }));
                  }}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="">— select employee —</option>
                  {((employeesData as any[]) ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNumber ?? e.employeeId ?? e.id.slice(0, 8)} {e.name ? `— ${e.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Employee Name *</label>
                <input
                  type="text"
                  value={offboardingCreateForm.name}
                  onChange={(e) => setOffboardingCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  placeholder="Employee Name"
                />
              </div>
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Offboarding Attachments</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Separation Forms</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={offboardingCreateForm.separationDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOffboardingCreateForm((prev) => ({ ...prev, separationDocs: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Clearance Forms</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={offboardingCreateForm.clearanceDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOffboardingCreateForm((prev) => ({ ...prev, clearanceDocs: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Security Clearance</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={offboardingCreateForm.securityClearance}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-xs bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label className="px-2 py-1.5 bg-secondary text-secondary-foreground text-xs rounded border border-border cursor-pointer hover:bg-secondary/80">
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setOffboardingCreateForm((prev) => ({ ...prev, securityClearance: file.name }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                  <select
                    value={offboardingCreateForm.status}
                    onChange={(e) => setOffboardingCreateForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">F&F Status</label>
                  <select
                    value={offboardingCreateForm.ffStatus}
                    onChange={(e) => setOffboardingCreateForm((prev) => ({ ...prev, ffStatus: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="initiated">Initiated</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setShowOffboardingForm(false)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
              <button
                disabled={createOffboarding.isPending || !offboardingCreateForm.employeeId}
                onClick={() => createOffboarding.mutate(offboardingCreateForm)}
                className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1"
              >
                {createOffboarding.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Start Offboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Lifecycle Event Modal */}
      {showLifecycleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Create Lifecycle Event
              </h2>
              <button onClick={() => setShowLifecycleForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Select Employee *</label>
                <select
                  value={lifecycleForm.employeeId}
                  onChange={(e) => setLifecycleForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="">— select employee —</option>
                  {((employeesData as any[]) ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNumber ?? e.employeeId ?? e.id.slice(0, 8)} {e.name ? `— ${e.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Event Name *</label>
                <input
                  type="text"
                  value={lifecycleForm.name}
                  onChange={(e) => setLifecycleForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  placeholder="e.g. IT onboarding transition"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Event Type</label>
                <input
                  type="text"
                  value={lifecycleForm.eventType}
                  onChange={(e) => setLifecycleForm((prev) => ({ ...prev, eventType: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  placeholder="employee_transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">HR Task Status</label>
                  <select
                    value={lifecycleForm.hrTaskStatus}
                    onChange={(e) => setLifecycleForm((prev) => ({ ...prev, hrTaskStatus: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">IT Task Status</label>
                  <select
                    value={lifecycleForm.itTaskStatus}
                    onChange={(e) => setLifecycleForm((prev) => ({ ...prev, itTaskStatus: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Payroll Compliance</label>
                <select
                  value={lifecycleForm.payrollCompliance}
                  onChange={(e) => setLifecycleForm((prev) => ({ ...prev, payrollCompliance: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={lifecycleForm.notes}
                  onChange={(e) => setLifecycleForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground resize-none"
                  placeholder="Additional comments..."
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setShowLifecycleForm(false)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
              <button
                disabled={createLifecycleEvent.isPending || !lifecycleForm.employeeId || !lifecycleForm.name}
                onClick={() => createLifecycleEvent.mutate(lifecycleForm)}
                className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createLifecycleEvent.isPending ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lifecycle Event Modal */}
      {editingLifecycleEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Edit Lifecycle Event</h2>
              <button onClick={() => setEditingLifecycleEvent(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Event Name</label>
                <input
                  type="text"
                  value={editingLifecycleEvent.name}
                  onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Event Type</label>
                <input
                  type="text"
                  value={editingLifecycleEvent.eventType}
                  onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, eventType: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">HR Task Status</label>
                  <select
                    value={editingLifecycleEvent.hrTaskStatus}
                    onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, hrTaskStatus: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">IT Task Status</label>
                  <select
                    value={editingLifecycleEvent.itTaskStatus}
                    onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, itTaskStatus: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Payroll Compliance</label>
                <select
                  value={editingLifecycleEvent.payrollCompliance}
                  onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, payrollCompliance: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={editingLifecycleEvent.notes || ""}
                  onChange={(e) => setEditingLifecycleEvent((prev: any) => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button onClick={() => setEditingLifecycleEvent(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
              <button
                disabled={updateLifecycleEvent.isPending}
                onClick={() => updateLifecycleEvent.mutate({
                  id: editingLifecycleEvent.id,
                  name: editingLifecycleEvent.name,
                  eventType: editingLifecycleEvent.eventType,
                  hrTaskStatus: editingLifecycleEvent.hrTaskStatus,
                  itTaskStatus: editingLifecycleEvent.itTaskStatus,
                  payrollCompliance: editingLifecycleEvent.payrollCompliance,
                  notes: editingLifecycleEvent.notes || undefined,
                })}
                className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {updateLifecycleEvent.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
