# Audit Summary — What the 24 Reviews Found, and Why

_Written 2026-07-31. This rolls up 16 subsystem audits and 8 pattern sweeps
(reports in this folder) into one plain-English picture. It is written for a
reader who is not a developer. No code was changed to produce it._

---

## How to read this

The two dozen reviews between them list roughly seventy separate problems. That
sounds overwhelming, and if you read them subsystem by subsystem it is. But the
striking thing is how **few underlying mistakes** actually produced all of them.
Almost every finding is one of **five recurring root causes** wearing a different
costume. Fix the five habits and the long list mostly collapses.

So this document is organised by **cause, not by subsystem**. For each cause you
get: what it is in plain terms, where it shows up (so you can see it is the same
mistake repeating), why it gets more expensive the moment real customers arrive,
and what it would take to close.

At the end there is a deliberately separate section — **"What is genuinely
sound"** — so you know which parts are well built and should be left alone. That
list is longer than you might expect. The platform's *foundations* are good; the
failures are concentrated and repetitive.

A word on severity language used throughout:

- **BLOCKER** — the system does the wrong thing with money, data, or a legal
  duty, and records it as if it were right. These lie in durable state.
- **HIGH** — wrong behaviour a normal user will hit, without needing anything
  unusual to go wrong.
- **MEDIUM / LOW** — correct today, fragile tomorrow; or narrow-conditions-only.

And the single most important pattern behind *all* of it, which we return to at
the end: **the tests very often check what the code does, not what the
requirement demands** — so these problems ship green and re-ship green.

---

## The five root causes, ranked by "fix this first"

The ranking is **not** by how many findings each cause produced. It is by **how
expensive the damage becomes once real customers are live** — because a wrong
number that sits quietly in a tax filing or a ledger for six months costs far
more than a screen that visibly fails on day one. Silent-and-financial beats
loud-and-cosmetic every time.

| Rank | Root cause | Worst outcome | Why it ranks here |
|------|-----------|---------------|-------------------|
| 1 | Completed action wired to the wrong destination | False proof a legal duty was done | Silent; forges compliance evidence |
| 2 | Read-then-write with no lock or version guard | Ledger silently double-counts | Silent; corrupts money |
| 3 | "Same/different" decided by comparing mismatched text | Wrong tax on every ordinary invoice | Silent; wrong government filings |
| 4 | The consumer was built, the producer never was | Whole features are inert or wrongly alarmed | Half-visible; erodes trust in the numbers |
| 5 | Ownership of referenced records is never checked | One tenant can write across the wall | Silent; multi-tenant integrity |

Everything below expands these, then covers the smaller supporting themes.

---

### Root cause #1 — A finished action pointed at the wrong destination, and stamped "done" regardless

**In plain terms:** the machinery to *do* something — send a notice, erase a
record, store a secret — was fully built and runs. But it was pointed at a
placeholder target that nobody ever replaced with the real one, and the record is
marked "success" no matter where it actually went. Because the status says
"done," the mistake is invisible from the outside. This is the most dangerous
cause because it doesn't just fail — **it manufactures false evidence that it
succeeded.**

**Where it shows up (all the same shape):**

- **DPDP breach & erasure notices go to the company's own inbox, then are marked
  "sent."** When a data-breach deadline passes, the notice legally owed to
  India's Data Protection Board and to the affected individuals is emailed instead
  to two internal CoheronConnect mailboxes (`dpb-india@…`, `privacy@…`), and the
  record is stamped `sent`. In a real regulatory enquiry the company's own audit
  trail would assert it notified the regulator and the victims when nobody outside
  the building received anything.
  _(dpdp-privacy audit B-1; sweep-fabricated-constants; sweep-tenant-constants
  P-3; sweep-stale-debt #8; sweep-false-comments — and the file's own comment
  still claims it "only logs," which is now untrue.)_
- **"Right to be forgotten" deletes the request ticket, not the person's data.**
  When an erasure request is walked to "fulfilled," only the request's own
  name/email are scrubbed. The employee's HR record, their PAN, their CRM contact
  all survive — and by default the erasure is switched off entirely, yet the
  request still closes as "fulfilled."
  _(dpdp-privacy audit B-2, H-1.)_
