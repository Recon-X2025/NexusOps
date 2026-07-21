# CoheronConnect — Competitive Gap Analysis (Two-Level)

**Date:** 2026-06-30
**Prepared by:** Engineering (code-grounded audit)
**Method:** Deep code inspection of the shipped product (54 tRPC routers, 202 Postgres tables, 129 frontend pages) benchmarked against the 2026 capabilities of category market leaders.
**Audience:** Developers (this file). A non-technical DOCX summary is circulated separately.

---

## 0. How to read this document

This is an **evidence-based** assessment. "Shipped" means the capability was found in code with a concrete file reference, not inferred from a roadmap. Each module is scored on a **maturity %** (how complete the shipped capability is relative to a credible product, not relative to the absolute frontier) and then assessed at **two levels**:

- **Enterprise level** — what a 5,000+ employee buyer expects (ServiceNow, Workday, NetSuite, Salesforce, Coupa class).
- **SMB ≤500 level** — what a startup / SMB up to ~500 employees actually needs to run the function (Freshservice, Rippling, QuickBooks/Zoho, HubSpot, Zip class).

The gap at each level is rated:

- **GA** — competitive / good enough to win the deal at this level.
- **PARTIAL** — usable but missing things buyers will notice.
- **GAP** — materially behind; a blocker for that segment.

The central finding: **CoheronConnect is broadly GA-to-PARTIAL for the SMB ≤500 segment and PARTIAL-to-GAP for the enterprise segment.** Its breadth (one platform spanning ITSM + Finance + HR + CRM + GRC + India compliance) is unusual and is the core differentiator; its depth in any single tower trails the category specialist, and the 2026 frontier (agentic AI, real-time/continuous automation) is largely not yet met.

---

## 1. Executive summary

### 1.1 What is genuinely strong (real, not stubbed)

| Capability | Evidence | Why it matters |
|---|---|---|
| **Double-entry accounting** | `accounting.ts` — debits=credits enforced (0.001 tol) | Real GL, not a ledger veneer |
| **Procure-to-pay with 3-way match** | `lib/invoice-po-match.ts` (invoice≈PO≈GRN), accrual JEs | Coupa/Ariba-class control primitive present |
| **India payroll + tax engine** | `@coheronconnect/payroll-math` — dual-regime tax, surcharge w/ marginal relief, EPF/ESI/PT/LWF; 12-step `computeEmployeePayslip()` | Genuinely deep, India-specific; hard for global players to match |
| **India statutory rails** | GST IRN (ClearTax), TDS, DLT SMS (MSG91), Aadhaar e-Sign (eMudhra), Razorpay | Localisation moat |
| **Platform security baseline** | SAML 2.0 SSO (`services/saml.ts`), RBAC + step-up, encrypted integration secrets, audit log | Passes a basic enterprise security review |
| **Breadth on one tenant model** | 54 routers, single orgId-scoped data model | The "one platform" story is real |

### 1.2 The four structural weaknesses

1. **Agentic AI gap (the 2026 bar).** Every leader now ships autonomous/assistive AI: ServiceNow autonomous agents, Salesforce Agentforce, HubSpot Breeze, Drata AI tests, Atlassian Intelligence triage. CoheronConnect has an AI copilot with server-side memory (`agent.ts`/`ai.ts`) but no autonomous action-taking, no per-module AI (ticket triage, forecast, anomaly detection).
2. **"Inventory not telemetry" pattern.** Several observability-adjacent modules store records but don't *do* the live function: **APM is an application inventory** (no real metrics/traces), **DevOps is event-logging** (no CI/CD execution), **on-call escalation is stored but not enforced** (no actual paging engine).
3. **Reporting is dashboards, not analytics.** Operational dashboards exist; there is no ad-hoc report builder, no forecasting, no cross-module BI — table stakes at enterprise level.
4. **Enterprise identity/governance gaps.** No SCIM, MFA is admin-attestation (no self-service TOTP), no DB row-level security, no resource-level ACLs, no custom-role builder wired to permissions.

