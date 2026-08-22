# CLAUDE.md

Operating rules for AI agents in this repo. **Rules, not status** — no SHAs, no counts, no
"current state". Those live in `docs/PLAN-*.md`. If you find per-commit state here, it is a bug.

## Start here

```
ls docs/PLAN-*.md | sort | tail -1
```

**Read that file. It is the only reference a new session needs** — current state, the queue in
priority order, and a run log.

Deliberately a rule, not a filename: this file must never need editing when the plan rolls over.

- Update the plan at the END of every run, including runs that changed nothing.
- At 500 lines create the next file — **zero-padded two digits**, `PLAN-02.md`, `PLAN-03.md`, so a
  plain `sort` always finds the newest. (Roman numerals do not sort: `IX` collates before `V`.)
  Carry CURRENT STATE and THE QUEUE forward, leave the RUN LOG behind, and put a pointer at the top
  of the retired file.
- Older `PLAN-*` files are history. Their "done" claims are unverified.

**This file is rules; the plan is state.** Rules live here because this file is loaded
automatically every session — state does not, because state changes and stale rules are worse than
no rules. If you find yourself editing CLAUDE.md to record something that changed, it belongs in
the plan instead.

`docs/CONTEXT.md` and `reports/fix-plan.md` are superseded and stale. History only.

## Project

**CoheronConnect** (repo NexusOps) — multi-tenant India Enterprise Operations Platform.
Production `connect.coheron.tech`. pnpm + Turborepo, Node >=20. `apps/web` Next 16 (3000),
`apps/api` Fastify + tRPC, tsup → `dist/` (3001), `apps/worker` Temporal, `apps/mac` (3004),
`apps/docs` (3003), `apps/mobile` parked. Business logic and most tests live in `apps/api`.

---

## THE REPORTING STANDARD

The most important section here.

- **A claim is UNVERIFIED unless you can paste the artifact that produced it.** Reading code,
  tracing a call chain and matching a form to a schema are all UNVERIFIED — say so in those words.
- **No percentages, no "complete"/"close"/"working"** for anything unverified. An audit once rated
  a module 75% and CLOSE; clicking it found the edit dialog silently saved nothing.
- **Every report carries a NOT VERIFIED section. An empty one is itself a claim**, usually false.
- **Stop when you have RUN it, not when you have understood it** — or name exactly what blocked you.
- **PARK AND CONTINUE.** A blocker on one item has no bearing on the next. Record the failing
  command and move on. Finish the round.
- **Reach features BY CLICKING.** Router tests passed while two rounds' work was unreachable.
- **A detector that finds nothing is usually a broken detector.** Sanity-check every detector
  against a case that MUST be non-zero. A form sweep found 5 openers, then 30, then 38 as its
  selector was corrected.
- **A mass failure with a uniform signature is ONE cause, not many.** 48/48 identical failures is a
  harness fault. Fifty-five modules do not break identically at the same moment.
- **A guard failing after a change may be correctly detecting the change.** Establish which before
  editing either side, and say which in the report.
- **Report NOT-FOUND rather than trusting a stated `file:line`.** Search for the symptom; line
  numbers in any document, including this one, may have moved.
- **Establish reachability before severity, and severity before priority.**
- **Trace a finding to cause before recording it as a fault.** An artefact of a known cause is not
  a new finding.

## Tooling traps (cost us real time)

- **`rg` and `grep` are shell FUNCTIONS here, not binaries.** They do not exist inside
  `zsh script.sh` — every search silently fails and you count error lines as zero hits. Run
  searches inline, and sanity-check.
- **zsh does not word-split unquoted variables.** `for x in $list` iterates once over the whole
  string; a command string in a variable is not executed. Use `${(f)var}` or a `while read` loop.
- **`grep -h` strips filenames**, so `| grep -v __tests__` filters nothing.
- Multi-line SQL piped through commands breaks; `!` triggers history expansion in `node -e`;
  unquoted paths in `cd` error "too many arguments". Write a temp file and quote paths.

---

## Build / test

- **Run BOTH `pnpm build` and `pnpm lint:cold`** (= `turbo run lint --force`). Plain `pnpm lint` is
  cache-aware and a warm `.turbo` runs no typecheck at all. **"9/9 cold" only counts with
  `Cached: 0`.** CI typechecks api AND web; a green api alone is not sufficient.
