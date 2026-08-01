# Sweep — Unreachable Features

**Type:** Sweep, not an audit. No code was changed.
**Scope:** Features that appear complete (schema, business logic, UI, or API
surface) but have **no working path for a user to reach or use them end to
end**. Sub-types looked for: (a) screens that cannot save, (b) endpoints
nothing calls, (c) logic gated behind a condition nothing satisfies, (d)
workflows missing a step, (e) tables with no creation path.

Every finding below was confirmed by reading the source directly. Candidates
surfaced by search agents that turned out to be wrong were discarded and are
listed in "Checked and cleared" so the reader knows they were not skipped.

---

## In plain English

The platform has a number of features that look finished — you can see the
screens, the reports, the alert logic, the database tables — but there is no
button, form, or code path that actually *creates* the thing the feature
operates on. It is like a mailbox with no mail slot: the sorting machinery is
all there, but nothing can ever be posted into it.

The four you already knew about are all real and confirmed. On top of them,
the sweep found several more of the same shape:

- **The approval inbox has nothing to approve.** The "pending approvals"
  screen, the approve/reject buttons, and the tables behind them all exist, but
  nothing in the running product ever *files* an approval request. The only way
  a request gets created is a demo seed script.
- **The depreciation engine can't be run by anyone.** All the accounting logic
  to set up and run asset depreciation is written and working, but no screen
  calls it — there is no way for a user to trigger it.
- **India statutory filing records (TDS / ESI / PF / Professional Tax) can be
  *marked filed* and *reported on*, but never actually created** except by
  automated tests. The compliance dashboards read these tables; nothing writes
  them in production.
- **Invoice line items are never saved.** Invoices exist, but the per-line
  detail table that GST reports read from is only ever populated inside tests.
- **Custom SLA policies can be read and matched but never created.**
- **The DPDP consent-expiry automation can never fire**, because the consent
  form never lets a user set an expiry date.

**The one thing to fix first:** the **approval workflow**. Approvals gate money
and access decisions across the product, and right now that entire safety
mechanism is inert — a user who thinks a purchase or role change is "pending
approval" is looking at a queue nothing can ever enter.

---

## Verdict

This is a consistent, structural pattern, not a set of unrelated bugs. Across
at least eight subsystems the *consumption* side (read, report, match, alert,
approve) was built while the *creation* side (the insert / save / trigger) was
either never built or exists only in seed and test code. Test-only inserts are
the most dangerous variant: the tests pass, so the feature looks covered, but
no user can reach it. The four known items are confirmed; the sweep adds
several more of identical shape.

---

## Findings

### The four known items — all confirmed

#### 1. Goods receipt — tables + matching logic, no way to record one — **BLOCKER**

- **What appears built:** `grn` / `grnLineItems` tables, and the three-way
  match (`apps/api/src/lib/invoice-po-match.ts:213,232,276`) which branches on
  `if (invoice.grnId)` to compare invoice ≈ PO ≈ GRN.
- **Missing piece:** there is no production insert into the GRN tables and no
  router mutation to record a goods receipt. `grnLineItems` and `grnId` are only
  ever written inside tests (confirmed in the phantom-fields sweep). Invoice
  creation in `financial.ts` never sets `grnId`.
- **What the user experiences:** the "3-way match" is advertised but silently
  degrades to a 2-way (invoice↔PO) match for every real invoice, because the
  `grnId` branch is never taken. There is no screen to record that goods
  arrived. Procurement teams cannot close the receive-goods step at all.

#### 2. Response SLA — deadlines and breach alerts, nothing records a response — **HIGH**

- **What appears built:** `tickets.slaRespondedAt` is read by SLA breach logic
  and by reports; response-time SLA deadlines are computed.
- **Missing piece:** no code path ever sets `slaRespondedAt` to a timestamp
  (confirmed in the phantom-fields sweep). The "first response" clock has a
  deadline and a breach alarm but no stop button.
