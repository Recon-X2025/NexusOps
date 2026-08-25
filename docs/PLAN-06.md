# PLAN — 06

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here. `docs/PLAN-01.md` … `PLAN-05.md` hold the earlier run logs
and are history — their "done" claims were true when written and are not
re-verified here. **The run log for runs 12–17 stays in `PLAN-05.md`.**

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **A queue item that wires a PRODUCER must name its CONSUMER and how the loop was
  verified.** "Raises an approval" is not a deliverable; "the requisition moves when
  approved" is. (PLAN-05 item 4 shipped as "wired end to end" having verified the
  chain only as far as the approver's queue — see its own entry there for what that
  cost.)
- **Hard cap 500 lines.** At the cap create `docs/PLAN-07.md`, carry CURRENT STATE +
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

_Deploy facts verified 2026-08-25 against the repo (`git log`, `gh run list`). The
isolation model below was established by experiment on 2026-08-23 and is carried
forward unchanged; where a line was only read in code, it says so._

**Deployed:** `origin/main` = `bed0c79` (`fix(auth): updateUserRole must enforce
role hierarchy and block self-targeting`). The last `main` CI run `32732795785`
completed **success** through `Deploy to Vultr` (2026-08-24, 48m). "Live" means the
terminal Deploy job, not CI success. Confirm with
`gh run view <id> --json jobs` before trusting any newer claim.

**Ten commits are local and unpushed** — 7 HIGH product fixes + 3 docs. They are the
next batch push; **the owner has cleared #15 to ship** (see QUEUE §A.1). A push to
`main` deploys and needs a Vultr snapshot first (Claude cannot take one).

**Gates last run (run 16, on the BLOCKER+HIGH set):** `pnpm build` 11/11; full api
suite **2177 pass**; `pnpm lint:cold` **9/9, Cached: 0**. The api gate is the strict
one — `apps/api` lint is `tsc --noEmit` with `strict:true` from `packages/config`;
`apps/web/tsconfig.lint.json` sets `strict:false` + `strictNullChecks:false`, so name
which gate you ran. **Re-run both build and lint:cold before the next push** — the HIGH
fixes landed after that gate run.

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

Two tiers. **§A is the active campaign** — the product-wide audit (runs 16–17) and
its owner-set sequencing; this is what the current sessions are working. **§B is the
standing backlog** carried from PLAN-05 (the isolation/wiring items 0–13) — real,
but behind §A until the owner re-prioritises.

## §A — ACTIVE CAMPAIGN (product-wide audit, runs 16–17)

Registers: `reports/audit-product-wide.md` (6 BLOCKER, 17 HIGH, 38 ranked) and
`reports/audit-dashboard-wiring.md` (1 BLOCKER, HIGH band). **All 6 BLOCKERs and all
14 HIGH are fixed + tested.** What remains is the push, the dashboard tier, test
debt, and the MEDIUM/LOW register.

### A.1 — The pending batch push (owner cleared #15 to SHIP)

Ten unpushed commits on local `main` (oldest→newest):

```
1d0c323 fix(tax): professional tax OLD-regime only (#7)
f38640d fix(offboarding): revoke INVITED leavers (#19)
d9e2076 fix(invoice-pdf): statutory invoiceDate not createdAt (#18)
2f7b80f fix(gst): auto-enqueue e-invoice IRN on receivable creation (#17)
fe334fc fix(rbac): custom-role CRUD+manage → runtime RbacActions (#15)  [owner: SHIP]
40ac6b2 fix(form16): engine-sourced deductions, not hardcoded 50k (#9)
b6bedc8 fix(leave): year-end close must not lapse comp-off (#14)
b200e55 docs(plan): run 17
05de718 docs(plan): dashboard wiring priority
8e10980 docs: session handover
```

**#15 (`fe334fc`, `apps/api/src/lib/rbac-db.ts`) widens live authorization** —
custom-role `create/update/manage` grants that were silently inert now map to
write/admin. Fail-safe (only honours explicit admin-set grants). **The owner has
decided to SHIP it** (2026-08-25); push the batch whole.

Push discipline (from CLAUDE.md): owner takes a **Vultr snapshot** first (Claude
cannot); `gh run list --branch main --limit 1` must show no run in flight; re-run
`pnpm build` **and** `pnpm lint:cold` (`Cached: 0`); ideally run the affected api
tests (auth, hr/leave, accounting, procurement, financial, rbac); then
`git push origin main` and watch the run reach the terminal **Deploy to Vultr** job.

