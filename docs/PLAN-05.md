# PLAN — 05

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here. `docs/PLAN-01.md` … `PLAN-04.md` hold the earlier run logs
and are history — their "done" claims were true when written and are not
re-verified here.

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **A queue item that wires a PRODUCER must name its CONSUMER and how the loop was
  verified.** "Raises an approval" is not a deliverable; "the requisition moves when
  approved" is. Item 4 shipped as "wired end to end" having verified the chain only
  as far as the approver's queue — see its own entry for what that cost.
- **Hard cap 500 lines.** At the cap create `docs/PLAN-06.md`, carry CURRENT STATE +
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

> **TREAT ITEMS 6-13 AS UNVERIFIED.** On 2026-08-23 three consecutive items were
> examined before building and all three were wrong: item 4 (three of its four
> callers already had working approval), item 5 (the contract it called
> unimplemented was implemented), and this plan's own run-11 claim that
> `apps/worker` had no database access. All were written by the same process —
> scoped from a subsystem's edge, asserting a gap a wider read disproves.
> **Verify an item against the repo before scoping work from it.** The rule in
> HOW THIS FILE WORKS exists because of these three.

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

### 0g. `apps/worker` — swept and FIXED 2026-08-23 (`8db6e51`)

**Run 11 of this plan said apps/worker has no database access. That was wrong**
and the error was mine: `index.ts:10` creates a `pg` Pool and injects it; I read
`workflow-activities.ts`, saw `import type { Pool }`, and never opened `index.ts`.

It connects as the app DB user — `rolsuper` and `rolbypassrls` — so RLS
constrains nothing and, unlike `apps/api`, there is no second wall. Of 14
statements: 7 keyed on internally-generated run/step ids on tables with no
`org_id`; the `notifications` INSERT stamped `org_id` but never validated the
recipient; and **both `tickets` UPDATEs received `orgId` and discarded it** via
the `{ orgId: _orgId }` convention, with no org predicate.

Fixed: org predicates on both updates, and recipient / assignee / team ids
resolved against the org via a local `belongsToOrg` helper — the same rule as
`lib/assert-same-org.ts`, re-expressed because that one is built on Drizzle
tables and this worker speaks raw SQL. **Keep the two in step.**

**Reachability, stated precisely:** the ticket writes are guarded by
`if (ticketId)`; `context` is `{...triggerData}`; the only Temporal start site
passes `{ triggeredBy: "publish" }` with no ticketId, and `workflows.test` is a
dry run. So those two were one `triggerData` field from live, in activities
called "assign ticket" and "update ticket field". The notification path had no
such guard and was live. READ IN CODE ONLY — zero workflows exist on 5434/DEV.

### 0h. Layer survey — see `docs/WIRING-01.md`

The product was walked bottom-up on 2026-08-23: data → write paths → read paths →
screens → workbenches → command centre. **Two genuine breaks, both at Layer 2**
(GRC controls/findings cannot be created; document permissions written and never
read), plus two command-centre faults that are **inherited from Layer 1 and Layer
4** and must not be fixed at the top. Full plan, evidence and sequencing live in
`docs/WIRING-01.md`. Layer 5 (12 workbenches) was counted, not opened.

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

### 4. Approvals — THE ITEM AS PREVIOUSLY WRITTEN WAS WRONG. Do not build it.

**Superseded 2026-08-23 (run 14).** This item used to read "wired end to end; two
pieces left" and told the next session to wire contracts, expense claims, change
requests and leave to `raiseApproval`. **Building that would have made the product
worse.** What follows replaces it.

**There are TWO parallel approval systems.** Swept all 20 decision-shaped procedures
and listed what each writes:

- **Module-local, and it WORKS** — each transitions its own record:
  `changes.approve`/`reject` (:337/:408) → `changeApprovals` + `changeRequests` ·
  `hr.leave.approve`/`reject` (:1034/:1118) → `leaveRequests` + `leaveBalances` +
  `attendanceRecords` · `hr.expenses.approve` (:2715) → `expenseClaims` ·
  `payroll.approve` (:745) → `payrollRuns` · `procurement.approve`/`reject`
  (:382/:432) → `purchaseRequests`.
- **Generic, and it transitions NOTHING** — `approvals.decide` (:374) writes only
  `approvalRequests` and `approvalSteps`. Every write inside it was enumerated.

**Three of the four callers the old item named ALREADY approve correctly.** Wiring
them would add a competing path beside a working one — the deprecated-twins defect
at architectural scale. Only **contracts** genuinely lacks any approval verb.

**A divergence already exists in production.** `procurement` is wired to both and
they share no state: `procurement.approve` sets `purchase_requests.status` and never
reads `approval_requests`. A requisition can therefore be approved in one system
while the other still reads pending. READ IN CODE ONLY — the write sets do not
overlap, so there is no mechanism by which they could agree.

