# DPDP Erasure — Legal Validation Request

**Prepared for:** Indian privacy counsel
**Prepared by:** CoheronConnect — Product / Compliance
**Date:** 2026-07-16
**Decision requested by:** _______________
**Product:** CoheronConnect — multi-tenant Enterprise Operations Platform (payroll, tax,
accounting, procurement, CRM, secretarial/ROC). Data resident in India.

> **Purpose of this document.** We are wiring the automated fulfilment of Data Principal
> **erasure requests (DPDP §12)**. Because the platform also holds financial records under
> **statutory retention** (RBI / Companies Act 2013 / Income Tax Act), we need counsel to
> **validate and sign off** the rules below **before** any destructive automation is
> enabled. Nothing destructive runs until this is signed — the erasure engine currently
> operates in dry-run (log-only) mode.
>
> **What we need from counsel:** (a) confirm the legal reconciliation in §1, (b) fill and
> sign the column-by-column erasure map in §4, (c) answer the specific questions in §5.

---

## 1. The core legal question

**Can we honour a DPDP erasure request without deleting financial records we are legally
required to retain?**

Our proposed reconciliation:

- **DPDP §12** grants the Data Principal a right to erasure of personal data.
- **DPDP §8(7)** (our understanding) does **not** require erasure where retention is
  **necessary for compliance with any law in force**.
- Therefore, for financial records we propose to **retain the financial fact and figures**
  (as statute requires) while **severing / anonymising the personal-identity link**
  (satisfying the erasure right). We do **not** hard-delete statutory financial records.

**➡️ Counsel to confirm:** Is anonymisation / de-identification of the personal element
(while retaining the underlying financial record for the statutory period) a valid means
of satisfying a DPDP §12 erasure request? ☐ Confirmed ☐ Needs revision: ____________

---

## 2. Proposed retention floor

We propose a **blanket 8-year retention floor** on financial records (payslips, journal
entries, invoices, purchase orders, tax filings), after which the identity link may be
anonymised on request. The record is held across storage tiers (hot / warm / cold) for the
full 8 years.

**➡️ Counsel to confirm:** Is a uniform **8-year** floor correct, or do specific record
classes require different periods (e.g., payroll vs. GST vs. statutory registers vs.
audit)? ☐ 8y blanket confirmed ☐ Per-class periods required (specify in §4)

---

## 3. Categories of personal data we hold (plain-language)

| Category | Examples in the system | Statutory retention? |
|----------|------------------------|----------------------|
| **Employee identity & financial** | Name, email, PAN (tax ID), Aadhaar, bank account, address | Yes — payroll/tax records |
| **Director identity** | Name, DIN, PAN, Aadhaar, residential address | Yes — statutory registers |
| **Vendor / supplier contacts** | Contact person name, email, phone; GSTIN, PAN | Vendor *entity*: yes; *person* contact: no |
| **Financial transaction records** | Payslips, journal entries, invoices, POs (amounts, dates) | Yes — 8 years |
| **CRM contacts** | Prospect first/last name, email, phone | No |
| **Audit trail** | Tamper-evident log of who-changed-what | Yes — integrity/security |

---

## 4. Erasure map — for counsel to complete and sign

For **each** personal-data field, counsel confirms the **Action** and **Retention** on an
erasure request. Actions:

- **Delete** — remove the value/row entirely (no retention obligation).
- **Anonymise** — retain the record; overwrite the personal field with a redaction marker;
  where a non-reversible reference is needed for statutory audit, keep a one-way hash.
- **Minimise-at-source** — never store the raw value at all (masked hash only), so there is
  nothing to erase later.
- **Retain-with-reason** — must be kept for the stated statutory period; not erasable until
  it expires.
- **Redaction side-event** — for the tamper-evident audit log, which cannot be edited in
  place without breaking its integrity chain; a separate "redacted for DPDP" event is
  recorded instead.

