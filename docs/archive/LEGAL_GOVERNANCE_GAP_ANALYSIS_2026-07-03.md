# CoheronConnect — Legal & Governance Gap Analysis (Deep)

**Date:** 2026-07-03
**Prepared by:** Engineering (code-grounded audit + specialist benchmark)
**Scope:** The full Legal & Governance surface — entity management, cap table & ESOP, secretarial/board, contract lifecycle (CLM), e-signature, legal-matter/investigations, and DPDP/privacy governance. **Security & Compliance (GRC) is covered separately** in `docs/GRC_GAP_ANALYSIS_2026-07-03.md`.
**Structure:** Flat deep gap analysis (no tier/pricing model) — market benchmark + per-sub-domain scorecard + feature-level gap tables + work-item map.
**Method:** Direct read of every relevant schema and router file; benchmarked against the *category specialists* for each sub-domain (Carta/Pulley, Diligent, Ironclad/DocuSign CLM/Icertis, DocuSign/eMudhra), not general GRC/IRM tools.

---

## 0. Executive read

The Legal & Governance build is **broad but shallow**. CoheronConnect touches an unusually wide governance surface — board meetings, MCA/ROC filings, cap table, ESOP, directors, legal matters, investigations, CLM, e-sign, RPT, XBRL, LODR, shareholder grievances, FEMA, CCI, whistleblower, legal hold, DPDP. **Very few competitors bundle this range on one tenant.** But almost every sub-domain is implemented at the **system-of-record** depth (log the fact, track a status, store a jsonb blob) rather than the **specialist depth** the category leaders sell (real cap-table math, 409A, AI contract review, jurisdiction-aware entity graphs, board portals).

Two things are genuinely competitive:
- **E-signature** — routing order, witness role, Aadhaar-hash, append-only IT-Act §3A audit trail (`packages/db/src/schema/esign.ts`). This is real and India-specialised.
- **India secretarial/statutory breadth** — MCA forms, DIR-3 KYC auto-linkage, LODR/RPT/XBRL scaffolding. No global specialist matches the India coverage.

Everything else is a thin record layer that will lose a head-to-head against the specialist the moment a buyer looks closely.

**Overall Legal & Governance maturity: ~40%** (vs ~55% for GRC). The breadth inflates perceived completeness; the depth is where the shallowness the images imply actually lives.

---

## 1. The right benchmark per sub-domain

Legal & Governance is not one market — it is five specialist markets. The correct 2026 leaders:

| Sub-domain | Specialist leaders | The bar they set |
|---|---|---|
| **Cap table / ESOP / equity** | **Carta, Pulley**, Eqvista, AngelList | Real ownership math, dilution/scenario modelling, 409A valuation, ASC 820, electronic securities, on-platform grant e-sign, investor reporting, waterfall/exit modelling |
| **Entity management** | **Diligent Entities**, Blueprint OneWorld | Jurisdiction-aware entity graph, org-chart visualisation, cross-border compliance calendar, AI record extraction, single system of record across legal/tax/treasury |
| **Board / secretarial** | **Diligent Boards** (700k+ directors), BoardEffect, Nasdaq Boardvantage | Secure board portal, meeting-pack builder, annotation/collaboration, e-voting, board evaluations, D&O filings, digital signing |
| **Contract lifecycle (CLM)** | **Ironclad, DocuSign CLM, Icertis**, Juro, LinkSquares | AI contract review (flags non-standard terms, risk scoring), clause library with approved language, redlining, visual workflow designer with conditional routing, post-signature obligation extraction, renewal automation |
| **E-signature** | **DocuSign, eMudhra**, Adobe Sign | Legally-admissible signing, routing, audit trail, ID verification |
| **Legal-matter / privacy** | Legal-ops matter mgmt; **OneTrust** (privacy) | Matter budgeting/e-billing, spend analytics; consent, DSAR, RoPA, breach automation |

---

## 2. Sub-domain 1 — Entity Management