- **What the user experiences:** every ticket eventually shows as *response-SLA
  breached* regardless of how fast an agent actually replied, because the field
  that would mark "responded" is never populated. Response-SLA reporting is
  therefore always wrong.

#### 3. Impersonation — mints a token nothing consumes — **HIGH**

- **What appears built:** `startImpersonation` in
  `apps/api/src/routers/mac.ts:395-418` mints an impersonation JWT and returns
  `redirectUrl: .../app?token=<jwt>`.
- **Missing piece:** the web client (`apps/web/src/lib/trpc.ts:88-89`)
  authenticates **only** from `localStorage` (`coheronconnect_session`); it
  never reads a `?token` URL parameter. The only `?token` consumers in the web
  app are `reset-password/[token]`, `survey/[token]`, and `invite/[token]` —
  none related to impersonation.
- **What the user experiences:** a super-admin clicks "impersonate", is
  redirected to `/app?token=…`, and lands on the login screen (or their own
  session) — the token in the URL is ignored. Impersonation never actually
  starts.

#### 4. Custom role creation — permission_action enum mismatch — **HIGH**

- **What appears built:** the RBAC matrix UI
  (`apps/web/src/app/app/admin/page.tsx:479,488,499`) offers seven action
  columns: `read, write, delete, admin, approve, assign, close`, and pushes the
  chosen ones as `{ resource, action }`. `roles.create`
  (`apps/api/src/routers/admin.ts:1046-1085`) inserts them.
- **Missing piece:** the database enum only allows five values —
  `permissionActionEnum = ["create","read","update","delete","manage"]`
  (`packages/db/src/schema/auth.ts:248-254`). The insert casts `perm.action as
  any` to bypass TypeScript, so `write / admin / approve / assign / close` reach
  Postgres and raise `22P02 invalid input value for enum`, rolling back the
  whole transaction. Only `read` and `delete` overlap; the enum's own
  `create / update / manage` aren't even offered by the UI.
- **What the user experiences:** any realistic custom role (which will include
  `write` or `admin`) fails to save with a generic server error. Only a role
  restricted to `read`/`delete` can be created. Custom RBAC is effectively
  unusable.

---

### Additional unreachable features found by the sweep

#### 5. Approval workflow — inbox and decision logic, nothing creates a request — **BLOCKER**

- **What appears built:** the full approvals router
  (`apps/api/src/routers/approvals.ts`) — `pending`, `myRequests`, `teamQueue`,
  `decide` (which reads/updates `approvalRequests` and `approvalSteps`), and a
  `list` admin view. The UI shows a pending-approvals queue and approve/reject
  controls.
- **Missing piece:** the router has **no `create` mutation**, and there is **no
  production insert** into `approvalRequests` or `approvalSteps` anywhere in
  `apps/api/src`. The only insert is the demo seed
  (`packages/db/src/seed-approvals.ts:21`). `decide` reads and updates steps
  that nothing ever creates.
- **What the user experiences:** the approvals inbox is permanently empty in any
  real org. Anything the product describes as "requires approval" (purchases,
  role changes, etc.) never generates an approval item, so the approval gate is
  silently inert — work proceeds without approval, or stalls with no way to
  request one.

#### 6. Depreciation engine — full router, no UI caller — **HIGH**

- **What appears built:** `apps/api/src/routers/depreciation.ts` exposes six
  working procedures — `setup` (mutation, ~64), `schedule` (query, ~138),
  `register` (query, ~151), `entries` (query, ~174), `run` (mutation, ~186),
  `runAll` (mutation, ~273).
- **Missing piece:** no screen calls any of them. The only references to
  `depreciation.*` in the whole web app are in the generated RBAC map
  (`apps/web/src/lib/trpc-procedure-rbac.generated.ts:254-258`), which is
  metadata, not a caller. No worker or scheduler invokes them either.
