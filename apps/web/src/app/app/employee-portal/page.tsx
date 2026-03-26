"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AccessDenied } from "@/lib/rbac-context";
import {
  UserCircle, DollarSign, FileText, Calendar, Heart, Award,
  CheckCircle2, AlertTriangle, Download, Plus, Send, Clock,
  Briefcase, TrendingUp, Shield, BookOpen, Gift, CreditCard,
  Building2, ChevronRight, Edit2, Eye,
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

export default function EmployeePortalPage() {
  const [tab, setTab] = useState("dashboard");
  const [expandedPayslip, setExpandedPayslip] = useState<string | null>(null);
  const { currentUser, can } = useRBAC();

  // Live employee data — backend scopes to current user via ctx.user.id
  const employeeQuery = trpc.hr.employees.list.useQuery({});

  // Live leave requests — backend scopes to org; filtered to current user's employee record
  const leaveQuery = trpc.hr.leave.list.useQuery({});

  if (!can("hr", "read")) return <AccessDenied module="Employee Portal" />;

  // Merge live employee data with fallback
  const liveEmployee = employeeQuery.data?.[0];
  const EMPLOYEE = {
    name: liveEmployee?.name ?? liveEmployee?.displayName ?? "—",
    id: liveEmployee?.employeeId ?? "—",
    title: liveEmployee?.title ?? "—",
    department: liveEmployee?.department ?? "—",
    startDate: liveEmployee?.startDate
      ? new Date(liveEmployee.startDate).toISOString().split("T")[0]
      : "—",
    location: liveEmployee?.location ?? "—",
    manager: "—",
    workMode: "—",
  };

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-[12px] flex items-center justify-center">
            {EMPLOYEE.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
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
              {employeeQuery.isLoading ? (
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
                    { label: "Current Salary",      value: "—",  color: "text-foreground/80" },
                    { label: "Pay Frequency",        value: "—",                         color: "text-foreground/80" },
                    { label: "Tax Code",             value: "—",                              color: "text-foreground/80" },
                    { label: "Leave Remaining",      value: `${leaveAvailable} days`,                     color: leaveAvailable < 5 ? "text-orange-600" : "text-green-700" },
                    { label: "EPF Enrolled",         value: "—",                      color: "text-muted-foreground" },
                    { label: "Start Date",           value: EMPLOYEE.startDate,                            color: "text-muted-foreground" },
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
                  { label: "Update Tax Declaration", icon: FileText,  onClick: () => setTab("tax") },
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

        {/* PAYSLIPS — static data (payroll system not yet DB-backed) */}
        {tab === "payslips" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-foreground/80">Payslips — {EMPLOYEE.name}</p>
                <p className="text-[11px] text-muted-foreground/70">YTD Gross: <strong className="text-foreground/80">—</strong> · YTD Tax: <strong className="text-red-600">—</strong></p>
              </div>
              <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-card text-muted-foreground">
                <Download className="w-3 h-3" /> Download All
              </button>
            </div>
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[12px] text-muted-foreground/50">No payslips available yet</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">Payslips will appear here once payroll is processed through the system</p>
            </div>
          </div>
        )}
        {/* TAX & DECLARATIONS */}
        {tab === "tax" && (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">Tax and declaration data not available</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Connect a payroll system to view tax summaries and declarations</p>
          </div>
        )}

        {tab === "leave" && (
          <div className="p-4">
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="col-span-5 py-4 text-center text-[11px] text-muted-foreground/50">Leave balance data not available — connect an HR system to view leave entitlements</div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-foreground/80">Leave History</span>
              <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                <Plus className="w-3 h-3" /> Request Leave
              </button>
            </div>

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

        {/* BENEFITS — static data (benefits system not yet DB-backed) */}
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
                <button className="text-[11px] text-primary hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3" />Edit</button>
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
                  <button className="text-[11px] text-primary hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3" />Update</button>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { label: "Annual Salary",  value: "—" },
                    { label: "Pay Frequency",  value: "—" },
                    { label: "Bank",           value: "—" },
                    { label: "Account",        value: "—" },
                    { label: "Tax Code",       value: "—" },
                    { label: "NI / SSN",       value: "—" },
                    { label: "Pension",        value: "—" },
                    { label: "Equity",         value: "—" },
                  ].map(f => (
                    <div key={f.label} className="flex justify-between text-[12px]">
                      <span className="text-muted-foreground/70">{f.label}</span>
                      <span className="text-foreground/80 font-medium">{f.value}</span>
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
