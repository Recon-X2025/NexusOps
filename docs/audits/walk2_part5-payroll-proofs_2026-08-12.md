# WALK 2 — Part 5: payroll cycle + the two proofs (localhost, SHA 5c5490d)

**Method:** browser is the test (Playwright); every step clicked in-UI as the correct role, each screenshotted to `docs/audits/walk2-shots/`. Payslip figures read on the **rendered payslip PDF + employee portal** (not computed via API). DB reads used only as secondary confirmation beside the on-screen values.

**Tenant:** WALK2 QA Co (`e526a530-…`). Proof pair, both **old regime, Band A (₹12L Base Pay → ₹1L/mo gross), rent ₹6,00,000/yr**, joined 1 Jul 2026, differing only by metro:
- **EMP-0001 Ravi KA Old** — Karnataka/Bengaluru, non-metro (→40% HRA), **80C ₹1,50,000 declared**.
- **EMP-0002 Devi Delhi Old** — Delhi/New Delhi, metro (→50% HRA), **no 80C**.

---

## The 14-step cycle — walked end-to-end, each step clicked in the UI

Run: **September 2026** (see F8 for why not August). Steps 1-9 + 13-14 as **admin**; approvals as **distinct role users**:

| Step | Actor | Result |
|------|-------|--------|
| 2 Lock period | admin | 2 employees snapshot; Gross ₹2,00,000 |
| 3-8 Gross/PF/ESI/PT/LWF/TDS | admin | PF ₹3,600 (₹1,800 ea = 12% of ₹15k cap), **ESI ₹0** (both >₹21k, correct), PT ₹200 (KA ₹200 + Delhi ₹0, correct), **TDS ₹0** |
| 9 Payslips generated | admin | 2 payslips |
| 10 HR approved | **Hana HR** (hr_manager) | ✅ 22:18 |
| 11 Finance approved | **Fiona Finance** (finance_manager) | ✅ 22:19 |
| 12 CFO approved | **Carl CFO** (finance_manager, distinct) | ✅ 22:20 |
| 13 Statutory outputs | admin | ✅ after setting EPF code (see F11) |
| 14 Completed | admin | ✅ run status COMPLETED / paid |

Screenshots `20`–`27`. Approval timestamps recorded on the completed run (HR→Finance→CFO).

### ✅ Positive — Segregation of Duties is server-enforced
As **Fiona Finance** (who approved step 11) I clicked the step-12 **CFO** Execute → **403** `payroll.runs.approve`: *"Segregation of duties: cannot approve CFO step if you approved a previous step."* (`25-sod-block…png`). The 3-approver chain requires 3 distinct identities and the server rejects a repeat approver. **Minor UX note (F12):** the CFO Execute button is still *shown* to Finance (and to CFO before they can complete steps needing `payroll.write`) even when the action 403s — visible-but-forbidden controls.

---

## THE PROOFS — result: both are BLOCKED by an underlying TDS/HRA defect

Rendered payslip PDF (`30-ravi-payslip-PDF.png`) + employee-portal detail (`29`,`31`) for the completed Sept run:

| | Gross | Basic | HRA (paid) | PF | PT | **Monthly TDS** | Net | Taxable income (payslip) | **Annual Tax Liability (payslip)** |
|---|---|---|---|---|---|---|---|---|---|
| Ravi KA (80C ₹1.5L, 40%) | 1,00,000 | 50,000 | 25,000 | 1,800 | 200 | **₹0** | 98,000 | ₹9,97,600 | **₹1,16,501** |
| Devi Delhi (no 80C, 50%) | 1,00,000 | 50,000 | 25,000 | 1,800 | 0 | **₹0** | 98,200 | ₹11,50,000 | **₹1,63,800** |

