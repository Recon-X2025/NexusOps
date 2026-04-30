# CoheronConnect — Security & Compliance Gap Analysis (Enterprise / CISO View)

**Perspective:** Chief Information Security Officer (e.g., global manufacturing / technology enterprise)  
**Scope:** CoheronConnect **Security** (`security`), **GRC** (`grc`), supporting **identity**, **audit**, **integrations**, and related compliance surfaces in-repo  
**Audience:** Security, risk, internal audit, vendor risk, and IT governance teams  
**Date:** April 2026  

---

## 1. Executive summary

CoheronConnect implements a **foundational security operations and governance layer**: security incidents with a **defined lifecycle**, **vulnerability records** with remediation tracking, **GRC primitives** (enterprise risks, policies, audit plans, vendor risk registers), **org-scoped RBAC** with dedicated **security / GRC matrix roles**, **structured API logging**, **mutation audit trails** with **sensitive-field redaction**, and **encrypted integration configuration** at rest. These capabilities support **early-stage GRC demos** and **lightweight SecOps workflows**.

For an enterprise such as **HP Inc.**, typical expectations also include **mature control frameworks** (mapped controls, evidence, continuous monitoring), **enterprise IAM** (SSO/MFA breadth, privileged access, lifecycle), **cryptographic key management** aligned to corporate standards, **comprehensive audit and SIEM export**, **regulated incident and breach workflows**, **deep third-party risk**, and **attestation-ready reporting**. Those areas are **partially or not yet represented** at the depth a Fortune-class security programme usually requires.

**Bottom line:** CoheronConnect is a **credible modular starting point** for security and compliance inside a broader ERP-style suite, but it is **not a drop-in replacement** for enterprise GRC platforms, full SOC tooling, or regulated security operations without significant roadmap work and surrounding process/tooling.

---

## 2. What CoheronConnect already provides (observed)

| Area | Implementation notes |
|------|----------------------|
| **Security incidents** | `security` router: list/get/create, **state machine** (new → triage → containment → eradication → recovery → closed / false positive), containment actions, severity taxonomy, dashboards counts (`apps/api/src/routers/security.ts`). |
| **Vulnerabilities** | Create/list, CVE/CVSS fields, remediate mutation; separate `vulnerabilities` permission module. |
| **GRC** | Risks (scoring, treatment), policies (publish), audit plans, vendor risks, risk matrix query (`apps/api/src/routers/grc.ts`). |
| **RBAC** | `permissionProcedure` + DB-backed checks; roles include `security_admin`, `security_analyst`, `grc_analyst` (`packages/types/src/rbac-matrix.ts`). |
| **Audit trail (mutations)** | Successful **mutations** written to `audit_logs` with path as action, resource type/id, **sanitized** input (`apps/api/src/lib/trpc.ts`, `audit-sanitize.ts`). |
| **Security logging** | Auth failures, RBAC denials, DB/server errors, slow requests, query timeouts; **traceId** on errors (`trpc` error formatter). |
| **Integrations** | Connector config **encrypted** with AES-256-CBC using key derived from `APP_SECRET` (`integrations` router). |
| **Regional compliance (India)** | Separate `indiaCompliance` / secretarial-style filings and calendars — **not** a global control framework (`apps/api/src/routers/india-compliance.ts`). |
| **Inventory of sensitive API** | Maintainer doc listing write/admin surfaces for access review (`docs/SECURITY_SENSITIVE_MUTATIONS.md`). |

---

## 3. Gap analysis by domain

### 3.1 Identity and access management (IAM)

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| Corporate **SSO** (SAML 2.0 / OIDC) for all workforce apps | OIDC routes exist; **SSO feature-flagged** by plan in MAC (`sso: false` until enterprise) | **Partial** — HP-scale usually mandates **SAML + SCIM** and contractual SLAs, not only OIDC/social patterns. |
| **MFA** enforced per policy (step-up, risk-based) | Profile UI references admin-managed **TOTP**; RBAC context shows `mfaEnabled` placeholders | **Partial / verify** — CISO needs **enforced MFA**, recovery flows, and **policy by role/group**, not UI-only hints. |
| **Privileged access** (PIM/JIT, break-glass, session recording) | Standard org roles + admin procedure | **Gap** at **PIM/JIT**, **just-in-time elevation**, and **session capture** for privileged actions. |
| **SoD** (maker-checker on financial + sensitive security actions) | RBAC separates modules; **not** a full SoD rule engine across composite transactions | **Partial** — SoD is **process + tool**; product support for **explicit rules** (e.g. same user cannot approve + post) needs validation per module. |

