# Sweep: false safeguard comments

A sweep (not an audit) for code comments / docstrings that **assert a safeguard,
guarantee, or protection** which the code does **not** actually provide.

Method: three recon passes collected every comment claiming atomicity, idempotency,
uniqueness, locking, "never persist", "cannot race", etc. Each candidate was then
verified by reading the actual code behind it. Only the **false** ones are listed
below. The large majority of safeguard comments in this codebase were verified as
**true** and are not listed (transaction wrappers are genuinely present; PII masking,
KMS envelope wrapping, `getNextSeq` ON-CONFLICT atomicity, unique-index-backed invoice
numbers, and TOTP-secret encryption all check out).

The four already-known false comments (accounting atomic counter, migration 0052 RLS
drift detection, trpc.ts "hard timeout", client.ts pool-exhaustion detection) are
**excluded** per instruction — these are new findings.

---

## Plain English summary

Three safeguard comments claim a protection the code does not deliver.

1. **A "duplicate notifications are ignored" comment that is not true.** A helper
   that sends workflow notifications (approval outcomes, SLA breaches, on-call
   escalations) has a comment saying duplicate sends are harmless because they get
   de-duplicated. In reality the code sends unconditionally — every call writes a new
   in-app notification row and fires another email. If a workflow retries or a sweep
   ticks twice, the same person gets the same alert two (or more) times, including two
   emails. Nothing collapses them.

2. **A pair of background sweeps claim database row-locking that isn't actually in
   force.** The on-call-escalation sweep and the event-correlation sweep both say they
   "atomically claim" rows with a database lock so two workers can't process the same
   record at once. The lock they use is released the instant the initial read finishes,
   *before* the record is updated — because the read and the update are not run inside
   one database transaction. Under the normal single-sweeper schedule this is fine, but
   the comment's promise ("concurrent workers don't double-process") does not hold if two
   sweeps ever overlap (a slow tick, a retry, or a second worker). Escalation has a
   second guard that mostly saves it; event-correlation relies on the lock that isn't
   really held.

3. **The retry middleware credits an "atomic counter" that the numbered path does not
   use.** (RESOLVED — see F-3.) The mutation-retry middleware explained why it is safe
   to re-run a failed write by pointing to "the org_counters atomic counter" that
   supposedly prevents duplicate auto-numbers. But `journal.create` did not use that
   counter — it derived its number from `count()+1`. What actually stopped a duplicate
   journal-entry number from persisting was the unique index plus the retry itself
   re-running the loser. That mislabelling was fixed under B2 by routing the journal /
   DSR / breach numbers through the real atomic counter (so the comment's mechanism is
   now the one in use) and rewriting the comment.

None is an emergency. #1 is a user-annoyance / minor-cost issue (duplicate emails).
#2 is a latent correctness gap that only bites if sweeps run concurrently. #3 is a
mislabelled-mechanism comment: the protection is real but comes from a different place
than the comment claims, so a future edit that trims the retry (trusting the phantom
counter) would silently reintroduce duplicate numbers. All three matter here because
the sweep's whole point is that a reader trusts the comment: the comments describe a
guarantee (or its source) that the code does not implement.

---

## Findings

### F-1 — "duplicate sends are no-ops … the UI deduplicates" — the send is unconditional

**Where:** `apps/api/src/workflows/activities.ts:23-24` (comment) over `notifyActivity`
(`activities.ts:25-54`).

**The comment claims:**
> `Idempotent — duplicate sends are no-ops in the notification service because the UI deduplicates by (userId, resourceId, event).`

**What the code actually does:** `notifyActivity` looks up the target's email and then
calls `sendNotification(...)` **unconditionally** (`activities.ts:42-53`). There is no
dedupe lookup, no "already sent" check, no unique key on `(userId, resourceId, event)`
anywhere in this path. Two invocations produce two in-app notification rows and two
emails. The comment also mis-attributes the (non-existent) idempotency to "the UI" —
UI-side display de-duplication cannot un-send an email or collapse two persisted rows,
so even if the UI hides one, the send already happened twice.

