# Audit — gst-invoicing

Audited 2026-07-31 against `docs/quality-bar.md`. Scope: GST computation
(CGST/SGST/IGST), invoice create/backfill, invoice→journal posting, 3-way match
(invoice ≈ PO ≈ goods-receipt), input tax credit (ITC), and GSTR-1/GSTR-3B
filings. This audits the code as it stands, not any recent change.

Files in scope:
- `packages/payroll-math/src/gst-engine.ts` (computeGST, computeITCUtilisation)
- `apps/api/src/routers/financial.ts` (createInvoice, createReceivableInvoice, backfill, `gstInvoiceColumns`)
- `apps/api/src/lib/invoice-journal.ts` (GL posting)
- `apps/api/src/lib/invoice-po-match.ts` (3-way match)
- `apps/api/src/routers/accounting.ts` (generateGSTR1, generateGSTR3B)
- `apps/api/src/services/orgWizardWrite.ts` (how the org's GSTIN state is populated)
- `packages/db/src/schema/{accounting,procurement}.ts`
- tests: `invoice-gst.test.ts`, `gstr1-rate-grouping.test.ts`, `money-invariants.test.ts`, `layer8-module-smoke.test.ts`

---

## 1. In plain English

The GST maths itself is correct — the tax rates, the CGST/SGST vs IGST split, the
input-credit rules, and the GSTR-1 filing all compute the right numbers *when
given the right inputs*. The danger is in **how the system decides whether a sale
is inside your state or across state lines**, because that decision picks between
two different taxes (CGST+SGST vs IGST) and getting it wrong means filing the
wrong tax with the government.

The system decides "same state or not" by comparing two pieces of text. But for
any company set up through the normal onboarding wizard, its own state is stored
as a **numeric code** ("27") while the vendor's state is stored as a **name**
("Maharashtra"). "27" and "Maharashtra" don't match, so the system concludes the
two parties are in different states and charges **IGST on what is actually a
local sale**. That is a real, wrong tax on a real invoice, and it flows straight
into the GST return. The existing tests never catch it because they always fill
in *both* sides with matching full names — a spelling the live wizard never
produces.

There is also a second, quieter problem: when an invoice is checked against a
goods-receipt (the "did we actually receive what we're paying for" check), the
system compares the invoice's tax-**inclusive** total against a tax-**exclusive**
received value, so any invoice that carries GST fails that check even when it is
perfectly correct.

The one thing to fix first is the state comparison (Finding H-1): it silently
produces wrong tax filings for ordinary customers.

---

## 2. Verdict

The computation core (`gst-engine.ts`) is sound and well tested, and the old
"GSTR-1 always files 18%" hardcode is genuinely fixed (it now groups by real
line rate with a header-derived fallback — `accounting.ts:762-798`). The failures
are all at the **inputs to** that correct engine: the intra/inter-state decision
rests on comparing two free-text state fields that the real data-entry paths
populate in incompatible formats (code vs name), and the 3-way match mixes
tax-inclusive and tax-exclusive figures. Both are reachable with ordinary inputs
and both are invisible to the current tests because the fixtures are hand-tuned
to the one format where the comparison happens to work. No rule-7 export-truncation
issue exists (GSTR-1/3B read all rows, no cap). No BLOCKER-class data loss found;
the two leading findings are HIGH (wrong output under realistic inputs).

---

## 3. Findings

### HIGH

#### H-1 — Intra/inter-state GST is decided by comparing a state *code* to a state *name*; wizard-onboarded orgs charge IGST on local sales

**Where:**
- `packages/payroll-math/src/gst-engine.ts:61-62` — the whole split hinges on a string compare:
  ```ts
  const isInterstate =
    supplierState.trim().toLowerCase() !== buyerState.trim().toLowerCase();
  ```
- `apps/api/src/routers/financial.ts:238` — org side resolves to name-or-code:
  ```ts
  const orgState = orgGstin?.stateName ?? orgGstin?.stateCode ?? null;
  ```
- `apps/api/src/routers/financial.ts:246` — counterparty side is free text: `counterpartyState: vendorRow?.state ?? null`.
- `packages/db/src/schema/accounting.ts:202-203` — `stateCode` is **NOT NULL**, `stateName` is **nullable**.
- `apps/api/src/services/orgWizardWrite.ts:126-134` — the onboarding wizard inserts the org GSTIN with `stateCode` only and **never sets `stateName`**:
  ```ts
  const finalStateCode = input.india.stateCode ?? input.india.gstin?.substring(0, 2) ?? "";
  await tx.insert(gstinRegistry).values({ orgId, gstin: finalGstin, legalName: …, stateCode: finalStateCode, isPrimary: true });
  ```

**Concrete failure scenario:** A company onboards through the wizard with GSTIN
`27AAAAA0000A1Z5`. The wizard stores `stateCode = "27"` and leaves `stateName`
NULL (orgWizardWrite.ts:132). The company raises an invoice to a Maharashtra
vendor whose `vendors.state = "Maharashtra"`. In `createInvoice`, `orgState`
resolves to `"27"` (financial.ts:238, because `stateName` is null), counterparty
is `"Maharashtra"`. `computeGST` compares `"27" !== "maharashtra"` →
`isInterstate = true` → it charges **IGST 18%** on a purely intra-Maharashtra
supply that should have been **CGST 9% + SGST 9%**. The wrong split is persisted
on the invoice, posted to the wrong GL tax accounts (`invoice-journal.ts` routes
to IGST 1141 instead of CGST 1142/SGST 1143), and rolled into `generateGSTR1` /
`generateGSTR3B` as inter-state supply. The reverse also happens: two genuinely
different states both stored as bare codes that happen to be entered
inconsistently, or a vendor with a null state (financial.ts `counterpartyState ??
orgState` at line 94 forces same-state), silently mis-split the other direction.

**What this means in practice:** Ordinary customers set up through the normal
wizard will file the wrong kind of GST — inter-state tax on local sales — on real
invoices, with no warning. That is a filing error with the tax authority and a
wrong figure shown to the customer.

---

#### H-2 — 3-way match compares a tax-inclusive invoice total against a tax-exclusive goods-receipt value; every GST-bearing invoice with a GRN fails the match

**Where:** `apps/api/src/lib/invoice-po-match.ts`
- `:186` — `const invoiceTotal = parseFloat(invoice.amount);` — `invoice.amount` is the **gross** (taxable + tax); see `gstInvoiceColumns` returning `amount: String(gst.invoiceTotal)` (financial.ts:108) and the create path storing it (financial.ts:263).
- `:223-227` — the received value is built from **unit price only**, no tax:
  ```ts
  const up = priceByPolId.get(gl.poLineItemId) ?? 0;      // poLineItems.unitPrice — tax-exclusive
  const add = Number(gl.acceptedQuantity ?? 0) * up;
  grnByPoLine.set(gl.poLineItemId, (grnByPoLine.get(gl.poLineItemId) ?? 0) + add);
  ```
- `:282-288` — the three-way gap compares those two directly:
  ```ts
  const threeWayGap = Math.abs(invoiceTotal - recv);   // tax-inclusive − tax-exclusive
  matched = matched && threeWayGap <= tolerance && … ;
  ```
- `packages/db/src/schema/procurement.ts:225-230` — confirms `unitPrice`/`taxableValue` are separate columns from `cgstAmount`/`sgstAmount`/`igstAmount`; `recv` is tax-exclusive.

**Concrete failure scenario:** A ₹1,00,000 (taxable) PO at 18% GST → invoice
`amount = ₹1,18,000`. A GRN accepts the full quantity: `recv = qty × unitPrice =
₹1,00,000` (tax-exclusive). `threeWayGap = |118,000 − 100,000| = 18,000`, which
exceeds any sane tolerance (default is a small absolute rupee figure). The match
returns `matched = false` and the invoice is flagged as an exception even though
the goods, quantities and prices are all exactly right. The only 3-way-adjacent
test (`layer8-module-smoke.test.ts:751-755`) deliberately uses `gstRate: 0` — the
comment on line 755 literally says *"3-way match asserts on the ₹100 taxable line,
not tax"* — and sets no `grnId`, so this branch is never exercised.

**What this means in practice:** Once a company links goods-receipts into
matching (the "did we receive it" control), every taxed invoice trips a false
exception. Staff either chase phantom discrepancies or learn to ignore the
control entirely — which defeats the purpose of 3-way matching.

---

### MEDIUM

#### M-1 — `gstInvoiceColumns` silently defaults a missing counterparty/org state to "same state", hiding H-1 and mis-splitting on incomplete data

**Where:** `apps/api/src/routers/financial.ts:93-94`
```ts
const orgState = params.orgState ?? "";
const counterpartyState = params.counterpartyState ?? orgState;
```

**Concrete failure scenario:** If the vendor has no `state` recorded
(`counterpartyState` null), it is set equal to `orgState`, so `computeGST` always
returns intra-state (CGST+SGST) — even for a genuinely inter-state vendor whose
state was simply not captured. Conversely if the org has no resolvable state
(`orgState` null → `""`), both sides become `""` and again collapse to
intra-state. The tax is computed and posted with no signal that the state basis
was unknown. This is MEDIUM (correct-but-fragile) rather than HIGH because it
requires missing data to trigger, whereas H-1 fires on *complete* data in the
normal wizard format — but it shares H-1's root cause and masks it.

**What this means in practice:** Missing a vendor's state doesn't raise an error;
it quietly assumes a local sale and can under- or mis-charge GST.

---

#### M-2 — The GST tests are tuned to the one state format the live paths never produce, so H-1 and H-2 are invisible to CI

**Where:**
- `apps/api/src/__tests__/invoice-gst.test.ts:30-40, 59-60, 80-81` — every fixture sets the org GSTIN with an explicit `stateName` ("Maharashtra") **and** the vendor with a matching full-name `state` ("Maharashtra"/"Karnataka"). The live wizard never sets `stateName` (H-1), so the tests exercise a data shape production doesn't create.
- `apps/api/src/__tests__/layer8-module-smoke.test.ts:755` — the sole match test forces `gstRate: 0` and links no GRN, dodging H-2 entirely.
- `apps/api/src/__tests__/money-invariants.test.ts:98-104` — asserts intra-CGST+SGST == inter-IGST only on round values (10000, 12345) and already-matched state strings.

**Concrete failure scenario:** Invert the intra/inter decision or leave H-1
exactly as it is — every one of these specs still passes, because none feeds the
code-vs-name state mismatch or a taxed GRN match. The safety net is shaped around
the implementation's happy path, not the requirement (correct tax split on the
data the app actually stores).

