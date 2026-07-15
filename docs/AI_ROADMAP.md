# CoheronConnect — AI Roadmap (Maturity Stages)

**Date:** 2026-07-15
**Owner:** Product
**Status:** Direction-setting — the sequencing model for how intelligence enters CoheronConnect.

> **This is the common (market-agnostic) roadmap of three:** `docs/INDIA_ROADMAP.md`
> (India go-live / security), `docs/US_ROADMAP.md` (US market), and this file (AI). AI
> applies to both markets once each market's Stage-2 computation is truthful.
>
> This document is the strategic maturity model for AI/intelligence in the platform. The
> tool-calling "AI Copilot" that appeared as WS-4 in the archived
> `PRODUCTION_READINESS_PLAN_2026-04-26.md` is a single Stage-3 feature; this file governs
> the longer-arc question of *when and how* intelligence is introduced across the product.

---

## 1. The core principle

The stages below are a **trust ramp, not a time-line and not a feature list**. Each
stage may only be built on a *verified* layer beneath it. The recurring platform
finding applies directly: *the data models are right; the computation and the
automation loops are what's missing.* We can almost always **store** the right thing
but frequently cannot **compute the intelligence** on it or **close the loop**.

**AI does not enter until Stage 3.** Stages 1–2 are deterministic. This is deliberate:
a recommendation is only as trustworthy as the understanding beneath it, and that
understanding must be provable math — not a model — before AI is allowed to narrate
or act on it.

---

## 2. The five stages

| Stage | Name | What it does | AI? |
|---|---|---|---|
| 1 | **System of Records** | Capture and store truth. The ledger. | No |
| 2 | **System of Understanding** | Deterministic computation *on* the records — derives new facts. | No |
| 3 | **System of Recommendation** | Narrates/explains the Stage-2 truth, then recommends. **AI enters here.** | **Yes** |
| 4 | **System of Execution** | Acts on recommendations, human-in-the-loop approval. | Yes |
| 5 | **Autonomous Operations** | Closes loops without per-action human approval. | Yes |

### Stage 1 — System of Records *(where we are now)*

Multi-tenant records across all domains: tickets, employees, payroll, invoices,
contracts, assets, OKRs, compliance calendar. The schema is production-grade;
tenancy and FK ownership are enforced.

### Stage 2 — System of Understanding *(next; deterministic)*

Compute **new facts** that don't exist in any single record. **No model — formulas.**
Fully explainable, auditable, reproducible. This is the current gap: the platform can
*store* the right thing but can't yet *compute the intelligence* on it.

Examples of "deeper computation" that qualify as Stage 2:
- Derived financial truth: balance sheet, depreciation schedules, gratuity/leave
  accrual, cash runway from real flows.
- Cross-record computation: aged AP/AR from invoices, health/lead scores, SAM
  installed-vs-entitled reconciliation, 3-way match variance.
- Trend/derivative signals: rate-of-change, not point-in-time state.
- **Severity-aware composite scoring** (see §3).

> **Current state is Stage 1.5, not Stage 2.** Today's "CoheronConnect Control"
> composite is a *simple arithmetic average* of 3-value buckets (healthy=100 /
> watch=50 / stressed=0) over reporting domains. That aggregates *states*; it does
> not *compute new facts*. Replacing this arithmetic aggregation with derived,
> severity-aware computation is the Stage-1.5 → Stage-2 transition.

### Stage 3 — System of Recommendation *(AI enters)*

The first thing AI does is **narrate/explain** the deterministic Stage-2 results
("Finance is stressed because cash runway is short"), *then* recommend an action.
The Operational Commentary strip in the Command Center mock (What's good / Needs
attention / Where to watch / Top recommendation) is a **Stage-3 artifact** — it sits
at the *front door* of Stage 3, not in Stage 2.

### Stage 4 — System of Execution

Recommendations become actions, with a human approving each one. Architecturally this
is *not* new AI — it is the **existing automation loops** (approval SLAs, workflow-
trigger, outbound webhook dispatch, escalation) with the *trigger* being a model
instead of a threshold. AI authors inputs to loops that already exist.

### Stage 5 — Autonomous Operations

