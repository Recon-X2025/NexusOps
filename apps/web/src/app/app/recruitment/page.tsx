"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  UserPlus, Briefcase, Users, Calendar, FileText, BarChart2,
  Plus, Search, Filter, Download, ChevronRight, MoreHorizontal,
  CheckCircle2, XCircle, Clock, Star, ArrowRight, X,
  Building2, MapPin, DollarSign, Layers, Target, Award,
  Phone, Mail, Linkedin, Send, Edit, Trash2, Eye,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { downloadCSV } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "requisitions" | "pipeline" | "candidates" | "interviews" | "offers";

const PIPELINE_STAGES = [
  { key: "applied",       label: "Applied",       color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "screening",     label: "Screening",     color: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "phone_screen",  label: "Phone Screen",  color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { key: "technical",     label: "Technical",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "panel",         label: "Panel",         color: "bg-orange-100 text-orange-700 border-orange-200" },
  { key: "hr_round",      label: "HR Round",      color: "bg-purple-100 text-purple-700 border-purple-200" },
  { key: "offer",         label: "Offer",         color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "hired",         label: "Hired",         color: "bg-green-100 text-green-700 border-green-200" },
  { key: "rejected",      label: "Rejected",      color: "bg-red-100 text-red-700 border-red-200" },
];

const JOB_STATUS_STYLES: Record<string, string> = {
  open:      "bg-green-100 text-green-700 border border-green-200",
  draft:     "bg-slate-100 text-slate-600 border border-slate-200",
  on_hold:   "bg-amber-100 text-amber-700 border border-amber-200",
  closed:    "bg-blue-100 text-blue-700 border border-blue-200",
  cancelled: "bg-red-100 text-red-600 border border-red-200",
};

const OFFER_STATUS_STYLES: Record<string, string> = {
  draft:    "bg-slate-100 text-slate-600",
  sent:     "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired:  "bg-orange-100 text-orange-700",
  revoked:  "bg-gray-100 text-gray-600",
};

// ── Modal: New Job Requisition ───────────────────────────────────────────────────

function NewReqModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createReq = trpc.recruitment.requisitions.create.useMutation({
    onSuccess: (row) => {
      toast.success(row?.status === "open" ? "Requisition published — open for applications" : "Requisition saved as draft — use Publish when ready");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState({
    title: "", department: "", location: "", workMode: "hybrid",
    type: "full_time" as const, level: "mid" as const,
    openings: 1, description: "", requirements: "", salaryMin: "", salaryMax: "",
    targetDate: "",
    publishImmediately: false,
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">New Job Requisition</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Job Title *</label>
              <input value={form.title} onChange={e => set("title", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="e.g. Senior Backend Engineer" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department *</label>
              <input value={form.department} onChange={e => set("department", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Engineering" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Bangalore / Remote" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Work Mode</label>
              <select value={form.workMode} onChange={e => set("workMode", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                {["onsite","hybrid","remote"].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Job Type</label>
              <select value={form.type} onChange={e => set("type", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                {[["full_time","Full Time"],["part_time","Part Time"],["contract","Contract"],["internship","Internship"],["freelance","Freelance"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select value={form.level} onChange={e => set("level", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                {["intern","junior","mid","senior","lead","manager","director","vp","c_level"].map(l => <option key={l} value={l}>{l.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Openings</label>
              <input type="number" min={1} value={form.openings} onChange={e => set("openings", +e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Close Date</label>
              <input type="date" value={form.targetDate} onChange={e => set("targetDate", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Salary (₹/year)</label>
              <input type="number" value={form.salaryMin} onChange={e => set("salaryMin", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="600000" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Salary (₹/year)</label>
              <input type="number" value={form.salaryMax} onChange={e => set("salaryMax", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="1200000" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Job Description</label>
              <textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" placeholder="Role overview, responsibilities..." />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Requirements</label>
              <textarea rows={3} value={form.requirements} onChange={e => set("requirements", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" placeholder="Must-have skills and experience..." />
            </div>
            <div className="col-span-2 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <input type="checkbox" id="pubNow" checked={form.publishImmediately} onChange={e => set("publishImmediately", e.target.checked)} className="mt-1" />
              <label htmlFor="pubNow" className="text-sm leading-snug cursor-pointer">
                <span className="font-medium">Open for applications immediately</span>
                <span className="block text-muted-foreground text-xs mt-1">If unchecked, the requisition is saved as <strong>draft</strong> until you publish it (standard approval workflow).</span>
              </label>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!form.title || !form.department || createReq.isPending}
            onClick={() => createReq.mutate({
              title: form.title,
              department: form.department,
              location: form.location || undefined,
              workMode: form.workMode || undefined,
              type: form.type,
              level: form.level,
              openings: form.openings,
              description: form.description || undefined,
              requirements: form.requirements || undefined,
              salaryMin: form.salaryMin ? +form.salaryMin : undefined,
              salaryMax: form.salaryMax ? +form.salaryMax : undefined,
              targetDate: form.targetDate || undefined,
              publishImmediately: form.publishImmediately,
            })}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >{createReq.isPending ? "Creating..." : "Create Requisition"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Add Candidate ─────────────────────────────────────────────────────────

function AddCandidateModal({ jobs, onClose, onCreated }: { jobs: any[]; onClose: () => void; onCreated: () => void }) {
  const createCand = trpc.recruitment.candidates.create.useMutation({
    onSuccess: () => { toast.success("Candidate added"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", currentCo: "", experience: "", location: "", source: "other", jobId: "", skills: "", notes: "" });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Add Candidate</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name *</label>
              <input value={form.firstName} onChange={e => set("firstName", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name *</label>
              <input value={form.lastName} onChange={e => set("lastName", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Current Title</label>
              <input value={form.currentTitle} onChange={e => set("currentTitle", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Current Company</label>
              <input value={form.currentCo} onChange={e => set("currentCo", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Years of Experience</label>
              <input type="number" min={0} value={form.experience} onChange={e => set("experience", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                {["linkedin","naukri","indeed","referral","agency","website","campus","internal","other"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Apply to Job</label>
              <select value={form.jobId} onChange={e => set("jobId", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">— Optional —</option>
                {jobs.filter(j => j.status === "open").map(j => <option key={j.id} value={j.id}>{j.number}: {j.title}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Skills (comma-separated)</label>
              <input value={form.skills} onChange={e => set("skills", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="React, Node.js, PostgreSQL" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" />
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!form.firstName || !form.lastName || !form.email || createCand.isPending}
            onClick={() => createCand.mutate({ ...form, experience: form.experience ? +form.experience : undefined, skills: form.skills.split(",").map(s => s.trim()).filter(Boolean), jobId: form.jobId || undefined })}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >{createCand.isPending ? "Adding..." : "Add Candidate"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Tab ───────────────────────────────────────────────────────────────

function DashboardTab({ analytics }: { analytics: any }) {
  const stats = [
    { label: "Open Requisitions",    value: analytics?.openReqs ?? 0,             icon: Briefcase, color: "text-blue-600 bg-blue-50" },
    { label: "Applications (90d)",   value: analytics?.totalApplications ?? 0,    icon: Users,     color: "text-indigo-600 bg-indigo-50" },
    { label: "Hired (90d)",          value: analytics?.hired ?? 0,                icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "Conversion Rate",      value: `${analytics?.conversionRate ?? 0}%`, icon: Target,    color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.color}`}><s.icon className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-base mb-4">Pipeline Funnel</h3>
          <div className="space-y-2">
            {(analytics?.byStage ?? []).filter((s: any) => s.stage !== "rejected" && s.stage !== "withdrawn").map((s: any) => {
              const total = analytics?.totalApplications || 1;
              const pct = Math.round((s.n / total) * 100);
              const stage = PIPELINE_STAGES.find(ps => ps.key === s.stage);
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${stage?.color ?? "bg-slate-100 text-slate-700"}`} style={{minWidth:"90px",textAlign:"center"}}>{stage?.label ?? s.stage}</div>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{s.n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Source */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-base mb-4">Candidates by Source</h3>
          <div className="space-y-2">
            {(analytics?.bySource ?? []).sort((a: any, b: any) => b.n - a.n).slice(0, 8).map((s: any) => {
              const max = Math.max(...(analytics?.bySource ?? []).map((x: any) => x.n), 1);
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-sm capitalize w-24 truncate">{s.source ?? "other"}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="bg-indigo-400 rounded-full h-2" style={{ width: `${(s.n / max) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{s.n}</span>
                </div>
              );
            })}
            {(!analytics?.bySource?.length) && <p className="text-sm text-muted-foreground">No candidate data yet</p>}
          </div>
        </div>

        {/* Open Reqs by Dept */}
        <div className="bg-card border border-border rounded-xl p-5 md:col-span-2">
          <h3 className="font-semibold text-base mb-4">Open Positions by Department</h3>
          <div className="flex flex-wrap gap-3">
            {(analytics?.byDept ?? []).map((d: any) => (
              <div key={d.department} className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-4 py-1.5">
                <Building2 className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-medium">{d.department}</span>
                <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">{d.n}</span>
              </div>
            ))}
            {(!analytics?.byDept?.length) && <p className="text-sm text-muted-foreground">No open requisitions</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Requisitions Tab ─────────────────────────────────────────────────────────────

function RequisitionsTab({ onViewPipeline }: { onViewPipeline: (id: string, title: string) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const { data: reqs = [], refetch } = trpc.recruitment.requisitions.list.useQuery({ search, status: statusFilter || undefined }, mergeTrpcQueryOpts("recruitment.requisitions.list", undefined));
  const updateReq = trpc.recruitment.requisitions.update.useMutation({
    onSuccess: () => { toast.success("Requisition updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-background w-60" placeholder="Search jobs..." />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-background">
            <option value="">All Status</option>
            {["draft","open","on_hold","closed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>
        <PermissionGate module="recruitment" action="write">
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> New Requisition
          </button>
        </PermissionGate>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["#","Job Title","Department","Location","Type","Level","Openings","Status","Target Date","Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No job requisitions found</td></tr>
            )}
            {reqs.map((r: any) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.number}</td>
                <td className="px-4 py-3 font-medium">{r.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.department}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.location ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{r.type?.replace("_"," ")}</td>
                <td className="px-4 py-3 capitalize">{r.level}</td>
                <td className="px-4 py-3">{r.filled}/{r.openings}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${JOB_STATUS_STYLES[r.status ?? ""] ?? "bg-slate-100"}`}>{(r.status ?? "unknown").replace("_"," ")}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.targetDate ? new Date(r.targetDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => onViewPipeline(r.id, r.title)} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium text-left">
                      Pipeline <ArrowRight className="w-3 h-3" />
                    </button>
                    <PermissionGate module="recruitment" action="write">
                      <div className="flex flex-wrap gap-1">
                        {r.status === "draft" && (
                          <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-800 hover:bg-green-100"
                            onClick={() => updateReq.mutate({ id: r.id, status: "open" })} disabled={updateReq.isPending}>Publish</button>
                        )}
                        {r.status === "open" && (
                          <>
                            <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              onClick={() => updateReq.mutate({ id: r.id, status: "on_hold" })} disabled={updateReq.isPending}>Hold</button>
                            <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted"
                              onClick={() => updateReq.mutate({ id: r.id, status: "closed" })} disabled={updateReq.isPending}>Close</button>
                          </>
                        )}
                        {r.status === "on_hold" && (
                          <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-800"
                            onClick={() => updateReq.mutate({ id: r.id, status: "open" })} disabled={updateReq.isPending}>Resume</button>
                        )}
                      </div>
                    </PermissionGate>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewReqModal onClose={() => setShowNew(false)} onCreated={() => refetch()} />}
    </div>
  );
}

// ── Pipeline (Kanban) Tab ─────────────────────────────────────────────────────────

function PipelineTab({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const { data: pipeline, refetch } = trpc.recruitment.applications.pipeline.useQuery({ jobId }, mergeTrpcQueryOpts("recruitment.applications.pipeline", undefined));
  const moveStage = trpc.recruitment.applications.moveStage.useMutation({
    onSuccess: () => { toast.success("Stage updated"); refetch(); },
    onError: e => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Showing pipeline for:</span>
        <span className="font-semibold text-sm">{jobTitle}</span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{pipeline?.total ?? 0} candidates</span>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {PIPELINE_STAGES.map(stage => {
            const cards = pipeline?.byStage?.[stage.key] ?? [];
            return (
              <div key={stage.key} className="w-52 flex-shrink-0">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-2 ${stage.color}`}>
                  <span className="text-xs font-semibold">{stage.label}</span>
                  <span className="text-xs bg-white/60 rounded-full px-1.5">{cards.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {cards.map((c: any) => (
                    <div key={c.application.id} className="bg-card border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="font-semibold text-sm">{c.candidate.firstName} {c.candidate.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.candidate.currentTitle ?? "Candidate"}</p>
                      {c.candidate.experience != null && (
                        <p className="text-xs text-muted-foreground">{c.candidate.experience}y exp</p>
                      )}
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {PIPELINE_STAGES.filter(s => s.key !== stage.key && s.key !== "rejected").slice(0, 2).map(ns => (
                          <button key={ns.key} onClick={() => moveStage.mutate({ applicationId: c.application.id, stage: ns.key as any })} className="text-xs px-1.5 py-0.5 border border-border rounded hover:bg-muted transition-colors truncate max-w-[80px]">{ns.label} →</button>
                        ))}
                        <button onClick={() => moveStage.mutate({ applicationId: c.application.id, stage: "rejected" })} className="text-xs px-1.5 py-0.5 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors">✕</button>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && <div className="text-xs text-muted-foreground p-2 text-center border border-dashed border-border rounded-lg">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Candidates Tab ───────────────────────────────────────────────────────────────

function CandidatesTab({ jobs, onShowAdd }: { jobs: any[]; onShowAdd: () => void }) {
  const [search, setSearch] = useState("");
  const { data: candidates = [], refetch } = trpc.recruitment.candidates.list.useQuery({ search }, mergeTrpcQueryOpts("recruitment.candidates.list", undefined));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-background w-64" placeholder="Search candidates..." />
        </div>
        <div className="flex items-center gap-3">
          <PermissionGate module="recruitment" action="write">
            <button onClick={onShowAdd} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Add Candidate
            </button>
          </PermissionGate>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Name","Current Role","Experience","Location","Source","Skills","Added"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No candidates yet</td></tr>}
            {(candidates as any[]).map((c: any) => (
              <tr key={c.id ?? c.candidate?.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.firstName ?? c.candidate?.firstName} {c.lastName ?? c.candidate?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{c.email ?? c.candidate?.email}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{c.currentTitle ?? c.candidate?.currentTitle ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{(c.experience ?? c.candidate?.experience) != null ? `${c.experience ?? c.candidate?.experience}y` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{c.location ?? c.candidate?.location ?? "—"}</td>
                <td className="px-4 py-3 capitalize text-xs">{c.source ?? c.candidate?.source ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {(c.skills ?? c.candidate?.skills ?? []).slice(0, 3).map((s: string) => <span key={s} className="text-xs bg-muted px-1.5 py-0.5 rounded">{s}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.createdAt ?? c.candidate?.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Interviews Tab ───────────────────────────────────────────────────────────────

function InterviewsTab() {
  const { data: interviews = [] } = trpc.recruitment.interviews.list.useQuery({ upcoming: false }, mergeTrpcQueryOpts("recruitment.interviews.list", undefined));

  const statusStyle: Record<string, string> = {
    scheduled:  "bg-blue-100 text-blue-700",
    completed:  "bg-green-100 text-green-700",
    cancelled:  "bg-red-100 text-red-700",
    no_show:    "bg-orange-100 text-orange-700",
  };
  const decisionStyle: Record<string, string> = {
    strong_yes: "text-green-700", yes: "text-green-600", no: "text-red-600", strong_no: "text-red-700",
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            {["Title","Type","Scheduled","Duration","Status","Overall Rating","Decision"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {interviews.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No interviews scheduled</td></tr>}
          {interviews.map((iv: any) => (
            <tr key={iv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{iv.title}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground text-xs">{iv.type?.replace("_"," ")}</td>
              <td className="px-4 py-3 text-xs">{iv.scheduledAt ? new Date(iv.scheduledAt).toLocaleString() : "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{iv.durationMins}min</td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyle[iv.status ?? ""] ?? "text-muted-foreground bg-muted"}`}>{(iv.status ?? "—").replace("_", " ")}</span></td>
              <td className="px-4 py-3">
                {iv.overallRating ? <div className="flex gap-0.5">{Array.from({length:5},(_,i) => <Star key={i} className={`w-3 h-3 ${i < iv.overallRating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />)}</div> : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className={`px-4 py-3 text-xs font-medium capitalize ${decisionStyle[iv.decision ?? ""] ?? "text-muted-foreground"}`}>
                {iv.decision?.replace("_"," ") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Offers Tab ───────────────────────────────────────────────────────────────────

function OffersTab() {
  const { data: offers = [] } = trpc.recruitment.offers.list.useQuery({}, mergeTrpcQueryOpts("recruitment.offers.list", undefined));
  const updateStatus = trpc.recruitment.offers.updateStatus.useMutation({
    onSuccess: () => toast.success("Offer status updated"),
    onError: e => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            {["Title","Dept","Salary (Base)","Variable","Currency","Status","Sent","Expiry","Actions"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offers.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No offers yet</td></tr>}
          {offers.map((o: any) => (
            <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{o.title}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{o.department ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{o.baseSalary ? `₹${o.baseSalary.toLocaleString()}` : "—"}</td>
              <td className="px-4 py-3 text-xs">{o.variablePay ? `₹${o.variablePay.toLocaleString()}` : "—"}</td>
              <td className="px-4 py-3 text-xs">{o.currency}</td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${OFFER_STATUS_STYLES[o.status]}`}>{o.status}</span></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{o.sentAt ? new Date(o.sentAt).toLocaleDateString() : "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{o.expiryDate ? new Date(o.expiryDate).toLocaleDateString() : "—"}</td>
              <td className="px-4 py-3">
                {o.status === "draft" && (
                  <button onClick={() => updateStatus.mutate({ id: o.id, status: "sent" })} className="text-xs text-primary hover:underline font-medium flex items-center gap-1"><Send className="w-3 h-3" /> Send</button>
                )}
                {o.status === "sent" && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus.mutate({ id: o.id, status: "accepted" })} className="text-xs text-green-600 hover:underline font-medium">Accept</button>
                    <button onClick={() => updateStatus.mutate({ id: o.id, status: "declined" })} className="text-xs text-red-600 hover:underline font-medium">Decline</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard",     label: "Dashboard",     icon: BarChart2 },
  { key: "requisitions",  label: "Requisitions",  icon: Briefcase },
  { key: "pipeline",      label: "Pipeline",      icon: Layers },
  { key: "candidates",    label: "Candidates",    icon: Users },
  { key: "interviews",    label: "Interviews",    icon: Calendar },
  { key: "offers",        label: "Offers",        icon: FileText },
];

export default function RecruitmentPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const [pipelineJobTitle, setPipelineJobTitle] = useState<string>("");
  const [showAddCandidate, setShowAddCandidate] = useState(false);

  const { data: analytics } = trpc.recruitment.analytics.useQuery({ days: 90 }, mergeTrpcQueryOpts("recruitment.analytics", undefined));
  const { data: jobs = [] } = trpc.recruitment.requisitions.list.useQuery({}, mergeTrpcQueryOpts("recruitment.requisitions.list", undefined));

  if (!can("recruitment", "read")) return <AccessDenied module="recruitment" />;

  const handleViewPipeline = (jobId: string, jobTitle: string) => {
    setPipelineJobId(jobId);
    setPipelineJobTitle(jobTitle);
    setTab("pipeline");
  };

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Recruitment</h1>
              <p className="text-sm text-muted-foreground">Job requisitions, candidate pipeline, interviews, and offers</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-400" />
          <span>Live data</span>
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
                tab === t.key
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

      {/* Tab Content */}
      <div>
        {tab === "dashboard"    && <DashboardTab analytics={analytics} />}
        {tab === "requisitions" && <RequisitionsTab onViewPipeline={handleViewPipeline} />}
        {tab === "pipeline"     && pipelineJobId && <PipelineTab jobId={pipelineJobId} jobTitle={pipelineJobTitle} />}
        {tab === "pipeline"     && !pipelineJobId && (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Select a job requisition to view its candidate pipeline</p>
            <button onClick={() => setTab("requisitions")} className="text-sm text-primary hover:underline font-medium">Browse Requisitions →</button>
          </div>
        )}
        {tab === "candidates"   && <CandidatesTab jobs={jobs} onShowAdd={() => setShowAddCandidate(true)} />}
        {tab === "interviews"   && <InterviewsTab />}
        {tab === "offers"       && <OffersTab />}
      </div>

      {showAddCandidate && <AddCandidateModal jobs={jobs} onClose={() => setShowAddCandidate(false)} onCreated={() => {}} />}
    </div>
  );
}
