# PLAN — 02

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here. `docs/PLAN-01.md` holds this project's earlier run log and
is history — its "done" claims were true when written and are not re-verified here.

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **Hard cap 500 lines.** At the cap create `docs/PLAN-03.md`, carry CURRENT STATE +
  THE QUEUE forward, leave the RUN LOG behind, and put a pointer at the top of the
  retired file.
- **Numbering is zero-padded two digits so a plain `sort` finds the newest.** Roman
  numerals do not sort — `IX` collates before `V`.
- **A new session finds this file by rule, not by name:**
  `ls docs/PLAN-*.md | sort | tail -1`. `CLAUDE.md` carries that rule, so it never
  needs editing when the plan rolls over.

## Standing directive from the owner (2026-08-21)

> "Nothing left to hide — everything needs to be wired the right way."

Hiding a gap is not a fix. Feature-flagging a fabricated surface, commenting a nav
entry out, `testIgnore`-ing a failing spec and deleting a page are all quarantine,
not completion. Quarantine is allowed only as a temporary step with the wiring work
queued behind it, and the queue entry must exist before the quarantine lands.

The one exception, and it is not hiding: **do not ship a claim that is false.** A
matrix row that says `not_implemented` is reporting. One that says `implemented`
over an unwritable table is the thing this directive exists to stop.

---

# CURRENT STATE

_Verified 2026-08-22. Every line was established by running something; where it was
only read in code, it says so._

**Deployed:** `nexusops/api:bbe6331`, matching `origin/main`, API healthy. "Live"
means the terminal `Deploy to Vultr` job of the latest main run — not CI success
alone.

**Gates, all run on `bbe6331`:** `pnpm build` 11/11 · `pnpm lint:cold` 9/9 with
`Cached: 0` · **full api suite 2,085 passed / 0 failed (234 files)** · CI E2E 135
passed.

**Test-suite contention is real on this machine.** A full api run with foreign API
processes on :3011/:3021 attached to 5433 produced 4 unrelated failures
(ap-ar-reconciliation, crm-management-view, payroll-approval-chain, mfa); all four
passed in isolation and the whole suite passed clean on re-run. Each foreign API runs
20 in-process BullMQ workers that mutate the shared test database. **A code defect
fails the same tests twice — random sets are contention.**

**`tsx watch` is unusable here.** It served stale code through several restarts and
never picked up router changes. Run plain `tsx` and restart after editing a router.

**Databases:** dev `localhost:5434`, test `localhost:5433`. Different data. State the
port beside every number.

**Two environment traps:**

- **Redis** — a native Homebrew Redis on 6379 wins over the container. The API talks
  to the native one; the container has 0 keys. It is shared with another project.
- **Workers** — the API starts 20 BullMQ workers in-process. Stopping `apps/worker`
  stops Temporal only.

**E2E isolation:** `reuseExistingServer: !CI` latches onto the dev servers on
3000/3001, which point at **5434 (DEV)**. `next dev` refuses a second instance. The
web app proxies `/api/trpc` via `API_INTERNAL_URL`, defaulting to `:3001` — the DEV
API. An isolated run needs built servers on spare ports **and** `API_INTERNAL_URL`
overridden.

**`docs/CONTEXT.md` and `reports/fix-plan.md` are stale.** fix-plan.md line 183 claims
`EFFECTIVE-DATE-DEFAULT` is fixed; the rule was, the timezone was not, and that took
until 2026-08-22 to find. Do not plan from either.

---

# THE QUEUE — in priority order

Ordering: **promises already broken** first, then **things that destroy data on a
timer**, then **dead surfaces**, then **honesty of claims**, then **test health**.

### 1. ~~Nine round-trip failures~~ — CLOSED 2026-08-22, no defect

All nine verified by hand through the browser against 5434/DEV: a record was
created on each screen and the **persisted row** read back in SQL. **All nine work.**
vendors 40→41 · contracts (5-step wizard, all fields correct) · settings/api-keys
(name survives reload) · procurement PR-0041 + line item · surveys 6→7 ·
legal 30→31 · sam · work-orders/parts · flows. Records reverted by explicit key.

