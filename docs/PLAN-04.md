# PLAN — 04

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here. `docs/PLAN-01.md` … `PLAN-03.md` hold the earlier run logs
and are history — their "done" claims were true when written and are not
re-verified here.

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **Hard cap 500 lines.** At the cap create `docs/PLAN-05.md`, carry CURRENT STATE +
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

_Verified 2026-08-23. Every line was established by running something; where it was
only read in code, it says so._

**Deployed:** `nexusops/api:dce6ff4`, matching `origin/main`. All five CI jobs green
through `Deploy to Vultr` (run `32620419601`); `/api/health` returns
`version: dce6ff45b905b58…`. "Live" means the terminal Deploy job, not CI success.

**One commit is local and unpushed:** `7c47cb2` — the cross-tenant FK scan and its
CI gate. No product code; not urgent; pushing it deploys.

**Gates on `dce6ff4`:** `pnpm build` 11/11 (`Cached: 8`) · `pnpm lint` in apps/api
(`tsc --noEmit`, **strict:true** inherited from `packages/config`) · full CI green
including E2E. **`apps/web/tsconfig.lint.json` sets `strict:false` and
`strictNullChecks:false`** — say which gate you ran; the api gate is the strict one.

**The isolation model, established by experiment, not by reading:**

- The app DB role is `rolsuper` **and** `rolbypassrls`. RLS therefore bites **only**
  where `rlsTenant` (`lib/trpc.ts`) drops to `app_runtime`. Verified on 5434.
- **198 of 238 tables carry `org_id`, and all 198 are ENABLEd, FORCEd and policied.**
  Migration text and live catalog agree. The other **40 have no RLS at all**.
- **RLS genuinely blocks a cross-tenant read** when the app filter is removed —
  proven by negative control on 5433. On a no-`org_id` table it does nothing,
  proven the same way.
- **RLS is structurally blind to the write class.** A row stamped with the caller's
  own `org_id` pointing at another tenant's parent is RLS-legal. Adding `org_id` to
  the 40 would not have stopped one of them. **The 40-table `org_id` project is
  therefore NOT queued** — the owner ruled on this evidence.
- `rlsTenant`'s `if (!orgId) return next()` fail-open is **unreachable**:
  `enforceAuth` sits above it and assigns `orgId` from a non-nullable key.
- **None of the 21 workflows, 32 Fastify routes or 20 BullMQ workers enters
  `rlsTenant`** — on those paths app filters are the only wall, on all 238 tables.
  Their filters hold: 29 unguarded statements, all keyed on their own primary key.

**Test-suite contention is real.** Foreign APIs on :3011/:3021 attached to 5433
produce diffuse unrelated failures. A code defect fails the same tests twice; random
sets are contention. **The full api suite cannot be run in one process here** — two
backgrounded runs were reaped at ~7%. Use `--shard=n/4` in the foreground.

**`tsx watch` is unusable here.** Run plain `tsx`; restart after editing a router.

**Databases:** dev `localhost:5434` (1 organisation), test `localhost:5433` (~3,330
orgs of accumulated exhaust). State the port beside every number.

**`docs/CONTEXT.md` and `reports/fix-plan.md` are stale.** Do not plan from either.

---

# THE QUEUE — in priority order

Ordering: **cross-tenant writes** first, then **promises already broken**, then
**things that destroy data on a timer**, then **dead surfaces**, then **honesty of
claims**, then **test health**.

Items 1, 2, 3 are closed — see `PLAN-02.md` / `PLAN-03.md` run logs.

### 0. Tenant isolation — the API write and read paths are CLOSED

**Fixed and deployed (`f025a48`, `af8f8ec`, `dce6ff4`).** Every fix was proven by a
test seen to fail first, then pass.

- **5 cross-tenant READS** — `projects.getAgileBoard` (proven leaking live, 360 rows
  on 5434), `workflows.runs.get`, `workflows.runs.list`, `assets.impactAnalysis`,
  `knowledge.recordFeedback`. All four unproven ones were later **proven to leak**
  by seeding rows on 5433 and reading as org B.
- **The WRITE class** — 134 FK-shaped insert sites taking a caller-supplied id; 47
  unguarded, 35 FK-backed. Now 120 verified; the 2 still reported are confirmed
  false positives (`accounting.createStatement` guards via a dynamically imported
  table; `hr.clockIn` is covered by the helper below).
- **`assertSelfOrPermitted` returned before checking tenancy.** Holding a grant
  authorised the ACTION and never validated the TARGET's org, so an HR/payroll/
  finance user could act on another tenant's employee and the settlement, accrual
  or attendance row was written under their own org. **Tenancy now checked before
  privilege — one change, 10 call sites.**
- `settlement.settle` needed a separate check: CLAUDE.md's standing decision is that
  it deliberately omits that helper (settling must not be self-service), and the
  omission removed its only tenancy check too.

**ONE HELPER, `lib/assert-same-org.ts`.** It guards the **parent**, which always has
`org_id` — never the unprotected child. All 24 tables passed to it carry `org_id`.

**`approvals.raise` is NOT a gap** — verified by running it. The guard is in
`lib/raise-approval.ts`, not the router: approvers are looked up scoped by
`users.orgId` and a miss throws BAD_REQUEST.

**`employees.managerId` is `uuid("manager_id")` with no `.references()`** — an
unconstrained column, not a user FK. Nothing enforces it points anywhere.

### 0b. Has it already happened? — RUN THE SCAN AGAINST PRODUCTION

