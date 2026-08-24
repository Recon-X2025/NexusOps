# Audit — Dashboard wiring, bottom-up (DB → metrics → payload services → routers → web → click reachability)

_Date: 2026-08-24. Standing-code audit, not a diff review. Working tree had uncommitted
changes to `command-center-payload.ts`, `tickets.ts`, and the new `flow.ts` at audit time;
line numbers will shift on commit._

**Method / evidence standard.** Five layers were read end to end. Findings marked **✓ VERIFIED**
were reproduced by me directly (route tree, schema columns, call-site math, git). All others are
**code-read only (UNVERIFIED by execution)** — no dashboard was clicked, no query run, no test run.
The live click-through is blocked on login (I cannot type a password); the browser is parked on the
sign-in screen. A NOT VERIFIED list closes the report.

---

## 1. In plain English

The dashboard stack is **wired end to end and mostly honest about missing data — but it has one
money-integrity bug that must not ship, and a broad "confidently wrong" problem where the boards
state things the data does not support.** The must-fix: three workbench panels (finance, recruiting,
compliance) compute their headline **totals** — including a rupee exposure figure — from at most the
first 500–2000 rows the database happens to return, with no ordering. A customer with more rows than
that gets a wrong total with nothing indicating anything was dropped. Beyond that, the recurring
theme is **posture that looks measured but isn't**: several "this period" health lights are actually
all-time totals that get stuck red forever; the new platform-flow health states are computed with a
maths error that flips healthy↔stressed on a perfectly steady business; and a single row of data is
enough to light up a confident "stressed" alert to the CEO. Finally, the **workbench to-do lists are
half-broken to click**: 12 of 20 "go fix this" links point at pages that don't exist (404) or the
wrong page. Nothing here is a data leak or a cross-tenant break — org isolation held up everywhere I
checked. **Fix the truncation first** (it's the only one that puts a wrong number in front of a
finance user as fact), then the stuck-state and one-row-alert problems, then the dead links.

## 2. Verdict

Structurally sound, operationally fragile. The plumbing is correct where it matters most for safety:
every dashboard procedure is on `permissionProcedure`, every query self-filters `org_id` and runs
through the `rlsTenant` pipeline, no `publicProcedure` misuse, no cross-tenant path, and the payload
builder is deliberately throw-proof (`Promise.allSettled` + per-metric timeout → `no_data`). The
newest work (the `flow.ts` in/out pairs, the daily `metric_snapshots` history job) is real and
targets genuine gaps. What drags it down is a cluster of correctness-under-real-data defects that all
share two roots: **aggregating in JavaScript over a capped row fetch**, and **a metric contract
("current is a period figure with a trustworthy state") that many resolvers quietly violate.** One
BLOCKER by the repo's own rule; a dense band of HIGHs; no auth or isolation findings.

---

## 3. Findings

### BLOCKER

**B1 — Workbench headline totals are computed over a capped, unordered row fetch (silent truncation on an aggregate path). ✓ VERIFIED (finance-ops)**
- `apps/api/src/services/workbench-payloads/finance-ops.ts:63-94` — AP/AR ageing selects invoice rows `.limit(2000)` with **no `ORDER BY`**, then sums `amount` in JS into `totalAmount` (rendered as "Total exposure ₹…", `:164`). Same shape at `recruiter.ts:73-85` (funnel counts over `.limit(2000)`) and `grc.ts:71-88` (control-effectiveness matrix over `.limit(500)`).
- Failure scenario: an org with 2,500 open payables gets its ageing buckets and 90-day exposure computed over an arbitrary 2,000 of them (Postgres chooses which, absent an order clause); the finance user under-chases collections and sees a wrong rupee total with no "showing 2,000 of 2,500" signal.
- Quality bar #7 is explicit: *"Silent truncation on an export, report, filing, or **aggregate** path is a BLOCKER."*
- **In practice:** finance, recruiting, and compliance staff are shown totals that are simply wrong for any large customer, presented as fact.
- Fix: aggregate in SQL (`GROUP BY` + `sum()/count()`), as `dashboard.getMetrics` already does correctly.

