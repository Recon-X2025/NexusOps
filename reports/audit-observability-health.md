# Audit — observability-health

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing code, not a diff._

Scope: how the platform watches itself — the health/readiness endpoints
(`/health`, `/health/detailed`, `/ready`), structured logging
(`apps/api/src/lib/logger.ts`), the in-memory metrics store
(`apps/api/src/lib/metrics.ts`), request latency / slow-request / query-timeout
instrumentation (`apps/api/src/lib/trpc.ts`), the health evaluator
(`apps/api/src/lib/healthMonitor.ts`), rate limiting (`@fastify/rate-limit`,
`apps/api/src/index.ts`), the database connection-pool monitor
(`packages/db/src/client.ts`), and graceful shutdown / OTEL wiring.

---

## 1. In plain English

This part of the system is, on the whole, thoughtfully built: logs are
structured and carefully scrubbed of passwords and tokens, there are proper
health-check URLs for the deployment system to watch, and there's live latency
and connection-pressure monitoring. The one thing worth fixing first is a
**"timeout" that doesn't actually stop anything.** When a database query runs
too long, the system gives up waiting and returns an error to the user — but the
query itself **keeps running in the background**, still holding one of a small,
fixed number of database connections (20 in production). So during a genuine slow
patch, the very safeguard meant to protect the database instead lets stuck
queries pile up and hold connections, which can tip a busy moment into a
full-blown outage. The code's own comment calls this a "hard timeout"; it is not.

Two smaller things: the connection-pool monitor **mislabels "getting busy" as
"ran out of connections"**, so the health dashboard an operator reads during an
incident can show alarming "exhaustion events" that never actually happened
(and, conversely, never shows the real thing). And **none of this
self-monitoring machinery has a single test** — if any of it silently broke, no
automated check would notice.

Nothing here loses customer data or leaks one tenant's data to another. The risk
is availability (staying up under load) and trustworthy operations (believing
your own dashboards), not corruption or a breach.

---

## 2. Verdict

Healthy foundations, one load-bearing crack. The logging redaction, health
endpoints, request correlation (`requestId`/`traceId`), and shutdown ordering are
genuinely good and above the bar for a young platform. The defect that matters is
the query-timeout illusion (H-1): it is the kind of thing that looks correct in
review and in normal operation, and only bites under the exact conditions
(sustained slow queries) where you most need it to work — a textbook example of
the "retry/timeout logic that looks right but has no real bound" failure mode.
The pool-monitor mislabelling (M-1) and the total absence of tests (M-2) are the
supporting cast. No BLOCKER; no cross-tenant, money, audit-chain, or PII-storage
issue in this subsystem.

---

## 3. Findings

### HIGH

#### H-1 — The query "hard timeout" abandons the client but never cancels the database query, so a slow query holds its pool connection for its full real duration

- **Where:** `apps/api/src/lib/trpc.ts:209-238` (the `Promise.race` timeout) plus
  `packages/db/src/client.ts:101-116` (postgres.js options — **no
  `statement_timeout` set**).
- **Offending code** (trpc.ts:213-226):
  ```ts
  if (type === "query") {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new TRPCError({ code: "TIMEOUT", ... })),
        QUERY_HARD_LIMIT_MS,           // 8_000 in prod
      );
      ...
    });
    result = await Promise.race([next(), timeoutPromise]);
  }
  ```
  `Promise.race` resolves as soon as the timeout rejects, but `next()` — which is
  running the actual Drizzle/postgres.js query — is **not** cancelled. There is no
  `AbortController`, no `statement_timeout`, and no `pg_cancel_backend`. The DB
  connection stays checked out until the query finishes on its own. The comment at
  trpc.ts:209 ("Hard timeout for queries") and trpc.ts:185 ("[TIMEOUT] warnings")
  describe a bound the code does not enforce.
- **Concrete failure scenario:** A reporting query on a large tenant (say a
  `command_center` aggregate over millions of rows) takes 40s under load. At the
  8s mark, every client waiting on it gets `TIMEOUT` and retries. Each retry
  launches *another* 40s query holding *another* of the 20 pool connections; none
  of the abandoned originals release. Within a few retry rounds all 20 connections
  are pinned by zombie queries the app already gave up on, `connect_timeout` (15s)
  starts firing for every *other* request, and the whole API stalls — precisely
  the cascade the timeout was meant to prevent. The pool-pressure warning
  (client.ts:125) fires, but nothing sheds the load.
