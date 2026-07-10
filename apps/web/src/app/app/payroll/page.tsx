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

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { format } from "date-fns";
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
  basicPercent: string;
  hraPercentOfBasic: string;
  ltaAnnual: string;
  medicalAllowanceAnnual: string;
  conveyanceAllowanceAnnual: string;
  bonusAnnual: string;
  effectiveFrom: string; // yyyy-mm-dd
  effectiveTo: string; // yyyy-mm-dd or ""
}

function emptyStructureForm(): StructureFormState {
  return {
    structureName: "",
    ctcAnnual: "",
    basicPercent: "40",
    hraPercentOfBasic: "50",
    ltaAnnual: "0",
    medicalAllowanceAnnual: "15000",
    conveyanceAllowanceAnnual: "19200",
    bonusAnnual: "0",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
  };
}

function structureToForm(s: Record<string, any>): StructureFormState {
  const toDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return {
    id: s.id,
    structureName: s.structureName ?? "",
    ctcAnnual: String(s.ctcAnnual ?? ""),
    basicPercent: String(s.basicPercent ?? "40"),
    hraPercentOfBasic: String(s.hraPercentOfBasic ?? "50"),
    ltaAnnual: String(s.ltaAnnual ?? "0"),
    medicalAllowanceAnnual: String(s.medicalAllowanceAnnual ?? "15000"),
    conveyanceAllowanceAnnual: String(s.conveyanceAllowanceAnnual ?? "19200"),
    bonusAnnual: String(s.bonusAnnual ?? "0"),
    effectiveFrom: toDate(s.effectiveFrom) || new Date().toISOString().slice(0, 10),
    effectiveTo: toDate(s.effectiveTo),
  };
}

