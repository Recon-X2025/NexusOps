// ──────────────────────────────────────────────────────────────────────
// Live API client for CoheronConnect Super-Admin
// Base URL: Configured via import.meta.env.VITE_API_BASE (defaults to http://localhost:3001)
// Auth: POST /api/trpc/mac.login → { token }
// All super-admin calls use Authorization: Bearer <token>
// ──────────────────────────────────────────────────────────────────────
import type {
  SuperAdminOperator,
  OperatorRole,
  OperatorRoleDefinition,
  FinanceOverviewData,
  ComplianceOverviewData,
  StatutoryCalendarItem,
  DpdpDsrItem,
  DpdpBreachItem,
  GrcRiskItem,
  GrcPolicyItem,
  TenantOrganization,
} from './types';

export type {
  SuperAdminOperator,
  OperatorRole,
  OperatorRoleDefinition,
  FinanceOverviewData,
  ComplianceOverviewData,
  StatutoryCalendarItem,
  DpdpDsrItem,
  DpdpBreachItem,
  GrcRiskItem,
  GrcPolicyItem,
  TenantOrganization,
};

export const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || 'http://localhost:3001';

// Super-admin operator credentials for local development
export const DEMO_EMAIL = 'admin@coheron.tech';
export const DEMO_PASSWORD = 'mac-local-dev-password';

// Token stored in sessionStorage so it survives React state resets
let authToken: string | null = null;

export function getToken(): string | null {
  if (authToken) return authToken;
  const stored = sessionStorage.getItem('cc-token');
  if (stored) {
    authToken = stored;
    return stored;
  }
  return null;
}

export function setToken(token: string): void {
  authToken = token;
  sessionStorage.setItem('cc-token', token);
}

export function clearToken(): void {
  authToken = null;
  sessionStorage.removeItem('cc-token');
  sessionStorage.removeItem('cc-email');
}

export const SESSION_EXPIRED_EVENT = 'cc-session-expired';

export function onSessionExpired(cb: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, cb);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, cb);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ── JWT Decoder ──

export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  type?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function decodeJwtToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as JwtPayload;
  } catch {
    return null;
  }
}

export const parseJwt = decodeJwtToken;

// ── tRPC fetch helpers ──

interface TrpcOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

function trpcUrl(procedure: string): string {
  return `${API_BASE}/trpc/${procedure}`;
}

function trpcQueryUrl(procedure: string, input: unknown): string {
  const encoded = encodeURIComponent(JSON.stringify(input));
  return `${API_BASE}/trpc/${procedure}?input=${encoded}`;
}

