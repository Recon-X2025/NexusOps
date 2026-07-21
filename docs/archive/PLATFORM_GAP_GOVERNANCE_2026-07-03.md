# Platform Gap Analysis — Cluster 6: Governance, Security & Compliance Extras

**Date:** 2026-07-03
**Hat worn:** CISO / DPO / Company Secretary / Compliance Officer
**Benchmarks:** Splunk/Microsoft Sentinel + SOAR (SecOps), Qualys VMDR / Tenable VM (vuln), SharePoint / M-Files (DMS), DocuSign / Adobe Sign (eSign), OneTrust (privacy/DPDP), MCA21 V3 / SEBI LODR (issuer/regulatory)
**Modules covered:** Security incidents (SecOps), vulnerability management, document management (DMS), electronic signature (eSign), issuer-programme regulatory spine, DPDP/privacy, audit trail
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**The compliance *records* are excellent; the compliance *reflexes* are missing.** This cluster is where the platform's Indian-regulatory ambition is most visible — and it delivers genuine, well-built infrastructure: a real security-incident state machine, a production DMS with versioning/legal-hold/retention/virus-scan, an IT-Act-§3A-compliant Aadhaar eSign, and a comprehensive issuer/secretarial tracking spine. But the *automated obligations* — the things a regulator or auditor actually tests you on under time pressure — are largely stubbed: no CVSS-driven remediation SLAs, no DPDP consent/DSR/breach machinery, mock-only MCA filing, and an audit trail that is append-only but **not** cryptographically tamper-evident.

**One-line summary:** *A strong system of record for governance, with the time-bound, regulator-facing automation (DSR clocks, breach notification, CVSS→SLA, real statutory filing, tamper-proof audit) still to be built.*

**Cluster maturity ≈ 55/100** — lifted by DMS/eSign/SecOps records, dragged down by DPDP absence and mock filing.

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| Document management (DMS) | 72 | REAL — versioning, ACL, legal hold, retention, virus scan |
| eSign (Aadhaar / eMudhra) | 70 | REAL — IT Act §3A, multi-signer, 8-yr audit; DocuSign STUB |
| Security incident (SecOps) | 62 | REAL lifecycle + IR playbook, no detection/SOAR |
| Audit trail | 55 | REAL append-only + redaction, NOT tamper-evident |
| Issuer / secretarial spine | 48 | PARTIAL — tracking real, filing is mock |
| Vulnerability management | 40 | PARTIAL — import + SLA date, no CVSS→SLA, no workflow |
| **DPDP / privacy (consent/DSR/breach)** | **12** | **STUB — records only, no obligations engine** |
| **Cluster weighted average** | **~55** | **Records real, obligations automation absent** |

---

## 1. Document management (DMS) — REAL, cluster strength (72)

`documents.ts` (router + `schema/documents.ts`) + workflows:
- **Versioning** with immutable version rows and current-pointer.
- **ACL** — per-document access control (owner/viewer/editor grants).
- **Legal hold** — flag that blocks deletion/retention purge, the correct e-discovery primitive.
- **Retention workflow** — scheduled daily **02:00 IST** (`documentRetentionWorkflow.ts`), purges past-retention docs *except* those on legal hold.
- **Virus scan** — async BullMQ job (`virusScanWorkflow.ts`) quarantines on upload.

**Gaps vs SharePoint / M-Files:**
- **No full-text / metadata search** across the corpus — retrieval is by id/folder, not content.
- **No classification / sensitivity labels** (public/internal/confidential/restricted) driving ACL or DLP.
- **No approval/publishing workflow** for controlled documents (the ISO-9001/SOX "controlled copy" lifecycle).
- **No records-management declaration** (formal record vs working doc) — retention is date-only, not event-based ("retain 7 years *after contract end*").

---

## 2. eSign — REAL for India, DocuSign is a stub (70)

`esign.ts` (router) + `services/integrations/emudhra.ts` + `schema/esign.ts`:
- **eMudhra Aadhaar OTP** eSign — IT Act **§3A** compliant electronic signature, the legally-recognised path in India.
- **Multi-signer** envelopes with per-signer status and ordered/parallel routing.
- **Audit trail** with **8-year retention** (aligned to evidentiary needs).
- **Aadhaar hashed, not stored raw** — correct data-minimisation.

**Gaps vs DocuSign / Adobe Sign:**
- **DocuSign is enum-only** — the provider is offered in the type union but has **no implementation**; selecting it does nothing. Either build it or remove it from the UI to avoid a false capability claim.
- **No templates / reusable field-placement** — every envelope is bespoke.
- **No in-person / witness signing, no bulk send.**
- **No tamper-evident signed-PDF seal (PAdES-LTV)** returned to the signer — the audit trail is internal, not embedded in the artifact.