### HIGH

**H1 — 12 of 20 workbench action-queue "go fix this" links 404 or open the wrong page. ✓ VERIFIED (route tree)**
- The workbench payloads emit action hrefs (rendered as links by `ActionQueue`). Checked against the real Next route tree under `apps/web/src/app/app`, these targets have no matching route: `/app/security/incidents/{id}`, `/app/security/vulnerabilities/{id}`, `/app/security/controls/{id}`, `/app/security/findings/{id}` (security has only `[id]`, no such children — `secops.ts:172,184`, `grc.ts:178,189`); `/app/hr/cases/{id}` (`hr-ops.ts:234`); `/app/recruitment/offers/{id}`, `/app/recruitment/interviews` (recruitment has only `page.tsx` — `recruiter.ts:178,189`); `/app/finance/invoices/{id}`, `/app/finance/receivables` (invoices actually live at `/app/financial/invoices/[id]` — `finance-ops.ts:154,166`); `/app/procurement/po/{id}` (the route is `/app/procurement/orders/[id]` — `procurement.ts:171`); `/app/secretarial/filings/{id}`, `/app/secretarial/meetings/{id}` (secretarial has only `page.tsx` — `company-secretary.ts:186,199`). `/app/hr/leave` (`hr-ops.ts:223`) resolves to `hr/[id]` with id="leave" → the employee-detail page for a bogus id, not a 404 but the wrong screen.
- Failure scenario: a service-desk / finance / HR / recruiting / secops user clicks the top item in their workbench action rail ("SLA breach", "renewal due", "offer expiring", "return to file") and lands on a Next 404 or an empty wrong page.
- **In practice:** the actionable half of every workbench is not actually clickable-through; the boards look wired but the links dead-end.

**H2 — `stateFromTrend` judges a whole-range total against a per-bucket average → health light flips on a steady business; poisons the composite score. ✓ VERIFIED (math + call sites)**
- `packages/metrics/src/resolve-helpers.ts:215-237` expects `current` to be a bucket-scale value (its contract: "exclude the most recent point — that is the current being judged"). But callers pass a **whole-range** `COUNT(*)` as `current` while `series` holds **per-bucket** counts: `flow.ts:116` (all 10 new flow metrics), `tickets.ts:172` and `:223`, `csm.ts:206`.
- Failure scenario: default Command Center range is 180 days → ~7 monthly buckets. A steady 50 tickets/month gives `current = 300`, trailing baseline ≈ 50, deviation = (300−50)/50 = **5.0 ≥ 0.3 → "stressed"** on a perfectly flat business. Symmetrically every `higher_is_better` flow metric computes ≈ −5 → **"healthy" forever, even in total collapse**. These states feed `compositeScore` (`command-center-payload.ts:147`), so the executive score is arithmetic over states that are wrong by construction on the default view.
- **In practice:** the top-line health score and the new platform-flow lights are unreliable exactly on the view executives see first.

**H3 — Several "this period" lights are actually all-time totals with fixed thresholds → stuck states that never recover. (code-read)**
- `tickets.sla_compliance` (`tickets.ts:80-93`) — both counts filter only `org_id`, no date window; the state derives from a lifetime %, while the trend line beside it is per-period. 100 breaches last year + flawless since → permanent "watch/stressed" above a 100% recent line.
- `coo.vendor_sla_breaches` (`coo-cio.ts:24-38`) — `COUNT(*)` of every late GRN ever; `>5 → stressed`. Any org that has ever had 6 late deliveries is **permanently stressed**, unrecoverable without deleting history.
- `financial.burn_rate` (`financial.ts:89-99`) — sums cumulative COA balances (never period-closed) with a fixed ₹10L "watch" line → any real org shows "watch" forever within months.
- `security.incidents_open_total` (`security.ts:56-79`) — headline = open now, series = created per bucket: one card, two different quantities (the exact defect `legal.ts:31-37` documents having fixed for legal matters).
- **In practice:** red/amber lights that can never turn green, so the board trains users to ignore them.

