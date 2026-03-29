"use client";

export const dynamic = "force-dynamic";

// India compliance wired via indiaCompliance.calendar + indiaCompliance.directors

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Briefcase, Download, Plus, AlertTriangle, CheckCircle2, Clock, FileText, Users, Building2, Scale, Calendar, BookOpen, Shield, RefreshCw, ExternalLink } from "lucide-react";
import { downloadCSV } from "@/lib/utils";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilingStatus = "filed" | "pending" | "overdue" | "not_due" | "in_progress";
type MeetingStatus = "scheduled" | "completed" | "cancelled";
type ResolutionType = "ordinary" | "special" | "board";

const STATUS_COLOR: Record<string, string> = {
  filed:          "text-green-700 bg-green-100",
  pending:        "text-orange-700 bg-orange-100",
  overdue:        "text-red-700 bg-red-100",
  due_soon:       "text-yellow-700 bg-yellow-100",
  upcoming:       "text-blue-700 bg-blue-100",
  not_due:        "text-muted-foreground bg-muted",
  not_applicable: "text-muted-foreground bg-muted",
  in_progress:    "text-blue-700 bg-blue-100",
};

const STATUS_LABEL: Record<string, string> = {
  filed: "Filed", pending: "Pending", overdue: "Overdue",
  due_soon: "Due Soon", upcoming: "Upcoming",
  not_applicable: "N/A", in_progress: "In Progress",
};

const DIN_KYC_COLOR: Record<string, string> = {
  active:      "text-green-700 bg-green-100",
  deactivated: "text-red-700 bg-red-100",
};

const MTG_TYPE_COLOR: Record<string, string> = {
  board: "text-primary bg-primary/10",
  audit: "text-purple-700 bg-purple-100",
  agm:   "text-blue-700 bg-blue-100",
  egm:   "text-orange-700 bg-orange-100",
};

// ── Component ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "Overview",            module: "grc"       as const, action: "read"  as const },
  { key: "board",      label: "Board & Directors",   module: "grc"       as const, action: "read"  as const },
  { key: "filings",    label: "MCA / ROC Filings",   module: "grc"       as const, action: "read"  as const },
  { key: "share",      label: "Share Capital",       module: "financial" as const, action: "read"  as const },
  { key: "registers",  label: "Statutory Registers", module: "grc"       as const, action: "read"  as const },
  { key: "calendar",   label: "Compliance Calendar", module: "grc"       as const, action: "read"  as const },
];