Loops close without per-action human input. Gated entirely on the guardrails
(tamper-evident audit chain, bounded authority, reversibility) being proven at
Stage 4.

---

## 3. Composite scoring & module weightage (Stage 2 decision)

The "CoheronConnect Control" score and per-domain heatmap are the first concrete
Stage-2 workitem. Decisions aligned:

### 3.1 Move from average → severity-aware computation

- **Today:** flat arithmetic average of bucketed states — can read "Nominal" while
  individual cells are red, and silently drops non-reporting domains from the
  denominator ("Composite of 5 of 8 domains").
- **Target:** each module produces its **own rollup score**, and the top-line Control
  score composes those module scores with **weights + a severity floor**.

### 3.2 Two distinct weightings (do not conflate)

1. **Inter-module weighting** — how much each domain matters to the top-line.
   *Rationale:* if HR is slow in hiring, overall operations should **not** flip amber/
   red — HR is lower materiality than Finance/Security. This is the primary fix.
2. **Intra-module weighting** — the metric mix *within* a module (e.g. attrition >
   time-to-hire). **Deferred** — do not design yet.

### 3.3 Weights vs. floors — both are required

- **Weights** answer *"how much does this domain matter to the whole?"* → handles the
  routine, low-materiality signal (the HR-hiring case).
- **Severity floors** answer *"is this bad enough to override everything?"* → a
  Security breach or cash-runway < 1 month forces the top-line **red regardless of
  weight**. Floors are **non-negotiable and not user-editable**.
- Weights tune the composite *above* the floor; they can never disable the floor.

### 3.4 CXO-defined weightage — governed, not a free knob

CXOs define module materiality, constrained so the score can't be tuned into being
flattering instead of true:

- **Numeric input** (a "slider" is only a visual example; a bounded number field with
  an audit trail is equivalent and preferred).
- **Bounds / normalization** — clamp each module (e.g. 5–30%), normalize to 100%; no
  module can be set to 0 or made to dominate.
- **Audit trail on every change** — who changed it, when, from → to. Weight-change
  events land in the **tamper-evident audit chain** (`schema/auth.ts:285-318`). This
  converts weighting from a silent knob into a governed, accountable act.
- **Floors remain un-editable** — the audit trail is accountability for the changes we
  *allow*; bounds + floor are the changes we *don't allow at all*.
- **Ship a sensible industry default** so the score works day one; CXOs *adjust*
  rather than author from blank.

### 3.5 Open design questions (decide before build)

1. **Scope:** one weight-set **per tenant** (company-wide truth) vs. **per-role-view**
   (CEO's Control vs CFO's Control). Leaning **per-tenant**, with role *scoping*
   (which domains you see) kept separate from *weighting* (how they roll up).
2. **Formula uniformity:** do all 8 modules share one scoring formula, or does each
   define its own metric set + weights + floors? Almost certainly per-module (Finance's
   risk row ≠ DevOps's) — implies scoring config lives **per module**, not as one
   global function.

---

## 4. What this changes about the existing AI Copilot (WS-4)

The GA plan's WS-4 Copilot (read-only tool-calling, RBAC-inherited) is a legitimate
Stage-3 capability — it *recommends/answers* against Stage-1 records. It is compatible
with this model. The staging discipline this document adds:

- Do not let Stage-3 narration run on top of Stage-1.5 arithmetic that overstates
  health. **Stage-2 truthfulness is the gate.**
- Copilot write tools (WS-4 v1.1, plan→preview→confirm→execute) are early **Stage 4**.

---

## 5. Sequencing implication (not a calendar)

1. **Stage 2 first, deterministic** — compute honest per-metric truth inside each
   module (derived facts), then severity-aware per-module rollup, then the weighted +
   floored Control composite. Highest-leverage domain first: **Finance** (balance
   sheet + cash runway unblock the most).
2. **Then Stage 3** — AI narrates the now-trustworthy Stage-2 results, then recommends.
3. **Stages 4–5** become a **governance/guardrail** problem, not an AI problem — AI
   becomes a new *trigger* for automation loops that already exist.

**The one thing to remember:** treat the stages as sequential *trust*, not sequential
*time*. Stage-2 truthfulness is the actual blocker to everything after it.