---

## 3. Security incident management (SecOps) — REAL lifecycle, no detection (62)

`security.ts` (router + `schema/security.ts`):
- **Incident state machine** (new→triage→contained→eradicated→recovered→closed) with enforced transitions.
- **IR playbook** steps attached to incidents (the NIST 800-61 lifecycle).
- **Severity + assignment + timeline** captured.

**Gaps vs Splunk / Sentinel + SOAR:**
- **No detection layer** — incidents are created manually; there is **no SIEM ingestion, no alert correlation, no detection rules**. This is a case-management tool, not a SOC platform.
- **No SOAR / automated response** — no playbook *actions* (isolate host, disable account, block IP); playbook steps are checklist text, not executable.
- **No threat-intel enrichment** (IoC lookup, KEV/exploit context).
- **No MTTR/MTTD analytics** on the incident corpus.
*Benchmark: Sentinel/Splunk SOAR run AI-driven playbooks that execute remediation; here response is entirely manual.*

---

## 4. Audit trail — REAL but not tamper-evident (55)

`auth.ts` audit-log infra + `lib/audit-sanitize.ts`:
- **Append-only** `auditLogs` with actor/action/target/diff.
- **`sanitizeForAudit()`** redacts secrets/PII before persistence — genuinely good hygiene.

**The compliance gap:**
- **Not cryptographically hardened.** A grep across the repo finds **no hash chain, no `prevHash`, no WORM, no signing** of audit rows. "Append-only" is enforced only by application code and table privileges — a DB admin (or a bug) can silently mutate history. For SOX/ISO-27001/DPDP evidentiary weight, auditors increasingly expect **tamper-evidence** (per-row hash chained to the previous row, or WORM storage). This is the single cheapest high-credibility hardening in the cluster.
- **No audit-log export / SIEM forwarding** for independent retention.

---

## 5. Issuer-programme / secretarial spine — PARTIAL, filing is mock (48)

`schema/issuer-programme.ts` + `legal.ts` router + `services/integrations/mca.ts`:
- **What's real (the tracking spine):** related-party-transaction (RPT) register, director disclosures, RoPA + DPO sign-off fields, MSME/MSMED tracking, board/committee scaffolding — a genuinely comprehensive secretarial *record*.
- **What's mock — the actual regulator interaction:**
  - **MCA21 V3 filing is mock.** `mca.ts` runs in mock mode whenever `MCA_API_KEY` is unset (`mca.ts:19,34`), logs `[MCA_MOCK]` and returns `"MOCK ENTERPRISE INDIA PVT LTD"` (`mca.ts:52-56`); the real call is a `// TODO: Implement real API call to MCA21 V3` (`mca.ts:44`).
  - **XBRL** financial-statement generation is a **`handoffUri` stub** — no instance document produced.
  - **No SEBI LODR filing** path (for listed-entity disclosures).

So the platform can *track* every obligation but cannot *discharge* the electronic ones — a CS still files manually and pastes SRNs back in.

---

## 6. Vulnerability management — PARTIAL, no CVSS→SLA, no workflow (40)

`security.ts` `importVulnerabilities` (`security.ts:261-268`) + `schema/security.ts`:
- **Real:** idempotent import keyed on `externalFingerprint` (`security.ts:275`), CVE id + severity + a **remediation due-date** computed from a caller-supplied `remediationSlaDays` (`security.ts:256,266-268`).

**Gaps vs Qualys VMDR / Tenable VM:**
- **No CVSS→SLA auto-mapping.** The SLA is whatever the importer *passes in* — there is no policy ("critical=5d, high=30d, medium=90d") applied automatically. Miss the field and there is no due date at all.
- **No risk scoring** — no TruRisk/VPR-style prioritisation (CVSS + KEV/exploit availability + asset criticality). Severity is a flat enum.
- **No remediation workflow** — no ticket generation, no assignment, no verification/rescan-to-close, no aging/overdue escalation.
- **No asset FK** — findings aren't linked to the CMDB CIs from Cluster 4, so blast-radius/criticality can't inform priority.
- **No scan orchestration** — import-only, no scheduled scans or scanner integration.

---

## 7. DPDP / privacy — STUB, the cluster's biggest regulatory hole (12)

