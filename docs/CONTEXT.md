# CONTEXT — session hand-off

_Updated 2026-08-07. A quick-start map so a new session picks up cleanly.
**Read `reports/fix-plan.md` first — it is the source of truth** for what is
done, pending, and blocked. This file points you at it and summarises._

---

## What CoheronConnect is

A multi-tenant **Enterprise Operations Platform** for the India market — payroll,
tax (TDS/GST), HR, accounting, CRM, ITSM, IT-asset, and governance/privacy, all in
one product, each customer isolated as its own tenant. Repo name is **NexusOps**;
the product is **CoheronConnect**; production is `connect.coheron.tech`.

Monorepo: pnpm + Turborepo, Node ≥20. `apps/api` (Fastify + tRPC) holds the bulk of
the business logic and tests; `apps/web` is the Next.js front end; `apps/worker` runs
background workflows; `packages/db` is the Drizzle schema; `packages/payroll-math`
is the pure money-math. Full map is in `BUILD.md`; conventions are in `CLAUDE.md`.

## Current stage

**Pre-production.** Seven pilot customers go live **end of August**. India
payroll/tax is the most mature area and is the go-live gate. **GST GSTR-1 (C7) is
now structurally complete** (first live filing target 11 October). The remaining
**payroll-blocking** items are under "Next in queue."

## Deployed commit & migration head

_Verify these with `git log` / `git rev-parse`, not prose — do not trust a SHA
quoted here without checking._

- **LIVE / `origin/main` = `9cec822`** (PAN audit workflow reaches the api container via `docker exec`
  instead of `docker compose`, fixing the `NEXUSOPS_WEB_IMAGE` abort; **workflow + docs only, IDENTICAL
  app code; no migration**). **Confirmed LIVE** — CI run **`31253488299`**, all five jobs green
  **including `Deploy to Vultr: success`** (see the exit-point line).
- **NOTE on local vs origin:** the exit-point refresh below is a **docs-only commit kept LOCAL and
  unpushed** (rule 6); it rides origin with the next code change, so local `main` may read **one commit
  ahead** (live code is `9cec822` on both).
- **`2bb3bac` (PAN edit-dialog double-encryption fix + audit)** was live via CI `31237849026`;
  **superseded by `9cec822`**.
- **⚠️ THE PAN AUDIT HAS NOT RUN YET.** Its first run failed on compose interpolation (fixed here).
  Production employee-PAN state is UNKNOWN — whether any row was double-encrypted between `5710dc2` and
  `2bb3bac` is not established. This **gates the PAN backfill** (don't backfill until the audit confirms
  the count; a double-encrypted row must be re-entered from source first). Trigger after this lands:
  Actions → "PAN Encryption Check (prod, read-only)" → Run workflow.
- **⚠️ OPEN — production employee-PAN state is UNKNOWN.** Prod may contain double-encrypted rows
  (any employee whose edit dialog was Saved after `5710dc2`). The prod-check ships in THIS commit and
  can only run **after this deploys** (Actions → "PAN Encryption Check (prod, read-only)" →
  Run workflow). Recovery for any affected row is re-entry from source — no computational recovery.
- **⚠️ INFRASTRUCTURE — Vultr auto-backups are NOT enabled** on prod; restore is manual snapshots by
  hand before each commit. A go-live risk (7 pilots, one instance, no auto-backup) — a settings
  checkbox, not a build. See `reports/fix-plan.md` → "PAN ciphertext… (2026-08-08)".
- **`e886a9c` (C2-STRUCT half-yearly PT)** was live via CI `31147028089`; **superseded by `d979038`**.
- **DEPLOY MECHANISM (clarified 2026-08-07 — this matters).** The Vultr deploy is the
  **terminal job of the `CI` (`ci.yml`) pipeline on every push to `main`**: Lint → Unit &
  Integration → E2E → Build Docker Images → **Deploy to Vultr**. It is **not** the standalone
  `Deploy Vultr` *workflow_dispatch* action (that manual rsync path exists too but has been
  idle since 2026-07-15 / `dd1dad9`; it is a fallback, not the primary route — do **not**
  read the primary deploy state off it). So the correct check for "what is live" is the
  **`Deploy to Vultr` JOB inside the latest `main` CI run**, via
  `gh run view <ci-run-id> --json jobs`.
