# CoheronConnect — GRC 3-Tier Feature → Work-Item Map

**Date:** 2026-07-03
**Prepared by:** Engineering
**Companion to:** `docs/GRC_GAP_ANALYSIS_2026-07-03.md` (benchmark + gaps), `docs/GRC_BASIC_HARDENING_BACKLOG_2026-07-03.md` (Basic detail).

This maps every feature in the proposed 3-tier GRC model to concrete work items against real schema/router files. Each row states the **status today**, the **build**, the **primary files**, and a **relative effort** (S / M / L / XL).

Effort key: **S** = ≤ a few days (extend existing table/router). **M** = new table(s) + router procedures + UI. **L** = new subsystem, multiple tables, worker jobs. **XL** = new engine with external integration connectors + continuous execution.

Reuse note: `packages/db` is consumed from its compiled `dist/`. After any schema change run `pnpm --filter @coheronconnect/db build` before `apps/api` typechecks pick it up (per `CLAUDE.md`). Follow the FK `onDelete` policy in `docs/DATA_MODEL.md` (`orgId → organizations` = CASCADE; child → parent = CASCADE; nullable actor = SET NULL).

---

## Tier 1 — GRC Basic (included, all plans)

Goal: **harden, do not build.** These are shipped. Detail and acceptance criteria live in the hardening backlog.

| Feature | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Compliance calendar & deadline tracking | EXISTS | None (verify reminder dispatch fires via worker) | `apps/api/src/routers/india-compliance.ts`, `packages/db/src/schema/india-compliance.ts` | — |
| Policy management — create, version, acknowledge | PARTIAL | Add per-user **acknowledgement** tracking (the "acknowledge" claim is unbacked today) | new `policy_acknowledgements` table; `packages/db/src/schema/grc.ts` (`policies:139`); `apps/api/src/routers/grc.ts` | S |
| Basic risk register — log & categorise | EXISTS | None | `packages/db/src/schema/grc.ts:103` (`risks`) | — |
| Unified audit trail across all modules | EXISTS | None | `packages/db/src/schema/auth.ts` (`auditLogs`), `apps/api/src/routers/security.ts` (siemExportPreview) | — |
| DPDP Act compliance — consent & data principal | PARTIAL | RoPA + breach clocks exist; add **consent capture/proof** + **data-principal (DSAR) request** intake | `packages/db/src/schema/issuer-programme.ts` (`dpdpProcessingActivities`, `privacyBreachNotificationProfiles`); new `consent_records`, `data_principal_requests` | M |
| India statutory — TDS, ECR, PF | EXISTS | None | `apps/api/src/routers/india-compliance.ts`, `packages/db/src/schema/india-compliance.ts` | — |
| Approvals & workflow engine | EXISTS | None | `apps/api/src/routers/approvals.ts`, `packages/db/src/schema/approvals.ts` | — |

---

## Tier 2 — GRC+ (₹25,000/month add-on)

Goal: **build the framework + control spine and depth features on top of the strong record models.** This is where "packaged, deeper" becomes real capability, not just repackaging Basic.

### 2.1 Control framework library + mapping

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Framework catalog (ISO 27001, SOC 2, SEBI, RBI) | MISSING | New tables: `frameworks`, `framework_requirements` (clause/control-objective rows), seeded per standard | new `packages/db/src/schema/grc-frameworks.ts`; new procedures in `apps/api/src/routers/grc.ts` (or new `grc-frameworks.ts` router) | L |
| Control ↔ requirement mapping | MISSING | Join table `control_requirement_mappings` linking `riskControls` → `framework_requirements` | new table; extend `risk_controls` usage in `packages/db/src/schema/grc.ts:204` | M |
| Multi-framework simultaneous (cross-mapping) | MISSING | One control satisfies many requirements across frameworks; per-framework coverage rollup query | query layer over the join table; `apps/api/src/routers/grc.ts` | M |
| Statement of Applicability (SoA) view | MISSING | Derived view: requirement → mapped control → effectiveness | query only; UI page under `apps/web/src/app/app/grc` | M |

### 2.2 Deep vendor / third-party risk

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Questionnaire templates + scoring rubric | PARTIAL | Replace `max(0, 5 - rating)` heuristic (`apps/api/src/routers/vendors.ts`) with template-driven weighted scoring | extend `packages/db/src/schema/grc.ts:183` (`vendorRisks`); new `vendor_questionnaire_templates` | M |
| Assessment lifecycle + reassessment reminders | PARTIAL | Wire `nextAssessment` to worker reminders | `apps/api/src/routers/grc.ts`; `apps/worker` | S |

### 2.3 Board-level risk reporting & dashboards

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Risk trend / heatmap / drill-down | PARTIAL | Extend `grc.riskMatrix` from counts to time-series + heatmap aggregation | `apps/api/src/routers/grc.ts`; UI under `apps/web/src/app/app/grc` | M |
| Exec/board pack export (PDF) | MISSING | Server-side render of dashboard to PDF | `apps/api` + existing export util | M |

