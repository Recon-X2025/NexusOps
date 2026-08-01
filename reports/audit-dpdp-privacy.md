# Audit — dpdp-privacy

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._

Scope: India Digital Personal Data Protection (DPDP) Act 2023 machinery —
peppered PII hashing (`pii-hash.ts`), consent ledger, Data Subject Requests
(DSRs), breach register, the erasure executor, the retention floor, and the
scheduled sweep loop that drives them.

---

## 1. In plain English

The parts of this system that *record* privacy obligations are solid: consent,
data-subject requests, and breach incidents all have proper state machines,
statutory clocks, tenant isolation, and a clean audit trail. The government-ID
hashing is done correctly and fails loudly if misconfigured. **The danger is in
what happens when those clocks run out.**

Two things are actually dangerous. First, when a breach deadline passes, the
system emails the "notification" for the government regulator and for the
affected individuals **to the company's own inbox** — not to the regulator, and
not to the people whose data leaked — and then stamps the record as "sent." So
the compliance record will say the Data Protection Board and the victims were
notified when nobody outside the company ever received anything. Second, when
someone exercises their right to be forgotten and the request is marked
"fulfilled," **almost none of their personal data is actually deleted** — only
the request ticket itself is scrubbed. Their HR record, their PAN, their CRM
contact all survive untouched, while the request is closed as done.

The one thing to fix first is the breach/erasure "false completion": both paths
write a record that says a legal obligation was met when it was not. That is
worse than doing nothing, because it destroys the evidence trail you would rely
on in an actual DPDP enquiry. Everything else here (unbounded sweep queries, a
sweep that aborts halfway) is real but secondary.

---

## 2. Verdict

The data model and the intake/lifecycle half of DPDP are genuinely
production-grade. The **enforcement** half — the actions the system takes when
an obligation matures — is where it breaks: notifications go to the wrong
recipients but are recorded as delivered, and erasure touches bookkeeping tables
instead of the personal data it is meant to remove. Neither is a code-quality
lapse; both are a completed happy path wired to the wrong destination, with tests
that assert the wrong thing so the gap stays invisible. No BLOCKER for data
_corruption_ — but the false-completion records are a compliance-integrity
BLOCKER: the system asserts, in durable state, that a statutory duty was
discharged when it was not.

---

## 3. Findings

### BLOCKER

#### B-1 — Breach & principal notices are emailed to the company's own inbox, then recorded "sent"

`apps/api/src/lib/notification-dispatcher.ts:94-100`, driven by
`apps/api/src/lib/dpdp-sweeps.ts:162-189`.

The active dispatcher is `EmailDispatcher` (`notification-dispatcher.ts:131`),
which really sends mail. When `breachNotifySweep` fires an overdue breach it
dispatches two notices:

- `audience: "data_protection_board"` (sweeps.ts:167) → resolved at
  dispatcher.ts:96-97 to `dpb-india@coheronconnect.coheron.com`.
- `audience: "affected_principals"` (sweeps.ts:182) → resolved at
  dispatcher.ts:98-99 to `privacy@coheronconnect.coheron.com`.

Both are internal CoheronConnect mailboxes. The real Data Protection Board
address is never used, and the affected individuals' own emails are never even
looked up (the sweep has no principal-contact query). On a successful SMTP send
the artifact is stamped `status: "sent"` (dispatcher.ts:108-112).

**Concrete failure:** Org has a breach detected 4 days ago with a 72h window
(exactly the seeded case in `dpdp-sweeps.test.ts:141-145`). The next sweep tick
emails "affected principals must be notified" to `privacy@coheronconnect.coheron.com`,
marks the artifact `sent`, and moves on. The affected data principals and the
DPB receive nothing. In a subsequent DPDP enquiry the org's own audit artifacts
assert notification was completed on time.

**What this means in practice:** The system produces a *false record of
statutory compliance*. That is worse than an unbuilt feature — the paper trail
actively lies about a legal duty, and it lies for every org on every overdue
breach.

