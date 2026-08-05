# Phantom-fields sweep — v2 (dynamic-import-aware)

**Date:** 2026-08-05 · **Branch:** `main` · **HEAD:** `be88a02` · **Migration head:** `0068_easy_mongu`
**Supersedes:** `reports/sweep-phantom-fields.md` (v1, kept for comparison — do not delete)
**Scope:** read-only sweep. No code changed, nothing committed.

---

## Why v2 exists

v1 had a **provable miss**: `rentPaidMonthly`, an interface field that was declared and
read inside a **dynamically-imported** second payroll engine
(`apps/api/src/lib/india/payroll-engine.ts`) that a top-of-file static scan never opened.
v1 only traced `import … from` statements; it never followed `await import()` executed
mid-function, so any file reachable **only** through a runtime import was invisible.

v2 corrects the method:
- Every `await import()` / runtime `require()` was resolved and the target read as if it
  were a static import (inventory: `reports/sweep-dynamic-imports.md`).
- The search widened from schema columns to **every input interface on a money or
  statutory path** — the `rentPaid`-shaped defect (field declared, read by the engine,
  **never populated by any caller**), which is where v1's miss lived.

Note: the second payroll engine that hid v1's miss has since been **deleted** (DUP-1,
commit `be88a02`); a guard test (`payroll-engine-equivalence.test.ts:122-126`) blocks its
reintroduction. So the *specific* file is gone — but the **class** of defect it hid is
alive and well in the surviving single engine, documented below.

---

## Enumeration — every module examined (clean vs. flagged)

"Reached via dynamic import" = the file is imported through `await import()` somewhere on a
production path and would have been invisible to a static-only scan.

### Payroll / statutory (money path)

| Module | How reached | Result |
|---|---|---|
| `packages/payroll-math/src/payroll-cycle.ts` (`EmployeePayrollInput`, engine) | static + **dynamic** (hr.ts:1422/1562 `await import`) | **FLAGGED** — C3-1, C3-2, C3-3 |
| `packages/payroll-math/src/tax-engine.ts` (`EmployeeTaxProfile`, `computeTax`) | static + dynamic (via payroll-cycle) | read-side only; phantoms are at the *builders*, below |
| `apps/api/src/services/payroll-run-aggregates.ts` (`buildEmployeePayrollInput`) | static (run) + reached from dynamic hr.ts previews | **FLAGGED** — the single construction site for C3-1/2/3 |
| `apps/api/src/routers/payroll.ts` (`buildTaxProfileFromEmployee`, screen path) | static | **FLAGGED** — C3-1 (screen copy) + screen/run divergence |
| `apps/api/src/lib/payslip-tax.ts` (`computePayslipTaxFigures`) | static | **FLAGGED** — C3-1 (third copy, payslip/PDF view) |
| `apps/api/src/lib/india/form16-aggregator.ts` (`buildForm16Input`, `chapterVIA`) | static | **FLAGGED** — C3-4 (Chapter VI-A never passed) |
| `apps/api/src/lib/india/ecr-format.ts` (`formatECRFile`) | **dynamic** (hr.ts / india-compliance.ts `await import`) | read-side; phantom is at the producers |
| `apps/api/src/routers/hr.ts` (`generateECR`) | static | **FLAGGED** — C3-5 (`ncp: 0`) |
| `apps/api/src/routers/india-compliance.ts` (ECR push + ESI + PT) | static | **FLAGGED** — C3-5 (`ncp: 0`); ESI/PT paths CLEAN (derive fresh) |
| `apps/api/src/lib/india/statutory-ceilings.ts` (`StatutoryCeilingOverrides`, `TaxConfigOverride`) | static | CLEAN — every field populated from a real `statutoryCeilings` row (seed 0054) |
| `apps/api/src/lib/india/bank-file-generator.ts` (`BankFileRow`) | **dynamic** (payroll.ts bank export) | read-side clean; but see C2-1 (`bankAccountName`) |
| `apps/api/src/lib/india/gst-engine.ts`, `salary-structure-resolver.ts`, `statutory-ceilings.ts` PT/LWF assembly | static | CLEAN |

### Non-payroll schema (v1 carry-over verification)

| Table.column | Result |
|---|---|
| `invoices.grnId` | v1 A-1 — **STILL HOLDS** (no writer anywhere in api/web) |
| `grnLineItems.acceptedQuantity` | v1 A-2 — **FIXED** (goods-receipt create, procurement.ts:920) |
| `tickets.slaRespondedAt` | v1 A-3 — **STILL HOLDS** (only ever set to NULL) |
| `kbArticles.notHelpfulCount` | v1 A-4 — **STILL HOLDS** (feedback bumps helpfulCount only) |
| `tickets.reopenCount` | v1 A-5 — **STILL HOLDS** (reopen never increments) |
| `risks.residualLikelihood` / `residualImpact` | v1 A-6 — **STILL HOLDS** (not in create/update input) |

---

## Findings, ranked by consequence

