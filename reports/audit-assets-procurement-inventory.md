# Audit — Assets / Procurement / Inventory

Audited 2026-07-31 against `docs/quality-bar.md` (standing code at migration head
`0059_volatile_midnight`). Scope: IT asset lifecycle + depreciation, purchase
requests / purchase orders, goods receipt (GRN), 3-way invoice match, and stock
valuation (FIFO/WAC). Source read directly and verified line-by-line — this is not
a diff review.

---

## 1. In plain English

This part of the system is mostly solid. The money maths that matter — how an
asset loses value over time (depreciation), how stock is costed when it's used up,
and how those turn into accounting entries — are all real, balanced, and protected
against double-charging. That is the good news, and it is a large amount of the
critical logic here.

There are two things worth knowing. **First**, the "three-way match" — the control
that is supposed to check a supplier's invoice against both the purchase order
*and* proof that the goods actually arrived — only ever checks two of the three.
There is no button, screen, or API anywhere in the product that records goods being
received (a "goods receipt note", or GRN). The code that would compare against
goods-received exists and looks finished, but nothing can ever feed it, so in
practice you are paying invoices matched only against the paper order, not against
what was delivered. For a company buying physical goods this is a real
fraud/overpayment control that is silently switched off.

**Second**, every accounting entry the platform writes picks its own reference
number by counting how many entries already exist and adding one. If two things
try to post an entry at the same moment (say, a month-end depreciation batch while
someone posts a supplier invoice), they pick the *same* number, and one of them is
rejected by the database and rolls back. The books never get corrupted — but a
legitimate posting can just fail, and nothing retries it.

The one thing to fix first is the three-way match / GRN gap, because it is a
financial control your customers will assume is working when it is not.

## 2. Verdict

Healthy core, two structural gaps. Depreciation, inventory valuation, and all the
GL journal postings are production-grade: balanced double-entry, guarded before
write, idempotent, row-locked, and org-scoped. The procurement *money path* (PO
accrual to a real Chart-of-Accounts) is correct and no longer uses the old
placeholder-UUID hack. The two problems are (a) the goods-receipt half of the
three-way match is unreachable dead code, reducing a 3-way control to 2-way, and
(b) journal-entry numbering is not concurrency-safe across all six posting paths.
Tenant scoping is strong on reads and on most writes, but a handful of writes stamp
a foreign-org parent id without validating ownership.

## 3. Findings

### HIGH

#### H-1 — Three-way match is silently 2-way: no code path ever creates a GRN or sets `invoices.grnId`

- **Evidence.**
  - The matcher fully implements the goods-received leg, but only when the invoice
    carries a `grnId`:
    `apps/api/src/lib/invoice-po-match.ts:213`
    ```ts
    if (invoice.grnId) {
      const grnLinesAll = await db.select().from(grnLineItems).where(eq(grnLineItems.grnId, invoice.grnId));
      ...
    }
    ```
    and the three-way tightening at `invoice-po-match.ts:276-289`
    (`threeWayGap <= tolerance`) is gated on the same `invoice.grnId`.
  - No router anywhere writes `invoices.grnId`: `grep grnId apps/api/src/routers/*.ts`
    → **no matches**. Invoices are created at `ingest.ts:344`, `financial.ts:253`,
    `financial.ts:362`, `financial.ts:1008` — none set `grnId`.
  - No router anywhere inserts a GRN: `insert(goodsReceiptNotes)` appears **only**
    in `apps/api/src/__tests__/metric-visuals.test.ts:181` (a vendor-SLA metric
    fixture). The `goodsReceiptNotes` / `grnLineItems` tables
    (`packages/db/src/schema/procurement.ts:240-286`) have zero create/list/get/accept
    endpoints.
  - `procurement.purchaseOrders.receive` (`procurement.ts:587-623`) updates
    `poLineItems.receivedQuantity` but never creates a `goodsReceiptNotes` row and
    never touches `grnLineItems.acceptedQuantity` — the field the matcher reads.