### 3.2 Security operations (SecOps / IR)

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **IR playbooks**, tasks, war room, comms templates | Linear state machine + containment action list | **Gap** vs **NIST 800-61**-style playbooks, **task orchestration**, and **stakeholder comms** tied to incidents. |
| **IOC / threat intel**, malware hash, ATT&CK mapping | Not evident in `security` router surface | **Gap**. |
| **Linkage** to IT incidents, CMDB, change records | General `tickets` and `security` are **separate** tracks | **Partial** — **bidirectional linking** and **single pane** for “business incident vs security incident” often required. |
| **Breach / privacy** notification clocks, legal hold | Not in security router | **Gap** for **regulated** breach workflows (GDPR, US state laws, sector rules). |
| **SIEM** integration (CEF, JSON export, native apps) | Structured logs exist; **productised SIEM connectors** not assumed | **Partial** — enterprise needs **documented schema**, **high-value event** list, and **tamper-evident** log shipping. |

### 3.3 Vulnerability and patch management

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **Scanner ingestion** (Tenable, Qualys, Wiz, etc.) | Manual `createVulnerability` API | **Gap** for **automated** feed, **asset correlation**, **duplicate merging**. |
| **Remediation SLAs** by severity, exception workflow | Status + `remediatedAt`; no built-in SLA engine for vulns | **Partial**. |
| **EPSS**, exploit availability, business context | Not observed | **Gap** for **risk-based prioritisation** at scale. |

### 3.4 GRC, audit, and control frameworks

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **Control library** (NIST 800-53, ISO 27001 Annex A, SOC 2 TSC) | Generic risks/policies/audits | **Gap** — no **control ID taxonomy** or **mapping** in API reviewed. |
| **Evidence collection** (samples, screenshots, API pulls) with **workflow** | Audit **plans** exist; not a full **evidence locker** + attestation | **Gap** for **Big-4 / SOC** style evidence. |
| **Continuous control monitoring** (CCM) | Not observed as first-class | **Gap**. |
| **Policy lifecycle** (versioning, attestation, employee read receipts) | Publish on policy | **Partial** vs **campaign-based** attestation. |
| **Vendor risk** (questionnaires, tiering, residual risk, SOC 2 report storage) | Vendor risk **register** with tier/score fields | **Partial** — depth of **due diligence** and **document** management typically **lighter** than OneTrust / Archer-class. |

### 3.5 Data protection and cryptography

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **Encryption at rest** (DB, blobs) | Deployment-dependent (cloud KMS, disk encryption) — **not** asserted by app code alone | **Clarify** in **customer DPA / architecture**; CISO treats as **infra responsibility** unless product guarantees **application-level** encryption. |
| **Key management** (per-tenant keys, rotation, HSM) | Integration config uses **APP_SECRET-derived** symmetric key | **Gap** vs **KMS**, **per-tenant** keys, **rotation runbooks** — HP crypto standards usually **exclude** long-lived single-app secrets for all tenants. |
| **Field-level encryption** for highly sensitive attributes | Audit redaction for known secret-like **keys** in logs | **Partial** — **PII/PCI** field encryption in DB is a **separate** architecture question. |
| **Data residency / sovereignty** | Multi-tenant **org** model; **India** compliance module exists | **Partial** — global enterprise needs **region pinning**, **DPA**, and **subprocessor** governance **outside** a single compliance router. |

### 3.6 Audit logging and non-repudiation

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **Immutable** audit log | PostgreSQL `audit_logs`; **admin list** in `admin` router | **Partial** — enterprises often require **append-only** store, **WORM**, or **SIEM** copy with **legal hold**. |
| **Read access** and **high-risk queries** logged | Mutation middleware audits **writes**; broad **read** audit not universal | **Gap** for **complete** CRUD audit (common for regulated data). |
| **Integrity** (hash chain / signatures) | Not observed | **Gap** for **tamper detection**. |

### 3.7 Platform and secure engineering

