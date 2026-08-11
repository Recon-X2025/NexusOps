# UI runtime walk — statutory config + payroll → step 13 (dev)

- **Date:** 2026-08-11 (run 06:34 IST-local host)
- **Surface:** running dev servers (web :3000, API :3001) against the dev Postgres (:5434).
- **Tenant:** Pilot Manufacturing Pvt Ltd (`95f138a7-a51b-4b8f-a31e-37cf1e0f1796`). Onboarding completed 09/08/2026.
- **Identities used (dev seed, same password):** `admin@coheron.com` (owner / Administrator), `hr@coheron.com` (member / hr_manager / "Morgan Lee"), `finance@coheron.com` (member / finance_manager / "Taylor Kim"). Login handled in-session per explicit instruction; documented throwaway dev credential.
- **This file is locked. Corrections go in a new dated file — do not edit this one.**
- **No code was changed. Nothing was committed.**

This walk is standing-behaviour observation against a live tenant. Dev data was mutated (the July 2026 run was advanced HR→Finance→CFO; see "Dev-state changes").

---

## Summary of the walk in order

| Step | Attempted via UI | Outcome |
|---|---|---|
| Login | admin, then hr, then finance, then admin | Works. Form probes recorded below. |
| 1. Set ESI + PT-registration on the org | Searched wizard, org settings, account menu | **No screen offers them.** ESI is offered only in the onboarding wizard, which is completed/read-only for this tenant. PT registration and PF-rate are offered nowhere. |
| 2. Salary structure with a DA % | New structure form | Structure created — but the form has **no DA % field**. DA composition is not settable. |
| 3. Employee with VPF + Para 26(6) | Add-employee form | Form has PAN/UAN/ESI-IP/PT-exemptions/Form-12B/HRA — but **no Voluntary PF and no Para 26(6) fields**. Not settable. |
| 4. Run payroll: compute→payslips→HR→Finance→CFO→step 13 | July 2026 run (already at payslips), real approvals by three identities, then step 13 | Approval chain works with SoD. **Step 13 refused (HTTP 400)** — ESI establishment number missing; run stayed CFO_APPROVED, no records written. |
| 5. Find ECR/ESI/PT/TDS records in the UI | HR → Payroll Compliance; run detail | Payroll-run detail shows **aggregates only**. The dedicated tab shows **"No TDS challans" / "No ECR submissions"**. For this tenant no statutory records exist in any of the four tables (verified in DB). |

---

## What was shown at each step

### Login (form probed before correct use)
- **Empty submit:** field-level, named — "Invalid email address" and "Password required".
- **Invalid credentials** (valid email + wrong password): toast — *"That email and password do not match any account on this server. If you have not registered yet, use Sign up free below."* Correctly non-enumerating.
- **Double-submit:** the form navigates on the first successful submit, so a second click has no target; no double-session observed from the UI. (Same shape on every modal form below — the control unmounts on first submit.)