**H4 — No metric has a sample-size floor: one row lights a confident "stressed". (code-read; prior finding, still live)**
- Sharpest case `csm.churn_rate_30d` (`csm.ts:39-46`): `rate = churned/(active+churned)`, `>5% → stressed`. 10 accounts, 1 archived this month → 9.1% → **stressed → CEO attention item at severity "high"** (`roles.ts:13`), off a single archived row. Same for `csm.csat_avg` off one survey response.
- **In practice:** brand-new or tiny tenants get alarming executive alerts driven by a single record.

**H5 — Panels assert facts the data does not contain (fabricated operational claims). ✓ VERIFIED**
- `pmo.ts:217-227` — for any project with `health === "red"` the action queue emits **"{project} — Status report overdue"**, but nothing in the payload queries a status-report table. A red project whose report was filed yesterday is still labelled overdue.
- `service-desk.ts:175-191` — the "on-shift roster" panel returns `members[0]` of the schedule's static JSON as who is on shift (always the first-listed person, regardless of rotation or time) and hard-codes `endsAt: null`, so the promised shift countdown can never render. Names the wrong on-call person.
- (Rated HIGH not BLOCKER: both derive from real rows rather than hardcoded literals like the old "Data Breaches: 0", but both state a specific claim the query does not support.)
- **In practice:** the boards make confident operational assertions — who's on call, which report is late — that are guesses.

**H6 — Both DevOps metrics are registered but unreachable from every role; the deploy-failure alert can never fire. ✓ VERIFIED**
- `devops.ts:77,120` — `appearsIn: []`. `getMetricsForRole` filters on `appearsIn`, so these never enter any role's metric set; the attention rule `devops.deploy_success_rate → state_is_stressed` (`roles.ts:39`) is permanently inert, the devops heatmap row is always "—", and the devops platform-flow row is skipped.
- **In practice:** production deploy success can crater and the CIO board shows nothing — a capability the tenant cannot reach.

**H7 — Command Center financials are served to roles whose RBAC denies every financial route (authorization consistency). (code-read)**
- `command-center.ts:70-94`: `getView` is `permissionProcedure("command_center","read")` with the role pinned server-side to `"ceo"`, so every holder of `command_center:read` receives the full CEO payload — including `financial.cash_runway_months`, `burn_rate`, `gross_margin`, `ap_open/ar_open`, `crm.arr_run_rate` as numeric bullets/heatmap cells. Per `rbac-matrix.ts`, `command_center:read` is held by `manager_ops`, `security_analyst`, `legal_counsel`, `company_secretary`, `privacy_officer`, `report_viewer` — none of which holds `financial:read`; their drill-through to `financial.executiveSummary` would 403. `getHubView(functionKey:"finance")` makes it direct.
- Not a BLOCKER: aggregate figures only, no row data, no cross-tenant reach. But burn rate flowing to a privacy officer / security analyst does not look intended.
- Related weaker sibling: `dashboard.getMetrics` exposes AP/AR outstanding totals on `reports:read` (`dashboard.ts:137-156`), reachable from every user's sidebar — ticket-desk roles see company unpaid-invoice totals.
- **In practice:** company-level financial health numbers reach several non-financial staff roles.

