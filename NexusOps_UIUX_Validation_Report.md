# NexusOps — Complete UI/UX Validation Report
## What Is Good · What Needs Correction · What Needs Improvement · What Needs Upgrading

**Document:** NexusOps_UIUX_Validation_Report.md
**Version:** 1.0
**Date:** April 5, 2026
**Methodology:** Full source-code audit of all 80+ frontend files (pages, components, styles), cross-referenced with QA chaos test reports (F-FE-001 through F-FE-016), business logic documentation, and comparison against India SMB market leaders (Freshservice, Keka, Zoho)
**Scope:** All pages under `/app/**`, auth flows, layout components, design system

---

## 1. Executive Summary

| Category | Count |
|----------|-------|
| ✅ Things that are genuinely good | 22 |
| 🔴 Critical — must fix before user onboarding | 8 |
| 🟠 High — blocks real-world daily usage | 18 |
| 🟡 Medium — important for product maturity | 24 |
| 🔵 Low / Design polish | 14 |
| **Total findings** | **86** |

---

## 2. What Is Genuinely Good ✅

### 2.1 Design System — Enterprise-Grade Foundation
The CSS design token system (`globals.css`) is well-architected:
- **Semantic color tokens** with HSL values for light and dark mode (`--background`, `--card`, `--primary`, `--destructive`, priority levels `--p-critical/high/medium/low`, ticket statuses `--s-open/in-progress/pending/resolved/closed`)
- **Header / Sidebar separation** — distinct token sets for the dark navy header and white sidebar ensure clear visual hierarchy
- **Enterprise blue** (`#0356ca`) as the primary brand color — correct for a B2B product
- `--radius: 0.2rem` tight radius gives an appropriately dense enterprise feel
- Dark mode fully implemented with complete token overrides

**Verdict:** Keep as-is. Well thought out.

### 2.2 Typography
- Inter font (variable weight) — industry standard for SaaS
- JetBrains Mono for IDs, ticket numbers, monospace data — correct choice
- Base font size 13px — appropriate for data-dense enterprise UI
- Consistent heading hierarchy (h1 = 20px semibold, h2 = 16px, h3 = 13px)
- `font-feature-settings: "cv02","cv03","cv04","cv11"` — professional OpenType feature usage

**Verdict:** Good. One consideration: bump base size to 14px for SMB users who are less experienced with dense UIs (see improvement section).

### 2.3 Sidebar — RBAC-Aware, Persisted, Searchable
The sidebar is one of the strongest components in the codebase:
- Group expand/collapse with `localStorage` persistence
- RBAC filtering — hidden groups and items per role; role changes instantly re-filter
- Live search/filter (`Filter navigator...`) across all groups and items
- Three-level nesting (Group → Item → Child with `?tab=` deep links)
- Live badge counts (open incidents, security alerts, pending approvals) from real API data with 60s refresh
- Mobile drawer via Radix Dialog with FAB trigger
- Smooth CSS grid `grid-template-rows` animation for expand/collapse

**Verdict:** Best component in the app. Minor improvements noted in Section 4.

### 2.4 Dark Mode
Full dark/light mode toggle in the header with `next-themes`. All token variables correctly override in `.dark`. The dark palette (deep navy `#0d1320`) is appropriate.

**Verdict:** Works well. Minor issue: notification/user dropdowns hardcode `bg-slate-900` and `bg-slate-800` instead of using `--card`/`--popover` tokens, meaning they ignore the theme toggle.

### 2.5 Notification System
- Live bell with unread badge count (refreshes every 30s)
- Dropdown with mark-individual + mark-all-read
- Type icons (info/warning/success/error) with colour coding
- `timeAgo` relative timestamps ("just now", "3m ago", "2h ago")
- Full `/app/notifications` page for complete history
- Notifications linked to source records with routing on click
- Auto-triggered by tickets, work orders, changes, procurement events

**Verdict:** Well executed. Improvements needed: per-event-type user preferences (see Section 5).

### 2.6 Ticket Detail Page
The most complete record view in the application:
- SLA breach banner with overdue hours + Escalate button
- Terminal state banner (Closed/Resolved) locking all write actions
- Inline field editing (click-to-edit for title, urgency, impact, tags, category)
- Assign panel, Resolve panel, Close panel (slide-in, not modals)
- Comments with internal/public toggle
- Activity log with icons per action type
- Related records tab (lazy-loaded problems + changes)
- AI summary + resolution suggestion (lazy, user-triggered)
- Watch/unwatch, print, copy link, overflow menu

**Verdict:** Strong UX pattern. Improvements needed: file attachments are referenced but not implemented; phone placeholder uses US format.

### 2.7 Toast Notifications (sonner)
- Action-specific messages ("Ticket updated successfully" not generic "Updated")
- All mutations have `onError` handlers surfacing `err?.message ?? "Something went wrong"`
- Non-blocking, dismissible, stacked

**Verdict:** Correct implementation. Keep as-is.

### 2.8 Form Validation (zod + react-hook-form)
- All forms use zod schema validation with `zodResolver`
- Inline field-level error messages
- Disabled submit button with spinner during mutation
- Password strength live checklist on signup (3 checks with CheckCircle2 indicators)

**Verdict:** Good pattern. Should be made into a shared `<FormField>` component.

### 2.9 Loading States
- Loader2 spinner on buttons during mutations (correct pattern — button becomes disabled + shows spinner)
- `animate-pulse` skeleton on dashboard metrics during load
- Skeleton section component in Reports page (`SkeletonSection`)
- `placeholderData: (prev) => prev` on ticket list prevents jarring refetch flashes

**Verdict:** Generally good. Inconsistency: some pages show plain "Loading..." text instead of skeletons. Standardize.