async function trpcFetch(
  procedure: string,
  options: TrpcOptions = {},
  input?: unknown,
): Promise<unknown> {
  const { body, auth = true, headers, method, ...rest } = options;
  const isQuery = method === undefined || method === 'GET';
  let url = isQuery && input !== undefined
    ? trpcQueryUrl(procedure, input)
    : trpcUrl(procedure);

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      method: isQuery ? 'GET' : method,
      headers: finalHeaders,
      body: !isQuery && body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 404) {
      // Try fallback to /api/trpc/... if /trpc/... returned 404
      const altUrl = isQuery && input !== undefined
        ? `${API_BASE}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`
        : `${API_BASE}/api/trpc/${procedure}`;
      const altRes = await fetch(altUrl, {
        ...rest,
        method: isQuery ? 'GET' : method,
        headers: finalHeaders,
        body: !isQuery && body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (altRes.ok || altRes.status !== 404) {
        res = altRes;
        url = altUrl;
      }
    }
  } catch (networkErr) {
    console.error('[CoheronConnect] Fetch failed:', networkErr);
    throw new ApiError(
      `Can't reach the server at ${url}. Check your network connection or CORS settings.`,
      0,
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errObj = data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {};
    const errData = errObj.error as Record<string, unknown> | undefined;
    const message = (typeof errData?.message === 'string' ? errData.message : null)
      ?? (typeof errObj.message === 'string' ? errObj.message : null)
      ?? (typeof data === 'string' ? data : null)
      ?? `Request to ${url} failed with status ${res.status}.`;

    if (auth && (res.status === 401 || res.status === 403)) {
      clearToken();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      throw new ApiError(`Session expired (${res.status}) at ${url} — please log in again.`, res.status);
    }

    throw new ApiError(message, res.status);
  }

  // Unwrap tRPC response: { result: { data: ... } }
  const resultObj = data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : {};
  const result = resultObj.result as Record<string, unknown> | undefined;
  if (result && typeof result === 'object' && 'data' in result) {
    return result.data;
  }

  return data;
}

// ── REST fetch helper for Super-Admin endpoints ──

async function restFetch(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${API_BASE}${cleanPath}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 404) {
      // Try alternate path prefix (with or without /api)
      const altPath = cleanPath.startsWith('/api')
        ? cleanPath.replace('/api', '')
        : `/api${cleanPath}`;
      const altUrl = `${API_BASE}${altPath}`;
      const altRes = await fetch(altUrl, { ...options, headers });
      if (altRes.ok || altRes.status !== 404) {
        res = altRes;
        url = altUrl;
      }
    }
  } catch (networkErr) {
    console.error('[CoheronConnect] REST Fetch failed:', networkErr);
    throw new ApiError(
      `Can't reach the server at ${url}. Check your network connection or CORS settings.`,
      0,
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errObj = data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {};
    const message = (typeof errObj.error === 'string' ? errObj.error : null)
      ?? (typeof errObj.message === 'string' ? errObj.message : null)
      ?? (typeof data === 'string' ? data : null)
      ?? `Request to ${url} failed with status ${res.status}.`;

    if (res.status === 401 || res.status === 403) {
      clearToken();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      throw new ApiError(`Session expired (${res.status}) at ${url} — please log in again.`, res.status);
    }

    throw new ApiError(message, res.status);
  }

  return data;
}

// ── LOGIN ──

export interface LoginResponse {
  token: string;
  email?: string;
  user?: unknown;
  org?: unknown;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const data = await trpcFetch('mac.login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  }) as { token?: string; sessionId?: string; user?: { email?: string }; org?: unknown } | null;

  const token = data?.token ?? data?.sessionId;
  if (!token) {
    throw new ApiError('Login succeeded but no token was returned.', 200);
  }

  setToken(token);

  // Decode JWT payload if present to verify real operator claims
  const jwt = decodeJwtToken(token);
  const realEmail = jwt?.email ?? (typeof jwt?.sub === 'string' && jwt.sub.includes('@') ? jwt.sub : null) ?? data?.user?.email ?? email;

  sessionStorage.setItem('cc-email', realEmail);

  return {
    token,
    email: realEmail,
    user: data?.user ?? {
      id: (typeof jwt?.sub === 'string' ? jwt.sub : 'mac-operator'),
      email: realEmail,
      name: 'Super Admin Operator',
      role: (jwt?.role as string) ?? 'mac_operator',
    },
    org: data?.org ?? {
      id: 'system',
      name: 'Coheron Platform Management',
    },
  };
}

export async function apiLogout(): Promise<void> {
  clearToken();
}

// ── AUTH / USER ──

export interface AuthMeResponse {
  user: {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: string;
    status: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    industry: string | null;
    companySize: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
    supportEmail: string | null;
    gstin: string | null;
    cin: string | null;
    pan: string | null;
    tan: string | null;
    epfCode: string | null;
    primaryStateCode: string | null;
    slaP1Hours: number | null;
    slaP2Hours: number | null;
    slaP3Hours: number | null;
    slaP4Hours: number | null;
    createdAt: string;
    updatedAt: string;
  };
}

export async function getMe(): Promise<AuthMeResponse | null> {
  try {
    const token = getToken();
    if (!token) return null;
    const jwt = decodeJwtToken(token);
    const savedEmail = sessionStorage.getItem('cc-email');
    const operatorEmail = jwt?.email ?? (typeof jwt?.sub === 'string' && jwt.sub.includes('@') ? jwt.sub : null) ?? savedEmail ?? 'admin@coheron.tech';
    return {
      user: {
        id: (typeof jwt?.sub === 'string' ? jwt.sub : 'mac-operator'),
        orgId: 'system',
        email: operatorEmail,
        name: 'Super Admin Operator',
        role: (jwt?.role as string) ?? 'mac_operator',
        status: 'active',
      },
      org: {
        id: 'system',
        name: 'Coheron Platform Management',
        slug: 'system',
        plan: 'enterprise',
        industry: 'Technology',
        companySize: 'Enterprise',
        city: 'Bengaluru',
        state: 'Karnataka',
        website: 'https://coheron.tech',
        supportEmail: 'support@coheron.tech',
        gstin: null,
        cin: null,
        pan: null,
        tan: null,
        epfCode: null,
        primaryStateCode: null,
        slaP1Hours: null,
        slaP2Hours: null,
        slaP3Hours: null,
        slaP4Hours: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  }
}

export async function listUsers(): Promise<unknown[]> {
  return (await trpcFetch('mac.stats') as unknown[]) ?? [];
}

// ── DASHBOARD ──

export interface DashboardMetrics {
  openTickets: number;
  createdToday: number;
  resolvedToday: number;
  pendingApprovals: number;
  unassigned: number;
  slaBreached: number;
  slaCompliancePct: number | null;
  totalTickets: number;
  resolvedTickets: number;
  openIncidents: number;
  payableOutstanding: number;
  receivableOutstanding: number;
  totalAssets: number;
  activeProjects: number;
  activeOkrs: number;
  csatScore: number | null;
  csatResponses: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return await trpcFetch('dashboard.getMetrics') as DashboardMetrics;
}

export async function getDashboardTimeSeries(metric: string, range: string): Promise<{ created: unknown[]; resolved: unknown[] }> {
  return await trpcFetch('dashboard.getTimeSeries', {}, { metric, range }) as { created: unknown[]; resolved: unknown[] };
}

export async function getDashboardTopCategories(): Promise<unknown[]> {
  return (await trpcFetch('dashboard.getTopCategories') as unknown[]) ?? [];
}

// ── ORG CRUD ──

export interface OrgListParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  sort?: string;
}

export async function listOrgs(params: OrgListParams = {}): Promise<unknown> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.sort) query.set('sort', params.sort);