- **A failing task blocks its dependents**, so a partial run reports fewer tasks than exist. Check
  the task count, not just the conclusion.
- **`packages/db` is consumed via compiled `dist/`** — rebuild it after schema edits, and rebuild
  `apps/api` before `apps/web` typechecks against new procedure types.
- **Deleting a route leaves `.next/types/validator.ts` importing it**; the web typecheck fails on
  stale generated output. Rebuild to clear. Gitignored, so CI never sees it.
- **Tests run against real Postgres.** Test DB on **5433** (`pnpm docker:test:up`), dev on **5434**.
  Name the port beside every number. **Never run vitest concurrently with E2E** — shared Postgres.
- vitest is `fileParallelism: false`, `singleFork`. Tests must self-isolate — a row left behind
  breaks a later spec reaching for "the newest".
- **`preview_start` has reported "reused" on a DEAD server.** Verify with `curl localhost:3001/health`.
- **`apps/api/src/index.ts:3` runs `loadEnv({ path: "../../.env" })`**, so `env -u VAR` is undone by
  dotenv — a boot guard tested that way looks inert when it is fine. Suspect the harness first.
- **tsx watch does not always pick up API edits.** Restart before concluding the code is wrong.

### E2E isolation — all four bite

- **`reuseExistingServer: !CI`** latches onto whatever is on 3000/3001 — which point at **5434
  (DEV)**. Tests that create records will write to your dev database.
- **`next dev` refuses a second instance** in the same project. Use the built servers
  (`next start` / `node dist/index.mjs`) on spare ports.
- **The web app proxies `/api/trpc` via `API_INTERNAL_URL`, defaulting to `:3001`** — the DEV API.
  Override it or the isolation is fiction. `NEXT_PUBLIC_API_URL` is the wrong knob and is inlined
  at build time.
- **`testIgnore` beats CLI arguments.** Naming an ignored spec gives "0 tests in 0 files". To run
  one, point `--config` at a config that spreads the base and clears `testIgnore`.

### Scale the gates to the change

Full E2E is 30–50 min, the api suite ~20. Run them once, at the end, after every known-breaking fix
is applied. Check machine load first — a run on a saturated box produces diffuse timeouts that mean
nothing. For a change touching neither routes nor schema, targeted specs plus the module's blast
radius is the honest gate.

---

## Database / migrations

- **Assert the migration count MOVED on a reset DB and paste both numbers.** Drizzle has reported
  "migrations applied successfully" while applying nothing.
- **The head is the last entry in `packages/db/drizzle/meta/_journal.json`.** Never trust a head
  quoted in prose, including here.
- Drizzle diffs against **its own snapshot**, not the live DB. A silently failed migration cannot
  self-heal — hand-write a corrective migration, add the journal entry, create the snapshot.
- `pnpm check:migrations` only checks each `.sql` has a journal tag. **No hash check.**
- **Drizzle does not model RLS.** `CREATE POLICY` / `ENABLE|FORCE ROW LEVEL SECURITY` must be
  hand-appended to the generated `.sql`. Copy the stanza verbatim from `0061_walled_challans.sql`.
  RLS only bites because the request path drops to `app_runtime` via `SET LOCAL ROLE` (`lib/trpc.ts`,
  `rlsTenant`); the app DB user would otherwise bypass it.
- **A new tenant table carries `org_id` AND its RLS policy in the same migration.** Tables with no
  `org_id` are the class every isolation leak lives in.
- **A unique index must detect duplicates first and RAISE**, naming table/value/org/row-count —
  never delete, merge or renumber. See `0086_aromatic_swarm.sql`.
- **A column needing per-row values needs a hand-written backfill.** Drizzle emits one
  `ADD COLUMN … DEFAULT x`, filling every row identically. See `0089_furry_tattoo.sql`.
- **A backfill is half the job — the SEED is what every fresh database gets.** Grep
  `packages/db/src/seed*.ts` for the same table in the same change.
- **Removing a value from a Postgres enum needs a migration and is not cheap.** Prefer the config
  table's own `active` flag.
- FK `onDelete`: `orgId → organizations` CASCADE; child → parent CASCADE; nullable actor SET NULL;
  NOT NULL actor RESTRICT; lookup RESTRICT.
- **The dev DB is not auto-migrated and nothing checks it.** Confirm it is at head at session start;
  it was once 14 behind and login 500'd. Prod self-migrates on container boot.