function inr(v: string | number | null | undefined): string {
  return `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
}

// ─── MAIN PAGE COMPONENT ──────────────────────────────────────────────────────

export default function PayrollPage() {
  const utils = trpc.useUtils();
  const { mergeTrpcQueryOpts, can } = useRBAC();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<"runs" | "structures" | "declarations">("runs");
  const [form16For, setForm16For] = useState<Record<string, unknown> | null>(null);
  const [structureEditor, setStructureEditor] = useState<StructureFormState | null>(null);

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

  // Employees drive the Form 16 e-sign list under the Declarations tab.
  const employeesQuery = trpc.hr.employees.list.useQuery(
    { limit: 200 },
    mergeTrpcQueryOpts("hr.employees.list", { enabled: activeTab === "declarations" }),
  );
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

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Payroll
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            12-step payroll cycle with statutory compliance
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New payroll run
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(["runs", "structures", "declarations"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab === "runs" ? "Payroll runs" : tab === "structures" ? "Salary structures" : "TDS declarations"}
          </button>
        ))}
      </div>

      {activeTab === "runs" && (
        <div className="flex gap-6">
          {/* Run List */}
          <div className="w-80 flex-shrink-0 space-y-2">
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-sm text-gray-500">
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
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {r.runNumber}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {r.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {MONTHS[r.month - 1]} {r.year} · {r.employeeCount ?? 0} employees
                    </div>
                    {r.totalNet && Number(r.totalNet) > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
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
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-16 text-center text-sm text-gray-500">
                Select a payroll run to view details
              </div>
            ) : (
              <div className="space-y-6">
                {/* Run Header */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {run.runNumber}
                    </h2>
                    <span className={`text-sm px-3 py-1 rounded-full ${(STATUS_COLORS[run.status] ?? STATUS_COLORS.DRAFT!).bg} ${(STATUS_COLORS[run.status] ?? STATUS_COLORS.DRAFT!).text}`}>
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
                        <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{kpi.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Statutory breakdown */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                    {[
                      { label: "PF", value: `₹${Number(run.totalPF || 0).toLocaleString("en-IN")}` },
                      { label: "ESI", value: `₹${Number(run.totalESI || 0).toLocaleString("en-IN")}` },
                      { label: "Prof. tax", value: `₹${Number(run.totalPT || 0).toLocaleString("en-IN")}` },
                      { label: "TDS", value: `₹${Number(run.totalTDS || 0).toLocaleString("en-IN")}` },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                        <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{kpi.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 12-Step Progress Tracker */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
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
                            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium ${
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
                            className={`text-sm flex-1 ${
                              isCompleted
                                ? "text-green-700 dark:text-green-300"
                                : isCurrent
                                ? "text-blue-700 dark:text-blue-300 font-medium"
                                : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            Step {idx + 1}: {step.label}
                          </span>

                          {/* Action button for current step */}
                          {isCurrent && run.status !== "COMPLETED" && run.status !== "FAILED" && can("hr", "write") && (
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
                              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
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
                    <h3 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                      Errors ({(run.errors as any[]).length})
                    </h3>
                    <div className="space-y-1">
                      {(run.errors as any[]).map((err: any, i: number) => (
                        <div key={i} className="text-xs text-red-600 dark:text-red-400">
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
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                      Approvals
                    </h3>
                    <div className="space-y-2">
                      {run.approvals.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${
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
                            <span className="text-gray-400 text-xs">— {a.comments}</span>
                          )}
                        </div>
                      ))}
                    </div>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              CTC templates used to compute gross, HRA, and statutory components for assigned employees.
            </p>
            {can("hr", "write") && (
              <button
                type="button"
                onClick={() => setStructureEditor(emptyStructureForm())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" /> New structure
              </button>
            )}
          </div>

          {structuresQuery.isLoading && (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading structures…</div>
          )}
          {structuresQuery.data && structuresQuery.data.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No salary structures yet. Create one to assign it to employees.
            </div>
          )}
          {structuresQuery.data && structuresQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
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
            <div className="text-sm text-red-600">{deleteStructure.error.message}</div>
          )}
        </div>
      )}

      {activeTab === "declarations" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Issue Form 16 (TDS certificate) to an employee for e-signature.
          </p>
          {employeesQuery.isLoading && (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading employees…</div>
          )}
          {employeesQuery.data && employeesQuery.data.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">No employees found.</div>
          )}
          {employeesQuery.data && employeesQuery.data.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
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

      {/* Salary structure editor modal */}
      {structureEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                upsertStructure.mutate({
                  ...(structureEditor.id ? { id: structureEditor.id } : {}),
                  structureName: structureEditor.structureName,
                  ctcAnnual: Number(structureEditor.ctcAnnual),
                  basicPercent: Number(structureEditor.basicPercent),
                  hraPercentOfBasic: Number(structureEditor.hraPercentOfBasic),
                  ltaAnnual: Number(structureEditor.ltaAnnual),
                  medicalAllowanceAnnual: Number(structureEditor.medicalAllowanceAnnual),
                  conveyanceAllowanceAnnual: Number(structureEditor.conveyanceAllowanceAnnual),
                  bonusAnnual: Number(structureEditor.bonusAnnual),
                  effectiveFrom: new Date(structureEditor.effectiveFrom),
                  effectiveTo: structureEditor.effectiveTo ? new Date(structureEditor.effectiveTo) : null,
                });
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Structure name</span>
                <input
                  required
                  value={structureEditor.structureName}
                  onChange={(e) => setStructureEditor({ ...structureEditor, structureName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  placeholder="e.g. Senior Engineer — Band L4"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["ctcAnnual", "Annual CTC (₹)"],
                  ["basicPercent", "Basic %"],
                  ["hraPercentOfBasic", "HRA % of Basic"],
                  ["ltaAnnual", "LTA (₹/yr)"],
                  ["medicalAllowanceAnnual", "Medical (₹/yr)"],
                  ["conveyanceAllowanceAnnual", "Conveyance (₹/yr)"],
                  ["bonusAnnual", "Bonus (₹/yr)"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
                    <input
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      value={structureEditor[key]}
                      onChange={(e) => setStructureEditor({ ...structureEditor, [key]: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Effective from</span>
                  <input
                    required
                    type="date"
                    value={structureEditor.effectiveFrom}
                    onChange={(e) => setStructureEditor({ ...structureEditor, effectiveFrom: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Effective to (optional)</span>
                  <input
                    type="date"
                    value={structureEditor.effectiveTo}
                    onChange={(e) => setStructureEditor({ ...structureEditor, effectiveTo: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {upsertStructure.error && (
                <div className="text-sm text-red-600">{upsertStructure.error.message}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStructureEditor(null)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upsertStructure.isPending}
                  className="px-4 py-2 text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-60"
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
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Generate Form 16
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={generateFy}
                  onChange={(e) => setGenerateFy(e.target.value)}
                  placeholder="YYYY-YYYY"
                  className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={generateForm16.isPending || !generateFy}
                  onClick={() => generateForm16.mutate({ employeeId: form16For.id as string, fy: generateFy })}
                  className="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {generateForm16.isPending ? "Generating..." : "Generate PDF"}
                </button>
              </div>
              {generateForm16.error && (
                <p className="mt-2 text-sm text-red-600">{generateForm16.error.message}</p>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              New payroll run
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Month</label>
                <select
                  value={createMonth}
                  onChange={(e) => setCreateMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Year</label>
                <input
                  type="number"
                  value={createYear}
                  onChange={(e) => setCreateYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => createRun.mutate({ month: createMonth, year: createYear })}
                disabled={createRun.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
              >
                {createRun.isPending ? "Creating..." : "Create run"}
              </button>
            </div>
            {createRun.error && (
              <p className="mt-3 text-xs text-red-600">{createRun.error.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
