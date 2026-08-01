# Sweep — Phantom Fields

**Type:** Sweep, not an audit. No code was changed. This is a read-only survey.

**What this looks for:** database columns that a *feature depends on* — the code
reads them, filters on them, or shows them on a screen — but which **no production
code path ever fills in**. The column exists, the reading code exists, but nothing
connects them, so the value is permanently empty (NULL / 0). The feature looks built
but is hollow.

Also (the inverse): columns that production code *writes* but nothing ever reads
back — usually a sign a feature was started and abandoned.

**A specific trap I checked for, as requested:** columns that only a **test** writes.
A test that inserts the value directly makes the feature's tests pass, which hides
the fact that real usage never populates it. Where that happens, I call it out —
it's the most dangerous case because the safety net (the test) is green while the
feature is broken in production.

Every finding below was confirmed by reading the actual source, not just grep
counts.

---

## Plain-English summary

Several features in this system are wired to read data that nothing ever produces.
The screen or the report is built and looks finished, but the number it shows is
always empty or zero because no button, job, or workflow ever writes the underlying
value.

The clearest cluster is **goods-receipt / three-way match**. The invoice-matching
logic reads "goods received" records to check that what you were billed matches what
actually arrived. But **no code anywhere creates those goods-received records** — the
only thing that inserts one is a *test*. So in production the "three-way match" is
silently a two-way match (invoice vs. purchase-order only), and it will never catch
"billed for 100, only 60 arrived." This exactly matches the two known examples you
gave (`invoices.grnId`, `tickets.slaRespondedAt`).

Two more are user-visible and misleading:
- The **knowledge-base "👎 No / not helpful" vote** shows a count on every article,
  but the vote handler only ever counts the "👍 Yes" votes — the "No" count is
  permanently 0.
- The **"reopened tickets" dashboard metric** filters on a reopen counter that the
  reopen action never increments — so that metric always reads 0, even after tickets
  are genuinely reopened.

And in **risk management (GRC)**, the risk-detail screen computes a "residual risk"
score from two columns that no form ever fills in, so that score is always blank.

**The one to fix first:** the goods-receipt gap (`invoices.grnId` +
`grnLineItems` + `goodsReceiptNotes`). It's a financial control — the whole point of
three-way match is to stop overbilling and phantom deliveries — and it is silently
disabled, with a passing test giving false confidence.

---

## Part A — Read (or displayed/reported) but never written

### A-1. `invoices.grnId` — three-way match reads it; nothing populates it *(known example, confirmed)*

- **Column:** `invoices.grnId` (`grn_id`), `packages/db/src/schema` (invoices), FK to
  `goods_receipt_notes`.
- **Read at:**
  - `apps/api/src/lib/invoice-po-match.ts:213` — `if (invoice.grnId) { … }` gates the
    entire goods-received branch of the match.
  - `apps/api/src/lib/invoice-po-match.ts:232` — `const hasGrn = Boolean(invoice.grnId);`
    feeds the tolerance/pairing logic.
  - `apps/api/src/lib/invoice-po-match.ts:276` — second `if (invoice.grnId)` branch.
- **Write path:** none. A whole-repo search for any assignment of `grnId` on an
  invoice (`.set({ grnId })` / `.values({ grnId })`) across `apps/api/src` returns
  nothing (only the reads above).
- **What this means in practice:** because `grnId` is always NULL, the matcher always
  takes the "no goods receipt" path. The "three-way" match is really a two-way match
  (invoice vs. PO). Nobody is checking the invoice against what was actually
  delivered — the exact overbilling risk three-way match is meant to prevent.

### A-2. `grnLineItems.acceptedQuantity` — read by the match; the table is never populated in production

- **Column:** `grnLineItems.acceptedQuantity` (`accepted_quantity`),
  `packages/db/src/schema/procurement.ts:232` region (GRN line items).
- **Read at:** `apps/api/src/lib/invoice-po-match.ts:226` —
  `const add = Number(gl.acceptedQuantity ?? 0) * up;` — this is how the match sums up
  the value of goods actually received per PO line.
- **Write path:** none in production. The `grnLineItems` table is referenced in
  production **only** as a read: `invoice-po-match.ts:214`
  `db.select().from(grnLineItems)…`. No `.insert(grnLineItems)` / `.update(grnLineItems)`
  exists anywhere in `apps/api/src`.
- **⚠ Test-only write hides the gap:** the parent table `goodsReceiptNotes` is inserted
  **only** in a test —
  `apps/api/src/__tests__/metric-visuals.test.ts:181` and `:200`
  (`db.insert(goodsReceiptNotes).values(...)`). `grnLineItems` isn't even inserted
  there. So a reader glancing at the code sees GRN rows being created and assumes the
  feature works; in production nothing ever creates a GRN or its lines.
- **What this means in practice:** even if an invoice *did* carry a `grnId` (A-1), the
  received-quantity it would read is a table that production never fills. The
  goods-received side of the match is empty end-to-end. This is the same defect as
  A-1, one layer down.

### A-3. `tickets.slaRespondedAt` — SLA breach logic & reports read it; only ever set to NULL *(known example, confirmed)*