---

## Recurring defects — check before assuming one write site

- **DEPRECATED TWINS.** Many procedures have a canonical and a flat deprecated version
  (`crm.movePipeline` vs `crm.deals.movePipeline`). **A guard on one and not the other leaves the
  defect fully reachable.** Their inputs were frozen when written, so **zod silently strips every
  field added since** — mutation succeeds, toast says success, data is gone. Extract the rule into
  one shared helper and call it from both. Guard: `crm-deprecated-mutation-sweep.test.ts`.
- **A config flag that exists is not a config flag that is used.** `active` on
  `crm_pipeline_stages` was honoured by the stage pickers and nothing else. **Verify the consumer.**
- **Identifiers.** Every user-facing identifier is unique per org and allocated atomically from
  `org_counters` (`lib/auto-number.ts`). **Never mint one with `Math.random()` or `count(*)+1`** —
  both shipped, both produced duplicates. **Never synthesise one from a UUID substring.**
- **Guards validate the TRANSITION, not the stored row** — a new rule ships without a backfill and
  historical rows are never re-validated.
- **Idempotency keys on the durable fact, not a mutable status.** Lead conversion keyed on
  `status === "converted" AND convertedDealId`; an edit broke the AND and allowed a duplicate deal.
- **Tightening an input breaks existing callers**, tests and external clients. Grep the suite first
  and say plainly in the commit that it is a contract change. **A test failing afterwards is usually
  an outdated SETUP call, not a broken assertion.**
- **A check that appears to exist may not run.** A duplicate route in a shared registry made 699
  tests collect-fail silently; every green CI run was green without them. Verify a gate *executes*.

---

## Security — easy to get wrong

- **`hr:read` is NOT "is this person HR" — every employee holds it.** The `requester` role grants
  `hr: ["read"]`. **The real test is `hr:write`.**
- **One ownership helper: `assertSelfOrPermitted(ctx, employeeId, grants[])`**
  (`lib/self-or-permitted.ts`). Do not write a second. Where a user may SEE their own figures but
  not ACT on them, express that by NOT calling it on the acting procedure.
- **A missing rule in `trpc-procedure-rbac.generated.ts` falls back to PERMISSIVE**, but that gate is
  CLIENT-SIDE ONLY — the server still enforces `permissionProcedure`. Absence is a defence-in-depth
  gap, not data exposure. Establish which before calling it a breach, and read handler BODIES.
  The map does not cover nested sub-routers imported from other files.
- **`canAccess(module)` and `can(module, action)` differ.** For roles they agree; for CUSTOM
  permissions `canAccess` matches on resource alone. A user can pass the route guard and still have
  the query disabled — which renders an empty state, not a denial.
- **A green `/api/health` proves NOTHING about encryption readiness.** The local KMS provider's
  constructor only stores a key id; `APP_SECRET` is read per-call in `kek()` (`services/kms.ts`).
- **In `routers/hr.ts`, `bankAccountColumns(...)` must stay LAST, after `...rest`.** It overwrites
  the plaintext `bankAccountNumber` spreading in from input. Reorder it and plaintext account
  numbers are stored silently **while every existing test still passes**.
- **The Fastify HTTP routes bypass `rlsTenant` entirely** — app-filter-only.
- **The RLS policy fails OPEN when `app.org_id` is unset.**

---

## Money invariants — verify when touching

- **Journal entries**: debits = credits (tolerance 0.001) — `routers/accounting.ts`.
- **Payroll**: `netPay = max(0, grossEarnings − totalDeductions)` — `lib/payroll-cycle.ts`.
- **GST**: intra-state = CGST+SGST (50/50), inter-state = IGST — `lib/india/gst-engine.ts`.
- **TDS / income tax**: `computeTax()` — `lib/india-tax-engine.ts`.
- **3-way match**: invoice ≈ PO ≈ GRN within tolerance — `lib/invoice-po-match.ts`.
- **EPFO ECR**: `buildEcrLine()` is the ONLY member-line builder. **The reported wage must be the
  wage the contribution was computed on** — `epfWages` reads persisted `payslips.pf_wage_base`,
  never `slip.basic`. The ₹15,000 ceiling belongs on the wage base upstream and on EPS/EDLI only.
  The guard is an UPPER bound (employer ≤ 12% + ₹1); a floor produces false rejections.

