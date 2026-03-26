"use client";

import Link from "next/link";
import {
  Scale, Gavel, Briefcase, AlertTriangle, Calendar,
  ChevronRight, CheckCircle2, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

function KPICard({ label, value, color, href, icon: Icon, isLoading }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean;
}) {
  const content = (
    <div className="bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    label: "Legal Service Delivery", href: "/app/legal",      icon: Gavel,     color: "text-blue-600 bg-blue-50",
    description: "Legal matter management, contract review requests, litigation tracking, external counsel.",
  },
  {
    label: "Secretarial & CS",       href: "/app/secretarial", icon: Briefcase, color: "text-purple-600 bg-purple-50",
    description: "Corporate compliance, MCA/ROC filings, board & AGM management, share capital, statutory registers.",
  },
];

export default function LegalGovernanceDashboard() {
  const { can } = useRBAC();
  if (!can("grc", "read") && !can("audit", "read")) {
    return <AccessDenied module="Legal & Governance" />;
  }

  const { data: matters, isLoading: loadingMatters } = trpc.legal.listMatters.useQuery({ limit: 5 });
  const { data: allMatters, isLoading: loadingAllMatters } = trpc.legal.listMatters.useQuery({ limit: 200 });
  const { data: audits, isLoading: loadingAudits } = trpc.grc.listAudits.useQuery();
  const { data: risks, isLoading: loadingRisks } = trpc.grc.listRisks.useQuery({});

  const activeMatters = allMatters ? allMatters.filter((m) => m.status !== "closed" && m.status !== "resolved").length : 0;
  const openRisks = risks ? risks.filter((r) => r.status !== "closed" && r.status !== "accepted").length : 0;
  const scheduledAudits = audits ? audits.filter((a) => a.status === "planned" || a.status === "in_progress").length : 0;

  const alerts = [
    activeMatters > 0
      ? { color: "bg-blue-500",    text: `${activeMatters} active legal matter${activeMatters !== 1 ? "s" : ""} require attention` }
      : null,
    openRisks > 0
      ? { color: "bg-orange-500",  text: `${openRisks} open risk item${openRisks !== 1 ? "s" : ""} pending resolution` }
      : null,
    scheduledAudits > 0
      ? { color: "bg-yellow-400",  text: `${scheduledAudits} audit${scheduledAudits !== 1 ? "s" : ""} planned or in progress` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Matters",  v: loadingAllMatters ? "…" : String(activeMatters) },
      { k: "Total",    v: loadingAllMatters ? "…" : String(allMatters?.length ?? 0) },
    ],
    [
      { k: "Audits",   v: loadingAudits ? "…" : String(audits?.length ?? 0) },
      { k: "Risks",    v: loadingRisks  ? "…" : String(risks?.length ?? 0) },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
            <Scale className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Legal & Governance</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Legal & Governance Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">2 modules · live data</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded text-[11px] text-foreground/80">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.color}`} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <KPICard label="Active Legal Matters" value={activeMatters} color="text-blue-700" icon={Gavel} href="/app/legal" isLoading={loadingAllMatters} />
        <KPICard label="Total Matters" value={allMatters?.length ?? 0} color="text-purple-700" icon={Scale} href="/app/legal" isLoading={loadingAllMatters} />
        <KPICard label="Open Risk Items" value={openRisks} color="text-orange-700" icon={AlertTriangle} href="/app/grc" isLoading={loadingRisks} />
        <KPICard label="Scheduled Audits" value={scheduledAudits} color="text-green-700" icon={CheckCircle2} href="/app/grc" isLoading={loadingAudits} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODULES.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Link key={m.label} href={m.href}
              className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all group flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
              </div>
              <div className="flex gap-3 mt-auto pt-1 border-t border-border">
                {moduleStats[idx]?.map((s) => (
                  <div key={s.k} className="text-center">
                    <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Active Matters */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Gavel className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Active Legal Matters</span>
            </div>
            <Link href="/app/legal" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingMatters ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {(matters ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-4 text-[12px]">No legal matters found</td></tr>
                ) : (matters ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-[160px]"><span className="truncate block text-foreground">{m.title}</span></td>
                    <td><span className="status-badge text-muted-foreground bg-muted capitalize">{m.type?.replace(/_/g, " ")}</span></td>
                    <td>
                      <span className={`status-badge text-[10px] capitalize ${m.status === "active" || m.status === "open" ? "text-blue-700 bg-blue-100" : m.status === "closed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                        {m.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit Plans */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Audit Plans</span>
            </div>
            <Link href="/app/grc" className="text-[11px] text-primary hover:underline">GRC →</Link>
          </div>
          {loadingAudits ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(audits ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-[12px]">No audit plans found</div>
              ) : (audits ?? []).slice(0, 5).map((a) => (
                <div key={a.id} className={`flex items-start gap-3 px-3 py-2.5`}>
                  <div className="flex-shrink-0 text-center w-16">
                    <div className="text-[11px] font-bold text-foreground">
                      {a.startDate ? new Date(a.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`status-badge text-[9px] capitalize ${a.status === "completed" ? "text-green-700 bg-green-100" : a.status === "in_progress" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>
                        {a.status?.replace(/_/g, " ") ?? "Planned"}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/80 leading-snug">{a.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
