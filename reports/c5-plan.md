# C5 — Statutory rates → effective-dated config table (plan)

## The key discovery (changes what C5 is)

Half of C5 **already exists and is wired into live payroll.** There is an
effective-dated config table, a resolver, and an override-injection path that
`computeEmployeePayslip` already uses every run:

- **Table:** `statutory_ceilings` (`packages/db/src/schema/india-compliance.ts:324`),
  effective-dated (`effectiveFrom` / nullable `effectiveTo`), `orgId` NULL = platform
  default, non-null = per-org override. Seeded by migration `0054` (Labour Codes 2025).
- **Resolver:** `resolveStatutoryCeilings()` (`apps/api/src/lib/india/statutory-ceilings.ts`)
  — picks, per `(metricKey, stateCode)`, the row whose window contains the pay period;
  org-scoped beats platform default, latest `effectiveFrom` wins. **Returns `{}` when no
  row matches, so payroll-math falls back to its built-in constants** — behaviour
  unchanged.
- **Wired in:** `payroll.ts:401-405` resolves ceilings for the period and passes them into
  `computeEmployeePayslip(empInput, fyMonth, ceilings)` (`payroll.ts:424`).

**Already in the table today (do NOT rebuild):** PF wage ceiling, ESI wage ceiling, bonus
eligibility ceiling, PT slabs (per state), LWF rates (per state). The `metricKey` enum
(`india-compliance.ts:69`) currently holds exactly those five keys.

**Still hardcoded in `packages/payroll-math` (the real C5 work):**
- **Income tax** (`tax-engine.ts`): OLD slabs (85-90), NEW slabs (94-102), standard
  deduction (255/258), 87A rebate (299-304), surcharge bands (114-119), 4% cess (318),
  §80 caps (261-274). `computeTax(profile)` takes **no config argument** and branches on
  `regime` internally against these module constants.
- **PF/ESI *rates*** (`statutory-deductions.ts:96-101,137-139`): the ceilings are
  externalised but the *percentages* (PF 12% / 3.67% / 8.33% / 0.5% / 0.5%, ESI 0.75% /
  3.25%) are still constants.
- **Gratuity** (`gratuity.ts:26-33`): ceiling ₹20L, 5 years, 15/26 formula.

## What this means for scope

The infrastructure question C5 was raised to answer ("rates as data, not a release") is
**already solved for ceilings/PT/LWF**. C5's remaining job is to **extend the same,
proven mechanism to the income-tax rate set** (the pilot-relevant, most-likely-to-change
group), matching the plan's two explicit requirements:

1. **Prospective-only effective dating** — the existing table + resolver already give
   this (period-windowed selection; a new row with a future `effectiveFrom` never touches
   past periods). We inherit it for free by reusing the table.
2. **Two regime slab-sets held from the start** — the resolver already keys on
   `stateCode`; we reuse that column to hold `OLD` vs `NEW` as the discriminator, so both
   regimes' slabs live in the table simultaneously from day one. Regime *branching* stays
   C1's job; C5 only makes both slab-sets injectable.

I will scope C5 to **income-tax rates** (slabs both regimes, standard deduction, 87A
rebate, surcharge bands, cess) — that is the pilot-blocking, most-volatile set and the one
the plan calls out. I will **not** move PF/ESI percentages or gratuity constants in this
pass (they change rarely and are lower-risk); I'll record them as a follow-up so the
structure is there to absorb them later without re-engineering.

## Planned changes

### 1. DB — extend the enum + snapshot the tax config (`packages/db`)
- Add tax metric keys to `statutoryMetricKeyEnum` (`india-compliance.ts:69`):
  `income_tax_slabs`, `standard_deduction`, `rebate_87a`, `surcharge_bands`, `cess_rate`.
- Store each as a row using the **existing columns**: `slabsJson` for the array/object
  shapes (slabs, surcharge bands, per-regime rebate thresholds), `value` for scalars
  (cess rate). Use `stateCode` to carry the **regime** (`"OLD"`/`"NEW"`) for the
  regime-specific keys (slabs, standard deduction, 87A); `NULL` for regime-agnostic ones
  (surcharge, cess). No new columns needed.
- **Migration (hand-written seed, next number after the live head — read
  `_journal.json`):** insert platform-default (`orgId NULL`) rows whose values are the
  **current** in-code constants, `effectiveFrom` set to the FY start they already
  correspond to (NEW-regime FA-2025 values from 2025-04-01; OLD-regime from a stable past
  date). `ON CONFLICT` on the existing `statutory_ceilings_scope_unique_idx`, idempotent,
  mirroring 0054's style.
- Run `pnpm --filter @coheronconnect/db build` + `pnpm db:generate` for the enum change,
  then hand-write/verify the seed; `pnpm check:migrations`.

