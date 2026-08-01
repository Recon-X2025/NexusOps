# Pilot Triage — Every Finding into A / B / C

_Written 2026-07-31. Triages `reports/audit-summary.md` (16 audits + 8 sweeps)
against the pilot reality: **one customer, three months, isolated instance, no
production data today.** No code was changed._

## The lens I used

The pilot is a single tenant on its own box, so I weighted differently than the
summary did:

- **Cross-tenant isolation is theoretical with one customer.** There is no second
  tenant to leak to. So most of root-cause #5 drops out of "blocking" — *unless*
  the same bug also corrupts the one customer's own data, or the structural fix
  (a database wall, a shared guard) is cheap to land now and expensive to
  retrofit onto live data later.
- **Wrong money and wrong statutory filings are still bucket A even with one
  customer**, because they write durable, hard-to-unwind records into that
  customer's real books and real government returns. That is exactly "more
  expensive once a customer has live data."
- **A feature that stops the customer operating at all is bucket A**, even though
  it is a build not a bug — the customer can't run their business without it.
- **A defect a single, watched customer can route around** (a wrong dashboard
  number, a manual workaround, a race that needs concurrency they won't generate)
  is bucket B.
- **Latent, no-output-today, or scale-only** issues are bucket C with a revisit
  trigger — the pilot is where you'd *watch* for them, not fix them.

Root-cause clusters are numbered as in the summary: **#1** wrong destination /
false "done"; **#2** read-then-write races; **#3** mismatched-text comparison;
**#4** consumer-without-producer; **#5** unchecked ownership. Supporting themes
and the sound list follow.

---

## Bucket A — PILOT BLOCKING

Wrong money, wrong filings, the customer's own data corrupted, a feature that
blocks operating at all, or a structural fix that gets much dearer once live data
exists.

| # | Finding | Cluster | One-line reason |
|---|---------|---------|-----------------|
| A1 | GST charges IGST on local sales (state code "27" ≠ name "Maharashtra") | #3 | Every wizard-onboarded invoice files the wrong tax with the government — durable, hard to unwind. |
| A2 | Journal post can double-count (read-then-write, no lock) | #2 | Silently corrupts the customer's real ledger; a wrong ledger found months in is the worst unwind. |
| A3 | DPDP breach/erasure notices go to internal inbox, marked "sent" | #1 | Manufactures false statutory-compliance evidence in the customer's real record. |
| A4 | "Right to be forgotten" closes as fulfilled without erasing the data | #1 | A real DSR from a real data principal is answered falsely; legal exposure on live data. |
| A5 | Approvals inbox has no create path — approval gate is inert | #4 | Money/access approvals the customer relies on never fire; can't operate governance at all. |
| A6 | Custom roles cannot be saved (7 UI actions vs 5 DB values) | #4 | Customer cannot set up who-can-do-what — blocks standing up the org at all. |
| A7 | Invoice line items only ever written in tests | #4 | Real invoices carry no line detail; GST rate-grouping/returns run on absent data. |
| A8 | India statutory challans (TDS/ESI/PF/PT) have no create path | #4 | Customer cannot generate the statutory filings the product promises — can't operate compliance. |
| A9 | Goods receipt can't be recorded → 3-way match silently 2-way | #4 | Procurement is in the pilot: the customer can't close the receive step, so the receiving control can't run at all. |
| A10 | 3-way match compares tax-inclusive vs tax-exclusive | #3 | Every GST-bearing invoice fails the receiving control — the control is unusable, not just wrong once. |
| A11 | Three tenant tables have no RLS wall (shift/ESI/PT) + no test that every table is walled | #5 | Structural: add the wall now while it's a migration on empty data; retrofitting onto live data + the drift-detecting test is the cheap-now/dear-later case. |
| A12 | Net-pay floor discards wage recovery, and a test blesses it | #2/#4 | Latent payroll-money error on the customer's real payroll; the blessing test must be fixed with it. |

**Why A11 is here despite one tenant:** it is the one item where the *fix* (a
hand-written migration enabling the database wall on three tables, plus a test
asserting every table is walled) is far cheaper to land on an empty instance than
after the customer has data and other tables have accreted. It is the cluster-#5
exception to the rule below.

**Why A12 is here:** the net-pay floor can't be reached through today's UI, but
payroll writes durable money into the customer's real records, and the failure
mode (silently zeroing a recovery) is exactly the "expensive once live" shape.
Cheap to fix now; ugly to discover in a filed payroll run.

**Procurement is in the pilot — and it is the largest build in bucket A.** The
pilot customer uses procurement, so A9 (goods receipt), A10 (3-way match tax
basis) and A7 (invoice line items) stay in A: without them the customer cannot
receive goods, cannot run the matching control, and issues invoices with no line
detail. Taken together — a real goods-receipt write path, line items that persist
outside tests, and the matching fix — this is the **biggest build in the whole
plan**, larger than any single money-formula or wiring fix. It is not a bug you
patch in an afternoon; scope it as a feature, not a defect.

---

## Bucket B — FIX DURING PILOT

Real defects, but a single watched customer can work around them while we fix in
flight. Nothing here writes a wrong number the customer can't see, or the
workaround is obvious.

### Cluster #5 (ownership checks) — whole cluster is B, one reason

**All 31 unchecked-ownership write paths + the CRM/assets ownership findings + the
work-order cross-tenant write → bucket B.** With one tenant on an isolated
instance there is no second org to write across, so the cross-tenant integrity
break cannot actually occur during the pilot. It is still a real defect and the
one-shared-guard fix should land during the pilot before any second customer —
but it is not pilot-blocking. _(Exception: the missing RLS walls, A11, are pulled
up to A because the fix is structural and cheap-now.)_

### Individually bucket B

| # | Finding | Cluster | One-line reason |
|---|---------|---------|-----------------|
| B1 | First-response SLA clock never set → false breach alerts + wrong dashboards | #4 | Wrong support metric, but visible and workaround-able; a watched customer knows their real response times. |
| B2 | "Next number" is count()+1 in ~7 places (JE/EMP/EXP/PR) | #2 | Races need concurrency one pilot customer won't generate; route through the atomic counter in flight. |
| B3 | Leave approve / procurement approve-reject read-then-write, unused version column | #2 | Same concurrency caveat; low simultaneous use in a pilot. |
| B4 | Multi-step writes not transactional (leave reject etc.) incl. one wrong-org stamp | #2 | Needs a mid-write failure to bite; watch and fix. (Wrong-org stamp is inert with one tenant.) |
| B5 | Tamper-evident audit log is never run + can't detect tail-truncation | theme | The chain is being written correctly; nobody's *checking* it yet. Wire the scheduled verifier during pilot. |
| B6 | DPDP sweep fails all-or-nothing; one bad row starves the loop | theme | One tenant = one org in the loop, so "starves orgs after it" is moot now; still fix the per-item isolation. |
| B7 | Query timeout abandons but doesn't cancel; connectors have no timeout | theme | A hung portal can tie up capacity; watch on an isolated box, bound the fetches in flight. |
| B8 | Two admin surfaces / one privilege: REST ignores MAC kill-switch, returns raw PAN/TAN, thin audit | theme | Super-admin is operator-facing, not customer-facing; tighten during pilot before wider exposure. |
| B9 | Cached identity: deactivate/reset-password doesn't end sessions (~30d / 5min) | theme | Real, but a watched single customer controls its own user set; fix session invalidation in flight. |
| B10 | API-key prefix mismatch + api_keys.permissions ignored (inherits creator role) | #4/theme | Over-broad keys, but issued and held by the one customer; fix before multi-tenant. |
| B11 | Impersonation mints a token nothing consumes | #4 | A dead super-admin convenience feature; no customer workflow depends on it. |
| B12 | False "idempotent"/"locked" comments → double emails on retry | theme | Annoying (duplicate mail), not data-wrong; fix the notifier + the comments. |
| B13 | Fail-open `/internal/*` when token unset (trusts Docker net) | theme | Isolated instance shrinks blast radius; set the token + fail-closed during pilot. |
| B14 | Legacy CBC secrets readable with no re-wrap; decrypt-fail reads as "not connected" | theme | Only bites on key rotation / pre-KMS rows; unlikely in a fresh pilot instance. |
| B15 | Plaintext SSO OAuth tokens in `accounts` (bypass the KMS vault) | #1 | Same "unencrypted at rest" shape as the PAN finding already in A, same code area, same vault — cheap now while the table holds test accounts, a migration once it holds a real directory. Not blocking, but land it in the same pass, don't wait for a trigger. |

---

## Bucket C — ACCEPTED (add to quality-bar.md accepted-debt, with revisit trigger)

Not worth fixing for the pilot. Each gets a reason and a trigger that should pull
it back onto the board.

| # | Finding | Cluster | Reason not now | Revisit trigger |
|---|---------|---------|----------------|-----------------|
| C1 | Depreciation engine has no UI caller | #4 | Engine is correct; pilot can trigger via API/ops if needed. | Customer needs self-serve depreciation, or before GA. |
| C2 | Custom SLA policies: read/matched, never created | #4 | Falls back to priority-based SLA; acceptable default. | A pilot customer asks for custom SLA tiers. |
| C3 | GRC controls & audit findings: no creation path | #4 | GRC not in the pilot's core operating loop. | GRC/compliance module enters scope. |
| C4 | Workflow step-run history never written | #4 | Cosmetic — run detail shows no step history. | Customer relies on step-level audit of workflows. |
| C5 | DPDP consent-expiry unreachable (form omits expiry date) | #4 | Server accepts expiry; add the field when consent-expiry is exercised. | Consent-expiry automation is put into use. |
| C6 | Phantom columns: reopenCount, notHelpfulCount, residual-risk | #4 | Report-only fields with no consequence; no wrong money. | Any of these numbers becomes a decision input. |
| C7 | Fabricated GSP portal domains (`*-suvidha.in`), HSN 9983 placeholder | #1 | Outbound portal filing is out of pilot scope (filings done manually/via ClearTax). | Direct EPFO/ESI/PT/MCA21/NIC filing is switched on. |
| C8 | Financial year hardwired April–March; wizard default state | #3 | Correct for an India pilot customer; only wrong for a non-standard FY. | A customer on a non-April FY, or non-default state onboards. |
| C9 | DPDP/other sweeps load whole-table into memory (unbounded selects) | theme | Scale-only; a 3-month pilot won't accumulate the history. | Tenant history grows large, or before multi-tenant scale. |
| C10 | Pool monitor mis-labels "busy" as "exhaustion"; no observability tests; URL query-string in logs | theme | Diagnostics quality; isolated instance is closely watched anyway. | Before GA / when scaling past the pilot box. |
| C11 | Ticket transition guard fails-open on unknown status (latent) | theme | Not reachable — status is enum-constrained today. | Custom ticket statuses ship. |
| C12 | CRM `weightedValue` formula drift + untested | #2 | Coincidental default makes output correct today; no wrong number reaches a user. | Convert path accepts a probability, or the default changes. |

---

## Bucket counts

- **A — Pilot blocking: 12** (A1–A12)
- **B — Fix during pilot: 15 individual (B1–B15) + the whole ownership cluster #5** (31 ownership paths + CRM/assets ownership, triaged as one)
- **C — Accepted: 12** (C1–C12)

The A bucket is deliberately short. Read it back: it is *only* wrong money (A1,
A2, A12), false statutory records on real data (A3, A4), the features without
which the customer literally cannot operate — approvals, roles, invoices,
challans, receiving (A5–A10) — and the single structural isolation fix that is
cheap now and dear later (A11). Nothing is in A merely because it is untidy. If A
had ballooned past ~15, the bar would have slipped from "safe" to "perfect."

---

## What was genuinely hard to place

1. **The RLS-wall gap (A11) vs the rest of cluster #5 (all B).** This is the one
   place I split a root cause across buckets, so it deserves the most scrutiny.
   Cross-tenant leakage is impossible with one tenant, which argues B. I put the
   *wall* in A anyway because the fix is a schema migration + a whole-table test
   that is genuinely cheap on an empty instance and genuinely annoying to retrofit
   once the customer has data and more tables exist — it meets the "substantially
   more expensive once live" test on the *fix* side rather than the *harm* side.
   The 31 app-level ownership checks don't have that property (they're ordinary
   code edits any time), so they stayed in B. Reasonable people could pull A11 down
   to B; I wouldn't move the others up.

