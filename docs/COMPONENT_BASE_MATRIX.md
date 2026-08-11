# Component / Base Matrix — draft for confirmation

**2026-08-11. Specification document. No code change proposed here.**

Written because "bonus is a percentage of what?" turned out to be unanswerable: the
product has no register of what its salary components are, or which statutory base
each one is a member of. Four separate queue items are artefacts of that absence.

---

## How to read this

Every cell carries a provenance mark. Nothing here is a premise unless it is marked
`R`.

| Mark | Meaning |
|---|---|
| **R** | **Read** — stated in `reports/fix-plan.md` or `docs/CONTEXT.md` with a `file:line` citation |
| **D** | **Decided** — an owner ruling, this session or recorded in `CLAUDE.md` |
| **S** | **Statutory claim, unconfirmed** — my reading of Indian statute, not sourced from the act. For the CA |
| **?** | **Unknown** — needs a code read before it can be filled |

### Decisions settled 2026-08-11 (owner) — **D**

1. **Bonus is two objects, not one.** A `bonus_target_percent` tagged at offer time
   (structure-level), and a discretionary payout event decided at a tenant-configured
   window — year end by default. The payout may be less than target, or nil.
2. **The target sits ON TOP of CTC.** Monthly gross is unchanged by it. The residual
   `max(0, ctc/12 − basic − hra − da)` therefore stays as written — **no carve-out
   needed**, unlike DA.
3. **Bonus enters taxable income only** — out of the PF 50% denominator, the ESI base
   and the PT gross. Implementing this requires a code change (§3), because the
   denominator's membership is arithmetic, not configuration.
4. **The payout window is outside the first cycle.** The Bonus field comes off the
   structure form now and returns with the variable-pay / offer-letter build. (The
   Medical and Conveyance half of this recommendation is superseded by decision 6.)
5. **The `CTC` field is relabelled `Base Pay`** — annual fixed pay, industry
   terminology. Label only: the column and code identifier stay `ctc`, since renaming
   the identifier is a migration. Ships with `Basic % of Base Pay` on the adjacent field
   (matching the existing `HRA % of Basic` convention), helper text naming the
   exclusions, and **the importer's CSV header and template changed to match**.
   **Base Pay includes the employee's own PF contribution and excludes the employer's.**
6. **Medical and Conveyance stay as optional perk fields, defaults zeroed.** The
   dead-law prefills (₹15,000 / ₹19,200) are removed at launch. At 0 both possible
   behaviours (inert vs additive) are identical, so **Q2 goes dormant rather than
   resolved** — pair with an onboarding-pack note not to set them in the first cycle.
7. **LTA is inside Base Pay** — carved out of the residual, like DA. This establishes
   the general rule:

   > **Every named component subtracts from the residual and sits inside Base Pay.
   > Only bonus sits on top.** Special allowance is the balancing figure, nothing more.

   Residual becomes `max(0, basePay/12 − basic − hra − da − ltaMonthly)`. **Moves
   statutory money:** total remuneration drops by the LTA amount, so `halfOfTotal` and
   the PF wage base drop with it — five contributions, not one. Direction is
   correct-ward. **Reachability check before shipping:** is `ltaAnnual` non-zero on any
   structure, and has any payslip been generated against one?

8. **The form enforces Basic% + DA% = 50.** Both are percentages of Base Pay (HRA is a
   percentage of Basic — relabel `DA %` → `DA % of Base Pay` so the mixed bases are
   visible). **Implementation:** take DA% and derive Basic% as `50 − DA`, read-only, so
   the invalid state is unreachable rather than validated against. **Enforce in the
   server validator, not only the UI** — a form-only rule is bypassable by any tRPC
   caller. No DB CHECK constraint (that would be a migration; out of scope).
   Consequences: existing structures at ≠50 become uneditable (engine unaffected, it
   clamps regardless); the over-allocation warning keeps a narrower job, since HRA above
   100% of Basic can still over-allocate.

9. **LTA tax treatment — ruled, and it lands in C1, not the fortnight.**
   **New regime:** no exemption, so **no declaration option should be shown at all.**
   **Old regime:** if declared, exclude from taxable income until claimed; if still
   unclaimed in **March** (India FY close), include it and compute the tax that month.
   **Live now:** only **Q9**. New regime is the default while unelected, so for the
   first cycle LTA is plain taxable salary — if `computeTax()` exempts it
   unconditionally, that is a first-cycle TDS under-deduction and belongs in this deploy.
   **Dependencies C1 inherits:** (a) the March true-up needs working YTD — **PR5**
   sequences first; (b) an employee exiting before March needs the true-up at settlement
   — **no full-and-final path exists** (LEAVER GAP); (c) "claimed" has no product
   representation — LTA proof is part of the Layer-3 retention gap.
   **For the CA (S):** the exemption is likely capped at *actual eligible travel cost*
   and limited to two journeys in a block of four calendar years — so the claim is not
   all-or-nothing, the intake must capture an amount, and the exempt figure is the lower
   of LTA and eligible cost. Confirm alongside the open s.2(y) exclusion-set question.