### A.2 — Dashboard wiring H3–H8 (OWNER-SET PRIORITY — do first)

Full report: `reports/audit-dashboard-wiring.md`. Already fixed (run 16): aggregate-
truncation BLOCKER, flow-metric posture (H2), dead drill links (H1). **Open, in impact
order:**

- **H3** — "this period" health lights that are actually all-time totals (stuck red
  forever): `tickets.sla_compliance`, `coo.vendor_sla_breaches`,
  `financial.burn_rate`, `security.incidents_open_total`
  (`packages/metrics/src/contributions/*`). Window them to the period.
- **H4** — no sample-size floor: one row lights a confident "stressed" CEO alert
  (e.g. `csm.churn_rate_30d`). Add a minimum-N gate.
- **H5** — fabricated operational claims: PMO "status report overdue"
  (`services/workbench-payloads/pmo.ts`); service-desk on-shift roster = `members[0]`
  + `endsAt:null` (`service-desk.ts`).
- **H6** — both devops metrics `appearsIn: []` (`contributions/devops.ts`) → the
  deploy-failure alert can never fire. Give them an `appearsIn`.
- **H7** — Command Center serves finance figures (cash runway/burn/margin) to roles
  with `command_center:read` but no `financial:read` (`routers/command-center.ts` +
  payload). Owner policy call, then filter finance metrics or trim grants.
- **H8** — web failure/empty states read as "all clear": disabled query → infinite
  skeleton; workbench fetch error → "No data yet"; requester sees hub links then
  AccessDenied (`apps/web/src/app/app/command/page.tsx`,
  `components/dashboard/hub-command-center-page.tsx`, `components/workbench/**`).

Each: verify in source → fix → test (real Postgres **5433**, `pnpm docker:test:up`) →
`pnpm build` (metrics/`dist` is consumed compiled — rebuild after editing) → commit.
Batch-push at the end with the owner's go.

### A.3 — Test debt (fix + typecheck done; dedicated tests deferred)

- **#10** `journal.reverse` and **#11** lead-convert (`lib/crm/lead-convert.ts`) —
  the FOR UPDATE fix is in and typechecks, but their concurrency tests are missing.
  Add gated-race tests modeled on
  `apps/api/src/__tests__/concurrency-cluster.test.ts` (copy its `gateReadThenWrite`
  helper).

### A.4 — Remaining register (after the dashboard tier)

- Product-wide: **12 MEDIUM + 6 LOW** — `reports/audit-product-wide.md`.
- **Form 16 Part A via TRACES** (roadmap). Part B (employer computation) is done and
  correct; Part A is the TRACES download flow (`tdsChallanRecords`), still unbuilt.
  Code flags it P2 (`services/form16-pdf.ts`).

## §B — STANDING BACKLOG (carried from PLAN-05, behind §A)

Ordering within this tier: **cross-tenant writes** first, then **promises already
broken**, then **things that destroy data on a timer**, then **dead surfaces**, then
**honesty of claims**, then **test health**. PLAN-05 items 1, 2, 3 are closed (see
`PLAN-02.md` / `PLAN-03.md`).

> **TREAT §B ITEMS 6–13 AS UNVERIFIED.** On 2026-08-23 three consecutive items were
> examined before building and all three were wrong (PLAN-05 item 4: three of four
> callers already had working approval; item 5: the "unimplemented" contract was
> implemented; the run-11 claim that `apps/worker` had no DB access). All were
> scoped from a subsystem's edge, asserting a gap a wider read disproves.
> **Verify an item against the repo before scoping work from it.**

### 0. Tenant isolation — API write and read paths are CLOSED

Fixed and deployed (`f025a48`, `af8f8ec`, `dce6ff4`), each proven by a test seen to
fail then pass: 5 cross-tenant READS, the FK-shaped WRITE class (120 verified; the 2
still reported are confirmed false positives), and `assertSelfOrPermitted` now
checking tenancy before privilege (10 call sites). **One helper,
`lib/assert-same-org.ts`**, guards the parent (always has `org_id`). `settlement.settle`
carries its own check (it deliberately omits the self-or-permitted helper).
`approvals.raise` is NOT a gap (guard in `lib/raise-approval.ts`).
`employees.managerId` is an unconstrained `uuid`, not a user FK.

### 0b. Has the write class already caused damage? — RUN THE SCAN