- **What the user experiences:** asset depreciation — set-up, scheduling, and
  posting — can never be triggered. Book value never changes; the accounting
  the engine would feed simply never happens. The feature is complete server-side
  and completely unreachable.

#### 7. India statutory filing records — read/marked-filed, never created — **HIGH**

- **What appears built:** compliance dashboards read `tdsChallanRecords`,
  `esiChallanRecords`, `epfoEcrSubmissions`, and `ptChallanRecords`
  (`apps/api/src/routers/india-compliance.ts:525,564,770,868`) and can display /
  mark filing status.
- **Missing piece:** none of these tables is inserted by production code.
  `tdsChallanRecords` has **no insert anywhere** (not even tests);
  `esiChallanRecords`, `epfoEcrSubmissions`, and `ptChallanRecords` are inserted
  **only inside `__tests__/`** (`esi-return.test.ts`, `statutory-filing.test.ts`,
  `pt-challan.test.ts`).
- **What the user experiences:** the statutory-filing screens are always empty
  for a real org; there is no way to generate a TDS / ESI / PF / PT challan
  record. The passing tests give false confidence that the filing feature works.

#### 8. Invoice line items — read by GST reporting, only written in tests — **HIGH**

- **What appears built:** `invoiceLineItems` is read by accounting
  (`apps/api/src/routers/accounting.ts:749`) and drives GSTR-1 rate grouping.
- **Missing piece:** `financial.ts` (invoice create, AP 253-275 / AR 362-390)
  contains **zero** `invoiceLineItems` references. The only inserts are in tests
  (`gstr1-rate-grouping.test.ts`, `fg2.test.ts`, `layer8-module-smoke.test.ts`).
- **What the user experiences:** real invoices have header totals but no line
  detail, so any report or GST computation that reads line items sees nothing.
  GSTR-1 rate grouping produces empty/incorrect output for real data while its
  test passes.

#### 9. Custom SLA policies — read/matched, never created — **MEDIUM**

- **What appears built:** `resolveSlaPolicyMinutes`
  (`apps/api/src/services/ticket-sla-policy.ts:41-66`) reads active `slaPolicies`
  rows and matches ticket type/category to override SLA minutes.
- **Missing piece:** `slaPolicies` has **no insert anywhere** — not in
  production, not in seeds, not in tests. The match loop always finds zero rows
  and returns `null`.
- **What the user experiences:** the SLA-policy override system is dead weight —
  it silently falls back to priority-based SLA minutes 100% of the time. No user
  can define a custom SLA policy; there is no create path.

#### 10. GRC controls & audit findings — read into dashboards, no creation path — **MEDIUM**

- **What appears built:** the GRC workbench
  (`apps/api/src/services/workbench-payloads/grc.ts:73-146`) and the GRC router
  (`apps/api/src/routers/grc.ts:154`) read `riskControls` (coverage matrix,
  test-schedule queue) and `auditFindings` (open-findings action queue).
- **Missing piece:** neither `riskControls` nor `auditFindings` is inserted
  anywhere in `apps/api/src`. The dashboards render whatever exists, but nothing
  creates a control or a finding.
- **What the user experiences:** the control-coverage matrix and audit-findings
  action queue are permanently empty; there is no way to add a control or log a
  finding. The GRC screens look functional but can never hold data.

#### 11. Workflow step-run history — read, never written — **MEDIUM**

- **What appears built:** `workflows.ts:391` reads `workflowStepRuns` by
  `runId` to show per-step execution history.
- **Missing piece:** `workflowStepRuns` has no insert anywhere in
  `apps/api/src`. The per-step history table is never populated.
- **What the user experiences:** workflow run detail views show no step history
  even after a workflow runs — the step-level audit trail is always empty.

---

### Ambiguous / UX-unreachable (called out, not asserted as a hard defect)

#### 12. DPDP consent-expiry automation — form omits the expiry date — **MEDIUM**

