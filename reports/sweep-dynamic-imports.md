# Sweep — dynamically resolved imports (2026-08-05)

**Scope:** the whole repo. **No code changes, no commit** — this is a read-only sweep.

**Why this sweep exists.** The second payroll engine
(`apps/api/src/lib/india/payroll-engine.ts`, "DUP-1") was classified as dead by an
earlier sweep. It is not dead. Every reference to it is a *dynamic* import — the code
literally writes `await import("../lib/india/payroll-engine.js")` at the moment it is
needed, rather than importing it at the top of the file. Tools that read the static
import graph (imports listed at the top of each file) never see these. So the engine
looked unreferenced, was called "dead," and shipped this week's payroll defects into a
live, money-writing path that nobody was auditing.

This sweep answers four questions:

1. Every runtime `await import()` / `require()` — what it pulls in, from where, and what
   reaches it.
2. Which of those reach money, database writes, or statutory output.
3. Whether any of them duplicate logic that lives elsewhere (the DUP-1 shape).
4. **(matters most)** Whether earlier sweeps missed findings because dynamic imports were
   invisible to them — and therefore which sweeps to re-run.

A plain-English note on terms:
- **Static import** = declared at the top of the file (`import x from "y"`). Visible to
  every tool.
- **Dynamic import** = `await import("y")` executed mid-function. Resolved only when that
  line runs. Invisible to a top-of-file scan.
- **`require(...)`** = the older Node form of the same idea; in this repo it appears only
  in build tooling, tests, and commented-out lines — never in the live request path.

---

## 1. Inventory — every dynamically resolved import

### Method

Counted across the whole tree:
- `await import(` — **168** occurrences.
- `.then(` on an `import(...)` (the promise form of the same thing) — **8** occurrences.
- `require(` — **25** occurrences, **all** in build scripts, ESLint configs, test scratch,
  or commented-out code. **None in a live request path.** (Listed in the coverage section
  so "clean" can be told apart from "unchecked.")

The 168 `await import(` figure includes type-only positions (e.g.
`import("mongodb").Db` used as a type annotation, `import("prettier").Config` in JSDoc)
that never execute. Those are not runtime imports and are excluded from the tables below.
What remains — the imports that actually run and pull code in at request time — lives
almost entirely in **`apps/api/src`**. Everything else is clean (see coverage).

### 1a. The money / DB / statutory dynamic imports (apps/api/src)

| # | Import site (file:line) | Pulls in | Reached by (the caller) |
|---|---|---|---|
| D1 | `routers/hr.ts:1417` | `computeMonthlySalarySlip, computeTaxOld, computeTaxNew` from `india/payroll-engine.js` | `hr.payroll.computeCurrentSlip` (read-only preview) |
| D2 | `routers/hr.ts:1482` | `computeTaxOld, computeTaxNew` from `india/payroll-engine.js` | `hr.payroll.computeTax` (tax preview) |
| D3 | `routers/hr.ts:1522` | `computeMonthlySalarySlip` from `india/payroll-engine.js` | `hr.payroll.computeMonthlySlip` (single-employee slip) |
| D4 | `routers/hr.ts:1550` | `computeMonthlySalarySlip` from `india/payroll-engine.js` | **`hr.payroll.runMonthlyPayroll`** — the whole-company run that **INSERTs payslips and UPDATEs the payroll_run totals** |
| D5 | `routers/hr.ts:1673` | `formatECRFile` from `india/payroll-engine.js` | `hr.payroll.generateECR` (EPFO statutory return file) |
| D6 | `routers/india-compliance.ts:691` | `computeMonthlySalarySlip` from `india/payroll-engine.js` | India-compliance payroll preview path |
| D7 | `routers/payroll.ts:1048` | `generateBankFile` from `india/bank-file-generator.js` | `payroll.*` bank-file export (money output — the salary disbursement file the bank consumes) |

D1–D6 all resolve to the **same second engine**. D4 is the one that writes money to the
database. D5 produces a statutory return (EPFO ECR). D7 produces the bank disbursement
file.

### 1b. The infrastructure dynamic imports (apps/api/src) — not money, but on the request path

These lazy-load a module to defer a cost or break a cycle. They do not compute money, but
several sit *on top of* money/DB code, so they are listed for completeness.

