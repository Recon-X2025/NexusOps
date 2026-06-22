/**
 * CoheronConnect Employee Payslip Self-Service Page
 * ─────────────────────────────────────────────
 * Place at: apps/web/src/app/app/employee-portal/payslips/page.tsx
 *
 * This page implements US-ESS-02 and US-ESS-03:
 *  - View and download monthly payslips with full breakdown
 *  - View tax summary, Old vs New regime comparison
 *  - Download Form 16
 */

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(num) ? "0" : num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function FYOptions() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const fyStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const options = [];
  for (let i = 0; i < 5; i++) {
    const start = fyStart - i;
    options.push(`${start}-${start + 1}`);
  }
  return options;
}

// ─── PAYSLIP CARD ──────────────────────────────────────────────────────────────

function PayslipCard({ payslip, onDownload }: { payslip: any; onDownload: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex-1 text-left">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {MONTHS[(payslip.month ?? 1) - 1]} {payslip.year}
          </span>
          {payslip.lopDays > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {payslip.lopDays} LOP
            </span>
          )}
        </div>
        <div className="flex items-center gap-8 text-sm">
          <div className="text-right">
            <div className="text-xs text-gray-500">Gross</div>
            <div className="font-medium text-gray-700 dark:text-gray-300">
              ₹{fmt(payslip.grossEarnings)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Deductions</div>
            <div className="font-medium text-red-600 dark:text-red-400">
              ₹{fmt(payslip.totalDeductions)}
            </div>
          </div>
          <div className="text-right min-w-[100px]">
            <div className="text-xs text-gray-500">Net pay</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              ₹{fmt(payslip.netPay)}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50/50 dark:bg-gray-800/30">
          <div className="grid grid-cols-2 gap-8">
            {/* Earnings */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Earnings
              </h4>
              <div className="space-y-2">
                {[
                  ["Basic", payslip.basicEarned],
                  ["HRA", payslip.hraEarned],
                  ["Special allowance", payslip.specialAllowance],
                  ["LTA", payslip.lta],
                  ...(Number(payslip.overtime) > 0 ? [["Overtime", payslip.overtime]] : []),
                  ...(Number(payslip.arrears) > 0 ? [["Arrears", payslip.arrears]] : []),
                  ...(Number(payslip.bonus) > 0 ? [["Bonus", payslip.bonus]] : []),
                  ...(Number(payslip.otherEarnings) > 0 ? [["Other earnings", payslip.otherEarnings]] : []),
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{label}</span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono">₹{fmt(value as any)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-900 dark:text-gray-100">Gross earnings</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">₹{fmt(payslip.grossEarnings)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Deductions
              </h4>
              <div className="space-y-2">
                {[
                  ["Provident fund (PF)", payslip.employeePF],
                  ...(Number(payslip.employeeESI) > 0 ? [["ESI", payslip.employeeESI]] : []),
                  ["Professional tax", payslip.professionalTax],
                  ...(Number(payslip.lwf) > 0 ? [["Labour welfare fund", payslip.lwf]] : []),
                  ["Income tax (TDS)", payslip.tds],
                  ...(Number(payslip.otherDeductions) > 0 ? [["Other deductions", payslip.otherDeductions]] : []),
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{label}</span>
                    <span className="text-red-600 dark:text-red-400 font-mono">₹{fmt(value as any)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-900 dark:text-gray-100">Total deductions</span>
                  <span className="text-red-600 dark:text-red-400 font-mono">₹{fmt(payslip.totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net pay + YTD */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">Net pay</span>
                <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  ₹{fmt(payslip.netPay)}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </button>
            </div>

            {/* YTD row */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              {[
                { label: "YTD gross", value: payslip.ytdGross },
                { label: "YTD PF", value: payslip.ytdPF },
                { label: "YTD TDS", value: payslip.ytdTDS },
                { label: "YTD net", value: payslip.ytdNetPay },
              ].map((item) => (
                <div key={item.label} className="rounded-md bg-gray-100 dark:bg-gray-700/50 px-3 py-2">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono mt-0.5">
                    ₹{fmt(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tax info */}
          {payslip.taxComputation && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>
                  Regime: <span className="font-medium text-gray-700 dark:text-gray-300">
                    {(payslip.taxComputation as any).regime}
                  </span>
                </span>
                <span>
                  Taxable income: <span className="font-medium text-gray-700 dark:text-gray-300">
                    ₹{fmt((payslip.taxComputation as any).taxableIncome || 0)}
                  </span>
                </span>
                <span>
                  Annual tax: <span className="font-medium text-gray-700 dark:text-gray-300">
                    ₹{fmt((payslip.taxComputation as any).totalTaxLiability || 0)}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function EmployeePayslipsPage() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const fyOptions = FYOptions();
  const [selectedFY, setSelectedFY] = useState(fyOptions[0]!);
  const [activeTab, setActiveTab] = useState<"payslips" | "tax" | "form16">("payslips");

  const payslipsQuery = trpc.payroll.payslips.myPayslips.useQuery(
    {
      year: parseInt(selectedFY.split("-")[0]!),
    },
    mergeTrpcQueryOpts("payroll.payslips.myPayslips", {}),
  );

  const taxPreview = trpc.payroll.taxPreview.useQuery(
    {
      employeeId: "", // Current user — will be populated from ctx.userId on server
      financialYear: selectedFY,
    },
    mergeTrpcQueryOpts("payroll.taxPreview", { enabled: activeTab === "tax" }),
  );

  type PayslipRow = {
    id: string;
    grossEarnings?: unknown;
    totalDeductions?: unknown;
    netPay?: unknown;
    tds?: unknown;
    employeePF?: unknown;
  };
  const payslipsList = (payslipsQuery.data ?? []) as PayslipRow[];

  // Calculate FY summary from payslips
  const fySummary = {
    totalGross: payslipsList.reduce((s: number, p: PayslipRow) => s + Number(p.grossEarnings || 0), 0),
    totalDeductions: payslipsList.reduce((s: number, p: PayslipRow) => s + Number(p.totalDeductions || 0), 0),
    totalNet: payslipsList.reduce((s: number, p: PayslipRow) => s + Number(p.netPay || 0), 0),
    totalTDS: payslipsList.reduce((s: number, p: PayslipRow) => s + Number(p.tds || 0), 0),
    totalPF: payslipsList.reduce((s: number, p: PayslipRow) => s + Number(p.employeePF || 0), 0),
    monthsProcessed: payslipsList.length,
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            My payslips
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            View earnings, deductions, and download payslips
          </p>
        </div>
        <select
          value={selectedFY}
          onChange={(e) => setSelectedFY(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          {fyOptions.map((fy) => (
            <option key={fy} value={fy}>FY {fy}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {([
          { key: "payslips", label: "Monthly payslips" },
          { key: "tax", label: "Tax summary" },
          { key: "form16", label: "Form 16" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* FY Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total earnings", value: fySummary.totalGross, color: "" },
          { label: "Total TDS", value: fySummary.totalTDS, color: "text-amber-600" },
          { label: "Total PF", value: fySummary.totalPF, color: "text-blue-600" },
          { label: "Total net pay", value: fySummary.totalNet, color: "text-green-700" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-lg font-semibold font-mono ${card.color || "text-gray-900 dark:text-gray-100"}`}>
              ₹{fmt(card.value)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {fySummary.monthsProcessed} months
            </div>
          </div>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "payslips" && (
        <div className="space-y-2">
          {payslipsList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center text-sm text-gray-500">
              No payslips found for FY {selectedFY}
            </div>
          ) : (
            payslipsList.map((ps: PayslipRow) => (
              <PayslipCard
                key={ps.id}
                payslip={ps}
                onDownload={() => {
                  window.open(`/api/payroll/payslip-pdf/${ps.id}`, "_blank");
                }}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "tax" && (
        <div className="space-y-4">
          {taxPreview.isLoading ? (
            <div className="text-sm text-gray-500">Loading tax computation...</div>
          ) : taxPreview.data ? (
            <>
              {/* Regime comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Old regime */}
                <div className={`rounded-lg border p-5 ${
                  taxPreview.data.recommendation === "OLD"
                    ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10"
                    : "border-gray-200 dark:border-gray-700"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Old regime</h3>
                    {taxPreview.data.recommendation === "OLD" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200">
                        Saves ₹{fmt(taxPreview.data.savings)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Gross salary</span>
                      <span className="font-mono">₹{fmt(taxPreview.data.oldRegime.grossSalary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Standard deduction</span>
                      <span className="font-mono text-green-600">-₹{fmt(taxPreview.data.oldRegime.standardDeduction)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">HRA exemption</span>
                      <span className="font-mono text-green-600">-₹{fmt(taxPreview.data.oldRegime.hraExemption)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Chapter VI-A</span>
                      <span className="font-mono text-green-600">-₹{fmt(taxPreview.data.oldRegime.chapter6ADeductions)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sec 24(b)</span>
                      <span className="font-mono text-green-600">-₹{fmt(taxPreview.data.oldRegime.section24bDeduction)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Taxable income</span>
                      <span className="font-mono font-medium">₹{fmt(taxPreview.data.oldRegime.taxableIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Total tax</span>
                      <span className="font-mono font-semibold text-red-600">₹{fmt(taxPreview.data.oldRegime.totalTaxLiability)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monthly TDS</span>
                      <span className="font-mono">₹{fmt(taxPreview.data.oldRegime.monthlyTDS)}</span>
                    </div>
                  </div>
                </div>

                {/* New regime */}
                <div className={`rounded-lg border p-5 ${
                  taxPreview.data.recommendation === "NEW"
                    ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10"
                    : "border-gray-200 dark:border-gray-700"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">New regime</h3>
                    {taxPreview.data.recommendation === "NEW" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200">
                        Saves ₹{fmt(taxPreview.data.savings)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Gross salary</span>
                      <span className="font-mono">₹{fmt(taxPreview.data.newRegime.grossSalary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Standard deduction</span>
                      <span className="font-mono text-green-600">-₹{fmt(taxPreview.data.newRegime.standardDeduction)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>No Chapter VI-A in new regime</span>
                      <span>—</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Taxable income</span>
                      <span className="font-mono font-medium">₹{fmt(taxPreview.data.newRegime.taxableIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Total tax</span>
                      <span className="font-mono font-semibold text-red-600">₹{fmt(taxPreview.data.newRegime.totalTaxLiability)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monthly TDS</span>
                      <span className="font-mono">₹{fmt(taxPreview.data.newRegime.monthlyTDS)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current selection */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-sm">
                <span className="text-blue-700 dark:text-blue-300">
                  Your selected regime: <span className="font-medium">{taxPreview.data.currentRegime}</span>
                  {taxPreview.data.regimeLocked
                    ? " (locked for this FY — irrevocable)"
                    : " — you can still change this before your first payroll run"
                  }
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">
              Submit your TDS declaration to see the tax comparison.
            </div>
          )}
        </div>
      )}

      {activeTab === "form16" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              Form 16 — FY {selectedFY}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Annual tax certificate (Part A from TRACES + Part B from employer)
            </p>
            {fySummary.monthsProcessed >= 12 ? (
              <button
                onClick={() => window.open(`/api/payroll/form16?fy=${selectedFY}`, "_blank")}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Form 16
              </button>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Form 16 will be available after the financial year ends ({12 - fySummary.monthsProcessed} months remaining)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
