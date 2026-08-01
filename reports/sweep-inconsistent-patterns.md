# Sweep — Inconsistent Patterns

**Type:** Sweep, not an audit. No code was changed. This is a read-only survey.

**What this looks for:** places where the codebase *already knows the right way to
do something* — it does it correctly in one module — but a sibling module solves
the same problem the wrong way (or not at all). These are the highest-confidence
defects to fix, because the fix is not a research problem: the correct
implementation is already sitting in the same repository. You just copy the shape
that already works.

Every finding below was confirmed by reading the actual source. For each pattern:
where it is done **right**, where it is done **wrong**, and **what breaks for a
customer** in the wrong places.

---

## Plain-English summary

The team has good instincts. In several tricky areas — concurrent button clicks,
generating sequential document numbers, running scheduled clean-up jobs — there is
at least one module that handles the hard edge cases correctly. The problem is that
the correct approach was not applied everywhere. The same class of bug was solved
once and then re-introduced elsewhere by hand.

Five patterns stand out:

1. **Two people clicking "Post"/"Approve" at the same time.** The Changes module
   guards against this properly (it refuses the second click). The Accounting
   "Post" button and the Procurement approve/reject buttons do not — the second
   click can double-count money or silently overwrite the first decision.
2. **Generating document numbers (JE-2026-00042).** There is a correct, race-proof
   counter (`getNextSeq`). Seven journal-numbering sites ignore it and instead
   "count the existing rows and add one," which hands two simultaneous entries the
   *same* number.
3. **Scheduled clean-up jobs (the privacy/DPDP sweep).** The ITSM sweeps (escalation,
   event correlation) isolate each item so one bad record doesn't kill the whole
   run. The DPDP privacy sweep does not — one failure silently skips every remaining
   overdue privacy request and every later sweep in that run.
4. **Saving several related records together.** Money-critical writes correctly use
   a transaction (all-or-nothing). Leave *rejection* and expense line-item *deletion*
   do two writes with no transaction — a mid-way crash leaves totals/balances wrong.
5. **The "version" safety column that exists but is unused.** Procurement requests
   carry a `version` column built exactly for safe concurrent edits. The Changes
   module uses its `version` column correctly; Procurement never reads its own.

**The one to fix first:** the Accounting "Post" double-count (Pattern 1 / 2a). It
corrupts account balances — the ledger — and unlike the others it is silent: nobody
gets an error, the numbers just quietly become wrong.

---

## Pattern 1 — Guarding concurrent state transitions (row lock **or** version check)

**The problem shape.** A handler reads a record, checks its status
("is it still `draft`?"), then writes a new status. If two requests run this at the
same time, both read the old status, both pass the check, and both write — so the
transition happens twice. For an "Approve" that only flips a flag, that's a
duplicate approval. For "Post" that also *moves money*, the money moves twice.

There are two correct cures in this repo, and both are present:

### Done right (A) — pessimistic row lock (`SELECT … FOR UPDATE`)

- **`apps/api/src/routers/inventory.ts:354`** (also `:433`, `:453`) — reads the
  inventory row with `.for("update")` inside a `db.transaction`, so a concurrent
  request blocks until the first commits:
  ```ts
  const [item] = await tx.select().from(inventoryItems)
    .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.orgId, org!.id)))
    .for("update");
  ```
- **`apps/api/src/routers/depreciation.ts:193`** (also `:289`) — same `.for("update")`
  lock before mutating.

### Done right (B) — optimistic version check

- **`apps/api/src/routers/changes.ts:346-390`** — reads `version`, then the UPDATE's
  `WHERE` includes `eq(changeRequests.version, current.version)`; if a concurrent
  request already moved the row, zero rows update and it throws:
  ```ts
  .where(and(
    eq(changeRequests.id, input.changeId),
    eq(changeRequests.orgId, org!.id),
    eq(changeRequests.version, current.version),   // <- optimistic guard
  ))
  .returning();
  if (!change) {
    throw new TRPCError({ code: "CONFLICT",
      message: "Record was modified by another user. Please refresh and try again." });
  }
  ```
  (`changes.reject` at `:406-420` does the same.)

### Done wrong — read-check-then-write with **neither** lock nor version guard

- **`apps/api/src/routers/accounting.ts:327-356` (`journal.post`)** — reads the entry
  with a plain `.select()…limit(1)` (`:331-332`, **no** `.for("update")`), checks
  `if (je.status !== "draft") throw` (`:334`), then in a transaction loops over the
  lines applying balance deltas to `chartOfAccounts` (`:341-346`) and flips status to
  `"posted"` (`:348-353`). **What breaks:** two users (or a double-click, or a retry)
  both read `draft`, both pass the check, both apply the balance deltas → the account
  running balances are **double-counted**. This corrupts the ledger and is silent —
  no error is raised. *This is the most serious finding in the sweep.*

