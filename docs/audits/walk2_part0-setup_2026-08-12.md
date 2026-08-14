# WALK 2 — Part 0 Setup (onboarding + tenant provisioning), localhost

- **Live SHA:** `5c5490d` (branch `main`) — matches deployed.
- **Env:** web `http://localhost:3000`, api `http://localhost:3001`, dev DB port 5434, migration head `0081`.
- **Method:** browser is the test (Playwright), every step screenshotted to `docs/audits/walk2-shots/`. Network watched per click. Secondary DB/API checks only *beside* an on-screen result, never instead.
- **Tenant built (fresh, this run):** org `WALK2 QA Co` / slug `walk2-qa` / id `e526a530-16dd-4485-b3f8-15e75f91cee8`. Bootstrap = the one allowed non-browser seed (org + admin `admin-w2@walk2.local` + session). Everything below is browser-driven.

---

## A. Onboarding wizard — 7 steps, COMPLETED (screenshots 01–08)

| Step | Screen | Verdict | Evidence |
|------|--------|---------|----------|
| 1 | Welcome / Start Setup | works | `01-onboard-step1-welcome.png` |
| 2 | Company profile (name, industry, size, city, state, website, support email) — 7 required fields, Continue gated until all set | works; validation gate correct | `02..03` (empty→filled) |
| 3 | India compliance (entity type, GSTIN, PAN*, TAN*, EPF, ESI, state code*, CIN*, AATO, seed toggles) | works; **see Finding F1** | `04-onboard-step3-india-compliance.png` |
| 4 | Invite team → defers to Admin → Users; Skip for now | works (link only) | `05-onboard-step4-invite-team.png` |
| 5 | ITSM SLA defaults (P1 4 / P2 8 / P3 24 / P4 72 hrs, prefilled) | works | `06-onboard-step5-itsm-sla.png` |
| 6 | Finance setup — Apply & Continue seeds COA/holidays | works; real calls (see B) | `07-onboard-step6-finance-seed.png` |
| 7 | Setup complete | works | `08-onboard-step7-complete.png` |

Backend calls confirmed on completion (network tab): `onboarding.saveWizardData` (200, several), `accounting.coa.seed` (200), `hr.holidays.seedIndiaHolidays` (200), `onboarding.completeWizard` (200).

### Finding F1 — entity→identifier conditional works; CIN is REQUIRED for Private Limited (mandate hypothesis corrected)
Selecting **Private Limited Company** dynamically reveals a required **CIN \*** field (21-char). With PAN/TAN/State filled but **GSTIN/CIN/EPF/ESI blank, Continue stays DISABLED**; filling a valid CIN alone enables it. So:
- Leaving **GSTIN / EPF / ESI / AATO blank still completes** — TRUE.
- Leaving **CIN blank still completes** — **FALSE**: CIN is enforced-required for a Pvt Ltd.

This is arguably correct (a Pvt Ltd legally has a CIN), but it contradicts the handoff's "leaving …/CIN/… blank still completes" expectation. **Severity: informational** (validation is stricter than expected, not broken). No screenshot of an error toast — the gate is a disabled button, captured in `04`.

---

## B. Chart of Accounts seed — VERIFIED IN BROWSER (screenshot 09)

Navigated to `/app/finance/accounting/coa` after wizard. ~47 India-standard accounts rendered (codes 1000–5600), incl. GST ITC 1140/1141/1142/1143, GST Payable 2120–2123, **TDS Payable 2130, PF Payable 2140**, TDS Receivable 1150, payroll expense 5200/5210/5220, Accumulated Depreciation 1290. All tagged `System`.
- Minor: wizard step 6 labels it "40 accounts"; the seeded set is ~47. **Cosmetic count mismatch.**

### Finding F2 (re-confirm walk-1) — COA "Add Account" button is INERT
Clicked **Add Account** (`/app/finance/accounting/coa`). Result: **no dialog, no new form inputs, no network request** (only the page-load `accounting.coa.list` GET exists; no `accounting.coa.create` fired). Backend `accounting.ts` create exists → **front-end wiring missing**. Reproduces walk-1. **Severity: high** (cannot add accounts via UI). Evidence: `09-coa-after-seed.png` + network capture (only `coa.list`).

### Finding F3 (re-confirm walk-1) — category filter chips mis-pluralised
Filter chips render **`LIABILITYS`, `EQUITYS`, `INCOMES`** (naive `+S`). Should be Liabilities / Equity / Income. **Severity: low (cosmetic).** Evidence: `09-coa-after-seed.png`.

---

---

## C. Salary structures — 2 created in UI (screenshots 10–13)

