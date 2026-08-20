# CLAUDE.md

Operating rules for Claude (and other AI agents) working in this repository.

**This file is RULES, not status.** It contains nothing that changes per commit — no SHAs,
no migration head, no "current state", no percentages. Those live at their source
(`git`, `packages/db/drizzle/meta/_journal.json`, `docs/CONTEXT.md`), and they have
drifted here twice before. If you find per-commit state in this file, it is a bug in
this file.

---

## Project

**CoheronConnect** (repo: NexusOps) — a multi-tenant India Enterprise Operations Platform.
Production: `connect.coheron.tech`. Remote: `github.com/Recon-X2025/NexusOps.git`.

pnpm + Turborepo monorepo, Node `>=20`.

- `apps/web` — Next.js 16 (webpack) + React 19 (port 3000)
- `apps/api` — Fastify 5 + tRPC 11; the bulk of business logic and tests; tsup → `dist/` (port 3001)
- `apps/worker` — Temporal background workflows
- `apps/mac` — super-admin / platform-monitoring console (port 3004)
- `apps/mobile` (parked), `apps/docs` (port 3003)
- `packages/db` — Drizzle schema + migrations (PostgreSQL), built to `dist/`
- `packages/payroll-math` — pure India payroll/tax/GST money-math
- `packages/types`, `validators`, `ui`, `metrics`, `config`, `cli`

For current state — what is live, what is uncommitted, what works — read `docs/CONTEXT.md`.
For the work queue and open risks, `reports/fix-plan.md`.

---

## THE REPORTING STANDARD

This is the most important section in the file. The recent rounds have been reliable
because of it.

- **A claim is UNVERIFIED unless you can paste the artifact that produced it.** Reading
  code, tracing a call chain, and matching a form to a schema are all UNVERIFIED — say so
  in those words.
- **No percentages. No "complete", "close", or "working"** for anything unverified. A
  prior audit rated a module 75% and CLOSE; clicking it found the edit dialog silently
  saved nothing.
- **Every report carries a NOT VERIFIED section. An empty one is itself a claim** — and
  usually a false one.
- **Do not stop when you have understood the code. Stop when you have RUN it** — or when
  something blocked you, and then name exactly what blocked you.
- **PARK AND CONTINUE.** A blocker on one item has no bearing on the next. Record the
  exact command that failed and move on. Finish the round.
- **Reach features BY CLICKING.** Router tests passed while two rounds' work was
  unreachable in the product.
- **A detector that finds nothing is usually a broken detector.** A form sweep found 5
  openers, then 30, then 38 as its selector was corrected. Distrust a clean result.
- **A guard failing after a change may be correctly detecting the change.** Establish
  which before editing either side. Say which in the report.
- **Report NOT-FOUND rather than trusting a stated `file:line`.** Search for the symptom.
  Line numbers in any document — including this one — may have moved.

---

## Build / test rules

- **Run BOTH `pnpm build` and `pnpm lint:cold`.** `lint:cold` (= `turbo run lint --force`)
  typechecks every workspace and catches errors `build` misses. Use `lint:cold`, NOT plain
  `pnpm lint` — `turbo run lint` is cache-aware and a warm `.turbo` returns a full cache
  hit that runs no typecheck at all. "9/9 cold" only means something when `Cached: 0`.
  CI typechecks **both** `apps/api` and `apps/web`; a green api typecheck alone is not
  sufficient.
- **`packages/db` is consumed via its compiled `dist/`.** After editing schema or types
  there, run `pnpm --filter @coheronconnect/db build` before `apps/api` will see it.
  Likewise rebuild `apps/api` before `apps/web` typechecks against new procedure types.
- **Tests run against a real Postgres**, not mocks. Test DB `coheronconnect_test` on port
  **5433** (`pnpm docker:test:up`); dev DB on port **5434**.
- **NEVER run vitest concurrently with the E2E chain.** They share one Postgres.
- **Kill ports 3000/3001 before E2E.** `playwright.config.ts` sets
  `reuseExistingServer: !CI` (two webServer entries), so a stale API will happily serve
  against a dropped database.