| Import site | Pulls in | Purpose |
|---|---|---|
| `index.ts` (bootstrap) | mongo client / provider modules | conditional DB provider wiring at startup |
| `routers/accounting.ts` | db helpers | lazy DB access inside handlers |
| `routers/financial.ts` | db helpers | lazy DB access inside handlers |
| `routers/custom-fields.ts` | db helpers | lazy DB access inside handlers |
| `routers/assets.ts` | SAM reconciliation helper | lazy-load on demand |
| `routers/hr.ts` (OKR path) | okr-rollup helper | lazy-load on demand |
| workflow-enqueue sites (worker-queue producers) | BullMQ / job payload builders | enqueue statutory-filing jobs (ECR/ESI/PT) |

---

## 2. Which reach money, a DB write, or statutory output

| Import | Money? | DB write? | Statutory output? |
|---|---|---|---|
| D4 `runMonthlyPayroll` → `computeMonthlySalarySlip` | **Yes** — computes gross/net for every employee | **Yes** — inserts payslips, updates run totals | Feeds ECR/ESI/PT downstream |
| D1/D3/D6 → `computeMonthlySalarySlip` | **Yes** — computes the slip | No (preview) | No |
| D2 → `computeTaxOld/New` | **Yes** — computes TDS | No (preview) | No |
| D5 → `formatECRFile` | Indirect | No | **Yes** — EPFO ECR return file |
| D7 → `generateBankFile` | **Yes** — the disbursement amounts | No | **Yes** — bank salary file |

**The headline:** the dynamic-import layer is not incidental plumbing. It is the *only*
way the second payroll engine is reached, and one of those paths (D4) is a full,
production, money-writing payroll run. A static-import scan sees none of it.

---

## 3. Duplicate logic — the DUP-1 shape

The DUP-1 shape is "two implementations of the same statutory thing, one of them stale."
I checked every India money/statutory function that has more than one definition.

**Finding: exactly one true duplicate — and it is the second payroll engine.**

`apps/api/src/lib/india/` contains five engine-shaped files. Four of them are **re-export
shims** — a one-line `export * from "@coheronconnect/payroll-math"` that forwards to the
single canonical engine in `packages/payroll-math`. They are *not* duplicates; they exist
only to keep old import paths working:

| api/lib file | What it actually is |
|---|---|
| `india/gst-engine.ts` | **Shim** — `export * from "@coheronconnect/payroll-math"` + one thin state-name helper |
| `india/validators.ts` | **Shim** — pure re-export |
| `india-statutory-deductions.ts` | **Shim** — pure re-export |
| `india-tax-engine.ts` | **Shim** — pure re-export |
| **`india/payroll-engine.ts`** | **NOT a shim — a real second copy (416 lines), its own logic** |

So the consolidation onto `payroll-math` was done for four of the five India engine
files. `payroll-engine.ts` was left behind as a genuine second implementation — and it is
the one that writes money.

Concrete duplicated statutory logic inside it, and how it diverges from the canonical
engine:

| Logic | Canonical (`packages/payroll-math`) | Second engine (`india/payroll-engine.ts`) |
|---|---|---|
| Professional-tax slabs `PT_SLABS` | `statutory-deductions.ts:216` — has the ₹2,500 annual cap, Feb ₹300, correct KA/GJ/MH-female bands | `:19` — **stale**: no cap, no Feb top-up, wrong Gujarat bands, flat TN |
| HRA exemption `computeHRAExemption` | `tax-engine.ts:238` | `:74` — separate copy |
| Old/new tax slabs | effective-dated | `:114/:121` — **FY2024-25 hardcoded** |
| Surcharge | new-regime capped at 25% | `:140` — **37% for both regimes** (the PT3 defect) |
| s.87A rebate | with marginal relief | `:172/:214` — **flat, no marginal relief** (the PT5 defect) |
| HRA input | actual rent paid | `:336` — reads `input.rentPaidMonthly`, which the callers **never pass** → always 0 |

This is the same shape that produced the earlier `nxk_/nxo_` mismatch and the two
disagreeing gross computations: **two implementations of one statutory rule, silently
drifting.** Every fix shipped this week (PT slabs, surcharge cap, 87A marginal relief,
HRA) landed in the canonical engine. The second engine still carries the *old, wrong*
versions of all of them — and D4 can run it against real employees.

**No other true duplicate found.** `computeGST`, `reconcileGSTR2B`, `validateGSTIN`,
`validateDIN`, and `generateBankFile` each have a single definition.

---

## 4. Did earlier sweeps miss findings because of this blind spot? (matters most)

**Yes. This is a real coverage gap, and it is measurable.**