### Step 1 — ESI establishment number and PT registration number
Required by step 13 (it refuses without them). Attempted through the product's screens:
- **Onboarding wizard** (`/app/onboarding-wizard`): shows "Setup Completed … 09/08/2026", **read-only**. India Compliance card lists GSTIN, PAN, CIN, TAN, EPF code — **no ESI, no PT registration, no PF rate**. Its "Edit in Settings" button links to `/app/admin`.
- **`/app/admin`** (also where the account menu's "Organisation Settings" points): user-management console — **no India-identifier fields**.
- The wizard's editable India step (only reachable *before* completion) offers gstin/pan/cin/tan/**pf**/**esi**/stateCode/turnover — so ESI is settable **only during onboarding**, and **PT registration + PF rate are not offered anywhere at all**.

**Consequence:** for a tenant that has completed onboarding without an ESI number (Pilot), there is **no UI path** to supply the ESI establishment number, the PT registration number, or the PF contribution rate. Step 13 therefore cannot be completed through the product for any run that owes ESI or PT.

### Step 2 — salary structure with a DA %
- **New structure** form fields: Structure name, Annual CTC, Basic %, HRA % of Basic, LTA, Medical, Conveyance, Bonus, Effective from/to. **No DA % field.**
- Probes: **empty submit** → Structure-name field highlighted (amber), **no textual message** (generic). **Invalid** (Basic % = 150) → named message *"Number must be less than or equal to 100"*. **Double-submit** → modal unmounts on first submit; exactly one row created (`PROBE-DA-walk`, ₹6,00,000, 40%/50%). Structure created successfully but **with no DA**.

### Step 3 — employee with VPF + Para 26(6)
- **Add-employee** form sections: User link / new user, Department/Title/Location, Employment type, Manager, Salary structure, Start date, State (+ City/Metro), Tax regime, **Statutory identity** (PAN, UAN, ESI IP number, Gender, DOB, bank details), PT exemptions, Form 12B prior-employer, HRA rent. **No Voluntary PF rate. No Para 26(6) fields** (joint request / employer undertaking / approval reference / effective date).
- Probe: **empty submit** → the "Create record" button is **disabled** until required fields are present (prevented, no message).
- Because the fields do not exist, "create an employee with a VPF rate / Para 26(6)" is **impossible by construction** through the UI.

### Step 4 — payroll run and the approval chain
Driven on the July 2026 run (already at payslips-generated, 9 employees, net ₹44,44,217):
- **HR approval as `hr@` (Morgan Lee):** succeeded → "HR APPROVED", stamped 11 Aug 06:23. After approving, **no Execute button rendered for the Finance step** for `hr@` — the UI gates Finance/CFO behind `financial.write`, which hr_manager lacks.
- **Finance approval as `finance@` (Taylor Kim):** succeeded → "FINANCE APPROVED", 06:26.
- **CFO approval as `admin@` (owner):** succeeded → "CFO APPROVED", 06:28. Full HR→Finance→CFO chain by three distinct identities, SoD respected.
- **Step 13 (Statutory outputs) as `admin@`:** **HTTP 400, refused.** The run stayed `CFO_APPROVED` (verified in DB); no records written. Verbatim server message:
  > Cannot generate the ESI challan: the organisation has no ESI establishment number. Set the ESI establishment number in the India setup wizard before generating statutory outputs.
- The refusal points the admin to "the India setup wizard" — the same screen that is read-only after onboarding and offers no ESI field. **The fix the error demands is itself unreachable in the UI.**

Persistent **Errors (N)** panel on the run detail (payroll readiness), verbatim, naming employees by user id:
- `1c9dfc41-…-1569e6677432`: "Employee is an ESI member this period, but the ORGANISATION has no ESI establishment number — a mandatory payslip field would print blank. Set it in the India setup wizard (org-level fix)."
- `1c9dfc41-…`: "…but has no ESI IP number on their record — … Set the employee's ESI IP number (employee-record fix)."
- (September run, same class, additionally:) `4d3ddf38-…`: "Half-yearly professional tax for \"Kerala\" could not be computed … the full six-month income is not available: earlier payroll is missing (April, May, June, July, August) … No PT was deducted."; `770dda8a-…`: same for **Tamil Nadu** (missing April–July).

### Step 5 — where the produced records are visible
- **Payroll run detail** shows aggregates (Emp PF, Empr PF, ESI, Prof. tax, TDS) and approvals — **not** the challan/ECR records themselves.
- **HR → Payroll Compliance** tab shows **"TDS Challans (ITNS 281): No TDS challans recorded"** and **"EPFO ECR: No ECR submissions recorded. Use hr.payroll.generateECR after running payroll."**
- The pre-existing **September 2026** run is labelled **"statutory generated"**, yet a direct DB check found **zero rows** in `epfo_ecr_submissions`, `tds_challan_records`, `esi_challan_records`, `pt_challan_records` for this tenant. The Payroll Compliance tab is therefore **accurate** — the records genuinely do not exist. The current UI *does* wire the "Statutory outputs" step to the record-writing `payroll.runs.generateStatutory` (`apps/web/src/app/app/payroll/page.tsx:40,486`); the September run predates that producer running here, so its status advanced without records.

---

## What could not be reached through the UI

All statutory-configuration inputs added by the recent pass are **API/schema-only; no web form exposes them** (verified: zero references in `apps/web/src` except one ESI field in the onboarding wizard):

1. **DA percentage** (salary structure) — no field.
2. **Voluntary PF rate** (employee) — no field.
3. **Para 26(6)** joint request / employer undertaking / approval reference / effective date (employee) — no fields.
4. **ESI establishment number** (org) — only in the onboarding wizard, unreachable once onboarding is complete.
5. **PT registration number** (org) — no field anywhere.
6. **PF contribution rate / reduced-rate reason** (org) — no field anywhere (server wizard schema accepts them; no form sends them).

**And, downstream:** a completed-onboarding tenant that owes ESI or PT **cannot reach a statutory output at all** through the UI, because step 13 refuses without identifiers it provides no screen to set.

---

## Findings traced to cause

Per the operating rules, the six unreachable field-groups and the step-13 dead-end are **one root cause, not seven findings**: the statutory build pass wired the API, tRPC input schemas, `orgWizardWrite`, and the DB columns, **but did not add the corresponding web-form inputs** (and did not restore post-onboarding edit access to the wizard's India step). The handover predicted this for VPF/Para 26(6) ("wired the API and did not touch the web forms"); this walk establishes it holds for DA, ESI-after-onboarding, PT registration, and PF rate as well.

The **Kerala / Tamil Nadu half-yearly PT "could not compute"** errors are the handover's already-known half-yearly-cadence gap (needs six months' income) — not a new finding; recorded as an artefact of that cause.

---

## What this walk cannot attest to

- **Whether step 13 ever writes records through the UI.** It was only observed to *refuse* (this tenant has ESI members and no ESI number). A successful UI-driven step-13 with records was **not** reached, because the identifiers cannot be set in the UI. (Record-writing was separately proven in-process, not through the browser.)
- **Why the September run is `STATUTORY_GENERATED` with zero records.** Established: the status is set and no records exist. The likely reason (advanced before the record-writing producer ran here) is inferred from timestamps + current wiring, **not** verified against what code was live on 09/08.
- **The transient step-13 error toast as rendered to the admin.** The 400 and the non-advance were observed directly; the exact toast string was captured from the server response, not from a screenshot of the toast (it dismissed before capture). The persistent readiness panel names the same missing field.
- **PT-registration refusal specifically.** Only the **ESI** refusal fired first (ESI is checked before PT in `generateStatutory`). The PT-registration refusal was not independently observed, though PT registration is equally unreachable in the UI.
- **Whether other tenants differ.** Only Pilot Manufacturing was walked.

---

## Dev-state changes (dev DB only)

- Created salary structure `PROBE-DA-walk` (Pilot).
- Advanced the **July 2026** run: payslips-generated → HR (hr@) → Finance (finance@) → CFO (admin@). Step 13 refused, so it is now parked at `CFO_APPROVED`. No statutory records were written.
- Repeated step-13 attempts each refused before writing; no partial records.