- **Single-sign-on tokens are written to the database in plain text**, bypassing
  the encryption vault every *other* secret goes through. They happen not to be
  read back today, so it is dead plaintext rather than an active breach — but they
  are live Microsoft/Google credentials sitting unencrypted, which the quality bar
  calls a blocker.
  _(secrets-kms audit B-1.)_
- **Outbound government-portal addresses are fabricated.** Five filing connectors
  (EPFO, ESI, PT, MCA21, NIC e-way) point at invented `*-suvidha.in` domains that
  do not exist; an invoice line uses a placeholder HSN code `9983`.
  _(sweep-fabricated-constants.)_

**Reconciliation note:** the DPDP misrouting was, until this review round, listed
in the "accepted debt" register as *"not wired — skip it."* That was doubly
wrong: delivery **is** wired, just wired to the wrong place, and it was hiding
inside the one exemption that tells reviewers not to look. It has now been
escalated to a live blocker in `quality-bar.md`. This is exactly the kind of
half-seen problem that only became clear once the audits and sweeps were read
together.

**Why it gets expensive once live:** every one of these writes a durable record
asserting a legal or security duty was discharged. That is worse than an unbuilt
feature — you cannot tell it is broken by looking, and the fabricated evidence is
precisely what a regulator or a breach investigation would rely on.

**What closing it looks like:** replace the placeholder targets with real ones
(regulator address, principal lookup, the encryption vault, real portal
endpoints), and — the deeper fix — **do not advance a record to "done" until the
side effect it claims has actually happened.**

---

### Root cause #2 — Reading a value, then writing back, with nothing guarding the gap in between

**In plain terms:** the code reads a number, adds to it, and writes it back. If
two things do that at the same moment, one overwrites the other and one update
vanishes. The cure is well understood (lock the row, or check a version stamp),
and — importantly — **this codebase already uses the cure correctly in several
places.** The problem is that the same pattern is done *without* the guard in
exactly the places where it matters most: money.

**Where it shows up:**

- **Posting a journal entry can double-count, silently corrupting the ledger.**
  The "post" step reads the entry, checks it isn't already posted, then writes —
  with no lock. Two clicks (or a retry) can post the same entry twice, adding its
  amounts to account balances twice. Nothing errors. This is the single worst
  instance and the sweeps flag it as "fix first" within this cause.
  _(money-accounting audit H-2; sweep-inconsistent-patterns Pattern 1.)_
- **Every "next number" is computed as "count what exists, add one."** Journal
  entry numbers (in at least seven places), employee IDs, expense IDs, purchase
  request numbers — all count-then-add-one against a column that must be unique.
  Under concurrency two records claim the same number and one insert fails; the
  codebase already has an atomic counter (`getNextSeq`) these sites simply don't
  use.
  _(money-accounting H-1; assets audit M-1; hr audit M-1;
  sweep-inconsistent-patterns Pattern 2.)_
- **Leave approval and procurement approve/reject** read-then-write with no guard;
  procurement even has an unused `version` column sitting right there, built for
  this and never wired.
  _(sweep-inconsistent-patterns Pattern 1 & 5; hr audit.)_
- **Several multi-step writes aren't wrapped in a transaction**, so a failure
  halfway leaves the books half-updated; one of them (leave reject) also stamps
  the wrong tenant's ID on a row.
  _(sweep-inconsistent-patterns Pattern 4.)_

**Reconciliation note:** the journal double-count appears in both the
money-accounting audit and the patterns sweep. The count-then-add-one habit
appears in *four* separate reports; it is one mistake, not four. Grouping by
cause is what makes that visible — flat, it looks like unrelated bugs in unrelated
modules.

**Why it gets expensive once live:** with one user testing, races almost never
happen, so it looks fine. With hundreds of concurrent users the ledger quietly
drifts, and a wrong ledger discovered months later is enormously expensive to
unwind — you have to reconstruct which entries doubled and when.