- **`preview_start` has repeatedly reported "reused" on a DEAD server.** Verify with
  `curl -s localhost:3001/health` before trusting it; if dead, `preview_stop` then start.
- **`apps/api/src/index.ts:3` runs `loadEnv({ path: "../../.env" })`**, so `env -u VAR`
  is undone by dotenv. A boot guard tested that way looks inert when it is fine.
  **Suspect the harness before filing a defect.**
- **tsx watch does not always pick up API edits.** If a procedure's new field is missing
  from a live response, restart the API before concluding the code is wrong.
- vitest config: `fileParallelism: false`, `pool: 'forks'`, `singleFork: true`, shared DB.
  Tests must be self-isolating — seed a fresh org per suite, clean up after. A spec that
  leaves a row behind can break a later spec that reaches for "the newest" record.

### Scale the gates to the change

A full E2E run costs 30–50 minutes and the full API suite ~20. Run them **once**, at the
end, after every known-breaking fix is already applied. Check machine load first — a run
started on a saturated box produces diffuse timeout failures that mean nothing. For a
change that touches neither routes nor schema, targeted specs plus the module's blast
radius is the honest gate.

---

## Database / migrations

- **Assert the migration count MOVED on a reset DB, and paste both numbers.** drizzle has
  reported "migrations applied successfully" while applying nothing.
- **The migration head is the last entry in `packages/db/drizzle/meta/_journal.json`.**
  Never trust a head number quoted in prose, including in this file.
- Drizzle diffs against **its own snapshot**, not the live DB. If a prior migration
  silently failed, drizzle cannot self-heal — hand-write a corrective migration, add the
  journal entry, create the snapshot.
- `pnpm check:migrations` only checks each `.sql` has a matching journal tag. **No hash
  check.**
- **Drizzle does not model RLS.** `CREATE POLICY` / `ENABLE|FORCE ROW LEVEL SECURITY`
  must be hand-appended to the generated `.sql`. Copy the stanza verbatim from
  `0061_walled_challans.sql`. RLS only bites because the request path drops to the
  non-privileged `app_runtime` role via `SET LOCAL ROLE` (`lib/trpc.ts`, `rlsTenant`);
  the app DB user would otherwise bypass it.
- **A new tenant table carries `org_id` AND its RLS policy in the same migration.** The
  tables with no `org_id` are the class every isolation leak lives in.
- **A migration that adds a unique index must detect duplicates first and RAISE**, naming
  table/value/org/row-count — never delete, merge or renumber. See `0086_aromatic_swarm.sql`.
- **A migration adding a column with per-row-appropriate values needs a hand-written
  backfill.** Drizzle emits one `ADD COLUMN … DEFAULT x`, which fills every row with the
  same value. See `0089_furry_tattoo.sql`.
- **A backfill is only half the job — the SEED is what every fresh database gets.** When a
  migration backfills, grep `packages/db/src/seed*.ts` for inserts into the same table in
  the same change.
- **Removing a value from a Postgres enum requires a migration and is not cheap.** To
  retire a configurable option, prefer the config table's own `active` flag.
- FK `onDelete` policy: `orgId → organizations` CASCADE; child → parent CASCADE; nullable
  actor SET NULL; NOT NULL actor RESTRICT; lookup table RESTRICT.
- **The dev DB is not auto-migrated and nothing checks it.** Confirm it is at the journal
  head at the start of a session; it was once found 14 migrations behind and login 500'd.
  Prod self-migrates on container boot.

---

## Recurring defect patterns — check these before assuming one write site

- **DEPRECATED TWINS.** Many procedures have a canonical version and a flat deprecated
  twin (`crm.movePipeline` vs `crm.deals.movePipeline`; `crm.updateLead` vs
  `crm.leads.update`). **A guard added to one and not the other leaves the defect fully
  reachable.** This has bitten repeatedly — most recently the deprecated `updateLead` had
  no guard at all while the canonical one did. The deprecated inputs were also frozen when
  written, so **zod silently strips every field added since**: the mutation succeeds, the
  toast says success, the data is gone. Do not delete the twins; extract the rule into one
  shared helper and call it from both. Guard: `crm-deprecated-mutation-sweep.test.ts`.
