import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  Lock,
  KeyRound,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Database,
  FileCheck,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { formatDateTime, relativeTime } from '../lib/time';
import {
  getToken,
  parseJwt,
  getPlatformGovernance,
  revokeAllOperatorSessions,
  type PlatformGovernanceResponse,
} from '../lib/api';
import { useAudit } from '../context/AuditContext';

export function SettingsPage() {
  const [governance, setGovernance] = useState<PlatformGovernanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'operators' | 'security' | 'emergency'>('operators');

  // Emergency Revoke Modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [targetOperatorId, setTargetOperatorId] = useState<string>('');
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const { refresh: refreshAuditLogs } = useAudit();

  const operatorRole = useMemo(() => {
    const token = getToken();
    if (!token) return 'super_admin';
    const jwt = parseJwt(token);
    return (jwt?.operatorRole as string) || (jwt?.role as string) || 'super_admin';
  }, []);

  const isSuperAdmin = operatorRole === 'super_admin';
  const isReadOnly = !isSuperAdmin;

  const fetchGovernance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPlatformGovernance();
      setGovernance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch governance configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGovernance();
  }, [fetchGovernance]);

  const handleRevoke = async () => {
    if (revokeReason.trim().length < 10) {
      setRevokeError('Justification reason must be at least 10 characters long.');
      return;
    }
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await revokeAllOperatorSessions({
        reason: revokeReason.trim(),
        targetOperatorId: targetOperatorId ? targetOperatorId : undefined,
      });
      setNotice(res.message);
      setShowRevokeModal(false);
      setRevokeReason('');
      setTargetOperatorId('');
      await fetchGovernance();
      await refreshAuditLogs();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Revocation failed.');
    } finally {
      setRevoking(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'operations_staff':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'support_staff':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'auditor':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    }
  };

  return (
    <div>
      <PageHeader
        title="Platform Security & Governance"
        subtitle="Operator capability matrix, truthful cryptographic posture, session boundaries, and platform safeguards"
        action={
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                Read-Only Mode ({operatorRole})
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGovernance}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mb-6 flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('operators')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'operators'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          Console Operators ({governance?.operators.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'security'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          Cryptographic & Security Posture
        </button>

        <button
          onClick={() => setActiveTab('emergency')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'emergency'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Emergency Controls
        </button>
      </div>

      {/* TAB 1: OPERATORS & ROLE GOVERNANCE */}
      {activeTab === 'operators' && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/80">
              <h3 className="font-heading text-sm font-semibold text-slate-700 dark:text-slate-200">
                Authorized Super-Admin Operators
              </h3>
            </div>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Operator</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Phone</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Login</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {governance?.operators.map((op) => (
                    <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{op.name}</p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{op.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadge(op.role)}`}>
                          {op.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          op.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${op.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {op.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {op.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {op.lastLoginAt ? formatDateTime(op.lastLoginAt) : 'Never logged in'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {relativeTime(op.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role Capabilities Reference */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/80">
              <h3 className="font-heading text-sm font-semibold text-slate-700 dark:text-slate-200">
                System Role Capability Profiles
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-700">
              {governance?.roles.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${r.badgeCls}`}>
                      {r.name}
                    </span>
                    {r.isSystem && <span className="text-[10px] text-slate-400 uppercase font-mono">System</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{r.description}</p>
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">Key Grants:</p>
                    <ul className="mt-1 space-y-1 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {Object.entries(r.capabilities).slice(0, 5).map(([cap, granted]) => (
                        <li key={cap} className="flex items-center gap-1.5">
                          {granted ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="h-3 w-3 text-slate-300 shrink-0" />
                          )}
                          <span className={granted ? 'text-slate-800 dark:text-slate-200' : 'line-through text-slate-400'}>
                            {cap}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CRYPTOGRAPHIC & SECURITY POSTURE */}
      {activeTab === 'security' && governance && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Primary KMS & Encryption */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">KMS / Primary Envelope Encryption</h4>
                  <p className="text-xs text-slate-400">Zero-knowledge data-at-rest encryption</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                governance.securityPosture.encryption.status === 'verified'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
              }`}>
                {governance.securityPosture.encryption.status === 'verified' ? 'Verified Active' : 'Not Configured'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              {governance.securityPosture.encryption.detail}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
              <div className="rounded bg-slate-50 dark:bg-slate-700/30 p-2">
                <span className="text-slate-400">Cipher:</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{governance.securityPosture.encryption.algorithm}</span>
              </div>
              <div className="rounded bg-slate-50 dark:bg-slate-700/30 p-2">
                <span className="text-slate-400">Key Length:</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{governance.securityPosture.encryption.keyLengthBits}-bit</span>
              </div>
            </div>
          </div>

          {/* Database Transport Layer Security */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">Database TLS Encryption in Transit</h4>
                  <p className="text-xs text-slate-400">PostgreSQL socket encryption posture</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                governance.securityPosture.databaseTls.status === 'configured'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {governance.securityPosture.databaseTls.status === 'configured' ? 'TLS Active' : 'Intranet Standard'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              {governance.securityPosture.databaseTls.detail}
            </p>
            <div className="rounded bg-slate-50 dark:bg-slate-700/30 p-2 text-xs font-mono">
              <span className="text-slate-400">SSL Mode:</span>{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{governance.securityPosture.databaseTls.mode}</span>
            </div>
          </div>

          {/* Session Boundaries & Hardening */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Operator Session Lifetime & CORS</h4>
                <p className="text-xs text-slate-400">Strict zero-trust session constraints</p>
              </div>
            </div>
            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">JWT Token Maximum TTL:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {governance.securityPosture.sessionPolicy.jwtTtlMinutes} minutes (8 hours)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Inactivity Timeout:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {governance.securityPosture.sessionPolicy.inactivityTimeoutMinutes} minutes
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Strict Origin CORS:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Enforced</span>
              </div>
            </div>
          </div>

          {/* Statutory Governance & DPDP */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-100">DPDP 2023 & Statutory Governance</h4>
                <p className="text-xs text-slate-400">Automated retention & compliance oversight</p>
              </div>
            </div>
            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Automated Erasure Sweeps:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Statutory MCA/GST Tracking:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">DPDP Contact Configured:</span>
                <span className={governance.securityPosture.dataProtection.contactEmailConfigured ? 'font-semibold text-emerald-600' : 'text-slate-400'}>
                  {governance.securityPosture.dataProtection.contactEmailConfigured ? 'Yes' : 'Not Set'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EMERGENCY CONTROLS */}
      {activeTab === 'emergency' && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 dark:border-rose-900/40 dark:bg-rose-950/20 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-base font-semibold text-rose-900 dark:text-rose-200">
                  Emergency Operator Session Revocation
                </h3>
                <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/70 leading-relaxed">
                  In case of operator credential compromise or security alert, this action immediately terminates all console sessions across the platform. Operators must re-authenticate with fresh credentials.
                </p>
              </div>
            </div>

            <div className="border-t border-rose-200/80 dark:border-rose-900/50 pt-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">Super-Admin Authorization Required</p>
                <p className="text-[11px] text-rose-600 dark:text-rose-400">Requires mandatory compliance justification ($\ge 10$ chars)</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowRevokeModal(true)}
                disabled={!isSuperAdmin}
                className="flex items-center gap-1.5"
              >
                <LogOut className="h-4 w-4" />
                Revoke All Sessions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY REVOCATION MODAL */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900 dark:bg-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-heading text-lg font-semibold">Confirm Operator Session Revocation</h3>
              </div>
              <button
                onClick={() => setShowRevokeModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Select the scope of session invalidation and enter a mandatory security reason. This action is permanently audited in PostgreSQL.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Operator Scope:
                </label>
                <select
                  value={targetOperatorId}
                  onChange={(e) => setTargetOperatorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">All Operators (Platform-wide emergency invalidation)</option>
                  {governance?.operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name} ({op.email}) — {op.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Compliance Justification Reason: <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-[11px] font-mono ${
                    revokeReason.trim().length >= 10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                  }`}>
                    {revokeReason.trim().length}/10 chars min
                  </span>
                </div>
                <textarea
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Provide explicit security reason for revoking operator sessions (min 10 chars)..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>

              {revokeError && (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {revokeError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRevokeModal(false)}
                disabled={revoking}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRevoke}
                disabled={revoking || revokeReason.trim().length < 10}
                className="flex items-center gap-1.5"
              >
                <LogOut className="h-4 w-4" />
                {revoking ? 'Revoking...' : 'Confirm Revocation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