| Enterprise expectation | CoheronConnect (observed) | Gap |
|------------------------|---------------------|-----|
| **Vulnerability disclosure / bug bounty** | Process not in repo | **Org-level** programme expected. |
| **Penetration test** summaries, **SOC 2 Type II** for vendor CoheronConnect | Not in codebase | **Commercial / legal** artefacts CISO will request **before** production for HP-scale. |
| **Secure SDLC** (SAST/DAST, dependency SBOM in CI) | Varies by pipeline — **not** fully visible from routers | **Clarify** in **vendor questionnaire**. |
| **Optional MongoDB** hybrid context | `Context` exposes `mongoDb` / `databaseProvider` | **Risk** — **dual persistence** complicates **data classification**, **backup**, and **audit** unless scope is tightly bounded. |

---

## 4. Risk register (summary)

| ID | Risk theme | Typical severity (if unmitigated) | Mitigation direction |
|----|------------|-------------------------------------|----------------------|
| R1 | **Insufficient IAM depth** (MFA enforcement, SAML/SCIM) | High | Harden auth service; contract tests; IdP integration guide. |
| R2 | **Encryption/key management** not meeting enterprise crypto policy | High | KMS integration; tenant-scoped keys; rotation. |
| R3 | **GRC not control-framework complete** | Medium–High | Control library, evidence workflows, reporting for SOC/ISO. |
| R4 | **SecOps workflows** vs NIST IR / regulated breach | Medium–High | Playbooks, links to ITSM, notification timers, reporting. |
| R5 | **Vuln management** without enterprise scanner feeds | Medium | Connectors, normalisation, SLA dashboards. |
| R6 | **Audit completeness** (reads, integrity) | Medium | Expand audit policy; optional SIEM-first architecture. |
| R7 | **Vendor assurance** for CoheronConnect as a supplier | Medium | Customer-facing **trust centre**, pen test, SOC 2, DPIA. |

---

## 5. Recommended due diligence questions (for procurement)

1. What **certifications** (SOC 2, ISO 27001) cover the CoheronConnect SaaS boundary, and what is **in scope**?
2. How are **encryption keys** managed in production, and is **customer-managed keys** (CMK) available?
3. What is the **subprocessor** list and **data residency** story per region?
4. How are **admin** and **break-glass** actions logged and reviewed?
5. Can **all** security-relevant events be exported to **Splunk / Sentinel / Chronicle** in a documented format?
6. What is the **RTO/RPO** and **DR** test evidence for the tenant data plane?
7. How does the product support **DPIA** and **records of processing** for HR/finance data in the same suite?

---

## 6. Code and doc references (for CoheronConnect maintainers)

| Topic | Location |
|-------|----------|
| Security incidents & vulnerabilities | `apps/api/src/routers/security.ts` |
| GRC (risk, policy, audit, vendor risk) | `apps/api/src/routers/grc.ts` |
| RBAC matrix | `packages/types/src/rbac-matrix.ts` |
| Mutation audit + redaction | `apps/api/src/lib/trpc.ts`, `apps/api/src/lib/audit-sanitize.ts` |
| Audit log schema | `packages/db/src/schema/auth.ts` (`audit_logs`) |
| Admin audit queries | `apps/api/src/routers/admin.ts` |
| Integration encryption | `apps/api/src/routers/integrations.ts` |
| Sensitive mutation inventory | `docs/SECURITY_SENSITIVE_MUTATIONS.md` |

---

## 8. Security & compliance gap-closure — sprint plan (Scrum)

This section maps **§3 gaps** and **§4 risks (R1–R7)** to a **time-boxed delivery plan** for one cross-functional team (backend, web/platform, QA, product, security champion). Adjust capacity or run a **parallel IAM/crypto track** if staffing allows.

### 8.1 Cadence and guardrails

| Item | Proposal |
|------|----------|
| **Sprint length** | 2 weeks |
| **Ceremonies** | Sprint Planning (goal + forecast), Daily Scrum, Sprint Review, Sprint Retrospective |
| **Backlog refinement** | Weekly; security stories reviewed by **security champion** before sprint start |
| **Definition of Ready** | Threat model or data-flow note for **crypto/auth** items; acceptance criteria include **RBAC** and **audit** expectations |
| **Definition of Done** | Merged, tested (including permission checks), **docs/runbooks** updated for ops-affecting changes; **no regression** of `audit_logs` / `sanitizeForAudit` behaviour |

