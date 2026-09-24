import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lock, ShieldAlert, AlertTriangle, Clock, CheckCircle2,
  Plus, RefreshCw, Search, Play,
  FileText, ArrowUpRight, X, AlertOctagon,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import {
  getDpdpData,
  createDpdpDsr,
  updateDpdpDsr,
  createDpdpBreach,
  updateDpdpBreach,
  triggerDpdpSweeps,
  getOrgs,
  getMe,
  type DpdpDsrItem,
  type DpdpBreachItem,
} from '../lib/api';
import { useAudit } from '../context/AuditContext';
import { formatDateTime, relativeTime } from '../lib/time';

function formatCountdown(dueAt: string): { text: string; isOverdue: boolean } {
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff <= 0) {
    return { text: 'Notification window expired', isOverdue: true };
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  return {
    text: `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s left`,
    isOverdue: false,
  };
}

export function DpdpPage() {
  const { refresh: refreshAuditLogs } = useAudit();

  const [dsrs, setDsrs] = useState<DpdpDsrItem[]>([]);
  const [breaches, setBreaches] = useState<DpdpBreachItem[]>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [operatorRole, setOperatorRole] = useState<string>('super_admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<{
    message: string;
    overdueMarked: number;
    deadlinesUpdated: number;
  } | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [dsrTypeFilter, setDsrTypeFilter] = useState<string>('all');
  const [dsrStatusFilter, setDsrStatusFilter] = useState<string>('all');
  const [breachSeverityFilter, setBreachSeverityFilter] = useState<string>('all');
  const [, setTicker] = useState(0);

  // Modals state
  const [showLogDsrModal, setShowLogDsrModal] = useState(false);
  const [showReportBreachModal, setShowReportBreachModal] = useState(false);
  const [selectedDsrToUpdate, setSelectedDsrToUpdate] = useState<DpdpDsrItem | null>(null);
  const [selectedBreachToUpdate, setSelectedBreachToUpdate] = useState<DpdpBreachItem | null>(null);

  // Form states
  const [dsrForm, setDsrForm] = useState({
    orgId: '',
    requestType: 'access' as 'access' | 'correction' | 'erasure' | 'grievance' | 'nomination',
    principalName: '',
    principalEmail: '',
    principalPhone: '',
    details: '',
    responseWindowDays: 30,
  });

  const [dsrUpdateForm, setDsrUpdateForm] = useState({
    status: 'in_progress' as DpdpDsrItem['status'],
    resolutionNote: '',
  });

  const [breachForm, setBreachForm] = useState({
    orgId: '',
    title: '',
    description: '',
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    affectedDataPrincipals: 10,
    dataCategories: 'Identity Proofs, Customer Account Numbers',
    notificationWindowHours: 72,
  });

  const [breachUpdateForm, setBreachUpdateForm] = useState({
    status: 'contained' as DpdpBreachItem['status'],
  });

  // Ticker for live countdown
  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dpdpRes, orgsRes, me] = await Promise.all([
        getDpdpData(),
        getOrgs(),
        getMe().catch(() => null),
      ]);
      setDsrs(dpdpRes.dsrs ?? []);
      setBreaches(dpdpRes.breaches ?? []);
      setOrgs(orgsRes ?? []);
      if (me?.user?.role) {
        setOperatorRole(me.user.role);
      }
      if (orgsRes.length > 0 && !dsrForm.orgId) {
        setDsrForm((prev) => ({ ...prev, orgId: orgsRes[0].id }));
        setBreachForm((prev) => ({ ...prev, orgId: orgsRes[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch DPDP compliance data.');
    } finally {
      setLoading(false);
    }
  }, [dsrForm.orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Capability checks
  const hasComplianceView = operatorRole !== 'support_staff';
  const canManageCompliance = operatorRole !== 'auditor' && hasComplianceView;

  // KPI Calculations
  const metrics = useMemo(() => {
    const activeDsrs = dsrs.filter((d) => !['fulfilled', 'rejected', 'closed'].includes(d.status));
    const critBreaches = breaches.filter((b) => b.severity === 'critical' || b.severity === 'high');
    const pendingNotify = breaches.filter((b) => !b.boardNotifiedAt && !['contained', 'closed'].includes(b.status));

    const avgResolution = dsrs.length > 0
      ? Math.round(dsrs.reduce((acc, d) => acc + (d.responseWindowDays || 30), 0) / dsrs.length)
      : 30;

    return {
      activeDsrsCount: activeDsrs.length,
      critBreachesCount: critBreaches.length,
      pendingNotifyCount: pendingNotify.length,
      avgResolution,
    };
  }, [dsrs, breaches]);

  // Filtered Breaches
  const filteredBreaches = useMemo(() => {
    return breaches.filter((b) => {
      if (breachSeverityFilter !== 'all' && b.severity !== breachSeverityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(q);
        const matchesRef = b.reference.toLowerCase().includes(q);
        const matchesOrg = (b.orgName ?? '').toLowerCase().includes(q) || b.orgId.toLowerCase().includes(q);
        if (!matchesTitle && !matchesRef && !matchesOrg) return false;
      }
      return true;
    });
  }, [breaches, breachSeverityFilter, search]);

  // Filtered DSRs
  const filteredDsrs = useMemo(() => {
    return dsrs.filter((d) => {
      if (dsrTypeFilter !== 'all' && d.requestType !== dsrTypeFilter) return false;
      if (dsrStatusFilter !== 'all' && d.status !== dsrStatusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesRef = d.reference.toLowerCase().includes(q);
        const matchesPrincipal = d.principalName.toLowerCase().includes(q) || (d.principalEmail ?? '').toLowerCase().includes(q);
        const matchesOrg = (d.orgName ?? '').toLowerCase().includes(q) || d.orgId.toLowerCase().includes(q);
        if (!matchesRef && !matchesPrincipal && !matchesOrg) return false;
      }
      return true;
    });
  }, [dsrs, dsrTypeFilter, dsrStatusFilter, search]);

  // Handler: Run Sweeps
  const handleRunSweeps = async () => {
    setSweeping(true);
    setSweepResult(null);
    setError(null);
    try {
      const res = await triggerDpdpSweeps();
      setSweepResult(res);
      await loadData();
      await refreshAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute compliance sweeps.');
    } finally {
      setSweeping(false);
    }
  };

  // Handler: Create DSR
  const handleCreateDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createDpdpDsr(dsrForm);
      setShowLogDsrModal(false);
      setActionSuccess(`DSR request ${created.reference} logged successfully with 30-day statutory clock.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log DSR request.');
    }
  };

  // Handler: Update DSR
  const handleUpdateDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDsrToUpdate) return;
    try {
      const updated = await updateDpdpDsr(selectedDsrToUpdate.id, dsrUpdateForm);
      setSelectedDsrToUpdate(null);
      setActionSuccess(`DSR ${selectedDsrToUpdate.reference} status updated to ${updated.status}.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update DSR status.');
    }
  };

  // Handler: Report Breach
  const handleReportBreach = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createDpdpBreach(breachForm);
      setShowReportBreachModal(false);
      setActionSuccess(`Incident ${created.reference} logged with 72-hour notification countdown.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record breach incident.');
    }
  };

  // Handler: Update Breach
  const handleUpdateBreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBreachToUpdate) return;
    try {
      const updated = await updateDpdpBreach(selectedBreachToUpdate.id, breachUpdateForm);
      setSelectedBreachToUpdate(null);
      setActionSuccess(`Breach ${selectedBreachToUpdate.reference} marked as ${updated.status}.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update breach incident.');
    }
  };

  if (!loading && !hasComplianceView) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="DPDP 2023 Control Tower"
          subtitle="Data protection oversight, breach response and Data Subject Rights monitoring"
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-600 dark:text-amber-400" />
          <h2 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your role (<span className="font-semibold">{operatorRole}</span>) does not have compliance inspection privileges (<code>complianceView</code> required).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="DPDP 2023 Control Tower"
        subtitle="Data protection oversight, breach response and Data Subject Rights monitoring"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadData}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Play className={`h-3.5 w-3.5 ${sweeping ? 'animate-spin' : ''}`} />}
              onClick={handleRunSweeps}
              disabled={sweeping || !canManageCompliance}
              title={!canManageCompliance ? 'Auditor View-Only: Sweeps disabled' : undefined}
            >
              {sweeping ? 'Sweeping…' : 'Run Compliance Sweeps'}
            </Button>
            {canManageCompliance && (
              <Button
                size="sm"
                variant="danger"
                icon={<AlertOctagon className="h-3.5 w-3.5" />}
                onClick={() => setShowReportBreachModal(true)}
              >
                Report Incident
              </Button>
            )}
            {canManageCompliance && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setShowLogDsrModal(true)}
              >
                Log DSR Request
              </Button>
            )}
          </div>
        }
      />

      {/* Auditor Read-Only Banner */}
      {operatorRole === 'auditor' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Auditor Mode (Read-Only):</strong> You have inspection privileges (<code>complianceView</code>). Administrative mutations, incident logging, and compliance sweeps are disabled (<code>complianceManage</code> required).
          </span>
        </div>
      )}

      {/* Navigation Quick-Links */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-xs dark:border-slate-700">
        <span className="font-semibold text-slate-500 dark:text-slate-400">Security & Compliance:</span>
        <a
          href="#/compliance-grc"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <span>Statutory Compliance Oversight</span>
          <ArrowUpRight className="h-3 w-3" />
        </a>
        <span className="rounded-md bg-blue-100 px-2.5 py-1 font-semibold text-brand-blue dark:bg-blue-500/20 dark:text-blue-400">
          DPDP 2023 Control Tower
        </span>
        <a
          href="#/compliance/grc-risks"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <span>GRC Risk Matrix</span>
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {/* Sweep Result Banner */}
      {sweepResult && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-brand-blue dark:text-blue-400" />
              <div>
                <p className="font-semibold">{sweepResult.message}</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                  Overdue items flagged: {sweepResult.overdueMarked} · Statutory deadlines updated:{' '}
                  {sweepResult.deadlinesUpdated}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSweepResult(null)}
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Action Success Banner */}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Active DSRs */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active DSRs
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-400">
              <Lock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.activeDsrsCount}
            </span>
            <span className="text-xs text-slate-400">/ {dsrs.length} total</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Enforcing 30-day statutory response clock</p>
        </div>

        {/* Card 2: Critical / High Breaches */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Critical / High Breaches
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertOctagon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
              {metrics.critBreachesCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Elevated severity incidents across tenants</p>
        </div>

        {/* Card 3: 72h Notification Window */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              72h Notification Window
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.pendingNotifyCount}
            </span>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Active Windows</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Mandatory Data Protection Board notice clock</p>
        </div>

        {/* Card 4: Average Resolution Days */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Average DSR SLA
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.avgResolution}
            </span>
            <span className="text-xs text-slate-400">days response limit</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">DPDP Act Section 11 compliance window</p>
        </div>
      </div>

      {/* SECTION 1: 72-HOUR BREACH INCIDENT CENTER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                72-Hour Breach Incident Center
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live countdown clocks for personal data breach notification to Board & Principals
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={breachSeverityFilter}
              onChange={(e) => setBreachSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 text-left">Incident Ref & Title</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Affected Principals</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">72h Notice Countdown</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredBreaches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">
                    No breach incidents logged matching current filters.
                  </td>
                </tr>
              ) : (
                filteredBreaches.map((b) => {
                  const timer = formatCountdown(b.notifyDueAt);
                  const isClosed = ['contained', 'closed'].includes(b.status);

                  return (
                    <tr key={b.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {b.reference}
                          </span>
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {b.title}
                          </span>
                          {b.description && (
                            <span className="line-clamp-1 text-[11px] text-slate-400">{b.description}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{b.orgName}</span>
                          <span className="font-mono text-[11px] text-slate-400">{b.orgId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                            b.severity === 'critical'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                              : b.severity === 'high'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                              : b.severity === 'medium'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                          }`}
                        >
                          {b.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {b.affectedDataPrincipals ? `${b.affectedDataPrincipals} principals` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            isClosed
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isClosed ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Contained / Closed</span>
                        ) : (
                          <span
                            className={`font-mono text-xs font-bold ${
                              timer.isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            ⏱ {timer.text}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageCompliance ? (
                          <button
                            onClick={() => {
                              setSelectedBreachToUpdate(b);
                              setBreachUpdateForm({ status: b.status });
                            }}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-blue dark:hover:bg-slate-700"
                            title="Update Incident Lifecycle Status"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">View Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: DSR (DATA SUBJECT RIGHTS) MONITOR */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-blue" />
              <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                Data Subject Rights (DSR) Monitor
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Access, Correction, Erasure, Grievance & Nomination statutory requests
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search principal, DSR or tenant…"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <select
              value={dsrTypeFilter}
              onChange={(e) => setDsrTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Request Types</option>
              <option value="access">Access</option>
              <option value="correction">Correction</option>
              <option value="erasure">Erasure</option>
              <option value="grievance">Grievance</option>
              <option value="nomination">Nomination</option>
            </select>

            <select
              value={dsrStatusFilter}
              onChange={(e) => setDsrStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="received">Received</option>
              <option value="verifying">Verifying</option>
              <option value="in_progress">In Progress</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 text-left">DSR Reference</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Statutory Right</th>
                <th className="px-4 py-3 text-left">Principal Details</th>
                <th className="px-4 py-3 text-left">Received Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Statutory Due Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredDsrs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                    No DSR requests found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredDsrs.map((d) => {
                  const isDone = ['fulfilled', 'rejected', 'closed'].includes(d.status);
                  const diff = new Date(d.dueAt).getTime() - Date.now();
                  const isOverdue = !isDone && diff <= 0;

                  return (
                    <tr key={d.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {d.reference}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{d.orgName}</span>
                          <span className="font-mono text-[11px] text-slate-400">{d.orgId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                          {d.requestType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{d.principalName}</span>
                          <span className="text-xs text-slate-400">{d.principalEmail || d.principalPhone || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(d.receivedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : isOverdue
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className={`font-mono text-xs ${isOverdue ? 'font-bold text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {formatDateTime(d.dueAt)}
                          </span>
                          {!isDone && (
                            <span className={`text-[11px] ${isOverdue ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                              {relativeTime(d.dueAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageCompliance ? (
                          <button
                            onClick={() => {
                              setSelectedDsrToUpdate(d);
                              setDsrUpdateForm({
                                status: d.status,
                                resolutionNote: d.resolutionNote || '',
                              });
                            }}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-blue dark:hover:bg-slate-700"
                            title="Update DSR Fulfillment Status"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">View Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Log DSR Request */}
      {showLogDsrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                Log New Data Subject Request (DSR)
              </h3>
              <button onClick={() => setShowLogDsrModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDsr} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Target Tenant</label>
                <select
                  value={dsrForm.orgId}
                  onChange={(e) => setDsrForm({ ...dsrForm, orgId: e.target.value })}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Right Type</label>
                  <select
                    value={dsrForm.requestType}
                    onChange={(e) => setDsrForm({ ...dsrForm, requestType: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="access">Access</option>
                    <option value="correction">Correction</option>
                    <option value="erasure">Erasure</option>
                    <option value="grievance">Grievance</option>
                    <option value="nomination">Nomination</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">SLA Window</label>
                  <input
                    type="number"
                    value={dsrForm.responseWindowDays}
                    onChange={(e) => setDsrForm({ ...dsrForm, responseWindowDays: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Principal Full Name</label>
                <input
                  type="text"
                  required
                  value={dsrForm.principalName}
                  onChange={(e) => setDsrForm({ ...dsrForm, principalName: e.target.value })}
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                  <input
                    type="email"
                    value={dsrForm.principalEmail}
                    onChange={(e) => setDsrForm({ ...dsrForm, principalEmail: e.target.value })}
                    placeholder="ramesh@example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    type="tel"
                    value={dsrForm.principalPhone}
                    onChange={(e) => setDsrForm({ ...dsrForm, principalPhone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Details / Request Notes</label>
                <textarea
                  rows={2}
                  value={dsrForm.details}
                  onChange={(e) => setDsrForm({ ...dsrForm, details: e.target.value })}
                  placeholder="Specific records or scope requested for modification/erasure…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowLogDsrModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Log DSR Request</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Report Breach */}
      {showReportBreachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-rose-600" />
                <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                  Report Personal Data Breach Incident
                </h3>
              </div>
              <button onClick={() => setShowReportBreachModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleReportBreach} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Target Tenant</label>
                <select
                  value={breachForm.orgId}
                  onChange={(e) => setBreachForm({ ...breachForm, orgId: e.target.value })}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Incident Title</label>
                <input
                  type="text"
                  required
                  value={breachForm.title}
                  onChange={(e) => setBreachForm({ ...breachForm, title: e.target.value })}
                  placeholder="e.g. S3 Storage Bucket ACL Misconfiguration"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Severity</label>
                  <select
                    value={breachForm.severity}
                    onChange={(e) => setBreachForm({ ...breachForm, severity: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Affected Principals (Est.)</label>
                  <input
                    type="number"
                    value={breachForm.affectedDataPrincipals}
                    onChange={(e) => setBreachForm({ ...breachForm, affectedDataPrincipals: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Data Categories Impacted</label>
                <input
                  type="text"
                  value={breachForm.dataCategories}
                  onChange={(e) => setBreachForm({ ...breachForm, dataCategories: e.target.value })}
                  placeholder="e.g. PAN, Bank Account Details, Phone numbers"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Description & Immediate Action</label>
                <textarea
                  rows={3}
                  value={breachForm.description}
                  onChange={(e) => setBreachForm({ ...breachForm, description: e.target.value })}
                  placeholder="Root cause, detection method, and initial containment steps taken…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowReportBreachModal(false)}>Cancel</Button>
                <Button variant="danger" type="submit">Report & Start 72h Clock</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Update DSR Status */}
      {selectedDsrToUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                Update DSR: {selectedDsrToUpdate.reference}
              </h3>
              <button onClick={() => setSelectedDsrToUpdate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateDsr} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Lifecycle Status</label>
                <select
                  value={dsrUpdateForm.status}
                  onChange={(e) => setDsrUpdateForm({ ...dsrUpdateForm, status: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="received">Received</option>
                  <option value="verifying">Verifying</option>
                  <option value="in_progress">In Progress</option>
                  <option value="on_hold">On Hold</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="rejected">Rejected</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Resolution Note / Audit Log</label>
                <textarea
                  rows={3}
                  value={dsrUpdateForm.resolutionNote}
                  onChange={(e) => setDsrUpdateForm({ ...dsrUpdateForm, resolutionNote: e.target.value })}
                  placeholder="Document resolution verification, proof of erasure, or rejection rationale…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSelectedDsrToUpdate(null)}>Cancel</Button>
                <Button variant="primary" type="submit">Update Status</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Update Breach Status */}
      {selectedBreachToUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                Update Breach Status: {selectedBreachToUpdate.reference}
              </h3>
              <button onClick={() => setSelectedBreachToUpdate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateBreach} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Incident Status</label>
                <select
                  value={breachUpdateForm.status}
                  onChange={(e) => setBreachUpdateForm({ status: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="detected">Detected</option>
                  <option value="assessing">Assessing</option>
                  <option value="notifying">Notifying</option>
                  <option value="notified">Notified</option>
                  <option value="contained">Contained</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSelectedBreachToUpdate(null)}>Cancel</Button>
                <Button variant="primary" type="submit">Confirm Lifecycle Update</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