**H8 — Web: a disabled or failed query renders as an all-clear, not a denial or error. (code-read)**
- Hub "Overview" nav is shown to roles the hub page then rejects: sidebar gates on the module (`sidebar-config.ts:66,192,…`, filtered by `canAccess(item.module)`), but the page gates on `command_center` (`hub-command-center-page.tsx:209-211`). The `requester` role (every ordinary employee) sees "Overview" on every hub and gets AccessDenied on click.
- RBAC-disabled query → **infinite loading skeleton**: `canAccess` (resource-only) can pass the page gate while `can` disables the query; the 5s timeout only arms `if (q.isFetching)`, which a disabled query never is (`command/page.tsx:117-181`, same in hubs) → pulsing skeleton forever.
- Workbench query **error** → "No data yet." / "No actions for you right now." on 2 of 3 panel types incl. the SecOps surface (`secops/page-content.tsx:30-31,76`) — a failed fetch dressed as a clean slate.
- Trend chart collapses year-less bucket labels (`command-center-trends.tsx:21-26`): two "Aug" points dedupe into one (a "Last 1 year" view silently drops the current month), cross-year ranges mis-order (`new Date("Jan 2")` vs `"Dec 30")`), and any missing bucket plots a fabricated 0.
- Strategy hub prints "Overall OKR Velocity **0%**" on no data (`hub-layouts/strategy.tsx:16,64`), bypassing the "—" that `formatMetricValue` gives every other tile.
- **In practice:** several failure and empty states read to the user as "all clear / measured zero" instead of "denied / broken / unknown".

**H9 — More capped-fetch-as-total and wrong-status-set aggregations. ✓ VERIFIED (schema) / code-read**
- AP/AR ageing filters `status IN ('pending','approved','overdue')` (`finance-ops.ts:75`) but the invoice enum also has unpaid states `confirmed`, `matched`, `exception`, `disputed` (`procurement.ts` enum) — a 3-way-matched invoice unpaid 95 days appears in no ageing bucket; disputed invoices (classic ageing content) are invisible.
- HR journey counts are `.limit(10)` then reported as `count: rows.length` (`hr-ops.ts:70-158`) — 25 joiners renders "10".
- Field-service column counts and technician load are derived from a `.limit(50)` board page (`field-service.ts:80,98-127`) and shown as totals.

### MEDIUM (condensed)

- **One SQL error blanks the whole board.** All resolvers run on the single RLS transaction; in Postgres one query error aborts the transaction, so every later statement fails 25P02 → all `no_data` → the narrative tells a data-full tenant "Please ingest records" (`command-center-payload.ts:101` + `lib/trpc.ts:549`). The `_shared.ts:5-9` claim that one bad query "cannot bring down the whole workbench" is true only for timeouts, not SQL errors.
- **`no_data` scores as "stressed" in the narrative's weakest-function pick** (`command-center-payload.ts:113-118,299-318`) — an all-green day with one unmapped heatmap cell is narrated as "weakest row is X (stressed)". (The composite score correctly excludes `no_data`; the narrative does not.)
- **Synthesized hub targets are indistinguishable from real ones** (`command-center-payload.ts:167-186`) — "Revenue 42L / target 46.2L" where no one set 46.2L.
- **"Resolved in period" keyed on `updated_at`** (`csm.ts:234,241`; churn on `crm_accounts.updatedAt` `:35`) — any later edit re-dates the resolution; a bulk touch spikes churn. (The new `flow.ts` correctly uses real `resolved_at/closed_at/decided_at/paid_at`.)
- **Rate/score series zero-fill empty buckets as catastrophe** (`tickets.ts:110`, `devops.ts:62`, `csm.ts:100`) — a quiet week draws SLA/CSAT/deploy-success crashing to 0.
- **Cash runway divides by a fixed 3 months** regardless of history (`financial.ts:53`) → 3× overstated for young tenants, exactly whom runway matters to.
- **UTC bucketing vs IST** (`resolve-helpers.ts:69-92` joined to session-TZ `DATE_TRUNC`) — correct only because the container runs UTC; under `TZ=Asia/Kolkata` day buckets shift and charts silently flat-zero. The repo's own standing hazard.
- **View-audit rows written outside the hash chain, fire-and-forget** (`command-center.ts:96-116,152-171`) — "who viewed the exec dashboard" can be silently deleted; on insert failure it's never recorded. (The mutation chain is intact; this is the read-log class the codebase already knows about.)
- **`generateNarrative` 500s on malformed client input** (`command-center.ts:176-197`, `payload: z.record(z.unknown())` → `.bullets.slice`) — garbage request yields a server error + raw TypeError, not BAD_REQUEST.
- **Silent catches return `no_data` with no log** across `flow.ts:119`, `csm.ts`, `legal.ts:84`, `strategy.ts:64`, `coo-cio.ts:40,78` — a renamed column is indistinguishable from an empty tenant, forever, with nothing written anywhere.
- **Reachability drift:** Security & Compliance hub, SecOps and GRC workbenches are URL-only; the code comment says the command palette covers them, but the palette lists `/app/security` etc., **not** `/app/security-compliance`, `/app/workbench/secops`, `/app/workbench/grc` (`sidebar-config.ts:131-152`, `command-palette.tsx:53-109`). Also: payload drill URLs are rendered by **no** component on `/app/command` itself (the only renderer, `command-center-narrative-panel.tsx`, is imported nowhere) — metric drills are clickable only from the hub "Analytics & Reporting" tab.
- **Change calendar** shows cancelled/failed changes and misses in-flight collisions (`change-release.ts:101-110`, `gte(scheduledStart, now)`); **GRC "Evidence Nd old"** is actually `lastTestedDate`, not evidence age (`grc.ts:121-123`); **CSM renewals** include employment/NDA/vendor contracts (`csm.ts:92-98`, no type filter); **recruiter funnel** is all-time cumulative.

