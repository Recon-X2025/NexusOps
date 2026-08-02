# Audit — data-layer-migrations

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._

Scope: the Drizzle ORM + PostgreSQL data layer — the 48 schema modules
(236 tables), the foreign-key `onDelete` policy, the 60-file migration chain and
its journal/gate, the runtime migrator (`apps/api/src/migrate.ts`), and the
hand-written Row-Level Security (RLS) migration `0052` that is meant to be the
database-level "second wall" for tenant isolation. Governing rules:
quality-bar #1 (every tenant table is isolated by `org_id` **and** by RLS) and
#2 (the database — not just the app — is the source of truth for isolation).

---

## 1. In plain English

The schema and the delete rules are in good shape: money and child records
cascade or are protected exactly as the policy says, and the machinery that
applies database changes is safe — if an upgrade fails halfway it rolls the
whole thing back rather than leaving the database half-changed.

There is one real hole, and it matters because of what the product promises.
The system is designed with **two independent walls** against one customer
seeing another's data: the app always adds a "where org = me" filter, and the
database itself has a second, deeper rule (RLS) that blocks cross-customer rows
even if a developer forgets that filter. That second wall was installed once, by
hand, listing every table one by one. Since then, **three tables were added and
nobody added them to the list** — employee shift schedules, and the ESI and
Professional-Tax payroll-tax challans. For those three tables the second wall
simply does not exist. Today the app filter still protects them, so nothing is
leaking right now, but the whole point of the second wall is to catch the day
someone forgets the filter — and for these three tables there is nothing behind
it to catch that.

The reason this slipped through is the thing to fix first: the tool that is
supposed to warn when a table is missing its wall is **blind to walls entirely**
— it cannot see RLS at all, so it never warned. The three missing tables were
found only by manual cross-checking. Until that blind spot is closed, the next
new table will silently miss its wall the same way.

---

## 2. Verdict

The data layer is fundamentally sound: FK `onDelete` conformance is 100% (all 193
`org_id` foreign keys are `CASCADE`, per policy), the migrator wraps the entire
pending set in a single transaction so a mid-chain failure cannot leave a
partially-migrated schema, and the deletion-cascade tests assert real DB
constraint behaviour that would fail if a policy were inverted. The defect is
narrow and specific: the RLS "second wall" (`0052`) is a hand-maintained,
per-table list, and three tenant tables created *after* it (`shift_schedules`,
`esi_challan_records`, `pt_challan_records`) were never added — they carry
`org_id NOT NULL` but have neither RLS enabled nor a `tenant_isolation` policy.
The root cause is structural: RLS is applied in raw SQL that Drizzle's schema
snapshot does not model, so `db:generate` produces **zero** drift signal for it,
and the RLS test suite only exercises one table (`announcements`) — so a new
table missing its wall passes every gate green. This is a real breach of the
stated two-wall isolation invariant, currently backstopped only by the app-layer
filter still being present.

---

## 3. Findings

### BLOCKER

#### B-1 — Three tenant tables have no RLS policy: the "second wall" is absent for them

The RLS migration `packages/db/drizzle/0052_odd_forgotten_wall.sql` enables +
forces RLS and installs a `tenant_isolation` policy on **189** tables, one
`ALTER TABLE … ENABLE ROW LEVEL SECURITY` block at a time. Three tables that
carry `org_id` were created in later migrations and never added to any RLS
migration:

- `shift_schedules` — created `0053_redundant_mojo.sql`, `"org_id" uuid NOT NULL`
- `esi_challan_records` — created `0055_lean_centennial.sql`, `"org_id" uuid NOT NULL`
- `pt_challan_records` — created `0055_lean_centennial.sql`, `"org_id" uuid NOT NULL`

A repo-wide scan confirms **no migration anywhere** runs `ENABLE ROW LEVEL
SECURITY` or `CREATE POLICY` for these three. Method: extracted the 189
RLS-covered table names from `0052`, extracted the 192 `org_id`-bearing table
names from all `CREATE TABLE`/`ADD COLUMN` statements across `0000`–`0059`, and
diffed — the set difference is exactly these three.

