# COMPETITIVE_GREYTHR.md — greytHR (India HR/Payroll) vs CoheronConnect People

**Purpose.** greytHR is the incumbent an Indian SMB HR/payroll team compares us against, and its
employee self-service surface is effectively a published requirements spec for what an Indian
employee expects to be able to do. This document records what greytHR actually ships on that
surface, what CoheronConnect actually ships, and the delta — with `file:line` evidence on our side
for every claim.

- **Date:** 2026-08-17
- **Method (greytHR side):** live authenticated session on a customer tenant, read-only. **ESS
  (employee) role only** — no admin, payroll-configuration or statutory-filing surface was reachable
  with this login, so nothing below describes their admin product. Navigation, form fields, table
  columns, empty-state copy and one published reference table were read. Nothing was submitted,
  saved or downloaded. No personal or pay data is reproduced here, and the tenant's figures are
  deliberately absent from and **not** part of this analysis.
- **Method (our side):** direct source read at branch `main`. Every gap claim below is grounded in a
  citation. Where something was **not** verified it is marked so, per the operating rules in
  `CLAUDE.md`.
- **Legend:** ✅ REAL · 🟡 PARTIAL · 🔴 STUB (schema/column only) · ⛔ MISSING

> **Scope caution.** This is a *capability* comparison against one competitor's employee surface, not
> a licence to build every screen listed in §5. The two items in §2 are the ones with money attached.

---

## 1. The regulatory find: IT Act 1961 → IT Act 2025 section mapping

greytHR carries a permanent banner on its IT Declaration screen:

> "Section names have been updated as per the Income Tax Act 2025. Your saved data remains unchanged."

That sentence is a mature vendor's entire migration strategy for the new Act, and it reframes
`INDIA_ROADMAP` item #10 ("Regulatory refresh — new Income Tax Act Apr-2026"): for a payroll product
this is a **relabelling and forms-renaming change, not a computation change**. Their published
mapping, in full, as displayed in-product:

### Exemption
| IT Act 1961 | IT Act 2025 | Description |
|---|---|---|
| 10(5) | 11 (Sch III (8)) | Travel concession or assistance (LTA/LTC) |
| 10(10) | 19 (1)(3) | Death-cum-retirement gratuity exemption |
| 10(10A) | 19 (1)(7) | Commuted value of pension exemption |
| 10(10AA) | 19 (1)(14) | Leave encashment on retirement |
| 10(10B) | 19 (1)(10) | Retrenchment compensation |
| 10(13) | 11 (Sch II (8)) | Approved superannuation fund |
| 10(13A) | 11 (Sch III (11)) | House rent allowance (HRA) |
| 10(14) | 11 (Sch III (12)) | Special allowances |
| 10 | 11 | Total exemption |

### Deduction
| IT Act 1961 | IT Act 2025 | Description |
|---|---|---|
| 16(ia) | 19 (1)(2) | Standard deduction |
| 16(iii) | 19 (1)(1) | Professional tax |
| 24 | 22 | Housing loan interest |
| 80C | 123 | Investments (PPF, ELSS, etc.) |
| 80CCC | 123 | Pension funds |
| 80CCD(1) | 124 (5) | NPS contribution |
| 80CCD(1B) | 124 (3) | Additional NPS ₹50,000 |
| 80CCD(2) | 124 (1) | Employer NPS |
| 80CCE | 123 | ₹1.5 lakh aggregate limit |
| 80CCH | 125 | Agnipath Scheme |
| 80D | 126 | Health insurance |
| 80DD | 127 | Dependent disability |
| 80DDB | 128 | Specified diseases |
| 80E | 129 | Education loan interest |
| 80EE | 130 | Home loan interest (affordable) |
| 80EEA | 131 | Housing loan |
| 80EEB | 132 | (EV loan interest — description blank in their table) |
| 80G | 133 | Donations |
| 80GG | 134 | Rent without HRA |
| 80GGA | 135 | Scientific research donations |
| 80GGC | 137 | Political contributions |
| 80TTA | 153 (2)(a) | Savings interest (₹10k) |
| 80TTB | 153 (2)(b) | Senior citizen interest (₹50k) |
| 80U | 154 | Disability deduction |
| Chapter VI-A | Chapter VIII | Other deductions |