**Ordering constraint across 4–8:** the rename, the helper text, the Bonus-field
removal and the zeroed prefills are all safe now. The LTA carve-out needs its
reachability check first. Removing Medical and Conveyance entirely still waits on
**Q2** — but decision 6 means that removal is no longer required before launch.

⚠️ The `file:line` references quoted below are copied from the project documents, which
themselves warn that these drift — the `payroll-run-aggregates.ts` numbers moved once
already when the leaver block landed above them. **Re-verify each against the tree
before acting on it.**

---

## 0. The finding that has to be settled before the matrix means anything

**The product's `CTC` field holds gross, not cost to company.**

From the locked walk (`ui-runtime-walk_statutory-fix-verify_2026-08-11_run-075248.md`),
EMP-0004 at CTC ₹4,80,000 → ₹40,000/month:

| | |
|---|---|
| Basic | 16,000 |
| DA | 4,000 |
| Special allowance | 12,000 |
| HRA | 8,000 |
| **Gross** | **40,000 — equals CTC/12 exactly** |
| Employer PF (same employee, same walk) | 2,159 — **sits outside the 40,000** |

True monthly cost for EMP-0004 is ~₹42,159; ~₹5.06 lakh annually against a field
labelled ₹4.80 lakh. Gratuity accrual would widen it further.

**And the bonus target sits outside it as well** (decision 2, above). So the field holds
**annual fixed gross** — excluding both the retiral side and variable pay. With a 10%
bonus tagged, true cost for EMP-0004 is roughly ₹5.55 lakh against a field reading
₹4.80 lakh: a ~15% gap.

**The two halves of PF fall on opposite sides of the line.** Base Pay is gross, so it
**includes the employee's own PF contribution** (deducted from it) and **excludes the
employer's** (added on top). The offer-letter build must therefore compute:

```
true CTC = Base Pay + employer PF + EDLI + admin + gratuity accrual + bonus at target
```

Employee PF is already inside Base Pay and is **not** added again — adding both halves
is the natural error here.

**Import definition (for the template and the helper text):** Base Pay is the
**Gross Earnings line on the employee's current payslip × 12** — a figure the customer
can verify against a document they already hold, unlike "annual fixed pay excluding
retirals", which is checkable only against their reading of the phrase. The structure form's own
over-allocation warning says the same thing in words — *"gross may exceed CTC"* — which
is only possible in a model where retirals are not inside CTC. **R**

**This is a naming question with two honest answers,** and it is the owner's call:

1. **Keep the field as gross and rename it.** Cheapest, no computation changes. The
   offer-letter build later has to derive true CTC by adding the retiral side.
2. **Make the field true CTC and derive gross from it** by subtracting employer PF,
   EDLI, admin charges and gratuity accrual. Correct against how Indian offer letters
   read — but it changes the denominator every existing structure was configured
   against, and there is no gratuity accrual engine to subtract from
   (`CLAUDE.md`: gratuity/leave accrual still genuinely open). **Not a fourteen-day
   change.**

**Recommendation: option 1 before the pilot, option 2 as the offer-letter build.**
Seven customers importing existing employees do not need true CTC in the first cycle;
they do need the field not to lie about what it holds.

---

## 1. The engine's actual shape (so the matrix has something to attach to)

```
core        = basicEarned            (+ DA — see open question Q1)
exclusions  = HRA + special + LTA + overtime + arrears + bonus + other earnings
total       = core + exclusions
halfOfTotal = total / 2
wageBase    = round(min(core + addBack, halfOfTotal))     → then min(base, 15,000)
```

- The exclusion bucket is a **hardcoded seven-term sum** at `payroll-cycle.ts:314-321`.
  It is **arithmetic, not configuration** — changing membership is a code change. **R**
- `calculateLabourCodeWageBase` (`statutory-deductions.ts:812`, base line `:825`)
  receives **two scalars** and knows nothing about which components went into either.
  There is no place in the current design to express "component X is excluded from the
  denominator" other than by editing that sum. **R**
