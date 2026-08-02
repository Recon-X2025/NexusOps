# Sweep: platform-wide constants that should be per-tenant

A sweep (not an audit) for **values baked into the code that different customer
companies would legitimately need to set differently**, but which are currently
fixed for every tenant. No code was changed.

Method: read the onboarding wizard end-to-end (UI → tRPC → DB write), traced the
state-code/name path through the GST engine, then two recon passes (fiscal /
calendar / rounding / currency, and thresholds / approval-limits) whose every
candidate was verified by direct source read. Constants that **already have a
per-tenant override** (org settings, `statutory_ceilings` table, per-employee
shift, SLA calendar) are called out as *not a finding* so the reader knows they
were checked, not skipped.

Each finding classifies the value as:
- **P — should be per-tenant, no override exists.** A real customer would be
  wrong with the baked-in value and cannot change it.
- **S — statutory / national law.** Correctly the same for every Indian tenant;
  listed only because it is hardcoded in code rather than in the DB, so it drifts
  the day the law changes (not a per-tenant gap).
- **OK — already per-tenant.** Has a working override; the hardcoded number is
  only a fallback default.

---

## Plain English summary

Most money-and-approval knobs in this product are already per-customer — purchase
approval limits, deal-sign-off limits, invoice-matching tolerance, SLA business
hours/holidays, and staff shift timings all read a per-company setting first and
only fall back to a built-in number. That part is healthy.

Four things are genuinely stuck platform-wide and would bite a real customer:

1. **The setup wizard mixes up two different "state" fields, and the one the tax
   engine reads never gets a usable value.** The wizard has a *State* dropdown
   (a full name like "Maharashtra") and a separate *State Code* box (a 2-letter
   code like "MH"). It saves the 2-letter code into the record the GST engine
   uses for tax, and never saves the state *name* there. When an invoice is
   raised, the engine compares the company's stored value ("MH") against the
   customer's state name ("Maharashtra") to decide whether the sale is inside the
   state (CGST+SGST) or across states (IGST). Because "MH" never equals
   "Maharashtra", **every in-state sale is mis-charged as an inter-state sale** —
   the wrong GST split on the invoice. This is the single most important item.

2. **The financial year is hardwired to April–March everywhere.** There is no
   setting for it. A customer who runs a January–December or July–June financial
   year cannot configure it, and their payroll year-to-date, Form-16 period, and
   quarter groupings will all be wrong.

3. **The privacy/breach notification emails go to two fixed CoheronConnect
   mailboxes for every tenant.** When a data-protection notice fires, it is sent
   to `privacy@coheronconnect.coheron.com` and `dpb-india@coheronconnect.coheron.com`
   — not the customer's own privacy officer, and not the real regulator. Each
   customer needs their own recipients here.

4. **A hidden default GST rate of 18% is applied when a quote line has no rate.**
   Different products attract 0/5/12/18/28%; silently defaulting to 18% over- or
   under-charges the customer on any line that forgot to set a rate.

The statutory numbers (tax slabs, PF/ESI ceilings, gratuity formula) are correct
to be the same for all Indian tenants — they are national law — so they are not
per-tenant gaps. They are noted only because they live in code, so they must be
edited and redeployed each time the law changes rather than updated in data.

---

## Findings

### P-1 — Wizard writes a state *code* into the field the GST engine reads as a state *name* (the known bug)

**The value / where:**
- Wizard UI has two distinct fields:
  - *State* dropdown → full names, e.g. `"Maharashtra"`
    (`apps/web/src/app/app/onboarding-wizard/page.tsx:96,138-141`), sent as
    `profile.state`.
  - *State Code* box → 2-letter ISO code, placeholder `"MH"`, labelled
    "2-letter ISO 3166-2:IN code" (`page.tsx:198`), sent as `india.stateCode`.
- `writeWizardData` stores `profile.state` → `organizations.state`
  (`apps/api/src/services/orgWizardWrite.ts:77`) and `india.stateCode` →
  **`gstinRegistry.stateCode`** (`orgWizardWrite.ts:123,132`) and
  `organizations.primaryStateCode` (`orgWizardWrite.ts:100`).
