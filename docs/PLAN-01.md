# PLAN — 01

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here.

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **Hard cap 500 lines.** When this file reaches it, create `docs/PLAN-02.md`,
  carry CURRENT STATE + THE QUEUE forward, leave the RUN LOG behind, and put a
  pointer at the top of the retired file. Then `docs/PLAN-02.md` becomes the file
  a new session reads. Same again for 03, 04, …
- **Numbering is zero-padded two digits so a plain `sort` finds the newest.** Roman
  numerals do not sort — `IX` collates before `V`.
- **A new session finds this file by rule, not by name:**
  `ls docs/PLAN-*.md | sort | tail -1`. `CLAUDE.md` carries that rule, so it never
  needs editing when the plan rolls over.
- Older `PLAN-*` files are history. Their "done" claims are unverified — treat
  them the way `CLAUDE.md` says to treat `reports/fix-plan.md`.

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

_Verified 2026-08-21. Every line here was established by running something; where it
was only read in code, it says so._

**Deployed:** `connect.coheron.tech` runs the image tagged from the head of
`origin/main`. "Live" means the terminal `Deploy to Vultr` job of the latest main CI
run — not CI success alone.

**Gates:** `pnpm lint:cold` 9/9 with `Cached: 0`. `pnpm build` 11/11. Full test
suite 2,359 passed, 0 failed (api 2,085 / web 116 / payroll-math 103 / types 43 /
db 7 / worker 3 / metrics 2). E2E 135 passed after the sweep47 quarantine.

**Databases:** dev `localhost:5434`, test `localhost:5433`. They hold different
data. State the port beside every number.

**Two environment traps, both confirmed on this machine:**

- **Redis** — a native Homebrew Redis on 6379 wins over the container. The API talks
  to the native one (1,183 keys, 62 clients); the container has 0 keys. It is also
  shared with another project (`pose-analysis`, `resume-parsing`,
  `video-transcription` queues).
- **Workers** — the API starts 20 BullMQ workers in-process. Stopping `apps/worker`
  stops Temporal only. These mutate data during any test.

**E2E isolation, learned the hard way:** `reuseExistingServer: !CI` will latch onto
the dev servers on 3000/3001, which point at **5434 (DEV)**. `next dev` refuses a
second instance. The web app proxies `/api/trpc` via `API_INTERNAL_URL`, which
defaults to `:3001` — the DEV API. An isolated run needs built servers on spare
ports **and** `API_INTERNAL_URL` overridden.

**`reports/fix-plan.md` is stale.** Its line 183 claims `EFFECTIVE-DATE-DEFAULT` is
fixed. The *rule* was fixed; the *timezone* was not, and that took until 2026-08-22
to find (item 2). Its section 5 asks for a sweep47 decision that has since been made.
Do not plan from it.

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

### 4. Approvals — usable now; one piece left

**Done:** `approvals.raise` + `approvals.chains` (`61a0af9`); `decide` advances the
chain (`3b5415b`); chains admin screen at `/app/settings/approval-chains` plus
`eligibleApprovers` (`d14ad04`).

The loop works end to end and was verified in the running app: create a chain with
ordered approvers and an amount threshold → raise resolves through it → the item
appears in the approver's queue with working Approve/Reject → approving advances to
approver 2 → the last approval closes it. A rejection ends the chain and marks later
steps `skipped`.

**Remaining:**

1. **No module calls `raise`.** A purchase request still goes straight to `approved`
   with no gate (item 12). Wiring each module changes that module's behaviour, so
   each is its own reviewable change. This is now safe to do — the chain can reach
   its second approver.
2. **Parallel chains.** `sequential: false` is not honoured; the request does not
   record which chain produced it, so the mode is unknown at decision time. Needs a
   column on the request rather than a guess.

**Design flaw carried:** one `idempotency_key` column serves both the raise key and
the decide key. `decide` now preserves the existing value instead of nulling it —
a patch, not a fix.

**Constraint unchanged:** the payroll chain is 2 or 3 steps, never 1, needs that many
DISTINCT accounts, and its length is stamped onto
`payroll_runs.approval_chain_length` at creation.

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

- **A new requisition is created with `status = "approved"`.** PR-0041 went straight
  to approved with no approval step. Consistent with item 4 — there is no approval
  gate, so the record simply asserts it passed one. Fix alongside the raise path.
- **Contract templates display "0 clauses · 8 required"** on the picker, yet step 4 of
  the wizard renders the clauses fine. So the clause text comes from the frontend, not
  from `contract_clause_templates` (no write path). The count and the content
  disagree; one of them is lying.

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

