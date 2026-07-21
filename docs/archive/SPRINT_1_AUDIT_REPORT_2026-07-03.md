# Sprint 1 — Build Audit Report

**Date:** 2026-07-03
**Scope:** Sprint 1 "compliance foundations + payroll depth" from `docs/PLATFORM_GAP_INDEX_2026-07-03.md`, **excluding** the GRC Add-on (₹25k) and GRC Advanced (₹50k) product tiers.
**Branch:** `main` — **7 commits ahead of `origin/main`, NOT pushed** (pushing auto-deploys to Vultr and requires user approval; take a snapshot first per CLAUDE.md).
**Test DB:** PostgreSQL `coheronconnect_test` on port 5433.

---

## 1. Executive summary

All **7 planned Sprint 1 items are complete**, each shipped as a single focused
commit with invariant tests that pass against a real Postgres and a clean
`tsc --noEmit`. Two architecture decisions confirmed at kick-off were honoured:
(a) DPDP RBAC = a **new `compliance` module + `privacy_officer` role** (not bolted
onto legal/grc), and (b) payroll depth = **engine + monthly accrual provisioning
now** (gratuity and leave both accrue month-over-month, not just a point-in-time
calculator).

Combined Sprint 1 test surface: **9 new test files, 116 tests, all green** —
**94 API-integration tests** (7 files, real Postgres) + **22 pure-math tests**
(2 files, `packages/payroll-math`). Five additive DB migrations (`0016`–`0020`)
were generated, applied, and their snapshots + journal entries committed. No
existing suites regressed.

| # | Item | Type | Commit | Tests |
|---|------|------|--------|-------|
| 1.0 | RBAC scaffolding — `compliance` module + `privacy_officer` role | feat | `85077d7` | 6 |
| 1.1 | DPDP data-subject request (DSR) lifecycle | feat | `61aa65b` | 9 |
| 1.2 | DPDP consent ledger | feat | `a14b6bd` | 7 |
| 1.3 | DPDP personal-data breach register + deadline clock | feat | `cdedc7b` | 12 |
| 1.4 | Gratuity engine — accrual provisioning + settlement | feat | `c2468b1` | 9 + 10 |
| 1.5 | Leave accrual / carry-forward / encashment engine | feat | `4d58343` | 12 + 12 |
| 1.6 | Regulatory refresh — Finance Act 2025 New-Regime tax | feat | `35bdb30` | 39 (in-suite) |
| | **Total** | | **7 commits** | **116** |

> Test-count notation `A + B` = API-integration tests + pure-math tests for the
> same item. For 1.6 the 39 count is the full `india-payroll-engine` suite that
> now asserts the refreshed constants (4 new regression tests + existing cases
> re-baselined to FY2025-26).

---

## 2. Item-by-item detail

### 1.0 — Compliance module + privacy_officer role — `feat(rbac)` `85077d7`
- **Gap:** DPDP work needs its own access boundary; there was no `compliance`
  module and no data-protection role. Folding it into `legal`/`grc` would have
  over-granted (any legal user could action data-subject requests).
- **Change:** `packages/types/src/rbac-matrix.ts` — new `compliance` module and a
  `privacy_officer` matrix role that **owns** compliance (read/write/admin) and
  gets *read* visibility into `legal` (privacy matters) but **no** write to
  legal/grc/security. `legal_counsel` gets collaborative compliance read/write;
  `company_secretary` does not by default; `admin` short-circuits to full access.
- **Invariant preserved:** the base `requester` role is unchanged; effective-role
  resolution (`db_role` + `matrix_role`) still composes additively.
- **Tests:** `compliance-rbac.test.ts` (6) — privacy_officer ownership, the
  legal-read / no-legal-write boundary, `checkDbUserPermission` gating compliance
  behind privacy_officer, admin short-circuit, legal_counsel vs company_secretary.

### 1.1 — DPDP data-subject request lifecycle — `feat(compliance)` `61aa65b` (migration 0016)
- **Gap:** the DPDP Act gives data principals rights (access, correction, erasure,
  grievance) with a statutory response window; the platform had no request
  intake, no status machine, and no deadline tracking.