---

## Standing decisions — do not relitigate

**Payroll operability**
- **Any date feeding a payroll PERIOD defaults to the PERIOD START, never `today`.** A structure
  dated after the 1st is not in force that month and the employee is silently excluded.
- **Never build a user-facing date with `toISOString()`.** It renders UTC; `new Date(y, m, d)` is
  LOCAL midnight, so east of UTC they differ by a day. This warning was already in this file as
  prose and the bug shipped anyway — `firstOfCurrentMonth()` returned 2026-07-31 for August in
  IST. Use `format(d, "yyyy-MM-dd")` (date-fns, local) or build the string from
  `getFullYear/getMonth/getDate`. `toISOString()` is correct ONLY when the Date was built with
  `Date.UTC()`, as `monthStart`/`monthEnd` in `lib/format-money.ts` are. Test under a non-UTC `TZ`;
  server code passes only because the container runs UTC.
- **The approval chain is 2 or 3 steps, never 1, and needs that many DISTINCT accounts.** Length is
  stamped onto `payroll_runs.approval_chain_length` at creation. **On a 2-step chain the FINANCE
  approval lands on `CFO_APPROVED`** — statutory generation and the bank file gate on that state.
- **Payslip access is SELF-SERVICE BY DESIGN** (`eq(employees.userId, userId)`). Ruled
  working-as-intended by the owner. Do NOT route it through an HR grant.
- **A capability a tenant cannot reach is not shipped.** Engine without a screen = GAP, not done.

**India payroll**
- **PF composition, VPF and Para 26(6) are CONFIGURATION, not customer questions.** PF/ESI/gratuity/
  leave-encashment bases read Basic+DA. VPF is employee-side only, capped so 12%+VPF ≤ 100% of the
  wage base; the employer never matches it. Para 26(6) uncaps only where an EPFO approval reference
  is recorded.
- **The salary-structure `CTC` field holds GROSS and is labelled Base Pay** (column stays `ctc`).
  Basic % + DA % = 50, DA is the input and Basic is derived, enforced in the SERVER validator. Every
  named component sits INSIDE Base Pay; only bonus sits on top. Special allowance balances.

**Identity**
- **Every employee already has exactly one login.** `employees.user_id` is NOT NULL and uniquely
  indexed. "Employee with no login" is unreachable. The reverse IS reachable and unhandled: a login
  with no employee record gets a bare 404 from `hr.leave.create`.
- **Offboarding revokes access on a DATE, not on the event** — a daily job disables logins at end of
  day after `employees.end_date`. Do not add a second disable path.

**State vocabulary — three incompatible lists**
- **`professional_tax_slabs.state_name` is canonical for EMPLOYEE state.** The dropdown must match
  it; a guard test fails if they drift.
- **Anything on the GST path uses `GSTIN_STATE_CODES` and stores the two-digit CODE.**
  `normaliseStateToCode` does a lowercased EXACT match with no `&`/`and` handling, so a PT name
  resolves to `null` → unknown buyer state → a silently wrong intra-state split.
- **ISO 3166-2:IN codes ("KA", "MH") are a THIRD vocabulary and resolve to `null`.** The Setup Wizard
  once wrote one into `gstin_registry.state_code`, so every sale billed inter-state IGST.
- **The GSTIN is the authority on its own state — DERIVE it, never ask separately.** The first two
  characters *are* the code. `validateGSTIN` covers all 39 jurisdictions.
- **Normalise BOTH party states to a code before any intra-vs-inter compare**, via
  `normaliseGstStateOrWarn`. An ABSENT state logs nothing and defaults to intra-state.

---

## Generated documents (quotation, tax invoice, payslip, Form 16)

- **ONE mechanism: PDFKit, server-side, returning a `Buffer`**, served by a Fastify route and a
  same-origin Next proxy. Do not introduce a second.
- **"Rs.", never "₹", ASCII only.** PDFKit's standard-14 fonts are WinAnsi and have no U+20B9; the
  em-dash prints blank. `pdf-rupee-glyph.test.ts` scans all source, comments included. PDF-only —
  web surfaces use ₹.
- **The printed totals are the STORED totals.** A document renders what the engine wrote; it does
  not re-compute tax. A presentation breakup is reconciled against the stored aggregate and dropped
  if it differs by a paisa.