The write class was live until 2026-08-23. `scripts/check-cross-tenant-fks.mjs`
(`pnpm check:cross-tenant`) answers whether damage exists. **Read-only by
construction** (`BEGIN TRANSACTION READ ONLY`); a replica or restored dump is fine;
under a second on both local databases.

**5434/DEV finds zero and SAYS that is expected with one tenant.** That is not a
clean bill of health. **This is the highest-value open item** — if it finds rows,
remediation outranks everything below. Do not delete found rows: the row's `org_id`
is the acting tenant, not necessarily the owner.

### 0c. Isolation surfaces never swept

`apps/web` client-side guards and **nested sub-routers** — CLAUDE.md notes the RBAC
map does not cover nested sub-routers either. Same instruments as run 12.

### 0d. `document_acls` is written and read NOWHERE

`grantAcl` writes it; nothing in the codebase reads it. Document ACLs are unenforced
product-wide. Scoping the write did **not** make the feature real, and the call site
says so. Building enforcement is a product decision, not a bug fix.

### 0e. Ten unchecked-lookup sites, untriaged

The `?.`-aware detector still reports 10 — counts and update-returning results, a
different and pre-existing class from the two fixed in `af8f8ec`. Not yet read.

### 0f. `INTERNAL_API_TOKEN` is unset in production

`/api/internal/*` is publicly routed (401, not 404), defended only by a source-IP
allowlist trusting any `10.x`/`172.x`. `POST /api/internal/dpdp/sweep` enumerates
every organisation. **The production caller is a `curlimages/curl` container in
`docker-compose.vultr-test.yml` that sends no token header** — not the Temporal
worker, which is not deployed. Setting the var on the API alone 401s the sweeps and
they fail silently. Needs: the var on the api service, `INTERNAL_API_TOKEN` added to
the `dpdp-sweeper` environment, and `-H "x-internal-token: $$INTERNAL_API_TOKEN"`
added to its curl. Proof it is live: the 401 body changes from "set
INTERNAL_API_TOKEN env var for remote access" to "Valid X-Internal-Token header
required".

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

## 2026-08-23 — run 13 (user-reference gap, and the scan committed)

**The owner's clone was stale (20 August, one commit deep), which explains two
wrong reports today** — "assert-same-org.ts does not exist" and a set of line
numbers predating `a7c0992`. Naming was secondary. **Treat any `file:line` quoted
from outside this tree as needing confirmation.**

**The FK-count gap reconciled.** 506 single-column FK constraints on 5434; 197 point
at `organizations` (matches), 309 do not. Of those, **246 have `org_id` on both
sides — the run-12 scan — and 63 have a child with no `org_id`**, which that scan
excluded by construction because it compared `c.org_id <> p.org_id` and a child
without the column has nothing to compare. 135 point at `users` (matches).

**Eight user-reference sites checked: zero unguarded.** Six were already fixed in
run 12; `approvals.raise` is guarded inside `lib/raise-approval.ts` (**verified by
running it** — org B was refused with "Approver(s) not found in this organisation");
`employees.managerId` has no `.references()` and is not a user FK at all.

**Committed the scan (`7c47cb2`, unpushed).** `scripts/check-cross-tenant-fks.mjs`,
`pnpm check:cross-tenant`, wired into the CI test job.

**A design correction worth keeping:** a no-`org_id` child with a SINGLE parent
cannot express a cross-tenant row — nothing on the row disagrees. The real second
shape is a child with TWO OR MORE parents resolving to different orgs
(`ci_relationships`, `team_members`, `document_acls`, `license_assignments`). The
scan reports 246 direct / 19 bridge tables / 17 skipped-and-said-so.

**Validated in both directions.** 5434: control 44,149, zero findings, exit 0, and
the output states zero is expected with one tenant. 5433 with a cross-tenant invoice
planted by hand: found it, named `invoices.vendor_id -> vendors`, printed both org
ids, **exit 1** (verified explicitly — CI depends on it). Probe rows removed.

**NOT VERIFIED:** production has not been scanned. `apps/web`, nested sub-routers,
`document_acls` and the 10 unchecked-lookup sites untouched, by instruction.

## 2026-08-23 — run 12 (isolation audit round 2, and the fixes, deployed)

**A proven cross-tenant read leak was live** — `getAgileBoard` returned another
tenant's task board. Deployed `dce6ff4` closes it; all five CI jobs green.

**Three faults in my own instruments, each caught by sanity-checking:**

1. The `?.`-aware detector counted `x?.y` as a guard. Optional chaining is not a
   guard — it is how the code silently tolerates the missing row. Caught by testing
   it against `a7c0992^`, where it returned zero on a defect known to be there.
   Correcting it found **two more instances** the previous night's fix had missed.
2. The write-sweep regex had `\.?` before `\.values`, consuming the dot and demanding
   a second. It matched 3 of 11 inserts in one file.
3. An `mv` on its own line rather than chained with `&&` moved an empty file over the
   sweep script and destroyed it. Verify the artifact, not the exit code.

**Corrections to my own earlier claims:** `admin.list` was reported as a leak and is
not — its return filters against RLS-scoped roles, so nothing foreign was exposed.
The read-leak class was 5, not the 8 proposed: `work-orders.updateTask` and `csm.get`
are covered by RLS, and `addNote` was already fixed.

**The evidence that settled the 40-table question.** Every table in the
`assertSelfOrPermitted` group already has `org_id`, and the write leak works
*because* it does — the row is legitimately the caller's. `org_id` + RLS defends
reads and is structurally blind to this class. The owner ruled: do not add it.

**Next:** run 0b (production scan) before committing to a build; then the approvals
callers — contracts, expense claims, change requests, leave.