`scripts/check-cross-tenant-fks.mjs` (`pnpm check:cross-tenant`) — read-only
(`BEGIN TRANSACTION READ ONLY`), safe on a replica/restored dump, sub-second on both
local DBs. **5434/DEV finds zero and says so is expected with one tenant — not a clean
bill.** Highest-value item in §B: if it finds rows on prod data, remediation outranks
the rest of §B. Do not delete found rows (the `org_id` is the acting tenant, not
necessarily the owner).

### 0g. `apps/worker` — swept and FIXED 2026-08-23 (`8db6e51`)

Connects as the app DB user (`rolsuper`/`rolbypassrls`) so RLS constrains nothing and
there is no second wall. Fixed: org predicates on both `tickets` UPDATEs; recipient/
assignee/team ids resolved against the org via a local `belongsToOrg` helper (same rule
as `lib/assert-same-org.ts`, re-expressed for raw SQL — **keep the two in step**).
READ IN CODE ONLY; zero workflows exist on 5434/DEV.

### 0h. Layer survey — see `docs/WIRING-01.md`

Two genuine breaks at Layer 2 (GRC controls/findings cannot be created; document
permissions written and never read) plus two command-centre faults inherited from
Layers 1 and 4 (fix at the source, not the top). Layer 5 (12 workbenches) counted,
not opened.

### 0c. Isolation surfaces never swept

`apps/web` client-side guards and **nested sub-routers** (the RBAC map does not cover
nested sub-routers). Same instruments as run 12.

### 0d. `document_acls` is written and read NOWHERE

`grantAcl` writes it; nothing reads it. Document ACLs are unenforced product-wide.
Building enforcement is a product decision, not a bug fix.

### 0e. Ten unchecked-lookup sites, untriaged

The `?.`-aware detector reports 10 (counts and update-returning results) — a different,
pre-existing class from the two fixed in `af8f8ec`. Not yet read.

### 0f. `INTERNAL_API_TOKEN` is unset in production

`/api/internal/*` is publicly routed (401, not 404), defended only by a source-IP
allowlist trusting any `10.x`/`172.x`. `POST /api/internal/dpdp/sweep` enumerates
every org. The prod caller is a `curlimages/curl` container in
`docker-compose.vultr-test.yml` sending no token header. Needs: the var on the api
service, `INTERNAL_API_TOKEN` in the `dpdp-sweeper` environment, and
`-H "x-internal-token: $$INTERNAL_API_TOKEN"` on its curl. Proof it is live: the 401
body changes to "Valid X-Internal-Token header required".

### 4. Approvals — TWO parallel systems; needs an OWNER architecture decision

Module-local approvals WORK (each transitions its own record: changes, hr.leave,
hr.expenses, payroll, procurement). The generic `approvals.decide` transitions
NOTHING (writes only `approvalRequests`/`approvalSteps`). **Owner decision that gates
all approval code:** is the generic subsystem meant to *replace* module-local
approvals (one inbox) or be a *reporting layer* over them? Opposite code either way —
**do not write approval code until answered.** Real items underneath: (1) **contracts
has no approval verb** — the one clean gap; (2) **procurement is double-wired** and the
two systems can disagree. Also parked: `sequential: false` is not honoured (no column
records which chain produced a request). Full analysis in PLAN-05 §4.

### 4b. Four approval chains route to nobody — OWNER DECISION

`change_request`, `contract`, `expense_claim`, `purchase_request` sit in dev marked
active with `rules: []`, inserted by hand (no migration/seed). Fixed so they no longer
LOOK configured (each shows "No approvers — nothing can be raised"; `create` requires
≥1 approver). Deliberately neither populated (auto-routing nobody chose is a compliance
liability) nor deleted (they are a visible backlog of four missing controls).
Downstream of §4's architecture question.

### 6. GRC create paths

`grc.ts` has `addControlEvidence` and `listControls` but **no `createControl`/
`createFinding`**. `risk_controls` (40) and `audit_findings` (30) on dev came from
outside the repo — no writer anywhere. The workbench looks healthy on data no tenant
can produce.

### 7. Config with no admin surface

`slaPolicies` · `leaveExitRules` · `ticketCategories` · `ticketPriorities` ·
`professionalTaxSlabs`. Schema treats them as tenant-configurable; the product treats
them as fixed. `slaPolicies` and `leaveExitRules` degrade to a silent hardcoded
default — worse than an empty panel.

### 8. The compliance matrix claims fourteen falsehoods