The harness fails on three shapes, and the nine were all one of them: **format-
validated fields** (GSTIN/PAN/CSAT/number inputs reject a text token), **multi-step
wizards** (one click and one submit never reaches step 5), and **no text field at
all** (flows is a canvas designer). The 14 that passed are single-step free-text
forms. Nothing here needed fixing — do not size work off sweep47 counts.

### 2. ~~Payroll effective date~~ — FIXED 2026-08-22 (`5ff4375`)

`toISOString()` renders UTC while `new Date(y,m,d)` is LOCAL midnight, so east of
UTC they disagree by a day. `firstOfCurrentMonth()` returned the last day of the
PREVIOUS month (IST: 2026-07-31 for August). Fixed with `format(...,"yyyy-MM-dd")`.
Same class fixed in `hr/expenses` where the claim form pre-filled YESTERDAY before
05:30 IST.

Proved under both zones and verified in a running IST browser (form now defaults to
2026-08-01). Blast radius swept — 19 `toISOString().slice(0,10)` sites; the rest are
sound (filenames, round-trips of already-UTC stored values, and the finance period
boundaries, which use `Date.UTC()` deliberately). **Server-side sites are safe only
because the container runs UTC — they would shift if `TZ` were ever set.**

### 3. ~~`documentRetentionPolicies`~~ — DONE 2026-08-22 (`d44a400`)

Added `documents.retention` (list/create/update/remove/assign) and an admin screen
at `/app/settings/retention`. The 90-day default is now stated on the page — it was
unreachable and unstated before. `durationDays` has a floor of 1 (a 0-day policy
would erase a document the moment it was deleted). `remove` reports how many
documents it reverted and to what, because `retention_policy_id` is ON DELETE SET
NULL and the default may be SHORTER than the policy removed.

**Carried finding — the sweeper is not org-scoped.** It joins documents → policies
with no org predicate and the FK does not constrain same-org, so a document holding
another tenant's policy id would inherit that tenant's duration and legal hold.
`assign` now validates org, which closes the only reachable way in. The join itself
is still unguarded — worth an org predicate on the sweeper, and worth checking
whether other background sweepers share the shape.

### 4. Approvals — wired end to end; two pieces left

**Done:** `raise` + chains (`61a0af9`) · `decide` advances the chain (`3b5415b`) ·
chains admin screen + `eligibleApprovers` (`d14ad04`) · **procurement raises**
(`425b3e6`) · chain editing + atomic raise (`e74b69f`).

A requisition over the tier now creates a real approval request, routed through the
chain, visible in the approver's queue, advancing approver by approver.

**Correction to an earlier finding (item 12):** the auto-`approved` on a new
requisition is NOT a missing gate. `determineApproval` implements configured tiers —
auto below 75,000, dept_head below 750,000, vp_finance above. The defect was only
ever the un-routed `pending` case, which is now fixed.

**Remaining:**

1. **Other callers** — contracts, expense claims, change requests, leave. Each is its
   own reviewable change. `lib/raise-approval.ts` is the one write site; call it and
   the org check, approve-permission check and idempotency come with it.
2. **Parallel chains.** `sequential: false` is not honoured — the request does not
   record which chain produced it, so the mode is unknown at decision time. Needs a
   column on the request.

**Two conventions this work established, neither pre-existing:**

- `purchase_request:<prId>` is the only SERVER-generated idempotency key in the
  codebase; every other comes from the caller.
- The raise is resolved read-only BEFORE the transaction and written INSIDE it, so a
  configuration gap (no chain) and a real database failure are not caught
  identically. Precedent: the codebase uses non-fatal-after for notifications and
  workflow enqueues, but puts the PO accrual journal inside the transaction. An
  approval is a control, not a notification.