- **`9960fc9` (C3 ESI) was LIVE** via CI run `31137358633` — now **superseded by `209e537`**
  (above). Migrations auto-apply in prod via the `migrator` service before `api` starts.
- **Migration head:** `0074_ambiguous_rick_jones` (`organizations.esi_establishment_number`, C6).
  Recent: `0070` B2CL threshold, `0071` credit/debit-note linkage, `0072` financial-note flag,
  `0073` ESI membership state, `0074` ESI establishment number. (`e74bfca` also adds COA seed
  account **4140** as seed data, not a migration; it reaches an org on re-seed/new-org and
  the note ledger posters return null gracefully if 4140 is absent.) Always re-confirm the
  live head from the last entry in `packages/db/drizzle/meta/_journal.json`.

## Since the HRA fix (`d7dff03`) — this session's work (all pushed AND deployed through `9960fc9`, via CI's terminal `Deploy to Vultr` job)

Grouped by area; each item has full detail in `reports/fix-plan.md`.

### Payroll statutory
- **C6 payslip mandatory statutory fields (this commit, mig `0074`) — mostly render-wiring.**
  The data (employee PAN/UAN/ESI-IP/bank; tenant TAN/EPF/CIN) already existed; the renderers filled
  the hard parts with blanks/zeros. **Headline DEFECT fixed: both renderers hardcoded ESI to ₹0
  while the printed TOTAL included it, so every ≤₹21,000 employee (all 7 pilots) got a payslip whose
  itemised deductions didn't sum to its own total.** One **shared payslip-view builder** now feeds
  both the PDF and the portal (a consistency test guards re-drift); ESI (emp+employer), TAN/EPF/CIN
  + new **ESI establishment number** (mig `0074`), paid/LOP days, and ESI IP number all render from
  stored values. Added a **run warning** when an ESI member lacks the org ESI est. number or their
  own IP number (not wizard validation — onboarding stays unblocked). **A15 decision:** built a
  payslip-view builder, NOT a general doc-header service (A17 is post-go-live); tenant portion lifts
  out later. **⚠️ DA flagged:** no DA column → PF basis reads basic alone; if any pilot pays DA their
  PF is understated (a filed wrong amount, not a display gap) — customers being asked. Full detail +
  open CA items (B17 address, ESI format, half-yearly PT note) + the dev-DB-stale follow-up in
  `reports/fix-plan.md` → "C6 … (2026-08-08)".
- **C2-STRUCT half-yearly PT (`e886a9c`, no migration) — levy period + full-period-or-flag.**
  Kerala added, Tamil Nadu converted to half-yearly, both assessed on the WHOLE six-month
  income from payslip history or **flagged** (never a partial-period amount). Two flag causes —
  DATA (missing migration history) and TIMING (unelapsed period tail). **Key finding: H2's
  Jan/Feb collection precedes the March period end, so H2 cannot be auto-assessed** — worked
  example: TN ₹12,000/mo, six months ₹72,000 (₹1,025 band) vs five months ₹60,000 (₹690 band).
  Kerala & TN PT therefore **manual for the first cycle** (H1 flags on migration gap, H2 on the
  tail). Full detail + open CA questions in `reports/fix-plan.md` → "C2-STRUCT half-yearly PT
  (2026-08-07)". Also corrected 7 stale doc claims (gender/DOB/exemptions are shipped; s.87A
  rebate relief is shipped as PT5; C3/C7-debit-note/A7-SCREEN statuses; Kerala was flagged not
  silent).
- **C3 (`9960fc9`, mig `0073`) — ESI six-month contribution-period rule (CA-ruled,
  ASYMMETRIC).** Was: eligibility decided purely on the current month's gross, so anyone
  crossing ₹21,000 was dropped. Now: **ENTRY assessed every month** (a non-member joins
  the month wages fall to/under ₹21,000), **EXIT only at a boundary** (1 Apr / 1 Oct; a
  member is retained on actual uncapped gross). Membership state on `employees`; the run
  assesses + persists it; the threshold uses the full-month pay scale (a part-month joiner
  grossed up), the contribution stays on earned gross. **The first build wrongly assumed
  symmetry** — corrected. This is the **2nd "looks symmetric, isn't"** (debit-note
  validations were the 1st): never code the mirror of a statutory rule on assumption.

