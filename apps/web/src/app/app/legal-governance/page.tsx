"use client";

import Link from "next/link";
import {
  Scale, Gavel, Briefcase, AlertTriangle, Calendar,
  ChevronRight, CheckCircle2, Loader2, FileWarning, FileCheck,
  IndianRupee,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

type GovernanceSummary = {
  legal: {
    activeMatters: number;
    totalMatters: number;
    openRequests: number;
    openInvestigations: number;
  } | null;
  secretarial: {
    upcomingMeetings: number;
    overdueFilings: number;
    upcomingFilings: number;
    totalDirectors: number;
    kycExpiring: number;
  } | null;
  contracts: {
    active: number;
    expiringSoon: number;
    expiringWithin30: Array<{
      id: string;
      number: string | null;
      title: string;
      counterparty: string | null;
      endDate: string | null;
      status: string | null;
    }>;
  } | null;
  indiaCompliance: {
    overdue: number;
    dueWithin30: number;
    totalPenaltyInr: number;
    upcoming: Array<{
      id: string;
      eventName: string;
      mcaForm: string | null;
      complianceType: string;
      dueDate: string | null;
      status: string;
      daysOverdue: number;
      totalPenaltyInr: number;
    }>;
  } | null;
  generatedAt: string;
};

function formatInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function KPICard({ label, value, color, href, icon: Icon, isLoading, hint }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean; hint?: string;
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
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    id: "legal",
    label: "Legal Service Delivery", href: "/app/legal",      icon: Gavel,     color: "text-blue-600 bg-blue-50",
    description: "Legal matter management, contract review requests, litigation tracking, external counsel.",
  },
  {
    id: "secretarial",
    label: "Secretarial & CS",       href: "/app/secretarial", icon: Briefcase, color: "text-purple-600 bg-purple-50",
    description: "Corporate compliance, MCA/ROC filings, board & AGM management, share capital, statutory registers.",
  },
] as const;