**Concrete failure:** These are live, app-served tables.
`routers/india-compliance.ts:770-775` reads `esi_challan_records`,
`:868-873`/`:937` reads `pt_challan_records`, and `routers/hr.ts:84-86` reads
`shift_schedules` — today each with an explicit `eq(*.orgId, org.id)` predicate,
so the first wall holds. But the RLS test proves what the second wall is *for*:
`rls-tenant-isolation.test.ts:76-92` shows that on a covered table
(`announcements`), a raw `select … from announcements` with **no org predicate**
returns only the caller's rows. Run that same unfiltered query against
`shift_schedules` under a tenant session and it returns **every org's** shift
schedules, because there is no policy to constrain it. The moment any future
handler, report, background sweep, or ad-hoc query on these three tables omits
the `org_id` filter — the precise mistake RLS exists to backstop — it is an
immediate cross-tenant read of employee shift data and statutory ESI/PT challan
records (which include PF/ESI/tax financial figures). Quality-bar #2 states the
database is the source of truth for isolation; for these three tables it provides
none.

**What this means in practice:** The product's promise of a database-level
guarantee that customers cannot see each other's data is factually untrue for
three tables. Nothing leaks *today* only because the app filter happens to be
present on every current query; the safety net that is supposed to make that "if"
irrelevant is missing.

> Not accepted debt: `docs/GAP_ANALYSIS.md` and the quality-bar "Known accepted
> debt" list have no entry exempting any table from RLS; `0052`'s own header
> states RLS is applied to "every tenant table (those carrying an org_id
> column)" — these three are simply omitted, not consciously excluded.

### HIGH

#### H-1 — RLS drift is undetectable: the snapshot models no RLS, so `db:generate` never warns

`0052`'s header claims (lines 37-39): "the accompanying snapshot marks
`isRLSEnabled=true` so a later `db:generate` does not see drift." That claim is
false. Inspecting the Drizzle snapshots directly:
`meta/0052_snapshot.json` and the current head `meta/0059_snapshot.json` both
report **`isRLSEnabled=false` for every one of the 236 tables** — including
`announcements`, which *is* RLS-protected in the live DB. Zero tables in the
snapshot carry `isRLSEnabled=true`.

**Concrete failure:** Because the snapshot records RLS state as uniformly
false/absent, `pnpm db:generate` compares schema-to-snapshot and sees no RLS
anywhere, so it can neither emit RLS DDL for a new table nor flag that a new
table lacks it. This is the mechanism by which B-1 happened silently:
`shift_schedules` (0053) and the two challan tables (0055) were generated
normally, and no tool — not `db:generate`, not `check:migrations`, not the test
suite — produced any signal that they shipped without a wall. The next tenant
table added will miss its wall the same way, undetected.

**What this means in practice:** The one safeguard that should have caught the
missing walls is structurally blind to walls. Every future table is one
oversight away from the same gap, with no automated warning — the defect
regenerates itself.

#### H-2 — The RLS test asserts the mechanism on one table, not the requirement on every table

`rls-tenant-isolation.test.ts` imports and exercises exactly one tenant table,
`announcements` (line 20), across all its isolation cases (SELECT/INSERT/UPDATE/
DELETE, lines 76-149). It proves the `tenant_isolation` policy *works where it is
installed*. No test asserts that RLS is **installed on every table carrying
`org_id`** — e.g. by querying `pg_policies` / `pg_class.relforcerowsecurity`
against the full `org_id` table set.

**Concrete failure:** Invert the requirement — ship a tenant table with no RLS
policy (exactly B-1) — and the entire suite stays green, because it never looks
at that table. The test that is supposed to guard the two-wall invariant would
not have failed on the three unprotected tables, and did not.

**What this means in practice:** The isolation test gives false confidence: a
passing suite does not mean every table is walled, only that one representative
table is. This is why the gap reached the current migration head unnoticed.

### MEDIUM

#### M-1 — An edit to an already-applied migration silently never runs, and the gate won't catch it