Payroll → Salary structures → New structure.
- **QA Band A - Services** (from the "Services / IT" template): Base Pay ₹12,00,000, Basic 50%, HRA 50%. `payroll.salaryStructures.upsert` 200.
- **QA Band B - Scratch DA10** (from scratch): Base Pay ₹9,00,000, DA 10% → **Basic auto-derived to 40% and rendered read-only**, HRA 50%.

### Finding F5 (positive) — DA→Basic composition rule works
Setting **DA % = 10** made the **Basic %** field recompute to **40** and flip to `readOnly` (confirmed via DOM: `readOnly:true, value:"40"`). Matches the Base-Pay composition decision (Basic = 50 − DA, server-and-form enforced). Evidence `12-structureB-da-derives-basic.png`.

### Finding F6 (low, re-confirm walk-1) — "Annual CTC" vs "Base Pay" label drift
Structure **list** column header says **"Annual CTC"**; the **editor** field is **"Base Pay"**. Same value, two names. Evidence `13-structures-list.png`.

### Note — salary-structure template is thin
Clicking a template ("Services / IT") prefills only the **name**; Base Pay/DA/HRA/LTA stay at defaults (0/0/50/50). Not a defect, but the template does little. Evidence `11-structureA-filled.png`.

---

## D. Role users — 4 created via Admin invite UI (screenshots 14–16)

Admin → User Management → New User. Each: Full Name + Email + System Role + **Matrix Role** (settable in UI) → Send Invite (`auth.inviteUser` 200).
- Hana HR — matrix `hr_manager`
- Fiona Finance — matrix `finance_manager`
- Carl CFO — matrix `finance_manager` (distinct identity for SoD; both finance approvers need `financial.write`)
- Eddie Employee — matrix `requester`

### Finding F4 — user creation is invite-link based (fully UI-completable, no email needed)
"Send Invite" creates the user (status `invited`, matrixRole set) and shows an **in-app registration link** `/invite/<token>`; the acceptance page (name + password → activate) renders. Positive: no email-delivery dependency in dev. For the SoD logins I used the handoff-sanctioned **bootstrap exception** (activate + mint session token) rather than submitting password forms. Evidence `14/15/16`.

---

## E. Employees — proof pair created via Add-employee FORM (screenshots 17–18)

HR → Employee Directory → Add employee. The form exposes everything needed for the proofs **in-UI**: Salary structure, State, **Metro-city checkbox** (50% HRA), Tax regime, PAN, gender, **Rent paid (₹/yr)**, Form-12B prior income/TDS, VPF, Para 26(6). Required = name + email + state + structure.
- **EMP-0001 Ravi KA Old** — Karnataka/Bengaluru, **metro unchecked (→40% HRA)**, **Old** regime, Band A, rent ₹6,00,000, joined 1 Jul 2026. `hr.employees.create` 200.
- **EMP-0002 Devi Delhi Old** — Delhi/New Delhi, **metro checked (→50% HRA)**, **Old** regime, **same Band A**, rent ₹6,00,000, joined 1 Jul 2026.

These two are the **proof-(b) pair** (same band, differ only by metro). Rent ₹6,00,000 chosen so the metro % is the binding HRA-exemption constraint (expected monthly exemption KA ₹20,000 vs Delhi ₹25,000). Auto EMP-NNNN allocator works (0001, 0002).

### Positive — audit log is live
Admin overview "Recent Audit Activity" shows my `salaryStructures.upsert`, `command_center.view`, `onboarding.completeWizard` with timestamps — the tamper-evident audit trail records these actions.

---

## Coverage so far
- Onboarding wizard **7/7**, COA seed verified, 2 structures, 4 role users, 2 proof-pair employees — all in the browser with screenshots.
- Findings: F1 (CIN required), F2 (Add Account inert), F3 (chip plural), F4 (invite-link users), F5 (DA→Basic OK, positive), F6 (CTC/Base-Pay label drift).

## Completion status (updated end of walk)
- **Employees:** 2 via form (proof pair) + **18 via CSV bulk import** = **20 total** (across KA/Delhi/TN/Kerala, mixed regimes, both bands, a mid-month joiner). CSV importer verified incl. per-row skip reporting (see `walk2_negative-and-reachability` F16). 80C tax declaration added (Ravi). The ~92-row target was reduced to 18 for the importer scale test (recorded, not a full 92).
- **org-B** created + tenant isolation verified (`walk2_authz-isolation_2026-08-12.md`).
- **Part 5** completed: full 14-step cycle across HR/Finance/CFO + payslip PDF → surfaced **F9 CRITICAL** (`walk2_part5-payroll-proofs_2026-08-12.md`).
- **Route coverage** 130/130 + **procurement/accounting** + **negative/reachability** audits written.
- **Not done:** a dedicated offboarding/leaver toggle (deferred — payroll leaver handling was exercised via the run's incomplete-row logic in Part 5); full 92-employee import; exhaustive per-module create-button sweep.