- **Column:** `tickets.slaRespondedAt` (`sla_responded_at`),
  `packages/db/src/schema/tickets.ts:190`.
- **Read at:**
  - `apps/api/src/workflows/ticketLifecycleWorkflow.ts:164` — the breach sweep SQL
    treats a first-response deadline as breached only while
    `AND sla_responded_at IS NULL`.
  - `apps/api/src/routers/reports.ts:455` and `:476` — first-response breach counts
    both filter `isNull(tickets.slaRespondedAt)`.
- **Write path:** the *only* production assignment is
  `apps/api/src/routers/tickets.ts:1319` — `updateData.slaRespondedAt = null;` (on
  reopen). No code path ever sets it to a **timestamp**. There is no "agent first
  responded" write anywhere.
- **⚠ Test-only write hides the gap:**
  `apps/api/src/__tests__/ticket-reopen-sla.test.ts:82` sets
  `slaRespondedAt: pastDeadline` directly in a seeded row, and `:96` asserts it's
  nulled on reopen. So the reopen behaviour is tested, but the fact that *nothing ever
  sets the timestamp in the first place* is invisible to the suite.
- **What this means in practice:** `slaRespondedAt` is permanently NULL, so every
  ticket looks like it *never* got a first response. The first-response SLA is
  perpetually "breached / at risk" in the breach sweep and reports, regardless of how
  fast agents actually reply. The first-response SLA metric is meaningless.

### A-4. `kbArticles.notHelpfulCount` — shown on every article; the vote handler never increments it

- **Column:** `kbArticles.notHelpfulCount` (`not_helpful_count`),
  `packages/db/src/schema/portal.ts:41`.
- **Read/displayed at:**
  - `apps/web/src/app/app/knowledge/page.tsx:77` — summed into a total
    (`+ (a.notHelpfulCount ?? 0)`).
  - `apps/web/src/app/app/knowledge/page.tsx:231` — rendered next to a 👎 ThumbsDown
    icon.
  - `apps/web/src/app/app/knowledge/[id]/page.tsx:296` — `No ({article.notHelpfulCount ?? 0})`.
- **Write path:** none. `recordFeedback` (`apps/api/src/routers/knowledge.ts:157-159`)
  only handles the positive case:
  ```ts
  if (input.helpful) {
    await db.update(kbArticles).set({ helpfulCount: sql`helpful_count + 1` })…
  }
  ```
  There is no `else` — a "not helpful" vote inserts a `kbFeedback` row but never
  touches `notHelpfulCount`.
- **What this means in practice:** every knowledge-base article shows "No (0)"
  forever. Users can click 👎 and their vote is recorded in `kbFeedback` but the
  headline counter the team looks at to find bad articles never moves — so poor
  articles never surface.

### A-5. `tickets.reopenCount` — the "reopened tickets" report filters on it; the reopen action never increments it

- **Column:** `tickets.reopenCount` (`reopen_count`),
  `packages/db/src/schema/tickets.ts:185` (`notNull().default(0)`).
- **Read at:**
  - `apps/api/src/routers/reports.ts:636` — `sql\`${tickets.reopenCount} > 0\`` is the
    WHERE clause that defines the "reopened" set.
  - `apps/api/src/routers/reports.ts:716` — returned to the dashboard as `reopenCount`.
- **Write path:** none in production. The reopen branch of the ticket update handler
  (`apps/api/src/routers/tickets.ts:1300-1335`) resets `resolvedAt`, `closedAt`, the
  SLA deadlines, `slaBreached`, and `slaRespondedAt` — but **never** increments
  `reopenCount`.
- **⚠ Test-only/seed write hides the gap:** the only assignment anywhere is in a seed
  generator — `packages/db/src/seed-smb-analytics.ts:463`
  (`reopenCount: rng() < 0.04 ? 1 : 0`). So demo/seed data shows a non-zero reopen
  rate, making the dashboard look alive, while real tenants always see 0.
- **What this means in practice:** the reopen action works (it re-opens the ticket)
  but the counter behind the "reopened tickets" metric is never bumped. Because the
  report filters `reopenCount > 0`, real tenants' reopened-tickets metric is always
  empty — a KPI that silently reads 0 no matter what happens.

### A-6. `risks.residualLikelihood` / `risks.residualImpact` — the risk screen computes a residual score from them; no form sets them

- **Columns:** `risks.residualLikelihood` (`residual_likelihood`) and
  `risks.residualImpact` (`residual_impact`), `packages/db/src/schema/grc.ts:124-125`.
- **Read/displayed at:** `apps/web/src/app/app/grc/[id]/page.tsx:94-95` —
  ```ts
  const residualScore = risk.residualLikelihood && risk.residualImpact
    ? risk.residualLikelihood * risk.residualImpact
  ```
- **Write path:** none. `createRisk` (`apps/api/src/routers/grc.ts:42-57`) accepts only
  `title, description, category, likelihood, impact, treatment, mitigationPlan` — no
  residual fields — and `updateRisk` (`:60-79`) accepts only
  `id, status, likelihood, impact, mitigationPlan, treatment`. The `...input` /
  `...rest` spreads therefore cannot carry residual values; nothing else writes them.