Across all nine existing sweep/audit files, the count of mentions of the second engine,
the phrase "dynamic import," or "second engine" is **zero** — with one partial exception
(the payroll-tax audit, addressed below). Nine sweeps claimed to cover payroll and money
paths; none of them saw the module that D4 executes.

Concrete misses, sweep by sweep:

**`sweep-phantom-fields.md` — would have caught a finding, and didn't.**
A phantom field is "a column or input the code reads but nothing ever populates." The
second engine reads `input.rentPaidMonthly` (`payroll-engine.ts:336`); no caller ever
passes it, so HRA exemption is computed against a rent of 0 for every employee. That is
*exactly* the phantom-field shape. The sweep has zero mention of it — because the read
lives inside a dynamically-imported module the sweep's static scan never opened.
**Re-run it, with dynamic-import awareness.**

**`sweep-unreachable-features.md` / missing-surfaces — understated a live path.**
This sweep looks for endpoints nothing calls. It concluded that India statutory-filing
records are "never actually created except by automated tests." That understates reality:
`runMonthlyPayroll` (D4) is RBAC-registered and reachable, and it *does* write payslips in
production via the second engine. The sweep treated the dynamically-reached write path as
absent. **Re-run it** to confirm which statutory write paths are genuinely live.

**`sweep-ownership-checks.md` — structurally blind here, though not obviously wrong.**
It inspects tRPC mutations, whose definitions are static, so the *procedures* were seen.
But it cannot see into the engine internals those procedures dynamically import, so any
ownership/tenant assumption made *inside* the second engine was never inspected. Lower
priority to re-run, but note the limitation.

**`audit-payroll-tax.md` — looked at the wrong file.**
This is the one file with any hits (3). All three point at the **test** file
`india-payroll-engine.test.ts`, not the engine module itself. The audit treated the
tests as the source of truth and never opened the 416-line implementation. So the second
engine's stale slabs/surcharge/rebate were audited only through whatever the tests
happened to assert. **Re-run it against the engine module directly.**

**The other five sweeps** (`fabricated-constants`, `false-comments`,
`inconsistent-patterns`, `stale-debt`, `tenant-constants`) also have zero mentions. They
are less directly affected, but each does a static scan, so none of them would have
surfaced the stale constants living inside the dynamically-imported engine
(`fabricated-constants` and `stale-debt` in particular would plausibly have flagged the
FY2024-25 hardcoded slabs and the 37% surcharge had they opened the file).

### Which sweeps to re-run (priority order)

1. **`sweep-phantom-fields`** — has a concrete, provable miss (`rentPaidMonthly`).
2. **`audit-payroll-tax`** — audited the test, not the engine; re-run against the module.
3. **`sweep-unreachable-features` / missing-surfaces** — understated a live write path.
4. **`sweep-fabricated-constants` + `sweep-stale-debt`** — likely to surface the stale
   hardcoded slabs/surcharge now that the file is in scope.
5. `sweep-ownership-checks` — note the structural limitation; re-run if time allows.

**General remediation for all future sweeps:** a static-import scan is not sufficient
coverage on this codebase. Any sweep that claims to cover money/statutory paths must also
enumerate `await import(` / `.then(import(` sites and follow them, or it will miss the
exact class of defect that let a stale, money-writing engine ship unaudited.

### Addendum — a second, distinct failure: a filename mistaken for coverage

This one is worth recording separately because it is **not** the dynamic-import blind
spot — it would have happened even with a perfect import graph.

The payroll-tax audit pointed at `apps/api/src/__tests__/india-payroll-engine.test.ts`
and treated it as coverage of the second engine, on the strength of the name. It is not.
That test file imports:
- `computeTax`, `computeHRAExemption` from `../lib/india-tax-engine` — a **re-export
  shim** that forwards to `packages/payroll-math` (the LIVE engine),
- `computePF`/`computeESI`/`computePT`/`computeMonthlyStatutory` from
  `../lib/india-statutory-deductions` — another shim to payroll-math,
- `computeEmployeePayslip`, `generateECR` from `../lib/payroll-cycle` — the LIVE engine.

It **never imports `../lib/india/payroll-engine`** — the second engine. So every
assertion in the file that "the India payroll engine" is correct is an assertion about
the *live* engine, reached through the shims. The 416-line second engine has **zero**
test coverage. The audit matched on the file name (`india-payroll-engine.test.ts` ≈
`india/payroll-engine.ts`) and never checked what the file actually imports.

