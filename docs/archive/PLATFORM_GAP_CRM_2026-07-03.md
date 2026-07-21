# Platform Gap Analysis — Cluster 5: CRM & Customer

**Date:** 2026-07-03
**Hat worn:** VP Sales / RevOps + Head of Customer Success
**Benchmarks:** Salesforce Sales Cloud, HubSpot (CRM/CPQ/forecasting); Gainsight, ChurnZero (CSM); Zendesk (support/portal)
**Modules covered:** CRM sales (accounts/contacts/deals/pipeline/forecast), Leads/scoring/conversion, Quotes/CPQ, Activities, Customer Success (CSM), Portal/self-service, Knowledge base, Marketing, Omnichannel
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**The sales pipeline is real and even has a governance feature most SMB CRMs lack; everything that requires a *model* or a *document* is a stub.** Accounts/contacts/deals CRUD is solid, pipeline stage progression works, forecasting is genuinely probability-weighted, and there's a real **deal-win approval gate** with configurable thresholds (US-CRM-003) — a maturity signal. But the three things that make a CRM more than a spreadsheet — **lead scoring, quote generation (CPQ), and customer-health/churn intelligence** — are all absent or hardcoded to zero. And the customer-facing half (a real self-service portal with access gating) doesn't exist; there's a KB and a ticket API, but no gated customer portal.

**One-line summary:** *A real sales pipeline with a genuine deal-approval gate, wrapped in stubbed intelligence (no lead scoring, no CPQ document, no computed health) and no gated customer portal.*

**Cluster maturity ≈ 45/100.**

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| Accounts / contacts | 70 | REAL CRUD |
| Deals / pipeline / forecast | 68 | REAL — weighted, approval gate |
| Sales activities | 55 | REAL logging, no automation |
| Lead capture + conversion | 55 | REAL, but lossy conversion |
| **Lead scoring** | **10** | **STUB — static field** |
| **Quotes / CPQ** | **30** | **PARTIAL — math only, no tax/doc/approval** |
| Knowledge base | 68 | REAL — versioned + embeddings |
| **CSM health / churn** | **20** | **STUB — hardcoded zeros** |
| CSM renewals view | 55 | REAL — 90-day lookahead |
| **Customer portal (gated)** | **20** | **MISSING access control** |
| Marketing / campaigns | 0 | NOT PRESENT |
| Omnichannel | 10 | STUB — channel metadata only |
| **Cluster weighted average** | **~45** | **Pipeline real, intelligence stubbed** |

---

## 1. CRM sales — REAL, with a real approval gate (68)

`crm/accounts.ts`, `crm/contacts.ts`, `crm/deals.ts` + `schema/crm.ts`:
- **Accounts** (tier smb/mid_market/enterprise, credit limit, owner) and **contacts** (seniority, do-not-contact) — full CRUD, org-scoped.
- **Deals** — 7-stage pipeline (prospect→…→closed_won/lost), **probability-weighted forecast** `weightedValue = value × probability/100` recomputed on every update (`deals.ts:105-106,150-155`), per-org customizable pipeline stages seeded on first read.
- **Deal-win approval gate (genuinely good):** closing to `closed_won` above a configurable amount **requires** `wonApprovedAt`; the tier (manager/executive) comes from org settings (`dealCloseNoApprovalBelow`/`dealCloseExecutiveAbove`), and re-opening clears the approval (`deals.ts:173-194,201-219`). This is a real revenue-governance control that most SMB CRMs don't ship.
- **Dashboard** — executive summary with pipeline-by-stage rollup and stale-lead metrics (`crm/dashboard.ts:10-41`).