### C3-1 — Chapter VI-A + old-regime exemptions hardcoded to 0 at all three tax-profile builders **[STATUTORY, HIGH]**

**What.** `section80C`, `section80D`, `section80CCD1B`, `section80TTA`, `section24b`,
`hraExemption`, `otherExemptions` are declared on `EmployeeTaxProfile` /
`EmployeePayrollInput` and **read** by `computeTax` (tax-engine.ts:306-309, 319, 304, 330),
but every builder hardcodes them to `0`:

- `payroll-run-aggregates.ts:93-103` (RUN path) — with a `TODO(compliance)` admitting it
- `routers/payroll.ts:205-211` (SCREEN path)
- `lib/payslip-tax.ts:47-53` (payslip/PDF view path)

**Where read.** `tax-engine.ts:306-330`, **OLD regime only** (the `else` branch;
new-regime ignores them).

**No write path.** There is no employee tax-declaration intake table; nothing on the
create/update employee surface accepts these. Confirmed by grep — the only assignments are
the three `: 0` literals above and the `chapterVIA.find(...)` reads in form16 (C3-4).

**Consequence.** Old-regime employees have **zero** Chapter VI-A / HRA / 24(b) relief
applied → **TDS is systematically over-deducted** every month. `rentPaid` was wired for
HRA (commit `d7dff03`) so HRA exemption now computes from rent; the remaining 80C/80D/etc.
are still fully phantom. New-regime employees are unaffected.

---

### C3-2 — YTD carried into the engine as 0 every month **[STATUTORY, HIGH]**

**What.** `ytdGross`, `ytdPF`, `ytdTDS`, `ytdNetPay` are read by the engine's rolling
s.192 annualisation, but `buildEmployeePayrollInput` hardcodes all four to `0`
(`payroll-run-aggregates.ts:120-123`).

**Where read.** `payroll-cycle.ts` s.192 rolling calc (feeds the cumulative-TDS averaging
that spreads annual liability across remaining months).

**No write path.** The single builder every production caller uses (run path
aggregates.ts:163 + payroll.ts:431; **dynamic** preview paths hr.ts:1426/1566) passes 0.
No caller threads prior-month cumulatives.

**Consequence.** Every month is computed as if it were month 1 of the FY. The monthly TDS
does not converge to the true annual liability — under- or over-withholding that will not
reconcile at year end / in Form 24Q. Higher risk the later in the FY a run happens.
**NEW finding — not in v1.**

---

### C3-3 — Overtime / arrears / one-time bonus / VPF silently dropped **[FINANCIAL, MEDIUM-HIGH]**

**What.** `overtime`, `arrears`, `bonus`, `otherEarnings`, `otherDeductions`,
`isVoluntaryHigherPF` are all **read** by the engine (gross at payroll-cycle.ts:259-262,
303-306; statutory-bonus gate at :291-296; VPF at :331; other-deductions at :402), but
`buildEmployeePayrollInput` hardcodes earnings to `0` and VPF to `false`
(`payroll-run-aggregates.ts:108-113`).

**No write path.** No caller populates them; there is no per-run adjustment/overtime intake.

**Consequence.** Any employee owed overtime, arrears (incl. revision back-pay), a one-time
bonus, ad-hoc earnings/deductions, or enrolled in **voluntary higher PF (VPF)** has those
amounts **omitted from the payslip and the PF challan**. Same `rentPaid` shape (declared,
read, never populated). Lower ranked than C3-1/2 only because it depends on the employee
actually having such a component this month. **NEW finding — not in v1.**

---

### C3-5 — ECR `ncp` (non-contributory / LOP days) hardcoded to 0 in both EPFO producers **[STATUTORY, MEDIUM-HIGH]**

**What.** The ECR line's `ncp` (Non-Contributory Period days) is hardcoded `0` in **both**
producers, even though the payslip carries `lopDays`:

- `routers/hr.ts:1638` (`generateECR` download)
- `routers/india-compliance.ts:727` (the producer that **pushes to EPFO**)

**Where read.** `lib/india/ecr-format.ts` `formatECRFile` (reached via **dynamic import**
in both call sites).

**No write path.** Neither producer maps the slip's LOP days into `ncp`; the field is set
to the literal `0`.

**Consequence.** The statutory EPFO ECR reports **NCP = 0 for everyone**, contradicting any
month with LOP. EPFO reconciliation / wage-month integrity risk on filed returns. (ESI and
PT producers in the same file derive their figures fresh from the slips — those are CLEAN.)

---

### C3-4 — Form 16 Part B Chapter VI-A always zero (`chapterVIA` never passed) **[STATUTORY, MEDIUM]**

**What.** `buildForm16Input` accepts an optional `chapterVIA` array, **reads** it
(form16-aggregator.ts:64, 92-96, 144) to fill section80C/D/etc. and the printed deduction
table. Both callers omit it → defaults to `[]`:

- `routers/payroll.ts:956-961`
- `http/payroll-form16-pdf.ts:90-97`

