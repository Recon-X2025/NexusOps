# Audit — audit-log-integrity

Audited 2026-07-31. Scope: the tamper-evident audit trail (per-org SHA-256 hash
chain) — construction (`appendAuditEntry`), verification (`verifyAuditChain`),
the mutation-audit middleware, and every path that writes an `audit_logs` row.
Measured against `docs/quality-bar.md` rule 4 ("the audit log is tamper-evident
and must stay an unbroken chain").

## In plain English

The audit log is a diary of who did what. To make it trustworthy, each entry is
sealed with a fingerprint that also depends on the previous entry's fingerprint,
so if anyone edits, deletes, or reorders an old entry, the seal breaks and a
checker can spot it. The sealing itself is well built — the maths is sound, and
it correctly survives many people writing at once (a bug that used to break
two-factor sign-in was properly fixed).

There are two real weaknesses, both about *detection* rather than the seal
itself. First, the checker can catch a deleted entry from the *middle* of the
diary, but **not entries chopped off the *end***. Someone who can reach the
database could delete their most recent incriminating actions and the checker
would still say "all intact," because nothing records how many entries there are
*supposed* to be. Second — and this is the one to fix first — **nothing in the
running system ever actually runs the checker.** The tamper-detection code
exists and is tested, but no screen, no scheduled job, and no report ever calls
it in production. A prior evaluation already found one customer's chain silently
broken and nobody knew. A tamper-evident log that is never checked gives the
same assurance as no check at all.

The one thing worth doing first: **run the checker on a schedule and alarm when
it fails** (and record the expected chain length so end-truncation is caught).
Until then, the tamper-evidence is real on paper but unverified in practice.

## Verdict

The core chain (`appendAuditEntry` / `computeEntryHash`) is correct and the
per-org concurrency fix is solid — writes cannot fork the chain, and edits or
mid-chain deletions are detectable. But the *integrity guarantee is never
exercised at runtime*: `verifyAuditChain` has no caller outside tests, so no
tampering is ever actually detected in production, and the verifier itself
cannot detect the most attractive attack (tail truncation). Two security-event
writers also sit outside the chain entirely. Nothing here is silent data
*corruption* by the app's own hand, so no BLOCKER — but the subsystem does not
yet deliver the assurance rule 4 asks of it. Net: sound primitive, unfinished
control.

## Findings

### HIGH

**H-1 — Deleting the newest entries (tail truncation) is undetectable.**
`apps/api/src/lib/audit-hash.ts:205-240` (`verifyAuditChain`). The verifier walks
the rows it finds, starting at `expectedSeq = 1` and incrementing, checking each
`prevHash` link and re-deriving each `entryHash`. It has no independent record of
how long the chain *should* be — nothing stores the expected head `seq` or entry
count for an org (confirmed: no `auditChainHead` / length-anchor table anywhere
in the schema).

- Offending logic: the loop returns `ok: true` as long as the rows present form a
  contiguous `1..k` with valid links. Deleting rows from the *end* leaves exactly
  that.
- Concrete failure: an org's chain runs `seq 1..80`. An actor with database write
  access deletes rows `78, 79, 80` (their three most recent actions). Remaining
  rows are `1..77`, contiguous, every `prevHash` still links, every `entryHash`
  still re-derives. `verifyAuditChain` returns `ok: true, entries: 77,
  brokenAtSeq: null`. The three deletions are invisible.
- Contrast with the test that *looks* like it covers this
  (`apps/api/src/__tests__/audit-hash-chain.test.ts:83-95`): it deletes the
  **middle** row (`seq = 2`), which leaves a gap `1,3` and *is* caught. No test
  deletes the tail.
- What this means in practice: the easiest tampering (erase your own latest
  actions) is the one the checker cannot see. For a WORM/compliance control this
  is the gap that matters most.

**H-2 — `verifyAuditChain` is never called in production; tampering is never
actually detected.**
`apps/api/src/lib/audit-hash.ts:189` (definition). A repo-wide search for
`verifyAuditChain` returns only its definition, the unit tests, and
documentation — **no endpoint, no tRPC procedure, no scheduled/BullMQ/Temporal
job, and no admin console ever invokes it.**

- Concrete failure: the E2E evaluation already recorded a live broken chain —
  org `d03d1d9b…` has `seq` running `1, 3, 4 … 80` (seq 2 missing);
  re-derivation returns `ok:false, brokenAtSeq:3`
  (`docs/E2E_EVALUATION_FINDINGS.md:907-917`). Because nothing runs the verifier,
  that break has sat undetected. In production the same is true for every org:
  a break (from H-1, from H-3, or from direct DB tampering) produces no alert,
  no ticket, no log line.
- What this means in practice: the whole point of a hash chain is to *notice*
  tampering. The noticing half was built and tested but never wired to run, so
  the tamper-evidence property provides no operational assurance today. This is
  the classic generated-code failure mode: the mechanism exists, the loop that
  fires it does not.

### MEDIUM

**M-1 — Audit-append failures are silently swallowed; the mutation still
commits.**
`apps/api/src/lib/trpc.ts:447-449` — the `auditMutation` middleware wraps the
append in `try { … } catch { /* non-fatal */ }` with **no log at all**. Because
`auditMutation` sits *above* `rlsTenant` in the stack
(`trpc.ts:545-550`), the business mutation runs and commits inside the inner
`rlsTenant` transaction *before* control returns to the append; the append then
runs on a separate pool connection.

- Concrete failure: during a burst, `appendAuditEntry` exhausts its 5 retries on
  advisory-lock/`23505` contention, or hits any transient DB error. The mutation
  (e.g. `accounting.journal.create`) has already committed. The `catch {}`
  discards the error and returns success to the caller. The action persisted with
  **no audit row and no trace** that the audit was skipped — the swallow logs
  nothing, unlike the workflow variant (`workflows/activities.ts:75-78`) which at
  least writes to stderr.
- Interaction: this silently creates chain *gaps*, which H-1 can't detect on the
  tail and H-2 means nobody checks anyway.
- What this means in practice: under load, some real actions will have no audit
  entry and you will never know which. Rule 4's "unbroken chain" is not
  guaranteed on the write side. (MEDIUM not HIGH because it requires a transient
  fault to trigger, not normal input — but it is exactly the swallowed-error
  pattern the quality bar's Correctness section forbids.)

**M-2 — Security-relevant events are written outside the chain and are ignored
by the verifier.**
Several writers insert `audit_logs` rows directly, omitting `seq`/`prevHash`/
`entryHash`, so they never enter the chain and `verifyAuditChain` explicitly
skips them (`audit-hash.ts:199-201` filters `seq == null`):
- `apps/api/src/lib/mfa-policy.ts:58-73` — `mfa_policy_denied`. This fires from
  `mfaGate` **before** the handler runs and then throws `FORBIDDEN`, so
  `auditMutation`'s `await opts.next()` rejects and no chained row is written
  either. The event therefore exists **only** as an unchained, skip-by-verifier
  row — the one copy that can be edited or deleted with zero detection.
- `apps/api/src/routers/admin.ts:190-201, 223-232, 303-321, 411-432` —
  `user_mfa_attestation`, `user_archive`, `security_policy_update`,
  `sso_saml_config_update`. These *are* `adminProcedure` so the `auditMutation`
  middleware also records a chained row for the same action; the direct insert is
  a redundant second, unchained copy (noise the verifier ignores).
- `apps/api/src/routers/command-center.ts:96-116, 152-171` and
  `apps/api/src/routers/projects.ts` — view/intake events, unchained.
- Concrete failure: an actor edits or deletes the `mfa_policy_denied` row
  recording that they were blocked for missing MFA. `verifyAuditChain` never
  looks at `seq == null` rows, so the edit is undetectable by design.
- What this means in practice: the chain does not cover the one denial event
  that has no chained twin, and clutters the table with unchained duplicates for
  the admin events. (MEDIUM: the highest-value security events — enable/disable
  MFA, escalation — are now correctly chained via `appendAuditEntry` at
  `auth.ts:476,515` and `workflows/activities.ts:67`, contra the stale
  `E2E_EVALUATION_FINDINGS.md:889-905` note, so the residual exposure is the
  denial event plus duplicate noise, not the whole security trail.)

## Root causes

1. **The control was built as a primitive, not as a running check.** The chain
   (write + verify functions) is complete and tested, but the operational half —
   *who runs the verifier, how often, and what happens when it says `ok:false`* —
   was never built. H-2 is that gap directly; H-1 is the same mindset (the
   verifier was written to answer "do the rows I have hang together?" not "are
   any rows missing from the end?", because no one defined an independent
   source of truth for chain length).

2. **"Audit must never block the business action" was implemented as "audit may
   silently vanish."** Both M-1 (`trpc.ts:447`) and the workflow variant chose to
   swallow append failures. That is the right instinct (don't fail a journal post
   because the audit hiccuped) taken one step too far: the failure is dropped
   with no signal, so a gap is created *and* hidden.

3. **Two eras of audit writing coexist.** Newer code routes through
   `appendAuditEntry` (chained); older/peripheral code still does
   `db.insert(auditLogs)` directly (unchained). The verifier's `seq IS NOT NULL`
   filter was the correct fix for the MFA `23505` collision, but it also
   permanently defines those direct-insert rows as outside the integrity
   guarantee — a drifted contract between modules written in different sessions.

## Recommended order of work (by blast radius)

1. **H-2 — wire the verifier to actually run.** A scheduled per-org
   `verifyAuditChain` sweep that raises an alert on `ok:false`. Without this,
   every other integrity property is theoretical. Cheapest, highest leverage.
2. **H-1 — anchor the expected chain length/head** (e.g. a per-org counter the
   verifier cross-checks, or a rule that the max stored `seq` must equal the row
   count) so tail truncation is caught. Pairs naturally with #1 — the sweep is
   the thing that would consume the anchor.
3. **M-1 — stop swallowing append failures silently.** At minimum log the drop
   with org/action/path so a missing audit row is detectable; decide per path
   whether a hard failure should also fail the mutation.
4. **M-2 — route the remaining direct inserts through `appendAuditEntry`** (or
   accept them explicitly as non-chained and document why), starting with
   `mfa_policy_denied`, which today has no chained twin.

No BLOCKER found: the app does not itself corrupt or forge the chain, and the
sealing primitive is correct. The exposure is that tampering by a party with DB
access would go undetected (H-1, H-2) and that some writes can silently skip the
log (M-1).
