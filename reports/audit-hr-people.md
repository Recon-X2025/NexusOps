# Audit — HR / People

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing code, not a diff._

Scope: employee lifecycle, payroll compute + statutory deductions, attendance →
LOP, leave (requests / accrual / carry-forward / encashment), gratuity,
performance/OKR, recruitment, expenses. Files: `apps/api/src/routers/hr.ts`,
`payroll.ts`, `leave-accrual.ts`, `gratuity.ts`, `performance.ts`,
`recruitment.ts`; `apps/api/src/lib/payroll-cycle.ts` →
`packages/payroll-math/src/payroll-cycle.ts`; `apps/api/src/services/payroll-run-aggregates.ts`;
`apps/api/src/lib/india/attendance-lop.ts`, `bank-file-generator.ts`;
`packages/db/src/schema/hr.ts`.

---

## 1. In plain English

The part of the system that actually moves money for people — the monthly
payroll run, the tax and PF/ESI deductions, and the bank-payment file — is in
good shape. The India statutory maths is careful, the run is transactional, the
bank export sends every employee (it does not silently cut the list at 200), and
approvals need three different people to sign off. Nothing here is losing money
or leaking one company's staff to another today.

There is one thing worth fixing before it bites. The payroll code contains the
exact line the quality bar warns about: when someone's deductions are bigger
than their pay for a month, the shortfall is quietly set to zero and forgotten
instead of being carried into next month as money the employee still owes. Right
now this line **cannot actually be triggered** — the system has no "salary
advance" or "loan repayment" feature to feed it — so no one is being shortchanged
yet. But the plumbing to add that feature is half-built (there's a "wire this up"
note sitting right next to it), and there's even a test that stamps the current
zero-out behaviour as "correct". So the day someone adds loan recovery, money
will vanish and the test will wave it through. Fixing the floor and the test
*now*, while it's harmless, is far cheaper than after the first real advance.

The rest is minor: a couple of ID-number generators (employee number, expense
number) can collide if two people click "create" at the same instant — the
database blocks the duplicate, so nothing corrupts, but one of the two clicks
fails with a confusing error. And a few internal list screens (attendance, HR
cases, OKRs) have no page limit, so they'll get slow for a big company. None of
that is dangerous.

**Fix first:** the net-pay floor + the test that blesses it
(`payroll-cycle.ts:314`, `money-invariants.test.ts:197`) — it is a
money-corruption BLOCKER lying dormant one feature-flag away from going live.

---

## 2. Verdict

Healthy for what is wired. The money paths that run today — statutory
computation, LOP-driven gross reduction, the transactional payroll run, the bank
file, gratuity/leave accrual maths — are correct and tenant-scoped, and the
one boundary that actually reduces pay (attendance → LOP) is defensively written
(org-scoped, clamped, missing rows treated as paid). The subsystem's real risk is
latent, not live: a BLOCKER-class floor that no current input can reach, plus the
familiar `count()+1` numbering race seen elsewhere in the tree. No BLOCKER is
exploitable against the running system, so the headline is downgraded to HIGH —
but it is a HIGH that becomes a BLOCKER on the next planned feature.

---

## 3. Findings

### HIGH