**THE OWNER DECISION THAT GATES ALL OF IT.** Is the generic subsystem meant to
*replace* the module-local approvals — one approvals inbox across the product — or
is it a *reporting layer* over them? The two answers produce opposite code. If it is
a replacement, the module-local approves are what to retire. If it is a reporting
layer, `decide` should not have a decision UI at all. **Do not write approval code
until this is answered.**

**The two real items underneath, once it is:**

1. **Contracts has no approval mechanism.** It has a state machine
   (`draft → under_review → legal_review → awaiting_signature → active`) and a
   `submitForReview` boolean on create (`:106`, `:135`) that sets `under_review`,
   and nothing drives it further. This is the one genuine gap, and it is clean.
2. **Procurement's double-wiring** — the divergence above. Whatever the answer to
   the architecture question, the two systems must stop being able to disagree.

**Why the old item was wrong, kept because the failure is instructive.** The work
was scoped from the subsystem outward — "who should call `raiseApproval`?" — rather
than from the domain inward — "how does approval work in this product today?". The
first question has an obvious four-item answer; the second has a completely
different one. The old item also never asked what happens AFTER a decision; it was
entirely about the raise side. Its own wording contained the tell: "creates a real
approval request, routed through the chain, visible in the approver's queue,
advancing approver by approver" — every clause true, and the sentence stops exactly
where the gap begins. "End to end" was defined as the subsystem's edge rather than
the user's outcome. The run-7 audit passed this item by checking that the SHAs
existed and the raise path worked.

**Also parked, unrelated to the architecture question:** `sequential: false` on a
chain is not honoured — the request does not record which chain produced it, so the
mode is unknown at decision time. Needs a column.


### 4b. Four approval chains route to nobody — OWNER DECISION

**Downstream of item 4's architecture question.** Deciding who approves matters
only once it is settled which system does the approving.

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

### 5. ~~`workflowStepRuns`~~ — WITHDRAWN 2026-08-23. The contract IS implemented.

This item claimed "no caller persists step results, so the run-detail screen
returns an empty step list forever". **False.**
`apps/worker/src/activities/workflow-activities.ts` upserts `workflow_step_runs`
on `(run_id, node_id)` with attempt counting, and completes the parent run. The
screen is empty on 5434/DEV because **there are zero workflows**, not because
nothing writes steps.

The item was written from `runtime.ts:14`, whose comment is conditional — "if
invoked from a Temporal activity" — and out of date: it names two consumers, and
there are four. Nobody checked whether the condition was ever met, or opened the
worker that meets it.

**What the read did find is now its own item — see 0g.**


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

## 2026-08-23 — run 15 (item 5 withdrawn, apps/worker swept and fixed)

Picked up item 5 as the next buildable item, applied the rule added in run 14 —
establish how it works in the product today before scoping — and the item
collapsed within minutes. **Third consecutive queue item found wrong.**

**Item 5 was false.** `workflow-activities.ts` upserts `workflow_step_runs` on
`(run_id, node_id)` with attempt counting and completes the parent run. The
run-detail screen is empty because there are zero workflows on 5434/DEV, not
because nothing writes steps. The item had been written from a comment at
`runtime.ts:14` that is conditional ("if invoked from a Temporal activity") and
out of date — it names two consumers where there are four.

**The read found a real defect instead, and it was mine.** Run 11 recorded that
`apps/worker` has no database access. `index.ts:10` creates a `pg` Pool. I had
read the activities file, seen `import type { Pool }`, concluded type-only, and
never opened `index.ts`. The surface I declared clean is the one place where RLS
is off AND the SQL is hand-written. Fixed in `8db6e51` — see item 0g.

**The pattern across runs 14 and 15.** Both items were scoped from a subsystem
outward — "who should call this?", "who implements this contract?" — rather than
from the domain inward. Both had an obvious answer to the narrow question and a
different answer to the real one. Both were caught in under ten minutes by a
read that should have happened when the item was written. Items 6-13 came from
the same process and now carry a warning at the top of the queue.

**Rolled over to PLAN-05** — PLAN-04 would have exceeded the 500-line cap.
CURRENT STATE and THE QUEUE carried forward, run log for runs 12-14 left behind.

**Unpushed and accumulating: 5 commits.** `7c47cb2` scan + CI gate, `17d1ea8`
PLAN-04, `a200248` item 4 correction, `8db6e51` worker fix, plus this. The
worker fix is the only one with product code, and it closes a live cross-tenant
write, so it is the one worth pushing soon.

**Next:** nothing in the queue is verified enough to build from. Either verify
item 6 (GRC create paths) the way 4 and 5 were verified, or answer item 4's
architecture question. Do not scope from an unverified item.