### Proof (a) — "80C reduces TDS ~₹2,500/mo": **cannot be shown as a TDS delta; mechanism works at annual level**
- 80C **is** applied to taxable income: Devi − Ravi taxable = ₹11,50,000 − ₹9,97,600 = **₹1,52,400 = 80C ₹1,50,000 + KA PT ₹2,400**. Annual tax drops ₹1,63,800 → ₹1,16,501. So the 80C computation is correct in the *annual-tax-liability* figure.
- BUT the mandate's stated proof (80C lowers the **monthly TDS**) is **unobservable**: monthly TDS is **₹0 with and without** the declaration. Toggling provisional↔lapsed would move the *annual-liability* footer but never the (zero) TDS line.

### Proof (b) — "HRA metro 40% (KA) vs 50% (Delhi)": **NOT demonstrable — HRA exemption absent from the payslip tax view**
- The payslip's **taxable income for BOTH employees excludes any HRA exemption**: Ravi ₹9,97,600 = ₹12L − 80C ₹1.5L − std ₹50k − PT ₹2,400; Devi ₹11,50,000 = ₹12L − std ₹50k (no 80C, no PT). Neither subtracts the s.10(13A) HRA exemption (₹2.4L KA / ₹3L Delhi) despite **rent ₹6,00,000 recorded**. The metro 40/50 distinction therefore has **zero visible effect**, and HRA exemption is not a payslip line item.

---

## Finding F9 (CRITICAL · symptom CONFIRMED on rendered PDF · ROOT CAUSE ESTABLISHED) — monthly TDS = ₹0 for every employee onboarded in the current calendar year
Both old-regime employees earning ₹12L/yr gross have **Income Tax (TDS) = ₹0** on the rendered payslip PDF, YTD TDS ₹0, stored `payslips.tds = 0.00` — while the **same PDF footer states "Annual Tax Liability Rs.1,16,501 / Rs.1,63,800."** An employee who owes ₹1.16L–₹1.64L/yr has nothing withheld.