### 2.4 Risk assessment depth

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Treatment plans (structured, not free-text) | PARTIAL | Add `risk_treatment_plans` (actions, owners, due dates) beyond `risks.mitigationPlan` text | new table; `packages/db/src/schema/grc.ts:103`; `apps/api/src/routers/grc.ts` | M |
| Risk appetite / tolerance thresholds | MISSING | Per-category appetite settings; compare actual vs appetite | new `risk_appetite` table; `org-settings.ts` | S |

---

## Tier 3 — GRC Advanced (₹50,000/month total)

Goal: **build the continuous-assurance engine.** This is the heavy build and the competitive frontier (Vanta/Drata/ServiceNow class). **Sequence 3.1 first — it is the credibility gate for the whole tier.**

### 3.1 Automated evidence collection (BUILD FIRST)

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Integration connector framework | MISSING | Connector abstraction (cloud/IdP/SaaS) that fetches evidence artifacts on a schedule | new `packages/db/src/schema/grc-evidence.ts`; new worker jobs in `apps/worker`; reuse `packages/db/src/schema/integrations.ts` secret storage | XL |
| Automated evidence artifacts → controls | PARTIAL | Extend `riskControlEvidence` (today manual URI only, `grc.ts:231`) with `source` (manual/automated), `collectedAt`, `connectorId`, freshness | `packages/db/src/schema/grc.ts:231`; worker | L |
| Evidence freshness / staleness alerts | MISSING | Flag controls whose latest evidence is older than test frequency | `apps/api/src/routers/grc.ts`; worker | M |

### 3.2 Continuous control monitoring

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Automated control tests (scheduled) | MISSING | Test definitions per control; scheduled execution; pass/fail history | new `control_tests`, `control_test_runs` tables; worker; `apps/api/src/routers/grc.ts` | XL |
| Test → effectiveness auto-update | MISSING | Failing test flips `riskControls.effectivenessRating` | `packages/db/src/schema/grc.ts:204`; worker | M |
| Continuous compliance status per framework | MISSING | Live rollup from test results → framework coverage | query over 3.1 + 2.1; `apps/api/src/routers/grc.ts` | M |

### 3.3 Auditor trust center / portal

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Read-only auditor access role | MISSING | Scoped external role + auth path (reuse portal pattern) | `packages/auth`; `packages/db/src/schema/portal.ts` (portal-user pattern exists) | L |
| Trust-center view (controls + evidence + audit trail) | MISSING | Auditor-facing page exposing controls, mapped requirements, evidence, remediation | new pages under `apps/web`; `apps/api` read procedures | L |
| Evidence request / fulfilment flow | MISSING | Auditor requests → owner fulfils inside portal (no email) | new `auditor_requests` table | M |

### 3.4 Custom control frameworks

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Org-defined frameworks + requirements | MISSING | Reuse 2.1 tables with an `isCustom`/`orgId` owner flag; builder UI | `packages/db/src/schema/grc-frameworks.ts`; `apps/web` | M |

### 3.5 Advanced SecOps

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| Threat detection / alert correlation | MISSING | Correlate `securityIncidents` + `vulnerabilities` + SIEM feed into detections | `packages/db/src/schema/security.ts`; `apps/api/src/routers/security.ts`; worker | XL |
| Security posture score | PARTIAL | Aggregate vuln severity + control effectiveness into a posture index | `apps/api/src/routers/security.ts` + `grc.ts` | M |

### 3.6 ESG reporting

| Item | Status | Work | Primary files | Effort |
|---|---|---|---|---|
| ESG metric registry + reporting | MISSING | New tables for E/S/G metrics, periods, disclosures; report export | new `packages/db/src/schema/esg.ts`; new `apps/api/src/routers/esg.ts`; `apps/web` | L |

### 3.7 Third-party auditor portal — direct evidence access

Covered by 3.3 (same portal; "direct evidence access" is the evidence-request/fulfilment flow).

---

## 4. Build sequence (dependency-ordered)

1. **Basic hardening** — policy acknowledgement, DPDP consent/DSAR intake, board KPI wiring. (Unblocks honest "included" tier.)
2. **GRC+ framework spine** — `frameworks` + `framework_requirements` + `control_requirement_mappings` (2.1). *Everything in Advanced hangs off this.*
3. **GRC+ depth** — vendor questionnaires (2.2), board dashboards (2.3), treatment plans (2.4).
4. **Advanced 3.1 automated evidence collection** — the credibility gate. Build the connector framework + evidence pipeline before anything else in Advanced.
5. **Advanced 3.2 continuous control monitoring** — depends on 3.1 (evidence) + 2.1 (frameworks).
6. **Advanced 3.3 auditor trust center** — depends on 3.1/3.2 (there must be evidence to show).
7. **Advanced 3.4–3.6** — custom frameworks, advanced SecOps, ESG (parallelisable once the spine exists).

---

## 5. Effort roll-up (relative, not calendar)

| Tier | Dominant effort | Nature |
|---|---|---|
| Basic | S–M | Hardening existing tables/routers |
| GRC+ | M–L | New tables mapping onto existing record models |
| Advanced | L–XL | New engine + external connectors + continuous execution + external portal |

The Advanced tier is where the genuine platform investment sits; GRC+ is high-leverage because it reuses the already-strong risk/control/policy record layer.