- **Change:** new `complianceRouter` (`apps/api/src/routers/compliance.ts`) with a
  DSR sub-router: create → acknowledge → in-progress → complete/reject, each
  transition validated (no illegal jumps), tenant-scoped, and audit-logged. A
  response-due timestamp is stamped at intake and surfaced in the list feed.
  Schema added to `packages/db/src/schema/issuer-programme.ts`; registered in
  `routers/index.ts`. Reads gate on `compliance:read`, mutations on
  `compliance:write`.
- **Tests:** `dpdp-dsr.test.ts` (9) — lifecycle happy path, illegal-transition
  rejection, deadline stamping, tenant isolation, and RBAC denial for a
  non-privacy user.

### 1.2 — DPDP consent ledger — `feat(compliance)` `a14b6bd` (migration 0017)
- **Gap:** DPDP requires a defensible record of *what* a data principal consented
  to, *when*, for *which purpose*, and a withdrawal trail — none existed.
- **Change:** `compliance.consent` sub-router — record consent (purpose, basis,
  version), withdraw (writes a withdrawal event without mutating history), and a
  point-in-time "current status per purpose" projection over the append-only
  ledger. Tenant-scoped, audit-logged. Schema in `issuer-programme.ts`.
- **Invariant preserved:** the ledger is **append-only** — withdrawals add rows,
  never delete, so the historical consent state is always reconstructable.
- **Tests:** `dpdp-consent.test.ts` (7) — record, withdraw, current-status
  projection across multiple purposes, idempotent re-record, tenant isolation,
  RBAC denial.

### 1.3 — DPDP breach register + deadline clock — `feat(compliance)` `cdedc7b` (migration 0018)
- **Gap:** breach handling existed only as loosely-structured "breach profiles";
  there was no register with a regulator/data-principal **notification deadline
  clock** as DPDP requires.
- **Change:** `compliance.breach` sub-router — register a breach (severity,
  affected-count, discovery time), which **derives notification deadlines** from
  the discovery timestamp; advance through triage → notified → closed; and a feed
  that flags breaches whose notification window is approaching or breached. The
  legacy breach-profile shape was extended into a first-class register.
  Tenant-scoped, audit-logged.
- **Tests:** `dpdp-breach.test.ts` (12) — registration + deadline derivation,
  status progression, overdue-notification flagging, severity handling, tenant
  isolation, RBAC denial.

### 1.4 — Gratuity engine — `feat(payroll)` `c2468b1` (migration 0019)
- **Gap:** "Payment of Gratuity Act" liability was neither computed nor provisioned;
  there was no accrual on the books and no settlement path at exit.
- **Change (pure-math):** `packages/payroll-math/src/gratuity.ts` — `computeGratuity`
  per the statutory formula **(15 / 26) × last-drawn (Basic+DA) × completed years**,
  with the ≥5-year eligibility rule, rounding of service years (≥6 months rounds up),
  and the **₹20,00,000 statutory cap** (current ceiling). Exported from
  `payroll-math/src/index.ts`.
- **Change (persistence):** `gratuityRouter` (`apps/api/src/routers/gratuity.ts`)
  with monthly **accrual provisioning** (idempotent per employee-month, projected
  onto a running provision) and **settlement** at exit (eligibility check, final
  amount, capped). Tables `gratuity_accruals` / `gratuity_settlements` in
  `schema/hr.ts`. Reads `hr:read`, mutations `hr:approve`.
- **Invariant preserved:** the ₹20L cap is enforced in the pure-math layer, so
  every consumer (accrual + settlement) inherits it.
- **Tests:** `gratuity.test.ts` (API, 9) — accrual idempotency, settlement
  eligibility (<5yr refused), cap enforcement, tenant isolation, RBAC denial;
  `payroll-math/src/gratuity.test.ts` (pure, 10) — formula, rounding bands,
  eligibility, cap boundary.

### 1.5 — Leave accrual / carry-forward / encashment — `feat(hr)` `4d58343` (migration 0020)
- **Gap:** leave was tracked as a static balance with no accrual policy, no
  year-end carry-forward/lapse rules, and no encashment path.