- **What this means in practice:** Your database has a small, fixed number of
  "lanes." The timeout is supposed to pull a stuck car out of a lane; instead it
  just stops watching the stuck car while it keeps blocking the lane. Under real
  load this converts a slow query into an outage. Setting a DB-level
  `statement_timeout` (so Postgres actually kills the query) is what makes the
  timeout real.

---

### MEDIUM

#### M-1 — The pool monitor counts "≥85% busy" as an "exhaustion event"; the real exhaustion path (connection-acquisition timeout) is never detected, despite the comment claiming it is

- **Where:** `packages/db/src/client.ts:125-138` (increments
  `_exhaustionEventCount` on the 85% *pressure* threshold) vs the docstring
  `client.ts:93` ("Logs a `[POOL_EXHAUSTION]` error when connect_timeout fires").
- **Offending code** (client.ts:125-136): the only thing that ever increments
  `_exhaustionEventCount` is crossing the 85% pressure line — a *warning* level,
  not an outage. There is **no** handler for an actual `connect_timeout` /
  `CONNECT_TIMEOUT` postgres.js error, and no `[POOL_EXHAUSTION]` log is emitted
  anywhere (grep: the string does not exist in the client). The `apply` trap
  (client.ts:119-155) counts queries *dispatched*, not connections *acquired*, so
  a request that blocks 15s waiting for a free connection and then throws is
  invisible to this counter.
- **Concrete failure scenario:** During the H-1 cascade, `/health/detailed`
  (index.ts:617 surfaces `getPoolStats()`) reports `exhaustionEvents: 0` even
  though real requests are timing out on connection acquisition — while, on a
  merely busy-but-healthy day, it reports `exhaustionEvents: 12` because the pool
  briefly touched 85%. An operator reading the dashboard during an incident is
  told the pool is fine when it is failing, and cried-wolf when it is fine.
- **What this means in practice:** The gauge you'd stare at during an outage is
  measuring the wrong thing and labelling it with the scary word. It will mislead
  exactly when it matters. This is MEDIUM (a monitoring-fidelity defect, not a
  data defect), but it directly undercuts diagnosing H-1.

#### M-2 — The entire observability-health subsystem has no tests

- **Where:** no spec exercises `runDetailedChecks`/`/health/detailed`/`/ready`
  (index.ts:578-627), the metrics store (`metrics.ts`), `evaluateHealth`
  (`healthMonitor.ts`), the query-timeout / SLOW_REQUEST middleware
  (trpc.ts:195-283), the rate limiter (index.ts:276-336), or the pool monitor
  (`client.ts`). Verified: `apps/api/src/lib/**/*.test.ts` → none; grep for
  `evaluateHealth|getMetricsSnapshot|recordRequest|QUERY_HARD_LIMIT|runDetailedChecks`
  across all `*.test.ts` → no matches. (`metric-visuals.test.ts` covers
  business-KPI visuals in `packages/metrics`, not this request/latency core.)
- **Concrete failure scenario:** A future refactor inverts the `allOk` logic in
  `runDetailedChecks` (index.ts:609) so `/ready` returns 200 while the DB is down,
  or flips `reply.status(allOk ? 200 : 503)` (index.ts:618). CI stays green
  because nothing asserts a degraded dependency yields 503. Kubernetes then keeps
  routing traffic to a pod that cannot reach its database. Per quality-bar Tests
  rule ("A test that would still pass with the logic inverted is a finding"),
  every branch here is worse than that — it has no test at all.
- **What this means in practice:** The safety net has no safety net. The health
  and metrics code is the thing your deploy system trusts to decide "is this
  server OK to send users to"; right now that decision logic could break and ship
  unnoticed.

---

### LOW

#### L-1 — The per-request HTTP log records the raw URL including query string, which can carry PII if a tRPC query is ever issued over GET

- **Where:** `apps/api/src/index.ts:471-478` — the `onResponse` REQUEST log writes
  `url: req.url` verbatim (full query string), and the rate-limit log
  (index.ts:319) and rate-limit key both use `req.url`.
- **Why it is only LOW:** the web client uses `httpLink` (not `httpBatchLink`) —
  `apps/web/src/lib/trpc.ts:76` — which sends **all** tRPC queries and mutations as
  **POST**, so inputs ride in the request body, not the URL. On the normal path the
  logged `req.url` is just `/trpc/hr.searchUsers` with no input. So there is no
  *realized* PII-in-log today.