- **A config flag that exists is not a config flag that is used.** `active` on
  `crm_pipeline_stages` was honoured by the stage pickers and by nothing else — both the
  kanban board and the deal detail page had hardcoded ladders. **Verify the consumer, not
  just the flag.**
- **Identifiers.** Every user-facing record identifier is unique per org and allocated
  atomically from `org_counters` (`lib/auto-number.ts`). **Never mint one with
  `Math.random()` or `count(*)+1`** — both shipped and both produced duplicates.
  **Never synthesise a display identifier from a UUID substring**; two distinct records
  render identically.
- **Guards validate the TRANSITION, not the stored row**, so a new rule ships without a
  backfill and historical rows are never re-validated.
- **Idempotency must key on the durable fact, not on a mutable status.** Lead conversion
  keyed on `status === "converted" AND convertedDealId`; an edit that moved the status out
  of `converted` broke the AND and let a second conversion raise a duplicate deal.
- **Tightening an input breaks existing callers**, including tests and any external API
  client. Grep the suite before tightening, and say plainly in the commit that it is a
  contract change. **A test that fails afterwards is usually an outdated SETUP call, not a
  broken assertion.**
- **A check that appears to exist may not run.** A duplicate route in a shared registry
  made 699 tests collect-fail silently; every green CI run was green without them.
  Verify a gate *executes*, not merely that it is configured.
- **A mass failure with a uniform signature is ONE cause, not many.** Fifty-five modules
  do not break identically at the same moment.
- **Establish reachability before severity, and severity before priority.** A whole build
  pass was once spent on a defect no product path could trigger.
- **Trace a finding to cause before recording it as a fault.** An artefact of a cause you
  have already identified is not a new finding.

---

## Security rules that are easy to get wrong

- **`hr:read` is NOT "is this person HR" — every employee holds it.** The `requester`
  role, which every plain employee carries, is granted `hr: ["read"]`. Gating a
  self-or-role check on `hr:read` grants the whole company. **The real test is `hr:write`.**
- **One ownership helper: `assertSelfOrPermitted(ctx, employeeId, grants[])`**
  (`lib/self-or-permitted.ts`). Do not write a second. Where a user may SEE their own
  figures but not ACT on them, express that by NOT calling the helper on the acting
  procedure.
- **A missing rule in `trpc-procedure-rbac.generated.ts` falls back to PERMISSIVE**, but
  that gate is CLIENT-SIDE ONLY — the server still enforces `permissionProcedure`. A
  procedure absent from the map is a defence-in-depth gap, not data exposure. **Establish
  which before calling it a breach**, and read handler BODIES, not signatures. The map
  does not cover nested sub-routers imported from other files.
- **A green `/api/health` proves NOTHING about encryption readiness.** The local KMS
  provider's constructor only stores a key id; `APP_SECRET` is read in `kek()`, a per-call
  method (`apps/api/src/services/kms.ts`). The API boots clean without it and fails at the
  first encrypt.
- **In `apps/api/src/routers/hr.ts`, `bankAccountColumns(...)` must stay LAST, after
  `...rest`.** It overwrites the plaintext `bankAccountNumber` that spreads in from the
  input. Reorder it and plaintext account numbers are stored silently **while every
  existing test still passes**, because the tests assert the column holds ciphertext —
  which it would, until that line moves.
- **The Fastify HTTP routes bypass `rlsTenant` entirely** and are app-filter-only.
- **The RLS policy fails OPEN when `app.org_id` is unset.**

---

## Money paths — verify the invariant when touching these

- **Journal entries**: debits must equal credits (tolerance 0.001) — `routers/accounting.ts`.
- **Payroll**: `netPay = max(0, grossEarnings − totalDeductions)` — `lib/payroll-cycle.ts`.
- **GST**: intra-state = CGST+SGST (50/50), inter-state = IGST — `lib/india/gst-engine.ts`.
- **TDS / income tax**: `computeTax()` — `lib/india-tax-engine.ts`.
- **3-way match**: invoice ≈ PO ≈ GRN within tolerance — `lib/invoice-po-match.ts`.
- **EPFO ECR**: `buildEcrLine()` is the ONLY member-line builder. **The reported wage must
  be the wage the contribution was computed on** — `epfWages` reads the persisted
  `payslips.pf_wage_base`, never `slip.basic`. The ₹15,000 ceiling belongs on the wage base
  upstream and on EPS/EDLI only. Guard is an UPPER bound (employer ≤ 12% + ₹1); a floor
  produces false rejections because EPS caps and the 10% reduced rate legitimately push the
  ratio down.

