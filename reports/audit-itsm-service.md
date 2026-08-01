# Audit — itsm-service

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._

Scope: the ticket/incident engine and its ITSM neighbours — ticket create/update
state machine (`apps/api/src/routers/tickets.ts`, `lib/ticket-lifecycle.ts`), SLA
computation and breach detection (`computeTicketSlaDeadlines`,
`workflows/ticketLifecycleWorkflow.ts`), on-call escalation
(`workflows/escalationWorkflow.ts`), auto-assignment (`services/assignment.ts`),
change management + CAB (`routers/changes.ts`), and approvals (`routers/approvals.ts`).

---

## 1. In plain English

The ticket system is solid on the things that lose or leak data: every query is
walled to one customer's organisation, ticket numbers can't collide, and the
record-locking that stops two people corrupting the same ticket is in place. The
create/update flow, the reopen fix, and the change-approval gate are all sound.

The real problem is the **"first response" SLA clock, which is broken**. Support
tools promise two deadlines per ticket: one to *respond* and one to *resolve*. The
column that records "an agent has responded" is **never filled in by any part of the
running product** — it is only ever cleared. Because the system therefore believes
*no ticket has ever been responded to*, every ticket's response deadline is treated
as breached the moment it passes, the assignee gets a "you missed your response SLA"
alert even when they answered immediately, and the manager's "at-risk" and "overdue"
dashboards count tickets that are actually fine. The number people would use to judge
their support team is wrong.

The one thing to fix first is that: **make the product record when a ticket is first
responded to**, so the response-SLA feature stops firing false alarms and the
dashboards tell the truth. A smaller, related issue: a ticket that has already
breached and is then *legitimately put on hold* (waiting on the customer) keeps
paging the on-call engineer up the escalation chain while it sits on hold. Nothing
here risks losing data or leaking one customer's tickets to another.

## 2. Verdict

Healthy on isolation, concurrency, and the money-adjacent invariants (no financial
mutation in any ITSM sweep — asserted by test). The state machines and the durable
SLA-job plumbing are well-built. The subsystem's weakness is a single unfinished
contract — first-response is modelled and consumed everywhere but produced nowhere —
which turns the entire response-SLA half of the feature into noise, and a couple of
smaller boundary gaps around SLA pause. No BLOCKERs. **1 HIGH, 1 MEDIUM, 1 LOW.**

---

## 3. Findings

### HIGH

#### H-1 — First-response SLA is permanently mis-fired: `slaRespondedAt` is consumed everywhere but never set

**Where the value is *read* (relied upon):**
- `workflows/ticketLifecycleWorkflow.ts:163-165` — the breach sweeper only treats a
  response deadline as breached `AND sla_responded_at IS NULL`.
- `routers/reports.ts:455` and `:476` — the "SLA at-risk" and "overdue" dashboard
  counts both filter `isNull(tickets.slaRespondedAt)`.

**Where the value is *written*:** only one place, and only ever to `null`:
- `routers/tickets.ts:1319` — on reopen: `updateData.slaRespondedAt = null;`

A repo-wide search for any assignment of `slaRespondedAt` / `sla_responded_at` to a
timestamp returns **nothing** in application code. The column
(`packages/db/src/schema/tickets.ts:190`) is never stamped when an agent actually
responds — there is no "record first response" path (not in `create`, not in
`update`, not in any comment/reply mutation).

**Concrete failure scenario:** An agent picks up ticket `INC-42` and replies to the
requester within two minutes, well inside a 60-minute response target. Nothing sets
`slaRespondedAt`, so it stays `NULL`. Sixty minutes later the per-ticket
`sla-response` delayed job fires (`ticketLifecycleWorkflow.ts:211-248`); it checks
only `if (ticket.slaBreached) return;` (line 221), sees the ticket un-breached, and
flips `slaBreached = true`, sending the assignee "⚠️ SLA Response Breach" for a
ticket they answered 58 minutes ago. Simultaneously the manager's dashboard
(`reports.ts:474-478`) counts that ticket as **overdue on response** because
`slaRespondedAt IS NULL` is still true. Every ticket in the org behaves this way.