function SecretarialContent() {
  const { can } = useRBAC();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Live data ─────────────────────────────────────────────────────────────
  const calendarQuery = (trpc as any).indiaCompliance.calendar.list.useQuery({});
  const directorsQuery = (trpc as any).indiaCompliance.directors.list.useQuery({ isActive: true });
  const kycReminderMutation = (trpc as any).indiaCompliance.directors.triggerKYCReminders.useMutation({
    onSuccess: () => toast.success("KYC reminders sent"),
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const markFiledMutation   = (trpc as any).indiaCompliance.calendar.markFiled.useMutation({
    onSuccess: () => { calendarQuery.refetch(); setFilingPanel(null); },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const markKycMutation     = (trpc as any).indiaCompliance.directors.markKYCComplete.useMutation({
    onSuccess: () => directorsQuery.refetch(),
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const createCalendarMutation = (trpc as any).indiaCompliance.calendar.create.useMutation({
    onSuccess: () => { calendarQuery.refetch(); setShowCreateForm(false); setCreateForm(EMPTY_CREATE_FORM); },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const [filingPanel, setFilingPanel] = useState<string | null>(null); // item id being filed
  const [filingSRN, setFilingSRN]     = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const EMPTY_CREATE_FORM = { eventName: "", mcaForm: "", complianceType: "annual" as const, dueDate: "", penaltyPerDayInr: 200, financialYear: "2025-26" };
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);

  const calendarItems: any[] = calendarQuery.data ?? [];
  const directors: any[] = directorsQuery.data ?? [];

  // KPI derivations
  const overdueFilings  = calendarItems.filter((i: any) => i.status === "overdue").length;
  const pendingFilings  = calendarItems.filter((i: any) => ["upcoming", "due_soon", "pending"].includes(i.status)).length;
  const directorsCount  = directors.length;
  const now = new Date();
  const agmDue = new Date(new Date().getFullYear(), 8, 30); // Sep 30
  const daysToAGM = Math.max(0, Math.ceil((agmDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const visibleTabs = TABS.filter((t) => can(t.module, t.action));

  const tabParam = searchParams.get("tab");
  const activeTab = (tabParam && visibleTabs.find(t => t.key === tabParam))
    ? tabParam
    : (visibleTabs[0]?.key ?? "overview");

  if (!can("grc", "read")) return <AccessDenied module="Secretarial & Company Secretary" />;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Secretarial — Company Secretary</h1>
          <span className="text-[11px] text-muted-foreground/70">MCA Filings · Board Governance · Share Capital · Statutory Registers</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV([
              ...(calendarQuery.data ?? []).map((i: any) => ({ Type: "Compliance", Item: i.title ?? i.activityType ?? "", Due_Date: i.dueDate ? new Date(i.dueDate).toLocaleDateString("en-IN") : "", Status: i.status ?? "", SRN: i.srnNumber ?? "" })),
              ...(directorsQuery.data ?? []).map((d: any) => ({ Type: "Director", Item: d.name ?? "", DIN: d.din ?? "", KYC_Status: d.kycStatus ?? "", Appointment_Date: d.appointmentDate ? new Date(d.appointmentDate).toLocaleDateString("en-IN") : "" })),
            ], "secretarial_audit_report")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Secretarial Audit Report
          </button>
          <PermissionGate module={"secretarial" as any} action="write">
            <button
              onClick={() => kycReminderMutation.mutate(undefined)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            >
              <RefreshCw className={`w-3 h-3 ${kycReminderMutation.isPending ? "animate-spin" : ""}`} />
              Check DIR-3 KYC
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPIs — live */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Overdue Filings",     value: calendarQuery.isLoading ? "…" : String(overdueFilings),  color: overdueFilings > 0 ? "text-red-600" : "text-green-700" },
          { label: "Pending Filings",     value: calendarQuery.isLoading ? "…" : String(pendingFilings),  color: pendingFilings > 0 ? "text-orange-600" : "text-muted-foreground" },
          { label: "Board Meetings (FY)", value: "—", color: "text-muted-foreground/50" },
          { label: "Directors on Record", value: directorsQuery.isLoading ? "…" : String(directorsCount), color: directorsCount > 0 ? "text-foreground/80" : "text-muted-foreground/50" },
          { label: "Days to AGM",         value: String(daysToAGM),                                       color: daysToAGM <= 30 ? "text-red-600" : daysToAGM <= 90 ? "text-orange-600" : "text-foreground/80" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Overdue alert */}
      {overdueFilings > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span><strong>{overdueFilings} filing(s) overdue.</strong> Penalties accruing — file immediately to stop further charges.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => router.push(`/app/secretarial?tab=${t.key}`)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            {/* Company particulars — static company master */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Company Particulars</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "Company Name",     value: "NexusOps Technologies Private Limited" },
                  { label: "CIN",              value: "U72900MH2021PTC362841" },
                  { label: "ROC",              value: "RoC Mumbai" },
                  { label: "Incorporation",    value: "01 April 2021" },
                  { label: "Type",             value: "Private Limited — Company limited by shares" },
                  { label: "FY",               value: "April to March" },
                  { label: "AGM Due",          value: "30 September " + new Date().getFullYear() },
                  { label: "Registered Office",value: "A-402, Bandra Kurla Complex, Mumbai — 400051" },
                ].map(f => (
                  <div key={f.label} className="flex justify-between text-[12px] border-b border-border/30 pb-1 last:border-0">
                    <span className="text-muted-foreground/70">{f.label}</span>
                    <span className="text-foreground/80 font-medium text-right max-w-[60%]">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent compliance items */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Upcoming Compliance Deadlines</span>
              </div>
              {calendarQuery.isLoading ? (
                <div className="p-4 animate-pulse space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-3.5 bg-muted rounded w-32" />
                      <div className="h-3.5 bg-muted rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : calendarItems.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-muted-foreground/50">
                  No compliance items — use the Compliance Calendar tab to add MCA deadlines
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {calendarItems
                    .filter((i: any) => i.status !== "filed" && i.status !== "not_applicable")
                    .slice(0, 6)
                    .map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <span className="text-[12px] font-medium text-foreground/80">{item.eventName}</span>
                          {item.mcaForm && <span className="ml-2 text-[10px] font-mono text-primary">{item.mcaForm}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{new Date(item.dueDate).toLocaleDateString("en-IN")}</span>
                          <span className={`status-badge text-[10px] ${STATUS_COLOR[item.status] ?? "text-muted-foreground bg-muted"}`}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOARD & DIRECTORS */}
        {activeTab === "board" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <p className="text-[12px] font-semibold text-foreground/80">Directors Register</p>
              <PermissionGate module={"secretarial" as any} action="write">
                <button
                  onClick={() => kycReminderMutation.mutate(undefined)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-card text-muted-foreground"
                >
                  <RefreshCw className="w-3 h-3" /> Trigger KYC Reminders
                </button>
              </PermissionGate>
            </div>

            {kycReminderMutation.data && (
              <div className={`mx-4 mt-3 px-3 py-2 rounded text-[11px] ${kycReminderMutation.data.isUrgent ? "bg-red-50 border border-red-200 text-red-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
                {kycReminderMutation.data.message}
              </div>
            )}

            {directorsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded" />
                ))}
              </div>
            ) : directors.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No directors on record</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">Add directors to populate the register and enable DIR-3 KYC tracking</p>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>DIN</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Nationality</th>
                    <th>Appointed</th>
                    <th>KYC Status</th>
                    <th>KYC Last Done</th>
                  </tr>
                </thead>
                <tbody>
                  {directors.map((d: any) => (
                    <tr key={d.id}>
                      <td className="font-mono text-[11px] text-primary">{d.din}</td>
                      <td className="font-semibold text-foreground/80">{d.fullName}</td>
                      <td className="capitalize text-muted-foreground">{d.directorType?.replace(/_/g, " ")}</td>
                      <td className="text-muted-foreground">{d.nationality}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">
                        {d.dateOfAppointment ? new Date(d.dateOfAppointment).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td>
                        <span className={`status-badge ${DIN_KYC_COLOR[d.dinKycStatus] ?? "text-muted-foreground bg-muted"}`}>
                          {d.dinKycStatus === "active" ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="text-[11px] text-muted-foreground">
                        {d.dinKycLastCompleted ? new Date(d.dinKycLastCompleted).toLocaleDateString("en-IN") : <span className="text-orange-600">Not filed</span>}
                      </td>
                      <td>
                        {d.dinKycStatus !== "active" || !d.dinKycLastCompleted || new Date(d.dinKycLastCompleted).getFullYear() < new Date().getFullYear() ? (
                          <PermissionGate module={"secretarial" as any} action="write">
                            <button
                              disabled={markKycMutation.isPending}
                              onClick={() => markKycMutation.mutate({ directorId: d.id })}
                              className="px-2 py-1 text-[11px] bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium disabled:opacity-50"
                            >
                              {markKycMutation.isPending ? "…" : "Mark KYC Done"}
                            </button>
                          </PermissionGate>
                        ) : (
                          <span className="text-[11px] text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> KYC current</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* MCA / ROC FILINGS */}
        {activeTab === "filings" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <p className="text-[12px] font-semibold text-foreground/80">Statutory Filings — MCA / ROC</p>
              <div className="flex items-center gap-2">
                <a
                  href="https://www.mca.gov.in/content/mca/global/en/mca/fo-llp-filing/company-efiling.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> MCA Portal
                </a>
              </div>
            </div>

            {calendarQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : calendarItems.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No MCA filings tracked yet</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">Add compliance calendar items via the Compliance Calendar tab or the API</p>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Event</th>
                    <th>Form</th>
                    <th>FY</th>
                    <th>Type</th>
                    <th>Due Date</th>
                    <th>Filed Date</th>
                    <th>SRN</th>
                    <th>Penalty Accrued</th>
                    <th>Status</th>
                    <th className="w-28">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {calendarItems
                    .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map((item: any) => (
                      <React.Fragment key={item.id}>
                        <tr key={item.id}>
                          <td className="p-0">
                            <div className={`priority-bar ${item.status === "filed" ? "bg-green-500" : item.status === "overdue" ? "bg-red-500" : item.status === "due_soon" ? "bg-yellow-500" : "bg-blue-400"}`} />
                          </td>
                          <td className="text-foreground/80 font-medium">{item.eventName}</td>
                          <td className="font-mono text-[11px] text-primary">{item.mcaForm ?? "—"}</td>
                          <td className="text-muted-foreground">{item.financialYear ?? "—"}</td>
                          <td className="capitalize text-muted-foreground text-[11px]">{item.complianceType}</td>
                          <td className="font-mono text-[11px]">{new Date(item.dueDate).toLocaleDateString("en-IN")}</td>
                          <td className="font-mono text-[11px] text-muted-foreground">{item.filedDate ? new Date(item.filedDate).toLocaleDateString("en-IN") : "—"}</td>
                          <td className="font-mono text-[11px] text-muted-foreground">{item.srn ?? "—"}</td>
                          <td className={`font-mono text-[11px] ${Number(item.totalPenaltyInr) > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                            {Number(item.totalPenaltyInr) > 0 ? `₹${Number(item.totalPenaltyInr).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td>
                            <span className={`status-badge ${STATUS_COLOR[item.status] ?? "text-muted-foreground bg-muted"}`}>
                              {STATUS_LABEL[item.status] ?? item.status}
                            </span>
                          </td>
                          <td>
                            {item.status !== "filed" && item.status !== "not_applicable" && (
                              <PermissionGate module={"secretarial" as any} action="write">
                                <button
                                  onClick={() => { setFilingPanel(filingPanel === item.id ? null : item.id); setFilingSRN(""); }}
                                  className="px-2 py-1 text-[11px] bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium"
                                >
                                  {filingPanel === item.id ? "Cancel" : "Mark Filed"}
                                </button>
                              </PermissionGate>
                            )}
                            {item.status === "filed" && (
                              <span className="text-[11px] text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Filed</span>
                            )}
                          </td>
                        </tr>
                        {filingPanel === item.id && (
                          <tr key={`${item.id}-panel`}>
                            <td colSpan={11} className="bg-green-50/60 px-4 py-3 border-b border-green-200">
                              <div className="flex items-end gap-3">
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">SRN / Challan No. (optional)</label>
                                  <input
                                    className="border border-border rounded px-2 py-1 text-[12px] w-48"
                                    placeholder="e.g. A12345678"
                                    value={filingSRN}
                                    onChange={e => setFilingSRN(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Filed Date</label>
                                  <input
                                    type="date"
                                    defaultValue={new Date().toISOString().split("T")[0]}
                                    id={`filed-date-${item.id}`}
                                    className="border border-border rounded px-2 py-1 text-[12px]"
                                  />
                                </div>
                                <button
                                  disabled={markFiledMutation.isPending}
                                  onClick={() => {
                                    const dateInput = document.getElementById(`filed-date-${item.id}`) as HTMLInputElement;
                                    markFiledMutation.mutate({ id: item.id, filedDate: new Date(dateInput?.value ?? new Date()), srn: filingSRN || undefined });
                                  }}
                                  className="px-3 py-1.5 bg-green-600 text-white text-[11px] rounded hover:bg-green-700 font-medium disabled:opacity-50"
                                >
                                  {markFiledMutation.isPending ? "Saving…" : "Confirm Filing"}
                                </button>
                                {markFiledMutation.isError && (
                                  <span className="text-[11px] text-red-600">{(markFiledMutation.error as any)?.message}</span>
                                )}
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
        )}

        {/* SHARE CAPITAL */}
        {activeTab === "share" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Capital Structure</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "Authorised Capital",   value: "₹5,00,00,000" },
                  { label: "Paid-up Capital",       value: "₹2,50,00,000" },
                  { label: "Face Value per Share",  value: "₹10" },
                  { label: "Total Shares",          value: "25,00,000" },
                  { label: "Class of Shares",       value: "Equity" },
                  { label: "Folio Series",          value: "NXO/2021-" },
                ].map(f => (
                  <div key={f.label} className="flex justify-between text-[12px] border-b border-border/30 pb-1 last:border-0">
                    <span className="text-muted-foreground/70">{f.label}</span>
                    <span className="font-semibold text-foreground/80">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-3">Note</p>
              <p className="text-[12px] text-muted-foreground/70">Shareholder register (MGT-1), allotment details (PAS-3), and ESOP pool data are tracked in the Statutory Registers tab. Detailed cap table integration requires connecting a share register system.</p>
            </div>
          </div>
        )}

        {/* STATUTORY REGISTERS */}
        {activeTab === "registers" && (
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { title: "Register of Members (MGT-1)", desc: "Complete record of shareholders — name, folio, shares held, transfers", status: "Maintained offline" },
                { title: "Register of Directors (MBP-1)", desc: "DIN, address, other directorships, shareholding in company", status: directors.length > 0 ? `${directors.length} director(s) on record` : "Maintained offline" },
                { title: "Register of Charges (CHG-1)", desc: "Mortgages, hypothecations, floating charges — registered with ROC", status: "Maintained offline" },
                { title: "Register of KMP (MBP-2)", desc: "Key Managerial Personnel — MD, CS, CFO disclosures", status: "Maintained offline" },
                { title: "Register of Contracts (MBP-4)", desc: "Related party transactions — board approval, disclosure", status: "Maintained offline" },
                { title: "Minutes Books", desc: "Board meeting minutes, AGM/EGM minutes, committee resolutions", status: "Maintained offline" },
              ].map(r => (
                <div key={r.title} className="border border-border rounded p-3">
                  <p className="text-[12px] font-semibold text-foreground/80 mb-1">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground/70 mb-2">{r.desc}</p>
                  <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMPLIANCE CALENDAR */}
        {activeTab === "calendar" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">MCA filing deadlines, GST returns, and statutory obligations for FY 2025-26.</p>
              <PermissionGate module={"secretarial" as any} action="write">
                <button
                  onClick={() => setShowCreateForm(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90"
                >
                  <Plus className="w-3 h-3" /> {showCreateForm ? "Cancel" : "Add Item"}
                </button>
              </PermissionGate>
            </div>

            {showCreateForm && (
              <div className="border border-border rounded bg-muted/20 p-4 space-y-3">
                <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">New Compliance Item</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">Event Name *</label>
                    <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" placeholder="e.g. GSTR-1 April 2026" value={createForm.eventName} onChange={e => setCreateForm(f => ({ ...f, eventName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">MCA Form / Filing Ref</label>
                    <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" placeholder="GSTR-1, MGT-7, AOC-4…" value={createForm.mcaForm} onChange={e => setCreateForm(f => ({ ...f, mcaForm: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">Due Date *</label>
                    <input type="date" className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={createForm.dueDate} onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">Type</label>
                    <select className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={createForm.complianceType} onChange={e => setCreateForm(f => ({ ...f, complianceType: e.target.value as any }))}>
                      <option value="annual">Annual</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="event_based">Event Based</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">Financial Year</label>
                    <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" placeholder="2025-26" value={createForm.financialYear} onChange={e => setCreateForm(f => ({ ...f, financialYear: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">Penalty per Day (₹)</label>
                    <input type="number" className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={createForm.penaltyPerDayInr} onChange={e => setCreateForm(f => ({ ...f, penaltyPerDayInr: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={createCalendarMutation.isPending || !createForm.eventName || !createForm.dueDate}
                    onClick={() => createCalendarMutation.mutate({ ...createForm, dueDate: new Date(createForm.dueDate) })}
                    className="px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createCalendarMutation.isPending ? "Saving…" : "Create Item"}
                  </button>
                  {createCalendarMutation.isError && <span className="text-[11px] text-red-600">{(createCalendarMutation.error as any)?.message}</span>}
                </div>
              </div>
            )}

            {calendarQuery.isLoading ? (
              <div className="animate-pulse space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : calendarItems.length === 0 ? (
              <div className="py-8 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No compliance calendar items yet</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  Use <code className="bg-muted px-1 rounded">POST /trpc/indiaCompliance.calendar.create</code> to seed annual/event-based filings
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {["overdue", "due_soon", "upcoming", "filed", "not_applicable"].map(statusGroup => {
                  const items = calendarItems.filter((i: any) => i.status === statusGroup);
                  if (items.length === 0) return null;
                  return (
                    <div key={statusGroup}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1 py-1.5">
                        {statusGroup === "due_soon" ? "Due Soon" : statusGroup.charAt(0).toUpperCase() + statusGroup.slice(1)} ({items.length})
                      </p>
                      <div className="border border-border rounded overflow-hidden">
                        {items.map((item: any, idx: number) => (
                          <React.Fragment key={item.id}>
                          <div className={`flex items-center gap-3 px-4 py-2 text-[12px] ${idx < items.length - 1 ? "border-b border-border/40" : ""}`}>
                            <span className={`status-badge text-[10px] ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                            <span className="font-medium text-foreground/80 flex-1">{item.eventName}</span>
                            {item.mcaForm && <span className="font-mono text-[11px] text-primary">{item.mcaForm}</span>}
                            <span className="text-muted-foreground text-[11px]">{new Date(item.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            {item.status === "overdue" && Number(item.totalPenaltyInr) > 0 && (
                              <span className="text-red-600 text-[11px] font-semibold">₹{Number(item.totalPenaltyInr).toLocaleString("en-IN")} penalty</span>
                            )}
                            {item.srn && <span className="text-muted-foreground/60 text-[10px]">SRN: {item.srn}</span>}
                            {item.status !== "filed" && item.status !== "not_applicable" && (
                              <PermissionGate module={"secretarial" as any} action="write">
                                <button
                                  onClick={() => { setFilingPanel(filingPanel === item.id ? null : item.id); setFilingSRN(""); }}
                                  className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium ml-2"
                                >
                                  {filingPanel === item.id ? "Cancel" : "Mark Filed"}
                                </button>
                              </PermissionGate>
                            )}
                          </div>
                          {filingPanel === item.id && (
                            <div className="flex items-end gap-3 px-4 py-2 bg-green-50 border-b border-green-200">
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">SRN / Reference No.</label>
                                <input className="border border-border rounded px-2 py-1 text-[12px] w-44" placeholder="Optional" value={filingSRN} onChange={e => setFilingSRN(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Filed Date</label>
                                <input type="date" id={`cal-filed-${item.id}`} defaultValue={new Date().toISOString().split("T")[0]} className="border border-border rounded px-2 py-1 text-[12px]" />
                              </div>
                              <button
                                disabled={markFiledMutation.isPending}
                                onClick={() => {
                                  const d = document.getElementById(`cal-filed-${item.id}`) as HTMLInputElement;
                                  markFiledMutation.mutate({ id: item.id, filedDate: new Date(d?.value ?? new Date()), srn: filingSRN || undefined });
                                }}
                                className="px-3 py-1.5 bg-green-600 text-white text-[11px] rounded hover:bg-green-700 font-medium disabled:opacity-50"
                              >
                                {markFiledMutation.isPending ? "Saving…" : "Confirm"}
                              </button>
                            </div>
                          )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function SecretarialPage() {
  return (
    <Suspense fallback={null}>
      <SecretarialContent />
    </Suspense>
  );
}
