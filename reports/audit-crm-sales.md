# CRM / Sales — Quality Audit

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._
_Scope: leads, accounts, contacts, deals, lead scoring, lead→deal conversion, CPQ quote/GST._

---

## 1. In plain English

The CRM is in good shape. The three things that were previously flagged as
half-built — **lead scoring** (a lead's "how promising is this?" number),
**lead-to-deal conversion** (turning a raw enquiry into a live sales
opportunity without losing the company/person behind it), and **quote tax**
(putting the correct Indian GST on a price quote) — have all been finished and
are working correctly. The tax maths in particular is careful and well tested:
it splits GST the right way for in-state vs out-of-state buyers, applies
discounts before tax, and handles a quote that mixes different tax rates.

There is **one thing worth fixing**, and it is a tenant-safety gap rather than
a maths error: when someone creates a contact, a deal, or an activity, the
system does **not check that the account/contact it is being attached to
actually belongs to their own company**. In a shared, multi-company platform,
a user who knows or guesses another company's internal ID could attach their
own record to that foreign account. Importantly, this does **not** let them
*read* the other company's data — every screen still only shows their own — so
it is a "you can point a finger at someone else's record" bug, not a data
leak. But it quietly breaks the wall between tenants and should be closed.

Nothing here risks losing money or corrupting the books. The GST engine is
shared with the finance module and behaves consistently. Fix the ownership
check first; everything else is minor.

---

## 2. Verdict

Healthy subsystem. The previously-tracked CRM gaps (scoring stub, lossy
conversion, no CPQ tax) have genuinely shipped and are correct — the
"accepted debt" list in `docs/quality-bar.md` is now **stale** on those two
lines and should be struck. The GST computation is per-line, correctly
rounded, and covered by exact-value tests that would fail if the logic were
inverted. The single real weakness is the absence of same-org validation on
foreign-key inputs (`accountId`/`contactId`/`dealId`) across the CRM write
procedures — correct-but-fragile tenant isolation. One latent formula
inconsistency (`weightedValue`) exists but produces no wrong output today.

Findings: **0 BLOCKER · 0 HIGH · 1 MEDIUM · 2 LOW.**

---

## 3. Findings

### MEDIUM

#### M-1 — CRM writes accept foreign-org `accountId`/`contactId`/`dealId` without an ownership check

**Where:**
- `apps/api/src/routers/crm/contacts.ts:42` — `create` inserts with the
  supplied `accountId` unchecked:
  ```ts
  const [contact] = await db.insert(crmContacts).values({ orgId: org!.id, ...input }).returning();
  ```
- `apps/api/src/routers/crm/index.ts:152` — legacy `createContact`, same pattern.
- `apps/api/src/routers/crm/deals.ts:127-130` — `create` spreads `...input`
  (carrying `accountId`/`contactId`) with no pre-validation.
- `apps/api/src/routers/crm/index.ts:384-390` — `createActivity` inserts
  `dealId`/`accountId`/`contactId` unchecked.

The FK columns reference the parent table by id only, with no org predicate:
`packages/db/src/schema/crm.ts:108` (`crm_contacts.account_id → crm_accounts.id`,
`onDelete: "set null"`). Postgres FK integrity checks run **outside** the
caller's row-level-security policy, so the RLS layer
(`apps/api/src/lib/trpc.ts:540`, `set local role app_runtime`) does **not**
stop the insert — the FK check finds the foreign-org account and permits it.

**Concrete failure scenario:** User in Org A calls
`crm.contacts.create({ firstName, lastName, accountId: "<UUID of an Org B account>" })`.
The contact is created stamped `orgId = A` but its `accountId` points at Org
B's account. No error is raised. The row now straddles two tenants: it is
owned by A (so A's `contacts.list` shows it) but references B's account. The
same works for `deals.create` (`accountId`/`contactId`) and `createActivity`
(`dealId`).

**What this means in practice:** The tenant wall is not enforced on links. A
user cannot *see* another company's data (all reads filter by `orgId`, and
`crm.accounts.get` returns NOT_FOUND for a foreign account, so the UI shows a
broken/empty account panel rather than leaking it) — but they can create
records that *reference* another tenant's rows. That is a silent
cross-tenant-integrity break: it corrupts referential meaning, can skew a
foreign org's `onDelete: set null` cascade behaviour, and is exactly the class
of boundary erosion the quality bar's tenancy rule (#1/#2) exists to prevent.
It requires knowing/guessing a target UUID and yields no readable data, which
is why this is MEDIUM rather than a BLOCKER — but it should be closed with an
existence-and-org check on every supplied parent id.

_Note: the `crm.leads.convert` path is **not** affected — it derives
`accountId`/`contactId` internally via an org-scoped upsert
(`lib/crm/lead-convert.ts:64-125`), never from raw client input._

---

### LOW

#### L-1 — `weightedValue` formula drifts between the convert path and the deal path

**Where:** `apps/api/src/lib/crm/lead-convert.ts:137`
```ts
weightedValue: dealValue ? String(Number(dealValue) * 0.1) : undefined,
```
versus the canonical formula used everywhere else — `deals.ts:125-126`,
`deals.ts:173`, `index.ts:200`, `index.ts:307`, `ingest.ts:240` — which is
`value * (probability / 100)`.

**Concrete failure scenario:** A converted deal is inserted with a hardcoded
10% weight. Today this happens to match the schema default
`probability = 10` (`packages/db/src/schema/crm.ts:137`), so `value * 0.1`
equals `value * (10/100)` and the displayed forecast on the deal page
(`apps/web/.../crm/deals/[id]/page.tsx:217`) is internally consistent. The
drift only becomes visible if the convert path is ever changed to accept a
probability, or if someone reads `weightedValue` before the deal's first
`update` (which re-derives it correctly). No wrong number reaches a user
today.

**What this means in practice:** A duplicated, divergent copy of a money
formula. It is dormant now because a coincidental default masks it, but it is
a landmine for the next change to the conversion inputs — the two formulas
will silently disagree. Consolidate onto the single `value × probability`
expression.

#### L-2 — `weightedValue` (the deal forecast figure) has no test on any path

**Where:** all four write paths compute `weightedValue`
(`deals.ts:125,173`; `index.ts:200,307`) but no spec asserts it.
`crm_fix.test.ts:37-44` creates a deal with `value: "100000", probability: 50`
and checks only the title; `crm-lead-convert.test.ts` asserts
`accountId`/`contactId` but never the deal's `weightedValue` or `probability`.

**Concrete failure scenario:** If someone inverted the formula to
`value * probability` (dropping `/100`), every test still passes — a
₹100,000 deal at 50% would store ₹5,000,000 as its weighted forecast and no
test would catch it. Per the quality bar's Tests rule ("a test that would
still pass with the logic inverted is a finding"), this is an untested money
output.

**What this means in practice:** The pipeline-forecast number shown to sales
leadership is computed but unguarded. A one-character regression in the
weighting maths would ship green. Add a single assertion on `weightedValue`
to any deal-create test.

---

## 4. Root causes

1. **Tenant isolation is enforced on the *owning* row but not on *referenced*
   rows.** Every CRM procedure correctly stamps `orgId` on insert and filters
   `orgId` on read, so the author's mental model ("scope by org") is applied
   to the record being written — but never to the parent ids that record
   points at. Because RLS does not cover FK integrity checks, nothing else
   catches it. This is the single decision behind M-1 and would be fixed once,
   centrally, by validating every inbound parent id against the caller's org
   before the insert.

2. **The same money formula was re-typed in six places instead of shared.**
   `weightedValue = value × probability / 100` is copy-pasted across
   `deals.ts`, `index.ts`, and `ingest.ts`, and the conversion path typed a
   *seventh* variant (`× 0.1`) that happens to agree with the default. A
   single `computeWeightedValue()` helper would have made L-1 impossible and
   given L-2 an obvious unit to test.

3. **Tests assert the shipped features' happy paths but not their money
   outputs.** The G5/G6/G7 suites are genuinely strong on scoring and GST
   (exact values, both router paths, inversion-proof), but the deal
   `weightedValue` — the one CRM figure that never got a dedicated feature
   sprint — slipped through with zero coverage.

---

## 5. Recommended order of work (by blast radius)

1. **M-1 — add same-org validation for `accountId`/`contactId`/`dealId` on
   every CRM write** (`contacts.create`/`createContact`, `deals.create`,
   `createActivity`). One shared guard that selects the parent id `WHERE id = ?
   AND org_id = ?` and throws NOT_FOUND on miss. Closes the tenant-boundary
   erosion. Highest blast radius (multi-tenant integrity) despite no read-leak.
2. **L-1 — collapse the `weightedValue` formula to one shared helper** and
   route the convert path through it. Removes the latent divergence.
3. **L-2 — assert `weightedValue` in a deal-create test.** Cheap; turns the
   forecast maths from unguarded to inversion-proof.

Housekeeping (not a code finding): update `docs/quality-bar.md:232-233` — the
"CRM lead scoring (stub)" and "CRM lead→deal conversion (lossy)" accepted-debt
lines are **stale**. Both shipped (G5/G6/G7, `docs/GAP_ANALYSIS.md:68`) and are
correct; leaving them listed will cause future audits to under-scrutinise
working code.

---

_No source files were modified. No finding above MEDIUM. The GST/CPQ money
path, lead scoring, and lossless conversion were examined closely and found
correct._
