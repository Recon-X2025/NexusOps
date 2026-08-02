# Audit — background-automation

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._

Scope: the recurring "automation loops" that run outside any user request — the
18 BullMQ queues/sweepers booted in-process with the API
(`apps/api/src/services/workflow.ts`), the Temporal DPDP scheduled workflow
(`apps/worker`) and the four `/internal/*` HTTP endpoints it drives, and the
sweep implementations in `apps/api/src/workflows/*.ts` +
`apps/api/src/lib/dpdp-sweeps.ts`. Governing rules: quality-bar #2 (background
paths run as the DB superuser — RLS is **bypassed** — so each worker must
self-scope `org_id`); the Correctness rules (every external boundary — DB,
network, queue — has defined failure/timeout/partial-result behaviour; no
swallowed errors; bounded retry/timeout); and the automation-loop promise
(a captured obligation — a DSR clock, a breach deadline, an expired consent —
is actually acted on).

---

## 1. In plain English

Most of the automation is in genuinely good shape. Five of the six recurring
"sweeps" (ticket escalation, event correlation, scheduled-workflow triggers,
outbound webhooks, vulnerability-SLA) are built to the same careful pattern:
they grab a bounded batch of work, wrap **each item** in its own try/catch so
one bad record can't sink the rest, cap how much they do per run, and only ever
move forward so they never double-fire. The outbound-webhook dispatcher in
particular is solid — it signs each call, times out a hung subscriber, retries
with growing backoff, and gives up cleanly after six tries. And every sweep
correctly stamps the right customer's ID on everything it writes, so there is no
cross-customer leakage here.

