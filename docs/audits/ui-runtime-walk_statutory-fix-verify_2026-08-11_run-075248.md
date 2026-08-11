# UI walk 2 — verifying the statutory fix from the interface (dev)

- **Date:** 2026-08-11 (run 07:52 host-local)
- **Surface:** running dev servers (web :3000, API :3001) against the dev Postgres (:5434). Logged in as `admin@coheron.com` (Administrator).
- **Tenant:** Pilot Manufacturing Pvt Ltd (`95f138a7-a51b-4b8f-a31e-37cf1e0f1796`).
- **This file is locked. Corrections go in a new dated file — do not edit this one.**
- **No code was changed. Nothing was committed.**
- Purpose: prove, from the interface, that the uncommitted fix closes the gap the first walk found. The prior walk (`ui-runtime-walk_statutory-payroll_2026-08-11_run-063424.md`) is the baseline; this does not edit it.

## The central question, answered plainly

**Yes.** An admin who hits the step-13 refusal can now fix it and complete the run **without leaving the product**: the refusal names *Organisation Settings → Statutory Identity*, that screen is reachable from the error text and the account menu, it sets the missing identifiers, and re-running step 13 succeeds and produces records. Verified end to end below.

## Environment note (had to fix before the walk was valid)

The running API dev server was serving **stale code** — the first step-13 retry still returned the *old* "India setup wizard" wording. `tsx watch` had not reloaded the edited `payroll.ts` (several stale watcher processes were present). I restarted the API dev server onto current source; the corrected message then appeared. Recorded because it means the fix is only "live" after an API restart — relevant to whoever deploys.

## The walk in order

### 1. Refusal (reproduced)
On Pilot's July run (parked at CFO_APPROVED from walk 1), ran step 13. **HTTP 400**, run stayed CFO_APPROVED. Verbatim server message, now corrected:
> Cannot generate the ESI challan: the organisation has no ESI establishment number. Set the ESI establishment number in **Organisation Settings → Statutory Identity** before generating statutory outputs.
(Verified by reading the server response; the admin sees this as a toast.)

### 2. Remedy (reached the way an admin would)
- **From the account menu:** "Organisation Settings" now links to `/app/admin?tab=org_statutory` and lands directly on the **Statutory Identity** screen (a new Admin Console tab). The wizard's "Edit in Settings" points to the same place. Both verified by clicking.
- On that screen: EPF code was pre-filled (read from the org). Set **ESI establishment number = `31001234560000999`** and **PT registration number = `PT-KA-2026-00042`**, PF rate left at 12%. Saved → toast "Statutory identity saved". (Persistence confirmed in the DB and by the retry succeeding.)

### 3. Retry (succeeded)
Re-ran step 13 on the July run. **HTTP 200**; the run advanced to **STATUTORY GENERATED**.

### 4. Records (produced; what they contain)
Step 13 wrote all four record types for July 2026 (verified in the DB):

| Record | Content |
|---|---|
| **EPFO ECR** | status `generated`; employee ₹15,650, employer ₹16,962 (EPS/EPF split 0/0 — see note) |
| **ESI challan** | 1 member; employee ₹156, employer ₹677 |
| **PT challan** | Maharashtra; **PT reg `PT-KA-2026-00042`** — the value just set — 9 employees; ₹1,800 |
| **TDS challan** | 24Q / section 192; ₹37,90,676; status pending |

The PT challan carrying the registration number set on the new screen is the direct proof the remedy fed step 13.

**Where visible in the UI:** the run-detail panel shows the correct aggregates (Emp PF ₹15,650, ESI ₹833, Prof. tax ₹1,800, TDS ₹37,90,676). The **HR → Payroll Compliance** tab now shows the records (a TDS 24Q card, an ECR row; header "1 TDS challan(s)"; the "TDS / ECR PENDING" counter went 0 → 1) where walk 1 showed "No records." **But** those cards render amounts as **₹0/blank** — see finding B.

### 5. The fields that had never been looked at — now used
- **DA % (structure form):** created "UI-Walk DA Structure" (CTC 4,80,000, Basic 40%, DA 10%). The over-allocation warning fired at Basic 80% + DA 30% ("… 110% … special-allowance residual will clamp to zero and gross may exceed CTC"). Persisted `da_percent = 10.00`.
- **Voluntary PF + Para 26(6) (employee form):** scrolled to the section and looked at it — renders as designed (VPF input; joint-request + undertaking checkboxes; approval-reference field emphasised "this is what makes uncapped PF lawful"; effective-from). Created **EMP-0004** on the DA structure with VPF 8%, joint request + undertaking, reference `EPFO/JD/2026/UIWALK`, effective 2020-01-01, Karnataka. All persisted (row read back).
- **Computation confirmed on a fresh October 2026 run** (driven through the compute pipeline via the same tRPC procedures the Execute buttons call; the Execute-button UI itself was exercised on step 13 above):

  | | EMP-0004 (DA + VPF + Para 26(6) ref) | COH-08 / COH-07 (high basic, **no** ref) |
  |---|---|---|
  | basic / **da** | 16,000 / **4,000** | 2,000,000 / 0 · 833,333 / 0 |
  | **gross** | **40,000 (not inflated)** | — |
  | **pf_wage_base** | **20,000 — uncapped** | **15,000 — capped** |
  | **pf_employee** | **4,000** (12% + 8% VPF) | 1,800 |
  | **pf_employer** | **2,159** (no VPF) | 1,951 |

  - DA is its own line and gross is unchanged (16,000+4,000+12,000 special+8,000 HRA = 40,000). ✓
  - VPF raises the employee side only; employer excludes it. ✓
  - The base uncaps **only with the reference** — EMP-0004 (ref) 20,000 vs COH-08/COH-07 (far higher basic, no ref) 15,000. ✓