- **What this means in practice:** the risk-detail page has a "residual risk" (risk
  remaining after controls/mitigation) display, but the two inputs that drive it can
  never be entered, so the residual score is always blank. The post-mitigation view of
  risk — the thing a risk committee actually cares about — is non-functional.

---

## Part B — Written but never read (abandoned partway)

I looked for the inverse pattern. Most columns that *appear* unread are actually
returned as part of a whole-row `select()` and consumed by the UI, so I discarded
those. I did **not** find a clean, high-confidence case of a column that production
*writes* but nothing anywhere reads — every write I traced had at least one consumer.

The closest candidates (the GRC `risks.residualRiskScore`, `residualRiskRating`,
`reviewDate`, `reviewFrequency`, `lastReviewedAt`, `controls`, and
`vendorRisks.attachmentRefs` / `questionnaireAnswers`) turned out to be **neither
written nor read** — see Part C. That makes them dead columns, not the
"written-then-abandoned" pattern, so they don't belong here.

**Result for Part B: nothing firmly qualifies.** Stating that plainly rather than
padding the list.

---

## Part C — Dead columns (neither read nor written) — context, not the target pattern

These aren't "phantom fields" in the read-never-written sense (no feature depends on
them), but they came up during the sweep and are worth recording as pure dead
storage:

- `tickets.searchVector` (`search_vector`), `schema/tickets.ts:197` — appears **only**
  in the schema; no production or test code reads or writes it. (Full-text search
  scaffolding never wired; the actual embedding search uses a different column.)
- `grnLineItems.rejectionReason` (`rejection_reason`), `schema/procurement.ts:281` —
  never read, never written (part of the never-populated GRN table, A-2).
- `poLineItems.acceptedQuantity` (`accepted_quantity`), `schema/procurement.ts:232` —
  never referenced in `apps/` at all (distinct from `grnLineItems.acceptedQuantity`,
  which *is* read in A-2).
- GRC risk-mitigation columns — `risks.residualRiskScore`, `residualRiskRating`,
  `reviewDate`, `reviewFrequency`, `lastReviewedAt`, `controls`
  (`schema/grc.ts:119-127`) and `vendorRisks.attachmentRefs`,
  `questionnaireAnswers` (`schema/grc.ts:195-196`) — no read and no write found in
  `apps/`. These look like a half-designed risk-review-scheduler and vendor-
  questionnaire intake that were never built. (The two residual *inputs* in A-6 are
  the exception — those are read by the UI.)

---

## Checked and found correctly wired (so you know these weren't skipped)

- `tickets.slaPausedAt` — written (tickets.ts:1246/1273), read (reports.ts:430/446/471,
  ticketLifecycleWorkflow.ts:160). Correct.
- `crmDeals.weightedValue` — written (crm/deals.ts:128/174, crm/index.ts:201/308,
  lead-convert.ts:137, ingest.ts:248), read/displayed (crm/deals/[id]/page.tsx:217).
  Correct.
- `crmAccounts.healthScore` — written (crm/index.ts:112 & crm/accounts.ts:48 input
  schemas), read/displayed (csm.ts, account-portfolio.tsx, crm/accounts/[id]/page.tsx).
  Correct. *(The hardcoded healthScores in `apm/page.tsx` and the `ACCOUNTS_LIVE` block
  in `crm/page.tsx` are mock UI data, not this column.)*
- `kbArticles.helpfulCount` — the positive counterpart to A-4; written and displayed.
  Correct (only the "not helpful" side is broken).

---

## Root cause

Two recurring shapes produced every finding:

1. **The consumer was built before (or instead of) the producer.** The three-way
   match reads GRN data (A-1, A-2), the reports read `slaRespondedAt` and `reopenCount`
   (A-3, A-5), and the risk screen reads residual scores (A-6) — but the code that
   *creates* a GRN, records a first response, increments a reopen, or captures
   residual inputs was never written. The read side and the write side were built in
   separate passes and never joined.
2. **One-sided handlers.** The KB feedback handler (A-4) and the reopen handler (A-5)
   each do part of the job (record the feedback row / re-open the ticket) but forget to
   update the aggregate the UI/report reads.

**Tests masked three of these** (A-2, A-3, A-5) by writing the value directly, so the
suite is green while the feature is hollow. That is the single most important
takeaway: a passing test here does not prove the feature produces its own data.

## Recommended order of work (by blast radius, not count)

1. **Goods-receipt / three-way match (A-1 + A-2)** — a financial control that is
   silently off. Highest risk; the passing test makes it worse by hiding the gap.
2. **First-response SLA (A-3)** — an ITSM KPI that is permanently wrong for every
   ticket; drives breach alerts and reports.
3. **Reopened-tickets metric (A-5)** — silent-zero KPI; the fix is one increment in
   the reopen branch.
4. **KB "not helpful" count (A-4)** — user-visible wrong number; one `else` branch.
5. **Residual risk (A-6)** — non-functional risk-committee view; needs form inputs +
   write path.
