/**
 * CoheronConnect Payroll Run Page
 * ─────────────────────────
 * Place at: apps/web/src/app/app/payroll/page.tsx
 *
 * Full payroll run management with:
 *  - Run list with status badges
 *  - 12-step progress tracker
 *  - Create new run
 *  - Step-by-step execution with approval gates
 *  - Payslip preview and statutory output downloads
 */

"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { downloadBankFile, formatInr } from "@/lib/utils";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSignature, X, Plus, Pencil, Trash2 } from "lucide-react";
import { EsignPanel } from "@/components/esign/EsignPanel";

// ─── STATUS STEP MAP ───────────────────────────────────────────────────────────

const PAYROLL_STEPS = [
  { key: "DRAFT", label: "Draft", step: 0, action: null },
  { key: "PERIOD_LOCKED", label: "Period locked", step: 1, action: "lockPeriod" },
  { key: "GROSS_COMPUTED", label: "Gross computed", step: 2, action: "advanceComputationStep" },
  { key: "PF_COMPUTED", label: "PF computed", step: 3, action: "advanceComputationStep" },
  { key: "ESI_COMPUTED", label: "ESI computed", step: 4, action: "advanceComputationStep" },
  { key: "PT_COMPUTED", label: "PT computed", step: 5, action: "advanceComputationStep" },
  { key: "LWF_COMPUTED", label: "LWF computed", step: 6, action: "advanceComputationStep" },
  { key: "TDS_COMPUTED", label: "TDS computed", step: 7, action: "advanceComputationStep" },
  { key: "PAYSLIPS_GENERATED", label: "Payslips generated", step: 8, action: "computePayslips" },
  { key: "HR_APPROVED", label: "HR approved", step: 9, action: "approve" },
  { key: "FINANCE_APPROVED", label: "Finance approved", step: 10, action: "approve" },
  { key: "CFO_APPROVED", label: "CFO approved", step: 11, action: "approve" },
  { key: "STATUTORY_GENERATED", label: "Statutory outputs", step: 12, action: "generateStatutory" },
  { key: "COMPLETED", label: "Completed", step: 13, action: "complete" },
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-gray-100", text: "text-gray-700" },
  PERIOD_LOCKED: { bg: "bg-blue-50", text: "text-blue-700" },
  GROSS_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  PF_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  ESI_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  PT_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  LWF_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  TDS_COMPUTED: { bg: "bg-sky-50", text: "text-sky-700" },
  PAYSLIPS_GENERATED: { bg: "bg-amber-50", text: "text-amber-700" },
  HR_APPROVED: { bg: "bg-purple-50", text: "text-purple-700" },
  FINANCE_APPROVED: { bg: "bg-purple-50", text: "text-purple-700" },
  CFO_APPROVED: { bg: "bg-purple-50", text: "text-purple-700" },
  STATUTORY_GENERATED: { bg: "bg-teal-50", text: "text-teal-700" },
  COMPLETED: { bg: "bg-green-50", text: "text-green-700" },
  FAILED: { bg: "bg-red-50", text: "text-red-700" },
};

function getStepIndex(status: string): number {
  return PAYROLL_STEPS.findIndex((s) => s.key === status);
}

// ─── MONTH PICKER ──────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── SALARY STRUCTURE EDITOR STATE ─────────────────────────────────────────────

interface StructureFormState {
  id?: string;
  structureName: string;
  ctcAnnual: string;
  daPercent: string; // Basic % is derived as 50 − DA (composition is fixed at 50%)
  hraPercentOfBasic: string;
  ltaAnnual: string;
  effectiveFrom: string; // yyyy-mm-dd
  effectiveTo: string; // yyyy-mm-dd or ""
}

/**
 * A new salary structure is effective from the FIRST OF THE CURRENT MONTH, not today.
 *
 * The payroll run resolves a structure with `effectiveFrom <= period`, where
 * `period` is the 1st of the pay month (`hr.ts` passes
 * `new Date(year, month - 1, 1)` into `resolveSalaryStructureForPeriod`). So a
 * structure dated any day after the 1st is NOT in force for that month, and the
 * employee is silently excluded from the run.
 *
 * Defaulting to `new Date()` meant a tenant onboarding on the 25th created
 * structures effective the 25th, and their run for that month paid NOBODY. A
 * live walk hit exactly that. Mid-month is the exception in payroll — the rule is
 * "this salary applies for this month" — so the default now expresses the rule
 * and a genuine mid-month change is a deliberate edit.
 */
function firstOfCurrentMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function emptyStructureForm(): StructureFormState {
  return {
    structureName: "",
    ctcAnnual: "",
    daPercent: "0",
    hraPercentOfBasic: "50",
    ltaAnnual: "0",
    effectiveFrom: firstOfCurrentMonth(),
    effectiveTo: "",
  };
}

// Current fiscal-year start year (India FY = Apr–Mar): months Apr(4)–Dec use this calendar year,
// Jan–Mar use the previous. FY 2026-27 ⇒ 2026. Matches the run's fyStartYear derivation.
function currentFyStartYear(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}
function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Opt-in compliant STARTER templates. Adopting one just PREFILLS the new-structure form — the result
// is an ordinary structure the customer edits and saves; nothing is auto-created and no tenant rows are
// seeded (the removed demo-company seed stays removed). All satisfy Basic + DA = 50 (Basic is derived
// as 50 − DA), which the form enforces and the server validates. Base Pay is left blank for the customer.
const STARTER_STRUCTURES: { key: string; name: string; daPercent: string; hraPercentOfBasic: string }[] = [
  { key: "services_it", name: "Services / IT", daPercent: "0", hraPercentOfBasic: "50" },
  { key: "manufacturing", name: "Manufacturing", daPercent: "10", hraPercentOfBasic: "40" },
  { key: "retail_hospitality", name: "Retail / Hospitality", daPercent: "0", hraPercentOfBasic: "40" },
  { key: "sales", name: "Sales", daPercent: "0", hraPercentOfBasic: "50" },
];