### 4b. Four approval chains route to nobody — OWNER DECISION

`change_request`, `contract`, `expense_claim`, `purchase_request` sit in the dev
database marked **active** with `rules: []`. No migration or seed inserts them; like
the other unexplained rows they were put there by hand.

**Fixed:** they no longer LOOK configured. Each row shows "No approvers — nothing can
be raised" and a banner names all four. `create` requires at least one approver, so
no new chain can be hollow.

**Deliberately NOT fixed:** they are neither populated nor deleted.

- *Not populated* — the only auto-default is "route to the org owner", and an approval
  routing nobody chose is a compliance liability. "The system picked someone" is a
  worse answer to an auditor than "there was no control."
- *Not deleted* — I decided to delete them, then reversed it. As rows flagged red on
  the page an admin already lands on, they are a visible backlog of four missing
  controls. An empty list reads as "nothing needed here", which is false. The
  suggested entity types live inside the create dialog, so they cannot prompt anyone
  who has not already decided to act.

**What would change the answer:** if those four are demo decoration rather than real
intent, deleting them is right and the empty state becomes honest. Nothing in the repo
records which they are.

### 5. `workflowStepRuns` — a documented contract nobody implements

`apps/api/src/workflows/actions/runtime.ts:14` says the caller "is responsible for
persisting step results into `workflow_step_runs`". No caller does, so the workflow
run-detail screen returns an empty step list forever. Small; completes a contract
that already exists in writing.

### 6. GRC create paths

`grc.ts` has `addControlEvidence` (line 200) and `listControls` (151) but **no
`createControl` and no `createFinding`**. Evidence can be attached to a control that
cannot be created.

`risk_controls` (40 rows) and `audit_findings` (30 rows) on dev came from **outside
the repo** — no writer exists anywhere, including seeds and migrations. Those rows
make the GRC workbench look healthy on data no tenant can produce.

### 7. Remaining config with no admin surface

`slaPolicies` · `leaveExitRules` · `ticketCategories` · `ticketPriorities` ·
`professionalTaxSlabs`

Schema treats these as tenant-configurable; the product treats them as fixed.
`slaPolicies` and `leaveExitRules` degrade to a silent hardcoded default, which is
worse than an empty panel because nothing tells anyone the setting is unreachable.

### 8. The compliance matrix claims fourteen falsehoods

`apps/api/src/routers/legal.ts` seeds 24 rows with `status: "implemented"` as a
hardcoded literal, `onConflictDoNothing`, never updated — so the first read freezes
the claim permanently. **14 of the 24 cite tables with no write path**: statutory
registers, XBRL, FEMA, CCI, LODOR, shareholder grievances and voting, director
disclosures, clause templates, MSME, e-sign events, whistleblower, sector licences,
legal hold.

No screen renders it today, which is the only reason this is not already a problem.
It is one page away from being one.

**Two-part fix.** Short term, the status must stop asserting what is not true —
derive it, or seed `not_implemented`. Long term, Tier 3 below.

### 9. Test-suite fragility — 47 fragile sites

`textContent("body")` at **47 sites across 24 e2e files** samples the DOM before the
auth bootstrap resolves; the guard renders "Verifying session…" until `auth.me`
returns. Two were fixed in `rbac.spec.ts` because they blocked a deploy. 45 remain
and any can flake the same way. Mechanical conversion to web-first assertions.

### 10. Quarantines to lift — each needs its wiring done first

Under the standing directive these are debts, not decisions:

- **sweep47 `testIgnore`** in `playwright.config.ts` — lift when the suite is green.
  Note the specs are *investigative harnesses*: a failure is a candidate, not a
  defect. Naming files on the CLI does not defeat `testIgnore`.
- **Security & Compliance sidebar group** is commented out in `sidebar-config.ts`,
  which is what makes `/app/flows` URL-only and `/app/approvals` ⌘K-only. Restore it
  once item 4 lands.

### Tier 3 — the statutory fourteen (months, sequenced separately)

