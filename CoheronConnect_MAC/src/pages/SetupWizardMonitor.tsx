import { useState, useMemo, useEffect } from 'react';
import {
  Search, Eye, FileDown, Pencil, Flag, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, Download, Rocket, AlertTriangle, Flag as FlagIcon, Loader2, AlertCircle,
} from 'lucide-react';
import { useWizard, computeCompletion } from '../context/WizardContext';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge, ProgressBar } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { TenantDetailDrawer } from '../components/TenantDetailDrawer';
import { exportAllCsv, exportAllJson } from '../lib/export';
import { relativeTime } from '../lib/time';
import type { TenantRecord, OnboardingStatus } from '../lib/types';
import { STEP_NAMES } from '../lib/types';
import type { FetchParams } from '../lib/wizardData';

type SortKey = 'companyName' | 'status' | 'completion' | 'currentStep' | 'lastUpdatedAt';
type SortDir = 'asc' | 'desc';

const STATUS_FILTERS: { key: OnboardingStatus | 'all' | 'flagged'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'complete', label: 'Complete' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'not_started', label: 'Not started' },
  { key: 'flagged', label: 'Flagged' },
];

export function SetupWizardMonitor() {
  const { tenants, loading, error, refresh } = useWizard();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<OnboardingStatus | 'all' | 'flagged'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('lastUpdatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<TenantRecord | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const params: FetchParams = { limit: 100, offset: 0 };
    if (debouncedSearch) params.search = debouncedSearch;
    if (filter !== 'all' && filter !== 'flagged') params.status = filter;
    params.sort = `${sortKey}:${sortDir}`;
    refresh(params);
  }, [debouncedSearch, filter, sortKey, sortDir, refresh]);

  const rows = useMemo(() => {
    let list = [...tenants];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const city = t.steps.find((s) => s.id === 2)?.data?.city as string ?? '';
        const gstin = t.steps.find((s) => s.id === 3)?.data?.gstin as string ?? '';
        return (
          t.companyName.toLowerCase().includes(q) ||
          gstin.toLowerCase().includes(q) ||
          city.toLowerCase().includes(q)
        );
      });
    }
    if (filter === 'flagged') {
      list = list.filter((t) => t.flag.flagged);
    } else if (filter !== 'all') {
      list = list.filter((t) => t.status === filter);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'companyName') cmp = a.companyName.localeCompare(b.companyName);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'currentStep') cmp = (a.currentStep ?? 0) - (b.currentStep ?? 0);
      else if (sortKey === 'lastUpdatedAt') cmp = new Date(a.lastUpdatedAt).getTime() - new Date(b.lastUpdatedAt).getTime();
      else if (sortKey === 'completion') cmp = computeCompletion(a.steps) - computeCompletion(b.steps);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [tenants, search, filter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIcon = (key: SortKey) =>
    sortKey !== key ? <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
      : sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-blue" />
        : <ArrowDown className="h-3 w-3 text-brand-blue" />;

  const stats = useMemo(() => ({
    total: tenants.length,
    complete: tenants.filter((t) => t.status === 'complete').length,
    inProgress: tenants.filter((t) => t.status === 'in_progress').length,
    stalled: tenants.filter((t) => t.status === 'stalled').length,
    flagged: tenants.filter((t) => t.flag.flagged).length,
  }), [tenants]);

  return (
    <div>
      <PageHeader
        title="Setup Wizard Monitor"
        subtitle="Onboarding wizard data for all tenants across the platform"
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => refresh()} disabled={loading}>
              Refresh
            </Button>
            <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportAllCsv(tenants)}>
              Export all CSV
            </Button>
            <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportAllJson(tenants)}>
              Export all JSON
            </Button>
          </>
        }
      />

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total tenants" value={stats.total} icon={<Rocket className="h-4 w-4" />} tone="blue" />
        <StatCard label="Complete" value={stats.complete} icon={<Rocket className="h-4 w-4" />} tone="success" />
        <StatCard label="In progress" value={stats.inProgress} icon={<Rocket className="h-4 w-4" />} tone="blue" />
        <StatCard label="Stalled" value={stats.stalled} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
        <StatCard label="Flagged" value={stats.flagged} icon={<FlagIcon className="h-4 w-4" />} tone="danger" />
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, GSTIN, city…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${filter === f.key
                  ? 'bg-brand-blue text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {/* Error Banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-brand-danger dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-brand-danger dark:text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900 dark:text-rose-200">API Fetch Failed</p>
              <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300 font-mono">{error}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => handleSort('companyName')} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tenant / Company {sortIcon('companyName')}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Status {sortIcon('status')}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => handleSort('completion')} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Completion {sortIcon('completion')}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => handleSort('currentStep')} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Current Step {sortIcon('currentStep')}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => handleSort('lastUpdatedAt')} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Last Updated {sortIcon('lastUpdatedAt')}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
                      <span className="text-sm font-medium">Fetching onboarding data from backend…</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <p className="text-base font-medium">No tenants found</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {error ? 'Could not load data due to API error.' : 'No tenant records returned by the API.'}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((t) => {
                  const completion = computeCompletion(t.steps);
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {t.flag.flagged && <FlagIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800 dark:text-slate-100">{t.companyName}</p>
                            <p className="font-mono text-xs text-slate-400">{t.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-2.5"><ProgressBar value={completion} /></td>
                      <td className="px-4 py-2.5">
                        {t.currentStep ? (
                          <>
                            <span className="text-sm text-slate-700 dark:text-slate-200">Step {t.currentStep} of 7</span>
                            <p className="text-xs text-slate-400">{STEP_NAMES[t.currentStep]}</p>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400">{relativeTime(t.lastUpdatedAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setSelected(t)} className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-brand-blue dark:hover:bg-blue-500/10" title="View"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => exportAllCsv([t])} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" title="Export CSV"><FileDown className="h-4 w-4" /></button>
                          <button onClick={() => setSelected(t)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" title="Override"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setSelected(t)} className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10" title="Flag"><Flag className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <TenantDetailDrawer tenant={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'blue' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    blue: 'text-brand-blue bg-blue-50 dark:bg-blue-500/10',
    success: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400',
    warning: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400',
    danger: 'text-brand-danger bg-rose-50 dark:bg-rose-500/10',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
        <div>
          <p className="font-heading text-xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