Also `lessHraExempt = 0` / `lessOtherExempt = 0` hardcoded (form16-aggregator.ts:55, 57,
"Future: derive from rent declarations").

**Consequence.** Every generated Form 16 Part B shows **zero Chapter VI-A deductions and
zero HRA exemption**, regardless of what the employee is entitled to. Same root cause as
C3-1 (no declarations intake), surfaced on the annual certificate. Ranked below C3-1 because
it's a document-generation view of the same missing data rather than a second live TDS path.

---

### C2-1 — `bankAccountName` written but never read (Category 2) **[COSMETIC, LOW]**

**What.** `employees.bankAccountName` (schema hr.ts:171) is accepted by the create/update
input (routers/hr.ts:285, 425) and persisted on create (:375), but the NEFT bank-file
generator never reads it — `BankFileRow` uses account number / IFSC / and the employee's
own name (`bank-file-generator.ts`).

**Consequence.** Low. The payee-name column captured from the UI is dead; bank files fall
back to the employee name. Written-never-read (Category 2), not a phantom-read.

---

## Category-4 check (test writes what no production code writes)

The pattern that hid goods-receipt (v1 A-2) and the response-SLA clock: a test seeds a
column directly that no handler ever writes.

- **`invoices.grnId`** — written **only** in tests
  (`goods-receipt-create.test.ts:117`, `invoice-po-match-tax-basis.test.ts:137/151`);
  no production writer. This is exactly the Category-4 shape and it overlaps v1 A-1
  (still open — see below).
- `grnLineItems.acceptedQuantity` — was Category-4 in v1; **now has a production writer**
  (procurement.ts:920), so it graduated out. Its `goods-receipt-create.test.ts` seed is no
  longer the only writer.

No other test-only writes on a money/statutory column were found.

---

## v1 carry-over ledger (what changed since v1)

| v1 id | Field | v1 verdict | v2 verdict | Evidence |
|---|---|---|---|---|
| A-1 | `invoices.grnId` | phantom-read | **CARRIED — still holds** | read invoice-po-match.ts:219/238/282; `applyMatchToOrder` sets `poId`+`matchingStatus` only (procurement.ts:744-752); goods-receipt create writes `grnLineItems.grnId`, never `invoices.grnId`; no api/web writer |
| A-2 | `grnLineItems.acceptedQuantity` | phantom (test-only) | **FIXED (v1 now WRONG)** | production write via `goodsReceipts.create` (procurement.ts:912-925, acceptedQuantity at :920) — the A9 create path |
| A-3 | `tickets.slaRespondedAt` | phantom-read | **CARRIED — still holds** | read reports.ts:455/476; only ever set `null` (tickets.ts:1319); no positive write |
| A-4 | `kbArticles.notHelpfulCount` | phantom-read | **CARRIED — still holds** | `recordFeedback` bumps `helpfulCount` only (knowledge.ts:157-158), no `else`; displayed on web KB pages |
| A-5 | `tickets.reopenCount` | phantom-read | **CARRIED — still holds** | read reports.ts:636/716; no increment anywhere on reopen (tickets.ts:1311-1318 recomputes SLA only) |
| A-6 | `risks.residualLikelihood/Impact` | phantom-read | **CARRIED — still holds** | read grc/[id]/page.tsx:94-95; not in create/update input |

**Net:** 5 of 6 v1 findings carry over; **A-2 is now fixed** (v1 marked it phantom — that
line is now stale). v1's Part B (written-never-read) and Part C (dead columns) were not
re-litigated except where they intersect the money path; C2-1 is the one new Category-2
item.

---

## Summary

- **New this pass (all Category 3, the `rentPaid` shape v1's method could not see):**
  C3-1 (Chapter VI-A/exemptions, three builders), **C3-2 (YTD=0)**, **C3-3 (OT/arrears/
  bonus/VPF)**, C3-5 (ECR `ncp`=0), C3-4 (Form 16 `chapterVIA`). C3-2 and C3-3 are wholly
  new; C3-1/4/5 are the surviving successors to the `rentPaidMonthly` class.
- **Dynamic-import payoff:** the two `hr.ts` payslip-preview call sites (1422-1427,
  1562-1567) and both ECR producers reach the engine / `formatECRFile` through
  `await import()` — the exact call-site class v1 skipped. They inherit C3-1/2/3/5.
- **Carry-over:** 5 of v1's 6 hold; **A-2 fixed** (v1 stale on that line).
- **Highest consequence:** C3-1 and C3-2 (live TDS mis-withholding for old-regime and for
  every non-first month), then C3-3 (dropped pay components), C3-5 (EPFO NCP), C3-4
  (Form 16 view). C2-1 is cosmetic.
- **Common root cause:** there is **no employee tax-declaration / adjustment intake table**;
  every 80C/80D/HRA/YTD/OT/bonus field is read by a correct engine but fed a literal 0/false
  at the boundary. The data models are right; the intake and the per-run population are
  missing — the recurring "correct schema, missing computation/wiring" pattern.
