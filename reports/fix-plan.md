# Fix Plan — Bucket A, then Bucket B

_Written 2026-07-31. Execution plan for the findings triaged into buckets A and B
in `reports/triage.md`, driven by the root causes in `reports/audit-summary.md`.
No code has been changed by this document — it is the plan, not the work._

---

## How this plan is ordered, and why

The work runs in **three phases**, and the order matters more than it might look.

- **Phase 1 — Ratchets.** First we build the *tests and guards* that make a whole
  class of mistake impossible to reintroduce. These are the smallest pieces of
  work in the whole plan, but they protect everything that comes after them. If we
  fix a money bug in Phase 2 but don't first put a ratchet under it, the next
  change can silently bring the bug back — which is exactly how most of these
  defects reached the current build (see `audit-summary.md`, "tests that bless the
  bug"). Ratchets go first so the later fixes *stay* fixed.
- **Phase 2 — Correctness.** Then we fix the wrong numbers — money and statutory
  filings that reach a customer or a regulator. These are durable, hard to unwind
  once real data exists, so they come before the big feature builds.
- **Phase 3 — Completeness.** Last we build the missing halves — the features
  where the reading side exists but nothing ever creates the data. These are the
  largest builds; goods receipt in particular is a feature, not a patch.

Within each phase the items are grouped **by root cause and by code area**, so
related edits happen in one pass rather than being scattered across the calendar.
Every item names its reference implementation — a place the codebase *already*
does the same thing correctly — so nobody has to invent the pattern.

A note on the standing rule just added to `docs/quality-bar.md`: **every fix must
also correct any test that currently asserts the buggy behaviour.** Several items
below have a "the test that must change" line for exactly this reason. A fix that
leaves its blessing test in place is not finished.

**Root-cause numbers** are as in `audit-summary.md`: **#1** finished action wired
to the wrong destination; **#2** read-then-write with no lock; **#3** "same or
different" decided by comparing mismatched text; **#4** the reader was built, the
writer never was; **#5** ownership of a referenced record never checked.

---

## Status at a glance

Where every item stands. **Done** = fixed, committed and pushed. **Pending** = not
yet started. **Blocked-on-CA** = needs the chartered accountant's ruling before it
is worth doing. Keep this table in step with the per-item "Status:" lines below —
it is the summary; the item is the source of truth.

| Item | Bucket / phase | Status |
|------|----------------|--------|
| R-1 — all-tables RLS wall test | Phase 1 ratchet | **Done** (green; turned by A11) |
| R-2 — permission-vocabulary test | Phase 1 ratchet | **Done** (re-scoped + green; turned by A6) |
| R-3 — DPDP notice-honesty test | Phase 1 ratchet | **Done** (green; turned by A3/A4) |
| R-4 — money read-then-write concurrency test | Phase 1 ratchet | **Done** (green; turned by A2) |
| R-5 — audit-log tail-truncation test | Phase 1 ratchet | **Done** (green; turned by B5 head-anchor) |
| A2 — journal post double-count lock | Phase 2 (A) | **Done** |
| B2 — atomic numbering | Phase 2 pass (B) | **Done** |
| B2-comment — correct retry safeguard comment | Phase 2 pass (B) | **Done** (with B2) |
| B3 / B4 — approval read-then-write guards | Phase 2 pass (B) | **Done** |
| A1 — canonical GST state key | Phase 2 (A) | **Done** |
| A10 — three-way match tax basis | Phase 2 (A) | **Done** |
| A3 — DPDP notice delivery / honest recording | Phase 2 (A) | **Done** |
| A4 — DPDP erasure honesty | Phase 2 (A) | **Done** |
| A12 — LOP TDS + net-pay shortfall | Phase 2 (A) | **Done** — but **defect logged** (CA: split-logic, see A12-D) |
| A13 — Form 16 employer PAN/TAN/address header | Phase 2 (A) | **CLOSED — will not fix** (CA: no legal standing; reclassified HR-only preview, superseded by A18) |
| A5 — approvals producer | Phase 3 (A) | Pending |
| A6 — custom-role save (collapse to five actions) | Phase 3 (A) | **Done** (commit `e5d74ea`; R-2 re-scoped + green) |
| A9 — goods-receipt create path | Phase 3 (A) | API path **Done**; screen deferred (not closed) |
| A7 — persist invoice line items | Phase 3 (A) | API path **Done**; **screen gap — not user-reachable** (see A7-SCREEN, prerequisite for C7) |
| A7-SCREEN — invoice line-item entry screen | New — GST build | **DONE — shipped as M-07 (`497b24a`): invoice line-item entry form + per-line detail rendering.** Was the C7 prerequisite; GSTR-1 now groups on real per-line data. |
| A8 — statutory challan create path | Phase 3 (A) | Pending |
| B1 — first-response clock | Phase 3 pass (B) | Pending |
| A11 — RLS wall migration (three tables) | Phase 3 (A) | **Done** (migration 0061; R-1 green) |
| A16 — logo upload | Phase 3 build | Pending |
| A15 — one document-header source | Phase 3 build | Pending |
| A17 — branded invoice / PO PDFs | Phase 3 build | Pending |
| A18 — Form 16 TRACES import | Phase 3 build | Pending — **scope expanded** (CA: parse + map + self-service publish + bulk DSC signing; upstream Form 24Q dep — see A18) |
| B16 — payslip hardcoded header | Bucket B (doc-header theme) | **DONE via C6 (`d979038`).** The payslip now renders company name + TAN + EPF code + CIN + ESI establishment number from stored values (was hardcoded blank). See "C6 … (2026-08-08)". |
| B17 — no org address field | Bucket B (doc-header theme) | Pending |
| Ownership cluster (#5) — one shared guard | Bucket B | Pending |
| Identity/session theme (B8–B11) | Bucket B | Pending |
| Automation/reliability theme (B6, B7, B12, B13) | Bucket B | Pending (B5 **Done** — folded into R-5) |
| KMS legacy theme (B14, B15) | Bucket B | Pending (legacy CBC re-wrap + SSO-token encryption still owed; H-2 PAN done — **employee-PAN backfill UNNECESSARY: prod audit 2026-08-08 found 0 plaintext employee PANs**) |
| Test-hygiene — shift-schedule midnight flake | Bucket B | **Done** (clock pinned to noon; boundary-proof) |
| A12-D — LOP split-logic defect (CA correction) | New — Payroll | **DONE (2026-08-08).** Split-logic annual projection (current month actual + contracted for every other FY month) replaces `earned*12`; HRA cap on the same basis; non-LOP byte-identical. Known blind spot: past months estimated at contracted (PR5 zeroes real YTD). See "Employee bulk importer + A12-D … (2026-08-08)". |
| Employee bulk importer — `ingest.importEmployees` | New — Onboarding | **DONE (2026-08-08, commit `0c77dbd`).** Tolerant CSV import, dry-run default, PAN encrypted, structure-by-name with reject-on-ambiguous, atomic EMP-NNNN across all 3 sites. See the dated section. |
| C1 — Old vs New tax regime (s.115BAC) election | New — Payroll | Pending — **payroll-blocking**. **Scope corrected (2026-08-05):** the **investment-declaration intake** (table + UI + effective-dated read path + Feb/March lapse spread) is a **prerequisite** and the **larger half** — shipping the election without it is actively harmful (OLD with zero declarations is taxed worse than NEW). See "Two records (2026-08-05)". |
| C2 — Professional tax full state matrix (REVISED) | New — Payroll | **C2-FIX ✅ done** (KA/GJ/MH-female slab corrections, Feb rates); **gender/DOB/Tier-1-exemption ingestion ✅ done** (mig `0066`, read by `computePT`); **half-yearly levy period ✅ shipped for the pilot** (Kerala added + Tamil Nadu converted + full-period-or-flag guard — see "C2-STRUCT half-yearly PT (2026-08-07)"). **C2-STRUCT still pending** (non-pilot / deferred): month-specific **March** rates, full state population + explicit-nil, per-employee **YTD-PT cap ledger**. See C2 scope |
| C3 — ESI six-month contribution-period rule | New — Payroll | **DONE — shipped & deployed (`9960fc9`, mig `0073`; CI run `31137358633` `Deploy to Vultr` green).** ASYMMETRIC: entry assessed EVERY month (non-member joins the month wages drop to/under ₹21k), exit only at the 1-Apr/1-Oct boundary (member retained on actual gross). Grossed-up eligibility for part-month joiners. Membership state on `employees`. First build wrongly assumed symmetry — see "C3 correction (2026-08-06)" + the looks-symmetric-isn't pattern. |
| C4 — PF ₹1,800 ceiling (VPF / joint-declaration override) | New — Payroll | **Cap VERIFIED correct** (₹1,800 = 12% × ₹15,000, both employee + employer sides; basis Basic+DA — but DA is effectively 0, no DA component exists). **VPF is ABSENT** (no per-employee top-up) and **Para-26(6) joint-declaration has no ingestion** (an `isVoluntaryHigherPF` flag exists but is hardcoded false, and it uncaps rather than adds) — those are a BUILD, not an "extend". Payroll-blocking only for a pilot who actually holds a VPF/JD election (a customer question). See the CHECK 3 scoping. |
| C5 — Statutory rates → config table (effective-dated) | New — Payroll infra | **Done (income-tax only)** — PF/ESI%/gratuity are an explicit follow-up |
| C6 — Payslip mandatory statutory fields | New — Payroll | **DONE — shipped & deployed (`d979038`, mig `0074`).** Shared payslip-view builder feeds PDF + portal; ESI-reconciliation defect fixed (both renderers hardcoded ESI→₹0 while the total included it); tenant identity (TAN/EPF/CIN + new ESI establishment number) + paid/LOP days + ESI IP number render from stored values; ESI-member missing-identity run warning. Open (CA/customers): DA (PF-basis), B17 full address, ESI format, half-yearly PT note. See "C6 … (2026-08-08)". |
| C7 — GSTR-1 structural gaps (B2B/B2CL/B2CS, HSN, state code, Tables 9 & 11) | New — GST | **DONE (2026-08-06)** — C7-1 AATO+HSN Table 12 (`0069`), C7-2 B2CL Table 5 ₹1L (`0070`), C7-3 credit/debit notes Table 9 parts 1–4 (`0071`) + **part 5 credit-note ledger (contra-revenue reversal) + s.34 time-limit/value-cap/rate-in-force** (`0072`). **Debit-note ledger SHIPPED (`e74bfca`, CA-ruled, seed acct 4140) — the earlier "out of scope" note was stale.** POS no work (validation caveat); Table 11 advances + multi-invoice/inventory out-of-scope. See "C7 build log (2026-08-06)" + "Debit-note ledger…(2026-08-06)". |
| C8 — Tolerant filing-schema parsing | New — GST/Payroll infra | Pending — deferrable (robustness) |
| C9 — Form 24Q quarterly filing (upstream of A18) | New — Payroll/filing | Pending — deferrable (gates A18, not go-live) |
| DUP-1 — second payroll engine (`india/payroll-engine.ts`) | New — Payroll | **DONE (`dd18e56` + `be88a02`).** The 416-line duplicate engine is DELETED (file gone) and `runMonthlyPayroll` is retired (`payroll.runs` is now the only payslip-writing path); the four surviving previews reroute onto `payroll-math`; the `#~#` ECR formatter was extracted verbatim (see open CA #1). Equivalence test guards reintroduction. Was payroll-blocking; now closed. |
| P-15 — screen tax-preview ignores mid-year joiner's prior-employer income | New — Payroll | **Done (2026-08-05)** — `buildTaxProfileFromEmployee` now threads `previousEmployerIncome`/`Tds` **and** derives a real FY `joiningMonth` so the engine's mid-year branch fires (it was hardcoded `joiningMonth: 1`, so prior income was silently dropped from the on-screen projection while the run path included it). Red/green test `PT4-SCREEN`. See "Roadmap + correction records (2026-08-05)". |
| P-14 — screen HRA relief vs payslip | New — Payroll | **CLOSED — already fixed** (premise stale). `buildTaxProfileFromEmployee` already computes HRA exemption from `rentPaidAnnual` (payroll.ts:185-193); screen and payslip agree. No code change. |
| P-13 — declared 80C never reduces tax | New — Payroll | **Re-scoped → roadmap (not a thread).** Premise ("80C is form-captured and stored") is false: no `section80C…24b` column, **no form input**, no declarations table exist. Same build as **C1's investment-declaration intake** — folded there, not a one-line fix. |
| Bank reconciliation — capability audit | Roadmap record | **Complete & working** (CSV + scored auto-match, E2E-tested). Limitations deliberate: CSV-only, no live feed. See "Roadmap + correction records (2026-08-05)". |
| Credit-card / corporate-card import | Roadmap record | **Does not exist** — no tables/schema/import/feed. Post-pilot build item (SMB sales expectation). See "Roadmap + correction records (2026-08-05)". |
| Account Aggregator (RBI framework) feed | Roadmap record | **Roadmap** — would replace CSV upload with a consent-based read-only transaction feed; needs a regulated AA intermediary + has DPDP implications. Post-pilot; lawyer + CA question. |
| F-DLG — Add/Edit employee dialog Save unreachable @800px | New — Web (ingestion pass) | **Done (2026-08-05)** — both cards → fixed header/footer + scrolling body (`max-h-[90vh] flex flex-col`); Save always on screen. E2E `employee-dialog-scroll.spec.ts` @800px. See "Employee-form testing findings (2026-08-05)". |
| F-PT-NIL — unknown/misspelled PT state → silent ₹0 | New — Payroll | **Done (2026-08-05)** — `computePT` sets `unknownState` for no-config states (Delhi's empty-slabs ₹0 stays silent); run pushes a per-employee warning to `errors[]` (owner: flag-in-run, not reject-at-form). Same shape as the removed Maharashtra fallback. Red/green in `employee-statutory-ingestion.test.ts`. See "Employee-form testing findings (2026-08-05)". |
| RBAC-UI — no consistent page-level permission gate (read exposure) | New — Web (security) | **Done (2026-08-06)** — layout-level route guard (`route-permissions.ts` + `route-guard.tsx`) gates every `/app/*` page on module read, mirroring the sidebar map; employee directory hides Add/Edit/Policy behind `hr:assign` and filters to own record for non-managers. **Read exposure, not write** — API already blocked writes. Red/green in `route-permissions.test.ts`, `employee-directory-access.test.ts`, `e2e/rbac.spec.ts`. See "Testing findings (2026-08-06)". |
| SELF-SERVICE — no employee self-entry of statutory fields | New — Web (build item) | **Build item (2026-08-06)** — both portals read-only; PAN/UAN/bank/ESI/rent/80C all HR-keyed via the admin dialog; no joiner intake exists. Onboarding blocker for the 7 pilots (30–80 emp each) — outranks the bulk importer. See "Testing findings (2026-08-06)". |
| RBAC-UI-SRV — server-side scoping of `hr.employees.list` | New — API (security) | **Open (2026-08-06)** — RBAC-UI **reduced, did not close** the read exposure: the list still returns the full org roster to any `hr:read` holder; the client only filters what it renders, so the roster crosses the wire and is visible in the network response. Consumers to check when scoping: `hr/expenses` + `payroll` (both read this list). See "RBAC-UI follow-ups (2026-08-06)". |
| MOBILE-LINT — `apps/mobile` broken + near-abandoned lint target | New — Tooling | **Done — parked (2026-08-06)** — `apps/mobile` parked: removed its broken `eslint` lint script and dropped `--filter=!@coheronconnect/mobile` from the root lint, so the gate covers every workspace minus none. `pnpm lint` **and** raw `turbo run lint` both green (9/9). Revive → add `tsc --noEmit` lint. See "RBAC-UI follow-ups (2026-08-06)" + "Mobile parked (2026-08-06)". |
| TAX-REGIME-DEFAULT — regime elected by a DB default | New — Payroll/Onboarding | **DONE (importer) — 2026-08-08, commit `3d416c7`.** The importer refuses a file with **no taxRegime column** outright (whole request, nothing written) and makes a **blank cell in a present column** a named row skip — neither can reach the `"new"` default. Column presence is passed to the mutation as an explicit input (the modal drops blank cells, so absent-vs-blank is otherwise indistinguishable server-side). **`hr.employees.create` deliberately unchanged** (a form choice is a choice; the default is fine there). See "TAX-REGIME-DEFAULT closed … (2026-08-08)". |
| INERT-ALLOWANCES — 3 salary-structure fields read nowhere | New — Payroll | **OPEN — recorded, NOT fixed (2026-08-08 sweep).** `bonusAnnual`/`medicalAllowanceAnnual`/`conveyanceAllowanceAnnual` written + editable, read nowhere in compute; payslip hardcodes medical/conveyance `"0"` (`payroll.ts:489-490`). Gross = `(ctc+lta)/12`, so mislabelled-not-lost within CTC framing — but `ltaAnnual` (same UI) is additive, so ambiguous. Bonus-Act path inert (`bonus` fed 0). See "Read-only sweep findings (2026-08-08)". |

> **Phase 1 (Ratchets) is complete — all five are green.** R-1 (turned by A11,
> migration 0061), R-2 (turned by A6, re-scoped), R-3 (turned by A3/A4), R-4
> (turned by A2), and now **R-5 (turned by B5** — the audit-log head anchor +
> scheduled verifier; see the R-5 section). There is no longer a red ratchet.
>
> **Phase 2 (Correctness) is complete** — every item in the Phase 2 (A) and
> Phase 2 (B) buckets is **Done**. **A13 is now CLOSED (will-not-fix):** the CA
> ruled that a self-generated Form 16 Part B has no legal standing, so it is
> reclassified as an internal HR-only payroll-tax preview and removed from the fix
> list (A18 — importing the real TRACES certificate — supersedes it). **There are
> no longer any Blocked-on-CA items.** The CA's full ruling, the A12 split-logic
> defect it surfaced, and nine new items it raised are recorded in the
> **"CA ruling (2026-08-02) — decisions, one defect, nine new items"** section
> below (after Phase 3).

---

## Phase 1 — RATCHETS (build these first; they protect everything after)

These are guardrails: mostly tests, a little enforcement. None of them fixes a
user-visible bug on its own. All of them make a class of bug *un-reintroducible*.
They are cheap and they gate the later phases.

### R-1 — A test that proves every tenant table has its database wall (#5)

**What changes.** Extend the existing tenant-isolation test so it no longer checks
three hand-picked tables but **enumerates every table that carries an `org_id`**
and asserts each one has Row-Level-Security enabled and forced. This turns "we
remembered to wall the tables we thought of" into "the suite fails the moment any
walled-less tenant table exists." It directly closes the reason the three unwalled
tables (`shift_schedules`, `esi_challan_records`, `pt_challan_records`) slipped in.

**Reference implementation.** `apps/api/src/__tests__/tenant-isolation.test.ts:35-97`
already seeds two orgs and proves org B cannot read/update org A's `tickets`,
`chartOfAccounts`, `contractObligations`. Generalise its shape: read the table
list from the schema (every `pgTable` with an `orgId` column) and, for each, query
Postgres's catalog (`pg_class.relrowsecurity` / `relforcerowsecurity`) to assert
the wall is on. The RLS mechanism it must check is the one migration
`packages/db/drizzle/0052_odd_forgotten_wall.sql` installs (`FORCE ROW LEVEL
SECURITY` + a `tenant_isolation` policy).

**What could break.** The test will (correctly) go red immediately, because the
three unwalled tables are real. That red is the point — it becomes the failing
test that A11's migration (P-1 in Phase 2 dependencies below) makes green. It
should not have false positives as long as the "is this a tenant table?" rule
(has an `orgId` column) matches the RLS grant rule in `0052`.

**What test proves it.** This *is* a test. It proves itself: invert the wall on any
table and it fails.

**Re-run afterwards.** `data-layer-migrations` audit and `tenant-isolation` audit.

**Dependency.** This test must be **written before** the A11 migration (P2-W1) so
the migration has a red test to turn green — but it can be *committed* red only if
CI tolerates it; otherwise land R-1 and the A11 migration in the same change.

---

### R-2 — A test that pins the permission vocabulary (#4)

> **Ratchet re-scoped during A6 (2026-08-01) — now green.** The original ratchet
> (described below) pinned **three surfaces**: the UI, the **DB enum**, and the
> **`RbacAction` runtime type/checker**. Implementing A6 showed the third pin was
> **wrong**: `RbacAction`/`ROLE_PERMISSIONS` is the runtime authorization matrix
> (~754 `permissionProcedure` checks, `checkDbUserPermission`) and it **never
> reaches the `permission_action` enum** — the enum is touched only by the custom-
> role save path. Asserting `RbacAction ⊆ permission_action` pinned a relationship
> that does not exist, and could only have been satisfied by widening the runtime
> vocabulary to match a DB column it never consults — i.e. changing production
> behaviour to satisfy a test.
>
> **The test now pins the three surfaces that genuinely meet on the save path:**
> (1) the DB enum `permission_action` (read live from `pg_enum`), (2) the admin.ts
> create/update **input schema** (`ROLE_PERMISSION_ACTIONS`, imported — not copied),
> and (3) the custom-role builder **UI grid** (copied verbatim). The `RbacAction`
> compile-time assertion was removed. See
> `apps/api/src/__tests__/permission-vocabulary.test.ts` (rewritten header explains
> the scope decision). RED before (2 failing assertions), GREEN after (3/3).

<details><summary>Original R-2 framing (superseded by the re-scope above — kept for decision-history)</summary>

**What changes.** Add a test that asserts **all three** surfaces that speak the
permission vocabulary use the **same five values** — and fails if any one of them
diverges: (1) the RBAC-matrix **UI**, (2) the **permission checker** that reads
those actions at request time, and (3) the **database enum**. Today the database
enum `permission_action` has five values — `create, read, update, delete, manage`
(`packages/db/src/schema/auth.ts:248-254`) — while the roles UI offers seven
(`read, write, delete, admin, approve, assign, close`), and even the overlap is
loose (`write` vs `update`, `admin` vs `manage`). The test locks all three lists to
the five enum values so they can never drift again. — The "(2) permission checker"
pin was the mistake: the checker speaks `RbacAction`, a separate vocabulary from the
enum. The rewrite replaces it with the admin.ts input schema.

</details>

---

### R-3 — A test that a DPDP notice never resolves to a platform address, and never claims a duty was discharged (#1)

**What changes.** Add a test that runs the DPDP breach/erasure notice path and
asserts three things:
1. The destination is **the tenant's own configured DPDP contact** — never one of
   CoheronConnect's own inboxes, and never a hardcoded platform/regulator address.
   (The platform never contacts the Data Protection Board or affected individuals
   directly; that is the tenant's legal act, not the software's.)
2. If the tenant's DPDP contact is **unset**, the path **refuses cleanly** and
   records nothing as delivered — it must not silently fall back to any default.
3. The record's wording is honest: it may say only *"notice prepared and delivered
   to the tenant contact"*, and must **never** carry a `sent` / duty-discharged
   status. A test that would still pass if the code re-introduced a
   "statutory-duty-fulfilled" claim is not proving the requirement.

This is the ratchet under the single most dangerous root cause — false proof a
legal duty was discharged.

**Reference implementation.** The DPDP sweep test harness already exists
(`apps/api/src/__tests__/dpdp-sweeps.test.ts`, with its `LogOnlyDispatcher`). The
change is to make the assertion about **tenant-contact resolution and honest
wording**, not merely that an artifact row was written. The existing strong tests
to emulate for "assert the requirement, would fail if inverted" are the
webhook-dispatch and escalation tests
(`apps/api/src/__tests__/webhook-dispatch.test.ts`, `escalation-sweep.test.ts`).

**What could break.** Red now, because delivery is currently pointed at hardcoded
platform inboxes and the row is stamped `sent` regardless (A3). This becomes the
test A3 turns green.

**What test proves it.** Itself.

**Re-run afterwards.** `dpdp-privacy` audit; `background-automation` audit.

**Dependency.** Write before A3/A4.

---

### R-4 — A concurrency ("would-collide") test for the money read-then-writes (#2)

**What changes.** Add a test that fires the journal **post** twice concurrently on
the same draft entry and asserts the balance is applied **once** and only one post
succeeds. This is the ratchet under root cause #2. Without it, the Phase-2 lock fix
can be undone by a later refactor and no test would notice.

**Scope note (narrowed from the original plan — verified while writing R-4).** The
plan originally paired the post test with a same-shape test for the `count()+1`
"next number" allocator. Empirically, the numbering race does **not** corrupt the
final state: two concurrent `journal.create`s both read `count()` and mint the same
`JE-YYYY-00001`, the unique index `je_org_number_idx` (`accounting.ts:154`) rejects
the loser with a `23505`, and the `retryMutation` middleware (`trpc.ts:477-505`,
`MAX_ATTEMPTS = 3`) then re-runs the loser, whose retry re-reads the now-incremented
count and succeeds with the next number. The end state is two distinct numbers, both
callers succeed. Asserting that path "red" would manufacture a failure the system
actually handles, so R-4 tests **only** the genuinely-unhealed defect — the post
double-count, where the second post commits real money that no retry unwinds. (The
`count()+1` numbering is still a real weakness — see B2 and the trpc.ts safeguard-
comment fix below — but it is not a final-state ratchet.)

Making the post race fire on **every** run (rather than only when the OS scheduler
happens to interleave) required an instrumented `db` handle per caller — injected
via the ctx `db` override — that parks each caller at a shared barrier the instant
its first data `SELECT` (the "still draft?" read) resolves, releasing both only once
both have read. See the doc-comment in
`apps/api/src/__tests__/money-concurrency.test.ts`.

**Reference implementation.** The repo already has a 16-way race regression test
for the audit hash chain (`apps/api/src/__tests__/audit-hash-chain.test.ts`) built
around `pg_advisory_xact_lock` in `apps/api/src/lib/audit-hash.ts:112-128`. Copy
that test's "run N of these at once, assert exactly-once" structure.

**What could break.** Red now against the unguarded `journal.post`
(`accounting.ts:327-356`). Becomes the test A2 turns green.

**What test proves it.** Itself — remove the lock and it fails.

**Re-run afterwards.** `money-accounting` audit; `sweep-inconsistent-patterns`.

**Dependency.** Write before A2.

---

### R-5 — Turn the tamper-evident audit-log verifier on, and test tail-truncation (theme / B5)

**What changes.** Two small things. (a) Wire the existing hash-chain **verifier**
into a scheduled run so something in the live system actually checks the chain —
today it is written correctly but never verified. (b) Add a test that the verifier
detects entries deleted from the **end** of the chain (tail-truncation), which it
currently cannot. This is a ratchet because it makes tampering *detectable*, which
is the whole point of the chain.

**Reference implementation.** The chain primitive and `verifyAuditChain` already
exist (`packages/db/src/schema/auth.ts` hash columns; `audit-hash.ts`). The
scheduled-loop pattern to copy is any of the five correct BullMQ sweeps praised in
`background-automation` (e.g. the vulnerability-SLA loop).

**Correction (verified while writing R-5 — this ratchet is RED, not green).** The
original plan assumed the verifier already detects tail-truncation and only needed a
test to lock that in (a green ratchet). That is wrong: `verifyAuditChain`
(`audit-hash.ts:189-243`) re-derives the chain purely from the rows still present,
walking seq 1..k. Deleting entries off the END leaves seqs 1..k contiguous and
hash-consistent, so the loop finds nothing wrong and returns `ok:true`. There is no
persisted head high-water-mark (max seq / last entryHash) kept outside the audit table
for it to compare against, so truncation is invisible. R-5's tail-truncation test
therefore fails today (verified: after deleting seq 4,5 of a 5-chain, the verifier
reports `ok=true` over 3 entries) — putting R-5 in the same red-ratchet class as
R-1..R-4, not the green class. The two existing detectors (row edit → hash mismatch;
middle delete → seq gap) still pass, so the verifier is blind *only* to the tail.

**The Phase-2/B5 fix that turns it green.** Persist a per-org chain head-anchor (the
max seq and its entryHash) outside `audit_logs` — updated inside the same transaction
as each append — and have `verifyAuditChain` fail when the table's max seq is behind
the stored anchor. (Scheduling the verifier into a BullMQ sweep is the *other* half of
B5; deferred with the fix, not part of this test-only ratchet.)

**What could break.** Nothing now — R-5 is test-only and adds no runtime code. When
the anchor fix lands: scheduling a verifier that finds a *real* pre-existing break
would alarm on day one; on a fresh pilot instance the chain starts clean, so that is
low risk.

**What test proves it.** R-5 itself — it truncates the tail (deletes the highest
seqs) and asserts the verifier flags it. Red today; the head-anchor fix turns it green.

**Re-run afterwards.** `audit-log-integrity` audit.

**Pre-scheduling census (2026-08-02, before wiring the sweep).** Ran the real
`verifyAuditChain` across every org in both live DBs so no alarm starts firing blind:
- **Dev DB (real data, :5434): CLEAN.** 1 org (`95f138a7…`), 1 chained entry, `ok:true`.
  No real broken chain exists to alarm on.
- **Test DB (:5433): 10,067 orgs / 2,271 broken — test noise, not a finding** (tests
  that deliberately tamper and never tear down; see Bucket B item below).
- **The E2E-recorded broken chain (org `d03d1d9b…`, seq 2 missing,
  `docs/E2E_EVALUATION_FINDINGS.md:907-917`) is UNVERIFIABLE, not resolved.** That org
  no longer exists in the dev database, so we cannot tell whether the break was real or
  a snapshot artifact. Do not treat it as closed — if it recurs on data we still hold,
  the scheduled verifier will now catch it.

**Backfill contract (condition 2).** The one-time anchor backfill must NOT bless an
existing break. Anchoring a failing chain to its current `MAX(seq)` would permanently
accept the gap. Decision: the anchor row carries a `status` (`ok` | `broken`). A clean
org is anchored `ok` at its real head; an org that fails verification at backfill time
is anchored `broken` (recorded, not skipped) so the verifier/sweep keeps flagging it
every run until a human resolves it. Skipping silently was rejected — an anchorless
broken chain is indistinguishable from a legitimately new org and would never alarm.

**Dependency.** None; independent ratchet. (Its Phase-2 partner is the B5 head-anchor
+ scheduled-sweep work.)

**B5 shipped (2026-08-02) — R-5 is now green.** Both halves landed:
- **Head anchor.** New `audit_chain_anchors` table (`org_id` PK, `max_seq`,
  `head_hash`, `status` `ok|broken`, `updated_at`) in `schema/auth.ts`; migration
  `0062_warm_blacklash`. `appendAuditEntry` (`audit-hash.ts`) upserts the anchor
  inside the same per-org advisory-locked transaction as the insert, so the head
  advances atomically with each append. `verifyAuditChain` now, after its
  re-derivation walk, compares the live head against the anchor and fails on a
  shortfall (tail truncation), a head-hash mismatch, or a `status='broken'` latch.
  Orgs with no anchor (legacy chains) skip the check. The backfill honours the
  condition-2 contract above (structural breaks → `broken`).
- **Scheduled verifier.** `workflows/auditVerifyWorkflow.ts` — an hourly BullMQ
  sweep registered in `services/workflow.ts` beside the other sweeps. It re-derives
  every anchored org (most-recent-`updated_at` first, batch-capped) and, on the
  **first** detection of a break, latches the anchor to `broken`, writes a chained
  `audit.chain.verification_failed` row, and notifies the org's owners/admins.
  The `status` latch makes it notify-once (no storm on repeated ticks). A
  detector nobody runs detects nothing — this closes H-2.
- **Tests.** R-5 green; new `audit-verify-sweep.test.ts` (anchor advance,
  tail-truncation via anchor, legacy no-anchor stays green, sweep clean-no-notify,
  sweep latch+audit+notify-once). Full API suite **140 files / 1332 tests** green.

**Three regressions caught during B5 — the ratchet system working as designed.**
Adding the anchor table tripped guards that then made me fix the collateral damage
before declaring green:
1. **R-1 fired on the new anchor table.** `audit_chain_anchors` carries `org_id`,
   so by the exact rule 0052/R-1 use it is a tenant table and must be walled — R-1
   failed until I added `ENABLE + FORCE ROW LEVEL SECURITY + tenant_isolation` to
   migration 0062 (stanza copied verbatim from 0061). **This is R-1 doing its job:**
   the moment a new tenant table appeared without its wall, the ratchet named it.
2. **dms-workers mock DB.** Its in-memory `insert().values()` builder had no
   `.onConflictDoUpdate` — which the new anchor upsert calls through
   `appendAuditEntry`. Added a no-op to match the real DB surface.
3. **asset-expiry-alerts pollution flake.** Failed only under the full-suite run
   (cross-test pollution), passes in isolation and in the clean full run. Pre-existing
   — the B16 test-hygiene theme (tests don't tear down seed data), not a B5 defect.

**Dependency.** None; independent ratchet. (Its Phase-2 partner is the B5 head-anchor
+ scheduled-sweep work.)

---

**Phase 1 exit condition — MET (2026-08-02): R-1 through R-5 are all green.** Each
was committed red first (or landed with its Phase-2/3 partner), then turned by the
corresponding fix: R-1←A11, R-2←A6, R-3←A3/A4, R-4←A2, R-5←B5. From here on, every
later fix has a test waiting to confirm it and to stop it regressing.

---

## Phase 2 — CORRECTNESS (wrong money, wrong filings)

Durable, hard-to-unwind errors that reach a customer or a regulator. Grouped by
root cause and code area.

### Group 2A — Money read-then-writes, accounting router (#2)

All three items live in `apps/api/src/routers/accounting.ts`; do them in one pass.

#### A2 — Stop the journal post double-counting

**What changes.** In `journal.post` (`accounting.ts:327-356`) the code reads the
entry, checks `status === "draft"`, then updates account balances and flips the
status — with no lock. Two concurrent posts (or a retry) both pass the draft check
and apply the balances **twice**. Add a row lock: select the entry `FOR UPDATE`
inside the transaction before the status check, so the second caller waits and
then sees `status = "posted"` and stops.

**Reference implementation.** `apps/api/src/lib/audit-hash.ts:112-128` shows the
in-transaction locking discipline the codebase already uses
(`pg_advisory_xact_lock`); the depreciation engine is likewise row-locked. Either a
`SELECT … FOR UPDATE` on the journal-entry row or a per-entry advisory lock works.

**What could break.** A genuine mistake here could serialise posts too broadly and
slow batch posting; scope the lock to the single entry (or single account rows),
not the whole table. Watch the p95 latency budget.

**What test proves it.** R-4's concurrent-post test: two posts, balance applied
once.

**Re-run afterwards.** `money-accounting` audit.

**Status: DONE.** `journal.post` now selects the entry `FOR UPDATE` inside the
transaction before the draft check, so a concurrent post/retry waits and then sees
`status = 'posted'` and stops — the balances apply exactly once. This turned R-4
(the concurrent-post "would-collide" test) **green**. Committed and pushed.

#### B2 — Route every "next number" through the atomic counter

**What changes.** Replace the `count()+1` numbering — journal entries
(`accounting.ts:292-293`), journal reversals (`accounting.ts:377-379`), the DPDP
DSR reference (`compliance.ts:59-75`), and the employee/expense/purchase-request
numbers flagged in the sweeps — with the existing atomic allocator. This item is
bucket B (races need concurrency a single pilot customer won't generate) but it
shares the accounting-router pass with A2, so land it here.

**Why this is bucket B, not a corruption defect (verified while writing R-4).** The
`count()+1` race does **not** currently persist a duplicate number: when two creates
collide, the unique index `je_org_number_idx` rejects the loser and `retryMutation`
(`trpc.ts:477-505`, `MAX_ATTEMPTS = 3`) re-runs it to the next number. So the
protection today is *entirely* the unique index plus the retry — not an atomic
counter, despite the comment at `trpc.ts:469-472` claiming otherwise (see the
safeguard-comment fix below). The cost of leaving it is a wasted transaction + retry
per collision (latency and log noise under load), and a hard failure once collisions
exceed the retry budget (`MAX_ATTEMPTS`), not a corrupt ledger. Routing through the
atomic allocator removes the reliance on retry and the wasted work.

**Reference implementation.** `getNextSeq` / `getNextNumber` in
`apps/api/src/lib/auto-number.ts:53-91` — an atomic `INSERT … ON CONFLICT DO
UPDATE` counter that is safe under concurrency with no table scan. Note its
startup sync (`syncOrgCounters`, `auto-number.ts:113-162`) already advances the
counter past existing rows, so switching a site over won't reissue an old number.
The JE and DSR entities will need adding to `COUNTER_SPECS` (`auto-number.ts:14-31`)
if their format is to be sync-covered.

**What could break.** The number *format* must stay identical (e.g.
`JE-2026-00042`) so downstream displays and any string-parsing don't break — the
allocator returns a raw sequence; keep the existing prefix/padding formatting
around it. The counter and the table must agree at cutover (that's what
`syncOrgCounters` guarantees).

**What test proves it.** A new create-race test that asserts distinct numbers with
**no unique-violation retry** (i.e. the collision never reaches the DB) — since the
current code already reaches distinct numbers *via* the retry, the acceptance
criterion for B2 is that the retry no longer fires, not merely that the numbers
differ. (R-4 no longer carries a duplicate-number sub-test — see its scope note.)

**Re-run afterwards.** `money-accounting`, `hr`, `assets` audits;
`sweep-inconsistent-patterns`.

**Status: DONE.** Seven numbering sites now route through the year-scoped atomic
counter (`getNextSeq`/`getNextNumber`) instead of `count()+1` — the number format
is preserved at each. The `retryMutation` safeguard comment (B2-comment below) was
corrected in the same pass to describe the real mechanism, and now honestly credits
the counter for these paths. Committed and pushed.

#### B2-comment — Correct the retryMutation safeguard comment that credits a phantom atomic counter

**What changes.** The `retryMutation` rationale at `apps/api/src/lib/trpc.ts:469-472`
justifies retrying `23505` (unique_violation) by asserting "the org_counters atomic
counter prevents duplicate auto-numbers." For the `count()+1`-numbered paths (journal
create/reversal, DSR ref, etc.) that is false: those paths do **not** use the
`getNextSeq`/`getNextNumber` counter — what actually prevents a persisted duplicate is
the unique index rejecting the loser *plus this retry re-running it* to the next number
(verified empirically while writing R-4; catalogued as F-3 in
`reports/sweep-false-comments.md`). Rewrite the comment to describe the real mechanism:
the retry is the safety for these paths, not a redundant convenience over an atomic
counter — and note that the protection therefore depends on `retryMutation` staying in
place with its `23505` entry in `RETRYABLE_PG_CODES` (`lib/db-retry.ts:16`) and its
`MAX_ATTEMPTS` budget (`db-retry.ts:21`). Once B2 routes these paths through the real
allocator, the comment can then honestly credit the counter.

**Reference implementation.** None (comment-only). Pairs with B2: B2 makes the counter
claim *become* true for these paths; this item makes the comment honest until then.

**What could break.** Nothing at runtime — this is a comment. The value is preventing a
maintainer from trimming the retry (trusting the phantom counter) and silently
re-exposing duplicate numbers.

**What test proves it.** Not directly testable (comment); B2's create-race test is the
functional guard, and F-3 is the record of the discrepancy.

**Re-run afterwards.** `sweep-false-comments` (mark F-3 resolved when B2 + this land).

#### B3 / B4 — Guard the other approval read-then-writes and wrap multi-step writes (#2)

**What changes.** Add a lock/state-transition guard to leave-approve and
procurement approve/reject, and wrap the multi-step writes (e.g. leave reject)
in a transaction; fix the one leave-reject path that omits the caller's `orgId`
from its write filter. Bucket B, but same root cause and adjacent code — do it in
the same #2 pass.

**Correction (verified while implementing B3/B4).** The earlier draft said
"procurement already has an unused `version` column built for exactly this — wire
it." That is wrong. The `version` column is on `approval_requests`
(`schema/procurement.ts:441`), **not** `purchase_requests` — the latter has no
version column at all (its definition ends at `updatedAt`,
`schema/procurement.ts:119-152`). Selecting `purchaseRequests.version` therefore
resolves to `undefined` and crashes drizzle's `orderSelectedFields`. The shipped
fix instead carries a `status = 'pending'` predicate in the approve/reject
UPDATE's own WHERE clause: once the first decision lands, a racing second
decision matches zero rows and raises CONFLICT (compare-and-set on the single
legal `pending → approved|rejected` transition). Same guarantee, no schema
migration needed.

**Reference implementation.** Same as A2 (in-transaction `FOR UPDATE` lock for
leave-approve); the transaction wrapper pattern is the
`db.transaction(async (tx) => …)` already used in `journal.create`/`post`
(`accounting.ts:291`, `:340`).

**What could break.** The wrong-org stamp fix must use the caller's resolved
`org`, not the input — verify against the `rlsTenant` context.

**What test proves it.** A concurrent approve/reject test (R-4 shape) plus a
mid-write-failure test asserting no partial write —
`apps/api/src/__tests__/approval-concurrency.test.ts` (3 tests, fairness-checked:
leave-approve + procurement RED against the unguarded code, GREEN after).

**Re-run afterwards.** `hr` audit; `sweep-inconsistent-patterns`.

**Status: DONE.** leave.approve now reads under `FOR UPDATE` inside the tx;
leave.reject wraps both writes in one tx and its status write carries `orgId`;
procurement approve/reject use the `status = 'pending'` compare-and-set; and
`expenses.addItem`/`deleteItem` (same non-transactional multi-write shape) are
each wrapped in a transaction.

---

### Group 2B — Statutory & money inputs compared as mismatched text (#3)

#### A1 — One canonical state key, so GST stops charging IGST on local sales

**What changes.** GST intra-vs-inter-state is decided by a plain text compare in
`computeGST` (`packages/payroll-math/src/gst-engine.ts:61-62`:
`supplierState.trim().toLowerCase() !== buyerState.trim().toLowerCase()`). The
maths is correct; the **inputs arrive in different formats**. The onboarding wizard
stores the org's own state as a **2-digit code** (`primaryStateCode` /
`gstinRegistry.stateCode`, written in `services/orgWizardWrite.ts:100,123-132`),
while vendors/accounts store a **name** ("Maharashtra") in various callers
(`routers/ingest.ts:332-337` resolves `orgState` as `stateName ?? stateCode` and
passes `vendor.state`, a name). When one side is a code and the other a name they
never match, so a local sale is taxed as inter-state IGST. **Fix: normalise both
sides to the single canonical 2-digit GST state code at the boundary, before
`computeGST` is called** — convert names to codes via the existing state lookup so
the comparison is always code-vs-code.

**Reference implementation.** The CRM quote path was cited as the clean model:
`apps/api/src/lib/crm/quote-tax.ts` reads `stateCode` on **both** sides (org via
`gstinRegistry.stateCode`, account via `crmAccounts.stateCode`).

**Correction 1 (verified while implementing A1).** `quote-tax.ts` was NOT a clean
reference. There are **three** copies of `resolveOrgState` and they disagreed on
preference: `financial.ts:69` and `ingest.ts:120` returned `stateName ?? stateCode`
(prefer the NAME), while `quote-tax.ts:68` returned `stateCode ?? stateName` (prefer
the CODE). quote-tax only *appeared* correct because its buyer side
(`crmAccounts.stateCode`) is also a code, so it was code-vs-code by luck; the
invoice/vendor path is code-vs-freetext-name. The fix does not merely copy quote-tax
— it normalises **both sides to a canonical code at the compare boundary** (a shared
`normaliseGstStateOrWarn` reducing code-or-name → code via the existing
`GSTIN_STATE_CODES` map, reversed once in `payroll-math` as `normaliseStateToCode`),
and aligns all three `resolveOrgState` copies to prefer `stateCode`.

**What could break.** Anywhere that reads the state as a display name for output
(an invoice PDF showing "Maharashtra") must keep a code→name mapping for display —
normalise for *comparison*, not for *display*. A wrong mapping table would
mis-classify; the lookup must be the canonical GST state list. Per the standing
rule, a present-but-unrecognised state (a typo like "Maharastra") is **logged**
(`GST_STATE_UNRESOLVED`) rather than silently defaulted, so a wrong split leaves a
signal; an absent state stays the safe intra-state default.

**Correction 2 (verified while implementing A1).** The existing tests did NOT bless
the bug — they **sidestepped** it. `invoice-gst.test.ts` seeded the org GSTIN with
*both* `stateCode:"27"` and `stateName:"Maharashtra"`, so both sides resolved to the
matching name and it passed; `crm-quote-gst.test.ts` used codes on both sides. The
onboarding wizard, however, produces `stateCode` with `stateName` NULL — the shape
that actually triggers the bug. The test change seeds that real wizard shape
(`stateCode:"27"`, `stateName:null`) with the vendor as the name "Maharashtra", and
asserts **intra-state CGST+SGST**. It goes RED against the old code (mis-classified
IGST) and GREEN after the normaliser.

**Re-run afterwards.** `gst-invoicing` audit; `sweep-tenant-constants`.

**Status: DONE.** `normaliseStateToCode` (payroll-math `validators.ts`) reverses the
canonical `GSTIN_STATE_CODES` map; `normaliseGstStateOrWarn` (api `gst-engine.ts`)
wraps it with the log-on-unresolved signal; `financial.ts` (`gstInvoiceColumns`) and
`ingest.ts` (bulk-invoice path) normalise both sides before `computeGST`; all three
`resolveOrgState` copies now prefer `stateCode`; `invoice-gst.test.ts` seeds the
wizard shape. Full API suite green except the pre-existing intentional-RED ratchets.

#### A10 — Three-way match: compare like tax basis for like

**What changes.** The receiving control compares a tax-**inclusive** invoice total
against a tax-**exclusive** received value (`apps/api/src/lib/invoice-po-match.ts`),
so every GST-bearing invoice fails the match even when correct. Fix: compare
taxable value to taxable value (or inclusive to inclusive) — one basis on both
sides. This sits next to A1 (same "different formats compared as if the same"
cause) and touches the same GST area; do it in the same #3 pass.

**Reference implementation.** The line-level comparison in `invoice-po-match.ts`
that already uses tax-exclusive extended values (quantity × unit price) is the
correct basis; extend that basis consistently to the invoice side.

**What could break.** Rounding: taxable values and totals round at different
points, so keep the existing 0.001-style tolerance and don't tighten it.

**What test proves it.** A match test with a GST-bearing invoice that is genuinely
correct and must **pass** the three-way match; and a mismatched one that must fail.

**Re-run afterwards.** `gst-invoicing` audit.

**Status: DONE** — `invoice-po-match.ts` now compares `invoice.taxableValue` vs
`po.taxableValue` (both tax-exclusive), matching the already-exclusive GRN received
value and per-line extended values; the tolerance was left unchanged. New test
`invoice-po-match-tax-basis.test.ts` covers **both** paths — two-way (PO only) and
three-way (PO + GRN) — with a genuinely-correct 18% invoice that must pass and an
over-billed one that must still fail.

**Finding (uncovered while implementing A10).** The corrected matcher exposed that
`procurement.purchaseOrders.createFromPR` never populated `po.taxableValue` or the
PO line items' `taxableValue` — they stayed at the schema default of zero. This was
invisible while the match compared inclusive-to-inclusive, but with the correct
taxable-vs-taxable basis every PO created from a PR would fail on a phantom gap. The
PR total is already tax-exclusive (Σ quantity × unit price), so it is carried onto
`po.taxableValue`, and each line's `taxableValue` is set to quantity × unit price.
Fixed at the root; the existing `layer8` smoke test (`8.12 applyMatchToOrder`) then
passed **unmodified** — no blessing-test edit was needed. Full API suite green except
the pre-existing intentional-RED ratchets.

---

### Group 2C — False "done" on a legal duty (#1)

#### A3 — Deliver DPDP notices to the tenant's own contact, and stop claiming a legal duty was discharged

**Decision (build the mechanism now, leave the destinations unconfigured).** The
platform must never notify the Data Protection Board or affected individuals
directly — that is the tenant's legal act. The software's job is to prepare the
notice and hand it to the tenant's own compliance contact. Legal review of *what*
must ultimately be filed, and *by whom*, comes later, against a working system.

**What changes.**

1. **Per-tenant DPDP contact.** Add one configurable contact address per tenant —
   a named DPO or an in-house compliance mailbox — captured at onboarding. Breach
   and erasure notices are delivered **only** to this address. If it is **unset**,
   the path **refuses cleanly** with a clear error; it must **never** fall back to
   a default or a platform address.

2. **Delete the fabricated addresses.** Remove the three hardcoded platform
   inboxes in `apps/api/src/lib/notification-dispatcher.ts` (the
   `privacy@coheronconnect.coheron.com` and `dpb-india@coheronconnect.coheron.com`
   substitutions at lines ~93–100). **Nothing replaces them** — there is no
   platform address in this path at all.

3. **Honest recording — remove "sent" semantics.** Today the dispatcher inserts
   the artifact as `logged` and then flips it to `status: "sent"`
   (`notification-dispatcher.ts:~109`), which reads as "a statutory duty was
   discharged." The software cannot know that. Replace it so the record states only
   *"notice prepared and delivered to the tenant contact, at this time"* — remove
   the `sent` state entirely. Keep the existing `logged`/`failed` truth about
   whether the mail to the tenant contact actually left the building, but attach no
   statutory-fulfilment meaning to it.

**Reference implementation.** The five correct BullMQ loops in
`background-automation` (per-item isolation, bounded retry, status set only on real
success) are the model for "mark done only when the side effect happened" — here
the side effect is *delivery to the tenant contact*, nothing more. The DPDP
artifact table and dispatcher interface already exist
(`__tests__/dpdp-sweeps.test.ts`).

**What could break.** Any existing flow or test that expected a `sent` status, or
expected a notice to reach one of the deleted platform inboxes, will change
behaviour — those tests currently bless the bug (they assert the false "done") and
must be corrected in the same pass (quality-bar Tests rule). Onboarding gains a new
required-before-use field (the tenant DPDP contact); tenants that have not set it
will now get a clean refusal instead of a silent false success — that is the
intended, safer behaviour.

**What waits for legal (make it configuration, not code).** Whether any outbound
filing to the Board is ever made — and if so, by the tenant or on their behalf —
stays behind the **existing external-delivery config gate**, switched off until
sign-off. Nothing in this item enables external regulator delivery.

**What test proves it.** R-3 (tenant-contact resolution, clean refusal when unset,
no duty-discharged wording).

> **Coverage note.** The scratch `apps/api/src/dpdp-verify.test.ts` was **deleted**
> in this pass — it asserted the false `status: "sent"` that A3 removes, and was
> already broken (it read `result.processedCount`, which does not exist on
> `SweepResult`, so that assertion had been comparing `undefined`). After its
> removal, **R-3 (`__tests__/dpdp-notice-honesty.test.ts`) is the only test covering
> DPDP notice delivery** — it carries the whole surface. Do not weaken it.

**Re-run afterwards.** `dpdp-privacy` audit.

#### A4 — "Right to be forgotten" must either erase the person's data or say plainly what it could not reach — never report a fulfilment it didn't perform

**Decision (honest erasure now; the scope of erasure is configuration for legal).**
Removing the false "fulfilled" claim is strictly better than the current behaviour
regardless of what legal advises later, so it happens now. *Which* stores must be
purged, and the retention periods that override erasure, are configuration awaiting
legal sign-off — not code to be guessed at now.

**What changes.**

1. **No false fulfilment.** Fulfilling an erasure currently scrubs only the DSR
   request row and notification artifacts (`apps/api/src/lib/dpdp-erasure.ts`,
   `ERASURE_MAP`), leaving the employee/HR/PAN/CRM records intact — yet the request
   closes as "fulfilled." A request may **only** be reported fulfilled for the
   stores it actually erased. For every store it did **not** reach, it must tell the
   tenant plainly, in the erasure record, that the data there was **not** erased.
   This is the same #1 shape as A3 — never record "done" without the effect.

2. **Genuine erasure where it can reach.** Extend the `ERASURE_MAP` to the domain
   tables it is configured to cover, each anonymising the principal's identifiers.
   The list of covered tables is a **config list**, so legal can widen it later
   without a code change.

**Reference implementation.** The existing `ERASURE_MAP` mechanism in
`dpdp-erasure.ts` is the right structure; it needs entries for the domain tables
(HR employee, CRM contact, etc.), each anonymising the principal's identifiers. The
peppered-PII-hash approach (`pii-hash.ts`) is the correct anonymisation primitive.

**What waits for legal (make it configuration, not code).**
- **Which stores must be purged** on an erasure request — the covered-table list is
  configuration; ship it with the stores you are confident about and leave the rest
  explicitly reported as "not erased" until legal extends the list.
- **Retention periods** that override erasure — some records (payroll, tax) must be
  **kept** for a legal period and must not be erased on request. Model the retention
  window as configuration (there is a `retainUntilDate` concept already in
  accounting); until a store has a confirmed rule, it is reported "not erased," not
  silently wiped.

**What could break.** Erasure is destructive; enabling it against a store that
later proves to be under a retention duty would be a compliance error — which is why
coverage is opt-in config and everything else is honestly reported as unreached
rather than wiped. Existing tests that assert a request closes "fulfilled" while
only the request row was scrubbed currently bless the bug and must be corrected in
the same pass (quality-bar Tests rule).

**What test proves it.** A test that runs an erasure and asserts: (a) the
principal's data in a **covered** domain table is anonymised; (b) an **uncovered**
store is reported to the tenant as "not erased," never as fulfilled; and (c) a
request cannot close as "fulfilled" while any covered store was skipped.

**Re-run afterwards.** `dpdp-privacy` audit.

---

### Group 2D — Net-pay floor (payroll money) (#2/#4)

#### A12 — Fix the LOP tax over-deduction and surface the net-pay shortfall — DONE

**Premise correction (what the original entry got wrong).** The original entry
assumed the floor was latent — only reachable through a salary-advance / loan
recovery — and that the fix should carry the shortfall forward into an
"outstanding-balance concept the HR module already models". **Neither is true.**
There is no outstanding-balance / advance / loan model anywhere in
`packages/db/src/schema/` to carry into. And the floor is **reachable today**,
with no loan feature, through a real tax defect.

**Root cause (the reachable path).** `computeEmployeePayslip()` built `annualCTC`
from the **contractual** monthly salary (`basicMonthly*12 + …`,
`payroll-cycle.ts:285`), then handed it to `computeTax`, which treats `annualCTC`
as the annual gross and divides the resulting tax into monthly TDS. But
`computeGross` **LOP-reduces** this month's basic/HRA/special/LTA by
`lopFactor = daysWorked/daysInMonth`. So an employee on heavy unpaid leave was
taxed as if fully paid: TDS (plus PF/PT) could exceed the LOP-reduced gross, and
`netPay = max(0, gross − deductions)` **silently discarded** the excess. Money
vanished at the floor for anyone with enough unpaid leave.

**What changed.**
1. **Tax fix** — `annualCTC` now annualises the **LOP-earned** components
   (`basicEarned*12 + hraEarned*12 + specialAllowanceEarned*12 + ltaEarned*12`),
   so TDS tracks what the employee is actually paid. When `lopDays == 0` the
   earned figures equal the contractual ones, so this is **byte-identical** to the
   prior behaviour for every non-LOP payslip (the mid-year-join monthlies were
   left contractual — they only feed `computeTax`'s mid-year branch).
2. **Floor (Option 2)** — the shortfall is surfaced as a new
   `unrecoveredShortfall` field on `EmployeePayslip` instead of being swallowed:
   `netBeforeFloor = gross − deductions; netPay = max(0, netBeforeFloor);
   unrecoveredShortfall = max(0, −netBeforeFloor)`. Money can no longer disappear
   at the floor.

**Reference implementation.** `computeEmployeePayslip()` in
`packages/payroll-math/src/payroll-cycle.ts` (the canonical impl behind the
`apps/api/src/lib/payroll-cycle.ts` re-export shim). Rebuild the package
(`pnpm --filter @coheronconnect/payroll-math build`) so `apps/api` sees it.

**What test proves it.** `__tests__/payroll-lop-tax-floor.test.ts` (new):
byte-identical non-LOP invariance (reconstructs the pre-fix TDS via `computeTax`
with the old contractual `annualCTC` and asserts the payslip matches it exactly);
LOP lowers TDS; a heavy-LOP employee is not taxed above their own gross; and with
a large extra deduction `netPay == 0` while `unrecoveredShortfall` captures the
difference and `gross == netPay + (deductions − shortfall)` reconciles exactly.
The existing floor-identity blessing test
(`__tests__/money-invariants.test.ts:197`) stays valid (it uses full attendance)
and was extended with the `unrecoveredShortfall == 0` reconciliation.

**Follow-up (persistence gap — not yet done).** `unrecoveredShortfall` is
computed and returned but **dropped at persistence**: the `payslips` table has no
column for it. No migration was added now, but one is required **before any
salary-advance / loan-recovery feature lands** — otherwise the shortfall will
vanish at exactly the point it starts mattering (it is the amount that must carry
forward as still-owed). Tracked as a Phase-3/completeness follow-up.

**Re-run afterwards.** `payroll-tax` audit; `money-invariants` gate.

**A12-D — DEFECT logged against the shipped A12 fix (CA correction, 2026-08-02).**
The A12 fix above is **correct that money must not vanish at the floor**, but the CA
ruled its **TDS projection method is wrong**. What A12 shipped: it annualises the
**LOP-reduced earned** components (`basicEarned*12 + …`) — i.e. it **projects this
month's reduced earnings across the whole year**, taxing the employee as if every
remaining month will also be a heavy-LOP month.

**The CA's correct rule — split-logic, do not project reduced earnings forward:**
- **Current month:** compute TDS on the **actual earned** (LOP-reduced) salary for
  that month.
- **Remaining months of the year:** project on the **original contracted** salary,
  **not** the reduced figure. A month of unpaid leave is a one-off; the annual
  income estimate that drives TDS must assume the employee returns to full
  contracted pay for the rest of the year.

So the annual estimate the TDS engine uses is *(this month's actual earned) +
(contracted monthly × remaining months)* — a **blend**, not a flat annualisation of
either the reduced or the contracted figure. A12's uniform `earned*12` under-projects
annual income in a LOP month (it assumes the LOP repeats all year), which distorts
TDS the other way from the original over-deduction bug.

**Scope of the defect.** This is a **correction to the already-shipped A12**, not a
new feature — the split-logic projection replaces the `earned*12` annualisation in
`computeEmployeePayslip()` (`packages/payroll-math/src/payroll-cycle.ts`). The floor
/ `unrecoveredShortfall` half of A12 stays as shipped. The byte-identical non-LOP
invariance still holds (with `lopDays == 0`, earned == contracted == the blend, so
no non-LOP payslip changes). A new test must assert the blended annual estimate in a
LOP month (current-month earned + contracted × remaining), not `earned*12`.
_(Payroll — correctness of statutory TDS; tracked in the index as **A12-D**.)_

---

### Group 2E — Statutory document headers (tenant identity on filings) (#1)

These are root cause #1 in a new place: the identity is captured correctly at
onboarding, but the document generator reads it from the **wrong location** (or a
hardcoded blank), so the finished certificate reaches the employee/regulator with
the statutory fields missing. The money is right; the *destination* the header
reads from is wrong.

#### A13 — Form 16 reads employer PAN / TAN / address from the wrong place — CLOSED (WILL NOT FIX)

> **CA ruling (2026-08-02) — CLOSED, not fixed. Removed from the fix list.**
> The open question below ("is our Part B a deliverable or only a preview?") is now
> answered: **a self-generated Form 16 Part B has no legal standing.** The only
> Form 16 an employee is entitled to is the TRACES-generated certificate (A18). So:
> - **Do not fix the PAN/TAN/address header defect.** It is not worth engineering
>   effort — the document it fixes is not a legal deliverable.
> - **Reclassify the internal generator as an "internal payroll-tax preview,
>   for HR only."** Label it as such in the UI so no one mistakes it for an issuable
>   certificate; it must not be handed to employees or regulators.
> - **A18 supersedes it entirely** (import the real TRACES PDFs). All Form 16
>   deliverable work moves to A18.
>
> The rest of this section is retained for decision-history — it documents the defect
> and the reasoning that led to closing it. **No code change is planned for A13.**

**How Form 16 actually reaches an employee in India (the constraint that reframes
this item).** TRACES has **no live API** — CAPTCHA and KYC deliberately prevent
automated sync. The real, standard flow is **manual**: the tenant logs into
TRACES, clears KYC, requests the **bulk Part A and Part B** text files, downloads
a zip, runs the **official TRACES PDF Generation Utility** to produce the
per-employee PDFs, and those are the legally-issued certificates. Because TRACES
issues Part A **and** Part B, the certificate an employee is entitled to is the
TRACES-generated one — so our internally-generated Part B is, at most, an interim
preview, and may be **superseded entirely by the import build (A18)**. That is the
open question below; it decides whether A13 is worth doing at all.

**What changes.** `buildForm16Input` reads the employer's PAN, TAN and address
from `org.settings.pan` / `.tan` / `.address`
(`apps/api/src/lib/india/form16-aggregator.ts:117-122`), but onboarding writes
those to **direct columns** on the org record — `organizations.pan`,
`organizations.tan` (`packages/db/src/schema/auth.ts:56,63`) — and never populates
`settings.{pan,tan,address}`. So every internally-generated Form 16 prints **"—"
for employer PAN, TAN and address**, even though the values were captured. A Form
16 without the employer's TAN is not a valid certificate. Fix: read employer PAN
and TAN from the direct columns (`org.pan` decrypted via `decryptPan`, `org.tan`).
Address is the open sub-question — see B17; until a real company address exists,
the employer address should draw from the primary GSTIN's registered address
rather than a blank.

**Open question (gates whether to do A13 at all) — RESOLVED 2026-08-02: preview
only.** This was: "is our Part B a deliverable or only a preview?" **The CA
answered: preview only — a self-generated Part B has no legal standing.** The
header-field defect is therefore **not worth fixing**; the import (A18) supersedes
it and the generator is reclassified as an HR-only internal preview (see the CA
ruling box at the top of this section). A13 is CLOSED.

**Reference implementation.** The PAN read boundary already exists —
`decryptPan(org.pan)` is the same call the payslip and Form 16 routes use for the
*employee* PAN (`http/payroll-form16-pdf.ts:89`). The org row is already loaded in
the route (`http/payroll-form16-pdf.ts:86`); it just needs the columns threaded
into the aggregator instead of the `settings` lookup.

**What could break.** The employer PAN is stored encrypted (KMS envelope, H-2), so
the aggregator must decrypt it — it cannot print the ciphertext. Keep the
graceful-degrade fallback (a missing value must not crash generation) but see A15:
for a *statutory* field the right degrade is to **refuse** rather than silently
print "—".

**What test proves it.** A Form 16 fixture built from an org whose PAN/TAN live in
the direct columns (the shape onboarding actually writes) asserts the rendered
input carries the real employer PAN and TAN, not "—". A companion assertion that
the encrypted `org.pan` is decrypted, not printed as an envelope blob.

**Re-run afterwards.** `payroll-tax` audit; any Form 16 / statutory-document audit.

---

## Phase 3 — COMPLETENESS (build the missing producers)

Everything here is root cause #4: the reader exists, the writer was never built.
Grouped by code area. **Goods receipt is a feature build, not a patch — scope it
accordingly** (it is the single largest item in the plan).

### Group 3A — Governance producers (approvals, roles)

#### A5 — Give the approvals inbox something to create approvals

**What changes.** The approval queue, tables, and approve/reject UI all exist
(`packages/db/src/schema/approvals.ts`, `procurement.ts:415-449`), but no running
code files an approval request — only a demo seed does, so the gate is inert. Fix:
at each point the product says "requires approval" (purchase request over a
threshold, leave, expense), **create** an approval request as part of that action.

**Reference implementation.** The webhook/escalation sweeps show the "on this
event, create this downstream record" wiring; apply the same to "on submit,
create an approval step." The tables and status enums are already defined.

**What could break.** Approvals become a real gate — actions that used to complete
freely will now block on approval, which is the intended behaviour but must be
rolled out where the product actually promises a gate, not everywhere. Confirm the
thresholds with the pilot customer.

**What test proves it.** A test that submits an approval-requiring action and
asserts a pending approval row is created, and that the action stays blocked until
approved.

**Re-run afterwards.** `sweep-unreachable-features`; governance audits.

#### A6 — Let custom roles save (align the save path to the five database values)

> **Status: DONE.** The defect was that the custom-role builder UI offered seven
> action strings (`read/write/delete/admin/approve/assign/close`) but the
> `permissions.action` column is the `permission_action` enum, which accepts only
> five (`create/read/update/delete/manage`). Five of the seven were un-storable;
> two `as any` casts in `admin.ts` silenced the *type* error but not the *runtime*
> enum rejection, so any custom role ticking anything but `read`/`delete` failed to
> save.
>
> **Scope correction (during implementation).** The original plan below assumed the
> seven-word vocabulary lived on one shared axis with the enum, and proposed
> "collapsing" it — normalising `write→Update`, `admin→Manage`, and rerouting
> `approve`/`assign`/`close`. Investigation showed that is **wrong**: the seven-word
> vocabulary is `RbacAction` / `ROLE_PERMISSIONS` (`packages/types/src/rbac-matrix.ts`),
> the runtime authorization matrix, consulted by ~754 `permissionProcedure` checks
> and by `checkDbUserPermission` (`apps/api/src/lib/rbac-db.ts`). **It never reaches
> the `permission_action` enum.** The enum is touched only by the custom-role save
> path (`admin.roles.create`/`update` → `permissions` table). They are two separate
> systems that never meet. Rewriting the 754 runtime checks (or folding
> `approve`/`assign`/`close` into `manage`) would *widen platform permissions to
> satisfy a test* — the wrong trade. So the runtime matrix was **left untouched**.
>
> **What was actually done:**
> - **UI grid** (`apps/web/src/app/app/admin/page.tsx:479,488`) — the role-builder's
>   seven action columns are now the five enum values `create/read/update/delete/
>   manage`. (The *separate* built-in system-role matrix display at :943-946 still
>   shows the seven-word runtime vocabulary — correctly; it renders `RbacAction`, not
>   the custom-role save path.)
> - **admin.ts input schema** (`apps/api/src/routers/admin.ts`) — `create` and
>   `update` now validate `permissions[].action` against
>   `z.enum(ROLE_PERMISSION_ACTIONS)` (the five values, exported for R-2). Invalid
>   actions are rejected at the tRPC boundary with a clean validation error.
> - **Removed all four `as any` casts** (`:1068,:1073` in create, and the two mirror
>   casts in `update`). `perm.action` is now a genuine enum value; the compiler
>   enforces the alignment from here on.
>
> **Addendum (2026-08-02) — the edit path had the same hidden defect.** The initial
> A6 fix narrowed the *create* path and the checkbox grid, but a second call site
> survived: the **"Edit / Customize"** button (`apps/web/src/app/app/admin/page.tsx`
> ~:895-900) seeded the custom-role form by iterating `ROLE_PERMISSIONS` — the
> seven-verb *display* catalog — straight into the form's `permissions` array. So
> opening a built-in role in the custom-role editor pre-loaded `approve`/`assign`/
> `close`, verbs the CRUD matrix cannot represent and the `permission_action` enum
> rejects. The old `as any` casts had hidden this on the edit path exactly as they
> did on create; once the casts were gone, the compiler flagged it (this was the CI
> "Type check Web" failure). **Fix:** the form state's `action` field is now typed to
> the five-literal `RolePermissionAction`, and the edit-seed loop filters through a
> runtime type guard (`isRoleAction`) that keeps only the five CRUD verbs — the
> unrepresentable workflow verbs are dropped rather than seeded into a form whose save
> the enum would reject. No cast, and the API input schema was **not** loosened. The
> five-literal `ROLE_PERMISSION_ACTIONS` constant is now declared in the web page and
> kept in lockstep with the API's identical constant. Verified: `pnpm lint` (all 9
> workspaces, incl. the exact `cd apps/web && npx tsc --noEmit` CI runs) green.
>
> **R-2 was rewritten to pin the correct invariant** — see the R-2 row in the status
> table and the "Ratchet re-scoped" note below. Verified RED before (2 failing
> assertions on `[write, admin, approve, assign, close]`) and GREEN after (3/3).
> `pnpm --filter api tsc` and `pnpm --filter web tsc` both clean.
>
> **Real product limitation this surfaces** (tracked as a separate design item in
> Bucket B, below): a custom role can only express CRUD-shaped permissions, so it
> **cannot grant `approve`/`assign`/`close`** even though built-in roles can. That is
> a genuine gap in what custom roles can do — it needs a design decision (a
> workflow-verb mechanism), not a refactor of the runtime matrix.

<details><summary>Original plan (superseded by the scope correction above — kept for decision-history)</summary>

**What changes.** The roles UI offers seven actions; the DB enum allows five
(`auth.ts:248-254`), so realistic roles fail to save. **Decision made: collapse the
UI down to the five values the database already has — do not widen the enum.** The
RBAC-matrix screen maps to exactly **Read, Create, Update, Delete, Manage** (the
five `permission_action` values). **Approve, Assign and Close are removed from the
matrix**: they are *workflow* actions, not access levels, and belong in the role
definitions in the **Role Library** (which already work) rather than in the
`permissions` table.

- Change the RBAC matrix to offer only the five enum actions (`write`→`Update`,
  `admin`→`Manage`); drop `approve`/`assign`/`close`; reroute them to the Role
  Library; remove the `as any` casts.

**What could break.** Any existing role or code path that references
`approve`/`assign`/`close` as a *permission action* must be rerouted. — This framing
was rejected: those three are runtime `RbacAction` verbs used by ~754 call sites and
never stored in the enum, so "rerouting" them would mean rewriting the runtime
authorization matrix to satisfy a test. Not done.

</details>

---

### Group 3B — Procurement producers (the largest build) (#4)

These three are the biggest single build in the plan (see `triage.md`). They
belong together because they share the procurement/invoice data path and each is
useless without the others: you cannot match what you never received, and you
cannot rate-group GST on invoices that carry no lines.

#### A9 — Build the goods-receipt create path (feature build)

**What changes.** The goods-receipt table exists
(`packages/db/src/schema/procurement.ts:240-265`, `goodsReceiptNotes` +
`grnLineItems`) and the three-way match **reads** it
(`invoice-po-match.ts:66-68`), but nothing creates a goods receipt — so the
advertised three-way match silently runs as a two-way match. Fix: build the real
"receive goods against a PO" user path — a mutation that records received
quantities per PO line, with the status lifecycle the schema already defines
(draft → submitted → accepted/partial/rejected). **Scope this as a feature**: it
has its own UI, validation (can't receive more than ordered without an
over-receipt rule), and partial-receipt handling.

**Reference implementation.** Other procurement create paths (purchase request /
purchase order creation) are the structural model for a PO-scoped, org-stamped,
line-itemised create mutation. The three-way match consumer already tells you the
exact shape it expects (`grnByPoLine` keyed by PO line id).

**What could break.** This is new write surface — get the org-stamping and the
same-org check on the referenced PO right (see the ownership cluster, B/#5). Over-
and partial-receipt rules are business logic to confirm with the customer.

**What test proves it.** A test that receives goods against a PO, then runs the
three-way match and asserts it now genuinely matches invoice ≈ PO ≈ **GRN** (not
just invoice ≈ PO). Pair it with A10 so the tax basis is right.

**Re-run afterwards.** `assets` audit; `gst-invoicing` audit;
`sweep-unreachable-features`; `sweep-phantom-fields`.

**Dependency.** A10 (tax-basis fix, Phase 2) should land first or together, or the
new match test can't assert a clean pass.

> **Status: API path DONE — NOT fully resolved until a screen lands.** The create
> path shipped as `procurement.goodsReceipts.create` (+ `list`/`get`), over the
> existing schema (no migration). It enforces the ownership pair — the referenced
> PO must belong to `ctx.org`, and every submitted `poLineItemId` must belong to
> THAT PO — deriving GRN status (`accepted`/`partial_acceptance`/`rejected`) and
> rolling received/accepted quantities onto the PO lines + PO status in one
> transaction. Proven by `__tests__/goods-receipt-create.test.ts` (6 tests):
> a real three-way match (invoice ≈ PO ≈ GRN, `grnReceivedValue` populated), the
> two ownership negatives (foreign PO rejected, spliced foreign PO line rejected —
> both asserting **nothing is written**), the over-receipt reject, the
> accepted+rejected/reason guards, and a partial-then-second-receipt rollup.
> - **Screen deferred → A9 is NOT closed.** No `apps/web` screen ships in this
>   pass, so no user can create a receipt through the product — the feature stays
>   unreachable end-to-end until a "Receive against PO" screen lands. Track that
>   screen as the remaining half of A9.
> - **`purchaseOrders.receive` is superseded** (`procurement.ts` — stamps
>   `receivedQuantity` + PO status only, creates no GRN). Left in place untouched;
>   new receiving should go through `goodsReceipts.create`.
> - **No over-receipt (pilot rule) — CONFIRM WITH CUSTOMER.** The create path
>   rejects receiving beyond a PO line's outstanding quantity. If the customer
>   wants an over-receipt tolerance, that is a follow-up config decision.

#### A7 — Persist invoice line items from the real user path

> **CA ruling (2026-08-02) — UNBLOCKED, with a precise rounding contract.**
> The CA confirmed the model: **the line items are authoritative and the header is
> derived from them** (not the reverse). The rounding rule is fixed, not a matter of
> taste:
> - **Round per line**, using **half-up** rounding to **2 decimal places**, then
>   **sum the rounded lines to produce the header** total. (Do not sum unrounded
>   lines and round once at the header — round each line first, then add.)
> - A resulting **sum mismatch of ₹0.01 between the summed lines and the header is a
>   HARD ERROR, not a tolerance.** The reason is downstream: a ₹0.01 discrepancy
>   causes the **e-invoice / GSTR-1 payload to be rejected** by the portal. So the
>   invariant here is exact equality (`sum(rounded lines) == header`), enforced as a
>   validation failure that blocks the write — **not** the 0.001-style tolerance used
>   on the journal-entry balance check. This overrides the "line totals must
>   reconcile to the invoice header (the money invariant)" note below: reconcile
>   means *exact*, and a mismatch must refuse the invoice.

**What changes.** Invoice line items (`procurement.ts:288-320`, with per-line
taxable value / GST rate / CGST/SGST/IGST) are only ever written in tests, so real
invoices carry no line detail and GST rate-grouping runs on absent data. Fix: write
line items from the real invoice-create path, not just the test fixture. Per the CA
ruling above, **compute each line first (half-up, 2dp), then derive the header by
summing the rounded lines, and reject the invoice on any ₹0.01 sum mismatch.**

**Reference implementation.** `journal.create` (`accounting.ts:296-322`) is the
model for "insert a header, then insert its line rows in the same transaction" —
apply the same header+lines pattern to invoice creation.

**What could break.** GST per line must use the A1-normalised state key and the
correct rate; the line totals must reconcile to the invoice header (the money
invariant). Do it after A1 so the per-line GST is computed on a correct basis.

**What test proves it.** A test that creates an invoice through the real path and
asserts its line items persist and their **rounded** (half-up, 2dp) GST **sums
exactly** to the header — and that GSTR-1 rate-grouping sees them. A companion test
that a line set whose rounded sum differs from the header by ₹0.01 is **rejected**
(hard error), not silently accepted under a tolerance.

**Re-run afterwards.** `gst-invoicing` audit; `sweep-unreachable-features`.

**Dependency.** After A1 (canonical state key) so per-line GST is correct.
Related: **C7** (GSTR-1 structural gaps) reads these persisted lines — A7 gives it
real per-line data to segregate into B2B/B2CL/B2CS and to build the HSN summary.

**Implemented (2026-08-02).** Shipped as scoped. New shared helper
`apps/api/src/lib/invoice-lines.ts` (`computeInvoiceFromLines`): computes each line
with the GST engine (half-up 2dp), sums the **already-rounded** lines into the header
using integer-paise addition (so float drift can't creep in), and throws a
`BAD_REQUEST` if a caller-supplied header total differs from the summed lines by even
₹0.01. All three create paths take an optional `lines[]` and both compute the header
from it **and** persist the rows to `invoice_line_items` in the existing transaction:
`financial.createInvoice`, `financial.createReceivableInvoice`, and
`ingest.importInvoices`. When `lines` is omitted every path keeps its old single-line
behaviour byte-for-byte (back-compat). The persisted line shape matches exactly what
the GSTR-1 rate-grouping already reads (`accounting.ts:777-813`).

> **C7 CARRY-FORWARD — negative-line rounding.** The per-line rounder is
> `Math.round(v)/100`, which is **half-up for positive amounts only**:
> `Math.round(-0.5)` is `0`, not `-1` (it rounds toward +∞, not away from zero). Every
> `taxableValue` in A7 is a positive sale value, so the ruling holds today. But **credit
> notes and any negative lines (C7) must not reuse this path as-is** — they need an
> explicit away-from-zero rounder, or negative tax would round the wrong way and break
> the exact-sum reconciliation. This caveat is written inline in `invoice-lines.ts` at
> the `computeGST` call so it can't be missed when C7 credit notes are built.

#### A7-SCREEN — Invoice line-item entry screen (the A7 API is not user-reachable)

> **Screen gap confirmed by testing today (2026-08-04).** A7 built the `lines[]`
> path in the API, but **no user can reach it through the product.** This is the same
> shape of gap as A9 (goods-receipt create path Done in the API, screen deferred → A9
> not closed): the code is right, but nothing in the shipping UI feeds it, so the
> feature is unreachable end-to-end and everything downstream keeps taking the old
> single-line fallback.

**What the screen does today.** The Create Invoice form (Finance & Procurement →
Financial Management → New Invoice) accepts **a single taxable amount and one GST
rate**. There is **no way to enter line items** — no add-a-line control, no per-line
taxable value / HSN / rate grid. So the form can only ever produce a one-line invoice
with a header rate.

**Consequence — the whole A7 API build is dark in production.**
- The `lines[]` argument the three create paths accept (`financial.createInvoice`,
  `financial.createReceivableInvoice`, `ingest.importInvoices`) is never populated
  from a real user action, so every UI-created invoice takes the **omitted-`lines`
  back-compat branch** and writes **no `invoice_line_items` rows**.
- Because nothing writes `invoice_line_items`, the CA's **lines-authoritative** ruling
  (round each line half-up 2dp, sum rounded lines → header) is **never exercised** on a
  real invoice.
- The **₹0.01 exact-sum hard error** in `computeInvoiceFromLines` can't fire from the
  product path — there are no summed lines to disagree with the header.
- **GSTR-1 still falls back to the header-derived rate.** The per-line rate-grouping
  (`accounting.ts:777-813`) reads `invoiceLineItems`; with none written, C7's return
  keeps grouping on the single header rate — the exact defect A7 was meant to remove.

**What this means for C7.** C7 (GSTR-1 structural gaps — B2B/B2CL/B2CS split, HSN
summary, per-rate grouping) **cannot be demonstrated on real data** until this screen
lands, because it reads the per-line rows only this screen would produce. **A7-SCREEN
is a prerequisite for C7**, not an optional polish. (A7's API dependency on A1 still
holds — per-line GST needs the canonical state key.)

**What changes.** Add a line-item entry grid to the Create Invoice form: add/remove
lines, each with taxable value, GST rate, and (for C7) HSN/SAC; show the summed
header derived from the rounded lines; surface the ₹0.01 mismatch as a blocking
validation error (the API already enforces it — the screen just needs to send `lines[]`
and display the rejection). Keep the single-amount entry as a shorthand that maps to a
one-line `lines[]` payload, so the header path stops being a separate code branch.

**Reference implementation.** The API contract is already fixed
(`invoice-lines.ts` → `computeInvoiceFromLines`, and the three create mutations that
take `lines[]`); this is a **UI-only** build that wires a line grid to that existing
argument. Mirror any existing multi-line entry grid in the web app (e.g. journal-entry
line rows) for the add/remove/rounding-display pattern.

**What test proves it.** An E2E that creates an invoice through the screen with two
lines at different GST rates, asserts the `invoice_line_items` rows persist, and that
GSTR-1 rate-grouping now sees **two** rate buckets (not one header rate). A companion
E2E that a line set whose rounded sum is ₹0.01 off the shown header is **rejected** in
the UI (the API hard error is surfaced, not swallowed).

**Re-run afterwards.** `gst-invoicing` audit; `sweep-unreachable-features`;
`sweep-missing-surfaces` (this file's sweep) to confirm the partial-surface finding clears.

**Dependency.** After A7 (API — Done) and A1 (canonical state key). Blocks C7.

#### A8 — Build the create path for India statutory challans (TDS/ESI/PF/PT)

**What changes.** The challan tables exist
(`packages/db/src/schema/india-compliance.ts`, incl. `esi_challan_records`,
`pt_challan_records`) but have no real create path, so the customer cannot generate
the statutory filings the product promises. Fix: build the challan-generation path
that produces the records from payroll/compliance data.

**Reference implementation.** The payroll engine (production-grade per the audits)
already computes the ESI/PF/PT/TDS amounts; the challan create path assembles those
into the challan records. Follow the header+lines transaction pattern as in A7.

**What could break.** These feed real statutory filings — the amounts must come
from the verified payroll math, not be recomputed differently here. Reuse the
payroll outputs; don't fork the formula.

**What test proves it.** A test that runs a payroll cycle and asserts the matching
challan records are created with amounts equal to the payroll engine's outputs.

**Re-run afterwards.** `payroll-tax` audit; `india-compliance` checks;
`sweep-unreachable-features`.

**Dependency.** These tables are two of the three that lack the RLS wall — their
wall (Group 3D / A11) should exist before real challan data is written into them.

---

### Group 3C — ITSM producer (first-response clock)

#### B1 — Set the first-response clock when an agent actually responds

**What changes.** The first-response timestamp is read by breach alerts and manager
dashboards but is **never set — only cleared** (`__tests__/ticket-reopen-sla.test.ts`
hints at this), so every ticket looks response-breached and the dashboards are
wrong. Fix: set the timestamp on the first agent reply. Bucket B (a wrong dashboard
a watched customer can reconcile), grouped here as the last #4 producer.

**Reference implementation.** The ticket reply/update path is where the "first
agent response" event occurs; set the field there, once, if not already set.

**What could break.** "First" response must be idempotent — set only on the first
qualifying reply, not overwritten by later ones.

**What test proves it.** A test that posts an agent reply and asserts the
first-response timestamp is set (not just cleared), and that a fast reply does
**not** count as breached. This replaces the current test that only checks the
field is cleared (it blesses the "never set" behaviour).

**Re-run afterwards.** `itsm` audit; `sweep-phantom-fields`;
`sweep-unreachable-features`.

---

### Group 3D — The tenant wall migration (#5)

#### A11 — Add the RLS wall to the three unwalled tables

> **Status: DONE — migration `0061_walled_challans`; R-1 red→green.**
> Hand-written migration `packages/db/drizzle/0061_walled_challans.sql` walls
> `shift_schedules`, `esi_challan_records`, `pt_challan_records` with
> `ENABLE`+`FORCE ROW LEVEL SECURITY` + the `tenant_isolation` policy, copied
> verbatim from `0052`. `app_runtime` already had DML on all three (0052's
> `ALTER DEFAULT PRIVILEGES` auto-grants tables created after it), so no GRANT was
> needed. Journal entry `idx 61` added; `check:migrations` green (62/62).
> - **Framing:** the app-layer `eq(table.orgId, ctx.org.id)` filter is already
>   present on every current query against these tables, so this closes the
>   **defence-in-depth backstop** (the second, database wall) — **not** a live leak.
> - **Verification (RED→GREEN):** R-1 was red on **exactly** these three tables and
>   nothing else before; green after. Full suite: R-1 now green; the remaining reds
>   are the known ratchets R-2 (×2, A6) and R-5 (B5), plus the pre-existing
>   shift-schedule **midnight-wrap flake** (test-hygiene bucket, fix-plan status
>   table) which surfaces only when the suite finishes within ~2h of local midnight
>   (`minutesFromNow(120)` wraps past 00:00) — independent of this migration (the
>   RLS SQL touches no attendance/shift logic; all org-scoped shift reads still pass).
> - **Snapshot note (finding #32 — do not make it worse):** RLS stays invisible to
>   the Drizzle snapshot (no snapshot in this repo ever records it). The 0061 snapshot
>   is therefore a hash-rechained copy of 0060 (id/prevId only), matching the
>   0052-from-0051 convention. Populating RLS for just these three tables would be
>   **worse** — it would make the next `db:generate` emit a DROP for them. The correct
>   fix (declare `.enableRLS()`+`pgPolicy()` across all ~236 schema definitions) is
>   recorded as its own item under the **Bucket B → Schema-tooling theme (#32)**.
>   Enforcement stays with the R-1 test (reads the live `pg_class` catalog).

**What changes.** `shift_schedules` (`packages/db/src/schema/hr.ts`),
`esi_challan_records` and `pt_challan_records`
(`packages/db/src/schema/india-compliance.ts`) carry `org_id` but were never added
to the RLS policy set. Add a hand-written migration that enables `FORCE ROW LEVEL
SECURITY` + the `tenant_isolation` policy on all three, matching the others.

**Reference implementation.** `packages/db/drizzle/0052_odd_forgotten_wall.sql` is
the exact template — copy its `FORCE ROW LEVEL SECURITY` + `tenant_isolation`
policy stanza for the three tables. Hand-write it (Drizzle won't generate RLS) and
add the `_journal.json` entry, per `CLAUDE.md`'s migration rules.

**What could break.** RLS only bites via the `app_runtime` role drop in the request
path; background workers/seeds run as superuser and must already filter by
`org_id`. Adding the wall on an **empty** instance is safe and cheap — doing it
after real data exists is the expensive case, which is why this is bucket A.

**What test proves it.** R-1 (the all-tables wall test) goes from red to green.

**Re-run afterwards.** `data-layer-migrations` audit; `tenant-isolation` audit.

**Dependency.** R-1 written first (its red state is the acceptance criterion).
This migration should precede A8 writing real challan data into two of these
tables. (A6 no longer touches the schema — the permission-vocabulary decision is to
collapse the UI, not migrate the enum — so there is nothing to batch with it.)

---

### Group 3E — Document generation (branding + a single header source) (#4)

Three builds where the *producer* is missing or half-built. The identity to put
on a document is captured, but there is no way to attach a logo, no single place
the generators agree to read the header from, and — for invoices/POs — no
self-generated document at all. Do these together: they share the document-header
code area and A15's shared source is what makes A13/B16 stop drifting apart.

#### A16 — Logo upload (`logoUrl` has no writer — but object storage DOES exist)

> **⚠️ CORRECTION (2026-08-08): the old text below said "there is no file-upload
> capability anywhere / no object storage." That is FALSE** — see "Document &
> storage sweep (2026-08-08)". A real S3 service (`services/storage.ts`), a
> `documents` schema with versions/ACLs, and wired upload paths (`documents.upload`,
> `auth.uploadAvatar`) all exist. What is actually missing is **logo-SPECIFIC
> wiring**: `organizations.logoUrl` has **no writer** (grep-verified), so A16 is now
> a small build — a branding settings screen that uploads through the EXISTING
> `documents`/storage path and sets `logoUrl` — NOT a from-scratch storage build.
> (Caveat: the deployed prod stack ships no object-storage backend today, so even
> the existing upload paths fail in prod — see the sweep.)

**What changes (original text, corrected above).** `organizations.logoUrl` exists
(`packages/db/src/schema/auth.ts:46`) and the payslip template already has code to
place a logo (`services/payslip-pdf.ts:158-160`), but **nothing populates the
field** (no writer). It needs (a) a branding settings screen that (b) uploads the
image through the existing storage path and (c) writes `logoUrl`. Scope it as a
small build on top of what exists, not a new storage subsystem.

**Reference implementation.** The DMS upload/scan path
(`apps/api/src/services/storage.ts` — upload, size, SHA-256, scan) is the existing
model for accepting a file server-side; a logo upload is a smaller, image-only,
org-scoped version writing to `organizations.logoUrl`.

**What could break.** Untrusted image upload is an input boundary — enforce type
(PNG/JPEG), a size cap, and the same scan the DMS applies; never render an
unvalidated blob into a PDF. Logo is optional, so every generator must still
produce a valid document when `logoUrl` is null.

**What test proves it.** An upload test (valid image → `logoUrl` set; oversize /
wrong-type → rejected) plus a generation test that a payslip renders both with and
without a logo.

**Re-run afterwards.** any branding / document audit; `storage` / DMS audit.

#### A15 — One tenant document-header source every generator reads from

**What changes.** Today each generator sources the header independently — the
payslip route from hardcoded blanks (B16), Form 16 from `org.settings` (A13) — so
the same field (TAN, address) is read three different ways and drifts. Build **one
tenant document-header resolver**: given an org (and optionally a GSTIN), it
returns the canonical `{ companyName, address, logo, pan, tan, pfCode, gstin, cin }`
from the correct columns, decrypting the PAN once. Every generator (payslip, Form
16, and the future invoice/PO in A17) reads from it. **For a statutory field it
must refuse, not render a blank**: if a required field (e.g. employer TAN on Form
16) is missing, generation returns a clear "cannot produce a compliant document —
TAN not configured" error rather than a certificate with "—" in the mandatory box.

**Reference implementation.** A13 and B16 each already resolve part of this header;
this collapses them into one function so the resolution lives in a single place.
The "refuse rather than emit an invalid artifact" stance mirrors R-3/A3's DPDP rule
(refuse cleanly, record nothing as delivered, rather than claim a duty discharged).

**What could break.** Making a missing statutory field *refuse* turns what is today
a silent blank into a hard stop at generation time — intended, but it means orgs
that never finished onboarding (no TAN) can no longer download a Form 16 until they
do. That is the correct behaviour; surface it as a clear message, not a 500.

**What test proves it.** A13's and B16's assertions re-expressed against the shared
resolver, plus a refusal test: an org missing a statutory-required field yields a
clean refusal, never a document with the field blank.

**Dependency.** A13 + B16 fold into this once it exists (they are the interim
single-generator fixes); B17 (address source of truth) must be decided so the
resolver has an address column/rule to read.

#### A17 — Branded invoice and purchase-order PDFs (none are generated today)

**What changes.** There is **no self-generated invoice or PO document** — a grep
for any invoice/PO PDF generator finds nothing. Invoices leave the system only as
JSON to the e-invoicing portal, which returns the *government*-signed copy; the PO
is a database record with no printable form. Build invoice + PO PDF generators
(PDFKit, the same library the payslip/Form 16 use) that read their header from the
A15 shared source, so the supplier's legal name, address and **GSTIN** — all
already captured (`gstinRegistry`, `accounting.ts:199-204`) — appear on the
document, alongside the GST-invoice mandatory fields (invoice no./date, place of
supply, HSN, CGST/SGST/IGST split). Scope as a feature per document.

**Reference implementation.** `services/payslip-pdf.ts` / `services/form16-pdf.ts`
are the structural model for a PDFKit generator; the GST field set already exists
on the invoice + line-item schema (and A7 persists the lines this reads).

**What could break.** A GST tax invoice has legally-mandatory fields; a
partially-populated invoice PDF is worse than none. Route the header through A15's
refuse-on-missing gate so an invoice missing GSTIN cannot be produced.

**What test proves it.** A generation test that a produced invoice carries the
supplier GSTIN + legal name + place of supply + tax split, and refuses cleanly when
the GSTIN is absent.

**Dependency.** A15 (shared header source) first; A7 (invoice line items persisted)
for the line/tax body.

#### A18 — Form 16 import (ingest the TRACES-generated PDFs, don't try to sync them)

> **CA ruling (2026-08-02) — SCOPE EXPANDED. A18 is now the entire Form 16
> deliverable path** (A13 is CLOSED and folds into it). The CA confirmed **TRACES
> supplies both Part A and Part B**, and the platform's job is the full import +
> distribution loop, not just storage. Required scope:
> 1. **Parse** the TRACES-generated files (both parts).
> 2. **Map** each certificate to its employee (match on **`panMaskedHash`**, never
>    the encrypted `pan` column — see the matching-key note below).
> 3. **Publish to employee self-service** so each employee can download their own
>    certificate.
> 4. **Provide bulk DSC signing** — sign the certificates in bulk with a Digital
>    Signature Certificate as part of the issuance flow. (This is new scope beyond
>    the original "store + surface" build.)
>
> **Upstream dependency the CA flagged — Form 24Q quarterly filing (NOT currently in
> the plan).** TRACES only issues Form 16 once the employer's **Form 24Q** (the
> quarterly TDS-on-salary return) has been filed and processed. The platform has no
> Form 24Q filing path today, so A18's inputs don't exist until that upstream is
> built. Tracked as new item **C9 — Form 24Q quarterly filing** (see the CA-ruling
> section). A18 depends on C9.

**What changes.** Form 16 is not something we can pull from TRACES: **TRACES has no
live API — CAPTCHA and KYC exist specifically to block automated sync.** The real
flow is manual and lands *outside* the ERP: the tenant logs into TRACES, clears
KYC, requests the **bulk Part A + Part B** text files, downloads a zip, and runs
the **official TRACES PDF Generation Utility** to produce one PDF per employee.
Those are the legally-issued certificates. So the build is **not an integration —
it is an import**: accept a **zip of TRACES-generated Form 16 PDFs**, match each
PDF to its employee, store it, and surface it to that employee (self-service
download). This supersedes, or at minimum outranks, the internally-generated Part B
(A13) — an imported TRACES certificate is the real thing; our generator is at most
a preview.

**Matching key — use `panMaskedHash`, never the encrypted PAN column.** Each PDF is
matched to an employee **by PAN**. But the stored `pan` is now a **non-deterministic
AES-GCM envelope** (H-2): a fresh DEK per write means the same PAN encrypts to a
different ciphertext every time, so a direct column comparison **cannot** work and
must not be attempted. Match on **`panMaskedHash`** — the peppered HMAC-SHA256 that
is **deterministic, derived from the plaintext PAN before encryption, and already
stored alongside** every PAN (`lib/pan.ts` `panColumns`, `employees.panMaskedHash`).
Extract the PAN from the TRACES PDF, run it through the same `derivePan`/peppered
hash, and look the employee up by `panMaskedHash`. **Recorded here so nobody reaches
for the encrypted `pan` column to match on later** — it will never equality-compare.

**Reference implementation.** The DMS upload/scan path
(`apps/api/src/services/storage.ts`) is the model for accepting + storing the
files; `lib/pan.ts` (`derivePan` → the peppered hash, `panMaskedHash`) is the
deterministic match key already used for PAN de-dup elsewhere. Employee
self-service surfacing mirrors the existing Form 16 download route
(`http/payroll-form16-pdf.ts`).

**What could break.** A zip of untrusted PDFs is an input boundary — enforce
type/size and run the DMS scan; a PAN that matches no employee (or matches more than
one) must be surfaced as an unresolved row, not silently dropped or mis-filed onto
the wrong employee. PAN extraction from a PDF is best-effort; allow a manual
match-fix for the rows the parser can't resolve.

**What test proves it.** An import test: a small zip of fixture PDFs whose PANs map
to seeded employees files each to the right employee **via `panMaskedHash`** (with
an assertion the encrypted `pan` column is *not* used for matching); an
unmatched-PAN PDF lands in an unresolved bucket rather than being attached to the
wrong person; and the matched certificate is downloadable by that employee.

**Open question (shared with A13) — RESOLVED 2026-08-02.** The CA ruled our
internally-generated Part B is **preview only** (no legal standing). A13 is
**CLOSED**; A18 is the sole Form 16 deliverable path. No open question remains.

**Dependency.** Independent of A15/A17 (it imports finished PDFs rather than
generating them); shares the document code area. **Upstream: depends on C9 (Form 24Q
quarterly filing)** — TRACES won't issue Form 16 until 24Q is filed and processed,
and no 24Q path exists yet. A13 is dropped in favour of A18 (CA-resolved). The
expanded scope (parse + map + self-service publish + **bulk DSC signing**) is the
full build; see the CA-ruling box at the top of this section.

---

## CA ruling (2026-08-02) — decisions, one defect, nine new items

The chartered accountant reviewed the payroll/tax and GST work and returned: three
rulings on existing items, one correction against a shipped fix, and a set of new
requirements that were **not in the plan before**. This section records them verbatim
in intent; the existing items were updated in place (A7, A13, A18) and the defect is
logged inline under A12 as **A12-D**. **No code was changed by this update — it is a
plan/record edit only.**

### Rulings on existing items (recorded in place)

- **A7 — UNBLOCKED.** Lines are authoritative; the header is derived from them. Round
  **per line, half-up, 2dp, then sum the rounded lines to the header.** A **₹0.01**
  sum mismatch is a **hard error, not a tolerance** (it gets the e-invoice / GSTR-1
  payload rejected). See the A7 section.
- **A13 — CLOSED (will not fix).** A self-generated Form 16 Part B has **no legal
  standing.** Reclassify the internal generator as an **HR-only internal payroll-tax
  preview** and remove it from the fix list; A18 supersedes it. See the A13 section.
- **A18 — SCOPE EXPANDED.** TRACES supplies both parts. The platform must **parse,
  map to employees, publish to self-service, AND provide bulk DSC signing.** Upstream
  dependency: **Form 24Q quarterly filing (C9), not previously in the plan.** See the
  A18 section.

### Defect against a shipped fix

- **A12-D — LOP split-logic correction.** The shipped A12 projects LOP-reduced
  earnings across the full year (`earned*12`). Correct treatment is **split-logic:
  current month on actual earned salary, remaining months on the original contracted
  salary — do not project reduced earnings forward.** Logged inline in the A12
  section.

### New items (C1–C9) — not previously in the plan

- **C1 — Old vs New tax regime (s.115BAC).** The employee **elects annually** between
  the old and new regime, and **TDS must be projected per that election.** The two
  regimes differ in **both** the slab rates **and** which deductions/exemptions are
  eligible, so the tax engine must **branch on the election** — it cannot compute one
  regime and adjust. Requires storing the per-employee, per-year election and feeding
  it into `computeTax`. **Payroll-blocking** — TDS is wrong for any employee on the
  regime the engine doesn't implement.
- **C2 — Professional tax: full state matrix (REVISED SCOPE, supersedes the earlier
  "add Kerala + populate states" framing).** The CA has supplied the complete
  state-by-state PT slab table (recorded in full below). It **breaks the current
  `PT_SLABS` data model in three structural ways**, so C2 is **a substantial
  engineering item, not data entry.** **Payroll-blocking** for any multi-state
  employer (PT is deducted every payroll).

  **STATUS — split into C2-FIX (done) and C2-STRUCT (remaining):**

  - **C2-FIX — corrected the three wrong seeded slab sets. ✅ DONE (2026-08-04).** These were
    **over-deductions being filed today**, not future build. In
    `packages/payroll-math/src/statutory-deductions.ts`:
    - **Karnataka** — removed the incorrect ₹15,001–25,000 ₹200 band (now **nil to ₹25,000**,
      then ₹200); **added the February ₹300** top-band true-up.
    - **Gujarat** — removed the incorrect ₹80 (₹6,000–8,999) and ₹150 (₹9,000–11,999) bands
      (now **nil to ₹12,000**, then **₹200 flat**). `annualCap` stays at the statutory
      **₹2,500** (constitutional ceiling). *(An interim revision briefly set it to ₹2,400 by
      deriving ₹200 × 12 — that was wrong and has been reverted; ₹2,400 is **Punjab's**
      state-law ceiling, not Gujarat's. Caps are per-state statutory values, not derivable
      from the monthly rate — see the note below.)*
    - **Maharashtra** — added the **female bracket set** (`MAHARASHTRA_FEMALE`: nil to ₹25,000,
      then ₹200, ₹300 in Feb) **behind the lookup**. **UPDATE (2026-08-07): the earlier "gender is
      not yet a field" limitation is CLOSED** — gender is ingested (`employees.gender`, mig `0066`;
      both mutations + both dialogs) and `computePT` selects `MAHARASHTRA_FEMALE` on
      `ctx.gender === "female"` (`statutory-deductions.ts:384`). An unstated gender still falls to
      the male set per the CA (never under-deduct); no default is guessed. See the corrected
      structural-break #2 note below.
    - **February generalised** — the hardcoded Maharashtra-only Feb-₹300 branch now covers
      Maharashtra (male + female) **and Karnataka**, firing only for the top (₹200) band.
    - **Verified states unchanged:** Telangana, West Bengal, Delhi confirmed correct — their
      tests pass **both before and after**.
    - **Fairness proof:** per-state boundary tests in
      `apps/api/src/__tests__/india-payroll-engine.test.ts` (Professional Tax block). **Red
      against the old slabs** (6 targeted failures: Karnataka nil-band + Feb, Gujarat nil-band,
      Maharashtra-female ×2), **green after** (56/56). `pnpm lint` green (9/9 workspaces).
    - **`annualCap` is a per-state STATUTORY CEILING, not a value derivable from the monthly
      rate.** Do **not** compute a cap as `monthly × 12`. **Worked example: Punjab ₹2,400**
      (state law fixes that ceiling by charging a flat ₹200 with no variation) **vs Gujarat
      ₹2,500** (the constitutional cap — Gujarat does *not* lower its ceiling to match its
      ₹200 monthly rate). A regression test now pins Gujarat's cap at ₹2,500 so it cannot be
      re-derived. **TODO: confirm every other state's `annualCap` against the CA** rather than
      trusting any derived value — the seeded caps predate this table.

  - **C2-STRUCT — remaining structural work (still Pending, payroll-blocking for the
    half-yearly pilot states).** The data-model + ingestion changes below. Everything after
    this status block describes C2-STRUCT.

  **Where the model breaks today** (`packages/payroll-math/src/statutory-deductions.ts:199-293`):

  1. **Half-yearly levies.** **Kerala, Tamil Nadu, Puducherry** levy PT **half-yearly**,
     with brackets expressed as **half-yearly income** — not monthly. `PT_SLABS` has **no
     concept of a levy period**; every slab is treated as a monthly amount against monthly
     gross. This affects **how** the amount is computed (bracket lookup uses the wrong
     income base), **when** it is deducted, and **what shows on a monthly payslip**. **Two of
     the three (Kerala, Tamil Nadu) are pilot states**, so this blocks the pilot.

  2. **Gender-differentiated slabs.** **Maharashtra** has separate male/female brackets —
     **male pays from ₹7,501; female pays nil up to ₹25,000.**
     > **✅ CORRECTED (2026-08-07) — gender, DOB and the three PT-exemption flags are COMPLETE,
     > end to end.** This break's original claim ("gender is not a field on the employee record")
     > is **stale**. A read-only sweep confirmed: `employees.gender` (+ `date_of_birth`,
     > `pt_exempt_armed_forces`/`_disability`/`_dependent_disability`) exist, added by **migration
     > `0066_calm_bloodstrike`** (`packages/db/src/schema/hr.ts:193-214`); **both** `hr.employees.create`
     > **and** `update` accept and write them (`apps/api/src/routers/hr.ts:287-292/376-380` and
     > `:426-430`); **both** Add and Edit dialogs have the inputs (`apps/web/src/app/app/hr/page.tsx`,
     > gender select + DOB + exemption checkboxes); and **`computePT` reads them at runtime** —
     > `MAHARASHTRA_FEMALE` is selected on `ctx.gender === "female"`
     > (`statutory-deductions.ts:384`), the composite Tier-1 `exempt` (age-over-65 from DOB via
     > `ageInYearsAt`, plus the three declared flags) is built in `computeEmployeePayslip`
     > (`payroll-cycle.ts:319-327`) and bypasses PT. So a female Maharashtra employee is NO LONGER
     > charged the male slab. The remaining C2-STRUCT work is the levy-period / half-yearly / cap
     > items, **not** gender/DOB/exemption ingestion — that is done.

     (Historical note, now false: Maharashtra was the silent default for a stateless employee and
     the male slab applied to every female. Both are fixed — state is required at create, and
     gender is read.)

  3. **Month-specific rates.** Several states levy a **different amount in one month of the
     year** to true-up to the annual cap: **Karnataka & Maharashtra ₹300 in February**;
     **Assam, Mizoram, Nagaland, Tripura ₹212 in March**; **Madhya Pradesh ₹186 or ₹212 in
     March depending on bracket.** The engine has **no notion of a month-specific rate** — the
     only special-case in code is a hardcoded Maharashtra-February branch
     (`statutory-deductions.ts:283-285`); Karnataka-February and the four March-₹212 states
     are unhandled.

  4. **Interstate mid-year transfer — the annual cap is unenforceable today.** PT paid in a
     prior state within the **same financial year** must count toward the cap in the new
     state. **Confirmed: the engine tracks NO year-to-date PT per employee — it computes each
     month in complete isolation.** `computePT(grossMonthly, state, monthInFY, overrides?)`
     takes no prior-months / YTD parameter, and the `annualPT` it returns is just the static
     `config.annualCap` constant (`statutory-deductions.ts`), not an accumulated running
     total; `payroll-cycle.ts:314` flows that same static constant through. **So the cap is
     unenforceable regardless of its value** — right or wrong, ₹2,400 or ₹2,500, it is never
     actually applied against months-to-date. Worked example: an employee pays Maharashtra PT
     ₹200/mo Apr–Dec (₹1,800 paid), then transfers to a Gujarat office in January on the same
     band. Gujarat should only collect the remaining ₹700 (₹2,500 − ₹1,800), but because the
     engine has no memory of the Maharashtra ₹1,800 it will restart at ₹200/mo and over-remit.
     **Fix requires a YTD-PT ledger per employee per FY** (accumulate PT deducted across
     states) so the running total, not a per-month constant, gates against the destination
     state's cap.

  **Non-levying states must resolve to EXPLICIT nil, not fall through unknown-state.**
  PT is **not levied at all** in: **Arunachal Pradesh, Chhattisgarh, Goa, Haryana, Himachal
  Pradesh, Rajasthan, Uttar Pradesh, Uttarakhand, Odisha (formally abolished), Delhi, and all
  Union Territories except Puducherry.** These must map to an **explicit nil** entry. Today the
  unknown-state branch returns ₹0 (`statutory-deductions.ts:269-270`) — that gives the **right
  answer for the wrong reason** and would **hide a genuinely missing state** (a real
  levying state that was never populated looks identical to a correctly-nil state).

  **PT EXEMPTIONS (bypass the routine entirely, all states) — TIER 1.** The CA requires PT to be
  **skipped completely, regardless of state**, if **any** of these is true:
  - Employee **age over 65**.
  - **Verified active member of the Armed Forces.**
  - Holds a **valid permanent physical or mental disability certificate** (including complete
    blindness).
  - Is a **registered parent/guardian of a child with a permanent mental or physical
    disability**.

  **None is implemented; none has an ingestion path.** **Date of birth is NOT on the employee
  record** — it exists only on the **directors/DIN** table (`india-compliance.ts:175`), a
  separate entity — so **age is not derivable for employees today**; DOB must be added too.
  The other three need **new boolean/certificate fields**. **This is TIER 1** because the
  current default is **"not exempt"**, so **PT is deducted and filed for employees who are
  statutorily exempt** (a wrong amount paid/filed silently — the worst default kind).

  **REVISED C2 SCOPE (the actual work):**
  1. **Extend the PT data model** for **levy period** (monthly vs half-yearly) and
     **month-specific rates** (per-state, per-month override).
  2. **Add gender** to the employee record, **with an ingestion path** (form field + mutation).
  3. **Add the four exemption inputs** (DOB for age-over-65, armed-forces flag, disability
     certificate, guardian-of-disabled-child), **each with an ingestion path**, plus a **guard
     that bypasses PT entirely** when any is true.
  4. **Populate all applicable states** from the matrix below; mark **non-levying states as
     explicit nil**.
  5. **Add a per-employee, per-FY YTD-PT ledger** so PT paid in a prior state counts toward the
     destination state's cap on an interstate mid-year transfer (structural break 4 above). The
     cap is inert until this exists — the engine currently computes each month in isolation.
  6. **Confirm every state's `annualCap` against the CA** — it is a per-state statutory ceiling,
     **not** derivable from the monthly rate (Punjab ₹2,400 vs Gujarat ₹2,500 is the worked
     example; deriving ₹200×12 = ₹2,400 gives Punjab's cap, not Gujarat's).
  7. **Re-estimate** — this is engineering (data-model + employee-record + engine changes),
     not a data-entry pass.

  **THE FULL CA-PROVIDED MATRIX (authoritative; recorded verbatim):**

  | State | Levy period | Slabs / notes |
  |---|---|---|
  | Andhra Pradesh | monthly | ≤₹15,000 nil; ₹15,001–20,000 ₹150; >₹20,000 ₹200 |
  | Arunachal Pradesh | — | not applicable |
  | Assam | monthly | ≤₹10,000 nil; ₹10,001–15,000 ₹150; ₹15,001–20,000 ₹180; ₹20,001–25,000 ₹200; >₹25,000 ₹208 (**₹212 in March**) |
  | Bihar | annual bands | ≤₹25,000 nil; ₹25,001–41,666 ₹1,000/yr; ₹41,667–83,333 ₹2,000/yr; >₹83,333 ₹2,500/yr |
  | Chhattisgarh | — | not applicable |
  | Goa | — | not applicable |
  | Gujarat | monthly | ≤₹12,000 nil; >₹12,000 **₹200 flat** |
  | Haryana | — | not applicable |
  | Himachal Pradesh | — | not applicable |
  | Jharkhand | annual bands | ≤₹25,000 nil; ₹25,001–41,666 ₹1,000/yr; ₹41,667–83,333 ₹2,000/yr; >₹83,333 ₹2,500/yr |
  | Karnataka | monthly | ≤₹25,000 nil; >₹25,000 ₹200 (**₹300 in February**) |
  | Kerala | **HALF-YEARLY** (half-yearly income) | ≤₹11,999 nil; ₹12,000–17,999 ₹120; ₹18,000–29,999 ₹180; ₹30,000–44,999 ₹300; ₹45,000–59,999 ₹450; >₹60,000 ₹600 |
  | Madhya Pradesh | annual bands | ≤₹18,000 nil; ₹18,001–25,000 ₹2,000/yr; ₹25,001–33,333 ₹2,012/yr (₹166×11, **₹186 in March**); >₹33,334 ₹2,500/yr (₹208×11, **₹212 in March**) |
  | Maharashtra | monthly, **GENDER-SPLIT** | **Male:** ≤₹7,500 nil; ₹7,501–10,000 ₹175; >₹10,000 ₹200 (**₹300 in Feb**). **Female:** ≤₹25,000 nil; >₹25,000 ₹200 (**₹300 in Feb**) |
  | Manipur | annual bands | ≤₹4,166 nil; ₹4,167–5,833 ₹1,000/yr; ₹5,834–8,333 ₹1,200/yr; ₹8,334–10,416 ₹2,000/yr; >₹10,417 ₹2,500/yr |
  | Meghalaya | annual bands | ≤₹4,166 nil; ₹4,167–5,833 ₹500/yr; ₹5,834–8,333 ₹1,000/yr; ₹8,334–12,500 ₹1,200/yr; ₹12,501–16,666 ₹1,800/yr; >₹16,667 ₹2,500/yr |
  | Mizoram | monthly | ≤₹5,000 nil; ₹5,001–8,333 ₹100; ₹8,334–12,500 ₹150; ₹12,501–16,666 ₹200; >₹16,667 ₹208 (**₹212 in March**) |
  | Nagaland | monthly | ≤₹4,000 nil; ₹4,001–7,000 ₹35; ₹7,001–10,000 ₹75; ₹10,001–15,000 ₹110; >₹15,000 ₹208 (**₹212 in March**) |
  | Odisha | — | not applicable (formally abolished) |
  | Punjab | monthly | **₹200 flat** on any income above nil, capped at ₹2,400/yr |
  | Rajasthan | — | not applicable |
  | Sikkim | monthly | ≤₹20,000 nil; ₹20,001–30,000 ₹125; ₹30,001–40,000 ₹150; >₹40,000 ₹200 |
  | Tamil Nadu | **HALF-YEARLY** (half-yearly income) | ≤₹21,000 nil; ₹21,001–30,000 ₹135; ₹30,001–45,000 ₹315; ₹45,001–60,000 ₹690; ₹60,001–75,000 ₹1,025; >₹75,000 ₹1,250 |
  | Telangana | monthly | ≤₹15,000 nil; ₹15,001–20,000 ₹150; >₹20,000 ₹200 |
  | Tripura | monthly | ≤₹5,000 nil; ₹5,001–7,500 ₹100; ₹7,501–10,000 ₹150; >₹10,000 ₹208 (**₹212 in March**) |
  | Uttar Pradesh | — | not applicable |
  | Uttarakhand | — | not applicable |
  | West Bengal | monthly | ≤₹10,000 nil; ₹10,001–15,000 ₹110; ₹15,001–25,000 ₹130; ₹25,001–40,000 ₹150; >₹40,000 ₹200 |
  | Puducherry | **HALF-YEARLY** (half-yearly income) | ≤₹24,000 nil; ₹24,001–48,000 ₹250; ₹48,001–72,000 ₹500; ₹72,001–1,08,000 ₹750; >₹1,08,000 ₹1,250 |
  | All other Union Territories | — | not applicable |

  **DISCREPANCY AUDIT — the 7 states currently in `PT_SLABS` vs the matrix**
  (`statutory-deductions.ts:199-258`, seeded before this table existed):

  | Seeded state | Verdict | Discrepancy |
  |---|---|---|
  | **Maharashtra** | **Wrong (incomplete)** | Seeded has **male brackets only** (0→7,500 nil; 7,501–10,000 ₹175; >10,000 ₹200). **Female brackets entirely missing** → every female employee overcharged. Feb-₹300 only fires for >₹10,000 gross (`:283-285`), which happens to be correct for the male band but there's no female handling. |
  | **Karnataka** | **Wrong** | Seeded: 0–15,000 nil; **15,001–25,000 ₹200**; >25,000 ₹200. Matrix: **0–25,000 nil**; >25,000 ₹200. Seeded **over-deducts ₹200/mo for the ₹15,001–25,000 band** (should be nil). Also **no February-₹300** true-up. |
  | **Gujarat** | **Wrong** | Seeded: 0–5,999 nil; **6,000–8,999 ₹80**; **9,000–11,999 ₹150**; 12,000+ ₹200. Matrix: **0–12,000 nil**; >12,000 **₹200 flat**. Seeded **over-deducts ₹80 and ₹150** on bands the matrix says are nil. |
  | **Tamil Nadu** | **Structurally wrong** | Slab **amounts match** the matrix, but stored as **monthly** with monthly-gross lookup. TN is **half-yearly on half-yearly income** — wrong income base and wrong deduction timing. |
  | **Telangana** | **Correct** | Matches matrix (0–15,000 nil; 15,001–20,000 ₹150; >20,000 ₹200). |
  | **West Bengal** | **Correct** | Matches matrix exactly. |
  | **Delhi** | **Right answer, wrong mechanism** | Seeded as empty slabs (annualCap 0) → PT 0. Correct outcome, but reached via the **empty-slab path**, not an **explicit non-levying** marker; should become an explicit nil per the requirement above. |

  **Net:** of the 7 seeded states, **3 are wrong** (Maharashtra female missing, Karnataka
  band, Gujarat bands), **1 is structurally wrong** (Tamil Nadu half-yearly), **2 are
  correct** (Telangana, West Bengal), **1 is right-for-wrong-reason** (Delhi). None of the
  seeded states carries the February/March month-specific rates.
- **C3 — ESI six-month contribution-period rule.** Once an employee is an ESI member,
  they **remain a member until the end of the current contribution period** (the two
  fixed windows **Apr–Sep** and **Oct–Mar**) **even if their gross crosses the
  ₹21,000 wage ceiling mid-period.** The CA named this **the most common mistake new
  platforms make** (they drop the member the moment gross exceeds the ceiling).
  **Action: verify current behaviour first** — the engine may already be wrong here.
  **Payroll-blocking** if the rule isn't implemented (wrong ESI deduction + wrong
  challan).
- **C4 — PF ₹1,800 ceiling, with VPF and Joint-Declaration overrides.** PF
  contribution is capped at **₹1,800 (12% of the ₹15,000 wage ceiling)** unless one of
  two per-employee overrides is active. **Action: verify current behaviour first.**
  **Payroll-blocking** if the cap/overrides aren't handled (over- or
  under-contribution, wrong challan). The CA gave precise rules for each override:
  - **C4a — VPF (Voluntary PF).** A per-employee voluntary contribution **on top of**
    the statutory 12% employee share. Requirements:
    - Support **both** a **fixed rupee amount** and a **percentage of the PF wage
      basis (Basic + DA)**.
    - VPF is **added to** the 12% employee contribution — it does not replace it.
    - **Hard validation:** statutory 12% **+ VPF must not exceed 100% of monthly
      basic salary.** Reject configurations above that.
    - **The employer does NOT match VPF.** Employer contribution stays capped at 12%
      of ₹15,000 — or 12% of **actual basic** if a Joint Declaration (C4b) is active
      for that employee. So VPF moves only the employee side, never the employer side.
  - **C4b — PF above-ceiling contribution via Joint Declaration (EPFO Para 26(6)).**
    A **per-employee opt-in that requires explicit employer consent** — **not** a
    company-level all-or-nothing policy. When active, both employee and employer
    contribute 12% of **actual basic** (above the ₹15,000 ceiling). Beyond the
    calculation change, the CA requires a **document-generation build**, not a config
    flag: the platform must **GENERATE the EPFO Joint Declaration document** — a
    **pre-filled PDF in the prescribed format** pulling **employee details, employer
    registration data, and salary breakdown**, ready for **digital signature and
    upload to the EPFO Unified Employer Portal.** (This is the third member of the
    document-generation cluster — see the note after C9.)
- **C5 — Statutory rates → effective-dated config table.** All statutory rates (PF,
  ESI, PT slabs, tax slabs, wage ceilings, etc.) must live in a **configuration table
  with effective dates**, **not in code**, so a rate change **does not require a
  release.** This is an **enabler/infra** item — it underpins C1–C4 and C7 doing the
  right thing over time. **Deferrable** as a standalone (the current in-code rates can
  be corrected in place short-term), but doing C1–C4 without it means every future
  rate change is a code deploy.
  - **Status: DONE for income-tax rates (2026-08-03).** The FA-2025 income-tax rate
    set — OLD/NEW slabs, standard deduction, s.87A rebate, surcharge bands, and the 4%
    cess — is now injectable via the **existing** effective-dated `statutory_ceilings`
    table (no new table). Mechanism:
    - `statutoryMetricKeyEnum` gained five keys: `income_tax_slabs`, `standard_deduction`,
      `rebate_87a`, `surcharge_bands`, `cess_rate`
      (`packages/db/src/schema/india-compliance.ts`).
    - `computeTax(profile, taxConfig?)` (`packages/payroll-math/src/tax-engine.ts`)
      resolves every rate as `taxConfig?.X ?? <in-code constant>`, so an org/period with
      **no** rows is **byte-identical** to today (constants remain the fallback).
    - The resolver (`apps/api/src/lib/india/statutory-ceilings.ts`) maps the five keys
      into `overrides.taxConfig`; `computeEmployeePayslip` threads it through
      (`payroll-cycle.ts`). Slab top-band `to` is stored as JSON `null` (JSON can't hold
      `Infinity`) and normalised back to `Infinity` on read.
    - **Regime overload documented at the column:** for the regime-specific keys
      (`income_tax_slabs`, `standard_deduction`, `rebate_87a`) `state_code` carries
      `"OLD"`/`"NEW"` instead of a state (mirroring how PT already reuses `state_code`);
      `surcharge_bands`/`cess_rate` leave it NULL. Called out in the column comment and
      in `reports/c5-plan.md`.
    - **Migration `0064_taxing_matters`** (enum-rebuild dance, mirroring `0054`) seeds
      the current constants as **platform defaults**: OLD/agnostic eff 2020-04-01, NEW
      eff 2025-04-01 — so the seeded config equals the constants for any modern period.
    - **Tests** (`apps/api/src/__tests__/income-tax-config.test.ts`, 7 tests, all green):
      a FALLBACK/byte-identical check that reconstructs the ₹16L NEW figure from the
      constants and asserts equality (A12-style, not "no throw"); a PROSPECTIVE-ONLY
      scenario (a mid-year org rate change leaves an earlier period unchanged and only
      later periods move — a past run is a legal record); plus round-trip and two-regime
      coverage. Full API suite green (1351/1351) after adjusting the one pre-existing
      `statutory-ceilings.test.ts` "no rows → {}" case to a pre-2020 period (the new
      income-tax platform defaults are eff 2020-04-01).
  - **Explicit follow-up (NOT done):** **PF/ESI contribution percentages and gratuity**
    are still in-code constants. Moving PF's 12% employee/employer split + ₹1,800 ceiling,
    the ESI 0.75%/3.25% rates + wage ceiling, and the gratuity formula/rate into the same
    effective-dated table is the next C5 increment (ties into C3/C4). Left as a deliberate
    follow-up per the go-live decision to ship income-tax config first.
- **C6 — Payslip mandatory statutory fields.** The payslip must carry: **CIN,
  PF/ESI/TAN numbers, UAN, ESI IP number, employee bank account, paid vs unpaid
  days,** and **separate line items** for **Basic, DA, HRA, Special Allowance, and
  each deduction** (not a lumped total). **Conditional line rule (CA):** the **DA line
  appears only when DA is enabled on the employee's salary structure** — it is
  **absent otherwise, with no zero-value line.** (This is the general principle for
  the breakdown: show a line only when the component is present, don't print ₹0 rows.)
  Overlaps the existing B16 (payslip header is hardcoded blank) but is broader — B16
  is the header identity; C6 is the full statutory field set + line-item breakdown.
  **Payroll-blocking** (a compliant payslip is a statutory obligation).
- **C7 — GSTR-1 structural gaps.** The return must: **segregate B2B / B2C-Large /
  B2C-Small** into their respective tables; produce an **HSN summary** with
  **dynamic 4-or-6-digit HSN validation keyed to the taxpayer's turnover**; use the
  **numeric state code** for place of supply; and include **Tables 9 and 11** (credit/
  debit notes, and advance adjustments). Reads the per-line data A7 persists.
  **GST-blocking** (the current return is structurally incomplete and would be
  rejected / mis-filed).
  - **C7a — HSN turnover-threshold mechanics (CA detail).** The dynamic HSN digit
    minimum is driven by **Annual Aggregate Turnover (AATO)**, with precise rules:
    - AATO is a **per-tenant field**, sourced from the **taxpayer profile** or a
      **GSP's GSTIN-verification API**.
    - It is **refreshed once a year, on 1 April**, from the **preceding financial
      year's declared or audited turnover.**
    - The engine enforces a **4-digit HSN minimum up to ₹5 crore**, and **switches
      automatically to a 6-digit minimum above ₹5 crore.**
    - This needs a **scheduled annual job** (the 1-April refresh), **not just a stored
      value** — otherwise the threshold goes stale and validation is wrong for a year.
- **C8 — Tolerant filing-schema parsing.** Government filing schemas (GSTR, TRACES,
  challans) **change with little notice**, so all parsing of / mapping to these
  schemas must be **tolerant, not rigid** — an added/renamed field should not break
  ingestion. **Deferrable** (robustness hardening; applies to C7 and A18's parsers as
  they are built).
- **C9 — Form 24Q quarterly filing (upstream of A18).** The quarterly TDS-on-salary
  return. **Not currently in the plan.** TRACES will not issue Form 16 until 24Q is
  filed and processed, so **A18 depends on C9.** **Deferrable relative to first
  go-live** (it gates the Form 16 *import*, not day-one payroll), but it is on the
  critical path for delivering Form 16s and must precede A18.

### Cross-cutting observation (CA) — a document-generation cluster

Three items now each need to **generate a signed, prescribed-format PDF from
tenant/employee/salary data**:

1. **A18 — Form 16 bulk DSC signing** (sign the imported TRACES certificates in bulk).
2. **C4b — EPFO Joint Declaration PDF** (pre-filled Para 26(6) form, ready for digital
   signature + EPFO portal upload).
3. **A17 — branded invoice / PO PDFs** (the existing document-build item).

The CA's recommendation: **consider whether these share a single document-generation
service** (template + data-merge + digital-signature pipeline) **rather than building
the same machinery three times.** This is an **architecture decision to make before
building the three**, not a work item on its own — but it should shape how A17, C4b
and A18's signing are scoped. (A15, "one shared document-header source," is the
adjacent identity half; a shared doc-gen service would consume it.) _(Design decision;
records the CA's steer — no code implied.)_

---

## Revised count and classification (post-CA)

**Revised open-item count.** The plan's status table now holds:

- **Phase 1 ratchets:** 5 — **all Done** (R-1…R-5).
- **Closed / will-not-fix:** **1** — **A13** (CA: no legal standing; reclassified
  HR-only preview, folded into A18). Removed from the open fix list.
- **Previously-tracked items still open (unchanged by the CA):** A5, A6-followups
  handled, A8, B1, A15, A16, A17, B16, B17, the ownership cluster (#5),
  identity/session theme (B8–B11), automation/reliability theme (B6/B7/B12/B13), KMS
  legacy theme (B14/B15 — H-2 done; employee-PAN backfill UNNECESSARY per the 2026-08-08
  prod audit, CBC re-wrap + SSO-token encryption still owed), schema-tooling theme (#32), RBAC
  theme. (A9 API path Done, screen deferred.)
- **Unblocked by the CA:** **A7** (was Blocked-on-CA → now actionable).
- **Expanded by the CA:** **A18** (now parse + map + self-service + bulk DSC signing).
- **New this ruling:** **A12-D** (defect against shipped A12) + **C1–C9** (nine new
  items) = **10 new work items.** Three of these carry named **sub-items** the CA
  detailed: **C4a** (VPF: fixed-₹/%-of-Basic+DA, added on top of 12%, ≤100%-of-basic
  cap, employer does not match), **C4b** (PF above-ceiling via EPFO Para 26(6) Joint
  Declaration — per-employee opt-in + a **generated pre-filled JD PDF**), and **C7a**
  (HSN turnover mechanics: per-tenant AATO, 1-April annual refresh job, 4→6-digit
  switch at ₹5 crore). They are scoped under their parents, not counted separately.
- **Architecture decision surfaced (not a work item):** a **shared document-generation
  service** spanning A18 (Form 16 bulk DSC signing), C4b (JD PDF) and A17 (branded
  invoice/PO PDFs) — decide before building the three.

So the CA ruling **net-added 10 items** (A12-D + C1–C9, with sub-items C4a/C4b/C7a
folded under C4/C7), **closed 1** (A13), and **unblocked 1** (A7). There are **no
remaining Blocked-on-CA items.**

**Classification of the CA's items** (what gates what):

| Item | Class | Why |
|------|-------|-----|
| A12-D — LOP split-logic | **Payroll-blocking** | Statutory TDS is mis-projected in any LOP month. |
| C1 — Old vs New regime (115BAC) | **Payroll-blocking** | TDS wrong for anyone on the un-implemented regime. |
| C2 — PT 21+ state matrix | **Payroll-blocking** | PT deducted every payroll for multi-state employers. |
| C3 — ESI six-month period | **Payroll-blocking** (verify first) | Wrong ESI deduction + challan if member is dropped mid-period. |
| C4 — PF ₹1,800 ceiling (incl. C4a VPF) | **Payroll-blocking** (verify first) | Wrong PF contribution + challan if cap / VPF override mishandled. |
| C4b — PF above-ceiling JD (Para 26(6)) + JD PDF | **Deferrable** (per-employee opt-in) | Only affects opted-in employees; the JD-PDF is a doc-gen build. Land the calc with C4; the PDF with the doc-gen cluster. |
| C6 — Payslip mandatory fields | **Payroll-blocking** | A compliant payslip is a statutory obligation. |
| C7 — GSTR-1 structure (incl. C7a HSN mechanics) | **GST-blocking** | Return is structurally incomplete → rejected / mis-filed; HSN digit-count must track AATO. |
| A7 — invoice line items | **GST-blocking** (enables C7) | Per-line data + exact ₹ reconciliation feed the return. |
| C5 — rates → config table | **Deferrable** (enabler) | Correctness can ship with in-code rates short-term; this removes the redeploy-per-rate-change cost and underpins C1–C4/C7 long-term. |
| C8 — tolerant parsing | **Deferrable** (robustness) | Hardens C7 / A18 parsers against schema drift; not a day-one blocker. |
| C9 — Form 24Q filing | **Deferrable vs first go-live** | Gates the Form 16 **import** (A18), not day-one payroll — but is on the critical path to delivering Form 16s. |
| A18 — Form 16 import (expanded) | **Deferrable vs first go-live** | Depends on C9; delivers Form 16 after 24Q filings exist. |
| A13 — Form 16 Part B header | **Closed** | Will not fix (no legal standing). |

**Summary for go-live sequencing.**
- **Must be right before running payroll:** A12-D, C1, C2, C3, C4 (incl. **C4a VPF**),
  C6 (6 payroll blockers). C3 and C4 start with a **verify-current-behaviour** step —
  the engine may already be partly correct.
- **Must be right before filing GST:** C7 (incl. **C7a HSN mechanics**) and its data
  dependency A7 (2 GST blockers).
- **Deferrable (do after first go-live, in dependency order):** C5 (rate config —
  do early to stop future redeploys), **C4b** (PF Para-26(6) JD calc + JD PDF), C8
  (tolerant parsing), then C9 → A18 (Form 16 delivery loop). A13 is closed.
- **Decide before building the PDFs:** whether A17, C4b's JD PDF and A18's bulk DSC
  signing share **one document-generation service** (CA steer).

---

## Legal & Governance module — scope assessment (2026-08-02)

Recorded from a direct read of the secretarial + legal routers and the MCA21 adapter
(no code changes). Verdict: **~60% reachable for data capture, ~25–30% for statutory
output.** The data models are largely right; the last-mile *statutory output* (filing,
minutes, prescribed-format registers) is missing or hollow — the same "correct schema,
missing computation / open loop" pattern as the rest of the platform.

**Works end to end (data capture a user can reach).**
Board meetings, resolutions, directors, share capital / shareholders, ESOP grants,
legal matters, related-party transactions, and a compliance due-date calendar all have
real create paths and persist.

**Missing or hollow (statutory output).**
- **MCA filing does not actually file.** `legal.mca21.prepare` accepts a free-form JSON
  blob that **defaults to empty** — `formData: z.record(z.unknown()).default({})`
  (`apps/api/src/routers/legal.ts:782`); there is **no per-form field mapping** for
  MGT-7 / AOC-4 / DIR-3-KYC / MSME-1 / DPT-3, so nothing guarantees a valid e-Form body.
  `legal.mca21.submit` (`legal.ts:807-838`) enqueues a BullMQ job that POSTs the blob to
  `${base}/v1/eform/file` (`apps/api/src/services/integrations/mca21.ts:68-94`), where
  `base` is `gateway.mca21-suvidha.in` / `gateway-sandbox.mca21-suvidha.in`
  (`mca21.ts:47-48`) — **one of the five fabricated government-portal domains** from
  sweep 3 (see below and `reports/sweep-fabricated-constants.md:70`). `test()` never
  pings the gateway — it only checks the credentials are present and returns
  `"Credentials present; ping deferred"` (`mca21.ts:58-66`). So the pipeline *transports*
  an unvalidated payload to a non-existent host; it does not file.
- **`secretarial.filings.markFiled` is a manual status flip, not a filing.** It sets
  `status: "filed"` and stores a **user-pasted SRN** (`apps/api/src/routers/secretarial.ts:336-381`,
  SRN at `:351`); the compliance calendar it flips is seeded with due-dates + notes only,
  no form data (`secretarial.ts:458-569`). This is a to-do list with a "done" checkbox,
  not a submission.
- **Board minutes: no generation.** `minutesDraft` is a plain-text field
  (`secretarial.ts:141`); there is no minutes template, no assembly from the meeting /
  resolution records, and no PDF anywhere.
- **Register of Charges: absent entirely.** No table, no create path, no CHG-1/CHG-4
  form — the statutory charge register simply does not exist.
- **`statutory_register_entries` is an unused shell (phantom field).** The table is
  defined at `packages/db/src/schema/issuer-programme.ts:74` (`statutoryRegisterEntries`,
  a generic jsonb-keyed register) and even carries an RLS policy + unique index, but
  **nothing under `apps/` reads or writes it** — zero references in any router or service.
  It is schema with no behaviour: it cannot back a members / directors / charges register
  today. _(Add to the phantom-fields / dead-columns findings; re-verify under
  `sweep-phantom-fields`.)_

**Sweep-3 correction (reachability).** The fabricated-constants sweep
(`reports/sweep-fabricated-constants.md:70`) originally framed `gateway.mca21-suvidha.in`
as a merely-*overridable default constant* (`config.baseUrl ?? …`, `mca21.ts:69`). That
undersells the exposure: the domain is **reachable from application code** — the live
call chain `legal.mca21.submit` → BullMQ `mca21` job → `mca21Adapter.send()`
(`legal.ts:807-838` → `mca21.ts:68-94`) POSTs a real filing payload to that host whenever
no override is configured, which is the default. Treat it as a reachable fabricated
endpoint, not an inert default. _(Correct the row in `sweep-fabricated-constants.md:70`
when that sweep is next revised.)_

**DECISION — do not engage a company secretary yet.** The module has too little
statutory output to review: there is nothing a CS could sign off on today (no real
filing, no minutes, no prescribed-format registers). The CS conversation belongs at
**build time**, and the question then is **what a valid MGT-7 / AOC-4 (etc.) payload
requires** — the field mapping, attachments, and DSC flow — **not** an audit of what is
currently missing. Until that build starts, this whole module stays out of the go-live
critical path.

---

## Build item — Filing architecture (three-layer decoupled design)

Recorded 2026-08-02 (design; no code changes). This is the **build** the Legal &
Governance DECISION above defers to, generalised across **all** statutory filings.

**Problem.** Statutory form schemas change with little notice (the CA flagged this as a
common failure mode). Today each filing is built separately and close to its transport —
GSTR-1 payload assembly lives in `accounting.ts`, MCA e-Form in
`legal.mca21.prepare`/`mca21.ts`, with EPFO ECR / Form 24Q / e-invoicing as their own
adapters. Hardcoding form fields into columns or code means **a schema change forces a
deployment**.

**Design — three layers, decoupled.**
- **Layer 1 — core storage (domain objects).** Companies, directors, share transactions,
  resolutions, charges. Changes only when *corporate law* changes, not when a form layout
  does.
- **Layer 2 — translation (adapter).** Maps core objects to the target external schema via
  **declarative mapping configs**. Handles field splitting, nesting, and renaming **without
  touching the database**.
- **Layer 3 — compilation.** Produces the final payload; isolates compression, checksums,
  and encoding.
- **Form schemas as versioned config** (JSON Schema or Zod), with **multiple versions live
  simultaneously** so in-progress filings don't break when a new version lands. The UI
  renders from the schema.
- **Graceful degradation.** A **pre-submission review matrix** showing the compiled
  payload, with **in-line key overrides** for authorised users, plus **state freezing** and
  an **audit log** recording what was changed and why.

**Scope — build once for ALL filings, not MCA alone.** GSTR-1, Form 24Q, EPFO ECR and
e-invoicing are the same shape: core data compiled into a volatile external format.
Currently each is built separately.

**Additional requirement — divergence flag.** When a manual override is used, flag that
the **core data and the filed payload have diverged**, so the next filing does **not**
silently inherit the same correction. (Override is a one-time patch, not a new default;
the underlying core data must still be fixed.)

**Sequencing — pilot-critical.** 7 customers go live end of August; pilot runs to end of
November; **every major filing deadline falls inside that window**:
- GSTR-1 — monthly from mid-September
- DIR-3 KYC — 30 September
- Form 24Q Q2 + AOC-4 — October
- MGT-7 — 29 November

The **first consumer of the architecture is GST, not MCA** (earliest, monthly, recurring).

**Prerequisite work (Phase 1 of the recovery path).** These land before / alongside the
architecture, and turn the Legal & Governance shells into real source data:
1. **Repurpose `statutory_register_entries` as an event-driven ledger** recording equity
   shifts, director appointments, and charge creation (today an unused shell at
   `packages/db/src/schema/issuer-programme.ts:74`).
2. **Build the Register of Charges** — the source data for CHG-1 and CHG-4 (absent today).
3. **Replace the empty payload in `legal.mca21.prepare`** (free-form blob defaulting to
   empty, `apps/api/src/routers/legal.ts:782`) with an **explicit mapping function** pulling
   from the live directors, share-capital and charges tables.
4. **Remove the fabricated gateway domains** (`gateway.mca21-suvidha.in` /
   `gateway-sandbox.mca21-suvidha.in`, `apps/api/src/services/integrations/mca21.ts:47-48`;
   `reports/sweep-fabricated-constants.md:70`) and replace with **mock integration tests**
   covering success and failure states.
5. **Freeze board minute drafts on finalisation** (today `minutesDraft` is an editable
   plain-text field, `apps/api/src/routers/secretarial.ts:141`).

---

## Dated capability plan — pilot go-live (end Aug) → end November (2026-08-02)

Recorded 2026-08-02 (planning; no code changes). Every date is a **"correct-by"
deadline set by the regulatory event it serves**, not by our preferred build order.
**Constraint:** 7 pilot customers go live **end of August** (non-negotiable); pilot
runs three months to **end of November**. Confirmed cohort facts are folded in below
(see "Confirmed cohort adjustments").

### The fixed calendar

| Deadline | Date | Serves |
|---|---|---|
| Pilot onboarding | **~25 Aug** | Customer can set up at all |
| First payroll run | **~end Aug / early Sep** | Every payroll blocker |
| GSTR-1 (September) | **mid-Sep** — **dummy/validation run, not a live filing** | GST-blocker validation |
| **GSTR-1 (first LIVE filing)** | **mid-Oct** | GST blockers (real) |
| DIR-3 KYC | **30 Sep** | Director KYC filing |
| AOC-4 | **30 Oct** | Annual accounts filing |
| Form 24Q Q2 | **31 Oct** | Quarterly TDS-on-salary return |
| MGT-7 | **29 Nov** | Annual return |

Two facts drive everything: **payroll runs first (end Aug)**, and **GST is the first
filing** — so GST, not MCA, is the first consumer of any filing work.

### Day one — must work before a customer can onboard and operate at all

Existence-driven, not deadline-driven. Without these there is no usable product on 25 Aug.

| Capability | Correct by | Status today |
|---|---|---|
| Payroll engine base (PF ₹1,800 cap, ESI, net pay) | **25 Aug** | **Working** — cap correct, ESI per-month correct |
| Tenant onboarding / RLS isolation | **25 Aug** | **Done** (A11, migration 0061) |
| **C6 — payslip mandatory statutory fields** | first payslip | **Done (2026-08-08, `d979038`, mig `0074`)** — was "Absent — blocking" on 2026-08-02; shipped (ESI-reconciliation defect fixed; tenant identity renders). |
| **B16/B17 — org identity on documents** | first payslip | **B16 Done via C6** (name/TAN/EPF/CIN/ESI establishment render from stored values); **B17 still Pending** (no org full-address field). |

### Payroll cluster — correct by first run (~end Aug / early Sep)

The first payroll happens at go-live, so every payroll-blocker shares one hard date.

| Item | Correct by | Status | Note |
|---|---|---|---|
| **A12-D** — LOP split-logic | first run | Defect vs shipped A12 | Contained fix |
| **C1** — Old vs New regime (115BAC) | first run | Absent | **Largest payroll build** — engine must branch on election. **Full scope, does NOT narrow** (see cohort adjustments) |
| **C2** — PT multi-state matrix | first run | Absent | Build full-scale structure; **populate 3 states for go-live** (see cohort adjustments) |
| **C3** — ESI six-month period | first run | **Absent (verified** `statutory-deductions.ts:145`**)** | Real build |
| **C4/C4a** — PF cap + VPF | first run | **Cap correct; VPF partial** | Extend, not build |
| **C6** — payslip fields | first run | Absent | Also day-one |

**Verify-first already done:** C3 is fully absent (real build); C4's ₹1,800 cap is
correct, only VPF/JD need work — so C4 shrinks from "build" to "extend."

### GST cluster — correct by first LIVE GSTR-1

| Item | Correct by | Status |
|---|---|---|
| **A7** — persist invoice line items | **mid-Oct** (was mid-Sep) | Unblocked; feeds C7 (₹0.01 mismatch = hard error) |
| **C7** — GSTR-1 structure (B2B/B2CL/B2CS, HSN, state code, Tables 9 & 11) | **mid-Oct** (was mid-Sep) | Absent |
| **C7a** — HSN turnover rule | **rule: mid-Oct**; **1-Apr refresh job: next April** | Absent |

**September dummy run:** output must be **correct enough to validate**, but a failed
dummy run is recoverable where a failed filing is not. See the dummy-run caveat in the
cohort adjustments.

### MCA / secretarial — DIR-3 KYC (30 Sep), AOC-4 (30 Oct), MGT-7 (29 Nov)

Per the Legal & Governance assessment above: **~60% data capture works, ~25–30%
statutory output, and MCA filing does not actually file** (empty payload, fabricated
gateway, `markFiled` is a manual status flip).

| Filing | Correct by | Can we file it by then? |
|---|---|---|
| **DIR-3 KYC** | 30 Sep | **NO** — earliest deadline, no filing path. **Handle manually / via CS for the first cycle.** |
| **AOC-4** | 30 Oct | **NO** — needs filing architecture + real payload mapping + charges register, none of which exist. **Handle manually for the first cycle.** |
| **MGT-7** | 29 Nov | **Maybe** — latest deadline, the only MCA filing with runway if the filing architecture lands |

### 24Q → Form 16 chain

| Item | Correct by | Status |
|---|---|---|
| **C9** — Form 24Q Q2 | **31 Oct** (hard, inside window) | Absent |
| **A18** — Form 16 import | after 24Q processes (**Nov+**) | Absent; depends on C9 |

Note: the CA classification calls C9 "deferrable vs first go-live" — true for *payroll*,
but against **this** calendar C9 has a **hard 31 Oct date**.

### At-risk flags — descope or handle manually

**Cannot realistically be built in time — handle manually for the first cycle:**
1. **DIR-3 KYC (30 Sep)** — no filing path; earliest MCA deadline, ~one month after
   go-live while payroll+GST consume all capacity. **Go manual / CS.**
2. **AOC-4 (30 Oct)** — needs the filing architecture + MCA payload mapping + Register
   of Charges, none of which exist. **Go manual.**
3. **Three-layer filing architecture** — right design, but a large build competing with
   the payroll cluster that must land first. **Won't be ready for the first GSTR-1.**
   Recommendation: build **C7 as a point solution** for the first GST cycle; target the
   generalised architecture at the later MCA/24Q deadlines.

**Tight — decide early:**
4. **C1 (regime branching)** — largest build, hardest date; **full scope confirmed**
   (does not narrow — see cohort adjustments).
5. **C2 (PT states)** — **narrowed** to 3 day-one states (see cohort adjustments).
6. **C9 (31 Oct)** and **A18** — C9 is a genuine window deadline; A18/Form 16 only
   matters after 24Q processes (Nov/Dec), so A18 is safely last.

**Safe to defer within the window:** C5 (rates config — do early anyway), C8 (tolerant
parsing), C7a's April refresh job, C4b (JD PDF).

### Confirmed cohort adjustments (2026-08-02)

The 7-customer cohort facts are now confirmed; they change three lines of the plan above.

- **States: Karnataka, Kerala, Tamil Nadu, Delhi NCR → C2 narrows sharply.** Delhi does
  **not** levy professional tax, so **day-one PT is three states: Karnataka, Kerala,
  Tamil Nadu.** Build the multi-state PT structure **at full scale** as agreed, but
  **populate three states for go-live**; the remaining states become **data entry, not
  engineering.**
- **Tax regime: old-regime election is likely and material** (mid-tier salaries where the
  difference matters) **→ C1 does NOT narrow.** Full scope, day one: **both slab sets,
  both deduction-eligibility sets, the annual employee election captured and honoured,
  and TDS projected per election.** Remains the **largest payroll build on the hardest
  date.**
- **GSTR-1: September is a dummy/validation run, not a live filing → first real GSTR-1
  moves from mid-September to mid-October.** The GST cluster (A7, C7, C7a) gains **~four
  weeks.** September output must be **correct enough to validate**, but a **failed dummy
  run is recoverable where a failed filing is not.**
  - **Caveat (record):** a dummy run proves **our output looks right**; it does **not**
    prove **GSTN accepts it.** **Plan a real portal validation before the October
    filing** — do not treat a clean dummy run as acceptance.

---

## Bulk data import — corrected classification (2026-08-02)

Recorded 2026-08-02 (planning; no code changes). Bulk import was **wrongly scoped as a
far-future build.** Verified in code, most of it **already exists and is reachable
today**; only two importers are genuinely missing, and both are copies of a **proven,
reusable pattern**, not green-field work.

**What already exists (verified).**
- **`ingest.importVendors`** (`apps/api/src/routers/ingest.ts:264`) — array input,
  **handles PAN encryption** (via `panColumns()`, falling back to encrypted-raw on a
  malformed PAN row rather than aborting the batch), tolerant of bad rows, and **wired to
  the vendors page UI** (`apps/web/src/app/app/vendors/page.tsx:79`).
- **`accounting.coa.seed`** (`apps/api/src/routers/accounting.ts:199`) — auto-seeds **95
  India-standard accounts at signup**, idempotent (skips codes already present).
- **`ingest.importLeads / importContacts / importDeals / importMatters / importContracts /
  importInvoices`** (`ingest.ts:126-395`) all exist. `importInvoices` adds
  dedup + `skipped[]` reporting.
- **The pattern is proven and reusable:** array in → per-row insert → `{ imported, ids,
  skipped }`. A new importer is a **copy of this shape**, not new machinery.

**The only two missing importers.**
- **EMPLOYEES — no bulk path anywhere (verified). PILOT-BLOCKING.** Only single-record
  `hr.people.create` (`apps/api/src/routers/hr.ts:253`) exists. With **30–80 people per
  customer across 7 customers**, its absence turns onboarding into seven manual
  migrations. Build `ingest.importEmployees` **modelled on `importVendors`**; it must
  **mint sequential `EMP-NNNN`** as the single-create path already does
  (`hr.ts:312`), **handle PAN via `panColumns()`**, and **optionally create user records
  inline** (as `hr.people.create` does at `hr.ts:275-288`).
- **OPENING BALANCES — no importer.** Needed **before the first financial close, not day
  one.** Build a **thin wrapper** accepting an array of **account-code + debit/credit
  rows**, posting **one balanced `opening`-type journal entry**, and **reusing the
  existing debits-equal-credits validation** (`accounting.journal.create`,
  `accounting.ts:263`, balance check at `:280-285`).

**Deferred (do later in / after pilot):** custom (non-standard) COA additions, historical
transactions, prior-period invoices and payments.

**Why the employee importer is worth building (not just a convenience).** Manual entry
costs roughly **5–12 hours per customer**, but the hours are not the real cost — **the
failure mode is.** A mistyped **basic salary or PF-eligibility flag** flows straight into
the **first payroll run and the statutory challans**; a **wrong PAN** corrupts the
encrypted PAN hash; a **wrong state** mis-splits GST — **the A1 defect reintroduced by
hand.** Manual entry **converts data-entry slips into compliance errors, seven times in
parallel**, and doesn't scale past the pilot (customer 8 onwards makes it untenable).

**Why it doesn't threaten the payroll critical path.** Neither importer competes with the
payroll cluster (C1–C6) **for skills or code** — it is **router/CRUD work against a proven
template**, not statutory-engine work, so it can proceed alongside the payroll build.

**Reclassification.**
- **Employee importer → pre-go-live** (pilot-blocking; land before end-August onboarding).
- **Opening-balance importer → early-pilot** (before the first close, not day one).
- **Everything else (custom COA, historicals) → deferred.**

---

## Bucket B remainder (fix during pilot, grouped by theme)

These are the bucket-B items not already folded into the phases above. They are
real defects a watched single customer can work around; land them during the pilot,
grouped by theme so related edits happen once. The whole **ownership cluster (#5)**
is one pass; the rest are the supporting themes from `audit-summary.md`.

- **Ownership cluster (#5) — one shared guard.** The 31 unchecked-ownership write
  paths + the CRM/assets ownership findings + the work-order cross-tenant write:
  add **one shared guard** that checks every caller-supplied related id (accountId,
  contactId, dealId, poId, taskId, …) belongs to the caller's org before the
  insert, and apply it across the write paths. The CRM lead-convert path
  (`lib/crm/lead-convert.ts`) is the reference for deriving ids internally rather
  than trusting client input. One pass, before any second customer. _(cross-tenant
  integrity — theoretical with one tenant, so bucket B, but fix before multi-tenant.)_
- **Identity/session theme (B8, B9, B10, B11).** Super-admin REST honours the
  MAC kill-switch and stops returning raw PAN/TAN + writes tamper-evident audit;
  deactivate/reset-password ends existing sessions; API-key prefix mismatch fixed
  and `api_keys.permissions` actually enforced; drop the impersonation token
  nothing consumes. Group by the auth/super-admin code area.
- **Automation/reliability theme (B5 done in R-5, B6, B7, B12, B13).** Make the
  DPDP sweep per-item isolated (copy the other five loops); add timeouts to the
  DB query cancel path and the portal connectors; fix the false
  "idempotent"/"locked" comments and the notifier that double-sends on retry;
  fail-closed on the `/internal/*` token instead of trusting the Docker network.
- **Test-hygiene theme (B16) — tests don't tear down their seed data.** Observed
  2026-08-02 while running the pre-B5 chain census: the test DB (`:5433`) has
  accumulated **10,067 orgs across prior runs** (9,827 named `"QA Test Org"`, plus
  named fixtures and `dup-org-*` rows), with **2,271 broken audit chains** left behind
  by tests that deliberately tamper/truncate/delete chain rows (e.g. the R-5
  tail-truncation test) and never clean up. Each suite seeds a fresh org per
  CLAUDE.md's self-isolation rule but does not delete it afterward, so seed data grows
  unbounded. Not urgent and not a production issue, but it (a) slows the suite and
  (b) makes any `count(*)`/aggregate query against the test DB meaningless (as it did
  for the census — the real signal was the clean dev DB, not the test DB's 2,271
  "broken"). Fix: per-suite teardown (or a `pnpm docker:test:reset` in CI before the
  run) so the test DB starts each run empty. Bucket B.
- **KMS legacy theme (B14, and B15 from the triage update).** Re-wrap legacy CBC
  secrets and fix "decrypt-fail reads as not-connected"; and **encrypt the
  plaintext SSO OAuth tokens** (`accounts.accessToken/refreshToken`,
  `services/oidc.ts:150-169`) through the same envelope the integration configs use
  (`encryptIntegrationConfigEnvelope`, `http/integration-oauth.ts:59`). B15 shares
  the vault/code area with the PAN encryption work — land it in the same
  encryption pass, per the triage note.
  - **PAN encryption-at-rest (H-2) — DONE for new writes; employee-PAN backfill UNNECESSARY
    (prod audit clean 2026-08-08 — see correction below); other-table status unverified.**
    `lib/pan.ts` now stores the raw `pan` as a KMS `v2:` envelope (async `panColumns`)
    and reads through `decryptPan` at every boundary (form16 ×2, hr, payslip-pdf,
    onboarding, secretarial ×2 lists + ×4 returns, india-compliance list + ×2 returns,
    vendors list/get/create/update; ingest + orgWizard writes route through it too).
    Legacy plaintext rows read through unchanged, so **no backfill was done this pass**
    (the tree has no production PAN data yet). **Follow-up before production data
    exists:** a one-time backfill that re-writes each existing plaintext `pan` across
    all six tables (organizations, employees, vendors, directors, shareCapital/
    shareholders, companyDirectors) through `panColumns` so every stored value is an
    envelope. `decryptPan`'s `isEnvelope()` gate can be tightened/removed only once
    that backfill has run and no bare-plaintext rows remain. Pinned by
    `apps/api/src/__tests__/pan-encryption-at-rest.test.ts`.
    - **✅ CORRECTION (2026-08-08): the EMPLOYEE-PAN portion of this backfill is
      UNNECESSARY, not owed.** The read-only prod audit (`pan-prod-check.ts`, CI run
      `31253488299`) classified every **employee** PAN in production as **1 correctly
      encrypted, 0 plaintext, 0 double-encrypted, 0 undecryptable** — nothing to convert.
      The "9/9 plaintext" that scoped the backfill was a **dev-DB census**, not production.
      **Scope caveat:** the audit covers **employee PANs only**; the other five tables
      (organizations, vendors, directors, shareCapital/shareholders, companyDirectors) were
      **not** audited, so this correction is narrow to employees. (Separately, the vendor/
      director/shareholder read paths decrypt correctly — see "Two out-of-scope DPDP
      findings" — so they are not known to hold plaintext.)
    - **Two gaps surfaced during this pass (both now fixed):**
      1. **`vendors.create` / `vendors.update` bypassed `panColumns` entirely** —
         they spread the raw `pan` straight into the write, so they never stored the
         encrypted value *and* never stamped `panMaskedHash` / `panMaskedDisplay`
         either (the de-dup/match aids the other five tables all carried). Both now
         route through `panColumns`.
      2. **The read surface was wider than the initial map.** Beyond the per-record
         PDF/detail readers, the shareholder list, director lists (secretarial +
         india-compliance) and vendor list all return full rows that surfaced the raw
         `pan` column, as did several mutation `.returning()` paths (shareCapital,
         companyDirectors, directors create/markKYCComplete, vendor create/update).
         All of these now `decryptPan` before returning.
- **Schema-tooling theme (finding #32) — RLS is invisible to Drizzle's snapshot.**
  Every RLS wall in this repo (0052's ~233 tables + A11's three, migration 0061) is
  installed by **hand-written SQL**, and the Drizzle snapshot never records it: across
  the entire migration history **no snapshot has `isRLSEnabled: true` or a non-empty
  `policies` object for any table** — 0052 and everything after show every walled
  table as `isRLSEnabled: false`, `policies: {}`. The consequence is the actual
  finding: because the schema tooling has no model of which tables are walled, it can
  **never flag a new tenant table that is missing its wall** — exactly how
  `shift_schedules`, `esi_challan_records`, `pt_challan_records` slipped through
  (A11). The R-1 test (`rls-all-tables.test.ts`) is the *only* thing that catches
  this, and it does so by reading the live `pg_class` catalog, not the snapshot.
  - **What is NOT the fix (verified while shipping A11):** do **not** hand-populate
    `isRLSEnabled`/`policies` in the snapshot for the walled tables. If the snapshot
    records a table as RLS-enabled but the Drizzle **schema TS** carries no matching
    `.enableRLS()` / `pgPolicy()` declaration, the next `db:generate` sees the schema
    as "no RLS", diffs it against the snapshot's "has RLS", and emits a migration to
    **DROP** the policy and disable RLS — silently tearing the wall down. Recording
    RLS in the snapshot without the schema-side declaration is strictly worse than
    the current invisible-but-stable state.
  - **The actual shape of the work:** make schema and snapshot agree by declaring RLS
    in the Drizzle **schema definitions**, not the snapshot. Add `.enableRLS()` and a
    `pgPolicy("tenant_isolation", …)` (the `current_setting('app.org_id', …)` USING +
    WITH CHECK predicate 0052 uses) to **every one of the ~236 `org_id`-bearing
    `pgTable` definitions** in `packages/db/src/schema/*.ts`. Only then does
    `db:generate` (a) reproduce the wall in generated migrations and snapshots and
    (b) start flagging any future tenant table that lacks it — closing #32 at the
    tooling layer instead of leaning entirely on the R-1 runtime test. This is a
    deliberate repo-wide schema pass (all tenant tables at once, so schema/snapshot
    are consistent and no partial state triggers a DROP); it was out of scope for
    A11, which only needed the three walls in place and R-1 green. _(Infra/tooling
    hardening — no user-visible behaviour change; the walls already work at runtime.
    Do this before relying on `db:generate` to police tenant isolation.)_
- **RBAC theme (surfaced by A6) — custom roles can only express CRUD, not workflow
  verbs.** A6 aligned the custom-role save path to the `permission_action` enum's
  five values (`create/read/update/delete/manage`). That is the correct, minimal fix
  for the save defect, but it makes explicit a real product limitation: **a custom
  role cannot grant `approve`, `assign` or `close`, even though several built-in
  system roles can** (those verbs live in the runtime `RbacAction`/`ROLE_PERMISSIONS`
  matrix, `packages/types/src/rbac-matrix.ts`, which the custom-role table cannot
  reach). So an admin can build a role that reads/creates/updates/deletes/manages a
  module but cannot build one that, say, may *approve* a purchase order or *close* a
  ticket without also being handed a whole built-in role.
  - **This is a design decision, not a refactor.** The two options are: (a) give the
    custom-role builder a *separate* workflow-verb axis that maps onto the runtime
    matrix (so approve/assign/close can be granted per-module without the enum), or
    (b) accept CRUD-only custom roles and document that workflow-verb grants require a
    built-in role. Do **not** "fix" this by widening the `permission_action` enum or
    by collapsing the runtime vocabulary into it — those are two separate systems on
    purpose (one is stored custom-role permissions, the other is the compiled
    authorization matrix consulted by ~754 `permissionProcedure` checks). _(Bucket B —
    a watched single customer may want a bespoke approver role; not blocking.)_
- **Document-header theme (B16, B17) — captured identity the generators don't
  print.** Two defects that leave a self-generated document missing tenant detail
  it already holds. Group with A13 (they share the document-header code area) but
  they are bucket B — a watched single customer notices a blank field but is not
  blocked by it.
  - **B16 — the payslip route hardcodes the header to blank.** `buildPdfInput`
    sets `companyAddress: ""`, `tanNumber: "—"`, `pfEstablishmentCode: "—"`
    (`apps/api/src/http/payroll-payslip-pdf.ts:39-41`) and never passes
    `companyLogo` at all, even though the payslip *template* has slots for every
    one of them (`services/payslip-pdf.ts:26-29,158-160`) and the values exist on
    the org record (`organizations.tan`, `organizations.epfCode`,
    `packages/db/src/schema/auth.ts:63-64`). So a payslip prints only the company
    name; address, TAN and PF establishment code come out blank. Fix: read TAN and
    PF code from the org columns and thread the (future, see build items) address +
    logo through. The org row is already loaded in the route
    (`payroll-payslip-pdf.ts:115`).
  - **B17 — no company address field exists on the org record.** The org captures
    city / state / website / support email (`auth.ts:51-54`) but **no postal
    address**; the only address in the system is the one attached to a GSTIN
    (`gstinRegistry.address`, `packages/db/src/schema/accounting.ts:204`). Every
    document that wants a company address (payslip B16, Form 16 A13) therefore has
    nothing org-level to read. Decide the source of truth: either add a company
    address to the org record, or make the primary-GSTIN registered address the
    canonical document address. This blocks the *address* half of A13 and B16 —
    the PAN/TAN halves do not wait on it.
- **Test-hygiene theme — midnight-wraparound flake in the shift-schedule suite —
  DONE.** `shift-schedule-router.test.ts` built shift start times with a
  `minutesFromNow` helper that converted "now + N minutes" into
  **minutes-past-midnight** (`t.getHours()*60 + t.getMinutes()`). When the offset
  pushed the clock across 00:00 — e.g. the "starting later" case uses
  `minutesFromNow(120)`, so any run after ~22:00 wrapped to an early-morning minutes
  value — the computed `startMinutes` landed *earlier* in the day than the real
  current time, so a shift meant to start 2 h in the future looked already started
  and the punch was wrongly flagged `late` (expected `present`). This was a
  **time-dependent test bug, not a code defect**: the shift-aware punch logic
  (`lib/india/shift-schedule.ts` `derivePunch`) is correct; the helper just couldn't
  represent a start time that crossed the day boundary.
  - **First attempt (A11) — clamp — was incomplete and is superseded.** Clamping
    `nowMinuteOfDay + delta` into `[0, 1439]` fixed the *before*-midnight direction
    (the `+120` "present" case) but **introduced a symmetric failure just after
    midnight**: at 00:10, `minutesFromNow(-60)` clamps `-50 → 0`, so a shift meant to
    have "started 60 min ago" starts at 00:00, and `lateMinutes = 10` is not `> 10`
    grace → the "late" cases (lines 159, 188) wrongly read `present`. The A6 full
    suite tripped exactly this at 00:10. The root cause is deeper than any offset
    transform: `derivePunch` compares a raw minute-of-day with **no notion of which
    day**, so *no* pure `[0,1439]` transform of the live wall clock can express an
    offset that crosses a boundary.
  - **Real fix (A6 pass) — pin the clock.** The suite now freezes the wall clock to
    **local noon** for each test (`vi.useFakeTimers({ toFake: ["Date"], now: noon })`
    set at the end of `beforeEach`, after all seeding I/O; `vi.useRealTimers()` at the
    start of `afterEach`, before cleanup). Only `Date` is faked, so DB I/O and pool
    keep-alives still run on the real clock. `minutesFromNow` is now `NOON_MINUTE +
    delta` (12:00 ± a couple of hours stays safely in-band), and the punch's own
    `new Date()` reads the same frozen noon — so the before/after relationship holds
    regardless of when the suite runs. Test-only; no product code changed. Verified at
    **00:16** (inside the window that broke both the wrap and the clamp): 11/11 green.
    _(Surfaced at B2's 22:15 run; re-tripped at A11's 22:59; A11's clamp then
    re-tripped after midnight during A6's run; pinned-clock fix is boundary-proof.)_

---

## Dependencies at a glance

The ordering that actually matters (everything else is grouping for efficiency):

1. **R-1 → A11.** The all-tables wall test is written (red) before, or with, the
   migration that turns it green.
2. **R-2 → A6.** *(Done, and re-scoped.)* The permission-vocabulary test now pins the
   three surfaces that meet on the custom-role **save path** — UI grid = admin.ts
   input schema = DB enum, five values — not the runtime `RbacAction` checker, which
   is a separate vocabulary the enum never reaches. A6 aligned the save path; the
   runtime matrix was left untouched.
3. **R-3 → A3, A4.** The tenant-contact / honest-recording test precedes the DPDP
   delivery and erasure fixes.
4. **R-4 → A2.** The concurrency test (post double-count) precedes the row-lock fix.
   B2 (atomic numbering) and B3/B4 (other approval read-then-writes) share the #2
   root cause and code area but are **not** gated by R-4 — R-4 no longer carries a
   numbering sub-test, since the `count()+1` race is retry-healed rather than
   corrupting (see R-4's scope note and B2). Their acceptance tests are written with
   those items.
5. **A1 (canonical state key) → A7 (invoice line items) and A10 (three-way match).**
   Per-line GST and the match basis both depend on the state comparison being
   correct first.
6. **A10 → A9.** The three-way-match tax basis must be right before the goods-
   receipt build so its new match test can assert a clean pass.
7. **A11 → A8.** The wall on `esi_challan_records`/`pt_challan_records` should exist
   before A8 writes real challan data into them.
8. **A11 wall migration** is the only schema migration in bucket A. (A6 was
   previously expected to add a permission-enum migration; the decision to collapse
   the UI to the existing five values means A6 no longer touches the schema, so
   there is nothing to batch with A11.)
9. **A13 / B16 → A15 → A17.** A13 (Form 16 header) and B16 (payslip header) are the
   interim single-generator fixes; they fold into A15, the one shared header source
   every generator reads from; A17 (invoice/PO PDFs) reads from A15. B17 (company
   address source of truth) gates only the *address* half of A13/B16/A15 — the
   PAN/TAN halves do not wait on it. A16 (logo upload) is independent but supplies
   the logo A15 exposes and the payslip already has a slot for.
10. **A18 supersedes A13 (CA-resolved 2026-08-02).** A18 (import the TRACES-generated
    Form 16 PDFs) is the **sole** Form 16 deliverable path: TRACES has no live API,
    it issues both Part A and Part B, and a self-generated Part B has **no legal
    standing** — so **A13 is CLOSED (will-not-fix)** and its generator is reclassified
    as an HR-only preview. A18's scope is expanded to **parse + map + self-service
    publish + bulk DSC signing**. A18 is independent of A15/A17 (it ingests finished
    PDFs) but **depends on C9 (Form 24Q quarterly filing)** upstream — TRACES won't
    issue Form 16 until 24Q is filed. Its employee match key must be **`panMaskedHash`**
    (deterministic, pre-encryption), **never** the non-deterministic AES-GCM `pan`
    column, which cannot equality-compare.

Everywhere a fix changes a test that blessed the bug, the test change is part of
the fix (standing rule) — this is called out per item and is not a separate step.

---

_No source files were modified in producing this plan. It sequences the bucket-A
and bucket-B work from `reports/triage.md` against the root causes and reference
implementations in the codebase; the "genuinely sound" list in `audit-summary.md`
marks what to leave alone._

---

## First real payroll run — findings from the test environment (2026-08-03)

**These four came from running an actual payroll on the deployed test box, not from
the audits.** That is the point worth recording: the automated audits (triage,
money-invariants, RBAC, cascade suites) never surfaced any of them. Manual end-to-end
testing — approve a real unpaid leave, run the cycle, open the payslip PDF — produced
all four in one sitting. This is exactly the class of defect (a live back-door approval
path, a display-layer fabrication, a font gap, a UI join) that only a human driving the
product finds. Fixed one at a time, full API suite green between each.

- **PR1 — LOP not applied (back door approval). DONE.** EMP-0002 had an *approved*
  unpaid leave (3–11 Aug 2026, 9 days) yet the August payslip showed 31/31 days and a
  full month's gross. Root cause: **two approval paths, only one does the reflex** —
  the *same defect shape as the two leave paths found in sweep 5*. `hr.leave.approve`
  (`hr.ts:659`) correctly locks the row, moves the balance, and writes the G8 attendance
  reflex (unpaid → `absent` so payroll LOP sees it). But `hr.leave.update` (`hr.ts:777`)
  accepted `status:"approved"` and flipped the flag directly — **no balance move, no
  attendance rows** — so the leave never became Loss-of-Pay and the month was paid in
  full. The Edit-Leave dialog's Status dropdown offered "Approved", routing approvals
  through this back door.
  **Fix:** `leave.update`'s status input now permits only `pending`/`rejected`; approval
  goes through `hr.leave.approve` or nowhere (`hr.ts:788-790`). UI: the "Approved" option
  is removed from the Edit-Leave Status dropdown (`apps/web/.../hr/page.tsx`); the
  dedicated Approve button already calls `hr.leave.approve`.
  **Files:** `apps/api/src/routers/hr.ts`, `apps/web/src/app/app/hr/page.tsx`,
  `apps/api/src/__tests__/leave-attendance-reflex.test.ts` (two new tests:
  update-cannot-approve + no-reflex-from-update).
  **Fairness check:** RED — with the old `["pending","approved","rejected"]` enum, the
  new test's `leave.update({status:"approved"})` returned a request with `status:"approved"`
  and zero attendance rows (test's `rejects.toThrow()` failed → the back door). GREEN —
  with the narrowed enum, the input rejects `"approved"` and no attendance is written.
  Full API suite **141 files / 1339 tests pass**.

- **PR2 — YTD Net exceeds YTD Gross (×12 fabrication). DONE.** Payslip showed YTD
  Gross ₹29,84,785 but YTD Net ₹1,69,74,456. There was no `ytd_net`/`ytd_pf` column; the
  display fabricated both as *this month × 12* (`payroll.ts:177,179`;
  `payroll-payslip-pdf.ts:76,78`), which on any partial year makes YTD Net > YTD Gross.
  **Fix:** added real `ytd_net numeric(14,2)` + `ytd_pf numeric(12,2)` columns to
  `payslips` (**migration `0063_slippery_mariko_yashida.sql`**), persisted per run from
  `computeEmployeePayslip`'s `ytdNetPay`/`ytdPF` alongside `ytd_gross`
  (`payroll.ts` insert), and switched both display sites to read the stored columns
  (deleted the ×12).
  **Files:** `packages/db/src/schema/hr.ts`, `packages/db/drizzle/0063_*.sql` (+ journal +
  snapshot), `apps/api/src/routers/payroll.ts`, `apps/api/src/http/payroll-payslip-pdf.ts`,
  `apps/api/src/__tests__/payslip-ytd-net-pf.test.ts` (new).
  **Fairness check:** RED — with the ×12 code, `payslips.myPayslips` returned
  `ytdNetPay = 1,200,000` for a payslip whose stored `ytd_net` was `100,000` (12× wrong).
  GREEN — with the persisted columns it returns `100,000` and `ytdNetPay ≤ ytdGross` holds.

- **PR3 — Rupee glyph renders as superscript 1. DONE (Rs.); Noto Sans embedding is a
  recorded follow-up.** Both PDF generators (`payslip-pdf.ts`, `form16-pdf.ts`) use PDFKit's
  base-14 Helvetica (WinAnsi), which has no ₹ (U+20B9), so ₹ was substituted with a
  superscript-1 glyph. **Fix:** replaced every ₹ with the ASCII prefix "Rs." in both
  generators (11 sites in `payslip-pdf.ts`, the shared `row()` helper in `form16-pdf.ts`).
  **Files:** `apps/api/src/services/payslip-pdf.ts`, `apps/api/src/services/form16-pdf.ts`,
  `apps/api/src/__tests__/pdf-rupee-glyph.test.ts` (new).
  **Fairness check:** RED — re-introducing a single ₹ in `payslip-pdf.ts` fails the
  source-level `not.toContain("₹")` assertion. GREEN — both generator sources contain no ₹,
  contain "Rs.", and the payslip PDF still builds a valid `%PDF-` buffer.
  **FOLLOW-UP (open):** embed **Noto Sans** (which has ₹) in both generators so
  customer-facing documents can show the real rupee sign — Form 16 in particular goes to
  employees. Until then "Rs." is the correct, legible interim.

- **PR4 — Leave list shows a truncated UUID as the employee. DONE.** The list rendered
  `req.employeeId?.slice(0,8)` because `hr.leave.list` returned raw `leaveRequests` rows
  with no join. **Fix:** `leave.list` now left-joins `employees → users` and returns
  `employeeName` (users.name) + `employeeCode` (EMP-xxxx); the UI cell renders
  `employeeName ?? employeeCode ?? id.slice(0,8)`.
  **Files:** `apps/api/src/routers/hr.ts`, `apps/web/src/app/app/hr/page.tsx`,
  `apps/api/src/__tests__/leave-attendance-reflex.test.ts` (new list-name test).
  **Fairness check:** RED — with the old no-join query, `leave.list`'s rows had no
  `employeeName` (undefined). GREEN — the joined query returns `employeeName = "QA User"`
  and `employeeCode = EMP-xxxx` (not the raw UUID).

- **PR5 — YTD carried into a payroll run is hardcoded to zero. OPEN — payroll-blocking
  from the second cycle.** `buildEmployeePayrollInput` in
  `apps/api/src/services/payroll-run-aggregates.ts:87-90` passes the prior-period opening
  balances as `ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0` for every run. Because
  `computeEmployeePayslip` derives each YTD figure as `openingYTD + thisMonth`, the values
  persisted into `payslips.ytd_gross` / `ytd_net` / `ytd_pf` / `ytd_tds` therefore hold
  **this month only**, not a running financial-year total.
  - **Correct for FY month 1** (opening YTD genuinely is zero), so PR2's fix is valid on a
    first run — this is why the first real payroll run looked right.
  - **Wrong from month 2 onward:** April's totals reappear in May unchanged instead of
    accumulating, so every payslip after the first understates the YTD columns.
  - **Second-order impact:** the monthly-TDS true-up reads `ytdGross`/`ytdTDS`
    (`payroll-engine.ts:353-354`); with both stuck at this-month, the annualised
    projection and the tax already-deducted figure are both wrong from month 2, so TDS is
    mis-spread across the year.
  - **Fix required (not done here):** before building each employee's input, read that
    employee's most recent prior payslip in the same FY and seed
    `ytdGross/ytdPF/ytdTDS/ytdNetPay` from its stored `ytd_*` columns (fall back to zero
    only when no prior payslip exists). This is a behaviour change to the run and needs its
    own fairness test (two consecutive months, assert month-2 YTD == month-1 + month-2),
    so it is filed as a separate finding rather than folded into PR2.
  - **Flag:** payroll-blocking — must be closed before any customer runs a second monthly
    cycle, otherwise every YTD column and the TDS true-up drift for the rest of the year.

- **PR6 — A push to `main` auto-deploys to the Vultr box; there is no pre-deploy backup.
  OPEN — must be gated before any production target exists.** Confirmed empirically today:
  pushing commit `67a9a64` to `main` deployed to the test box with **no manual workflow
  dispatch**. (An earlier reading that called the Vultr deploy "manual" was wrong — it only
  looked at the standalone `.github/workflows/deploy-vultr.yml`, which *is* `workflow_dispatch`,
  and missed the second deploy job.)
  - **Where the automatic trigger lives:** `.github/workflows/ci.yml` runs on
    `push: branches: [main, develop]` (lines 4-5). Its `deploy` job (lines 253-311) has
    `needs: [build]` + `if: github.ref == 'refs/heads/main'`, and the **only** thing gating
    it is a secrets check — `if VULTR_HOST && VULTR_SSH_PRIVATE_KEY` (lines 264-275). Those
    secrets are set, so every green push to `main` SSHes to the box and runs
    `scripts/push-to-vultr.sh` with the pinned short SHA (lines 295-310). There are therefore
    **two** deploy paths: this automatic one in `ci.yml`, plus the separate manual
    `deploy-vultr.yml`.
  - **No pre-deploy snapshot exists in the flow.** `scripts/push-to-vultr.sh` rsyncs the
    tree and calls `scripts/vultr-remote-deploy.sh`, which does `docker compose down` → `pull`
    → `up`; migrations apply on API start; then a best-effort seed. **Nothing runs `pg_dump`,
    a DB snapshot, or any backup** at any point. The "take a backup/snapshot before deploying"
    rule (CLAUDE.md) is **not enforced by the pipeline** — it depends entirely on a human
    remembering to snapshot the VPS (which needs the cloud credentials, outside this repo)
    *before* pushing. Once the push lands, the deploy — including the `migrator` running new
    migrations against the live DB — proceeds with no recoverable pre-state.
  - **Fix required (not done here):** (1) remove or gate the `ci.yml` auto-deploy so a push to
    `main` cannot silently reach a real/production target — e.g. require an explicit
    `workflow_dispatch`, an environment protection rule with a required reviewer, or restrict
    auto-deploy to a dedicated non-prod ref; and (2) add an automated pre-deploy DB backup
    (`pg_dump` or a provider snapshot) as a required, gating step in `vultr-remote-deploy.sh`
    before `compose down`/migrate, so recovery does not depend on someone remembering.
  - **Flag:** deploy-safety — currently a green push to `main` is a live deploy **and** a live
    migration with no backup. Must be gated before there is any production environment to hit.

---

## Bank-file export + approval workflow — findings from the payroll page (2026-08-03)

**Another manual-testing batch, this time driving the payroll *run* page to the disbursement
step.** Findings 6 and 7 are download-layer defects (fixed here). Findings 1–5 are a single
**workflow gap**, not a defect: every handler does exactly what it claims, but the pipeline
doesn't advance itself.

- **F6 — Bank file downloaded as base64 text, not the decoded file. DONE.** The
  `exportBankFile` success handler (`apps/web/src/app/app/payroll/page.tsx:232`) did
  `new Blob([data.contentBase64], …)` — it wrapped the **base64 string** in the Blob and
  never decoded it, so the saved file was the base64 of the NEFT/CSV body, not the body.
  The API already base64-encodes on the wire (`payroll.ts:918`,
  `Buffer.from(result.body).toString("base64")`), so the client must decode.
  - **Fix:** new `downloadBankFile()` + `base64ToBytes()` in `apps/web/src/lib/utils.ts`
    (mirroring the existing `downloadCSV` helper): `atob` → `Uint8Array` → `Blob`, so the
    saved file is the real body. Handler now just calls `downloadBankFile(data)`.
- **F7 — The download hid what the API already told it, and would "succeed" with an empty
  file. DONE.** `generateBankFile` returns `recordCount`, `totalAmount`, and a `skipped`
  list of `{employeeId, reason}` (missing account, invalid IFSC, non-positive net pay —
  `bank-file-generator.ts:96-118`), and the router forwards all three (`payroll.ts:920-922`).
  The old handler ignored them: a run where every employee was skipped still "downloaded"
  a header-only file that looked like a successful export.
  - **Fix (two parts, same helper):** (2) **surface the outcome** — "N paid (₹total)" on
    success, and when anyone is skipped, a warning listing each skipped employee with the
    reason, so the user sees *X paid, Y skipped and why* alongside the download; (3)
    **refuse a zero-record file** — when `recordCount === 0` the helper shows an error
    naming the skipped reasons and downloads nothing (a header-only file that looks
    successful is worse than an error).
  - **Fairness:** red-before/green-after. Four behaviour tests in
    `apps/web/src/lib/__tests__/utils.test.ts` (decode-not-base64, refuse-zero,
    surface-paid, warn-with-reasons) were confirmed to **fail** against the original
    `new Blob([contentBase64])` handler and **pass** against the fix (49/49 in that file;
    `apps/web` `tsc --noEmit` clean).

- **F1–F5 — Approvals order the pipeline but trigger nothing (WORKFLOW GAP, not a defect).**
  The 14-step payroll pipeline is a chain of **individually correct** mutations, each of
  which advances `pipelineStatus` by exactly one step and returns — none of them *fires the
  next step*. Evidence:
  - `runs.approve` (`payroll.ts:566-591`) maps HR→FINANCE→CFO via a static `transitions`
    table, sets the new status, records the approver, and returns. It enforces order and
    segregation-of-duties correctly, but on the **final (CFO) approval it does not kick off
    statutory generation** — it just leaves the run at `CFO_APPROVED`.
  - After CFO approval, **two manual steps remain with no prompt**: `generateStatutory`
    (`payroll.ts:594`, requires `CFO_APPROVED`) and `complete` (`payroll.ts:615`, requires
    `STATUTORY_GENERATED`). The UI (`PAYROLL_STEPS`, `page.tsx`) exposes them only as the
    next button in the tracker; nothing tells the user those two steps are still owed, and
    nothing runs them automatically. A run can sit "CFO approved" looking finished while
    statutory outputs and completion were never done.
  - **This is design-shaped, not broken code** — hence recorded as a gap, not a defect. The
    option is either of:
    1. **Trigger the next step on final approval** — have the CFO-approval path enqueue/run
       `generateStatutory` (and optionally `complete`) so approval *drives* the pipeline; or
    2. **Show the user what remains** — after CFO approval, surface an explicit "2 steps
       remaining: generate statutory outputs, then complete" prompt/checklist so the manual
       steps are never silently skipped.
  - **Not fixed here** (no code change): needs a product decision between (1) auto-advance
    and (2) explicit remaining-steps prompt before implementing. Filed for that decision.

---

## Monthly TDS reconciliation — findings from instrumenting the tax engine (2026-08-04)

**A real payroll run for EMP-0002 (August 2026) deducted monthly TDS of ₹15,68,247, a
figure that reconciled to nothing on the screen.** These findings come from *running* the
real compiled engine — `computeTax`, `computeEmployeePayslip`, and the real
`buildEmployeePayrollInput` path — under temporary instrumentation (since removed), not from
reading the code. An earlier read-only diagnosis had guessed "annual ÷ months remaining" as a
complete explanation; running it disproved that as stated — the divisor (÷8 for August) is
right, but it divides a **different annual liability** than the screen shows, and *that* gap is
the real defect. **No code changed by this section — it is the diagnosis, filed for the fix.**

The reconciliation that holds to the rupee: the run's internal annual liability is
**₹1,25,45,976** (not the ₹1,33,92,608 on screen), and ₹1,25,45,976 ÷ 8 months-remaining =
**₹15,68,247**. The rolling Section 192 spread is correct; the annual figure it spreads is
computed off a different, lower gross than the screen displays.

- **PT1 — Two gross computations that disagree (ROOT DEFECT, payroll-blocking). NOT FIXED.**
  The screen and the payslip compute the employee's gross — and therefore taxable income and
  annual tax — by two different functions that do not agree:
  - **Screen (taxPreview):** `buildTaxProfileFromEmployee` (`apps/api/src/routers/payroll.ts:185`)
    feeds `structure.ctcAnnual` **directly** as gross, with `joiningMonth: 1`
    (`payroll.ts:218`), so `computeTax` uses the CTC as-is (`tax-engine.ts:255-256`). Taxable
    ₹3,57,40,020 → annual ₹1,33,92,608 (verified correct against the new-regime slabs).
  - **Payslip run:** `buildEmployeePayrollInput` (`apps/api/src/services/payroll-run-aggregates.ts:30`)
    **rebuilds** the salary from `ctcAnnual` — basic = ctc·0.40/12, HRA = basic·0.50, and
    special = ctc/12 − basic − HRA − **₹2,500** (`payroll-run-aggregates.ts:42`, a flat ₹2,500/mo
    shave) — then the payslip **re-annualises** those rebuilt parts ×12
    (`packages/payroll-math/src/payroll-cycle.ts:300`). The rebuilt annual gross is *lower*
    than the CTC the screen reads, so the run taxes a smaller income and computes a smaller
    annual liability.
  - **Consequence:** the screen and the payslip will essentially never agree, and the payslip
    (the number that actually deducts money) is the one taxing the wrong base. This is the root
    defect behind the ₹15,68,247 confusion — not a display bug. **Payroll-blocking:** fix the
    two paths to a single gross derivation before the first live run.
  - **Not fixed here** (no code change): the two functions must be collapsed to one gross basis.
    Filed.

- **PT2 — PDF recomputes annual tax and taxable income instead of reading them. NOT FIXED.**
  `apps/api/src/http/payroll-payslip-pdf.ts` re-derives, rather than prints, what the engine
  produced:
  - "Annual Tax Liability" = **monthly TDS × 12** (`payroll-payslip-pdf.ts:81`). For a mid-year
    month this multiplies the rolling catch-up figure by 12: for EMP-0002, ₹15,68,247 × 12 =
    ₹1,88,18,964 — the figure on the PDF, and pure fabrication.
  - Taxable income = **gross × 12 − hardcoded ₹75,000** (`payroll-payslip-pdf.ts:80`), which
    omits professional tax; this is the exact ₹2,400 by which the PDF's taxable income exceeds
    the screen's.
  - **Fix direction:** the PDF should print the engine's `totalTaxLiability` and `taxableIncome`
    off the stored computation, never recompute. **Not fixed here** (no code change). Filed.
  - **Note:** this is a *separate, third* discrepancy layered on top of PT1 — fixing PT1 does not
    fix PT2.

- **PT3 — New-regime surcharge cap applies 37% above ₹5 crore (statutory cap is 25%). NOT FIXED.**
  Verified by running the engine at new-regime taxable incomes above ₹5 crore: it applies a
  **37%** surcharge where the new regime caps at **25%** (only the old regime reaches 37% above
  ₹5 crore). Present both in code — `SURCHARGE_BANDS` (`packages/payroll-math/src/tax-engine.ts:120`)
  — and carried into the C5 seed (`packages/db/drizzle/0064_taxing_matters.sql:82`), which seeds
  a single regime-agnostic band set including the 37% top band. **Over-taxes anyone in the new
  regime above ₹5 crore.** EMP-0002 sits in the ₹2cr–₹5cr band (25%), so *this* payslip is
  unaffected, but the bug is real for higher earners. **Not fixed here** (no code change). Filed.

- **PT4 — previousEmployerTDS is hardcoded to zero; the rolling calc has no "already deducted"
  input. NOT FIXED.** The Section 192 rolling logic is implemented
  (`remainingTax = totalTaxLiability − previousEmployerTDS`, then `÷ remainingMonths` —
  `tax-engine.ts:354-359`), but the value it nets against is **hardcoded 0**
  (`apps/api/src/services/payroll-run-aggregates.ts:86`), with no intake for Form-12B prior-employer
  TDS and no prior FY-2026-27 payslip feeding it. So a mid-year joiner's prior-employer TDS is
  ignored entirely, and the whole annual liability is spread over the remaining months with no
  credit for tax already deducted. **Not fixed here** (no code change). Filed.

**VERIFIED CORRECT (no action needed):** the C5 seed (`0064_taxing_matters.sql`) matches the
statute band-for-band — new-regime slabs nil→₹4L, 5%→₹8L, 10%→₹12L, 15%→₹16L, 20%→₹20L,
25%→₹24L, 30% above (`0064:68`); standard deduction ₹75,000 (`0064:73`); s.87A rebate ₹60,000
to ₹12L taxable (`0064:78`). No mismatch against the current statute. C5 seeded the rate *values*
correctly; the only seed-level defect is the surcharge band set (PT3), which is a pre-existing
constant faithfully carried across, not a C5 rate error.

**STILL OPEN — close before fixing any of the above:** the reconciliation of ₹15,68,247 to
₹1,25,45,976 ÷ 8 was solved **backwards** (searching for the gross/annual that reproduce the
deducted figure), **not read from EMP-0002's actual record**. Before writing any fix, query the
real `employees` + `salaryStructures` rows for EMP-0002, run the real payroll path against them,
and confirm the annual liability the run computes is **₹1,25,45,976** (and the deducted monthly
is ₹15,68,247). Only then is the root cause proven rather than inferred. This requires DB access
to the deployed test environment.

## CA validation of the 9-employee cohort (2026-08-04) — PT3 escalated, PT1 reframed

A practising chartered accountant reviewed a purpose-built 9-employee cohort (COH-01…COH-09),
each exercising a distinct tax/statutory path, run through the **real** compiled payroll path
on the local dev DB (`resolveStatutoryCeilings` → `computeAttendanceLopForPeriod` →
`buildEmployeePayrollInput` → `computeEmployeePayslip` — the exact chain the `computePayslips`
mutation runs). Instrumentation has been removed; the seeded `COH-%` rows remain in the local
dev DB only.

**Eight of nine passed CA review.** Confirmed correct by the CA: the new-regime slabs, the
s.87A rebate, the PF ₹1,800 employee cap (basic > ₹15,000), the ESI trigger at 0.75% for gross
< ₹21,000 (COH-05 = ₹137), Maharashtra professional tax (₹200/mo, ₹2,500/yr cap), the surcharge
tiers **up to 25%** (COH-06 at ~₹60L → 10%; COH-07 at ~₹2.5cr → 25%, correct), and the
mid-month-join + LOP pro-rata for COH-09. These need no further action.

Two defects were confirmed by the CA, with prescribed fixes.

- **PT3 — surcharge cap. ESCALATED to payroll-blocking (was "filed").** Under s.115BAC the
  maximum surcharge above ₹2 crore in the **new** regime is **25%**; the engine applies **37%**
  above ₹5 crore. COH-08 (~₹6cr) was over-taxed by roughly **₹20 lakh/year** (engine annual tax
  ₹2,50,02,035; implied surcharge rate ≈37.0% on the base tax). COH-07 at ₹2.49cr correctly sits
  at 25%, so the break only manifests above ₹5cr — which is why EMP-0002 (₹2cr–₹5cr band) did not
  expose it. **CA's prescribed fix:** an explicit guardrail so that when `regime === "NEW"` and
  taxable income exceeds ₹2 crore, the applied surcharge can **never exceed 25%** — i.e. cap the
  new-regime surcharge rate at the 25% band regardless of the ₹5cr band in `SURCHARGE_BANDS`
  (`packages/payroll-math/src/tax-engine.ts:120`) and the mirrored C5 seed
  (`packages/db/drizzle/0064_taxing_matters.sql:82`). **Not fixed here** (no code change).

- **PT1 — rebuilt-gross gap. REFRAMED (was "two functions disagree"), and NOT to be aligned yet.**
  The CA's assessment reframes the severity: the rebuilt gross creates a mismatch between the
  **employment contract (CTC)** on one side and the **Form 16 and EPF filings** on the other —
  an **underpayment-of-wages exposure** and a **short-payment of statutory contributions**, not
  merely two internal figures disagreeing. The CA explicitly instructed: **do not simply align
  the two functions** until we establish what the ₹2,500 monthly reduction at
  `apps/api/src/services/payroll-run-aggregates.ts:42` actually represents.

  **What the ₹2,500/mo reduction is — established (read-only, no code change):**
  `specialAllowance = max(0, ctc/12 − basic − hra − 2500)` shaves a flat **₹2,500/month
  (₹30,000/year)** off the special-allowance residual, so it disappears from gross entirely and
  is **never added back** to any earnings or deduction line. Findings on what it is *not*:
  - **Not the standard deduction.** The standard deduction (₹75,000/yr new = ₹6,250/mo) is applied
    separately and correctly *inside* `computeTax` (`tax-engine.ts:244,278`). The ₹2,500 is
    neither that amount nor applied at the tax step.
  - **Not professional tax.** PT is a separate downstream deduction (₹200/mo). ₹2,500 is the
    *annual* Maharashtra PT **ceiling** (`packages/payroll-math/src/statutory-deductions.ts:201`),
    here applied **monthly** — i.e. 12× too large and in the wrong place. Treating it as reserved
    PT would double-count, since PT is already deducted.
  - **It is an unexplained, undocumented carve-out.** No comment, constant name, or config
    explains it; it is a bare literal `- 2500` in the residual.

  **Where the two paths actually diverge (the true PT1 mechanism):** the **same** `- 2500` shave
  exists in *both* gross builders — the run path (`payroll-run-aggregates.ts:42`) **and** the
  screen/preview path `buildTaxProfileFromEmployee` (`apps/api/src/routers/payroll.ts:197`). So
  the two functions are **not** distinguished by the shave. They diverge on the **annual
  re-projection**: the screen path passes `joiningMonth: 1` (`payroll.ts:218`), so `computeTax`
  takes the branch `joiningMonth === 1 ? annualCTC` (`tax-engine.ts:255-256`) and taxes the
  **full, un-shaved CTC**; the run path re-annualises the **shaved** monthly components ×12
  (`packages/payroll-math/src/payroll-cycle.ts:300`), so it taxes **CTC − ₹30,000**. That ₹30,000
  is the exact gap the cohort shows on every full-year employee (e.g. COH-06: CTC 60,00,000 →
  rebuilt annual gross 59,70,000).

  **Consequence for the fix (per CA):** the resolution is **not** "make the run match the screen"
  or vice-versa — it is to first name the ₹2,500. If it is meant to be the standard deduction, it
  must be **removed from the monthly gross calculation** and applied as an **annual deduction at
  tax computation** (which the engine already does, so the monthly shave would just be deleted).
  If it represents something else, that something must be named and justified. Only after that is
  the contract ↔ gross ↔ Form 16 ↔ EPF chain made consistent. **Not fixed here** (no code change).

- **PT-TEST (CA's third recommendation) — lock the old-vs-new break-even. NEW ITEM.** The CA
  recommends an **automated test** that pins the old-regime-vs-new-regime break-even using the
  **COH-02 parameters** (~₹18L CTC), so future rate/slab/deduction changes cannot silently shift
  which regime wins. The verified reference values to lock (from the real engine, full-year,
  no old-regime deductions declared): **NEW** → taxable ₹16,92,500, annual tax **₹1,44,040**;
  **OLD** → taxable ₹17,17,500, annual tax **₹3,40,860** (new regime wins by ~₹1,96,820/yr at
  these inputs). The test should assert both figures (and that NEW < OLD here) against
  `computeTax`, mirroring the money-invariant tests in `apps/api/src/__tests__/`. **Not built
  here** (no code change).

**Revised statuses:** PT3 → **payroll-blocking** (was filed). PT1 → **payroll-blocking, blocked
on naming the ₹2,500** before any code change (do not align the two functions first). PT-TEST →
new **build item** (regression lock). PT2 and PT4 unchanged from the 2026-08-04 section above.

## Ingestion-gap scoping pass (2026-08-04) — statutory inputs with no way in

**Why this section exists.** The rest of this plan was written from **code audits**, which
show what *exists and behaves wrongly*. They do **not** show that a required input has **no way
in**. That class of gap is only found by testing: `taxRegime`, `state`, and `isMetroCity` are all
statutory determinants that are **database columns with silent defaults** and **no UI field, no
API mutation, and no config screen** to set them. This pass answers, for every pending payroll/GST
item (C1, C2, C3, C4, C6, C7, plus A12-D and PR5): what inputs does it need, is there a path to
supply each today, what happens now when there is none, and whether the silent default becomes a
**filed or paid** statutory value. **No code was changed by this section — it is scoping, filed so
the ingestion work is costed rather than discovered mid-build.**

**The structural cause.** `hr.employees.create`/`update` (`apps/api/src/routers/hr.ts:253-379`)
accept **only org-chart fields** (name, dept, title, manager, grade, employment type, location,
start date, salary-structure id). **Every statutory field on the employee record** — regime,
state, metro, PAN, UAN, bank, ESI IP — is a column the mutation never writes, so it rides its
schema default. Only the **salary structure** (`payroll.salaryStructures.upsert`) and the org tax
IDs have any real input path, and the org path is itself partial.

> **⚠️ POINT-IN-TIME SNAPSHOT (2026-08-04) — OVERTAKEN BY LATER INGESTION WORK (verified
> 2026-08-07).** This table records what had "no way in" *as of 2026-08-04*. Since then the
> employee create/update mutation and both dialogs gained the statutory determinants, so several
> "No — not settable" rows below are **stale**. Corrected:
> - **C2 employee `state`** — now **REQUIRED** at `hr.employees.create` and accepted at `update`
>   (`apps/api/src/routers/hr.ts:273/415`); written to the record. The Maharashtra fallback is gone.
> - **C1 `taxRegime`** (the election field itself) — now accepted + written (`hr.ts:277/418`).
> - **C6 PAN, UAN, ESI IP number, bank (no./IFSC/name)** — now accepted + written
>   (`hr.ts:279-285/419-425`); inputs exist on both dialogs.
> - **(also) gender, DOB, the three PT-exemption flags** — accepted, written, read by `computePT`
>   (see the corrected C2 structural-break #2 note above).
>
> **NOT corrected — still open exactly as written:** the **C1 investment-declaration rows** (80C /
> 80D / 80CCD1B / 24b / HRA-exempt / rent) remain hardcoded `0` with no intake table — that was
> **not** re-verified in the 2026-08-07 sweep and stands as the larger half of C1. Treat the
> determinant/identity rows as closed and the declaration rows as open.

### The table

**Settable today?** = can a user/admin supply it via any form, mutation, or config screen right
now. **Statutory consequence?** = the default becomes a number that is filed or paid.

| Item | Input needed | Settable today? | Current default | Statutory consequence? |
|---|---|---|---|---|
| **C1** regime | Per-employee, per-year old/new election | **No** — not in `hr.employees.create/update`; no form field | `taxRegime = "new"` (schema default; run maps NULL→NEW, `payroll-run-aggregates.ts:65`) | **Yes** — everyone taxed NEW; a genuine OLD electee is mis-deducted, Form-16 filed on unchosen regime |
| **C1** | Old-regime deductions (80C, 80D, 80CCD1B, 24b, HRA-exempt, rent paid) | **No** — hardcoded `0` in **both** build paths (`payroll-run-aggregates.ts:68-75`; `payroll.ts:208-214`) | all `0` | **Yes** — even if OLD is elected, TDS over-deducts (no declared investment reduces it) |
| **C2** | Employee work **state** (PT determinant) | **No** — not in employee mutation or form | `state = NULL` → run falls back to **"Maharashtra"** (`payroll-run-aggregates.ts:58`) | **Yes** — Maharashtra PT (₹200–300/mo, ₹2,500/yr) deducted & filed for *every* employee regardless of real state |
| **C2** | PT for the other states | **Partial** — only **7** state keys exist in `PT_SLABS` (`statutory-deductions.ts:199-258`); no config screen | Unknown state → **PT = 0** (`statutory-deductions.ts:269-270`) | **Yes** — employees in unsupported states get ₹0 PT filed (under-deduction) |
| **C3** | ESI six-month contribution-period lock | **No** — no field; rule not implemented | Bare per-month test `gross ≤ 21,000` (`statutory-deductions.ts:183`); member **dropped the month gross crosses ₹21k** | **Yes** — ESI stops mid-period against the rule; ESIC challan understated |
| **C3** | ESI rates / ceiling as config | **No** — in-code constants (0.75% / 3.25% / ₹21,000, `statutory-deductions.ts:175-177`) | those constants | Only on a rate change (then needs a deploy) |
| **C4** | VPF election (fixed ₹ or % of basic+DA) | **No** — `isVoluntaryHigherPF` hardcoded `false` (`payroll-run-aggregates.ts:84`); no VPF column exists | `false` → PF capped at **₹1,800** | **Yes** — a VPF electee contributes only the statutory ₹1,800; ECR/challan understates their PF |
| **C4b** | Para 26(6) joint-declaration opt-in (PF on actual basic) | **No** — no column, no flag, no mutation | not implemented → always ₹15k-capped base | **Yes** — opted-in employees' PF filed on capped base, not actual basic |
| **C4** | ₹1,800 cap itself | n/a (correct) | ₹1,800 = 12% × ₹15,000 (`statutory-deductions.ts:134-149`) | Correct as-is |
| **C6** | ESI IP number | **No** — **column does not exist** on employee/payslip | absent | **Yes** — mandatory payslip field cannot be printed |
| **C6** | Employee bank account (no., IFSC, name) | **No** — columns exist (`hr.ts:143-145`) but **not in any mutation/form** | `NULL` | Payslip field blank; disbursement target absent |
| **C6** | PAN, UAN | **No** — columns exist; not in mutation/form | `NULL` | **Yes** — Form-16 / EPFO-ECR filed with blank PAN/UAN |
| **C6** | DA line (conditional) | **No** — no DA component on the salary structure at all | not implemented | **Yes** — DA cannot be represented; structures needing DA are mis-stated |
| **C6** | CIN, TAN, PF/ESI establishment nos. (tenant identity on payslip) | **Partial** — `tan`, `epfCode` columns exist on org (`auth.ts:63-64`) but **no org-update mutation sets them**; **CIN & ESI no. have no column** | `NULL` / absent | **Yes** — statutory header fields blank on payslip/filings |
| **C7** | Invoice **place-of-supply** state code | **Partial** — invoice `placeOfSupply` settable per invoice, else falls back to GSTIN registry state (`accounting.ts:835`) | GSTIN registry `stateCode` | **Yes** — drives CGST+SGST vs IGST; wrong POS = wrong GSTR-1 split |
| **C7** | Supplier GSTIN / state | **Partial** — lives in separate `gstinRegistry`, not on the org record | per-registry | **Yes** — determines the supply split |
| **C7** | B2CL category | **No** — builder emits only B2B + B2CS (`accounting.ts:840-849`); no B2CL | B2CL supplies mis-bucketed | **Yes** — large B2C inter-state invoices filed in the wrong table |
| **C7a** | AATO (annual aggregate turnover) for HSN 4-vs-6 digit | **No** — **no AATO field**, no turnover-threshold logic anywhere | absent → no HSN digit enforcement | **Yes** — HSN summary filed at wrong digit depth for the tenant's turnover |
| **A12-D** | (no user input) — split-logic projection in the engine | n/a | current-month LOP earnings projected ×12 (`payroll-cycle.ts`) | **Engine-only** — computation fix, no ingestion gap |
| **PR5** | (no user input) — prior-month YTD read from last payslip | n/a | `ytdGross/PF/TDS/Net = 0` every run (`payroll-run-aggregates.ts:87-90`) | **Engine-only** — computation/data-read fix, no ingestion gap |

### 1. Input-path sub-items (so ingestion is costed, not discovered mid-build)

Each of C1, C2, C3, C4, C6, C7 gains an explicit **input-path sub-item**. The engine work is not
"done" until the input that drives it can be entered by a user/admin. **A12-D and PR5 are
engine-only** — they need no new input and get no sub-item.

- **C1-IN — regime + investment-declaration intake.** Add (a) a per-employee, per-FY **regime
  election** field to the employee create/update mutation + form, threaded into
  `buildEmployeePayrollInput`/`buildTaxProfileFromEmployee` (both currently map NULL→NEW); and
  (b) an **investment-declaration intake** (80C, 80D, 80CCD1B, 24b, HRA-exemption inputs, rent
  paid) so the OLD-regime branch has real deductions to apply. **C1 is not complete when the
  branch works — it is complete when an employee can declare investments** (see §3 below).
- **C2-IN — employee work-state capture.** Add **state** (and, where the metro rule matters,
  `isMetroCity`) to the employee mutation + form, so PT is computed on a chosen state instead of
  the silent Maharashtra fallback. Pair with the engine work to populate the missing pilot state(s)
  (see §3 — Kerala).
- **C3-IN — ESI membership/period state.** The six-month lock needs a place to record that an
  employee **is** an ESI member and the period they were enrolled in, so the engine can keep them
  in until period-end. Today there is no membership field at all — only a per-month gross test.
- **C4-IN — VPF / JD election intake.** Add per-employee **VPF** (fixed ₹ or % of basic+DA) and
  **Para 26(6) joint-declaration opt-in** fields to the employee mutation + form, wired to
  `isVoluntaryHigherPF`/actual-basic (both absent today). Without this the PF engine can only ever
  apply the ₹1,800 cap.
- **C6-IN — statutory-identity intake (employee + tenant).** Add employee **PAN, UAN, ESI IP
  number, bank account** to the employee mutation + form (columns mostly exist but are unreachable;
  ESI IP has **no column** — schema add required), and a **tenant-identity config screen** for
  **CIN, TAN, PF/ESI establishment numbers** (TAN/EPF columns exist but no mutation sets them; CIN
  and ESI number need columns). Also add the **DA** salary-structure component (no column today).
- **C7-IN — GST identity + turnover intake.** Add a settable **place-of-supply** on the invoice
  path (partial today), surface **supplier GSTIN/state** as tenant config rather than only the
  separate registry, and add a **tenant AATO** field feeding the C7a HSN-digit rule (no field
  today). The **B2CL** bucket is an engine gap, not an input gap.

### 2. Ranking — blank default vs plausible-wrong default

The ranking that matters is **not** severity of the field but **whether the default is caught**.
A **blank** default fails loudly at the portal/filing and gets fixed. A **plausible wrong value**
is silently deducted, paid, and filed with **nobody noticing** — that is the dangerous class.

- **TIER 1 — plausible wrong value, filed/paid silently (highest risk).** The default is a real,
  valid-looking number that no one chose:
  1. **C1 regime → NEW.** A NEW-regime computation is produced and filed for an employee who may
     have elected OLD. Nothing errors; the TDS is simply wrong and binds the return.
  2. **C2 state → Maharashtra PT.** A Kerala (or any-state) employee has **Maharashtra** PT
     (₹200–300/mo) deducted and filed. Valid PT, wrong state, invisible.
  3. **C7 POS → GSTIN-registry state.** An invoice with no place-of-supply silently takes the
     registry state, deciding CGST+SGST vs IGST. A wrong split is a valid-looking return.
  These three are the ones that matter most, and are exactly the ones found only by testing.

- **TIER 2 — plausible wrong value, but only affects an opted-in minority or a sub-population.**
  4. **C4 VPF/JD → off (₹1,800 cap).** Correct for most; silently under-contributes only for
     employees who elected VPF or JD — but for them it is filed wrong.
  5. **C2 unknown state → PT = 0.** Under-deducts silently, but only for states outside the 7 in
     `PT_SLABS` (a no-PT ₹0 also *looks* plausible, e.g. it's correct for Delhi).
  6. **C3 ESI drop-at-ceiling.** Produces a plausible ESI figure that is wrong only across a
     contribution-period boundary.

- **TIER 3 — blank/absent, caught downstream (lowest risk of silent mis-filing).** Fails visibly:
  7. **C6 PAN / UAN / ESI IP / bank → NULL/absent.** A blank PAN is rejected at the TRACES/EPFO
     portal; the error surfaces before it becomes a wrong filing.
  8. **C6 tenant CIN/TAN → NULL.** Blank header identity is visibly missing on the payslip/filing.
  9. **C7a AATO → absent / C7 B2CL → absent.** No value is emitted, so it's a visible structural
     gap rather than a silently-wrong number.

**Rule of thumb for the build order:** close the **Tier-1** three (regime, state, POS) with real
ingestion **before** first live payroll/GST, because their defaults are the ones that get paid and
filed without tripping any alarm.

### 3. Two additions

- **C1 scope now explicitly includes investment declaration.** The old-regime deductions —
  **80C, 80D, 80CCD1B, 24b, HRA exemption, rent paid** — are **hardcoded to `0` in both build
  paths** (`payroll-run-aggregates.ts:68-75` and `buildTaxProfileFromEmployee`, `payroll.ts:208-214`).
  So even once the regime branch works, an OLD-regime employee is over-deducted because the engine
  sees zero declared investments. **C1 is complete only when an employee can declare investments**
  and those figures flow into `computeTax` — not when the branch merely selects OLD. Recorded as
  part of C1's scope (and as C1-IN above).

- **C2 pilot-state check — Kerala is MISSING; C2 is engineering, not just data entry.** `PT_SLABS`
  (`statutory-deductions.ts:199-258`) contains **7** keys, not six: **MAHARASHTRA, KARNATAKA,
  TAMIL_NADU, TELANGANA, WEST_BENGAL, DELHI** (empty slabs — Delhi levies no PT, correct), and
  **GUJARAT**. For the pilot's three states:
  - **Karnataka — present** (`statutory-deductions.ts:208`). ✅ data entry only.
  - **Tamil Nadu — present** (`statutory-deductions.ts:216`). ✅ data entry only.
  - **Kerala — was ABSENT (NOW ADDED, 2026-08-07 — see the C2-STRUCT half-yearly build below).**
    ❌ (as of 2026-08-04) A Kerala employee fell through to the unknown-state branch and got
    **PT = 0** — but **NOT silently: F-PT-NIL had already made that ₹0 carry an `unknownState`
    flag that raises a per-employee run warning** (the "filed silently" characterisation was
    wrong; the run surfaced it before locking). Kerala now has its own half-yearly slabs, so it no
    longer hits the unknown-state branch at all. Still wrong at 2026-08-04 because Kerala levies PT
    half-yearly. (Kerala appears only in `LWF_RATES`, `statutory-deductions.ts:303`, which is a
    different levy.) **Therefore C2 for the pilot is an engineering task** — add the Kerala PT slab
    set — **not merely populating a config with an existing schema.** Flagged as blocking for any
    Kerala employee in the pilot.

## Second CA message (2026-08-04) — statutory-source confirmations, one new defect, and fifteen rulings

The CA sent a second written response: it **verifies the tax slabs against the Income Tax
Department's own published page**, confirms several statutory figures, raises **one new defect**
(s.87A marginal relief), flags **three failure points new to the plan**, and issues **fifteen
rulings** that resolve open questions across PT, ESI, PF, regime, declarations and retention.
**No code was changed by this section — it is a record/plan edit only.** Where a ruling confirms
an item already tracked above, this section cross-references it rather than duplicating the fix.

### A. Slab set VERIFIED against the ITD — do NOT change the slabs

The CA's two messages gave **different** new-regime slab sets. The **first** is the one the
engine implements and C5 seeded; the **official ITD page for salaried individuals confirms the
first set**:

> nil to ₹4,00,000; 5% to ₹8,00,000; 10% to ₹12,00,000; 15% to ₹16,00,000; 20% to ₹20,00,000;
> 25% to ₹24,00,000; 30% above.

This matches the seeded values verified above (`0064_taxing_matters.sql:68`; "VERIFIED CORRECT"
at line 2758). **The CA's *second* message described the earlier Finance Act 2024 structure — do
not adopt it.** No slab change.

### B. Other figures CONFIRMED against the ITD page (statutory source)

- **Surcharge caps — confirmed.** New regime **25%** (above ₹2cr; does **not** step to 37%), old
  regime **37%**. This is the statutory basis for **PT3** (already escalated to payroll-blocking):
  the engine applies **37%** above ₹5cr in the new regime and must cap the new-regime surcharge at
  **25%**. **PT3 is now confirmed against the statutory source**, not just the cohort run.
- **s.87A rebate — confirmed ₹60,000, taxable income not exceeding ₹12,00,000** (NOT ₹7,00,000).
  Matches the seed (`0064:78`, "s.87A rebate ₹60,000 to ₹12L taxable") and the cohort confirmation.
  No change; recorded as statutory-source-confirmed.
- **Marginal relief on surcharge — thresholds differ by regime.** Applies at **₹50L, ₹1cr, ₹2cr,
  and ₹5cr under the OLD regime**, but only at **₹50L, ₹1cr and ₹2cr under the NEW regime** (because
  the new-regime surcharge does not step up above ₹2cr). **Action: verify the engine does NOT apply
  a ₹5cr marginal-relief calculation to new-regime income.** Record as a defect if it does. _(Open
  verification item — no code change here.)_

### C. FY / assessment-year CAVEAT — open question for the CA

The ITD page the CA cited covers **AY 2026-27, i.e. FY 2025-26**. **Our payroll run is FY 2026-27.**
**Open question for the CA:** whether any slab, surcharge, rebate or relief figure changed for the
**current** financial year (FY 2026-27 / AY 2027-28). Until answered, treat every confirmed figure
above as verified for FY 2025-26 and **provisionally** carried into FY 2026-27.

### D. NEW DEFECT — s.87A MARGINAL RELIEF at the rebate threshold (separate from surcharge relief)

> **✅ CLOSED — VERIFIED PRESENT (2026-08-07). Not a defect; it shipped.** A read-only
> verification sweep confirmed the rebate-cliff relief **is implemented and test-proven**, and has
> been since the **PT5** increment (`7b2f0e6`; CONTEXT.md records "PT3/PT5 … surcharge cap + s.87A
> marginal relief"). It lives in `computeTax` **Step 5b**
> (`packages/payroll-math/src/tax-engine.ts:354-371`): when the ₹60,000 rebate drops away above
> ₹12,00,000 taxable, tax is capped at the income earned above the threshold (₹12,00,001 → ₹1).
> It is a **separate mechanism** from surcharge marginal relief (Step 6), at a different threshold —
> not the surcharge relief wearing a different hat. Proven by the dedicated `PT5 — Section 87A
> rebate marginal relief` block in `apps/api/src/__tests__/india-payroll-engine.test.ts:140-191`
> (nil at ₹12L; ₹1 at ₹12,00,001; ₹50,000 at ₹12,50,000; relief tapering out ~₹12.72L; liability
> never falls crossing the cliff). The "verify → defect if absent, never verified" framing below is
> **stale** — the item was already closed under the PT5 label; it was simply never reconciled here.

The CA raised this at the wrong threshold, but **the concept is real and independent of surcharge
marginal relief.** Just above the rebate limit (₹12,00,000 taxable, new regime), **the tax must not
exceed the amount of income earned above the limit.** Without it, an employee at **₹12,05,000**
taxable faces a **cliff**: losing the full ₹60,000 rebate on ₹5,000 of extra income.

- **Verified present (see the CLOSED banner above):** the engine implements marginal relief **on the
  rebate at ₹12,00,000** (Step 5b), **separately** from marginal relief on surcharge (section B).
- ~~If absent → record as a defect.~~ **Not absent.** Confirmed implemented under PT5.

### E. CA RULINGS — recorded verbatim in intent (resolve open questions above)

Each ruling below is the CA's authoritative answer. Cross-references point to the item it settles.

- **PT1 — the legally correct TDS basis is ACTUAL PAID components, not contracted CTC.** This
  **directly settles the open PT1 question** (the ₹2,500/mo rebuilt-gross shave, lines 2801-2839):
  the actual paid salary is the correct basis. Correcting already-filed periods requires a **revised
  Form 24Q**; the **1.5%/month interest is borne by the company** and **cannot be recovered from the
  employee**; the **principal shortfall** is recovered from the next cycle **or grossed up**. _(Feeds
  the PT1 resolution and the C9/24Q item.)_
- **REGIME — declared at onboarding or start of year, LOCKED for twelve months.** No mid-year switch
  in payroll. **Defaulting to NEW is statutory and correct.** Employees may switch only when filing
  **personally**. _(Confirms C1's election model + the C1 "default NEW" behaviour is correct.)_
- **INVESTMENT DECLARATIONS — provisional in April, physical proofs by January.** If proofs are not
  submitted, **zero the declared values and spread the resulting extra tax over February and March.**
  _(Feeds C1's investment-declaration scope, line 2972 / C1-IN; adds a proof-deadline + Feb/Mar
  spread rule the current build does not have.)_
- **METRO — Delhi, Mumbai, Kolkata, Chennai ONLY**, determined by the **employee's residential
  address**, not company location. **Bengaluru and Hyderabad are non-metro (40%).** _(Settles the
  `isMetroCity` determinant — it must key off employee residence, not org/company location; feeds
  the C6/ingestion metro item.)_
- **PT CAP — the ₹2,500 constitutional cap must be respected ACROSS THE YEAR.** Individual state
  limits apply independently, **but the engine must maintain a running total per employee and stop
  extraction at ₹2,500.** _(Confirms the **C2-STRUCT structural break #4 (interstate mid-year
  transfer)** added above — the engine tracks NO YTD PT today, so the cap is unenforceable. This
  ruling makes the per-employee YTD-PT ledger a firm requirement, not an open question.)_
- **PT HALF-YEARLY — lump sum in one month, NOT spread.** Kerala & Tamil Nadu: **Apr–Sep deducted
  in Aug or Sep; Oct–Mar deducted in Jan or Feb.** Puducherry: **Apr–Sep deducted in Sep; Oct–Mar
  deducted in Mar.** _(Confirms C2-STRUCT structural break #1, the half-yearly levy period, with the
  exact deduction months.)_
- **PT EXEMPTIONS — the EMPLOYER is legally liable for missed collections.** Evidence required:
  **PAN or birth certificate** for age-over-65; **Form 10-IA signed by a Government Civil Surgeon**
  for disability; **military ID or discharge order** for armed forces. _(Confirms the C2 TIER-1
  exemption scope and specifies the exact evidence each ingestion field must capture.)_
- **PT GENDER — if gender is not stated, DEFAULT TO THE MALE SLAB.** It taxes from a lower threshold,
  so defaulting male **prevents structural under-deduction.** _(Confirms the C2-FIX decision already
  shipped — absent gender resolves to the male Maharashtra set; the CA endorses that default.)_
- **ESI — on crossing ₹21,000 MID-PERIOD, contributions continue on the ACTUAL UNCAPPED gross**
  at **0.75% (employee) and 3.25% (employer)** — **not** capped at ₹21,000. **At the period boundary
  (1 April / 1 October), evaluate the gross snapshot and toggle membership OFF if above the limit.
  No exit paperwork.** _(Settles **C3** — the six-month contribution-period rule: continue-uncapped
  mid-period, re-evaluate only at the boundary.)_
- **VPF — cannot be changed mid-year.** Declared or changed **in April only, locked for twelve
  months.** _(Confirms the C4a VPF sub-item's lock semantics.)_
- **PARA 26(6) JOINT DECLARATION — IRREVOCABLE for that employment.** The engine must **block any
  attempt to revert to the ₹15,000 ceiling**, and the **employer's contribution must also be on the
  actual uncapped basic.** _(Confirms **C4b** — Para 26(6) opt-in is one-way; adds the "block revert"
  + "employer also uncapped" requirements.)_
- **FORM 12B — optional for the employee to submit, MANDATORY for the employer to account for once
  submitted.** If not submitted, **set the prior-YTD baseline to zero and tax only on this
  employment.** _(Directly settles **PT4** — the hardcoded-zero `previousEmployerTDS`: zero is only
  correct when no 12B was submitted; when one is, the prior-employer TDS must flow into the rolling
  s.192 calc.)_
- **RETROSPECTIVE EDITS — PROHIBITED on a locked, approved run.** Backdated appraisals must be
  processed as **salary arrears in the current open month.** **Confirms M-05.** _(Cross-reference the
  M-05 retrospective-edit item; the CA endorses arrears-in-current-month, not back-editing.)_
- **RETENTION — payroll registers and tax forms for a MINIMUM of eight financial years.** Immutable
  logs or secure PDFs acceptable. _(New retention requirement; feeds the audit-log/doc-retention
  posture — 8 FY minimum for payroll + tax forms.)_
- **REGIME PRIORITY — 75–80% of employees between ₹18–25 lakh are better off on the NEW regime**
  under a standard-deduction footprint. Old regime is viable **only with heavy claims** (₹2L home-loan
  interest u/24(b), ₹1.5L u/80C, high metro rent). _(This is the CA's stated **justification for
  keeping C1 (old-vs-new election) below the correctness fixes** in priority — the new-regime default
  is right for most; the old-regime branch matters for a minority.)_

### F. THREE FAILURE POINTS the CA flagged — all NEW to the plan

1. **s.87A marginal relief above the rebate threshold** — see section D above. **✅ CLOSED —
   verified present (2026-08-07), shipped under PT5 at `tax-engine.ts:354-371` (Step 5b),
   test-proven. Not a defect.**
2. **LWF collection cycles are ASYNCHRONOUS.** Some states monthly; **Maharashtra strictly twice
   yearly (June and December).** **Action: check what the engine assumes** for Labour Welfare Fund
   timing (`LWF_RATES`, `statutory-deductions.ts:303`) — if it treats LWF as uniformly monthly it
   mis-times Maharashtra's half-yearly June/December collection. **New item.**
3. **PF arrears in the ECR file cannot be lumped into a single basic-wage field — the EPFO portal
   REJECTS the upload.** Arrears must be **mapped back to their originating months** in the generated
   ECR file. **Action: confirm the ECR generator distributes arrears per originating month rather
   than as one lump.** This intersects the M-05/arrears ruling (backdated appraisals → current-month
   arrears) and the PT1 revised-24Q path. **New item — ECR arrears month-mapping.**

**Net of the second CA message:** slabs **confirmed unchanged**; **PT3 confirmed against the
statutory source** (25% new-regime surcharge cap); **s.87A ₹60k/₹12L confirmed**; **PT1, C3, C4a,
C4b, PT4, M-05 open questions all settled** by ruling; **three new items** raised (s.87A rebate
marginal relief, LWF Maharashtra half-yearly timing, PF-arrears ECR month-mapping); and **one FY
caveat** (verify FY 2026-27 figures with the CA) plus **one new-regime surcharge relief check**
(no ₹5cr relief in the new regime) left open for verification.

## Two records (2026-08-05) — C1 scope correction + the second payroll engine

_Documentation only. No code was changed by this section. Both records are the result of a
code audit at migration head `0068_easy_mongu` (the HRA-exemption fix, shipped `d7dff03`)._

### 1. C1 SCOPE CORRECTION — the declaration intake is a PREREQUISITE to C1, and the larger half

**What C1 says today.** In the "Status at a glance" table (line 88) and the C1 detail (line 1560),
C1 reads as **"regime branching + investment declaration"** — the two treated as one item, with the
branch as the headline and the declaration folded in as scope (§3, line 2972 / C1-IN, line 2908).
**That framing understates the work and gets the order backwards.** The correction below reclassifies
the declaration intake as a **prerequisite** to C1, and names it as the **bigger of the two pieces**.

**Why it is a prerequisite, not a sub-item.** Every old-regime relief the tax engine can apply is
**hardcoded to zero at both construction sites**, and there is **no table anywhere that an employee's
declared investments could be read from**:

- `apps/api/src/services/payroll-run-aggregates.ts:104` — the batch (payroll-run) path. `section80C`,
  `section80D`, `section80CCD1B`, `section80TTA`, `section24b`, `otherExemptions` are all set to `0`.
  (HRA is now computed — the 0068 fix — but every other Chapter VI-A relief is still a literal `0`.)
- `apps/api/src/routers/payroll.ts` `buildTaxProfileFromEmployee` — the single-employee (screen) path.
  Same six reliefs, same literal `0`.
- **There is no employee tax-declaration intake table.** The `employees` table carries no 80C/80D/
  80CCD1B/80TTA/24b columns; the create/update mutation has no field for them; the HR form has no
  input. `rentPaidAnnual` (added at 0068) is the **only** declaration input that exists. So even if a
  column existed, nothing populates it, and nothing reads it into `computeTax`.

**The consequence, in plain English.** Under the old regime an employee's taxable income today is
reduced by **only three things**: the **standard deduction**, **professional tax**, and (since 0068)
the **HRA exemption**. It gets **none** of 80C (up to ₹1.5 L), 80D (medical insurance), 80CCD(1B)
(₹50 k NPS), 80TTA (savings interest), or 24(b) (up to ₹2 L home-loan interest). The whole reason a
person chooses the old regime is to claim those reliefs. With them all forced to zero, **an employee
who elects OLD is taxed *worse* than if they had stayed on NEW — in every case** (NEW gives the larger
₹75 k standard deduction and the ₹60 k/₹12 L rebate; OLD gives ₹50 k and nothing else). So shipping the
**regime election on its own — the branch working, the employee able to pick OLD — is not neutral, it
is actively harmful**: it hands people a switch that can only ever raise their tax, and files that
higher TDS against their PAN. The election is worthless, and worse than worthless, until the intake
that feeds it exists.

**Therefore the corrected ordering is:**

1. **PREREQUISITE (the larger build): investment-declaration intake.** A per-employee, per-financial-
   year declaration **table**; a **UI** to enter it (80C, 80D, 80CCD1B, 80TTA, 24b, and the HRA/rent
   inputs already half-built); and the **read path** that flows those figures into `computeTax` at
   **both** construction sites above (replacing the six literal `0`s). This is the bulk of C1 — a new
   table, a new form, and two wiring points — and it is **more work than the branch itself.**
2. **Then C1 proper: the regime election** — store the per-employee/per-FY election and branch
   `computeTax` on it. Small by comparison, and **only safe to ship once (1) exists.**

**The effective-dating rule the intake must implement (CA ruling, line 3065).** Declarations are
**provisional in April** and become final only when **physical proofs are submitted by January**. If
an employee does **not** submit proofs by the January deadline, the engine must **zero out the declared
values and spread the resulting extra tax over February and March** (the last two payroll months of the
FY). The current build has **no notion of a proof deadline, no provisional-vs-final state, and no
Feb/March catch-up spread** — so the intake table needs a per-declaration **status** (provisional /
proven / lapsed) and an **effective-date/deadline**, not just a bag of numbers. This is a real part of
the prerequisite, not a later refinement: a declaration store that cannot lapse-and-recover the tax is
incomplete.

**Bottom line for the tracker.** C1 is **not** "add a regime toggle." C1 is **"build the declaration
intake (table + UI + effective-dated read path + Feb/March lapse spread), *then* add the election."**
The intake is the prerequisite and the larger half. Until it lands, **the old-regime branch must not be
exposed to users** — an OLD election with zero declarations is a tax increase, not a feature.

### 2. THE SECOND PAYROLL ENGINE — `apps/api/src/lib/india/payroll-engine.ts` is LIVE, reachable, and writes money

**Question asked:** is `apps/api/src/lib/india/payroll-engine.ts` (which has its own
`computeHRAExemption` and `computeTaxOld`) dead code, an earlier version, or still reachable from a
route? If reachable, from where, and does it agree with the live engine on any shared calculation?

**Finding: it is LIVE.** An earlier note called it "dead code (zero production imports)." That was
**wrong** — it was searched for as a *static* import. Every import of it is a **dynamic** `await
import("../lib/india/payroll-engine.js")`, which a static-import grep misses. The real import sites:

- `apps/api/src/routers/hr.ts:1417` — `computeTaxProjection` endpoint (`computeMonthlySalarySlip`, `computeTaxOld`, `computeTaxNew`)
- `apps/api/src/routers/hr.ts:1482` — `computeTax` endpoint (`computeTaxOld`, `computeTaxNew`)
- `apps/api/src/routers/hr.ts:1522` — `computeMonthlySlip` endpoint (`computeMonthlySalarySlip`)
- `apps/api/src/routers/hr.ts:1550` — **`runMonthlyPayroll` mutation** (`computeMonthlySalarySlip`)
- `apps/api/src/routers/hr.ts:1673` — `generateECR` (`formatECRFile`)
- `apps/api/src/routers/india-compliance.ts:691` — `formatECRFile`

These are all under the **`hr.payroll.*` tRPC sub-router** and are **RBAC-registered** and exposed
(`apps/web/src/lib/trpc-procedure-rbac.generated.ts:429-433` lists `hr.payroll.runMonthlyPayroll`,
`computeMonthlySlip`, `computeTax`). So the second engine is reachable over the API by any client with
the `hr:write`/`hr:read` grant — it is not orphaned.

**It is a full second money-WRITE path, not just a read/projection.** `runMonthlyPayroll`
(`hr.ts:1540-1666`) is a complete parallel payroll run: for every active employee it calls
`computeMonthlySalarySlip` (the second engine, `hr.ts:1596`), then **inserts payslip rows**
(`db.insert(payslipsTable)`, `hr.ts:1648`) and **updates the `payroll_runs` totals** (gross,
deductions, net, PF, PT, TDS — `hr.ts:1651-1663`). It writes the same two tables the live path writes,
using a **different, staler engine**, and it hardcodes `ytdGross: 0, ytdTds: 0` (`hr.ts:1608-1609`,
`1641-1642`) so its TDS never sees prior-month YTD.

**The live path** is the fixed one: `packages/payroll-math` via `computeEmployeePayslip`
(`payroll-cycle.ts`), reached from the web payroll page through `payroll.runs.computePayslips`
(`apps/web/src/app/app/payroll/page.tsx`). That is the engine that received PT1/PT2/PT4, C2-FIX,
PT3, PT5, and the 0068 HRA fix.

**Does it agree with the live engine? No — it disagrees on essentially every statutory calc,** and it
reproduces the exact bugs the live engine was fixed for:

| Calculation | Second engine (`india/payroll-engine.ts`) | Live engine (`payroll-math`) — the fixed one |
|---|---|---|
| **Professional tax** | Stale hardcoded `PT_SLABS` (line 19): Maharashtra flat ₹175/₹200, **no Feb ₹300, no ₹2,500 cap**; Gujarat has the wrong ₹80/₹150 bands; TN flat ₹135 | The **C2-FIX** corrected slabs (Karnataka nil-band+Feb, Gujarat nil-to-₹12k/₹200, Maharashtra female set) with the ₹2,500 statutory cap |
| **Tax slabs** | Hardcoded (line 114/121): **FY 2024-25** new-regime slabs (₹3/6/9/12/15 L) — **not effective-dated** from `statutory_ceilings` | Effective-dated from the statutory-ceilings source (the C5 requirement) |
| **New-regime surcharge** | `applySurcharge` (line 141) caps at **37% for both regimes** — the exact **PT3 bug** | New regime capped at **25%** (PT3 fix) |
| **s.87A rebate** | Flat: ₹12,500/₹5 L old (line 195), ₹25,000/₹7 L new (line 226) — **stale FY 2024-25 figures, no marginal relief** | ₹60 k/₹12 L with **marginal relief** (PT5) |
| **HRA exemption** | Computes from `input.rentPaidMonthly ?? 0` (line 336) — but `runMonthlyPayroll` **never passes it**, so it is **always 0**; also reads `rentPaidMonthly`, **not** the new `rentPaidAnnual` column | Computes from the declared `rentPaidAnnual` + `isMetro` inside `computeEmployeePayslip` (0068 fix) |
| **Other reliefs** | Default `deductions` (line 342) hardcodes 80D/24b/80CCD1B to 0; special-allowance formula subtracts employer PF | (Same declaration gap — see record #1 — but a single code path to fix) |
| **YTD / prior-employer** | `ytdGross:0, ytdTds:0` hardcoded; no LOP; no Form 12B prior-employer income | Rolling s.192 YTD; LOP-earned components; PT4 prior-employer wiring |

**Assessment.** This is exactly the failure shape the plan already worries about: **two
implementations of the same statutory logic**, the pattern that produced the `nxk_`/`nxo_` mismatch and
the two disagreeing gross computations. Whichever endpoint a client happens to call decides whether an
employee gets the fixed math or the stale, wrong math — and `runMonthlyPayroll` will **file** the stale
result. It is the last place a known-class defect can sit unexamined.

**Recommendation (to record — no code change made here):** **remove the duplication.** Either delete
`apps/api/src/lib/india/payroll-engine.ts` and re-point its six call sites at the live
`payroll-math` engine (`computeEmployeePayslip` for the slip/run paths; the shared tax/HRA functions
for the projection/`computeTax` paths; keep only `formatECRFile` if the ECR formatter has no equivalent
yet), **or**, if any `hr.payroll.*` endpoint must stay, make it a thin adapter over `payroll-math` so
there is **one** source of statutory truth. **`runMonthlyPayroll` is the priority** — it is a live
write path that files stale PT, stale slabs, a 37% new-regime surcharge, a stale rebate, and zero HRA.
Until reconciled, it should be treated as **payroll-blocking** alongside C1/C2, because it can commit a
wrong, filed payroll run without touching any of the engine that was fixed.

---

## Roadmap + correction records (2026-08-05)

Three phantom-field items (P-13/P-14/P-15) reached the top of the queue after the
sweep. On investigation, **two of the three task premises were stale against the
shipped code** — recorded here so the corrections do not get re-litigated. Then three
finance-capability audits (bank reconciliation, credit-card import, Account Aggregator)
are recorded as roadmap entries with no code change.

### P-15 — screen tax-preview ignored a mid-year joiner's prior-employer income — **FIXED**

**The defect (live money, on a shipped feature).** The on-screen regime-comparison
projection (`taxPreview` → `buildTaxProfileFromEmployee`, `apps/api/src/routers/payroll.ts`)
hardcoded three fields: `previousEmployerIncome: 0`, `previousEmployerTDS: 0`, and
`joiningMonth: 1`. So for a mid-year joiner who had declared Form 12B prior-employer
figures on their record, the screen projected them as a **full-year** employee and
**silently dropped the prior salary** from the annual base — while the **run path**
(`buildEmployeePayrollInput`, `payroll-run-aggregates.ts:118-119`) already threaded both
`previousEmployerIncome` and `previousEmployerTds` and derived a real joining month. The
screen and the run therefore disagreed for exactly the population where it matters most:
a joiner whose true s.192(2) liability spans two employers.

**Root cause of why threading alone was inert.** The tax engine
(`packages/payroll-math/src/tax-engine.ts:275-285`) folds `previousEmployerIncome` into
the annual gross **only on the mid-year branch** (`joiningMonth !== 1`). With
`joiningMonth` pinned to 1 on the screen, the field was read but never added. The fix had
to do **both**: thread the two 12B fields **and** derive a real FY `joiningMonth` from the
employee's `startDate` so the mid-year branch fires.

**The fix.** `buildTaxProfileFromEmployee` now takes a `fyStart` arg (the calendar year the
FY starts, e.g. 2026 for FY 2026-2027). It computes `joiningMonth` via
`calendarToFyMonth(start.getMonth()+1)` when the start date is after 1 April of the FY
(else 1, byte-identical to today for existing full-year employees), sets
`monthsInFY = monthsWithData > 0 ? min(12, monthsWithData) : (12 − joiningMonth + 1)`, and
reads `previousEmployerIncome`/`previousEmployerTDS` from the same employee row the run
path reads. Both `taxPreview` call sites (old + new profile) pass `fyStart`.

**Fairness test (red-before / green-after) —**
`apps/api/src/__tests__/payroll-actual-components-and-prior-employer.test.ts`, new
`PT4-SCREEN` describe block: two mid-year-joiner employees (start 2026-06-01, old regime,
Maharashtra), one WITH `previousEmployerIncome: 800000 / previousEmployerTds: 40000` and
one WITHOUT; asserts `withPreview.oldRegime.taxableIncome > withoutPreview…` by a delta
> ₹500,000, and that a no-12B employee projects `taxableIncome >= 0`. **Red-before proven**
by reverting the `joiningMonth`/`monthsInFY` derivation (both projections collapsed to an
identical 1147600 → assertion failed); restored → green. Full file **10/10 green**. No
regression across the payroll/tax suites; `pnpm lint` green across all 9 workspaces.

### P-14 — screen HRA relief vs payslip — **CLOSED, premise stale (no code change)**

The task premise was that `buildTaxProfileFromEmployee` hardcodes `rentPaid` to 0. It does
**not** — the builder already computes the s.10(13A) HRA exemption from `rentPaidAnnual`
(the metro-aware `computeHRAExemption`, `payroll.ts:185-193`). The on-screen projection and
the payslip therefore already agree on HRA. This was fixed by the earlier **HRA (d7dff03)**
increment; the phantom-fields note that fed P-14 predates it. **No change made.**

### P-13 — declared 80C never reduces tax — **RE-SCOPED → roadmap (not a one-line thread)**

The task premise was that `section80C` is "form-captured and stored" and merely hardcoded
to 0 at the construction sites. That premise is **false end-to-end**: there is **no**
`section80C` (or `80D`/`80CCD(1B)`/`80TTA`/`24(b)`) column on the employee schema, **no**
form input on the HR page, and **no** declarations table anywhere. The scoping gate the
owner asked for — "is 80C the only Chapter VI-A field with a form input, or do the others
have one too?" — resolves to: **none of them do.** The only Chapter VI-A intake that exists
is `previousEmployerIncome` and `rentPaidAnnual`. So P-13 is **not** a thread; it is the
same build as **C1's investment-declaration intake** (a declarations surface + columns +
form + wiring into both tax profiles). **Folded into C1**; removed from the phantom-fields
queue as a standalone item.

### Finance-capability audit records (no code change)

**BANK RECONCILIATION — complete and working.** The Bank Reconciliation screen supports
**CSV statement upload with column mapping** (parsed client-side, `reconciliation/page.tsx`),
a 5,000-row cap, and **scored auto-matching** of statement lines against ledger entries on
amount / date / description, with manual override for the residue. It is E2E-tested. The
limitations are **deliberate for the pilot**: CSV only (no OFX / MT940 / CAMT.053 / Excel),
and no live bank connection. Acceptable because every Indian bank exports CSV. **No action.**

**CREDIT-CARD / CORPORATE-CARD IMPORT — does not exist.** There is no card table, schema,
statement import, or feed. Expenses are entered **one at a time** with optional single-receipt
OCR. The only "credit card" reference in the system is a chart-of-accounts **account type**,
not a transaction source. Record as a **post-pilot build item** — it is a standard SMB sales
expectation and will be asked for. **No action now.**

**ACCOUNT AGGREGATOR (RBI framework) — roadmap.** Integrating the RBI Account Aggregator
framework would replace CSV upload with an **automatic, consent-based, read-only** transaction
feed. It requires a **regulated AA intermediary**, carries **DPDP implications** (consent
artefacts, purpose limitation, retention), and is a **post-pilot** effort. This is a
**lawyer + CA question** before any build. Record as roadmap; **no action now.**

---

## Employee-form testing findings (2026-08-05) — unreachable Save + silent-nil PT

Two findings from testing the new employee form (the C2-STRUCT ingestion pass forms).
Both are recorded here so neither regresses.

### F-DLG — Add/Edit employee dialog Save unreachable (viewport overflow) — **FIXED**

**The defect (a form that cannot be submitted).** The statutory ingestion pass
(`0000897`) grew the Add and Edit employee dialogs on `apps/web/src/app/app/hr/page.tsx`
with new grouped sections — location/PT, tax election, identity, bank, prior-employer,
and the three PT Tier-1 **exemption** checkboxes. The cards did not handle the extra
height: the **Add** card scrolled the *whole* card (`max-h-[90vh] overflow-y-auto` on the
outer div, so header/body/footer scrolled together) and the **Edit** card had **no**
height constraint at all (`w-full max-w-md p-5`, nothing else). On a standard ~800px
laptop viewport the exemptions section was cut off mid-list and the Save control
("Create record" / "Save") rendered below the fold — **the form literally could not be
submitted**.

**The fix (fixed header/footer, scrolling body).** Both cards are now a three-part
flex column: `max-h-[90vh] flex flex-col` on the card, a `shrink-0` header
(`p-5 pb-3 border-b`), a `flex-1 overflow-y-auto p-5` body wrapping every field
(including the exemptions), and a `shrink-0` footer (`p-5 pt-3 border-t`) holding
Save/Cancel. Only the body scrolls; Save is always on screen regardless of viewport
height. This is the same pattern the taller HR dialogs (New Onboarding, Start
Lifecycle) already use.

**Scope.** Only the Add and Edit employee dialogs were changed — those are the only two
dialogs the ingestion pass grew (verified: `git show 0000897` touches "the add + edit
employee forms" and nothing else on the web side). The other HR dialogs
(Onboarding, Leave, HR Case, Offboarding, Lifecycle) were not touched by the ingestion
pass and were left as-is (no unrequested refactor).

**Fairness test (green-after).** `e2e/employee-dialog-scroll.spec.ts` — at a 1280×**800**
viewport, opens the Add employee dialog and asserts the Save control's bottom edge is
`<= 800` (inside the viewport) **and** `toBeInViewport()`. Before the fix the Edit card
had no `max-h` so a tall body pushed Save below y=800; after, the footer is pinned.

### F-PT-NIL — unknown/misspelled PT state resolves to a silent ₹0 — **FIXED**

**The defect (a plausible-wrong outcome nobody sees — same shape as the removed
Maharashtra fallback).** Professional-tax state is deliberately **free text** (the state
master stays in C2-STRUCT, not duplicated in the app). But a state typed as **"Karnatak"**
(not "Karnataka") normalises to `KARNATAK`, matches no slab config in `PT_SLABS`, and
`computePT` (`packages/payroll-math/src/statutory-deductions.ts`) returned `ptAmount: 0`
— **the exact same number a genuinely non-levying state (Delhi) returns**. The old
no-config branch (`if (!config || config.slabs.length === 0) return … 0`) collapsed two
distinct cases into one silent nil: an *unresolved* ₹0 (misspelling — WRONG) and a
*levied* ₹0 (Delhi has a config with empty slabs — CORRECT). ~Half of India levies no
PT, so a blanket "throw on ₹0" is wrong; the two cases had to be **distinguished**.

**Decision — flag in the payroll run, not reject at the form (owner-approved).**
Reject-at-form was rejected because the form has no authoritative state list to validate
or suggest against (the master is in C2-STRUCT; `payroll-math` is the single source of
truth), and a misspelling should not block *creating* an employee — it should block a
silent *wrong filing*. Flagging in the run is the **same channel a missing state already
uses** (`workflowMetadata.errors[]`), so a payroll admin sees every state problem in one
place before locking.

**The fix (two parts).**
1. `computePT` now splits the branch: `if (!config)` returns
   `{ …, ptAmount: 0, unknownState: true }` (unresolved — flagged), while
   `if (config.slabs.length === 0)` returns `{ …, ptAmount: 0 }` (Delhi — correct,
   deliberately **not** flagged). A new optional `unknownState?: boolean` on
   `PTComputation` carries the signal; it rides through `computeMonthlyStatutory` →
   `EmployeePayslip.statutoryDeductions.pt`, so **no new payslip field and no schema
   change** were needed.
2. `computePayrollRunTotals` (`apps/api/src/services/payroll-run-aggregates.ts`) pushes a
   per-employee **warning** into the existing `errors[]` when
   `slip.statutoryDeductions.pt.unknownState` is set — *not* a throw: the row still
   computes and is counted; the admin is told the state string matched no PT jurisdiction
   and to verify the spelling before locking.

**Fairness test (red-before / green-after).**
`apps/api/src/__tests__/employee-statutory-ingestion.test.ts`, new
`"unknown PT state is flagged, not silently nil"` block: `computePT(…, "Karnatak")` →
`ptAmount 0` **and** `unknownState true`; `"Karnataka"` → PT levied, no flag; `"Delhi"` →
`0` but **no** flag (known non-levying stays silent); and the flag rides through to
`slip.statutoryDeductions.pt.unknownState`. Red-before: without the `!config` split,
Karnatak returned a bare `0` with `unknownState` undefined → the assertion failed.

---

## Testing findings (2026-08-06) — UI authorization gap + self-service is read-only

Two findings from testing the platform as a low-privilege user. The first is a
**defect** (fixed in this pass); the second is a **build item** (recorded, not built).

### RBAC-UI — no consistent page-level permission gate; the whole app renders for any authenticated user — **FIXED (read exposure)**

**Severity framing (this is the important distinction).** This is a **read
exposure, not a write vulnerability.** The API is correctly locked down: employee
mutations run through `permissionProcedure("hr","assign")`
(`apps/api/src/routers/hr.ts:254,401`), so a `requester` clicking Edit → Save gets a
403 and **nothing is written**. Server-side authorization is enforced almost
everywhere (`permissionProcedure` is used ~740× across the routers). What leaks is
**what a low-privilege user can SEE**: logged in as a `requester`, the full Employee
Directory renders — every employee, department, manager, joining date, and (via the
row Edit dialog) salary structure, PAN and bank details — and the Finance,
Procurement and Admin module pages render too, because nothing gates the *page* on
the client.

**Root cause (accurate, corrected against the code).** It is **not** literally true
that "no page checks permission" — **69 of 118 page files reference `AccessDenied`**.
The real problems are two: (1) coverage is **partial and per-page** (≈49 pages have no
gate at all), and (2) where a gate exists it is almost always gated on **`read`**, and
the mandatory base role `requester` **holds `read` on the exposed modules** — the HR
page's own gate is `!can("hr","read") && !can("onboarding","read")`
(`apps/web/src/app/app/hr/page.tsx`), which a requester passes. So the pattern is
"each page decides for itself, usually permissively," which is exactly how the gap
spread. `hasPermission` exists and is unit-tested; the UI just doesn't gate on it
consistently. (Note the additional mismatch: the directory's Add/Edit/Policy controls
were gated on `can("hr","write")` — which `requester` **has** — while the API enforces
`"assign"` — which it does **not**. Buttons said yes, the save said no.)

**The fix — a single layout-level route guard (fix the pattern, not the page).**
Chosen over the two alternatives:
- *Per-page guard component* — rejected: reintroduces the failure mode (works only if
  every one of 118 pages remembers to add it; the next new page ships ungated).
- *Route-level Next middleware* — rejected: permissions here resolve **client-side**
  from `auth.me` in `RBACProvider`; middleware would have to re-derive identity/roles
  at the edge, a duplicate auth path, for a UI gate whose authoritative enforcement is
  already the API.
- *Layout guard* — chosen: `apps/web/src/app/app/layout.tsx` is the single choke point
  every `/app/*` page already flows through (inside `RBACProvider`/`AuthGuard`). One
  component there covers every current and future page and reuses the **same route→module
  map the sidebar already uses**, so a page is reachable by URL exactly when its nav
  entry is visible.

Implemented as:
- `apps/web/src/lib/route-permissions.ts` — pure `resolveRouteModule(pathname)` + a
  `PUBLIC_APP_ROUTES` allowlist (command/profile/self-service surfaces). Mirrors
  `sidebar-config.ts` module assignments; unmapped routes fall through to allow
  (defense-in-depth; the API is authoritative), with a comment that new modules must be
  registered here.
- `apps/web/src/components/layout/route-guard.tsx` — client guard; `usePathname()` +
  `canAccess(module)`; renders `<AccessDenied>` when the module read is absent. Wired
  into the layout inside `AuthGuard`.
- Employee directory (`hr/page.tsx`): Add/Edit/Policy + the Actions column now gate on
  `can("hr","assign")` (parity with the API), and the visible employee list is filtered
  to the caller's **own** record when they lack `assign` — via the pure
  `filterEmployeeDirectory()` helper (`apps/web/src/lib/employee-directory-access.ts`).

**Residual (honest scope).** The client filter scopes what the directory *displays*;
`hr.employees.list` (`hr.ts:179`, `permissionProcedure("hr","read")`) still *returns*
the org roster to any `hr:read` holder, so the rows remain on the wire. Server-side
scoping of that list (self-only unless `hr:assign`) is the complete read-exposure fix
but touches other consumers (`hr/expenses`, `payroll`) and is left as a follow-up;
the layout guard + display filter close the *visible* exposure and the fairness check.

**Fairness test (red before / green after).** Pure unit tests
(`route-permissions.test.ts`, `employee-directory-access.test.ts`) plus E2E in
`e2e/rbac.spec.ts`: a `requester` on `/app/hr` sees only their own record and no
Edit/Policy controls and is blocked from `/app/financial` with "Access Restricted";
an admin sees the full directory with controls. The pre-existing E2E that **blessed
the bug** ("employee: /app/admin shell loads without fatal error") is corrected to
assert the shell is now access-restricted.

### SELF-SERVICE — employees cannot enter their own statutory data; everything is HR-keyed — **BUILD ITEM (not a defect)**

Recorded as a build item, per the read of the code — nothing here is broken, the
capability simply does not exist yet.

**What exists today (both portals are read-only).** The **Employee Portal**
(`/app/employee-portal`) is a read-only payslip/Form-16/tax viewer
(`payroll.payslips.myPayslips`, `payroll.taxPreview` — both queries). The **Employee
Center** (`/app/employee-center`) is a read-only IT service desk (catalog/tickets/KB
queries). The only self-service *write* is `auth.updateProfile`
(`apps/api/src/routers/auth.ts:610-619`), which accepts **only** name/phone/location/
department/jobTitle/bio.

**The gap.** No employee can self-enter any ingestion-pass statutory field — PAN, UAN,
bank account/IFSC/name, ESI IP number, rent-paid (rent declaration), previous-employer
income/TDS, the PT-exemption flags, or gender/DOB. Those fields live in exactly one
screen — the HR-admin Add/Edit dialog (`hr/page.tsx` → `hr.employees.create/update`,
both `permissionProcedure("hr","assign")`). There is **no joiner self-service intake at
all**: the only "onboarding" flow is the org-setup wizard (company GSTIN/PAN/TAN, not
the employee's). Also flagged: the payslip page shows a "Submit your TDS declaration…"
label with no form behind it (`employee-portal/page.tsx:457`) — aspirational, remove or
build.

**Onboarding consequence (why this outranks the employee importer).** Seven pilot
customers at 30–80 employees each means HR hand-keying every bank account and PAN, and
chasing rent and 80C declarations by email, one employee at a time. In practice this is
a **larger obstacle to onboarding than the bulk employee importer** — the importer moves
the identity columns, but the statutory/bank/declaration data still has no capture path
except HR typing it. A joiner self-service intake (employee enters their own PAN/UAN/
bank/ESI + uploads rent/80C proofs, HR reviews/approves) is the missing build.

---

## RBAC-UI follow-ups (2026-08-06) — recorded, not built

Two follow-ups from the RBAC-UI fix (`508b8ff`). Neither is built; both are here so
the record is accurate.

### RBAC-UI-SRV — the directory read exposure is reduced, not closed

**State it plainly: RBAC-UI did NOT close the read exposure.** The layout guard stops a
`requester` reaching modules they cannot read, and the employee-directory display is
scoped to the caller's own record for non-managers — but the scoping is **client-side
only**. `hr.employees.list` (`apps/api/src/routers/hr.ts:179`,
`permissionProcedure("hr","read")`) still returns the **entire org roster** to any
`hr:read` holder — which the mandatory base `requester` role is. `filterEmployeeDirectory`
(`apps/web/src/lib/employee-directory-access.ts`) only decides what the page *renders*;
the full list — names, departments, managers, and every employee's statutory columns on
the row objects (PAN, bank, salary structure id, etc.) — **crosses the wire and is
visible in the raw network response**. A user who opens DevTools, or replays the tRPC
call, sees everyone. So the fix **reduced** the exposure (nothing sensitive is shown in
the UI to a non-manager) but did **not** close it (the data still leaves the server).

**The real fix (when built).** Scope the list **server-side**: if the caller lacks
`hr:assign`, return only their own employee row (or a minimal directory projection),
never the full roster with statutory columns. That is the authoritative boundary; the
client filter then becomes belt-and-suspenders.

**Consumers to check before changing the contract** — both read the same procedure and
must not silently lose the full list they legitimately need:
- `apps/web/src/app/app/hr/expenses/page.tsx:68` — "My Expense Claims" employee picker.
- `apps/web/src/app/app/payroll/page.tsx:167` — Form 16 tab (needs the full roster; but
  the payroll page is `payroll`-gated, which a requester lacks, so a manager-only path is
  fine there).
A `scope`-aware handler (auto-scope by the caller's `hr:assign`, or an explicit param)
is likely cleaner than a blanket change, precisely because of these two callers.

### MOBILE-LINT — establish active vs abandoned; the exclusion is a band-aid

**Correction to the premise first (report faithfully).** The concern was that the
CLAUDE.md pre-merge gate — `pnpm lint` from the root — "cannot pass" because
`apps/mobile` fails with `eslint: command not found`. In fact the root gate **already
excludes mobile**: `package.json` → `"lint": "turbo run lint --filter=!@coheronconnect/mobile"`,
and it runs **green (9/9 tasks)**. CI's "Lint & Type Check" job doesn't run mobile either
— it does only `pnpm --filter @coheronconnect/api lint` (api tsc) + `cd apps/web && npx
tsc --noEmit`. The red only appears when someone runs **raw** `turbo run lint` (no
filter) — which is how it surfaced during the RBAC-UI pass. So the gate is **not**
always-red; the "always-red teaches everyone to ignore it" risk is real but currently
mitigated by the filter — which is itself the smell worth fixing.

**Active vs abandoned — the evidence says dormant / near-abandoned:**
- **3 of 221 commits** ever touch `apps/mobile`; last change **2026-07-28** (`1ae28af`,
  a broad multi-area commit that touched it only incidentally). No standalone mobile
  feature work in the recent history.
- Not built, tested, or linted in CI (`.github/workflows/ci.yml` never references it).
- Excluded from the root lint gate on purpose (`--filter=!@coheronconnect/mobile`).
- It is the **only** workspace whose `lint` is `eslint src --ext .ts,.tsx`; every other
  workspace lints with `tsc --noEmit`. It declares `eslint: 8.57.0` but **has no eslint
  config file** and the binary isn't installed — so the script is broken two ways, and
  would fail (differently) even with eslint present.

Not conclusively dead (it still has a real Expo/React-Native app, tRPC client, and an
approvals modal), but there is **no active development**. It reads as **parked**.

**Recommendation (decision needed, not built):**
- **If parked/abandoned** (most likely): drop it from the workspace's active surface —
  at minimum delete its broken `lint` script (so raw `turbo run lint` is green and the
  `--filter=!mobile` band-aid can be removed), or move the whole app out of the pnpm
  workspaces until it's revived. Prefer removing the band-aid over keeping a hidden
  red target.
- **If active**: align it with the repo convention — change its `lint` to `tsc --noEmit`
  (consistent, needs no eslint dep or config), **or** add an eslint config and ensure
  `eslint` installs — then **remove the `--filter=!mobile` exclusion** so it is actually
  gated. A workspace that ships should be in the gate; one that doesn't shouldn't be in
  the tree pretending to be.

Either way the end state is the same principle: **no workspace should be permanently
excluded from the gate to hide that its lint is broken.**

---

## Mobile parked (2026-08-06) — decision + change record

Acting on the MOBILE-LINT follow-up: **`apps/mobile` is parked.**

**Why (the evidence, restated as the decision basis):**
- **Dormant** — 3 of 221 commits ever touch it; last change 2026-07-28 (`1ae28af`), and
  only incidentally as part of a broad multi-area commit. No standalone mobile work.
- **Not in CI** — `.github/workflows/ci.yml` never builds, tests, or lints it.
- **No mobile work planned before the pilot** — the pilot surface is web + API; mobile is
  not on the path to go-live.

Because it is parked, its lint was **broken with no owner and no plan to fix** (the only
workspace using `eslint`, with no eslint config and eslint not installed). Keeping it in
the gate meant carrying a permanent `--filter=!@coheronconnect/mobile` exclusion — a
band-aid that makes the gate read "everything **minus one**," which is exactly the shape
that teaches people to stop trusting a green gate.

**Change made (no app code touched — tooling only):**
- Removed the broken `"lint": "eslint src --ext .ts,.tsx"` script from
  `apps/mobile/package.json`. With no `lint` script, Turborepo simply skips the workspace
  for the `lint` task (it does not fail).
- Dropped the exclusion from the root `package.json`:
  `"lint": "turbo run lint --filter=!@coheronconnect/mobile"` → `"lint": "turbo run lint"`.
  The gate now covers **every** workspace that participates in linting, minus none.

**Verified:** both `pnpm lint` (the documented gate) and raw `turbo run lint` are green —
**9/9 tasks** (api, db, mac, metrics, payroll-math, types, ui, web, worker). `apps/mobile`
is skipped, not excluded and not failing.

**Reviving it later:** if mobile becomes active, it gets a `lint` script matching the repo
convention — **`tsc --noEmit`** — at that point (consistent with every other workspace; no
eslint dependency or config required). It then rejoins the gate automatically, with no
exclusion to remove.

---

## C7 build log (2026-08-06) — GSTR-1 structural work, one item at a time

### C7-1 — AATO + HSN summary (Table 12) — **DONE**

Table 12 is mandatory on every GSTR-1; the builder previously emitted no `hsn`
section at all, so the return would be rejected regardless of anything else. Built:

- **AATO field + ingestion.** `organizations.annualAggregateTurnover`
  (`decimal(18,2)`, nullable) — migration `0069_melted_the_fury`. Ingested at the
  org level through the **India setup wizard** (added to `indiaSchema`,
  `orgWizardWrite`, `getWizardData`, and a numeric field on the wizard's India step).
- **HSN summary + digit rule** (pure, in `packages/payroll-math/src/gst-engine.ts`):
  `hsnMinDigits(aato)` (4 up to ₹5cr, 6 above — `HSN_SIX_DIGIT_TURNOVER_THRESHOLD`),
  `buildHsnSummary()` (aggregates turnover + tax by HSN × rate → GSTN `hsn.data[]`),
  and `findHsnDigitViolations()`. Wired into `accounting.gstr.generateGSTR1`: the
  return now carries `payload.hsn.data`, reads the org's AATO to set the digit
  minimum, and surfaces `warnings[]` for short/missing HSN codes, an unset AATO
  (defaults to 4), and invoices with no line items (absent from Table 12).
- **Fairness (red before / green after):** `gst-hsn-summary.test.ts` (6, pure) +
  `gstr1-hsn-summary.test.ts` (5, integration). Full API suite **1425 green**,
  payroll-math 59, `pnpm lint` 9/9.
- **Deferred (C7a):** the standalone AATO edit outside the wizard and the **1-April
  annual-refresh job** remain follow-ups; existing already-onboarded orgs with a null
  AATO get the 4-digit default plus a warning until set.

### C7 place of supply — **no structural work; ONE validation caveat (recorded, not "never revisit")**

Directive was to record POS as "already a two-digit code throughout." Verified, and
that is **mostly** true but not unconditional, so recording it accurately:

- **No Table-5/structural POS work is needed.** The state model *is* 2-digit codes
  (`GSTIN_STATE_CODES`/`normaliseStateToCode`), the org/primary side is enforced as a
  code (`gstinRegistry.stateCode` NOT NULL, `length(2)`), and `generateGSTR1` emits
  `inv.placeOfSupply ?? gstin.stateCode` — a code on the org fallback.
- **Caveat (a real but minor gap):** the *buyer* side is not enforced to a 2-digit
  code. `crmAccounts.stateCode` is `z.string().optional()` (unvalidated), the
  `createIndiaInvoice` `placeOfSupply` input is an unconstrained `z.string()`, and the
  api gst-engine comment itself notes "vendors/customers store a NAME (Maharashtra)".
  So a name *could* be stored and would then be emitted verbatim in `pos`. This is a
  **validation-tightening** item (constrain those inputs / normalise on write), **not**
  a structural return build. Left as optional hardening; flagged to the owner rather
  than recorded as settled.

### C7 advances / Table 11 — **OUT OF SCOPE for the pilot (recorded)**

No advance-receipt capability exists anywhere (no schema, no `at`/`txpd` builder — grep
clean). None of the pilot customers has raised advance receipts. Table 11 stays out of
scope for the pilot; **revisit before general availability**. If a pilot begins taking
customer advances before a filing period, it re-enters scope.

### C7-2 threshold finding (pre-build report for the next item)

The B2CL question asked what threshold the code holds. Answer: **none.** There is no
B2CL threshold anywhere — `generateGSTR1` stamps every non-GSTIN invoice `ty:"B2CS"`
unconditionally (no invoice-value test, no inter-state test on the B2C branch). So it's
not "holds ₹2.5 lakh vs ₹1 lakh" — the entire large-vs-small split is absent, and large
inter-state B2C is currently mis-filed into B2CS. When built, the threshold should be a
**configurable, effective-dated** value (it changed ₹2.5L→₹1L); the exact current figure
is to be confirmed with the CA, not guessed.

### C7-3 estimate (credit/debit notes, largest item)

Scoped as a feature build in four parts: (1) **schema completion** — a create path for
`invoiceType` credit_note/debit_note with the `originalInvoiceNumber` back-reference
(the enum + column exist; downstream IRN/ClearTax already have CRN/DBN branches waiting);
(2) **API create mutation** — with the negative-line rounding caution already recorded
(credit notes must not reuse the per-line rounder as-is); (3) **a screen** to raise a
credit/debit note against an invoice; (4) **Table 9 (CDNR/CDNUR)** in `generateGSTR1`,
routing by `invoiceType`. Rough size: ~2–3× either of the first two items, because it
spans schema + API + UI + return, versus item 1's engine-plus-ingestion shape.

### C7-2 — B2CL segregation (Table 5) — **DONE**

Built the Table 5 (B2C-Large) bucket the return never had. Rule: an **inter-state**
supply to an **unregistered** person (no buyer GSTIN) whose invoice value **exceeds**
the threshold is reported **invoice-wise in Table 5**, grouped by place of supply; at or
below the threshold, or any intra-state B2C, stays in the **Table 7 (B2CS)** consolidated
summary.

- **Threshold field** — `organizations.b2clThreshold` (`decimal(14,2)`, NOT NULL,
  **default ₹1,00,000**), migration `0070_slim_rage` (the `DEFAULT '100000'` also seeds
  existing rows). **Per-tenant configurable.**
- **Builder** — `generateGSTR1` now emits `payload.b2cl` (grouped by normalised 2-digit
  place-of-supply code); inter-state is decided by comparing the normalised POS code to
  the supplier's GSTIN state code.
- **Fairness (red/green)** — `gstr1-b2cl-segregation.test.ts` (7): ₹1,50,000 inter-state
  → B2CL (the case that previously fell to B2CS); ₹80,000 and exactly ₹1,00,000 → B2CS;
  intra-state ₹2,00,000 → B2CS; default ₹1L applies unset; a raised ₹2.5L override sends
  ₹1.5L back to B2CS; multi-invoice grouping by POS.

**Correction recorded (the regulatory + code-state truth).** The GST Council reduced the
B2CL invoice-wise reporting threshold from **₹2,50,000 to ₹1,00,000**, formalised by
**Notification No. 12/2024 – Central Tax** amending **Rule 59(4)** of the CGST Rules 2017,
**effective 1 August 2024** (recommended at the 53rd GST Council meeting). So **₹2.5 lakh
has been the wrong figure since 1 Aug 2024.**

Two things to be precise about, so the record is accurate:
1. **This codebase never held a ₹2.5 lakh default** — my C7-2 scoping found **no B2CL
   threshold at all**; every unregistered-buyer invoice was stamped B2CS unconditionally.
   So there was no ₹2.5 lakh constant to "change" — the field is **introduced** at the
   correct ₹1 lakh. The practical exposure was therefore **broader** than the ₹1L–₹2.5L
   band: **all** inter-state B2C, at any value, was consolidated into B2CS rather than
   reported invoice-wise.
2. **Why it matters:** the GST portal validates the B2CL/B2CS split (Rule 59(4)), so an
   inter-state B2C invoice above ₹1,00,000 sitting in B2CS rather than Table 5 is exactly
   the kind of mis-classification the portal flags — a rejected or corrected filing. Fixed
   as of the first live filing.

### C7-3 — Credit / debit notes (Table 9) — **DONE (parts 1–4); part 5 held**

Built as a feature in the four scoped parts. The ledger posting (part 5) is
deliberately **held** pending the CA's ruling on the reversal treatment — a wrong
revenue/output-tax reversal that looks authoritative is worse than none.

- **Part 1 — schema completion** (migration `0071_lucky_speedball`). Added to
  `invoices`: `originalInvoiceId` (self-FK, SET NULL), `originalInvoiceDate`
  (CDNR needs the original's date), `noteReason`. Fairness:
  `credit-note-schema.test.ts` (2) — persistence + SET-NULL behaviour.
- **Part 2 — API create path, NO journal.** `financial.createCreditDebitNote`:
  loads the original tax invoice, inherits its parties + CGST/SGST-vs-IGST split,
  reuses `computeInvoiceFromLines` (positive lines → the ₹0.01 hard error and
  derived header are identical to invoices), writes the note + its lines, and
  **posts no GL journal entry**. Refuses a note-on-a-note and an unknown original.
  Fairness: `credit-note-create.test.ts` (6) — incl. the **no-journal** guard and
  the **₹0.01** mismatch.
- **Part 3 — screen.** A "Credit / Debit Note" action on the receivable-invoice
  detail page opens a dialog that **reuses `InvoiceLineItemsEditor`** (not a new
  editor — one editor, no drift, per the two-payroll-engines lesson). Verified by
  web typecheck; the reuse is structural (imports the same component + `toLinePayload`).
- **Part 4 — Table 9 in the return.** `generateGSTR1` now routes notes by
  `invoiceType` into `cdnr` (registered, grouped by buyer GSTIN) / `cdnur`
  (unregistered), with note type (C/D) + original number/date, **out of** the
  supply tables, and **excludes note lines from the Table 12 HSN summary** (no
  overstated turnover). Fairness: `gstr1-cdnr-table9.test.ts` (4).

**Design note (why parts 2 & 4 needed no negative-rounding).** A note stores
POSITIVE line values (the amount credited/debited); GSTR-1 CDNR reports positive
values with a C/D flag and the portal nets them. So the recorded negative-line
rounding caution (`invoice-lines.ts`) bites only in the deferred **part 5 ledger
reversal**, not in note creation or the return.

**Held / follow-ups:**
- **Part 5 — GL journal entry (ledger reversal).** Held for the CA ruling on
  reversal treatment; lands as a separate part once confirmed. Until then a note
  is filed on GSTR-1 but does not move the general ledger.
- **Net-of-notes Table 12.** The HSN summary currently *excludes* note lines
  (rather than subtracting them) — a fully net HSN is tied to the same
  negative-line treatment as part 5.
- **IRN debit-note mapping.** `irnGenerationWorkflow` maps only
  `credit_note → CRN` (else `INV`); a `debit_note → DBN` mapping should ride with
  part 5 (ClearTax already types `DBN`).

Full API suite green after each part; `pnpm lint` 9/9; web tsc clean.

### C7-3 Part 5 — credit-note ledger posting + s.34 validations — **DONE (CA-ruled 2026-08-06)**

The held ledger reversal, now built to the CA's ruling, plus the three validations
that did not exist.

**Ledger (CA accounts/direction).** New `postCreditNoteJournalEntry` posts, dated to
the note's OWN issuance period (never the original's — closed periods don't reopen):
- **Dr Sales Returns & Allowances (4130)** = taxable — a **contra-revenue** account,
  NOT a debit to gross sales (4110/4120), so gross-to-net stays auditable. Added
  `4130` to both COA seeds (`INDIA_COA_SEED` + `packages/db/src/seed.ts`).
- **Dr Output CGST/SGST/IGST Payable** = tax.
- **Cr Accounts Receivable (1130)** = gross.
Balanced double-entry; no-ops (returns null) if the COA isn't seeded, so note
creation never fails on a missing ledger.

**Three validations (in `createCreditDebitNote`):**
1. **Time limit (s.34).** A credit note dated after **30 Nov following the original
   invoice's FY** auto-switches to a **financial credit note**: output tax NOT
   reversed (journal posts contra-revenue + AR only), `isFinancialNote=true`
   (new column, mig `0072_clever_blue_shield`), excluded from Table 9, and a clear
   **notice** is returned to the UI (a toast, not a silent refusal).
2. **Value cap.** Cumulative credit notes against one invoice may not exceed its
   taxable or tax value — the excess is **rejected**, never clamped.
3. **Rate in force.** A note line's GST rate must be one the original invoice used
   (its line rates, or header-derived); a later rate change cannot alter the reversal.

**Fairness (red/green):** `credit-note-ledger.test.ts` (6) — CA reversal (inter +
intra), note-period dating, time-limit→financial (no tax legs + notice + out of
Table 9), value-cap breach, rate-in-force. `credit-note-create.test.ts` updated (the
old "no journal, deferred" assertion reframed to graceful-degradation when the COA is
unseeded). Full API suite green; `pnpm lint` 9/9; web tsc clean.

**Scope notes:**
- **Debit-note ledger posting is intentionally NOT posted** — the CA ruled on credit
  notes only; a debit note's account/direction (additional gross revenue vs a separate
  account) is a separate ruling. Recorded as a follow-up. (Rate-in-force does apply to
  debit notes; time-limit and value-cap are credit-note-specific.)

**Deferred (recorded, not built — per instruction):**
- **Multi-invoice linkage** — one note apportioned proportionally across several
  invoices. Real but rare; not needed for the pilot.
- **Inventory integration for a physical sales return** — out of scope: goods receipt
  is API-only and stock movement isn't wired, so a sales return does not move stock.
- **Net-of-notes Table 12** and **IRN debit-note→DBN mapping** (from Part 4) remain open.

---

## Debit-note ledger + state dropdown + payroll-model scoping (2026-08-06)

### DN-LEDGER — Debit-note ledger posting (CA-ruled) — **DONE**

The mirror of the credit-note reversal, dated to the note's own issuance period:
- **Dr Accounts Receivable (1130)** = gross (asset up)
- **Cr Supplementary Sales & Revenue Adjustments (4140)** = taxable — a **dedicated**
  account (NOT gross sales 4100), added to both COA seeds as a sibling under 4100,
  same audit-trail reason 4130 exists for credit notes.
- **Cr Output CGST/SGST/IGST Payable** = tax (liability up)

`postDebitNoteJournalEntry` (invoice-journal.ts); the mutation posts it in the `else`
branch. **Two credit-note validations are DELIBERATELY absent, with the reasons written
into the code** so nobody re-adds them for symmetry: (1) **no 30-Nov time limit** —
s.34(3) sets none for debit notes (they increase liability, no revenue risk; a deadline
would block legitimate upward revisions; ITC delinking runs the recipient's credit from
the note's own FY); (2) **no cumulative value cap** — contract revisions/escalation/
under-billing have no ceiling, so debit notes may exceed the parent. **Rate-in-force
still applies.** Fairness: `credit-note-ledger.test.ts` grew to 10 (4 debit-note cases:
mirror direction, after-30-Nov accepted with full tax + in Table 9, cumulative-over-parent
accepted, rate-in-force; the 6 credit-note cases still fire).

### STATE-DROPDOWN — free-text state → select — **DONE (safety, not correctness)**

Both Add and Edit employee dialogs now use a `<select>` backed by a canonical 37-item
`INDIAN_STATES` list (`apps/web/src/lib/india-states.ts`); the Edit select preserves an
existing unrecognised value (e.g. a live "Karnatak") as a visible, correctable option.
**Caveat, recorded plainly: a dropdown stops TYPOS, not valid-but-unpopulated states.**
The PT engine holds slabs for only seven states, so picking Kerala or Odisha still
resolves to nil PT (with the `unknownState` warning) until **C2-STRUCT** populates them.
This is a **safety** fix, not a correctness fix. Fairness: `india-states.test.ts` (3).
Refinement noted: the list is web-local to keep the change small/severable; consolidating
onto the shared `GSTIN_STATE_CODES` source is a later cleanup.

### CITY = WORK OR RESIDENCE? — finding (determines whether metro-from-city is buildable)

Investigated per the metro-from-city question. There are **two** fields: `location`
(work/office — the directory "Location" column, `page.tsx:1820`) and `city` (in the tax
section beside `state` and the "50% HRA **by residence**" metro checkbox). **In the data,
`city` is EMPTY for every employee** (dev cohort + the pilot per the directory); only
`state` is populated, and the populated city value ("Bengaluru") lives in `location` =
**work**. So `city` today captures neither reliably — it is unused — and the only
populated city field is the work location.

**Consequence:** metro-from-city IS buildable, but it MUST derive from a **residence**
field, and no residence data exists today. Deriving from the populated field
(`location`) would be deriving from **work** — wrong (Bengaluru-work / Chennai-resident
should get the 50% threshold). Two options:
- **(a)** Designate `city` as the residential city (relabel "Residential city (for HRA)",
  require it, derive metro from it). Cheapest — `city` is already grouped with the metro
  checkbox and is empty, so no data conflict; but HR must now populate residence.
- **(b)** Add a distinct `residentialCity` column — most explicit, avoids overloading the
  ambiguous `city`. Small (one nullable column + form field + wire the derivation).
Either way the real cost is **data collection** (HR entering residence for everyone), not
the derivation. Recommendation: **(a)** for the pilot — relabel + require `city` as
residence — unless you want the audit-clean separation of (b).

### Payroll-model scoping (recorded, NOT built)

- **CTC → employee; structures become percentage templates.** Add `employees.ctcAnnual`
  (single column first), backfill from each linked structure's `ctcAnnual`, re-point the
  five read sites (`payroll-run-aggregates.ts:37` core, `payroll.ts:175` tax-fallback,
  `hr.ts:1469` display, `leave-accrual.ts:57`, `gratuity.ts:37`). **Move `ltaAnnual` with
  it** (it's live in the engine). **`medicalAllowanceAnnual`, `conveyanceAllowanceAnnual`,
  `bonusAnnual` are captured but read by NO computation** — moving them changes no
  behaviour. **Effective-dated employee-CTC history is a fast-follow** (the employee-side
  mirror of M-05, for mid-year-raise precision).
- **Preview path skips the version resolver.** `payroll-run-aggregates.ts:142` joins
  `employees.salaryStructureId = salary_structures.id` (origin version), bypassing
  `resolveSalaryStructureForPeriod` — so preview totals ignore M-05 versioning. Fix in the
  same pass as the CTC move.
- **Location cluster (coupled): city dropdown → metro derived from city → HRA % by city.**
  Metro needs the (residence) city; HRA-by-city needs metro. Build together. See the
  CITY finding above — metro-from-city requires capturing residence first.
- **`hraPercentOfBasic` splits into metro + non-metro columns on the template.** The
  **backfill sets BOTH to the existing value so nobody's pay changes on deploy**; HR then
  sets non-metro (40%) deliberately. **This is a pay decision, NOT a migration default —**
  do not auto-cut non-metro HRA on migration. HRA is the ONLY location-varying component
  (basic %, LTA, medical, conveyance, bonus are national).
- **Sequencing:** state dropdown now (done) → location cluster → CTC split. **None blocks
  C7.** Metro-from-city warrants priority only if a pilot payroll run precedes the fixes
  (a wrongly-ticked metro over-states the HRA exemption).

---

## C3 — ESI six-month contribution period rule (2026-08-06, CA-ruled) — **DONE (local; not pushed)**

**The defect:** `computeESI` decided eligibility purely on the current month's gross
(`isApplicable = gross <= ceiling`), with no way to know if an employee was already a
member mid-period — so anyone crossing ₹21,000 was dropped that month. (The contribution
*amount* was already on actual uncapped gross; only the eligibility decision was wrong.)

**The rule (CA):** contribution periods Apr–Sep and Oct–Mar. Membership is assessed at the
boundary (1 Apr / 1 Oct) from the gross snapshot and HELD for the whole period — a member
stays a member even if gross later crosses ₹21,000 (contributions continue on actual
gross at 0.75%/3.25%), and a non-member does not join mid-period. No exit paperwork.

**Established first (the three questions):**
1. **No ESI membership state existed** — only `esiIpNumber` (identity). Eligibility was
   recomputed from gross every month. This build adds membership state.
2. **Existing employee, no history:** columns are nullable; the run assesses at the next
   boundary. A first-ever run landing *mid-period* with no stored state approximates from
   that month's gross and **flags it** (`memberStateUnknown`) — self-corrects next boundary.
3. **One decision point.** The ESI return/challan (`esiReturnWorkflow`, `esi_challan_records`),
   the payslip PDF and run totals all read the **persisted run amounts** — none re-decides
   eligibility. Fixing the run's ESI decision propagates everywhere.

**Storage (as recommended):** two nullable columns on `employees` (migration
`0073_red_big_bertha`): **`esiMember`** (the held flag) + **`esiMemberPeriodStart`** (the
1-Apr/1-Oct it was assessed for). Contribution *history* already lives in the payslips, so
no separate membership-history table is needed. The pure engine decides eligibility from
the flag; the run (`computePayslips`) assesses + persists at the first run of each period
and carries it mid-period (idempotent — never overwrites within a period).

**Implementation:** `computeESI(gross, ceiling, ctx?)` gains an optional period context
(`monthInFY` + `memberAtPeriodStart`); at a boundary it re-assesses from gross, mid-period
it carries the stored flag (or approximates + flags if unknown), and without a `ctx` it
falls back to the old month-by-month test (legacy callers unaffected). Threaded through
`computeMonthlyStatutory` → `computeEmployeePayslip` (`EmployeePayrollInput.esiMemberAtPeriodStart`)
→ the run reads `employees.esiMember`/`esiMemberPeriodStart` (`esiMemberForCurrentPeriod`) and
persists at the boundary. `esiContributionPeriodStart(month, year)` maps a month to its period.

**Fairness (red before / green after), 15 tests:** `esi-contribution-period.test.ts`
(payroll-math, 6 — the four CA cases + the approximation flag + backward-compat);
`esi-contribution-period.test.ts` (api, 3 — period boundaries);
`employee-statutory-ingestion.test.ts` (+2 — membership carries through the payslip engine;
a boundary re-assesses); `esi-membership-persistence.test.ts` (4 — the run stamps April,
gives ₹0 above ceiling, doesn't re-stamp June, re-assesses October). Full API suite green.

**OPEN CA QUESTION (record, do not treat as settled):** the **mirror case** — a non-member
whose gross falls below the ceiling **mid-period does NOT join until the next boundary**.
The code implements this (symmetric with the member-retention rule, per the stated fairness
check), but the CA ruling explicitly covered only the member-*retention* direction. **Confirm
the non-member-stays-out direction with the CA.** Also confirm the handling for an existing
employee whose **first-ever run lands mid-period with no membership history** (currently
approximated from that month's gross and flagged, self-correcting at the next boundary).

**Deploy note:** built and to be committed **locally only** — GitHub Actions / Vultr are
mid-incident (do not push). Migration `0073` (two nullable columns) applies forward cleanly.

### C3 correction (2026-08-06) — the ESI rule is ASYMMETRIC; the first build assumed it was symmetric

The initial C3 build treated entry as the mirror of exit: a non-member had to wait
for the next 1-Apr/1-Oct boundary to join. **That was wrong.** Per the CA:

- **RETENTION (exit) is bound to the contribution period** — a member whose gross
  crosses ₹21,000 mid-period stays a member until the boundary, contributing on
  actual uncapped gross. (Unchanged; correct as first built.)
- **ENTRY is NOT** — under the ESI Act 1948 coverage is mandatory for anyone at/under
  ₹21,000 and triggers **immediately on a drop in wages**, not at a boundary. A
  non-member at ₹25,000 in April whose gross falls to ₹19,000 in June **joins in June**;
  the retention lock then runs from that point to the period end.

**Reworked:** entry is assessed **every month**, exit **only at a boundary**. In
`computeESI` the mid-period non-member branch now tests the ceiling (join) rather than
carrying "not a member"; the run persists membership on a **change** (mid-period entry),
not only at a boundary.

**First-run edge case, now specified not approximated:** the threshold uses the
**full-month pay scale** (basic + HRA + special; overtime excluded; a part-month joiner
grossed up to a 30-day equivalent) via a new `eligibilityGross`, while the contribution
stays on actual earned gross. So a joiner on the 20th is tested on their scale, not a
prorated fragment. **The approximation flag was kept but narrowed:** it now fires ONLY
for a mid-period, above-ceiling employee with no membership history (a retained member we
can't confirm) — the join case is now a definite entry, not an approximation.

**Tests corrected:** CASE 3 now asserts the non-member **joins in June** (was: stays out);
added two mid-month-joiner cases (grossed-up scale over ceiling → excluded despite a low
prorated fragment; genuine low earner joins part-month with the contribution on actual
earned gross); added a mid-period-entry **persistence** test; narrowed the flag test.

**PATTERN WORTH NOTING — "looks symmetric, isn't" (second occurrence).** This is the
**second** time a rule that appeared symmetric was not, and the symmetric assumption
shipped a wrong build: the first was the **debit-note validations** (a debit note has no
s.34 time limit and no cumulative value cap, unlike a credit note — DN-LEDGER). ESI is the
second (entry ≠ exit). **Lesson for statutory work: never assume the reverse of a rule
holds by symmetry — get each direction ruled explicitly.** Both directions must be
CA-confirmed before coding the mirror.

(The earlier open CA question — "does a non-member stay out mid-period?" — is now RESOLVED:
they do NOT; entry is monthly. The remaining verification is the boundary re-assessment
against the first full month for a no-history joiner.)

---

### SEED-DRIFT (2026-08-07) — per-org seed reconciler; COA is the only seed that drifts

**Trigger.** On the live org the credit/debit-note ledger silently posted nothing: COA
accounts **4130** (Sales Returns & Allowances) and **4140** (Supplementary Sales & Revenue
Adjustments) were absent, so `postCreditNoteJournalEntry` / `postDebitNoteJournalEntry`
returned `null` (they bail if any required account is missing) — the notes appeared in
GSTR-1 Table 9 but posted no GL journal. Root cause: 4130/4140 were added to the
`INDIA_COA_SEED` **array**, not via a migration. COA is copied into each org **once** (at
signup / `coa.seed`); an org seeded *before* those codes existed never receives them. This
is **seed-grows drift**: the definition grows, old orgs don't catch up.

**Audit — is COA the only seed with this shape?** Yes.

| Seed | Mechanism | Drifts when the definition grows? |
|------|-----------|-----------------------------------|
| **Chart of accounts** (`INDIA_COA_SEED`) | copied **per org** at signup | **YES** — old orgs miss later additions |
| Statutory ceilings / income-tax config | **platform-default row** (`orgId = NULL`), read via `resolveStatutoryCeilings` `or(eq(orgId), isNull(orgId))` | No — one shared row; every org falls back to it |
| PT slabs (`PT_SLABS`) | **in-code constant** in `packages/payroll-math` | No — not copied into orgs at all |
| India holidays (`seedIndiaHolidays`) | copied per org, **per year, on demand** | Different shape — see follow-up below |

The **platform-default-row pattern is the correct anti-drift design**; COA is the
exception because it takes per-org copies. Rather than migrate the two specific accounts
(which would freeze *today's* list and let the **next** COA addition recreate the bug), the
fix is a **general reconciler**.

**Fix — startup seed reconciler (`apps/api/src/lib/seed-reconciler.ts`).** A registry of
per-org seeds (`PER_ORG_SEED_RECONCILERS`), with **COA as the first (currently only)
member**. On every API boot, `reconcileSeedsForAllOrgs` enumerates all orgs and brings each
up to the **current** seed definition, inserting only what's missing. Future per-org seeds
with the same shape **register here** instead of getting a bespoke mechanism.

Three guarantees, by explicit design:
1. **Never blocks or fails startup.** It runs *after* `fastify.listen` (server already
   accepting traffic), fire-and-forget, and **never throws** — every error (a single org, a
   single reconciler, even "can't enumerate orgs") is caught and logged; the API keeps
   serving. A missing seed row degrades gracefully; a platform that won't boot does not.
2. **Loud when it acts, silent when it doesn't.** Logs per org, with the **account codes**,
   whenever it inserts anything (`[seed-reconcile] chart_of_accounts: org=… inserted N — 4130, 4140`);
   emits nothing for an already-aligned org.
3. **Insert-only / balance-safe.** Built on `seedChartOfAccountsForOrg` (now returns the
   inserted **codes**, not a count), which skips any account already present by code — it
   never updates or touches balances of existing rows.

**Fairness (green after), 4 tests** (`seed-reconciler.test.ts`): direct seed inserts
4130/4140 and is idempotent on a second pass; the reconciler re-adds a dropped account,
logs it **with the code**, and leaves an existing account's balance untouched; silent for
an aligned org; never throws when it can't enumerate orgs (logs loudly, returns).

**Live remediation:** pressing **Seed India COA** on the live org (done by the user) inserts
the missing accounts immediately; the reconciler makes it durable for that org and every
future one on the next deploy. This **resolves the KNOWN LIVE GAP** recorded in CONTEXT.md.

### FOLLOW-UP (recorded, not built) — India holidays are year-stale, a different shape

`seedIndiaHolidays` (`apps/api/src/routers/hr.ts`) is **per-org and per-year, seeded on
demand** — not a growing list old orgs miss, but a **new row set each calendar year** that
nobody seeds automatically. **What happens today if a year is not seeded:** any feature that
reads holidays for that year (leave-calendar working-day counts, shift/attendance
calendars) sees an **empty holiday set** for that year and silently treats public holidays
as ordinary working days — no error, just wrong day counts. This is a **time-based** gap
(each new year needs seeding), not a **definition-grows** gap (old orgs missing a new
addition), so it does **not** belong in the seed reconciler as-is. Options to weigh later:
(a) a scheduled job that seeds the upcoming year for every org before 1 Jan; (b) lazy
seed-on-first-read for the requested year; (c) fold a *year-parameterised* holiday
reconciler into the registry. **Not in scope for the reconciler build; tracked here.**

---

## C2-STRUCT half-yearly PT (2026-08-07) — levy period + full-period-or-flag

**What shipped.** The professional-tax engine gained a **levy period** per state
(`packages/payroll-math/src/statutory-deductions.ts`). Kerala and Tamil Nadu are now
**half-yearly**; every other state stays monthly (unchanged). Specifically:
- **A `levyPeriod` field** on each state's slab config (absent ⇒ monthly, so nothing else moved).
- **Kerala added** from the CA matrix as half-yearly income bands (nil ≤ ₹11,999 … ₹600 above
  ₹60,000). It no longer falls through the unknown-state branch.
- **Tamil Nadu converted** to half-yearly — the amounts were already correct; only the income base
  (half-yearly, not monthly) and the timing (once per period, not every month) were wrong before.
- **Half-yearly income is derived from PAYSLIP HISTORY**, not a new table (same reasoning as C3/ESI):
  the run sums the period's earlier months from `payslips` (`buildPtHalfYearlyContext` in
  `apps/api/src/services/payroll-run-aggregates.ts`). Establish-question answered: no migration.
- **FULL-PERIOD-OR-FLAG guard (the correctness core).** PT is assessed on the WHOLE six-month
  period **or it flags and deducts ₹0** — it NEVER computes from a partial period (a lower income
  lands in a lower bracket → silent under-collection, the employer's liability). "Partial" has two
  causes, reported distinctly in the run warning (`errors[]`, the F-PT-NIL channel):
  - **DATA** — an earlier period month is missing from history (migration gap).
  - **TIMING** — a later period month has not yet elapsed (collection before the period end).
  Single code path (`assessHalfYearlyPtAtCollection`); both `computePT` and the run go through it.
  The two preview paths supply no period context and therefore also land in the flag branch — no
  path reaches a computed amount from an incompletely-assessed period.
- **Deposit-month constants** (`PT_HALF_YEARLY_DEPOSIT_MONTH`): H1 → Sep (6), H2 → Feb (11),
  CA-pending, with a warning comment that a collection month earlier than the period end forces a
  flag (correctness, not just timing).
- **Also in this pass:** the two stale `MAHARASHTRA_FEMALE`-unreachable comments corrected (gender
  selection is live), and the seven fix-plan/CONTEXT doc corrections recorded 2026-08-07.

**THE KEY FINDING — H2 cannot be fully assessed under either CA-stated collection month.** The CA
said Oct–Mar is collected "in January **or** February" — **both precede the H2 period end (March)**.
So at collection time the six-month income is not yet known, and the guard flags (timing). Worked
example (Tamil Nadu, ₹12,000/month): the **six-month** income is **₹72,000** → the **₹1,025** band,
but **five months** (Oct–Feb) reads **₹60,000** → the **₹690** band — a ₹335 silent under-collection
if assessed early. The engine refuses that and flags instead.

**OPERATIONAL CONSEQUENCE — Kerala & Tamil Nadu PT is NOT automated in either period for the first
cycle** (two of the three levying pilot states; Karnataka is monthly and fine, Delhi levies none):
- **H1 (Apr–Sep)** flags on **missing migration history** — the pilots' first in-system run lands in
  Aug/Sep with no Apr–Jul payslips (DATA cause).
- **H2 (Oct–Mar)** flags on the **unelapsed March tail** under the Feb default (TIMING cause).
Both are **handled manually** (record the period's PT by hand, or await the CA) until the CA answers.
The run surfaces a per-employee warning naming the exact months and the cause each cycle.

**Open CA questions (resolve before the first live half-yearly cycle):**
1. **H2 reconciliation** — the Jan/Feb collection window precedes the March period end, so H2 cannot
   be auto-assessed. Either collect in March, or rule the explicit assessment basis. Until then H2
   flags for manual handling (never a guessed amount).
2. **H1 Aug vs Sep** — default is Sep (period end, fully assessable). **August would flag** every
   cycle (September tail unelapsed) — safe, not silently wrong, and proven by test. One-line change
   in the constant table when the CA answers.
3. **Kerala's `annualCap`** — encoded as `0`, a deliberate "unverified / not yet ruled" sentinel
   (NOT a statutory figure, NOT "no PT"). Caps must not be derived from the rate (Punjab ₹2,400 vs
   Gujarat ₹2,500). Inert today (no YTD ledger); `0` only slightly over-withholds TDS (recoverable).
4. **Karnataka's `annualCap` ₹2,400 vs ₹2,500** — still with the CA; left untouched.
5. **Mid-period joiner AND leaver treatment** — see below.

**Mid-period joiners currently flag alongside migration gaps — deliberate.** The completeness check
requires every earlier period month on record; a legitimate mid-period joiner (no earlier payroll,
correctly) is therefore flagged just like a migration gap. This is the **loud-over-wrong** direction:
better a recoverable flag than a silently-small filed amount. Excluding pre-join months from the
required set (so genuine joiners don't false-flag), and the symmetric **leaver** case, are a **later
refinement**, not this pass.

**Not in scope (unchanged from the scoping pass):** gender-split slabs beyond Maharashtra (done and
irrelevant to the pilot cohort), the other ~20 states + explicit non-levying markers, March-rate
states (no pilot state needs one), and the cross-state YTD-PT cap ledger (only bites on a mid-year
interstate transfer, none reported).

**Tests (red before / green after).** Pure engine `packages/payroll-math/src/pt-half-yearly.test.ts`
(18) + run-path `apps/api/src/__tests__/pt-half-yearly-run.test.ts` (4, DB-backed): full-period
computes; H1-flipped-to-August flags on the unelapsed tail (proves the constant is safe to edit);
H2/Feb flags on the March tail even with complete history; DATA-cause flags naming the missing month;
Karnataka monthly + Feb ₹300 and Delhi silent nil unchanged. Red-before proven twice (disable the
levy branch → 11 fail; disable the tail check → the 2 timing tests fail). `pnpm lint` 9/9.

---

## C6 — payslip mandatory statutory fields (2026-08-08) — mostly render-wiring

**What shipped.** The statutory payslip now carries the mandatory field set. C6 turned out to be
largely **render-wiring, not the data-model build the plan implied**: the employee ingestion (PAN,
UAN, ESI IP number, bank) and the tenant ingestion (TAN, EPF code, CIN via the India wizard) already
existed; the data was stored and the PDF's field contract already supported most of it. The renderers
were filling the hard parts with blanks and zeros. Wired:
- **ESI** (employee + employer) read from the stored `payslips.esiEmployee`/`esiEmployer`.
- **Tenant identity** — TAN, EPF code, CIN, and the **new ESI establishment number** — read from
  `organizations` + `legalEntities` instead of `"—"`.
- **Paid and LOP days** read from the stored `payslips.paidDays`/`lopDays` (the portal LOP badge now fires).
- **Employee ESI IP number** added to the PDF contract and rendered next to PAN/UAN.
- **Migration `0074_ambiguous_rick_jones`** — `organizations.esi_establishment_number` (nullable) —
  plus the India-wizard schema, write path (`orgWizardWrite`), read path, and UI (optional field).

**THE ESI RECONCILIATION DEFECT (a defect, not a feature — found by the C6 scoping pass, fixed here).**
Both renderers — the statutory PDF (`buildPdfInput`) and the on-screen breakdown (`mapPayslipRow`) —
**hardcoded `esiEmployee` and `esiEmployer` to 0**, while the printed **TOTAL deductions figure
included ESI**. So for **any employee at or under ₹21,000**, the itemised deduction lines **did not
sum to the total shown on their own payslip** — a document that contradicts itself. Across the seven
pilots, every ESI-eligible employee would have received a self-contradicting payslip. Fixed: the ESI
lines now read the stored contribution, so the lines reconcile to the total. A reconciliation test
asserts the sum of the itemised lines equals the printed total (not merely that ESI is non-zero).

**ROOT CAUSE + the shared builder.** The two renderers **independently hardcoded the same fields to
the same wrong values** — each assembled a payslip view and each stubbed the hard parts. Fixing them
separately would guarantee they drift again. So a **single shared payslip-view builder**
(`apps/api/src/lib/payslip-view.ts`) now resolves the amounts, attendance and identity in one place,
and both renderers read from it. A **cross-renderer consistency test** (same view → PDF input and
portal row → assert equal field-for-field) is the guard against re-drift.

**A15 DECISION TAKEN — shared payslip-view builder now, NOT a general document-header service.** A17's
branded invoice/PO PDFs are **post go-live**; designing a general `resolveTenantDocumentHeader` around a
consumer that does not exist yet risks the August date. The builder's tenant-identity portion is a
self-contained sub-object, structured so it can be **lifted out cleanly later** when A17 arrives (a
comment records this intent). This is the "decide whether they share one service before building three
times" call the CA flagged — resolved as: build the payslip's now, lift it out when the second consumer is real.

**ESI-member missing-identity warning (a run warning, deliberately NOT wizard validation).** The ESI
establishment number (org) and ESI IP number (employee) are settable but **not required at intake** —
not every org is ESI-registered, and hard validation would block onboarding three weeks before go-live
when we do not yet know which pilots are ESI-registered. Instead, following the F-PT-NIL / PT-period
pattern, the run flags it: when an employee the engine has made an **ESI member** (memberForPeriod, or a
non-zero contribution) is missing either number, a per-member warning rides the `errors[]` channel,
**naming whose number is missing** (org-level = a wizard fix; employee-level = an employee-record fix).
A non-member with no IP number is correct and is **not** flagged.

**CORRECTION TO THE RECORD.** The plan's claim that TAN and EPF code "have columns but no mutation sets
them" is **stale**: `orgWizardWrite` sets **TAN, EPF code and CIN** via the India setup wizard.

**Held (per owner instruction).** Org registered address (B17) — renders `city, state` today with a
`TODO(CA)`, no column added on assumption. Company logo — skipped (needs a URL→Buffer fetch, not statutory).
The ₹0 PT line already renders as a real ₹0 (unconditional) in both renderers, so a Kerala/TN employee's
five non-collection months show a real ₹0 PT and the lump appears in the sixth — no change needed.

**Tests (red before / green after).** `payslip-view.test.ts` (9, pure): ESI reconciliation (the
headline), employer ESI, non-ESI reconciles, tenant identity from stored values (+ "—" fallback), ESI IP
number, paid/LOP days from stored columns with the portal badge firing, and cross-renderer consistency.
`esi-identity-warning.test.ts` (4, DB-backed): org-cause fires, employee-cause fires, both-present = no
warning, non-member = no warning (the scoping proof). Red-before proven for both (revert ESI wiring →
reconciliation fails; disable the warning → the two "fires" tests fail). `pnpm lint` 9/9.

**MIGRATION VALIDATION (0074) against a real-data copy.** Validated against a **throwaway copy of the
real dev DB** (port 5434, 1 real org), not the schema-shaped test DB: applied the exact `ADD COLUMN`
statement, confirmed the column landed (text, nullable, NULL), the existing org row was untouched, and
the schema diff was **exactly one line** (nothing else moved); dropped the copy.

### C6 open items — needs the CA (unreachable ~48h)

- **B17 address granularity** — full registered address vs. city/state on the payslip.
- **ESI IP / establishment number format** — stored as free text; whether to validate the format.
- **Half-yearly PT payslip note** — whether the ₹0 PT months should carry a "levied half-yearly,
  collected in <month>" note (renders a bare ₹0 today).

### ⚠️ DA — FLAGGED, larger than a payslip line (needs the CA + the customers)

There is **no DA (dearness allowance) column** on the salary structure, so PF's `basicPlusDA` basis is
reading **basic alone**. If **any pilot employee actually receives DA**, their PF contribution is
**understated — a wrong statutory amount filed**, not merely a missing payslip line. The customers are
being asked whether any of them pay DA. **If the answer is yes, this becomes a PF-engine correctness
fix** (add DA to the structure + feed it into the PF wage base), not a payslip item. Do not treat the
C6 payslip work as covering DA.

### FOLLOW-UP (recorded, not built) — the dev DB is stale relative to head

The dev DB (port 5434) is at roughly migration **0060** while the head is **0074**. The 0074 validation
above still holds because 0074 is a **bare `ADD COLUMN` depending only on the `organizations` table**,
which exists at 0060. But a **future migration touching anything added or altered after 0060 cannot be
honestly validated against a copy this stale** — the copy would be missing the very objects the
migration edits. **Bring the dev DB to head before the next migration** so real-data validation stays
meaningful.

---

## PAN-at-rest + null-structure silent drop (2026-08-08) — two defects found scoping the importer

Two live defects, both surfaced by the employee-bulk-importer scoping pass (not by any audit),
both independent of the importer, fixed here.

### PAN-PLAINTEXT — the most sensitive PAN in the system was the one stored in the clear

**The defect.** `hr.employees.create` wrote `pan: input.pan` **in plaintext**, and never populated
`panMaskedHash` / `panMaskedDisplay` — though both columns exist on `employees`. `hr.employees.update`
did the same via its `...rest` spread. Meanwhile **vendors and the org record both encrypt** via
`panColumns()` (KMS envelope + peppered match-hash + masked display). So an **individual's PAN —
personal data under DPDP — was the one identifier sitting unencrypted at rest**, in a product whose
GRC posture is the free foundation. This is a DPDP exposure, and it was never caught by an audit —
only by scoping the importer, which asked "does create do the encryption vendors do?" and found it did not.

**THE CENSUS (the number that makes the backfill mandatory).** On the real dev DB, **9 of 9 employee
rows carry a PAN and ALL 9 are plaintext** (bare `AAAAA9999A`, zero `v2:` envelopes). **Production is the
same, because it is the same code path** — every employee PAN created to date is plaintext, scaled to the
live org's headcount.

**The fix.** A single shared helper `panColumnsTolerant()` (`apps/api/src/lib/pan.ts`) wraps
`panColumns()` and degrades a malformed PAN to encrypted-raw (never plaintext, never throws). **All THREE
PAN write paths now go through it** — `hr.employees.create`, `hr.employees.update`, AND
`ingest.importVendors` (consolidated onto the helper, byte-identical behaviour). **One implementation, so
they cannot drift — which is exactly how this defect arose** (create diverged from vendors). Existing rows
keep reading because `decryptPan` passes legacy plaintext through unchanged.

**BEHAVIOUR CHANGE (recorded, not silent).** On update, passing an **empty-string PAN now leaves the
columns untouched** rather than blanking them (`panColumns`' empty-is-a-no-op semantics). Consequence: an
admin cannot *clear* a wrongly-entered PAN through the form. **Judged acceptable** and recorded here so it
is a known decision, not a future bug report.

**PAN-BACKFILL — OPEN ITEM, NOT BUILT (awaiting a separate decision).** Every existing `employees` row with
a non-null `pan` not prefixed `v2:` needs encrypting: read the plaintext, run it through
`panColumnsTolerant()` (encrypt + derive hash/mask), write all three columns back. It **must run
in-process** — it needs `APP_SECRET` (local KMS KEK) and `PII_HASH_PEPPER`, so a `.sql` migration **cannot**
do it; it is a one-shot script or a startup reconciler pass. It is **idempotent** (skip rows already `v2:`)
and **safe to defer** because `decryptPan` reads plaintext through — the only exposure meanwhile is
plaintext at rest. It rewrites encrypted personal data across every org, so it wants a **snapshot, a dry-run
count, and a decrypt-equals-original verification pass** before it runs. Deliberately not a rider on this build.

### NULL-STRUCTURE SILENT DROP — an employee with no salary structure was excluded from payroll, silently

**The defect.** `computePayrollRunTotals` **inner-joins** salary structures
(`payroll-run-aggregates.ts`), and the write path does `if (!emp.salaryStructureId) continue`
(`payroll.ts`). So an active employee with **no salary structure was excluded from the run entirely —
not paid, no error, no warning.** They looked correctly created and simply never appeared. This is the
worst failure mode in the payroll path: silent, and it produces an **unpaid employee** rather than a wrong
number. Found while scoping the importer; exists independent of it.

**The fix.** A **separate lookup** (before the inner join loses them) finds active employees with
`salaryStructureId IS NULL` and pushes a **per-employee warning** through the same `errors[]` channel
F-PT-NIL / ESI-identity / PT-period use — naming the employee and saying plainly they have no structure and
were excluded. **Flag and continue — not blocking, no invented default structure.** (The drop set is
exactly `IS NULL`: the FK is set-null-on-delete and, when set, always points at the origin-version row,
which exists — so the join only ever drops nulls.)

**Tests (red before / green after).** `employee-pan-encryption.test.ts` (4): create/update store `v2:`
ciphertext + hash + mask, no plaintext, round-trip via `decryptPan`; malformed → encrypted-raw, no throw,
no hash; legacy plaintext still reads through. `payroll-structureless-warning.test.ts` (3): the
structure-less employee is named and excluded; a structured employee is unaffected; mixed run flags only
the structure-less one. Red-before proven for both (force the helper to plaintext → the 3 write tests fail;
disable the warning loop → the 2 structureless tests fail; the read-through and with-structure tests stay
green). `pnpm lint` 9/9.

### CORRECTION TO THE RECORD — importVendors is NOT "tolerant of bad rows"

The **"Bulk data import — corrected classification (2026-08-02)"** section describes
`ingest.importVendors` as tolerant of bad rows. **It is not.** tRPC validates the whole `z.array(...)`
input **before the mutation body runs**, so **one schema-invalid row rejects the entire batch (400)**. The
only per-row tolerance is the PAN fallback, and there is **no `skipped[]` return**. The genuinely tolerant
importer in that file is **`importInvoices`** (per-row skip + `skipped[]`). This matters because the
employee importer was scoped as "a direct copy of a proven tolerant pattern" partly on the strength of that
claim — the tolerance must come from the **client** `CsvImportModal` (which splits valid/error rows) or be
modelled on `importInvoices`, not `importVendors`.

---

## PAN ciphertext in the edit dialog — a DESTRUCTIVE defect (2026-08-08)

### The defect (destructive, not cosmetic)
`hr.employees.list` returned the **raw `v2:` envelope** in the `pan` field, which pre-filled the
edit dialog's PAN input. `panColumnsTolerant` then encrypted **whatever it was given** — so an admin
who opened the dialog and clicked **Save wrote the ciphertext back through the encrypter**, producing
a **double-encrypted** value. Decrypting it once yields the envelope string, not the PAN; **the
original is unrecoverable from that row.** This was **live on production** from the PAN-encryption
deploy (`5710dc2`) until this fix, and it was found from a **user screenshot of the live site — not
by any test.**

### THE CHAIN — the standing lesson, not just an incident note
Read this as a rule, not a war story:
1. The **employee-importer scoping pass** found employee PAN stored in **plaintext**.
2. Fixing plaintext (`5710dc2`) encrypted PAN on write — but the directory **read path still returned
   the raw ciphertext**, which the edit form displayed.
3. That ciphertext-in-the-form was **one Save away from destroying data.**

**An encryption change has a READ side that must be checked as deliberately as the write side.** The
build prompt for the encryption fix asked only about writes; the read paths (which query returns the
column, does it decrypt, does any form re-post it) were not audited, and that gap shipped a
destructive bug. **Standing rule for any future encrypt/mask/hash change: enumerate every read path
and every form that round-trips the column, in the same pass as the write.**

### The fix — four layers, guard un-bypassable
1. **The guard, inside `panColumnsTolerant`** (`apps/api/src/lib/pan.ts`): if the incoming value is
   already a `v2:` envelope, return `{}` (no change) — **never re-encrypt**. It lives in the helper,
   not at the call sites, so **no caller can bypass it** and the whole class of bug is impossible.
2. **`hr.employees.list` / `get` no longer ship the ciphertext** — `pan: null`, keeping only
   `panMaskedDisplay`. The client can't re-post what it never receives.
3. **The edit dialog is write-only** — it shows the masked current value, keeps the input empty, and
   sends a PAN only when the admin types a new one (empty = no change).
4. **PAN format validation** on `create` + `update` (server Zod `employeePanField` + a client check)
   rejects a `v2:` string, a mask, or any malformed value at the edge.

### MASKED, WRITE-ONLY — the chosen display and why
The dialog shows `panMaskedDisplay` (`XXXXXX999Z`) read-only; the admin can overwrite but never reads
the full PAN back. Reason: this is personal data under DPDP, the masked column exists for exactly
this, and **returning a decrypted PAN to the browser would re-expose the plaintext that
encryption-at-rest just protected.**

### The read-only production check (ships here; runs post-deploy)
`apps/api/src/scripts/pan-prod-check.ts` (+ tsup entry → `dist/scripts/pan-prod-check.mjs`) and the
manual `workflow_dispatch` workflow `.github/workflows/pan-prod-check.yml` classify every employee
PAN in production as plaintext / correctly-encrypted / **double-encrypted** / undecryptable. READ
ONLY (a single SELECT + in-memory decrypt), prints **counts + row identifiers only, never a PAN**,
reaches the host the same way the Deploy-to-Vultr job does, and runs **inside the api container** so
the prod DB / `APP_SECRET` never leave the box. Proven locally against a throwaway copy seeded with
all four classes (it correctly reported 1 double-encrypted + 1 undecryptable, no PAN printed).

### ✅ RESOLVED — the production PAN audit RAN and came back CLEAN (2026-08-08)
**Superseded.** This section originally said production PAN state was UNKNOWN until the check ran. **The
check has since run (CI run `31253488299`'s workflow) and reported 1 row with a PAN, 0 plaintext, 1
correctly encrypted, 0 double-encrypted, 0 undecryptable.** Production is clean — **no PAN was
destroyed**, and there are **no double-encrypted rows**. The original text is kept below for history
only:
> Production **may contain double-encrypted rows** (any employee whose edit dialog was opened + Saved
> after `5710dc2`). The check can only run **once this commit is deployed** (it executes inside the
> deployed image). **Until it reports, the state of production employee PANs is unknown.** Recovery for
> any affected row is **re-entry of the PAN from source — there is no computational recovery.**

### Two out-of-scope DPDP findings (recorded, NOT fixed)
- **Director / shareholder / vendor forms render the FULL plaintext PAN unmasked** on read (secretarial
  table cells, vendor edit form). Same *class* as the employee display weakness, but **lower urgency:
  those paths decrypt correctly, so they are NOT destructive** (they re-post plaintext, which encrypts
  fine). Candidates for masked-display later.
- **The vendor PAN input has no format validation**, while the org wizard does. Candidate for the
  shared `employeePanField` schema.

### Note on the tolerant fallback
`panColumnsTolerant`'s malformed→encrypted-raw fallback is now a **genuine last resort** (for the
batch importer, which has no per-row edge validation), not a routine path — single-record create/update
reject malformed at the edge.

### ⚠️ INFRASTRUCTURE — production has NO automatic backups (recorded, not done)
Vultr **auto-backups are NOT enabled** on the production instance. The entire restore path is **manual
snapshots taken by hand before each commit**. Seven pilot customers' payroll data on one instance with
**no automatic backup** is a real go-live risk. It is a **settings checkbox**, not a build — enable
Vultr automatic backups on the production instance before go-live.

---

## PAN audit workflow — compose-interpolation fix (2026-08-08)

**The failure.** The read-only PAN audit workflow failed on its first run before reaching the
database: `required variable NEXUSOPS_WEB_IMAGE is missing a value`. Root cause: the workflow ran
`docker compose … -f docker-compose.vultr-test.yml -f docker-compose.vultr.images.yml exec`, and the
`.images.yml` override declares `image: ${NEXUSOPS_WEB_IMAGE:?…}` — a **REQUIRED** interpolation.
Compose resolves **every** referenced file before doing anything, so it **aborted before reaching the
DB.** Nothing ran against production.

**Why the deploy path never hits this.** `scripts/push-to-vultr.sh` passes `NEXUSOPS_WEB_IMAGE` and
`NEXUSOPS_API_IMAGE` on the SSH command line, and `scripts/vultr-remote-deploy.sh` exports them before
calling compose (lines 54-57). **Standing note: any compose invocation that includes the images
override needs those two vars exported first** — worth knowing before anyone writes another one-off
job against production.

**The fix (workflow-only — `.github/workflows/pan-prod-check.yml`).** The audit now **bypasses
`docker compose` entirely** and `docker exec`s into the running api container, discovered by its
compose service label (`docker ps -q --filter label=com.docker.compose.service=api`), with a guard
that fails loudly on **zero or multiple** matches rather than proceeding. Chosen over fixing the
compose plumbing because a mistake in the compose/deploy path would break deploys three weeks from
go-live, and a label-scoped `docker exec` cannot. Safety unchanged: still read-only, no writes, prints
no PAN, runs inside the prod container so no secret reaches the runner. It is a workflow-only change,
so it is runnable as soon as it lands on `main` — the audit script is already in the live image (no
app deploy needed for the audit to work).

**✅ RESOLVED — the audit HAS run and came back CLEAN (2026-08-08).** The read-only PAN audit ran (CI
run `31253488299`'s workflow) and reported **1 row with a PAN, 0 plaintext, 1 correctly encrypted, 0
double-encrypted, 0 undecryptable** — no record was double-encrypted between `5710dc2` and `2bb3bac`.
**The PAN backfill is UNNECESSARY, not deferred:** production holds no plaintext PAN, so there is
nothing to convert (the backfill was scoped from a dev-DB census, 9/9 plaintext on dev, that did not
reflect production history). Do **not** build the backfill. Original (now-superseded) text kept for
history:
> **⚠️ STILL OPEN — the audit has NOT run.** Production employee-PAN state remains **unknown**: it is
> not yet established whether any record was double-encrypted between `5710dc2` (encryption deploy) and
> `2bb3bac` (the edit-dialog fix). This **gates the PAN backfill** — do not run the backfill until the
> audit has confirmed the double-encryption count (any double-encrypted row must be re-entered from
> source first; the backfill would otherwise re-encrypt a corrupted value).

---

## Employee bulk importer + A12-D LOP projection (2026-08-08)

Two independent changes, shipped as two commits in one deploy (either revertible
alone). Committed after a confirmed Vultr snapshot with the Actions tab clear.

### Employee bulk importer — `ingest.importEmployees` (commit `0c77dbd`)

Onboarding for the seven pilots is 30–80 employees each and there was **no bulk
path** — only single-record `hr.employees.create`, i.e. 350–560 hand-keyed
records each feeding a payroll run and a statutory filing. The importer closes
that. It reuses the existing entity-agnostic `CsvImportModal`.

**The six settled decisions (do NOT re-litigate):**
1. **PAN encrypted** at rest via `panColumnsTolerant` — never plaintext.
2. **email REQUIRED** — a unique-per-org `users` row is created per employee
   (`employees.userId` is NOT NULL / unique); placeholder emails are refused.
3. **salary structure resolved by NAME** to a family id — **not-found OR
   ambiguous (two families share the name) is a named per-row skip, never an
   unpayable employee**; structures are **never auto-created** from CSV columns
   (a structure invented at import sets everyone's basic %, the figure under CA
   review for the 50% wage floor).
4. **skip-and-report per row with reasons** — the `importInvoices` shape, **not**
   the batch-aborting `importVendors` — plus **dry run as the DEFAULT**
   (`dryRun` defaults true; writing requires an explicit `dryRun:false`).
5. **automation hooks suppressed for bulk** — `runEntityBusinessRules` /
   `emitDomainEvent` are deliberately not fired (hundreds of fire-and-forget
   evaluations during onboarding are load with no benefit).
6. **EMP-NNNN allocation hardened** — a new atomic, delete-proof
   `getNextEmployeeNumber` (seeds once from the max existing `EMP-` number, then
   monotonic `+1` via `org_counters`), replacing `count(*)+1`.

**Scoping correction — importVendors is NOT batch-tolerant.** The plan claimed
it was; it validates a strict `z.array` before the mutation body, so one bad row
rejects the whole request (its only tolerance is a PAN try/catch, and it returns
no `skipped[]`). The importer copies `importInvoices` instead: a tolerant
all-optional-string boundary, with every row validated inside the mutation.

**DEFECT the scoping missed — a fourth EMP allocator.**
`hr.onboarding.createOnboarding` **also** allocated `EMP-NNNN` by `count(*)+1`.
Left as-is, two allocators would disagree after any delete and reproduce the
exact collision the hardening exists to prevent. **All three runtime sites**
(`hr.employees.create`, `hr.onboarding.createOnboarding`, `ingest.importEmployees`)
now share `getNextEmployeeNumber`; the two `EMP-` seed scripts
(`seed-modules.ts`, `seed-smb-analytics.ts`) are setup-time generators and the
allocator self-seeds from the max existing number. **Proven red:** count-based
allocation produced `EMP-0003` colliding with a survivor →
`duplicate key value violates unique constraint "employees_org_employee_id_idx"`.

**SECOND DEFECT — encryption failure could abort the whole batch.**
`panColumnsTolerant`'s catch handles a *malformed* PAN by re-calling the
encrypter, so an *encryption* failure (KMS / `APP_SECRET` outage) throws **twice**
and escapes the helper as a plain `Error`. In the importer that escaped the
per-row handler (which re-throws non-row errors) and **aborted the entire batch —
including rows with no PAN at all**. A KMS outage mid-import would have taken the
whole import down. Now the importer **guards the encrypt call per row**
(failure → named skip, batch continues). **The shared helper itself was NOT
changed** — only the importer guards it — so **any future caller of
`panColumnsTolerant` inherits the same trap**. Proven red (unguarded: whole
mutation rejects with the KMS error; the PAN-less row never imports).

**Deliberately NOT imported — C1 declaration fields.**
`previousEmployerIncome` / `previousEmployerTds` / `rentPaidAnnual` are dropped
from the schema, the CSV spec, and the write. These are **C1
declaration-intake** fields; C1 requires each figure to carry a **provenance
status — provisional / proven / lapsed, with the Feb→Mar catch-up spread** —
because a declared-but-never-proven relief must be withdrawn and the tax
recovered. A CSV cell gives a number with **no status**, so C1 would inherit
rows it cannot classify. **RECORDED SEPARATELY:** `hr.employees.create` has the
**same gap** (it accepts these three figures with no provenance) — it was **not**
changed in this pass and **must be addressed when C1 lands**.

**PT exemption flags deliberately not importable.** `ptExemptArmedForces` /
`ptExemptDisability` / `ptExemptDependentDisability` are omitted from the
importer: the CA ruled they require **evidence** (military ID, Form 10-IA) and
the **employer carries the liability** for a wrongly claimed exemption. They stay
HR-keyed via the edit dialog.

Tests: `apps/api/src/__tests__/employee-bulk-import.test.ts` (good row →
encrypted PAN + masked columns + user + EMP-NNNN; malformed-PAN row skipped while
the batch continues; missing email skipped; structure not-found and ambiguous
skipped with no employee created; dry run writes nothing; EMP-NNNN correct across
a batch and after a delete; encryption-failure row skipped, PAN-less row still
imports). Full suite + affected regression green; `pnpm lint` 9/9.

### A12-D — LOP split-logic tax projection (commit see below, payroll-math)

The shipped A12 correctly stopped taxing an unpaid-leave employee as fully paid,
but its projection method is wrong: it annualised **this month's LOP-reduced
components × 12** (`basicEarned*12 + …`), i.e. it projected a single reduced
month across the **whole year**, under-collecting TDS in any LOP month.

**Old formula (`packages/payroll-math/src/payroll-cycle.ts`):**
`annualCTC = basicEarned*12 + hraEarned*12 + specialAllowanceEarned*12 + ltaEarned*12`.

**New (split-logic blend):**
`annual = contracted × (months elapsed) + this month's actual earned + contracted × (months remaining)`,
computed per component. FY-month arithmetic (`fyMonth` 1=Apr … 12=Mar):
April → 0 before / 11 after, March → 11 before / 0 after; `fyMonth` clamped to
[1,12] so remaining can't go negative. `taxComputation.grossSalary` (which is
`annualCTC` for a full-year employee) is asserted directly in the tests.

**Worked example** — contracted taxable **164,500/month**, half the month unpaid
→ current actual **82,250**:

| | projected annual |
|---|---|
| Old `earned×12` | 82,250 × 12 = **987,000** (under-projects; assumes LOP all year) |
| New blend | 164,500 × 11 + 82,250 = **1,891,750** |
| Full non-LOP year | 164,500 × 12 = **1,974,000** |

Non-LOP is **byte-identical** (current == contracted → blend collapses to
`contracted × 12` == the old `earned × 12`).

**KNOWN BLIND SPOT (recorded plainly — not a bug):** the **past** months are
**estimated at contracted pay**, not read from real payslips, because **PR5 is
still open** — the run passes YTD figures as **zero**
(`payroll-run-aggregates.ts`), so there is no trustworthy running FY total at
this point and the fix does not build on that untrusted zero. Consequence: a
**loss of pay in an EARLIER month of the same FY is invisible** to a later
month's projection (it assumes every past month was full pay). Exact for the
one-off current-month LOP that matters; correcting the multi-LOP case needs
PR5's real running total. **Strictly better than what shipped, and not final.**

**HRA exemption cap moved onto the same blended basis** — A12 explicitly tied the
HRA-exemption annual basic/HRA to `annualCTC`'s basis, so leaving them divergent
would create a new inconsistency. **Byte-identical for every non-LOP payslip**
(and every existing HRA test, which are all full-attendance); only a LOP
old-regime renter shifts, in the correct direction. LOP calculation and the
attendance path are untouched.

Tests: `apps/api/src/__tests__/payroll-lop-tax-floor.test.ts` — new describe
"A12-D — split-logic annual projection" (LOP current-month blend asserted
directly; non-LOP unchanged; April eleven-remaining; March zero-remaining with no
off-by-one; the A12 net-pay floor still holds under the higher projection).
Proven red against the pre-rebuild dist (`987,000`), green after
(`1,891,750`). payroll-math rebuilt; `pnpm lint` 9/9.

**QA release kit — Section 4** records A12-D as "close but not final" so testers
do not raise it; that note comes out at the next kit revision.

### CORRECTIONS to prior records

- **Production PAN audit HAS run and came back CLEAN.** CI run
  `31253488299`'s workflow reported **1 row with a PAN, 0 plaintext, 1 correctly
  encrypted, 0 double-encrypted, 0 undecryptable.** No PAN was destroyed. The
  "⚠️ STILL OPEN — the audit has NOT run" note above and in the PAN-ciphertext
  section is **superseded**.
- **PAN backfill is UNNECESSARY, not deferred.** Production holds **no plaintext
  PAN**, so there is nothing to convert. The backfill was scoped from a
  **dev-database census** (9/9 plaintext on dev) that did not reflect production
  history. **Removed from the next-items list — do not build it.**

### INFRASTRUCTURE — Vultr automatic backups (decision, not a gap)

Vultr automatic backups are **deliberately OFF during testing** — the cost
outweighs the value of test data — and will be **enabled per instance at
deployment**. Two recovery paths exist meanwhile: the **manual snapshot** and
**redeploy from the last green build**. The residual gap is **granularity
between snapshots**, not absence of backup. Trigger to revisit: **the first
customer's data landing**, not a calendar date.

---

## Read-only sweep findings (2026-08-08)

Two defects surfaced by a **read-only** verification sweep and confirmed first-hand in the
code (`file:line` below). **Recorded, NOT fixed** — no code was changed. Both are new; neither
was in the status table or a prior detail section.

Also recorded here for the record: a **documentation correction, not a defect** — `docs/CONTEXT.md`'s
former headline "50% WAGE FLOOR — largest unresolved risk" warning claimed the floor was **not wired**
and PF was understated. That was **wrong**: `calculateLabourCodeWageBase` IS called in the live payslip
path (`payroll-cycle.ts:322-324`) and the lifted base flows into `computePF` (`statutory-deductions.ts:723`);
the ceiling that gates it is a platform default every org inherits (mig `0054`, `org_id NULL`). CONTEXT.md
was corrected 2026-08-08. **No wage-floor "not wired" claim exists in THIS file** (fix-plan) to correct —
the only `50% wage floor` mentions here (C4 row; the importer's structure-by-name note) correctly describe
`basicPercent` as "under CA review," which remains true. The genuine residual open items (no floor on the
`basicPercent` field itself; no DA component; CA sign-off + a new ceiling-ordering question) are logged in
CONTEXT.md's rewritten section.

### TAX-REGIME-DEFAULT — a statutory election made by a database default

- **Written / defaulted where.** Column `taxRegime` is `notNull().default("new")`
  (`packages/db/src/schema/hr.ts:186`). It is `.optional()` at `hr.employees.create`
  (`apps/api/src/routers/hr.ts:288`, update `:433`) and at the bulk importer
  (`apps/api/src/routers/ingest.ts:159`).
- **Blank cell == absent column (the crux).** The importer maps `taxRegime =
  optionalEnum(raw.taxRegime, TAX_REGIMES, …)` (`ingest.ts:642`); `optionalEnum` runs
  `cleanStr` (`ingest.ts:188-191`, `"" → undefined`), so a **missing column** (`undefined`)
  and a **blank cell** (`""`) **both resolve to `undefined`** → inserted as `taxRegime:
  undefined` (`ingest.ts:696`) → the DB default `"new"` fills in. The two cases are
  **indistinguishable in the code** — this constrains what any fix can even do.
- **Nothing warns.** No regime warning in the run path (`payroll-run-aggregates.ts`,
  `payroll.ts`), and none is structurally possible: by the time the run reads the field
  (`payroll-run-aggregates.ts:216`) the column already holds `"new"` whether chosen or
  defaulted — there is no "was-explicitly-set" marker.
- **Consequence.** A customer CSV with no regime column **silently elects the NEW regime for
  the entire workforce** — a statutory election filed on **Form 24Q and Form 16**. NEW
  disallows HRA/80C/24b, so anyone who would elect OLD is taxed on the wrong basis. **Fires at
  onboarding, on the importer just built.**
- **The sibling defaults, verified.** `isMetroCity` default `false` (`hr.ts:149`) → non-metro
  40% HRA cap → **over-deducted** TDS for an unset real-metro renter. `gender` NULL → male PT
  set (`statutory-deductions.ts:592`, female set requires exactly `"female"`) → **over-deducted**
  PT for an unset Maharashtra woman. Both err toward over-deduction (safe/recoverable), unlike
  regime.
- **Status: OPEN — product decision, owner's to make.** What the importer should do with a
  missing/blank regime (reject, force a choice, warn-and-default, …) is **not** decided here and
  must not be decided in code without the owner.

### INERT-ALLOWANCES — three configurable fields the compute ignores

- **Written / editable, read nowhere.** `bonusAnnual`, `medicalAllowanceAnnual`,
  `conveyanceAllowanceAnnual` are declared (`hr.ts:109-111`), written by the salary-structure
  create/update router (`payroll.ts:794-796, 893-895`), and editable in the payroll UI
  (`apps/web/src/app/app/payroll/page.tsx:731-758`). They are **read nowhere in the compute
  path** — the run mapper (`payroll-run-aggregates.ts`) never references them; the persisted
  payslip **hardcodes** `medicalAllowance: "0"`, `conveyanceAllowance: "0"` (`payroll.ts:489-490`).
- **What happens to the money (the ambiguity that sets severity).** `computeGross`
  (`payroll-cycle.ts:269-277`) makes **gross = `(ctcAnnual + ltaAnnual)/12`**; special allowance
  is the residual `max(0, ctc/12 − basic − hra)` (`payroll-run-aggregates.ts:173`). The three
  columns **never enter gross**. So:
  - Read as a **breakdown of CTC** → the money is still paid (absorbed into special allowance)
    and only **mislabelled** on the payslip.
  - Read as **on top of CTC** — which is exactly how the neighbouring `ltaAnnual` behaves, added
    on top at `payroll-cycle.ts:267` — → every employee is **underpaid** by
    `(medical+conveyance+bonus)/12` per month.
  Which was intended is a **product question** the code cannot answer; the additive-LTA
  inconsistency is the tell.
- **Payment of Bonus Act path unreachable.** `bonus` is fed `0` (`payroll-run-aggregates.ts:236`),
  so `effectiveBonus = bonusEligible ? emp.bonus : 0` (`payroll-cycle.ts:306`) is `0` on both
  branches — the eligibility gate (`payroll-cycle.ts:302-305`) executes but is **inert**; a
  statutory bonus can never be paid.
- **Status: OPEN — product decision (breakdown vs additive) precedes any fix.** Recorded, not
  built.

---

## TAX-REGIME-DEFAULT closed — required taxRegime column on bulk import (2026-08-08)

Closes the **TAX-REGIME-DEFAULT** finding recorded in "Read-only sweep findings
(2026-08-08)". Shipped with commit `3d416c7`; committed alongside the doc
corrections (rule 6). Scope: the **importer only** — `hr.employees.create` is
deliberately unchanged (a single admin choosing through a form is choosing; the
`new` default is fine there).

- **TAX-REGIME-DEFAULT is now closed.** The importer refuses a file with **no
  taxRegime column** outright (whole request rejected, nothing processed); a
  **blank cell in a present column** is a named row skip ("taxRegime is blank —
  enter one of: old, new"), distinct from the invalid-value skip. **Neither can
  reach the database default** — the silent NEW-regime election for a whole
  workforce is no longer possible from a missing spreadsheet header.

- **Architectural finding (constrains anything similar later).** The shared CSV
  modal **drops blank cells before sending rows**, so a **missing column and an
  all-blank column are indistinguishable server-side** — from `rows` alone the
  mutation cannot tell them apart. **Column presence now travels to the mutation
  as an explicit input** (`columns: string[]`, the header keys present in the
  file). Any future importer that needs to enforce a **required column** inherits
  this constraint and must do the same — a row-level check cannot substitute,
  because the blank-vs-absent distinction is already gone by the time rows reach
  the server.

- **`CsvImportModal.onImport` now takes a second argument** carrying the
  present-column list (`{ presentColumns }`). **Backward compatible** — existing
  callers that take one parameter still typecheck (a narrower function is
  assignable to the wider type) — but **vendors and CRM now receive a value they
  ignore**. New callers that need column presence read it.

- **`isMetroCity` and `gender` remain optional-with-default deliberately.** Both
  err toward **over-deduction, which is recoverable**; the **regime election is
  not**. They were considered and left as-is on purpose — only `taxRegime` was
  promoted to a required column.

---

## Dead controls & links + route-integrity guard (2026-08-08)

Frontend only — no engine, router, migration, or statutory path. A read-only sweep found
dead internal links and handler-less controls; this pass fixes them AND closes the reason
they accumulated.

### THE HEADLINE (record this, not the individual links)

**Nothing in the repository verified that an internal link resolves.**
`route-permissions.test.ts` checks RBAC *mapping* (which module a route needs), not whether a
link's *target* exists; the Playwright specs exercise flows without crawling links. So dead
`/app/...` links accumulated undetected — the individual dead links were symptoms; the missing
guard was the defect.

**The guard (`apps/web/src/lib/__tests__/route-integrity.test.ts`).** A STATIC source check
(never runs the app): it walks `apps/web/src`, extracts every internal `/app/...` target from
**JSX `href=`**, **object `href:` config**, and **`router.push()` literals**, and asserts a
matching `…/page.tsx` exists on disk. Dynamic segments match `[param]` dirs
(`/app/financial/invoices/${id}` → `financial/invoices/[id]/page.tsx`). It **fails the build**
the moment a link points at a page that does not exist, naming the **file, line, and target**.

**Proven to fail, not assumed to work.** A known dead path was reintroduced and the test named
`components/workbench/finance-ops/page-content.tsx:39 → /app/finance/invoices/${inv.id}` before
going green on restore.

### The dead controls & links fixed or removed

- **Path typos over routes that DO exist (fixed):** `finance-ops` invoice link
  (`/app/finance/invoices` → `/app/financial/invoices`); `po-kanban` PO link
  (`/app/procurement/po` → `/app/procurement/orders`); `secops/alert-stream` incident link
  (`/app/security/incidents/[id]` → `/app/security/[id]`, the real incident-detail route).
- **Workflow-run links to a route with no bare page (fixed — found by the guard):** four links
  in `workflows/[id]/runs/[runId]/page.tsx` targeted `/app/workflows/${id}`, but
  `/app/workflows/[id]` has no `page.tsx` (only `edit/` + `runs/`). Repointed to
  `/app/workflows/${id}/edit`, the app's own convention.
- **`/app/settings` (no bare index) → `/app/admin` (onboarding wizard):** the wizard's final-step
  "Edit in Settings" pointed at a bare `/app/settings` with no page. The real settings/admin hub
  is `/app/admin` (it has the SLA-Definitions + Legal-entities tabs the wizard summarises).
- **Detail pages that were never built → now plain, non-interactive text (no 404):** `grc`
  controls, `secops` vulnerabilities, `recruiter` offers, `company-secretary` meetings,
  `hr/[id]` "Full Employee Record", `performance` review-form (`href="#"`). Styled non-interactive
  — NOT a "coming soon" tooltip (a promise is how this defect class started).
- **Handler-less controls removed:** the `coa` chart-of-accounts hover chevron (no `onClick`,
  and no per-account view to wire it to) and the `hr/[id]` "Access Control Settings" button.

### Implementation facts (before anyone edits the guard)

1. **The app's primary nav defines hrefs as CONFIG OBJECTS (`href:`), not JSX literals** — the
   sidebar (`lib/sidebar-config.ts`), command palette, and quick-actions. A JSX-`href=`-only
   check would have missed the entire sidebar. The guard scans object `href:` too.
2. **One exclusion, and it must stay minimal.** `app-header.tsx:160 → /app/${firstPageSlug}` is a
   breadcrumb whose slug is `segments[1]` of the *current* pathname (only rendered when it maps to
   a known section) — always a real route by construction, but a runtime value not resolvable to a
   file statically. The exclusion list requires a per-entry comment and a `no-stale-exclusions`
   test fails the build if an exclusion stops matching a currently-dead link. Keep it at one.
3. **The first scan returned 340 false positives from a resolution bug — caught BEFORE the test was
   written.** The initial pass mis-resolved dynamic segments / route groups and flagged ~340 live
   links as dead. Had that shipped, the guard would have been disabled as noise. It was fixed so the
   test's baseline is a true zero. Lesson for anyone editing the resolver: re-validate the
   false-positive count against known-good links before trusting a red result.

### The gap the guard does NOT cover (recorded)

The marketing-footer stubs (`src/app/page.tsx`: Privacy Policy, Terms of Service, and the
Platform/Support columns) are `href="#"`, not `/app/...` targets, so the guard does not flag them
— deliberately left (a fabricated privacy policy on a governance product is worse than an empty
link; they get written before the site is public).

---

## Onboarding wizard — what it actually does (2026-08-08 read-only mapping)

Recorded because nobody on the team could describe it. Read-only mapping; no code changed.

### "Onboarding" names THREE unconnected things
1. **Tenant/company setup** — the customer-facing wizard at `/app/onboarding-wizard`.
2. **Employee creation** — a separate HR area (`/app/hr`) with THREE creation buttons.
3. **A document-collection case** — `hr.onboarding.createOnboarding`, labelled "Onboarding process".

They do not connect. **The wizard sets up the company and creates NO employees.** A customer
who finishes it has an **empty, unpayable workforce, and nothing tells them.**

### The wizard is 7 steps, per-step save, not mandatory
Welcome → Company Profile → India tax setup → Invite Team (a "Skip for now" dead-end) → Support
SLA → Finance (seed + `completeWizard`) → Done. Data steps save on Continue (`saveWizardData`);
re-entry resumes at the furthest step (`GREATEST`). **`completeWizard` takes empty input and
validates nothing** (`onboarding.ts:182-194`) — "complete" = `onboardingStep 7` + a timestamp.
Nothing blocks the rest of the app on wizard completion. **Step 6 advances to Done even when the
finance seeding errors** (`onboarding-wizard/page.tsx:664-671`). VERIFIED.

### THE SEVEN-ITEM GAP between "wizard complete" and "can run a correct payroll"
None of these appears on the post-wizard checklist, which instead suggests **logging a ticket and
raising an invoice** (`onboarding.ts:110-141`):
1. Add employees (the wizard creates none).
2. Assign each a salary structure (else excluded from the run, flagged only at run time).
3. Set each employee's **state** (else the run throws for that employee).
4. Set each employee's **tax regime** (else silent `"new"` on the add-employee path).
5. Set each employee's **PAN**.
6. Create the salary structures themselves (the wizard doesn't; they carry the `basicPercent`
   default 40 and the three inert allowance fields).
7. Set the **ESI establishment number** (optional in the wizard, needed for the ESI challan).
VERIFIED for 1–5, 7; 6's "wizard doesn't create structures" VERIFIED.

### THE LABELLED TRAP
The **"Onboarding process"** button (`hr.onboarding.createOnboarding`, `hr.ts:1112-1121`) creates
a `status:"active"` employee with **no state, no salary structure, no tax regime, no PAN** — it was
built to collect documents. It sits beside "Add Employee" on the same HR page. **An admin adding a
new hire will press it.** The record it makes is either **dropped from payroll** (no structure →
"will not be paid" warning at run time) or, once given a structure but no state, **throws and blocks
the run** ("Employee has no state on record"). VERIFIED firsthand.

### Three employee-creation paths of UNEQUAL strength (same HR page, three buttons)
- **`ingest.importEmployees`** — strongest: **state required, salary structure required** (by name,
  ambiguous → row skip), **taxRegime required** (column + per-row, `3d416c7`), email/name required,
  PAN optional+encrypted.
- **`hr.employees.create`** ("Add Employee") — middle: state required; **taxRegime still defaults
  silently to `"new"`**; `salaryStructureId` optional (null → excluded from payroll).
- **`hr.onboarding.createOnboarding`** ("Onboarding process") — weakest: nothing required (the trap).
VERIFIED.

### The fresh-org pilot test proves almost nothing about onboarding
`fresh-org-pilot.test.ts` asserts signup seeds a COA and that two dashboards return `null` (not
fabricated numbers) and the checklist derives 1-of-4. It **runs no wizard, creates no employee by
any path, runs no payroll, sets no statutory field, asserts no money value.** A pass says the flow
starts, not that onboarding works. VERIFIED (full file read).

### Broken wire + stored-but-unread wizard fields
- **Form 16 employer TAN/PAN/address read `org.settings` JSON** (`form16-aggregator.ts:118-122`),
  which nothing populates; the wizard writes the `organizations.tan`/`.pan` COLUMNS. **Correct entry,
  still prints a dash.** (Form 16 is HR-preview only today, which softens it.) VERIFIED.
- **`organizations.primaryStateCode`** — a required wizard field read by **no filing** (GST uses the
  `gstinRegistry` copy of the state code; `primaryStateCode` is read only by the wizard read-back +
  super-admin display). VERIFIED.
- **EPF establishment code** — required in the wizard, reaches **only the payslip**; the ECR
  generator that would consume it is dead code (0 callers). VERIFIED.

---

## Document & storage sweep (2026-08-08) — "no file upload" is FALSE (the 3rd doc defect today)

**Correct the standing claim first.** "No file upload anywhere in the product" has appeared in every
QA kit since v1.0 and is **FALSE**. This is the **third documentation defect found today in the
dangerous direction** (after the 50% wage-floor "not wired" claim and the PAN-audit "not run" claim).
What actually exists: an S3 service (`services/storage.ts`), a `documents`/`document_versions`/
`documentAcls` schema storing object keys, a virus-scan worker, a retention worker, and **six wired
upload paths**. VERIFIED (imported + called).

Then the truth, in three layers:

**Layer 1 — ~6 surfaces genuinely store bytes, and ALL SIX FAIL IN PRODUCTION.** DMS `documents.upload`,
Form 16 PDF, payslip PDF, avatar, procurement PO document, e-sign key. The deployed stack composes
**`docker-compose.vultr-test.yml`**, which ships **no object-storage service** (verified at
`vultr-remote-deploy.sh:57`; services are web/api/caddy/postgres/redis/meilisearch/dpdp-sweeper).
**`docker-compose.prod.yml` DEFINES MinIO but is referenced by nothing — an orphan.** So every upload
throws a connection error in prod. Uploads ride **base64-over-tRPC** (25 MB cap); `@fastify/multipart`
is a declared-but-unregistered dependency. VERIFIED.

**Layer 2 — ~14 surfaces present a document capability that stores NOTHING even in a working env.**
Record two by name because they are the worst, and both are the **"reports doing something it did
not do" class** — same as the ESI payslip and the PAN ciphertext:
- **The Employee Documents tab "Download" button is a toast with no file behind it** —
  `onClick={() => toast.success("Downloading …")}` (`hr/page.tsx:2878`). VERIFIED firsthand.
- **The HR onboarding "Upload" handler keeps the filename and discards the bytes** —
  `setForm({ educationDocs: file.name })` (`hr/page.tsx:800`); the column is `text`. An HR user
  uploading a document during onboarding gets a **success state and nothing stored**. VERIFIED firsthand.
  (Others: asset docs use a `mock/` storageKey + `mockhash`; GRC evidence is a typed string; expense
  receipts are URL/filename; filing acks are numbers; DPDP consent is a version string; GRN/minutes/
  legal/performance are references; `logoUrl`/`ecrFileUrl`/`challanFileUrl` are dead columns with no
  writer — all VERIFIED.)

**Layer 3 — FIVE statutory retention obligations have NO field at all.** In each the engine grants
the relief and holds no evidence: (1) rent receipts + landlord PAN above ₹1,00,000 annual rent,
(2) Form 12B (prior-employer proof), (3) Chapter VI-A (80C…) investment proofs, (4) Form 10-IA +
armed-forces evidence for the PT exemptions, (5) EPFO Para 26(6) joint declaration. VERIFIED.

**One piece of good news:** there is **no local-disk fallback** — `storage.ts` only ever sends to the
S3 endpoint, so uploads **fail cleanly rather than being silently lost** on the current stack. And
`vultr-remote-deploy.sh` runs `docker compose down` **without `-v`**, so a named volume WOULD survive a
redeploy if one existed. VERIFIED.

**Infra fact (recorded):** a **Vultr Object Storage bucket has been provisioned (Standard, Bangalore)**
and is **deliberately NOT yet wired** into the production environment. So the backend now exists at the
provider; the remaining work is pointing prod's `S3_*` at it and adding the storage service to the
deployed compose. (Decision, not a gap — the wiring is intentionally deferred.)

---

## ONBOARD-DOC — pre-account joining-document portal (roadmap item, post-go-live)

Recorded with the decisions already taken. **Post-go-live.**

- **What.** A portal where a **new recruit uploads joining documents BEFORE they have an account**,
  with access scoped across **HR TA, HR BP, hiring manager, and the employee**.
- **Documents stored:** mark sheets (10th, 12th, graduation); **offer letters and the last three
  months' payslips from the previous two employers**; relieving letters; appraisal letters; resume;
  photograph; internship certificates (freshers). **Note: the prior-employer offer letters + payslips
  ARE Form 12B in substance** — the prior-employer income the engine currently accepts as **bare
  numbers with nothing behind them** (ties to the Layer-3 retention gap above and C1).
- **Identity is VERIFIED, NOT STORED — DECIDED.** Aadhaar and PAN are **sighted in person by HR**, who
  records **that** they verified it and **when**. No stored scan, no verification provider, no OTP flow.
  **Do NOT build an upload slot for an identity document.**
- **Candidate information sheet** collects the fields the importer currently makes HR type: **full name
  as per Aadhaar** (must match the PAN for TDS to reconcile), date of birth, gender, PAN, permanent
  address, joining date, emergency contact.
- **Prerequisites (all NET-NEW):** no authenticated-external path for a non-user exists; the employee
  portal is read-only. The tokenised pattern exists for DATA (public survey links `/survey/[token]`,
  invite acceptance) but **carries no bytes**, and **no multipart parser is registered**. So a
  non-user byte-upload path is entirely new plumbing.

---

## Import preview truncation (2026-08-08, recorded — NOT fixed)

The employee bulk-import preview shows only the **first 10 of up to 200 rows**, so validation errors
scattered through a large file **cannot all be seen** before committing. What a customer would want is
a **downloadable rejection report** (every skipped row + reason). Recorded as an onboarding-usability
gap; not built. INFERRED (behaviour observed; exact row cap to re-confirm at build time).

---

## Payroll employment-status widening + ECR verification (2026-08-09)

Payroll-run correctness pass. No migration, no frontend.

### Status widening — anyone employed during the period is paid

Both run paths filtered `status = "active"`: `computePayrollRunTotals`
(`payroll-run-aggregates.ts:274` payment join, `:287` structure-less flag) and
`computePayslips` (`payroll.ts:410`). A `probation` or `on_leave` employee got **no payslip,
no total and no flag** — silently unpaid. Fix: a shared
`PAYROLL_EMPLOYED_STATUSES = {active, probation, on_leave}` drives all three selects; leavers
(`resigned`/`terminated`/`offboarded`) stay excluded pending a full-and-final path (below).
`on_leave` is PAID like active — the status is employment; paid-vs-unpaid leave is an
attendance-driven LOP computation, NOT this status (so the filter is widened, not blindly).
Tests: `payroll-employment-status.test.ts` (probation paid identically to active; on_leave paid;
the createOnboarding shape still excluded + flagged; active unchanged). Red-before proven
(revert to `active`-only → probation/on_leave excluded). Full payroll regression + `pnpm lint` green.

- **Correct-forward, not a live fix.** No product path sets `probation`/`on_leave`: create /
  importer / createOnboarding write `"active"`, offboarding writes `"offboarded"`, the edit form
  (`hr.employees.update`) has no status field. Only `seed-smb-analytics.ts:182` writes those. So
  no pilot is exposed today; the widening is robustness for when a status-change feature lands.
- **Structure-less flag message CORRECTED** (`payroll-run-aggregates.ts`): it now names EVERY
  missing field (structure AND state), not just the structure — so an admin following it can't
  produce a payable row with no state and a defaulted regime. `payroll-structureless-warning.test.ts`
  matcher updated to the new wording.

### ⚠️ LEAVER GAP — OPEN, payroll-blocking

No full-and-final / settlement salary path exists (only gratuity settlement, separate). A
`resigned`/`terminated`/`offboarded` employee stops being selected — no final payslip for days
worked. Code on Wages: settlement within two working days of exit. The proper fix is date-range
run selection (`startDate`/`endDate` exist on `employees` and the run consults NEITHER) plus a
pro-rata policy. Must be closed before a pilot has a mid-month leaver.

### ECR verification — DUP-1 `#~#` claim CONFIRMED; delimiter was never the defect

**DUP-1's status-table note ("the `#~#` ECR formatter was extracted verbatim") is CONFIRMED
correct against the code** — that row had been doubted. The LIVE ECR path is `formatECRFile`
(`apps/api/src/lib/india/ecr-format.ts`), `#~#`-delimited, reached by `hr.payroll.generateECR`
(`hr.ts:1662`) and `india-compliance.filing.submit` (`india-compliance.ts:733`). The
`|`-delimited `generateECR` in `packages/payroll-math` is DEAD (only
`india-payroll-engine.test.ts:617` calls it) — CONTEXT open-question 7 was wrong to call it
"live"; **do not repoint the live path at the `|` generator (it would break a working delimiter).**

**The real ECR defects (deferred — first PF return due the 15th of the month after the first
run):** member name emits `emp.employeeId` not the person's name (`hr.ts:1646`,
`india-compliance.ts:719`); field 9 (EPF-EPS difference) emits the FULL employer PF
(`slip.pfEmployer`) not the 3.67% difference (`hr.ts:1653`); NCP days is hardcoded `0` while
`lopDays` is on the row (`hr.ts:1654`); the header uses a fabricated `EPFO_${org.id...}` and
ignores the real `organizations.epfCode` (`hr.ts:1660`); no pre-generation validation of the
three EPFO reject invariants (EPF ≤ gross, EPS ≤ EPF, EDLI = EPF capped ₹15,000).

### STATE-ON-RUN — SETTLED (it was never two readings; it was two different inputs)

The earlier "unresolved contradiction" over `payroll-run-aggregates.ts:187-192` (now shifted to
**:212-217**) is settled. It was never two readings of one input — it was **two different inputs**:

- **Structure + EMPTY/null state → `buildEmployeePayrollInput` THROWS** at
  `payroll-run-aggregates.ts:214-217` (`if (!state) throw`), before any PT computation.
  - In `computePayrollRunTotals` the throw is **caught per-employee** (`:482-486`,
    `catch (e) { errors.push({ employeeId, message }) }`) and the run **continues**.
  - In `computePayslips` it is **NOT caught** (`payroll.ts:447-449`: the loop calls
    `buildEmployeePayrollInput`/`computeEmployeePayslip` with no try/catch), so it **propagates out
    of the `db.transaction` (`payroll.ts:434`) and the ENTIRE payslip write rolls back.**
- **Structure + a NON-EMPTY but UNRECOGNISED state (e.g. a misspelling)** passes the `!state` guard
  (the string is truthy), computes **₹0 PT via the unknown-state path** (F-PT-NIL), and is **warned +
  counted** — the run does not throw.

**Record as a LATENT CRASH:** the uncaught write-path throw is unreachable through today's create
boundary (state is required there) and there are **0 such rows on dev** — but a single
structure-without-state row would **fail an entire payroll write**. Note the trap: the structure-less
flag advises "assign a salary structure," which on a `createOnboarding` row (no state) produces
**exactly this shape** (structure present, state absent) → the next run's payslip write throws. See
ONBOARD-BTN in the Deferred register.

---

## 50% PF wage base — the mandate (2026-08-09)

**Statutory requirement, not a product decision** — recorded because it had never been written down,
which is why the engine was built to a different reading. The map-level version is in
`docs/CONTEXT.md` → "THE 50% PF WAGE BASE — THE MANDATE".

_**Re-verify the `file:line` references below — do not trust them.** They were first written against a
tree with uncommitted changes and have **already drifted once** (the `payroll-run-aggregates.ts`
numbers moved when the leaver block landed above them). Corrected against THIS commit's tree here._

**The mandate.** The PF statutory wage base is **EXACTLY 50% of total remuneration — a fixed figure,
not a floor.** The client chooses the composition (basic alone, or basic+DA): DA at 10% ⇒ basic 40%,
sum 50%; no DA ⇒ basic 50%; elected components above 50% **come down** to 50%. **PF computes on 50%
regardless of composition.**

**What the engine USED TO do — a one-directional FLOOR (wrong upward; clamp SHIPPED in this commit).**
`calculateLabourCodeWageBase` (the function now begins at `statutory-deductions.ts:812`; base line
`:825`) **used to** compute `addBack = max(0, exclusions − total/2)`, `statutoryWageBase = core + addBack`
— that pre-clamp `core + addBack` expression is **no longer in the file**; it is quoted here as history.
`max(0, …)` ⇒ **only adds**; a core above half passed through unclamped. No downward clamp anywhere on
the path (`payroll-cycle.ts:322-324` → `computeMonthlyStatutory` `:345` → `computePF` `:723`); the sole
limit was `min(basicPlusDA, 15000)` (`:225-227`). **Verified case** — total 20,000 / basic 12,000 (60%) /
HRA 4,000 / special 4,000: the pre-clamp engine base **12,000 vs mandate 10,000**; employee PF **1,440 vs
1,200**; employer **1,560 vs 1,300**. Masked above the ₹15,000 ceiling ⇒ bit only **below ~₹30,000
total**. **FIX SHIPPED AND LIVE** (commit `62b0349`, CI run `31298132260`, terminal `Deploy to Vultr`
job `success`, 2026-08-09): the base line now reads
`statutoryWageBase = Math.round(Math.min(core + addBack, halfOfTotal))` (`statutory-deductions.ts:825`) —
exactly half whether the core sits below or above it; covered by `labour-code-wage-base.test.ts`.

**The exclusion set (corrected).** A **hardcoded seven-term sum** at `payroll-cycle.ts:314-321` — HRA,
special allowance, LTA, overtime, arrears, bonus, other earnings — core is `basicEarned` **alone**.
**Arithmetic, not configuration**: changing it is a code change. `calculateLabourCodeWageBase` gets two
scalars and knows nothing of their composition. The run **zero-feeds** four terms —
overtime/arrears/bonus/other-earnings (`payroll-run-aggregates.ts:259-262`); the other three are
**structure-fed** — HRA and special allowance always, and **LTA whenever the structure sets `ltaAnnual`**
(`ltaEarned = round(ltaAnnual/12 × lopFactor)`, `payroll-cycle.ts:267`, summed at `:317`). So the real
bucket is **HRA + special allowance, plus LTA when `ltaAnnual` is set** — not "HRA + special allowance"
alone; special is the **lumped residual** `max(0, ctc/12 − basic − hra)` (`payroll-run-aggregates.ts:198`)
— a real reimbursement and the balancing figure are indistinguishable. **One base drives FIVE
contributions** — PF employee, EPF, EPS, EDLI, admin (`statutory-deductions.ts:224-236`); a wrong base is
five wrong numbers.

---

## DEFERRED REGISTER — found and consciously NOT fixed (standing section, 2026-08-09)

The running list of things found and deliberately left, so the next session inherits them. Each: what
it is, where, why deferred. Add to this rather than letting a deferral live only in a chat.

- **ECR-FIELD** — the live ECR (`formatECRFile` / `hr.payroll.generateECR`, `hr.ts:1646-1660`) has real
  content defects: member name emits `emp.employeeId` not the person's name (`hr.ts:1646`); field 9
  emits the FULL employer PF (`slip.pfEmployer`) instead of the EPF−EPS 3.67% difference (`hr.ts:1653`);
  NCP days hardcoded `0` while `lopDays` is on the same row (`hr.ts:1654`); header uses a fabricated
  `EPFO_${org.id…}` id and ignores `organizations.epfCode` (`hr.ts:1660`); no validation of the three
  EPFO reject invariants (EPF ≤ gross, EPS ≤ EPF, EDLI = EPF capped ₹15,000). **Deferred:** first PF
  return is due the 15th of the month after the first run — before then it does not file.
- **ECR-TEST** — `india-payroll-engine.test.ts:617` pins the delimiter on the **DEAD** `|` generator;
  nothing tests the live `#~#` path. Rides ECR-FIELD.
- **WAGE-DA** — no DA component exists, so the basic-plus-DA composition the mandate allows **cannot be
  expressed**. Blocking if any pilot pays DA. Gated on the customer questions.
- **WAGE-CFG** — the 50% mandate is enforced at **compute time only**. A client can configure a
  non-compliant structure (`basicPercent` has no floor/cap — `hr.ts:106`, `payroll.ts:776/844`), see it
  on a payslip, and never be told.
- **LWD-INTAKE** — **no last working day is captured anywhere.** `employees.endDate` is declared
  (`hr.ts:274`) and **never written** by any path (create/update/importer/offboarding — offboarding
  completion sets only `status:"offboarded"`, `hr.ts:1278`; **0/9 dev rows** have `end_date`);
  `offboardingDetails` has no last-working-day column (`hr.ts:1003-1007`). So the system **cannot compute
  a leaver's paid days.** The follow-up that would both pay leavers pro rata and bound the leaver flag
  (see the LEAVER GAP section). Payroll-blocking for the first cycle with any mid-month leaver.
- **FF-STATUS** — `offboardingDetails.ffStatus` (`hr.ts:1007`) is a manual text field, written on the
  offboarding form and read only to render a status badge (`hr/page.tsx:2476`). **Nothing computes a
  full-and-final settlement from it** — the settlement capability does not exist.
- **JOIN-PRORATE** — joiner pro-ration is **attendance-driven, not date-driven**
  (`buildEmployeePayrollInput:189` — absent an attendance record the month is treated as fully paid).
  So a **mid-month joiner with no attendance record is paid a FULL month.** There is no date-based
  mechanism to reuse for leavers either. **Unverified beyond this one read** — confirm before acting.
- **STATE-UNKNOWN** — a non-empty but misspelled state passes the `!state` guard and computes **₹0 PT**
  via the unknown-state path (F-PT-NIL), warned + counted (`payroll-run-aggregates.ts`). See STATE-ON-RUN.
- **ONBOARD-BTN** — the "Onboarding process" labelled trap (`createOnboarding` makes an active,
  structure-less, state-less employee). The coherent fix (b) needs a new `employee_status` value
  ("onboarding"/"pre_hire") the run's selection excludes ⇒ **a migration** ⇒ **dev DB must be brought to
  head first** (~14 behind). Note: `ALTER TYPE … ADD VALUE` **cannot run in the same transaction that
  uses the value** on Postgres, and Drizzle wraps migrations — so the add-value and its first use must be
  separate migrations. Deferred pending dev-DB-to-head.
- **ADD-EMP-STRUCT** — `hr.employees.create` also permits a **structure-less active employee**
  (`salaryStructureId` nullable/optional, `hr.ts:279`). Same root as the trap, smaller radius — the run
  flags it (not silent). Deferred with ONBOARD-BTN.
- **PROBATION-REACH** — no product path writes `probation` or `on_leave`; only `seed-smb-analytics.ts:182`
  does. The payroll-status **widening** shipped 2026-08-09 (`PAYROLL_EMPLOYED_STATUSES`) is
  **correct-forward robustness, not a live fix** — no pilot is exposed today. See the correction of
  record below.

---

## CORRECTION OF RECORD — reachability before severity (2026-08-09)

Recorded so the next session knows why the rule exists. The `probation`/`on_leave` payroll-exclusion was
framed as **the largest money defect on the board**, on reasoning about how Indian SMBs employ people
(new hires sit on probation and would go unpaid) — **without first establishing reachability.** In fact
**no product path writes those statuses** (only the analytics seed does), so a build pass went to a
defect **no product path can trigger.** The widening is still correct as forward robustness, but the
severity ranking was wrong. **Standing rule, now in force: establish REACHABILITY before assigning
SEVERITY.** A defect no code path can produce is not the top of the board, however plausible the
real-world story.

## PAYROLL-APPROVAL-DEADLOCK — launch-gate; SHIPPED `3bf2bf7` (2026-08-09)

**Status: SHIPPED & DEPLOYED — commit `3bf2bf7`, CI run `31317164831` (all five jobs green incl.
terminal Deploy to Vultr), live on `connect.coheron.tech` 2026-08-09.** This was a launch-gate
defect: **no combination of non-owner roles could complete the
HR→Finance→CFO payroll approval chain**, so step 13 and every statutory output (PF ECR, ESI challan,
PT challan, TDS) was unreachable. `payroll.runs.approve` gates FINANCE/CFO on `financial.write` and HR
on `hr.write` (`apps/api/src/routers/payroll.ts:587`), with SoD by identity (`:604-616`). `hr_manager`
holds `payroll.read` not `financial.write`; `finance_manager` the reverse; only the owner holds both,
and SoD forbids one identity doing two steps → empty intersection → chain uncompletable.

**Four gate layers had to be reconciled — fixing one was not enough:**
1. Server `payroll.runs.list`/`get` — were `permissionProcedure("payroll","read")`; now
   `anyPermissionProcedure([["payroll","read"],["financial","write"]])` (read-surface OR). *(found: static)*
2. Route guard — `/app/payroll` gated on `canAccess("payroll")`; now also admits a `financial.write`
   holder via `resolveRouteReadAlternatives` (`apps/web/src/lib/route-permissions.ts`). *(static)*
3. Page inline gate — `if (!can("payroll","read")) return <AccessDenied/>`; now
   `payroll.read || financial.write`, and **moved to after all hooks** (see RULES-OF-HOOKS below). *(live)*
4. Per-step Execute button — a single `can("hr","write")` gated *every* step incl. Finance/CFO; now the
   Finance/CFO steps gate on `financial.write`, others unchanged. *(live)*
5. Generated `TRPC_PROCEDURE_RBAC` map — `mergeTrpcQueryOpts` (`rbac-context.tsx:213`) disabled the
   `runs.list` query client-side because the map still said `{payroll,read}`; the query never fired.
   Fixed by teaching the generator about `anyPermissionProcedure` and regenerating. *(live — see RBAC-MAP-DRIFT)*

Layers 1–2 were visible by static reading; **3, 4 and 5 only surfaced by driving it live** (a green full
suite did not reveal 3/4/5). **The approve action's permissions, the SoD check, and the RBAC matrix were
NOT changed.** Proven: finance@ (previously bounced with "Access Restricted") completed the Finance
approval through the UI (`FINANCE_APPROVED`, `approved_by_finance_id=finance@`); an integration test
(`apps/api/src/__tests__/payroll-approval-gate.test.ts`) drives the full chain to `CFO_APPROVED` with
three distinct identities. Full suite 1,535 tests, lint 9/9. Evidence: `docs/audits/…stage4-chain_*`,
`…stage4-chain-corrigendum_*`, `…stage5_*`. **DONE (shipped `3bf2bf7`). Remaining follow-up: reach
step 13 and verify the statutory outputs on real data — Stage Six (STEP-13-UNREACHED, below).**

## RBAC-MAP-DRIFT — generated map silently diverges from the procedures (2026-08-09, its own finding)

`apps/web/src/lib/trpc-procedure-rbac.generated.ts` is generated from the procedure definitions
(`scripts/generate-trpc-rbac-map.ts`) and gates client queries via `mergeTrpcQueryOpts`. It had **not
been regenerated after the procedures changed**, so it disabled a query the server would have allowed
(the deadlock's layer 5). Regenerating also **picked up two procedures the stale map was missing entirely**
(`financial.createCreditDebitNote`, `ingest.importEmployees`). **Nothing detects this drift**: a change can
pass the full suite while the client silently refuses to call the procedure. **OPEN (class):** consider a
CI check that fails if the committed map differs from a fresh regeneration.

## RULES-OF-HOOKS early-return — latent, surfaced by the fix (2026-08-09)

The payroll page's permission gate was an **early `return <AccessDenied/>` sitting between hook calls**.
It never crashed because the condition could not flip for the roles that reached it. Once a `financial.write`
holder could pass, the hook count changed between renders → "Rendered more hooks than during the previous
render" crash. Fixed by moving the gate **after all hooks**. **OPEN (class):** the same pattern (a
permission early-return before later hooks) may exist on other pages; nothing surfaces it until a
condition flips. Worth a sweep.

## Runtime-audit findings that change the board (2026-08-09) — evidence in `docs/audits/`

- **DUP-PAN-ACCEPTED — OPEN, statutory.** Two employees now share one PAN; the create path accepted it
  with no warning. Cause: PAN is encrypted with a **per-row IV**, so ciphertexts differ for the same
  plaintext → a unique index cannot catch it, and the create path does **no plaintext pre-check**. It
  surfaces at **TDS reconciliation on the return (Form 24Q / 26AS), not at entry.** Evidence:
  `…stage3b-build_*`, `…stage4-payroll_*`.
- **STRUCTURE-NOT-EFFECTIVE silent drop — OPEN.** An employee whose salary structure's `effective_from`
  postdates the run's period start is **dropped from the run silently** — headcount went **12→11 with no
  error naming who** (`resolveSalaryStructureForPeriod` returns none → skipped). Evidence: `…stage4-payroll_*`.
- **STEP-13-UNREACHED — runtime coverage gap.** PF ECR, ESI challan, PT challan and TDS output surfaces
  have **never been reached in any runtime pass** (Stage Two stopped at step 9; Stage Four/Five blocked by
  the deadlock then by lack of a third `financial.write` identity). Their contents are unverified at runtime.
- **FORMS-REFUSE-WITHOUT-MESSAGE — one finding, one cause.** The wizard's malformed statutory IDs and the
  employee form's empty submit are refused by **native browser validation only, with no app-level message**.
  Single cause; not several findings. Evidence: `…stage2_*`, `…stage3_*`.
- **EMPLOYEE-FORM correction (corrects the static map).** The employee form **does** collect **state, tax
  regime and PAN** — they render once a salary structure is selected, and **state is required**. PAN persists
  encrypted. Evidence: `…stage3b-build_*`.
- **Wage-base clamp + PF ceiling — VERIFIED on product-created data.** One employee's PF base was **added
  back to exactly half of total**; another's **capped at ₹15,000**. But the **above-50% case has still never
  run** — no employee on a >50%-basic structure has been included in a payroll run (the one such employee was
  dropped by STRUCTURE-NOT-EFFECTIVE). Evidence: `…stage4-payroll_*`, `…stage5_*`.
- **IMPORTER + ONBOARDING BUTTON — method limit, not a product finding.** Neither could be exercised: both
  require a **native file upload the test harness cannot drive**. Every upload-dependent surface is unreachable
  by that harness. Recorded so a later pass with a file-upload-capable harness picks them up. Evidence:
  `…stage3-retry_*`, `…stage3b-build_*`.

## DEV-DB-14-BEHIND — RESOLVED (2026-08-09)

The local dev database was **14 migrations behind head** (61 applied vs journal head `0074`), which broke
login (`auth.login` 500 on the missing `organizations.esi_establishment_number`, mig 0074) until
`pnpm db:migrate` applied migs 0061–0074. **Now at head `0074`.** Cause is **operational, not a code defect:
nothing brings a local database to the journal head and nothing checks that it is there** — prod auto-applies
via the `migrator` service, so only local dev is exposed. **CLOSED.** (Operational rule added to `CLAUDE.md`:
a fresh local session should confirm the dev DB is at the journal head and `db:migrate` if not.)

## PAYROLL-READINESS + DATA-DRIVEN PROFESSIONAL TAX — SHIPPED `9f2f07c` (2026-08-10)

**Status: SHIPPED & DEPLOYED — commit `9f2f07c`, CI run `31348702370` (all five jobs green incl.
terminal `Deploy to Vultr`), 2026-08-10. Migration `0075_clever_sleepwalker`; 238 base tables.**
`9f2f07c` includes the prior `3bf2bf7` payroll-approval fix as an ancestor.

Two independent changes + a provenance discipline:

- **Payroll-readiness signal (Command Center).** `onboarding.getChecklist` returns a `payrollReadiness`
  block; the dashboard renders a "Before you can run payroll" panel naming what is missing (no employees /
  no salary structure) with links to where each is created, and the wizard's final step points at it
  instead of "you're all set". Test: `apps/api/src/__tests__/onboarding-payroll-readiness.test.ts`.
  (Origin: the Part-A runtime finding that a customer finishing setup was told they were "all set" while
  no payroll could run — see `docs/audits/web-runtime-pass_stage7_*`.)
- **Professional tax → data-driven** (`professional_tax_slabs`, mig `0075`). Moved from an 8-state
  in-code `PT_SLABS` table to a seeded **36-state** table: **22 levying, 14 recorded as explicitly NOT
  levying** — so a state with no PT (a recorded nil) is distinguishable from a state we have no data for
  (an unknown/absent row the engine flags). `resolveStatutoryCeilings` projects the computable subset into
  `overrides.ptSlabs`; **no payroll-math change** (the engine already consumed the override). RLS-walled
  (nullable-org `tenant_isolation`, matching `statutory_ceilings`). Test:
  `apps/api/src/__tests__/professional-tax-slabs.test.ts`.
- **Provenance / not-yet-verified.** Every rate is SECONDARY-sourced
  (`docs/reference/professional-tax-slabs.json`; `sourceType='secondary'`, `verifiedOn=NULL`) — verified
  against no state's own bare act yet. The provenance columns exist so every rate still on a secondary
  source can be found and confirmed later.

**Two things stated plainly (open follow-ups):**
- **Adopting the reference file CHANGED the live Kerala and Tamil Nadu rates** (both differed from the
  previous in-code slabs — e.g. Kerala's top half-yearly slab 600 → 1,250; Tamil Nadu's middle bands rose).
  These now rest on unverified secondary data and must be confirmed against the acts. Karnataka effectively
  unchanged (both exempt below ₹25,000; they differ only at exactly ₹25,000). The earlier "engine
  over-deducts KA below ₹25k" hypothesis was FALSE against the code.
- **Five levying states are recorded but cannot yet compute** — Bihar & Manipur (annual), Jharkhand &
  Sikkim (quarterly), Puducherry (half-yearly, collection timing not wired). The engine knows only monthly
  and Kerala/TN half-yearly cadences, so these are stored with full provenance but NOT projected into the
  override — the engine flags them (unknown state) rather than compute a wrong amount. Follow-up: extend
  the engine's cadence support before they can levy correctly.

**CI note:** the first push `d831441` FAILED CI on the `no-untyped-jsonb` schema guard (three new jsonb
columns — `last_period_adjustment`, `exemptions`, `due_date` — lacked `.$type<…>()`); it never deployed
(Deploy skipped). Fixed by adding open-record `.$type<…>()` typings, amend + force-push → `9f2f07c`, which
went green. Process lesson: turbo cached the API test task, so a local `pnpm test` returned a stale green;
re-run with `--force` (or run vitest directly) when a cross-package file the tests read at runtime changes.

Migration `0075` was validated against a **throwaway full-history (prod-shaped) schema** (empty DB,
`0000→0075` applied in order): all apply clean, 36 rows seeded, RLS enabled+forced. **DONE.**

## PERIOD-START-TZ-BOUNDARY — latent hazard, established read-only (2026-08-10)

**Status: NOT a live defect on the current prod stack (UTC), but a latent hazard. Recorded for a
design decision — do NOT fix in passing; a date-boundary fix touches every period comparison in
the engine.**

**What.** Every real payroll path builds the period start as `new Date(year, month-1, 1)` — a
LOCAL-time value: `computePayrollRunTotals` (payroll-run-aggregates.ts:304, and ceilings :402),
`computePayslips` (payroll.ts:422), `lockPeriod` → `computePayrollRunTotals` (payroll.ts:333),
plus payroll.ts:983. A salary structure's `effectiveFrom`, entered in the UI as a date-only
`"yyyy-mm-dd"`, is stored at **UTC midnight** (`new Date("2026-09-01")` → UTC; `z.coerce.date`;
`timestamptz` `00:00:00+00`), independent of the browser timezone.

**Why it is safe today.** The deployed stack runs **UTC** (node:20-alpine, no `TZ` in any compose
env / Dockerfile / deploy script; Alpine has no `/etc/localtime` → Node local == UTC). CI runners
are UTC too. On UTC, the period start for a September run is `2026-09-01T00:00:00Z`, which equals a
1-September `effectiveFrom`, and `resolveSalaryStructureForPeriod` uses an inclusive `effectiveFrom
<= period` — so a structure effective on the 1st IS resolved and the employee IS paid.

**Why it is a hazard.** Correctness rests on a three-way boundary equality: prod being UTC AND
`effectiveFrom` at UTC-midnight AND the inclusive `<=`. If prod were ever deployed with
`TZ=Asia/Kolkata` (plausible for an India product), the period start becomes `2026-08-31T18:30:00Z`
— 5.5h BEFORE the 1-September `effectiveFrom` — and **every** customer whose structure starts on
the 1st, running that month's payroll, gets **nobody paid** for the month (now with a named
effective-structure flag, but still unpaid). The same happens if `effectiveFrom` is ever stored at
a local-offset midnight instead of UTC. This was surfaced by the multi-version test in
`payroll-effective-structure-exclusion.test.ts`, which failed only on an IST dev machine — a test
artefact given UTC prod, but the boundary it exposed is real.

**Proposed shape (for decision, not built).** Compare on a timezone-independent basis — either
construct the period start as an explicit UTC instant (`new Date(Date.UTC(year, month-1, 1))`) or
compare date-only (calendar month), applied consistently to the resolver AND every period
comparison (ceilings, half-yearly PT windows, ESI period, LOP). Because it touches every statutory
computation, the shape is the owner's call. Until then: keep prod on UTC, and do not store
`effectiveFrom` with a local offset.