Statutory registers, XBRL, FEMA/RBI returns, CCI combinations, LODOR calendar,
shareholder grievances and voting, director disclosures, clause templates, MSME
tracker, e-sign events, whistleblower settings, sector licences, legal hold.

Not wiring. Each carries real regulatory semantics — filing formats, deadlines,
statutory content. Sequence per obligation, not as a batch.

### 11. A worker errors on every CI E2E run and nothing notices

`[workflow:webhook] Job repeat:… failed: relation "webhook_deliveries" does not exist`
appears in the E2E job of run `32504364037`. The run passed, so nobody sees it.

The table is not missing: it is in `schema/integrations.ts`, in migration `0000`,
written by `webhookDispatchWorkflow.ts:107`, and present on dev (5434). The job id
is `repeat:…` — a BullMQ **repeatable** definition persisted in Redis, firing against
a database that no longer matches the one it was scheduled against.

Two things to establish: whether repeatable job definitions outlive a test-DB reset
(and therefore whether this is CI-only), and whether the same can happen in
production where Redis persists across deploys. **READ IN CODE ONLY** — not
reproduced.

### 12. Two observations from the round-trip verification

- ~~**A new requisition is created with `status = "approved"`.**~~ **WITHDRAWN —
  this was never a defect.** `determineApproval` implements configured tiers: auto
  below 75,000, dept_head below 750,000, vp_finance above. PR-0041 used 1,000, so it
  auto-approved as designed. I recorded working behaviour as a fault. The real defect
  was only ever the un-routed `pending` case, fixed in item 4.
- **Contract templates display "0 clauses · 8 required"** on the picker, yet step 4 of
  the wizard renders the clauses fine. So the clause text comes from the frontend, not
  from `contract_clause_templates` (no write path). The count and the content
  disagree; one of them is lying.

### 13. `documents.retention` ships with no automated tests

The retention CRUD and admin screen (item 3, `d44a400`) have **zero** test coverage —
2,085 api tests pass and not one touches `documents.retention`. Every path was
verified by hand (create, duplicate-name CONFLICT, zero-day BAD_REQUEST, cross-org
assign refused, delete reporting its revert count, a policy created through the UI
landing in 5434/DEV), but nothing guards it from here.

It governs permanent document deletion, so it is a poor thing to leave unguarded.

### Open product decision — ESG

`/app/esg` was deleted (`0798c7c`): 169 lines, zero API calls, every figure a
hardcoded literal including "Data Breaches: 0 — 12 months clean", behind a flag one
env var from publishing fabricated sustainability figures. Removing a lie is not
hiding, so the deletion stands.

But there is **no ESG router, schema or write path anywhere**. Wiring it properly
means designing an ESG data model from scratch. That is a product decision, not a
gap-fix, and it is not in the queue until someone makes it.

---

# RUN LOG

_Newest first. One entry per run, including runs that changed nothing._

## 2026-08-22 — run 7 (document audit + rollover)

Audited the plan against reality rather than assuming it was current. Three faults
found in my own file:

1. **CURRENT STATE was dated 2026-08-21** and still quoted run-1 gate figures.
2. **Item 12 asserted a finding I had already withdrawn** — that a new requisition
   auto-approving meant no approval gate exists. It is a configured tier. The
   correction sat in item 4 while item 12 still stated the error, so a reader
   starting at 12 would be misled. This is the same failure mode I criticised
   `reports/fix-plan.md` for.
3. **`documents.retention` shipping untested was recorded nowhere** — now item 13.

All seven "DONE" SHAs were verified to exist rather than trusted.

Rolled over to `PLAN-02` at the cap. `CLAUDE.md` needed no edit — it finds the file
by rule.

**Deployed this run:** `bbe6331` — approvals wired end to end, green through
`Deploy to Vultr`.

**Next:** wire the remaining approval callers (contracts, expense claims, change
requests, leave), or close item 13 by testing retention.
