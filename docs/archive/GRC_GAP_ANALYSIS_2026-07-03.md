# CoheronConnect — GRC / Legal & Governance Gap Analysis

**Date:** 2026-07-03
**Prepared by:** Engineering (code-grounded audit + market benchmark)
**Scope:** Legal & Governance (secretarial, legal matters, e-sign) and Security & Compliance (GRC) only.
**Method:** Deep code inspection of the shipped product (routers under `apps/api/src/routers/`, schema under `packages/db/src/schema/`) benchmarked against the 2026 capabilities of GRC/IRM market leaders.
**Companion docs:**
- `docs/GRC_TIER_WORKITEM_MAP_2026-07-03.md` — feature → schema/router work-item mapping for the 3-tier model.
- `docs/GRC_BASIC_HARDENING_BACKLOG_2026-07-03.md` — actionable backlog to harden the shipped GRC Basic tier.
- Prior context: `docs/COMPETITIVE_GAP_ANALYSIS_2026-06-30.md` §3.10–§3.11.

---

## 0. How to read this document

This is an **evidence-based** assessment. "Shipped" means the capability was found in code with a concrete file reference, not inferred from a roadmap. The verdict scale:

- **EXISTS** — real logic in code, competitive at the stated segment.
- **PARTIAL** — usable but missing things a buyer will notice.
- **MISSING** — no implementation; a build, not a hardening.

The central finding: **CoheronConnect's GRC is a strong _system of record_ (~55% maturity) but not yet a _system of continuous assurance_.** The market leaders' product _is_ the continuous-assurance engine — automated evidence collection, hourly control tests, framework cross-mapping, and an auditor-facing trust center. That engine is the ~45% that is missing, and it is exactly what the proposed **GRC Advanced** tier must deliver to be credible.

---

## 1. The market benchmark (2026)

Two competitor sets bracket the proposed tiering.

### 1.1 Compliance-automation specialists — the bar for GRC Advanced

These define the "always-on evidence" category and are what a buyer will compare an "ISO 27001 / SOC 2 continuous monitoring" tier against.

| Leader | The defining capability | 2026 numbers |
|---|---|---|
| **Vanta** | Continuous monitoring + AI trust management | 1,400+ automated tests **every hour**; 400+ integrations; 35+ frameworks cross-mapped; AI GRC agent (questionnaire automation ~95% accuracy) |
| **Drata** | Continuous control monitoring | 1,200+ automated hourly tests; 300+ integrations; risk register mapped to controls; AI test generation |
| **Secureframe / Sprinto** | Fast multi-framework certification | 175+ integrations; auditor portal; 12+ frameworks |

The recurring pattern across all of them: **evidence is _pulled_ automatically from cloud/IdP/SaaS and tested continuously; humans do not upload evidence.** An auditor portal / trust center removes the "email evidence packages back and forth" step entirely.

### 1.2 Enterprise IRM — the bar for up-market Advanced

| Leader | The defining capability |
|---|---|
| **ServiceNow IRM** | Regulation → control → risk mapping via authority documents (Unified Compliance Framework); continuous control signals from SecOps/CMDB; board-level risk dashboards with trend; AI auto-links controls to frameworks |
| **OneTrust** | GRC sitting alongside **privacy & AI governance** — consent, DSAR, RoPA, DPDP/GDPR |
| **Archer / LogicGate** | Configurable/custom control frameworks, risk quantification, per-user enterprise licensing |

### 1.3 What this means for the tiering

The moment the **Advanced** tier names *ISO 27001 / SOC 2 / SEBI / RBI framework mapping* and *continuous control monitoring*, buyers will expect the Vanta/Drata always-on evidence engine — not a control checklist. **The automated-evidence-collection engine is therefore the first Advanced-tier build; without it the rest of the Advanced feature list reads as premium-priced record-keeping.**

---

## 2. What CoheronConnect ships today (evidence)

### 2.1 Genuinely strong — EXISTS