**Gaps:** probability is **manual, not stage-derived** (moving a deal to "negotiation" doesn't auto-set probability — Salesforce/HubSpot map stage→probability); no products/price-book master (quote line items are free-text); no territory/quota/forecast-accuracy tracking.

---

## 2. Leads — real capture, stubbed scoring, lossy conversion (55 / 10)

`crm/leads.ts` + `schema/crm.ts:154-179`:
- Lead capture with source enum, status progression (new→contacted→qualified→converted), and an **atomic lead→deal conversion** wrapped in a transaction so a converted deal always has its source lead flagged (`leads.ts:64-72`). The atomicity is well-reasoned.

**Two real problems:**
1. **Lead scoring is a stub (10).** `score` is a writable int defaulting to 0 and **never computed** (`schema/crm.ts:166`). No behavioral/engagement/fit scoring. *Benchmark: HubSpot AI contact scoring, Salesforce Einstein lead scoring are the default expectation now.*
2. **Conversion is lossy.** `convert` creates a deal with only title + value, sets `weightedValue = value × 0.1` (a **hardcoded 10% probability assumption**), and **does not carry the account or contact** — no `accountId`/`contactId`, no stage (`leads.ts:65-68`). So converting a lead loses the company/contact context and drops the deal at an arbitrary 10% weight. Salesforce's convert creates Account + Contact + Opportunity together.

---

## 3. Quotes / CPQ — PARTIAL, the document is missing (30)

`crm/deals.ts:346-399` + `schema/crm.ts:208-231`:
- **What's real:** quote records with auto number (`QT-…`), JSONB line items, `subtotal = Σ(item.total)`, `total = subtotal × (1 − discountPct/100)` (`deals.ts:356-357`), status draft/sent/accepted/rejected/expired.

**What's missing — most of CPQ:**
- **No tax/GST line at all** — `total` is just subtotal minus a percentage; for an Indian quote this omits CGST/SGST/IGST entirely (and the GST engine that exists in `packages/payroll-math` isn't wired in).
- **No per-line-item discount** — the lineItems view **hardcodes `discount: 0`** (`deals.ts:371`); only an aggregate `discountPct` exists.
- **No PDF/HTML rendering.** The recent commit `8ff3fa5` ("resolve quote rendering crashes") was **defensive null-coalescing** on the items map, not a renderer — there is still no quote document generation (the contract-PDF engine from the Legal cluster could be reused here).
- **No approval workflow** (quotes auto-created in draft; no discount-approval gate) and **no quote-to-order/contract conversion** despite the `dealId` FK.

*Benchmark: Salesforce CPQ generates pricing, contract terms, and invoice amounts from one data model; HubSpot bundles CPQ in paid tiers.* This is the biggest sales-side gap.

---

## 4. Customer Success — health & churn are hardcoded zeros (20)

`csm.ts` + `services/workbench-payloads/csm.ts` + `schema/csm.ts`:
- **What's real:** CSM case CRUD; a **renewals panel** that reads the contracts table for `endDate ∈ [now, now+90d]` and computes `daysToRenew` (`csm.ts payload:80-116`) — genuinely useful; an at-risk/watch/healthy/champion **health histogram**.
- **The catch:** the histogram buckets `crmAccounts.healthScore`, which is a **manually-written static field, never computed** (`accounts.ts:46`). And the CSM dashboard **hardcodes `slaBreached: 0`, `avgResolutionHours: 0`, `avgCsat: 0`** (`csm.ts:170,210-211`).

So CSM presents health/SLA/CSAT numbers that are **placeholders, not measurements**. Missing entirely: churn-risk model, engagement/product-usage signals, success plans, QBR scheduling, NPS tracking. *Benchmark: Gainsight/ChurnZero are bought precisely for computed health scores, predictive risk, usage signals, and renewal forecasting — this is the layer that's absent.*

---

## 5. Knowledge base — REAL (68)

`schema/portal.ts:26-82` + `schema/knowledge.ts`:
- KB articles with categories, tags, draft/published/archived, **full revision history** (`kbArticleRevisions`), view/helpful counters, and an **`embeddingVector` field with an embeddings service** for semantic search. Feedback collection (`kbFeedback`). This is a real, versioned KB with the infrastructure for AI search.

**Gaps:** no **public** KB search API for external customers (ties to the portal gap), no AI summarization, no ticket→article recommendation.

---

## 6. Customer portal — MISSING access control (20)

Tickets support `requesterType: internal|external` and there's a KB + request templates + announcements. But there is **no gated customer portal**: no customer-user onboarding, no per-customer access scoping (RBAC checks are generic `incidents:read/write`, not customer-scoped), no customer self-service surface. `requesterType` is metadata, not an access boundary. *Benchmark: Zendesk's help center gates customer access and scopes tickets to the requesting customer* — that boundary doesn't exist here.

---

## 7. Marketing & omnichannel — not present / stub

- **Marketing/campaigns:** no schema, no router. Not built. (Reasonable to descope, but name it.)
- **Omnichannel:** tickets carry an `intakeChannel` metadata field but there's **no integration layer** — no email-inbox ingestion, no chat/phone thread unification, no interaction-history aggregation. Stub.

---

## 8. Bug/quality findings worth tracking

| Finding | Location | Severity |
|---|---|---|
| Lead scoring never computed (static field) | `schema/crm.ts:166` | Medium |
| Lead conversion drops account/contact; hardcodes 10% weight | `leads.ts:65-68` | Medium |
| Quote total omits tax/GST entirely | `deals.ts:357` | High (India) |
| Quote lineItems discount hardcoded to 0 | `deals.ts:371` | Medium |
| CSM slaBreached/avgResolutionHours/avgCsat hardcoded 0 | `csm.ts:170,210-211` | Medium |
| Account healthScore writable, never computed | `accounts.ts:46` | High |
| No customer portal access gating | `tickets.ts` / `schema/portal.ts` | High |

---

## 9. Prioritized fix list (RevOps + CS ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **CPQ: tax/GST + per-line discount + PDF (reuse contract engine) + discount approval** | Quotes | Med-High | Biggest sales-side gap; India-correctness (no GST today) |
| 2 | **Computed account health score** (from usage/renewal/case/engagement signals) | CSM | Med | Removes the hardcoded-zero placeholders; core CS value |
| 3 | **Fix lossy lead conversion** (carry account+contact, real stage/probability) | Leads | Low | Bug-class; cheap; preserves context |
| 4 | **Lead scoring engine** (fit + behavioral rules) | Leads | Med | Table-stakes vs HubSpot/Salesforce |
| 5 | **CSM real SLA/CSAT/resolution metrics** (replace hardcoded 0s) | CSM | Low-Med | Wire to real ticket data |
| 6 | **Customer portal access gating** (customer users, scoped tickets/KB) | Portal | Med-High | Unlocks external self-service |
| 7 | **Stage→probability mapping** | Deals | Low | Standard CRM behavior |
| 8 | **Products / price-book master** for quote line items | Quotes | Med | Prereq for real CPQ |
| 9 | **Churn-risk flags + success plans / QBR** | CSM | High | Gainsight-tier CS depth |
| 10 | **Public KB search API** | KB | Low | Pairs with #6 |

Items **3, 5, 7, 10 are cheap**; **1, 2** are the strategic builds (a real quote document + a computed health score); **6** unlocks the entire customer-facing story.

---

## 10. Bottom line for this cluster

The sales core is real and, with the deal-win approval gate and probability-weighted forecast, is more governed than most SMB CRMs. But this cluster is the platform's clearest "**pipeline real, intelligence stubbed**" story: lead scoring is a static 0, quotes are arithmetic without tax or a document, and customer health/SLA/CSAT are literally hardcoded zeros presented as metrics. The customer-facing half — a gated self-service portal — isn't there at all.

Two builds change the trajectory: a **real CPQ** (tax + line discounts + a PDF, reusing the contract engine, with a discount-approval gate) on the sell side, and a **computed health score + churn flags** on the retain side. Add the cheap fixes (lossy-conversion bug, stage→probability, real CSM metrics) and this moves from ~45 to a credible ~65. Until the health/CSAT hardcodes are replaced, though, the CSM dashboards should be treated as **non-functional placeholders**, not reporting.

**Sources:**
- [HubSpot vs Salesforce 2026](https://monday.com/blog/crm-and-sales/hubspot-vs-salesforce/)
- [Gainsight vs Salesforce for Customer Success (2026)](https://coworker.ai/blog/gainsight-vs-salesforce)
- [Best tools for customer success managers 2026](https://tight.studio/resources/best-tools-for-customer-success-managers/)
- [Salesforce lead scoring setup](https://www.default.com/post/salesforce-lead-scoring)