- **What appears built:** the consent-expiry sweep
  (`apps/api/src/lib/dpdp-sweeps.ts:200-231`) expires any `granted` consent whose
  `expiresAt IS NOT NULL AND expiresAt < now()`. The server input for granting
  consent (`compliance.ts:433`) accepts an **optional** `expiresAt`.
- **Missing piece:** the web grant form
  (`apps/web/src/app/app/dpdp/page.tsx:392`) submits only `principalRef` and
  `purpose`; it never sends `expiresAt`. Every UI-created consent therefore has a
  NULL expiry and can never match the sweep's gate.
- **Why "ambiguous":** the server *does* accept `expiresAt` if a caller supplies
  it, so the automation is not impossible in principle — it is unreachable
  **through the only UI that exists**. Framed as UX-unreachable, not a hard
  server defect.
- **What the user experiences:** consents never expire automatically; the
  expiry-sweep is effectively dead because the only way to create a consent
  never sets the field it keys on.

---

## Checked and cleared (candidates that turned out fine)

- **`surveys.*`** — a search agent flagged the surveys router as uncalled. This
  is **wrong**: `apps/web/src/app/app/surveys/page.tsx:122-148` calls
  `surveys.list`, `getResults`, `create`, `update`, and `activate`. Surveys are
  fully reachable — **excluded**.
- **`ticketCategories` / `ticketPriorities`** — read widely and flagged as
  having no insert, but they are **seeded lookup tables**
  (`packages/db/src/seed.ts:132,140`) and are legitimately created by the base
  seed. Not a gap — **excluded**.
- **`rooms`** — read by facilities but inserted only by seed
  (`packages/db/src/seed-modules.ts:378`). This is a seeded catalog rather than a
  user-created record; excluded from the "unreachable" list but noted here for
  completeness.
- **Type-B "screens that cannot save"** — the recon pass surfaced no firm case
  of a save form whose mutation is missing/mis-wired beyond the enum issue in
  finding #4. None reported.

---

## Root causes

Collapsing the symptoms, three design decisions produced nearly all of the
above:

1. **Consumption built before creation, in separate sessions.** For each
   feature the read/report/match/approve side was implemented and the
   insert/save/trigger side was deferred and never returned to. The tables and
   readers exist; the writers do not.
2. **Tests and seeds standing in for a real creation path.** Where an insert
   *does* exist, it is frequently only in `__tests__/` or `seed*.ts`. The tests
   pass, so the feature reads as "done" and covered, masking that no user can
   reach it. (Statutory challans, invoice line items, approval requests.)
3. **Contracts drifting between UI and DB.** The custom-role enum mismatch and
   the impersonation-token handoff are the same failure — two sides authored
   separately, with a cast (`as any`) or an implicit convention (`?token`)
   papering over the mismatch instead of a shared, checked contract.

---

## Recommended order of work (by blast radius, not count)

1. **Approval workflow (#5)** — add the create path (and step generation).
   Approvals gate money and access; an inert approval queue is a governance
   hole, not just a missing screen.
2. **Custom role creation (#4)** — reconcile the UI action set with the
   `permission_action` enum (or expand the enum) and remove the `as any` cast.
   Blocks all real RBAC customization.
3. **Goods receipt (#1)** — add a record-GRN path so the advertised 3-way match
   actually engages; today every invoice quietly falls back to 2-way.
4. **Response SLA (#2)** — set `slaRespondedAt` on first response so
   response-SLA reporting stops being uniformly wrong.
5. **Invoice line items (#8) + India challans (#7)** — move the inserts out of
   tests into real create paths; these silently break GST and statutory
   reporting for real data.
6. **Impersonation (#3)** — make the web client consume the `?token` handoff (or
   change the handoff to a session cookie).
7. **Depreciation (#6), SLA policies (#9), GRC controls/findings (#10),
   workflow step-runs (#11), DPDP consent expiry (#12)** — wire a UI/create path
   to each; lower urgency but each is a complete-looking feature no user can
   reach.

*No source files were modified by this sweep.*