### 1.3 Verdict by segment

- **SMB ≤500:** Competitive today as a consolidation play ("replace 6 tools with 1"), especially for India-based or India-operating companies. Main risks: reporting depth, AI parity expectations, and a few module stubs (APM/DevOps/on-call) that should be repositioned or hidden rather than shown as features.
- **Enterprise:** Not yet a primary-system replacement for any single tower. Viable as a department/regional system (esp. India ops, GRC, or ESM) but blocked from the core seats by identity/governance gaps, analytics depth, scale-proof points, and AI parity.

---

## 2. Platform scale (inventory baseline)

| Dimension | Count | Notes |
|---|---|---|
| tRPC routers | 54 | ~23,500 LOC of business logic |
| Postgres tables | 202 | ~48 schema domains |
| Frontend pages | 129 | `apps/web/src/app/**/page.tsx` |
| Real integrations | 12 (16 in catalog) | India-first: WhatsApp, SMS, Razorpay, ClearTax, eMudhra |
| Deepest routers | tickets 2,225 · hr 1,622 · accounting 951 · financial 885 · payroll 816 LOC | depth proxy |

---

## 3. Module-by-module gap analysis

Legend: **GA** / **PARTIAL** / **GAP** per segment. Maturity % is relative to a credible product in that category.

### 3.1 ITSM / ESM (tickets, changes, problems, work orders, catalog, knowledge, approvals)

- **Leaders (2026):** ServiceNow (sole Gartner Leader for AI in ITSM; ~100k incidents/hr scale; autonomous agents), Jira Service Management (Atlassian Intelligence triage/summarisation, alert grouping), Freshservice (Freddy AI, fast mid-market deploy).
- **Shipped:** Full ticket lifecycle, SLA definitions + checker, change/CR workflow, service catalog + cart (`catalog.ts`), KB with revisions, approval workflows, assignment rules, ServiceNow import dry-run helper (`integrations.ts`). Maturity **~75%**.
- **Enterprise:** **PARTIAL** — solid ITIL spine, but no AI triage/virtual agent, CMDB is basic, no 100k/hr scale proof, no major-incident command tooling at SN depth.
- **SMB ≤500:** **GA** — matches Freshservice/JSM core; the migration dry-run is a real switching aid. Missing: AI deflection (now expected even at SMB).

### 3.2 CMDB / Assets