- **Change (pure-math):** `packages/payroll-math/src/leave-accrual.ts` —
  `computeMonthlyLeaveAccrual` (annual/12 or explicit monthly rate, pro-rated by
  a clamped join-fraction), `computeCarryForward` (cap + lapsed remainder),
  `computeLeaveEncashment` ((Basic+DA)/26 default per-day wage, or direct rate;
  returns 0 when not encashable). `roundDays` to 1 decimal.
- **Change (persistence):** `leaveAccrualRouter`
  (`apps/api/src/routers/leave-accrual.ts`) — **policy** (list/upsert, one per
  org+type), **accrual** (idempotent per emp+type+year+month, projected onto
  `leave_balances`, plus `accrueAll` over the active roster), **close** (preview +
  run: writes `carry_forward`+`lapse` events and seeds next-year opening balance,
  blocked from double-close), **encash** (preview + run: negative-day event +
  amount, draws down balance, refused when policy not encashable). New tables
  `leave_policies` / `leave_accrual_events` in `schema/hr.ts`. Reads `hr:read`,
  mutations `hr:approve`.
- **Design note:** `leave_accrual_events` has a unique index on
  `(employee_id, type, event_type, year, month)`; `month` is nullable so
  carry_forward/lapse/encashment events (month = NULL, treated as distinct by
  Postgres) never collide while monthly accruals (month set) get true idempotency.
- **Tests:** `leave-accrual.test.ts` (API, 12) — policy upsert idempotency,
  accrual + balance posting, period idempotency (no double-count across re-runs),
  pro-ration, `accrueAll`, no-policy rejection, carry-forward with lapse + next-year
  seed, double-close block, encashment + drawdown, non-encashable refusal, tenant
  isolation, RBAC denial; `payroll-math/src/leave-accrual.test.ts` (pure, 12) —
  accrual math, pro-ration clamps, carry-forward cap/lapse, encashment formula +
  guards.

### 1.6 — Regulatory refresh (Finance Act 2025 New-Regime) — `feat(payroll)` `35bdb30`
- **Gap:** the canonical India tax engine still carried the FY2024-25 New-Regime
  slab table and the old ₹25,000 / ≤₹7L Section 87A rebate.
- **Change:** `packages/payroll-math/src/tax-engine.ts` (the engine consumed by
  the payroll router and Form-16 via the `india-tax-engine` re-export shim):
  - New-Regime slabs rebuilt to the **7-band Finance Act 2025** structure —
    0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%
    (basic exemption raised to **₹4L**).
  - Section 87A rebate raised to **₹60,000 for taxable income ≤ ₹12L**, making a
    ₹12L taxable / ~₹12.75L gross salary fully tax-free.
  - Standard deduction (₹75k New / ₹50k Old), surcharge bands, and 4% cess were
    already current and are unchanged.
- **Verification of downstream breakage:** several existing `india-payroll-engine`
  cases went to zero TDS after the refresh — this is **correct** FY2025-26 behaviour
  (the higher rebate ceiling makes mid-income employees tax-free). Those cases were
  re-baselined to salaries above the ceiling where the intent was to exercise
  positive TDS, and a **"Finance Act 2025 — New-Regime slab & rebate refresh"**
  regression block was added to lock the new constants (₹12L fully rebated, rebate
  withdrawn at ₹12,00,100, ₹4L exemption nil, ₹20L → ₹2,00,000 tax).
- **Tests:** `india-payroll-engine.test.ts` — **39 tests** (whole suite green,
  including the 4 new regression tests).
- **Statutory deductions (read-only verification):**
  `packages/payroll-math/src/statutory-deductions.ts` was audited — PF (₹15k
  ceiling / 12% / EPS 8.33% / EPF 3.67% / EDLI + admin), ESI (₹21k ceiling /
  0.75% / 3.25%), PT slabs (MH/KA/TN/TG/WB/DL/GJ) and LWF rates are all current
  for FY2025-26. **No change required.**

---

## 3. Database migrations

