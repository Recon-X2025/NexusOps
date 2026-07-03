# Platform Gap Analysis — Master Index & Coverage Checklist

**Date:** 2026-07-03
**Scope:** Whole-platform, module-by-module gap analysis of CoheronConnect (repo: NexusOps), benchmarked against each module's category leader with `file:line`-cited code evidence and REAL / PARTIAL / STUB scoring.
**Method:** Read-only code inventory (Explore subagent) → key-citation verification (direct `Read`/`Grep`) → market benchmarking (web) → per-cluster doc. No code was modified.

This index ties together the seven cluster deep-dives (plus the earlier GRC/Legal deep-dives) and proves **100% module coverage**.

---

## 1. The one thing to remember

Across ~38 modules a single pattern dominates: **the platform's data models are right; its computation and its loops are what's missing.** You can almost always *store* the right thing; you frequently can't *calculate the intelligence* on top of it (depreciation, SAM reconciliation, lead scoring, health scores, event correlation, balance sheet) or *close the automation loop* (nothing fires scheduled triggers; nothing emits outbound webhooks; escalation timers never fire).

The two India-specific standouts pull in opposite directions: **payroll/tax is genuinely production-grade** (the platform's best work), while **DPDP privacy is a near-blank page** (its largest regulatory exposure).

---

## 2. Cluster maturity scoreboard

| Cluster | Doc | Maturity | Headline |
|---|---|---:|---|
| 2 — People | `PLATFORM_GAP_PEOPLE_2026-07-03.md` | ~68 | Payroll production-grade; gratuity + leave-accrual missing |
| 7 — Platform & Automation | `PLATFORM_GAP_PLATFORM_2026-07-03.md` | ~60 | Real primitives, open loop (no triggers, no outbound webhooks) |
| 3 — ITSM & IT Ops | `PLATFORM_GAP_ITSM_2026-07-03.md` | ~55 | SLA/CAB real; ITOM/on-call/MTTR loops stubbed |
| 6 — Governance & Compliance | `PLATFORM_GAP_GOVERNANCE_2026-07-03.md` | ~55 | Records real; DPDP + real filing + tamper-proof audit missing |
| 5 — CRM & Customer | `PLATFORM_GAP_CRM_2026-07-03.md` | ~45 | Pipeline real; scoring/CPQ-tax/CSM-health stubbed |
| 1 — Finance & Accounting | `PLATFORM_GAP_FINANCE_2026-07-03.md` | ~42 | Double-entry real; no balance sheet, GSTR bugs, placeholder accruals |
| 4 — IT Asset & Config | `PLATFORM_GAP_ITASSET_2026-07-03.md` | ~42 | CMDB genuinely good; depreciation + SAM absent |

**Cross-cluster average ≈ 52/100** — a capable, well-modelled platform whose value is gated on building the computation/automation layers on top of already-correct schema.

*(The earlier GRC and Legal/Secretarial deep-dives — `GRC_GAP_ANALYSIS_2026-07-03.md`, `LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md` — cover the governance-risk-compliance and legal/contract/secretarial modules and are the companion set to this index.)*

---

## 3. Top platform-wide priorities (cross-cluster)

Ranked by (regulatory/financial risk) × (build leverage), pulling the #1–#2 items from each cluster:

| # | Fix | Cluster | Why it's platform-critical |
|---|---|---|---|
| 1 | **DPDP consent + DSR + breach automation** | 6 Governance | Largest regulatory exposure for an India-first platform; statutory + time-bound |
| 2 | **Workflow trigger layer + outbound webhook dispatcher** | 7 Platform | Closes the automation loop; actions already exist |
| 3 | **Balance sheet + close the GSTR-1 rate bug + real accrual accounts** | 1 Finance | You can't be a finance system without a balance sheet; GSTR bug is a filing risk |
| 4 | **Gratuity + leave accrual/carry-forward** | 2 People | The two statutory holes in an otherwise excellent payroll |
| 5 | **Depreciation engine** | 4 IT Asset | Unblocks book value *and* the Finance balance sheet |
| 6 | **SAM installed-vs-entitled reconciliation (ELP)** | 4 IT Asset | Audit-defense $ risk (M365 true-ups run $300k–$500k) |
| 7 | **Fire the loops: ITOM correlation, on-call escalation, deploy→incident MTTR** | 3 ITSM | Data captured but timers/correlation never execute |
| 8 | **Lead scoring + lossless conversion + CPQ tax/GST** | 5 CRM | Revenue-engine intelligence + a quote that computes tax |
| 9 | **Tamper-evident audit log (hash chain/WORM)** | 6 Governance | Cheapest high-credibility control for SOX/ISO/DPDP |
| 10 | **Regulatory refresh** (Labour Codes Nov-2025, Income Tax Act Apr-2026) | 2 People | Keeps the production-grade payroll engine legally valid |

**Cheap, high-value wins** (do first, low effort): GSTR-1 rate fix, asset↔contract linking, CMDB cycle detection, expiry alerting, remove DocuSign stub, tamper-evident audit, OKR cascade exposure, CVSS→SLA policy.

**Strategic builds** (high effort, high value): DPDP triad, workflow trigger/dispatch loop, depreciation + SAM, balance sheet, PMO planning engine.

---

## 4. Recurring anti-patterns (what to systematically hunt for)

1. **Correct schema, missing computation** — the dominant pattern. Fields exist; the engine that turns them into intelligence doesn't (depreciation, SAM ELP, lead score, health score, book value, balance sheet).
2. **Stored-but-never-evaluated** — enums/config persisted with no evaluator (`triggerType`, correlation policies, on-call `delayMinutes`, CVSS severity → SLA).
3. **Open loops** — capture without consequence (outbound webhooks schema-only; deploy MTTR always null; escalation timers never fire).
4. **Mock/placeholder in the last mile** — real tracking, fake discharge (MCA21 filing mock, XBRL handoff stub, procurement accrual to placeholder account UUIDs).
5. **Lossy transitions** — data dropped at handoff (lead→deal conversion drops account/contact, hardcodes 10% weight).
6. **Records without reflexes** — governance/compliance stored but the time-bound obligation isn't automated (DSR clocks, breach notice, approval SLAs).

---

## 5. Coverage checklist — every module accounted for

Legend: **R** REAL · **P** PARTIAL · **S** STUB (per-module verdict from the cluster doc).

### Cluster 1 — Finance & Accounting (`PLATFORM_GAP_FINANCE`)
- [x] Accounting / general ledger (double-entry) — R
- [x] Financial statements / budgets (P&L, budget variance) — P
- [x] Balance sheet — **S (missing)**
- [x] Expenses — P (two disconnected systems)
- [x] India tax / GST (engine + GSTR-1) — P (GSTR-1 rate bug)
- [x] Procurement / P2P + 3-way match — P (placeholder accrual accounts)
- [x] Inventory — P (no valuation)
- [x] Vendors — P (TDS not automated)

### Cluster 2 — People (`PLATFORM_GAP_PEOPLE`)
- [x] HR / core employee — R
- [x] Payroll (EPF/ESI/PT/tax) — R (production-grade)
- [x] Gratuity — **S (missing)**
- [x] Attendance / leave (accrual/carry-forward) — **S (missing)**
- [x] Recruitment / ATS — P (approval transitions unwired)
- [x] Performance / calibration / 9-box — P
- [x] Surveys / eNPS — P (no math)
- [x] OKR / workforce (see also Cluster 7 Strategy) — R

### Cluster 3 — ITSM & IT Operations (`PLATFORM_GAP_ITSM`)
- [x] Tickets / service desk + SLA — R
- [x] Changes / releases (CAB gating) — R
- [x] Problems / known errors — R
- [x] Events / ITOM (correlation) — **S (never evaluated)**
- [x] On-call / escalation — **S (timers never fire)**
- [x] Work orders / field service — R
- [x] DevOps / deploy→incident MTTR — P (MTTR always null)
- [x] Service catalog — R

### Cluster 4 — IT Asset & Config (`PLATFORM_GAP_ITASSET`)
- [x] CMDB / CI + topology + impact — R (standout)
- [x] Hardware asset register + lifecycle — R
- [x] Software licenses / SAM — P/S (no reconciliation/ELP)
- [x] APM (application portfolio) — P (no rationalization)
- [x] Facilities / room booking — R
- [x] Asset financials / depreciation — **S**
- [x] Asset↔contract linking — **S (missing)**
- [x] Discovery / import — P (import-only)

### Cluster 5 — CRM & Customer (`PLATFORM_GAP_CRM`)
- [x] CRM sales / pipeline / forecast — R
- [x] Lead scoring — **S (static field)**
- [x] Lead→deal conversion — P (lossy)
- [x] CPQ / quotes (tax, discount, PDF) — P/S (no tax)
- [x] CSM / customer success (health/CSAT) — S (hardcoded 0)
- [x] Knowledge base — R
- [x] Customer portal — **S (no gated portal)**

### Cluster 6 — Governance, Security & Compliance (`PLATFORM_GAP_GOVERNANCE`)
- [x] Security incidents (SecOps) — R (no detection/SOAR)
- [x] Vulnerability management — P (no CVSS→SLA, no workflow)
- [x] Document management (DMS) — R
- [x] eSign (eMudhra/Aadhaar) — R; DocuSign — **S**
- [x] Issuer-programme / secretarial spine — P (MCA/XBRL mock)
- [x] DPDP / privacy (consent/DSR/breach) — **S (biggest hole)**
- [x] Audit trail — R (not tamper-evident)

### Cluster 7 — Platform & Automation (`PLATFORM_GAP_PLATFORM`)
- [x] Workflow engine (triggers/actions) — P (triggers never evaluated)
- [x] Approvals — R
- [x] Assignment / business rules — R (ticket-only)
- [x] Integrations / inbound webhooks — R
- [x] Outbound webhooks — **S (schema-only)**
- [x] Custom fields — R
- [x] Agent / AI copilot — R
- [x] Reporting / command-center — P (no saved/scheduled)
- [x] Projects / PMO — P (no scheduling/resourcing)
- [x] Strategy / OKR — R (no cascade)

### Companion deep-dives (previously delivered)
- [x] GRC (governance-risk-compliance) — `GRC_GAP_ANALYSIS_2026-07-03.md`
- [x] Legal / contracts / secretarial — `LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md` (+ content audit, build-vs-buy memo)

**Result: 100% module coverage — no slip-ups.** Every module in the platform inventory has a verdict and `file:line`-cited evidence in exactly one cluster doc (or the companion GRC/Legal set).

---

## 6. Suggested sequencing

1. **Sprint 0 (cheap wins, low risk):** GSTR-1 rate fix, real procurement accrual accounts, asset↔contract linking, CMDB cycle detection, tamper-evident audit, remove DocuSign stub, CVSS→SLA policy, OKR cascade exposure, warranty/license expiry alerts.
2. **Sprint 1 (regulatory must-dos):** DPDP DSR + breach + consent; gratuity + leave accrual; regulatory refresh (Labour Codes / Income Tax Act 2026).
3. **Sprint 2 (financial intelligence):** depreciation engine → book value → balance sheet; GSTR-2B reconciliation; inventory valuation.
4. **Sprint 3 (automation loop):** workflow trigger scheduler/event-bus + outbound webhook dispatcher; generalise business-rules beyond tickets; fire ITOM/on-call/MTTR loops.
5. **Sprint 4 (revenue + audit-defense):** lead scoring + lossless conversion + CPQ tax; SAM reconciliation/ELP; CSM health scoring; customer portal.

Deliver Sprints 0–2 and the platform moves from an average ~52 to a defensible ~65+, with the regulatory exposure closed and the finance system finally able to produce a balance sheet.

---

## 7. Document map

| Cluster | File |
|---|---|
| 1 Finance | `docs/PLATFORM_GAP_FINANCE_2026-07-03.md` |
| 2 People | `docs/PLATFORM_GAP_PEOPLE_2026-07-03.md` |
| 3 ITSM | `docs/PLATFORM_GAP_ITSM_2026-07-03.md` |
| 4 IT Asset | `docs/PLATFORM_GAP_ITASSET_2026-07-03.md` |
| 5 CRM | `docs/PLATFORM_GAP_CRM_2026-07-03.md` |
| 6 Governance | `docs/PLATFORM_GAP_GOVERNANCE_2026-07-03.md` |
| 7 Platform | `docs/PLATFORM_GAP_PLATFORM_2026-07-03.md` |
| Index (this doc) | `docs/PLATFORM_GAP_INDEX_2026-07-03.md` |
| GRC (companion) | `docs/GRC_GAP_ANALYSIS_2026-07-03.md` |
| Legal (companion) | `docs/LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md` |