- It **never writes `gstinRegistry.stateName`** (verified: no `stateName` assignment
  anywhere in `orgWizardWrite.ts`).

**Why it breaks:** the GST engine resolves the org's place-of-supply as
`orgGstin?.stateName ?? orgGstin?.stateCode` (`apps/api/src/routers/financial.ts:238`,
also `:348`, `:454`, and `lib/crm/quote-tax.ts:68`, `routers/ingest.ts:120`).
With `stateName` null, this yields the raw code (`"MH"`). `computeGST` then decides
intra- vs inter-state by a case-insensitive **string compare**:
`supplierState.trim().toLowerCase() !== buyerState.trim().toLowerCase()`
(`packages/payroll-math/src/gst-engine.ts:61-62`). The buyer side is a state
*name* (vendor/account `state`, e.g. `"Maharashtra"`). `"mh" !== "maharashtra"` is
always true → **`isInterstate = true` for every invoice** → IGST charged where
CGST+SGST is correct (`gst-engine.ts:66-68`, persisted `isInterstate`,
`cgst/sgst/igstAmount` at `financial.ts:265-269`).

Worse, the code stored isn't even the GST numeric code (`"27"` for Maharashtra) —
the wizard collects the ISO code (`"MH"`), so the value is wrong for *any*
consumer that expects either a name or the numeric GST code.

**Concrete failure scenario:** New customer completes onboarding with State
"Maharashtra" and State Code "MH". They raise a payable invoice from a Maharashtra
vendor whose account `state = "Maharashtra"`. Expected: CGST 9% + SGST 9%. Actual:
IGST 18%, `isInterstate = true`. The invoice, its GL journal, and GSTR-1 grouping
are all filed with the wrong tax heads.

**Classification: P.** What breaks in practice: wrong GST split on effectively
every intra-state invoice for a freshly onboarded org — a filing-correctness and
input-tax-credit problem for the customer.

---

### P-2 — Financial year hardwired to April–March, no per-tenant setting

**The value / where:** the April-start fiscal year is assumed in code with no
configurable start month:
- `apps/api/src/routers/hr.ts:1387` — `const fyMonth = input.month >= 4 ? input.month - 3 : input.month + 9;`
- `packages/payroll-math/src/payroll-cycle.ts:55,277` — `fyMonth` "1=April, 12=March"; `monthsInFY` derived from it.
- `packages/payroll-math/src/payroll-cycle.ts:598,604` — quarter filters hardcode `[4,5,6]` (Q1) and `[10,11,12]` (Q3).
- `apps/api/src/lib/india/form16-aggregator.ts:25,28-29,103` — FY "2025-2026" → "April 2025 to March 2026", `monthsInFY: 12`.
- `apps/api/src/lib/india/payroll-engine.ts:247,266` — `currentFYMonth` (1=April), `remainingMonths = 13 - currentFYMonth`.

**Why it should be per-tenant:** while India's *statutory* payroll/tax year is
April–March, a customer's **accounting/budget** fiscal year can legitimately differ
(a subsidiary of a US/EU parent may run Jan–Dec or Jul–Jun). Verified there is **no**
org fiscal-year-start field: the only `fiscalYear` in the schema is a per-budget
integer year (`packages/db/src/schema/financial.ts:21`), not a start month, and
`org-settings.ts` exposes no fiscal setting.

**Concrete failure scenario:** A customer running a Jan–Dec book year sets up
budgets and reporting. The month→FY-month math (`hr.ts:1387`) and quarter grouping
(`payroll-cycle.ts:598,604`) treat April as month 1, so their year-to-date roll-ups,
quarter buckets, and Form-16 period label are all off by a quarter.

**Classification: P** for the accounting/budget FY (no override). Note: the payroll
tax year genuinely *is* April–March by law, so the payroll-specific uses are
statutory; the gap is the absence of any tenant-level fiscal-year concept at all.

