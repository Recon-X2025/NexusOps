# FRONTEND CRITICAL FAILURES REPORT
## NexusOps — Autonomous UI Chaos Engineering Test
**Executed:** 2026-04-03 | **Agent:** Autonomous Chaos Engineering + UX Failure Detection  
**Target:** http://139.84.154.78/  
**Users Tested:** admin@coheron.com (owner / matrixRole:null), agent1@coheron.com (member / matrixRole:itil)  
**Methodology:** Live browser automation — real click → verify response → check network → analyze console → document

---

## SUMMARY TABLE

| # | Severity | Issue | Page | Status |
|---|----------|-------|------|--------|
| F-FE-001 | 🔴 CRITICAL | All ticket action buttons non-functional | `/app/tickets/:id` | CONFIRMED |
| F-FE-002 | 🔴 CRITICAL | Changes page full application crash (React #310) | `/app/changes` | CONFIRMED |
| F-FE-003 | 🔴 CRITICAL | Admin locked out (matrixRole: null) | All admin-gated routes | CONFIRMED |
| F-FE-004 | 🟠 HIGH | Ticket search renders 0 results despite valid API response | `/app/tickets` | CONFIRMED |
| F-FE-005 | 🟠 HIGH | Priority Calculator data not submitted with form | `/app/tickets/new` | CONFIRMED |
| F-FE-006 | 🟠 HIGH | Session token exposed via console.log on every request | Global | CONFIRMED |
| F-FE-007 | 🟡 MEDIUM | Comment attribution — posted as "System User" not logged-in user | `/app/tickets/:id` | CONFIRMED |
| F-FE-008 | 🟡 MEDIUM | Export button — no network request triggered | `/app/tickets` | CONFIRMED |
| F-FE-009 | 🟡 MEDIUM | Filters button — no filter panel appears | `/app/tickets` | CONFIRMED |
| F-FE-010 | 🟡 MEDIUM | "+ Watch" button non-functional | `/app/tickets/:id` | CONFIRMED |
| F-FE-011 | 🟡 MEDIUM | User role display always shows "requester" regardless of actual role | Global | CONFIRMED |
| F-FE-012 | 🟡 MEDIUM | Floating chatbot button intercepts clicks on other bottom-right elements | `/app/tickets/:id` | CONFIRMED |
| F-FE-013 | 🟡 MEDIUM | RBAC: itil agent blocked from Change Management | `/app/changes` | CONFIRMED |
| F-FE-014 | 🔵 LOW | Debug payload log left in production JS | `/app/tickets/new` | CONFIRMED |
| F-FE-015 | 🔵 LOW | Status tab filter shows race-condition 0 on first click | `/app/tickets` | CONFIRMED |
| F-FE-016 | 🔵 LOW | Missing API endpoints (procurement.list, security.incidents.list, inventory.parts.list) | API | CONFIRMED |

---

## 🔴 CRITICAL FAILURES

---

### F-FE-001 — ALL Ticket Action Buttons Completely Non-Functional
**Page:** `/app/tickets/:id` (every ticket detail view)  
**Elements:** `Edit`, `Assign`, `Resolve`, `Close`, `...` (overflow menu)

**Steps to Reproduce:**
1. Navigate to any ticket detail page (e.g., `/app/tickets/e0c15fb1-90ae-4af8-9e02-8ec17f7d05b1`)
2. Click the **Edit** button
3. Click the **Assign** button
4. Click the **Resolve** button
5. Click the **Close** button
6. Click the **...** overflow menu button

**Expected Behavior:**
- **Edit** → Should open edit form/modal allowing modification of ticket fields
- **Assign** → Should open user picker to assign the ticket to an agent
- **Resolve** → Should open resolution dialog (requires resolution notes)
- **Close** → Should open close confirmation dialog
- **...** → Should open dropdown with additional actions (Duplicate, Delete, Escalate, etc.)

**Observed Behavior:**  
Every button receives focus state (`states: [active, focused]`) but produces:
- ❌ No modal or panel opens
- ❌ No page navigation
- ❌ No API request triggered (confirmed via network monitoring)
- ❌ No console JavaScript error
- ❌ No toast/notification
- Complete silent failure

**Verification — Network Requests (captured live):**
```
GET tickets.get?input={"id":"183c3395-..."} → 200  (page load)
GET notifications.unreadCount             → 200  (periodic poll)
GET dashboard.getMetrics                  → 200  (periodic poll)
# No mutation/patch/request on Edit/Assign/Resolve/Close click
```

**Affected Users:** ALL users — confirmed for:
- `admin@coheron.com` (owner/null matrixRole)
- `agent1@coheron.com` (member/itil matrixRole)
- On test tickets: COHE-18187, INC-0002, and all other tested tickets

**Root Cause Analysis:**  
Three possible root causes (requires source code inspection to confirm):

1. **Missing `onClick` handlers** — The buttons may be rendered without click handler props, likely due to a conditional rendering bug where the handler function is `undefined` at render time  
2. **Permission guard silent failure** — The frontend RBAC check receives `matrixRole: null` for admin and defaults to "requester" permissions, silently blocking all privileged actions without user feedback  
3. **State desync** — A dialog/modal component's `open` state is not being toggled, possibly because the component is imported but the state updater is not wired to the button

**Evidence:** `admin@coheron.com` has `matrixRole: null` in DB (confirmed via `auth.me` API). The frontend likely maps `null` → `"requester"`. All action buttons are permission-gated and silently fail for "requester" role. But even `agent1@coheron.com` with `matrixRole: "itil"` faces the same failure, suggesting the buttons have no handler regardless of permissions.

**Suggested Fix:**
```typescript
// 1. Fix matrixRole for admin in DB
UPDATE users SET matrix_role = 'admin' WHERE email = 'admin@coheron.com';

// 2. If permission-gating buttons, show disabled state with tooltip:
<Button
  onClick={canEdit ? handleEdit : undefined}
  disabled={!canEdit}
  title={!canEdit ? "You don't have permission to edit this ticket" : undefined}
>
  Edit
</Button>

// 3. If click handlers are missing, wire them:
const [editOpen, setEditOpen] = useState(false);
<Button onClick={() => setEditOpen(true)}>Edit</Button>
<EditTicketModal open={editOpen} onClose={() => setEditOpen(false)} />
```

---

### F-FE-002 — Changes Page Full Application Crash (React Error #310)
**Page:** `/app/changes`  
**Affected Users:** admin@coheron.com

**Steps to Reproduce:**
1. Log in as `admin@coheron.com` / `demo1234!`
2. Navigate to `http://139.84.154.78/app/changes`

**Expected Behavior:** Change Management module loads, displaying list of change requests.

**Observed Behavior:**  
Complete white screen with error message:
```
Application error: a client-side exception has occurred while loading 
139.84.154.78 (see the browser console for more information).
```

**Console Errors (captured):**
```
Uncaught Error: Minified React error #310
```
React error #310 = **"Rendered more hooks than during the previous render."**  
This is a violation of the Rules of Hooks: hooks are being called conditionally or in different order between renders.

Also observed:
```
TRPC HEADERS TOKEN: null
```
Session token is `null` when the crash occurs, meaning the tRPC client is initialized without a valid session on this page.

**Root Cause Analysis:**  
The Changes page component has a conditional `useEffect`, `useMemo`, or custom hook that is called in one code path but not another. The most likely scenario:

```typescript
// BROKEN — hooks called conditionally based on user role
function ChangesPage() {
  const user = useUser();
  if (!user) return <AccessRestricted />;  // ← EARLY RETURN BEFORE HOOKS
  
  const changes = useChanges();  // ← hook called conditionally — INVALID
  // ...
}

// FIX — call all hooks unconditionally, guard later
function ChangesPage() {
  const user = useUser();
  const changes = useChanges();  // ← always called
  
  if (!user) return <AccessRestricted />;
  // ...
}
```

**Impact:** The entire application crashes on navigation to `/app/changes`. No error boundary catches this, resulting in a blank white page with no recovery option except a full reload.

**Suggested Fix:**
1. Audit `ChangesPage` component and all its custom hooks for conditional hook calls
2. Wrap the page in an error boundary to prevent full app crash
3. Move all hook calls to the top of the component, before any conditional returns
4. Fix the `TRPC HEADERS TOKEN: null` issue — ensure the session context is available before the changes page initializes its tRPC queries

---

### F-FE-003 — Admin User Locked Out of All Admin-Gated Features
**Page:** `/app/admin`, all admin-restricted modules  
**Affected Users:** admin@coheron.com

**Steps to Reproduce:**
1. Log in as `admin@coheron.com` / `demo1234!`
2. Attempt to navigate to `/app/admin`
3. Attempt to use Edit/Assign/Resolve/Close buttons on any ticket
4. Attempt to navigate to `/app/work-orders`, `/app/knowledge`

**Expected Behavior:** Admin user has full unrestricted access to all platform features.

**Observed Behavior:**
- `/app/admin` → "Access Restricted: You don't have permission to access Admin Console"
- All ticket action buttons → silent failure
- `/app/work-orders` → "Access Restricted: You don't have permission to access Field Service Management"
- `/app/knowledge` → "Access Restricted: You don't have permission to access Knowledge Management"
- Header user badge shows: `requester` (should be `admin`)

**API Evidence:**
```json
GET /trpc/auth.me → 200
{
  "role": "owner",        ← DB role is correct: owner
  "matrixRole": null,     ← PROBLEM: matrixRole is null
  "name": "Alex Chen"
}
```

**Root Cause Analysis:**  
`admin@coheron.com` has `matrixRole: null` in the database. The frontend RBAC system uses `matrixRole` (not `role`) to determine UI permissions. When `matrixRole` is `null`, it defaults to `"requester"`, the most restricted role, blocking all privileged UI features.

Per the test accounts documentation, admin@coheron.com should have `matrixRole: "admin"`. This was likely never set in the initial seed, or was cleared during chaos testing.

**Suggested Fix:**
```sql
-- Fix admin matrixRole in database
UPDATE org_members 
SET matrix_role = 'admin' 
WHERE user_id = (SELECT id FROM users WHERE email = 'admin@coheron.com');

-- Also add null-coalescing in frontend for owner DB role
const effectiveMatrixRole = user.matrixRole ?? (user.role === 'owner' ? 'admin' : 'requester');
```

---

## 🟠 HIGH SEVERITY

---

### F-FE-004 — Ticket Search Returns 0 Results (Frontend Render Bug)
**Page:** `/app/tickets`  
**Element:** Search text input (placeholder: "Search…")

**Steps to Reproduce:**
1. Navigate to `/app/tickets`
2. Observe the list shows 50 tickets including IF_GATE_*, PRIV_ESC_TEST, etc.
3. Type "IF_GATE" in the Search field
4. Observe "Showing 0 of 0 records"
5. Type "UI Chaos" — observe 0 results
6. Clear search — observe 50 results return

**Expected Behavior:** Searching "IF_GATE" should filter to show the 48+ tickets with that pattern.

**Observed Behavior:**
- Any search query → 0 results displayed
- On clearing search → full list restores correctly

**API Evidence (captured live):**
```
# Frontend makes correct API call:
GET /trpc/tickets.list?batch=1&input={"0":{"search":"IF_GATE","limit":50}}
→ HTTP 200

# Backend returns CORRECT data (verified separately):
curl: Search "IF_GATE" → 50 items, first: "IF_GATE_507"

# But frontend shows: "Showing 0 of 0 records"
```

**Root Cause Analysis:**  
The API returns correct search results (HTTP 200, 50 matching items), but the frontend renders 0 rows. This is a state management bug in the ticket list component. Likely causes:

1. The search results update a different state variable than the one bound to the table renderer
2. The `useQuery` cache key includes the search parameter, but the table renders from a `displayData` state that isn't updated from the query result
3. A `useMemo` computation that derives `displayData` from `queryData` has a stale closure

**Suggested Fix:**
```typescript
// Check that search results are properly flowing to table:
const { data } = useQuery(['tickets', { search }]);
// Ensure table renders from `data?.items`, not from a stale local state copy
const tickets = data?.items ?? [];  // ← should not be a separate useState
```

---

### F-FE-005 — Priority Calculator Data Not Submitted with Form
**Page:** `/app/tickets/new`  
**Element:** Impact dropdown, Urgency dropdown, Calculated Priority display

**Steps to Reproduce:**
1. Navigate to `/app/tickets/new`
2. Select Impact = "1 – Enterprise-wide impact" (visible change: Calculated Priority → "2 – High", SLA → 1hr response)
3. Fill required fields (Short Description, Description, Category)
4. Click "Submit Ticket"
5. View created ticket detail

**Expected Behavior:**  
Ticket created with:
- Priority: "2 – High" (matching calculator)
- Impact: "1 – Enterprise-wide impact"
- Urgency: "3 – Medium"

**Observed Behavior:**  
Ticket created with:
- Priority: "4 – low" (default, not calculator-derived)
- Impact: "—" (empty, not saved)
- Urgency: "—" (empty, not saved)

**Console Evidence:**
```
PAYLOAD: [object Object]  ← debug warn from page-442184b54e8b6fd8.js
```

**Root Cause Analysis:**  
The Impact and Urgency dropdowns control the Priority Calculator display but are likely stored in a separate local state that is NOT included in the form submission payload. The form's `handleSubmit` collects form field values but misses the calculator's state.

```typescript
// Likely bug:
const [impact, setImpact] = useState('3_department');  // local state
const formData = { title, description, category };      // ← impact/urgency missing!
tickets.create.mutate(formData);

// Fix: include impact/urgency in form submission:
const formData = { title, description, category, impact, urgency };
```

**Impact:** Users who set Impact/Urgency to customize priority (a core ITSM workflow) will always get default priority. SLA targets shown in preview don't match what's actually applied.

---

### F-FE-006 — Session Token Exposed in Browser Console
**Page:** Global (all pages after authentication)  
**Source File:** `layout-f609decaf7bb6106.js`

**Steps to Reproduce:**
1. Log in as any user
2. Open browser DevTools → Console
3. Observe: `TRPC HEADERS TOKEN: {session_token}` logged on every API request

**Observed Console Output (22+ instances captured):**
```
TRPC HEADERS TOKEN: u5MCItRtPcdBFO3MWadIncDt12DL6eGy  ← dashboard load
TRPC HEADERS TOKEN: u5MCItRtPcdBFO3MWadIncDt12DL6eGy  ← ticket page
TRPC HEADERS TOKEN: u5MCItRtPcdBFO3MWadIncDt12DL6eGy  ← every poll
```

**Expected Behavior:** No sensitive authentication tokens logged in production.

**Impact:**
- Anyone with physical access to the browser (shared computers, screen recording, shoulder surfing) can capture valid session tokens
- Token visible in browser extension access logs if any extension reads console
- Previously flagged in STRESS_TEST_CRITICAL_FAILURES.md as F-001 — still present

**Root Cause:** Debug `console.log` left in tRPC client initialization code in the Next.js layout bundle.

**Suggested Fix:**
```typescript
// In tRPC client setup (layout.tsx or trpc.ts):
// REMOVE:
console.log("TRPC HEADERS TOKEN:", session?.sessionId);

// Or gate behind dev mode only:
if (process.env.NODE_ENV === 'development') {
  console.log("TRPC HEADERS TOKEN:", session?.sessionId);
}
```

---

## 🟡 MEDIUM SEVERITY

---

### F-FE-007 — Comments Attributed to "System User" Instead of Logged-In User
**Page:** `/app/tickets/:id` → Notes & Comments tab  
**Element:** Customer Reply / Work Note (Internal) text area + Post button

**Steps to Reproduce:**
1. Log in as `agent1@coheron.com` (Jordan Smith)
2. Navigate to any ticket
3. Type a comment in the reply box
4. Click "Post"
5. Observe the comment attribution in the thread

**Expected Behavior:** Comment attributed to "Jordan Smith" with JS initials.

**Observed Behavior:** Comment attributed to "System User" (SU) — the same "System User" identity that appears as the ticket requester for admin-created tickets.

**Root Cause Hypothesis:**  
The comment mutation is using a server-side user context that resolves to a "System User" identity rather than the authenticated user from the session. The session `userId` lookup may be resolving to the wrong user object (perhaps an admin seed user).

---

### F-FE-008 — Export Button Non-Functional
**Page:** `/app/tickets`  
**Element:** "Export" button in ticket list toolbar

**Steps to Reproduce:**
1. Navigate to `/app/tickets`
2. Click "Export"
3. Observe: button gets focus but no action occurs

**Network Evidence:** Zero requests triggered after Export click.

**Expected Behavior:** Triggers CSV/Excel export download or opens export configuration modal.

---

### F-FE-009 — Filters Button Non-Functional  
**Page:** `/app/tickets`  
**Element:** "Filters" button in ticket list toolbar

**Steps to Reproduce:**
1. Navigate to `/app/tickets`
2. Click "Filters"
3. Observe: button gets focus but no filter panel appears

**Expected Behavior:** Opens a filter sidebar/modal with options for Priority, Category, Assignee, Date range, etc.

---

### F-FE-010 — "+ Watch" Button Non-Functional
**Page:** `/app/tickets/:id`  
**Element:** "+ Watch" button in the Watchers section

**Steps to Reproduce:**
1. Navigate to any ticket
2. Scroll to Watchers section
3. Click "+ Watch"
4. Observe: watcher count remains unchanged, no API call made

**Additional Issue:** The fixed-position floating chatbot button (bottom-right) **intercepts clicks** on the "+ Watch" button depending on scroll position, requiring `scrollIntoView` workaround (see F-FE-012).

---

### F-FE-011 — All Users Display "requester" Role Regardless of Actual Role
**Page:** Global (user badge in header, ticket detail page)

**Evidence:**
- `admin@coheron.com` (matrixRole: null) → displays "requester"
- `agent1@coheron.com` (matrixRole: "itil") → displays "requester"

**Root Cause:** The UI role display likely picks the first element of a `systemRoles` array. For `itil` users, the array is `["requester", "itil"]` — first element "requester" is shown. For the admin (null matrixRole), null is coerced to "requester".

**Impact:** Confusing to users, especially agents who should see their role clearly. Undermines trust in the permission system.

---

### F-FE-012 — Floating Chatbot Button Intercepts UI Clicks
**Page:** `/app/tickets/:id`  
**Element:** Fixed-position "NexusOps Virtual Agent" chatbot FAB (bottom-right)

**Observed Behavior:**
```
Click error: "Click target intercepted"
Click intercepted by: <button class="fixed bottom-6 right-6">
Blocking element ref: e6 (NexusOps Virtual Agent)
```

The `fixed bottom-6 right-6` chatbot button overlaps with "+ Watch" and potentially other elements near the bottom-right of the viewport.

**Suggested Fix:** Increase z-index awareness — ensure the "+ Watch" button and other interactive elements clear the chatbot FAB's coverage area, or add `margin-bottom` to content areas equal to the FAB height.

---

### F-FE-013 — RBAC Anomaly: ITIL Agent Blocked from Change Management
**Page:** `/app/changes`  
**Affected User:** agent1@coheron.com (matrixRole: itil)

**Expected Behavior:** Per the `itil` permissions table, Jordan Smith should have `changes: read, write` access.

**Observed Behavior:** "Access Restricted: You don't have permission to access Change Management"

**Root Cause Hypothesis:** The Change Management module's frontend RBAC check may use a different permission key than what the `itil` role grants. The frontend might check for `change_manager` role rather than `itil`.

---

## 🔵 LOW SEVERITY

---

### F-FE-014 — Debug Payload Log in Production
**Page:** `/app/tickets/new`  
**Source:** `page-442184b54e8b6fd8.js`

```
PAYLOAD: [object Object]  ← console.warn on ticket form submission
```

Indicates `console.warn("PAYLOAD:", payload)` left in ticket creation form JS.

---

### F-FE-015 — Status Tab Filter Shows 0 Results on First Click (Race Condition)
**Page:** `/app/tickets`

**Observation:** Clicking "In Progress 4" shows "Showing 0 of 0 records" initially, then correctly shows 4 results on a second interaction. The status filter API call fires correctly but the component renders before data arrives.

**Fix:** Add loading skeleton state before data is available, rather than rendering 0 results.

---

### F-FE-016 — Missing API Endpoints
**Source:** Parallel API stress (background test)

| Endpoint | HTTP Status | Notes |
|----------|-------------|-------|
| `procurement.list` | 404 | Endpoint not implemented |
| `security.incidents.list` | 404 | Endpoint not found (security incidents may use different procedure name) |
| `inventory.parts.list` | 404 | Parts management endpoint missing |

---

## WHAT WORKS CORRECTLY ✅

| Feature | Status |
|---------|--------|
| Login form | ✅ Fully functional |
| Login validation (empty, wrong password) | ✅ Works correctly |
| "+ Create" button → ticket creation page | ✅ Works |
| Ticket type selection (Incident / Service Request / Problem / Change Request) | ✅ Works |
| Priority Calculator display (Impact × Urgency matrix) | ✅ Visual display works |
| SLA Preview update on priority change | ✅ Reactive updates |
| Form validation (required fields highlighted on Submit) | ✅ Works |
| Category → Subcategory cascade dropdown | ✅ Works |
| Submit Ticket — loading state "Submitting..." + disabled | ✅ Prevents double-submit |
| Redirect to ticket detail after creation | ✅ Works |
| Dark mode toggle | ✅ Works |
| Notifications panel (bell button) | ✅ Opens correctly |
| Navigation sidebar (hamburger) | ✅ Opens with full hierarchy |
| Status tab filtering (In Progress, Resolved, etc.) | ✅ Works (with minor timing delay) |
| Activity Log tab on ticket detail | ✅ Works |
| Notes & Comments tab on ticket detail | ✅ Works |
| Post button activates on text input | ✅ Works |
| Comment posting (text submission) | ✅ Works (with attribution bug) |
| AI Insights "Analyse" button | ✅ Triggers analysis |
| Dashboard module tiles navigation | ✅ All link correctly |
| 50x concurrent dashboard loads | ✅ 0 errors |
| 30x notification polling | ✅ 0 errors |
| RBAC module scoping on dashboard | ✅ itil user sees only permitted modules |
| Ticket number display and routing | ✅ Works |
| Breadcrumb navigation | ✅ Works |

---

## PARALLEL API STRESS RESULTS (Background Test)

Executed concurrently with UI testing:

| Test | Result |
|------|--------|
| All module list endpoints | 9/11 HTTP 200 (procurement.list, security.incidents.list: 404) |
| 50x concurrent dashboard loads | **50/50 HTTP 200 — no errors** |
| tickets.get (5 concurrent) | **5/5 HTTP 200** |
| 30x notification polls | **30/30 HTTP 200** |
| tickets.create (admin) | FAILED (idempotency/session issue) |
| workOrders.list | HTTP 200 |
| inventory.parts.list | HTTP 404 |
| System health post-stress | Status: HEALTHY \| in_flight: -726 (counter underflow from prior test) \| error_rate: 0.002 |

---

## CROSS-REFERENCE WITH PREVIOUS CHAOS REPORT

| Finding | STRESS_TEST Report | This Report | Status |
|---------|-------------------|-------------|--------|
| Session token in console | F-001 (HIGH) | F-FE-006 (HIGH) | **Still present** |
| in_flight counter underflow | F-003 (HIGH) | Background test shows -726 | **Still present** |
| Session not invalidated on password change | F-002 (HIGH) | Not retested | Unknown |
| Stored XSS in ticket titles | F-004 (HIGH) | Visible: COHE-18188 has `AAAA...` title | Present in data |
| admin@coheron.com matrixRole: null | Not found | F-FE-003 (CRITICAL) | **New finding** |
| Ticket action buttons dead | Not tested | F-FE-001 (CRITICAL) | **New finding** |
| Changes page crash | Not tested | F-FE-002 (CRITICAL) | **New finding** |
| Search returns 0 results | Not tested | F-FE-004 (HIGH) | **New finding** |
| Priority Calculator disconnect | Not tested | F-FE-005 (HIGH) | **New finding** |

---

## RECOMMENDED PRIORITY ORDER FOR FIXES

1. **IMMEDIATE** — Fix `matrixRole: null` for admin@coheron.com (database seed issue)
2. **IMMEDIATE** — Debug and restore all ticket action button click handlers
3. **IMMEDIATE** — Fix React error #310 hooks violation in Changes page
4. **HIGH** — Remove `console.log("TRPC HEADERS TOKEN")` from production build
5. **HIGH** — Fix ticket search results rendering (frontend state management)
6. **HIGH** — Include Impact/Urgency in ticket creation form submission payload
7. **MEDIUM** — Fix comment user attribution
8. **MEDIUM** — Implement Export and Filters functionality
9. **MEDIUM** — Fix role display (show actual matrixRole, not first array element)
10. **MEDIUM** — Resolve ITIL agent access to Change Management

---

*Report generated by Autonomous Chaos Engineering Agent | NexusOps Frontend Chaos Test 2026*
