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

**What changes.** Add a test that asserts **all three** surfaces that speak the
permission vocabulary use the **same five values** — and fails if any one of them
diverges: (1) the RBAC-matrix **UI**, (2) the **permission checker** that reads
those actions at request time, and (3) the **database enum**. Today the database
enum `permission_action` has five values — `create, read, update, delete, manage`
(`packages/db/src/schema/auth.ts:248-254`) — while the roles UI offers seven
(`read, write, delete, admin, approve, assign, close`), and even the overlap is
loose (`write` vs `update`, `admin` vs `manage`). The test locks all three lists to
the five enum values so they can never drift again.

**Reference implementation.** The pattern to copy is the existing contract-guard
tests that keep the web and API in sync (the `trpc-web-parity` /
`mutations-require-input` style guards referenced in `quality-bar.md`). This is the
same idea applied to the permission vocabulary across UI, checker, and enum.

**What could break.** The test goes red now, because the three lists genuinely
disagree. That red is what A6 (Phase 3) resolves — by collapsing the UI and checker
down to the five enum values (not by widening the enum).

**What test proves it.** Itself — add a UI action with no DB value and it fails.

**Re-run afterwards.** `auth-rbac` audit.

**Dependency.** Write before A6; A6's fix is "make this test green."

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

**Dependency.** None; independent ratchet. (Its Phase-2 partner is the B5 head-anchor
+ scheduled-sweep work.)

---

**Phase 1 exit condition:** R-1 through R-5 are committed and **red** (or landed
together with their Phase-2/3 partners). (R-5 was originally expected green on the
assumption the verifier already caught tail-truncation; verified during
implementation, it does not — so all five ratchets are red until their Phase-2/3
fixes.) From here on, every later fix has a test waiting to confirm it and to stop it
regressing.

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

**Reference implementation.** The CRM quote path already does this correctly:
`apps/api/src/lib/crm/quote-tax.ts` reads `stateCode` on **both** sides (org via
`gstinRegistry.stateCode`, account via `crmAccounts.stateCode`) and only falls back
to a name if the code is absent. Make every GST caller resolve to `stateCode` the
way `quote-tax.ts` does; `ingest.ts:115-120` (which prefers `stateName`) is the
one to change.

**What could break.** Anywhere that reads the state as a display name for output
(an invoice PDF showing "Maharashtra") must keep a code→name mapping for display —
normalise for *comparison*, not for *display*. A wrong mapping table would
mis-classify; the lookup must be the canonical GST state list.

**What test proves it.** Change the GST test so the two sides are supplied in the
**formats the live wizard actually produces** — org as code "27", vendor as name
"Maharashtra" — and assert the result is **intra-state CGST+SGST**. Today's test
(`__tests__/crm-quote-gst.test.ts`, `invoice-gst.test.ts`) fills both sides as
matching values, so it blesses the bug. Under the new standing rule, that test
**must change** as part of this fix.

**Re-run afterwards.** `gst-invoicing` audit; `sweep-tenant-constants`.

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

#### A12 — Carry wage recovery forward instead of discarding it at the floor

**What changes.** `netPay = max(0, gross − deductions)` silently discards any
recovery (salary advance, loan) that exceeds one month's pay. Fix per the
quality-bar correction: when deductions exceed gross, the shortfall **carries
forward** to the next cycle and stays visible in the employee's outstanding
balance — money must not vanish at the floor.

**Reference implementation.** `computeEmployeePayslip()` in
`apps/api/src/lib/payroll-cycle.ts` is where the floor lives; the carry-forward
should write to the outstanding-balance concept the HR module already models.

**What could break.** Payroll is the highest-consequence money path; a wrong
carry-forward is itself a money bug. Change it under the R-4-style guard and the
money-invariant suite.

**What test proves it.** The payroll test currently **asserts the floor**
(`__tests__/money-invariants.test.ts:197` checks `netPay === max(0, gross −
deductions)`), i.e. it blesses the bug. Under the standing rule this test **must
change** to assert the shortfall carries forward and nothing disappears.

**Re-run afterwards.** `payroll-tax` audit; `money-invariants` gate.

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

#### A6 — Let custom roles save (collapse the UI to the five database values)

**What changes.** The roles UI offers seven actions; the DB enum allows five
(`auth.ts:248-254`), so realistic roles fail to save. **Decision made: collapse the
UI down to the five values the database already has — do not widen the enum.** The
RBAC-matrix screen maps to exactly **Read, Create, Update, Delete, Manage** (the
five `permission_action` values). **Approve, Assign and Close are removed from the
matrix**: they are *workflow* actions, not access levels, and belong in the role
definitions in the **Role Library** (which already work) rather than in the
`permissions` table. So the fix is UI + wiring, **not** a schema change — the enum
stays as-is.

Concretely:
- Change the RBAC matrix to offer only the five enum actions (and normalise the two
  loose labels the UI used — `write` becomes `Update`, `admin` becomes `Manage`).
- Drop `approve`/`assign`/`close` from the matrix; anything that genuinely needs
  those semantics is expressed through the Role Library's role definitions instead.