- **A document REFUSES rather than mislead.** Unknown buyer state, missing supplier GSTIN or place
  of supply, no line items, or a payable → **409 naming the field to fix**. A warning banner can be
  cropped away; a document never generated cannot be sent. Both refusal rules live in one exported
  helper per document.
- **A tax invoice is issued only for `invoice_flow = "receivable"`.** Rendering "our" tax invoice for
  a payable fabricates someone else's document under our letterhead.
- **Generate, do not file.** Document rendering never contacts a government portal.

---

## Conventions

- Make only the changes requested. No unrequested refactors, no premature abstraction.
- Read files before editing; never propose changes to unread code.
- **NEVER state that a file is committed, a commit exists, or a change is deployed without verifying
  it.** Quote `git log`/`status`/`show`. A commit hash you have not read is a fabrication.
- **NO COMMIT WITHOUT A BUILD.** Run `pnpm build` before every commit, not just `lint:cold`.
  Read the cache line: `Cached: N` where N < total means it genuinely rebuilt and the change
  compiles; **fully cached means the build proved nothing** — it only confirms the change touched
  no build input, which is the expected result for a docs-only commit and a red flag for any other.
- **Do not push while a CI run is in flight.** Check `gh run list --branch main --limit 1` first.
  A push to `main` deploys, and stacking one deploy on another in progress is how you get an
  unattributable failure.
- Don't commit unless asked. Stage specific files; never `git add -A`. Never commit secrets.
- **`git add` fails atomically on a missing pathspec** — passing a pre-rename path silently stages
  nothing. Never suppress stderr on a command whose failure matters, and verify the commit's
  diffstat rather than its exit code.
- **Other sessions may be editing this tree.** Confirm which process holds a port and which
  `DATABASE_URL` it has. Record a `git status` baseline at session start and diff against it at the
  end to prove you disturbed nothing else.
- **Hiding is not fixing.** Feature-flagging a fabricated surface, commenting out a nav entry,
  `testIgnore`-ing a failing spec — all quarantine. Allowed only as a temporary step with the wiring
  queued in `docs/PLAN-*.md` before the quarantine lands. The exception: never ship a claim that is
  false; reporting `not_implemented` is honest, asserting `implemented` over an unwritable table is
  the thing this rule exists to stop.

## Deploy

- **A push to `main` deploys.** CI runs Lint → Test → E2E → Build → **Deploy to Vultr**. "What is
  live" = the terminal `Deploy to Vultr` job of the latest main run (`gh run view <id> --json jobs`),
  not CI success alone. A failure before Deploy means Deploy is *skipped* and nothing shipped.
- `deploy-vultr.yml` is a separate MANUAL fallback. Do not read live state off it.
- Migrations auto-apply via the api container's `CMD node dist/migrate.mjs && node dist/index.mjs`;
  the `&&` stops the server booting if one fails. Live compose files are
  `docker-compose.vultr-test.yml` + `.vultr.images.yml` — **not** `docker-compose.prod.yml`.
- **Always take a snapshot before deploying.** Snapshots need the user's cloud credentials — Claude
  cannot take one. Treat pushing `main` as a deploy trigger: get the user's go, and say plainly that
  you cannot take the snapshot.

## Commands

| Task | Command |
|------|---------|
| Install / dev / build | `pnpm install` · `pnpm dev` · `pnpm build` |
| Pre-merge gate | `pnpm lint:cold` (needs `Cached: 0`) |
| Tests / E2E | `pnpm test` · `pnpm test:e2e` |
| Test DB | `pnpm docker:test:up` / `:down` / `:reset` |
| Migrations | `pnpm check:migrations` · `pnpm db:generate` · `db:migrate` · `db:studio` |

## Two things not to strip

- **The 100-employee `coheron-demo` seed was removed and must not return.** Base seeds
  (`db:seed`, `db:seed:modules`, `db:seed:smb`) remain. `db:seed:modules` aborts on
  `surveys_org_number_idx` and `db:seed:smb` on `hr_cases_org_number_idx` when re-run against an
  already-seeded DB.
- **`packages/db` carries `mongodb`** for the `hybrid`/`mongo` `DATABASE_PROVIDER` modes. No schema
  module references it, but `mongo-client.ts` is wired into `apps/api` startup, shutdown and request
  context. Dormant under the default `postgres` provider — removing it breaks the API build.
