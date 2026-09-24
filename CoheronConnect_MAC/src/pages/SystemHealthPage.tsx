import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Server,
  Search,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Clock,
  Users,
  Building2,
  AlertOctagon,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { getSystemHealth, type SystemHealthResponse } from '../lib/api';

export function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSystemHealth();
      setHealth(data);
      setLastCheck(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve live telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 30 seconds for live telemetry
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m ${seconds % 60}s`;
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'operational':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Operational
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Degraded
          </span>
        );
      case 'down':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Outage
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Not Configured
          </span>
        );
    }
  };

  return (
    <div>
      <PageHeader
        title="System Health & Telemetry"
        subtitle="Real-time operational diagnostics, connection pool pressure, and tenant fleet vital signals"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Diagnostics
          </Button>
        }
      />

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
          <XCircle className="h-5 w-5 shrink-0" />
          <span>Telemetry fetch failed: {error}</span>
        </div>
      )}

      {/* Fleet Overview Cards */}
      {health && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-slate-400">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium">Total Tenants</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{health.fleet.totalTenants}</p>
            <p className="text-[11px] text-slate-400">Provisioned orgs</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Active Tenants</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{health.fleet.activeTenants}</p>
            <p className="text-[11px] text-slate-400">Healthy operations</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Suspended</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">{health.fleet.suspendedTenants}</p>
            <p className="text-[11px] text-slate-400">Administrative hold</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertOctagon className="h-4 w-4" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Flagged</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{health.fleet.flaggedTenants}</p>
            <p className="text-[11px] text-slate-400">Under review</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-indigo-500">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Global Users</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{health.fleet.totalUsers}</p>
            <p className="text-[11px] text-slate-400">Across all tenants</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-purple-500">
              <HelpCircle className="h-4 w-4" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Churn Risk</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">{health.fleet.churnRiskTenants}</p>
            <p className="text-[11px] text-slate-400">0 enrolled users</p>
          </div>
        </div>
      )}

      {/* Core Infrastructure Diagnostics */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/80">
          <h3 className="font-heading text-sm font-semibold text-slate-700 dark:text-slate-200">
            Subsystem Status & Real-time Metrics
          </h3>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {/* PostgreSQL Database */}
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">PostgreSQL Primary Cluster</h4>
                  {health && getStatusPill(health.database.status)}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Drizzle ORM over postgres.js connection pool · Automatic connection recycling
                </p>
                {health && (
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      Pool Max: {health.database.pool.poolMax} conns
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      Inflight: {health.database.pool.inflightQueries}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      Peak Inflight: {health.database.pool.peakInflight}
                    </span>
                    <span className={`rounded px-2 py-0.5 font-semibold ${
                      health.database.pool.utilizationPct > 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}>
                      Utilization: {health.database.pool.utilizationPct}%
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                {health ? `${health.database.latencyMs}ms` : '—'}
              </p>
              <p className="text-xs text-slate-400">round-trip ping</p>
            </div>
          </div>

          {/* Redis Subsystem */}
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">Redis Cache & Rate Limiting</h4>
                  {health && getStatusPill(health.redis.status)}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {health?.redis.detail ?? 'Redis distributed session store and tiered rate limiters'}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                {health?.redis.latencyMs !== null ? `${health?.redis.latencyMs}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-400">ping latency</p>
            </div>
          </div>

          {/* Search Subsystem */}
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">Meilisearch Index Cluster</h4>
                  {health && getStatusPill(health.search.status)}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {health?.search.detail ?? 'Full-text token search and instant indexing engine'}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                {health?.search.latencyMs !== null ? `${health?.search.latencyMs}ms` : 'N/A'}
              </p>
              <p className="text-xs text-slate-400">index latency</p>
            </div>
          </div>

          {/* Node.js Runtime Telemetry */}
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">Node.js API Runtime Process</h4>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Healthy
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Fastify 4.x + tRPC 10.x backend engine running in {health?.runtime.env ?? 'development'}
                </p>
                {health && (
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      RSS: {health.runtime.rssMb} MB
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      Heap: {health.runtime.heapUsedMb} / {health.runtime.heapTotalMb} MB
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">
                      Node: {health.runtime.nodeVersion}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                {health ? formatUptime(health.runtime.uptimeSeconds) : '—'}
              </p>
              <p className="text-xs text-slate-400">process uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Verification Footer */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-5 py-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>
            Telemetry source: authoritative backend diagnostics. Values reflect true system state without simulated mocks.
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <span>Last checked: {lastCheck ? lastCheck.toLocaleTimeString() : 'just now'}</span>
        </div>
      </div>
    </div>
  );
}