**What this means in practice:** The response-SLA metric — one of the two headline
numbers an ITSM tool exists to report — is always wrong in the "breach" direction.
Agents are trained to ignore breach alerts (alert fatigue on a real breach later),
and any SLA-attainment report shown to a customer or used for staffing understates
true performance. This is "incorrect behaviour under inputs a real user will
produce" per the quality bar's HIGH definition.

**Note on the worker (same root cause):** even independent of the missing writer, the
per-ticket breach worker at `ticketLifecycleWorkflow.ts:220-221` reads only
`{id, statusId, slaBreached}` and — per its own comment, *"statusId check deferred to
avoid joining ticketStatuses — treat active if not breached"* — does **not** re-check
`slaRespondedAt`, `resolvedAt/closedAt`, or `slaPausedAt`, unlike the SQL sweeper
(`:157-166`) which checks all of them. Today `cancelSlaJobs`
(`tickets.ts:1484` → `syncTicketSlaJobs:168`) removes the delayed jobs on every status
change, so a *resolved* ticket usually has its job cancelled before it fires. But the
response job is not cancelled by a response (because nothing records a response), and
if the cancel ever misses (Redis eviction, job already in-flight), the worker will
mark a breach on a ticket that is resolved or paused. The fix for H-1 (record first
response) and hardening this worker to mirror the sweeper's guards are the same piece
of work.

---

### MEDIUM

#### M-1 — A breached ticket keeps escalating up the on-call chain while it is legitimately paused

**Where:** `workflows/escalationWorkflow.ts:152-162` — the escalation claim query:

```sql
SELECT id, org_id, number, team_id, escalation_level,
       COALESCE(sla_resolve_due_at, sla_response_due_at) AS breach_instant
FROM   tickets
WHERE  sla_breached = true
  AND  resolved_at  IS NULL
  AND  closed_at    IS NULL
  AND  COALESCE(sla_resolve_due_at, sla_response_due_at) IS NOT NULL
```

The breach sweeper (`ticketLifecycleWorkflow.ts:160`) excludes paused tickets
(`sla_paused_at IS NULL`), but the **escalation** sweep does not. Putting a ticket on
hold (`tickets.update` → status category `pending`, `tickets.ts:1245-1246`) sets
`slaPausedAt` but does **not** clear `slaBreached`.

**Concrete failure scenario:** `INC-7` breaches its resolve SLA (`slaBreached = true`).
The agent then sets it to *pending* because they are waiting on the customer for
information — a legitimate hold, SLA paused. The escalation sweep runs every minute;
`INC-7` still matches (breached, not resolved, not closed), and because `breach_instant`
keeps receding into the past, `dueLevel(chain, elapsedMinutes)` (`:208`) keeps
climbing. Each tick that crosses a new cumulative chain delay bumps `escalation_level`
and pages the next on-call engineer (`:220-233`) — for a ticket that is correctly
parked waiting on the customer, potentially for days.

**What this means in practice:** On-call engineers get woken for tickets that are on
hold through no fault of the support process, eroding trust in the pager. It is
"correct today, fragile tomorrow" only in the narrow sense that it requires the
pause-after-breach ordering; under real hold-heavy workflows it fires now. Ticket it.

---

### LOW

#### L-1 — Ticket transition guard silently allows any transition from an unknown status; drifts from the (correct) change guard, and a test locks the permissive behaviour in

**Where:** `lib/ticket-lifecycle.ts:15-17`

```ts
const allowed = TICKET_LIFECYCLE[fromCategory];
if (!allowed) return;   // unknown fromCategory → NO validation at all
```

Compare the sibling guard for change requests, written for the identical purpose,
which does the opposite — it **throws** on an unknown status
(`routers/changes.ts:51-54`: `if (!allowed) throw ... "Unknown current status"`).

Today the ticket path is not exploitable: `ticketStatuses.category` is a Postgres enum
constrained to exactly the five keys the map defines
(`packages/db/src/schema/tickets.ts:32-38, 97`), and the update path only calls the
guard when both categories resolve (`tickets.ts:1227-1229`). So there is **no concrete
failure scenario against the current schema** — which is why this is LOW, not higher.

