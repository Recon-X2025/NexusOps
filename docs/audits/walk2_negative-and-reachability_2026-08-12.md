# WALK 2 — Negative testing & reachability (localhost, SHA 5c5490d)

**Method:** browser is the test; every result observed on screen / in the network tab, screenshots in `docs/audits/walk2-shots/`.

## Negative / validation testing — what the product correctly refuses (mostly ✅)

| Test | Input | Result | Verdict |
|------|-------|--------|---------|
| Onboarding required fields | leave company profile / PAN / TAN / state / CIN blank | Continue stays **disabled**; Pvt-Ltd **CIN enforced-required** (F1) | ✅ gate works |
| Journal entry balance | debit ₹1,000 ≠ credit ₹500 | **"Unbalanced" → Save disabled**; balancing enables it | ✅ invariant enforced |
| CSV import — empty name | row with no `name` | **skipped, "Row 21: Name is required"** | ✅ caught (client) |
| CSV import — unknown structure | `structureName = "No Such Band"` | **skipped server-side** (18 created not 19) | ✅ caught (server) |
| CSV import — wrong enum | `employmentType = "Full time"` | **all 20 rows rejected** with precise reason (F16) | ✅ strict (but see F16) |
| Payroll SoD | Finance approves, then clicks CFO step | **403 "Segregation of duties…"** | ✅ enforced |
| Payroll permission | CFO (finance_manager) generates statutory | **403 "Permission denied: payroll.write"** | ✅ enforced |
| Cross-tenant read | org-B fetches org-A payslip PDF by id | **HTTP 404** | ✅ denied |
| Detail route, bad id | `/app/tickets/<bogus-uuid>` | **"Ticket Not Found → Go Back"** | ✅ graceful |
| Tax declaration on new-regime | (per Part 0) new-regime warning shown; provenance=provisional | ✅ (declarations tab) |
| Duplicate month run | second August `payroll.runs.create` | **409 "A run already exists for this month"** (F8) | ✅ refused (but no delete → wedge) |

### F16 (MED) — CSV importer enum/label mismatch + confirm-count drift
The importer requires **snake_case enum values** (`employmentType = full_time`, not the Add-employee form's displayed **"Full time"**). The "Expected columns" hint + Download-template do **not** list allowed values, so a user copying the form's labels gets every row rejected. Also: the **Confirm** step predicted "19 will be created / 1 skipped", but the **Done** step created **18** (the unknown-structure skip is server-side and not reflected in the client preview count). Positive: per-row error reporting is precise and the happy path imported 18 employees. `35-csv-import-validation.png`, `36-csv-import-done.png`

## Reachability defects — controls/routes that don't reach their function

| # | Finding | Evidence |
|---|---------|----------|
| **F2** (HIGH) | CoA **Add Account** inert — no dialog, no `coa.create` | `09-coa-after-seed.png` |
| **F18** (MED) | Procurement **"+ PO"** inert — no request, no modal, no PO | `37-…plusPO-inert.png` |
| **F13** (MED) | No admin/HR path to any payslip — PDF route is self-service-only (`payroll-payslip-pdf.ts:42`); completed-run detail lists no payslips or the generated TDS/ECR/PT challans | Part 5 |
| **F8** (MED) | A payroll run can't be deleted/reset in the UI; a run made before structures are valid wedges the month (409 on retry) | `21-run-excluded…png` |
| **F15** (MED) | `/app/devops` **and** `/app/developer-ops` render **"Something went wrong — 404"** (two dead routes) | `route-devops-404.png` |
| **F11** (LOW) | Statutory generate hard-blocks with no EPF code (correct guard, but EPF code optional at onboarding → run stalls at CFO-approved until set) | Part 5 |

## Console-error / cosmetic

| # | Finding |
|---|---------|
| **F14** (LOW) | `/app/profile` React duplicate-key warning `admin` (roles list). `route-profile-keywarn.png` |
| **F3** (LOW) | CoA chips `LIABILITYS / EQUITYS / INCOMES` |
| **F6** (LOW) | Salary-structure list "Annual CTC" vs editor "Base Pay" |
| **F12** (LOW) | Forbidden controls still rendered (CFO-approve shown to Finance; statutory shown to CFO) — 403 on click |
| **F19** (LOW) | `₹$` double currency symbol (procurement estimate + spend tiles); truncated raw ids ("…5ecc78") |

## Coverage
- 130/130 routes verdicted (see `walk2_route-coverage_…md`); **2 error routes** (F15), **1 console-warning route** (F14); everything else 0 console errors.
- Negative inputs exercised across onboarding, journal, CSV import (3 bad-input classes), payroll approvals (SoD + permission), cross-tenant, and bad-id detail routes — all refuse correctly.
- **Not tested:** exhaustive per-module create-button inertness sweep (spot-checked: CoA Add-Account and Procurement "+ PO" are inert; Journal create, Requisition create, Employee create/import, Invite user, Salary structure, Tax declaration all **work**). Remaining "New/Add" buttons across ~40 list pages were loaded but not each clicked — recorded as the residual gap.