### LOW (selected)

- Dead code implying features that don't exist: `stateFromTrend` imported-but-unused in `financial.ts:4` (cosmetic — the package lints via `tsc --noEmit` with no `noUnusedLocals`, so it does **not** fail CI); unimported `CommandCenterNarrativePanel`, `TrendCard`, `command-center-chart-data.ts` helpers, unused `showTrendDeck`/`footerQuote` props.
- `financial.ar_open` declared `higher_is_better` → growing uncollected receivables renders as a green/good delta (`financial.ts:155`).
- KPI-strip progress bars are per-state constants (90/60/30%) styled as measurements (`command-center-kpi-strip.tsx:43`); flow panel animates a "live particle stream" mockup even when totals are "—" (`command-center-flow.tsx:41-63`).
- CSV export filename uses `toISOString()` (`hub-reports-tab.tsx:161`) — yesterday's date before 05:30 IST.
- `csm.cases_resolved_period` state is a tautology `n >= 0 ? healthy` (`csm.ts:259`) — always adds 100 to the composite.
- Workbench panel errors return raw `error.message` to the client (`_shared.ts:38-45`) despite the "sanitized" comment.

---

## 4. Root causes

Three decisions produced almost everything above:

1. **Aggregation was moved out of SQL into JavaScript over a `LIMIT`-ed fetch.** This single choice
   is B1 (money totals), H9 (HR/field-service counts), the recruiter funnel, and the GRC matrix.
   Where the code aggregates in SQL (`dashboard.getMetrics`, `tickets.statusCounts`) it is both
   correct and uncapped. **The fix is mechanical and identical at every site: `GROUP BY`/`sum()` in
   the query.**

2. **The metric contract — "`current` is a period figure carrying a trustworthy `state`" — is
   honoured by the helper but quietly broken by many resolvers.** `stateFromTrend`'s unit
   assumption (H2), the all-time-total-with-fixed-threshold lights (H3), the no-floor one-row
   alerts (H4), the `updated_at` proxies, and the `no_data`-means-error-or-empty ambiguity all come
   from resolvers that compute a number one way and a state another way. There is no shared
   "given a period count and a series, produce current+state consistently" primitive that every
   resolver is forced through — so each drifts on its own.

3. **The wiring was built label-first, not route-first / role-first.** The drill hrefs (H1), the
   nav-vs-page gate split (H8), and the URL-only surfaces (Medium) all exist because a link/label
   was written to a path or a module name that was never checked against the actual route tree or
   the actual page guard. Nothing cross-checks the set of emitted `drillUrl`/`href` values against
   the set of real routes, or the sidebar's module gate against the page's `canAccess` gate.

## 5. Recommended order of work (by blast radius)

