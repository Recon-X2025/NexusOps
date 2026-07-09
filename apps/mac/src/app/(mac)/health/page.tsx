"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Server,
  Building2,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getDeployStatus, getStatsTyped } from "@/lib/mac-api";
import type { DeployStatus, PlatformStats } from "@/lib/mac-api";

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function checkIcon(state: string) {
  return state === "ok" ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );
}

export default function HealthPage() {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([getDeployStatus(), getStatsTyped()]);
      setStatus(s);
      setStats(st);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load system health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const health = asRecord(status?.health ?? null);
  const overall = asString(health?.["status"]) ?? "unknown";
  const healthy = overall === "ok" || overall === "healthy";
  const checks = asRecord(health?.["checks"]) ?? {};
  const pool = asRecord(health?.["pool"]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Health</h1>
          <p className="text-sm text-slate-500">Live platform status and component checks</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !status ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Overall banner */}
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 shadow-sm ${
              healthy
                ? "border-emerald-100 bg-emerald-50/60"
                : "border-amber-100 bg-amber-50/60"
            }`}
          >
            {healthy ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            )}
            <div>
              <p className={`text-sm font-semibold ${healthy ? "text-emerald-700" : "text-amber-700"}`}>
                {healthy ? "All systems operational" : `Status: ${overall}`}
              </p>
              <p className="text-xs text-slate-500">
                API version <span className="font-mono">{status?.version ?? "unknown"}</span>
              </p>
            </div>
          </div>

          {/* Platform counts */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Organizations
                </p>
                <p className="text-2xl font-bold text-slate-800">{stats?.orgs ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <UsersIcon className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Total users
                </p>
                <p className="text-2xl font-bold text-slate-800">{stats?.users ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Component checks */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <Server className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Component checks</h2>
            </div>
            {Object.keys(checks).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Detailed checks unavailable (API health endpoint unreachable).
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {Object.entries(checks).map(([name, state]) => (
                  <li key={name} className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Database className="h-4 w-4 text-slate-400" />
                      {name}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {checkIcon(String(state))}
                      <span
                        className={String(state) === "ok" ? "text-emerald-600" : "text-red-600"}
                      >
                        {String(state)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* DB pool */}
          {pool && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <Activity className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-700">Database connection pool</h2>
              </div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
                {Object.entries(pool).map(([k, v]) => (
                  <div key={k} className="bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {k}
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-800">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
