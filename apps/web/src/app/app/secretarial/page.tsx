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
  filed: "text-green-700 bg-green-100 border-green-200",
  pending: "text-orange-700 bg-orange-100 border-orange-200",
  overdue: "text-red-700 bg-red-100 border-red-200",
  upcoming: "text-blue-700 bg-blue-100 border-blue-200",
  in_progress: "text-indigo-700 bg-indigo-100 border-indigo-200",
  not_applicable: "text-muted-foreground bg-muted",
  scheduled: "text-blue-700 bg-blue-100 border-blue-200",
  completed: "text-green-700 bg-green-100 border-green-200",
  cancelled: "text-red-700 bg-red-100 border-red-200",
  draft: "text-slate-600 bg-slate-100",
  passed: "text-green-700 bg-green-100",
  rejected: "text-red-700 bg-red-100",
};

const TABS = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "board", label: "Board & Directors", icon: Users },
  { key: "filings", label: "MCA / ROC Filings", icon: FileText },
  { key: "share", label: "Share Capital", icon: Scale },
  { key: "esop", label: "ESOP", icon: Award },
  { key: "calendar", label: "Compliance Calendar", icon: Calendar },
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
    { label: "Upcoming Meetings", value: overview?.upcomingMeetings ?? 0, icon: Calendar, color: "text-blue-600 bg-blue-50" },
    { label: "Pending Resolutions", value: overview?.pendingResolutions ?? 0, icon: FileText, color: "text-amber-600 bg-amber-50" },
    { label: "Overdue Filings", value: overview?.overdueFilings ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "Due in 30 Days", value: overview?.upcomingFilings ?? 0, icon: Clock, color: "text-orange-600 bg-orange-50" },
    { label: "Active Directors", value: overview?.totalDirectors ?? 0, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "KYC Expiring Soon", value: overview?.kycExpiring ?? 0, icon: Shield, color: "text-purple-600 bg-purple-50" },
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
            {upcomingFilings.map((f: any) => (
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
  const { data: resolutions = [], refetch: refetchResolutions } = trpc.secretarial.resolutions.list.useQuery({}, mergeTrpcQueryOpts("secretarial.resolutions.list", undefined));
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
  const [editingMeeting, setEditingMeeting] = useState<string | null>(null);
  const [markDoneMeeting, setMarkDoneMeeting] = useState<any | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [esignFor, setEsignFor] = useState<{ id: string; title: string } | null>(null);
  const [mtgForm, setMtgForm] = useState({ type: "board" as const, title: "", scheduledAt: "", duration: 120, venue: "", videoLink: "" });

  const [showAddDirector, setShowAddDirector] = useState(false);
  const [editingDirector, setEditingDirector] = useState<string | null>(null);
  const [dirForm, setDirForm] = useState({
    name: "",
    din: "",
    designation: "",
    category: "non_executive",
    pan: "",
    email: "",
    phone: "",
    appointedAt: "",
    address: ""
  });

  const createDirector = trpc.secretarial.directors.create.useMutation({
    onSuccess: () => {
      toast.success("Director added successfully and automated DIR-3 KYC filing created");
      setShowAddDirector(false);
      setDirForm({
        name: "",
        din: "",
        designation: "",
        category: "non_executive",
        pan: "",
        email: "",
        phone: "",
        appointedAt: "",
        address: ""
      });
      refetchDirectors();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDirector = trpc.secretarial.directors.update.useMutation({
    onSuccess: () => {
      toast.success("Director details updated successfully");
      setShowAddDirector(false);
      setEditingDirector(null);
      setDirForm({
        name: "",
        din: "",
        designation: "",
        category: "non_executive",
        pan: "",
        email: "",
        phone: "",
        appointedAt: "",
        address: ""
      });
      refetchDirectors();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteDirector = trpc.secretarial.directors.delete.useMutation({
    onSuccess: () => {
      toast.success("Director removed successfully");
      refetchDirectors();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCloseDirectorModal = () => {
    setShowAddDirector(false);
    setEditingDirector(null);
    setDirForm({
      name: "",
      din: "",
      designation: "",
      category: "non_executive",
      pan: "",
      email: "",
      phone: "",
      appointedAt: "",
      address: ""
    });
  };

  const createResolution = trpc.secretarial.resolutions.create.useMutation({
    onSuccess: () => refetchResolutions(),
    onError: e => toast.error(e.message),
  });
  const createMeeting = trpc.secretarial.meetings.create.useMutation({
    onSuccess: () => { toast.success("Meeting scheduled"); refetchMeetings(); setShowNewMeeting(false); },
    onError: e => toast.error(e.message),
  });
  const updateMeeting = trpc.secretarial.meetings.update.useMutation({
    onSuccess: () => { toast.success("Meeting updated"); refetchMeetings(); setShowNewMeeting(false); setEditingMeeting(null); },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Board Meetings */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Board Meetings</h3>
          <PermissionGate module="secretarial" action="write">
            <button onClick={() => { setEditingMeeting(null); setMtgForm({ type: "board", title: "", scheduledAt: "", duration: 120, venue: "", videoLink: "" }); setShowNewMeeting(true); }} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Schedule Meeting
            </button>
          </PermissionGate>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Number", "Title", "Type", "Date", "Duration", "Status", "Quorum", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {meetings.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No board meetings yet</td></tr>}
              {meetings.map((m: any) => (
                <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{m.number}</td>
                  <td className="px-4 py-3 font-medium">{m.title}</td>
                  <td className="px-4 py-3 text-xs capitalize">{m.type?.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-xs">{new Date(m.scheduledAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.duration}min</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[m.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(m.status === "scheduled" ? "upcoming" : m.status ?? "—").replace("_", " ")}</span></td>
                  <td className="px-4 py-3 text-xs">{m.quorumMet == null ? "—" : m.quorumMet ? "✓ Met" : "✗ Not met"}</td>
                  <td className="px-4 py-3 space-x-2">
                    {m.status === "scheduled" && (
                      <>
                        <button onClick={() => {
                          setMtgForm({
                            type: (m.type as any) || "board",
                            title: m.title,
                            scheduledAt: new Date(m.scheduledAt).toISOString().slice(0, 16),
                            duration: m.duration,
                            venue: m.venue || "",
                            videoLink: m.videoLink || ""
                          });
                          setEditingMeeting(m.id);
                          setShowNewMeeting(true);
                        }} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => {
                          setMarkDoneMeeting(m);
                          setResolutionText("");
                        }} className="text-xs text-green-600 hover:underline">Mark Done</button>
                        <button onClick={() => updateMtgStatus.mutate({ id: m.id, status: "cancelled" })} className="text-xs text-red-600 hover:underline">Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Directors */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Board of Directors</h3>
          <PermissionGate module="secretarial" action="write">
            <button
              onClick={() => setShowAddDirector(true)}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Board Director
            </button>
          </PermissionGate>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Name", "DIN", "Designation", "Category", "Pan", "Appointed", "KYC Status", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {directors.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No directors found</td></tr>}
              {directors.map((d: any) => (
                <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.din}</td>
                  <td className="px-4 py-3 text-xs">{d.designation}</td>
                  <td className="px-4 py-3 text-xs capitalize">{d.category?.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-xs font-mono">{d.pan ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{d.appointedAt ? new Date(d.appointedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.kyc === "filed" ? "text-green-700 bg-green-100" : d.kyc === "expired" ? "text-red-700 bg-red-100" : "text-amber-700 bg-amber-100"}`}>
                      {d.kyc ?? "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    <PermissionGate module="secretarial" action="write">
                      <button onClick={() => updateKyc.mutate({ id: d.id, kyc: d.kyc === "filed" ? "pending" : "filed" })} className="text-xs text-primary hover:underline">
                        {d.kyc === "filed" ? "Mark Pending" : "Mark Filed"}
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button onClick={() => {
                        setDirForm({
                          name: d.name,
                          din: d.din,
                          designation: d.designation,
                          category: d.category ?? "non_executive",
                          pan: d.pan ?? "",
                          email: (d as any).email ?? "",
                          phone: (d as any).phone ?? "",
                          appointedAt: d.appointedAt ? (new Date(d.appointedAt).toISOString().split('T')[0] ?? "") : "",
                          address: (d as any).address ?? ""
                        });
                        setEditingDirector(d.id);
                        setShowAddDirector(true);
                      }} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <span className="text-muted-foreground/30">|</span>
                      <button onClick={() => {
                        if (confirm("Are you sure you want to remove this director?")) {
                          deleteDirector.mutate({ id: d.id });
                        }
                      }} className="text-xs text-red-600 hover:underline">Cancel</button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolutions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Board Resolutions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Number", "Title", "Type", "Status", "Passed", "For", "Against", "Abstain", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {resolutions.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No resolutions yet</td></tr>}
              {resolutions.map((r: any) => (
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

      {/* Mark Done / Resolution Modal */}
      {markDoneMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">Complete Board Meeting</h2>
              <button onClick={() => setMarkDoneMeeting(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <p className="text-sm font-medium">{markDoneMeeting.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(markDoneMeeting.scheduledAt).toLocaleString()} · {markDoneMeeting.duration} min</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Board Resolutions</label>
                <textarea
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background min-h-[120px]"
                  placeholder="Enter resolution details passed during this meeting..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setMarkDoneMeeting(null)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button
                disabled={updateMtgStatus.isPending || createResolution.isPending}
                onClick={async () => {
                  try {
                    if (resolutionText.trim()) {
                      await createResolution.mutateAsync({
                        meetingId: markDoneMeeting.id,
                        title: `Resolution from ${markDoneMeeting.title}`,
                        body: resolutionText,
                        type: markDoneMeeting.type === "board" ? "board" : "ordinary"
                      });
                    }
                    updateMtgStatus.mutate({ id: markDoneMeeting.id, status: "completed", quorumMet: true }, {
                      onSuccess: () => {
                        setMarkDoneMeeting(null);
                      }
                    });
                  } catch (e: any) {
                    // toast error is already handled by useMutation, but we prevent marking done if resolution fails
                  }
                }}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >{updateMtgStatus.isPending || createResolution.isPending ? "Saving..." : "Mark as Done"}</button>
            </div>
          </div>
        </div>
      )}

      {/* New Meeting Modal */}
      {showNewMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">{editingMeeting ? "Edit Board Meeting" : "Schedule Board Meeting"}</h2>
              <button onClick={() => { setShowNewMeeting(false); setEditingMeeting(null); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Type</label>
                <select value={mtgForm.type} onChange={e => setMtgForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  {["board", "audit_committee", "nomination_committee", "compensation_committee", "agm", "egm", "creditors"].map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
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
              <button onClick={() => { setShowNewMeeting(false); setEditingMeeting(null); }} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button
                disabled={!mtgForm.title || !mtgForm.scheduledAt || createMeeting.isPending || updateMeeting.isPending}
                onClick={() => {
                  if (editingMeeting) {
                    updateMeeting.mutate({ id: editingMeeting, ...mtgForm, scheduledAt: mtgForm.scheduledAt });
                  } else {
                    createMeeting.mutate({ ...mtgForm, scheduledAt: mtgForm.scheduledAt });
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >{createMeeting.isPending || updateMeeting.isPending ? "Saving..." : (editingMeeting ? "Save Changes" : "Schedule")}</button>
            </div>
          </div>
        </div>
      )}

      {showAddDirector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">{editingDirector ? "Edit Board Director" : "Add Board Director"}</h3>
              <button onClick={handleCloseDirectorModal}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Full Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                  placeholder="e.g. Satya Nadella"
                  value={dirForm.name}
                  onChange={(e) => setDirForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">DIN *</label>
                  <input
                    type="text"
                    required
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. 01234567"
                    value={dirForm.din}
                    onChange={(e) => setDirForm(f => ({ ...f, din: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Designation *</label>
                  <input
                    type="text"
                    required
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. Managing Director"
                    value={dirForm.designation}
                    onChange={(e) => setDirForm(f => ({ ...f, designation: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category</label>
                  <select
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    value={dirForm.category}
                    onChange={(e) => setDirForm(f => ({ ...f, category: e.target.value }))}
                  >
                    <option value="executive">Executive</option>
                    <option value="non_executive">Non-Executive</option>
                    <option value="independent">Independent</option>
                    <option value="nominee">Nominee</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">PAN</label>
                  <input
                    type="text"
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. ABCDE1234F"
                    value={dirForm.pan}
                    onChange={(e) => setDirForm(f => ({ ...f, pan: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. satya@microsoft.com"
                    value={dirForm.email}
                    onChange={(e) => setDirForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
                  <input
                    type="text"
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. +91 99999 99999"
                    value={dirForm.phone}
                    onChange={(e) => setDirForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Appointed Date</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    value={dirForm.appointedAt}
                    onChange={(e) => setDirForm(f => ({ ...f, appointedAt: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Address</label>
                  <input
                    type="text"
                    className="mt-1 w-full border border-border rounded px-3 py-2 text-[12px] bg-background"
                    placeholder="e.g. Mumbai, India"
                    value={dirForm.address}
                    onChange={(e) => setDirForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseDirectorModal}
                className="flex-1 px-4 py-2 text-xs border border-border rounded hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!dirForm.name.trim()) { toast.error("Full Name is required"); return; }
                  if (!dirForm.din.trim() || dirForm.din.trim().length < 8) { toast.error("DIN is required and must be at least 8 characters"); return; }
                  if (!dirForm.designation.trim()) { toast.error("Designation is required"); return; }
                  
                  const payload = {
                    name: dirForm.name.trim(),
                    din: dirForm.din.trim(),
                    designation: dirForm.designation.trim(),
                    category: dirForm.category,
                    pan: dirForm.pan.trim() || undefined,
                    email: dirForm.email.trim() || undefined,
                    phone: dirForm.phone.trim() || undefined,
                    appointedAt: dirForm.appointedAt || undefined,
                    address: dirForm.address.trim() || undefined
                  };

                  if (editingDirector) {
                    updateDirector.mutate({ id: editingDirector, ...payload });
                  } else {
                    createDirector.mutate(payload);
                  }
                }}
                disabled={createDirector.isPending || updateDirector.isPending}
                className="flex-1 px-4 py-2 text-xs bg-primary text-white rounded hover:bg-primary/95 disabled:opacity-50 transition-colors"
              >
                {createDirector.isPending || updateDirector.isPending ? "Saving…" : (editingDirector ? "Save Changes" : "Add Director")}
              </button>
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
  const [selectedFY, setSelectedFY] = useState("2024-25");
  const { data: filings = [], refetch } = trpc.secretarial.filings.list.useQuery({ fy: selectedFY }, mergeTrpcQueryOpts("secretarial.filings.list", undefined));
  const [statusFilter, setStatusFilter] = useState("");
  const markFiled = trpc.secretarial.filings.markFiled.useMutation({
    onSuccess: () => { toast.success("Filing marked as filed"); refetch(); },
    onError: e => toast.error(e.message),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editingFiling, setEditingFiling] = useState<string | null>(null);
  const [form, setForm] = useState({ formNumber: "MGT-7", title: "", authority: "MCA", category: "annual_return", dueDate: "", fy: "2024-25", fees: "", notes: "" });
  const createFiling = trpc.secretarial.filings.create.useMutation({
    onSuccess: () => { toast.success("Filing created"); refetch(); setShowCreate(false); },
    onError: e => toast.error(e.message),
  });
  const updateFiling = trpc.secretarial.filings.update.useMutation({
    onSuccess: () => { toast.success("Filing updated"); refetch(); setShowCreate(false); setEditingFiling(null); },
    onError: e => toast.error(e.message),
  });
  const seedFilings = trpc.secretarial.filings.seed.useMutation({
    onSuccess: (data) => { toast.success(`Seeded ${data.seeded} standard filings`); refetch(); },
    onError: e => toast.error(e.message),
  });

  const filtered = statusFilter ? filings.filter((f: any) => f.status === statusFilter) : filings;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">All Status</option>
          {["upcoming", "in_progress", "filed", "overdue", "not_applicable"].map(s => <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <PermissionGate module="secretarial" action="write">
            <div className="flex items-center border border-border rounded-lg overflow-hidden h-9">
              <select
                value={selectedFY}
                onChange={e => setSelectedFY(e.target.value)}
                className="bg-muted/30 text-[11px] px-2 h-full border-r border-border focus:outline-none"
              >
                {["2023-24", "2024-25", "2025-26"].map(fy => <option key={fy} value={fy}>{fy}</option>)}
              </select>
              <button
                onClick={() => seedFilings.mutate({ financialYear: selectedFY })}
                disabled={seedFilings.isPending}
                className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 text-[11px] font-medium hover:bg-indigo-100 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${seedFilings.isPending ? "animate-spin" : ""}`} /> Seed Basis Companies Act 2013
              </button>
            </div>
          </PermissionGate>
          <PermissionGate module="secretarial" action="write">
            <button onClick={() => { setEditingFiling(null); setForm({ formNumber: "MGT-7", title: "", authority: "MCA", category: "annual_return", dueDate: "", fy: selectedFY, fees: "", notes: "" }); setShowCreate(true); }} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 h-9">
              <Plus className="w-3.5 h-3.5" /> Add Filing
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Form", "Title", "Authority", "Category", "FY", "Due Date", "Status", "SRN", "Actions"].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No filings found</td></tr>}
              {filtered.map((f: any) => (
                <tr key={f.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{f.formNumber}</td>
                  <td className="px-3 py-3 font-medium max-w-[160px] truncate">{f.title}</td>
                  <td className="px-3 py-3 text-xs">{f.authority}</td>
                  <td className="px-3 py-3 text-xs capitalize">{f.category?.replace("_", " ")}</td>
                  <td className="px-3 py-3 text-xs">{f.fy ?? "—"}</td>
                  <td className="px-3 py-3 text-xs">{f.dueDate ? new Date(f.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[f.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(f.status ?? "—").replace("_", " ")}</span></td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{f.srn ?? "—"}</td>
                  <td className="px-3 py-3 space-x-2 whitespace-nowrap">
                    {f.status !== "filed" && f.status !== "cancelled" && (
                      <PermissionGate module="secretarial" action="write">
                        <button onClick={() => {
                          setForm({ formNumber: f.formNumber, title: f.title, authority: f.authority, category: f.category || "annual_return", dueDate: f.dueDate ? (new Date(f.dueDate).toISOString().split('T')[0] ?? "") : "", fy: f.fy || "", fees: "", notes: "" });
                          setEditingFiling(f.id);
                          setShowCreate(true);
                        }} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <button onClick={() => {
                          const notes = prompt("Please provide comments for marking this filing as Done:");
                          if (notes !== null) {
                            markFiled.mutate({ id: f.id, notes: notes });
                          }
                        }} className="text-xs text-green-600 hover:underline font-medium">Mark as Done</button>
                        <button onClick={() => {
                          const notes = prompt("Please provide comments for cancelling this filing:");
                          if (notes !== null) {
                            updateFiling.mutate({ id: f.id, status: "not_applicable", notes: notes });
                          }
                        }} className="text-xs text-red-600 hover:underline font-medium">Cancel</button>
                      </PermissionGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">{editingFiling ? "Edit Compliance Filing" : "Add Compliance Filing"}</h2>
              <button onClick={() => { setShowCreate(false); setEditingFiling(null); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Form Number *</label>
                <select value={form.formNumber} onChange={e => setForm(p => ({ ...p, formNumber: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  {["MGT-7", "DIR-3 KYC", "ADT-1", "AOC-4", "MSME-1", "MSME-1 Return H1/H2", "DPT-3"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Authority *</label>
                <select value={form.authority} onChange={e => setForm(p => ({ ...p, authority: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  <option value="MCA">MCA</option>
                  <option value="MCA (ROC)">MCA (ROC)</option>
                </select>
              </div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Title *</label><input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Category *</label><input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div>
                <label className="block text-sm font-medium mb-1">Financial Year *</label>
                <select value={form.fy} onChange={e => setForm(p => ({ ...p, fy: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  {["2023-24", "2024-25", "2025-26"].map(fy => <option key={fy} value={fy}>{fy}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Filing Fees (₹) *</label><input type="number" value={form.fees} onChange={e => setForm(p => ({ ...p, fees: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Notes *</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => { setShowCreate(false); setEditingFiling(null); }} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button disabled={!form.formNumber || !form.title || !form.authority || !form.category || !form.fy || !form.dueDate || !form.fees || !form.notes || createFiling.isPending || updateFiling.isPending} onClick={() => {
                if (editingFiling) {
                  updateFiling.mutate({ id: editingFiling, ...form, fees: form.fees ? +form.fees : undefined, dueDate: form.dueDate, fy: form.fy || undefined });
                } else {
                  createFiling.mutate({ ...form, fees: form.fees ? +form.fees : undefined, dueDate: form.dueDate, fy: form.fy || undefined });
                }
              }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{createFiling.isPending || updateFiling.isPending ? "Saving..." : (editingFiling ? "Save Changes" : "Create Filing")}</button>
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
  const [editingShareholder, setEditingShareholder] = useState<string | null>(null);
  const [form, setForm] = useState({ holderName: "", holderType: "individual", shareClass: "equity" as const, nominalValue: 10, quantity: 1, pan: "", address: "" });
  const createShare = trpc.secretarial.shares.create.useMutation({
    onSuccess: () => { toast.success("Shareholder added"); refetch(); handleCloseModal(); },
    onError: e => toast.error(e.message),
  });
  const updateShare = trpc.secretarial.shares.update.useMutation({
    onSuccess: () => { toast.success("Shareholder updated"); refetch(); handleCloseModal(); },
    onError: e => toast.error(e.message),
  });
  const deleteShare = trpc.secretarial.shares.delete.useMutation({
    onSuccess: () => { toast.success("Shareholder removed"); refetch(); },
    onError: e => toast.error(e.message),
  });

  const handleCloseModal = () => {
    setShowAdd(false);
    setEditingShareholder(null);
    setForm({ holderName: "", holderType: "individual", shareClass: "equity" as const, nominalValue: 10, quantity: 1, pan: "", address: "" });
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summary.map((s: { shareClass?: string; totalQty?: unknown; holders: number }) => (
          <div key={s.shareClass} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.shareClass?.replace("_", " ")} Shares</p>
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
            <button onClick={() => { setEditingShareholder(null); setForm({ holderName: "", holderType: "individual", shareClass: "equity" as const, nominalValue: 10, quantity: 1, pan: "", address: "" }); setShowAdd(true); }} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> Add Shareholder
            </button>
          </PermissionGate>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Folio", "Holder Name", "Type", "Class", "Nominal Value", "Quantity", "Paid Up", "PAN", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {shares.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No shareholders registered</td></tr>}
              {shares.map((s: any) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{s.folio}</td>
                  <td className="px-4 py-3 font-medium">{s.holderName}</td>
                  <td className="px-4 py-3 text-xs capitalize">{s.holderType}</td>
                  <td className="px-4 py-3 text-xs capitalize">{s.shareClass?.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-xs">₹{s.nominalValue}</td>
                  <td className="px-4 py-3 font-medium">{s.quantity?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{s.paidUpValue != null ? `₹${s.paidUpValue.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.pan ?? "—"}</td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    <PermissionGate module="secretarial" action="write">
                      <button onClick={() => {
                        setForm({
                          holderName: s.holderName,
                          holderType: s.holderType,
                          shareClass: (s.shareClass as any) ?? "equity",
                          nominalValue: s.nominalValue,
                          quantity: s.quantity ?? 1,
                          pan: s.pan ?? "",
                          address: s.address ?? ""
                        });
                        setEditingShareholder(s.id);
                        setShowAdd(true);
                      }} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <span className="text-muted-foreground/30">|</span>
                      <button onClick={() => {
                        if (confirm("Are you sure you want to remove this shareholder?")) {
                          deleteShare.mutate({ id: s.id });
                        }
                      }} className="text-xs text-red-600 hover:underline">Delete</button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">{editingShareholder ? "Edit Shareholder" : "Add Shareholder"}</h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Holder Name *</label><input value={form.holderName} onChange={e => setForm(p => ({ ...p, holderName: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Holder Type</label><select value={form.holderType} onChange={e => setForm(p => ({ ...p, holderType: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">{["individual", "institution", "promoter", "trust"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Share Class</label><select value={form.shareClass} onChange={e => setForm(p => ({ ...p, shareClass: e.target.value as any }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">{["equity", "preference", "esop_pool", "convertible"].map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Nominal Value (₹)</label><input type="number" value={form.nominalValue} onChange={e => setForm(p => ({ ...p, nominalValue: +e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Quantity *</label><input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: +e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">PAN</label><input value={form.pan} onChange={e => setForm(p => ({ ...p, pan: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Address</label><input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={handleCloseModal} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button
                disabled={!form.holderName || createShare.isPending || updateShare.isPending}
                onClick={() => {
                  if (editingShareholder) {
                    updateShare.mutate({
                      id: editingShareholder,
                      holderName: form.holderName,
                      holderType: form.holderType,
                      shareClass: form.shareClass,
                      nominalValue: form.nominalValue,
                      quantity: form.quantity,
                      pan: form.pan || undefined,
                      address: form.address || undefined,
                    });
                  } else {
                    createShare.mutate(form);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >{createShare.isPending || updateShare.isPending ? "Saving..." : (editingShareholder ? "Save Changes" : "Add")}</button>
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
  const [editingGrant, setEditingGrant] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeName: "", options: 100, exercisePrice: 1000, grantDate: "", vestingStart: "", vestingEnd: "", notes: "" });
  const grantEsop = trpc.secretarial.esop.grant.useMutation({
    onSuccess: () => { toast.success("ESOP grant created"); refetch(); handleCloseModal(); },
    onError: e => toast.error(e.message),
  });
  const updateEsop = trpc.secretarial.esop.update.useMutation({
    onSuccess: () => { toast.success("ESOP grant updated"); refetch(); handleCloseModal(); },
    onError: e => toast.error(e.message),
  });
  const deleteEsop = trpc.secretarial.esop.delete.useMutation({
    onSuccess: () => { toast.success("ESOP grant deleted"); refetch(); },
    onError: e => toast.error(e.message),
  });

  const handleCloseModal = () => {
    setShowGrant(false);
    setEditingGrant(null);
    setForm({ employeeName: "", options: 100, exercisePrice: 1000, grantDate: "", vestingStart: "", vestingEnd: "", notes: "" });
  };

  const handleSubmit = () => {
    if (editingGrant) {
      updateEsop.mutate({
        id: editingGrant,
        employeeName: form.employeeName,
        options: form.options,
        exercisePrice: form.exercisePrice,
        grantDate: form.grantDate || undefined,
        vestingStart: form.vestingStart || undefined,
        vestingEnd: form.vestingEnd || undefined,
        notes: form.notes || undefined,
      });
      return;
    }
    // Create flow — validate grant date not in future
    if (!form.grantDate) return;
    const gDate = new Date(form.grantDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gDateCompare = new Date(gDate);
    gDateCompare.setHours(0, 0, 0, 0);

    if (gDateCompare > today) {
      toast.error("Grant date cannot be in the future");
      return;
    }

    grantEsop.mutate({
      ...form,
      vestingStart: form.vestingStart || undefined,
      vestingEnd: form.vestingEnd || undefined,
    });
  };

  const isFutureDate = (d: string | Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const gd = new Date(d); gd.setHours(0, 0, 0, 0);
    return gd > today;
  };

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
            <button onClick={() => { setEditingGrant(null); setForm({ employeeName: "", options: 100, exercisePrice: 1000, grantDate: "", vestingStart: "", vestingEnd: "", notes: "" }); setShowGrant(true); }} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> New Grant
            </button>
          </PermissionGate>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Grant #", "Employee", "Options", "Exercise Price", "Grant Date", "Vesting Start", "Vesting End", "Event", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {grants.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No ESOP grants yet</td></tr>}
              {grants.map((g: any) => (
                <tr key={g.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{g.grantNumber}</td>
                  <td className="px-4 py-3 font-medium">{g.employeeName}</td>
                  <td className="px-4 py-3 font-semibold">{g.options.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">₹{(g.exercisePrice / 100).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{new Date(g.grantDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs">{g.vestingStart ? new Date(g.vestingStart).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-xs">{g.vestingEnd ? new Date(g.vestingEnd).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize font-medium text-indigo-600">{g.event}</td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    <PermissionGate module="secretarial" action="write">
                      <button onClick={() => {
                        setForm({
                          employeeName: g.employeeName,
                          options: g.options,
                          exercisePrice: g.exercisePrice,
                          grantDate: new Date(g.grantDate).toISOString().split('T')[0] ?? "",
                          vestingStart: g.vestingStart ? (new Date(g.vestingStart).toISOString().split('T')[0] ?? "") : "",
                          vestingEnd: g.vestingEnd ? (new Date(g.vestingEnd).toISOString().split('T')[0] ?? "") : "",
                          notes: g.notes ?? ""
                        });
                        setEditingGrant(g.id);
                        setShowGrant(true);
                      }} className="text-xs text-blue-600 hover:underline">Edit</button>
                      {isFutureDate(g.grantDate) && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <button onClick={() => {
                            if (confirm("Are you sure you want to delete this ESOP grant?")) {
                              deleteEsop.mutate({ id: g.id });
                            }
                          }} className="text-xs text-red-600 hover:underline">Delete</button>
                        </>
                      )}
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showGrant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-lg">{editingGrant ? "Edit ESOP Grant" : "New ESOP Grant"}</h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Employee Name *</label><input value={form.employeeName} onChange={e => setForm(p => ({ ...p, employeeName: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Options *</label><input type="number" min={1} value={form.options} onChange={e => setForm(p => ({ ...p, options: +e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Exercise Price (paise) *</label><input type="number" min={0} value={form.exercisePrice} onChange={e => setForm(p => ({ ...p, exercisePrice: +e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="100000 = ₹1000" /></div>
              <div><label className="block text-sm font-medium mb-1">Grant Date *</label><input type="date" value={form.grantDate} onChange={e => setForm(p => ({ ...p, grantDate: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div><label className="block text-sm font-medium mb-1">Vesting Start</label><input type="date" value={form.vestingStart} onChange={e => setForm(p => ({ ...p, vestingStart: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium mb-1">Vesting End</label><input type="date" value={form.vestingEnd} onChange={e => setForm(p => ({ ...p, vestingEnd: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" /></div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={handleCloseModal} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button
                disabled={!form.employeeName || !form.grantDate || grantEsop.isPending || updateEsop.isPending}
                onClick={handleSubmit}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >{grantEsop.isPending || updateEsop.isPending ? "Saving..." : (editingGrant ? "Save Changes" : "Create Grant")}</button>
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
  const [selectedFY, setSelectedFY] = useState("2024-25");
  const { data: filings = [], refetch: refetchFilings } = trpc.secretarial.filings.list.useQuery({ fy: selectedFY }, mergeTrpcQueryOpts("secretarial.filings.list", undefined));
  const { data: calendar = [], refetch: refetchCalendar } = trpc.indiaCompliance.calendar.list.useQuery({ financialYear: selectedFY }, mergeTrpcQueryOpts("indiaCompliance.calendar.list", undefined));
  const seedCalendar = trpc.indiaCompliance.calendar.seed.useMutation({
    onSuccess: (data) => { toast.success(`Seeded ${data.seeded} items to compliance calendar`); refetchCalendar(); },
    onError: e => toast.error(e.message),
  });

  type FilingRow = { status: string; dueDate: string | Date; id: string; title: string; formNumber?: string; authority?: string; fy?: string | null; eventName?: string };

  const allEvents = [
    ...filings.map((f: any) => ({ ...f, type: "filing" })),
    ...calendar.map((c: any) => ({ ...c, title: c.eventName, type: "calendar" }))
  ];

  const upcoming = allEvents
    .filter((f) => ["upcoming", "in_progress", "overdue"].includes(f.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{allEvents.filter((f: { status: string }) => f.status === "overdue").length}</p>
            <p className="text-xs text-red-600">Overdue</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{allEvents.filter((f: { status: string }) => f.status === "upcoming").length}</p>
            <p className="text-xs text-amber-600">Upcoming</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{allEvents.filter((f: { status: string }) => f.status === "filed").length}</p>
            <p className="text-xs text-green-600">Filed</p>
          </div>
        </div>
        <PermissionGate module="secretarial" action="write">
          <div className="ml-4 flex flex-col gap-2">
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <select
                value={selectedFY}
                onChange={e => setSelectedFY(e.target.value)}
                className="bg-muted/30 text-[10px] px-2 h-8 border-r border-border focus:outline-none"
              >
                {["2023-24", "2024-25", "2025-26"].map(fy => <option key={fy} value={fy}>{fy}</option>)}
              </select>
              <button
                onClick={() => seedCalendar.mutate({ financialYear: selectedFY })}
                disabled={seedCalendar.isPending}
                className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-medium h-8 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${seedCalendar.isPending ? "animate-spin" : ""}`} /> Seed Statutory Calendar
              </button>
            </div>
          </div>
        </PermissionGate>
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
                    {daysLeft < 0 ? "OD" : daysLeft < 7 ? `${daysLeft}d` : new Date(f.dueDate).toLocaleDateString("en", { month: "short", day: "2-digit" })}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.formNumber && `${f.formNumber} · `}
                      {f.authority && `${f.authority} · `}
                      {f.fy ?? ""}
                    </p>
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
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key
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

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "board" && <BoardTab />}
      {activeTab === "filings" && <FilingsTab />}
      {activeTab === "share" && <ShareCapitalTab />}
      {activeTab === "esop" && <EsopTab />}
      {activeTab === "calendar" && <CalendarTab />}
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