| Migration | Adds | Applied to 5433 | Journal + snapshot |
|-----------|------|-----------------|--------------------|
| `0016_damp_quasar.sql` | DPDP DSR tables | ✅ | ✅ |
| `0017_groovy_brother_voodoo.sql` | DPDP consent-ledger tables | ✅ | ✅ |
| `0018_worthless_bastion.sql` | DPDP breach-register tables | ✅ | ✅ |
| `0019_mysterious_edwin_jarvis.sql` | `gratuity_accruals` / `gratuity_settlements` | ✅ | ✅ |
| `0020_cold_xavin.sql` | `leave_policies` / `leave_accrual_events` (+ enum) | ✅ | ✅ |

All five are **additive** (new tables / enums / indexes) — no data backfill, no
destructive DDL. `pnpm check:migrations` reports the journal in sync. FK
`onDelete` choices follow `docs/DATA_MODEL.md`: `org_id → organizations` CASCADE,
child → parent CASCADE, nullable actor (`created_by_id → users`) SET NULL.
Sprint 1.6 (tax refresh) touched only `packages/payroll-math` and a test — **no
migration**.

---

## 4. Verification performed

- **Typecheck:** `tsc --noEmit` (apps/api) clean after every item.
- **API tests:** the 7 Sprint 1 API suites re-run together —
  **7 files, 94 tests, all passing** (~97s):
  compliance-rbac (6), dpdp-dsr (9), dpdp-consent (7), dpdp-breach (12),
  gratuity (9), leave-accrual (12), india-payroll-engine (39).
- **Pure-math tests:** `packages/payroll-math` — gratuity (10) + leave-accrual (12) =
  **22 passing**.
- **Migration journal:** `pnpm check:migrations` — in sync.
- **Rebuilds:** `packages/db` rebuilt after each schema change; `packages/payroll-math`
  and `apps/api` dist rebuilt after the gratuity/leave/tax changes so consumers
  (payroll router, Form-16, web `AppRouter` type) saw the new exports.

Reproduce the API suite from `apps/api`:
```
DATABASE_URL="postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test" \
  npx vitest run compliance-rbac dpdp-dsr dpdp-consent dpdp-breach \
  gratuity leave-accrual india-payroll-engine
```
Reproduce the pure-math suite from `packages/payroll-math`:
```
npx vitest run gratuity leave-accrual
```

---

## 5. Scope notes, carry-overs & follow-ups

- **Duplicate tax engine (Phase-5).** A second, divergent tax engine exists at
  `apps/api/src/lib/india/payroll-engine.ts` with its own (still-old) New-Regime
  slabs and its own tests. Sprint 1.6 deliberately refreshed **only** the canonical
  `packages/payroll-math` engine (the one wired into the payroll router + Form-16).
  Consolidating the two — deleting the duplicate and pointing its callers at the
  canonical engine — is a **Phase-5 money-math consolidation** task and is left
  untouched here.
- **GRC tiers excluded.** Per the standing instruction, the GRC Add-on (₹25k) and
  GRC Advanced (₹50k) product tiers are out of scope for this build. The
  `compliance` module shipped here is the DPDP core, not those paid tiers.
- **UI/worker surfacing.** DSR/consent/breach feeds, gratuity provisions, and leave
  accrual events are **API-complete**; surfacing them in `apps/web` and wiring the
  breach-deadline / DSR-due clocks into the alerting worker are downstream tasks.
- **Carried from Sprint 0 (still open):** CMDB cycle detection
  (`assets.cmdb.getTopology` has no cycle guard). **Parked for Sprint 2:**
  GST-on-invoice-entry (`financial.createInvoice` should run `computeGST()`).

## 6. Git / deploy state

- **7 commits ahead of `origin/main`** (`85077d7`…`35bdb30`); **nothing pushed**.
  Push (→ Vultr auto-deploy) awaits explicit user approval, and a snapshot/backup
  should be taken first per CLAUDE.md.
- Pre-existing unrelated working-tree changes (`apps/docs/*`, `docs-word/`,
  `scripts/gen-gap-docx.py`, `vendor-esign-detail.png`) were left untouched
  throughout Sprint 1.
