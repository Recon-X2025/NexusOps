# CoheronConnect — DPDP Erasure vs. Statutory Retention Strategy

**Date:** 2026-07-16
**Owner:** Product / Compliance
**Status:** Plan — no application code changed by this document.
**Companion to:** `docs/INDIA_ROADMAP.md` §2 (DPDP privacy engine — the launch blocker).
**Verification basis:** read-only code audit at migration head `0034_chemical_firedrake`
(`0033`/`0034` are index-only; no PII-surface change since the `0032` audit).
Every code claim below is cited `file:line`.

> Effort labels are relative sizing (S/M/L), **not** time estimates.

---

## 0. The problem in one sentence

DPDP §12 grants a Data Principal the **right to erasure**, but the **Companies Act 2013
§128** (8 years of books of account) and the **Income-tax Act** (assessment/record retention)
require **8-year retention** of financial records (payslips, journal entries, invoices, tax
filings) — so we **cannot delete** the financial fact, yet we **must honour** the erasure
request. The only lawful reconciliation is: **retain the figure, sever the identity.**

> **Citation note:** the general 8-year floor rests on **Companies Act §128 + Income-tax Act**,
> not RBI. RBI record-retention rules apply specifically to RBI-*regulated* entities (banks,
> NBFCs); they are not the statutory basis for a generic tenant's payroll/ledger records. RBI is
> cited below only where an entity is actually RBI-regulated.

**The escape hatch is in the law itself:** DPDP **§8(7)** does not require erasure where
retention is **necessary for compliance with any law in force**. So erasure of financial
PII is satisfied by **anonymisation/decoupling** (removing the identity link), not
deletion of the record.

---

## 1. Decisions locked (this session)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Primary technique for financial PII | **Anonymize now; crypto-shred as the KMS upgrade** (same seam) |
| 2 | Retention period | **8 years, blanket floor** across Hot / Warm / Cold tiers |
| 3 | Gate Phase 2/3 behind KMS? | **No — ship anonymize-first (unblocks launch); build the decoupling seam now so crypto-shred is a drop-in upgrade** |
| 4 | Aadhaar handling | **Minimise from onboarding (standing policy), NOT DSR-triggered** — store only a masked hash, never raw |
| 5 | PAN handling | **Keep raw PAN (statutory filing needs it) AND add a masked hash + display** on all 6 PAN tables — retention-floor, not minimisation |
| 6 | Hash primitive for gov IDs | **Peppered HMAC-SHA256, not plain SHA-256** — fixed-format IDs are brute-forceable without a secret key |
| 7 | Pepper secret management | **`PII_HASH_PEPPER` env secret now, documented as a KMS-track secret**; validated **fail-fast at server boot** |

**Rationale for #3:** KMS is a post-launch fast-follow (`INDIA_ROADMAP.md:129`, M–L, needs
cloud creds). DPDP erasure is a **launch blocker** (`INDIA_ROADMAP.md:50`). Coupling the
blocker to the fast-follow inverts priority. Anonymisation is legally sufficient today;
crypto-shred is a cleaner *upgrade* that becomes drop-in if we introduce the per-subject
key seam (`dataKeyId`) from the start.

**Rationale for #5:** PAN differs from Aadhaar — the raw value is *required* for statutory
filing (TDS, Form 16, GSTR). It cannot be dropped like raw Aadhaar. So PAN is a
retention-floor case: keep raw for filing, add `pan_masked_hash` (peppered HMAC match key) +
`pan_masked_display` (`XXXXXX1234`) alongside on all six PAN tables (`organizations`,
`employees`, `vendors`, `directors`, `company_directors`, `share_capital`). Entity-PAN tables
carry the columns too for a uniform code path; the extra hashes are harmless dead weight.

**Rationale for #6 / #7 (the pepper):** Aadhaar (12 digits) and PAN (`AAAAA9999A`) have
small, fully-enumerable formats, so a plain SHA-256 is offline-brute-forceable and a poor
de-identifier. The hash is therefore a **keyed HMAC-SHA256 under a server-side pepper**
(`PII_HASH_PEPPER`, `apps/api/src/lib/pii-hash.ts`). The pepper is a **mini-KMS secret**:

- **Env secret today, KMS-track later.** Held in the environment now; the same call site is
  the intended seam to fold into KMS (a KMS-held key is a drop-in for the env pepper).
- **Back it up; never rotate casually.** Rotating or losing the pepper **orphans every
  previously-stored hash** (all match keys break), exactly like losing an encryption key. It
  is a long-lived secret, not a rotating credential.
- **Fail-fast at boot.** The API asserts `PII_HASH_PEPPER` is set at **startup**
  (`assertPiiHashConfigured()` in `pii-hash.ts`, wired in `apps/api/src/index.ts` alongside
  the DATABASE_PROVIDER check) and `process.exit(1)`s if missing. A misconfigured deploy is
  stopped before it accepts traffic, so a new org's first PII write can never fail at runtime.
- **Backfill parity.** `scripts/backfill-pii-mask.cjs` uses the *same* peppered primitive and
  refuses to run without the pepper, so backfilled hashes equal app-derived hashes.

---

## 2. The two-tier erasure rule

| Data class | On erasure DSR | Legal basis |
|---|---|---|
| **Contact / marketing PII** — CRM contact `email`/`phone` (`crm.ts:105-108`) | **Delete / hard-anonymise now** | No retention obligation |
| **Financial PII** — payslip, JE, invoice, employee tax/bank (`hr.ts:126-130`) | **Retain figures; decouple + anonymise identity; hold until statutory expiry** | DPDP §8(7) exemption + Companies Act §128 / Income-tax Act (RBI only for RBI-regulated entities) |
| **Aadhaar** — `employees.aadhaar` (`hr.ts:127`), `directors.aadhaar` (`india-compliance.ts:110`) | **Minimise at onboarding — never store raw; masked hash only** (standing policy, not DSR-triggered) | DPDP §8 minimisation + Aadhaar Act masking norms |
| **Audit trail** — `auditLogs.changes` JSONB (`auth.ts:296`) | **Never mutate in place; record a redaction side-event** | Tamper-evident chain integrity (`auth.ts:299-309`) |

### 2a. Aadhaar minimisation (standing policy — decision #4)

Aadhaar is treated differently from other financial PII: it is **minimised proactively at
onboarding**, not held-then-erased-on-request. This is the strongest DPDP posture (§8
data minimisation) and shrinks breach blast-radius.

**Current state (the gap):**
- `employees.aadhaar` — **raw plaintext `text`** (`hr.ts:127`).
- `directors.aadhaar` — **raw plaintext `text`** (`india-compliance.ts:110`); written raw via
  the secretarial router (`india-compliance.ts:300`, `aadhaar: z.string().optional()`).
- **The correct pattern already exists** — `esigners.aadhaarMaskedHash`
  (`esign.ts:88`): *"SHA256 of last 4 digits — never raw Aadhaar."*