### Payroll correctness
- **DUP-1 (`dd18e56` + `be88a02`) — the second India payroll engine retired.** A 416-line
  duplicate engine (`india/payroll-engine.ts`), reached via six **dynamic `await import(`**
  call sites and used by `hr.payroll.runMonthlyPayroll` to **write payslips + run totals**,
  carried the pre-fix version of every correction this week. Deleted it; retired
  `runMonthlyPayroll` (the `payroll.runs` pipeline is now the only payslip-writing path);
  rerouted the four surviving previews onto the live payroll-math engine; extracted the
  `#~#` EPFO ECR formatter verbatim (owner: keep for now — see open CA question 1).
  Equivalence test guards reintroduction. Lesson: sweeps must follow dynamic imports.
- **Phantom-fields v2 sweep → P-13/P-14/P-15.** **P-15 (`b71a69a`)** — the on-screen
  tax preview now includes a mid-year joiner's prior-employer (Form 12B) income (it
  derived a real FY join-month so the engine's mid-year branch fires). **P-14** closed
  (screen HRA already computes from `rentPaidAnnual`). **P-13** re-scoped: there is no
  Chapter VI-A declarations table/form anywhere, so it folds into **C1's declaration
  intake** (see open items) — not a one-liner.

### Finance / GST — C7 (GSTR-1) now structurally complete
- **M-07 (`497b24a`) — invoice line-item entry form + per-line detail rendering.** The
  A7-SCREEN prerequisite; invoices now carry real per-line data (taxable value, rate,
  HSN) that GSTR-1 groups on.
- **C7-1 (`5b36fd8`, mig `0069`) — AATO + HSN summary (Table 12).** Added
  `organizations.annualAggregateTurnover` (ingested in the India setup wizard) and the
  Table-12 HSN aggregation with the **dynamic digit rule** (4-digit HSN up to ₹5 cr, 6
  above), plus warnings for short/missing HSN and unset AATO.
- **C7-2 (`7de66cb`, mig `0070`) — B2CL segregation (Table 5) at ₹1 lakh.** Inter-state
  B2C above a **per-tenant threshold (default ₹1,00,000** — the GST Council's 2024
  reduction from ₹2.5 lakh) now files invoice-wise in Table 5, not consolidated in B2CS.
  Also fixed a flaky RBAC e2e.