---

## Standing decisions — do not relitigate

**Payroll operability**
- **Any date feeding a payroll PERIOD defaults to the PERIOD START, never `today`.** A
  structure dated after the 1st is not in force for that month and the employee is silently
  excluded. A tenant onboarding on the 25th once ran a payroll that paid nobody.
- **The approval chain is 2 or 3 steps, never 1, and needs that many DISTINCT accounts.**
  Segregation of duties is per step. The length is stamped onto
  `payroll_runs.approval_chain_length` at creation, so a mid-cycle change cannot alter a run
  in flight. **On a 2-step chain the FINANCE approval lands on `CFO_APPROVED`** — statutory
  generation and the bank file gate on that state.
- **Payslip access is SELF-SERVICE BY DESIGN.** The PDF route filters
  `eq(employees.userId, userId)`. Ruled working-as-intended by the owner: a payslip is
  personal salary data. Do NOT route it through an HR grant. HR retains visibility of every
  computed figure on the run itself.
- **A capability a tenant cannot reach is not shipped.** When an engine lands without a
  screen, record it as a GAP, not as done.

**India payroll**
- **PF composition, VPF and Para 26(6) are CONFIGURATION, not customer questions.** A DA
  component exists; PF/ESI/gratuity/leave-encashment bases read Basic+DA. VPF is
  employee-side only, capped so 12%+VPF ≤ 100% of the wage base; the employer never matches
  it. Para 26(6) uncaps only where an EPFO approval reference is recorded.
- **The salary-structure `CTC` field holds GROSS and is labelled Base Pay** (column stays
  `ctc`). Basic % + DA % = 50, DA is the input and Basic is derived, enforced in the SERVER
  validator. Every named component sits INSIDE Base Pay; only bonus sits on top. Special
  allowance is the balancing figure.

**Identity**
- **Every employee already has exactly one login.** `employees.user_id` is NOT NULL and
  uniquely indexed. "Employee with no login" is not a reachable state. The reverse IS
  reachable and unhandled: a login with no employee record gets a bare 404 from
  `hr.leave.create`.
- **Offboarding revokes access on a DATE, not on the event** — a daily job disables logins
  at end of day after `employees.end_date`. Do not add a second disable path.

**State vocabulary — three incompatible lists**
- **`professional_tax_slabs.state_name` is canonical for EMPLOYEE state.** The employee
  dropdown must match it; a guard test fails if they drift.
- **Anything on the GST path uses `GSTIN_STATE_CODES` and stores the two-digit CODE.**
  `normaliseStateToCode` does a lowercased EXACT match with no `&`/`and` handling, so a PT
  name resolves to `null` → unknown buyer state → a silently wrong intra-state split.
- **ISO 3166-2:IN codes ("KA", "MH") are a THIRD vocabulary and resolve to `null`.** The
  Setup Wizard once wrote one into `gstin_registry.state_code`, so the supplier had no
  resolvable state and every sale billed inter-state IGST — right total, wrong split, on
  documents customers claim input credit against.
- **The GSTIN is the authority on its own state — DERIVE it, never ask separately.** The
  first two characters *are* the state code. `validateGSTIN` covers all 39 jurisdictions.
- **Normalise BOTH party states to a code before any intra-vs-inter compare**, via
  `normaliseGstStateOrWarn`. An ABSENT state logs nothing and defaults to intra-state, so
  any surface where it matters must say so in the UI.

---

## Generated documents (quotation, tax invoice, payslip, Form 16)

- **ONE PDF mechanism: PDFKit, server-side, returning a `Buffer`**, served by a Fastify
  route and a same-origin Next proxy. Do not introduce a second approach.