### 2. payroll-math — make `computeTax` accept an optional tax config
- Extend `StatutoryCeilingOverrides` (`statutory-deductions.ts`) with an optional
  `taxConfig?: { oldSlabs; newSlabs; stdDeductionOld; stdDeductionNew; rebate87aOld;
  rebate87aNew; surchargeBands; cessRate }` — **all optional**.
- Change `computeTax(profile)` → `computeTax(profile, taxConfig?)`. Inside, replace each
  module-constant read with `taxConfig?.X ?? <existing constant>`. The constants **stay**
  as the fallback default, so an absent/empty config = today's behaviour byte-for-byte.
- Thread `taxConfig` from `computeEmployeePayslip` (which already receives `ceilings`) into
  its `computeTax` call. No signature change at the payslip call site in `payroll.ts`
  (it already passes `ceilings`).

### 3. resolver — map the new metric keys (`statutory-ceilings.ts`)
- Add `case` arms for the five new `metricKey`s, assembling `overrides.taxConfig` from the
  rows (regime from `stateCode`, shapes from `slabsJson`, cess from `value`). Same
  "return `{}`/omit when absent → fallback" contract as today.

### 4. Tests (fairness, RED-before/GREEN-after)
- **Round-trip test:** seed a tax-slab row that **differs** from the in-code default (e.g.
  a distinct NEW top-rate boundary), run a payslip for that period, assert TDS reflects
  the **seeded** slabs, not the constant. Revert the resolver mapping → RED.
- **Prospective-only test (the plan's #1 requirement):** two periods, a rate row with
  `effectiveFrom` mid-year; assert the earlier period uses the old value and the later
  uses the new, and that recomputing the earlier period is unaffected.
- **Fallback test:** with no tax rows seeded, assert `computeTax` output equals the
  current constants (proves zero behaviour change for orgs with no config).
- **Two-regime test:** seed both OLD and NEW slab rows; assert each regime path reads its
  own row.
- Full API suite green (`pnpm docker:test:up`; background run).

### 5. Record in `reports/fix-plan.md`
- Mark C5 as done for the tax-rate set; note PF/ESI-rate and gratuity externalisation as
  an explicit follow-up (structure now exists to absorb them).

## What could break (honest risk list)

- **Silent recompute of history — the biggest risk, and the plan's hard rule.** The table
  is *already* consulted for every run, including re-runs of a past month. If a seed row's
  `effectiveFrom` is set wrong (too early), a *re-run* of a historical payroll would pick
  up a value the original run didn't have and silently change a filed figure. Mitigation:
  seed `effectiveFrom` to exactly match the date each current constant already legally took
  effect, and add the prospective-only test. **This risk exists because the mechanism is
  live — it is not introduced by C5, but C5's seed dates must be exact.**
- **Fallback contract must hold byte-for-byte.** If `computeTax`'s `?? default` wiring is
  wrong for any field, every org with no tax rows (i.e. everyone today) shifts. The
  fallback test guards this; the constants stay in code as the default.
- **Regime encoded in `stateCode`.** Reusing `stateCode` to mean "regime" for tax keys is
  a slight semantic overload of the column. It avoids a schema change and matches how PT
  already reuses `stateCode`, but it is a convention to document in the schema comment and
  the resolver, or a future reader will misread it.
- **`slabsJson` is an untyped blob** (`Record<string, unknown>`), cast at read time. A
  malformed seed (wrong key names) would resolve to `undefined` fields → silent fallback,
  not a crash. Tests must assert the seeded values actually take effect, not just "no
  error".
- **Enum migration ordering.** Adding `pgEnum` values needs the enum altered before the
  seed inserts them; Drizzle generates the `ALTER TYPE`. Must verify generate output and
  that the seed runs after it (statement-breakpoint ordering).
- **`packages/db` dist rebuild.** API won't typecheck against the new enum/exports until
  `pnpm --filter @coheronconnect/db build` runs (CLAUDE.md gotcha).
- **Surcharge marginal-relief coupling.** `computeSurcharge` closes over `slabs` via
  `baseTaxAt`. If slabs become config-driven, the marginal-relief helper must receive the
  **same** config-resolved slabs, or relief is computed against the wrong curve. I'll
  thread the resolved slabs through, not the constant.
- **Scope creep guard.** I am deliberately **not** touching PF/ESI percentages, gratuity,
  or §80 caps in this pass, and **not** implementing regime branching (C1). Doing so would
  widen the blast radius past what C5 needs for the pilot.

## Deploy note
No deploy implied. All work is code + a migration; nothing pushes. Vultr is down and we
cannot snapshot — I will not commit or push. The migration applies only when you next
deploy (with a backup), not now.