- Four of the seven terms are **zero-fed** by the run — overtime, arrears, **bonus**,
  other earnings (`payroll-run-aggregates.ts:259-262`). **R**
- Special allowance is the lumped residual `max(0, ctc/12 − basic − hra)`
  (`payroll-run-aggregates.ts:198`) — a genuine reimbursement and the balancing figure
  are indistinguishable to the engine. **R**
- **One base drives five contributions** — PF employee, EPF, EPS, EDLI, admin
  (`statutory-deductions.ts:224-236`). A wrong base is five wrong numbers. **R**

---

## 2. Matrix A — earnings components

`✓` in base · `✗` out of base · `?` unknown · `—` not applicable

| Component | Exists today | PF core (Basic+DA) | PF 50% denominator | ESI wages | PT gross | Taxable |
|---|---|---|---|---|---|---|
| **Basic** | ✓ **R** | ✓ **R** | ✓ **R** | ✓ **S** | ✓ **S** | ✓ **S** |
| **Dearness Allowance** | ✓ mig `0077` **R** | ✓ claimed **R**, see **Q1** | ✓ **R** | ✓ **S** | ✓ **S** | ✓ **S** |
| **HRA** | ✓ **R** | ✗ **R** | ✓ **R** | ✓ **S** | ✓ **S** | partial — exemption **S** |
| **Special allowance** (residual) | ✓ **R** | ✗ **R** | ✓ **R** | ✓ **S** | ✓ **S** | ✓ **S** |
| **LTA** (`ltaAnnual`/12) | ✓ when set **R** | ✗ **R** | ✓ **R** | ? **Q4** | ✓ **S** | partial — exemption **S** |
| **Overtime** | term exists, zero-fed **R** | ✗ **R** | ✓ **R** | ✓ **S** | ✓ **S** | ✓ **S** |
| **Arrears** | term exists, zero-fed **R** | ✗ **R** | ✓ **R** | ? **Q4** | ✓ **S** | ✓ **S** |
| **Bonus** | term exists, zero-fed **R** | ✗ **R** | **✓ today — must become ✗** **D**, see §3 | ✗ **D** | ✗ **D** | ✓ **D** |
| **Other earnings** | term exists, zero-fed **R** | ✗ **R** | ✓ **R** | ? | ✓ **S** | ✓ **S** |
| **Medical allowance** | on the form **R** | ? **Q2** | ? **Q2** | ? | ? | regime-obsolete **R** |
| **Conveyance allowance** | on the form **R** | ? **Q2** | ? **Q2** | ? | ? | regime-obsolete **R** |
| **Third inert allowance column** | ? **Q2** | ? | ? | ? | ? | ? |

**Q2 is load-bearing.** `INERT-ALLOWANCES` records three salary-structure allowance
columns **read nowhere**, with possible underpayment against the additive `ltaAnnual`
(**R**). If a customer configures medical or conveyance and the engine ignores it, the
employee is underpaid — and neither the matrix nor the offer letter can be written
until it is known which three columns those are and whether they reach any sum.

---

## 3. The bonus consequence — this is the reason the matrix earns its afternoon

**Bonus is already the sixth term of the exclusion bucket, fed zero.** Feed it a real
number and it enters `total`, which raises `halfOfTotal`, which raises the PF wage base
in the month a bonus is paid.

Worked from the engine's own verified case (total 20,000 · basic 12,000 · HRA 4,000 ·
special 4,000):

| | No bonus | With a ₹20,000 bonus |
|---|---|---|
| total remuneration | 20,000 | 40,000 |
| halfOfTotal | 10,000 | 20,000 |
| wage base (after ₹15,000 ceiling) | 10,000 | **15,000** |
| employee PF @12% | 1,200 | **1,800** |
| employer side | 1,300 | ~1,950 |

**Per your ruling — bonus touches income tax only — both bonus columns are wrong by
₹600 and ~₹650.** And because one base drives five contributions, EPS, EDLI and admin
move with them.

**So the bonus build is not "add an earnings line."** It is:

1. Remove `bonus` from the seven-term sum, or compute `total` excluding it —
   a **code change** to `payroll-cycle.ts:314-321`, because the membership is
   arithmetic, not configuration. **R**
2. Feed the bonus term a real number from the run input.
3. `bonusBase = grossEarnings − bonusLine` — the base must exclude the thing it
   computes, or it is self-referential and order-dependent.
4. `bonus_type` (statutory / discretionary) — the branch ESI and the annual
   projection read. **D**