**Verdict: PARTIAL → GAP · Maturity ~25%**

**Shipped** (`packages/db/src/schema/legal-entity.ts`):
- `legalEntities`: code, name, CIN, `parentLegalEntityId`, `holdingPercentage`, `materialSubsidiary`. That's the whole table.

| Feature | Leader baseline (Diligent Entities) | CoheronConnect | Verdict |
|---|---|---|---|
| Entity master record | ✓ | ✓ (code/name/CIN) | EXISTS |
| Parent/subsidiary hierarchy | ✓ multi-level graph | ✓ single `parentLegalEntityId` + holding % | PARTIAL |
| Org-chart / group-structure visualisation | ✓ | ✗ | MISSING |
| Jurisdiction-aware compliance calendar per entity | ✓ | ✗ (calendar is org-level, not entity-level) | MISSING |
| Cross-border / multi-jurisdiction records | ✓ | ✗ (India CIN only) | MISSING |
| Officer/director register per entity | ✓ | Partial (`companyDirectors` is org-level, not entity-scoped) | PARTIAL |
| AI record extraction / document ingestion | ✓ | ✗ | MISSING |
| Registered agent / filing address tracking | ✓ | ✗ | MISSING |

**Gap:** This is 6 columns. Diligent Entities is a system of record across jurisdictions with a visual entity graph. For a single-entity Indian company it's adequate; for any group/holding structure it's a stub.

---

## 3. Sub-domain 2 — Cap Table & ESOP

**Verdict: PARTIAL · Maturity ~30%**

**Shipped** (`packages/db/src/schema/secretarial.ts:117` `shareCapital`, `:137` `esopGrants`; router `secretarial.ts:354`):
- `shareCapital`: folio, holder, holderType, shareClass (equity/pref/esop_pool/convertible), nominalValue, quantity, paidUpValue, PAN, demat, address.
- `esopGrants`: grantNumber, employee, event (grant/vest/exercise/lapse/cancel), options, exercisePrice (paise), grant/vesting dates, `vestingSchedule` jsonb (date/qty/cliff), exerciseWindow.

| Feature | Leader baseline (Carta/Pulley) | CoheronConnect | Verdict |
|---|---|---|---|
| Shareholder register | ✓ | ✓ | EXISTS |
| Share classes | ✓ full (SAFE, notes, pref stacks) | ✓ 4 classes (equity/pref/esop/convertible) | PARTIAL |
| ESOP grants + vesting schedule | ✓ | ✓ (jsonb schedule, cliff flag) | EXISTS |
| **Ownership math / fully-diluted %** | ✓ computed live | ✗ (quantities stored; no live cap-table computation) | MISSING |
| **Dilution / scenario / round modelling** | ✓ (Pulley real-time) | ✗ | MISSING |
| **409A valuation** | ✓ (in-house, ~3 days) | ✗ | MISSING |
| **Waterfall / exit / liquidation-preference modelling** | ✓ | ✗ | MISSING |
| Electronic securities / on-platform grant e-sign | ✓ | Partial (e-sign exists via `esign` sourceType, not wired to grants) | PARTIAL |
| Investor / stakeholder reporting portal | ✓ | ✗ | MISSING |
| Convertible instruments (SAFE/notes) engine | ✓ | ✗ (enum value only, no conversion math) | MISSING |
| ASC 820 / audit-grade compliance | ✓ | ✗ | MISSING |

**Gap:** The cap table is a **ledger of holdings**, not a **cap-table engine**. Carta/Pulley's entire value is the math — fully-diluted ownership, dilution modelling, 409A, waterfalls. None of that computation exists. `vestingSchedule` is stored but there's no vesting *accrual* engine driving vested/unvested/exercisable counts over time. This is the single biggest depth gap in Legal & Governance.

---

## 4. Sub-domain 3 — Board / Secretarial

**Verdict: PARTIAL (India breadth strong, portal depth weak) · Maturity ~55%**