### Regime / rebate
| 115BAC | 202 | New tax regime |
| 87A | 156 | Tax rebate |
| 89 | 157 | Relief for arrears |

### TDS
| 192 | 392 | TDS on salary |
| 192(2B) | 392(4) | Other income declaration |
| 194P | 392(8) | Senior citizen TDS exemption |
| 197 | 395 | Lower TDS certificate |
| 234E | 427 | Late fee for TDS |

### Forms
| Form 16 | **Form 130** | TDS certificate |
| Form 24Q | **Form 143** | Quarterly TDS return |
| Form 12BB | **Form 124** | Employee declaration |

**Action for us.** Keep the `tax_declarations` column identifiers as they are (`80c`, `80d`,
`80ccd1b`, `80tta`, `24b`) — renaming them buys nothing and breaks every caller. Add a single display-
name map and render both forms for a cycle ("Section 123 (formerly 80C)"). The part that is **not**
cosmetic: any artefact we generate or label **Form 16 / 24Q / 12BB** needs the new numbering.

**Not verified:** whether the new Act changes any *rate, slab or limit* we compute. This table is a
naming map only, and greytHR's own banner asserts stored values are unaffected. Treat the compute
side as an open question, not as settled by this document.

---

## 2. Gaps with money attached

### 2.1 Arrears on a backdated salary revision — ⛔ MISSING

greytHR's Salary Revision screen carries, per revision: *Last Revision Date · **Payout Month** ·
Revised Monthly CTC · Previous Monthly CTC · Duration between revisions*, over a revision timeline
and a "duration since last revision" counter.

The load-bearing column is **Payout Month as a field distinct from the effective date**. A raise
effective April but processed in June is the normal case in Indian payroll, and the difference
between those two dates *is* the arrears calculation.

Our position: `salaryStructures` **does** carry `familyId` / `effectiveFrom` / `effectiveTo`
(`packages/db/src/schema/hr.ts`), so structure versioning and effective dating exist. But
`apps/api/src/lib/payslip-view.ts:198` hardcodes `arrears: 0`, with the comment "Not stored as
separate columns today; kept in the shape for renderers + future use", and no arrears computation
exists in `apps/api/src/lib/payroll-cycle.ts`. The payslip renders an arrears line that is
structurally incapable of being non-zero.

**Consequence:** a backdated revision underpays, silently, and the payslip shows an arrears line of
zero as if that were a computed result.

**Note:** IT Act 2025 renumbers **s.89 relief for arrears → s.157**, so arrears and the §1 rename
touch the same surface. Worth sequencing together.

### 2.2 International worker — no PF wage ceiling — ⛔ MISSING

greytHR's employee master carries **International Employee** (Yes/No) and **Residential Status** as
first-class fields on the Personal tab.

An international worker under the EPF scheme contributes on **full wages with no ₹15,000 ceiling**.
Our `employees` table (verified by column dump) carries `uan`, `esiIpNumber`, `voluntaryPfRate`, the
four `para266_*` fields, `esiMember`/`esiMemberPeriodStart` and the `ptExempt*` flags — a genuinely
sophisticated PF configuration surface — but **no international-worker flag and no residential
status**. There is therefore no input by which the ceiling could be disapplied for one.

**Consequence:** hiring a single international worker under-contributes PF, and the ECR reports a
wage the dues do not correspond to — the exact failure mode the ECR rule in `CLAUDE.md` exists to
prevent.

**Not verified:** whether any current or prospective tenant employs an international worker. The
defect is reachable-by-configuration, not reachable-today; size it accordingly.

---

## 3. Other deltas found (no money attached, lower priority)