- **Remove the `as any` casts at `apps/api/src/routers/admin.ts:1068` and `:1073`.**
  Those casts launder the caller-supplied `perm.action` string past the enum type
  in the role-create path — they are precisely what *hid* the mismatch and let a
  role carrying `approve`/`assign`/`close` compile and then fail (or silently
  no-op) at the Postgres enum. With the vocabularies aligned to five, `perm.action`
  is a genuine enum value and the cast is unnecessary; removing it makes the
  compiler enforce the alignment from now on.

**Reference implementation.** R-2's vocabulary test defines "correct" once all three
surfaces agree; make R-2 green. The Role Library is the existing, working home for
workflow-style role definitions — route the three removed actions there. No
migration is needed (the enum is unchanged).

**What could break.** **Any existing role or code path that references `approve`,
`assign` or `close` as a *permission action* must be rerouted to the role
definitions in the Role Library.** In the pilot's fresh instance there is little or
no such data, which is why this is cheap now — but the permission-checker call sites
must be swept for those three strings and repointed, or a check that used to look
for an `approve` permission will silently find nothing. Removing the `as any` will
turn any remaining mis-typed use into a compile error (that is the point — it
surfaces exactly the paths that need rerouting).

**What test proves it.** R-2 (Read/Create/Update/Delete/Manage on the UI, the
permission checker, and the enum all match) plus a role-create test that saves a
role using each of the five actions and reads it back — and, ideally, a negative
test that a role carrying `approve`/`assign`/`close` as a *permission* is rejected
rather than silently dropped.

**Re-run afterwards.** `auth-rbac` audit.

**Dependency.** R-2 written first. No schema migration, so — unlike the earlier
option — A6 does **not** need to batch with the RLS-wall migration.

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

#### A7 — Persist invoice line items from the real user path

**What changes.** Invoice line items (`procurement.ts:288-320`, with per-line
taxable value / GST rate / CGST/SGST/IGST) are only ever written in tests, so real
invoices carry no line detail and GST rate-grouping runs on absent data. Fix: write
line items from the real invoice-create path, not just the test fixture.

**Reference implementation.** `journal.create` (`accounting.ts:296-322`) is the
model for "insert a header, then insert its line rows in the same transaction" —
apply the same header+lines pattern to invoice creation.

**What could break.** GST per line must use the A1-normalised state key and the
correct rate; the line totals must reconcile to the invoice header (the money
invariant). Do it after A1 so the per-line GST is computed on a correct basis.

**What test proves it.** A test that creates an invoice through the real path and
asserts its line items persist and their GST sums to the header — and that
GSTR-1 rate-grouping sees them.

**Re-run afterwards.** `gst-invoicing` audit; `sweep-unreachable-features`.

**Dependency.** After A1 (canonical state key) so per-line GST is correct.

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
- **KMS legacy theme (B14, and B15 from the triage update).** Re-wrap legacy CBC
  secrets and fix "decrypt-fail reads as not-connected"; and **encrypt the
  plaintext SSO OAuth tokens** (`accounts.accessToken/refreshToken`,
  `services/oidc.ts:150-169`) through the same envelope the integration configs use
  (`encryptIntegrationConfigEnvelope`, `http/integration-oauth.ts:59`). B15 shares
  the vault/code area with the PAN encryption work — land it in the same
  encryption pass, per the triage note.
- **Test-hygiene theme — midnight-wraparound flake in the shift-schedule suite.**
  `shift-schedule-router.test.ts` builds shift start times with a `minutesFromNow`
  helper (`shift-schedule-router.test.ts:64-67`) that converts "now + N minutes"
  into **minutes-past-midnight** (`t.getHours()*60 + t.getMinutes()`). When the
  offset pushes the clock across 00:00 — e.g. the "starting later" case uses
  `minutesFromNow(120)` (`:157`), so any run after ~22:00 wraps to an early-morning
  minutes value — the computed `startMinutes` lands *earlier* in the day than the
  real current time, so a shift meant to start 2 h in the future looks already
  started and the punch is wrongly flagged `late` (expected `present`). This is a
  **time-dependent test bug, not a code defect**: the shift-aware punch logic is
  correct; the helper just can't represent a start time that crosses the day
  boundary. It fails intermittently forever (only when the suite runs late at
  night). Fix the helper (or the two call sites) so day-boundary crossings are
  handled — e.g. compare against an absolute timestamp rather than a wrapped
  minutes-past-midnight value, or skip/normalise the wrap. Test-only; no product
  code changes. _(Surfaced during B2's full-suite run, which started at 22:15 and
  tripped the wrap; reproduced in isolation at 23:08. Unrelated to B2's numbering
  changes — B2 touches no attendance/shift code.)_

---

## Dependencies at a glance

The ordering that actually matters (everything else is grouping for efficiency):

1. **R-1 → A11.** The all-tables wall test is written (red) before, or with, the
   migration that turns it green.
2. **R-2 → A6.** The permission-vocabulary test (UI = checker = enum, five values)
   is written before the roles fix that collapses the UI/checker down to those five.
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

Everywhere a fix changes a test that blessed the bug, the test change is part of
the fix (standing rule) — this is called out per item and is not a separate step.

---

_No source files were modified in producing this plan. It sequences the bucket-A
and bucket-B work from `reports/triage.md` against the root causes and reference
implementations in the codebase; the "genuinely sound" list in `audit-summary.md`
marks what to leave alone._