## 2026-08-22 — run 5

**Item 4 is usable.** `decide` now advances the chain (`3b5415b`) and the chains admin
screen exists (`d14ad04`). Verified in the running app rather than by API alone: a
chain built through the form, a request raised through it, and the item rendered in
the approver's queue with working Approve/Reject — a page that has always shown
"All caught up — no pending approvals" to every tenant.

**Two defects fixed along the way**, both surfaced by running the thing rather than
reading it: `raise` accepted an approver who lacked `approvals:approve` (the request
would sit in their queue and 403 on touch), and `decide` erased the raise-time
idempotency key.

**Found:** four approval chains active with no approvers (item 4b). Made visible;
decision on what to do with them left to the owner, with the reasoning recorded.

**Reversed my own decision.** I ruled "delete the four hollow chains" and was asked
whether that was right from a usage standpoint. It was not: flagged rows on a page an
admin already visits are a prompt; an empty list is silence. The lens that matters is
what the operator does next, not whether the data is tidy.

**`tsx watch` is unusable in this repo.** It served stale code through several
restarts and never picked up router changes. Running plain `tsx` and restarting on
edits. The API on :3001 is now a plain process, not under the old supervisor — the
original watcher (pid 63178) may still be alive and could fight for the port.

**Dev data left in place deliberately:** the `zz_demo` chain and `APR-0006`, so the
working case sits beside the four broken ones.

**Next:** wire the first caller — purchase requests — so a requisition routes instead
of skipping to `approved`.

## 2026-08-22 — run 4

**Queue item 4 — raise path built** (`61a0af9`). Verified against an isolated API on
a spare port: refusal when no approver resolves, explicit approver → APR-0001 with a
step, idempotency key honoured on retry, cross-org approver refused, chain threshold
honoured both ways, approver's `myPending` returning the item, and `decide` closing
it. Probe data removed; counts back to 30/60/4.

**Two defects the work exposed, both fixed in the same commit:**

- **`= ANY(${jsArray})` 500'd on a single-element array** at three sites in
  `approvals.ts`. Raising a request made it reachable for a real approver — their own
  queue errored. `myPending` 500 → 1 item, `list` 500 → 32 items after switching to
  `inArray`. This was found on baseline data in an earlier run; building the raise
  path is what made it bite.
- **`decide` erased the idempotency key**, writing `input.idempotencyKey ?? null` and
  wiping the key `raise` stored on the durable fact. The unique index then stopped
  protecting that request, so a retried raise could create a DUPLICATE for an
  already-decided event. Found only because a probe row survived cleanup by
  `idempotency_key` — worth remembering that a failed cleanup is evidence, not noise.

**Carried design flaw:** one `idempotency_key` column serves both the raise key and
the decide key. Preserving the existing value is a patch, not a fix.

**Next:** make `decide` advance a chain (item 4.1) before wiring any caller.

## 2026-08-22 — run 3

**Queue item 3 done** (`d44a400`). Retention policies are writable and the deletion
default is visible. Verified against an isolated API+web stack on spare ports —
`tsx watch` would not pick up the router change, so the shared dev API on 3001 kept
serving the old router. Every path exercised: create, duplicate-name CONFLICT,
zero-day BAD_REQUEST, update confirmed in SQL, cross-org assign refused, same-org
assign persisted, remove reporting the revert count with FK set-null confirmed, and
a policy created through the UI landing in 5434/DEV. Probe data removed.

**Deployed:** run 32559621579 green end to end — `nexusops/api:d3e7a3c`. The payroll
and expense timezone fixes are live.

**Next:** queue item 4 — the approvals raise path.

## 2026-08-22 — run 2

**Closed queue item 1 — no defect.** Verified all nine round-trip candidates by hand
through the browser against 5434/DEV, reading the persisted row in SQL rather than
trusting the UI. All nine create paths work. Test records reverted by explicit key;
counts back to baseline (vendors 40, contracts 120, surveys 6, matters 30, api_keys 0).
Backup taken first: `~/nexusops-20260822-1227.sql`. One thing the revert cannot undo —
PR-0041 consumed an `org_counters` value, which is correct: identifiers are not reused.

**Fixed queue item 2** (`5ff4375`) — the payroll effective-date timezone bug, plus the
same class in `hr/expenses`. Proved under IST and UTC, then verified in a running IST
browser. Swept all 19 `toISOString().slice(0,10)` sites; the rest are sound.

