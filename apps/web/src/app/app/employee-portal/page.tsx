"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AccessDenied } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import {
  UserCircle, DollarSign, FileText, Calendar, Heart, Award,
  CheckCircle2, AlertTriangle, Download, Plus, Send, Clock,
  Briefcase, TrendingUp, Shield, BookOpen, Gift, CreditCard,
  Building2, ChevronRight, Edit2, Eye, IndianRupee, Info,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";

const PORTAL_TABS = [
  { key: "dashboard",   label: "My Dashboard" },
  { key: "payslips",    label: "Payslips" },
  { key: "tax",         label: "Tax & Declarations" },
  { key: "leave",       label: "Leave & Time Off" },
  { key: "benefits",    label: "Benefits" },
  { key: "performance", label: "Performance" },
  { key: "profile",     label: "My Profile" },
];

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export default function EmployeePortalPage() {
  const [tab, setTab] = useState("dashboard");
  const [expandedPayslip, setExpandedPayslip] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: "vacation", startDate: "", endDate: "", reason: "" });
  const [leaveMsg, setLeaveMsg] = useState<string | null>(null);
  const { currentUser, can } = useRBAC();

  const employeeQuery = trpc.hr.employees.list.useQuery({});
  const leaveQuery = trpc.hr.leave.list.useQuery({});

  const createLeave = trpc.hr.leave.create.useMutation({
    onSuccess: () => {
      setLeaveMsg("Leave request submitted successfully");
      setShowLeaveForm(false);
      setLeaveForm({ type: "vacation", startDate: "", endDate: "", reason: "" });
      leaveQuery.refetch();
      setTimeout(() => setLeaveMsg(null), 4000);
    },
    onError: (err) => {
      setLeaveMsg(`Error: ${err.message}`);
      setTimeout(() => setLeaveMsg(null), 5000);
    },
  });

  if (!can("hr", "read")) return <AccessDenied module="Employee Portal" />;

  // Merge live employee data with fallback
  const liveEmployee = employeeQuery.data?.[0];
  const myEmployeeId = (liveEmployee as any)?.id as string | undefined;

  const EMPLOYEE = {
    name: (liveEmployee as any)?.name ?? (liveEmployee as any)?.displayName ?? "—",
    id: (liveEmployee as any)?.employeeId ?? "—",
    title: (liveEmployee as any)?.title ?? "—",
    department: (liveEmployee as any)?.department ?? "—",
    startDate: (liveEmployee as any)?.startDate
      ? new Date((liveEmployee as any).startDate).toISOString().split("T")[0]
      : "—",
    location: (liveEmployee as any)?.location ?? "—",
    manager: "—",
    workMode: "—",
  };

  // Payslips + current tax slip
  const payslipsQuery = trpc.hr.payroll.listPayslips.useQuery(
    { employeeId: myEmployeeId, limit: 12 },
    { enabled: !!myEmployeeId },
  );

  const currentSlipQuery = trpc.hr.payroll.computeCurrentSlip.useQuery(
    { employeeId: myEmployeeId! },
    { enabled: !!myEmployeeId },
  );

  const payslips = (payslipsQuery.data ?? []) as any[];
  const currentSlip = currentSlipQuery.data;

  // Map live leave requests to display format; fall back to static history
  const liveLeaveHistory = leaveQuery.data?.map((lv: any) => ({
    id: lv.id,
    type: lv.type ?? "Annual Leave",
    from: lv.startDate ? new Date(lv.startDate).toISOString().split("T")[0] : "—",
    to:   lv.endDate   ? new Date(lv.endDate).toISOString().split("T")[0]   : "—",
    days: Number(lv.days ?? 0),
    status: lv.status ?? "pending",
    approver: lv.approvedById ? "Approved" : "Pending approval",
    notes: lv.reason ?? "",
  }));

  const LEAVE_HISTORY = (liveLeaveHistory && liveLeaveHistory.length > 0)
    ? liveLeaveHistory
    : [
        { id: "LV-001", type: "Annual Leave",  from: "2026-01-06", to: "2026-01-10", days: 5, status: "approved", approver: "Chris Wallace", notes: "New Year break" },
        { id: "LV-002", type: "Annual Leave",  from: "2026-02-14", to: "2026-02-14", days: 1, status: "approved", approver: "Chris Wallace", notes: "Valentine's Day" },
        { id: "LV-003", type: "Sick Leave",    from: "2026-02-20", to: "2026-02-21", days: 2, status: "approved", approver: "System (auto)", notes: "Self-certified" },
        { id: "LV-004", type: "Annual Leave",  from: "2026-04-07", to: "2026-04-11", days: 5, status: "pending",  approver: "Chris Wallace (pending)", notes: "Easter break" },
      ];

  const totalBenefitsCost = 0;
  const leaveAvailable = 0;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-[12px] flex items-center justify-center">
            {EMPLOYEE.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Employee Self-Service Portal</h1>
            <p className="text-[11px] text-muted-foreground/70">{EMPLOYEE.name} · {EMPLOYEE.title} · {EMPLOYEE.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {employeeQuery.isLoading && (
            <span className="text-[11px] text-muted-foreground/60 animate-pulse">Loading employee data…</span>
          )}
          <span className="text-[11px] text-muted-foreground/70">{EMPLOYEE.department} · Reports to: {EMPLOYEE.manager}</span>
        </div>
      </div>

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {PORTAL_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-3 gap-4">
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Quick Overview</p>
              {(employeeQuery.isLoading || currentSlipQuery.isLoading) ? (
                <div className="animate-pulse space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-3.5 bg-muted rounded w-24" />
                      <div className="h-3.5 bg-muted rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "CTC (Annual)",    value: currentSlip ? `₹${fmt(currentSlip.ctcAnnual)}` : "—", color: "text-foreground/80" },
                    { label: "Monthly Gross",   value: currentSlip ? `₹${fmt(currentSlip.slip.grossEarnings)}` : "—", color: "text-foreground/80" },
                    { label: "Monthly Net Pay", value: currentSlip ? `₹${fmt(currentSlip.slip.netPay)}` : "—", color: "text-green-700" },
                    { label: "Tax Regime",      value: currentSlip ? (currentSlip.taxSummary.regime === "new" ? "New Regime" : "Old Regime") : "—", color: "text-foreground/80" },
                    { label: "Leave Remaining", value: `${leaveAvailable} days`, color: leaveAvailable < 5 ? "text-orange-600" : "text-foreground/80" },
                    { label: "Start Date",      value: EMPLOYEE.startDate, color: "text-muted-foreground" },
                  ].map(f => (
                    <div key={f.label} className="flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground/70">{f.label}</span>
                      <span className={`font-semibold ${f.color}`}>{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Pending Actions</p>
              <div className="py-4 text-center text-[11px] text-muted-foreground/50">No pending actions</div>
            </div>
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-3">Quick Actions</p>
              <div className="space-y-1.5">
                {[
                  { label: "Request Time Off",      icon: Calendar, onClick: () => setTab("leave") },
                  { label: "Download Latest Payslip",icon: Download,  onClick: () => setTab("payslips") },
                  { label: "View Tax Declaration",   icon: FileText,  onClick: () => setTab("tax") },
                  { label: "View Benefits",          icon: Heart,     onClick: () => setTab("benefits") },
                  { label: "Performance Goals",      icon: TrendingUp,onClick: () => setTab("performance") },
                  { label: "Update Profile",         icon: Edit2,     onClick: () => setTab("profile") },
                ].map((a) => (
                  <button key={a.label} onClick={a.onClick}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 hover:bg-muted/30 rounded text-left border border-border">
                    <a.icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    {a.label}
                    <ChevronRight className="w-3 h-3 text-slate-300 ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PAYSLIPS */}
        {tab === "payslips" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-foreground/80">Payslips — {EMPLOYEE.name}</p>
                {payslips.length > 0 && (
                  <p className="text-[11px] text-muted-foreground/70">
                    YTD Gross: <strong className="text-foreground/80">₹{fmt(payslips.reduce((s: number, p: any) => s + Number(p.grossEarnings), 0))}</strong>
                    {" · "}YTD Tax (TDS): <strong className="text-red-600">₹{fmt(payslips.reduce((s: number, p: any) => s + Number(p.tds), 0))}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={() => downloadCSV(payslips.map((p: any) => ({ Month: p.month ?? p.payPeriod ?? "", Gross: p.grossPay ?? p.gross ?? "", Net: p.netPay ?? p.net ?? "", TDS: p.tds ?? "", PF_Employee: p.pfEmployee ?? "", ESI: p.esiEmployee ?? "" })), "payslips")}
                className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-card text-muted-foreground"
              >
                <Download className="w-3 h-3" /> Download All
              </button>
            </div>

            {payslipsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded" />
                ))}
              </div>
            ) : payslips.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No payslips generated yet</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {currentSlip
                    ? `Payroll not yet run — current month gross would be ₹${fmt(currentSlip.slip.grossEarnings)}`
                    : "Payslips will appear here once payroll is processed"}
                </p>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">PF</th>
                    <th className="text-right">PT</th>
                    <th className="text-right">TDS</th>
                    <th className="text-right">Net Pay</th>
                    <th>Regime</th>
                    <th className="text-center">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p: any) => {
                    const key = `${p.year}-${p.month}`;
                    const isExpanded = expandedPayslip === key;
                    return [
                      <tr key={key} onClick={() => setExpandedPayslip(isExpanded ? null : key)} className="cursor-pointer hover:bg-muted/20">
                        <td className="font-semibold text-foreground/80">{MONTHS[(p.month - 1) % 12]} {p.year}</td>
                        <td className="text-right">₹{fmt(Number(p.grossEarnings))}</td>
                        <td className="text-right text-muted-foreground">₹{fmt(Number(p.pfEmployee))}</td>
                        <td className="text-right text-muted-foreground">₹{fmt(Number(p.professionalTax))}</td>
                        <td className="text-right text-red-600">₹{fmt(Number(p.tds))}</td>
                        <td className="text-right font-semibold text-green-700">₹{fmt(Number(p.netPay))}</td>
                        <td><span className="status-badge">{p.taxRegimeUsed === "new" ? "New" : "Old"}</span></td>
                        <td className="text-center">
                          {p.pdfUrl
                            ? <a href={p.pdfUrl} className="text-primary text-[11px] underline" onClick={e => e.stopPropagation()}>PDF</a>
                            : <span className="text-muted-foreground/40 text-[11px]">—</span>}
                        </td>
                      </tr>,
                      isExpanded && (
                        <tr key={`${key}-detail`} className="bg-muted/10">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-2 gap-6 text-[12px]">
                              <div>
                                <p className="font-semibold text-[11px] text-muted-foreground uppercase mb-2">Earnings</p>
                                {[
                                  ["Basic", p.basic], ["HRA", p.hra], ["Special Allowance", p.specialAllowance],
                                  ["LTA", p.lta], ["Medical Allowance", p.medicalAllowance],
                                  ["Conveyance", p.conveyanceAllowance], ["Bonus", p.bonus],
                                ].map(([label, val]) => (
                                  <div key={String(label)} className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground/70">{label}</span>
                                    <span>₹{fmt(Number(val))}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between py-1 font-semibold">
                                  <span>Gross Earnings</span>
                                  <span>₹{fmt(Number(p.grossEarnings))}</span>
                                </div>
                              </div>
                              <div>
                                <p className="font-semibold text-[11px] text-muted-foreground uppercase mb-2">Deductions</p>
                                {[
                                  ["PF (Employee)", p.pfEmployee], ["PF (Employer)", p.pfEmployer],
                                  ["Professional Tax", p.professionalTax], ["LWF", p.lwf], ["TDS", p.tds],
                                ].map(([label, val]) => (
                                  <div key={String(label)} className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground/70">{label}</span>
                                    <span className="text-red-600">₹{fmt(Number(val))}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between py-1 font-semibold text-green-700">
                                  <span>Net Pay</span>
                                  <span>₹{fmt(Number(p.netPay))}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ),
                    ].filter(Boolean);
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAX & DECLARATIONS */}
        {tab === "tax" && (
          <div className="p-4">
            {currentSlipQuery.isLoading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : !currentSlip ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">Tax data not available</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {myEmployeeId
                    ? "No salary structure assigned to this employee record"
                    : "Employee record not found — contact HR to set up your profile"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Tax Summary Card */}
                <div className="border border-border rounded overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">FY 2025–26 Tax Summary</span>
                    <span className={`status-badge text-[10px] ${currentSlip.taxSummary.regime === "new" ? "text-blue-700 bg-blue-100" : "text-purple-700 bg-purple-100"}`}>
                      {currentSlip.taxSummary.regime === "new" ? "New Regime" : "Old Regime"}
                    </span>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { label: "Projected Annual Gross",  value: `₹${fmt(currentSlip.taxSummary.projectedAnnualGross)}`, bold: false },
                      { label: "Taxable Income",          value: `₹${fmt(currentSlip.taxSummary.taxableIncome)}`, bold: false },
                      { label: "Total Tax Liability",     value: `₹${fmt(currentSlip.taxSummary.totalTaxLiability)}`, bold: true },
                      { label: "Section 87A Rebate",      value: `₹${fmt(currentSlip.taxSummary.rebate87A)}`, bold: false },
                      { label: "Surcharge",               value: `₹${fmt(currentSlip.taxSummary.surcharge)}`, bold: false },
                      { label: "Health & Education Cess (4%)", value: `₹${fmt(currentSlip.taxSummary.cess)}`, bold: false },
                      { label: "Effective Tax Rate",      value: `${(currentSlip.taxSummary.effectiveRate * 100).toFixed(2)}%`, bold: false },
                      { label: "Monthly TDS",             value: `₹${fmt(currentSlip.taxSummary.monthlyTds)}`, bold: true },
                    ].map(f => (
                      <div key={f.label} className="flex justify-between text-[12px] py-0.5 border-b border-border/30 last:border-0">
                        <span className="text-muted-foreground/70">{f.label}</span>
                        <span className={f.bold ? "font-semibold text-foreground" : "text-foreground/80"}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Identity & Salary Breakdown */}
                <div className="space-y-3">
                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Salary Breakdown (Monthly)</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {[
                        { label: "Basic",                value: currentSlip.slip.basic },
                        { label: "HRA",                  value: currentSlip.slip.hra },
                        { label: "Special Allowance",    value: currentSlip.slip.specialAllowance },
                        { label: "LTA",                  value: currentSlip.slip.lta },
                        { label: "Medical Allowance",    value: currentSlip.slip.medicalAllowance },
                        { label: "Conveyance",           value: currentSlip.slip.conveyanceAllowance },
                        { label: "Bonus",                value: currentSlip.slip.bonus },
                      ].map(f => (
                        <div key={f.label} className="flex justify-between text-[12px] py-0.5 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground/70">{f.label}</span>
                          <span className="text-foreground/80">₹{fmt(f.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[12px] font-semibold pt-1">
                        <span>Gross Earnings</span>
                        <span>₹{fmt(currentSlip.slip.grossEarnings)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Statutory Identity</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {[
                        { label: "PAN",        value: currentSlip.employeeInfo.pan ?? "Not on file" },
                        { label: "UAN (EPFO)", value: currentSlip.employeeInfo.uan ?? "Not on file" },
                        { label: "Tax State",  value: currentSlip.employeeInfo.state ?? "Not set" },
                      ].map(f => (
                        <div key={f.label} className="flex justify-between text-[12px]">
                          <span className="text-muted-foreground/70">{f.label}</span>
                          <span className={`font-mono ${f.value === "Not on file" || f.value === "Not set" ? "text-orange-600" : "text-foreground/80"}`}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-amber-200 bg-amber-50 rounded p-3">
                    <p className="text-[11px] text-amber-800 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      Tax figures are based on the current salary structure. To declare 80C/80D investments or submit rent receipts for HRA, contact HR or submit via the Investment Declaration form.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "leave" && (
          <div className="p-4">
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="col-span-5 py-4 text-center text-[11px] text-muted-foreground/50">Leave balance data not available — connect an HR system to view leave entitlements</div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-foreground/80">Leave History</span>
              <button
                onClick={() => setShowLeaveForm((v) => !v)}
                className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
              >
                <Plus className="w-3 h-3" /> {showLeaveForm ? "Cancel" : "Request Leave"}
              </button>
            </div>

            {leaveMsg && (
              <div className={`mb-2 px-3 py-2 rounded text-[11px] font-medium ${leaveMsg.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                {leaveMsg}
              </div>
            )}

            {showLeaveForm && (
              <div className="mb-4 bg-muted/30 border border-border rounded p-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Leave Type</label>
                    <select className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={leaveForm.type} onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))}>
                      <option value="vacation">Annual / Earned Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="parental">Parental Leave</option>
                      <option value="bereavement">Bereavement Leave</option>
                      <option value="unpaid">Leave Without Pay</option>
                      <option value="other">Other / Casual</option>
                    </select>
                  </div>
                  <div />
                  <div>
                    <label className="text-[11px] text-muted-foreground">Start Date *</label>
                    <input type="date" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">End Date *</label>
                    <input type="date" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">Reason</label>
                    <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Reason for leave (optional)" value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    disabled={!leaveForm.startDate || !leaveForm.endDate || createLeave.isPending}
                    onClick={() => createLeave.mutate({ type: leaveForm.type as any, startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason || undefined })}
                    className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createLeave.isPending ? "Submitting…" : "Submit Request"}
                  </button>
                  <button onClick={() => setShowLeaveForm(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
                </div>
              </div>
            )}

            {leaveQuery.isLoading ? (
              <div className="animate-pulse space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-4 py-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead><tr><th className="w-4" /><th>Type</th><th>From</th><th>To</th><th className="text-center">Days</th><th>Approver</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  {LEAVE_HISTORY.map((lv: any) => (
                    <tr key={lv.id}>
                      <td className="p-0"><div className={`priority-bar ${lv.status === "approved" ? "bg-green-500" : lv.status === "pending" ? "bg-yellow-500" : "bg-red-500"}`} /></td>
                      <td className="text-foreground/80">{lv.type}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{lv.from}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{lv.to}</td>
                      <td className="text-center font-bold text-foreground">{lv.days}</td>
                      <td className="text-muted-foreground">{lv.approver}</td>
                      <td><span className={`status-badge capitalize ${lv.status === "approved" ? "text-green-700 bg-green-100" : lv.status === "pending" ? "text-yellow-700 bg-yellow-100" : "text-red-700 bg-red-100"}`}>{lv.status}</span></td>
                      <td className="text-[11px] text-muted-foreground/70">{lv.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* BENEFITS */}
        {tab === "benefits" && (
          <div className="p-8 text-center">
            <Heart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No benefits data available</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Connect a benefits management system to view your enrolled benefits</p>
          </div>
        )}

        {/* PERFORMANCE */}
        {tab === "performance" && (
          <div className="p-8 text-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No performance goals set yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Goals will appear here once your manager sets up your review cycle</p>
          </div>
        )}

        {/* PROFILE */}
        {tab === "profile" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Personal Information</span>
                <button onClick={() => toast.info("To update personal information, please raise an HR case from the HR module or contact HR directly.")} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3" />Edit</button>
              </div>
              {employeeQuery.isLoading ? (
                <div className="p-4 animate-pulse space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-3.5 bg-muted rounded w-28" />
                      <div className="h-3.5 bg-muted rounded w-32" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {[
                    { label: "Full Name",        value: EMPLOYEE.name },
                    { label: "Employee ID",      value: EMPLOYEE.id },
                    { label: "Job Title",        value: EMPLOYEE.title },
                    { label: "Department",       value: EMPLOYEE.department },
                    { label: "Reporting Manager",value: EMPLOYEE.manager },
                    { label: "Start Date",       value: EMPLOYEE.startDate },
                    { label: "Work Location",    value: EMPLOYEE.location },
                    { label: "Work Mode",        value: EMPLOYEE.workMode },
                  ].map(f => (
                    <div key={f.label} className="flex justify-between text-[12px]">
                      <span className="text-muted-foreground/70">{f.label}</span>
                      <span className="text-foreground/80 font-medium">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">Payroll & Banking</span>
                  <button onClick={() => toast.info("To update payroll or banking details, raise an HR case from the HR module or contact your Payroll team.")} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3" />Update</button>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { label: "Annual CTC",     value: currentSlip ? `₹${fmt(currentSlip.ctcAnnual)}` : "—" },
                    { label: "Pay Frequency",  value: "Monthly" },
                    { label: "Bank",           value: (liveEmployee as any)?.bankName ?? "—" },
                    { label: "Account",        value: (liveEmployee as any)?.bankAccountNumber ? `••••${String((liveEmployee as any).bankAccountNumber).slice(-4)}` : "—" },
                    { label: "PAN",            value: (liveEmployee as any)?.pan ?? "—" },
                    { label: "UAN",            value: (liveEmployee as any)?.uan ?? "—" },
                    { label: "Tax Regime",     value: currentSlip?.taxSummary.regime === "new" ? "New (Default)" : "Old (Declared)" },
                    { label: "IFSC",           value: (liveEmployee as any)?.bankIfsc ?? "—" },
                  ].map(f => (
                    <div key={f.label} className="flex justify-between text-[12px]">
                      <span className="text-muted-foreground/70">{f.label}</span>
                      <span className="text-foreground/80 font-medium font-mono">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border rounded p-3 bg-amber-50 border-amber-200">
                <p className="text-[11px] text-amber-800 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" />
                  To update sensitive payroll details (bank account, tax), contact HR directly. Verification required.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