function structureToForm(s: Record<string, any>): StructureFormState {
  const toDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return {
    id: s.id,
    structureName: s.structureName ?? "",
    ctcAnnual: String(s.ctcAnnual ?? ""),
    daPercent: String(s.daPercent ?? "0"),
    hraPercentOfBasic: String(s.hraPercentOfBasic ?? "50"),
    ltaAnnual: String(s.ltaAnnual ?? "0"),
    effectiveFrom: toDate(s.effectiveFrom) || firstOfCurrentMonth(),
    effectiveTo: toDate(s.effectiveTo),
  };
}

function inr(v: string | number | null | undefined): string {
  return `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
}

// ─── MAIN PAGE COMPONENT ──────────────────────────────────────────────────────

export default function PayrollPage() {
  const utils = trpc.useUtils();
  const { mergeTrpcQueryOpts, can, isAdmin } = useRBAC();

  // Finance/CFO approvers hold `financial.write` (the authority the payroll
  // approval action requires) but not `payroll.read`. Admit them to VIEW the run
  // surface so they can reach and act on their approval step. Every write action
  // below keeps its own gate — a financial-only user still cannot lock, compute,
  // generate, or complete a run. NB: the AccessDenied return lives AFTER all hooks
  // (below) so the hook count never changes between renders (rules of hooks).
  const canViewPayroll = can("payroll", "read") || can("financial", "write");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  /*
   * Payroll approval chain — 2 or 3 steps, never 1.
   *
   * The setting has existed since the approval-chain round and is stamped onto
   * `payroll_runs.approval_chain_length` AT CREATION, so a mid-cycle change
   * cannot alter a run already in flight. It had no screen, only
   * `admin.payrollPolicy.*`, which means no tenant could actually reach it — a
   * capability a customer cannot reach is not shipped. Admin/owner only, matching
   * the `adminProcedure` gate on the server.
   *
   * `alwaysFresh`: this value changes how the NEXT run is built, so the control
   * must never render a pre-write answer (app default is staleTime 10s).
   */
  const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };
  const payrollPolicy = trpc.admin.payrollPolicy.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("admin.payrollPolicy.get", { ...alwaysFresh, enabled: isAdmin() }),
  );
  const updatePayrollPolicy = trpc.admin.payrollPolicy.update.useMutation({
    onSuccess: (r: any) => {
      void payrollPolicy.refetch();
      toast.success(
        `Approval chain set to ${r?.approvalChainLength ?? ""} steps. Runs already created keep the length they were stamped with.`,
        { duration: 8_000 },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the approval chain"),
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<"runs" | "structures" | "arrears" | "declarations" | "form16s">("runs");
  // ARREARS: the period arrears are PAID IN. Defaults to the current month, which is the run
  // an operator is normally preparing when a backdated revision lands.
  const [arrMonth, setArrMonth] = useState<number>(new Date().getMonth() + 1);
  const [arrYear, setArrYear] = useState<number>(new Date().getFullYear());
  const [arrFor, setArrFor] = useState<Record<string, unknown> | null>(null);
  const [form16For, setForm16For] = useState<Record<string, unknown> | null>(null);
  const [structureEditor, setStructureEditor] = useState<StructureFormState | null>(null);
  // C1 declaration capture: which employee's declaration is being edited, and the FY it targets.
  const [declFor, setDeclFor] = useState<Record<string, unknown> | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const runsQuery = trpc.payroll.runs.list.useQuery({}, mergeTrpcQueryOpts("payroll.runs.list", {}));
  const structuresQuery = trpc.payroll.salaryStructures.list.useQuery(
    undefined,
    mergeTrpcQueryOpts("payroll.salaryStructures.list", { enabled: activeTab === "structures" }),
  );
  const upsertStructure = trpc.payroll.salaryStructures.upsert.useMutation({
    onSuccess: () => { setStructureEditor(null); void structuresQuery.refetch(); },
  });
  const archiveStructure = trpc.payroll.salaryStructures.archive.useMutation({
    onSuccess: () => { void structuresQuery.refetch(); },
  });
  const deleteStructure = trpc.payroll.salaryStructures.delete.useMutation({
    onSuccess: () => { void structuresQuery.refetch(); },
  });

  const [generateFy, setGenerateFy] = useState("2025-2026");
  const generateForm16 = trpc.payroll.generateForm16ToDms.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
    },
  });

  // Employees drive both the Form 16 e-sign list and the investment-declaration capture tab.
  const employeesQuery = trpc.hr.employees.list.useQuery(
    { limit: 200 },
    mergeTrpcQueryOpts("hr.employees.list", { enabled: activeTab === "form16s" || activeTab === "declarations" || activeTab === "arrears" }),
  );

  // ARREARS — back-pay for an earlier period, paid in this one. RBAC keys: the generated map has
  // no `payroll.arrears.*` entry (it was NOT regenerated here — it carries drift, per CLAUDE.md), and
  // an unmapped key falls back to "any authenticated user", looser than the server's own gate. So the
  // lookup keys below are existing entries with the IDENTICAL gate: `salaryStructures.list` is
  // payroll:read, `salaryStructures.upsert` is payroll:write. The key is an RBAC lookup, not the
  // procedure being called; the server enforces `permissionProcedure` regardless.
  const arrearsQuery = trpc.payroll.arrears.list.useQuery(
    { month: arrMonth, year: arrYear },
    mergeTrpcQueryOpts("payroll.salaryStructures.list", { enabled: activeTab === "arrears" }),
  );
  const upsertArrears = trpc.payroll.arrears.upsert.useMutation({
    onSuccess: () => { void arrearsQuery.refetch(); setArrFor(null); },
  });
  const removeArrears = trpc.payroll.arrears.remove.useMutation({
    onSuccess: () => { void arrearsQuery.refetch(); },
  });
  const selectedRun = trpc.payroll.runs.get.useQuery(
    { id: selectedRunId! },
    mergeTrpcQueryOpts("payroll.runs.get", { enabled: !!selectedRunId }),
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createRun = trpc.payroll.runs.create.useMutation({
    onSuccess: (run) => {
      setSelectedRunId(run.id);
      setShowCreateModal(false);
      runsQuery.refetch();
    },
  });

  const lockPeriod = trpc.payroll.runs.lockPeriod.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
  });

  const advanceComputationStep = trpc.payroll.runs.advanceComputationStep.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
  });

  const computePayslips = trpc.payroll.runs.computePayslips.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
  });

  const approveRun = trpc.payroll.runs.approve.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const generateStatutory = trpc.payroll.runs.generateStatutory.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
  });

  const completeRun = trpc.payroll.runs.complete.useMutation({
    onSuccess: () => {
      selectedRun.refetch();
      runsQuery.refetch();
    },
  });

  const exportBankFile = trpc.payroll.exportBankFile.useMutation({
    // downloadBankFile decodes the base64 body, refuses a zero-record (header-only)
    // file, and surfaces "N paid / M skipped" with per-employee reasons.
    onSuccess: (data) => {
      downloadBankFile(data);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  const runs = (runsQuery.data ?? []) as Array<{
    id: string;
    runNumber: string;
    status: string;
    month: number;
    year: number;
    employeeCount?: number;
    totalNet?: string | number | null;
  }>;
  const run = selectedRun.data;
  const currentStepIdx = run ? getStepIndex(run.status) : -1;

  // Page-view gate (after all hooks — see note above). A user with neither
  // payroll.read nor financial.write cannot see the payroll surface.
  if (!canViewPayroll) {
    return <AccessDenied module="payroll" />;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h3 font-semibold text-gray-900 dark:text-gray-100">
            Payroll
          </h1>
          <p className="text-body-sm text-gray-500 mt-1">
            14-step payroll cycle with statutory compliance
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2.5 text-body-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New payroll run
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(["runs", "structures", "arrears", "declarations", "form16s"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab === "runs" ? "Payroll runs" : tab === "structures" ? "Salary structures" : tab === "arrears" ? "Arrears" : tab === "declarations" ? "Tax declarations" : "Form 16 issuance"}
          </button>
        ))}
      </div>

      {activeTab === "runs" && isAdmin() && (
        <div
          data-testid="approval-chain-setting"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex-1 min-w-[260px]">
            <p className="text-body-sm font-semibold text-foreground">Payroll approval chain</p>
            <p className="text-[11px] text-muted-foreground">
              How many approvals a run needs before statutory generation and the bank file unlock.
              Segregation of duties applies at either length — one person can never approve two
              steps. Runs already created keep the length they were stamped with.
            </p>
          </div>
          <select
            data-testid="approval-chain-select"
            className="border border-border rounded px-2 py-1.5 text-[12px] bg-background"
            value={payrollPolicy.data?.approvalChainLength ?? 3}
            disabled={updatePayrollPolicy.isPending || payrollPolicy.isLoading}
            onChange={(e) =>
              updatePayrollPolicy.mutate({ approvalChainLength: Number(e.target.value) as 2 | 3 })
            }
          >
            <option value={2}>2 steps — HR then Finance</option>
            <option value={3}>3 steps — HR, Finance, then CFO</option>
          </select>
        </div>
      )}

      {activeTab === "runs" && (
        <div className="flex gap-6">
          {/* Run List */}
          <div className="w-80 flex-shrink-0 space-y-2">
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-body-sm text-gray-500">
                No payroll runs yet. Create your first run to get started.
              </div>
            ) : (
              runs.map((r) => {
                const colors = STATUS_COLORS[r.status] ?? STATUS_COLORS.DRAFT!;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`w-full text-left rounded-lg border p-4 transition-all ${
                      selectedRunId === r.id
                        ? "border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-body-sm text-gray-900 dark:text-gray-100">
                        {r.runNumber}
                      </span>
                      <span className={`text-caption px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {r.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-caption text-gray-500">
                      {MONTHS[r.month - 1]} {r.year} · {r.employeeCount ?? 0} employees
                    </div>
                    {r.totalNet && Number(r.totalNet) > 0 && (
                      <div className="mt-1 text-caption text-gray-500">
                        Net: ₹{Number(r.totalNet).toLocaleString("en-IN")}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Run Detail */}
          <div className="flex-1 min-w-0">
            {!run ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-16 text-center text-body-sm text-gray-500">
                Select a payroll run to view details
              </div>
            ) : (
              <div className="space-y-6">
                {/* Run Header */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-body-lg font-semibold text-gray-900 dark:text-gray-100">
                      {run.runNumber}
                    </h2>
                    <span className={`text-body-sm px-3 py-1 rounded-full ${(STATUS_COLORS[run.status] ?? STATUS_COLORS.DRAFT!).bg} ${(STATUS_COLORS[run.status] ?? STATUS_COLORS.DRAFT!).text}`}>
                      {run.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "Gross pay", value: `₹${Number(run.totalGross || 0).toLocaleString("en-IN")}` },
                      { label: "Total deductions", value: `₹${Number(run.totalDeductions || 0).toLocaleString("en-IN")}` },
                      { label: "Net pay", value: `₹${Number(run.totalNet || 0).toLocaleString("en-IN")}` },
                      { label: "Employer cost", value: `₹${Number(run.totalEmployerCost || 0).toLocaleString("en-IN")}` },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                        <div className="text-caption text-gray-500 mb-1">{kpi.label}</div>
                        <div className="text-body-sm font-semibold text-gray-900 dark:text-gray-100">{kpi.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Statutory breakdown */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                    {[
                      { label: "Emp. PF", value: `₹${Number(run.totalPfEmployee || 0).toLocaleString("en-IN")}` },
                      { label: "Empr. PF", value: `₹${Number(run.totalPfEmployer || 0).toLocaleString("en-IN")}` },
                      { label: "ESI", value: `₹${Number(run.totalESI || 0).toLocaleString("en-IN")}` },
                      { label: "Prof. tax", value: `₹${Number(run.totalPT || 0).toLocaleString("en-IN")}` },
                      { label: "TDS", value: `₹${Number(run.totalTDS || 0).toLocaleString("en-IN")}` },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                        <div className="text-caption text-gray-500 mb-1">{kpi.label}</div>
                        <div className="text-body-sm font-medium text-gray-700 dark:text-gray-300">{kpi.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 12-Step Progress Tracker */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-body-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                    Payroll cycle progress
                  </h3>
                  <div className="space-y-1">
                    {PAYROLL_STEPS.map((step, idx) => {
                      const isCompleted = idx <= currentStepIdx;
                      const isCurrent = idx === currentStepIdx + 1;
                      const isFuture = idx > currentStepIdx + 1;

                      return (
                        <div
                          key={step.key}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                            isCurrent
                              ? "bg-blue-50 dark:bg-blue-900/20"
                              : isCompleted
                              ? "bg-green-50/50 dark:bg-green-900/10"
                              : ""
                          }`}
                        >
                          {/* Step indicator */}
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-caption font-medium ${
                              isCompleted
                                ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200"
                                : isCurrent
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200"
                                : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
                            }`}
                          >
                            {isCompleted ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              idx + 1
                            )}
                          </div>

                          {/* Step label */}
                          <span
                            className={`text-body-sm flex-1 ${
                              isCompleted
                                ? "text-green-700 dark:text-green-300"
                                : isCurrent
                                ? "text-blue-700 dark:text-blue-300 font-medium"
                                : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            Step {idx + 1}: {step.label}
                          </span>

                          {/* Action button for current step. Per-step authority must
                              MIRROR the API (F12 — a coarser gate shows the control to
                              roles that then 403 on click):
                                • FINANCE/CFO approval → financial.write (approveRun)
                                • HR approval          → hr.write        (approveRun)
                                • every operational step (lock, compute, generate,
                                  complete) → payroll.write — those procedures are
                                  permissionProcedure("payroll","write"). Previously
                                  they gated on hr.write, so a user with hr.write but
                                  not payroll.write (e.g. a CFO) saw the statutory
                                  Execute and got a 403. */}
                          {isCurrent && run.status !== "COMPLETED" && run.status !== "FAILED" &&
                            (step.key === "FINANCE_APPROVED" || step.key === "CFO_APPROVED"
                              ? can("financial", "write")
                              : step.key === "HR_APPROVED"
                              ? can("hr", "write")
                              : can("payroll", "write")) && (
                            <button
                              onClick={() => {
                                if (step.key === "PERIOD_LOCKED") {
                                  lockPeriod.mutate({ runId: run.id });
                                } else if (
                                  step.key === "GROSS_COMPUTED" ||
                                  step.key === "PF_COMPUTED" ||
                                  step.key === "ESI_COMPUTED" ||
                                  step.key === "PT_COMPUTED" ||
                                  step.key === "LWF_COMPUTED" ||
                                  step.key === "TDS_COMPUTED"
                                ) {
                                  advanceComputationStep.mutate({ runId: run.id });
                                } else if (step.key === "PAYSLIPS_GENERATED") {
                                  computePayslips.mutate({ runId: run.id });
                                } else if (step.key === "HR_APPROVED") {
                                  approveRun.mutate({ runId: run.id, step: "HR", decision: "APPROVED" });
                                } else if (step.key === "FINANCE_APPROVED") {
                                  approveRun.mutate({ runId: run.id, step: "FINANCE", decision: "APPROVED" });
                                } else if (step.key === "CFO_APPROVED") {
                                  approveRun.mutate({ runId: run.id, step: "CFO", decision: "APPROVED" });
                                } else if (step.key === "STATUTORY_GENERATED") {
                                  generateStatutory.mutate({ runId: run.id });
                                } else if (step.key === "COMPLETED") {
                                  completeRun.mutate({ runId: run.id });
                                }
                              }}
                              className="text-caption px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              Execute
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Errors */}
                {run.errors && Array.isArray(run.errors) && (run.errors as any[]).length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                    <h3 className="text-body-sm font-medium text-red-700 dark:text-red-300 mb-2">
                      Errors ({(run.errors as any[]).length})
                    </h3>
                    <div className="space-y-1">
                      {(run.errors as any[]).map((err: any, i: number) => (
                        <div key={i} className="text-caption text-red-600 dark:text-red-400">
                          {err.employeeId && <span className="font-mono">{err.employeeId}: </span>}
                          {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approvals */}
                {run.approvals && run.approvals.length > 0 && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-body-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                      Approvals
                    </h3>
                    <div className="space-y-2">
                      {run.approvals.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 text-body-sm">
                          <span className={`px-2 py-0.5 rounded text-caption ${
                            a.status === "APPROVED"
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}>
                            {a.step}
                          </span>
                          <span className="text-gray-500">
                            {a.status === "APPROVED" ? "Approved" : "Rejected"}
                            {a.decidedAt && ` on ${format(new Date(a.decidedAt), "dd MMM yyyy HH:mm")}`}
                          </span>
                          {a.comments && (
                            <span className="text-gray-400 text-caption">— {a.comments}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Bank File Export */}
                {(run.status === "CFO_APPROVED" || run.status === "COMPLETED") && can("payroll", "write") && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-body-sm font-medium text-gray-900 dark:text-gray-100">
                        Disbursement
                      </h3>
                      <p className="text-caption text-gray-500 mt-1">
                        Download the NEFT/NACH-Credit bank file for this payroll run.
                      </p>
                    </div>
                    <button
                      onClick={() => exportBankFile.mutate({ runId: run.id, format: "hdfc_neft", debitAccount: "1234567890" })}
                      disabled={exportBankFile.isPending}
                      className="text-caption px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      {exportBankFile.isPending ? "Exporting..." : "Export Bank File"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "structures" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-gray-500 dark:text-gray-400">
              CTC templates used to compute gross, HRA, and statutory components for assigned employees.
            </p>
            {can("hr", "write") && (
              <button
                type="button"
                onClick={() => setStructureEditor(emptyStructureForm())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-2 text-body-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" /> New structure
              </button>
            )}
          </div>

          {structuresQuery.isLoading && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading structures…</div>
          )}
          {structuresQuery.data && structuresQuery.data.length === 0 && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">
              No salary structures yet. Create one to assign it to employees.
            </div>
          )}
          {structuresQuery.data && structuresQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-body-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Structure</th>
                    <th className="px-4 py-2 font-medium text-right">Annual CTC</th>
                    <th className="px-4 py-2 font-medium text-right">Basic %</th>
                    <th className="px-4 py-2 font-medium text-right">HRA % of Basic</th>
                    <th className="px-4 py-2 font-medium">Effective From</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {structuresQuery.data.map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-medium">{s.structureName}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{inr(s.ctcAnnual)}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-500 dark:text-gray-400">{Number(s.basicPercent)}%</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-500 dark:text-gray-400">{Number(s.hraPercentOfBasic)}%</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                        {s.effectiveFrom ? format(new Date(s.effectiveFrom), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {can("hr", "write") && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setStructureEditor(structureToForm(s))}
                              className="p-1.5 rounded text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                              aria-label="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Archive salary structure "${s.structureName}"?`)) {
                                  archiveStructure.mutate({ id: s.id });
                                }
                              }}
                              className="p-1.5 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              aria-label="Archive"
                              title="Archive"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete salary structure "${s.structureName}"?`)) {
                                  deleteStructure.mutate({ id: s.id });
                                }
                              }}
                              className="p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {deleteStructure.error && (
            <div className="text-body-sm text-red-600">{deleteStructure.error.message}</div>
          )}
        </div>
      )}

      {activeTab === "form16s" && (
        <div className="space-y-3">
          <p className="text-body-sm text-gray-500 dark:text-gray-400">
            Issue Form 16 (TDS certificate) to an employee for e-signature.
          </p>
          {employeesQuery.isLoading && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading employees…</div>
          )}
          {employeesQuery.data && employeesQuery.data.length === 0 && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">No employees found.</div>
          )}
          {employeesQuery.data && employeesQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-body-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Employee #</th>
                    <th className="px-4 py-2 font-medium">Department</th>
                    <th className="px-4 py-2 font-medium text-right">Form 16</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {employeesQuery.data.map((emp) => (
                    <tr key={emp.id as string} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{(emp.name as string) ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{(emp.employeeNumber as string) ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{(emp.department as string) ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setForm16For(emp as Record<string, unknown>)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-caption border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <FileSignature className="w-3.5 h-3.5" /> Send Form 16
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "arrears" && (
        <div className="space-y-3">
          <p className="text-body-sm text-gray-500 dark:text-gray-400">
            Back-pay for an <span className="font-medium">earlier</span> period, paid out in the period
            selected here. This is the route the salary-structure editor points to when a version already
            has payslips: those payslips are issued (and may be filed) and must not be rewritten, so the
            shortfall is paid as arrears instead.
          </p>
          <p className="text-caption text-amber-700 dark:text-amber-500">
            Arrears are added to gross and are taxed. They also change the PF deducted this month, because
            a large arrears payment pushes excluded allowances past the Code-on-Wages 50% threshold and the
            statutory wage base rises with it. Check the recomputed run before approving.
          </p>

          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-gray-500 dark:text-gray-400">Paid in month</span>
              <select
                value={arrMonth}
                onChange={(e) => setArrMonth(Number(e.target.value))}
                className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-body-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{MONTHS[m - 1]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-gray-500 dark:text-gray-400">Year</span>
              <input
                type="number"
                value={arrYear}
                onChange={(e) => setArrYear(Number(e.target.value))}
                className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-body-sm"
              />
            </label>
          </div>

          {arrearsQuery.isLoading && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading arrears…</div>
          )}
          {arrearsQuery.data && arrearsQuery.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center text-body-sm text-gray-500">
              No arrears recorded for {MONTHS[arrMonth - 1]} {arrYear}.
            </div>
          )}
          {arrearsQuery.data && arrearsQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-body-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee #</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {arrearsQuery.data.map((row) => (
                    <tr key={row.id as string} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{(row.employeeCode as string) ?? "—"}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${Number(row.amount) < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>
                        {formatInr(Number(row.amount))}
                        {Number(row.amount) < 0 && <span className="ml-1 text-caption">(recovery)</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{(row.reason as string) || "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={removeArrears.isPending}
                          onClick={() => removeArrears.mutate({ id: row.id as string })}
                          className="px-2.5 py-1 rounded text-caption border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2">
            <h3 className="text-body-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Record arrears</h3>
            {employeesQuery.isLoading && (
              <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading employees…</div>
            )}
            {employeesQuery.error && (
              <div className="text-body-sm text-red-600 dark:text-red-400">
                Could not load employees: {employeesQuery.error.message}
              </div>
            )}
            {employeesQuery.data && employeesQuery.data.length > 0 ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-body-sm">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {employeesQuery.data.map((emp) => (
                      <tr key={emp.id as string} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{(emp.name as string) ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{(emp.employeeNumber as string) ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setArrFor(emp as Record<string, unknown>)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-caption border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Arrears
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : employeesQuery.data ? (
              // Only claim "none" when the query actually returned an empty list. Collapsing
              // undefined (loading, or disabled by the RBAC gate) into "no employees" makes the
              // screen assert something it does not know — the defect class this repo keeps hitting.
              <div className="text-body-sm text-gray-500 dark:text-gray-400">No employees found.</div>
            ) : null}
          </div>
        </div>
      )}

      {activeTab === "declarations" && (
        <div className="space-y-3">
          <p className="text-body-sm text-gray-500 dark:text-gray-400">
            Capture each employee&apos;s old-regime investment declarations for <span className="font-medium text-gray-700 dark:text-gray-300">{fyLabel(currentFyStartYear())}</span>.
            These feed the payroll run&apos;s TDS (statutory caps are applied automatically). Declarations
            apply to the <span className="font-medium">old regime only</span> — a new-regime employee&apos;s entries have no tax effect.
          </p>
          {employeesQuery.isLoading && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading employees…</div>
          )}
          {employeesQuery.data && employeesQuery.data.length === 0 && (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">No employees found.</div>
          )}
          {employeesQuery.data && employeesQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-body-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Employee #</th>
                    <th className="px-4 py-2 font-medium">Tax regime</th>
                    <th className="px-4 py-2 font-medium text-right">Declaration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {employeesQuery.data.map((emp) => (
                    <tr key={emp.id as string} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{(emp.name as string) ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{(emp.employeeNumber as string) ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`status-badge capitalize ${((emp as any).taxRegime === "old") ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          {((emp as any).taxRegime as string) ?? "new"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setDeclFor(emp as Record<string, unknown>)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-caption border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit declaration
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ARREARS capture modal */}
      {arrFor && (
        <ArrearsModal
          employee={arrFor}
          month={arrMonth}
          year={arrYear}
          onClose={() => setArrFor(null)}
          onSave={(amount, reason, sourceStructureId) =>
            upsertArrears.mutate({
              employeeId: arrFor.id as string,
              month: arrMonth,
              year: arrYear,
              amount,
              reason: reason || undefined,
              sourceStructureId,
            })
          }
          saving={upsertArrears.isPending}
        />
      )}

      {/* C1 declaration capture modal */}
      {declFor && (
        <DeclarationModal
          employee={declFor}
          fiscalYear={currentFyStartYear()}
          onClose={() => setDeclFor(null)}
        />
      )}

      {/* Salary structure editor modal */}
      {structureEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-body-lg font-semibold text-gray-900 dark:text-gray-100">
                {structureEditor.id ? "Edit salary structure" : "New salary structure"}
              </h2>
              <button
                type="button"
                onClick={() => setStructureEditor(null)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {!structureEditor.id && (
              <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                <p className="text-caption font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Start from a template <span className="font-normal text-gray-400">(optional — prefills the form; edit anything before saving)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTER_STRUCTURES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStructureEditor({
                        ...structureEditor,
                        structureName: structureEditor.structureName || s.name,
                        daPercent: s.daPercent,
                        hraPercentOfBasic: s.hraPercentOfBasic,
                      })}
                      className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1 text-caption text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary transition-colors"
                      title={`Basic ${50 - Number(s.daPercent)}% · DA ${s.daPercent}% · HRA ${s.hraPercentOfBasic}% of basic`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                upsertStructure.mutate({
                  ...(structureEditor.id ? { id: structureEditor.id } : {}),
                  structureName: structureEditor.structureName,
                  ctcAnnual: Number(structureEditor.ctcAnnual),
                  // Basic is derived: Basic % + DA % = 50 (composition fixed at the 50% core).
                  basicPercent: 50 - Number(structureEditor.daPercent || 0),
                  daPercent: Number(structureEditor.daPercent),
                  hraPercentOfBasic: Number(structureEditor.hraPercentOfBasic),
                  ltaAnnual: Number(structureEditor.ltaAnnual),
                  effectiveFrom: new Date(structureEditor.effectiveFrom),
                  effectiveTo: structureEditor.effectiveTo ? new Date(structureEditor.effectiveTo) : null,
                });
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="text-caption font-medium text-gray-500 dark:text-gray-400">Structure name</span>
                <input
                  required
                  value={structureEditor.structureName}
                  onChange={(e) => setStructureEditor({ ...structureEditor, structureName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm"
                  placeholder="e.g. Senior Engineer — Band L4"
                  title="Structure name is required — employees are linked to a structure by this name."
                />
                <span className="mt-1 block text-caption text-gray-500 dark:text-gray-400">
                  Required — employees are linked to a structure by this name, so make it unique and descriptive.
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">Base Pay (₹/yr)</span>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={structureEditor.ctcAnnual}
                    onChange={(e) => setStructureEditor({ ...structureEditor, ctcAnnual: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm font-mono"
                  />
                </label>
                {/* DA is the composition input; Basic is derived below so Basic + DA = 50 by construction. */}
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">DA % of Base Pay</span>
                  <input
                    required
                    type="number"
                    min={0}
                    max={50}
                    step="0.01"
                    value={structureEditor.daPercent}
                    onChange={(e) => setStructureEditor({ ...structureEditor, daPercent: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">Basic % of Base Pay</span>
                  <input
                    readOnly
                    tabIndex={-1}
                    type="number"
                    value={50 - Number(structureEditor.daPercent || 0)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-3 py-2 text-body-sm font-mono cursor-not-allowed"
                  />
                </label>
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">HRA % of Basic</span>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={structureEditor.hraPercentOfBasic}
                    onChange={(e) => setStructureEditor({ ...structureEditor, hraPercentOfBasic: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm font-mono"
                  />
                </label>
                {([
                  ["ltaAnnual", "LTA (₹/yr)"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-caption font-medium text-gray-500 dark:text-gray-400">{label}</span>
                    <input
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      value={structureEditor[key]}
                      onChange={(e) => setStructureEditor({ ...structureEditor, [key]: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm font-mono"
                    />
                  </label>
                ))}
              </div>
              <p className="text-caption text-gray-500 dark:text-gray-400 -mt-1">
                Base Pay is annual fixed pay. Includes the employee&rsquo;s own PF contribution; excludes employer PF,
                gratuity and bonus. It is the Gross Earnings line on the employee&rsquo;s current payslip &times; 12.
                Basic + DA are the statutory 50% wage-base core (DA is your input; Basic is the remainder); HRA is a
                percentage of Basic.
              </p>
              {(() => {
                const basePay = Number(structureEditor.ctcAnnual || 0);
                const daPct = Number(structureEditor.daPercent || 0);
                const basicAmt = (basePay * (50 - daPct)) / 100;
                const namedTotal =
                  basicAmt +
                  (basePay * daPct) / 100 +
                  (basicAmt * Number(structureEditor.hraPercentOfBasic || 0)) / 100 +
                  Number(structureEditor.ltaAnnual || 0);
                return basePay > 0 && namedTotal > basePay ? (
                  <div className="text-body-sm text-amber-600 dark:text-amber-500">
                    Basic + DA + HRA + LTA total ₹{Math.round(namedTotal).toLocaleString("en-IN")}, above Base Pay ₹
                    {Math.round(basePay).toLocaleString("en-IN")} — the special-allowance residual will be zero and gross
                    may exceed Base Pay. Reduce HRA % or LTA.
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">Effective from</span>
                  <input
                    required
                    type="date"
                    value={structureEditor.effectiveFrom}
                    onChange={(e) => setStructureEditor({ ...structureEditor, effectiveFrom: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-caption font-medium text-gray-500 dark:text-gray-400">Effective to (optional)</span>
                  <input
                    type="date"
                    value={structureEditor.effectiveTo}
                    onChange={(e) => setStructureEditor({ ...structureEditor, effectiveTo: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm"
                  />
                </label>
              </div>
              {upsertStructure.error && (
                <div className="text-body-sm text-red-600">{upsertStructure.error.message}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStructureEditor(null)}
                  className="px-3 py-2 text-body-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upsertStructure.isPending}
                  className="px-4 py-2 text-body-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-60"
                >
                  {upsertStructure.isPending ? "Saving…" : "Save structure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form 16 e-sign modal */}
      {form16For && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-body-lg font-semibold text-gray-900 dark:text-gray-100">
                Form 16 — {(form16For.name as string) ?? "Employee"}
              </h2>
              <button
                type="button"
                onClick={() => setForm16For(null)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
              <label className="block text-body-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Generate Form 16
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={generateFy}
                  onChange={(e) => setGenerateFy(e.target.value)}
                  placeholder="YYYY-YYYY"
                  className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-body-sm"
                />
                <button
                  type="button"
                  disabled={generateForm16.isPending || !generateFy}
                  onClick={() => generateForm16.mutate({ employeeId: form16For.id as string, fy: generateFy })}
                  className="px-3 py-1.5 text-body-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {generateForm16.isPending ? "Generating..." : "Generate PDF"}
                </button>
              </div>
              {generateForm16.error && (
                <p className="mt-2 text-body-sm text-red-600">{generateForm16.error.message}</p>
              )}
            </div>

            <EsignPanel
              sourceType="form16"
              sourceId={form16For.id as string}
              defaultTitle={`Form 16 — ${(form16For.name as string) ?? "Employee"}`}
              subject="Form 16 — TDS certificate"
              hideUpload={true}
              defaultSigners={
                form16For.email
                  ? [{ name: (form16For.name as string) ?? "Employee", email: form16For.email as string, role: "employee" }]
                  : []
              }
            />
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-body-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              New payroll run
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm text-gray-600 dark:text-gray-400 mb-1">Month</label>
                <select
                  value={createMonth}
                  onChange={(e) => setCreateMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-body-sm text-gray-600 dark:text-gray-400 mb-1">Year</label>
                <input
                  type="number"
                  value={createYear}
                  onChange={(e) => setCreateYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-body-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => createRun.mutate({ month: createMonth, year: createYear })}
                disabled={createRun.isPending}
                className="px-4 py-2 text-body-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
              >
                {createRun.isPending ? "Creating..." : "Create run"}
              </button>
            </div>
            {createRun.error && (
              <p className="mt-3 text-caption text-red-600">{createRun.error.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// C1 declaration capture modal. Numeric inputs per section for one employee/FY, upserted with
// provenance=provisional. The STATUTORY CAPS are NOT applied here — computeTax caps at run time; this
// captures the raw declared amounts. Old-regime only: a new-regime employee is warned entries do nothing.
/**
 * Record arrears for one employee in one paid-in period.
 *
 * "Suggest" re-prices the already-paid months a backdated structure version covers, on each
 * issued payslip's OWN paid-days/LOP basis, and nets off arrears already paid in those months.
 * It fills the field — it never posts. The operator decides the figure.
 */
function ArrearsModal({
  employee,
  month,
  year,
  onClose,
  onSave,
  saving,
}: {
  employee: Record<string, unknown>;
  month: number;
  year: number;
  onClose: () => void;
  onSave: (amount: number, reason: string, sourceStructureId?: string) => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [sourceStructureId, setSourceStructureId] = useState<string | undefined>(undefined);
  const { mergeTrpcQueryOpts } = useRBAC();

  // Same RBAC-key reasoning as the list query above: `payroll.arrears.*` is not in the generated
  // map, so borrow an existing entry with the identical payroll:read gate.
  const suggestion = trpc.payroll.arrears.suggest.useQuery(
    { employeeId: employee.id as string, month, year },
    mergeTrpcQueryOpts("payroll.salaryStructures.list", {}),
  );
  const sug = suggestion.data as
    | {
        applicable: boolean;
        reason?: string;
        payable?: number;
        recovery?: number;
        hasRecovery?: boolean;
        structureId?: string;
        structureName?: string;
        periods?: Array<{ month: number; year: number; paidGross: number; revisedGross: number; delta: number }>;
      }
    | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-3">
          <h2 className="text-body font-medium text-gray-900 dark:text-gray-100">
            Arrears — {(employee.name as string) ?? "Employee"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-caption text-gray-500 dark:text-gray-400">
            Paid in {MONTHS[month - 1]} {year}.
          </p>

          <div className="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <div className="text-caption font-medium text-gray-700 dark:text-gray-300">
              Suggestion from a backdated structure
            </div>
            {suggestion.isLoading && <div className="text-caption text-gray-500">Checking…</div>}
            {sug && !sug.applicable && (
              <div className="text-caption text-gray-500 dark:text-gray-400">{sug.reason}</div>
            )}
            {sug && sug.applicable && (
              <>
                <div className="text-caption text-gray-500 dark:text-gray-400">
                  {sug.structureName} — re-priced {sug.periods?.length ?? 0} already-paid month
                  {(sug.periods?.length ?? 0) === 1 ? "" : "s"}.
                </div>
                {(sug.periods ?? []).map((pd) => (
                  <div key={`${pd.year}-${pd.month}`} className="flex justify-between text-caption tabular-nums">
                    <span className="text-gray-500">{MONTHS[pd.month - 1]} {pd.year}</span>
                    <span className={pd.delta < 0 ? "text-red-600" : "text-gray-700 dark:text-gray-300"}>
                      {formatInr(pd.delta)}
                    </span>
                  </div>
                ))}
                {sug.hasRecovery && (
                  <div className="text-caption text-amber-700 dark:text-amber-500">
                    At least one month went DOWN. A recovery of pay already banked is a decision, not a
                    computation — it is not proposed automatically.
                  </div>
                )}
                <button
                  type="button"
                  disabled={!sug.payable}
                  onClick={() => {
                    setAmount(String(sug.payable ?? 0));
                    setSourceStructureId(sug.structureId);
                    if (!reason) setReason(`Backdated revision — ${sug.structureName ?? "structure"}`);
                  }}
                  className="mt-1 px-2.5 py-1 rounded text-caption border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Use suggested {formatInr(sug.payable ?? 0)}
                </button>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-caption text-gray-500 dark:text-gray-400">Amount (₹)</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-body-sm"
            />
            <span className="text-caption text-gray-400">Negative recovers an overpayment.</span>
          </label>

          <label className="block">
            <span className="text-caption text-gray-500 dark:text-gray-400">Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Apr–Jun revision backdated"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-body-sm"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-body-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || amount.trim() === "" || Number.isNaN(Number(amount))}
            onClick={() => onSave(Number(amount), reason, sourceStructureId)}
            className="px-3 py-1.5 rounded text-body-sm bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save arrears"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclarationModal({
  employee,
  fiscalYear,
  onClose,
}: {
  employee: Record<string, unknown>;
  fiscalYear: number;
  onClose: () => void;
}) {
  const employeeId = employee.id as string;
  const isOldRegime = (employee as any).taxRegime === "old";
  const existing = trpc.payroll.taxDeclarations.get.useQuery(
    { employeeId, fiscalYear },
    { refetchOnWindowFocus: false },
  );
  const [form, setForm] = useState({
    section80C: "0",
    section80D: "0",
    section80CCD1B: "0",
    section80TTA: "0",
    section24b: "0",
  });
  useEffect(() => {
    const d = existing.data;
    if (d) {
      setForm({
        section80C: String(d.section80C ?? "0"),
        section80D: String(d.section80D ?? "0"),
        section80CCD1B: String(d.section80CCD1B ?? "0"),
        section80TTA: String(d.section80TTA ?? "0"),
        section24b: String((d as any).section24B ?? "0"),
      });
    }
  }, [existing.data]);

  const upsert = trpc.payroll.taxDeclarations.upsert.useMutation({
    onSuccess: () => {
      toast.success("Declaration saved");
      onClose();
    },
    onError: (e) => toast.error(e.message ?? "Failed to save declaration"),
  });

  // section key → { label, cap hint }. Caps are advisory here (enforced in the engine).
  const FIELDS: { k: keyof typeof form; l: string; cap: string }[] = [
    { k: "section80C", l: "Section 80C", cap: "cap ₹1,50,000 (PF, ELSS, life insurance, principal, etc.)" },
    { k: "section80D", l: "Section 80D", cap: "cap ₹75,000 (medical insurance premium)" },
    { k: "section80CCD1B", l: "Section 80CCD(1B)", cap: "cap ₹50,000 (NPS, over and above 80C)" },
    { k: "section80TTA", l: "Section 80TTA", cap: "cap ₹10,000 (savings-account interest)" },
    { k: "section24b", l: "Section 24(b)", cap: "cap ₹2,00,000 (home-loan interest)" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-body-lg font-semibold text-gray-900 dark:text-gray-100">
            Tax declaration — {(employee.name as string) ?? "Employee"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">{fyLabel(fiscalYear)} · declared amounts (₹)</p>

        {!isOldRegime && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-caption text-amber-800 dark:text-amber-300">
            This employee is on the <span className="font-semibold">new regime</span>. These deductions apply only under the
            old regime, so entering them will have <span className="font-semibold">no effect</span> on their tax until they switch.
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            upsert.mutate({
              employeeId,
              fiscalYear,
              section80C: Number(form.section80C || 0),
              section80D: Number(form.section80D || 0),
              section80CCD1B: Number(form.section80CCD1B || 0),
              section80TTA: Number(form.section80TTA || 0),
              section24b: Number(form.section24b || 0),
            });
          }}
          className="space-y-3"
        >
          {existing.isLoading ? (
            <div className="text-body-sm text-gray-500 dark:text-gray-400">Loading current declaration…</div>
          ) : (
            FIELDS.map((f) => (
              <label key={f.k} className="block">
                <span className="text-caption font-medium text-gray-500 dark:text-gray-400">{f.l}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form[f.k]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.k]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-body-sm font-mono"
                />
                <span className="mt-0.5 block text-[10px] text-gray-400">{f.cap}</span>
              </label>
            ))
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-body-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={upsert.isPending || existing.isLoading} className="px-4 py-2 rounded-lg text-body-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
              {upsert.isPending ? "Saving…" : "Save declaration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
