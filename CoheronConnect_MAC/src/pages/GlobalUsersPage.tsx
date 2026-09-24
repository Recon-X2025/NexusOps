import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  ShieldAlert,
  Shield,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  LogOut,
  Loader2,
  X,
  User,
  Phone,
  Mail,
  Eye,
  UserCheck,
  Radio,
  Sliders,
  Check,
} from 'lucide-react';
import { useOrgs } from '../context/WizardContext';
import { useAudit } from '../context/AuditContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { ImpersonationModal } from '../components/ImpersonationModal';
import {
  getToken,
  decodeJwtToken,
  searchGlobalUsers,
  getUserDetails,
  getUserSessions,
  forceLogoutUser,
  updateUserStatus,
  type GlobalUserItem,
  type GlobalUserDetails,
  type UserSessionItem,
} from '../lib/api';
import { formatDateTime, relativeTime } from '../lib/time';

const ROLE_BADGES: Record<string, { label: string; cls: string }> = {
  owner: {
    label: 'Owner',
    cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  },
  admin: {
    label: 'Admin',
    cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  },
  member: {
    label: 'Member',
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  viewer: {
    label: 'Viewer',
    cls: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700',
  },
};

const STATUS_BADGES: Record<string, { label: string; dot: string; cls: string }> = {
  active: {
    label: 'Active',
    dot: 'bg-emerald-500',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  invited: {
    label: 'Invited',
    dot: 'bg-amber-500',
    cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
  disabled: {
    label: 'Disabled',
    dot: 'bg-rose-500',
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  },
  suspended: {
    label: 'Suspended',
    dot: 'bg-rose-500',
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  },
};

export function GlobalUsersPage() {
  const { tenants } = useOrgs();
  const { log } = useAudit();

  // Operator RBAC determination
  const operatorRole = useMemo(() => {
    const token = getToken();
    if (!token) return 'super_admin';
    const jwt = decodeJwtToken(token);
    return (jwt?.operatorRole as string) || (jwt?.role as string) || 'super_admin';
  }, []);

  const isAuditor = operatorRole === 'auditor';
  const isSupportRestricted = operatorRole === 'support_staff';

  // State: Data
  const [users, setUsers] = useState<GlobalUserItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State: Search & Filters
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // State: Modals & Drawers
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [inspectDetails, setInspectDetails] = useState<GlobalUserDetails | null>(null);
  const [inspectSessions, setInspectSessions] = useState<UserSessionItem[]>([]);
  const [loadingInspect, setLoadingInspect] = useState(false);

  // Force Logout Modal
  const [logoutTarget, setLogoutTarget] = useState<GlobalUserItem | null>(null);
  const [logoutReason, setLogoutReason] = useState('');
  const [submittingLogout, setSubmittingLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Status Change Modal
  const [statusTarget, setStatusTarget] = useState<GlobalUserItem | null>(null);
  const [newStatus, setNewStatus] = useState<'active' | 'disabled' | 'suspended'>('active');
  const [statusReason, setStatusReason] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Impersonation Modal (reusing Phase 3)
  const [impersonateTarget, setImpersonateTarget] = useState<GlobalUserItem | null>(null);

  // Feedback banner
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    if (isSupportRestricted) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await searchGlobalUsers({
        query: activeQuery ? activeQuery : undefined,
        orgId: selectedOrgId !== 'all' ? selectedOrgId : undefined,
        role: selectedRole !== 'all' ? (selectedRole as 'owner' | 'admin' | 'member' | 'viewer') : undefined,
        status: selectedStatus !== 'all' ? (selectedStatus as 'active' | 'invited' | 'disabled') : undefined,
        limit: 50,
        offset: 0,
      });

      setUsers(res.users);
      setTotalCount(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search cross-tenant users');
    } finally {
      setLoading(false);
    }
  }, [activeQuery, selectedOrgId, selectedRole, selectedStatus, isSupportRestricted]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Load Inspection Drawer Data
  const handleOpenInspect = async (user: GlobalUserItem) => {
    setInspectUserId(user.id);
    setLoadingInspect(true);
    try {
      const [details, sessions] = await Promise.all([
        getUserDetails(user.id),
        getUserSessions(user.id),
      ]);
      setInspectDetails(details);
      setInspectSessions(sessions);
    } catch (err) {
      console.error('Failed to load user inspect details:', err);
    } finally {
      setLoadingInspect(false);
    }
  };

  const handleCloseInspect = () => {
    setInspectUserId(null);
    setInspectDetails(null);
    setInspectSessions([]);
  };

  // Perform Force Logout
  const handleConfirmLogout = async () => {
    if (!logoutTarget) return;
    if (logoutReason.trim().length < 10) {
      setLogoutError('Reason must be at least 10 characters long.');
      return;
    }

    setSubmittingLogout(true);
    setLogoutError(null);
    try {
      const res = await forceLogoutUser({
        userId: logoutTarget.id,
        orgId: logoutTarget.orgId,
        reason: logoutReason.trim(),
      });

      log({
        admin: operatorRole,
        action: 'user_force_logout',
        tenantId: logoutTarget.orgId,
        tenantName: logoutTarget.orgName || logoutTarget.orgId,
        summary: `Force logged out user ${logoutTarget.email}. Revoked ${res.revokedCount} session(s). Reason: ${logoutReason}`,
      });

      setBannerNotice({
        type: 'success',
        message: `Successfully revoked ${res.revokedCount} session(s) for ${logoutTarget.email}.`,
      });

      setLogoutTarget(null);
      setLogoutReason('');

      // Refresh data
      fetchUsers();
      if (inspectUserId === logoutTarget.id) {
        handleOpenInspect(logoutTarget);
      }
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : 'Failed to force logout user');
    } finally {
      setSubmittingLogout(false);
    }
  };

  // Perform Status Change
  const handleConfirmStatus = async () => {
    if (!statusTarget) return;
    if (statusReason.trim().length < 10) {
      setStatusError('Reason must be at least 10 characters long.');
      return;
    }

    setSubmittingStatus(true);
    setStatusError(null);
    try {
      const res = await updateUserStatus({
        userId: statusTarget.id,
        orgId: statusTarget.orgId,
        status: newStatus,
        reason: statusReason.trim(),
      });

      log({
        admin: operatorRole,
        action: 'user_status_update',
        tenantId: statusTarget.orgId,
        tenantName: statusTarget.orgName || statusTarget.orgId,
        summary: `Changed status for ${statusTarget.email} from ${res.previousStatus} to ${res.newStatus}. Reason: ${statusReason}`,
      });

      setBannerNotice({
        type: 'success',
        message: `Status for ${statusTarget.email} updated to ${res.newStatus}. ${res.revokedSessionsCount > 0 ? `${res.revokedSessionsCount} active session(s) revoked.` : ''}`,
      });

      setStatusTarget(null);
      setStatusReason('');

      // Refresh data
      fetchUsers();
      if (inspectUserId === statusTarget.id) {
        handleOpenInspect(statusTarget);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Quick stats
  const activeCount = useMemo(() => users.filter((u) => u.status === 'active').length, [users]);
  const adminCount = useMemo(() => users.filter((u) => u.role === 'admin' || u.role === 'owner').length, [users]);
  const disabledCount = useMemo(() => users.filter((u) => u.status === 'disabled').length, [users]);

  // If support_staff operator, display hard restriction
  if (isSupportRestricted) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Global Users Directory & Governance"
          subtitle="Cross-tenant identity intelligence and session telemetry"
        />
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-500 mb-3" />
          <h2 className="text-lg font-bold text-rose-900 dark:text-rose-200">Access Restricted</h2>
          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            Your assigned role <span className="font-semibold">Support Staff</span> does not have cross-tenant
            <code className="mx-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300 font-mono text-xs">usersView</code>
            privileges. Contact a Super Administrator if access is required for your duties.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Users Directory & Governance"
        subtitle="Cross-tenant identity intelligence, session telemetry, and privilege governance with mandatory audit logging"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Directory
          </Button>
        }
      />

      {/* Auditor Banner */}
      {isAuditor && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold">Auditor Read-Only Mode:</span> You have cross-tenant user and session inspection permissions.
            Destructive actions (Force Logout, Change Status, Session Revocation) are strictly locked.
          </div>
        </div>
      )}

      {/* Action Banner Toast */}
      {bannerNotice && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm border ${
            bannerNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>{bannerNotice.message}</span>
          </div>
          <button
            onClick={() => setBannerNotice(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Directory Users
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {totalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across registered organizations
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Accounts
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Healthy authenticated users
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Owners & Admins
            </span>
            <div className="rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {adminCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            High-privilege tenant operators
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Disabled / Suspended
            </span>
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {disabledCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Revoked access state
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by user name, email, or phone number..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setActiveQuery(searchInput.trim());
                }
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setActiveQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button
            size="sm"
            onClick={() => setActiveQuery(searchInput.trim())}
            className="flex items-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </Button>

          {/* Tenant Filter */}
          <div className="w-full md:w-56">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-white"
            >
              <option value="all">All Organizations</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.companyName}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="w-full md:w-36">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-white"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full md:w-36">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/50 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {(activeQuery || selectedOrgId !== 'all' || selectedRole !== 'all' || selectedStatus !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setSelectedOrgId('all');
                setSelectedRole('all');
                setSelectedStatus('all');
              }}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-sm">Querying cross-tenant directory...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500 mb-2" />
            <p className="text-sm font-medium text-slate-900 dark:text-white">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchUsers} className="mt-4">
              Try Again
            </Button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No users found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Try adjusting your search terms or filter parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <tr>
                  <th className="py-3.5 pl-6 pr-3">User & Profile</th>
                  <th className="py-3.5 px-3">Organization</th>
                  <th className="py-3.5 px-3">Role & Matrix</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Last Login</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => {
                  const roleBadge = ROLE_BADGES[u.role] || { label: u.role, cls: 'bg-slate-100 text-slate-700' };
                  const statusBadge = STATUS_BADGES[u.status] || STATUS_BADGES.active;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* User Info */}
                      <td className="py-3.5 pl-6 pr-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                              <span>{u.name || 'Unnamed User'}</span>
                              {u.mfaEnrolled && (
                                <span
                                  title="MFA Enrolled & Active"
                                  className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {u.email}
                              </span>
                              {u.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {u.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Organization */}
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {u.orgName || 'Unknown Org'}
                        </div>
                        <div className="font-mono text-xs text-slate-400 dark:text-slate-500">
                          {u.orgSlug || u.orgId.slice(0, 8)}
                        </div>
                      </td>

                      {/* Role & Matrix Role */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadge.cls}`}
                          >
                            {roleBadge.label}
                          </span>
                          {u.matrixRole && (
                            <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50/50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:border-purple-800/40 dark:bg-purple-950/20 dark:text-purple-300">
                              {u.matrixRole}
                            </span>
                          )}
                        </div>
                        {(u.department || u.jobTitle) && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {[u.jobTitle, u.department].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td className="py-3.5 px-3 text-xs text-slate-500 dark:text-slate-400">
                        {u.lastLoginAt ? (
                          <div>
                            <p className="font-medium text-slate-700 dark:text-slate-300">
                              {relativeTime(u.lastLoginAt)}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {formatDateTime(u.lastLoginAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">Never logged in</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pl-3 pr-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Inspect Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenInspect(u)}
                            className="h-8 px-2 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                            title="Inspect User & Sessions"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Inspect
                          </Button>

                          {/* Force Logout Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isAuditor}
                            onClick={() => {
                              setLogoutTarget(u);
                              setLogoutReason('');
                              setLogoutError(null);
                            }}
                            className="h-8 px-2 text-slate-600 hover:text-rose-600 disabled:opacity-40 dark:text-slate-300 dark:hover:text-rose-400"
                            title={isAuditor ? 'Restricted for Auditor' : 'Force Logout User & Revoke Sessions'}
                          >
                            <LogOut className="h-3.5 w-3.5 mr-1" />
                            Force Logout
                          </Button>

                          {/* Change Status Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isAuditor}
                            onClick={() => {
                              setStatusTarget(u);
                              setNewStatus(u.status === 'disabled' ? 'active' : 'disabled');
                              setStatusReason('');
                              setStatusError(null);
                            }}
                            className="h-8 px-2 text-slate-600 hover:text-amber-600 disabled:opacity-40 dark:text-slate-300 dark:hover:text-amber-400"
                            title={isAuditor ? 'Restricted for Auditor' : 'Change Account Status'}
                          >
                            <Sliders className="h-3.5 w-3.5 mr-1" />
                            Status
                          </Button>

                          {/* Impersonate Button (Reuses Phase 3) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isAuditor || u.status !== 'active'}
                            onClick={() => setImpersonateTarget(u)}
                            className="h-8 px-2 text-slate-600 hover:text-purple-600 disabled:opacity-40 dark:text-slate-300 dark:hover:text-purple-400"
                            title={
                              isAuditor
                                ? 'Restricted for Auditor'
                                : u.status !== 'active'
                                ? 'Cannot impersonate inactive account'
                                : 'Audited Impersonation (Phase 3)'
                            }
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1" />
                            Impersonate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── USER INSPECTION DRAWER ── */}
      {inspectUserId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white shadow-2xl dark:bg-slate-900 flex flex-col h-full border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                    User Details & Session Telemetry
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    ID: {inspectUserId}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseInspect}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingInspect ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
                  <p className="text-sm">Fetching user identity & active sessions...</p>
                </div>
              ) : inspectDetails ? (
                <>
                  {/* Basic Profile Card */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-lg">
                          {inspectDetails.user.name || 'Unnamed User'}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-0.5">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          {inspectDetails.user.email}
                        </p>
                        {inspectDetails.user.phone && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {inspectDetails.user.phone}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            STATUS_BADGES[inspectDetails.user.status]?.cls || STATUS_BADGES.active.cls
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              STATUS_BADGES[inspectDetails.user.status]?.dot || STATUS_BADGES.active.dot
                            }`}
                          />
                          {STATUS_BADGES[inspectDetails.user.status]?.label || inspectDetails.user.status}
                        </span>
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800">
                          {inspectDetails.user.role.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                      <div>
                        <span className="text-slate-400">Organization:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {inspectDetails.user.orgName} ({inspectDetails.user.orgPlan || 'Plan Free'})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">MFA Enrolled:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {inspectDetails.user.mfaEnrolled ? 'Enabled (Active)' : 'Not Enrolled'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Department / Title:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {[inspectDetails.user.department, inspectDetails.user.jobTitle].filter(Boolean).join(' - ') || 'None assigned'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Matrix Role:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {inspectDetails.user.matrixRole || 'None'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Account Created:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDateTime(inspectDetails.user.createdAt)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Last Login:</span>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {inspectDetails.user.lastLoginAt ? formatDateTime(inspectDetails.user.lastLoginAt) : 'Never'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sessions Inspection Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-blue-500 animate-pulse" />
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                          Session Telemetry & Tokens
                        </h4>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {inspectDetails.activeSessionCount} Active Session{inspectDetails.activeSessionCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    {inspectSessions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                        No active or past sessions found in database for this account.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {inspectSessions.map((s) => (
                          <div
                            key={s.id}
                            className={`rounded-lg border p-3 text-xs transition-colors ${
                              s.isExpired
                                ? 'border-slate-200 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/20'
                                : 'border-emerald-200 bg-emerald-50/30 text-slate-800 dark:border-emerald-900/40 dark:bg-emerald-950/10 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] ${
                                    s.isExpired
                                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  }`}
                                >
                                  {s.isExpired ? 'EXPIRED' : 'ACTIVE'}
                                </span>
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  IP: {s.ipAddress || '127.0.0.1'}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400">
                                Expires {relativeTime(s.expiresAt)}
                              </span>
                            </div>

                            <p className="mt-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate" title={s.userAgent || ''}>
                              Agent: {s.userAgent || 'Unknown device browser'}
                            </p>

                            {s.impersonatedBy && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                                <Shield className="h-3 w-3" />
                                <span>Minted via Super-Admin Impersonation: {s.impersonatedBy}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Drawer Footer Actions */}
            {inspectDetails && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={handleCloseInspect}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isAuditor}
                    onClick={() => {
                      setLogoutTarget(inspectDetails.user);
                      setLogoutReason('');
                      setLogoutError(null);
                    }}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900/40 dark:hover:bg-rose-950/20"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1.5" />
                    Force Logout
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isAuditor}
                    onClick={() => {
                      setStatusTarget(inspectDetails.user);
                      setNewStatus(inspectDetails.user.status === 'disabled' ? 'active' : 'disabled');
                      setStatusReason('');
                      setStatusError(null);
                    }}
                    className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900/40 dark:hover:bg-amber-950/20"
                  >
                    <Sliders className="h-3.5 w-3.5 mr-1.5" />
                    Change Status
                  </Button>
                  <Button
                    size="sm"
                    disabled={isAuditor || inspectDetails.user.status !== 'active'}
                    onClick={() => setImpersonateTarget(inspectDetails.user)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                    Impersonate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FORCE LOGOUT CONFIRMATION MODAL ── */}
      {logoutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="rounded-full bg-rose-50 p-2 dark:bg-rose-500/10">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm Force Logout
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Target Account: {logoutTarget.email}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-rose-50/60 border border-rose-200/80 p-3 text-xs text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-300">
              <span className="font-bold">Security Revocation Effect:</span> This will instantly delete all active session tokens in PostgreSQL and purge distributed Redis/in-process caches. The user will be immediately logged out across all web and mobile clients.
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Mandatory Revocation Reason</span>
                <span
                  className={
                    logoutReason.trim().length >= 10
                      ? 'text-emerald-600 font-bold'
                      : 'text-slate-400'
                  }
                >
                  {logoutReason.trim().length} / 10 characters minimum
                </span>
              </div>
              <textarea
                rows={3}
                placeholder="e.g. Session termination requested due to suspicious multi-location IP activity."
                value={logoutReason}
                onChange={(e) => setLogoutReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-rose-400"
              />
            </div>

            {logoutError && (
              <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {logoutError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogoutTarget(null)}
                disabled={submittingLogout}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmLogout}
                disabled={submittingLogout || logoutReason.trim().length < 10}
                className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
              >
                {submittingLogout ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <LogOut className="h-4 w-4 mr-1.5" />
                )}
                Revoke All Sessions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE STATUS MODAL ── */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-slate-900 dark:text-white">
              <div className="rounded-full bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <Sliders className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">
                  Change User Account Status
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Target Account: {statusTarget.email} (Current: {statusTarget.status})
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Select New Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['active', 'disabled', 'suspended'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setNewStatus(st)}
                    className={`rounded-lg border p-2.5 text-xs font-semibold capitalize transition-all flex items-center justify-center gap-1.5 ${
                      newStatus === st
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {newStatus === st && <Check className="h-3.5 w-3.5" />}
                    {st}
                  </button>
                ))}
              </div>
              {newStatus !== 'active' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Selecting disabled or suspended will immediately invalidate all active sessions.
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Mandatory Governance Reason</span>
                <span
                  className={
                    statusReason.trim().length >= 10
                      ? 'text-emerald-600 font-bold'
                      : 'text-slate-400'
                  }
                >
                  {statusReason.trim().length} / 10 characters minimum
                </span>
              </div>
              <textarea
                rows={3}
                placeholder="e.g. Account disabled pending verification of employee departure from tenant organization."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-400"
              />
            </div>

            {statusError && (
              <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {statusError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusTarget(null)}
                disabled={submittingStatus}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmStatus}
                disabled={submittingStatus || statusReason.trim().length < 10}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {submittingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                Save Status Change
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── REUSED PHASE 3 IMPERSONATION MODAL ── */}
      {impersonateTarget && (
        <ImpersonationModal
          tenant={{
            id: impersonateTarget.orgId,
            companyName: impersonateTarget.orgName || 'Tenant Organization',
            slug: impersonateTarget.orgSlug || undefined,
          }}
          initialUserId={impersonateTarget.id}
          onClose={() => setImpersonateTarget(null)}
          onLaunched={() => {
            setImpersonateTarget(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