> Note on accepted debt: `docs/quality-bar.md:235-236` lists "DPDP external
> notification … outbound delivery … is **not wired**" as accepted debt. That
> entry is **stale** — delivery *is* wired (`EmailDispatcher`), it is
> mis-wired. This is a live defect, not the accepted "unbuilt" state.

#### B-2 — "Right to erasure" fulfilment deletes the request ticket, not the person's data

`apps/api/src/lib/dpdp-erasure.ts:67-82` (the `ERASURE_MAP`), invoked from
`apps/api/src/routers/compliance.ts:298-307`.

`ERASURE_MAP` has exactly two targets: the DSR row itself
(`dpdp_data_subject_requests` — anonymise name/email/phone) and logged
notification artifacts. It touches **no domain PII store** — not the HR employee
record (which holds the raw PAN per the payroll-tax audit), not CRM contacts,
not consent records. The file's own comment (lines 21-24) says extending to
domain tables "REQUIRES sign-off" and is a follow-up.

On top of that, erasure is flag-gated off by default
(`dpdp-erasure.ts:106-108`, `DPDP_ERASURE_ENABLED !== "true"`). In the default
deployment `executeErasureForDsr` returns a "DRY-RUN … would erase" summary and
mutates nothing (dpdp-erasure.ts dry-run path), yet the DSR transition to
`fulfilled` still succeeds and records an `[erasure]` note event
(compliance.ts:298-307).

**Concrete failure:** A data principal files an erasure DSR. An officer walks it
`received → in_progress → fulfilled`. With the flag off (default), nothing is
erased and `erasureExecutedAt` stays NULL, but the DSR is now `fulfilled` and
can be `closed`. Even with the flag ON, only the ticket's own name/email are
scrubbed; the employee's HR row, PAN, and CRM contact remain. The org has
formally answered "your data has been erased" while retaining it.

**What this means in practice:** The product's headline DPDP right — erasure —
does not erase. The request is closed as satisfied while the personal data lives
on, which is precisely the failure a data-protection regulator penalises.

### HIGH

#### H-1 — Notification-artifact erasure matches by DSR id, not by the principal's email

`apps/api/src/lib/dpdp-erasure.ts:121-128`.

The second `ERASURE_MAP` entry is declared with match kind `principalEmail` and
described as "Redact any logged notices addressed to this Principal's email."
But the emitted SQL is
`org_id = … AND related_type = 'dsr' AND related_id = ${dsr.id}` — it matches
artifacts linked to *this DSR's id*, never anything keyed on the email.

**Concrete failure:** Principal `asha@example.com` appears in a breach notice
artifact (`related_type='breach'`) and in an earlier DSR's artifacts. Her new
erasure DSR runs; the match condition only clears artifacts whose `related_id`
equals the current DSR id, so her email survives verbatim in the breach artifact
body and in any prior DSR's notices.

**What this means in practice:** Even the narrow "scrub the logged notices"
promise is not kept — the code does something different from what its own
declaration says, so residual copies of the principal's identifiers remain.

#### H-2 — Sweep loop aborts the whole batch on the first org that throws

`apps/api/src/index.ts:714-717`.

`POST /internal/dpdp/sweep` iterates every org with a bare
`for (const org of orgRows) { const r = await runDpdpSweepsForOrg(db, org.id); … }`.
There is no per-org try/catch. Any throw inside one org's sweep (a bad row, a
transient DB error, an SMTP failure surfacing as a throw) rejects the whole
handler; later orgs in the list are never swept on that tick, and no totals are
returned.

**Concrete failure:** Org #3 of 50 has a breach row whose dispatch throws. Orgs
4-50 are skipped this tick. Their overdue DSRs and breaches silently miss their
sweep, and because the endpoint returned an error the caller has no per-org
result to tell which orgs were processed.

**What this means in practice:** One tenant's bad data can silently starve every
other tenant of its privacy-deadline processing, and the failure is all-or-
nothing rather than isolated.

### MEDIUM