| # | Data field | Category | Financial? | **Proposed action** | **Statutory basis** | **Retain until** | **Counsel sign-off** |
|---|-----------|----------|-----------|---------------------|---------------------|------------------|----------------------|
| 1 | Employee name / email | Identity | Yes | Anonymise | RBI / IT Act | pay + 8y | ☐ approve ☐ amend: ___ |
| 2 | Employee **PAN** (tax ID) | Tax ID | Yes | Anonymise; keep one-way hash for audit | IT Act / RBI | pay + 8y | ☐ approve ☐ amend: ___ |
| 3 | Employee **Aadhaar** | Gov ID | Yes | **Minimise-at-source** (masked hash; never raw) | DPDP §8 / Aadhaar Act | n/a (never raw) | ☐ approve ☐ amend: ___ |
| 4 | Employee **bank account / IFSC** | Financial | Yes | Anonymise | RBI | pay + 8y | ☐ approve ☐ amend: ___ |
| 5 | Employee address / city / state | Contact | Yes | Anonymise | RBI / IT Act | pay + 8y | ☐ approve ☐ amend: ___ |
| 6 | Director **Aadhaar** | Gov ID | Yes | **Minimise-at-source** (masked hash; never raw) | DPDP §8 / Aadhaar Act | n/a (never raw) | ☐ approve ☐ amend: ___ |
| 7 | Director PAN / residential address | Identity | Yes | Anonymise | Companies Act | cessation + 8y | ☐ approve ☐ amend: ___ |
| 8 | Payslip (amounts + tax) | Financial | Yes | Retain-with-reason (identity via hash link) | RBI / IT Act | pay + 8y | ☐ approve ☐ amend: ___ |
| 9 | Journal entry (amounts, actor FK) | Financial | Yes | Retain-with-reason (actor link nulled) | Companies Act | post + 8y | ☐ approve ☐ amend: ___ |
| 10 | Invoice / PO (GSTIN, amounts) | Financial | Yes | Retain-with-reason | GST / IT Act | invoice + 8y | ☐ approve ☐ amend: ___ |
| 11 | Vendor **contact person** name/email/phone | Contact | No | Delete / anonymise (vendor entity retained) | — | on erasure | ☐ approve ☐ amend: ___ |
| 12 | Vendor GSTIN / PAN (entity) | Tax ID | Yes | Retain-with-reason | GST / IT Act | relationship + 8y | ☐ approve ☐ amend: ___ |
| 13 | CRM contact name / email / phone | Contact | No | Delete | — | on erasure | ☐ approve ☐ amend: ___ |
| 14 | Audit-log entry referencing the Principal | Mixed | — | Redaction side-event (chain preserved) | tamper-evidence | chain life | ☐ approve ☐ amend: ___ |

_Add rows for any field counsel believes is missing._

---

## 5. Specific questions for counsel

1. **Anonymisation as erasure (§1).** Does retaining a financial record while anonymising
   the personal element satisfy a DPDP §12 erasure request? Any documentation/evidence we
   must generate to demonstrate compliance?

2. **Retention period (§2).** Confirm 8-year blanket vs. per-class. Which record classes,
   if any, require longer (e.g., statutory registers, litigation hold)?

3. **Aadhaar minimisation (row 3, 6).** We propose to **never store raw Aadhaar** —
   masked last-4 + one-way hash only (mirroring our existing e-sign handling). Is there
   any lawful purpose in payroll/secretarial that requires retrievable full Aadhaar? If
   not, we minimise at onboarding and backfill existing records.

4. **PAN as retained hash (row 2).** Is keeping a **one-way hash** of PAN (for statutory
   audit matching) acceptable after anonymising the raw PAN, or must raw PAN be retained in
   full for the 8-year window?

5. **Erasure inside the retention window.** When a Principal requests erasure but their
   financial records are still inside the 8-year window, we propose to **anonymise the
   contact/identity fields now** but **retain the figures + statutory identifiers until the
   window expires**, then anonymise those too. Confirm this staged approach is acceptable,
   and what we must tell the Principal (statutory-retention notice wording).

6. **Audit-trail redaction (row 14).** Our security audit log is tamper-evident (a
   cryptographic chain); editing an entry breaks that chain and is itself a compliance
   feature. We propose to record a **separate "redacted for DPDP" event** rather than alter
   the original entry. Is preserving the immutable entry (with a redaction marker recorded
   alongside) acceptable, or must the underlying PII in the log be destroyed?

7. **Crypto-shredding (future).** Once per-subject key encryption is in place, "erasure"
   can be achieved by **destroying the encryption key** — the record remains but is
   permanently unreadable. Do you accept key-destruction as satisfying erasure?

8. **Data Principal notice.** What statutory wording must we return to a Principal whose
   erasure is **partially deferred** due to retention (i.e., "your contact data has been
   erased; your financial records are retained under [statute] until [date]")?

---

## 6. What happens after sign-off

Once counsel completes §4 and answers §5:

1. Engineering encodes the signed map into the erasure engine (currently dry-run only).
2. A retention guard is added so no record is anonymised/deleted before its "retain until"
   date.
3. Aadhaar minimisation is applied at onboarding and backfilled.
4. Per-category test erasure requests are run to prove: retained records survive with
   figures intact, identity is severed, and the audit chain still verifies.
5. Only then is destructive erasure switched on in production.

**No destructive erasure runs in production until this document is signed.**

---

**Counsel sign-off**

Name: _______________  Firm: _______________
Signature: _______________  Date: _______________

_This document requests legal validation only. It does not itself change any system
behaviour._
