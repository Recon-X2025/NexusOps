"use client";

// TODO: Wire to trpc.secretarial router when created

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Briefcase, Download, Plus, AlertTriangle, CheckCircle2, Clock, FileText, Users, Building2, Scale, Calendar, BookOpen, Shield } from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilingStatus = "filed" | "pending" | "overdue" | "not_due" | "in_progress";
type MeetingStatus = "scheduled" | "completed" | "cancelled";
type ResolutionType = "ordinary" | "special" | "board";

// ── Mock Data ─────────────────────────────────────────────────────────────────

const COMPANY = {
  name: "NexusOps Technologies Private Limited",
  cin: "U72900MH2021PTC362841",
  pan: "AABCN1234F",
  gstin: "27AABCN1234F1Z5",
  roc: "RoC Mumbai",
  incorporationDate: "2021-04-01",
  authorisedCapital: 50000000,
  paidUpCapital: 25000000,
  type: "Private Limited",
  category: "Company limited by shares",
  registered: "A-402, Bandra Kurla Complex, Mumbai — 400051, Maharashtra",
  fy: "April to March",
  agmDue: "2026-09-30",
};

const STATUS_COLOR: Record<FilingStatus, string> = {
  filed:       "text-green-700 bg-green-100",
  pending:     "text-orange-700 bg-orange-100",
  overdue:     "text-red-700 bg-red-100",
  not_due:     "text-muted-foreground bg-muted",
  in_progress: "text-blue-700 bg-blue-100",
};

const STATUS_LABEL: Record<FilingStatus, string> = {
  filed: "Filed", pending: "Pending", overdue: "Overdue", not_due: "Not Due", in_progress: "In Progress",
};

const MTG_TYPE_COLOR: Record<string, string> = {
  board: "text-primary bg-primary/10",
  audit: "text-purple-700 bg-purple-100",
  agm:   "text-blue-700 bg-blue-100",
  egm:   "text-orange-700 bg-orange-100",
};

const RES_TYPE_COLOR: Record<ResolutionType, string> = {
  board:    "text-primary bg-primary/10",
  ordinary: "text-blue-700 bg-blue-100",
  special:  "text-purple-700 bg-purple-100",
};

// ── Component ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "Overview",            module: "grc"       as const, action: "read"  as const },
  { key: "board",      label: "Board & Meetings",    module: "grc"       as const, action: "write" as const },
  { key: "filings",    label: "MCA / ROC Filings",   module: "grc"       as const, action: "admin" as const },
  { key: "share",      label: "Share Capital",       module: "financial" as const, action: "read"  as const },
  { key: "registers",  label: "Statutory Registers", module: "grc"       as const, action: "read"  as const },
  { key: "calendar",   label: "Compliance Calendar", module: "grc"       as const, action: "read"  as const },
];

function SecretarialContent() {
  const { can } = useRBAC();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Must be called unconditionally before any early return to satisfy Rules of Hooks
  const { data: grcAudits, isLoading: auditsLoading } = trpc.grc.listAudits.useQuery();

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
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Download className="w-3 h-3" /> Secretarial Audit Report
          </button>
          <PermissionGate module={"legal" as any} action="write">
            <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> Record Resolution
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Overdue Filings",     value: "—", color: "text-muted-foreground/50" },
          { label: "Pending Filings",     value: "—", color: "text-muted-foreground/50" },
          { label: "Board Meetings (FY)", value: "—", color: "text-muted-foreground/50" },
          { label: "Directors on Record", value: "—", color: "text-muted-foreground/50" },
          { label: "Days to AGM",         value: "—", color: "text-muted-foreground/50" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Overdue alert placeholder removed — no live filing data yet */}

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
          <div className="p-8 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Company Particulars</p>
            <p className="text-[11px] text-muted-foreground/50">Company master data, directors, and recent resolutions will appear here once the Secretarial module backend is configured.</p>
          </div>
        )}

        {/* BOARD & MEETINGS */}
        {activeTab === "board" && (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Board Meetings & Resolutions</p>
            <p className="text-[11px] text-muted-foreground/50">Board meeting minutes, attendance, agenda, and resolutions will appear here once the Secretarial module backend is configured.</p>
          </div>
        )}

        {/* MCA / ROC FILINGS */}
        {activeTab === "filings" && (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">MCA / ROC Filings</p>
            <p className="text-[11px] text-muted-foreground/50">Statutory filings (ADT-1, MGT-7, AOC-4, DIR-3 KYC etc.) will appear here once the Secretarial module backend is configured.</p>
          </div>
        )}

        {/* SHARE CAPITAL */}
        {activeTab === "share" && (
          <div className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Share Capital & ESOP</p>
            <p className="text-[11px] text-muted-foreground/50">Authorised / paid-up capital, shareholding pattern, and ESOP data will appear here once the Secretarial module backend is configured.</p>
          </div>
        )}

        {/* STATUTORY REGISTERS */}
        {activeTab === "registers" && (
          <div className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Statutory Registers</p>
            <p className="text-[11px] text-muted-foreground/50">Register of members, directors, charges, and other statutory registers will appear here once the Secretarial module backend is configured.</p>
          </div>
        )}

        {/* COMPLIANCE CALENDAR */}
        {activeTab === "calendar" && (
          <div className="p-4 space-y-4">
            <p className="text-[12px] text-muted-foreground">CS compliance calendar. Configure the Secretarial module backend to track MCA filing deadlines.</p>
            {!auditsLoading && grcAudits && (grcAudits as any[]).length > 0 && (
              <div className="border border-blue-200 bg-blue-50/20 rounded p-3">
                <p className="text-[11px] font-semibold text-blue-700 mb-2">GRC Scheduled Audits ({(grcAudits as any[]).length} from system)</p>
                <div className="space-y-1">
                  {(grcAudits as any[]).slice(0, 5).map((audit: any) => (
                    <div key={audit.id} className="flex items-center gap-2 text-[11px]">
                      <span className={`status-badge text-[10px] ${audit.status === "completed" ? "text-green-700 bg-green-100" : audit.status === "overdue" ? "text-red-700 bg-red-100" : "text-yellow-700 bg-yellow-100"}`}>{audit.status}</span>
                      <span className="text-foreground/80">{audit.name ?? audit.title ?? audit.auditName ?? "Audit"}</span>
                      <span className="text-muted-foreground/60 ml-auto">{audit.dueDate ?? audit.scheduledDate ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(!grcAudits || (grcAudits as any[]).length === 0) && !auditsLoading && (
              <div className="py-8 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No compliance calendar data yet</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">Add GRC audits or configure the Secretarial backend to populate this calendar</p>
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