**Target:** replace raw `employees.aadhaar` / `directors.aadhaar` with a masked-hash
column mirroring the e-sign pattern (store masked last-4 for display + a one-way hash for
matching; never the full number). Backfill hashes, drop the raw column. This is a schema +
write-path change independent of the DSR executor, and it removes Aadhaar from the erasure
map entirely (there's nothing raw left to erase). Sequenced in Phase 2 (decoupling).

---

## 3. Current-state findings (what's built vs. missing)

**Built and safe (do NOT rebuild):**
- Erasure executor with `anonymise | delete` actions, flag-off dry-run, atomic tx,
  evidence stamping — `apps/api/src/lib/dpdp-erasure.ts:45-223`.
- DSR state machine; `erasure → fulfilled` triggers the executor —
  `apps/api/src/routers/compliance.ts:297-306`, transitions `:35-43`.
- Conservative `ERASURE_MAP` covers only the DSR record + notification artifacts —
  `dpdp-erasure.ts:58-73`. **Financial tables are intentionally NOT in scope yet.**

**The three tension points (the real work):**
1. **Employees is a PII bomb + wrong FK rule.** `pan`, `aadhaar`, `bankAccountNumber`,
   `bankIfsc` sit on `employees` (`hr.ts:126-130`); `employees.userId → users` is
   **CASCADE** (`hr.ts:112-114`), so erasing a user cascade-deletes the employee and
   **orphans/breaks payslips** (`hr.ts:355-396`). Naive delete is impossible.
2. **No retention floor.** No `retainUntilDate` / period-lock on `journal_entries`,
   `payslips`, `invoices`, `purchase_orders`. Nothing stops a future executor from
   erasing a record still inside its 8-year window. The executor has **no retention
   guard** (`dpdp-erasure.ts:180-207`).
3. **Audit chain can't be redacted in place.** `auditLogs` hash chain
   (`seq`/`prevHash`/`entryHash`, `auth.ts:299-309`) breaks on any mutation; `changes`
   JSONB (`auth.ts:296`) may carry PII.

**Also relevant:**
- Vendor contact PII is **denormalised** onto `vendors` (`procurement.ts:92-94`) with no
  child table — a person's PII can't be erased without touching the vendor (a legal
  entity you must retain).
- Only retention field anywhere is whistleblower `retentionDays=2555` (7y,
  `issuer-programme.ts:250`) and a boolean `legalMatters.legalHold` (`legal.ts:91`).

---

## 4. The phased plan

### Phase 0 — Data classification + legal sign-off (no code; the gate) · S
Per-table **erasure-map spreadsheet**: every PII column → action
(`delete` / `anonymise` / `crypto-shred` / `retain-with-reason`) + statutory basis +
retention period. Indian privacy counsel signs. **Gates all destructive work**
(`INDIA_ROADMAP.md:82-83, 196`). Deliverable template: §6 below.

### Phase 1 — Retention floor (schema safety rail — DO FIRST) · S–M
- Add `retainUntilDate timestamptz` to `journal_entries`, `payslips`, `invoices`,
  `purchase_orders` (default = posting / pay / invoice date + 8y).
- Add a **retention guard** to the executor: refuse to anonymise/delete any row where
  `retainUntilDate > now()` — surfaced as the DSR resolution reason.
- This is the belt that makes every later phase safe. Build before any financial table
  enters the map.

### Phase 2 — Decouple identity from financial fact · M
- **Payroll:** add one-way `payslips.employeePanHash` (SHA-256) so the statutory "who"
  survives without the raw PAN; change `employees.userId` **off CASCADE** (→ RESTRICT /
  SET NULL) so erasing a user never nukes payroll history.
- **Vendors:** split denormalised contact fields (`procurement.ts:92-94`) into a
  `vendor_contacts` child table (FK RESTRICT); migrate + backfill. Person PII now erasable
  independent of the vendor entity.
- **The seam:** introduce a per-subject `dataKeyId` reference now. Anonymise-first uses it
  as a correlation key; the KMS upgrade later encrypts PII under a per-subject DEK keyed by
  it — crypto-shred = destroy that DEK.

### Phase 3 — Two-tier executor (anonymize-first) · M
Extend `ERASURE_MAP` (`dpdp-erasure.ts:58`) with the classified domains:
- **Financial PII → `anonymise`** (crypto-shred later): overwrite name/email/bank with
  tombstones, **keep row + amounts + `employeePanHash`**. DPDP-compliant erasure AND
  statutory-retention-compliant (Companies Act §128 / Income-tax Act) simultaneously.
- **Non-statutory (CRM contact) → `delete`.**
- Every entry runs **behind the Phase-1 retention guard**. Keep `DPDP_ERASURE_ENABLED`
  flag-off until counsel signs (`dpdp-erasure.ts:94-96`).

### Phase 4 — Audit-trail redaction side-channel · M
Do **not** mutate `auditLogs`. Add `audit_redaction_events(dsr_id, audit_log_ids,
redacted_at, reason)`; readers filter redacted PII at query time. Immutable chain stays
verifiable (`verifyAuditChain`), DPDP honoured.

### Phase 5 — Crypto-shred upgrade (rides the KMS fast-follow) · M (post-KMS)
Once KMS lands (`INDIA_ROADMAP.md:129`): encrypt subject PII under per-subject DEK
(keyed by `dataKeyId`), add a `crypto-shred` action to the executor's
`action` union (`dpdp-erasure.ts:48`), flip financial-PII map entries from `anonymise`
to `crypto-shred`. **Same executor, same map, same DSR flow** — a drop-in swap, no
re-architecture. Solves the "did we scrub every free-text copy?" residual.

### Phase 6 — Prove it · S–M
Per-domain test DSRs: erasure **inside** the retention window is **rejected** with the
statutory reason; **outside** it, anonymisation runs and financial totals are unchanged;
`verifyAuditChain()` still passes after redaction events; cross-tenant isolation holds
(`__tests__/tenant-isolation.test.ts`).

---

## 5. Critical path

```
GATE   ► Phase 0 legal erasure-map sign-off        [blocks all destructive work]
FLOOR  ► Phase 1 retention guard + retainUntilDate  [safety rail — do first]
DECOUP ► Phase 2 vendor_contacts + payslip PAN-hash + dataKeyId seam + FK fix
EXEC   ► Phase 3 anonymize-first executor (flag-off until sign-off)  ► LAUNCHABLE
AUDIT  ► Phase 4 audit redaction side-channel
UPGRADE► Phase 5 crypto-shred  ‖  rides KMS fast-follow (post-launch)
PROVE  ► Phase 6 per-domain DSR tests + chain verification
```

---

## 6. Phase 0 deliverable — erasure-map template (for counsel)

One row per PII-bearing column. Counsel fills `Action`, `Retention basis`, `Retain
until`, `Sign-off`.

| Table | Column | PII type | Financial? | Proposed action | Retention basis | Retain until | Counsel |
|-------|--------|----------|-----------|-----------------|-----------------|-------------|---------|
| `employees` | `pan` | Tax ID | Yes | **keep raw (filing) + add peppered hash + display** | Income-tax Act / Companies Act §128 | pay + 8y | ☐ |
| `employees` | `aadhaar` | Gov ID | Yes | **minimise at onboarding (masked hash) — not stored raw** | DPDP §8 / Aadhaar Act | n/a (never raw) | ☐ |
| `directors` | `aadhaar` | Gov ID | Yes | **minimise at onboarding (masked hash) — not stored raw** | DPDP §8 / Aadhaar Act | n/a (never raw) | ☐ |
| `employees` | `bankAccountNumber` | Financial | Yes | anonymise | — | on erasure | ☐ |
| `payslips` | (via `employeeId`) | Derived | Yes | retain (hash link) | Income-tax Act / Companies Act §128 | pay + 8y | ☐ |
| `journal_entries` | `createdById`/`postedById` | Actor FK | Yes | retain (SET NULL) | Companies Act §128 | post + 8y | ☐ |
| `vendors` → `vendor_contacts` | `contactEmail`/`Phone`/`PersonName` | Contact | No* | delete/anonymise | — | on erasure | ☐ |
| `crm_contacts` | `firstName`/`lastName`/`email`/`phone` | Contact | No | delete | — | on erasure | ☐ |
| `audit_logs` | `changes` (JSONB) | Mixed | — | redaction side-event | tamper-evident | chain life | ☐ |

\* vendor *entity* is retained for procurement/tax; only the *person* contact is erasable.

---

## 7. Open decisions for counsel

1. **Erasure map + statutory windows** — confirm 8y blanket vs. per-domain
   (payroll/GST/audit) and delete-vs-anonymise per column (§6).
2. **Aadhaar minimisation — DECIDED (#4):** minimise at onboarding to a masked hash;
   never store raw. Counsel to confirm masked-last-4 + one-way-hash is acceptable and
   whether any lawful purpose requires retrievable full Aadhaar (default assumption: no).
3. **Crypto-shred acceptance** — confirm counsel accepts key-destruction (ciphertext
   retained, unreadable) as satisfying erasure once KMS lands.

*Planning only — no application code changed by this document. `DPDP_ERASURE_ENABLED`
stays flag-off until Phase 0 sign-off.*