Two independent lessons, then:
1. **Dynamic-import blind spot** (the main body above) — the *engine* was invisible to a
   static scan.
2. **Filename ≠ coverage** (this addendum) — the *test* looked like it covered the engine
   but exercised a different module. A coverage claim must be verified by the file's
   imports/what it executes, never by its name.

---

## Coverage — every module examined (so clean ≠ unchecked)

Legend: **CLEAN** = examined, no runtime dynamic imports of concern. **HITS** = runtime
dynamic imports found (detailed above). **N/A** = no source of the relevant kind.

### Apps

| Module | Files | Runtime dynamic imports | Result |
|---|---|---|---|
| `apps/api` | 410 | Yes — D1–D7 + infra lazy-loads | **HITS** (see §1) |
| `apps/web` | 250 | Only lazy `import("sonner")` (toast UI lib) in `catalog-client.tsx` | **CLEAN** (no money/DB/statutory) |
| `apps/mac` | 18 | None | **CLEAN** |
| `apps/worker` | 9 | None (statically imports workflows) | **CLEAN** |
| `apps/mobile` | 19 | None | **CLEAN** |
| `apps/docs` | 42 | None (Nextra content) | **CLEAN** |

### Packages

| Module | Files | Runtime dynamic imports | Result |
|---|---|---|---|
| `packages/db` | 78 | None | **CLEAN** |
| `packages/payroll-math` | 16 | None (canonical engine; statically composed) | **CLEAN** |
| `packages/types` | 12 | None | **CLEAN** |
| `packages/validators` | 4 | None | **CLEAN** |
| `packages/ui` | 22 | None | **CLEAN** |
| `packages/metrics` | 24 | None | **CLEAN** |
| `packages/config` | 2 | None | **CLEAN** |
| `packages/cli` | 9 | None | **CLEAN** |

### `require(...)` sites — all 25 accounted for

| Location class | Count (approx) | Runtime? |
|---|---|---|
| Root `scripts/` (build/migrate/gen tooling) | majority | **No** — build/CLI only |
| ESLint / config files (`.cjs`) | few | **No** — tooling |
| Test scratch / test setup | few | **No** — tests |
| Commented-out lines | few | **No** — inert |

None on a live request path.

### The five India engine files (the DUP-1 neighbourhood) — each opened and classified

| File | Classification |
|---|---|
| `apps/api/src/lib/india/gst-engine.ts` | Shim (re-export) — CLEAN |
| `apps/api/src/lib/india/validators.ts` | Shim (re-export) — CLEAN |
| `apps/api/src/lib/india-statutory-deductions.ts` | Shim (re-export) — CLEAN |
| `apps/api/src/lib/india-tax-engine.ts` | Shim (re-export) — CLEAN |
| **`apps/api/src/lib/india/payroll-engine.ts`** | **Real second engine — DUP-1** |

### Nine existing sweep/audit files — each checked for coverage of this blind spot

| Sweep file | Mentions second engine / dynamic import? |
|---|---|
| `sweep-fabricated-constants.md` | No |
| `sweep-false-comments.md` | No |
| `sweep-inconsistent-patterns.md` | No |
| `sweep-missing-surfaces.md` | No |
| `sweep-ownership-checks.md` | No |
| `sweep-phantom-fields.md` | No (should have — see §4) |
| `sweep-stale-debt.md` | No |
| `sweep-tenant-constants.md` | No |
| `sweep-unreachable-features.md` | No (understated — see §4) |
| `audit-payroll-tax.md` | Only the **test** file, not the engine |

---

## Bottom line

- There is exactly **one** dynamically-reached, money-writing duplicate: the second
  payroll engine, reached via `await import()` from six sites in `hr.ts` /
  `india-compliance.ts`, one of which (`runMonthlyPayroll`, D4) inserts payslips.
- It still carries the pre-fix versions of every defect corrected this week (PT slabs,
  37% surcharge, flat 87A, HRA-from-rent-0).
- **Point 4:** the earlier sweeps did miss findings because of this blind spot. The
  provable one is `rentPaidMonthly` (phantom-fields). Re-run **phantom-fields**, the
  **payroll-tax audit** (against the engine, not its test), and
  **unreachable-features/missing-surfaces**, in that order — and make every future
  money/statutory sweep follow dynamic imports, not just static ones.
- Everything outside `apps/api` is clean (web has only a lazy toast-library import).