| Item | greytHR | Ours (verified) |
|---|---|---|
| Loans & advances | Module: apply → approve → EMI recovered on payslip | ⛔ No loan/advance table in `packages/db/src/schema/`. `payslips.advance_recovery` **exists** but its only writer is manual F&F input (`apps/api/src/routers/settlement.ts:66,247`) — a deduction slot with no source. Anti-pattern #2, "stored but never evaluated" |
| Leave half-days | **Per-endpoint sessions** — "from 15th Session 2 to 17th Session 1" | 🔴 `half_day` exists only as an `attendance_status` enum value (`packages/db/src/schema/hr.ts:1063`); no session model on the leave request |
| Restricted / optional holidays | Separate application flow beside Leave, with its own quota | ⛔ Not found. **Caveat: the flow was seen in navigation only, not opened** — this claim is thinner than the others |
| Attendance period | A **cut-off window** — their insights panel reads "Attendance Period 01 Aug – 16 Aug" | ⛔ No cutoff / attendance-period concept in schema. Payroll cannot close before month-end without one |
| PF KYC | **KYC Status** (Done + date) + **KYC Document** + **PF eligibility** badge + **PF Join Date** on the employee record | ⛔ No employee-level KYC status — the only `kyc_status` in the schema is director DIN KYC (`packages/db/src/schema/secretarial.ts:183`, `india-compliance.ts:182`). Un-KYC'd UANs are a leading cause of ECR upload rejection |
| Statutory ID verification state | Each ID carries one — Aadhaar "Unverified", PAN "Verified", bank "Verified" | 🔴 `aadhaarMaskedHash`/`Display`, `pan…` store values with **no verification state** |
| Letter requests | Employee requests an employment/salary/address letter; request → approval → issued document, with pending/closed counts | ⛔ Not found |
| Negative leave balance | First-class report — advance leave is allowed and tracked | ⛔ No negative-balance concept surfaced. A deliberate modelling decision to make, not necessarily a gap |

---

## 4. Design patterns worth adopting

**A. "Deduction Alert" on the attendance calendar.** Their regularization calendar legend has exactly
two entries: *Permission* (green) and **Deduction Alert** (blue). The employee sees, before payroll
runs, that a given day will cost them money unless regularized — and the remedy is one click away on
the same screen. This is a direct antidote to the recurring "capture without consequence" /
"records without reflexes" anti-pattern in `GAP_ANALYSIS.md`, and for us it is a **UI change over
data we already hold** (`attendance_records` + `lib/india/attendance-lop.ts`).

**B. Accrual is a posted transaction, not a function of elapsed time.** Their leave ledger columns
are *Transaction type · Posted on · From · To · Days · Reason · Remarks · **Expiry Date***. Observed
posting dates ran 19 Jan, 16 Apr, 16 Apr, 14 May, 15 Jun, 15 Jun, 16 Aug — each month's credit posted
*after* that month closed, on the payroll cycle, and February's posted late in April without
corrupting anything downstream.

Our `leave_accrual_events` (`packages/db/src/schema/hr.ts:973`) is already a real immutable ledger and
is in several respects better: `accrual` / `carry_forward` / `lapse` / `encashment` event types, a
signed day delta, an encashment amount, and `eventDate` anchoring for comp-off rolling windows. Two
things it lacks:

1. accrual is keyed to `year` + `month` integers with **no covered-period from/to**, so "the credit
   for July, posted in August" is expressible only via `createdAt`; and
2. **no per-lot `expiryDate`** — lapse must be computed globally rather than per credit.

Their "Leave Balance As On A Day" report is only possible because every lot carries its own expiry.
If we ever want point-in-time balance reconstruction, (2) is the prerequisite.

**C. Field-level PII masking with a reveal toggle.** DOB, blood group, marital status, contact
number, Aadhaar, PAN and bank account all render masked with an eye icon; the ESS home page masks
Gross / Deduction / Net as `*****` on the payslip card. Given DPDP is our largest regulatory hole, a
masked-by-default read surface is a disproportionately cheap contribution to that story.

**D. Three distinct time measures.** Their per-day attendance record carries *First In · Last Out ·
Late In · Early Out · Total Work Hrs · Break Hrs · Actual Work Hrs*, plus **Penalty Days**, and a
named **Attendance Scheme** separate from the **Shift**. Storing Total, Break and Actual as three
numbers is what makes late-mark and short-hours penalty policies expressible at all.

**E. Resignation initiates from the employee's own record.** A `Resign` action sits on Employment &
Job. Our offboarding is entirely HR-driven (`end_date` + the nightly disable job in
`apps/api/src/workflows/hrPeriodicWorkflow.ts`). We already have `final_settlements` (mig `0082`), so
the missing piece is only the employee-initiated request and its state machine.