- **C7-3 — credit & debit notes, end to end.**
  - Parts 1–4 (`caa5294`, mig `0071`): schema linkage (`originalInvoiceId`/date,
    `noteReason`), the `createCreditDebitNote` create path (reuses `computeInvoiceFromLines`
    — same ₹0.01 hard error), a **screen that reuses the invoice line-item editor**, and
    **Table 9** routing (CDNR registered / CDNUR unregistered), kept out of the supply
    tables and the HSN summary.
  - Part 5 credit-note ledger (`2cfb0ac`, mig `0072`, **CA-ruled**): **Dr Sales Returns
    & Allowances (4130, contra-revenue — NOT gross sales), Dr Output tax, Cr AR (1130)**,
    dated to the note's own period. Validations: **s.34 time limit** (a credit note after
    30 Nov of the invoice's FY becomes a **financial note** — no tax reversal, out of
    Table 9, with a clear notice); **value cap** (cumulative credit notes can't exceed the
    invoice); **rate-in-force** (reverse at the original period's rate).
  - Debit-note ledger (`e74bfca`, **CA-ruled**, seed account **4140**): the mirror —
    **Dr AR (1130), Cr Supplementary Sales & Adjustments (4140), Cr Output tax.** The
    time-limit and value-cap are **deliberately absent** for debit notes (s.34(3) sets no
    deadline; upward revisions have no ceiling) — the reasons are written into the code so
    nobody re-adds them for symmetry. Rate-in-force still applies.
  - POS needs **no** structural work (state is already a 2-digit code); **Table 11
    advances are out of scope for the pilot.**

### Security — PAN ciphertext in edit dialog, a DESTRUCTIVE bug (this commit, no migration)
- **The edit dialog showed the stored PAN ciphertext** (`hr.employees.list` returned the raw `v2:`
  envelope), and **Save re-encrypted it → double-encryption → original PAN unrecoverable.** Live on
  prod from `5710dc2` until now; found from a **user screenshot**, not a test. **THE CHAIN (the
  lesson):** importer scoping → found plaintext PAN → fixing it created the ciphertext-in-form bug →
  one Save from data loss. **An encryption change's READ paths must be audited as deliberately as the
  writes.** Fixed in four layers: envelope guard **inside** `panColumnsTolerant` (un-bypassable),
  list/get return `pan: null` + masked display, write-only masked dialog, PAN format validation
  (server + client). Chose **masked write-only** (DPDP; never return a decrypted PAN to the browser).
  Ships a **read-only prod audit** (`pan-prod-check.ts` + `workflow_dispatch`) to find double-encrypted
  rows post-deploy. Out-of-scope-but-recorded: director/shareholder/vendor forms show FULL plaintext
  PAN (non-destructive, they decrypt correctly); vendor PAN input lacks format validation. Full detail
  in `reports/fix-plan.md` → "PAN ciphertext… (2026-08-08)".

### Security / payroll — PAN-at-rest + null-structure drop (`5710dc2`, no migration)
- **Employee PAN was stored PLAINTEXT** by `hr.employees.create`/`update` (never stamping the
  match-hash/mask), while vendors + org encrypted theirs — the most sensitive PAN in the system,
  in the clear (DPDP exposure). **Census: 9/9 employee PANs plaintext on dev; prod is the same
  code path.** Fixed with a shared `panColumnsTolerant` helper now used by create, update AND
  importVendors (one impl, can't drift — how the defect arose). **Behaviour change:** an
  empty-string PAN on update now leaves the column untouched (can't clear a PAN via the form) —
  judged acceptable. **⚠️ PAN-BACKFILL is an OPEN item, not built** — existing plaintext rows need
  in-process re-encryption (needs APP_SECRET + pepper; a `.sql` can't do it); idempotent, safe to
  defer (decryptPan reads plaintext through); needs snapshot + dry-run + verify.
- **Null salary structure silently dropped the employee from payroll** (inner join + `continue`) —
  unpaid, no warning. Now a separate lookup flags each structure-less active employee by name
  through the run `errors[]` channel. Both found scoping the employee importer. Full detail +
  the importVendors-tolerance correction in `reports/fix-plan.md` → "PAN-at-rest… (2026-08-08)".

### Platform — per-org seed reconciler (SEED-DRIFT, this commit)
- **Startup seed reconciler** (`apps/api/src/lib/seed-reconciler.ts`) — closes the
  4130/4140 KNOWN LIVE GAP and the class behind it. COA is copied **per org** from a
  **growing** `INDIA_COA_SEED` array, so orgs seeded before an account was added silently
  miss it (that is exactly how the live org lost 4130/4140 and posted no note ledger).
  **Audit: COA is the ONLY seed with this drift** — statutory ceilings / tax config use the
  platform-default-row pattern (`orgId = NULL` + `isNull` fallback) and PT slabs are an
  in-code constant, so neither drifts; that pattern is the correct one. The reconciler is a
  **general registry** (`PER_ORG_SEED_RECONCILERS`) with **COA as the first (only) member**;
  future per-org seeds register there. Runs **after `fastify.listen`**, fire-and-forget,
  **never throws** (can't block/fail startup), **logs per org with the account codes** when
  it inserts and stays silent when aligned; `seedChartOfAccountsForOrg` now returns the
  inserted **codes** and is insert-only (balance-safe). 4 tests in `seed-reconciler.test.ts`.
  **Holidays year-staleness** is recorded as a **separate follow-up** (different shape — each
  new year needs seeding; an un-seeded year silently treats public holidays as working days)
  — see `reports/fix-plan.md` (SEED-DRIFT).

### Web / platform
- **F-DLG / F-PT-NIL (`c27385b`).** Employee dialog Save made reachable (fixed
  header/footer + scrolling body). An unknown/misspelled PT state (e.g. "Karnatak") is
  now flagged as a per-employee warning in the payroll run instead of silently returning
  nil PT.
- **RBAC-UI (`508b8ff`) — layout route guard.** Every `/app/*` page is gated on module
  read from one place (mirrors the sidebar map); the employee directory is scoped to the
  caller's own record for non-managers, and Add/Edit/Policy now gate on `hr:assign`
  (matching the API). This was a **read exposure, not a write hole** — the API already
  refused the writes.
- **Mobile parked (`8dee11e`) + `lint:all` dropped (`8192277`).** `apps/mobile` is
  dormant (3 of 221 commits, not in CI); removed its broken lint and the
  `--filter=!mobile` exclusion so the root `pnpm lint` covers every workspace, minus none.
- **State dropdown (`387e5a5`).** Free-text state → a 37-item `<select>` on both employee
  dialogs (Edit preserves an existing bad value as a correctable option). **Safety fix,
  not correctness:** it stops typos, but a valid-yet-unpopulated state (Kerala/Odisha)
  still resolves to nil PT with the `unknownState` warning until **C2-STRUCT** populates
  the slabs.

### Earlier this week (already deployed, pre-HRA — condensed; detail in fix-plan)
Statutory ingestion pass (`0000897`: state/gender/DOB/metro/PT-exemption flags reach the
engine; silent Maharashtra fallback removed) · **HRA (`d7dff03`, mig `0068`)**: s.10(13A)
exemption wired into the payslip engine (Tier-1 over-deduction fixed; `rentPaidAnnual`
added) · **M-05 (`a7d31ee`, mig `0065`)**: salary-structure family versioning · **PT1/PT2/
PT4 (`7a4a408`, mig `0067`)**: TDS on actual paid components + prior-employer 12B ·
**PT3/PT5 (`7b2f0e6`)**: surcharge cap + s.87A marginal relief · **C2-FIX**: KA/GJ/MH-female
PT slab corrections · **C5 (`67026dc`)**: income-tax rates → effective-dated config.

## Next in queue (payroll-blocking unless noted)

C7 (GST) is **done**. The remaining go-live gates:

- **C1 — Old vs New tax-regime (s.115BAC) election.** **Prerequisite (and the larger
  half): a Chapter VI-A declaration intake** — there is no 80C/80D/80CCD1B/80TTA/24b
  table, form, or effective-dating anywhere, so the **old regime is effectively unusable
  today** (all investment relief is silently 0, over-deducting every old-regime
  employee). P-13 is folded here. Shipping the election without the intake is actively
  harmful.
- **C2-STRUCT — professional-tax structure. PARTLY DONE (this commit + earlier).**
  ✅ **Half-yearly levy period shipped for the pilot** (Kerala added, Tamil Nadu converted,
  full-period-or-flag guard — see the half-yearly section above). ✅ **Gender / DOB / tier-1
  exemption ingestion done** (mig `0066`, read by `computePT`). Still open (non-pilot /
  deferred): month-specific **March** rates, full state population + explicit-nil, per-FY
  **YTD-PT cap ledger**. **⚠️ Kerala & Tamil Nadu PT is NOT auto-computable for the first
  cycle** — H1 flags on missing migration history, H2 flags on the unelapsed March tail
  (Jan/Feb collection precedes the March period end) — both handled manually until the CA
  reconciles. Open CA: H2 collection month, H1 Aug-vs-Sep, Kerala/Karnataka annualCaps.
- **C3** — ✅ **DONE & DEPLOYED** (`9960fc9`, ESI six-month rule; superseded framing removed).
- **C4** — PF ₹1,800 ceiling / VPF / joint-declaration override. **Verified: cap is correct
  and enforced (both sides, basis Basic+DA — but DA is effectively 0: no DA component exists,
  see the C6 DA flag); VPF is ABSENT and Para-26(6) has no ingestion — those are a BUILD, not
  an "extend".**
- **C6** — payslip mandatory statutory fields. **✅ DONE (this commit, mig `0074`)** — shared
  payslip-view builder, ESI reconciliation fix, tenant identity, paid/LOP days, ESI IP number,
  ESI-member missing-identity run warning. **Still open (needs CA/customers):** DA (PF-basis
  correctness if any pilot pays it), B17 address granularity, ESI number format, half-yearly PT note.
- **A12-D** — LOP split-logic defect (CA correction, against shipped A12).

Deferrable: C8 (tolerant filing-schema parsing), C9/A18 (Form 24Q → TRACES import).

## Payroll-model scoping (recorded, NOT built — see fix-plan 2026-08-06)

A coherent redesign of how structures, CTC and location relate:
- **CTC → employee; structures become percentage templates.** Add `employees.ctcAnnual`
  (single column first; effective-dated CTC history a fast-follow), move `ltaAnnual` with
  it; `medical/conveyance/bonus` annual amounts are captured but read by nothing.
- **Preview path skips the version resolver** (`payroll-run-aggregates.ts:142` joins the
  origin version directly) — fix in the same pass.
- **Location cluster (coupled): city dropdown → metro-derived-from-city → HRA % by city.**
  **GATED on capturing residential city.** Finding: `city` is **empty for every
  employee**; the populated "Bengaluru" lives in the separate `location` (work) field. For
  s.10(13A), metro is by **residence**, so metro-from-city cannot be built correctly until
  residence is captured — either relabel `city` as residential (cheapest) or add a
  `residentialCity` column. The real cost is data collection, not the derivation.
- **`hraPercentOfBasic` splits into metro + non-metro columns** on the template; the
  backfill sets **both to the existing value so nobody's pay changes on deploy** — HR
  then sets non-metro deliberately. **A pay decision, not a migration default.** HRA is
  the only location-varying component.
- Sequencing: state dropdown (done) → location cluster → CTC split. **None blocks C7.**

## Open CA (chartered-accountant) questions — resolve before any live cycle

The credit/debit-note reversal treatment is now **ruled and applied** (contra-revenue
4130/4140, s.34 rules). Two rulings remain outstanding and block a real customer run:

1. **ECR delimiter format.** DUP-1 preserved the retired engine's `#~#`-delimited ECR
   body (`india/ecr-format.ts`) verbatim per owner decision; the live engine's
   `generateECR` uses `|`. One is wrong against the EPFO spec — confirm and reconcile
   before filing.
2. **Revised Form 24Q with 1.5%/month interest.** Any period already filed on the
   pre-PT1 (shaved-CTC) or pre-HRA (no-exemption) TDS basis must be corrected via a
   revised 24Q with interest borne by the company. N/A on test; applies before the first
   live cycle.

## The five ratchets — all Done and green (Phase 1 complete)

| # | What it guards | Turned green by |
|---|----------------|-----------------|
| R-1 | All tenant tables sit behind the RLS wall | A11 (migration 0061) |
| R-2 | Custom-role permissions stay in the five-verb vocabulary | A6 |
| R-3 | DPDP notices are only recorded as sent if truly sent | A3 / A4 |
| R-4 | Money read-then-write can't double-count (concurrency lock) | A2 |
| R-5 | Audit-log hash chain can't be tail-truncated silently | B5 head-anchor |

## The audit & sweep system + where reports live

- **`.claude/skills/qa-map`** — run once before auditing (inventories subsystems, drafts
  `docs/quality-bar.md`, builds the checklist). **`qa-audit`** — deep audit of one
  subsystem against the quality bar, in plain English (the owner is not a developer).
- **`reports/fix-plan.md`** — THE source of truth (three-phase plan, status table,
  per-item detail, CA rulings). `reports/audit-*.md` (per-subsystem), `sweep-*.md`
  (cross-cutting — incl. `sweep-dynamic-imports.md` from DUP-1), `triage.md`,
  `audit-summary.md` (the five root causes).

## Standing rules (do not break)

1. **No commit without a Vultr snapshot.** Snapshots need the owner's cloud credentials —
   **Claude cannot take them**; ask the owner to confirm one exists.
2. **Never stage `.claude/settings.local.json`** (local permission config) — the one file
   expected to show dirty; leave it unstaged.
3. **Run `pnpm lint` from the repo root before any merge** — typechecks all nine
   workspaces (the CI gate). A green `apps/api` alone is not enough (CI also typechecks
   `apps/web`).
4. **Fairness check on every fix: red before, green after.** A fix that leaves its
   bug-blessing test in place is not finished.
5. **Check the GitHub Actions tab is empty before pushing** (concurrent runs have
   cancelled each other), and **don't commit unless explicitly asked.** Explain in plain
   English; never propose changes to unread code.
6. **Update this doc WITH a code change, never on its own (from 2026-08-07).** Fold the
   `CONTEXT.md` update into the same commit as the code change that is shipping — do NOT
   push a docs-only deploy. The **exit-point line at the very bottom records the last
   VALIDATED deployment**: the `main` **CI run id + commit** with its terminal
   **`Deploy to Vultr` JOB** confirmed `success` (verify with
   `gh run view <ci-run-id> --json jobs` — the deploy is a job *inside* CI, not the idle
   standalone `Deploy Vultr` workflow_dispatch), refreshed as part of that same code-change
   commit so a new session can trust what is live without guessing.

_After `packages/db` edits, rebuild its `dist/` before `apps/api` typechecks see them.
Test DB is `coheronconnect_test` on port 5433 (`pnpm docker:test:up`)._

---

## Last validated deployment (exit point)

**CI run `31253488299` — commit `9cec822` (PAN audit workflow reaches the api container via
`docker exec` instead of `docker compose`, fixing the `NEXUSOPS_WEB_IMAGE` interpolation abort;
workflow + docs only, IDENTICAL app code) — terminal `Deploy to Vultr` job `success` — 2026-08-08 —
migration head `0074_ambiguous_rick_jones` (no new migration).** Verified via `gh run view
31253488299 --json jobs` (all five jobs green: Lint · Unit & Integration · E2E · Build Docker
Images · **Deploy to Vultr**). This is what is LIVE on `connect.coheron.tech`. The deploy is the last
job of the `main` CI pipeline — **not** the standalone `Deploy Vultr` workflow_dispatch (idle since
Jul 15 / `dd1dad9`; a manual fallback only). Refresh this line with the next `main` CI run + its
`Deploy to Vultr` job as part of the next code-change commit.

_This exit-point refresh is a docs-only commit kept LOCAL and unpushed (rule 6 — no docs-only
deploy); it rides origin with the next code change, so local `main` may read one commit ahead._

> **⚠️ RUN NOW — PAN prod audit (workflow fixed in `9cec822`, first run failed on compose interp).**
> The prod-check script is in the live image and the workflow now works. Trigger it: GitHub → Actions
> → "PAN Encryption Check (prod, read-only)" → Run workflow. It reports whether any production employee
> PAN is DOUBLE-encrypted (edit dialog opened + Saved after `5710dc2`). Until it runs, prod PAN state is
> unknown; recovery for any affected row is re-entry from source. **This gates the PAN backfill.**
> **⚠️ PAN backfill still owed** — existing prod employee PANs are PLAINTEXT (`decryptPan` reads them
> through, so nothing is broken); an in-process idempotent backfill is owed (needs `APP_SECRET` +
> pepper). **⚠️ Vultr auto-backups NOT enabled on prod** — manual snapshots only; enable before go-live.
> See `reports/fix-plan.md` → "PAN ciphertext… (2026-08-08)".

_Prior validated deploys: `d979038` (C6 payslip fields) via CI `31162786896`; `e886a9c` (C2-STRUCT
half-yearly PT) via CI `31147028089`; `209e537` (seed reconciler) via CI `31141327969` — all superseded._

> **KNOWN LIVE GAP (2026-08-07) — being closed by the seed reconciler (this commit).**
> COA accounts **4130** (Sales Returns) and **4140** (Supplementary Sales), which the
> credit/debit-note ledger posters need, were added as SEED data — not a migration — so
> orgs seeded BEFORE they existed (incl. the live Coheron org) lacked them; the posters
> return null when absent, so notes filed in GSTR-1 Table 9 but posted **no GL journal**.
> **Fix shipped:** the user pressed "Seed India COA" on the live org (immediate), and a new
> **startup seed reconciler** (`apps/api/src/lib/seed-reconciler.ts`) now brings every org
> up to the current COA on each boot — insert-only, non-blocking, logs the codes it adds.
> This generalises the fix so the **next** COA addition cannot recreate the gap. Full audit
> + the separate **holidays year-staleness** follow-up are in `reports/fix-plan.md`
> (SEED-DRIFT). Takes effect on the next actual deploy.