The reason to record it: `ticket-lifecycle.test.ts:20-22` explicitly asserts the
bypass as *intended* — `it("allows unknown from-category (custom statuses)")` — i.e.
the design anticipates custom ticket statuses outside the enum. If that feature ever
ships (statuses no longer enum-constrained), this guard will silently permit *any*
transition from a custom status while the change guard rejects the analogous case,
and the test will keep the divergence green. It is a latent drifted contract, not a
present defect.

---

## 4. Root causes

1. **A contract produced in one session and consumed in another, with the producer
   never written.** `slaRespondedAt` has a schema column, a breach-sweep clause, two
   dashboard filters, and a reopen-time reset — everything *except* the one line that
   stamps it when an agent responds. This is the classic generated-code seam: each
   piece assumes some *other* piece fills the value. H-1 is entirely this.

2. **Two parallel truth-checks for the same fact, only one kept complete.** SLA breach
   is decided in two places — a careful SQL sweeper that checks responded/resolved/
   paused, and a per-ticket worker that checks only `slaBreached` and defers the rest
   with a comment. The escalation sweep is a third checker that forgot the pause
   condition the breach sweeper remembered. Every divergence (H-1's worker note, M-1)
   is a copy of the same invariant that drifted because it was expressed three times
   instead of once.

3. **Guards for the same concept implemented twice with opposite failure modes** —
   ticket transitions fail *open* on the unknown case, change transitions fail
   *closed*. Harmless now only because the enum removes the unknown case; a hazard the
   moment the anticipated custom-status feature lands (L-1).

## 5. Recommended order of work (ranked by blast radius)

1. **H-1 — record first response.** Add the single write that stamps
   `slaRespondedAt` when a ticket first receives an agent response (define "response"
   for the product — first assignee comment / first status move off `open`), and while
   there, make the per-ticket breach worker (`ticketLifecycleWorkflow.ts:213-227`)
   re-read and honour `slaRespondedAt` / `resolvedAt` / `closedAt` / `slaPausedAt` so
   it matches the SQL sweeper. This corrects the wrong metric *and* removes the false
   breach alerts in one change. Add a test that fails if `slaRespondedAt` is never set
   (the current reopen test would pass with the writer removed — it only asserts the
   value is cleared).

2. **M-1 — exclude paused tickets from escalation.** Add `AND sla_paused_at IS NULL`
   to the escalation claim query (`escalationWorkflow.ts:157-159`), mirroring the
   breach sweeper. Add an escalation-sweep test for a paused-but-breached ticket — no
   existing test covers it.

3. **L-1 — reconcile the two transition guards.** Decide whether unknown statuses
   should fail open or closed and make `assertTicketTransition` and
   `assertChangeTransition` agree; update `ticket-lifecycle.test.ts:20-22` to match the
   decision rather than enshrine the current accident. No urgency until custom statuses
   are on the roadmap.

---

## Coverage note (test-the-tests)

- **Sound, inversion-sensitive coverage:** `escalation-sweep.test.ts` (breached vs
  not, chain vs none, resolved, idempotency, cumulative-delay levels, no-financial-
  mutation) and `ticket-reopen-sla.test.ts` (reopen re-arms deadlines, clears terminal
  stamps, resets breach, monotonic pair). Both would fail if their logic were inverted.
- **Blind spots the findings exploit:**
  - No test exercises the *first-response* path — `ticket-reopen-sla.test.ts:82` sets
    `slaRespondedAt` with a direct DB write because production never sets it, then only
    asserts reopen clears it to null (`:96`). Removing every non-test writer of
    `slaRespondedAt` (there are none) would not fail any test. (H-1)
  - No test covers a **paused breached** ticket in the escalation sweep. (M-1)
  - `ticket-lifecycle.test.ts:20-22` asserts the guard bypass as intended, so it
    cannot catch L-1 — it *is* L-1, frozen. (L-1)
- **Approvals RBAC** (`approvals-rbac.test.ts`) is a single negative case (viewer
  cannot decide); the multi-step aggregate-completion of `approvals.decide` (does the
  parent entity advance only when all steps approve?) is neither implemented as a
  gate nor tested, but `changes.ts` runs its own self-contained CAB approval
  (`changes.ts:335-403`, guarded by `assertChangeTransition` + `assertCabRiskForApprove`)
  so no change is released on a partial approval — no finding.

_No source files were modified._