### 2.10 RBAC Guards
- Page-level `AccessDenied` component with module name
- `PermissionGate` wrapper component for conditional rendering
- `useRBAC().can(module, action)` used consistently in tab visibility
- API-level `permissionProcedure` enforces the same matrix server-side
- `useEffect` resets active tab on role switch

**Verdict:** Solid architecture. See Section 3 for the critical issue with the demo Role Switcher being exposed in production.

### 2.11 Global Search (Meilisearch)
- Header search bar with 300ms debounce
- Grouped dropdown results (tickets, assets, users, etc.)
- Keyboard navigation (↑↓ arrows, Enter, Escape)
- Click-outside-to-close
- Guarded with `isAuthenticated` (won't fire on `/login` — bug fix confirmed)
- Graceful degradation if Meilisearch is down

**Verdict:** Well implemented. Improvement: no empty state for "0 results" message.

### 2.12 Auth Flows
- Login: email/password + Google SSO, show/hide password, error toast
- Signup: name, org name, email, password with live strength checker
- Forgot password + Reset password (token-based) flows
- Invite accept flow (`/invite/[token]`) for org-invited users
- `redirect` query param preserved through login

**Verdict:** Complete auth flow. Missing: "Remember me" checkbox does nothing (see Section 3).

### 2.13 Virtual Agent Widget
- Persistent floating widget on every authenticated page
- Minimise/expand states, typing indicator, suggestion chips
- Full-page `/app/virtual-agent` with rule-based flows AND real tRPC queries (tickets.list on "Check my open tickets", tickets.create on "Yes, create ticket")
- Thumb up/down feedback per message

**Verdict:** Good foundation. The widget overlaps page content at bottom-right (confirmed UX bug F-FE-012). The full-page bot uses only 4 hardcoded responses.

### 2.14 INR Currency & India Locale
- All monetary values use `₹` via `formatCurrency` utility
- `en-IN` locale formatting (Indian numbering: ₹31,54,000 not ₹3,154,000)
- Date formatting uses `en-IN` locale in ticket detail (`toLocaleString("en-IN")`)

**Verdict:** Correct and important. Keep.

### 2.15 Recruitment Module (ATS)
- Full pipeline with 9 stages (Applied → Hired)
- Job requisitions with publish/draft workflow
- Candidate profiles, interview scheduling, offer management
- Live tRPC mutations for all actions
- Inline modal forms with form validation

**Verdict:** Better-designed than most NexusOps modules. Pattern (modal + list + stage badges) is clean.

### 2.16 Breadcrumbs in Header
- Path-based breadcrumbs auto-generate from URL segments
- Separator, last-item highlighted

**Verdict:** Good concept. Critical gap: most module names are missing from `BREADCRUMB_LABELS` (see Section 4).

### 2.17 KPI Cards Pattern (Dashboard)
- `KPICard` component with icon, large value, delta indicator (trend up/down), link
- Used consistently on platform dashboard and group dashboards
- Color-coded by severity

**Verdict:** Clean, reusable. Should be extracted to `/components/ui/kpi-card.tsx`.

### 2.18 Priority Indicators
- Left-side 2px colored bar (`priority-bar`) for critical/high/medium/low in tables
- `.status-badge` inline chip pattern consistent across all modules
- SLA breach badges (red) vs SLA OK (green) from `.sla-breached` / `.sla-ok`

**Verdict:** Well-defined. Keep.

### 2.19 Scrollbar Styling
- Custom thin scrollbar via `.scrollbar-thin` utility (5px, borderless track)
- Applied to sidebar nav, notification dropdown, modal content

**Verdict:** Polished detail. Keep.

### 2.20 Enterprise Table Styling (`.ent-table`)
- Consistent header with small caps, tracking, uppercase labels
- Row hover with `bg-accent/40`
- Selected row state
- 0.68rem header font with 0.06em letter spacing

**Verdict:** Good. Issue: not all data tables in the app use `.ent-table` — some use ad-hoc inline Tailwind. Standardize.

### 2.21 Profile Page
- Three tabs: My Profile / Password & Security / Notification Preferences
- Inline form with icons per field
- Password change with current/new/confirm flow
- Avatar with camera icon (upload hook in place)

**Verdict:** Good structure. Camera button is non-functional (no API endpoint). See Section 4.

### 2.22 Procurement Page — State Management
- Comprehensive status state configs (`PR_STATE_CFG`, `PO_STATE_CFG`, `INV_STATUS_CFG`)
- Covers both live DB statuses and legacy mock values (documented with comments)
- Status badge colors are semantically correct (yellow = pending, green = approved, red = rejected)

**Verdict:** Well handled.

---

## 3. Critical Issues — Must Fix Before User Onboarding 🔴

### C-01 — RBAC Role Switcher Exposed in Production
**Location:** `apps/web/src/components/layout/app-header.tsx` — `RoleSwitcher` component
**Issue:** The demo Role Switcher (purple badge showing current role, click to switch to any mock user) renders for **all authenticated users** in production. This reveals the full list of mock user IDs, role names, and internal system role labels to any logged-in user. It allows any user to impersonate any role by simply clicking.
**Impact:** Security breach — any user can escalate to admin role in the UI. While the API enforces RBAC server-side, this creates a trust/perception issue and incorrect UI state for non-admin users.
**Fix:** Wrap `<RoleSwitcher />` in `{process.env.NODE_ENV === 'development' && ...}` or remove entirely from the header. Only render in a dedicated `/dev/role-switcher` route gated by a development-only flag.

---

### C-02 — Virtual Agent Widget Overlaps Action Buttons
**Location:** `apps/web/src/components/layout/virtual-agent-widget.tsx` — `bottom-4 right-4 fixed z-50`
**Issue:** The floating chat FAB button (bottom-right) physically overlaps action buttons on pages like ticket detail, procurement, and other modules with content near the bottom-right. Confirmed as F-FE-012 during chaos testing.
**Impact:** Users cannot click legitimate UI elements below the chat button. This is a usability blocker on detail pages.
**Fix:** Either (1) position the FAB at `bottom-20 right-4` to give room, or (2) move to `bottom-4 left-4` (left side has the mobile menu, so needs coordination), or (3) auto-hide when a modal is open, or (4) make it collapse to a smaller icon after first interaction.

---

### C-03 — "Remember Me" Checkbox Does Nothing
**Location:** `apps/web/src/app/login/page.tsx` line ~78
**Issue:** A "Remember me" checkbox renders with a label and visual but has no `onChange` handler and no effect on session expiry. The session cookie always expires in 30 days regardless.
**Impact:** Users who expect "Remember me" = shorter session when unchecked will be confused. More importantly, on shared/public devices, not checking it still creates a 30-day persistent session — a security risk.
**Fix:** Implement the toggle: when unchecked, use `sessionStorage` for the token (expires on browser close) and omit `max-age` from the cookie. When checked (default), use `localStorage` + 30-day cookie.

---

### C-04 — No Real Chart Visualizations in Reports
**Location:** `apps/web/src/app/app/reports/page.tsx`
**Issue:** The Reports module is a core differentiator, but all "charts" are `.ent-table` rows with inline `MiniBar` components (a CSS div with a percentage width). There are no real chart libraries — no line charts for trends, no pie/donut for distributions, no area charts for time series.
**Impact:** Any manager or executive comparing NexusOps to Freshservice's reporting or Zoho Analytics will immediately dismiss the reporting module. SMB decision-makers specifically look at reports/dashboards during demos.
**Fix:** Integrate Recharts or Chart.js (Recharts preferred as it's React-native). Add to Reports: a line chart for ticket trends over time, a donut chart for ticket distribution by type, an area chart for SLA performance over 30 days.

---

### C-05 — Contracts Page Falls Back to Mock Data
**Location:** `apps/web/src/app/app/contracts/page.tsx` line ~662
**Comment in code:** `// Live contracts from API, fallback to mock for demo`
**Issue:** When the API returns no contracts (e.g., fresh org with no data), the UI falls back to hardcoded demo contracts. This means the page always shows fake data and users cannot trust what they see.
**Impact:** Any user who creates a contract and then views the list may see their real contract mixed with fake demo data, or only fake data. Data integrity illusion broken.
**Fix:** Remove the mock fallback entirely. Implement a proper empty state with a "Create your first contract" CTA when the API returns an empty array.

---

### C-06 — Compliance Page Has Static Baseline Data
**Location:** `apps/web/src/app/app/compliance/page.tsx` line ~95
**Comment in code:** `{/* Stats grid — mix of static baseline data and real risk/audit data */}`
**Issue:** Some KPI stats on the Compliance dashboard are hardcoded static numbers displayed alongside live API data. Users cannot distinguish real vs. fake figures.
**Impact:** Compliance dashboards are auditable. If a compliance officer sees numbers that don't match the actual database, it destroys trust.
**Fix:** Replace all static numbers with live API queries. If a metric doesn't have a real API yet, either build it or show `—` (not a fake number).

---

### C-07 — Employee Center Falls Back to Static Data
**Location:** `apps/web/src/app/app/employee-center/page.tsx` line ~51
**Comment in code:** `// Map live catalog requests to display format; fall back to static data`
**Issue:** Same pattern as C-05 — static fallback data displayed when API data is empty.
**Fix:** Remove fallback; implement empty state with "Browse the Service Catalog" link.

---

### C-08 — Phone Placeholder Is US Format
**Location:** `apps/web/src/app/app/tickets/new/page.tsx` line ~395
**Placeholder:** `+1 (555) 000-0000`
**Issue:** NexusOps is an India-first platform. Showing a US phone format confuses Indian users entering their mobile numbers (+91 format).
**Fix:** Change placeholder to `+91 98765 43210` and add a phone validation hint. Apply consistently across all phone input fields (profile page, HR employee form, CRM contacts, etc.).

---

## 4. High Priority Improvements 🟠

### H-01 — No Pagination on List Pages
**Affected Pages:** `/app/tickets`, `/app/procurement`, `/app/crm`, `/app/vendors`, `/app/hr`, `/app/grc`, `/app/recruitment`, `/app/projects`, and most others
**Issue:** Every list query uses `limit: 50` with no pagination controls. As data grows beyond 50 records, users will silently miss items without knowing there's more data.
**Fix:** Add a `<Pagination>` component with prev/next, current page, and total count. Alternatively use infinite scroll with a "Load More" button for list-style pages.

---

### H-02 — Breadcrumbs Missing Most Module Names
**Location:** `apps/web/src/components/layout/app-header.tsx` — `BREADCRUMB_LABELS` object
**Issue:** The breadcrumb label map only defines 12 keys: `app, dashboard, tickets, assets, cmdb, workflows, hr, procurement, reports, settings, new`. Every other module path (grc, csm, crm, apm, devops, financial, legal, secretarial, walk-up, on-call, events, ham, sam, surveys, facilities, vendors, approvals, flows, recruitment, people-analytics, compliance, security, etc.) shows the raw URL slug as the breadcrumb label.
**Example:** Visiting `/app/people-analytics` shows breadcrumb "NexusOps / people-analytics" instead of "NexusOps / People Analytics"
**Fix:** Add all 30+ module routes to `BREADCRUMB_LABELS`. Also add dynamic segment handling (e.g., ticket IDs should show the ticket number from the loaded data, not the UUID).

---

### H-03 — Empty States Are Plain Text
**Affected Pages:** Facilities ("No space inventory data available yet"), Compliance ("No data for selected period"), Reports, CMDB, Employee Portal, and most list pages
**Issue:** Empty states are rendered as plain `<td>` colSpan text or a small `<p>` inside a table. Market leaders (Freshservice, Notion, Linear) use illustrated empty states with a clear icon, a headline ("No tickets yet"), and a primary CTA button ("Create your first ticket").
**Fix:** Create a shared `<EmptyState icon={} title="" description="" action={} />` component and replace all plain text empty states. Use Lucide icons that match the context.

---

### H-04 — No Skeleton Loading on List Pages
**Affected Pages:** Most module list pages show no loading state — the table area is blank while data fetches, then pops in
**Fix:** Create a `<TableSkeleton rows={8} cols={5} />` component and use it as the loading state in all data tables. The ticket detail has correct inline spinners; list pages need the same treatment.

---

### H-05 — No Global Error Boundary
**Issue:** There is no top-level React error boundary. If a component throws an unexpected error, the entire page goes blank or shows a React error overlay. Chaos testing confirmed the Changes page had a full React crash (F-FE-002).
**Fix:** Wrap the app layout with a React error boundary that renders a user-friendly "Something went wrong — refresh or contact support" screen, optionally with Sentry error capture.

---

### H-06 — Avatar Upload Is Non-Functional
**Location:** `apps/web/src/app/app/profile/page.tsx` — camera button on avatar
**Issue:** The camera icon overlay on the user avatar initiates no action — no file picker, no API call. Users who click it get no feedback.
**Fix:** Implement avatar upload: trigger `<input type="file">` on click, upload to a storage endpoint (or Supabase/S3), persist URL in `users.avatar_url`, display as `<img>` when set.

---

### H-07 — Tabs Do Not Deep-Link Consistently
**Issue:** Some pages use URL query params for tabs (e.g., `/app/secretarial?tab=board`, `/app/profile?tab=security`) while others use React local state (e.g., `/app/tickets`, `/app/procurement`, `/app/hr`). Pages that use local state cannot be bookmarked, shared, or linked to a specific tab.
**Examples of inconsistency:**
- `/app/secretarial` → URL params (correct, supports deep link)
- `/app/profile` → URL params (correct)
- `/app/tickets` → local state (cannot deep-link to "Changes" tab)
- `/app/procurement` → local state (cannot deep-link to "Purchase Orders" tab)
**Fix:** Standardize all multi-tab pages to use `?tab=<key>` URL query params. This enables bookmarking, link sharing, and browser back/forward navigation within tabs.

---

### H-08 — Virtual Agent Responses Are Hardcoded
**Location:** `apps/web/src/app/app/virtual-agent/page.tsx` — `BOT_FLOWS` dictionary
**Location:** `apps/web/src/components/layout/virtual-agent-widget.tsx` — `BOT_RESPONSES` dictionary
**Issue:** Both the full-page agent and the floating widget use entirely hardcoded response trees. The full-page bot has only 4 scripted responses and a generic default. The widget's `BOT_FLOWS` has ~20 hardcoded paths. Only "Check my open tickets" and "Yes, create ticket" call real APIs.
**Impact:** Any user who asks a question outside the script gets a useless generic reply. This undermines the AI branding of the Virtual Agent.
**Fix Short-term:** Wire more flows to real APIs (e.g., "Show my pending approvals" → `trpc.approvals.myPending`, "Show SLA breaches" → live query from tickets). Remove hardcoded counts like "12 open incidents" and "3 active SLA breaches".
**Fix Long-term:** Integrate with the AI router (`trpc.ai.*`) for freetext intent classification and response generation.

---

### H-09 — No User-Visible Pagination on Notifications
**Location:** `apps/web/src/components/layout/app-header.tsx` — `NotificationBell`
**Issue:** Notifications dropdown fetches `limit: 20` items with no "load more". "View all notifications →" link goes to the full page. The full notifications page (`/app/notifications`) also needs pagination.
**Fix:** Add cursor-based pagination to the notifications list query and a "Load more" at the bottom of the dropdown.

---

### H-10 — No Keyboard Shortcut System
**Issue:** No keyboard shortcuts are implemented anywhere. In B2B enterprise tools (Linear, Jira, Freshservice), power users expect at minimum: `Cmd/Ctrl+K` for global search, `N` for new record on list pages, `Escape` to close modals, `?` for help.
**Fix:** Implement a basic keyboard shortcut registry. Start with: `Cmd+K` → focus global search, `Escape` → close any open panel/modal. Add a keyboard shortcuts reference dialog accessible from the header `?` button.

---

### H-11 — No Guided Onboarding / Setup Wizard
**Issue:** After signup, users land on the dashboard with no setup guidance. An SMB admin seeing an empty platform with 30+ modules has no idea where to start.
**Fix:** Implement a post-signup onboarding checklist (like Notion's "Getting started" sidebar or Freshservice's setup wizard):
1. Complete your profile
2. Invite your team
3. Set up categories / SLA policies
4. Create your first ticket
5. Connect integrations
Track completion state per-org in the database. Show progress bar until 100% complete.

---

### H-12 — Notification Preferences Too Coarse
**Location:** `apps/web/src/app/app/profile/page.tsx` — Notification Preferences tab
**Issue:** The notification preferences only offer broad toggles (email on/off, push on/off). Users cannot control per-event-type preferences (e.g., "only notify me on P1 tickets", "don't notify me when someone adds a comment", "notify me on assignment only").
**Fix:** Build per-event notification preferences: for each notification trigger type (ticket assigned, SLA breach, approval needed, comment on watched ticket, etc.) allow the user to choose: Always / Only for assigned / Never.

---

### H-13 — Report Date Range Has No Custom Date Picker
**Location:** `apps/web/src/app/app/reports/page.tsx`
**Issue:** Date range filter offers only preset options (7/14/30/90/180/365 days) via a `<select>` dropdown. Users cannot choose a custom date range (e.g., "March 2026" or "Jan 1 – Mar 31").
**Fix:** Add a "Custom range" option that opens a date range picker (start + end date inputs). Recharts/Chart.js integration would also benefit from exact date range data.

---

### H-14 — Sidebar Version Number Is Hardcoded
**Location:** `apps/web/src/components/layout/app-sidebar.tsx` — footer: `NexusOps Platform v2.0.1`
**Issue:** The platform is on v4.2 (per build reference) but sidebar footer shows `v2.0.1`. This creates confusion for support and bug reporting.
**Fix:** Read version from `process.env.NEXT_PUBLIC_APP_VERSION` which should be set from `package.json` version at build time.

---

### H-15 — No Confirmation Dialog for Destructive Actions
**Issue:** Several destructive actions (delete vendor, cancel PO, offboard employee) execute immediately on button click with only a toast message. There is no "Are you sure? This cannot be undone" confirmation dialog.
**Fix:** Implement a shared `<ConfirmDialog>` component using Radix Dialog. Use it for all destructive mutations (delete, cancel, reject, terminate, close).

---

### H-16 — No File Attachment UI Anywhere
**Issue:** Multiple modules reference attachments conceptually (ticket detail has an Attachments tab in the tab bar, HR documents section exists) but there is no functional file upload UI across the entire application. No `<input type="file">`, no upload API endpoint, no storage integration.
**Impact:** Any ticket, HR case, contract, or GRC finding that requires document evidence cannot store it. This is a critical gap for real usage.
**Fix:** Build a shared `<FileUpload>` component using the HTML file input, upload to S3/Supabase Storage/local disk, store URL in the relevant table. Start with ticket attachments, then extend to contracts and HR documents.

---

### H-17 — Inconsistent Use of Native `<input type="date">`
**Issue:** Forms across the app (recruitment, projects, procurement, contracts) use raw HTML `<input type="date">` which renders browser-native date pickers — wildly different appearance across Chrome, Firefox, and Safari. No consistent date picker component exists.
**Fix:** Implement a shared `<DatePicker>` component using Radix Popover + a calendar (e.g., `react-day-picker`). Apply to all date inputs across the application.

---

### H-18 — Modal Backdrop and Z-Index Conflicts
**Issue:** Multiple modules implement their own inline modals using `fixed inset-0 z-50 flex items-center justify-center bg-black/40`. The Virtual Agent widget also uses `z-50`. When both are visible, they conflict. Some modals miss `backdrop-blur-sm`. The Radix Dialog used for mobile sidebar is also `z-50`.
**Fix:** Establish a z-index scale: base content (0–9), dropdowns (10–19), tooltips (20–29), modals (30–39), mobile overlay (40–49), critical overlays (50+). Extract all modals to use the shared `<ConfirmDialog>` / `<Modal>` component with consistent z-index.

---

## 5. Medium Priority Improvements 🟡

### M-01 — Font Size Too Small for Casual SMB Users
**Current:** `font-size: 13px` base (`html { font-size: 13px }`)
**Issue:** 13px is comfortable for power users (enterprise ITSM agents) but challenging for casual users in an SMB context. Keka, Freshdesk, and Zoho use 14px base.
**Fix:** Increase to `font-size: 14px`. Adjust the compact table sizes from `text-xs` (12px) to keep density but improve readability.

---

### M-02 — No Reusable `<Button>` Component
**Issue:** Buttons across the app are bespoke inline Tailwind: some `py-1.5`, some `py-2`, some `py-2.5`. Gap sizes, icon spacing, and loading state patterns differ per page. There is no standard `Button` component from the design system.
**Fix:** Create `apps/web/src/components/ui/button.tsx` with variants: `primary`, `secondary`, `destructive`, `ghost`, `link` + sizes `sm`, `md`, `lg`. Replace all bespoke button classes. (Note: shadcn/ui is already a dependency — generate the Button component from shadcn.)

---

### M-03 — No Reusable `<Modal>` / `<Sheet>` Component
**Issue:** Every module builds its own modal with `fixed inset-0 z-50 bg-black/40 flex items-center justify-center`. This is ~25 copies of the same code across the codebase.
**Fix:** Create `apps/web/src/components/ui/modal.tsx` wrapping Radix Dialog. Generate from shadcn/ui. Replace all inline modal patterns.

---

### M-04 — No Column Toggle / Customization on Tables
**Issue:** All data tables have fixed column sets. Power users (e.g., a procurement manager) cannot hide columns they don't need or reorder columns to fit their workflow.
**Fix:** Add a column visibility toggle (gear icon on table header → checkboxes per column, state persisted in localStorage per module per user).

---

### M-05 — CRM Activity Log / Timeline Missing Interaction Context
**Issue:** The CRM Activities tab lists calls, emails, meetings, etc. but activity records don't show rich context (call duration, email subject, meeting outcome, next action).
**Fix:** Expand activity forms to capture outcome + next action + notes. Display in a timeline view rather than a flat table.

---

### M-06 — Group Dashboards Show Navigation Item Counts
**Location:** Sidebar group headers show count badges (e.g., "IT Services · 5")
**Issue:** The count shows number of navigation items in the group, not the number of open records. This confuses users who expect it to indicate urgency/activity.
**Fix:** Either remove the count badge from group headers, or replace with the live alert badge count (same as the per-item badges). If removing, the count offers no value.

---

### M-07 — No "Last Seen" / Activity Indicator for Users
**Issue:** In admin user list and agent assignment flows, there's no indicator of when a user last logged in or whether they're currently active. An agent assigned a ticket may be on leave.
**Fix:** Add `last_seen_at` to user records (update on each authenticated API call). Show "Active X hours ago" in admin user list and agent picker.

---

### M-08 — Ticket New Form Phone Placeholder
**(Duplicate of C-08 — elevated to this section for visibility)**
US phone format everywhere should be `+91 XXXXX XXXXX`.

---

### M-09 — No Inline Validation on Non-Form Fields
**Issue:** Fields edited inline on the ticket detail page (click-to-edit title, urgency, etc.) have no validation — empty title can be saved, invalid values can be submitted.
**Fix:** Add min-length validation on inline editing saves. Show inline error below the field if invalid.

---

### M-10 — AI Features Not Clearly Discoverable
**Issue:** AI summary and resolution suggestion on ticket detail are behind an "AI Assistance" section that requires user action to trigger. New users do not know this feature exists.
**Fix:** Add a subtle "✨ Generate AI summary" primary CTA visible on ticket load (collapsed by default but clearly visible). Add tooltip on hover.

---

### M-11 — No Audit Trail on Financial Mutations
**Issue:** The global audit log captures changes across the system, but financial mutations (approve PO, make payment, modify invoice amount) need an immutable, non-deletable audit trail per accounting best practice.
**Fix:** Tag financial mutations with `audit_category: 'financial'` and render a dedicated "Financial Audit Trail" tab on the financial management page showing all changes, approvals, and payment events.

---

### M-12 — Sidebar Active Item Not Visually Distinct Enough
**Issue:** The active sidebar item uses `border-l-2 border-primary bg-accent/10` — a 2px left border and very light blue background. On the white sidebar this is subtle and can be missed.
**Fix:** Increase background to `bg-accent/20` and add `font-semibold` to the active item text. Consider using a left `border-l-3` for more visibility.

---

### M-13 — No Print / PDF Export for Reports
**Issue:** The Reports page has a Download button (icon only, no label) that triggers `downloadCSV`. There is no option to export a formatted PDF report.
**Impact:** Finance managers and executives expect to print reports or share PDFs.
**Fix:** Add "Export PDF" using `window.print()` with a `@media print` CSS that hides sidebar/header and formats the report for printing. Or use `jspdf` for a formatted PDF.

---

### M-14 — Virtual Agent Widget Not Context-Aware
**Issue:** The floating chat widget shows the same initial message and suggestions on every page. On the CRM page it still says "🔐 Reset my password" and "🌐 VPN issue" — irrelevant to a sales user.
**Fix:** Make the widget context-aware using `usePathname()`. When on `/app/crm`, show CRM-relevant quick actions ("Log a call", "Create a lead", "View pipeline"). When on `/app/hr`, show HR actions ("Submit leave request", "View my payslip"). The hardcoded flows can remain as a fallback.

---

### M-15 — Overflow Menu (MoreHorizontal `...`) Not Accessible
**Issue:** Many list rows have a `...` overflow menu button that appears on hover. This button has no `aria-label`, no keyboard focus state, and disappears when the row loses hover (making keyboard navigation impossible).
**Fix:** Add `aria-label="More actions"` to all overflow menu buttons. Ensure they're always visible (not just on hover) at 30% opacity, becoming full opacity on focus/hover.

---

### M-16 — No Success State After Form Submit
**Issue:** After creating a new ticket, PR, or project, the modal closes and the list refreshes silently. There's a toast ("Ticket created") but no navigation to the newly created record.
**Fix:** After successful creation, navigate to the new record's detail page: `router.push('/app/tickets/' + newTicket.id)`. For bulk flows (like bulk ticket import) show a success summary instead.

---

### M-17 — Contracts Clause Editor Lacks Rich Editing Affordances
**Issue:** The clause editor (`apps/web/src/components/contracts/clause-editor.tsx`) is a custom component. It lacks standard editor affordances: bold, italic, heading formatting, bullet lists, tables.
**Fix:** Replace with a Tiptap editor (open-source ProseMirror wrapper) which is already widely used in Next.js apps. It supports rich text, slash commands, and AI integration.

---

### M-18 — No Chart on Procurement Dashboard
**Issue:** The Procurement Dashboard tab shows KPI cards and a table. Spend by category, spend trend over time, and vendor concentration are prime candidates for visualisation that don't exist.
**Fix:** Add (with Recharts): a bar chart of monthly spend, a pie chart of spend by category, and a table with sparkline for top vendors.

---

### M-19 — GRC Risk Heatmap Is Text-Only
**Issue:** The GRC Risk Register lists risks in a table. The "Risk Dashboard" tab mentions a risk heatmap but it's rendered as a static grid of colored numbers, not an interactive heatmap.
**Fix:** Render the 5×5 risk heatmap as an actual colored grid (red top-right, green bottom-left) with dots representing current risks positioned by likelihood × impact. Click a dot to jump to that risk.

---

### M-20 — Walk-Up Queue Has No Real-Time Updates
**Issue:** The Walk-Up module shows a queue but does not auto-refresh. A walk-up agent at a physical desk needs the queue to update in real-time without manual refresh.
**Fix:** Add `refetchInterval: 15_000` (15s polling) on the walk-up queue query, with a subtle "Updated X seconds ago" indicator.

---

### M-21 — CMDB Topology Is Text-Based (No Visual Graph)
**Issue:** The CMDB page has a "Topology" tab that shows `No topology data available yet` when empty, and when populated would show a text-based node list. True CMDB value comes from a visual dependency graph.
**Fix:** Integrate a lightweight graph library (React Flow, which is already popular for Next.js apps) to render the CMDB topology as a draggable, zoomable node graph.

---

### M-22 — No Bulk Actions on List Pages
**Issue:** The ticket list has checkboxes (`CheckSquare`) for selection, but the only bulk action available is bulk status update. CRM contacts, HR employees, procurement PRs, and other lists have no bulk action capability at all.
**Fix:** Implement a bulk action toolbar that appears when items are checked: "Bulk assign", "Bulk close", "Bulk export" (at minimum) on the ticket list. Add checkboxes + basic bulk delete/export to other major lists.

---

### M-23 — Project Agile Board Is Partially Mock
**Issue:** The Projects Agile board tab fetches data from `trpc.projects.list` but the kanban sprint board within it uses a simplified local state model. Dragging cards between lanes triggers no API mutation.
**Fix:** Wire drag-and-drop lane changes to `trpc.projects.updateTask` status mutation. Implement with `@dnd-kit/core` (already a popular Next.js compatible library).

---

### M-24 — No "Recently Visited" / Quick Access
**Issue:** There is no recently visited items section on the dashboard or anywhere else. Users who frequently access specific tickets, projects, or vendors must navigate every time.
**Fix:** Track last 5 visited records per module in localStorage. Show a "Recently visited" section on the dashboard (below the module group cards) with record type, number, and title.

---

## 6. Low Priority / Design Polish 🔵

### L-01 — Notification Bell Icon Too Small
The bell icon in the header is `h-3.5 w-3.5` (14px). On a 13px base this is extremely small. Increase to `h-4 w-4`.

### L-02 — Header Breadcrumbs Not Visible at Small Widths
At tablet widths, the breadcrumb area compresses and may overflow. Add `overflow-hidden text-ellipsis whitespace-nowrap max-w-xs` to the breadcrumb container.

### L-03 — Action Buttons Should Have Tooltips
Icon-only buttons throughout the app (`Download`, `RefreshCw`, `Filter`, `MoreHorizontal`) have no labels. Add `title="Export CSV"`, `title="Refresh"` etc. These are both accessibility requirements and discoverability improvements.

### L-04 — No Focus Visible Styles on Custom Inputs
Many custom inputs and buttons are missing `:focus-visible` outlines (using `outline-none` without a ring replacement). This fails WCAG 2.1 AA keyboard accessibility requirements.
**Fix:** Replace all `outline-none` with `focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none`.

### L-05 — Sidebar Filter Input Should Have a Clear Button
When the user types in "Filter navigator...", there's no `×` clear button. The user must backspace to clear.
**Fix:** Add an `×` icon button inside the filter input that clears the search on click (show only when `search !== ""`).

### L-06 — Dark Mode Dropdowns Ignore Theme Tokens
The notification dropdown and user menu use hardcoded `bg-slate-900 border-slate-700 text-slate-200`. In light mode these dropdowns appear with a dark background regardless of theme toggle state.
**Fix:** Replace `bg-slate-900` with `bg-popover`, `border-slate-700` with `border-border`, `text-slate-200` with `text-popover-foreground`. Use CSS tokens throughout.

### L-07 — Platform Version in Footer Should Auto-Update
Sidebar footer shows `NexusOps Platform v2.0.1` — see H-14. Should read from env var.

### L-08 — New Ticket Form Contact Phone Field Has Wrong Country Code
The "Contact phone" field placeholder is `+1 (555) 000-0000`. Should be `+91 XXXXX XXXXX`. (Same as C-08 — apply consistently.)

### L-09 — Loading Text in Ticket Detail Not Centered
```tsx
<div className="flex items-center justify-center h-60 text-[12px] text-muted-foreground/70">
  Loading ticket...
</div>
```
This shows as a very small light-gray text against white. Use a `Loader2` spinner with the text below.

### L-10 — Scroll Position Not Restored on Navigation
When navigating from a long list (e.g., ticket list scrolled to bottom) to a detail page and back, the list scroll position is lost. This is a Next.js App Router behavior — it can be mitigated with `<ScrollRestoration>` or by storing scroll position in sessionStorage.

### L-11 — Group Dashboard "Strategy & Projects" Has Wrong Icon
`/app/strategy-projects` uses `Target` icon. The icon `FolderKanban` (project board) or `BarChart3` (strategy) would be more semantically correct. Minor cosmetic issue.

### L-12 — "Escalations" Page Has No Backend Data
`/app/escalations` is in the route tree and renders. The Virtual Agent references it (`href: "/app/escalations"`), but there is no `trpc.escalations` router. The page appears to be a placeholder.
**Fix:** Either build the escalations router and page (escalated tickets queue), or redirect `/app/escalations` to `/app/tickets?filter=escalated` until the full page is built.

### L-13 — No Favicon Beyond Default Next.js Icon
The application uses the default Next.js favicon (triangle on grey). No custom NexusOps/Coheron favicon is set.
**Fix:** Create a `favicon.ico` and `apple-touch-icon.png` from the Zap (⚡) logo in the login/signup pages and place in `/apps/web/public/`.

### L-14 — Missing `<meta>` Tags for Social Sharing
The `<head>` in `apps/web/src/app/layout.tsx` likely lacks Open Graph and Twitter Card meta tags. When the app URL is shared, it shows a generic unfilled preview.
**Fix:** Add `og:title`, `og:description`, `og:image` with the NexusOps brand in the root layout metadata.

---

## 7. Module-by-Module UI/UX Score

| Module / Page | UX Quality | Key Issue |
|---------------|-----------|-----------|
| Login / Signup | ⭐⭐⭐⭐⭐ | Excellent — clean, validated, SSO present |
| Platform Dashboard | ⭐⭐⭐⭐ | Good — needs Gantt/chart visualisations, recently-visited |
| Tickets (List) | ⭐⭐⭐⭐ | Good — needs pagination, real filter panel |
| Ticket Detail | ⭐⭐⭐⭐⭐ | Best page in the app — minor: attachments missing |
| New Ticket Form | ⭐⭐⭐⭐ | Good — needs phone placeholder fix, template selection |
| Changes | ⭐⭐⭐⭐ | Good — was crashing (fixed), now solid |
| Problems | ⭐⭐⭐⭐ | Good |
| Releases | ⭐⭐⭐⭐ | Good |
| CMDB | ⭐⭐⭐ | Adequate — topology is text-only (needs graph) |
| HAM / SAM | ⭐⭐⭐ | Adequate — no discovery, basic table |
| HR (HRSD) | ⭐⭐⭐⭐ | Good — needs leave calendar, attendance tab |
| Employee Portal | ⭐⭐⭐⭐ | Good — static fallback data issue |
| Employee Center | ⭐⭐⭐ | Adequate — static fallback data issue |
| Recruitment (ATS) | ⭐⭐⭐⭐⭐ | Best new module — clean modal + pipeline UX |
| People Analytics | ⭐⭐⭐ | Basic — needs real chart library |
| Procurement | ⭐⭐⭐⭐ | Good — needs RFQ, vendor portal |
| Financial | ⭐⭐⭐ | Adequate — no double-entry, no bank recon |
| CRM | ⭐⭐⭐⭐ | Good — needs email, WhatsApp |
| CSM | ⭐⭐⭐ | Adequate — needs customer portal |
| GRC | ⭐⭐⭐ | Adequate — heatmap is text-only |
| Compliance | ⭐⭐⭐ | Adequate — static data mixed with live |
| Legal | ⭐⭐⭐⭐ | Good — needs e-sign, cap table |
| Contracts | ⭐⭐⭐ | Adequate — mock fallback, no rich editor |
| Secretarial | ⭐⭐⭐⭐ | Good — India compliance depth is strong |
| DevOps | ⭐⭐⭐⭐ | Good — integrations are mock-only |
| Projects (PPM) | ⭐⭐⭐ | Needs Gantt, kanban DnD is not wired |
| Knowledge | ⭐⭐⭐ | Needs rich editor, version history |
| Walk-Up | ⭐⭐⭐ | Adequate — needs real-time queue refresh |
| Surveys | ⭐⭐⭐⭐ | Good |
| Virtual Agent | ⭐⭐⭐ | Good concept — hardcoded responses, widget z-index bug |
| Reports | ⭐⭐ | Weakest — no real charts, mini-bars only |
| Admin Console | ⭐⭐⭐⭐ | Good — comprehensive |
| Profile | ⭐⭐⭐⭐ | Good — avatar upload non-functional |
| Notifications | ⭐⭐⭐⭐ | Good — needs per-event preferences |
| Facilities | ⭐⭐⭐ | Adequate — no floor plan, static data |

---

## 8. Immediate Action Plan — Prioritised by Business Impact

### Sprint 1 (Must-fix before demos / user onboarding)
| # | Fix | Effort |
|---|-----|--------|
| 1 | Remove / gate RBAC Role Switcher in production (C-01) | 1h |
| 2 | Fix Virtual Agent widget z-index / position overlap (C-02) | 2h |
| 3 | Implement "Remember me" correctly on login (C-03) | 2h |
| 4 | Remove all mock/static data fallbacks (contracts, compliance, employee-center) (C-05, C-06, C-07) | 4h |
| 5 | Fix all phone number placeholders to Indian format (C-08) | 30m |
| 6 | Fix breadcrumb labels for all 30+ modules (H-02) | 2h |

### Sprint 2 (Core UX quality)
| # | Fix | Effort |
|---|-----|--------|
| 7 | Add pagination to all list pages (H-01) | 1 day |
| 8 | Implement proper empty states with CTAs (H-03) | 4h |
| 9 | Add skeleton loading on list pages (H-04) | 4h |
| 10 | Integrate Recharts into Reports page (C-04) | 1 day |
| 11 | Standardize tabs to use URL query params (H-07) | 1 day |
| 12 | Build shared `<Button>`, `<Modal>`, `<ConfirmDialog>`, `<EmptyState>` components (M-02, M-03) | 1 day |

### Sprint 3 (Depth and engagement)
| # | Fix | Effort |
|---|-----|--------|
| 13 | File attachment UI for tickets, contracts, HR docs (H-16) | 2 days |
| 14 | Guided onboarding wizard for new orgs (H-11) | 2 days |
| 15 | Shared DatePicker component replacing native inputs (H-17) | 1 day |
| 16 | Context-aware Virtual Agent widget (M-14) | 4h |
| 17 | CMDB visual topology graph with React Flow (M-21) | 2 days |
| 18 | Project Agile board DnD wired to API (M-23) | 1 day |
| 19 | GRC interactive risk heatmap (M-19) | 4h |

---

*Document: NexusOps_UIUX_Validation_Report.md*
*Version: 1.0 — April 5, 2026*
*Author: NexusOps Product & Engineering, Coheron*
*Source: Full source-code audit of apps/web/src (80+ files) + F-FE-001–016 chaos test findings*
*Review cycle: Re-run this audit after every major UI sprint*