| Capability | Evidence | Note |
|---|---|---|
| Risk register (likelihood×impact, residual, treatment, control mapping) | `packages/db/src/schema/grc.ts:103` (`risks`), `apps/api/src/routers/grc.ts` | Auto score 1–25; residual risk tracked; controls linked via jsonb |
| Risk controls (type, frequency, effectiveness, testing schedule) | `grc.ts:204` (`riskControls`) | `mappedRiskIds` array links controls↔risks |
| Audit findings (CCCE model, remediation SLA) | `grc.ts:251` (`auditFindings`) | criteria/condition/cause/effect + remediation status/dates |
| Policy management (version, review cycle, lifecycle) | `grc.ts:139` (`policies`) | draft→review→approved→published→retired |
| Security incident response (enforced state machine, IR playbook, IOCs, timeline) | `packages/db/src/schema/security.ts`, `apps/api/src/routers/security.ts:36` | Real state machine; ticket linking |
| Vulnerability management (scanner import, dedupe, SLA, risk acceptance) | `apps/api/src/routers/security.ts:127` | Fingerprint-based idempotent import |
| Unified audit trail + SIEM export | `packages/db/src/schema/auth.ts` (`auditLogs`), `security.ts` siemExportPreview | Org-wide mutation log |
| Compliance calendar (India statutory auto-seed, penalty calc) | `packages/db/src/schema/india-compliance.ts`, `apps/api/src/routers/india-compliance.ts` | MGT-7/AOC-4/ADT-1/DIR-3/MSME-1/DPT-3 |
| Approvals + workflow engine (org-hierarchy routing, multi-step) | `apps/api/src/routers/approvals.ts`, `packages/db/src/schema/approvals.ts` | Idempotent decisions |

### 2.2 India Secretarial / Legal — EXISTS (a real moat, ~70%)

| Capability | Evidence |
|---|---|
| Board meetings & resolutions (state machine, voting) | `apps/api/src/routers/secretarial.ts:14`, `packages/db/src/schema/secretarial.ts:46` |
| MCA/ROC filings & auto-seed | `secretarial.ts:167` (`filings`) |
| Share capital & ESOP (cap table, vesting) | `secretarial.ts:354` |
| Directors & DIN/KYC (auto DIR-3 linkage) | `secretarial.ts:543`, `india-compliance.ts` directors |
| Legal matters & investigations (litigation depth, legal hold) | `apps/api/src/routers/legal.ts`, `packages/db/src/schema/legal.ts` |
| E-sign (multi-provider, IT-Act audit trail, SHA256) | `apps/api/src/routers/esign.ts`, `packages/db/src/schema/esign.ts` |

Vanta/Drata/ServiceNow do **not** address this cluster. It is the clearest differentiator for India-operating buyers and should anchor GTM, not the Advanced-tier automation race.

### 2.3 PARTIAL

| Capability | Shipped today | What's missing |
|---|---|---|
| Vendor / third-party risk | `grc.ts:183` (`vendorRisks`): tier, questionnaire status, jsonb answers; `vendors.ts` risk score = `max(0, 5 - rating)` | Deep questionnaire templates; continuous monitoring; scoring beyond a 1-line heuristic |
| DPDP / privacy | RoPA (`issuer-programme.ts` `dpdpProcessingActivities`), breach-notification profiles, optional sensitive-read audit | Consent capture/proof/revocation; data-principal (DSAR) request workflow |
| Board-level risk reporting | `grc.riskMatrix` KPI counts | Trend, heatmap, drill-down, exec dashboard |
| Evidence collection | Manual URI upload (`grc.ts:231` `riskControlEvidence`) | Automated/continuous collection from integrations |
| Advanced SecOps | Incident + vuln logging | Threat detection, alert correlation |
| Policy acknowledgement | `publishedAt` on policy | No per-user acknowledge table/tracking |

### 2.4 MISSING

| Capability | Impact |
|---|---|
| **Framework library** (ISO 27001 / SOC 2 / SEBI / RBI) — no framework model or control↔requirement mapping | Cannot report compliance-against-a-standard; cannot auto-generate control checklists per framework |
| **Multi-framework simultaneous** (shared control satisfying many standards) | No cross-mapping; each framework would be re-entered by hand |
| **Custom control frameworks** | Enterprises can't model industry/company-specific control sets |
| **Continuous control monitoring** (automated hourly/daily tests) | The single defining Vanta/Drata capability — absent |
| **Automated evidence collection** (integration connectors → evidence) | Audit prep stays manual |
| **Auditor trust center / portal** (read-only auditor access) | No auditor self-service; audit cycles stay email-driven |
| **ESG reporting** | No ESG metrics/tables/router |