- **`apps/api/src/routers/hr.ts:663-676` (leave `approve`)** — reads the request with
  no `.for("update")` (`:663-666`), checks `if (request.status !== "pending") throw`
  (`:669-671`), then transacts the status/balance/attendance writes. **What breaks:**
  two approvals of the same leave request both pass the pending-check → the leave
  balance can be debited twice.

- **`apps/api/src/routers/procurement.ts:294-321` (`approve`) and `:323-…` (`reject`)**
  — these skip the read-check entirely and issue a single unconditional
  `UPDATE purchaseRequests SET status … WHERE id AND orgId`. There is **no** status
  check and **no** version guard, even though `purchase_requests` **has a `version`
  column** (`packages/db/src/schema/procurement.ts:441`) built for exactly this.
  **What breaks:** approve and reject can race; the last write wins with no signal.
  A request rejected by one manager can be silently flipped to approved by another
  clicking a stale screen — a real approvals-integrity problem, not just a UI glitch.

**Why this is the same pattern:** `changes.ts` and `procurement.ts` both have a
`version` column; only `changes.ts` uses it. `inventory.ts`/`depreciation.ts` lock
the row; `accounting.ts` `journal.post` and `hr.ts` leave-approve do the same
read-check-then-write but skip both cures. The correct code is already in the tree.

---

## Pattern 2 — Race-safe sequence numbers

### Done right — atomic counter

- **`apps/api/src/lib/auto-number.ts:53-70` (`getNextSeq`)** — one atomic statement:
  ```sql
  INSERT INTO org_counters (org_id, entity, current_value) VALUES (…, …, 1)
  ON CONFLICT (org_id, entity)
  DO UPDATE SET current_value = org_counters.current_value + 1
  RETURNING current_value
  ```
  Postgres serialises the UPDATE on the conflicting row, so simultaneous callers get
  distinct, gap-free values. `getNextNumber` (`:82-91`) formats `TKT-0042` on top of
  it. This is the intended, correct primitive.

### Done wrong — "count the rows and add one" for journal-entry numbers

Each of these reads `count(*)` of existing journal entries and formats
`JE-<year>-<seq>` from it. `count(*)` takes **no** lock, so two concurrent creates
read the same count and mint the **same** JE number:

- **`apps/api/src/routers/accounting.ts:292-294`** (`journal.create`)
- **`apps/api/src/routers/accounting.ts:377-379`**
- **`apps/api/src/lib/invoice-journal.ts:125-127`**
- **`apps/api/src/lib/invoice-journal.ts:251-253`**
- **`apps/api/src/lib/invoice-journal.ts:348-350`**
- **`apps/api/src/lib/inventory-journal.ts:71-73`**
- **`apps/api/src/lib/depreciation-journal.ts:71-73`**

Representative shape (accounting.ts:292-294):
```ts
const [c] = await tx.select({ n: dbCount() }).from(journalEntries)
  .where(dbEq(journalEntries.orgId, org!.id));
const seq = (c?.n ?? 0) + 1;
const number = `JE-${input.date.getFullYear()}-${String(seq).padStart(5, "0")}`;
```
The surrounding `tx` transaction does **not** save this — a plain `count(*)` is not
locked by the transaction. **What breaks:** under any real concurrency the ledger
gets **duplicate JE numbers** (e.g. two different entries both `JE-2026-00042`).
That breaks audit trails, reconciliation, and any export that assumes JE numbers are
unique. (The brief said "six" sites; there are **seven** — both `accounting.ts`
sites plus the five in the lib files.)

---

## Pattern 3 — Per-item error isolation in scheduled sweeps

### Done right — one bad item doesn't abort the tick

- **`apps/api/src/workflows/correlationWorkflow.ts:108-130`** — the per-event loop
  wraps `evaluateEvent` in try/catch and just counts failures:
  ```ts
  try { … } catch (err) { result.errors++; console.error(…); }
  ```
- **`apps/api/src/workflows/escalationWorkflow.ts:244-247`** — same per-ticket
  try/catch, incrementing `result.errors`, so the loop finishes every ticket.

### Done wrong — one throw abandons the rest

- **`apps/api/src/lib/dpdp-sweeps.ts`** — the three sweep loops have **no** per-item
  try/catch:
  - `dsrOverdueSweep` loop **`:103-121`**
  - `breachNotifySweep` loop **`:155-190`**
  - `consentExpirySweep` loop **`:215-229`**

  and `runDpdpSweepsForOrg` (**`:237-250`**) runs them strictly in sequence:
  ```ts
  const dsr = await dsrOverdueSweep(...);
  const breach = await breachNotifySweep(...);
  const consent = await consentExpirySweep(...);
  ```
  **What breaks:** if a single overdue Data-Subject-Request (or one breach
  notification, or one consent record) throws — a bad email address, one malformed
  row — the loop aborts and **every remaining item in that sweep is skipped**, and
  because the three run in sequence, the **later sweeps never run at all**. This is
  the privacy/DPDP subsystem, where missing a statutory deadline is a regulatory
  exposure, and the failure is silent (the tick just ends early). The ITSM sweeps
  already show the correct shape.

