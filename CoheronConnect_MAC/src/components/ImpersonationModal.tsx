import { useState, useEffect } from 'react';
import {
  ShieldAlert, AlertTriangle, Clock, ExternalLink,
  CheckCircle2, Loader2, X, Building2, User, Key,
} from 'lucide-react';
import { Button } from './Button';
import {
  listOrgUsers,
  startImpersonation,
  type OrgUserItem,
  type ImpersonationResult,
  type ImpersonationSessionRecord,
} from '../lib/api';
import { saveImpersonationSession } from '../lib/impersonationStore';
import { useAudit } from '../context/AuditContext';
import { useAuth } from '../context/AuthContext';

interface Props {
  tenant: {
    id: string;
    companyName: string;
    slug?: string;
    tenantCode?: string;
    plan?: string;
  };
  initialUserId?: string;
  onClose: () => void;
  onLaunched?: (session: ImpersonationSessionRecord) => void;
}

export function ImpersonationModal({ tenant, initialUserId, onClose, onLaunched }: Props) {
  const { email: operatorEmail } = useAuth();
  const { log } = useAudit();

  // Users state
  const [users, setUsers] = useState<OrgUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Form state
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 60>(30);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success state
  const [result, setResult] = useState<{
    resultData: ImpersonationResult;
    session: ImpersonationSessionRecord;
  } | null>(null);

  // Fetch users within tenant
  useEffect(() => {
    let active = true;
    async function fetchUsers() {
      setLoadingUsers(true);
      setUsersError(null);
      try {
        const list = await listOrgUsers(tenant.id);
        if (!active) return;
        setUsers(list);

        if (initialUserId && list.some((u) => u.id === initialUserId)) {
          setSelectedUserId(initialUserId);
        } else {
          // Filter active users
          const activeUsers = list.filter((u) => u.status === 'active');
          // Prioritize owner or admin
          const adminUser = activeUsers.find((u) => u.role === 'owner' || u.role === 'admin') || activeUsers[0];
          if (adminUser) {
            setSelectedUserId(adminUser.id);
          } else if (list.length > 0) {
            setSelectedUserId(list[0].id);
          }
        }
      } catch (err) {
        if (!active) return;
        setUsersError(err instanceof Error ? err.message : 'Failed to fetch users for tenant');
      } finally {
        if (active) setLoadingUsers(false);
      }
    }

    fetchUsers();
    return () => {
      active = false;
    };
  }, [tenant.id]);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const isReasonValid = reason.trim().length >= 10;
  const isUserActive = selectedUser?.status === 'active';
  const canLaunch = isReasonValid && Boolean(selectedUserId) && isUserActive && !launching;

  const handleLaunch = async () => {
    if (!canLaunch || !selectedUser) return;
    setError(null);
    setLaunching(true);

    const operator = operatorEmail || 'superadmin@coheron.tech';
    const nowIso = new Date().toISOString();

    try {
      const res = await startImpersonation({
        targetUserId: selectedUser.id,
        reason: reason.trim(),
        durationMinutes,
      });

      const sessionRecord: ImpersonationSessionRecord = {
        id: `imp_${Date.now()}_${res.impersonationToken.slice(0, 8)}`,
        token: res.impersonationToken,
        operatorEmail: operator,
        targetOrgId: tenant.id,
        targetOrgName: tenant.companyName,
        targetUserId: selectedUser.id,
        targetUserName: selectedUser.name,
        targetUserEmail: selectedUser.email,
        targetUserRole: selectedUser.role,
        reason: reason.trim(),
        durationMinutes,
        startedAt: nowIso,
        expiresAt: res.expiresAt,
        redirectUrl: res.redirectUrl,
        status: 'active',
      };

      // Persist in local audited tracker
      saveImpersonationSession(sessionRecord);

      // Log in platform audit context
      log({
        admin: operator,
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'impersonation_start',
        summary: `Started audited impersonation of ${selectedUser.email} (${selectedUser.role}) for ${durationMinutes}m. Reason: "${reason.trim()}"`,
        before: { activeSession: false },
        after: {
          activeSession: true,
          targetUserId: selectedUser.id,
          targetUserEmail: selectedUser.email,
          durationMinutes,
          expiresAt: res.expiresAt,
        },
      });

      setResult({ resultData: res, session: sessionRecord });
      if (onLaunched) {
        onLaunched(sessionRecord);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start impersonation session.');
    } finally {
      setLaunching(false);
    }
  };

  const handleOpenWorkspace = () => {
    if (result?.resultData?.redirectUrl) {
      window.open(result.resultData.redirectUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                {result ? 'Impersonation Session Active' : 'Audited Tenant Impersonation'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Time-bound, cryptographically attributed operator access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[80vh] overflow-y-auto p-6 space-y-5">
          {/* Target Tenant Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-brand-blue" />
                <span className="font-medium text-slate-900 dark:text-slate-100">{tenant.companyName}</span>
              </div>
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600">
                {tenant.plan ?? 'free'}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-400">
              ID: {tenant.id} {tenant.slug ? `· slug: ${tenant.slug}` : ''}
            </p>
          </div>

          {result ? (
            /* Success State */
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                <h4 className="mt-2 text-base font-semibold text-emerald-900 dark:text-emerald-200">
                  Session Successfully Minted
                </h4>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300 max-w-sm">
                  You are now authorized to inspect the tenant portal as{' '}
                  <span className="font-semibold">{result.session.targetUserEmail}</span> for{' '}
                  <span className="font-semibold">{result.session.durationMinutes} minutes</span>.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Target User:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {result.session.targetUserName} ({result.session.targetUserRole})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Expires At:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {new Date(result.session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Impersonation Token:</span>
                  <span className="font-mono text-brand-blue dark:text-blue-400">
                    {result.session.token.slice(0, 10)}...{result.session.token.slice(-6)}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  variant="primary"
                  className="w-full justify-center gap-2 py-2.5"
                  icon={<ExternalLink className="h-4 w-4" />}
                  onClick={handleOpenWorkspace}
                >
                  Launch Tenant Workspace in New Tab
                </Button>
                <Button variant="ghost" className="w-full justify-center text-xs" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            /* Launch Form State */
            <>
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Target User Selection */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    Target User to Impersonate
                  </span>
                  {loadingUsers && (
                    <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading users…
                    </span>
                  )}
                </label>

                {usersError ? (
                  <p className="text-xs text-rose-500">{usersError}</p>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={loadingUsers || users.length === 0}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-blue focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {users.length === 0 && !loadingUsers && (
                      <option value="">No users registered in this tenant</option>
                    )}
                    {users.map((u) => (
                      <option key={u.id} value={u.id} disabled={u.status !== 'active'}>
                        {u.name} — {u.email} ({u.role}) {u.status !== 'active' ? `[${u.status.toUpperCase()}]` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {selectedUser && selectedUser.status !== 'active' && (
                  <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    ⚠️ Cannot impersonate a {selectedUser.status} user. The user must be active.
                  </p>
                )}
              </div>

              {/* Mandatory Reason */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1">
                    <span>Justification / Ticket Reference</span>
                    <span className="text-rose-500">*</span>
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      isReasonValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {reason.trim().length}/10 chars min
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Investigating payroll tax calculation anomaly for ticket #4819"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                {!isReasonValid && reason.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    A meaningful reason with at least 10 characters is strictly required for compliance audit logs.
                  </p>
                )}
              </div>

              {/* Duration Options */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Session Duration (Time-Boxed TTL)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([15, 30, 60] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs font-medium transition-all ${
                        durationMinutes === mins
                          ? 'border-brand-blue bg-blue-50 text-brand-blue shadow-sm dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span className="text-sm font-bold">{mins} min</span>
                      <span className="text-[10px] text-slate-400">
                        {mins === 15 ? 'Quick inspect' : mins === 30 ? 'Standard check' : 'Deep triage'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Security Warning Notice */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <div className="flex gap-2.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Strict Audit & Accountability Protocol
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                      All mutations and interactions within the tenant workspace will be permanently stamped with your
                      Super-Admin operator ID (<span className="font-semibold">{operatorEmail || 'admin@coheron.tech'}</span>).
                      The session will terminate automatically upon TTL expiry, or can be halted immediately via the tracker.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button variant="ghost" onClick={onClose} disabled={launching}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!canLaunch}
                  onClick={handleLaunch}
                  icon={launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                >
                  {launching ? 'Minting Session…' : 'Confirm & Launch Session'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
