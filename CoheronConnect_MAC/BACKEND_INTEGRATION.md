# CoheronConnect Super-Admin Panel — Backend Integration Specification

This document details the exact network architecture, API client functions, authentication mechanism, data schemas, completion calculation logic, audit trail design, and known integration gaps for the CoheronConnect Super-Admin Console (`CoheronConnect_MAC`).

---

## 1. What This Panel Is

The **CoheronConnect Super-Admin Console** is a frontend dashboard designed for system operators (MAC operators) to monitor and manage tenant onboarding, platform configuration, system health, and administrative operations across all organisations.

### Purpose and Displayed Data
- **Setup Wizard Monitor**: Displays onboarding progress across 7 steps for all registered organisations:
  - **Step 1 (Welcome)**: Informational entry step.
  - **Step 2 (Organisation Profile)**: Company name, industry, company size, city, state, website, support email.
  - **Step 3 (India Compliance Setup)**: GSTIN, PAN, CIN, TAN, EPF code, Primary state code, seed holiday calendar, seed chart of accounts.
  - **Step 4 (Invite Your Team)**: Informational team invitation step.
  - **Step 5 (ITSM Configuration)**: Target resolution SLA hours for P1 Critical, P2 High, P3 Medium, and P4 Low tickets.
  - **Step 6 (Finance Setup)**: Informational finance step.
  - **Step 7 (Done)**: Informational completion step.
- **Tenant Administration & Overrides**: Provides an interactive detail drawer ([TenantDetailDrawer.tsx](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/components/TenantDetailDrawer.tsx)) to edit step data, toggle flags (reason, note, assigned owner, reminder timestamp), and trigger soft-suspension / archiving.
- **Audit Logging**: Captures admin override saves, flag changes, owner assignments, and reminders in a reverse-chronological timeline.
- **System Health & Dashboard**: Displays high-level platform ticket counts, SLA compliance percentages, time-series metrics, and category distributions.

---

## 2. Every Network Call Made

All API requests are configured to target the base URL `https://connect.coheron.tech` ([API_BASE](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L7)).

| Trigger Event | Target Endpoint URL | HTTP Method | API Function Symbol & File Location |
|---|---|---|---|
| **User Sign-In** | `https://connect.coheron.tech/api/trpc/mac.login` | `POST` | [apiLogin](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L209) in `src/lib/api.ts` |
| **Monitor Load / Refresh / Search / Filter / Sort** | `https://connect.coheron.tech/api/super-admin/orgs?limit=...&offset=...&search=...&status=...&sort=...` | `GET` | [listOrgs](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L259) in `src/lib/api.ts` |
| **Tenant Detail Drawer Refresh** | `https://connect.coheron.tech/api/super-admin/orgs/:id` | `GET` | [getOrg](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L272) in `src/lib/api.ts` |
| **Step Override Save** | `https://connect.coheron.tech/api/super-admin/orgs/:id` | `PUT` | [updateOrg](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L283) in `src/lib/api.ts` |
| **Flag / Unflag / Assign Owner / Send Reminder** | `https://connect.coheron.tech/api/super-admin/orgs/:id/flag` | `POST` | [flagOrg](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L295) in `src/lib/api.ts` |
| **Suspend / Archive Tenant** | `https://connect.coheron.tech/api/super-admin/orgs/:id` | `DELETE` | [suspendOrg](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L305) in `src/lib/api.ts` |
| **Dashboard Metrics Load** | `https://connect.coheron.tech/api/trpc/dashboard.getMetrics` | `GET` | [getDashboardMetrics](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L243) in `src/lib/api.ts` |
| **Dashboard Time-Series Load** | `https://connect.coheron.tech/api/trpc/dashboard.getTimeSeries?input=...` | `GET` | [getDashboardTimeSeries](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L247) in `src/lib/api.ts` |
| **Dashboard Top Categories Load** | `https://connect.coheron.tech/api/trpc/dashboard.getTopCategories` | `GET` | [getDashboardTopCategories](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L251) in `src/lib/api.ts` |
| **List Users** | `https://connect.coheron.tech/api/trpc/auth.listUsers` | `GET` | [listUsers](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L217) in `src/lib/api.ts` |

---

## 3. The API Client Functions