The runtime migrator (`apps/api/src/migrate.ts:29`) calls Drizzle's `migrate()`,
which marks a migration "applied" by inserting a content `hash` keyed on the
journal's `created_at` timestamp into `__drizzle_migrations`
(drizzle-orm `pg-core/dialect.js:60-83`), and skips any migration whose timestamp
is not newer than the last applied. The journal gate
(`scripts/verify-migration-journal.mjs:25-35`) only checks that each `.sql` file
has a matching `tag` in `_journal.json` — **no content-hash comparison**
(confirmed by `CLAUDE.md`: "no hash check").

**Concrete failure:** A developer edits an already-shipped file, say
`0055_lean_centennial.sql`, to correct a column. On production (which already
applied `0055`), the migrator sees the timestamp is not newer and **skips it** —
the correction never runs. On a fresh/CI database, `0055` runs *with* the edit.
The two environments now have divergent schemas, and `pnpm check:migrations`
reports "in sync" in both because the tag still matches. The drift is invisible
until a query fails against whichever environment didn't get the change.

**What this means in practice:** Fixing a bug by editing an old migration file
appears to work locally but silently does nothing in already-migrated
environments — a classic way for production to quietly diverge from every other
database. Corrections must always be a *new* migration; nothing in the tooling
enforces that.

---

## 4. Root causes

1. **The second wall is a hand-maintained list with no automated backstop.**
   RLS is installed by enumerating tables in raw SQL (`0052`), a form Drizzle's
   schema model does not represent — so the snapshot shows RLS nowhere (H-1),
   `db:generate` can't emit or miss it, and the test suite checks only one table
   (H-2). Every one of these three safety nets is blind to RLS, so a table added
   without a wall (B-1) sails through all of them. The symptom (three unprotected
   tables) is downstream of this single design decision: security-critical state
   lives outside the tool that is supposed to guard it.

2. **Gates check presence, not content or completeness.** The journal gate
   verifies a file *exists in the list*, not that its content matches what was
   applied (M-1); the RLS test verifies a policy *works on a sample*, not that it
   covers the whole set (H-2). Both are "happy-path" checks — they confirm the
   thing that is there, and are silent about the thing that is missing or changed.

---

## 5. Recommended order of work (by blast radius)

1. **B-1 — add RLS (enable + force + `tenant_isolation` policy) to
   `shift_schedules`, `esi_challan_records`, `pt_challan_records`** in a new
   hand-written migration, restoring the second wall for the three exposed
   tenant tables. This is the one standing violation of the two-wall isolation
   invariant.
2. **H-1 / H-2 together — make the gap self-detecting.** Add a test that queries
   the live DB for every `org_id`-bearing table and asserts each has RLS forced
   and a `tenant_isolation` policy (closes H-2 and would have caught B-1). That
   test is the durable fix for H-1's blind snapshot — it is the drift signal the
   snapshot cannot provide.
3. **M-1 — enforce append-only migrations.** Add a content-hash check to
   `check:migrations` (or adopt Drizzle's own hash), so editing an
   already-journalled `.sql` fails the gate and forces a corrective new migration.

Sound as-is (no action):
- **FK `onDelete` policy** — all 193 `org_id` FKs are `CASCADE`; SET NULL /
  RESTRICT distribution matches the documented policy; `deletion-cascade.test.ts`
  asserts real constraint behaviour (CASCADE deletes, SET NULL clears, RESTRICT
  blocks) that fails if inverted.
- **Migrator transaction safety** — Drizzle wraps the entire pending-migration
  set in one `session.transaction` (`pg-core/dialect.js:60`), so a mid-chain
  failure rolls back completely; no partial-`0052` (mixed RLS state) is possible.
- **Journal ↔ file bijection** — every one of the 60 `.sql` files has a journal
  tag and vice versa (no orphans either direction); 60 snapshots for 60
  migrations.
- **`rlsTenant` middleware** (`apps/api/src/lib/trpc.ts`) — sets a
  transaction-local `app.org_id` GUC (parameterised) and `SET LOCAL ROLE
  app_runtime`, and `rls-tenant-isolation.test.ts` proves the role is
  non-superuser/non-BYPASSRLS and does not leak past the transaction.

---

_No source files were modified. This report reads and describes standing code only._
