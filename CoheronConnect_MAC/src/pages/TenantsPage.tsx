import { useState, useMemo } from 'react';
import {
  Building2, Search, Eye, Flag as FlagIcon, Ban, RefreshCw, Loader2, AlertCircle, UserCheck,
} from 'lucide-react';
import { useOrgs } from '../context/WizardContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { TenantDetailDrawer } from '../components/TenantDetailDrawer';
import { ImpersonationModal } from '../components/ImpersonationModal';
import { relativeTime, formatDateTime } from '../lib/time';
import type { TenantRecord } from '../lib/types';

export function TenantsPage() {
  const { tenants, loading, error, refresh, suspendTenant } = useOrgs();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selected, setSelected] = useState<TenantRecord | null>(null);
  const [impersonateTenant, setImpersonateTenant] = useState<TenantRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const plans = useMemo(() => {
    const set = new Set<string>();
    for (const t of tenants) {
      if (t.plan) set.add(t.plan);
    }
    return Array.from(set);
  }, [tenants]);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = t.companyName.toLowerCase().includes(q);
        const matchesSlug = (t.slug ?? t.tenantCode).toLowerCase().includes(q);
        if (!matchesName && !matchesSlug) return false;
      }

      if (statusFilter === 'active' && t.suspended) return false;
      if (statusFilter === 'suspended' && !t.suspended) return false;

      if (planFilter !== 'all' && t.plan !== planFilter) return false;

      return true;
    });
  }, [tenants, search, statusFilter, planFilter]);

  const handleToggleSuspend = async (t: TenantRecord) => {
    setActionError(null);
    try {
      await suspendTenant(t.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update tenant status.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Tenants / Organizations"
        subtitle="Comprehensive platform listing of all registered tenant organizations"
        actions={
          <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => refresh()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {/* Global Error Banner */}
      {(error || actionError) && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-brand-danger dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-brand-danger dark:text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold">{error ? 'Failed to fetch organizations' : 'Action failed'}</p>
              <p className="mt-0.5 text-xs font-mono">{error || actionError}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Controls & Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            {(['all', 'active', 'suspended'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${statusFilter === s
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Plan Filter */}
          {plans.length > 0 && (
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All plans</option>
              {plans.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Company</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Slug</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Plan</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Users</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Created</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Last updated</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
                      <span className="text-sm font-medium">Loading organization list…</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <Building2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-base font-medium text-slate-700 dark:text-slate-200">No organizations found</p>
                      <p className="text-xs text-slate-400">{error ? error : 'Try adjusting search or status filters.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {t.flag.flagged && <FlagIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{t.companyName}</p>
                          <p className="font-mono text-xs text-slate-400">{t.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{t.slug ?? t.tenantCode}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300 capitalize">
                        {t.plan ?? 'free'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {t.suspended ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(t.createdAt)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{relativeTime(t.lastUpdatedAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setImpersonateTenant(t)}
                          disabled={t.suspended}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={t.suspended ? 'Cannot impersonate suspended tenant' : 'Impersonate Admin'}
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setSelected(t)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-brand-blue dark:hover:bg-blue-500/10"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSuspend(t)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          title={t.suspended ? 'Activate tenant' : 'Suspend tenant'}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenant Detail Drawer */}
      {selected && (
        <TenantDetailDrawer tenant={selected} onClose={() => setSelected(null)} />
      )}

      {/* Impersonation Modal */}
      {impersonateTenant && (
        <ImpersonationModal
          tenant={impersonateTenant}
          onClose={() => setImpersonateTenant(null)}
        />
      )}
    </div>
  );
}