**F. A declaration *window*, not an always-open form.** "Declaration window is open till 25 Aug 2026",
with **Retain previous** (carry last FY's declaration forward) and a separate **My Tax Planner** that
holds up to three plans explicitly "to compare regimes and plans". Note the window was open in
**August** — windows reopen; this is not a single April event. This is the concrete shape of the
April-provisional / January-proofs mechanism recorded as the CA ruling in `CLAUDE.md`.

**G. CTC = gross + employer PF, shown monthly.** Their Salary Revision screen labels the figure
"Revised MONTHLY CTC", and it exceeded payslip gross by exactly the employer PF share — no EDLI, no
admin charges. Useful calibration for the deferred True-CTC / offer-letter build (Base Pay decision
#8): even a mature vendor's default "CTC" is thinner than the textbook definition.

---

## 5. ESS information architecture (reference)

- Home · Engage
- My Worklife → Kudos · Feedback
- To do → Review
- **Salary** → Payslips · YTD Reports · IT Statement · IT Declaration · Loans and Advances · Salary Revision
- **Leave** → Leave Apply · Leave Balances · Leave Calendar · Holiday Calendar · Team On Leave
- **Attendance** → Attendance Info · Regularization & Permission · Who Is In · Employee Swipes · Attendance Muster · Shift Roster
- **Document Center** → Documents · Payslips · Form 16 · Company Policies · Forms · *Letters* (request, with pending/closed counts)
- **Reports Gallery** → *Attendance:* Muster, Absent, Consolidate, Shift Summary · *Leave:* Availed, Balance As On A Day, Day Wise Transaction, Negative Balance, Transaction
- **Request Hub** → Apply / Pending / Closed (tenant-configurable request-type catalogue; none configured on this tenant)

**Employee record tabs:** Personal (Profile · Personal · Address · Education) · Accounts & Statutory
(Bank Account · PF Account · Other IDs) · Family · Employment & Job (Current Position · Previous
Employment, + Resign, + View Timeline) · Assets.

**Employee master fields present there and absent here:** Residential Status, International Employee,
Place of Birth, Father Name, Religion, Marital Status + Marriage Date + Spouse, Blood Group, Height,
Weight, Identification Mark, Physically Challenged (we hold only the PT-specific `ptExemptDisability`).

**Leave application form:** Leave type\* · From date\* + Session · To date\* + Session · Applying to ·
CC to · Contact details · Reason · Attach File (pdf/xls/xlsx/doc/docx/txt/ppt/pptx/gif/jpg/jpeg/png).
A live balance and "Applying For" day count update as the form is filled.

**Payslip structure (this tenant):** Earnings — Basic, HRA, Special Allowance. Deductions — PF,
Professional Tax, Income Tax. Employee panel — Name, Employee No, Joining Date, Bank Name,
Designation, Bank Account No, Department, PAN, Location, PF No, Effective Work Days, PF UAN, LOP.
Employer contributions are **not** shown on the payslip.

---

## 6. Engineering observations

- Angular SPA. ORY-Hydra-style OAuth2 (`login_challenge` → `/uas/portal/auth/login` →
  `redirect-callback`). Auth is a separate service namespaced `/uas/v1/*` (`session-config`,
  `login-page`, `logo/CLIENT`, `logo/CUSTOMER`, `cms/login-ads`) — the login page is CMS-driven with
  per-tenant **and** per-reseller logos.
- **v2 and v3 coexist in production.** Reports Gallery opens a new tab into the legacy `/v2/`
  AngularJS UI with entirely different chrome. A decade-old product migrated screen by screen — worth
  remembering before treating our own surface inconsistencies as unusual.
- Console throws `Hammer is not defined` and an `angular-oauth2-oidc` deprecation notice on every load.
- **Their OAuth flow fails silently in a browser that does not persist the session cookie across the
  redirect.** An embedded browser produced `request_forbidden … No CSRF value available in the session
  cookie` on the callback and then hung on the splash screen indefinitely, with no user-facing error.
  Worth a defensive look at our own login: a hard auth failure that renders as an infinite spinner is
  the worst available outcome.
