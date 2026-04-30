"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Users, Ticket, GitBranch, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { macFetch, getStats, getOrganizations } from "@/lib/mac-api";

interface Stats {
  orgs: number;
  users: number;
  recentOrgs: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: string;
  }>;
}

interface HealthStatus {
  status: string;
  db?: string;
  redis?: string;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-800">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function HealthDot({ status }: { status?: string }) {
  if (status === "ok" || status === "healthy") {
    return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  }
  if (status === "degraded") {
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  }
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function planBadge(plan: string) {
  const map: Record<string, string> = {
    free: "bg-slate-100 text-slate-600",
    starter: "bg-blue-50 text-blue-700",
    professional: "bg-indigo-50 text-indigo-700",
    enterprise: "bg-violet-50 text-violet-700",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[plan] ?? "bg-slate-100 text-slate-600"}`}>
      {plan}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_MAC_API_URL ??
          `${window.location.protocol}//${window.location.hostname}:3001`)
      : "http://localhost:3001";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, healthRes] = await Promise.all([
        getStats(),
        fetch(`${apiUrl}/health`).then((r) => r.json() as Promise<HealthStatus>).catch(() => ({ status: "unknown" })),
      ]);
      setStats(statsData as Stats);
      setHealth(healthRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Platform Overview</h1>
          <p className="text-sm text-slate-500">CoheronConnect platform-wide metrics</p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={stats?.orgs ?? 0} icon={Building2} color="bg-indigo-500" />
        <StatCard label="Total Users" value={stats?.users ?? 0} icon={Users} color="bg-blue-500" />
        <StatCard label="Total Tickets" value="—" icon={Ticket} color="bg-violet-500" />
        <StatCard label="Active Workflows" value="—" icon={GitBranch} color="bg-emerald-500" />
      </div>

      {/* Health + Recent Orgs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Health */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">System Health</h2>
          <ul className="space-y-3">
            {[
              { label: "API Server", key: "status" },
              { label: "Database", key: "db" },
              { label: "Redis", key: "redis" },
            ].map(({ label, key }) => (
              <li key={key} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <div className="flex items-center gap-1.5">
                  <HealthDot status={health?.[key as keyof HealthStatus]} />
                  <span className="text-xs text-slate-500 capitalize">
                    {health?.[key as keyof HealthStatus] ?? "unknown"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent orgs */}
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Recent Organizations</h2>
          {stats?.recentOrgs && stats.recentOrgs.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Name</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Plan</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.recentOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 font-medium text-slate-700">{org.name}</td>
                    <td className="py-2.5">{planBadge(org.plan)}</td>
                    <td className="py-2.5 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400">No organizations yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