1. **B1 — the three capped aggregations.** Only finding that puts a wrong money/compliance number in
   front of a user as fact; violates the repo's own explicit BLOCKER rule. Small, mechanical fix.
2. **H2 + H3 + H4 — the health-state integrity cluster.** These make the entire posture/score layer
   untrustworthy on the default view; fixing them is what makes the dashboard's core promise real.
   Route every resolver through one consistent current+state primitive; add a sample-size floor;
   window the all-time lights.
3. **H1 — the dead workbench drill links.** High user-visible embarrassment, self-contained: correct
   each href to a real route (or add the missing routes), and add a test that cross-checks every
   emitted `href`/`drillUrl` against the route manifest so the class cannot regress.
4. **H5 + H6 — fabricated claims and the unreachable DevOps alert.** Remove/relabel the guessed
   assertions; give the two devops metrics an `appearsIn`.
5. **H7 — the finance-visibility-vs-RBAC question.** A policy call for the owner: either trim the
   `command_center`/`reports` grants or filter finance metrics by a `financial:read` check in the
   payload builder (the workbench router's `assertWorkbenchAccess` is the pattern already in-repo).
6. **H8 + the Mediums.** Failure/empty states that read as all-clear; the aborted-transaction
   cascade; the audit-chain read logs.

## Test-layer note (from the coverage read)

The dashboard's automated safety net is thin against every finding above. The only e2e touching all
workbench routes asserts nothing on a crash (`zz-reachability-walk.spec.ts:181`); no test asserts a
rendered dashboard **value** (all are crash-smoke); `buildCommandCenterPayload().flow`, all 13
workbench builders, and both `commandCenter` router procedures have **zero** tests; no test runs
under a non-UTC `TZ`; no test cross-checks a drill URL against a route. The strongest file is the new
`flow-metrics.test.ts` (exact counts, out-of-range + cross-tenant cases) — but it tests the 10 flow
resolvers, not the `stateFromTrend` posture bug (H2) they carry, and not the payload's flow assembly.
Net: reverting the truncation fix, re-hardcoding the flow functions, or flipping `tickets.open_total`
back to `category='open'` would all keep the suite green.

## Cross-layer positives (calibration)

Org isolation held everywhere checked (every query self-filters `org_id`; all run through
`rlsTenant`; Redis keys are org-prefixed). No `publicProcedure` misuse, no deprecated-twin gap in
this layer, no client-orgId. The payload builder's throw-proofing and the honest `no_data → "—"`
rendering on the standing heatmap/tiles are correct. The daily `metric_snapshots` job (W1) genuinely
backfills the empty-series metrics without inventing history. The new `flow.ts` uses real resolution
timestamps and correct org filters. `approval_requests` now **has** a product writer (`raiseApproval`,
commit `425b3e6`) — the prior "approvals island" gap is closed, so the approvals flow metrics have a
live source (memory corrected).

---

## NOT VERIFIED

- Nothing was executed: no query, no test, no dashboard click. Findings not marked ✓ VERIFIED are
  code-traced only. The live click-through is blocked on login.
- B1 truncation was not reproduced against a 2,000+-row org; H2's 5× deviation is arithmetic on the
  code, not a measured resolver output; H8's "skeleton forever" rests on react-query v5 disabled-query
  semantics from the library contract, not an observed render.
- The H-cascade (one SQL error aborts the shared transaction) is inferred from Postgres + `rlsTenant`
  semantics, not reproduced.
- Whether any cross-org GRN→PO row exists (would turn `coo-cio.ts`'s PO-only join filter from a
  defence-in-depth gap into a real mis-count) — not checked against data.
- The production/dev Postgres session TZ (the UTC-bucketing finding assumes UTC holds today).
- Whether the metric-snapshot worker actually runs in production (it is registered at API boot,
  `services/workflow.ts:200-207`; not confirmed running).
- Line numbers cited sit on a working tree with uncommitted edits to `command-center-payload.ts`,
  `tickets.ts`, and the untracked `flow.ts`; they will move on commit.