**Learned:** the sweep47 harness is only valid for single-step free-text forms. It
cannot handle format-validated fields, multi-step wizards, or canvas designers, and it
reports all three as data loss. Its output needs this filter before anyone reads it.

**Next:** queue item 3 — `documentRetentionPolicies`, the only item that destroys data
unprompted.

## 2026-08-21 — run 1

**Shipped (9 commits, all on `main`, deployed):**

- `b5a6f5a` removed the Analytics & Reporting tab from all 12 workbenches. It
  resolved each workbench to its parent FUNCTION and showed that hub's metrics, so a
  Buyer saw net margin. Also killed a permanent-skeleton bug affecting 8 of 27 roles:
  a disabled query never sets `isFetching`, so the 5s escape timer never started.
- `5fd3bee` stopped two panels reporting failures as configuration facts, and
  stripped "— quiet shift" from the SecOps empty state.
- `6227259` deleted 101 superseded documents.
- `afdf3f1` other sessions' APM/vendors/command-centre work.
- `bad7287` sweep47 specs, audit-run scripts, launch config.
- `f02e367` excluded `__auditrun__` from the api typecheck.
- `68c30bf` stopped sweep47 gating CI.
- `c97ad3a` fixed an auth-bootstrap race in `rbac.spec.ts`.
- `0798c7c` removed `/app/esg` and `FEATURE_ESG` across 9 files.

**Broke CI once, my error.** `bad7287` committed 48 investigative specs without
checking that Playwright collects `e2e/*.spec.ts` unconditionally — the suite went
136 → 184 and 23 of 24 E2E failures were sweep47. Build and Deploy were skipped, so
nothing reached production. Fixed by `68c30bf`.

**Got E2E isolation wrong twice** before running sweep47 successfully — first
`next dev` refusing a second instance (48/48 connection refused), then
`API_INTERNAL_URL` defaulting to the DEV API (48/48 login timeouts). Checked the dev
database after: **0 users, 0 sessions, 0 orgs, 0 sweep47 rows** written. Nothing was
created because login never succeeded.

**sweep47 result (valid run):** 28 failed, 14 passed, 6 skipped. Varied signatures,
so real signal. Produced queue items 1, 2 and 6.

**Also this run:** created this file and pointed `CLAUDE.md` at it as the single
session-start reference (`c7383ba`). Rewrote `CLAUDE.md` — 362 → 307 lines: removed
the stale pointers to `docs/CONTEXT.md` and `reports/fix-plan.md`, compressed prose to
one line per rule, and added two sections that cost real time this run — **Tooling
traps** (`rg`/`grep` are shell functions that vanish inside a script; zsh does not
word-split) and **E2E isolation** (`reuseExistingServer` grabs the DEV servers,
`next dev` refuses a second instance, `API_INTERNAL_URL` defaults to the DEV API,
`testIgnore` beats CLI args). Also recorded the standing directive as a rule.

It did not get much shorter because almost every line is a rule that was learned
expensively. Below ~300 the next cut drops rules rather than words — if it must
shrink further, that is a decision about which lessons to stop carrying, not an
editing task.

**Deployed:** run `32504364037` green end to end — image `nexusops/api:0798c7c`,
`✓ API healthy`, matching `origin/main`. E2E 135 passed in 5.7m with the sweep47
quarantine holding. That run's log produced queue item 11.

**Rules added to CLAUDE.md this run:** no commit without a build (and read the cache
line — a fully cached build proves nothing); do not push while a CI run is in flight;
`git add` fails atomically on a missing pathspec, so verify a commit's diffstat rather
than its exit code. All three were written after breaking them.

**Open decision for the owner — the build gate.** `pnpm build` is cache-aware and
returned `11/11 successful, Cached: 11 cached` twice while compiling nothing: a replay,
not a build. `pnpm exec turbo run build --force` gave `Cached: 0` with 11 cache
bypasses and fresh artifacts. Choose one as the standing pre-commit gate:

- keep the cache-aware build and rely on reading the cache line — cheap, but needs a
  judgement call about when a cache hit is acceptable, and that judgement already
  failed once this run;
- make `--force` the gate — ~30s per commit, no judgement, always a real answer.

Leaning `--force`. Not written into `CLAUDE.md` pending the owner's call.

**Not done:** every queue item above. Nothing in the queue has been started.

**Next:** queue item 1 — verify the nine round-trips by hand before planning
anything sized off them. Do not size anything off the sweep47 numbers until that
verification is done.