Current state of the client functions in [src/lib/api.ts](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts):

### 1. `listOrgs(params?: OrgListParams): Promise<unknown>`
- **Current Behavior**: Executes an HTTP `GET` request to `/api/super-admin/orgs` via helper [restFetch()](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L144). Appends query parameters (`limit`, `offset`, `search`, `status`, `sort`).
- **Status**: Live client code. *(Note: On the production domain `https://connect.coheron.tech`, calling `/api/super-admin/orgs` currently returns HTTP 404 `Route GET:/super-admin/orgs not found` until the backend service routes are deployed).*

### 2. `getOrg(orgId: string): Promise<unknown>`
- **Current Behavior**: Executes an HTTP `GET` request to `/api/super-admin/orgs/${orgId}` via `restFetch()`.
- **Status**: Live client code.

### 3. `updateOrg(orgId: string, body: UpdateOrgBody): Promise<unknown>`
- **Current Behavior**: Executes an HTTP `PUT` request to `/api/super-admin/orgs/${orgId}` via `restFetch()`.
- **Payload Shape**: Sends JSON with domain keys matching the API spec:
  ```json
  {
    "profile": { "displayName": "...", "industry": "...", "size": "...", "city": "...", "state": "...", "website": "...", "supportEmail": "..." },
    "india": { "gstin": "...", "pan": "...", "cin": "...", "tan": "...", "pf": "...", "stateCode": "...", "seedHolidays": false, "seedChartOfAccounts": false },
    "itsm": { "p1": 4, "p2": 8, "p3": 24, "p4": 48 }
  }
  ```
- **Status**: Live client code (no longer throws 501).

### 4. `flagOrg(orgId: string, body: FlagBody): Promise<unknown>`
- **Current Behavior**: Executes an HTTP `POST` request to `/api/super-admin/orgs/${orgId}/flag` via `restFetch()`.
- **Payload Shape**: `JSON.stringify({ flagged, note, reason, assignedOwner, reminderSentAt })`.
- **Status**: Live client code (no longer throws 501).

### 5. `suspendOrg(orgId: string): Promise<unknown>`
- **Current Behavior**: Executes an HTTP `DELETE` request to `/api/super-admin/orgs/${orgId}` via `restFetch()`.
- **Status**: Live client code (no longer throws 501).

---

## 4. Auth

### Auth Flow & Token Handling
1. **Login Endpoint**: User credentials are submitted via [apiLogin()](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L209), calling `POST https://connect.coheron.tech/api/trpc/mac.login`.
2. **Token Extraction**: Parses token from `result.data.token` or `result.data.sessionId`.
3. **Storage**: Stored in memory (`let authToken`) and persisted in `sessionStorage` (`cc-token`).
4. **Header Emission**: Transmitted on all subsequent tRPC and REST requests as:
   ```http
   Authorization: Bearer <token>
   ```