- **"Rs.", never "₹", and ASCII only.** PDFKit's standard-14 fonts are WinAnsi-encoded and
  have no U+20B9; the em-dash prints as blank space. `pdf-rupee-glyph.test.ts` scans the
  whole source, comments included. This rule is PDF-only — the browser renders ₹ fine, and
  web surfaces use it.
- **The printed totals are the STORED totals.** A document renders what the engine wrote;
  it does not re-compute tax. A breakup derived for presentation is reconciled against the
  stored aggregate first, and dropped if it differs by a paisa.
- **A document REFUSES rather than mislead.** Unknown buyer state, missing supplier GSTIN
  or place of supply, no line items, or a payable → **409 naming the field to fix**. A
  warning banner can be cropped or forwarded away; a document never generated cannot be
  sent. Both refusal rules live in one exported helper per document.
- **A tax invoice is issued only for `invoice_flow = "receivable"`.** Rendering "our" tax
  invoice for a payable fabricates someone else's document under our letterhead.
- **Generate, do not file.** Document rendering never contacts a government portal.
  E-invoicing owns that round-trip already.

---

## Conventions

- Make only the changes requested. No unrequested refactors, no premature abstraction.
- Read files before editing; never propose changes to unread code.
- **NEVER state that a file is committed, that a commit exists, or that a change is
  deployed without verifying it first.** Run `git log`/`status`/`show` and quote the output.
  A commit hash you have not read is a fabrication.
- Don't commit unless explicitly asked. Prefer staging specific files over `git add -A`.
- Never commit secrets (`.env*`, credentials).
- **Other sessions may be editing this tree.** Confirm which process holds a port and
  which `DATABASE_URL` it has before using it. Leave files you were told not to touch
  alone, and verify at the end that their diffstat is unchanged.
- zsh quirks: multi-line SQL piped through commands breaks; `cd` with unquoted paths can
  error "too many arguments"; `!` triggers history expansion in `node -e`. Write a temp
  file and quote paths.

## Deploy

- **A push to `main` deploys.** CI runs Lint → Test → E2E → Build → **Deploy to Vultr**.
  "What is live" = the terminal `Deploy to Vultr` job of the latest `main` CI run
  (`gh run view <id> --json jobs`), not CI "success" alone.
- `deploy-vultr.yml` is a separate MANUAL fallback. Do not read live state off it.
- Migrations auto-apply on the deployed stack via the api container's own
  `CMD node dist/migrate.mjs && node dist/index.mjs`; the `&&` stops the server booting if
  a migration fails. The live compose files are `docker-compose.vultr-test.yml` +
  `.vultr.images.yml` — **not** `docker-compose.prod.yml`.
- **Always take a backup/snapshot before deploying.** Snapshots and deploy triggers need
  the user's cloud credentials — Claude cannot perform them. Treat pushing `main` as a
  deploy trigger: get the user's go, and say plainly that you cannot take the snapshot.

## Common commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev (all) | `pnpm dev` |
| Build all | `pnpm build` |
| Pre-merge gate | `pnpm lint:cold` |
| Full test suite | `pnpm test` |
| E2E | `pnpm test:e2e` |
| Test DB up/down/reset | `pnpm docker:test:up` / `:down` / `:reset` |
| Migration journal check | `pnpm check:migrations` |
| DB generate/migrate/studio | `pnpm db:generate` / `db:migrate` / `db:studio` |

## Demo data seed

The 100-employee `coheron-demo` seed has been **removed** and must not be reintroduced.
The base seeds (`db:seed`, `db:seed:modules`, `db:seed:smb`) remain. Note `db:seed:modules`
aborts on `surveys_org_number_idx` and `db:seed:smb` on `hr_cases_org_number_idx` when
re-run against an already-seeded DB.

## `packages/db` mongo dependency — do not strip

`packages/db` carries `mongodb` for the `hybrid`/`mongo` `DATABASE_PROVIDER` modes. No
schema module references it, but it is **not dead code**: `mongo-client.ts` is wired into
`apps/api` startup, shutdown and request context. Dormant under the default `postgres`
provider — but removing it breaks the API build.