- **Concrete failure scenario (latent):** The Next.js proxy forwards GET query
  strings verbatim (`apps/web/src/app/api/trpc/[...path]/route.ts:37-40,68`). The
  day anyone switches a search query to GET (a common tRPC optimisation for
  cache-ability), or a direct/integration caller hits
  `GET /trpc/hr.searchUsers?input={"email":"jane@acme.com"}`, that email lands
  unredacted in the REQUEST log — the one class of data quality-bar rule #5 says
  must never appear in a log. `logger.ts` redaction covers headers/tokens but not
  the URL query string.
- **What this means in practice:** A safe-by-luck situation, not safe-by-design.
  Redacting or dropping the query string from the URL log (keep the path) removes
  the trap before someone flips a query to GET.

---

## 4. Root causes

1. **A timeout was modelled as "stop waiting" instead of "stop the work."** H-1
   and M-1 are the same misconception one layer apart: the app treats a promise
   settling as the operation ending. In an async runtime over a *pooled* resource,
   abandoning the promise doesn't free the resource — only cancelling the work
   (DB `statement_timeout`, or a connect-timeout handler) does. Both the fake
   query timeout and the query-count-based "exhaustion" gauge measure the app's
   *view* of work rather than the connection's *actual* state.

2. **Observability was built to be read by humans, not verified by machines.** The
   logs, health JSON, and metrics snapshots are well-shaped for an operator
   tailing output, but nothing asserts they are *correct* — hence M-2. The
   subsystem whose whole job is "tell the truth about system state" is the one
   piece with no test guaranteeing it tells the truth. This is the classic
   generated-code pattern: the happy-path output is polished; the failure-signal
   correctness was never exercised.

3. **Redaction was scoped to the obvious channels (headers, bodies, tokens) but
   not the URL.** L-1 falls out of assuming query inputs always travel in the
   body; the redaction layer never had to think about the URL because the current
   client makes that true — until it doesn't.

---

## 5. Recommended order of work (by blast radius)

1. **Make the query timeout real (H-1).** Set a Postgres `statement_timeout` on
   the pool (client.ts connection options) matched to `QUERY_HARD_LIMIT_MS`, so
   the DB actually kills the query and releases the connection when the app gives
   up. Biggest blast radius: it's the difference between "one slow query" and "an
   outage."
2. **Fix the pool gauge (M-1).** Stop incrementing `exhaustionEvents` on the 85%
   pressure line; add a real handler that counts actual connection-acquisition
   timeouts and emits the `[POOL_EXHAUSTION]` log the docstring already promises.
   Do this alongside H-1 so you can *see* whether H-1 is fixed.
3. **Give the health/metrics/timeout code tests (M-2).** At minimum: `/ready`
   returns 503 when a dependency check fails; `evaluateHealth` flips
   DEGRADED/UNHEALTHY at its thresholds; the query middleware returns TIMEOUT past
   the limit. These are the branches an inverted refactor would silently break.
4. **Drop the query string from the URL log (L-1).** Cheap, removes a latent
   PII-in-log trap before a future GET query springs it.

---

## 6. Cross-references (already reported — not re-raised here)

- **`/internal/*` fail-open network trust** (`apps/api/src/index.ts:642-649`): the
  fallback that trusts the whole `10.`/`172.` range when `INTERNAL_API_TOKEN` is
  unset is already documented as **M-2 in
  `reports/audit-background-automation.md`**. One escalation to note for that
  ticket: because Fastify runs with `trustProxy: true` (index.ts:147), `req.ip` is
  taken from the client-supplied `X-Forwarded-For` chain, so a remote caller can
  send `X-Forwarded-For: 10.0.0.1` and pass the `isLocal` check from *outside* the
  private network — the fallback is weaker than "same network only." This belongs
  on the existing M-2, not as a new finding.

## 7. Not findings (verified and cleared)

- **Rate-limit fail-open on Redis down** (`skipOnError: true`, index.ts:284): a
  documented, deliberate availability-over-enforcement tradeoff with no corruption
  or leak scenario. Noted, not a defect.
- **Logging redaction** (`logger.ts:11-20, 263-282`): tokens reduced to an 8-char
  SHA-256 prefix, PG `detail`/`hint` stripped, input values never logged. Sound.
- **No `uncaughtException`/`unhandledRejection` handler:** Node's default
  crash-on-unhandled-rejection is a defensible posture behind a process manager
  that restarts; no concrete corruption scenario in this subsystem, so per the
  evidence rule it is not raised.

_No BLOCKER found. Highest severity is HIGH (H-1). No source files were modified._
