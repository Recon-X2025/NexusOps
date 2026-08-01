# Audit — payroll-tax

Audited 2026-07-31 against `docs/quality-bar.md`. Scope: the India payroll
engine — monthly payslip computation, income-tax/TDS engine, PF/ESI/PT statutory
deductions, and the PAN/statutory-output path (Form 16 / ECR). This is an audit
of the code as it stands, not of any recent change.

Files in scope:
- `packages/payroll-math/src/payroll-cycle.ts` (payslip build, net-pay floor)
- `packages/payroll-math/src/tax-engine.ts` (slabs, rebate, surcharge, cess, TDS)
- `apps/api/src/lib/india-statutory-deductions.ts` (PF/ESI/PT)
- `apps/api/src/routers/payroll.ts` (payroll-run driver)
- `packages/db/src/schema/hr.ts` (employees, payslips, payroll_runs)
- `apps/api/src/lib/pan.ts`, `form16-aggregator.ts`, `form16-pdf.ts` (PAN path)
- `apps/api/src/__tests__/india-payroll-engine.test.ts` (the tests)

---

## 1. In plain English

The tax maths itself is the strongest part of this whole product — the income-tax
slabs, the ₹12L rebate, the surcharge caps, PF, ESI and professional tax are all
computed correctly and are well tested. Two things, though, are genuinely
dangerous and both should be fixed before this runs another live payroll.

**First: money can silently vanish from an employee's payslip.** The system
calculates income tax (TDS) on an employee's *full* yearly salary, but if that
person was absent for much of a month (unpaid leave), their pay for that month is
scaled right down — while the tax deduction is not. In a heavy-absence month the
tax owed can exceed the small amount they actually earned. When that happens the
code quietly forces net pay to zero and **throws away the leftover** instead of
carrying it forward. The quality bar names this exact situation a BLOCKER: money
must never disappear at that floor. Nothing in the saved payslip records that a
shortfall happened, so nobody would ever know.

**Second: employees' PAN numbers are stored in plain text.** A PAN is a
government tax ID. The system keeps a masked, scrambled copy for matching (good),
but it *also* keeps the real number in the clear so it can print Form 16 and file
returns. The quality bar's rule says that retained raw value has to be
*encrypted* — it is not. Anyone who can read the database (a leaked backup, a
rogue query, a compromised account) reads every employee's real PAN directly.

The one thing to fix first is the vanishing money (Finding H-1): it is silent,
it is wrong at the point real cash reaches a person, and it leaves no trace.

---

## 2. Verdict

The computation core is production-grade and matches the CLAUDE.md assessment
(~80% maturity). The failures are not in the arithmetic — they are at the two
boundaries the arithmetic hands off to: (1) the net-pay *floor*, which discards
an over-deduction instead of carrying it forward, and (2) *data-at-rest*, where
the statutorily-required raw PAN is persisted unencrypted. Both are reachable
with ordinary inputs, both are named in the quality bar, and both are BLOCKERs by
its own definitions. The test suite is broad on the engine but does not exercise
either failure, so neither is caught today.

---

## 3. Findings

### BLOCKER

#### H-1 — TDS is computed on full annual salary; a high-LOP month floors net pay to zero and discards the shortfall

**Where:**
- `packages/payroll-math/src/payroll-cycle.ts:285` — TDS profile uses full contractual salary:
  ```ts
  annualCTC: emp.basicMonthly * 12 + emp.hraMonthly * 12 + emp.specialAllowance * 12 + emp.ltaAnnual,
  ```
- `packages/payroll-math/src/payroll-cycle.ts:200-208` — gross **is** LOP-scaled:
  ```ts
  const lopFactor = emp.lopDays > 0 ? (emp.daysWorked / emp.daysInMonth) : 1;
  const basicEarned = Math.round(emp.basicMonthly * lopFactor);
  // …grossEarnings built from the scaled components…
  ```
- `packages/payroll-math/src/tax-engine.ts:324-329` — monthly TDS is annual/months, with no cap against the month's gross:
  ```ts
  const remainingTax = Math.max(0, totalTaxLiability - previousEmployerTDS);
  const monthlyTDS = Math.round(remainingTax / Math.max(1, monthsInFY));
  ```