- **Shipped:** Asset register + CI relationships (`assets.ts`, 740 LOC). Maturity **~60%**.
- **Enterprise:** **GAP** — no discovery, no service mapping, no dependency-driven impact analysis (ServiceNow's core moat).
- **SMB ≤500:** **PARTIAL** — adequate inventory; lacks auto-discovery agents (Freshservice now AU-model + discovery).

### 3.3 Observability — APM / Events / On-call

- **Leaders:** Datadog (metrics/traces/logs), PagerDuty (enforced escalation, AIOps).
- **Shipped:** APM = **application inventory only** (no metric/trace ingestion); events router has suppression rules but correlation is thin; on-call schedules + escalation policies are **stored but not enforced** (no paging engine). Maturity **~30%**.
- **Enterprise:** **GAP**. **SMB ≤500:** **GAP** — recommend repositioning these as "service registry / on-call roster" rather than competing with Datadog/PagerDuty.

### 3.4 DevOps / CI-CD

- **Shipped:** Event logging of deploys/releases; **no pipeline execution**. Maturity **~25%**.
- **Both segments:** **GAP** — not a DevOps tool; should be framed as a change/release audit trail, not CI/CD.

### 3.5 HCM / Core HR

- **Leaders (2026):** Workday (governed, finance-aligned, global), Rippling (unified HR+IT+payroll, auto-provisioning), BambooHR (SMB simplicity).
- **Shipped:** Employee master, org structure, lifecycle, workforce, performance (`hr.ts` 1,622 LOC, `performance.ts`, `workforce.ts`). Maturity **~70%**.
- **Enterprise:** **PARTIAL** — no global/multi-country HR depth, no advanced talent/succession/planning, no Workday-class configurability.
- **SMB ≤500:** **GA** for India-centric orgs; **PARTIAL** globally (BambooHR-level UX polish + benefits admin ecosystem not matched).

### 3.6 Payroll

- **Leaders:** Rippling/Deel (global), Zoho Payroll/RazorpayX/greytHR/Keka (India).
- **Shipped:** 12-step `computeEmployeePayslip()`, dual-regime tax with surcharge marginal relief, EPF/ESI/PT/LWF, bank-file export, Form-16 aggregation. Maturity **~80% (India), ~10% (global)**.
- **Enterprise:** **PARTIAL** (India), **GAP** (multi-country).
- **SMB ≤500 (India):** **GA** — genuinely competitive with greytHR/Keka on the compute engine. Missing: employee self-service depth, statutory *filing* straight-through (currently calendar/reminder, not e-filing).

### 3.7 Accounting / Finance / ERP

- **Leaders:** NetSuite (enterprise ERP), QuickBooks/Xero/Zoho Books (SMB).
- **Shipped:** Double-entry GL, AP/AR, budgeting, financial statements (`accounting.ts` 951, `financial.ts` 885). Maturity **~70%**.
- **Enterprise:** **GAP** — no multi-entity consolidation, multi-currency depth, revenue recognition (ASC 606), or fixed-asset depreciation at NetSuite level.
- **SMB ≤500:** **GA-to-PARTIAL** — covers core books; bank-feed reconciliation and a polished reporting pack are the main gaps vs Zoho/QuickBooks.

### 3.8 Procurement / Vendors (S2P)

- **Leaders:** Coupa, SAP Ariba, Zip.
- **Shipped:** PR→PO→GRN→invoice with 3-way match, vendor master, approvals (`procurement.ts` 697). Maturity **~70%**.
- **Enterprise:** **PARTIAL** — no supplier network/catalog marketplace, no sourcing/RFx events, limited spend analytics.
- **SMB ≤500:** **GA** — the 3-way match + approval chain is exactly the SMB control story Zip sells.

### 3.9 CRM / Sales / CSM

- **Leaders (2026):** Salesforce (Agentforce autonomous agents), HubSpot (Breeze AI).
- **Shipped:** Leads/accounts/opportunities, pipeline, CSM (`crm.ts` 572 + `crm/index` 444, `csm.ts`). Maturity **~55%**.
- **Enterprise:** **GAP** — no automation/sequences, no forecasting, no AI, no CPQ.
- **SMB ≤500:** **PARTIAL** — pipeline tracking works; missing email sequences, marketing automation, and AI assist that even HubSpot's free/starter tiers now imply.

### 3.10 GRC / Security / Compliance

- **Leaders (2026):** Vanta (startup-friendly), Drata (continuous monitoring, 300+ integrations, 1,000+ infra tests, AI test generation, risk register).
- **Shipped:** Controls, risk, policies, vulnerability import + dedupe, SIEM event schema, security router (`grc.ts`, `security.ts` 451). Maturity **~55%**.
- **Enterprise:** **GAP** — no continuous evidence collection, no auditor-facing trust center automation, framework library shallow.
- **SMB ≤500:** **PARTIAL** — register/policy/vuln basics present; lacks the always-on automated evidence collection that *is* the Vanta/Drata product.

### 3.11 India compliance + Secretarial / Legal / Documents / e-Sign

- **Shipped:** GST/IRN, TDS, DLT SMS, MCA/secretarial filings calendar (`secretarial.ts` 678), CLM (`legal.ts` 769), DMS (`documents.ts`), IT-Act-compliant e-sign audit trail (`esign.ts`). Maturity **~70%**.
- **Enterprise:** **PARTIAL** — strong localisation; secretarial/CLM are management layers, not straight-through filing/contract-AI.
- **SMB ≤500:** **GA** — this cluster is a genuine differentiator; few competitors bundle India statutory + secretarial + e-sign + DMS.

### 3.12 Platform foundation (Auth / RBAC / Tenancy / Audit / Integrations / Custom fields)

- **Shipped:** SAML SSO, RBAC + step-up, app-layer multi-tenancy (orgId everywhere, ~90% coverage), audit log (mutations), 11-entity custom fields, 12 real integrations, webhooks, API keys. Maturity **~80%**.
- **Enterprise:** **PARTIAL** — **GAP** specifically on SCIM (none), self-service MFA/TOTP (attestation only), DB RLS (none), resource-level ACLs (none), custom-role builder (schema exists, not wired).
- **SMB ≤500:** **GA** — exceeds typical SMB identity needs.

---

## 4. Cross-cutting gaps (apply to every module)

1. **Agentic / assistive AI per module** — triage, drafting, forecasting, anomaly detection, autonomous actions. This is the single biggest 2026 parity gap.
2. **Analytics & reporting** — ad-hoc report builder, cross-module BI, forecasting. Today: fixed operational dashboards only.
3. **Enterprise identity/governance** — SCIM, self-service MFA, DB RLS, resource-level ACLs, custom roles.
4. **Scale proof** — no published throughput/HA/DR posture; enterprise buyers require it.
5. **Module honesty** — APM/DevOps/on-call are inventories/logs, not the live tools they resemble; reposition to avoid failed POCs.

---

## 5. Prioritised recommendations

### 5.1 SMB ≤500 (defend & win the consolidation play)
1. Ship per-module AI assist (ticket triage/deflection, invoice capture, payroll anomaly flags) — meets the new baseline.
2. Add a lightweight report builder + saved views + scheduled exports.
3. Bank-feed reconciliation (accounting) and employee self-service (payroll/HR).
4. Reposition APM/DevOps/on-call as registry/roster/audit features; remove "monitoring" framing.
5. Lead India GTM with the statutory+secretarial+e-sign bundle — it's the clearest moat.

### 5.2 Enterprise (unblock department/regional wins)
1. SCIM 2.0 + self-service TOTP MFA + DB RLS (security review table stakes).
2. Custom-role builder wired to permission resolution + resource-level ACLs.
3. Multi-entity / multi-currency consolidation in accounting.
4. Real CMDB discovery OR explicitly scope out of enterprise ITSM deals.
5. Publish scale/HA/DR and a trust-center; pursue SOC 2 / ISO 27001 (and dogfood the GRC module).

---

## 6. Maturity scoreboard (one-glance)

| Module | Maturity | Enterprise | SMB ≤500 |
|---|---|---|---|
| ITSM/ESM | 75% | PARTIAL | GA |
| CMDB/Assets | 60% | GAP | PARTIAL |
| APM/Events/On-call | 30% | GAP | GAP |
| DevOps/CI-CD | 25% | GAP | GAP |
| HCM/Core HR | 70% | PARTIAL | GA* |
| Payroll (India) | 80% | PARTIAL | GA |
| Payroll (global) | 10% | GAP | GAP |
| Accounting/Finance | 70% | GAP | GA-PARTIAL |
| Procurement/Vendors | 70% | PARTIAL | GA |
| CRM/Sales/CSM | 55% | GAP | PARTIAL |
| GRC/Security | 55% | GAP | PARTIAL |
| India compliance/Secretarial/Legal/e-Sign | 70% | PARTIAL | GA |
| Platform foundation | 80% | PARTIAL | GA |

\*GA for India-centric SMBs; PARTIAL globally.

---

## 7. Bottom line

CoheronConnect's bet is **breadth + India depth on one tenant model**. That bet is real in the code and is a defensible SMB ≤500 consolidation story, strongest for India-operating companies. To move up-market it must close identity/governance and analytics gaps and meet the 2026 AI bar; to stay ahead in SMB it must add per-module AI assist and stop presenting inventory-grade modules (APM/DevOps/on-call) as live tooling.
