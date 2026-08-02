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
| A7 — persist invoice line items | Phase 3 (A) | **Unblocked** (CA ruled: lines authoritative, header derived; ₹0.01 sum mismatch = hard error) |
| A8 — statutory challan create path | Phase 3 (A) | Pending |
| B1 — first-response clock | Phase 3 pass (B) | Pending |
| A11 — RLS wall migration (three tables) | Phase 3 (A) | **Done** (migration 0061; R-1 green) |
| A16 — logo upload | Phase 3 build | Pending |
| A15 — one document-header source | Phase 3 build | Pending |
| A17 — branded invoice / PO PDFs | Phase 3 build | Pending |
| A18 — Form 16 TRACES import | Phase 3 build | Pending — **scope expanded** (CA: parse + map + self-service publish + bulk DSC signing; upstream Form 24Q dep — see A18) |
| B16 — payslip hardcoded header | Bucket B (doc-header theme) | Pending |
| B17 — no org address field | Bucket B (doc-header theme) | Pending |
| Ownership cluster (#5) — one shared guard | Bucket B | Pending |
| Identity/session theme (B8–B11) | Bucket B | Pending |
| Automation/reliability theme (B6, B7, B12, B13) | Bucket B | Pending (B5 **Done** — folded into R-5) |
| KMS legacy theme (B14, B15) | Bucket B | Pending (H-2 PAN done; backfill owed) |
| Test-hygiene — shift-schedule midnight flake | Bucket B | **Done** (clock pinned to noon; boundary-proof) |
| A12-D — LOP split-logic defect (CA correction) | New — Payroll | Pending (against shipped A12) |
| C1 — Old vs New tax regime (s.115BAC) election | New — Payroll | Pending — **payroll-blocking** |
| C2 — Professional tax 21+ state matrix | New — Payroll | Pending — **payroll-blocking** |
| C3 — ESI six-month contribution-period rule | New — Payroll | Pending (verify first) — **payroll-blocking** |
| C4 — PF ₹1,800 ceiling (VPF / joint-declaration override) | New — Payroll | Pending (verify first) — **payroll-blocking** |
| C5 — Statutory rates → config table (effective-dated) | New — Payroll infra | Pending — deferrable (enabler) |
| C6 — Payslip mandatory statutory fields | New — Payroll | Pending — **payroll-blocking** |
| C7 — GSTR-1 structural gaps (B2B/B2CL/B2CS, HSN, state code, Tables 9 & 11) | New — GST | Pending — **GST-blocking** |
| C8 — Tolerant filing-schema parsing | New — GST/Payroll infra | Pending — deferrable (robustness) |
| C9 — Form 24Q quarterly filing (upstream of A18) | New — Payroll/filing | Pending — deferrable (gates A18, not go-live) |

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

#### A16 — Logo upload (there is no file-upload capability anywhere)

**What changes.** `organizations.logoUrl` exists
(`packages/db/src/schema/auth.ts:46`) and the payslip template already has code to
place a logo (`services/payslip-pdf.ts:158-160`), but **nothing can populate the
field**: there is no file-upload UI, no upload endpoint, and no object storage
wired for org branding anywhere in the app (an `Upload` icon is imported into the
onboarding wizard but never used). This is a **feature build**, not a patch: it
needs (a) a storage destination for the image, (b) an authenticated upload
endpoint that validates type/size and writes `logoUrl`, and (c) a branding
settings screen to drive it. Scope it as such.

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
- **C2 — Professional tax across 21+ states.** PT is a **per-state** levy with
  different slabs/amounts/frequencies. Build it as a **multi-state configuration
  matrix**, not a single-state table. The CA was explicit: **build at full scale**
  (all 21+ states), not one state now and the rest later. **Payroll-blocking** for
  any multi-state employer (PT is deducted every payroll).
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
  legacy theme (B14/B15 — H-2 done, backfill owed), schema-tooling theme (#32), RBAC
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
| **C6 — payslip mandatory statutory fields** | first payslip | **Absent** — blocking |
| **B16/B17 — org identity on documents** | first payslip | Pending (payslip header hardcoded blank) |

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
  - **PAN encryption-at-rest (H-2) — DONE for new writes; backfill still owed.**
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