---

### P-3 — DPDP privacy/breach notifications go to two fixed platform mailboxes for every tenant

**The value / where:** `apps/api/src/lib/notification-dispatcher.ts:94-99`
```
if (input.audience === "privacy_officer")       emailAddress = "privacy@coheronconnect.coheron.com";
else if (input.audience === "data_protection_board") emailAddress = "dpb-india@coheronconnect.coheron.com";
else if (input.audience === "affected_principals")   emailAddress = "privacy@coheronconnect.coheron.com";
```
Not env-driven, not org-scoped — the same two addresses for all tenants (these
mailboxes were also flagged as invented in `sweep-fabricated-constants.md`).

**Why it should be per-tenant:** each customer is its own Data Fiduciary under
DPDP. A privacy-officer notice must reach **that tenant's** DPO, and a breach
notice must reach the **actual regulator** address — not a CoheronConnect inbox.

**Concrete failure scenario:** A tenant suffers a personal-data breach; the sweep
fires a `data_protection_board` notice. It emails `dpb-india@coheronconnect.coheron.com`
(a non-existent mailbox) instead of the tenant's real regulatory contact → the
customer believes a statutory notice was delivered when it was not.

**Classification: P.** What breaks: statutory notices never reach the right people;
per-tenant DPO and regulator recipients are required.

---

### P-4 — Hidden 18% GST default on quote/invoice lines with no rate

**The value / where:** `apps/api/src/lib/crm/quote-tax.ts:31-32`
`VALID_GST_RATES = [0,5,12,18,28]`, `DEFAULT_GST_RATE = 18`; applied by
`coerceGstRate(rate, fallback)` (`:34-37`) when a line's `gstRate` is undefined.

**Why it should be per-tenant (or per-product, never a silent global):** the
correct rate depends on the HSN/SAC of the line item, which varies by the
customer's product mix. Defaulting an unset rate to 18% silently mis-taxes any
line that doesn't set one.

**Concrete failure scenario:** A customer selling a 5%-GST product creates a quote
line without setting the rate. The line is taxed at 18%, over-charging the buyer
and mis-stating output tax — with no error or warning surfaced.

**Classification: P.** What breaks: silent wrong tax on any rate-less line; the
"safe" default is arguably to reject, not to guess 18%.

---

### P-5 — Wizard hardcodes default state "KA" and platform SLA defaults 4/8/24/72

**The value / where:**
- Default state/state-code both `"KA"` (Karnataka) in the wizard's initial state:
  `apps/web/src/app/app/onboarding-wizard/page.tsx:379,383` (and the `?? "KA"`
  hydration fallbacks at `:409,:422`).
- SLA response-hour defaults `p1:4, p2:8, p3:24, p4:72` hardcoded both in the UI
  (`page.tsx:387,427-430`) and server-side
  (`apps/api/src/routers/onboarding.ts:243-246`, `getWizardData`).

**Why it should be per-tenant:** the state default silently biases every new org
toward Karnataka; if a user skips/misses that field, the wrong place-of-supply is
persisted (compounding P-1). The SLA hours are a reasonable *starting* default but
are presented as if universal; a customer with a 24×7 or a stricter SLA needs
their own — which the wizard does capture, so this is a soft finding.

**Concrete failure scenario:** A Tamil Nadu company rushes through onboarding
leaving the pre-filled "KA"; their `primaryStateCode`/GSTIN state is silently set
to Karnataka, mis-stating place of supply.

**Classification: P** for the "KA" default (silent wrong-state); **OK-ish** for the
SLA hours (they are editable per-org in the same wizard and stored on
`organizations.slaP1Hours…`).

---

## Statutory constants (S) — correctly the same for all tenants, but hardcoded in code

Listed so the reader knows they were checked and are **not** per-tenant gaps. The
only risk is that they are in code, so a legal change needs a code edit + deploy
rather than a data update. Values verified by direct read.

