# PLAN — I

**This is the single reference file for a new session. Read it first.**

Operating rules stay in `CLAUDE.md`. Everything about *what is true now* and *what
happens next* lives here.

## How this file works

- **Updated at the END of every run.** A run that changes nothing still gets a log
  entry saying so.
- **Hard cap 500 lines.** When this file reaches it, create `docs/PLAN-II.md`,
  carry CURRENT STATE + THE QUEUE forward, leave the RUN LOG behind, and put a
  pointer at the top of the retired file. Then `docs/PLAN-II.md` becomes the file
  a new session reads. Same again for III, IV, …
- **A new session reads the highest-numbered `docs/PLAN-*.md`.** Nothing else.
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

**`reports/fix-plan.md` is stale.** It claims `EFFECTIVE-DATE-DEFAULT` is fixed; it
is not (see queue item 2). Its section 5 asks for a sweep47 decision that has since
been made. Do not plan from it.

---

# THE QUEUE — in priority order

Ordering: **promises already broken** first, then **things that destroy data on a
timer**, then **dead surfaces**, then **honesty of claims**, then **test health**.

### 1. Nine round-trip failures — a value was saved and was gone after reload

`contracts` · `flows` · `legal` · `procurement` · `sam` · `settings/api-keys` ·
`surveys` · `vendors` · `work-orders/parts`

**Status: CANDIDATE.** Found by the sweep47 generic harness; 14 other modules pass
the identical harness, which is suggestive but not proof.

**Do this first:** open each screen, create one record by hand, reload, and read the
**persisted row via SQL** — not the mutation's return value. Three outcomes: the
write never happens; the write happens and the read filters it out; or the form
legitimately rejected the harness's generic input.

**Check the known cause before writing code:** `CLAUDE.md` documents deprecated
twins whose frozen zod input silently strips fields added since — mutation succeeds,
toast says success, data is gone. That is exactly this signature.

`settings/api-keys` first regardless of order. A key you cannot retrieve is worthless
and users will have assumed they had one.

### 2. Payroll effective date is one day before the period start

**Status: CONFIRMED (read in code + observed in a run).**

`apps/web/src/app/app/payroll/page.tsx:103`

```js
return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
```

`new Date(2026, 7, 1)` in IST is `2026-07-31T18:30:00Z`, so this returns
`2026-07-31` — the last day of the previous month, in every timezone east of UTC.
Contradicts the standing decision in `CLAUDE.md`: *any date feeding a payroll PERIOD
defaults to the PERIOD START*.

Fix is one line (`date-fns` `format` is already imported). **The real work is the
blast radius** — grep every `toISOString().slice(0,10)` and check each for the same
local-midnight-to-UTC shift. A period *end* shifted a day is not cosmetic. Add a
test that pins the default under a non-UTC `TZ` or it regresses invisibly.

### 3. `documentRetentionPolicies` — deletes documents on a timer nobody can set

Read **only** by the retention worker. No write path, so the 90-day default is
unreachable and the policy-level legal-hold flag can never be set — only the
per-document one. The only item in this queue that destroys data unprompted.

Needs an admin CRUD screen.

### 4. Approvals — the raise path is missing

The subsystem is **half-built**, which makes this wiring rather than building:

| Exists | Missing |
|---|---|
| `decide` (approve/reject) | nothing creates a request |
| `myPending`, `mySubmitted`, `myTeamPending`, `list` | nothing writes `approval_steps` |
| worker notifying the requester of the outcome | nothing writes `approval_chains` |

Consequence today: the sidebar badge is structurally incapable of being non-zero,
and `/app/approvals` shows a green tick and "All caught up — no pending approvals"
to every tenant, permanently.

Add the raise path; call it from the modules that already imply approval (purchase
requests, contracts, expense claims, change requests, leave). Then `approval_steps`
for chain progress and an admin screen for `approval_chains`.

**Constraint:** the payroll chain is 2 or 3 steps, never 1, needs that many
**distinct** accounts, and its length is stamped onto
`payroll_runs.approval_chain_length` at creation. A generic chain must not
contradict that.

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

**Not done:** every queue item above. Nothing in the queue has been started.

**Next:** queue item 1 — verify the nine round-trips by hand before planning
anything sized off them.