**What closing it looks like:** route every "next number" through the existing
atomic counter, and put a row lock or version check on every read-then-write on a
money or approval path — again, copying the pattern the codebase already gets
right elsewhere.

---

### Root cause #3 — Deciding "same or different" by comparing two pieces of text that were stored in different formats

**In plain terms:** a lot of logic turns on "are these two things the same?" —
same state, same status, same tenant. The system answers by comparing text. When
the two sides were filled in by different parts of the product using different
spellings, the comparison is wrong, and because it is just a string mismatch it
fails silently.

**Where it shows up (this one directly mis-charges money):**

- **GST charges the wrong tax on ordinary local sales.** Whether a sale is
  in-state (CGST+SGST) or inter-state (IGST) is decided by comparing the seller's
  state to the buyer's state as text. But the onboarding wizard stores the
  company's own state as a **code** ("27") while vendors are stored as a **name**
  ("Maharashtra"). "27" ≠ "Maharashtra", so a local sale is taxed as inter-state
  IGST — a real wrong tax on a real invoice that flows straight into the GST
  return. Every company set up through the normal wizard is affected.
  _(gst-invoicing audit H-1, M-1; sweep-tenant-constants P-1.)_
- **The financial year is hardwired to April–March** in several places with no
  per-tenant setting, and the wizard hardcodes a default state ("KA"/"MH"). Same
  family: a constant baked in where a per-customer value belongs.
  _(sweep-tenant-constants P-2, P-5; sweep-fabricated-constants.)_
- **The three-way match compares a tax-*inclusive* invoice total against a
  tax-*exclusive* received value**, so every invoice that carries GST fails the
  "did we receive what we're paying for" check even when it is perfectly correct.
  Same root: two quantities on different bases compared as if they were the same
  basis.
  _(gst-invoicing audit H-2.)_

**Reconciliation note:** the state code-vs-name bug was seen from two angles — the
GST audit saw the *tax* consequence, the tenant-constants sweep saw the *data
entry* origin. Together they pin it to a single fix: normalise state to one
canonical key (the 2-digit GST code) at the boundary, once.

**Why it gets expensive once live:** wrong GST is filed with the tax authority on
every affected invoice, and the customer is shown the wrong tax. Unwinding
mis-filed returns after the fact means amended filings and reconciliations — a
regulatory and accounting cleanup, not a quiet code patch.

**What closing it looks like:** pick one canonical representation for each thing
being compared (state, tax basis) and convert to it at the edge, so the
comparison is always like-for-like.

---

### Root cause #4 — The reading/reporting side was built; the thing that creates the data never was

**In plain terms:** for feature after feature, the half that *reads, reports,
matches, alarms, or approves* was built, and the half that *creates the record it
operates on* was deferred and never returned to. The tables exist, the screens
exist, the alerts fire — but nothing ever fills the box they read from. Worse,
where a "create" does exist, it is often only inside test or demo code, so the
tests pass and the feature looks finished while no real user can reach it.

**Where it shows up (this is the largest cluster by count):**