  const queryString = query.toString();
  const path = `/super-admin/orgs${queryString ? `?${queryString}` : ''}`;
  return await restFetch(path, { method: 'GET' });
}

export async function getOrg(orgId: string): Promise<unknown> {
  return await restFetch(`/super-admin/orgs/${orgId}`, { method: 'GET' });
}

export interface UpdateOrgBody {
  profile?: Record<string, unknown>;
  compliance?: Record<string, unknown>;
  india?: Record<string, unknown>;
  itsm?: Record<string, unknown>;
}

export async function updateOrg(orgId: string, body: UpdateOrgBody): Promise<unknown> {
  const payload: Record<string, unknown> = {};
  if (body.profile) payload.profile = body.profile;
  if (body.india || body.compliance) payload.india = body.india ?? body.compliance;
  if (body.itsm) payload.itsm = body.itsm;

  return await restFetch(`/super-admin/orgs/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function flagOrg(
  orgId: string,
  body: { flagged: boolean; note?: string; reason?: string; assignedOwner?: string; reminderSentAt?: string },
): Promise<unknown> {
  return await restFetch(`/super-admin/orgs/${orgId}/flag`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function suspendOrg(orgId: string): Promise<unknown> {
  return await restFetch(`/super-admin/orgs/${orgId}`, {
    method: 'DELETE',
  });
}

export async function getAuditLogs(): Promise<unknown[]> {
  try {
    const data = await restFetch('/super-admin/audit-logs', { method: 'GET' });
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.logs)) return obj.logs;
      if (Array.isArray(obj.data)) return obj.data;
      if (Array.isArray(obj.items)) return obj.items;
    }
    return [];
  } catch {
    return [];
  }
}

// ── SUPER-ADMIN OPERATORS ──

export async function getOperators(): Promise<SuperAdminOperator[]> {
  const res = await restFetch('/super-admin/operators', { method: 'GET' }) as { data?: SuperAdminOperator[] };
  return res?.data ?? [];
}

export async function createOperator(body: {
  name: string;
  email: string;
  password: string;
  role: OperatorRole;
  phone?: string;
}): Promise<SuperAdminOperator> {
  const res = await restFetch('/super-admin/operators', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as { data: SuperAdminOperator };
  return res.data;
}

export async function updateOperator(
  id: string,
  body: { name?: string; role?: OperatorRole; status?: 'active' | 'disabled'; phone?: string | null; password?: string },
): Promise<void> {
  await restFetch(`/super-admin/operators/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteOperator(id: string): Promise<void> {
  await restFetch(`/super-admin/operators/${id}`, {
    method: 'DELETE',
  });
}

export async function getOperatorRoles(): Promise<OperatorRoleDefinition[]> {
  const res = await restFetch('/super-admin/operator-roles', { method: 'GET' }) as { data?: OperatorRoleDefinition[] };
  return res?.data ?? [];
}

export async function createOperatorRole(body: {
  name: string;
  description: string;
  permissions: Record<string, boolean>;
  color?: string;
  badgeCls?: string;
}): Promise<OperatorRoleDefinition> {
  const res = (await restFetch('/super-admin/operator-roles', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { data: OperatorRoleDefinition };
  return res.data;
}

export async function deleteOperatorRole(id: string): Promise<void> {
  await restFetch(`/super-admin/operator-roles/${id}`, {
    method: 'DELETE',
  });
}

// ── FINANCE & SUBSCRIPTIONS ──

export async function getFinanceOverview(): Promise<FinanceOverviewData> {
  const res = await restFetch('/super-admin/finance/overview', { method: 'GET' }) as { data: FinanceOverviewData };
  return res.data;
}

export async function updateTenantSubscription(
  orgId: string,
  body: { plan?: string; subscriptionStatus?: string; stripeCustomerId?: string; trialEndsAt?: string | null; reason: string },
): Promise<void> {
  await restFetch(`/super-admin/finance/subscriptions/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ── COMPLIANCE & GRC ──

export async function getComplianceOverview(): Promise<ComplianceOverviewData> {
  return (await restFetch('/super-admin/compliance/overview', { method: 'GET' })) as ComplianceOverviewData;
}

export async function getStatutoryCalendar(): Promise<StatutoryCalendarItem[]> {
  const res = (await restFetch('/super-admin/compliance/statutory-calendar', { method: 'GET' })) as {
    items?: StatutoryCalendarItem[];
  };
  return res?.items ?? [];
}

export async function createStatutoryItem(body: {
  orgId: string;
  complianceType: 'annual' | 'event_based' | 'monthly' | 'quarterly';
  eventName: string;
  mcaForm?: string;
  financialYear?: string;
  dueDate: string;
  penaltyPerDayInr?: string;
  notes?: string;
}): Promise<StatutoryCalendarItem> {
  const res = (await restFetch('/super-admin/compliance/statutory-calendar', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { item: StatutoryCalendarItem };
  return res.item;
}

export async function updateStatutoryItem(
  id: string,
  body: {
    status?: 'upcoming' | 'due_soon' | 'overdue' | 'filed' | 'not_applicable';
    filedDate?: string | null;
    srn?: string | null;
    penaltyPerDayInr?: string;
    daysOverdue?: number;
    totalPenaltyInr?: string;
    notes?: string;
  },
): Promise<StatutoryCalendarItem> {
  const res = (await restFetch(`/super-admin/compliance/statutory-calendar/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })) as { item: StatutoryCalendarItem };
  return res.item;
}

export async function getDpdpData(): Promise<{ dsrs: DpdpDsrItem[]; breaches: DpdpBreachItem[] }> {
  const res = (await restFetch('/super-admin/compliance/dpdp', { method: 'GET' })) as {
    dsrs?: DpdpDsrItem[];
    breaches?: DpdpBreachItem[];
  };
  return {
    dsrs: res?.dsrs ?? [],
    breaches: res?.breaches ?? [],
  };
}

export async function createDpdpDsr(body: {
  orgId: string;
  requestType: 'access' | 'correction' | 'erasure' | 'grievance' | 'nomination';
  principalName: string;
  principalEmail?: string;
  principalPhone?: string;
  details?: string;
  responseWindowDays?: number;
}): Promise<DpdpDsrItem> {
  const res = (await restFetch('/super-admin/compliance/dpdp/dsr', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { dsr: DpdpDsrItem };
  return res.dsr;
}

export async function updateDpdpDsr(
  id: string,
  body: {
    status: 'received' | 'verifying' | 'in_progress' | 'on_hold' | 'fulfilled' | 'rejected' | 'closed';
    resolutionNote?: string;
    rejectionReason?: string;
  },
): Promise<DpdpDsrItem> {
  const res = (await restFetch(`/super-admin/compliance/dpdp/dsr/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })) as { dsr: DpdpDsrItem };
  return res.dsr;
}

export async function createDpdpBreach(body: {
  orgId: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedDataPrincipals?: number;
  dataCategories?: string;
  notificationWindowHours?: number;
}): Promise<DpdpBreachItem> {
  const res = (await restFetch('/super-admin/compliance/dpdp/breach', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { breach: DpdpBreachItem };
  return res.breach;
}

export async function updateDpdpBreach(
  id: string,
  body: {
    status: 'detected' | 'assessing' | 'notifying' | 'notified' | 'contained' | 'closed';
    boardNotifiedAt?: string;
    principalsNotifiedAt?: string;
    containedAt?: string;
  },
): Promise<DpdpBreachItem> {
  const res = (await restFetch(`/super-admin/compliance/dpdp/breach/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })) as { breach: DpdpBreachItem };
  return res.breach;
}

export async function triggerDpdpSweeps(): Promise<{ message: string; overdueMarked: number; deadlinesUpdated: number }> {
  return (await restFetch('/super-admin/compliance/dpdp/sweeps', { method: 'POST' })) as {
    message: string;
    overdueMarked: number;
    deadlinesUpdated: number;
  };
}

export async function getGrcRisks(): Promise<GrcRiskItem[]> {
  const res = (await restFetch('/super-admin/compliance/risks', { method: 'GET' })) as { risks?: GrcRiskItem[] };
  return res?.risks ?? [];
}

export async function createGrcRisk(body: {
  orgId: string;
  title: string;
  description?: string;
  category: 'operational' | 'financial' | 'strategic' | 'compliance' | 'technology' | 'reputational';
  likelihood: number;
  impact: number;
  treatment: 'accept' | 'mitigate' | 'transfer' | 'avoid';
  mitigationPlan?: string;
  reviewFrequency?: string;
}): Promise<GrcRiskItem> {
  const res = (await restFetch('/super-admin/compliance/risks', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { risk: GrcRiskItem };
  return res.risk;
}

export async function updateGrcRisk(
  id: string,
  body: {
    title?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    treatment?: 'accept' | 'mitigate' | 'transfer' | 'avoid';
    status?: 'identified' | 'assessed' | 'mitigating' | 'accepted' | 'closed';
    mitigationPlan?: string;
    reviewFrequency?: string;
  },
): Promise<GrcRiskItem> {
  const res = (await restFetch(`/super-admin/compliance/risks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })) as { risk: GrcRiskItem };
  return res.risk;
}

export async function getGrcPolicies(): Promise<GrcPolicyItem[]> {
  const res = (await restFetch('/super-admin/compliance/policies', { method: 'GET' })) as {
    policies?: GrcPolicyItem[];
  };
  return res?.policies ?? [];
}

export async function createGrcPolicy(body: {
  orgId: string;
  title: string;
  content?: string;
  category?: string;
  reviewCycleMonths?: number;
  status?: 'draft' | 'review' | 'approved' | 'published' | 'retired';
}): Promise<GrcPolicyItem> {
  const res = (await restFetch('/super-admin/compliance/policies', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { policy: GrcPolicyItem };
  return res.policy;
}

export async function getOrgs(): Promise<Array<{ id: string; name: string }>> {
  const res = (await restFetch('/super-admin/orgs', { method: 'GET' })) as any;
  const list = res?.data ?? (Array.isArray(res) ? res : []);
  return list.map((r: any) => ({
    id: r?.org?.id ?? r?.id,
    name: r?.org?.name ?? r?.name ?? 'Unnamed Org',
  }));
}

// ── TENANT MODULE ENTITLEMENTS & FEATURE FLAGS ──

export interface ModuleEntitlementDef {
  key: string;
  name: string;
  category: 'Core HR' | 'Operations' | 'Finance' | 'Governance' | 'Platform';
  description: string;
}

export const MODULE_ENTITLEMENTS: ModuleEntitlementDef[] = [
  {
    key: 'hrms',
    name: 'HRMS',
    category: 'Core HR',
    description: 'Core HR, employee directory, organizational hierarchy, leave & attendance management.',
  },
  {
    key: 'payroll',
    name: 'Payroll',
    category: 'Core HR',
    description: 'Automated payroll processing, salary structures, Form 16, EPF & Professional Tax compliance.',
  },
  {
    key: 'itsm',
    name: 'ITSM',
    category: 'Operations',
    description: 'IT service desk, ticketing, incidents, changes, service catalogs & SLA policy tracking.',
  },
  {
    key: 'crm',
    name: 'CRM',
    category: 'Operations',
    description: 'Customer relationship management, lead generation, deal pipeline & account tracking.',
  },
  {
    key: 'finance',
    name: 'Finance & Invoicing',
    category: 'Finance',
    description: 'General ledger, customer invoicing, billing, accounts payable (AP) & accounts receivable (AR).',
  },
  {
    key: 'procurement',
    name: 'Procurement',
    category: 'Finance',
    description: 'Purchase requisitions, purchase orders (PO), three-way vendor matching & vendor catalog.',
  },
  {
    key: 'compliance',
    name: 'GRC & Compliance',
    category: 'Governance',
    description: 'DPDP personal data protection, statutory filing calendar, risk registers & compliance oversight.',
  },
  {
    key: 'documents',
    name: 'Document Management',
    category: 'Governance',
    description: 'Encrypted document vault, fine-grained access control lists (ACLs) & audit-safe versioning.',
  },
  {
    key: 'command_center',
    name: 'Command Center',
    category: 'Platform',
    description: 'Real-time platform telemetry, executive command center & active operational health signals.',
  },
];

export interface FeatureFlagMatrixItem {
  key: string;
  name: string;
  description: string;
  category: string;
  planDefault: boolean;
  effective: boolean;
  isOverride: boolean;
}

export interface FeatureFlagsMatrixResponse {
  orgId: string;
  orgName: string;
  slug: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  flags: FeatureFlagMatrixItem[];
  overrides: Record<string, boolean>;
  planDefaults: Record<string, boolean>;
  effective: Record<string, boolean>;
}

export interface PlatformDefaultsResponse {
  mode: 'platform_defaults';
  catalog: Array<{
    key: string;
    name: string;
    description: string;
    category: string;
  }>;
  tiers: Array<{
    plan: string;
    defaults: Record<string, boolean>;
  }>;
}

export async function getTenantFeatureFlags(orgId: string): Promise<Record<string, boolean>> {
  const res = (await trpcFetch('mac.getFeatureFlags', { method: 'GET' }, { orgId })) as Record<string, boolean>;
  return res && typeof res === 'object' ? res : {};
}

export async function getFeatureFlagsMatrix(
  orgId?: string,
): Promise<FeatureFlagsMatrixResponse | PlatformDefaultsResponse> {
  const res = await trpcFetch(
    'mac.getFeatureFlags',
    { method: 'GET' },
    orgId ? { orgId, detailed: true } : { detailed: true },
  );
  return res as FeatureFlagsMatrixResponse | PlatformDefaultsResponse;
}

export async function setTenantFeatureFlag(
  orgId: string,
  flag: string,
  enabled: boolean,
  reason?: string,
): Promise<{ ok: boolean }> {
  const res = (await trpcFetch('mac.setFeatureFlag', {
    method: 'POST',
    body: { orgId, flag, enabled, reason },
  })) as { ok: boolean };
  return res && typeof res === 'object' ? res : { ok: true };
}

export async function resetTenantFeatureFlag(
  orgId: string,
  flag: string,
  reason?: string,
): Promise<{ ok: boolean; planDefault?: boolean }> {
  const res = (await trpcFetch('mac.resetFeatureFlag', {
    method: 'POST',
    body: { orgId, flag, reason },
  })) as { ok: boolean; planDefault?: boolean };
  return res && typeof res === 'object' ? res : { ok: true };
}

export async function resetTenantFeatureFlags(
  orgId: string,
  reason?: string,
): Promise<{ ok: boolean }> {
  const res = (await trpcFetch('mac.resetFeatureFlags', {
    method: 'POST',
    body: { orgId, reason },
  })) as { ok: boolean };
  return res && typeof res === 'object' ? res : { ok: true };
}

// ── AUDITED TENANT IMPERSONATION ──

export interface OrgUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ImpersonationResult {
  impersonationToken: string;
  expiresAt: string;
  redirectUrl: string;
}

export interface ImpersonationSessionRecord {
  id: string;
  token: string;
  operatorEmail: string;
  targetOrgId: string;
  targetOrgName: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  targetUserRole: string;
  reason: string;
  durationMinutes: number;
  startedAt: string;
  expiresAt: string;
  redirectUrl: string;
  status: 'active' | 'expired' | 'terminated';
  terminatedAt?: string | null;
}

export async function listOrgUsers(orgId: string): Promise<OrgUserItem[]> {
  const res = (await trpcFetch('mac.listOrgUsers', { method: 'GET' }, { orgId })) as OrgUserItem[];
  return Array.isArray(res) ? res : [];
}

export async function startImpersonation(body: {
  targetUserId: string;
  reason: string;
  durationMinutes: number;
}): Promise<ImpersonationResult> {
  return (await trpcFetch('mac.startImpersonation', {
    method: 'POST',
    body,
  })) as ImpersonationResult;
}

export async function revokeOrgSessions(orgId: string): Promise<{ ok: boolean; revoked: number }> {
  return (await trpcFetch('mac.revokeOrgSessions', {
    method: 'POST',
    body: { id: orgId },
  })) as { ok: boolean; revoked: number };
}

// ── PHASE 5: GLOBAL USERS DIRECTORY & SECURITY GOVERNANCE ──

export interface GlobalUserItem {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer' | string;
  matrixRole: string | null;
  department: string | null;
  jobTitle: string | null;
  status: 'active' | 'invited' | 'disabled';
  mfaEnrolled: boolean | null;
  lastLoginAt: string | null;
  createdAt: string;
  orgId: string;
  orgName: string | null;
  orgSlug: string | null;
}

export interface GlobalUserDetails {
  user: GlobalUserItem & {
    location?: string | null;
    bio?: string | null;
    updatedAt?: string | null;
    orgPlan?: string | null;
  };
  activeSessionCount: number;
}

export interface UserSessionItem {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
}

export interface SearchGlobalUsersInput {
  query?: string;
  email?: string;
  orgId?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  status?: 'active' | 'invited' | 'disabled';
  limit?: number;
  offset?: number;
}

export interface SearchGlobalUsersResponse {
  users: GlobalUserItem[];
  total: number;
}

export async function searchGlobalUsers(input: SearchGlobalUsersInput): Promise<SearchGlobalUsersResponse> {
  const queryParams: Record<string, string | number | undefined> = {};
  if (input.query) queryParams.query = input.query;
  if (input.email) queryParams.email = input.email;
  if (input.orgId) queryParams.orgId = input.orgId;
  if (input.role) queryParams.role = input.role;
  if (input.status) queryParams.status = input.status;
  if (input.limit !== undefined) queryParams.limit = input.limit;
  if (input.offset !== undefined) queryParams.offset = input.offset;

  const res = (await trpcFetch('mac.searchUsers', { method: 'GET' }, queryParams)) as SearchGlobalUsersResponse;
  return res && Array.isArray(res.users) ? res : { users: [], total: 0 };
}

export async function getUserDetails(userId: string): Promise<GlobalUserDetails> {
  return (await trpcFetch('mac.getUserDetails', { method: 'GET' }, { userId })) as GlobalUserDetails;
}

export async function getUserSessions(userId: string): Promise<UserSessionItem[]> {
  const res = (await trpcFetch('mac.getUserSessions', { method: 'GET' }, { userId })) as UserSessionItem[];
  return Array.isArray(res) ? res : [];
}

export async function forceLogoutUser(input: {
  userId: string;
  orgId?: string;
  reason: string;
}): Promise<{ ok: boolean; revokedCount: number; message: string }> {
  return (await trpcFetch('mac.forceLogoutUser', {
    method: 'POST',
    body: input,
  })) as { ok: boolean; revokedCount: number; message: string };
}

export async function updateUserStatus(input: {
  userId: string;
  orgId?: string;
  status: 'active' | 'disabled' | 'suspended';
  reason: string;
}): Promise<{ ok: boolean; previousStatus: string; newStatus: string; revokedSessionsCount: number }> {
  return (await trpcFetch('mac.updateUserStatus', {
    method: 'POST',
    body: input,
  })) as { ok: boolean; previousStatus: string; newStatus: string; revokedSessionsCount: number };
}

// ── PHASE 8: AUDIT, SYSTEM HEALTH & SECURITY GOVERNANCE ──

export interface SystemHealthResponse {
  database: {
    status: 'operational' | 'degraded' | 'down';
    latencyMs: number;
    pool: {
      inflightQueries: number;
      peakInflight: number;
      exhaustionEvents: number;
      poolMax: number;
      utilizationPct: number;
    };
  };
  redis: {
    status: 'operational' | 'degraded' | 'not_configured';
    latencyMs: number | null;
    detail: string;
  };
  search: {
    status: 'operational' | 'degraded' | 'not_configured';
    latencyMs: number | null;
    detail: string;
  };
  runtime: {
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    nodeVersion: string;
    env: string;
    timestamp: string;
  };
  fleet: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    flaggedTenants: number;
    churnRiskTenants: number;
    totalUsers: number;
  };
}

export interface PlatformGovernanceResponse {
  operators: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    phone: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
  roles: Array<{
    id: string;
    name: string;
    description: string;
    badgeCls: string;
    isSystem: boolean;
    capabilities: Record<string, boolean>;
  }>;
  securityPosture: {
    encryption: {
      status: 'verified' | 'configured' | 'not_configured';
      algorithm: string;
      keyLengthBits: number;
      detail: string;
    };
    databaseTls: {
      status: 'configured' | 'not_configured';
      mode: string;
      detail: string;
    };
    sessionPolicy: {
      jwtTtlMinutes: number;
      inactivityTimeoutMinutes: number;
      strictCors: boolean;
      multiFactorAuth: 'optional' | 'enforced';
    };
    dataProtection: {
      dpdpSweepsActive: boolean;
      statutoryRetentionTracking: boolean;
      contactEmailConfigured: boolean;
    };
  };
}

export async function getSystemHealth(): Promise<SystemHealthResponse> {
  return (await trpcFetch('mac.getSystemHealth', { method: 'GET' })) as SystemHealthResponse;
}

export async function getPlatformGovernance(): Promise<PlatformGovernanceResponse> {
  return (await trpcFetch('mac.getPlatformGovernance', { method: 'GET' })) as PlatformGovernanceResponse;
}

export async function revokeAllOperatorSessions(input: {
  reason: string;
  targetOperatorId?: string;
}): Promise<{ ok: boolean; revokedCount: number; message: string }> {
  return (await trpcFetch('mac.revokeAllOperatorSessions', {
    method: 'POST',
    body: input,
  })) as { ok: boolean; revokedCount: number; message: string };
}

export async function exportAuditLogs(input: {
  format: 'csv' | 'json';
  orgId?: string;
  action?: string;
}): Promise<{ ok: boolean; format: 'csv' | 'json'; count: number; data: unknown }> {
  return (await restFetch('/super-admin/audit-logs/export', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { ok: boolean; format: 'csv' | 'json'; count: number; data: unknown };
}