export default function LegalGovernanceDashboard() {
  const { can, isAuthenticated, mergeTrpcQueryOpts } = useRBAC();

  const canLegal = can("legal", "read");
  const canSecretarial = can("secretarial", "read");
  const canContracts = can("contracts", "read");
  const canSeeHub =
    isAuthenticated && (canLegal || canSecretarial || can("grc", "read") || canContracts);

  const { data: summary, isLoading: loadingSummary } = trpc.legal.governanceSummary.useQuery(
    undefined,
    mergeTrpcQueryOpts("legal.governanceSummary", {
      enabled: canSeeHub && canLegal,
      refetchOnWindowFocus: false,
    }),
  );
  const { data: matters, isLoading: loadingMatters } = trpc.legal.listMatters.useQuery(
    { limit: 5 },
    mergeTrpcQueryOpts("legal.listMatters", {
      enabled: canSeeHub && canLegal,
      refetchOnWindowFocus: false,
    }),
  );
  const { data: filings, isLoading: loadingFilings } = trpc.secretarial.filings.upcomingAlerts.useQuery(
    undefined,
    mergeTrpcQueryOpts("secretarial.filings.upcomingAlerts", {
      enabled: canSeeHub && canSecretarial,
      refetchOnWindowFocus: false,
    }),
  );

  if (!canSeeHub) {
    return <AccessDenied module="Legal & Governance" />;
  }

  const s = (summary ?? null) as GovernanceSummary | null;
  const legalKpi = s?.legal ?? null;
  const secKpi = s?.secretarial ?? null;
  const contractsKpi = s?.contracts ?? null;
  const indiaKpi = s?.indiaCompliance ?? null;

  const alerts = [
    legalKpi && legalKpi.activeMatters > 0
      ? { color: "bg-blue-500",   text: `${legalKpi.activeMatters} active legal matter${legalKpi.activeMatters !== 1 ? "s" : ""}` }
      : null,
    contractsKpi && contractsKpi.expiringSoon > 0
      ? { color: "bg-orange-500", text: `${contractsKpi.expiringSoon} contract${contractsKpi.expiringSoon !== 1 ? "s" : ""} expiring within 30 days` }
      : null,
    secKpi && secKpi.overdueFilings > 0
      ? { color: "bg-red-500",    text: `${secKpi.overdueFilings} secretarial filing${secKpi.overdueFilings !== 1 ? "s" : ""} overdue` }
      : null,
    indiaKpi && indiaKpi.overdue > 0
      ? { color: "bg-red-500",    text: `${indiaKpi.overdue} India compliance filing${indiaKpi.overdue !== 1 ? "s" : ""} overdue · ${formatInr(indiaKpi.totalPenaltyInr)} penalty` }
      : null,
    secKpi && secKpi.kycExpiring > 0
      ? { color: "bg-yellow-400", text: `${secKpi.kycExpiring} director KYC due within 30 days` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats: Array<Array<{ k: string; v: string }>> = [
    [
      { k: "Active",  v: loadingSummary ? "…" : String(legalKpi?.activeMatters ?? "—") },
      { k: "Total",   v: loadingSummary ? "…" : String(legalKpi?.totalMatters ?? "—") },
    ],
    [
      { k: "Meetings", v: loadingSummary ? "…" : String(secKpi?.upcomingMeetings ?? (canSecretarial ? 0 : "—")) },
      { k: "Filings",  v: loadingSummary ? "…" : String(secKpi?.upcomingFilings ?? (canSecretarial ? 0 : "—")) },
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
        <span className="text-[10px] text-muted-foreground/60">
          {loadingSummary ? "Syncing…" : "Live data · 60s cache"}
        </span>
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
        <KPICard
          label="Active Matters"
          value={canLegal ? (legalKpi?.activeMatters ?? 0) : "—"}
          color="text-blue-700"
          icon={Gavel}
          href={canLegal ? "/app/legal" : undefined}
          isLoading={canLegal && loadingSummary}
          hint={canLegal ? undefined : "Legal access required"}
        />
        <KPICard
          label="Contracts Expiring (30d)"
          value={canContracts ? (contractsKpi?.expiringSoon ?? 0) : "—"}
          color="text-orange-700"
          icon={FileWarning}
          href={canContracts ? "/app/contracts" : undefined}
          isLoading={canContracts && loadingSummary}
          hint={canContracts ? undefined : "Contracts access required"}
        />
        <KPICard
          label="Upcoming Board Meetings"
          value={canSecretarial ? (secKpi?.upcomingMeetings ?? 0) : "—"}
          color="text-purple-700"
          icon={Calendar}
          href={canSecretarial ? "/app/secretarial" : undefined}
          isLoading={canSecretarial && loadingSummary}
          hint={canSecretarial ? undefined : "Secretarial access required"}
        />
        <KPICard
          label="Filings Due (30d)"
          value={canSecretarial ? (secKpi?.upcomingFilings ?? 0) : "—"}
          color={secKpi && secKpi.overdueFilings > 0 ? "text-red-700" : "text-green-700"}
          icon={secKpi && secKpi.overdueFilings > 0 ? AlertTriangle : CheckCircle2}
          href={canSecretarial ? "/app/secretarial?tab=filings" : undefined}
          isLoading={canSecretarial && loadingSummary}
          hint={
            secKpi && secKpi.overdueFilings > 0
              ? `${secKpi.overdueFilings} overdue`
              : canSecretarial ? undefined : "Secretarial access required"
          }
        />
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
                {moduleStats[idx]?.map((stat) => (
                  <div key={stat.k} className="text-center">
                    <div className="text-[13px] font-bold text-foreground">{stat.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{stat.k}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Active Matters */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Gavel className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Active Legal Matters</span>
            </div>
            {canLegal && (
              <Link href="/app/legal" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                All <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          {!canLegal ? (
            <div className="text-center text-muted-foreground py-6 text-[12px]">No legal access</div>
          ) : loadingMatters ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>Title</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {(matters ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-muted-foreground py-4 text-[12px]">No legal matters</td></tr>
                ) : (matters ?? []).map((m: any) => (
                  <tr key={m.id}>
                    <td className="max-w-[160px]"><span className="truncate block text-foreground">{m.title}</span></td>
                    <td><span className="status-badge text-muted-foreground bg-muted capitalize">{m.type?.replace(/_/g, " ")}</span></td>
                    <td>
                      <span className={`status-badge text-[10px] capitalize ${
                        m.status === "active" || m.status === "open" ? "text-blue-700 bg-blue-100" :
                        m.status === "closed" || m.status === "settled" ? "text-green-700 bg-green-100" :
                        "text-yellow-700 bg-yellow-100"
                      }`}>
                        {m.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Contracts expiring within 30 days (US-LEG-001 AC) */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <FileWarning className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Contracts Expiring (30d)</span>
            </div>
            {canContracts && (
              <Link href="/app/contracts" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                All <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          {!canContracts ? (
            <div className="text-center text-muted-foreground py-6 text-[12px]">No contracts access</div>
          ) : loadingSummary ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(contractsKpi?.expiringWithin30 ?? []).length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
                  <FileCheck className="w-4 h-4 mr-2 text-green-600" />
                  Nothing expiring in the next 30 days
                </div>
              ) : (
                (contractsKpi?.expiringWithin30 ?? []).map((c) => (
                  <Link
                    key={c.id}
                    href={`/app/contracts/${c.id}`}
                    className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-shrink-0 text-center w-16">
                      <div className="text-[11px] font-bold text-foreground">
                        {c.endDate ? new Date(c.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Expires</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {c.number && (
                          <span className="font-mono text-[10px] text-primary">{c.number}</span>
                        )}
                        {c.status && (
                          <span className={`status-badge text-[9px] capitalize ${
                            c.status === "expiring_soon" ? "text-orange-700 bg-orange-100" : "text-blue-700 bg-blue-100"
                          }`}>
                            {c.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-foreground/80 leading-snug truncate">{c.title}</p>
                      {c.counterparty && (
                        <p className="text-[10px] text-muted-foreground/70 truncate">{c.counterparty}</p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Secretarial filings due (US-LEG-001 AC: secretarial truth) */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Secretarial Filings (30d)</span>
            </div>
            {canSecretarial && (
              <Link href="/app/secretarial?tab=filings" className="text-[11px] text-primary hover:underline">All →</Link>
            )}
          </div>
          {!canSecretarial ? (
            <div className="text-center text-muted-foreground py-6 text-[12px]">No secretarial access</div>
          ) : loadingFilings ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(filings ?? []).length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  No filings due in the next 30 days
                </div>
              ) : (filings ?? []).slice(0, 5).map((f: any) => (
                <div key={f.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="flex-shrink-0 text-center w-16">
                    <div className="text-[11px] font-bold text-foreground">
                      {f.dueDate ? new Date(f.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Due</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono text-[10px] text-primary">{f.formNumber}</span>
                      <span className={`status-badge text-[9px] capitalize ${
                        f.status === "in_progress" ? "text-blue-700 bg-blue-100" :
                        f.status === "overdue" ? "text-red-700 bg-red-100" :
                        "text-muted-foreground bg-muted"
                      }`}>
                        {f.status?.replace(/_/g, " ") ?? "Upcoming"}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/80 leading-snug truncate">{f.title}</p>
                    <p className="text-[10px] text-muted-foreground/70 truncate">{f.authority}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* India compliance calendar (US-LEG-004 AC: data from india-compliance) */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">India Compliance</span>
            </div>
            {canSecretarial && (
              <Link href="/app/secretarial?tab=india-compliance" className="text-[11px] text-primary hover:underline">All →</Link>
            )}
          </div>
          {!canSecretarial ? (
            <div className="text-center text-muted-foreground py-6 text-[12px]">No secretarial access</div>
          ) : loadingSummary ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <>
              {indiaKpi && (indiaKpi.overdue > 0 || indiaKpi.totalPenaltyInr > 0) && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 border-b border-red-100 text-[10px]">
                  <span className="text-red-700 font-semibold">{indiaKpi.overdue} overdue · {indiaKpi.dueWithin30} due in 30d</span>
                  <span className="text-red-700 font-mono">{formatInr(indiaKpi.totalPenaltyInr)} penalty</span>
                </div>
              )}
              <div className="divide-y divide-border">
                {(indiaKpi?.upcoming ?? []).length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                    No upcoming compliance items
                  </div>
                ) : (indiaKpi?.upcoming ?? []).map((c) => (
                  <div key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="flex-shrink-0 text-center w-16">
                      <div className="text-[11px] font-bold text-foreground">
                        {c.dueDate ? new Date(c.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                        {c.status === "overdue" ? `+${c.daysOverdue}d` : "Due"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {c.mcaForm && <span className="font-mono text-[10px] text-primary">{c.mcaForm}</span>}
                        <span className={`status-badge text-[9px] capitalize ${
                          c.status === "overdue" ? "text-red-700 bg-red-100" :
                          c.status === "due_soon" ? "text-orange-700 bg-orange-100" :
                          "text-blue-700 bg-blue-100"
                        }`}>
                          {c.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{c.complianceType}</span>
                      </div>
                      <p className="text-[11px] text-foreground/80 leading-snug truncate">{c.eventName}</p>
                      {c.totalPenaltyInr > 0 && (
                        <p className="text-[10px] text-red-700 font-mono">{formatInr(c.totalPenaltyInr)} penalty</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