- **Concrete failure scenario.** A buyer raises PO-1000 for 100 units @ ₹500
  (₹50,000). The supplier delivers 40 units but invoices for the full ₹50,000. A
  clerk calls `procurement.invoices.applyMatchToOrder({ invoiceId, poId })`. Because
  `invoice.grnId` is NULL, the matcher skips the entire goods-received block and
  matches on PO-total ≈ invoice-total (both ₹50,000) within tolerance → `matched:
  true` → invoice flipped to `matched` / pay-ready. The 60-unit short-delivery is
  invisible; the org pays for goods it never received.
- **What this means in practice.** The three-way match — a core
  overpayment/fraud control any procurement buyer expects — is effectively
  disabled. Invoices are validated against the paper order only, not against
  what physically arrived.

> Note on the evidence rule: this is reported as a finding (not a "missing
> feature" to discard) because the failure is not "GRN screen absent" in the
> abstract — it is that a *shipped, exercised* control path
> (`applyMatchToOrder` → `computeInvoicePoMatch`) returns `matched: true` on a
> short/over delivery, with the specific inputs above producing a specific bad
> state (an unwarranted pay-ready invoice).

---

### MEDIUM

#### M-1 — Journal-entry numbering (`count()+1`) is not concurrency-safe; collides under a unique index

- **Evidence.** Six posting paths compute the JE number identically as
  `count(journal_entries WHERE org)+1`, with no advisory lock and no unique-violation
  retry:
  - `apps/api/src/lib/depreciation-journal.ts:71-73`
  - `apps/api/src/lib/inventory-journal.ts:71-73`
  - `apps/api/src/lib/invoice-journal.ts:125-127`, `:251-253`, `:348-350`
  - `apps/api/src/routers/accounting.ts:294`, `:379`
    ```ts
    const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(eq(journalEntries.orgId, orgId));
    const seq = (c?.n ?? 0) + 1;
    const number = `JE-${date.getFullYear()}-${String(seq).padStart(5, "0")}`;
    ```
  - The `number` column is under a **unique** index:
    `packages/db/src/schema/accounting.ts:154`
    `uniqueIndex("je_org_number_idx").on(t.orgId, t.number)`.
- **Concrete failure scenario.** At month-end, `depreciation.runAll` is charging
  assets (each its own transaction) while a clerk posts a vendor invoice via
  `financial` (which calls `postInvoiceJournalEntry`). Both read `count() = 412`
  concurrently → both build `JE-2026-00413`. Whoever commits second hits a `23505`
  unique-violation on `je_org_number_idx`; because nothing catches/retries it, that
  transaction rolls back entirely — the depreciation charge (or the invoice post)
  fails and is lost until re-run by hand.
- **Why MEDIUM, not BLOCKER.** The unique index *prevents* duplicate numbers, so
  the ledger is never corrupted and never silently wrong — the loser rolls back
  atomically. The harm is a failed-and-dropped legitimate operation under
  concurrency, i.e. correct-but-fragile. (The PO-accrual JE uses a different scheme,
  `JE-PO-${poNumber}` at `procurement.ts:466`, so it does not collide with this
  family — narrowing the blast radius.)
- **What this means in practice.** Under real month-end load, a depreciation
  charge or an invoice posting can just fail with a database error and vanish;
  someone has to notice and re-run it.

#### M-2 — Procurement writes stamp a foreign-org `vendorId` without an ownership check

- **Evidence.** `procurement.purchaseOrders.create` inserts the caller-supplied
  `vendorId` straight onto the PO with no same-org validation:
  `apps/api/src/routers/procurement.ts:428`
  ```ts
  .values({ orgId: org!.id, poNumber, vendorId: input.vendorId, ... })
  ```
  Contrast with the *correct* pattern used two procedures down —
  `createFromPR` validates `legalEntityId` ownership at `procurement.ts:520-528`,
  and `assets.linkContract` validates the contract's org at `assets.ts:250-260`
  ("Contract not found in this organisation"). The check is applied inconsistently.
  The `vendors.vendorId → vendors.id` FK (`procurement.ts` schema line 185-187) is
  `onDelete: restrict` with no org predicate, and Postgres FK checks run as the
  table owner (they bypass the request's `app_runtime` RLS role), so the insert
  succeeds against a vendor from another org.
- **Concrete failure scenario.** Org A user calls
  `procurement.purchaseOrders.create({ vendorId: <Org B vendor UUID>, totalAmount,
  items })`. The PO is created `orgId = A` but pointing at Org B's vendor row. No
  error. The PO's own reads are org-scoped so B's vendor *name* won't render for A
  via the left-join (it filters nothing on the join, but the PO row itself is A's),
  yet A now holds a PO whose vendor FK references a tenant it cannot see — a
  cross-tenant referential link, and a data-integrity anomaly if B's vendor is later
  restricted/deleted.
- **Why MEDIUM.** No cross-tenant *read* leak (all list/get paths filter
  `orgId`), and the accrual JE is org-A-scoped. It is a silent integrity anomaly,
  not a data breach — same class as the CRM `M-1` in `audit-crm-sales.md`.
- **What this means in practice.** One tenant can attach another tenant's vendor
  to its own purchase order. Nothing leaks on screen today, but the books now
  contain a reference that crosses the tenant boundary.

#### M-3 — Unbounded procurement list queries (no `limit`)

- **Evidence.** Four list procedures return every matching row with no cap:
  - `vendors.list` — `procurement.ts:153-155` (`select().from(vendors).where(org)`)
  - `purchaseRequests.list` — `procurement.ts:194`
  - `purchaseOrders.list` — `procurement.ts:366-368`
  - `invoices.list` — `procurement.ts:654`
- **Concrete failure scenario.** An org with 50,000 historical invoices opens the
  Invoices screen; `invoices.list` serialises all 50,000 rows into one tRPC
  response, spiking API memory and latency for that request.
- **Rule #7 classification.** These are **UI-list** feeds consumed by the
  procurement screens, not export/report/filing/aggregate paths — so per the
  quality bar they are *not* a BLOCKER (no silent truncation of a filing). The
  genuine aggregate path, `procurement.dashboard` (`procurement.ts:714-731`), uses
  server-side SQL `count()` / `sum()` and does **not** truncate, so totals stay
  correct. Rated MEDIUM as correct-but-fragile: they degrade at scale but do not
  silently mis-state a number.
- **What this means in practice.** These screens will get slow and heavy for large
  tenants; they won't show *wrong* numbers.

---

### LOW

#### L-1 — Swallowed notification errors on PR approve/reject

- **Evidence.** `procurement.ts:317` and `:346`:
  `}).catch(() => {});` on the `sendNotification(...)` after PR approve/reject.
- **Concrete failure scenario.** The notification service is briefly down when a PR
  is approved; the requester is never told, and there is no log line or retry — the
  approval succeeds but the "your PR was approved" signal is dropped without trace.
- **Why LOW.** The core state transition (PR → approved) is durable and correct;
  only the best-effort notify is lost, and notifications are non-authoritative.
- **What this means in practice.** Occasionally a requester won't get the
  "approved/rejected" ping and no one will know it went missing.

---

## 4. Root causes

Three design decisions produced every symptom above:

1. **The GRN subsystem was schema-first and never wired.** The tables, enums,
   relations, and even the *consuming* matcher logic were all built
   (`procurement.ts` schema `goodsReceiptNotes`/`grnLineItems`;
   `invoice-po-match.ts` grn block), but the *producing* endpoints (create GRN,
   accept lines, link invoice→grn) were never written. This is the classic
   generated-code pattern: the model is right, the computation/plumbing that
   populates it is missing (H-1). The `receive` endpoint updates a quantity on the
   PO line instead of creating the GRN the rest of the system expects.

2. **JE numbering was copied, not centralised.** The same `count()+1 → JE-YYYY-NNNNN`
   snippet was duplicated into six posting sites rather than routed through the
   advisory-lock allocator (`getNextNumber`) that PR/PO numbers already use
   (`procurement.ts:238`, `:421`). Each copy inherited the same read-then-write race
   against a unique index (M-1).

3. **Foreign-key ownership validation is a per-author convention, not an enforced
   rule.** Some procedures validate that a referenced parent belongs to the caller's
   org (`createFromPR` legalEntity, `linkContract` contract); others spread the id
   straight in (`purchaseOrders.create` vendorId) — the same drift found in CRM.
   Nothing structural forces the check, so it is present or absent per the session
   that wrote each handler (M-2).

## 5. Recommended order of work (by blast radius)

1. **H-1 — Wire the GRN path and make the 3-way match mean it.** Add
   create/accept GRN endpoints that populate `grnLineItems.acceptedQuantity`, link
   `invoices.grnId`, and (decision needed) make `applyMatchToOrder` *require* a GRN
   for goods POs before flipping an invoice pay-ready. Biggest blast radius: it is a
   live financial control returning the wrong answer on real short-deliveries.
2. **M-1 — Route all six JE-number sites through the advisory-lock allocator**
   (as PR/PO already do) or add a bounded 23505-retry. Removes a class of
   silent-failure-under-load across the entire finance module, not just this
   subsystem.
3. **M-2 — Validate `vendorId` (and any caller-supplied parent id) against the
   caller's org** in `purchaseOrders.create`, matching the `createFromPR` /
   `linkContract` pattern. Close the same gap flagged in CRM in one consistent pass.
4. **M-3 — Add a `limit` (default ≤200) to the four procurement list procedures.**
   Cheap, purely defensive.
5. **L-1 — Log (don't silently swallow) the notification failure.** One line.

---

## Housekeeping (not findings)

- **`docs/quality-bar.md:229` is stale.** It lists the depreciation engine as
  "partial; full schedule engine not finished." Verified otherwise: the engine is
  complete — SLM + WDV, per-period incremental charge plus a trued-up final period
  (`depreciation.ts:205-209`), balanced GL posting (`depreciation-journal.ts`),
  idempotent per `(asset, period)` (`onConflictDoNothing`, `depreciation.ts:226`),
  and row-locked (`for("update")`). Per rule #10 this is not re-reported as a
  finding; the accepted-debt line should simply be marked done.
- SAM installed-vs-entitled reconciliation (`quality-bar.md:234`) remains genuinely
  open and is out of scope here; not audited.

## Test coverage notes ("test the tests")

- **Strong / inversion-proof:** `depreciation-journal.test.ts` (exact charges,
  balanced-JE assertions, back-reference, idempotency, graceful skip when COA
  unseeded); inventory valuation FIFO/WAC and COGS-journal tests. These would fail
  if the maths were inverted.
- **The gap behind H-1:** the only 3-way-match test,
  `layer8-module-smoke.test.ts:732` (`applyMatchToOrder`), never populates
  `grnId` — it exercises PO↔invoice only. It would pass **unchanged** if the entire
  GRN block in `invoice-po-match.ts:213-289` were deleted. Nothing tests a
  short-delivery being caught, because nothing can create the GRN to catch it.
- **The gap behind M-1:** every depreciation/inventory/invoice JE test posts
  **serially** (`runAll` posts 2 JEs one after another). No test posts two JEs
  concurrently in one org+year, so the `count()+1` collision is never exercised.
- **The gap behind M-2:** no test calls `purchaseOrders.create` with a foreign-org
  `vendorId`; the cross-tenant insert path is unguarded and untested.