---

## 3. Gap scorecard — how far behind

Maturity % is relative to a credible product in the category (not the absolute frontier).

| Capability area | Maturity | vs. Vanta/Drata | vs. ServiceNow/OneTrust IRM |
|---|---|---|---|
| Risk register & controls (record) | 70% | Comparable | PARTIAL (no quantification) |
| Policy management | 70% | Comparable | Comparable (no acknowledge tracking) |
| Audit findings & remediation | 65% | Comparable | PARTIAL |
| Security incident / vuln mgmt | 65% | N/A (out of their scope) | PARTIAL (no detection) |
| Compliance calendar (India) | 80% | Ahead (India-specific) | Ahead (India-specific) |
| Secretarial / legal / e-sign | 70% | Ahead (not their scope) | Ahead |
| Vendor / third-party risk | 40% | GAP | GAP |
| DPDP / privacy | 30% | GAP | GAP (OneTrust is the bar) |
| **Framework mapping** | ~5% | **GAP** | **GAP** |
| **Continuous control monitoring** | 0% | **GAP** | **GAP** |
| **Automated evidence collection** | ~10% | **GAP** | **GAP** |
| **Auditor portal / trust center** | 0% | **GAP** | **GAP** |
| Board risk dashboards | 30% | PARTIAL | GAP |
| ESG reporting | 0% | N/A | GAP |
| **Overall GRC module** | **~55%** | **12–18 months behind on the automation layer** | **Behind on frameworks + dashboards + privacy** |

### 3.1 The distance, tier by tier

- **GRC Basic (included): ~85% there.** Compliance calendar, policy, risk register, audit trail, India statutory, approvals all EXIST. Only soft spot: DPDP (config-only) and policy-acknowledge tracking. **This is a hardening exercise, not a build** — see the hardening backlog.
- **GRC+ (₹25k): ~50% there.** This packaging/depth tier needs framework library + multi-framework mapping + real vendor questionnaires + board dashboards. Mostly **building on existing record models**.
- **GRC Advanced (₹50k): ~25–30% there.** Continuous control monitoring, automated evidence collection, auditor trust center, custom frameworks, ESG, advanced SecOps are MISSING. **This is the heavy build and the true competitive frontier.**

---

## 4. The one structural gap

CoheronConnect built GRC as a **system of record**: log the risk, log the control, log the incident, upload the evidence. The market leaders are **systems of continuous assurance**: automatically prove each control is working, every hour, and expose that proof to an auditor with no human in the loop.

Closing that inversion — from manual attestation to automated evidence — is the single highest-leverage move, and it is precisely what should justify the Advanced tier's price. Everything else on the Advanced list (framework mapping, custom frameworks, board dashboards, ESG) hangs off the same evidence-and-controls spine.

---

## 5. Recommended sequencing (summary — detail in the work-item map)

1. **Harden Basic** (low effort, high trust): policy-acknowledge tracking, DPDP consent basics, wire board KPIs. Ships the "included" tier honestly.
2. **Build the framework + control spine (GRC+):** framework library, control↔requirement mapping, multi-framework lens, real vendor questionnaires, board dashboards.
3. **Build the continuous-assurance engine (Advanced):** integration connectors → automated evidence → continuous control tests → auditor trust center. Sequence the **automated-evidence-collection engine first** — it is the credibility gate for the entire tier.

---

## 6. Bottom line

The record layer is real and, for India secretarial/statutory, genuinely ahead of the global GRC specialists. The automation layer that _defines_ the 2026 GRC category is absent. Position **Basic** as an honest, already-shipped inclusion; use **GRC+** to build the framework spine on top of the strong record models; reserve **Advanced** for the continuous-assurance engine, and build automated evidence collection first so the tier's headline features (framework mapping, continuous monitoring) are backed by a working engine rather than a checklist.