**What this means in practice:** These bugs can ship and re-ship green; the tests
give false confidence that GST on invoices is correct end-to-end.

---

## 4. Root causes

Three design decisions produced every finding above:

1. **"State" is an unnormalised free-text string used as an equality key across
   modules that populate it differently.** The GSTIN registry stores a code
   (NOT NULL) plus an optional name (nullable, and the wizard never fills it);
   vendors store a free-text name. Two separately-written modules invented
   incompatible representations of the same concept, and the GST engine compares
   them raw. H-1 and M-1 are this. A single canonical state key (the 2-digit GST
   state code, derivable from any GSTIN and mappable from any name) resolved once
   at the boundary would remove the entire class.

2. **Tax-inclusive and tax-exclusive amounts are mixed without a consistent
   convention.** The invoice header is gross; the PO line/GRN received value is
   net. The header match happens to compare gross-to-gross correctly, but the
   three-way GRN leg compares gross-to-net. H-2 is this — the matcher never
   decided, per comparison, which basis it is on.

3. **Tests assert what the implementation does on curated inputs, not what the
   requirement demands on real inputs.** The fixtures encode the one state format
   where the compare works and the one tax rate (0%) where the match bug is
   silent. M-2 is this, and it is why H-1 and H-2 survived.

---

## 5. Recommended order of work