**Concrete failure scenario:** `escalationWorkflow.sweepEscalations` calls
`notifyActivity` for a due escalation level (`escalationWorkflow.ts:221`). A BullMQ job
retry (the queue is configured `attempts: 3`, `escalationWorkflow.ts:66`) re-runs the
sweep after a transient failure that occurred *after* the notify but *before* the job
acked. The second run re-notifies → the on-call engineer receives the same "Escalation
L1: ticket TKT-0042" email twice. The docstring says this is a no-op; it is not.

**What this means in practice:** Workflow-driven alerts can be delivered more than once.
Cost is duplicate emails and duplicate in-app notices — annoying and trust-eroding for
on-call staff, not data loss. The danger is that the "idempotent" label invites callers
to retry freely on the assumption that duplicates are absorbed.

---

### F-2 — "Atomically claim … FOR UPDATE SKIP LOCKED" runs in autocommit, so the lock is not held across the update

**Where:**
- `apps/api/src/workflows/escalationWorkflow.ts:141` (comment) + `sweepEscalations`
  body (`escalationWorkflow.ts:149-251`).
- `apps/api/src/workflows/correlationWorkflow.ts:78-81` (comment) + `sweepCorrelation`
  body (`correlationWorkflow.ts:83-…`).

**The comments claim:**
> escalation: `Atomically claim escalation-due tickets ('FOR UPDATE SKIP LOCKED')`
> correlation: `Claims events with 'FOR UPDATE SKIP LOCKED' … so concurrent workers don't double-process.`

**What the code actually does:** both sweeps issue the `SELECT … FOR UPDATE SKIP LOCKED`
via a bare `db.execute(sql\`…\`)` (`escalationWorkflow.ts:152-163`,
`correlationWorkflow.ts:86-94`) that is **not** wrapped in `db.transaction(...)`. The
function receives the root `db` handle and calls `db.execute` / `db.update` directly —
there is no surrounding transaction. In postgres.js an un-transacted statement
auto-commits, which **releases the row locks the moment the SELECT returns**. The
subsequent `UPDATE tickets SET escalation_level = …` (`escalationWorkflow.ts:213-216`)
and the `notifyActivity` / incident-creation happen *after* the lock is already gone.
`FOR UPDATE SKIP LOCKED` therefore protects nothing beyond the duration of the read
itself — it does not "claim" the row for the read-modify-write the comment describes.

**Concrete failure scenario:** two `sweepEscalations` executions overlap — e.g. a slow
tick still running when the next 60 s repeat fires, or a `attempts: 3` retry running
alongside the original, or `concurrency: 5` (`escalationWorkflow.ts:261`) picking up two
jobs. Both SELECTs run, both auto-commit and drop their locks, both read
`escalation_level = 0` for the same ticket, both compute `due = 1`, both pass the
`if (due <= escalation_level) continue` guard (`escalationWorkflow.ts:211`), and both
bump the level + notify. For correlation the exposure is worse: `sweepCorrelation` has
**no** equivalent forward-only guard — its only defense against double-processing is the
lock the comment describes, which (per above) is not held across the state flip, so two
overlapping sweeps can both create an incident from the same open event.

**What this means in practice:** Under the normal single-sweeper cadence this never
fires and the sweeps behave correctly, which is why it has gone unnoticed. But the
comment sells a concurrency guarantee ("concurrent workers don't double-process") that
the code does not implement. The day a second worker, a retry, or an overlapping slow
tick appears, escalation can double-notify (F-1 amplifies this) and correlation can
create duplicate incidents from one event — with the reader believing the DB lock
prevents exactly that.

---

### F-3 — "the org_counters atomic counter prevents duplicate auto-numbers" — journal.create uses `count()+1`, not that counter

**Status: RESOLVED (B2).** Two changes closed this. (1) The numbered paths that the
comment reasoned about — journal entries (`JE-YYYY`), DSR (`DSR-YYYY`) and breach
(`BR-YYYY`) references — now allocate through the real atomic counter
(`getNextYearScopedSeq → getNextSeq`, a single `INSERT … ON CONFLICT DO UPDATE …
RETURNING`) instead of `count()+1`, so the comment's claimed mechanism is now the
mechanism actually in use for them (`accounting.ts` journal.create/reverse,
`compliance.ts` nextReference). (2) The `trpc.ts` comment itself was rewritten
(`trpc.ts` `retryMutation` header) to (a) correct the stale middleware order — it now
shows `retryMutation → rlsTenant → handler` and states that a retry re-runs the whole
rlsTenant tx + handler, not "only the handler"; and (b) stop presenting 23505 as
generically-harmless-to-retry, instead crediting the atomic counter specifically for
the JE/DSR/BR paths and noting the counter makes their retry unnecessary rather than a
belt-and-braces over an already-safe allocator. A fairness-checked regression
(`numbering-concurrency.test.ts`) proves the collision is gone: it goes RED against the
old `count()+1` (a real 23505 reaches the DB and the retry fires) and GREEN against the
atomic-counter fix. The original finding is preserved below for decision history.