**H-1 — Net-pay floor discards wage recovery, and a test blesses it. Latent money BLOCKER.**
`packages/payroll-math/src/payroll-cycle.ts:314`
```ts
const netPay = Math.max(0, grossEarnings - totalDeductions);
```
`totalDeductions` (line 309–312) = statutory + monthly TDS + `emp.otherDeductions`.
`otherDeductions` is the field a salary advance / loan repayment would flow
through. When a recovery pushes deductions above gross for a month, the `max(0, …)`
floor sets net pay to zero and the excess **vanishes** — it is not carried to the
next cycle and not recorded as an outstanding employee balance. That is precisely
the case the quality bar (#3) defines as a BLOCKER: _"a shortfall that is silently
dropped at the `max(0, …)` floor."_

Concrete failure scenario: employee gross ₹40,000, a ₹50,000 advance-recovery is
placed in `otherDeductions`. Deductions ₹50,000 > gross ₹40,000 → `netPay = max(0,
-10,000) = 0`. The ₹10,000 the employee still owes is gone; next month starts
clean; the ledger never knew about it. The company under-recovers ₹10,000 per such
employee, permanently and silently.

**Why HIGH, not BLOCKER-today:** every wired producer of the payroll input hard-codes
`otherDeductions: 0` — `payroll-run-aggregates.ts:83`, `payroll.ts:172`,
`http/payroll-payslip-pdf.ts:68` — there is **no** salary-advance / loan schema in
`packages/db/src/schema`, and no tRPC input sets a non-zero recovery (grep: zero
hits). So the corrupting input is currently **unreachable** through the running
system; no employee can be shortchanged today. It is HIGH because the mechanism is
already shipped and the intent to feed it is explicit: `payroll-run-aggregates.ts:66-67`
carries `TODO(compliance): Wire up actual employee tax declarations intake table`,
and the same builder is the natural home for advance/loan recovery. The first
person to wire recovery into `otherDeductions` turns this into a live money BLOCKER
with no further code change.

**And the test locks the wrong behaviour in.** `apps/api/src/__tests__/money-invariants.test.ts:197`:
```ts
expect(p.netPay).toBe(Math.max(0, p.grossEarnings - p.totalDeductions));
```
This asserts the _implementation_ (the floor), not the _requirement_ (carry the
shortfall forward). It never constructs a case where `totalDeductions > gross` from
a recovery, so it would still pass with the correct carry-forward logic in place —
and it would pass unchanged after the floor silently eats real money. Per the
quality-bar Tests rule ("a test that would still pass with the logic inverted is a
finding") this test is itself a finding: it converts a future money-corruption bug
into a green build.

_What this means in practice:_ money is safe this instant, but the trap is armed
and the safety net (the test) is pointing the wrong way. Fix both while it costs
nothing.

---

### MEDIUM

**M-1 — Auto-numbering (`EMP-`, `EXP-`) uses `count()+1`; concurrent creates collide.**
`apps/api/src/routers/hr.ts:311-317` (employee number) and `hr.ts:2093-2097`
(expense number):
```ts
const [c] = await db.select({ n: dbCount() }).from(expenseClaims).where(dbEq(expenseClaims.orgId, org!.id));
const seq = (c?.n ?? 0) + 1;
const number = "EXP-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
```
Both targets carry a unique index — `employees_org_employee_id_idx` on
`(orgId, employeeId)` (`schema/hr.ts:164`) and `expense_claims_number_org_idx` on
`(orgId, number)` (`schema/hr.ts:792`). Two concurrent creates in one org read the
same `count()`, compute the same `seq`, build the same number; the second `INSERT`
hits the unique index and fails with a Postgres `23505`.

Concrete failure scenario: HR bulk-imports staff via two parallel API calls, or two
recruiters file expenses simultaneously — both read count = 240, both build
`EMP-0241` / `EXP-2026-0241`, the loser's request 500s. **Because the unique index
holds, no duplicate is ever written and nothing corrupts** — the harm is a failed,
dropped operation and a confusing error, not bad data. This is the identical pattern
already logged as M-1 in the assets-procurement-inventory audit (JE numbering) and in
the `REQ-` requisition generator (`recruitment.ts`, same shape). MEDIUM: correct
today under single-writer UI use, fragile under any concurrency or import.

**M-2 — Unbounded UI list paths (attendance, HR cases, OKR, leave).**
`hr.ts:1651-1668` (`attendance.list`), `hr.ts:382-400` (`cases.list`),
`hr.ts:591-605` (`leave.list`), `hr.ts:2333-2352` (`okr.listObjectives`),
`hr.ts:2432-2463` (`okr.cascade`). None accept or apply a `limit`/`offset`;
`attendance.list` returns every matching row ordered by date.

Concrete failure scenario: a 2,000-employee org opens the attendance screen for a
month → ~44,000 rows (2,000 × 22 working days) serialised in one response; the OKR
cascade builds the entire objective forest in memory. Latency climbs past the 500ms
`SLOW_REQUEST` bar; large orgs risk timeouts.

Per quality-bar rule #7 these are **UI-list paths, not export/report/filing/aggregate
paths**, so silent truncation is not a concern here — the concern is the _opposite_:
the 200-row UI cap that rule #7 wants on paged lists is simply **absent**. This is not
a BLOCKER (no data is dropped from a filing); it is a MEDIUM performance/fragility item.
The genuinely export-shaped paths were checked and are correct: `exportBankFile`
(`payroll.ts:869-873`) selects **all** payslips for the run with no cap — the right
behaviour for a disbursement file — and it surfaces skipped rows explicitly
(`bank-file-generator.ts:98-114`, returned at `payroll.ts:913`) rather than dropping
them silently.

---

### LOW

**L-1 — Leave-year attribution keys off `startDate` only.**
`hr.ts:687-695` (`leave.approve`): the balance move filters
`leaveBalances.year = request.startDate.getFullYear()`. A leave that starts
31-Dec and ends 02-Jan books all its used-days against the start year's balance.

Concrete failure scenario: a 3-day leave spanning the new year draws 3 days from
the prior year's balance even though 2 of them fall in the new year. It is a
balance-attribution edge case at year boundaries, not a money or isolation error
(payroll LOP still reflects the actual dates via the attendance reflex, which is
correct). LOW: real but narrow, and only visible in the leave-balance ledger.

---

## 4. Root causes

1. **A money-corruption guard was written as a clamp, not a carry-forward, and
   then frozen by an implementation-shaped test.** H-1 is not an oversight in one
   line — it is the floor (`max(0,…)`) plus a test that asserts the floor is
   correct. The pair means the requirement (recover the shortfall next cycle) was
   never encoded anywhere: not in the code, not in the schema (no advance/loan
   table), not in the test. This is the classic generated-code failure mode: the
   happy path (deductions ≤ gross) is the only path anyone modelled, and the test
   documents that assumption as truth. It is harmless only by the accident that the
   feeding feature isn't built yet.

2. **Org-scoped sequence numbers are derived by counting rows instead of reserving
   a value.** M-1 recurs across the whole tree (JE, EMP, EXP, REQ) because the same
   `count()+1` shortcut was reached for independently each time. The unique index is
   doing the real integrity work; the numbering scheme is riding on it and paying the
   cost in dropped requests under concurrency.

3. **List endpoints were built for the demo-sized org.** M-2's missing caps come
   from writing queries against a handful of seed rows where "return everything" is
   invisible. The distinction the quality bar draws — UI list (needs a cap) vs export
   (must not have one) — was not applied per-endpoint; the export paths happen to be
   right, the UI paths happen to be uncapped.

---

## 5. Recommended order of work

Ranked by blast radius, not count.

1. **H-1 — neutralise the latent money BLOCKER now, while it is free.** Either (a)
   before any advance/loan recovery is wired into `otherDeductions`, change the floor
   so a `deductions > gross` shortfall is persisted as a carried-forward outstanding
   balance rather than dropped; or (b) at minimum, add a test that constructs
   `totalDeductions > gross` and asserts the shortfall is preserved — so the build
   goes red the moment the corrupting feature lands. Do this before shipping any
   salary-advance / loan-recovery feature. Blast radius: every employee with a
   recovery, silently, forever.

2. **M-1 — replace `count()+1` with a reserved value** (Postgres sequence or
   `INSERT … ON CONFLICT` retry) at the four numbering sites. One fix pattern, applied
   tree-wide. Blast radius: any concurrent create / bulk import in a busy org.

3. **M-2 — apply the 200-row UI cap** to `attendance.list`, `cases.list`,
   `leave.list`, `okr.listObjectives`, `okr.cascade`. Blast radius: page latency and
   timeouts for large orgs.

4. **L-1 — split leave-year attribution across the year boundary** when a request
   spans it. Blast radius: a handful of year-boundary leaves per org.

---

## Notes on accepted debt (checked, not re-reported)

- **Gratuity / leave accrual** (`quality-bar.md:230`, "accrual works; encashment +
  carry-forward rules incomplete"): verified still accurate. `gratuity.ts` accrual +
  `leave-accrual.ts` accrual/carry-forward/encashment are wired, idempotent, and
  driven monthly/yearly by `hrPeriodicWorkflow`; the maths lives in
  `payroll-math`. Not re-reported.
- **Payroll → GL posting is absent** (grep for `journalEntries` in `payroll.ts`:
  zero hits), whereas depreciation and inventory _do_ post balanced journals. This
  is a **missing** loop (salary/PF/ESI/TDS liabilities never hit the ledger), and it
  is consistent with the tracked "Balance sheet — not computed" debt
  (`quality-bar.md:228`). Because it is a missing feature rather than incorrect
  behaviour on a wired input — and it sits under the accepted Finance-computation gap
  — it is **not** raised as a fresh finding here. Flagging for the finance/gst audit
  to own end to end.
- **Section 80C/80D et al. hard-coded to 0** (`payroll-run-aggregates.ts:66-73`):
  self-declared TODO; over-deducts TDS under the OLD regime. Tracked-debt-adjacent
  (declarations intake unbuilt); not a correctness bug on the inputs the system can
  currently produce. Not raised.