5. Into taxable income **and the annual TDS projection**, not just the month.

Steps 1 and 3 are the whole risk. Step 2 is the easy part, and doing step 2 without
step 1 produces wrong money for every employee below the ₹15,000 ceiling in any month
a bonus is paid.

---

## 4. Matrix B — deductions and the retiral side

These are not base members; they are placed here so the CTC decision in §0 has
something to point at.

| Item | Side | Inside the `CTC` field today | Notes |
|---|---|---|---|
| Employee PF (12%) | deduction | n/a | derived from the wage base **R** |
| VPF | deduction | n/a | employee only, employer never matches **R/D** |
| Professional tax | deduction | n/a | state-driven, 36 states in data **R** |
| TDS | deduction | n/a | |
| LOP | reduces earnings | n/a | attendance-driven via `lopFactor` **R** |
| **Employer PF (EPF 3.67%)** | retiral | **✗ — outside** **R** | |
| **EPS (8.33%)** | retiral | **✗ — outside** **R** | |
| **EDLI** | retiral | **✗ — outside** **R** | |
| **Admin charges** | retiral | **✗ — outside** **R** | |
| **Employer ESI** | retiral | **✗ — outside** **S** | |
| **Gratuity accrual** | retiral | **✗ — does not exist** **R** | no accrual engine (`CLAUDE.md`) |

---

## 5. Open questions, by who can answer them

**Code read (fastest — no external dependency):**

- **Q1. CLOSED (owner, 2026-08-11).** DA does reach `basicPlusDA`. The composition is
  defined as 50% of Base Pay and is now enforced at the form and validator (decision 8).
- **Q2. DEFERRED to the sweep (owner, 2026-08-11).** Whether Medical and Conveyance are
  read anywhere is no longer blocking, because both ship at 0 (decision 6). **Trigger
  that makes it live again:** the first customer who sets either to a non-zero value.
  Until then, the onboarding pack should say not to.
- **Q9. NEW — does the tax engine treat LTA as taxable by default, or exempt it?**
  Unclaimed LTA is taxable under the old regime; under the new regime (the default while
  unelected) the exemption doesn't apply at all, so LTA is simply taxable salary. **If
  the engine exempts it unconditionally, that is a TDS under-deduction from the first
  non-zero LTA onward.** Independent of the PF work — this sits in the TDS path. The
  old-regime claim-and-proof path does not exist (Layer-3 retention gap) and belongs in
  the written manual set, not the fortnight.
- **Q3.** Does the `CTC` field have any consumer that treats it as cost rather than
  gross?

**CA / statute:**

- **Q4.** ESI membership of LTA and arrears — the wage definition turns on the payment
  interval, not on the component's name. **S**
- **Q5.** The exclusion-set membership against s.2(y)(a)–(k) — **already an open CA
  question in the project record**: special allowance and arrears are in the bucket
  today, the statute lists HRA but not special allowance, and treats arrears as
  deferred wages. Whether the ₹15,000 ceiling applies before or after the base resolves
  (engine applies it after). **R**
- **Q6.** Kerala assesses PT on aggregate half-yearly income. The first-cycle manual
  procedure for Kerala and Tamil Nadu needs to state whether a bonus counts toward the
  band. This is a line in a written procedure, not a build.

**Owner:**

- **Q7.** §0 — rename the field, or make it true CTC later?
- **Q8.** The bonus percentage base — the question that started this. With the matrix
  in front of you it reduces to naming which rows of Matrix A are in.

---

## 6. What this resolves in the existing queue

| Item | Effect |
|---|---|
| **Bonus** (the open decision) | Becomes specifiable — and reveals it needs a code change, not a field |
| **ALLOW** | Medical/conveyance removal is a matrix row decision, not a form-tidying task |
| **INERT-ALLOWANCES** | Q2 promotes it from a sweep note to a possible underpayment with a named test |
| **WAGE-CFG** | The floor/cap on `basicPercent` is expressible once composition is defined |
| **Kerala / TN manual set** | Q6 gives the manual procedure its base definition |

---

## 7. Deliberately not in this document

- **The offer-letter artefact.** Document generation, post-go-live. Pilot customers are
  importing existing employees; they are not issuing offers through the product in the
  first cycle.
- **The Payment of Bonus Act computation.** Allocable surplus, calculation ceiling,
  set-on/set-off across years, statutory registers. A module, not a line item.
- **Gratuity accrual.** Open in the gap tracker; blocks option 2 in §0.
- **Any code change.** This is a specification. Nothing here has been built.
