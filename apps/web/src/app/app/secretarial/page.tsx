"use client";

export const dynamic = "force-dynamic";

import React, { useState, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Briefcase, Download, Plus, AlertTriangle, CheckCircle2, Clock,
  FileText, Users, Building2, Scale, Calendar, BookOpen, Shield,
  RefreshCw, X, ChevronDown, Award,
} from "lucide-react";
import { downloadCSV } from "@/lib/utils";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { EsignPanel } from "@/components/esign/EsignPanel";

// ── Shared style maps ─────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  filed:          "text-green-700 bg-green-100 border-green-200",
  pending:        "text-orange-700 bg-orange-100 border-orange-200",
  overdue:        "text-red-700 bg-red-100 border-red-200",
  upcoming:       "text-blue-700 bg-blue-100 border-blue-200",
  in_progress:    "text-indigo-700 bg-indigo-100 border-indigo-200",
  not_applicable: "text-muted-foreground bg-muted",
  scheduled:      "text-blue-700 bg-blue-100 border-blue-200",
  completed:      "text-green-700 bg-green-100 border-green-200",
  cancelled:      "text-red-700 bg-red-100 border-red-200",
  draft:          "text-slate-600 bg-slate-100",
  passed:         "text-green-700 bg-green-100",
  rejected:       "text-red-700 bg-red-100",
};

const TABS = [
  { key: "overview",   label: "Overview",           icon: Building2 },
  { key: "board",      label: "Board & Directors",  icon: Users },
  { key: "filings",    label: "MCA / ROC Filings",  icon: FileText },
  { key: "share",      label: "Share Capital",      icon: Scale },
  { key: "esop",       label: "ESOP",               icon: Award },
  { key: "calendar",   label: "Compliance Calendar", icon: Calendar },
] as const;

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

