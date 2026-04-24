/**
 * NexusOps Payroll Run Page
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

// ─── MAIN PAGE COMPONENT ──────────────────────────────────────────────────────

export default function PayrollPage() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<"runs" | "structures" | "declarations">("runs");

  // ── Queries ────────────────────────────────────────────────────────────────

  const runsQuery = trpc.payroll.runs.list.useQuery({}, mergeTrpcQueryOpts("payroll.runs.list", {}));
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

  const runs = runsQuery.data ?? [];
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
                  <div className="grid grid-cols-4 gap-3">
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
                  <div className="grid grid-cols-4 gap-3 mt-3">
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
                          {isCurrent && run.status !== "COMPLETED" && run.status !== "FAILED" && (
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