**Shipped** (`secretarial.ts` router 678 LOC; schema `boardMeetings`, `boardResolutions`, `secretarialFilings`, `companyDirectors`; plus `issuer-programme.ts` governance layer):
- Board meetings (7 meeting types, state machine, agenda jsonb, attendees, quorum, minutes draft/URL).
- Resolutions (ordinary/special/board/circular, votes for/against/abstain, passed state).
- MCA/ROC filings (form numbers, SRN, penalty, auto-seed of 7 standard India forms).
- Directors (DIN, category, KYC with auto DIR-3 linkage).
- Governance scaffolding: `directorInterestDisclosures`, `shareholderGrievances`, `shareholderVotingResults`, `relatedPartyTransactions`, `lodorCalendarEntries`, `xbrlExportJobs`, `mcaFilingRecords`, `statutoryRegisterEntries`.

| Feature | Leader baseline (Diligent Boards) | CoheronConnect | Verdict |
|---|---|---|---|
| Meeting scheduling + agenda | ✓ | ✓ | EXISTS |
| Resolutions + voting record | ✓ | ✓ | EXISTS |
| MCA/ROC filing calendar (India) | — (not their scope) | ✓✓ (ahead) | EXISTS+ |
| Director register + KYC | ✓ | ✓ (DIN, auto DIR-3) | EXISTS |
| **Secure board portal (director access)** | ✓ core product | ✗ | MISSING |
| **Board-pack / meeting-book builder** | ✓ | Partial (agenda jsonb + minutes URL; no pack assembly) | PARTIAL |
| **Annotation / collaboration on materials** | ✓ | ✗ | MISSING |
| **E-voting / written consent workflow** | ✓ | Partial (vote counts stored; no ballot workflow) | PARTIAL |
| Board evaluations / D&O questionnaires | ✓ | ✗ (surveys module exists but not wired) | MISSING |
| Minutes → signed/approved lifecycle | ✓ | Partial (`minutesDraft`/`minutesUrl`, no approval state machine) | PARTIAL |
| Statutory registers (members/charges/etc.) | ✓ structured | Partial (`statutoryRegisterEntries` = generic jsonb, no per-register schema) | PARTIAL |
| LODR / SEBI listed-co calendar | — | ✓ scaffolding (`lodorCalendarEntries`) | PARTIAL |
| XBRL export | — | ✓ scaffolding (`xbrlExportJobs`, handoff URI only) | PARTIAL |

