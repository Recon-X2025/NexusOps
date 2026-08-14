# Deployed walk — the full cycle on connect.coheron.tech (first ever)

- **Date:** 2026-08-12 (run 20:12 host-local)
- **Surface:** the **DEPLOYED** platform `connect.coheron.tech` — not a dev server. Real Chrome, existing authenticated session.
- **Live SHA:** `5c5490d9d2503b934ff29b35b6d66aacbb0c62a4` (from `/api/health`; today's C1-second-half deploy). Everything below is relative to this commit.
- **Tenant walked:** **"Coheron Tech"**, logged in as **Karthik Iyer (admin)**. NOT Pilot Manufacturing. This tenant already carries data (4 employees, a completed Aug-2026 payroll, procurement, the known Amit-Mehra negative-days leave row) — so Part A "create org" was walked as *onboarding-wizard-on-the-existing-tenant*, not a fresh signup (account creation + password entry are outside what this operator can do).
- **This file is locked. Corrections go in a new dated file — never edit this one.**
- **No code was changed. Nothing was committed. Nothing was deleted** (the Amit-Mehra row was left untouched).
- **Placeholder policy:** where a value was invented it was an obvious flagged fake (80C ₹1,50,000 on a new-regime employee → no effect; no real statutory identifiers were written).
- **Legend:** `[LOOK]` = verified by looking in the UI · `[QUERY]` = verified by the network/DB response · cause cited to `file:line` where established, else "cause unestablished".

---

## The central question, answered plainly

**Can a customer complete onboarding, run a payroll, produce statutory records, and raise a purchase order on the deployed platform?**

**Mostly yes — with two hard procurement breakages and one statutory-artefact gap.**

- **Onboarding — YES.** The wizard works; the entity-type branch (LLP→LLPIN, proprietorship→neither, company→CIN) is live and correct; GSTIN/CIN/EPF are optional.
- **Run a payroll — YES, demonstrably.** A completed Aug-2026 run exists with all 14 steps green, the full **HR→Finance→CFO** approval chain recorded, PF/PT/TDS computed, ESI ₹0 (no members, run not blocked), and the **payslip PDF renders on the deployed stack** (render-on-the-fly — customers can hand employees payslips).
- **Produce statutory records — PARTIAL.** The run *computes* statutory amounts (visible on run totals + payslips), but the **Payroll Compliance tab shows no TDS-challan and no ECR record even after a completed run**, and the ECR card points at a raw procedure name (`hr.payroll.generateECR`) with **no UI button** — so the challan/ECR *artefacts* are not reachable from that screen.
- **Raise a purchase order — YES to raise, NO to approve.** PO-0001 exists (raised). But **the only Approve control (dashboard Pending Actions) 404s** because it calls the purchase-*requisition* approve procedure on a purchase-*order* id. And, adjacent, the **Chart-of-Accounts "Add Account" button is inert** (opens nothing).

**Net blockers for the first procurement cycle:** PO approval (C-BUG2) and COA add-account (C-BUG1). Everything payroll/onboarding is in good shape.

---

## Confirmed defects (most material first)

### C-BUG2 — PO approval is broken: dashboard Approve calls the wrong procedure → 404  [QUERY]
Procurement dashboard → **Pending Actions → PO-0001 "Direct PO" (status "sent") → Approve** fires `POST /api/trpc/procurement.purchaseRequests.approve` → **HTTP 404**. The failing procedure is the purchase-**requisition** approve, invoked with a purchase-**order** id, so the id is not found. The PO stays "sent". The PO detail page itself offers only *Print* + *Record Receipt* — **no Approve** — so a PO that needs approval has **no working approve path in the product**. Cause established as front-end wiring (PO Approve → `purchaseRequests.approve`); exact component line not read in this walk.

### C-BUG1 — Chart of Accounts "Add Account" is inert (create path unreachable)  [LOOK+QUERY]
Finance → Accounting → Chart of Accounts → **"Add Account"** clicked twice (by coordinate and by element ref). Result: **no modal, no new-account form in the DOM, no network request, no console error.** The COA backend exists (`apps/api/src/routers/accounting.ts:159`, `coa` router), so this is **front-end**: the button's onClick opens no form. **A customer cannot add a chart-of-accounts account through the UI.** This reproduces the previously-reported "add-account broken" symptom that could not be reproduced from code. (Contrast: "Seed India COA" button is present; the COA is already seeded.)

### B-GAP1 — statutory challan/ECR artefacts not surfaced or reachable after a completed run  [LOOK]
HR → **Payroll Compliance**: "TDS Challans (ITNS 281): **No TDS challans recorded**" and "EPFO ECR: **No ECR submissions recorded**", even though the Aug-2026 run completed Step 13 "Statutory outputs". The ECR card's own hint reads *"Use `hr.payroll.generateECR` after running payroll"* — a **raw procedure name with no UI button**. So the ECR/challan generation is only reachable via a tRPC call, not the product. (The cards themselves render **honest empty states, not a fake ₹0** — the SURFACES fix is working; the gap is that no artefact row exists/surfaces + no trigger button.) Cause unestablished as to whether the statutory-outputs step persists challan/ECR rows at all vs. `generateECR` being a separate unexposed action.

---

## Number-formatting / label defects (Part E — "would make a customer pause")

- **C-FMT2 [LOOK]** Procurement dashboard: **"Total PO Value: ₹160000K"** (should be ₹16 Cr / ₹16,00,00,000); **"SPEND BY CATEGORY" rows show "₹$1L" / "₹$0L"** (both ₹ and $ symbols); PO-0001 amount shows **"₹$16,00,00,000"**. These are dashboard-cards-only — the PO list/detail render correctly ("INR 16,00,00,000"). Matches the `₹160000K` / `₹$1L` the prompt flagged.
- **C-FMT1 [LOOK]** Chart of Accounts filter chips read **"LIABILITYS", "EQUITYS", "INCOMES"** (naive +S) — should be Liabilities / Equity / Income.
- **C-FMT3 [LOOK]** Invoice **list** renders vendor as truncated **"Vendor …6cbe58"** (partial UUID); the invoice **detail** resolves the real name ("Acme Supplies Pvt Ltd"). Vendor name not resolved in the list.
- **C-FMT4 [LOOK]** IT Financial Management header **"FY2026 IT Budget: ₹0.1Cr"** (₹10,00,000 would read ₹10L).
- **A-FMT1 [LOOK]** Salary-structures **list** still reads column **"Annual CTC"** + subtitle "CTC templates…", while the editor uses "Base Pay". The Base-Pay relabel didn't reach the list.
- **A-DATA1 [LOOK]** Employee "TEST" (EMP-0004) Joined shows **"10 Aug 2006"** — almost certainly a 2026 typo.
- **B-PR5 [LOOK]** Payslip (portal + PDF) YTD is inconsistent: **YTD Gross and YTD TDS populated, but YTD PF = ₹0 and YTD Net = ₹0** — the known PR5 partial-YTD issue, visible in prod.
- **D-UX1 [LOOK]** Leave create/edit forms don't pre-validate date order client-side; they rely on the server 400, and on failure the edit modal stays open with the bad dates and only a (transient) toast, no inline error.

---

## What works — today's shipped features, verified LIVE on the deployed build

### Onboarding & entity (Part A)  [LOOK unless noted]
- **A-OK1** Wizard Step 3 renders the C1 changes: "Legal Entity Type *" dropdown (8 options, exact enum); **GSTIN has no `*`** (optional); PAN*/TAN*/State* required; EPF/ESI optional.
- **A-OK2** Entity branch all three ways: **LLP → LLPIN field** (placeholder AAB1234, "an LLP's equivalent of a CIN"), **no CIN**; **Sole Proprietorship → neither**; company → CIN (per hint/schema).
- **A-OK3 [QUERY]** `onboarding.getWizardData` → 200. That query does `select().from(legalEntities)` over all columns incl `llpin`, so a 200 **confirms `legal_entities.llpin` exists on PROD** (migration `0081`, deployed today) — verified, not merely inferred from a booted server.
- **A-OK5/6/7 [LOOK+QUERY]** New-structure modal: **4 starter-template buttons** (Services/IT, Manufacturing, Retail/Hospitality, Sales); **Base Pay** relabel; **Basic % read-only/derived** (50); DA input; **no Bonus/Medical/Conveyance**. Manufacturing prefill → DA 10 / HRA 40. Saved from template → `salaryStructures.upsert` 200; list shows Basic 40% / HRA 40% (composition Basic+DA=50 held server-side).

### Leave (Part D / today's 1c + Step 2)  [LOOK unless noted]
- **D-OK1** Leave labels live: list shows "Annual Leave" (stored `vacation`), "Sick / Casual Leave" (stored `sick`), "Unpaid Leave". Request picker offers exactly 5 options — **no "Other"**; stored values still raw enum. Edit modal relabeled too.
- **D-OK2 [QUERY]** CREATE reversed-date rejected: `hr.leave.create` → 400 (start 15/08 > end 10/08), no row added.
- **D-OK3 [QUERY]** UPDATE reversed-date rejected: `hr.leave.update` → 400 (edit to start 18/08 > end 10/08), row unchanged. **This is today's `5c5490d` Step-2 fix, working in prod.**

### Payroll cycle (Part B)  [LOOK unless noted]
- **B-OK1** Completed run #2 (Aug 2026, 2 employees): **all 14 steps green** incl Step 9 Payslips, Step 13 Statutory outputs, Step 14 Completed. **Approvals: HR 03 Aug 06:02 → FINANCE 16:00 → CFO 16:08** — the chain **is completable** (caveat: approvers were the admin, distinct non-owner-role segregation not tested this pass).
- **B-OK2** Run totals: Emp PF ₹3,600 (= ₹1,800×2, ₹15k PF ceiling applied), **ESI ₹0** (no members — cohort >₹21k; run **not blocked** by ESI, statutory produced anyway), Prof tax ₹400, TDS ₹31,36,494.
- **B-OK3** Karthik's payslip: components **sum correctly** (Basic+HRA+Special+LTA = Gross ₹29,84,785); **LTA = ₹29,570, a real computed value, NOT the old fabricated ₹30,000**. (Regime = NEW, so HRA-metro and 80C effects are N/A here — see coverage gap.)
- **B-OK4 [LOOK+QUERY] (make-or-break)** **Payslip PDF works on the deployed stack.** "Download PDF" → `/api/payroll/payslip-pdf/<uuid>` renders a full statutory payslip (Coheron Tech header; EMP-0002; PAN; Days-in-month 31 / Paid 22 / LOP 9; earnings+deductions; NET Rs.14,14,538 in words; Employer PF Rs.1,951, Total CTC Rs.29,86,736; YTD block). Render-on-the-fly confirmed live — no object storage needed.
- **B-OK5** Attendance→LOP reflex works: Karthik's Approved 9-day Unpaid Leave shows as "9 LOP" on the payslip (Paid 22 / LOP 9 / 31).
- **B-OK6/7 [LOOK+QUERY] (today's 1a)** Tax Declarations tab live: "old regime only… no tax effect" header; declaration modal shows the **new-regime no-effect warning**, 5 sections with correct caps (**80C cap = ₹1,50,000**, not the wrong ₹1 lakh). Saved Amit's 80C=150000 → `payroll.taxDeclarations.upsert` **200** → the `0080` `tax_declarations` table is **writable on prod** (provenance=provisional).
- **B-OK8** Payroll Compliance cards render **honest empty states** (not fake ₹0) — SURFACES fix confirmed. (But see B-GAP1 for the artefact gap.)

---

## Verified by LOOKING vs by QUERY (separated)

**By query (network/DB response):**
- `onboarding.getWizardData` 200 → `legal_entities.llpin` exists on prod (A-OK3).
- `salaryStructures.upsert` 200 → template structure saved (A-OK7).
- `hr.leave.create` 400 / `hr.leave.update` 400 → both reversed-date guards fire (D-OK2/3).
- `procurement.purchaseRequests.approve` 404 → PO approve broken (C-BUG2).
- COA Add Account → no network request at all (C-BUG1).
- `payroll.taxDeclarations.upsert` 200 → declaration writes on prod (B-OK7).
- Payslip PDF served from `/api/payroll/payslip-pdf/<uuid>` (B-OK4).

**By looking (rendered UI):** everything else above — entity-branch field visibility, leave labels, run steps + approvals, payslip components/LTA/LOP, compliance empty states, all the format/label defects, the Amit-Mehra negative-days row, the invoice-match absence.

---

## Coverage gaps — walked incompletely or not at all (stated honestly)

- **Old-regime effects NOT verifiable on this tenant** — all 4 employees are **New regime**, so HRA-metro (Delhi 50% vs Karnataka 40%) and 80C-reduces-TDS could not be shown live on a payslip. These remain code/test-verified (`c1-core.test.ts`), not walked in prod.
- **Non-owner role segregation** (Step 8) not tested — the completed chain's approvals were the admin; distinct HR/Finance/CFO non-owner roles not exercised.
- **Readiness-panel** trigger/clear (Step 13) not walked (budget).
- **PO doc upload honest-failure** (Step 21) not confirmed — the Upload button is present and **enabled** (not disabled-honestly), but driving a native file picker isn't feasible via automation; whether it fakes success on the no-object-storage stack needs a manual test.
- **Object-storage matrix** (Step 22), **Documents/onboarding disabled-controls** (Step 23), **goods-receipt creation** (Step 17), **journal-from-receipt** (Step 19), **stock/valuation** (Step 20), **employee bulk import name-matching** (Step 6) — not walked this pass.
- **Amit's leave balance** (Part 25) could **not** be read from the admin UI (Leave Accruals shows only run controls + "No leave policies defined"; no per-employee balance table). Capturing it for corrective-SQL verification needs a prod DB read: `SELECT * FROM leave_balances WHERE employee_id = <Amit EMP-0001> AND type='sick' AND year=2026`.

---

## QA-script reachability list (directly for the testers)

| QA step | Reachable? | Path / note |
|---|---|---|
| Onboarding wizard + entity type | **YES** | Setup & Onboarding → Setup Wizard, Step 3 |
| LLP → LLPIN, proprietorship → neither | **YES** | same screen, live |
| Salary structure (starter + scratch) | **YES** | Payroll → Salary structures → New structure |
| Employee form / bulk import | **Present** (not fully walked) | HR → Employee Directory → Add employee / Import CSV |
| Tax declarations (80C, provisional, new-regime warning) | **YES** | Payroll → Tax declarations → Edit declaration |
| Lock/compute/approve chain (HR→Finance→CFO) | **YES** (completable) | Payroll → run → cycle steps + Approvals |
| Payslip detail + **PDF download** | **YES** | Employee Portal → My payslips → Download PDF |
| Statutory generation (run step) | **YES** (run marks it done) | Payroll → run → Step 13 |
| **TDS challan / ECR artefacts** | **NO usable UI** | Payroll Compliance shows none post-run; ECR only via `hr.payroll.generateECR` (no button) — **B-GAP1** |
| Payroll Compliance cards (real figures / "—") | **YES** (honest empty states) | HR → Payroll Compliance |
| Vendor | **Present** | Finance → Vendors (walked via PO-0001 vendor) |
| **Chart of Accounts → Add Account** | **NO** | button inert — **C-BUG1** |
| Raise a PO | **YES** | Procurement → New Purchase Order (PO-0001 exists) |
| **Approve a PO** | **NO** | dashboard Approve 404s; PO detail has no Approve — **C-BUG2** |
| Record goods receipt | **Present** (not walked) | PO detail → Record Receipt |
| **Invoice ↔ PO 3-way match** | **NO — not built in UI** | Invoices live in Finance → Financial Management → Invoices / Accounts Payable (separate from Procurement). PO-REF column all "—"; invoice detail shows "PO Reference: Direct Invoice"; only Pay / Mark Paid / Print — **no Match/variance action anywhere**. The QA-script three-way-match step describes unbuilt UI — **C-18**. |
| PO document upload | **Reachable/enabled**; honest-failure unverified | PO detail → Documents → Upload — **C-21** |

---

## State created (for cleanup or deliberate keep) — on tenant "Coheron Tech"

1. **Salary structure** "ManufacturingWALK-TEST Manufacturing (delete me)" — Base Pay ₹6,00,000, Basic 40 / DA 10 / HRA 40, eff 12 Aug 2026. (Name got the template prefix "Manufacturing" prepended because the template prefills the name field and I typed without clearing — cosmetic.) **Safe to delete.**
2. **tax_declarations** row for **Amit Mehra (EMP-0001)**, FY 2026-27, `section_80c = 150000`, provenance `provisional`. **Harmless** (Amit is new-regime → no tax effect). Delete or keep.
3. No leave rows created (both reversed-date attempts were rejected). The **Amit-Mehra −1.0-day row was NOT touched**.
