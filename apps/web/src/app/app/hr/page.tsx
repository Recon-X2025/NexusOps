"use client";

import React, { useState, useEffect } from "react";
import { UserCheck, Plus, CheckCircle2, Clock, FileText, ChevronRight, Loader2, IndianRupee, AlertTriangle, RefreshCw, Pencil, FileSignature, X, CheckCircle, Upload } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { LEAVE_TYPE_PICKER_OPTIONS, leaveTypeLabel } from "@/lib/leave-labels";
import { INDIAN_STATES } from "@/lib/india-states";
import { filterEmployeeDirectory } from "@/lib/employee-directory-access";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { EsignPanel } from "@/components/esign/EsignPanel";
import { LeaveAccrualsTab } from "@/components/hr/LeaveAccrualsTab";
import { GratuityTab } from "@/components/hr/GratuityTab";
import { CsvImportModal, type ImportField } from "@/components/csv-import-modal";

/**
 * Employee bulk-import columns. Keys match the `ingest.importEmployees` row fields exactly, so the
 * CSV maps straight through. Required: identity (name/email), pay (structureName, resolved by name
 * to a salary-structure family — never auto-created), and state (drives the PT slab). Everything
 * else is optional. The server re-validates every row and skips-and-reports bad ones; these enum
 * hints and required flags are a client convenience only.
 */
const EMPLOYEE_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "structureName", label: "Salary Structure", required: true },
  // Labelled WORK state deliberately. Professional tax is a place-of-EMPLOYMENT levy
  // and payroll resolves the PT slab from this column
  // (services/payroll-run-aggregates.ts). "State" alone reads as a home address, and
  // a home address here computes the wrong tax silently.
  { key: "state", label: "Work State (office location — sets professional tax; not home address)", required: true },
  { key: "department", label: "Department" },
  { key: "title", label: "Title" },
  { key: "jobGrade", label: "Job Grade" },
  { key: "employmentType", label: "Employment Type", enumValues: ["full_time", "part_time", "contractor", "intern"] },
  { key: "location", label: "Location" },
  { key: "city", label: "City" },
  { key: "isMetroCity", label: "Metro City (true/false)" },
  // REQUIRED: taxRegime is a statutory election (old vs new, s.115BAC) filed on Form 24Q / Form 16.
  // A missing column would silently default the whole workforce to NEW, so the modal refuses a file
  // without it and the server re-checks (see ingest.importEmployees). A blank cell in a present
  // column is a per-row skip.
  { key: "taxRegime", label: "Tax Regime", required: true, enumValues: ["old", "new"] },
  { key: "startDate", label: "Start Date (YYYY-MM-DD)" },
  { key: "pan", label: "PAN" },
  { key: "uan", label: "UAN" },
  { key: "esiIpNumber", label: "ESI IP Number" },
  { key: "bankAccountNumber", label: "Bank Account Number" },
  { key: "bankIfsc", label: "Bank IFSC" },
  { key: "bankName", label: "Bank Name" },
  { key: "bankAccountName", label: "Bank Account Name" },
  { key: "gender", label: "Gender", enumValues: ["male", "female", "other"] },
  { key: "dateOfBirth", label: "Date of Birth (YYYY-MM-DD)" },
  // C1 declaration figures (prior-employer income/TDS, rent) are intentionally NOT imported —
  // they need a provenance status a CSV cell can't carry. They stay HR-keyed via the edit dialog.
];

/** Client-side PAN check (mirrors the server Zod rule). Empty = "no PAN" (ok); otherwise it must
 *  be AAAAA9999A. Returns an error string, or null when acceptable. The server re-validates. */
function panInputError(pan: string): string | null {
  const v = pan.trim().toUpperCase();
  return v === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)
    ? null
    : "PAN must be in the format AAAAA9999A (5 letters, 4 digits, 1 letter).";
}