5. **Session Expiry**: Any HTTP `401` or `403` status response triggers [clearToken()](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/api.ts#L32) and dispatches `SESSION_EXPIRED_EVENT` (`cc-session-expired`), causing [AuthContext.tsx](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/context/AuthContext.tsx#L25) to clear local state and bounce the browser to `/login`.

### Live Authentication Status
- **Current Live Status against `connect.coheron.tech`**: Calling `mac.login` with standard tenant credentials (e.g. `testadmin@test.com`) returns a tRPC `NOT_FOUND` 404 error because `mac.login` authenticates operator credentials from the MAC operators table.
- Furthermore, the `/api/super-admin/*` routes on `https://connect.coheron.tech` currently respond with HTTP 404 (`Route GET:/super-admin/orgs not found`), so end-to-end authentication and retrieval against super-admin routes requires backend deployment of those endpoints.

---

## 5. Data Shape Expected by the Panel

The frontend maps incoming org objects via [mapOrgToTenantRecord()](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/wizardData.ts#L282) using interface `ApiOrg` ([src/lib/wizardData.ts](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/wizardData.ts#L17-L94)):

```typescript
interface ApiOrg {
  id?: string;
  orgId?: string;
  name?: string;
  slug?: string;
  plan?: string;

  // Flat fields
  industry?: string | null;
  companySize?: string | null;
  size?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  pan?: string | null;
  tan?: string | null;
  epfCode?: string | null;
  pf?: string | null;
  primaryStateCode?: string | null;
  stateCode?: string | null;
  gstin?: string | null;
  cin?: string | null;
  slaP1Hours?: number | null;
  slaP2Hours?: number | null;
  slaP3Hours?: number | null;
  slaP4Hours?: number | null;
  createdAt?: string;
  updatedAt?: string;
  suspended?: boolean;
  status?: string;
  currentStep?: number;
  flagged?: boolean;
  flag?: {
    flagged?: boolean;
    note?: string;
    reason?: string;
    assignedOwner?: string;
    reminderSentAt?: string;
    flaggedAt?: string;
  };

  // Nested domain objects (Super-Admin API key shape)
  profile?: {
    displayName?: string;
    industry?: string;
    size?: string;
    companySize?: string;
    city?: string;
    state?: string;
    website?: string;
    supportEmail?: string;
  };
  india?: {
    gstin?: string;
    pan?: string;
    cin?: string;
    tan?: string;
    pf?: string;
    epfCode?: string;
    stateCode?: string;
    primaryStateCode?: string;
    seedHolidays?: boolean;
    seedChartOfAccounts?: boolean;
  };
  compliance?: {
    gstin?: string;
    pan?: string;
    cin?: string;
    tan?: string;
    pf?: string;
    epfCode?: string;
    stateCode?: string;
    primaryStateCode?: string;
    seedHolidays?: boolean;
    seedChartOfAccounts?: boolean;
  };
  itsm?: {
    p1?: number;
    p2?: number;
    p3?: number;
    p4?: number;
    p1Critical?: number;
    p2High?: number;
    p3Medium?: number;
    p4Low?: number;
  };
}
```

### UI Field Read Summary
- **Identity**: `id`, `companyName` (`name` / `displayName`), `tenantCode` (`slug`)
- **Step 2 (Profile)**: `companyName`, `industry`, `companySize` (`size`), `city`, `state`, `website`, `supportEmail`
- **Step 3 (Compliance)**: `gstin`, `pan`, `cin`, `tan`, `epfCode` (`pf`), `primaryStateCode` (`stateCode`), `seedHolidays`, `seedChartOfAccounts`
- **Step 5 (ITSM)**: `p1Critical` (`slaP1Hours`), `p2High` (`slaP2Hours`), `p3Medium` (`slaP3Hours`), `p4Low` (`slaP4Hours`)

*(Note: Tenant self-service endpoint `auth.me` omits `gstin`, `cin`, `status`, `suspended`, `flagged`, `currentStep`; the super-admin `/api/super-admin/orgs` endpoint supplies them).*

---

## 6. Completion Logic

Completion calculation is performed purely on the client side over data-bearing steps.

### `computeCompletion` ([src/lib/validation.ts](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/validation.ts#L93-L115))

```typescript
export function computeCompletion(steps: { id: WizardStepId; state: string; data?: Record<string, unknown> }[]): number {
  const dataStepIds: WizardStepId[] = [2, 3, 5];
  let filled = 0;
  let total = 0;
  for (const sid of dataStepIds) {
    total += DATA_STEP_FIELD_COUNT[sid];
    const step = steps.find((s) => s.id === sid);
    if (!step) continue;
    const rules = STEP_FIELD_RULES[sid] ?? [];
    for (const rule of rules) {
      const val = step.data?.[rule.key];
      if (rule.type === 'checkbox') {
        if (val === true) filled++;
      } else if (rule.type === 'number') {
        if (val !== undefined && val !== null && val !== '' && !Number.isNaN(Number(val))) filled++;
      } else if (typeof val === 'string' && val.trim().length > 0) {
        filled++;
      }
    }
  }
  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}
```

### `deriveStatus` ([src/lib/wizardData.ts](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/lib/wizardData.ts#L266-L280))

```typescript
function deriveStatus(org: ApiOrg): OnboardingStatus {
  if (org.suspended) return 'stalled';
  const apiStatus = org.status;
  if (apiStatus) {
    const normalized = apiStatus.toLowerCase().replace('-', '_');
    if (['complete', 'in_progress', 'stalled', 'not_started'].includes(normalized)) {
      return normalized as OnboardingStatus;
    }
  }
  const hasProfile = hasProfileData(org);
  const hasCompliance = hasComplianceData(org);
  const hasItsm = hasItsmData(org);
  if (hasProfile && hasCompliance && hasItsm) return 'complete';
  if (!hasProfile && !hasCompliance && !hasItsm) return 'not_started';
  return 'in_progress';
}
```

### Non-Empty Fields Required for 100% Completion (19 Total)
1. `companyName`
2. `industry`
3. `companySize`
4. `city`
5. `state`
6. `website`
7. `supportEmail`
8. `gstin`
9. `pan`
10. `cin`
11. `tan`
12. `epfCode`
13. `primaryStateCode`
14. `seedHolidays` (true)
15. `seedChartOfAccounts` (true)
16. `p1Critical`
17. `p2High`
18. `p3Medium`
19. `p4Low`

### UI Presentation for Missing Fields
- **Progress Bar**: Renders calculated completion percentage.
- **Status Badge**: Renders `"In progress"` or `"Not started"`.
- **Tenant Drawer**: Renders `—` with a red `XCircle` icon next to unpopulated fields.

---

## 7. Audit Log

- **Location**: Entries live strictly in **client memory** inside [AuditContext.tsx](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/context/AuditContext.tsx#L14) (`entries` state array).
- **Persistence**: Entries do **NOT** survive a page refresh.
- **Trigger**: Recorded whenever an override save, flag, unflag, owner assignment, or reminder action is performed in [TenantDetailDrawer.tsx](file:///c:/Users/user1/Desktop/CoheronSUPER_admim/CoheronConnect_MAC/src/components/TenantDetailDrawer.tsx).

---

## 8. Known Gaps & Action Plan

### Field Supply Matrix

| Field | Description | Supplied by Super-Admin API (`/orgs`) | Supplied by Tenant Auth (`auth.me`) |
|---|---|---|---|
| `id` | Organisation ID | ✅ Yes | ✅ Yes |
| `companyName` | Organisation Name | ✅ Yes | ✅ Yes |
| `slug` | Tenant Subdomain / Code | ✅ Yes | ✅ Yes |
| `industry` | Industry Sector | ✅ Yes | ✅ Yes |
| `companySize` | Size Bracket | ✅ Yes | ✅ Yes |
| `city` | City Location | ✅ Yes | ✅ Yes |
| `state` | State Location | ✅ Yes | ✅ Yes |
| `website` | Company URL | ✅ Yes | ✅ Yes |
| `supportEmail` | Support Contact Email | ✅ Yes | ✅ Yes |
| `gstin` | 15-char GSTIN | ✅ Yes | ❌ **No** |
| `pan` | 10-char PAN | ✅ Yes | ✅ Yes |
| `cin` | 21-char Corporate ID | ✅ Yes | ❌ **No** |
| `tan` | 10-char TAN | ✅ Yes | ✅ Yes |
| `epfCode` | EPF Registration Code | ✅ Yes | ✅ Yes |
| `primaryStateCode` | 2-letter State Code | ✅ Yes | ✅ Yes |
| `slaP1Hours` | P1 SLA Resolution (hrs) | ✅ Yes | ✅ Yes |
| `slaP2Hours` | P2 SLA Resolution (hrs) | ✅ Yes | ✅ Yes |
| `slaP3Hours` | P3 SLA Resolution (hrs) | ✅ Yes | ✅ Yes |
| `slaP4Hours` | P4 SLA Resolution (hrs) | ✅ Yes | ✅ Yes |
| `status` | Onboarding Status | ✅ Yes | ❌ **No** |
| `suspended` | Soft-deletion flag | ✅ Yes | ❌ **No** |
| `flag` | Administrative Flag Object | ✅ Yes | ❌ **No** |

### Plain Statement of What Needs to Change
To show all tenants with complete data in production:
1. The backend server at `https://connect.coheron.tech` must deploy the `/api/super-admin/orgs` REST endpoints (`GET`, `PUT`, `POST /flag`, `DELETE`).
2. Valid MAC operator credentials must be provisioned for `POST /api/trpc/mac.login`.
3. Server-side audit log persistence (`super_admin_audit_logs` table) must be added to store override trails across sessions.