#### M-1 — Breach sweep never marks the obligation met, so it re-fires every dedupe window

`apps/api/src/lib/dpdp-sweeps.ts:157,177-189`.

The sweep skips a breach only if `principalsNotifiedAt` is set (line 157), but
the sweep itself never stamps `principalsNotifiedAt` — only the manual
`breach.notify`/`transition` path does. Its sole guard against re-sending is the
24h `recentlyNotified` dedupe window (dpdp-sweeps.ts:44-67).

**Concrete failure:** An overdue breach nobody manually actions is re-notified
(to the wrong inbox, per B-1) once every 24h, indefinitely, and its artifacts
never reflect that the statutory obligation was actually discharged.

**What this means in practice:** The "notification done" state is never reached
through automation; the loop treats a maturing obligation as perpetually
outstanding, generating a fresh (mis-delivered) notice every day.

#### M-2 — Sweeps load every row for the org and filter in JavaScript

`apps/api/src/lib/dpdp-sweeps.ts:140-151` (breach), and the parallel DSR sweep
`dpdp-sweeps.ts:90-99`.

Both sweeps `select … where(eq(orgId))` with no status/date predicate, pulling
every breach / every DSR the org has ever had, then filter in the JS loop
(closed/notified/not-yet-due). There is no bound.

**Concrete failure:** A long-lived org with tens of thousands of closed DSRs
pays a full-table scan and materialises every historical row into memory on
every sweep tick, to act on a handful of overdue ones.

**What this means in practice:** Correct today, but it degrades linearly with
history and will become the sweep's bottleneck as tenants age — a scaling cliff,
not a correctness bug.

---

## 4. Root causes

1. **Completed happy path wired to the wrong destination.** B-1 and H-1 are the
   same shape: the delivery/erasure mechanism exists and runs, but its target is
   a placeholder (internal mailbox, DSR-id match) that was never replaced with
   the real one (regulator/principal address, email-keyed match). The success
   status is written regardless, so the mistake is invisible from the outside.

2. **State advances without verifying the side effect it claims.** B-2 and M-1
   both let a record reach a "done" status (`fulfilled`, or skip-because-notified)
   without confirming the underlying action occurred. The DSR is fulfilled
   whether or not erasure ran; the breach is considered handled based on a flag
   the automation never sets. The lifecycle is decoupled from its own
   consequence.

3. **Tests assert the mechanism fired, not that it reached the right place.**
   `dpdp-sweeps.test.ts:138-165` checks two artifacts with channels
   `["board","principal"]` and status transitions — it would pass unchanged if
   every mail went to the company inbox (it does). The erasure test
   (`:280-294`) asserts only the DSR row's own fields are anonymised, never that
   any domain PII store was cleared. Inverting the destination or the erasure
   scope would not fail a single test, which is why B-1/B-2 shipped.

---

## 5. Recommended order of work (by blast radius)

1. **B-1 — stop recording mis-delivered notices as "sent."** Highest blast
   radius: every org, every overdue breach, produces a false statutory record.
   Until real regulator/principal routing exists, the honest state is "logged,"
   not "sent." (Fix is remediation, out of audit scope — flagged here for
   sequencing only.)
2. **B-2 — erasure must reach the personal data, or the DSR must not reach
   `fulfilled`.** The right-to-erasure promise is currently hollow for every
   principal.
3. **H-2 — isolate per-org sweep failures** so one tenant cannot starve the
   rest.
4. **H-1 — fix the artifact erasure match** to actually target the principal.
5. **M-1 / M-2 — mark the obligation met after a real send; bound the sweep
   queries.** Fragility that compounds as tenants age; lower urgency.

Sound as-is (no action): peppered PII hashing (`pii-hash.ts` — fail-loud,
brute-force-resistant, correct); the consent/DSR/breach state machines, clocks,
RBAC gating, and tenant isolation (`dpdp-dsr.test.ts` covers these well); the
retention-floor computation (`retention.ts`).

---

_No source files were modified. This report reads and describes standing code only._
