# Tenant Isolation — Audit

Subsystem: **tenant-isolation** (the wall that stops one customer seeing another
customer's data)
Audited against: `docs/quality-bar.md` (rules 1 & 2, "Security", "Multi-tenancy")
Date: 2026-07-31
Scope: standing code at migration head `0059_volatile_midnight` — not a diff.

---

## 1. In plain English

The system has **two walls** protecting one customer's data from another. The
first wall is a filter the code adds to every database question ("only show me
rows belonging to *this* customer"). The second wall is a safety net inside the
database itself (called Row-Level Security, or RLS) that blocks cross-customer
rows even if a programmer forgets the filter. Both walls are meant to stand
behind each other so that a single human mistake can't leak data.

The good news: the first wall is applied consistently — I checked, and every
place these tables are queried carries the correct customer filter. The second
wall works and is genuinely tested for the tables it covers.

The problem: **the second wall has three holes.** Three tables added after the
safety net was built — staff shift schedules, and two India statutory tax
records (ESI and Professional Tax challans) — never got the safety net switched
on. Today they are protected by the first wall only. If any future code change
forgets the customer filter on one of these three tables, one company could
read or overwrite another company's payroll-tax filings, and **nothing would
stop it and no test would notice** — the isolation tests only check one
unrelated table.

The one thing to fix first: **add the missing safety net (RLS policy) to those
three tables**, and add a test that checks *every* customer-owned table has the
net, so this can't silently happen again. Separately, the super-admin
"impersonate a user" button is unfinished and writes no audit record — worth
knowing before it is wired up.

---

## 2. Verdict

The tenant-isolation design is sound and, for the ~191 tables it covers, the
two-wall model holds and is proven by a real database-level test. The subsystem
is **not currently leaking data** — the app-layer filter is present at every
site I traced. The health problem is **coverage drift**: the RLS second wall is
provisioned by a one-time migration (`0052`) that enumerated the tables that
existed *then*, and three tenant tables added in later migrations
(`0053`, `0055`) were never added to it. Because no test enumerates tenant
tables against `pg_policies`, that drift is invisible. This is a
defense-in-depth regression, not an active breach: severity **HIGH**, not
BLOCKER, because the first wall is currently intact on all three tables. The
super-admin impersonation stub is a separate, lower-severity concern.

---

## 3. Findings

### HIGH

#### H-1 — Three tenant tables have no RLS policy (second wall missing)

**Evidence.**
- Migration `0052_odd_forgotten_wall.sql` creates the `tenant_isolation` policy
  on **191 tables** (`grep -c 'CREATE POLICY "tenant_isolation"'` → 191).
- Migrations `0053`–`0059` create **zero** policies
  (`grep 'CREATE POLICY|ENABLE ROW LEVEL|FORCE ROW LEVEL' 005[3-9]*.sql` → no
  matches).
- But those later migrations add three **tenant-owned** tables (`org_id uuid
  NOT NULL`, FK → `organizations`, `ON DELETE cascade`):
  - `shift_schedules` — `packages/db/drizzle/0053_redundant_mojo.sql:1,3`
    (schema: `packages/db/src/schema/hr.ts:719`)
  - `esi_challan_records` — `packages/db/drizzle/0055_lean_centennial.sql:2,4`
    (schema: `packages/db/src/schema/india-compliance.ts:407`)
  - `pt_challan_records` — `packages/db/drizzle/0055_lean_centennial.sql:21,23`
    (schema: `packages/db/src/schema/india-compliance.ts:442`)
- Migration `0052` uses `ALTER DEFAULT PRIVILEGES … GRANT SELECT,INSERT,UPDATE,
  DELETE ON TABLES TO app_runtime`, so these three tables **do** auto-receive
  DML grants for the runtime role — but `ALTER DEFAULT PRIVILEGES` does **not**
  create policies. So `app_runtime` can read/write all rows of these three
  tables with **no row filter**, because `FORCE ROW LEVEL SECURITY` and a
  `tenant_isolation` policy were never applied to them.

**Concrete failure scenario.** A developer adds a new query in
`routers/india-compliance.ts` — say a cross-org "all ESI challans due this
month" admin view — and omits `eq(esiChallanRecords.orgId, org.id)` (an easy
miss; it is the single most common bug class in this codebase per `CLAUDE.md`).
On the ~191 policied tables the RLS net catches this and returns only the
caller's rows. On `esi_challan_records` there is no net: the query executes as
`app_runtime` inside the `rlsTenant` transaction, the GUC is set, but with no
policy on the table RLS does nothing — the caller receives **every org's** ESI
challan records (employee counts, contribution totals, challan numbers). The
same omission on an `update`/`delete` lets one tenant overwrite another
tenant's statutory filing status.

**What this means in practice.** For staff shift schedules and India ESI/PT tax
filings, the "belt and braces" is only a belt. One forgotten line of code = a
silent cross-customer data leak or tamper of payroll-tax records, with no
backstop and no alarm.

---

#### H-2 — No test verifies RLS coverage across tenant tables; the gap is invisible

**Evidence.**
- `apps/api/src/__tests__/rls-tenant-isolation.test.ts` is the only
  DB-level RLS test. It exercises exactly two tables: `announcements`
  (lines 82-149) and `statutory_ceilings` (lines 151-174).
- No test in `apps/api/src/__tests__/` queries `pg_policies`,
  `relrowsecurity`, or `relforcerowsecurity`
  (`grep 'pg_policies|relrowsecurity|relforcerowsecurity'` → no matches).
- The app-layer isolation tests (`tenant-isolation.test.ts`,
  `layer7-row-access.test.ts`) assert only through tRPC procedures that already
  carry `eq(orgId)`; they never drop to `app_runtime`, so they cannot detect a
  missing policy.

**Concrete failure scenario.** Every one of the 191 policies except
`announcements` and `statutory_ceilings` could be dropped and the entire test
suite would stay green. The suite therefore gave no signal when `0053`/`0055`
introduced H-1, and will give no signal the next time a tenant table is added
without a policy.

**What this means in practice.** The safety net is real but its coverage is
unmonitored. The one test that proves RLS works proves it for a single table
and implies — falsely — that it holds everywhere. This is exactly the
"tests assert what the code does, not what the requirement demands" failure
mode: the requirement is "every tenant table is policied," and nothing checks
that.

---

### MEDIUM

#### M-1 — Super-admin `startImpersonation` writes no audit record and mints a token nothing consumes

**Evidence.**
- `apps/api/src/routers/mac.ts:396-418` — `startImpersonation` signs a token
  with the regular app `JWT_SECRET`:
  `jwt.sign({ sub: targetUserId, impersonated: true, reason, exp }, jwtSecret)`
  and returns a `redirectUrl` of `…/app?token=<jwt>`.
- The string `"impersonated"` appears in **only that one file** across
  `apps/api/src` and `apps/web/src` (`grep -rln impersonated` → `mac.ts` only).
  The app authenticates by opaque **session token** hashed into the `sessions`
  table (`middleware/auth.ts:25`, `routers/auth.ts:81 createSession`); the app
  never calls `jwt.verify(token, JWT_SECRET)` to establish a session. So the
  minted token is inert — it cannot currently log anyone in.
- **No** `mac.*` procedure writes to `super_admin_audit_logs`
  (`grep 'superAdminAuditLogs' mac.ts` → no matches) — not for impersonation,
  org suspend/resume, session revocation, feature-flag flips, or billing edits.

**Concrete failure scenario.** Two-part. (a) Today the button is a no-op that
returns a dead token — a visible half-built feature (quality-bar rule 6: live
unfinished cross-tenant code). (b) When someone wires the token-exchange path to
make it functional, there is no audit-write scaffolding in place, so an operator
impersonating any user in any tenant would leave **no trace** in
`super_admin_audit_logs`. The most sensitive cross-tenant action in the product
would be unaccountable.

**What this means in practice.** The "log in as a customer's user" power is
half-built and, as designed, untraceable. It doesn't work yet — but the audit
gap is baked in, so it must be closed *before* the feature is finished, not
after.

---

#### M-2 — RLS policy is fail-open when the org GUC is unset; correct by design, but undocumented at the table level

**Evidence.**
- The `tenant_isolation` policy in `0052` is
  `USING (current_setting('app.org_id', true) IS NULL OR current_setting('app.org_id', true) = '' OR org_id = current_setting('app.org_id', true)::uuid)`.
  When the GUC is unset (NULL/empty) the policy admits **all** rows.
- This is deliberate: migrations, seeds and the BullMQ/Temporal workers run on
  the owner (superuser, RLS-exempt) connection and rely on app-layer `eq(orgId)`
  scoping — confirmed correct in `workflows/esiReturnWorkflow.ts:76,89`
  (every query carries `eq(esiChallanRecords.orgId, orgId)` /
  `eq(integrations.orgId, orgId)` from job data).

**Concrete failure scenario.** If a code path ever reaches a policied table
inside the `rlsTenant` transaction *without* the GUC set — e.g. a future
refactor that drops to `app_runtime` but forgets `set_config('app.org_id', …)`
— the policy silently returns all orgs' rows instead of failing closed. The
current `rlsTenant` middleware (`lib/trpc.ts:536-542`) always sets both together
so this cannot happen today, but the fail-open default means the safety net
degrades to "no net" on a subtle mistake rather than erroring loudly.

**What this means in practice.** The second wall trusts that the GUC is always
set. That trust is honored today, but the wall gives no warning if it ever
isn't — it just quietly opens.

---

### LOW

#### L-1 — Out-of-pipeline DB paths depend entirely on app-layer scoping (no RLS backstop)

Not a defect — recording it as the standing architecture so the next auditor
doesn't re-derive it. The following run on the owner (RLS-exempt) connection and
carry their own `eq(orgId)` scoping, which I verified is present:
- BullMQ workers: `workflows/esiReturnWorkflow.ts`, `ptChallanWorkflow.ts`
  (org_id threaded via job data; every query filtered).
- HTTP routes outside tRPC: `http/payroll-payslip-pdf.ts:107` scopes by
  `payslips.orgId = orgId AND employees.userId = userId`;
  `http/super-admin.ts:19-35` is `MAC_JWT_SECRET`-gated and intentionally
  cross-tenant; `/internal/*` routes are `X-Internal-Token`-gated
  (`index.ts:636`).

If any of these ever loses its `eq(orgId)` filter, there is no RLS net (they
don't drop to `app_runtime`). This is the accepted design (quality-bar rule 2
allows the owner connection for workers/migrations), so it is LOW — but it is
the reason the app-layer wall must never be treated as optional on these paths.

---

## 4. Root causes

Three symptoms above (H-1, H-2, M-2) collapse into **two** design decisions:

1. **RLS was bolted on as a one-shot snapshot, not an invariant.** Migration
   `0052` enumerated the tables that existed at that moment and policied them by
   hand. There is no generator, no `pnpm` check, and no test that ties "table
   has `org_id`" to "table has a `tenant_isolation` policy." So the second wall
   is only as current as the last person who remembered to extend `0052`-style
   SQL — and `0053`/`0055` didn't. Every future tenant table will silently
   inherit this hole. **This is the decision that matters most** — fix it and
   H-1 and H-2 both stop recurring.

2. **The isolation tests validate the design once, on a sample, instead of
   enforcing it as a rule.** Proving RLS on `announcements` demonstrates the
   mechanism works; it does nothing to guarantee the mechanism is *applied
   everywhere it must be*. The test encodes the happy path of the design rather
   than the requirement ("all tenant tables isolated").

M-1 (impersonation) is a separate root cause: a **cross-tenant feature was
scaffolded token-first and left half-wired**, with the audit-trail obligation
deferred rather than built in from the start.

---

## 5. Recommended order of work (by blast radius)

1. **Close H-1 + H-2 together (highest blast radius).** Write one corrective
   migration adding `ENABLE`/`FORCE ROW LEVEL SECURITY` + the `tenant_isolation`
   policy (USING + WITH CHECK, matching `0052`'s shape) to `shift_schedules`,
   `esi_challan_records`, `pt_challan_records`. Then add a test that queries
   `pg_policies`/`pg_class.relforcerowsecurity` and asserts **every** table with
   an `org_id` column has FORCE-RLS + a `tenant_isolation` policy. That test
   turns H-1 from "silent" into "the build goes red" and permanently kills the
   drift class. (Remediation is a separate task — this audit does not modify
   source.)

2. **Close M-1 before impersonation ships.** Make `startImpersonation` (and the
   other sensitive `mac.*` mutations: suspend, resume, revoke sessions, feature
   flags, billing) write a `super_admin_audit_logs` row, and decide the token
   model deliberately when the exchange path is built. Do this while the feature
   is still inert — the cost is near-zero now and unbounded later.

3. **Note M-2 for the RLS coverage test.** When writing the H-2 test, optionally
   assert the policy expression is present (fail-open default is acceptable per
   design, but the coverage test is the natural place to also confirm the policy
   text hasn't drifted).

L-1 needs no work — it is documented here so it isn't re-litigated.