function normalizeSecretarialTab(raw: string | null): (typeof TABS)[number]["key"] {
  if (raw && TAB_KEYS.has(raw)) return raw as (typeof TABS)[number]["key"];
  return "overview";
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: overview } = trpc.secretarial.overview.useQuery(undefined, mergeTrpcQueryOpts("secretarial.overview", undefined));
  const { data: upcomingFilings = [] } = trpc.secretarial.filings.upcomingAlerts.useQuery(undefined, mergeTrpcQueryOpts("secretarial.filings.upcomingAlerts", undefined));

  const kpis = [
    { label: "Upcoming Meetings",    value: overview?.upcomingMeetings ?? 0,   icon: Calendar,      color: "text-blue-600 bg-blue-50" },
    { label: "Pending Resolutions",  value: overview?.pendingResolutions ?? 0, icon: FileText,      color: "text-amber-600 bg-amber-50" },
    { label: "Overdue Filings",      value: overview?.overdueFilings ?? 0,     icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "Due in 30 Days",       value: overview?.upcomingFilings ?? 0,    icon: Clock,         color: "text-orange-600 bg-orange-50" },
    { label: "Active Directors",     value: overview?.totalDirectors ?? 0,     icon: Users,         color: "text-green-600 bg-green-50" },
    { label: "KYC Expiring Soon",    value: overview?.kycExpiring ?? 0,        icon: Shield,        color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-2 rounded-xl w-fit mb-3 ${k.color}`}><k.icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {upcomingFilings.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-orange-600">
            <AlertTriangle className="w-4 h-4" /> Upcoming Compliance Deadlines (Next 30 Days)
          </h3>
          <div className="space-y-2">
            {upcomingFilings.map((f: { id: string; title: string; formNumber: string; authority: string; dueDate: string | Date; status: string }) => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.formNumber} · {f.authority}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-orange-700">{new Date(f.dueDate).toLocaleDateString()}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[f.status]}`}>{f.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Quick Reference</h3>
          <div className="space-y-2 text-sm">
            {[
              ["Annual General Meeting", "Within 6 months of FY end"],
              ["Board Meeting", "Min 4 per year, max 120 days gap"],
              ["Annual Return (MGT-7)", "Nov 29 (60 days from AGM)"],
              ["Financial Statements (AOC-4)", "Oct 29 (30 days from AGM)"],
              ["Director KYC (DIR-3 KYC)", "Sep 30 every year"],
              ["DPT-3 (Deposits Return)", "Jun 30 every year"],
            ].map(([item, note]) => (
              <div key={item} className="flex justify-between p-2 hover:bg-muted/50 rounded-lg">
                <span className="font-medium">{item}</span>
                <span className="text-muted-foreground text-xs">{note}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Key Contacts & Authorities</h3>
          <div className="space-y-3">
            {[
              { authority: "MCA (Ministry of Corporate Affairs)", portal: "mca.gov.in", desc: "ROC filings, annual return, DIN" },
              { authority: "SEBI", portal: "sebi.gov.in", desc: "Capital markets, listed entity compliance" },
              { authority: "BSE / NSE", portal: "nseindia.com", desc: "Listing compliance, XBRL" },
              { authority: "Income Tax Dept", portal: "incometax.gov.in", desc: "TDS, ITR, Form 15CA/CB" },
            ].map(a => (
              <div key={a.authority} className="p-3 bg-muted/30 border border-border rounded-lg">
                <p className="text-sm font-medium">{a.authority}</p>
                <p className="text-xs text-muted-foreground">{a.desc} · <span className="text-primary">{a.portal}</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Board & Directors Tab ──────────────────────────────────────────────────────

function BoardTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: meetings = [], refetch: refetchMeetings } = trpc.secretarial.meetings.list.useQuery({}, mergeTrpcQueryOpts("secretarial.meetings.list", undefined));
  const { data: directors = [], refetch: refetchDirectors } = trpc.secretarial.directors.list.useQuery({ activeOnly: true }, mergeTrpcQueryOpts("secretarial.directors.list", undefined));
  const { data: resolutions = [] } = trpc.secretarial.resolutions.list.useQuery({}, mergeTrpcQueryOpts("secretarial.resolutions.list", undefined));
  const updateKyc = trpc.secretarial.directors.updateKyc.useMutation({
    onSuccess: () => { toast.success("KYC status updated"); refetchDirectors(); },
    onError: e => toast.error(e.message),
  });
  const updateMtgStatus = trpc.secretarial.meetings.updateStatus.useMutation({
    onSuccess: () => { toast.success("Meeting updated"); refetchMeetings(); },
    onError: e => toast.error(e.message),
  });
  const passResolution = trpc.secretarial.resolutions.pass.useMutation({
    onSuccess: () => { toast.success("Resolution passed"); },
    onError: e => toast.error(e.message),
  });
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [esignFor, setEsignFor] = useState<{ id: string; title: string } | null>(null);
  const [mtgForm, setMtgForm] = useState({ type: "board" as const, title: "", scheduledAt: "", duration: 120, venue: "", videoLink: "" });
  const createMeeting = trpc.secretarial.meetings.create.useMutation({
    onSuccess: () => { toast.success("Meeting scheduled"); refetchMeetings(); setShowNewMeeting(false); },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Board Meetings */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Board Meetings</h3>
          <PermissionGate module="secretarial" action="write">
            <button onClick={() => setShowNewMeeting(true)} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Schedule Meeting
            </button>
          </PermissionGate>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Number","Title","Type","Date","Duration","Status","Quorum","Actions"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {meetings.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No board meetings yet</td></tr>}
            {meetings.map((m: { id: string; number: string; title: string; type?: string; scheduledAt: string | Date; duration: number; status?: string; quorumMet?: boolean | null }) => (
              <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{m.number}</td>
                <td className="px-4 py-3 font-medium">{m.title}</td>
                <td className="px-4 py-3 text-xs capitalize">{m.type?.replace("_"," ")}</td>
                <td className="px-4 py-3 text-xs">{new Date(m.scheduledAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{m.duration}min</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[m.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(m.status ?? "—").replace("_", " ")}</span></td>
                <td className="px-4 py-3 text-xs">{m.quorumMet == null ? "—" : m.quorumMet ? "✓ Met" : "✗ Not met"}</td>
                <td className="px-4 py-3">
                  {m.status === "scheduled" && (
                    <button onClick={() => updateMtgStatus.mutate({ id: m.id, status: "completed", quorumMet: true })} className="text-xs text-green-600 hover:underline">Mark Done</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Directors */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Board of Directors</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Name","DIN","Designation","Category","Pan","Appointed","KYC Status","Actions"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {directors.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No directors found</td></tr>}
            {directors.map((d: { id: string; name: string; din: string; designation: string; category?: string; pan?: string | null; appointedAt?: string | Date | null; kyc?: string | null }) => (
              <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{d.din}</td>
                <td className="px-4 py-3 text-xs">{d.designation}</td>
                <td className="px-4 py-3 text-xs capitalize">{d.category?.replace("_"," ")}</td>
                <td className="px-4 py-3 text-xs font-mono">{d.pan ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{d.appointedAt ? new Date(d.appointedAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.kyc === "filed" ? "text-green-700 bg-green-100" : d.kyc === "expired" ? "text-red-700 bg-red-100" : "text-amber-700 bg-amber-100"}`}>
                    {d.kyc ?? "pending"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PermissionGate module="secretarial" action="write">
                    <button onClick={() => updateKyc.mutate({ id: d.id, kyc: d.kyc === "filed" ? "pending" : "filed" })} className="text-xs text-primary hover:underline">
                      {d.kyc === "filed" ? "Mark Pending" : "Mark Filed"}
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resolutions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Board Resolutions</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Number","Title","Type","Status","Passed","For","Against","Abstain","Actions"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {resolutions.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No resolutions yet</td></tr>}
            {resolutions.map((r: { id: string; number: string; title: string; type: string; status?: string; passedAt?: string | Date | null; votesFor?: number; votesAgainst?: number; abstentions?: number }) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{r.number}</td>
                <td className="px-4 py-3 font-medium max-w-[200px] truncate">{r.title}</td>
                <td className="px-4 py-3 text-xs capitalize">{r.type}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(r.status ?? "—").replace("_", " ")}</span></td>
                <td className="px-4 py-3 text-xs">{r.passedAt ? new Date(r.passedAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-xs text-green-600">{r.votesFor ?? 0}</td>
                <td className="px-4 py-3 text-xs text-red-600">{r.votesAgainst ?? 0}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.abstentions ?? 0}</td>
                <td className="px-4 py-3 text-xs">
                  <button
                    onClick={() => setEsignFor({ id: r.id, title: `Resolution ${r.number} — ${r.title}` })}
                    className="text-blue-700 hover:underline font-medium"
                  >
                    E-sign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* E-sign Modal */}
      {esignFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setEsignFor(null)}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">E-sign resolution</h2>
                <p className="text-xs text-muted-foreground">{esignFor.title}</p>
              </div>
              <button onClick={() => setEsignFor(null)} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <EsignPanel
                sourceType="resolution"
                sourceId={esignFor.id}
                defaultTitle={esignFor.title}
                subject="Board / Committee resolution"
                defaultSigners={directors
                  .filter((d: any) => d.email)
                  .map((d: any) => ({ name: d.name, email: d.email, role: "director" }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* New Meeting Modal */}
      {showNewMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">Schedule Board Meeting</h2>
              <button onClick={() => setShowNewMeeting(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Type</label>
                <select value={mtgForm.type} onChange={e => setMtgForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  {["board","audit_committee","nomination_committee","compensation_committee","agm","egm","creditors"].map(t => <option key={t} value={t}>{t.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input value={mtgForm.title} onChange={e => setMtgForm(p => ({ ...p, title: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Q3 Board Meeting" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date & Time *</label>
                <input type="datetime-local" value={mtgForm.scheduledAt} onChange={e => setMtgForm(p => ({ ...p, scheduledAt: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (min)</label>
                  <input type="number" value={mtgForm.duration} onChange={e => setMtgForm(p => ({ ...p, duration: +e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Venue</label>
                  <input value={mtgForm.venue} onChange={e => setMtgForm(p => ({ ...p, venue: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Board Room / Virtual" />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowNewMeeting(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button
                disabled={!mtgForm.title || !mtgForm.scheduledAt || createMeeting.isPending}
                onClick={() => createMeeting.mutate({ ...mtgForm, scheduledAt: mtgForm.scheduledAt })}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >{createMeeting.isPending ? "Scheduling..." : "Schedule"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MCA Filings Tab ────────────────────────────────────────────────────────────

function FilingsTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: filings = [], refetch } = trpc.secretarial.filings.list.useQuery({}, mergeTrpcQueryOpts("secretarial.filings.list", undefined));
  const [statusFilter, setStatusFilter] = useState("");
  const markFiled = trpc.secretarial.filings.markFiled.useMutation({
    onSuccess: () => { toast.success("Filing marked as filed"); refetch(); },
    onError: e => toast.error(e.message),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ formNumber: "", title: "", authority: "MCA", category: "annual_return", dueDate: "", fy: "", fees: "", notes: "" });
  const createFiling = trpc.secretarial.filings.create.useMutation({
    onSuccess: () => { toast.success("Filing created"); refetch(); setShowCreate(false); },
    onError: e => toast.error(e.message),
  });

  const filtered = statusFilter ? filings.filter((f: { status: string }) => f.status === statusFilter) : filings;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">All Status</option>
          {["upcoming","in_progress","filed","overdue","not_applicable"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <PermissionGate module="secretarial" action="write">
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Add Filing
          </button>
        </PermissionGate>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Form","Title","Authority","Category","FY","Due Date","Status","SRN","Actions"].map(h => (
              <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No filings found</td></tr>}
            {filtered.map((f: { id: string; formNumber: string; title: string; authority: string; category?: string; fy?: string | null; dueDate?: string | Date | null; status?: string; srn?: string | null }) => (
              <tr key={f.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-3 font-mono text-xs font-semibold">{f.formNumber}</td>
                <td className="px-3 py-3 font-medium max-w-[160px] truncate">{f.title}</td>
                <td className="px-3 py-3 text-xs">{f.authority}</td>
                <td className="px-3 py-3 text-xs capitalize">{f.category?.replace("_"," ")}</td>
                <td className="px-3 py-3 text-xs">{f.fy ?? "—"}</td>
                <td className="px-3 py-3 text-xs">{f.dueDate ? new Date(f.dueDate).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[f.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(f.status ?? "—").replace("_", " ")}</span></td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{f.srn ?? "—"}</td>
                <td className="px-3 py-3">
                  {f.status !== "filed" && (
                    <PermissionGate module="secretarial" action="write">
                      <button onClick={() => markFiled.mutate({ id: f.id })} className="text-xs text-primary hover:underline font-medium">Mark Filed</button>
                    </PermissionGate>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">Add Compliance Filing</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Form Number *</label><input value={form.formNumber} onChange={e => setForm(p => ({...p, formNumber: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="MGT-7" /></div>
              <div><label className="block text-sm font-medium mb-1">Authority</label><input value={form.authority} onChange={e => setForm(p => ({...p, authority: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Title *</label><input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Category</label><input value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Financial Year</label><input value={form.fy} onChange={e => setForm(p => ({...p, fy: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="2024-25" /></div>
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p, dueDate: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Filing Fees (₹)</label><input type="number" value={form.fees} onChange={e => setForm(p => ({...p, fees: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button disabled={!form.formNumber || !form.title || !form.dueDate || createFiling.isPending} onClick={() => createFiling.mutate({...form, fees: form.fees ? +form.fees : undefined, dueDate: form.dueDate, fy: form.fy || undefined})} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{createFiling.isPending ? "Creating..." : "Create Filing"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Share Capital Tab ──────────────────────────────────────────────────────────

function ShareCapitalTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: shares = [], refetch } = trpc.secretarial.shares.list.useQuery({}, mergeTrpcQueryOpts("secretarial.shares.list", undefined));
  const { data: summary = [] } = trpc.secretarial.shares.summary.useQuery(undefined, mergeTrpcQueryOpts("secretarial.shares.summary", undefined));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ holderName: "", holderType: "individual", shareClass: "equity" as const, nominalValue: 10, quantity: 1, pan: "", address: "" });
  const createShare = trpc.secretarial.shares.create.useMutation({
    onSuccess: () => { toast.success("Shareholder added"); refetch(); setShowAdd(false); },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summary.map((s: { shareClass?: string; totalQty?: unknown; holders: number }) => (
          <div key={s.shareClass} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.shareClass?.replace("_"," ")} Shares</p>
            <p className="text-2xl font-bold">{Number(s.totalQty ?? 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{s.holders} holders</p>
          </div>
        ))}
        {summary.length === 0 && <p className="text-sm text-muted-foreground col-span-4">No share capital records</p>}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Shareholder Register</h3>
          <PermissionGate module="secretarial" action="write">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> Add Shareholder
            </button>
          </PermissionGate>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Folio","Holder Name","Type","Class","Nominal Value","Quantity","Paid Up","PAN"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {shares.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No shareholders registered</td></tr>}
            {shares.map((s: { id: string; folio: string; holderName: string; holderType: string; shareClass?: string; nominalValue: number; quantity?: number; paidUpValue?: number | null; pan?: string | null }) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{s.folio}</td>
                <td className="px-4 py-3 font-medium">{s.holderName}</td>
                <td className="px-4 py-3 text-xs capitalize">{s.holderType}</td>
                <td className="px-4 py-3 text-xs capitalize">{s.shareClass?.replace("_"," ")}</td>
                <td className="px-4 py-3 text-xs">₹{s.nominalValue}</td>
                <td className="px-4 py-3 font-medium">{s.quantity?.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">{s.paidUpValue != null ? `₹${s.paidUpValue.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.pan ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">Add Shareholder</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Holder Name *</label><input value={form.holderName} onChange={e => setForm(p => ({...p, holderName: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Holder Type</label><select value={form.holderType} onChange={e => setForm(p => ({...p, holderType: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">{["individual","institution","promoter","trust"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Share Class</label><select value={form.shareClass} onChange={e => setForm(p => ({...p, shareClass: e.target.value as any}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">{["equity","preference","esop_pool","convertible"].map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Nominal Value (₹)</label><input type="number" value={form.nominalValue} onChange={e => setForm(p => ({...p, nominalValue: +e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Quantity *</label><input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({...p, quantity: +e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">PAN</label><input value={form.pan} onChange={e => setForm(p => ({...p, pan: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Address</label><input value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button disabled={!form.holderName || createShare.isPending} onClick={() => createShare.mutate(form)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{createShare.isPending ? "Adding..." : "Add"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ESOP Tab ───────────────────────────────────────────────────────────────────

function EsopTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: grants = [], refetch } = trpc.secretarial.esop.list.useQuery({}, mergeTrpcQueryOpts("secretarial.esop.list", undefined));
  const { data: summary = [] } = trpc.secretarial.esop.summary.useQuery(undefined, mergeTrpcQueryOpts("secretarial.esop.summary", undefined));
  const [showGrant, setShowGrant] = useState(false);
  const [form, setForm] = useState({ employeeName: "", options: 100, exercisePrice: 1000, grantDate: "", vestingStart: "", vestingEnd: "", notes: "" });
  const grantEsop = trpc.secretarial.esop.grant.useMutation({
    onSuccess: () => { toast.success("ESOP grant created"); refetch(); setShowGrant(false); },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summary.map((s: { event: string; totalOptions?: unknown; count: number }) => (
          <div key={s.event} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.event}ed Options</p>
            <p className="text-2xl font-bold">{Number(s.totalOptions ?? 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{s.count} grants</p>
          </div>
        ))}
        {summary.length === 0 && <p className="text-sm text-muted-foreground col-span-4">No ESOP data</p>}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">ESOP Grants Register</h3>
          <PermissionGate module="secretarial" action="write">
            <button onClick={() => setShowGrant(true)} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> New Grant
            </button>
          </PermissionGate>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Grant #","Employee","Options","Exercise Price","Grant Date","Vesting Start","Vesting End","Event"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {grants.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No ESOP grants yet</td></tr>}
            {grants.map((g: { id: string; grantNumber: string; employeeName: string; options: number; exercisePrice: number; grantDate: string | Date; vestingStart?: string | Date | null; vestingEnd?: string | Date | null; event: string }) => (
              <tr key={g.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{g.grantNumber}</td>
                <td className="px-4 py-3 font-medium">{g.employeeName}</td>
                <td className="px-4 py-3 font-semibold">{g.options.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">₹{(g.exercisePrice / 100).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">{new Date(g.grantDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs">{g.vestingStart ? new Date(g.vestingStart).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-xs">{g.vestingEnd ? new Date(g.vestingEnd).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-xs capitalize font-medium text-indigo-600">{g.event}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showGrant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">New ESOP Grant</h2>
              <button onClick={() => setShowGrant(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Employee Name *</label><input value={form.employeeName} onChange={e => setForm(p => ({...p, employeeName: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Options *</label><input type="number" min={1} value={form.options} onChange={e => setForm(p => ({...p, options: +e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Exercise Price (paise) *</label><input type="number" min={0} value={form.exercisePrice} onChange={e => setForm(p => ({...p, exercisePrice: +e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="100000 = ₹1000" /></div>
              <div><label className="block text-sm font-medium mb-1">Grant Date *</label><input type="date" value={form.grantDate} onChange={e => setForm(p => ({...p, grantDate: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Vesting Start</label><input type="date" value={form.vestingStart} onChange={e => setForm(p => ({...p, vestingStart: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Vesting End</label><input type="date" value={form.vestingEnd} onChange={e => setForm(p => ({...p, vestingEnd: e.target.value}))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowGrant(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button disabled={!form.employeeName || !form.grantDate || grantEsop.isPending} onClick={() => grantEsop.mutate({ ...form, vestingStart: form.vestingStart || undefined, vestingEnd: form.vestingEnd || undefined })} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{grantEsop.isPending ? "Creating..." : "Create Grant"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compliance Calendar Tab ────────────────────────────────────────────────────

function CalendarTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const { data: filings = [] } = trpc.secretarial.filings.list.useQuery({}, mergeTrpcQueryOpts("secretarial.filings.list", undefined));
  type FilingRow = { status: string; dueDate: string | Date; id: string; title: string; formNumber: string; authority: string; fy?: string | null };
  const upcoming = filings
    .filter((f: FilingRow) => ["upcoming", "in_progress", "overdue"].includes(f.status))
    .sort((a: FilingRow, b: FilingRow) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{filings.filter((f: { status: string }) => f.status === "overdue").length}</p>
          <p className="text-xs text-red-600">Overdue</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{filings.filter((f: { status: string }) => f.status === "upcoming").length}</p>
          <p className="text-xs text-amber-600">Upcoming</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{filings.filter((f: { status: string }) => f.status === "filed").length}</p>
          <p className="text-xs text-green-600">Filed</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Upcoming Compliance Events</h3>
        </div>
        <div className="divide-y divide-border">
          {upcoming.length === 0 && <p className="px-4 py-10 text-center text-muted-foreground">No upcoming compliance events</p>}
          {upcoming.map((f: FilingRow) => {
            const daysLeft = Math.ceil((new Date(f.dueDate).getTime() - Date.now()) / 86400000);
            return (
              <div key={f.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${f.status === "overdue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                    {daysLeft < 0 ? "OD" : daysLeft < 7 ? `${daysLeft}d` : new Date(f.dueDate).toLocaleDateString("en", {month:"short", day:"2-digit"})}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.formNumber} · {f.authority} · {f.fy ?? ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[f.status]}`}>{f.status}</span>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(f.dueDate).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Content Component ─────────────────────────────────────────────────────

function SecretarialContent() {
  const { can } = useRBAC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = useMemo(() => normalizeSecretarialTab(tabParam), [tabParam]);

  const setTab = (key: (typeof TABS)[number]["key"]) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", key);
    router.replace(`/app/secretarial?${next.toString()}`, { scroll: false });
  };

  if (!can("secretarial", "read")) return <AccessDenied module="secretarial" />;

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
          <Briefcase className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Corporate Secretarial & Governance</h1>
          <p className="text-sm text-muted-foreground">Board meetings, MCA filings, share capital, ESOP, and compliance calendar</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "overview"  && <OverviewTab />}
      {activeTab === "board"     && <BoardTab />}
      {activeTab === "filings"   && <FilingsTab />}
      {activeTab === "share"     && <ShareCapitalTab />}
      {activeTab === "esop"      && <EsopTab />}
      {activeTab === "calendar"  && <CalendarTab />}
    </div>
  );
}

export default function SecretarialPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
      <SecretarialContent />
    </Suspense>
  );
}