### 6. Settings screen — 10% / 12% rule and persistence
- Select **10%** → the "Reason for reduced rate" field appears; Save is **disabled** without a reason.
- 10% + reason "Fewer than 20 employees" → Save → **reload** → still 10% + reason. **Persisted.** ✓
- Select **12%** → reason field hides → Save → **reload / DB** → `pf_reduced_rate_reason` is **null**; ESI and PT still set. **Reason cleared; identifiers persisted.** ✓ (Pilot left at 12%.)

## Form probes (empty / invalid / double)

| Form | Empty | Invalid | Double-submit |
|---|---|---|---|
| Login (walk 1) | named ("Invalid email", "Password required") | named toast, non-enumerating | form navigates on first submit |
| Salary structure | Structure-name highlighted, **no message** (generic) | named ("Number must be ≤ 100"); new: over-allocation warning when Basic%+DA% > 100 | modal unmounts on first submit — one row created |
| Employee | "Create record" **disabled** until required present (prevented, no message) | (as above) | modal unmounts on submit |
| Statutory Identity | no required fields — nothing refused (identifiers are optional free-text) | 10% without a reason → Save **disabled** + "Select a reason for the reduced rate." | Save disables while pending |

## Findings (traced to cause)

**A. Payroll-readiness "Errors" panel is a separate, still-wizard-pointing, stale surface.** The run detail's "Errors (2)" panel is the payroll-**readiness** signal, computed at payslip generation — a different code path from the step-13 refusal that was corrected. It still reads *"Set it in the India setup wizard (org-level fix)"* and did not recompute after the ESI number was set. Of its two lines, one (employee has no ESI IP number) is legitimately still true; the other (org has no ESI establishment number) is now stale. Not caused by, and out of scope of, the step-13 fix — recorded so it isn't mistaken for it.

**B. Payroll Compliance cards under-display produced records as ₹0.** The records exist (DB + run-detail aggregates are correct), and the tab now lists them, but the TDS card shows "TDS AMOUNT ₹0" and the ECR row shows ₹0 across EPF/EPS/EDLI/admin. Cause: those cards read the *deposited* / per-component fields (`total_tds_deposited`, EPS/EDLI/admin breakdown) that `generateStatutory` does not populate — it writes `total_tds_deducted` and the employee/employer totals. Pre-existing display path, separate from this fix.

**C. (Data artefact, not a defect) July ECR EPS/EPF split is 0/0.** July's payslips were computed before the persisted EPS/EPF split existed, so the ECR aggregate shows the employer total but 0/0 for the split. A freshly computed run splits correctly (October's EMP-0004 employer PF 2,159 = EPS 1,250 + EPF 734 + EDLI 75 + admin 100). Traced to stale payslips on the reused July run.

## Verified by looking vs. other means
- **By looking (browser):** the corrected refusal message; the account-menu → Statutory Identity route; setting ESI/PT and the "saved" toast; step-13 success → STATUTORY GENERATED; the Payroll Compliance records + their ₹0 display; the DA field + over-allocation warning; the Voluntary PF / Para 26(6) section rendered and filled; the 10%/12% behaviour and reload persistence.
- **By DB query (precise values):** the four record contents; the persisted DA structure and EMP-0004 fields; the October payslip figures (uncapped vs capped, VPF split, DA line); the settings persistence (12% clears reason, ESI/PT retained).
- **By tRPC procedure (not the button) :** advancing the October run's compute pipeline (lock → advanceComputationStep → computePayslips) — the same procedures the Execute buttons invoke; the Execute-button UI itself was used for step 13.

## Dev-state changes (dev DB only)
Set Pilot's ESI number (`31001234560000999`, a placeholder) + PT registration (`PT-KA-2026-00042`); PF rate cycled 10%→12% (left at 12%). July run advanced to STATUTORY_GENERATED with real records. Created "UI-Walk DA Structure" and employee EMP-0004; created an October 2026 run with computed payslips. Restarted the API dev server onto current source. Nothing committed.