Ranked by blast radius, not count:

1. **H-1 — normalise the state key before comparing (HIGH).** Resolve both
   supplier and buyer to the canonical 2-digit GST state code (derive org side
   from the GSTIN itself, map vendor free-text/code to the same) and compare
   those. This stops wrong-tax filings for every wizard-onboarded org. Fixing it
   also removes M-1's silent default.
2. **H-2 — compare like-for-like in the 3-way match (HIGH).** Match the invoice's
   *taxable* value against the GRN's tax-exclusive received value (or add tax to
   `recv`), so taxed invoices with a GRN can pass. This restores the receiving
   control.
3. **M-2 — add tests that reflect real data (do this *with* H-1/H-2).** A fixture
   with the org GSTIN carrying only `stateCode` (no `stateName`) against a
   full-name vendor state, asserting the correct intra-state split; and a 3-way
   GRN match on a non-zero GST rate asserting `matched = true`. These lock the
   fixes and prevent regression.
4. **M-1** is resolved by H-1's normalisation, but keep an explicit "state
   unknown → do not silently assume intra-state" guard so missing data surfaces
   rather than mis-charges.

The GST engine itself (rates, CGST/SGST/IGST split, ITC utilisation sequence,
GSTR-1 rate grouping, GSTR-3B netting, invoice→journal balance) is correct and
adequately tested — nothing there rose above MEDIUM.