**Where:** `apps/api/src/lib/trpc.ts:469-472` (comment) in the `retryMutation`
middleware safety rationale (`retryMutation` body `trpc.ts:477-505`).

**The comment claims:**
> For 23505 (unique_violation), the org_counters atomic counter prevents duplicate auto-numbers; handlers with idempotency keys catch accidental second inserts …

**What the code actually does:** the retry middleware retries any mutation whose
result carries a retryable Postgres code — `RETRYABLE_PG_CODES = {23505, 40001, 40P01}`
(`lib/db-retry.ts:16`) — up to `MAX_ATTEMPTS = 3` (`db-retry.ts:21`). The comment
justifies retrying `23505` on the premise that auto-numbers are minted by "the
org_counters atomic counter" (`getNextSeq`/`getNextNumber`, `lib/auto-number.ts`), so
a retried insert would draw a fresh number and not simply collide again. But
`journal.create` does **not** call that counter: it computes its number from
`count(existing)+1` inside the transaction (`accounting.ts:292-294`) with no lock. The
thing that actually keeps a duplicate JE number from persisting is (a) the unique index
`je_org_number_idx` on `(orgId, number)` (`accounting.ts:154`) rejecting the second
insert with `23505`, and (b) this very retry then re-running the loser, whose retry
re-reads the now-incremented `count()` and gets the next number. The org_counters
counter is real and correct for the entities that use it, but it is not what protects
the count()+1-numbered paths the comment is reasoning about.

**Concrete failure scenario (verified empirically while writing R-4):** two
`journal.create`s fired concurrently both read `count()` = 0, both mint
`JE-2026-00001`, one insert commits, the other gets `23505`, `retryMutation` re-runs it,
and it succeeds with `JE-2026-00002`. Final state: two distinct numbers, both callers
succeed — but the healing came from the unique index + retry, not from any atomic
counter. If a future change trimmed the retry (e.g. dropped `23505` from
`RETRYABLE_PG_CODES`, or `MAX_ATTEMPTS` were reached under a burst of concurrent
creates), the loser would surface a raw unique-violation to the user — with the reader
believing an atomic counter had already made that impossible.

**What this means in practice:** No current data corruption — the protection exists,
just not where the comment says. The risk is a *reasoning* trap: the comment invites a
maintainer to treat the retry as redundant over an already-atomic allocator and to
weaken it, which would re-expose the duplicate-number failure. (The proper fix — route
these paths through the real `getNextSeq` allocator — is tracked as B2 in
`reports/fix-plan.md`; this finding is the comment-correction half of it.)

---

## Note on scope

Everything else claiming a safeguard was checked and found **accurate**, including:
`getNextSeq`/`getNextNumber` ON-CONFLICT atomicity (`lib/auto-number.ts:34-70`), the
`invoices_org_invoice_number_idx` unique index backing "invoice numbers are unique per
org" (`schema/procurement.ts:351`), every `db.transaction`-wrapped "Atomicity:" comment
in `tickets.ts` / `financial.ts` / `ingest.ts` / `crm`, the "never persist raw Aadhaar"
minimisation (`lib/aadhaar.ts` + `routers/india-compliance.ts:330-341`), the TOTP-secret
"AES-encrypted at rest (never plaintext)" claim (`schema/auth.ts:139` verified against
`encryptSecretEnvelope`/`decryptSecretEnvelope` in `routers/auth.ts` + `mfa.test.ts`),
the KMS "DEK never persisted in the clear" envelope claim (`services/kms.ts:12`), and the
`LogOnlyDispatcher` "always returns logged" claim (`lib/notification-dispatcher.ts:33`).
These are listed so the reader knows they were verified, not skipped.
