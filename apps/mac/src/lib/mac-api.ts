const API_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_MAC_API_URL ??
        `${window.location.protocol}//${window.location.hostname}:3001`)
    : "http://localhost:3001";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mac_token") ?? "";
}

export async function macFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

type TrpcResponse<T> = { result?: { data?: { json?: T } }; error?: { message?: string } };

async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  const token = getToken();
  const url = input !== undefined
    ? `${API_URL}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : `${API_URL}/trpc/${procedure}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json() as TrpcResponse<T>;
  if (json.error) throw new Error(json.error.message ?? "Request failed");
  const data = json?.result?.data?.json;
  if (data === undefined) throw new Error("Empty response");
  return data;
}

async function trpcMutate<T>(procedure: string, input: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ json: input }),
  });
  const json = await res.json() as TrpcResponse<T>;
  if (json.error) throw new Error(json.error.message ?? "Request failed");
  const data = json?.result?.data?.json;
  if (data === undefined) throw new Error("Empty response");
  return data;
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export async function getStats() {
  return trpcQuery("mac.stats");
}

export async function getOrganizations(page = 1, search?: string) {
  return trpcQuery<OrgRow[]>("mac.listOrganizations", { page, search });
}

export async function getOrganizationById(id: string) {
  return trpcQuery<OrgRow>("mac.getOrganization", { id });
}

export async function getOrgUsers(orgId: string) {
  return trpcQuery("mac.listOrgUsers", { orgId });
}

export async function createOrganization(data: {
  name: string;
  plan: string;
  adminEmail: string;
  adminName: string;
}) {
  return trpcMutate<{ org: OrgRow; adminEmail: string }>("mac.createOrganization", data);
}

export async function suspendOrganization(id: string) {
  return trpcMutate("mac.suspendOrganization", { id });
}

export async function resumeOrganization(id: string) {
  return trpcMutate("mac.resumeOrganization", { id });
}

export async function revokeOrgSessions(id: string) {
  return trpcMutate("mac.revokeOrgSessions", { id });
}

// P1.1 — Legal acceptance
export async function recordLegalAcceptance(data: {
  orgId: string;
  documentType: "terms_of_service" | "data_processing_agreement" | "privacy_policy";
  version: string;
  acceptedByEmail: string;
  acceptedAt: string;
}) {
  return trpcMutate("mac.recordLegalAcceptance", data);
}

export async function getLegalAcceptance(orgId: string) {
  return trpcQuery<Record<string, unknown>>("mac.getLegalAcceptance", { orgId });
}

// P1.2 — Billing
export interface BillingInfo {
  plan: string;
  stripeCustomerId?: string;
  trialEndsAt?: string;
  subscriptionStatus?: string;
}

export async function getBillingInfo(orgId: string) {
  return trpcQuery<BillingInfo>("mac.getBillingInfo", { orgId });
}

export async function updateBillingInfo(data: {
  orgId: string;
  plan?: string;
  stripeCustomerId?: string;
  trialEndsAt?: string;
  subscriptionStatus?: string;
}) {
  return trpcMutate("mac.updateBillingInfo", data);
}

// P2.1 — Feature flags
export async function getFeatureFlags(orgId: string) {
  return trpcQuery<Record<string, boolean>>("mac.getFeatureFlags", { orgId });
}

export async function setFeatureFlag(orgId: string, flag: string, enabled: boolean) {
  return trpcMutate("mac.setFeatureFlag", { orgId, flag, enabled });
}

export async function resetFeatureFlags(orgId: string) {
  return trpcMutate("mac.resetFeatureFlags", { orgId });
}

// P2.2 — Org health
export interface OrgHealth {
  org: OrgRow;
  userCount: number;
  status: string;
}

export async function getOrgHealth(orgId: string) {
  return trpcQuery<OrgHealth>("mac.getOrgHealth", { orgId });
}

// P2.3 — Impersonation
export interface UserSearchResult {
  id: string;
  name: string | null;
  email: string;
  orgId: string | null;
  role: string;
  status: string;
}

export async function searchUsers(email: string) {
  return trpcQuery<UserSearchResult[]>("mac.searchUsers", { email });
}

export async function startImpersonation(data: {
  targetUserId: string;
  reason: string;
  durationMinutes: number;
}) {
  return trpcMutate<{ impersonationToken: string; expiresAt: string; redirectUrl: string }>("mac.startImpersonation", data);
}

// P3.1 — Analytics
export interface AnalyticsOverview {
  orgCount: number;
  userCount: number;
  orgsByPlan: { plan: string; count: number }[];
  recentOrgs: OrgRow[];
}

export async function getAnalyticsOverview() {
  return trpcQuery<AnalyticsOverview>("mac.analyticsOverview");
}

// P3 — Churn risk
export interface OrgWithHealth extends OrgRow {
  userCount: number;
}

export async function listOrgsWithHealth() {
  return trpcQuery<OrgWithHealth[]>("mac.listOrgsWithHealth");
}
