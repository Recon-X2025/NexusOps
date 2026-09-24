import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserCheck, Search, RefreshCw, Clock, ExternalLink, Ban,
  Building2, ShieldCheck, AlertCircle, Loader2, Plus, ShieldAlert, X,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { ImpersonationModal } from '../components/ImpersonationModal';
import {
  getImpersonationSessions,
  terminateImpersonationSession,
  subscribeToImpersonationUpdates,
  formatTimeRemaining,
} from '../lib/impersonationStore';
import { revokeOrgSessions, type ImpersonationSessionRecord } from '../lib/api';
import { useOrgs } from '../context/WizardContext';
import { useAudit } from '../context/AuditContext';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, relativeTime } from '../lib/time';

export function ImpersonationsPage() {
  const { tenants } = useOrgs();
  const { email: operatorEmail } = useAuth();
  const { log } = useAudit();

  const [sessions, setSessions] = useState<ImpersonationSessionRecord[]>(() => getImpersonationSessions());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'terminated'>('all');
  const [ticker, setTicker] = useState(0);

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [confirmSessionToTerminate, setConfirmSessionToTerminate] = useState<ImpersonationSessionRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load sessions from storage
  const loadSessions = useCallback(() => {
    setSessions(getImpersonationSessions());
  }, []);

  useEffect(() => {
    loadSessions();
    const unsub = subscribeToImpersonationUpdates(() => {
      loadSessions();
    });
    return unsub;
  }, [loadSessions]);

  // Real-time ticking interval for live countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((prev) => prev + 1);
      // Clean and refresh in case an active session reached expiry
      setSessions(getImpersonationSessions());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const active = sessions.filter((s) => s.status === 'active');
    const terminated = sessions.filter((s) => s.status === 'terminated');
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const today = sessions.filter((s) => new Date(s.startedAt).getTime() >= oneDayAgo);

    const totalDuration = sessions.reduce((acc, s) => acc + (s.durationMinutes || 30), 0);
    const avgDuration = sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0;

    return {
      activeCount: active.length,
      todayCount: today.length,
      terminatedCount: terminated.length,
      avgDuration,
    };
  }, [sessions, ticker]);

  // Filtered Sessions
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesOrg = s.targetOrgName.toLowerCase().includes(q) || s.targetOrgId.toLowerCase().includes(q);
        const matchesUser = s.targetUserName.toLowerCase().includes(q) || s.targetUserEmail.toLowerCase().includes(q);
        const matchesOperator = s.operatorEmail.toLowerCase().includes(q);
        const matchesReason = s.reason.toLowerCase().includes(q);
        if (!matchesOrg && !matchesUser && !matchesOperator && !matchesReason) return false;
      }

      return true;
    });
  }, [sessions, statusFilter, search, ticker]);

  // Emergency termination handler
  const executeTermination = async (session: ImpersonationSessionRecord) => {
    setActionError(null);
    setTerminatingSessionId(session.id);

    try {
      // Call server procedure to revoke sessions for target org
      await revokeOrgSessions(session.targetOrgId);

      // Mark terminated in store
      terminateImpersonationSession(session.id);

      // Audit log
      log({
        admin: operatorEmail || 'admin@coheron.tech',
        tenantId: session.targetOrgId,
        tenantName: session.targetOrgName,
        action: 'impersonation_terminate',
        summary: `Emergency terminated impersonation session for ${session.targetUserEmail} on ${session.targetOrgName}`,
        before: { active: true, sessionId: session.id },
        after: { active: false, terminatedAt: new Date().toISOString() },
      });

      setConfirmSessionToTerminate(null);
      loadSessions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to terminate session on server.');
    } finally {
      setTerminatingSessionId(null);
    }
  };


  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impersonation Sessions Tracker"
        subtitle="Audited, time-bound operator support access telemetry and emergency kill-switch monitor"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={loadSessions}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                if (tenants.length > 0) {
                  setSelectedTenantId(tenants[0].id);
                  setShowNewModal(true);
                }
              }}
            >
              Start Impersonation
            </Button>
          </div>
        }
      />

      {/* Action Error Banner */}
      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-brand-danger dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
        </div>
      )}

      {/* Security Architecture Authority Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-blue dark:text-blue-400 shrink-0" />
          <span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">Security Authority:</span> PostgreSQL <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px] font-mono dark:bg-slate-700">sessions</code> + Backend TTL + <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px] font-mono dark:bg-slate-700">revokeOrgSessions</code>.
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Client storage is strictly an ephemeral UI cache & audit log
        </span>
      </div>

      {/* KPI Metric Cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Active Live Sessions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Live Sessions
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics.activeCount}
            </span>
            {metrics.activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 animate-pulse dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">Ongoing operator sessions</p>
        </div>

        {/* Card 2: Sessions Today */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sessions (Last 24h)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics.todayCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Initiated past 24 hours</p>
        </div>

        {/* Card 3: Terminated Early */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Terminated Early
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Ban className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics.terminatedCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Revoked before TTL expiration</p>
        </div>

        {/* Card 4: Avg Duration */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Avg Session Duration
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {metrics.avgDuration} <span className="text-sm font-normal text-slate-400">mins</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Time-boxed access limit</p>
        </div>
      </div>

      {/* Search & Filter Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, user, operator, or reason…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {(['all', 'active', 'expired', 'terminated'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white font-semibold'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Impersonation Sessions Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status & Countdown
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Target Tenant
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Impersonated User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Operator & Token
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reason / Ticket
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Started At
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCheck className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p className="text-base font-medium text-slate-700 dark:text-slate-200">
                        No impersonation sessions found
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {search || statusFilter !== 'all'
                          ? 'Try clearing your search or status filter.'
                          : 'Audited impersonation sessions initiated from Tenants page or detail drawer will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const timer = formatTimeRemaining(s.expiresAt);
                  const isActuallyActive = s.status === 'active' && !timer.isExpired;

                  return (
                    <tr key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      {/* Status & Countdown */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isActuallyActive ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Active Live
                            </span>
                            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              ⏱ {timer.text}
                            </span>
                          </div>
                        ) : s.status === 'terminated' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400">
                              <Ban className="h-3 w-3" /> Terminated Early
                            </span>
                            {s.terminatedAt && (
                              <span className="text-[10px] text-slate-400">{relativeTime(s.terminatedAt)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            Expired ({s.durationMinutes}m)
                          </span>
                        )}
                      </td>

                      {/* Target Tenant */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{s.targetOrgName}</p>
                            <p className="font-mono text-[11px] text-slate-400">{s.targetOrgId}</p>
                          </div>
                        </div>
                      </td>

                      {/* Impersonated User */}
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{s.targetUserName}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {s.targetUserRole}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{s.targetUserEmail}</p>
                        </div>
                      </td>

                      {/* Operator & Token */}
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="text-slate-700 dark:text-slate-300 font-medium">{s.operatorEmail}</div>
                        <div className="text-slate-400 text-[11px]">
                          Token: {s.token ? `${s.token.slice(0, 8)}…` : '—'}
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300" title={s.reason}>
                          {s.reason}
                        </p>
                      </td>

                      {/* Started At */}
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div>{formatDateTime(s.startedAt)}</div>
                        <div className="text-[11px] text-slate-400">{relativeTime(s.startedAt)}</div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isActuallyActive ? (
                            <>
                              <button
                                onClick={() => window.open(s.redirectUrl, '_blank', 'noopener,noreferrer')}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                                title="Re-open tenant workspace in new tab"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Launch
                              </button>
                              <button
                                onClick={() => setConfirmSessionToTerminate(s)}
                                disabled={terminatingSessionId === s.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                                title="Revoke all active sessions for this tenant organization"
                              >
                                {terminatingSessionId === s.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Ban className="h-3 w-3" />
                                )}
                                Terminate
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Closed</span>
                          )}
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

      {/* Modal for + New Impersonation from tracker */}
      {showNewModal && selectedTenant && (
        <ImpersonationModal
          tenant={selectedTenant}
          onClose={() => setShowNewModal(false)}
          onLaunched={() => {
            loadSessions();
          }}
        />
      )}

      {/* Confirmation Modal for Emergency Session Termination */}
      {confirmSessionToTerminate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                    Emergency Revocation
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Immediate access termination</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSessionToTerminate(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <p>
                Are you sure you want to terminate the impersonation session for{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {confirmSessionToTerminate.targetUserEmail}
                </span>{' '}
                on <span className="font-semibold text-slate-900 dark:text-white">{confirmSessionToTerminate.targetOrgName}</span>?
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                ⚠️ All active sessions in this tenant will be immediately invalidated and logged in the platform audit log.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmSessionToTerminate(null)}
                disabled={Boolean(terminatingSessionId)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={terminatingSessionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                disabled={Boolean(terminatingSessionId)}
                onClick={() => executeTermination(confirmSessionToTerminate)}
              >
                {terminatingSessionId ? 'Revoking…' : 'Revoke Immediately'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