- `packages/payroll-math/src/payroll-cycle.ts:309-314` — deductions include that unscaled TDS, then the floor:
  ```ts
  const totalDeductions = statutory.totalEmployeeDeductions + taxComputation.monthlyTDS + emp.otherDeductions;
  const netPay = Math.max(0, grossEarnings - totalDeductions);
  ```
- `packages/db/src/schema/hr.ts:379-432` — the `payslips` table has **no** shortfall / carry-forward / outstanding-recovery column. It stores the floored `netPay` (413) and the full pre-floor `totalDeductions` (412).

**Concrete failure scenario:** An employee earns ₹16L/yr (basic ₹66,667/mo,
HRA/special to match). Their correct monthly TDS on ₹16L taxable is ≈ ₹9,400
(the engine's own `108,390 + cess` ÷ 12, per `india-payroll-engine.test.ts:71-98`).
This month they were on unpaid leave for 27 of 30 days: `daysWorked=3`,
`lopDays=27`, so `lopFactor = 3/30 = 0.1`. Gross collapses to ≈ ₹13,300 (10% of
~₹1.33L monthly). PF/ESI/PT still apply, and TDS is **still ≈ ₹9,400** because it
was computed on the full ₹16L, unscaled. `totalDeductions` (~₹11,000+) now exceeds
gross (~₹13,300) once statutory deductions are added on a low-earning month, or
trivially so at higher salaries. `netPay = max(0, 13,300 − 15,000) = 0`. The
₹1,700+ over-deduction is **discarded**: it is not carried to next month, and the
`payslips` row records `netPay = 0` with `totalDeductions` still at the full
value, so the persisted row itself no longer satisfies
`netPay = grossEarnings − totalDeductions`. The employee is over-taxed for the
month with no trace and no recovery.

**What this means in practice:** In any month an employee has heavy unpaid leave,
the platform can deduct more tax than they earned, pay them zero, and silently
lose the excess. It is real money, it is wrong, and the saved record hides it —
this is precisely the BLOCKER the quality bar's rule 3 describes.

---

#### H-2 — Raw PAN is stored in plain text (rule 5 OPEN QUESTION → resolved: case (a), encryption requirement violated)

**Where:**
- `packages/db/src/schema/hr.ts:126` — `pan: text("pan")` — raw column, no crypto wrapper.
- `apps/api/src/lib/pan.ts:54-58` — the write helper stores the value verbatim:
  ```ts
  return { pan: raw.trim().toUpperCase(), panMaskedHash: derived.hash, panMaskedDisplay: derived.masked };
  ```
- `apps/api/src/lib/india/form16-aggregator.ts:130` and `apps/api/src/services/form16-pdf.ts:171` read the raw `pan` straight back out for Form 16.

**Resolution of the rule-5 OPEN QUESTION:** The quality bar (rule 5) requires the
audit to determine which of (a) raw stored (and *must be encrypted*), (b)
statutory outputs broken, or (c) unbuilt. The answer is **(a): the raw PAN is
stored and the statutory outputs (Form 16, ECR) are built and use it.** But the
rule's condition — "encrypted, not hashed" — is **not met**: the raw value is
plaintext. The peppered HMAC (`pan.ts`, `pii-hash.ts`) is a match key stored
*alongside* the raw value, not a protection of it. A KMS envelope facility exists
in the codebase (per CLAUDE.md, migration 0051) but is **not** applied to this
column. Aadhaar, by contrast, is handled correctly — raw dropped in migration
0037, only masked hash/display retained (`hr.ts:134-141`).

**Concrete failure scenario:** A database backup is exported, or a read-only
analytics credential is over-scoped, or one org-admin account is phished. Any of
these yields `SELECT pan FROM employees` — every employee's real, unmasked
government tax ID, in the clear. No decryption key is needed because there is no
encryption. The masking work done everywhere else is bypassed entirely at the
storage layer.

**What this means in practice:** Every employee's PAN sits readable in the
database. One leaked backup or one over-broad query exposes the lot — a DPDP
personal-data breach with statutory notification consequences.

---

### MEDIUM

#### M-1 — `otherDeductions` is hard-wired to 0, so the advance/loan recovery the quality bar describes cannot yet be recorded (and will hit H-1's floor when it is)

**Where:**
- `apps/api/src/routers/payroll.ts:172`, `apps/api/src/services/payroll-run-aggregates.ts:83`, `apps/api/src/http/payroll-payslip-pdf.ts:68` — every caller passes `otherDeductions: 0`.
- Consumed at `packages/payroll-math/src/payroll-cycle.ts:312`.

**Concrete failure scenario:** The quality-bar rule 3 frames the carry-forward
invariant around "salary advance, loan repayment" recoveries. Today there is no
advance/loan module and `otherDeductions` is always 0, so that specific path
cannot put a value into deductions — the carry-forward gap is currently *latent*
for advances. The moment an advance-recovery feature writes a real
`otherDeductions`, it flows straight into the same unguarded floor at line 314 and
is discarded identically to H-1. This is reported MEDIUM (correct-but-fragile:
breaks on the next plausible change) rather than BLOCKER because no live input
reaches it yet — but it shares H-1's root cause and H-1's fix resolves it.

**What this means in practice:** When someone builds "recover a salary advance
over 3 months," it will silently lose any month where the instalment plus tax
exceeds pay, unless the floor is fixed first.

---

#### M-2 — The test suite exercises the engine broadly but never drives deductions above gross, so H-1 is invisible to CI

**Where:** `apps/api/src/__tests__/india-payroll-engine.test.ts`
- The "Full Payslip" test (`:417`) uses `daysWorked: 28, lopDays: 2` — a 2-day
  LOP where net stays comfortably positive.
- It asserts `netPay === max(0, gross − totalDeductions)` (`:441-443`) — but
  because gross always exceeds deductions in every fixture, this assertion **would
  still pass even if the carry-forward requirement were completely absent**. It
  tests what the code does, not what rule 3 demands.

**Concrete failure scenario:** Invert the requirement — delete any future
carry-forward logic, or leave H-1 exactly as is — and the entire suite stays
green. No fixture sets a high `lopDays` (e.g. 27) against a normal salary, so the
floor never bites in a test. No test asserts a shortfall is carried forward or
that `totalDeductions ≤ gross` in the persisted row.

**What this means in practice:** The safety net that should catch the vanishing
money doesn't test for it, so the bug can ship and re-ship unnoticed.

---

## 4. Root causes

Three design decisions produced every finding above:

1. **The monthly cash-flow view and the annual-tax view were built separately and
   never reconciled at the floor.** TDS is intentionally an annualised figure
   (correct for tax), but the payslip subtracts it from a *this-month, LOP-scaled*
   gross without ever checking that a month's deductions fit inside a month's pay.
   The `max(0, …)` floor was added to avoid negative net pay, but it papers over
   the mismatch by discarding the difference instead of carrying it. H-1 and M-1
   are both this.

2. **PII was solved for *display and matching* but not for *storage*.** The team
   correctly built masking + peppered-hash de-identification and applied it
   everywhere PAN is shown or matched — then left the one copy that must stay raw
   (for filing) sitting in plaintext, because the "protect PII" work was framed as
   "don't show it", not "encrypt it at rest". H-2 is this.

3. **Tests assert the implementation's behaviour, not the requirement.** The suite
   is thorough where the maths is deterministic and easy to pin (slabs, rebate,
   surcharge) and silent exactly where the requirement is a cross-cutting
   invariant (money must not vanish at the floor). M-2 is this, and it is why H-1
   survived.

---

## 5. Recommended order of work

Ranked by blast radius, not count:

1. **H-1 — fix the net-pay floor (BLOCKER).** When `totalDeductions > grossEarnings`,
   deduct only up to gross this month and carry the remainder forward into a
   persisted, employee-visible outstanding-recovery balance. This is the one that
   silently loses real cash. Fixing it also closes M-1.
2. **H-2 — encrypt the raw PAN at rest (BLOCKER).** Route the `pan` column through
   the existing KMS envelope facility so the plaintext government ID is no longer
   readable from the database/backups. Aadhaar's handling is the model.
3. **M-2 — add the missing tests.** A high-LOP fixture that drives deductions above
   gross and asserts the shortfall carries forward; this locks H-1's fix in and
   prevents regression. Do this *with* H-1, not after.
4. **M-1** is resolved by H-1's fix — no separate work, but verify once an
   advance/loan feature lands that its `otherDeductions` flows through the new
   carry-forward path.

Nothing else in the engine (slabs, rebate, surcharge, cess, PF, ESI, PT, HRA
exemption, mid-year join, salary-revision recompute) rose above MEDIUM — those are
correct and well covered.