There is **one loop that breaks the pattern, and it is the compliance one** — the
DPDP privacy sweep (data-subject-request deadlines, breach-notification
deadlines, consent expiry). It runs every customer one after another in a single
pass **with no per-customer safety net**. If any one customer hits an error
partway through, the whole pass aborts, and every customer *after* the failing
one silently gets skipped. Worse, the scheduler on top of it treats that abort as
a failure and simply retries the identical failing pass up to five times, then
waits an hour and tries again — failing at the same customer every time. So a
single bad record in one tenant can indefinitely starve every other tenant of
their statutory privacy deadline processing, with nothing surfacing that it
stopped. This is the one thing to fix first, because these are legal clocks
(India's DPDP Act) and the failure is completely silent.

Two smaller issues sit behind it: the DPDP sweep also reads *every* request and
breach for a customer into memory with no cap (the other sweeps all cap), and the
`/internal/` endpoints, when no shared token is configured, trust the entire
internal Docker network rather than just the local machine.

---

## 2. Verdict

The background-automation subsystem is fundamentally well-built and its
tenant-safety is sound: every sweeper self-scopes `org_id` from the row it
claimed and threads that into every write, notify, and audit call, so quality-bar
#2 holds despite RLS being bypassed on these paths. The queue-driven sweepers use
a consistent, correct idempotency pattern (`FOR UPDATE SKIP LOCKED` + advance-only
guards + bounded `LIMIT` + per-item error isolation). The single real defect is
that the **DPDP compliance loop alone does not follow that pattern**: its multi-org
driver (`POST /internal/dpdp/sweep`) and its per-org composite
(`runDpdpSweepsForOrg`) have **no per-org and no per-item error isolation and no
batch bound**, so one throwing org (or one throwing DSR/breach row) aborts the
whole sweep — and the Temporal retry policy on top re-runs the same failing batch,
turning a single poison record into an indefinite, silent starvation of every
other tenant's statutory privacy processing. That is a HIGH: correct-looking code
that fails badly under a realistic single-row error, on the loop where a missed
run has regulatory consequence.

---

## 3. Findings

### HIGH

#### H-1 — The DPDP sweep has no per-org error isolation: one throwing org silently starves all orgs after it

The multi-org driver runs orgs in a bare loop with **no try/catch**
(`apps/api/src/index.ts:714-717`):

```ts
for (const org of orgRows) {
  const r = await runDpdpSweepsForOrg(db, org.id);
  results.push({ orgId: org.id, ...r });
}
```

and the per-org composite runs its three sweeps sequentially, again with **no
try/catch** (`apps/api/src/lib/dpdp-sweeps.ts:246-248`):

```ts
const dsr = await dsrOverdueSweep(db, orgId, opts);
const breach = await breachNotifySweep(db, orgId, opts);
const consent = await consentExpirySweep(db, orgId);
```

Neither the three sweep functions nor the dispatcher inside them
(`getNotificationDispatcher().dispatch(...)`, `dpdp-sweeps.ts:109,164,179`) wrap
individual rows. Contrast every other sweep, which isolates each item — e.g.
`escalationWorkflow.ts:182-247` (`try { … } catch (err) { result.errors++; … }`
per ticket), `correlationWorkflow.ts:110-129`, `workflowTriggerWorkflow.ts:155-191`,
`vulnerabilitySlaWorkflow.ts:196-260`. DPDP is the lone exception.

**Concrete failure:** The default scheduled run sweeps **all** orgs (empty body —
`index.ts:706`; worker sends `{}` to sweep every org). Suppose one org has a DSR
whose `dueAt` is malformed, or the active `EmailDispatcher`
(the default per `dpdp-sweeps.test.ts:68-69`) throws on one notice (SMTP down,
bad address). `dsrOverdueSweep` throws → `runDpdpSweepsForOrg` throws for that org
→ the `for` loop in `index.ts` propagates → the whole handler 500s. Every org
ordered **after** the failing one in `db.select(...).from(organizations)` never
gets `dsrOverdueSweep`, `breachNotifySweep`, or `consentExpirySweep` run this tick.
Because the throw happens in `dsrOverdueSweep` (the first of the three), that same
org's own `breach` and `consent` sweeps are also skipped.

Now layer the scheduler: the Temporal activity checks `res.ok` and throws on
non-2xx (`apps/worker/src/activities/dpdp-sweep-activities.ts:41-44`), under a
retry policy of `maximumAttempts: 5` with exponential backoff
(`dpdp-sweep-activities.ts:14-19`). So the 500 is **retried up to 5 times** — each
retry re-runs the identical all-org batch, deterministically failing at the same
poison org every time — then the hourly schedule
(`DPDP_SWEEP_INTERVAL` default `1h`, overlap `SKIP`,
`apps/worker/src/schedules/dpdp-sweep-schedule.ts:36-53`) fires the next tick,
which fails identically. The result: **one bad row in one tenant indefinitely
prevents DPDP deadline processing for every tenant that sorts after it**, and the
only signal is a Temporal activity-failure metric — no per-org error is recorded
because the loop never reaches a `catch`.

**What this means in practice:** These sweeps enforce statutory clocks under
India's DPDP Act — the deadline to notify the Data Protection Board of a breach,
the deadline to answer a data-subject request, the expiry of consent. A single
un-caught error in one customer's data can silently switch the whole compliance
automation off for an unknown set of other customers, with no alert that it
stopped. The obligations still exist; the system just stops surfacing them.

> Not accepted debt: `docs/GAP_ANALYSIS.md` lists the DPDP sweeps as *shipped*
> (`| DPDP consent / DSR / breach automation + sweeps |`, line 38) with no
> caveat about per-org fault isolation; there is no "Known accepted debt" entry
> exempting this loop from the Correctness rules.

### MEDIUM

#### M-1 — DPDP sweeps read an org's entire request/breach history into memory unbounded

`dsrOverdueSweep` selects **all** DSRs for the org
(`apps/api/src/lib/dpdp-sweeps.ts:90-99`) and filters open+overdue in JS
(lines 103-106); `breachNotifySweep` does the same for **all** breaches
(lines 140-151, filtered 155-159). Neither has a `LIMIT`. Every other sweep in
this subsystem caps its batch — `SWEEP_BATCH_LIMIT = 50`
(`webhookDispatchWorkflow.ts:43`), `100`
(`workflowTriggerWorkflow.ts:41`), `500`
(`escalationWorkflow.ts:43`, `correlationWorkflow.ts:29`,
`vulnerabilitySlaWorkflow.ts:50`).

**Concrete failure:** An org that has accumulated hundreds of thousands of
historical DSRs/breaches (closed ones are selected too — the `closedAt`/`status`
filter is applied *after* the fetch, line 104/156) causes each hourly tick to
pull the entire table for that org into the Node heap. Under the 5-minute
`startToCloseTimeout` this is also a latency risk that can trip the timeout →
feed the same H-1 retry loop.

**What this means in practice:** The sweep gets slower and heavier the longer a
customer uses the product, in a way that the other loops were explicitly designed
to avoid. It is correct today on small data and degrades with scale.

#### M-2 — `/internal/*` endpoints trust the whole Docker/private network when no token is set

The `/internal/` guard requires an exact `X-Internal-Token` match **only when
`INTERNAL_API_TOKEN` is configured**; otherwise it falls back to an IP check that
accepts the entire private range (`apps/api/src/index.ts:642-649`):

```ts
const ip = req.ip ?? (req.socket?.remoteAddress ?? "");
const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("172.") || ip.startsWith("10.");
if (!isLocal) { return reply.status(401)... }
```

`172.` / `10.` are not localhost — they are the Docker bridge and private LAN
ranges. The protected routes include `POST /internal/dpdp/sweep`,
`POST /internal/metrics/reset` (`index.ts:660`), and the metrics/health reads.

**Concrete failure:** In a deploy where `INTERNAL_API_TOKEN` is unset (the fallback
is silent — nothing forces the token), **any** container or host on the same
Docker/overlay network — a sidecar, a compromised co-located service, another
tenant's container in a shared cluster — can `POST /internal/dpdp/sweep` (trigger
an all-org sweep at will) or `POST /internal/metrics/reset` (wipe the health
counters the monitor evaluates). No app-level auth, no org context, is required.