- Income-tax slabs, old & new regime (`packages/payroll-math/src/tax-engine.ts:85-102`); rebate 87A `12_500`/`60_000` (`:299-304`); surcharge bands 10/15/25/37% (`:114-118`); std deduction `75_000`/`50_000` (`:255,258`); 80C `150_000`, 80D `75_000`, 80CCD1B `50_000`, 80TTA `10_000`, 24b `200_000` (`:261-274`).
- PF ceiling `15_000` + rates 12%/8.33%/3.67%/0.5% (`packages/payroll-math/src/statutory-deductions.ts:96-101`); ESI ceiling `21_000` + 0.75%/3.25% (`:137-139`); bonus ceiling `21_000` (`:91`).
- Professional Tax state slabs + caps and LWF rates (`statutory-deductions.ts:161-266`, LWF-month `3||9` at `:305`). *These are state-specific and DO have a runtime override via the `statutory_ceilings` table + `apps/api/src/lib/india/statutory-ceilings.ts` — so effectively OK; the in-code table is the seed default.*
- Gratuity ceiling `2_000_000`, min 5 years, 15/26 formula (`packages/payroll-math/src/gratuity.ts:26-33`) — the ceiling accepts a caller override.
- E-invoice turnover `50_000_000` and e-way-bill `50_000` thresholds (`packages/payroll-math/src/gst-engine.ts:195,203`).
- Journal balance tolerance `0.001` (`lib/invoice-journal.ts:119,245`, `lib/inventory-journal.ts:65`, `lib/depreciation-journal.ts:65`); leave rounding to 0.1 day (`packages/payroll-math/src/leave-accrual.ts:29`); 26-working-day month for leave/gratuity (`leave-accrual.ts:100`, `gratuity.ts:33`).

---

## Already per-tenant (OK) — verified, not findings

- **Procurement PR approval tiers** `75_000` / `750_000` — fallbacks only;
  `getProcurementApprovalTiers` reads `organizations.settings.procurement`
  (`apps/api/src/lib/org-settings.ts:103-124`).
- **CRM deal-close approval** `500_000` / `5_000_000` — fallbacks; reads
  `settings.crm` (`org-settings.ts:126-134`).
- **Invoice-PO match tolerance** default `1` — `getProcurementMatchToleranceAbs`
  reads `settings.procurement.poMatchToleranceAbs` (`org-settings.ts:91-95`,
  used at `lib/invoice-po-match.ts:185`).
- **Duplicate-payable policy** default `"warn"` — `settings.procurement`
  (`org-settings.ts:97-101`).
- **SLA business calendar** — weekend/holiday skipping reads per-org
  `slaSkipWeekends` / `slaHolidayDates` from `organizations.settings`
  (`apps/api/src/lib/sla-business-calendar.ts:11-46`); the Sat/Sun (`0||6`) is only
  applied *when the org opts in*.
- **Working shift (start/duration/grace)** — resolves assigned-employee shift →
  org-default shift → built-in `09:00 / 8h / 10-min` baseline
  (`apps/api/src/lib/india/shift-schedule.ts:29-45`); the baseline is a
  last-resort fallback, not a hard global.
- **Base currency** default `"INR"` — `settings.baseCurrency`
  (`apps/api/src/lib/expense-policy.ts:47`).
- **Ticket SLA policies** — stored per-org in `sla_policies`
  (`apps/api/src/services/ticket-sla-policy.ts`), no hardcoded fallback.

---

## Note on scope / what to fix first

The one that actually mis-computes money today is **P-1** (state code vs name in
the GST path) — it produces wrong tax on real invoices for any newly onboarded org,
and it interacts with **P-5**'s silent "KA" default. **P-3** (DPDP recipients) is a
statutory-notice-delivery correctness gap. **P-2** (no configurable fiscal year)
and **P-4** (silent 18% default) are correctness gaps that surface for
non-April-FY customers and rate-less lines respectively. Everything under **S** and
**OK** was verified and is not a per-tenant defect.