2. **Plaintext SSO tokens (now B15).** I first put these in C, reasoning the tokens
   are never read back and the box is single-tenant, so the plaintext is inert for
   the pilot. Corrected to **B**: they are the same "unencrypted at rest" shape as
   the PAN finding already in A, in the same code area and the same KMS vault. It is
   cheap to encrypt now while the `accounts` table holds only test accounts, and a
   data migration once it holds a real directory — so it should land in the same
   encryption pass as the PAN work rather than waiting for a trigger. Not
   pilot-blocking (nothing reads the tokens yet, so no live exposure), but not
   "accept and forget" either.

3. **The net-pay floor (A12).** It is unreachable through today's UI (which argues
   C, like other latent items) but it sits on the payroll money path and a test
   actively blesses the wrong behaviour. I judged "durable money on real payroll +
   a test locking in the bug" heavier than "not reachable yet," because payroll is
   the thing the pilot customer will definitely run, and the blessing test means it
   won't get caught later. Placed in A; the honest alternative is B.

4. **First-response SLA (B1) vs the operating-blocker features in A.** It is a
   cluster-#4 "consumer without producer" like approvals and challans, which are in
   A. The difference: a wrong SLA dashboard is *visible* and a single watched
   customer can reconcile against reality, whereas you cannot run approvals or
   generate a challan at all. So B1 is B and the others are A — the line within
   cluster #4 is "wrong number you can see" (B) vs "cannot do the thing" (A).

5. **Goods receipt + 3-way match (A9/A10) + invoice line items (A7).** I had
   hedged that these might drop to B if procurement were out of scope. **That hedge
   is resolved: procurement IS in the pilot** — the customer uses it — so all three
   stay firmly in A. Together they are the largest build in bucket A (a real
   goods-receipt write path, persisted invoice line items, and the matching-basis
   fix), and should be scoped as a feature rather than a defect patch.

6. **The pervasive "tests bless the bug" habit.** It isn't a single finding so it
   isn't a row, but it's the reason nearly every A item can silently regress. I did
   not bucket it; I'd treat "fix the test alongside the fix" as a standing rule on
   every A and B item rather than a line of its own.

---

_No source files were modified. Bucket-C items are proposed for the accepted-debt
register in `docs/quality-bar.md` with the triggers above; adding them is a
separate step._