**Product goal (program):** *A security officer can demonstrate **enterprise-credible** IAM hardening, **audit/SIEM readiness**, **IR beyond a flat state machine**, **scanner-fed vuln management**, **control/evidence GRC**, and a **clear key-management story** — without claiming full Archer/ServiceNow GRC parity.*

**Ordering:** **Spikes first** (Sprint 0), then **R1/R2** (IAM + keys), then **R6** (audit), **R4/R5** (SecOps + vulns), **R3** (GRC depth), **R7** (external assurance pack).

---

### 8.2 Sprint 0 — discovery (1 week; spike sprint)

| ID | Backlog item | Maps to |
|----|----------------|---------|
| SPIKE-S0-01 | **SAML 2.0 / SCIM** target architecture vs current OIDC (`registerOidcRoutes`) | §3.1, R1 |
| SPIKE-S0-02 | **KMS / CMK** options for integration secrets (replace or wrap `APP_SECRET`-derived AES) | §3.5, R2 |
| SPIKE-S0-03 | **SIEM** canonical event schema + transport (webhook, S3, syslog) decision | §3.2, §3.6, R6 |
| SPIKE-S0-04 | **Control framework** MVP scope (e.g. NIST 800-53 rev5 moderate subset vs ISO Annex A slice) | §3.4, R3 |
| SPIKE-S0-05 | **Read-audit** policy: which routers/resources, sampling vs full, perf budget | §3.6, R6 |

**Sprint goal:** *Written ADRs for auth/KMS/SIEM/control scope; no production feature requirement.*

---

### 8.3 Sprint 1 — IAM: MFA enforcement and SSO readiness

**Sprint goal:** *High-assurance orgs can **require** MFA for selected roles and prepare IdP-led SSO per ADR.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S1-1 | **MFA policy** per org: required for `owner`/`admin` and optional matrix roles; block sensitive procedures if MFA not satisfied | Align with session/user flags; update profile UX beyond toast |
| PBI-S1-2 | **Recovery / admin reset** path documented and implemented (support break-glass) | Logged to `audit_logs` + structured security log |
| PBI-S1-3 | **SSO readiness** slice per Sprint 0 ADR (e.g. SAML metadata upload, IdP entity ID) or documented **OIDC enterprise** checklist | Feature flag / plan gating explicit in config |

**Risks:** IdP variance; regression on existing Google OIDC flows — add contract tests.

---

### 8.4 Sprint 2 — Cryptography: integration secrets and key story

**Sprint goal:** *Integration configs meet **enterprise key-management** expectations from §3.5.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S2-1 | **Envelope encryption** or **KMS-backed** key for `integrations.configEncrypted` per Sprint 0 ADR | Backward-compatible decrypt for legacy rows; migration script |
| PBI-S2-2 | **Key rotation runbook** + optional `rotatedAt` / key id metadata on integration row | No plaintext secrets in logs |
| PBI-S2-3 | Customer-facing **encryption appendix** for DPA / security pack (what encrypts what) | Links R7 |

---

### 8.5 Sprint 3 — Audit and SIEM export

**Sprint goal:** *Security teams can **consume** CoheronConnect events in their SOC and improve **detective controls**.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S3-1 | **Structured security event** stream: auth fail, RBAC deny, admin audit list export (JSON Lines or CEF subset) | Documented field dictionary in `docs/` |
| PBI-S3-2 | **Webhook or signed push** to customer SIEM (config in org settings, RBAC admin) | Retry + dead-letter behaviour defined |
| PBI-S3-3 | **Read-audit MVP** for §3.6: opt-in module list (e.g. `financial.*`, `admin.*` reads) behind flag | Performance tested; retention policy documented |

---

### 8.6 Sprint 4 — SecOps / IR depth and ITSM linkage

**Sprint goal:** *Security incidents support **NIST 800-61-ish** working practices and **link to IT work**.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S4-1 | **IR playbook** template entity + checklist tasks on `securityIncidents` (ordered steps, owner role) | API + minimal UI |
| PBI-S4-2 | **Link** security incident ↔ IT `tickets` (incident/request) bidirectional | Permissions: `security` + `incidents` read as needed |
| PBI-S4-3 | **Comms log** (immutable append) for regulated IR narrative | Similar pattern to ITSM major-incident comms if present |
| PBI-S4-4 | Optional **MITRE ATT&CK** tactic/technique tags on incident | Stored fields + filter |

