"use client";

import { useState } from "react";
import {
  Users, UserPlus, UserMinus, Clock, BarChart2, TrendingDown,
  TrendingUp, Building2, MapPin, Calendar, Briefcase, Award,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

type Tab = "overview" | "headcount" | "attrition" | "leave" | "grades";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Mini bar chart ─────────────────────────────────────────────────────────────

function MiniBar({ data, valueKey, labelKey, color = "bg-primary" }: {
  data: any[]; valueKey: string; labelKey: string; color?: string;
}) {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-28 truncate">{d[labelKey] ?? "—"}</span>
          <div className="flex-1 bg-muted rounded-full h-2">
            <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-6 text-right">{d[valueKey]}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground">No data available</p>}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({ summary, headcount }: { summary: any; headcount: any }) {
  const kpis = [
    { label: "Total Headcount",   value: summary?.total ?? 0,          icon: Users,     color: "text-blue-600 bg-blue-50",    delta: null },
    { label: "New Hires (30d)",   value: summary?.newHiresLast30 ?? 0, icon: UserPlus,  color: "text-green-600 bg-green-50",  delta: "positive" },
    { label: "On Leave",          value: summary?.onLeave ?? 0,        icon: Clock,     color: "text-amber-600 bg-amber-50",  delta: null },
    { label: "Pending Leaves",    value: summary?.pendingLeaves ?? 0,  icon: Calendar,  color: "text-purple-600 bg-purple-50", delta: null },
    { label: "Attrition Rate",    value: `${headcount?.attritionRate ?? 0}%`, icon: TrendingDown, color: "text-red-600 bg-red-50", delta: null },
    { label: "Resignations",      value: headcount?.resigned ?? 0,     icon: UserMinus, color: "text-rose-600 bg-rose-50",   delta: null },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-2 rounded-xl w-fit mb-3 ${k.color}`}><k.icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Headcount by Department</h3>
          <MiniBar data={headcount?.byDept ?? []} valueKey="n" labelKey="dept" color="bg-blue-500" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Headcount by Location</h3>
          <MiniBar data={(headcount?.byLocation ?? []).filter((d: any) => d.location)} valueKey="n" labelKey="location" color="bg-indigo-400" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Employment Type Mix</h3>
          <div className="flex flex-wrap gap-3">
            {(headcount?.byEmploymentType ?? []).map((e: any) => (
              <div key={e.type} className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-3 py-1.5">
                <span className="text-sm capitalize">{e.type?.replace("_"," ") ?? "—"}</span>
                <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium">{e.n}</span>
              </div>
            ))}
            {(!headcount?.byEmploymentType?.length) && <p className="text-sm text-muted-foreground">No data</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Active Employees</span>
              <span className="font-bold text-blue-600">{headcount?.total ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">New Joiners (period)</span>
              <span className="font-bold text-green-600">+{headcount?.newHires ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Exits (period)</span>
              <span className="font-bold text-red-600">{headcount?.resigned ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Net Change</span>
              <span className={`font-bold ${(headcount?.newHires ?? 0) - (headcount?.resigned ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {(headcount?.newHires ?? 0) - (headcount?.resigned ?? 0) >= 0 ? "+" : ""}{(headcount?.newHires ?? 0) - (headcount?.resigned ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Headcount Tab ──────────────────────────────────────────────────────────────

function HeadcountTab({ headcount, tenure }: { headcount: any; tenure: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Department Breakdown</h3>
        <MiniBar data={headcount?.byDept ?? []} valueKey="n" labelKey="dept" color="bg-blue-500" />
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Location Distribution</h3>
        <MiniBar data={(headcount?.byLocation ?? []).filter((d: any) => d.location)} valueKey="n" labelKey="location" color="bg-teal-500" />
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Tenure Distribution</h3>
        <div className="space-y-2">
          {(tenure ?? []).map((t: any) => {
            const max = Math.max(...(tenure ?? []).map((x: any) => x.value), 1);
            const colors: Record<string, string> = { "<1yr": "bg-blue-400", "1-2yr": "bg-indigo-400", "2-5yr": "bg-purple-400", "5-10yr": "bg-violet-500", ">10yr": "bg-fuchsia-500" };
            return (
              <div key={t.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14">{t.label}</span>
                <div className="flex-1 bg-muted rounded-full h-3">
                  <div className={`${colors[t.label] ?? "bg-primary"} rounded-full h-3 transition-all`} style={{ width: `${(t.value / max) * 100}%` }} />
                </div>
                <span className="text-xs font-medium w-6 text-right">{t.value}</span>
              </div>
            );
          })}
          {(!tenure?.length) && <p className="text-xs text-muted-foreground">No tenure data</p>}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Employment Types</h3>
        <div className="grid grid-cols-2 gap-3">
          {(headcount?.byEmploymentType ?? []).map((e: any) => (
            <div key={e.type} className="bg-muted/50 border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{e.n}</p>
              <p className="text-xs text-muted-foreground capitalize mt-1">{e.type?.replace("_"," ") ?? "Other"}</p>
            </div>
          ))}
          {(!headcount?.byEmploymentType?.length) && <p className="text-sm text-muted-foreground col-span-2">No data</p>}
        </div>
      </div>
    </div>
  );
}

// ── Attrition Tab ──────────────────────────────────────────────────────────────

function AttritionTab({ attrition, headcount }: { attrition: any; headcount: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-red-600">{headcount?.attritionRate ?? 0}%</div>
          <div className="text-xs text-muted-foreground">Overall Attrition Rate</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold">{headcount?.resigned ?? 0}</div>
          <div className="text-xs text-muted-foreground">Total Exits (Period)</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold">{headcount?.newHires ?? 0}</div>
          <div className="text-xs text-muted-foreground">New Hires (Period)</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className={`text-2xl font-bold ${(headcount?.newHires ?? 0) >= (headcount?.resigned ?? 0) ? "text-green-600" : "text-red-600"}`}>
            {(headcount?.newHires ?? 0) >= (headcount?.resigned ?? 0) ? "+" : ""}{(headcount?.newHires ?? 0) - (headcount?.resigned ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground">Net Headcount Change</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Monthly Exits Trend</h3>
          <div className="space-y-2">
            {(attrition?.monthly ?? []).map((m: any) => {
              const max = Math.max(...(attrition?.monthly ?? []).map((x: any) => x.exits), 1);
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">{m.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="bg-red-400 rounded-full h-2" style={{ width: `${(m.exits / max) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-4 text-right">{m.exits}</span>
                </div>
              );
            })}
            {(!attrition?.monthly?.length) && <p className="text-xs text-muted-foreground">No attrition data yet</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Exits by Department</h3>
          <MiniBar data={attrition?.byDept ?? []} valueKey="exits" labelKey="dept" color="bg-rose-400" />
        </div>
      </div>
    </div>
  );
}

// ── Leave Tab ──────────────────────────────────────────────────────────────────

function LeaveTab({ leaveData }: { leaveData: any }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: leave } = trpc.workforce.leaveAnalytics.useQuery({ year });

  const ld = leave ?? leaveData;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Year:</label>
        <select value={year} onChange={e => setYear(+e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background">
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Leave Requests by Type</h3>
          <MiniBar data={ld?.byType ?? []} valueKey="n" labelKey="type" color="bg-purple-400" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Leave Status Breakdown</h3>
          <div className="grid grid-cols-2 gap-3">
            {(ld?.byStatus ?? []).map((s: any) => {
              const colors: Record<string, string> = { approved: "text-green-600", pending: "text-amber-600", rejected: "text-red-600", cancelled: "text-gray-500" };
              return (
                <div key={s.status} className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${colors[s.status] ?? ""}`}>{s.n}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                </div>
              );
            })}
            {(!ld?.byStatus?.length) && <p className="text-sm text-muted-foreground col-span-2">No leave data for {year}</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 md:col-span-2">
          <h3 className="font-semibold mb-4">Monthly Leave Approvals ({year})</h3>
          <div className="flex items-end gap-2 h-24">
            {MONTH_NAMES.map((m, i) => {
              const month = i + 1;
              const d = (ld?.monthly ?? []).find((x: any) => Number(x.month) === month);
              const val = d?.n ?? 0;
              const max = Math.max(...MONTH_NAMES.map((_, j) => {
                const x = (ld?.monthly ?? []).find((r: any) => Number(r.month) === j + 1);
                return x?.n ?? 0;
              }), 1);
              const pct = (val / max) * 100;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${pct}%`, minHeight: val > 0 ? "4px" : "0", backgroundColor: "hsl(var(--primary)/0.7)" }} />
                  <span className="text-[10px] text-muted-foreground">{m}</span>
                </div>
              );
            })}
          </div>
          {(!ld?.monthly?.length) && <p className="text-xs text-muted-foreground mt-2">No leave approvals in {year}</p>}
        </div>
        {ld?.balances?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 md:col-span-2">
            <h3 className="font-semibold mb-4">Average Leave Balances ({year})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Leave Type","Avg Entitlement","Avg Used","Avg Remaining","Utilisation"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ld.balances.map((b: any) => {
                    const entitlement = Number(b.avgTotal ?? b.avgEntitlement ?? 0);
                    const used = Number(b.avgUsed ?? 0);
                    const pending = Number(b.avgPending ?? 0);
                    const remaining = Math.max(0, entitlement - used);
                    const utilisation = entitlement > 0 ? Math.round((used / entitlement) * 100) : 0;
                    return (
                      <tr key={b.type} className="border-t border-border">
                        <td className="px-3 py-2 capitalize font-medium">{b.type?.replace("_"," ")}</td>
                        <td className="px-3 py-2">{Math.round(entitlement)}</td>
                        <td className="px-3 py-2 text-amber-600">{Math.round(used)}</td>
                        <td className="px-3 py-2 text-green-600">{Math.round(remaining)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-1.5 max-w-20">
                              <div className="bg-amber-400 rounded-full h-1.5" style={{ width: `${Math.min(utilisation, 100)}%` }} />
                            </div>
                            <span className="text-xs">{utilisation}%</span>
                            {pending > 0 && <span className="text-[10px] text-muted-foreground">({Math.round(pending)} pending)</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Grade Distribution Tab ─────────────────────────────────────────────────────

function GradesTab({ grades }: { grades: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Grade / Level Distribution</h3>
        <MiniBar data={(grades?.byGrade ?? []).filter((g: any) => g.grade)} valueKey="n" labelKey="grade" color="bg-violet-500" />
        {(!grades?.byGrade?.length) && <p className="text-sm text-muted-foreground">No grade data available</p>}
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Management Span</h3>
        <div className="space-y-4">
          <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Total Managers</p>
              <p className="text-xs text-muted-foreground">People with direct reports</p>
            </div>
            <span className="text-3xl font-bold">{grades?.managersCount ?? 0}</span>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Individual Contributors</p>
              <p className="text-xs text-muted-foreground">Non-managers</p>
            </div>
            <span className="text-3xl font-bold">{Math.max(0, (grades?.byGrade ?? []).reduce((s: number, g: any) => s + (g.n ?? 0), 0) - (grades?.managersCount ?? 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview",  label: "Overview",     icon: BarChart2 },
  { key: "headcount", label: "Headcount",    icon: Users },
  { key: "attrition", label: "Attrition",    icon: TrendingDown },
  { key: "leave",     label: "Leave",        icon: Calendar },
  { key: "grades",    label: "Grades",       icon: Award },
];

export default function PeopleAnalyticsPage() {
  const { hasPermission } = useRBAC();
  const [tab, setTab]   = useState<Tab>("overview");
  const [period, setPeriod] = useState(180);

  const { data: summary }   = trpc.workforce.summary.useQuery();
  const { data: headcount } = trpc.workforce.headcount.useQuery({ days: period });
  const { data: tenure }    = trpc.workforce.tenure.useQuery();
  const { data: attrition } = trpc.workforce.attrition.useQuery({ months: 12 });
  const { data: leaveData } = trpc.workforce.leaveAnalytics.useQuery({ year: new Date().getFullYear() });
  const { data: grades }    = trpc.workforce.gradeDistribution.useQuery();

  if (!hasPermission("workforce_analytics", "read")) return <AccessDenied />;

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <BarChart2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">People & Workforce Analytics</h1>
            <p className="text-sm text-muted-foreground">Headcount, attrition, leave utilisation, and grade insights</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Period:</label>
          <select value={period} onChange={e => setPeriod(+e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last 12 months</option>
          </select>
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

      {/* Content */}
      <div>
        {tab === "overview"  && <OverviewTab summary={summary} headcount={headcount} />}
        {tab === "headcount" && <HeadcountTab headcount={headcount} tenure={tenure} />}
        {tab === "attrition" && <AttritionTab attrition={attrition} headcount={headcount} />}
        {tab === "leave"     && <LeaveTab leaveData={leaveData} />}
        {tab === "grades"    && <GradesTab grades={grades} />}
      </div>
    </div>
  );
}