`routers/legal.ts` seeds 24 rows `status:"implemented"` as a hardcoded literal,
`onConflictDoNothing`, never updated — the first read freezes the claim. **14 of 24
cite tables with no write path.** No screen renders it today (the only reason it is not
already a problem). Short term: derive the status or seed `not_implemented`. Long term:
Tier 3.

### 9. Test-suite fragility — 47 fragile sites

`textContent("body")` at 47 sites across 24 e2e files samples the DOM before the auth
bootstrap resolves. Two fixed in `rbac.spec.ts`; 45 remain. Mechanical conversion to
web-first assertions.

### 10. Quarantines to lift — each needs its wiring first

- **sweep47 `testIgnore`** in `playwright.config.ts` — lift when the suite is green;
  the specs are investigative harnesses (a failure is a candidate, not a defect).
- **Security & Compliance sidebar group** commented out in `sidebar-config.ts` — makes
  `/app/flows` URL-only and `/app/approvals` ⌘K-only. Restore once §4 lands.

### 11. A worker errors on every CI E2E run and nothing notices

`[workflow:webhook] … relation "webhook_deliveries" does not exist` in the E2E job;
the run passes so nobody sees it. The table exists (schema/migration/write path/dev
DB); the job id is `repeat:…`, a BullMQ repeatable persisted in Redis firing against a
DB that no longer matches. Establish: whether repeatable defs outlive a test-DB reset
(CI-only?) and whether prod Redis (persists across deploys) can do the same. READ IN
CODE ONLY.

### 12. Contract templates count/content disagree

Picker shows "0 clauses · 8 required" yet the wizard renders clauses fine — clause text
comes from the frontend, not `contract_clause_templates` (no write path). One of them is
lying. (The "requisition created with status=approved" observation was WITHDRAWN — it
was configured-tier behaviour, not a defect.)

### 13. `documents.retention` ships with no automated tests

The retention CRUD + admin screen (`d44a400`) have zero test coverage; it governs
permanent document deletion. Every path was verified by hand, but nothing guards it.

### Tier 3 — the statutory fourteen (months, sequenced separately)

Statutory registers, XBRL, FEMA/RBI returns, CCI combinations, LODOR calendar,
shareholder grievances/voting, director disclosures, clause templates, MSME tracker,
e-sign events, whistleblower settings, sector licences, legal hold. Each carries real
regulatory semantics — sequence per obligation, not as a batch.

### Open product decision — ESG

`/app/esg` was deleted (`0798c7c`): 169 lines, zero API calls, every figure hardcoded,
behind a flag one env var from publishing fabricated figures. Removing a lie is not
hiding — the deletion stands. There is no ESG router/schema/write path anywhere; wiring
it means designing a data model from scratch — a product decision, not in the queue
until someone makes it.

---

# RUN LOG

_Newest first. One entry per run, including runs that changed nothing._
_Runs 12–17 are in `PLAN-05.md`; runs 1–11 in earlier PLAN files._

## 2026-08-25 — run 18 (PLAN-06 rollover; #15 cleared to ship)

Housekeeping run, opened by the session-handover doc. Verified repo state before
touching anything: `origin/main` = `bed0c79`, last main CI run `32732795785`
**success**, working tree clean, **10 commits ahead** of origin/main (7 HIGH code + 3
docs — the handover said 9; the 10th is the handover commit `8e10980` itself, made
after that doc was written).

**Rolled PLAN-05 → PLAN-06.** PLAN-05 was 583 lines, over the 500 cap. Carried CURRENT
STATE and THE QUEUE forward; left the run log (runs 12–17) in PLAN-05 with a pointer at
its top. **Promoted the run-17 active priorities into THE QUEUE as §A** — the dashboard
tier, the pending push, test debt and the MEDIUM/LOW register lived only in PLAN-05's
run log and would otherwise have been left behind by a verbatim queue carry-forward. The
older isolation/wiring items are now §B (standing backlog). Refreshed the CURRENT STATE
deploy lines to the verified `bed0c79` reality (PLAN-05's said `dce6ff4`).

**Owner decisions this run:** (1) start with the PLAN-06 rollover; (2) **#15
(`fe334fc`) is cleared to SHIP** in the next batch push — recorded in §A.1. No product
code changed; no build run (docs-only).

**Next:** dashboard wiring §A.2, starting H3 (window the four all-time health lights to
the period). Then the batch push (§A.1) with the owner's snapshot + go.