**Maps to:** §3.2, R4.

---

### 8.7 Sprint 5 — Vulnerability management programme

**Sprint goal:** *Vulns are **fed by tools**, not only manual API.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S5-1 | **Import** job: normalised CSV or one vendor JSON format → upsert `vulnerabilities` | Idempotent; org-scoped |
| PBI-S5-2 | **Dedupe** key (CVE + asset id / hostname) and merge UI or API | Document matching rules |
| PBI-S5-3 | **Remediation SLA** due dates by severity + **exception** request record | Dashboard slice or report hook |

**Maps to:** §3.3, R5.

---

### 8.8 Sprint 6 — GRC: control library and evidence

**Sprint goal:** *Internal audit can map **controls → evidence** inside CoheronConnect.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S6-1 | **`controls`** (or equivalent) table: framework id, control id, title, description | Seed pack from Sprint 0 choice |
| PBI-S6-2 | **Map** `risks` and/or `auditPlans` to controls (many-to-many) | API + read views |
| PBI-S6-3 | **Evidence** artifact: file reference + status + link to audit plan | RBAC `grc`; virus-scan / size limits per storage policy |
| PBI-S6-4 | **Policy versioning** v1: retain prior published version | Supports §3.4 attestation roadmap |

**Maps to:** §3.4, R3.

---

### 8.9 Sprint 7 — Breach workflow and vendor risk depth

**Sprint goal:** *Privacy/regulated teams get **timers** and **vendor artefacts**; not legal advice — product supports **tracking**.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S7-1 | **Breach / privacy incident** subtype or parallel record with **jurisdiction-specific due clocks** (configurable offsets) | Notifications are customer-operated; product tracks deadlines |
| PBI-S7-2 | **Legal hold** flag on org or scoped objects + audit on toggle | Integrate with existing audit patterns |
| PBI-S7-3 | **Vendor assessment** questionnaire template + attach SOC2/report PDF metadata on `vendorRisks` | Virus scan / storage policy |

**Maps to:** §3.2, §3.4, R4.

---

### 8.10 Sprint 8 — SoD hooks, privileged access MVP, assurance pack

**Sprint goal:** *Close **R1/R7** leftovers with **demonstrable** governance.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-S8-1 | **SoD rules** v1: configurable pairs (e.g. “cannot approve and mark paid”) for **one** high-risk financial flow + tests | Document pattern for other modules |
| PBI-S8-2 | **JIT elevation** or **time-bound role grant** MVP (request/approve/expire) with full audit | Alternative: break-glass account pattern documented |
| PBI-S8-3 | **Trust centre** starter: subprocessors template, RTO/RPO placeholders, customer responsibility matrix | Lives in `docs/` or public site per product decision |
| PBI-S8-4 | **Mongo hybrid** data-classification note: which entities may use Mongo, backup/audit implications | Addresses §3.7 dual-store risk |

**Maps to:** §3.1, §3.7, R1, R7.

---

### 8.11 Dependencies and parallelisation

- **Sprint 2** (crypto) should not block **Sprint 3** (SIEM) — can parallelise after Sprint 0 if two backend engineers available.
- **Sprint 6** (GRC) benefits from **Sprint 3** export for evidence automation later — note as fast-follow.
- **Sprint 7** legal/breach features need **product/legal** review each sprint; keep **config-only** clocks first, not legal templates.

### 8.12 Team metrics (sample)

| Metric | Purpose |
|--------|---------|
| Open **critical** security incidents (mock + prod drill) | IR readiness |
| % mutations covered by `audit_logs` | Audit completeness |
| Mean time to **rotate** integration keys (drill) | Crypto operability |
| Security champion **sign-off** rate on Done | Quality gate |

---

## 9. Disclaimer

This analysis is based on **static review of the repository** and does **not** constitute a penetration test, formal risk assessment, or legal advice. HP Inc. or any other organisation must perform **independent** assurance (architecture review, DPA, compliance mapping) before relying on CoheronConnect for regulated or high-impact workloads.