---

## Pattern 4 — Multi-row writes belong in a transaction

### Done right — money writes are atomic

- **`apps/api/src/routers/accounting.ts:340-355`**, **`apps/api/src/lib/invoice-journal.ts`**,
  **`apps/api/src/routers/inventory.ts:350+`** — the balance/journal writes are all
  wrapped in `db.transaction(async (tx) => …)`, so partial failure rolls back.

### Done wrong — related writes with no transaction

- **`apps/api/src/routers/hr.ts:740-758` (leave `reject`)** — updates
  `leaveRequests` (`:740-744`) and then, as a **separate** statement, updates
  `leaveBalances` to release the held days (`:747-758`), **not** wrapped in
  `db.transaction`. **What breaks:** if the second write fails, the request is marked
  rejected but the pending leave balance is never released — the employee
  permanently "loses" those days. *(Secondary defect at the same spot: the
  `leaveRequests` UPDATE `WHERE` at `:743` filters on `id` only, without `orgId`;
  the guard SELECT at `:733-736` does include `orgId`, so this is a tenant-scoping
  slip on the write, not an open door, but it is inconsistent with the guard right
  above it.)*

- **`apps/api/src/routers/expenses.ts:231-248` (`deleteItem`)** — deletes an expense
  line (`:231-237`), then a separate `SELECT sum(...)` (`:240-243`), then a separate
  UPDATE of the report totals (`:245-248`), with **no** transaction. **What breaks:**
  a crash between the delete and the total-update leaves the report's `totalAmount`
  overstating what its line items actually sum to — the expense report shows the
  wrong reimbursable amount. (The sibling add-item path at `:215-221` has the same
  non-transactional shape.)

---

## Pattern 5 — Infrastructure that exists but isn't wired up

This is a special case of the above: the *column* for the correct approach exists,
but the code ignores it.

- `purchase_requests.version` (**`packages/db/src/schema/procurement.ts:441`**) —
  present, defaulted to 1, never read by `procurement.approve`/`reject`
  (`apps/api/src/routers/procurement.ts:294-344`). Compare `changes.ts`, whose
  handlers *do* read and check their `version`. The safety mechanism was built and
  then left unused. **What breaks:** see Pattern 1's procurement bullet — silent
  last-write-wins on approvals.

---

## Checked and found consistent (so you know these weren't skipped)

- **Row locks in inventory/depreciation** — correct and consistent (`.for("update")`
  at inventory.ts:354/433/453, depreciation.ts:193/289).
- **The atomic counter primitive itself** (`getNextSeq`, auto-number.ts) — correct;
  the inconsistency is purely at the JE-number call sites that bypass it.
- **ITSM sweeps** (escalation, correlation) — per-item isolation correct.
- **Optimistic version guard in Changes** (changes.ts approve/reject) — a correct,
  clean reference implementation others can copy.
- **Transactional money writes** (accounting balance apply, invoice-journal,
  inventory adjust) — correctly atomic.

## Candidate deliberately NOT reported

- **Money rounding (`round2` vs `.toFixed(2)`).** `round2` (accounting.ts:775,
  quote-tax.ts:180) is used for money math; the `.toFixed(2)` occurrences are mostly
  display strings and hours-worked, not competing money arithmetic on the same value.
  There is no single value computed two disagreeing ways, so no concrete failure can
  be stated — excluded per the sweep's evidence rule.

---

## Recommended order of work (by blast radius, not count)

1. **Accounting `journal.post` double-count** (accounting.ts:327-356) — silent
   ledger corruption. Copy the `.for("update")` lock from inventory.ts, or add a
   version/status guard like changes.ts.
2. **Seven JE-number row-count sites** — swap to `getNextSeq`. Duplicate ledger
   numbers under concurrency; one shared primitive already exists.
3. **DPDP sweep per-item isolation** (dpdp-sweeps.ts) — wrap each loop body in
   try/catch like correlationWorkflow.ts; regulatory-deadline exposure.
4. **Procurement approve/reject** (procurement.ts:294-344) — use the existing
   `version` column like changes.ts; approvals-integrity.
5. **Leave approve/reject** (hr.ts:663-676, 740-758) — add the lock/guard on approve;
   wrap reject's two writes in a transaction and add `orgId` to the write filter.
6. **Expense `deleteItem`/add-item** (expenses.ts:215-248) — wrap the delete/recompute/
   update in a transaction.