- **The approvals inbox has nothing to approve.** Approve/reject buttons, the
  queue, the tables — all present. But no running code ever *files* an approval
  request (only a demo seed does). Anything described as "requires approval"
  silently never generates one, so the approval gate is inert.
  _(sweep-unreachable-features #5 — BLOCKER.)_
- **Custom roles cannot be saved.** The permissions screen offers seven actions
  (read/write/delete/admin/approve/assign/close) but the database only allows
  five different words, and only two overlap. Any realistic role fails to save
  with a generic error. This is the same "two sides authored separately, never
  reconciled" seam.
  _(sweep-unreachable-features #4; auth-rbac audit; and the earlier custom-roles
  investigation.)_
- **Goods receipt can't be recorded, so the advertised 3-way match is really a
  2-way match** for every real invoice — the goods-receipt branch is dead because
  nothing ever writes a goods receipt.
  _(assets audit H-1; gst-invoicing H-2; sweep-phantom-fields A-1/A-2;
  sweep-unreachable-features #1.)_
- **The "first response" support clock is broken.** The field that records "an
  agent replied" is *read* by breach alerts and manager dashboards but is **never
  set** — only ever cleared. So every ticket is treated as response-breached the
  moment the deadline passes, even when the agent answered in two minutes; the
  dashboards a manager would use to judge the team are simply wrong.
  _(itsm audit H-1; sweep-phantom-fields A-3; sweep-unreachable-features #2.)_
- **Invoice line items and India statutory challans (TDS/ESI/PF/PT) are only ever
  written in tests**, so GST rate-grouping and the compliance dashboards read
  empty/absent data for real orgs while their tests pass green.
  _(sweep-unreachable-features #7, #8.)_
- **Impersonation mints a token nothing consumes**, the depreciation engine has no
  screen to run it, custom SLA policies / GRC controls / workflow step-history all
  have readers but no creators, and DPDP consent expiry can never fire because the
  consent form never lets anyone set an expiry date.
  _(sweep-unreachable-features #3, #6, #9, #10, #11, #12; platform-superadmin
  audit L-1; tenant-isolation audit M-1 — the impersonation token overlaps.)_
- **"Phantom" columns** the reports read but nothing writes: a ticket's reopen
  count, "not helpful" counts on knowledge articles, residual-risk figures.
  _(sweep-phantom-fields A-4, A-5, A-6.)_

**Reconciliation note:** the goods-receipt gap alone appears in four reports
(assets, GST, phantom-fields, unreachable-features), each seeing one face of it.
The first-response clock appears in three. This cluster is where "some audits saw
only half a problem" is most true — the *reader* was flagged in one report and the
*missing writer* in another, and only reading them together shows they are the
same hole.

**Why it gets expensive once live:** these features look done in a demo and in the
test suite, so they get signed off. The gap only surfaces when a real customer
tries to use them — and by then they have been promised and priced as working.
Approvals in particular is a governance hole: money and access decisions that
staff believe are gated aren't.

**What closing it looks like:** for each, add the missing create/trigger path and
move the inserts out of test/seed code into a real user path. The durable fix is a
discipline one: a feature isn't "done" when it can be read, only when a real user
can create the thing it reads.

---

### Root cause #5 — Trusting an ID the caller handed you without checking they own it

**In plain terms:** the platform is multi-tenant — many companies share one
database, kept apart by an "org" stamp on every row and a database-level second
wall. When a request supplies the ID of a *related* record (attach this contact to
that account), the code stamps the caller's own org correctly but never checks
that the *referenced* record also belongs to them. The database's second wall
doesn't catch this, because the foreign-key check it relies on runs outside that
wall.

**Where it shows up:**

- **Thirty-one write paths accept a caller-supplied related-record ID with no
  ownership check** — CRM, procurement, accounting (including per-line account IDs
  on a journal entry, a money path), assets, ITSM, projects, HR, legal. The habit
  is a convenient one-liner (`{ orgId: mine, ...whatever the caller sent }`) that
  spreads the caller's input straight into the insert.
  _(sweep-ownership-checks — 31 findings; crm audit M-1; assets audit M-2.)_
- **The worst single case writes across tenants with no org scoping at all** — a
  work-order task update keyed on the task ID only, so it can edit another
  company's task.
  _(sweep-ownership-checks #17.)_
- **Three tenant tables have no second wall at all.** Employee shift schedules and
  the ESI and PT challan tables were added after the wall was built and never
  added to it. Nothing leaks *today* because the app still adds its own filter —
  but the wall exists precisely to catch the day someone forgets that filter, and
  for these three there is nothing behind it.
  _(data-layer-migrations audit B-1; tenant-isolation audit H-1.)_

**Reconciliation note:** most CRM ownership findings and the assets ownership
finding are the *same* one-liner habit the dedicated ownership sweep catalogued
across the whole codebase. The three unwalled tables are a related-but-distinct
gap in the *database* wall rather than the app checks.

**Why it gets expensive once live:** with one tenant nothing looks wrong. With
many tenants, referential meaning quietly corrupts across company boundaries, and
the database's advertised "customers cannot see each other's data" guarantee is
factually untrue for the three unwalled tables. These are the failures that become
security incidents, and they are hardest to clean up after the fact.

**What closing it looks like:** one shared guard that checks every supplied
related ID belongs to the caller's org before the insert; and a new migration that
adds the second wall to the three missing tables — plus a test that checks *every*
tenant table has its wall, so the next new table can't slip through.

---

## Supporting themes (smaller, but they recur)

These didn't produce as many findings, but they show up across several reports and
share a flavour.

- **A safeguard the code claims to have, but doesn't.** Comments assert
  "idempotent — safe to retry" on a notifier that actually sends every time
  (double emails on retry), and "atomically claim with a lock" on code that
  releases the lock immediately. The *comment* is the risk — a reader trusts a
  protection that isn't there.
  _(sweep-false-comments F-1, F-2.)_
- **The tamper-evident audit log is never actually checked.** The hash-chain that
  proves records weren't altered is well built — but nothing in the running system
  ever runs the verifier, and it can't detect entries deleted from the *end* of
  the chain. A tamper check nobody runs gives the same assurance as no check.
  _(audit-log-integrity H-1, H-2.)_
- **"Timeout" means "stop waiting," not "stop working."** A slow database query is
  abandoned by the caller but keeps running and holds a connection; connectors to
  external portals have no time limit at all, so one hung government portal can tie
  up server capacity.
  _(observability audit H-1, M-1; secrets-kms audit H-2.)_
- **One compliance loop fails all-or-nothing.** The DPDP privacy sweep runs every
  customer in one pass with no per-customer safety net, and the scheduler retries
  the same failing pass — so one bad record in one tenant can silently stop
  privacy-deadline processing for every tenant after it. Notably, the *other five*
  background loops are built correctly, with per-item isolation.
  _(background-automation H-1; dpdp-privacy H-2; sweep-inconsistent-patterns
  Pattern 3.)_
- **Fail-open defaults hide operator mistakes.** If an internal-network token
  isn't set, the internal control endpoints trust the whole Docker network instead
  of refusing to start.
  _(background-automation M-2; observability audit.)_
- **Two admin surfaces, one privilege, never reconciled.** A super-admin "off
  switch" is honoured by one entry path (tRPC) but ignored by the other (REST),
  which also returns raw PAN/TAN/GSTIN and writes no tamper-evident audit for most
  actions. Same shape as the API-key prefix mismatch in auth (keys minted with one
  prefix, checked for another) and the custom-role vocabulary mismatch.
  _(platform-superadmin audit H-1, M-1, M-2; auth-rbac audit H-3, H-4.)_
- **Cached identity treated as live.** Deactivating a user or resetting their
  password doesn't end their existing sessions for up to ~30 days / 5 minutes,
  because the session snapshot of who-they-are is trusted until it expires.
  _(auth-rbac audit H-1, H-2, H-5.)_

---

## The one habit underneath all of it: tests that bless the bug

Every single report, without exception, found the same thing about the test
suite: **the tests check what the code currently does, not what the requirement
says it should do.** So these bugs pass CI and re-pass it after every change.

- The GST tests always fill in *both* states as matching full names — the one
  format the live wizard never produces — so the wrong-tax bug is invisible.
- The payroll test *asserts* the net-pay floor that discards wage recovery, so the
  latent money bug is "protected" by a test.
- The response-SLA test writes the first-response timestamp *by hand* (because
  production never does) and only checks it gets cleared — removing the missing
  writer would fail nothing.
- The tenant-isolation test checks the wall on *one* table, so three unwalled
  tables pass.
- The DPDP tests check that a notice *fired*, not that it reached the right
  recipient — every mail could go to the company inbox and the test stays green.

This is why so many of these problems reached the current build undetected. The
durable fix that pays off across *all* five root causes is to write tests that
would **fail if the logic were inverted** — testing the requirement, not the
implementation. Where the audits found tests that already do this (see below),
they said so explicitly.

---

## What is genuinely sound — leave these alone

This is not a broken product. The foundations are good, and several parts are
production-grade and well-tested. Touching them risks introducing the very bugs
they've avoided.

- **The money *math* itself is correct.** GST rate splitting (CGST/SGST vs IGST),
  input-tax-credit rules, GSTR-1 rate grouping, the debits-equals-credits check on
  journal entries, invoice-to-ledger posting, settlement idempotency — all compute
  the right numbers when given the right inputs. The failures are at the *inputs*,
  not the arithmetic. _(gst-invoicing, money-accounting audits.)_
- **India payroll and tax** — slabs, rebate, surcharge, cess, PF/ESI/PT, HRA,
  gratuity, leave accrual with carry-forward and encashment — are production-grade
  and the standout of the whole platform. _(payroll-tax, hr audits;
  sweep-stale-debt.)_
- **The encryption vault** (AES-256-GCM envelope encryption, per-payload keys,
  AWS-KMS master key, boot guard that refuses to start if misconfigured) is
  well-built and genuinely well-tested. The one hole (SSO tokens) is a path that
  bypasses it, not a flaw in it. _(secrets-kms audit.)_
- **The database delete rules and the migration machinery** are sound — foreign
  keys cascade/protect exactly as documented, and a half-failed upgrade rolls back
  cleanly rather than leaving a half-changed schema. _(data-layer audit.)_
- **The depreciation engine** (both methods, balanced, idempotent, row-locked) and
  **inventory valuation** (FIFO/WAC) are complete and correct — depreciation's only
  gap is that no screen calls it. _(assets audit; sweep-stale-debt.)_
- **Five of the six background loops** (ticket escalation, event correlation,
  workflow triggers, outbound webhooks, vulnerability-SLA) are built to a careful,
  correct pattern with per-item isolation and bounded retries — the outbound
  webhook dispatcher especially. Only the DPDP loop breaks the pattern.
  _(background-automation audit.)_
- **The audit-log hash chain primitive**, **peppered PII hashing** (fail-loud,
  brute-force-resistant), the **consent/DSR/breach state machines**, **TOTP seed
  and API-key storage**, and the **tenant-isolation middleware and its test** are
  all correct as built. _(audit-log-integrity, dpdp-privacy, secrets-kms,
  data-layer audits.)_
- **The CRM** — lead scoring, lossless lead-to-deal conversion, and CPQ quote tax
  — is healthy; its previously-flagged gaps have genuinely shipped and are
  correct. _(crm audit; sweep-stale-debt.)_
- **The tests that do exist for the webhook, escalation, KMS, and deletion-cascade
  paths are strong** — they assert the requirement and would fail if inverted. They
  are the model the rest of the suite should follow.

A note on the paperwork: the "accepted debt" register and the gap tracker had
drifted — seven items listed as unfinished had actually shipped, and one
("DPDP notification not wired") was hiding a live defect. The register has since
been corrected. Keeping it honest matters, because it is what tells future
reviewers where *not* to look.

---

## Suggested order of work

Ranked by cost-once-live, not by count. Roughly: stop the things that write false
records first, then the things that corrupt money, then the wrong-tax inputs, then
wire up the inert features, then close the tenant-boundary gaps. Under all of it,
change the testing habit so the fixes stay fixed.

1. **Stop recording duties as done when they aren't** (cause #1): DPDP notice
   misrouting, hollow erasure, plaintext SSO tokens. These forge compliance
   evidence and are the hardest to defend after the fact.
2. **Guard the money read-then-writes** (cause #2): the journal double-count
   first, then route every "next number" through the atomic counter.
3. **Normalise the state comparison** (cause #3): one canonical state key fixes
   wrong GST on every wizard-onboarded customer; fix the tax-basis mismatch in the
   3-way match alongside it.
4. **Wire the inert features** (cause #4), worst-blast-radius first: approvals,
   custom roles, goods receipt, first-response clock, then the rest.
5. **Close the ownership gaps** (cause #5): one shared "do you own this ID?" guard,
   plus the second wall on the three missing tables and a test that covers all
   tables.
6. **Under everything: rewrite the failing-silently tests to test the requirement**
   so none of the above can quietly come back.

---

_Sources: the 16 subsystem audits and 8 pattern sweeps in this folder, reconciled
against `docs/quality-bar.md` and `docs/GAP_ANALYSIS.md`. No source files were
modified in producing this summary._