**Gap:** As an **India compliance/secretarial tracker** this is genuinely strong and ahead of global players. As a **board portal** (Diligent's product) it's absent — no director-facing secure access, no board-pack assembly, no annotation, no e-voting. The `issuer-programme` governance tables are broad but each is a minimal record stub (status text + timestamps), so LODR/RPT/XBRL are *placeholders that model the concern*, not working workflows.

---

## 5. Sub-domain 4 — Contract Lifecycle (CLM)

**Verdict: PARTIAL · Maturity ~40%**

**Shipped** (`packages/db/src/schema/contracts.ts`; router `contracts.ts`):
- `contracts`: 10 types, 8-state lifecycle (draft→…→active→expiring_soon→expired→terminated), value/currency, start/end, autoRenew, notice period, governing law, internal+legal owner, `clauses` jsonb (enable/modify/fieldValues), `amendments` jsonb, stamp-duty/registration status.
- `contractObligations`: title, party, frequency, status, due/completed (tenant-guarded via parent join — `contracts.ts:226`).

| Feature | Leader baseline (Ironclad/DocuSign CLM/Icertis) | CoheronConnect | Verdict |
|---|---|---|---|
| Contract repository + metadata | ✓ | ✓ | EXISTS |
| Lifecycle status + renewal/expiry flags | ✓ | ✓ (`expiring_soon`, autoRenew, noticePeriod) | EXISTS |
| Obligation tracking | ✓ (DocuSign Insight) | ✓ (obligations table, frequency, status) | EXISTS |
| Stamp duty / registration (India) | — | ✓ (ahead) | EXISTS+ |
| **Clause library (approved language)** | ✓ | ✗ (`clauses` is per-contract jsonb, no org library) | MISSING |
| **AI contract review / risk scoring** | ✓ (Ironclad Jurist, flags non-standard terms) | ✗ | MISSING |
| **Redlining / version negotiation** | ✓ | ✗ (`amendments` jsonb log only) | MISSING |
| **Visual workflow designer (conditional routing)** | ✓ (Ironclad's moat: "if >$500K → CFO") | ✗ (no contract-specific approval routing) | MISSING |
| Post-signature clause extraction | ✓ | ✗ | MISSING |
| Renewal automation / alerts | ✓ | Partial (`endDate` index + `expiring_soon` status; dispatch unverified) | PARTIAL |
| Contract templates | ✓ | Partial (`contractClauseTemplates` in issuer-programme, India-only) | PARTIAL |
| E-sign integration | ✓ | ✓ (via `esign` sourceType="contract") | EXISTS |

**Gap:** Solid CLM **repository + obligation tracker**, but none of the AI/clause-library/redlining/workflow-designer layer that *is* the modern CLM product. Ironclad/Icertis sell proactive AI that intervenes during negotiation; CoheronConnect stores the final contract and its obligations. This is a record system, not a negotiation system.

---

## 6. Sub-domain 5 — E-Signature

**Verdict: EXISTS (genuinely competitive) · Maturity ~70%**

**Shipped** (`packages/db/src/schema/esign.ts`; router `esign.ts` 213 LOC):
- Universal envelope (`signatureRequests`) linkable to any source module; provider enum (eMudhra/DocuSign/internal_otp); SHA256 of document + signed document; expiry.
- Signers with routing order, role (signer/approver/**witness**), Aadhaar-masked-hash (never raw), certificate hash.
- **Append-only `signatureAudit`** (sent/opened/otp_requested/otp_verified/signed/declined/expired) with IP, user-agent, geo, OTP ref — explicitly built for IT-Act §3A admissibility, 8-year retention.

| Feature | Leader baseline (DocuSign/eMudhra) | CoheronConnect | Verdict |
|---|---|---|---|
| Multi-signer routing order | ✓ | ✓ | EXISTS |
| Roles (signer/approver/witness) | ✓ | ✓ | EXISTS |
| Legally-admissible audit trail | ✓ | ✓ (IT-Act §3A, append-only, geo/IP) | EXISTS |
| Aadhaar e-sign (India) | eMudhra ✓ | ✓ (masked hash) | EXISTS |
| Document integrity (hash) | ✓ | ✓ (SHA256 pre+post) | EXISTS |
| Multi-provider abstraction | — | ✓ (eMudhra/DocuSign/OTP) | EXISTS+ |
| Template/field placement UI | ✓ | ✗ (no drag-drop field placement) | MISSING |
| Bulk send | ✓ | ✗ | PARTIAL |

**Gap:** Small. This is the strongest sub-domain — arguably at-parity with eMudhra for India use, and the multi-provider + universal-envelope design is genuinely good. Missing only the sender-side UX polish (field placement, bulk send).

---

## 7. Sub-domain 6 — Legal Matters & Investigations

**Verdict: PARTIAL · Maturity ~45%**

**Shipped** (`packages/db/src/schema/legal.ts`; router `legal.ts` 769 LOC):
- `legalMatters`: 8 types, 7-state lifecycle, confidential flag, estimated/actual cost, external counsel, jurisdiction, CNR/court/forum, next hearing, limitation deadline, arbitration seat/institution, legal hold.
- `legalRequests`: intake queue → assign → matter linkage.
- `investigations`: ethics/harassment/fraud/data_breach/whistleblower/discrimination, confidential+anonymous, findings/recommendation.

| Feature | Leader baseline (legal-ops matter mgmt) | CoheronConnect | Verdict |
|---|---|---|---|
| Matter register + lifecycle | ✓ | ✓ | EXISTS |
| Litigation detail (court/CNR/hearing/limitation) | ✓ | ✓ (India-aware: CNR) | EXISTS+ |
| Arbitration tracking | ✓ | ✓ | EXISTS |
| Cost estimate vs actual | ✓ | ✓ (2 fields) | PARTIAL |
| Intake request queue | ✓ | ✓ | EXISTS |
| Investigations (whistleblower/ethics) | ✓ | ✓ (anonymous, confidential) | EXISTS |
| Legal hold | ✓ | Partial (boolean flag + `legalHoldRecords`; no custodian/notice workflow) | PARTIAL |
| **Matter budgeting + e-billing (LEDES)** | ✓ | ✗ (cost is 2 static fields) | MISSING |
| **Outside-counsel spend analytics** | ✓ | ✗ | MISSING |
| **Document/evidence management per matter** | ✓ | Partial (DMS exists, linkage unverified) | PARTIAL |
| **Matter → task / deadline workflow** | ✓ | Partial (hearing/limitation dates; no task engine) | PARTIAL |

**Gap:** Good matter *register* with real India litigation fields (CNR, limitation), but no e-billing, no spend analytics, no custodian-driven legal-hold notice workflow. It tracks matters; it doesn't *manage the legal spend and process* the way legal-ops tools do.

---

## 8. Sub-domain 7 — DPDP / Privacy Governance

**Verdict: GAP · Maturity ~25%** (also covered in GRC doc §2.3)

**Shipped** (`issuer-programme.ts`): `dpdpProcessingActivities` (RoPA: activity/purpose/lawful basis/data categories/DPO sign-off), `privacyBreachNotificationProfiles` (jurisdiction + 72h offset), `resourceReadAuditEvents` (optional sensitive-read log).

| Feature | Leader baseline (OneTrust) | CoheronConnect | Verdict |
|---|---|---|---|
| RoPA (processing activities) | ✓ | ✓ | EXISTS |
| Breach-notification config | ✓ | ✓ (jurisdiction/offset) | PARTIAL |
| **Consent capture / proof / revocation** | ✓ | ✗ | MISSING |
| **Data-principal / DSAR request workflow** | ✓ | ✗ | MISSING |
| **Automated breach detection + notification** | ✓ | ✗ (config only) | MISSING |
| Data-flow mapping / sub-processor registry | ✓ | ✗ | MISSING |
| Cookie/consent banners | ✓ | ✗ | MISSING |

**Gap:** Config-layer only. The DPDP Act's core obligations — consent and data-principal rights — are unbuilt. (This is the same finding as the GRC hardening backlog H-2.)

---

## 9. Consolidated scorecard

| Sub-domain | Maturity | vs Specialist leader | Verdict |
|---|---|---|---|
| E-signature | ~70% | DocuSign/eMudhra | **EXISTS** (competitive for India) |
| Board / Secretarial (India tracking) | ~55% | Diligent Boards | **PARTIAL** (India breadth ahead; portal absent) |
| Legal matters & investigations | ~45% | legal-ops tools | **PARTIAL** |
| Contract lifecycle (CLM) | ~40% | Ironclad/DocuSign/Icertis | **PARTIAL** (repository yes; AI/clause/redline no) |
| Cap table & ESOP | ~30% | Carta/Pulley | **PARTIAL** (ledger, not engine) |
| Entity management | ~25% | Diligent Entities | **GAP** (6-column stub) |
| DPDP / privacy | ~25% | OneTrust | **GAP** (config only) |
| **Overall Legal & Governance** | **~40%** | — | **Broad, shallow** |

---

## 10. The pattern (why it feels shallow)

Across all seven sub-domains the same inversion appears: **CoheronConnect models the _entities and their status_; the specialists deliver the _computation and workflow_.**

- Cap table: stores holdings; Carta *computes* ownership, dilution, 409A.
- CLM: stores contracts + obligations; Ironclad *reviews, redlines, routes* them.
- Board: tracks meetings/filings; Diligent *is the director's secure workspace*.
- Entity: 6 columns; Diligent *is a jurisdictional entity graph*.
- Privacy: RoPA config; OneTrust *runs consent and DSAR*.

The breadth is a real differentiator (few bundle India secretarial + CLM + cap table + e-sign + matters on one tenant). But every individual tower is a record layer, and a buyer comparing tower-by-tower against the specialist will see the depth gap immediately. The strongest, most defensible pieces are **e-sign** and **India statutory/secretarial breadth** — those should anchor positioning; the rest needs depth investment.

---

## 11. Highest-leverage depth work-items (evidence-mapped)

Ordered by gap severity × strategic value. Files cited are real.

| # | Work item | Sub-domain | Why | Primary files |
|---|---|---|---|---|
| 1 | **Cap-table computation engine** — live fully-diluted ownership, vesting accrual (vested/unvested/exercisable over time), dilution/round scenario modelling | Cap table | Biggest depth gap; the specialist's entire value is math that's absent | `packages/db/src/schema/secretarial.ts:117,137`; `apps/api/src/routers/secretarial.ts:354` |
| 2 | **CLM clause library + approval workflow** — org clause library with approved language; conditional approval routing (value/type-based) | CLM | Turns the repository into a negotiation system | `packages/db/src/schema/contracts.ts`; `apps/api/src/routers/contracts.ts` |
| 3 | **DPDP consent + DSAR** — consent capture/proof/revocation; data-principal request lifecycle | Privacy | Core DPDP obligation, currently unbuilt (= GRC H-2) | `issuer-programme.ts` (`dpdpProcessingActivities`); new tables |
| 4 | **Entity graph + per-entity compliance** — multi-level entity tree visualisation; entity-scoped compliance calendar; officers per entity | Entity mgmt | Turns a 6-column stub into a group-structure system | `packages/db/src/schema/legal-entity.ts`; `secretarial.ts` directors |
| 5 | **Board portal + minutes/e-voting lifecycle** — director-facing secure view; board-pack assembly; minutes draft→approved state machine; written-consent/e-voting workflow | Board | The Diligent product; today it's a tracker | `packages/db/src/schema/secretarial.ts:46,71`; `apps/api/src/routers/secretarial.ts` |
| 6 | **Matter budgeting + spend** — structured budget vs actual, outside-counsel e-billing, spend analytics | Legal matters | Moves from register to legal-spend management | `packages/db/src/schema/legal.ts:61`; `apps/api/src/routers/legal.ts` |
| 7 | **Harden governance stubs** — give LODR/RPT/XBRL/statutory-registers real per-concern schema + workflow (today generic jsonb/status stubs) | Board/secretarial | The `issuer-programme` breadth is placeholders; make the claimed items real | `packages/db/src/schema/issuer-programme.ts` |
| 8 | **E-sign sender UX** — field placement, bulk send | E-sign | Small polish on the strongest tower | `apps/api/src/routers/esign.ts` |

---

## 12. Bottom line

Legal & Governance is CoheronConnect's **broadest and shallowest** area: an unusually complete *surface* (India secretarial + cap table + ESOP + CLM + e-sign + matters + privacy on one tenant) sitting on a thin *record* foundation. It is **~40% mature** — behind every category specialist tower-for-tower, but ahead of all of them on India statutory breadth and competitive on e-sign. To match market-leader depth, invest first in the **cap-table computation engine** and **CLM clause-library/workflow layer** (the two widest depth gaps against Carta/Pulley and Ironclad/Icertis), then **DPDP consent/DSAR** and **entity graph**, and harden the India governance stubs so the claimed LODR/RPT/XBRL breadth is real rather than scaffolding.