DPDP Act 2023 obligations are largely **absent as machinery**:
- **What exists:** RoPA (record of processing) tables and a DPO sign-off field (in the issuer/secretarial spine) — i.e. *documentation*, not *operation*.
- **What's missing — every time-bound DPDP obligation:**
  - **No consent management** — no consent artifact store, no purpose/notice linkage, no **withdrawal** mechanism. A grep for a consent domain finds only unrelated `consent`-named columns in tickets/procurement/legal — **no privacy consent schema exists.**
  - **No Data-Subject-Request (DSR) workflow** — no intake, no identity verification, no data-retrieval/erasure orchestration, no statutory response clock. Under DPDP the Data Fiduciary must act on principal requests within defined timelines; there is nothing here to track them.
  - **No breach-notification automation** — no breach register, no risk assessment, no Data Protection Board notification, no affected-principal notification workflow. DPDP breach notification is *mandatory and time-bound*; this is entirely manual.
  - **No data-inventory / mapping** feeding the RoPA (it's hand-entered).

*Benchmark: OneTrust operationalises exactly this triad — consent lifecycle, DSR automation (ID verify → retrieve → delete → communicate), and breach detection→assessment→DPB/principal notification. This is the platform's largest single compliance exposure given its India-first positioning.*

---

## 8. Prioritized fix list (CISO / DPO / CS ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **DPDP DSR workflow** (intake → ID verify → fulfil → response clock) | Privacy | High | Mandatory, time-bound; largest exposure for India-first ICP |
| 2 | **DPDP breach register + notification** (assess → DPB + principals) | Privacy | Med | Statutory, time-bound; regulator-visible |
| 3 | **Consent management** (artifact store + purpose linkage + withdrawal) | Privacy | Med-High | DPDP lawful-basis backbone; feeds DSR/RoPA |
| 4 | **CVSS→SLA policy engine + overdue escalation** | Vuln | Low-Med | Turns import into a managed remediation program |
| 5 | **Tamper-evident audit log** (per-row hash chain / WORM) | Audit | Low | Cheapest high-credibility control for SOX/ISO/DPDP |
| 6 | **Real MCA21 V3 filing** (replace mock) + XBRL instance doc | Issuer | High | Discharges the obligation, not just tracks it |
| 7 | **Vuln→CMDB asset FK + remediation tickets** | Vuln | Low-Med | Risk-based prioritisation; reuses Cluster 4 CMDB |
| 8 | **eSign templates + PAdES-LTV signed-PDF seal** | eSign | Med | Reusability + artifact-embedded tamper-evidence |
| 9 | **Remove or build DocuSign** (currently enum-only stub) | eSign | Low | Eliminate a false capability claim |
| 10 | **DMS full-text search + sensitivity labels** | DMS | Med | Retrieval + DLP/classification foundation |
| 11 | **SecOps SOAR actions + basic detection ingestion** | SecOps | High | Only if a real SOC is in the ICP; else keep as case mgmt |

Items **4, 5, 7, 9 are cheap**; **1, 2, 3** are the strategic DPDP build (the biggest regulatory gap); **6** discharges the statutory filing obligation.

---

## 9. Bottom line for this cluster

This cluster is the sharpest instance of the platform's recurring pattern — **correct schema, missing computation** — but here the missing computation is *regulatory reflex*. You have an excellent system of record: DMS, eSign, incident lifecycle, and a comprehensive secretarial spine are all genuinely built. What's absent is everything a regulator tests under a clock: **DSR response timelines, breach notification, consent withdrawal, CVSS-driven remediation SLAs, real MCA filing, and tamper-evident audit.**

For an India-first platform, **DPDP is the headline exposure** — consent/DSR/breach is effectively a blank page while the Act's obligations are live. Pair that build with the cheap credibility wins (tamper-evident audit, CVSS→SLA policy, removing the DocuSign stub) and this cluster moves from ~55 to a defensible ~70, with DMS and eSign already at leader-adjacent quality.

**Sources:**
- [OneTrust — India DPDPA Compliance](https://www.onetrust.com/solutions/india-dpdpa-compliance/)
- [OneTrust — Data Subject Request (DSR) Automation](https://www.onetrust.com/products/data-subject-request-dsr-automation/)
- [Qualys — Severity Score vs CVSS Scoring](https://success.qualys.com/support/s/article/000002759)
- [Tenable — SLAs and Remediation](https://docs.tenable.com/cyber-exposure-studies/cyber-exposure-insurance/Content/SLARemediation.htm)
- [Tenable vs Qualys vs Rapid7 — VM Platform Comparison](https://technologymatch.com/blog/tenable-vs-qualys-vs-rapid7-vm-platform-comparison)
- [What's new in Microsoft Sentinel: RSAC 2026](https://techcommunity.microsoft.com/blog/microsoftsentinelblog/what%E2%80%99s-new-in-microsoft-sentinel-rsac-2026/4503971)
