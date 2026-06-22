"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAnalyticsOverview } from "@/lib/mac-api";
import type { AnalyticsOverview } from "@/lib/mac-api";

const PLAN_COLORS: Record<string, string> = {
  free: "#94a3b8",
  starter: "#60a5fa",
  professional: "#818cf8",
  enterprise: "#a78bfa",
};

function DonutChart({ data }: { data: { plan: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-sm text-slate-400">No data</p>;
  let cumulative = 0;
  const slices = data.map((d) => {
    const pct = d.count / total;
    const start = cumulative;
    cumulative += pct;
    return { ...d, start, pct };
  });
  const r = 60, cx = 80, cy = 80, strokeW = 24;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={PLAN_COLORS[s.plan] ?? "#e2e8f0"}
            strokeWidth={strokeW}
            strokeDasharray={`${s.pct * circumference} ${circumference}`}
            strokeDashoffset={-(s.start * circumference)}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-slate-700" fontSize="20">{total}</text>
      </svg>
      <ul className="space-y-1.5">
        {slices.map((s) => (
          <li key={s.plan} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full inline-block" style={{ background: PLAN_COLORS[s.plan] ?? "#e2e8f0" }} />
            <span className="capitalize text-slate-700">{s.plan}</span>
            <span className="ml-auto font-semibold text-slate-800">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupByMonth(orgs: { createdAt: string }[], months: string[]) {
  const counts: Record<string, number> = {};
  months.forEach((m) => (counts[m] = 0));
  orgs.forEach((o) => {
    const m = o.createdAt.slice(0, 7);
    if (m in counts) counts[m]++;
  });
  return months.map((m) => ({ month: m, count: counts[m] }));
}

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalyticsOverview()
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!data) return null;

  const months6 = getLastNMonths(6);
  const months12 = getLastNMonths(12);
  const monthly6 = groupByMonth(data.recentOrgs, months6);
  const monthly12 = groupByMonth(data.recentOrgs, months12);
  const maxCount = Math.max(...monthly12.map((m) => m.count), 1);

  const cohorts = months6.map((month) => {
    const created = data.recentOrgs.filter((o) => o.createdAt.slice(0, 7) === month).length;
    return { month, created, active: created, churned: 0 };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Analytics</h1>
        <p className="text-sm text-slate-500">Platform-wide usage analytics and cohort reports</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Orgs", value: data.orgCount },
          { label: "Total Users", value: data.userCount },
          { label: "New Orgs (this month)", value: monthly6[monthly6.length - 1]?.count ?? 0 },
          { label: "New Orgs (last month)", value: monthly6[monthly6.length - 2]?.count ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Donut */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Orgs by Plan</h2>
          <DonutChart data={data.orgsByPlan as { plan: string; count: number }[]} />
        </div>

        {/* Bar chart — 12 month trend */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Org Creation (12 months)</h2>
          <div className="flex items-end gap-1 h-36">
            {monthly12.map(({ month, count }) => (
              <div key={month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-indigo-500 transition-all"
                  style={{ height: `${(count / maxCount) * 120}px`, minHeight: count > 0 ? "4px" : "0" }}
                  title={`${month}: ${count}`}
                />
                <span className="text-[9px] text-slate-400 rotate-45 origin-left">{month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cohort table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Cohort Analysis (Last 6 Months)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Cohort Month", "Orgs Created", "Still Active", "Churned"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {cohorts.map(({ month, created, active, churned }) => (
              <tr key={month} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{month}</td>
                <td className="px-4 py-3 text-slate-700">{created}</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">{active}</td>
                <td className="px-4 py-3 text-slate-400">{churned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