**What this means in practice:** The internal control plane is only as isolated as
the network. If someone forgets to set the token (and nothing warns them), the
blast radius is "anything sharing the network", not "this machine". Setting
`INTERNAL_API_TOKEN` in every environment closes it; the risk is that the
fail-open default makes forgetting invisible.

---

## 4. Root causes

1. **One loop was written to a different standard than the other five.** The
   BullMQ sweepers (escalation, correlation, workflow-trigger, webhook, vuln-SLA)
   share a deliberate, correct shape: claim a bounded batch, isolate each item in
   try/catch, advance-only. The DPDP loop — added on the Temporal side, driven
   through an HTTP endpoint rather than a queue worker — never picked up that
   shape: no per-item catch (H-1), no batch bound (M-1). The symptoms are two
   faces of the same omission: the DPDP path treats the happy case as the only
   case, exactly the generated-code failure mode the quality bar warns about.

2. **Fail-open defaults hide the operator's mistake.** The `/internal/` guard
   (M-2) and, upstream, the `INTERNAL_API_TOKEN` being optional mean a missing
   config degrades silently to a weaker posture instead of refusing to start.
   Combined with H-1's silent abort, the subsystem's failure modes are
   consistently *quiet* — they widen access or skip work without emitting a signal
   a human would notice.

---

## 5. Recommended order of work (by blast radius)

1. **H-1 — give the DPDP sweep the same per-item isolation the other five have.**
   Wrap each org in the `index.ts:714` loop, and each row inside the three sweep
   functions, in try/catch that counts-and-continues (mirroring
   `escalationWorkflow.ts:182-247`), so one poison org/row can't abort the batch
   and can't drive the Temporal retry loop into indefinite starvation. This is the
   only finding that silently stops statutory processing.
2. **M-1 — bound the DPDP selects.** Add a `LIMIT` (and push the open/overdue
   predicate into SQL) so each tick does a bounded amount of work, matching the
   other sweepers. This also removes the timeout path that feeds H-1.
3. **M-2 — make `INTERNAL_API_TOKEN` mandatory (fail-closed).** Refuse to serve
   `/internal/*` — or refuse to boot — when the token is unset, rather than
   falling back to a private-network IP allowlist.

Sound as-is (no action):
- **Tenant-safety of every sweep** — each self-scopes `org_id` from the claimed
  row into every write/notify/audit (`escalationWorkflow.ts:213-243`,
  `vulnerabilitySlaWorkflow.ts:217-256`, `workflowTriggerWorkflow.ts:170-175`,
  `correlationWorkflow.ts:123`, `dpdp-sweeps.ts:108-119`). No cross-tenant path
  found; quality-bar #2 holds on the RLS-bypassing background paths.
- **Outbound webhook dispatcher** — `FOR UPDATE SKIP LOCKED` claim flips to
  `retrying` in the same statement (`webhookDispatchWorkflow.ts:149-167`),
  `AbortController` 10s POST timeout (lines 205-206,223), bounded
  `MAX_ATTEMPTS = 6` with capped exponential backoff (44-47,123-125), terminal
  handling of a deactivated subscriber (189-196). HMAC signing + idempotency key
  present. Covered by inversion-sensitive tests (`webhook-dispatch.test.ts`).
- **Idempotency/advance-only** across escalation/vuln-SLA (`due <= level → continue`)
  and the CTE-claim sweeps — overlapping ticks cannot double-fire.

Test note (test-the-tests): the BullMQ sweeps have inversion-sensitive coverage
(`webhook-dispatch.test.ts` asserts backoff, exhaustion, inactive-subscriber, and
a no-financial-mutation invariant; `escalation-sweep.test.ts`, `workflow-trigger.test.ts`
exist). The DPDP suite (`dpdp-sweeps.test.ts`) covers only the **happy path** of
`runDpdpSweepsForOrg` (line 219-252: one clean org + one untouched other org). **No
test seeds a poison org/row that throws mid-batch**, so H-1's failure branch is
uncovered — a suite that stays green while the loop aborts every subsequent org is
exactly the "passes even if the logic were inverted" gap the method warns about.

---

_No source files were modified. This report reads and describes standing code only._