const HR_TABS = [
  { key: "directory",  label: "Employee Directory",   module: "hr"         as const, action: "read"  as const },
  { key: "cases",       label: "HR Cases",            module: "hr"         as const, action: "read"  as const },
  { key: "leave",       label: "Leave Management",    module: "hr"         as const, action: "read"  as const },
  { key: "onboarding",  label: "Onboarding",           module: "onboarding" as const, action: "read"  as const },
  { key: "offboarding", label: "Offboarding",          module: "hr"         as const, action: "write" as const },
  { key: "lifecycle",   label: "Lifecycle Events",     module: "hr"         as const, action: "write" as const },
  { key: "payroll_compliance", label: "Payroll Compliance", module: "hr"   as const, action: "admin" as const },
  { key: "leave_accruals", label: "Leave Accruals", module: "hr" as const, action: "admin" as const },
  { key: "gratuity", label: "Gratuity", module: "hr" as const, action: "admin" as const },
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

// EXIT-DATE: settlement clock. Full and final settlement is due within two WORKING days of the
// last working day (Code on Wages). Weekends only for now — the holiday calendar is per-tenant and
// unverified; feeding it an unverified calendar would show a due date that is a day off, which is
// worse than one that counts itself. Deferred trigger: holiday calendar verified per tenant.
function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/** Last working day → settlement due date (+2 working days) → met | outstanding | overdue. */
function settlementClock(endDate: string | Date | null | undefined, ffStatus: string | null | undefined) {
  if (!endDate) return null;
  const lwd = new Date(endDate);
  if (Number.isNaN(lwd.getTime())) return null;
  const due = addWorkingDays(lwd, 2);
  const settled = ffStatus === "completed";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const status: "met" | "outstanding" | "overdue" = settled ? "met" : today > due ? "overdue" : "outstanding";
  const fmt = (x: Date) => x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return { lwd: fmt(lwd), due: fmt(due), status };
}

export default function HRPage() {
  const { can, currentUser, mergeTrpcQueryOpts } = useRBAC();

  // Directory management capability. The API requires hr:assign to create/update
  // an employee (permissionProcedure("hr","assign")), so the UI gates the
  // Add/Edit/Policy controls on the SAME action — not on hr:write, which the base
  // requester role holds (that mismatch showed the buttons then 403'd the save).
  const canManageEmployees = can("hr", "assign");

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
  // A non-manager sees only their own record; a manager (hr:assign) sees all.
  const visibleEmployees = filterEmployeeDirectory(
    (employeesData as Array<{ userId?: string | null }> | undefined),
    currentUser.id,
    canManageEmployees,
  );
  const { data: structuresData } = trpc.payroll.salaryStructures.list.useQuery(undefined, mergeTrpcQueryOpts("payroll.salaryStructures.list", { refetchOnWindowFocus: false }));

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
    salaryStructureId: "",
    startDate: "",
    // Statutory ingestion (drives PT / HRA / TDS — see hr router create).
    state: "",
    city: "",
    isMetroCity: false,
    taxRegime: "new" as "old" | "new",
    pan: "",
    uan: "",
    esiIpNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankAccountName: "",
    gender: "" as "" | "male" | "female" | "other",
    dateOfBirth: "",
    ptExemptArmedForces: false,
    ptExemptDisability: false,
    ptExemptDependentDisability: false,
    previousEmployerIncome: "",
    previousEmployerTds: "",
    rentPaidAnnual: "",
    // Voluntary PF: extra EMPLOYEE rate above the statutory 12% (percentage). Employee's own choice.
    voluntaryPfRate: "",
    // EPFO Para 26(6): PF on the full basic (uncapped) — lawful only with an approval reference.
    para266JointRequest: false,
    para266EmployerUndertaking: false,
    para266ApprovalReference: "",
    para266EffectiveFrom: "",
  });
  const [editEmpForm, setEditEmpForm] = useState({
    department: "",
    title: "",
    location: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    managerId: "",
    salaryStructureId: "",
    state: "",
    city: "",
    isMetroCity: false,
    taxRegime: "new" as "old" | "new",
    pan: "",
    uan: "",
    esiIpNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankAccountName: "",
    gender: "" as "" | "male" | "female" | "other",
    dateOfBirth: "",
    ptExemptArmedForces: false,
    ptExemptDisability: false,
    ptExemptDependentDisability: false,
    previousEmployerIncome: "",
    previousEmployerTds: "",
    rentPaidAnnual: "",
    voluntaryPfRate: "",
    para266JointRequest: false,
    para266EmployerUndertaking: false,
    para266ApprovalReference: "",
    para266EffectiveFrom: "",
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
        salaryStructureId: "",
        startDate: "",
        state: "",
        city: "",
        isMetroCity: false,
        taxRegime: "new",
        pan: "",
        uan: "",
        esiIpNumber: "",
        bankAccountNumber: "",
        bankIfsc: "",
        bankName: "",
        bankAccountName: "",
        gender: "",
        dateOfBirth: "",
        ptExemptArmedForces: false,
        ptExemptDisability: false,
        ptExemptDependentDisability: false,
        previousEmployerIncome: "",
        previousEmployerTds: "",
        rentPaidAnnual: "",
        voluntaryPfRate: "",
        para266JointRequest: false,
        para266EmployerUndertaking: false,
        para266ApprovalReference: "",
        para266EffectiveFrom: "",
      });
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not create employee"),
  });

  const updateEmployee = trpc.hr.employees.update.useMutation({
    onSuccess: (data?: { warnings?: string[] }) => {
      toast.success("Employee updated");
      // Surface any backend warnings (e.g. clearing an approved Para 26(6) election) — do not swallow.
      for (const w of data?.warnings ?? []) toast.warning(w, { duration: 12000 });
      utils.hr.employees.list.invalidate();
      setEditingEmployee(null);
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not update employee"),
  });

  const [showImportEmployees, setShowImportEmployees] = useState(false);
  const importEmployees = trpc.ingest.importEmployees.useMutation();

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
    endDate: "", // EXIT-DATE: last working day (required)
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
        endDate: "",
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

  // FULL-AND-FINAL: settle the exit. A live preview composes the figure (last salary + encashment
  // + gratuity − recoveries); Confirm persists it (idempotent server-side) and flips the clock to
  // "met". Recoveries are the only inputs — every other part is computed from the leaver's record.
  const [settlingEmployee, setSettlingEmployee] = useState<{ id: string; name: string } | null>(null);
  const [ffRecoveries, setFfRecoveries] = useState({ noticeShortfall: "", advanceRecovery: "", assetRecovery: "" });
  const ffRecoveryArgs = {
    noticeShortfall: Number(ffRecoveries.noticeShortfall) || 0,
    advanceRecovery: Number(ffRecoveries.advanceRecovery) || 0,
    assetRecovery: Number(ffRecoveries.assetRecovery) || 0,
  };
  const settlementPreview = trpc.settlement.preview.useQuery(
    { employeeId: settlingEmployee?.id ?? "", ...ffRecoveryArgs },
    { enabled: !!settlingEmployee, retry: false, refetchOnWindowFocus: false },
  );
  const settleFF = trpc.settlement.settle.useMutation({
    onSuccess: () => {
      toast.success("Full & final settlement recorded");
      utils.hr.cases.list.invalidate();
      setSettlingEmployee(null);
      setFfRecoveries({ noticeShortfall: "", advanceRecovery: "", assetRecovery: "" });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to settle"),
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

  // India payroll compliance — TDS challans + EPFO ECR (+ ESI/PT, read-only: F13)
  const tdsChallansQuery = trpc.indiaCompliance.tdsChallans.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.tdsChallans.list", { refetchOnWindowFocus: false }));
  const epfoEcrQuery     = trpc.indiaCompliance.epfoEcr.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.epfoEcr.list", { refetchOnWindowFocus: false }));
  const esiChallansQuery = trpc.indiaCompliance.esiChallans.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.esiChallans.list", { refetchOnWindowFocus: false }));
  const ptChallansQuery  = trpc.indiaCompliance.ptChallans.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.ptChallans.list", { refetchOnWindowFocus: false }));
  const markTdsPaid      = trpc.indiaCompliance.tdsChallans.markPaid.useMutation({ onSuccess: () => { tdsChallansQuery.refetch(); setTdsPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const markEcrSubmitted = trpc.indiaCompliance.epfoEcr.markSubmitted.useMutation({ onSuccess: () => { epfoEcrQuery.refetch(); setEcrPanel(null); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createHRCase = trpc.hr.cases.create.useMutation({
    onSuccess: () => {
      toast.success("HR Case created successfully");
      utils.hr.cases.list.invalidate();
      setShowCaseForm(false);
      setCaseForm({ employeeId: "", caseType: "policy", subject: "", notes: "", status: "open" });
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

  const [caseForm, setCaseForm] = useState({ employeeId: "", caseType: "policy" as const, subject: "", notes: "", status: "open" as "open" | "in_progress" | "closed" });
  const [editingCase, setEditingCase] = useState<{id: string, notes: string, status: "open" | "in_progress" | "closed"} | null>(null);
  const [archivingCase, setArchivingCase] = useState<string | null>(null);
  const [archiveNote, setArchiveNote] = useState("");
  const tdsChallans: any[] = tdsChallansQuery.data ?? [];
  const epfoEcrs: any[]    = epfoEcrQuery.data ?? [];
  const esiChallans: any[] = esiChallansQuery.data ?? [];
  const ptChallans: any[]  = ptChallansQuery.data ?? [];

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
              className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background resize-none"
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
              <h2 className="text-body-sm font-semibold text-foreground">Onboarding Details - {editingOnboardingEmployee.name}</h2>
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
                        className="w-full border border-border rounded px-3 py-1.5 text-caption bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Employee Docs</label>
                      <input
                        type="text"
                        value={onboardingForm.employeeDocs}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, employeeDocs: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-caption bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Signed Offer Letter</label>
                      <input
                        type="text"
                        value={onboardingForm.signedOfferLetter}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, signedOfferLetter: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-caption bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase mb-1">Passport Photo</label>
                      <input
                        type="text"
                        value={onboardingForm.photo}
                        onChange={(e) => setOnboardingForm(prev => ({ ...prev, photo: e.target.value }))}
                        className="w-full border border-border rounded px-3 py-1.5 text-caption bg-card text-foreground"
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
              <h2 className="text-body-sm font-semibold text-foreground flex items-center gap-2">
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
                <h3 className="text-caption font-semibold text-foreground mb-3 uppercase tracking-wider">Required Attachments</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Education Docs</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={onboardingCreateForm.educationDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
              <h2 className="text-body-sm font-semibold text-foreground">Edit Leave Request</h2>
              <button onClick={() => setEditingLeave(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={editingLeave.status === "approved" ? "pending" : editingLeave.status}
                  onChange={(e) => setEditingLeave((prev: any) => prev ? { ...prev, status: e.target.value } : null)}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                >
                  {/* Approval is intentionally NOT offered here: it must go through
                      the Approve button (hr.leave.approve), which also moves the
                      leave balance and writes the attendance reflex for payroll LOP.
                      Editing can only set pending/rejected. */}
                  <option value="pending">Pending</option>
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
                  {LEAVE_TYPE_PICKER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {/* Legacy value (other / primary / annual) not in the offered set: keep it as an option
                      while editing such a row so it renders honestly instead of snapping to the first. */}
                  {editingLeave?.type && !LEAVE_TYPE_PICKER_OPTIONS.some(o => o.value === editingLeave.type) && (
                    <option value={editingLeave.type}>{leaveTypeLabel(editingLeave.type)}</option>
                  )}
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

      {showImportEmployees && canManageEmployees && (
        <CsvImportModal
          title="Import Employees"
          fields={EMPLOYEE_IMPORT_FIELDS}
          hint="Salary Structure is matched by name; unknown or ambiguous names are skipped and reported. PAN is stored encrypted."
          onClose={() => setShowImportEmployees(false)}
          onImport={async (rows, meta) => {
            // The user reviewed the rows in the preview/confirm steps, so this is the deliberate
            // write: pass dryRun:false explicitly (the server defaults to a safe dry run).
            // `meta.presentColumns` lets the server refuse a file whose taxRegime column is absent
            // (a blank cell can't be told from a missing column in `rows` alone).
            const res = await importEmployees.mutateAsync({
              dryRun: false,
              columns: meta.presentColumns,
              rows: rows.map((r) => ({
                name: r.name,
                email: r.email,
                structureName: r.structureName,
                state: r.state,
                department: r.department || undefined,
                title: r.title || undefined,
                jobGrade: r.jobGrade || undefined,
                employmentType: r.employmentType || undefined,
                location: r.location || undefined,
                city: r.city || undefined,
                isMetroCity: r.isMetroCity || undefined,
                taxRegime: r.taxRegime || undefined,
                startDate: r.startDate || undefined,
                pan: r.pan || undefined,
                uan: r.uan || undefined,
                esiIpNumber: r.esiIpNumber || undefined,
                bankAccountNumber: r.bankAccountNumber || undefined,
                bankIfsc: r.bankIfsc || undefined,
                bankName: r.bankName || undefined,
                bankAccountName: r.bankAccountName || undefined,
                gender: r.gender || undefined,
                dateOfBirth: r.dateOfBirth || undefined,
              })),
            });
            utils.hr.employees.list.invalidate();
            // Surface the server's per-row skips (structure-not-found, duplicate email, etc.) that
            // the client-side validation could not know about.
            res.skipped.slice(0, 6).forEach((s) =>
              toast.error(`Row ${s.row} (${s.identifier}): ${s.reason}`),
            );
            return { imported: res.imported, skipped: res.skipped.length };
          }}
        />
      )}

      {showAddEmployee && can("hr", "write") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-border shrink-0">
              <h3 className="text-[13px] font-semibold">Add employee</h3>
              <button type="button" onClick={() => setShowAddEmployee(false)} className="text-muted-foreground hover:text-foreground text-caption">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <p className="text-[11px] text-muted-foreground mb-3">
              Links a platform user in your org to an HR employee record (required for directory, leave, and workforce analytics).
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-muted-foreground">User *</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                      value={addEmpForm.userName}
                      onChange={(e) => setAddEmpForm((f) => ({ ...f, userName: e.target.value }))}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="text-[11px] text-muted-foreground">New User Email *</label>
                    <input
                      type="email"
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.department}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Title</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.title}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Location</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.location}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Employment type</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                <label className="text-[11px] text-muted-foreground">Salary structure</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.salaryStructureId}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, salaryStructureId: e.target.value }))}
                >
                  <option value="">None</option>
                  {((structuresData as any[]) ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.structureName ?? s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Start date</label>
                <input
                  type="date"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.startDate}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>

              {/* ── Location & Professional Tax ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location &amp; professional tax</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">State *</label>
                  <select
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.state}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, state: e.target.value }))}
                  >
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">City</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.city}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={addEmpForm.isMetroCity}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, isMetroCity: e.target.checked }))}
                />
                Metro city (Delhi/Mumbai/Kolkata/Chennai — 50% HRA by residence)
              </label>

              {/* ── Tax election ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tax election</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Tax regime (locked 12 months)</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.taxRegime}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, taxRegime: e.target.value as "old" | "new" }))}
                >
                  <option value="new">New regime</option>
                  <option value="old">Old regime</option>
                </select>
              </div>

              {/* ── Statutory identity ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Statutory identity</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">PAN</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background uppercase"
                    value={addEmpForm.pan}
                    placeholder="AAAAA9999A"
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">UAN</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.uan}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, uan: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">ESI IP number</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.esiIpNumber}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, esiIpNumber: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Gender (PT bracket)</label>
                  <select
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.gender}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, gender: e.target.value as typeof f.gender }))}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Date of birth</label>
                  <input
                    type="date"
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.dateOfBirth}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Bank account no.</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.bankAccountNumber}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">IFSC</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.bankIfsc}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, bankIfsc: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Bank name</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.bankName}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, bankName: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Account holder name</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.bankAccountName}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── PT exemptions (evidence required at declaration) ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Professional-tax exemptions</p>
                <p className="text-[10px] text-muted-foreground">Any one exempts PT in every state. Evidence required (military ID / Form 10-IA / birth proof).</p>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={addEmpForm.ptExemptArmedForces}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, ptExemptArmedForces: e.target.checked }))}
                />
                Armed forces
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={addEmpForm.ptExemptDisability}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, ptExemptDisability: e.target.checked }))}
                />
                Own disability (Form 10-IA)
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={addEmpForm.ptExemptDependentDisability}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, ptExemptDependentDisability: e.target.checked }))}
                />
                Parent/guardian of a dependent with disability
              </label>

              {/* ── Prior employer (Form 12B) — only if the joiner submitted one ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prior employer (Form 12B)</p>
                <p className="text-[10px] text-muted-foreground">This financial year, from a previous employer. Leave blank if no Form 12B was submitted.</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Income already paid (₹/yr)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.previousEmployerIncome}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, previousEmployerIncome: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">TDS already deducted (₹/yr)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={addEmpForm.previousEmployerTds}
                    onChange={(e) => setAddEmpForm((f) => ({ ...f, previousEmployerTds: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── HRA declaration (old regime only) — declared annual rent for s.10(13A) ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">House rent (HRA declaration)</p>
                <p className="text-[10px] text-muted-foreground">Annual rent paid, for the old-regime HRA exemption. Ignored under the new regime; leave blank if not renting.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Rent paid (₹/yr)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.rentPaidAnnual}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, rentPaidAnnual: e.target.value }))}
                />
              </div>

              {/* ── Provident fund: voluntary top-up + Para 26(6) uncapped election ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provident fund — voluntary &amp; Para 26(6)</p>
                <p className="text-[10px] text-muted-foreground">VPF is the employee&rsquo;s own top-up above the statutory 12% (the employer contribution is unchanged). Para 26(6) contributes on the full basic above ₹15,000 — lawful only once an approval reference is on record.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Voluntary PF rate (% above 12)</label>
                <input
                  type="number"
                  min={0}
                  max={88}
                  step="0.01"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.voluntaryPfRate}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, voluntaryPfRate: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={addEmpForm.para266JointRequest} onChange={(e) => setAddEmpForm((f) => ({ ...f, para266JointRequest: e.target.checked }))} />
                  Para 26(6) joint request received
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={addEmpForm.para266EmployerUndertaking} onChange={(e) => setAddEmpForm((f) => ({ ...f, para266EmployerUndertaking: e.target.checked }))} />
                  Employer undertaking given
                </label>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">EPFO approval reference <span className="text-primary">— this is what makes uncapped PF lawful</span></label>
                <input
                  type="text"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.para266ApprovalReference}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, para266ApprovalReference: e.target.value }))}
                  placeholder="e.g. EPFO/JD/2026/12345"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Without this reference the ₹15,000 ceiling applies, whatever else is recorded here.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Effective from</label>
                <input
                  type="date"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={addEmpForm.para266EffectiveFrom}
                  onChange={(e) => setAddEmpForm((f) => ({ ...f, para266EffectiveFrom: e.target.value }))}
                />
              </div>
            </div>
            </div>
            {/* FORM-SILENT-REFUSAL: say what is still missing rather than leaving a disabled button
                unexplained. Structure is required at create (ADD-EMP-STRUCT), so the button gates on it too. */}
            {(() => {
              const missing = [
                !addEmpForm.userId && (!addEmpForm.userName || !addEmpForm.userEmail) ? "employee name + work email" : null,
                !addEmpForm.state.trim() ? "state" : null,
                !addEmpForm.salaryStructureId ? "salary structure" : null,
              ].filter(Boolean);
              return missing.length > 0 ? (
                <p className="px-5 pt-2 text-[11px] text-muted-foreground">Still needed to create this employee: {missing.join(", ")}.</p>
              ) : null;
            })()}
            <div className="flex gap-2 p-5 pt-3 border-t border-border shrink-0">
              <button
                type="button"
                disabled={
                  (!addEmpForm.userId && (!addEmpForm.userName || !addEmpForm.userEmail)) ||
                  !addEmpForm.state.trim() ||
                  !addEmpForm.salaryStructureId ||
                  createEmployee.isPending
                }
                onClick={() => {
                  const panErr = panInputError(addEmpForm.pan);
                  if (panErr) { toast.error(panErr); return; }
                  createEmployee.mutate({
                    userId: addEmpForm.userId || undefined,
                    userName: addEmpForm.userName || undefined,
                    userEmail: addEmpForm.userEmail || undefined,
                    department: addEmpForm.department || undefined,
                    title: addEmpForm.title || undefined,
                    location: addEmpForm.location || undefined,
                    employmentType: addEmpForm.employmentType,
                    managerId: addEmpForm.managerId || undefined,
                    salaryStructureId: addEmpForm.salaryStructureId || undefined,
                    startDate: addEmpForm.startDate ? new Date(`${addEmpForm.startDate}T12:00:00`) : undefined,
                    state: addEmpForm.state.trim(),
                    city: addEmpForm.city || undefined,
                    isMetroCity: addEmpForm.isMetroCity,
                    taxRegime: addEmpForm.taxRegime,
                    pan: addEmpForm.pan.trim() || undefined,
                    uan: addEmpForm.uan || undefined,
                    esiIpNumber: addEmpForm.esiIpNumber || undefined,
                    bankAccountNumber: addEmpForm.bankAccountNumber || undefined,
                    bankIfsc: addEmpForm.bankIfsc || undefined,
                    bankName: addEmpForm.bankName || undefined,
                    bankAccountName: addEmpForm.bankAccountName || undefined,
                    gender: addEmpForm.gender || undefined,
                    dateOfBirth: addEmpForm.dateOfBirth ? new Date(`${addEmpForm.dateOfBirth}T12:00:00`) : undefined,
                    ptExemptArmedForces: addEmpForm.ptExemptArmedForces,
                    ptExemptDisability: addEmpForm.ptExemptDisability,
                    ptExemptDependentDisability: addEmpForm.ptExemptDependentDisability,
                    previousEmployerIncome: addEmpForm.previousEmployerIncome
                      ? Number(addEmpForm.previousEmployerIncome)
                      : undefined,
                    previousEmployerTds: addEmpForm.previousEmployerTds
                      ? Number(addEmpForm.previousEmployerTds)
                      : undefined,
                    rentPaidAnnual: addEmpForm.rentPaidAnnual
                      ? Number(addEmpForm.rentPaidAnnual)
                      : undefined,
                    voluntaryPfRate: addEmpForm.voluntaryPfRate
                      ? Number(addEmpForm.voluntaryPfRate)
                      : undefined,
                    para266JointRequest: addEmpForm.para266JointRequest,
                    para266EmployerUndertaking: addEmpForm.para266EmployerUndertaking,
                    para266ApprovalReference: addEmpForm.para266ApprovalReference.trim() || undefined,
                    para266EffectiveFrom: addEmpForm.para266EffectiveFrom
                      ? new Date(`${addEmpForm.para266EffectiveFrom}T12:00:00`)
                      : undefined,
                  });
                }}
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
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-border shrink-0">
              <h3 className="text-[13px] font-semibold">Edit employee</h3>
              <button type="button" onClick={() => setEditingEmployee(null)} className="text-muted-foreground hover:text-foreground text-caption">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-muted-foreground">Department</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.department}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Title</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.title}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Location</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.location}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Employment type</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
              <div>
                <label className="text-[11px] text-muted-foreground">Salary structure</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.salaryStructureId}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, salaryStructureId: e.target.value }))}
                >
                  <option value="">None</option>
                  {((structuresData as any[]) ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.structureName ?? s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Location & Professional Tax ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location &amp; professional tax</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">State</label>
                  <select
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.state}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, state: e.target.value }))}
                  >
                    <option value="">Select state…</option>
                    {/* Preserve an existing free-text value (e.g. a live "Karnatak") so it
                        stays visible and correctable rather than silently blanking. */}
                    {editEmpForm.state && !INDIAN_STATES.includes(editEmpForm.state) && (
                      <option value={editEmpForm.state}>{editEmpForm.state} (unrecognised — please fix)</option>
                    )}
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">City</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.city}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editEmpForm.isMetroCity}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, isMetroCity: e.target.checked }))}
                />
                Metro city (Delhi/Mumbai/Kolkata/Chennai — 50% HRA by residence)
              </label>

              {/* ── Tax election ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tax election</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Tax regime (locked 12 months)</label>
                <select
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.taxRegime}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, taxRegime: e.target.value as "old" | "new" }))}
                >
                  <option value="new">New regime</option>
                  <option value="old">Old regime</option>
                </select>
              </div>

              {/* ── Statutory identity ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Statutory identity</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">
                    PAN{editingEmployee?.panMaskedDisplay ? ` (current: ${editingEmployee.panMaskedDisplay})` : ""}
                  </label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background uppercase"
                    value={editEmpForm.pan}
                    placeholder={editingEmployee?.panMaskedDisplay ? "Enter a new PAN to change" : "AAAAA9999A"}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">UAN</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.uan}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, uan: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">ESI IP number</label>
                <input
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.esiIpNumber}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, esiIpNumber: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Gender (PT bracket)</label>
                  <select
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.gender}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, gender: e.target.value as typeof f.gender }))}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Date of birth</label>
                  <input
                    type="date"
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.dateOfBirth}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Bank account no.</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.bankAccountNumber}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">IFSC</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.bankIfsc}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, bankIfsc: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Bank name</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.bankName}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, bankName: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Account holder name</label>
                  <input
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.bankAccountName}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── PT exemptions (evidence required at declaration) ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Professional-tax exemptions</p>
                <p className="text-[10px] text-muted-foreground">Any one exempts PT in every state. Evidence required (military ID / Form 10-IA / birth proof).</p>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editEmpForm.ptExemptArmedForces}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, ptExemptArmedForces: e.target.checked }))}
                />
                Armed forces
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editEmpForm.ptExemptDisability}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, ptExemptDisability: e.target.checked }))}
                />
                Own disability (Form 10-IA)
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editEmpForm.ptExemptDependentDisability}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, ptExemptDependentDisability: e.target.checked }))}
                />
                Parent/guardian of a dependent with disability
              </label>

              {/* ── Prior employer (Form 12B) — only if the joiner submitted one ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prior employer (Form 12B)</p>
                <p className="text-[10px] text-muted-foreground">This financial year, from a previous employer. Leave blank if no Form 12B was submitted.</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">Income already paid (₹/yr)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.previousEmployerIncome}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, previousEmployerIncome: e.target.value }))}
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[11px] text-muted-foreground">TDS already deducted (₹/yr)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                    value={editEmpForm.previousEmployerTds}
                    onChange={(e) => setEditEmpForm((f) => ({ ...f, previousEmployerTds: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── HRA declaration (old regime only) — declared annual rent for s.10(13A) ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">House rent (HRA declaration)</p>
                <p className="text-[10px] text-muted-foreground">Annual rent paid, for the old-regime HRA exemption. Ignored under the new regime; leave blank if not renting.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Rent paid (₹/yr)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.rentPaidAnnual}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, rentPaidAnnual: e.target.value }))}
                />
              </div>

              {/* ── Provident fund: voluntary top-up + Para 26(6) uncapped election ── */}
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provident fund — voluntary &amp; Para 26(6)</p>
                <p className="text-[10px] text-muted-foreground">VPF is the employee&rsquo;s own top-up above 12% (employer unchanged), changeable at will. Para 26(6) uncaps PF only with an approval reference; clearing an approved election is warned, not blocked.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Voluntary PF rate (% above 12)</label>
                <input
                  type="number"
                  min={0}
                  max={88}
                  step="0.01"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.voluntaryPfRate}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, voluntaryPfRate: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={editEmpForm.para266JointRequest} onChange={(e) => setEditEmpForm((f) => ({ ...f, para266JointRequest: e.target.checked }))} />
                  Para 26(6) joint request received
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={editEmpForm.para266EmployerUndertaking} onChange={(e) => setEditEmpForm((f) => ({ ...f, para266EmployerUndertaking: e.target.checked }))} />
                  Employer undertaking given
                </label>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">EPFO approval reference <span className="text-primary">— this is what makes uncapped PF lawful</span></label>
                <input
                  type="text"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.para266ApprovalReference}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, para266ApprovalReference: e.target.value }))}
                  placeholder="e.g. EPFO/JD/2026/12345"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Clearing this on an approved election reverts PF to the ₹15,000 ceiling; the change is accepted with a warning.</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Effective from</label>
                <input
                  type="date"
                  className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={editEmpForm.para266EffectiveFrom}
                  onChange={(e) => setEditEmpForm((f) => ({ ...f, para266EffectiveFrom: e.target.value }))}
                />
              </div>
            </div>
            </div>
            <div className="flex gap-2 p-5 pt-3 border-t border-border shrink-0">
              <button
                type="button"
                disabled={updateEmployee.isPending}
                onClick={() => {
                  const panErr = panInputError(editEmpForm.pan);
                  if (panErr) { toast.error(panErr); return; }
                  updateEmployee.mutate({
                    id: editingEmployee.id as string,
                    department: editEmpForm.department || undefined,
                    title: editEmpForm.title || undefined,
                    location: editEmpForm.location || undefined,
                    employmentType: editEmpForm.employmentType,
                    managerId: editEmpForm.managerId === "" ? null : editEmpForm.managerId,
                    salaryStructureId: editEmpForm.salaryStructureId === "" ? null : editEmpForm.salaryStructureId,
                    state: editEmpForm.state.trim() || undefined,
                    city: editEmpForm.city || undefined,
                    isMetroCity: editEmpForm.isMetroCity,
                    taxRegime: editEmpForm.taxRegime,
                    // Write-only: only send a PAN when the admin typed a new one (empty = no change).
                    pan: editEmpForm.pan.trim() || undefined,
                    uan: editEmpForm.uan || undefined,
                    esiIpNumber: editEmpForm.esiIpNumber || undefined,
                    bankAccountNumber: editEmpForm.bankAccountNumber || undefined,
                    bankIfsc: editEmpForm.bankIfsc || undefined,
                    bankName: editEmpForm.bankName || undefined,
                    bankAccountName: editEmpForm.bankAccountName || undefined,
                    gender: editEmpForm.gender || undefined,
                    dateOfBirth: editEmpForm.dateOfBirth ? new Date(`${editEmpForm.dateOfBirth}T12:00:00`) : undefined,
                    ptExemptArmedForces: editEmpForm.ptExemptArmedForces,
                    ptExemptDisability: editEmpForm.ptExemptDisability,
                    ptExemptDependentDisability: editEmpForm.ptExemptDependentDisability,
                    previousEmployerIncome: editEmpForm.previousEmployerIncome
                      ? Number(editEmpForm.previousEmployerIncome)
                      : undefined,
                    previousEmployerTds: editEmpForm.previousEmployerTds
                      ? Number(editEmpForm.previousEmployerTds)
                      : undefined,
                    rentPaidAnnual: editEmpForm.rentPaidAnnual
                      ? Number(editEmpForm.rentPaidAnnual)
                      : undefined,
                    // VPF is freely editable — an empty field means the employee removed it (0).
                    voluntaryPfRate:
                      editEmpForm.voluntaryPfRate === "" ? 0 : Number(editEmpForm.voluntaryPfRate),
                    para266JointRequest: editEmpForm.para266JointRequest,
                    para266EmployerUndertaking: editEmpForm.para266EmployerUndertaking,
                    // Send the raw (possibly empty) reference so the backend can detect + warn on
                    // clearing an approved election rather than silently ignoring it.
                    para266ApprovalReference: editEmpForm.para266ApprovalReference.trim(),
                    para266EffectiveFrom: editEmpForm.para266EffectiveFrom
                      ? new Date(`${editEmpForm.para266EffectiveFrom}T12:00:00`)
                      : undefined,
                  });
                }}
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
          <h1 className="text-body-sm font-semibold text-foreground">HR Service Delivery</h1>
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
            <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
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
                {visibleEmployees.length} {canManageEmployees ? "Employees" : "My record"}
              </span>
              {canManageEmployees && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportEmployees(true)}
                    className="flex items-center gap-1 px-3 py-1 border border-border text-[11px] rounded hover:bg-accent"
                  >
                    <Upload className="w-3 h-3" /> Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddEmployee(true)}
                    className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] rounded hover:opacity-90"
                  >
                    <Plus className="w-3 h-3" /> Add employee
                  </button>
                </div>
              )}
            </div>
            {visibleEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
                <UserCheck className="w-5 h-5 opacity-30" />
                <span className="text-caption">{canManageEmployees ? "No employees found." : "No employee record found for your account."}</span>
                {canManageEmployees && (
                  <button
                    type="button"
                    onClick={() => setShowAddEmployee(true)}
                    className="mt-2 text-caption text-primary hover:underline"
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
                    {canManageEmployees && <th className="text-right w-24">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(visibleEmployees as any[]).map((emp: any) => {
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
                      {canManageEmployees && (
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
                                  salaryStructureId: emp.salaryStructureId ? String(emp.salaryStructureId) : "",
                                  state: String(emp.state ?? ""),
                                  city: String(emp.city ?? ""),
                                  isMetroCity: Boolean(emp.isMetroCity),
                                  taxRegime: (emp.taxRegime === "old" ? "old" : "new") as "old" | "new",
                                  // PAN is WRITE-ONLY: never pre-fill it. The stored value is the
                                  // encrypted envelope (and the API no longer sends it anyway); the
                                  // dialog shows the masked display and only writes a new PAN when
                                  // the admin types one. Pre-filling would re-post + double-encrypt.
                                  pan: "",
                                  uan: String(emp.uan ?? ""),
                                  esiIpNumber: String(emp.esiIpNumber ?? ""),
                                  bankAccountNumber: String(emp.bankAccountNumber ?? ""),
                                  bankIfsc: String(emp.bankIfsc ?? ""),
                                  bankName: String(emp.bankName ?? ""),
                                  bankAccountName: String(emp.bankAccountName ?? ""),
                                  gender: (emp.gender ?? "") as "" | "male" | "female" | "other",
                                  dateOfBirth: emp.dateOfBirth ? String(emp.dateOfBirth).slice(0, 10) : "",
                                  ptExemptArmedForces: Boolean(emp.ptExemptArmedForces),
                                  ptExemptDisability: Boolean(emp.ptExemptDisability),
                                  ptExemptDependentDisability: Boolean(emp.ptExemptDependentDisability),
                                  previousEmployerIncome:
                                    emp.previousEmployerIncome != null ? String(emp.previousEmployerIncome) : "",
                                  previousEmployerTds:
                                    emp.previousEmployerTds != null ? String(emp.previousEmployerTds) : "",
                                  rentPaidAnnual:
                                    emp.rentPaidAnnual != null ? String(emp.rentPaidAnnual) : "",
                                  voluntaryPfRate:
                                    emp.voluntaryPfRate != null && Number(emp.voluntaryPfRate) > 0
                                      ? String(Number(emp.voluntaryPfRate))
                                      : "",
                                  para266JointRequest: Boolean(emp.para266JointRequest),
                                  para266EmployerUndertaking: Boolean(emp.para266EmployerUndertaking),
                                  para266ApprovalReference: String(emp.para266ApprovalReference ?? ""),
                                  para266EffectiveFrom: emp.para266EffectiveFrom
                                    ? String(emp.para266EffectiveFrom).slice(0, 10)
                                    : "",
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
                  <h2 className="text-body font-semibold">Policy acknowledgement e-sign</h2>
                  <p className="text-caption text-muted-foreground">
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
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.type}
                      onChange={(e) => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                    >
                      {LEAVE_TYPE_PICKER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Start Date *</label>
                    <input
                      type="date"
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.startDate}
                      onChange={(e) => setLeaveForm(f => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">End Date *</label>
                    <input
                      type="date"
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                      value={leaveForm.endDate}
                      onChange={(e) => setLeaveForm(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">Reason</label>
                    <input
                      className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
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
                      <td className="text-foreground text-[11px]">{req.employeeName ?? req.employeeCode ?? req.employeeId?.slice(0,8) ?? "—"}</td>
                      <td>
                        <span className="status-badge bg-blue-100 text-blue-700">{leaveTypeLabel(req.type)}</span>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{req.startDate ? new Date(req.startDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{req.endDate ? new Date(req.endDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—"}</td>
                      <td className="text-center font-medium text-foreground">{req.days ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px] max-w-[180px]">{req.reason ?? "—"}</td>
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
              <span className="text-caption">Loading HR cases…</span>
            </div>
          ) : hrCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <FileText className="w-5 h-5 opacity-30" />
              <span className="text-caption">No HR cases found.</span>
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
                      <td className="font-mono text-[11px] text-primary" data-testid="hr-case-number">{c.hrCase?.number ?? "—"}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{c.hrCase?.caseType ?? "—"}</span></td>
                      <td className="max-w-xs"><span className="block text-foreground" data-testid="hr-case-subject">{c.hrCase?.subject || "—"}</span></td>
                      <td className="text-muted-foreground">{c.employee?.employeeId ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{c.employee?.department ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${CASE_STATE_COLOR[displayStatus] ?? "text-muted-foreground bg-muted"}`}>{displayStatus.replace(/_/g, " ")}</span></td>
                      <td><span className={`status-badge capitalize ${casePriority === "high" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{casePriority}</span></td>
                      <td className="text-muted-foreground" data-testid="hr-case-assignee">{c.assigneeName ?? c.assigneeEmail ?? "—"}</td>
                      <td className="text-muted-foreground text-[11px]">
                        {c.hrCase?.createdAt ? new Date(c.hrCase.createdAt).toISOString().split("T")[0] : "—"}
                      </td>
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
                            <div className="text-caption font-medium text-foreground">{details?.primaryEmail || "—"}</div>
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
                      <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Last Working Day / Settlement</th>
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
                      const settle = settlementClock((c.employee as any)?.endDate, details?.ffStatus);

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
                            {settle ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[12px] text-foreground">{settle.lwd}</span>
                                <span className="text-[10px] text-muted-foreground">Settle by {settle.due}</span>
                                <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded text-[10px] font-medium capitalize ${settle.status === "met" ? "bg-green-100 text-green-700" : settle.status === "overdue" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                                  {settle.status}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">⚠️ No last working day</span>
                            )}
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
                              {settle && settle.status !== "met" && c.hrCase?.employeeId && (
                                <button
                                  onClick={() => { setFfRecoveries({ noticeShortfall: "", advanceRecovery: "", assetRecovery: "" }); setSettlingEmployee({ id: c.hrCase!.employeeId!, name: details?.name || c.employee?.employeeId || "Employee" }); }}
                                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] border rounded-lg font-medium transition-all ${settle.status === "overdue" ? "text-red-600 border-red-600/30 hover:bg-red-600/5" : "text-primary border-primary/20 hover:bg-primary/5"}`}
                                >
                                  Settle F&amp;F
                                </button>
                              )}
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
                      <td colSpan={7} className="px-4 py-8 text-center text-caption text-muted-foreground">
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
                          <div className="text-caption font-semibold text-foreground">{evt.employee?.name || "Unnamed"}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{evt.employee?.employeeId || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-caption text-muted-foreground">{evt.lifecycleEvent.eventType}</td>
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
                  <h3 className="text-body-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    TDS Challans (ITNS 281)
                  </h3>
                  {tdsChallansQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {tdsChallans.length === 0 && !tdsChallansQuery.isLoading ? (
                  <div className="py-12 border border-dashed border-border rounded-xl text-center flex flex-col items-center justify-center bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 text-h3">📝</div>
                    <p className="text-body-sm font-medium text-foreground">No TDS challans recorded</p>
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
                              <h4 className="text-body-sm font-semibold text-foreground">
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
                            {/* Deducted (what generateStatutory produced) and deposited (what has actually
                                been filed) are DIFFERENT facts — show both, never collapse them. The card
                                previously read c.tdsAmount / c.totalPayable, which are not columns on
                                tds_challan_records, so every figure rendered ₹0 against a real record. */}
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">TDS Deducted</p>
                              <p className="text-[13px] font-mono text-foreground font-medium">₹{Number(c.totalTdsDeducted ?? 0).toLocaleString("en-IN")}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">TDS Deposited</p>
                              <p className="text-[13px] font-mono text-foreground font-medium">₹{Number(c.totalTdsDeposited ?? 0).toLocaleString("en-IN")}</p>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-border/50">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Payable (deducted · s.192)</p>
                              <p className="text-body-lg font-mono text-foreground font-bold">₹{Number(c.totalTdsDeducted ?? 0).toLocaleString("en-IN")}</p>
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
                              <span className="font-mono text-foreground">{c.challanSerialNumber || "—"}</span>
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
                        {/* Read the columns epfo_ecr_submissions actually has (employee/employer/EPS/EPF
                            contributions). EDLI and admin charges are NOT stored on this record, so they
                            show "—" (not tracked) rather than a misleading ₹0; the card previously read
                            totalEpfEmployee/totalEdli/adminCharges/totalChallanAmount — none are columns. */}
                        <td className="font-mono text-[11px] text-primary">{e.month}/{e.year}</td>
                        <td className="text-muted-foreground">{e.year}</td>
                        <td className="text-center font-semibold">{e.totalEmployees ?? "—"}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(e.totalEmployeeContribution ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(e.totalEpsContribution ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-muted-foreground">—</td>
                        <td className="font-mono text-right text-muted-foreground">—</td>
                        <td className="font-mono text-right font-semibold text-foreground">₹{(Number(e.totalEmployeeContribution ?? 0) + Number(e.totalEmployerContribution ?? 0)).toLocaleString("en-IN")}</td>
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

            {/* ESI challans (read-only — F13: generateStatutory writes esi_challan_records;
                surfaced here so all four statutory artefacts are reachable). No markPaid
                procedure exists for ESI/PT yet, hence read-only. */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">ESI Challans</span>
                {esiChallansQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {esiChallans.length === 0 && !esiChallansQuery.isLoading ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground/50">No ESI challans recorded — generated when payroll statutory generation runs.</div>
              ) : (
                <table className="ent-table w-full">
                  <thead><tr>
                    <th>Wage Month</th><th>Employees</th><th>ESI (Employee)</th><th>ESI (Employer)</th><th>Total</th><th>Challan #</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {esiChallans.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-mono text-[11px] text-primary">{c.month}/{c.year}</td>
                        <td className="text-center font-semibold">{c.totalEmployees ?? "—"}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(c.totalEmployeeContribution ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(c.totalEmployerContribution ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-right font-semibold text-foreground">₹{(Number(c.totalEmployeeContribution ?? 0) + Number(c.totalEmployerContribution ?? 0)).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{c.challanNumber ?? "—"}</td>
                        <td><span className={`status-badge text-[10px] ${c.submittedAt ? "text-green-700 bg-green-100" : "text-orange-700 bg-orange-100"}`}>{c.submittedAt ? "submitted" : "pending"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Professional Tax challans (read-only — F13) */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Professional Tax Challans</span>
                {ptChallansQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {ptChallans.length === 0 && !ptChallansQuery.isLoading ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground/50">No PT challans recorded — generated when payroll statutory generation runs.</div>
              ) : (
                <table className="ent-table w-full">
                  <thead><tr>
                    <th>State</th><th>Wage Month</th><th>Employees</th><th>PT Deducted</th><th>Challan #</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {ptChallans.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-mono text-[11px]">{c.stateCode ?? "—"}</td>
                        <td className="font-mono text-[11px] text-primary">{c.month}/{c.year}</td>
                        <td className="text-center font-semibold">{c.totalEmployees ?? "—"}</td>
                        <td className="font-mono text-right text-foreground/80">₹{Number(c.totalPtDeducted ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">{c.challanNumber ?? "—"}</td>
                        <td><span className={`status-badge text-[10px] ${c.submittedAt ? "text-green-700 bg-green-100" : "text-orange-700 bg-orange-100"}`}>{c.submittedAt ? "submitted" : "pending"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "leave_accruals" && (
          <div className="p-4">
            <LeaveAccrualsTab />
          </div>
        )}

        {tab === "gratuity" && (
          <div className="p-4">
            <GratuityTab />
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
                        <td colSpan={4} className="px-4 py-8 text-center text-caption text-muted-foreground">
                          No documents collected for this employee.
                        </td>
                      </tr>
                    ) : (
                      employeeDocuments.map((doc, idx) => (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-caption font-semibold text-foreground">{doc.type}</td>
                          <td className="px-4 py-3 text-caption text-muted-foreground capitalize">{doc.category}</td>
                          <td className="px-4 py-3 text-caption font-mono text-muted-foreground">{doc.filename}</td>
                          <td className="px-4 py-3 text-right">
                            {/* DOC-FACADE: this button reported "Downloading …" and produced no file
                                (no object storage is wired on the deployed stack). Disabled honestly
                                until document storage is enabled, rather than faking success. */}
                            <button
                              disabled
                              title="Document storage is not yet enabled on this environment — downloads are unavailable."
                              className="px-2.5 py-1 bg-muted text-muted-foreground text-[10px] rounded font-medium cursor-not-allowed opacity-60"
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
              <h2 className="text-body-sm font-semibold text-foreground">Edit HR Case</h2>
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
              <h2 className="text-body-sm font-semibold text-foreground flex items-center gap-2">
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
                  data-testid="hr-case-employee-select"
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
                {/* A real subject. The list column used to render the NOTES BODY with
                    [RESOLVED:…]/[ARCHIVED:…] markers stripped by a regex — a subject
                    reconstructed from a free-text blob. Notes stays the running
                    commentary; this is the one-line summary the list shows. */}
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Subject *</label>
                <input
                  data-testid="hr-case-subject-input"
                  value={caseForm.subject}
                  onChange={(e) => setCaseForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Relocation allowance query"
                  maxLength={200}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground outline-none"
                />
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
                disabled={createHRCase.isPending || !caseForm.employeeId || !caseForm.subject.trim()}
                onClick={() => createHRCase.mutate({ employeeId: caseForm.employeeId, caseType: caseForm.caseType, subject: caseForm.subject.trim(), notes: caseForm.notes || undefined, status: caseForm.status })}
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
              <h2 className="text-body-sm font-semibold text-foreground">Edit Offboarding Details</h2>
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

      {/* Full & Final Settlement Modal */}
      {settlingEmployee && (() => {
        const p = settlementPreview.data as
          | { lastSalary: number; leaveEncashment: number; gratuity: number; grossSettlement: number; totalRecoveries: number; netSettlement: number; unrecoveredShortfall: number; taxableGratuity: number; taxableEncashment: number }
          | undefined;
        const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;
        const line = (label: string, value: number, opts?: { sign?: "+" | "−"; strong?: boolean; muted?: boolean }) => (
          <div className={`flex items-center justify-between py-1.5 ${opts?.strong ? "font-semibold text-foreground" : opts?.muted ? "text-muted-foreground" : "text-foreground"}`}>
            <span className="text-[12px]">{label}</span>
            <span className="text-[12px] tabular-nums">{opts?.sign === "−" ? "− " : ""}{inr(value)}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-body-sm font-semibold text-foreground">Full &amp; Final — {settlingEmployee.name}</h2>
                <button onClick={() => setSettlingEmployee(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Recoveries — the only inputs; everything else is computed from the record. */}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["Notice shortfall", "noticeShortfall"],
                    ["Advance", "advanceRecovery"],
                    ["Asset", "assetRecovery"],
                  ] as const).map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</label>
                      <input
                        type="number" min="0" inputMode="decimal"
                        value={(ffRecoveries as any)[key]}
                        onChange={(e) => setFfRecoveries((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-card text-foreground"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                {/* Composed figure — live from settlement.preview. */}
                <div className="border border-border rounded-lg p-4 bg-muted/20">
                  {settlementPreview.isLoading ? (
                    <div className="text-[12px] text-muted-foreground py-4 text-center">Composing settlement…</div>
                  ) : settlementPreview.error ? (
                    <div className="text-[12px] text-red-600 py-4 text-center">{(settlementPreview.error as any)?.message ?? "Could not compose settlement"}</div>
                  ) : p ? (
                    <>
                      {line("Last salary (pro-rated)", p.lastSalary)}
                      {line("Leave encashment", p.leaveEncashment)}
                      {line("Gratuity", p.gratuity)}
                      <div className="border-t border-border my-1" />
                      {line("Gross settlement", p.grossSettlement, { strong: true })}
                      {p.totalRecoveries > 0 && line("Recoveries", p.totalRecoveries, { sign: "−", muted: true })}
                      <div className="border-t border-border my-1" />
                      {line("Net payable", p.netSettlement, { strong: true })}
                      {p.unrecoveredShortfall > 0 && (
                        <p className="text-[11px] text-red-600 mt-2">Recoveries exceed the settlement by {inr(p.unrecoveredShortfall)} — net is floored at zero; the shortfall is recorded as owed.</p>
                      )}
                      {(p.taxableGratuity > 0 || p.taxableEncashment > 0) && (
                        <p className="text-[11px] text-amber-600 mt-2">Taxable excess above the statutory ceilings: {inr(p.taxableGratuity + p.taxableEncashment)} (reconciled at year-end).</p>
                      )}
                    </>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground">Confirming records the settlement (one per employee) and marks F&amp;F complete. The last salary is paid here, not in the monthly run.</p>
              </div>
              <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
                <button onClick={() => setSettlingEmployee(null)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted">Cancel</button>
                <button
                  disabled={settleFF.isPending || settlementPreview.isLoading || !!settlementPreview.error}
                  onClick={() => settleFF.mutate({ employeeId: settlingEmployee.id, ...ffRecoveryArgs })}
                  className="px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
                >
                  {settleFF.isPending ? "Settling…" : "Confirm Settlement"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Start New Offboarding Modal */}
      {showOffboardingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-body-sm font-semibold text-foreground flex items-center gap-2">
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
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Last Working Day *</label>
                <input
                  type="date"
                  value={offboardingCreateForm.endDate}
                  onChange={(e) => setOffboardingCreateForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-[13px] bg-card text-foreground"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Employment ends on this date. Pay for the final month is pro-rated to it, and the two-working-day settlement clock starts here. A future date is allowed for a notice period.</p>
              </div>
              <div className="border-t border-border pt-4">
                <h3 className="text-caption font-semibold text-foreground mb-3 uppercase tracking-wider">Offboarding Attachments</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Separation Forms</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="No file chosen"
                        value={offboardingCreateForm.separationDocs}
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                        className="flex-1 border border-border rounded px-2.5 py-1.5 text-caption bg-muted/30 text-foreground"
                        readOnly
                      />
                      <label title="Document storage is not yet enabled on this environment — the file is not saved." className="px-2 py-1.5 bg-muted text-muted-foreground text-caption rounded border border-border cursor-not-allowed opacity-60 pointer-events-none">
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
                disabled={createOffboarding.isPending || !offboardingCreateForm.employeeId || !offboardingCreateForm.endDate}
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
              <h2 className="text-body-sm font-semibold text-foreground flex items-center gap-2">
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
              <h2 className="text-body-sm font-semibold text-foreground">Edit Lifecycle Event</h2>
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