**ROOT CAUSE (code trace, corroborated by the on-screen arithmetic):** the joining-month heuristic in `packages/payroll-math/src/payroll-cycle.ts:388-391`:
```js
const joiningMonth =
  emp.joiningDate.getFullYear() > new Date().getFullYear() - 1  // 2026 > 2025 → TRUE
    ? emp.joiningDate.getMonth() + 1 - 3 // "Rough FY month"
    : 1;
```
returns a non-1 month for **any employee whose `startDate` is in the current calendar year** (every freshly-onboarded employee). A non-1 `joiningMonth` makes `computeTax` take its mid-year branch (`tax-engine.ts:291-301`), which **prorates GROSS to `monthsInFY/12` (₹700,000) but leaves standard deduction, 80C, HRA exemption and PT at FULL-year values**. Taxable then collapses **below the ₹5,00,000 old-regime threshold**, so the **s.87A rebate (`tax-engine.ts:360-361`) zeroes the tax** → `totalTaxLiability 0` → `monthlyTDS 0` (`tax-engine.ts:417`). The **display** path (`apps/api/src/lib/payslip-tax.ts:68-69`) hardcodes `joiningMonth:1 / monthsInFY:12`, so it shows the correct large liability — hence the two figures on one payslip disagree.
- Arithmetic (Sept run, fyMonth 6 → monthsInFY 7): KA run gross round(1,200,000×7/12)=700,000 − (std 50,000 + PT 2,400 + HRA 240,000 + 80C 150,000)=257,600 taxable → tax 380 → 87A wipes → **0**. Matches the observed ₹0 exactly. (HRA exemption + 80C + rent ARE wired into the run — `payroll-run-aggregates.ts:265-276` — so the run's zero is proration, not missing declarations.)
- **Blast radius: CRITICAL.** For a 2026 go-live, **every** employee has a current-year start date → **every** employee gets ₹0 TDS. Uses `new Date()` (non-deterministic; the `-1` threshold shifts each calendar year). An employee who joined *before* the current year correctly deducts ~₹9,500/mo.
- **Fix:** replace the `getFullYear()` heuristic with a fiscal-year derivation (joiningMonth=1 unless the employee actually joined within the run's FY; derive monthsInFY from the join, not the run month); unify the run + display on one shared projection helper so they can't diverge; for genuine mid-year joiners prorate deductions consistently with gross (`tax-engine.ts:293-301`).

## Finding F10 (HIGH · CONFIRMED) — payslip "taxable income / annual tax" is computed with HRA exemption hardcoded to 0
`apps/api/src/lib/payslip-tax.ts:63` builds the display tax profile with **`hraExemption: 0`** hardcoded (it wires 80C/80D/etc. from declarations but not HRA). So the payslip PDF's **"Taxable Income" / "Annual Tax Liability" overstate tax** (omit the s.10(13A) exemption) and are **inconsistent with the run path** (`payroll-math`, which *does* compute HRA exemption). Net effect: the on-screen tax view neither matches the run nor reflects the metro-driven HRA exemption — the direct cause proof (b) can't be shown.

> F9 + F10 together: the run withholds ₹0 (under-deduction) while the payslip *displays* an overstated annual tax that itself ignores HRA. The two tax computations (run vs display) disagree and neither is right on this payslip.

---

## Other findings from the cycle

### F7 (MED) — salary-structure "Effective from" defaults to *today*, silently excluding the current month
Creating a structure defaults Effective-from to the creation date (12 Aug 2026). Running **August** payroll then excluded **every** employee ("no version in effect for August 2026 … effective date falls after the 1st") — 0 employees paid, surfaced only as a run error (`21-run-excluded…png`). A first-time user who sets up and runs the same month is caught. Fixed here by back-dating structures to 1 Jul.

### F8 (MED) — a run created for a month cannot be deleted/reset in the UI, and blocks that month forever
The wedged August run (0 employees, gross-computed) had **no UI delete/reset**; creating another August run → **409** `payroll.runs.create` *"A run already exists for this month."* The month is permanently blocked from the UI. (Worked around by running September.)

### F11 (LOW/correct-guard) — statutory generation hard-blocks without EPF code
Step 13 → **400** *"Cannot generate the EPF ECR: the organisation has no EPF establishment code."* Correct guard, but combined with EPF code being *optional* at onboarding, the run stalls at CFO-approved until an admin sets it in Admin → Statutory Identity (which worked; step 13 then succeeded). PT registration was set the same way.

### F13 (MED) — no admin/HR path to view or download a payslip
The payslip PDF route restricts to the employee's own user (`apps/api/src/http/payroll-payslip-pdf.ts:42`, `eq(employees.userId, userId)`), and the completed-run detail surfaces **no** per-employee payslip list or the generated TDS/ECR/PT challans (only "Export Bank File"). So HR/Finance/admin have **no UI** to open, check, or reissue any employee's payslip — only the employee can, via the portal. (To read the proofs I minted employee sessions — flagged exception.) Echoes walk-1 "No TDS challans/No ECR" reachability gap.

### ✅ Positives verified
- **ESI ₹0** for both (>₹21k) — correct.
- **PT**: Karnataka ₹200, Delhi ₹0 — correct per state.
- **PF** capped at ₹1,800 (12% of ₹15,000 wage base) — correct.
- **Payslip tenant identity** (TAN BLRW12345A, PF code KA/BNG/12345/000/0001, CIN U74999KA2020PTC123456, org name/address) renders on the PDF — the C6 fix holds.
- **SoD** enforced (F9-adjacent positive).
- **80C** reduces taxable income / annual tax liability.

---

## Coverage
- Full 14-step cycle: **14/14 steps clicked** in the UI, screenshotted, across 4 distinct role logins (admin + HR + Finance + CFO) + 2 employee logins for payslips.
- Proof (a): mechanism verified (annual level); monthly-TDS form blocked by F9.
- Proof (b): blocked by F10 (HRA exemption absent from payslip tax view).
- Payslip PDF: opened + rendered in browser + screenshotted (`30`).
