# Legal & Governance — "Run Without a CS or Lawyer" Gap Analysis

**Date:** 2026-07-03
**Prepared by:** Engineering (code-grounded)
**The bar:** A target company can run its **secretarial** and **legal** function on CoheronConnect alone — **no Company Secretary and no lawyer on retainer.**
**Autonomy level (agreed):** **Draft-to-done.** The product must prepare everything correct and complete — filing form data, contracts assembled from an approved clause library, resolution/minutes text, disclosures — so that an **untrained admin reviews and clicks submit**. No professional *judgment* required. (Not full straight-through auto-filing; not merely guided self-serve.)
**Target profiles:** (1) **Private Ltd SMB, India, ≤500 people**; (2) **Funded pre-IPO startup** (SAFEs/notes, priced rounds, ESOP, investor rights). **Listed/regulated is out of scope** — professional sign-off is legally required there.
**Companion docs:** `docs/LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md` (specialist-parity view), `docs/GRC_*` (Security & Compliance).

---

## 0. The reframing (why this bar is different)

The specialist-parity doc asked "how do we compare to Carta/Ironclad/Diligent?" This doc asks a harder, more useful question: **what does the CS/lawyer actually do each year, and can the product do it so the founder doesn't have to hire them?**

That reframes the gap. The professional's value is not "tracking what's due" — it's **producing the correct artifact** (the filled MGT-7, the enforceable NDA, the special-resolution text, the valid ESOP grant with correct vesting) and **knowing what applies to this company**. CoheronConnect today is very good at the *first half of the CS's job* (knowing what's due, when, with what penalty) and does **almost none of the second half** (producing the artifact).

**Verdict up front: against a draft-to-done bar, the product is a tracker + reminder layer. It cannot yet run either function without the professional, because it does not draft or generate a single output artifact.** The single decisive gap: **there is no document generation anywhere** (verified: contracts router has no generate/render/export; secretarial "minutes"/"resolution" are free-text fields the user types; the only real statutory integration is ClearTax GST — no MCA/ROC/TRACES filing).

---

## 1. What a Company Secretary actually does (annually, for these profiles)

| # | CS task | Is it judgment or production? |
|---|---|---|
| C1 | Know which filings apply to *this* company (MGT-7/AOC-4/ADT-1/DIR-3/MSME-1/DPT-3 …) and when | Knowledge → automatable |
| C2 | **Prepare the actual e-form** with correct company/financial data | Production |
| C3 | Draft board/AGM **notices, agendas, minutes, resolutions** in statutory form | Production |
| C4 | Maintain **statutory registers** (members, directors, charges, RPT, loans) in prescribed format | Production |
| C5 | Maintain the **cap table** and process allotments, transfers, ESOP grants correctly | Production + math |
| C6 | Track director **KYC/DIN, interest disclosures (MBP-1), appointments/resignations** | Knowledge + production |
| C7 | Run the **board/AGM meeting** to legal standard (quorum, notice period, voting, consent) | Process + production |
| C8 | Ensure **stamp duty / registration** done on instruments | Knowledge + production |
| C9 | Flag when something needs a real professional (unusual transaction, restructuring) | Judgment (irreducible) |

## 2. What a Lawyer-on-retainer actually does (for these profiles)

| # | Lawyer task | Judgment or production? |
|---|---|---|
| L1 | **Draft/review routine contracts** (NDA, MSA, SOW, employment, vendor) from known-good templates | Production (mostly) |
| L2 | **Redline** counterparty paper against your standard positions | Production + judgment |
| L3 | Maintain an **approved clause library / fallback positions** | Production |
| L4 | Track **contractual obligations & renewals** | Tracking → automatable |
| L5 | Handle **employment/HR legal** (offer terms, policies, PoSH) | Production |
| L6 | **Cap-table / financing** legal (SAFE, note, SHA, term-sheet mechanics) | Production + math |
| L7 | **DPDP/privacy** — consent notices, DSAR handling, breach response | Production |
| L8 | **Disputes / notices / litigation** management | Judgment (irreducible) |
| L9 | Give an actual **legal opinion** on a novel question | Judgment (irreducible) |

**Design implication:** C9, L8, L9 are irreducibly professional — the product's job there is to *detect and route* ("this needs a lawyer"), not replace. **Everything else is production/knowledge/tracking, which is exactly what draft-to-done software can absorb.** The gaps below are all in the production layer.

---

## 3. CS function — can it run unaided? (task-by-task)

Legend: **DONE** (untrained admin can complete unaided) · **HALF** (tracked but the artifact/math is missing) · **GAP** (absent).

| CS task | Shipped today | Evidence | Draft-to-done verdict |
|---|---|---|---|
| C1 Know what's due | ✓ Auto-seeds 7 India forms, due dates, penalty/day, reminders | `secretarial.ts:255` filings.seed; `india-compliance.ts` calendar | **DONE** |
| C2 **Prepare the e-form** | ✗ Stores form *number* + SRN + status; **no form data assembly, no e-form output** | `secretarial.ts:93` `secretarialFilings` (metadata only) | **GAP** |
| C3 **Draft notice/agenda/minutes/resolution** | ✗ `minutesDraft`, resolution `body` are **free-text the user types**; no template/generation | `secretarial.ts:57,79`; verified no generate/render in router | **GAP** |
| C4 **Statutory registers** | HALF Generic `statutoryRegisterEntries` = jsonb blob; no prescribed-format register (members/charges/RPT) | `issuer-programme.ts:71` | **HALF** |
| C5 Cap table / allotment / transfer / ESOP | HALF Holdings + ESOP grants stored; **no ownership math, no allotment/transfer workflow, no vesting accrual** | `secretarial.ts:117,137` | **HALF** |
| C6 Director KYC / DIN / MBP-1 / appointments | ✓ DIN, category, KYC with auto DIR-3 filing; interest-disclosure table exists | `secretarial.ts:543`; `issuer-programme.ts:173` | **DONE** (tracking); **HALF** (MBP-1 form not produced) |
| C7 Run board/AGM to standard | HALF Meeting state machine, quorum flag, vote counts; **no notice-period validation, no auto-generated notice/minutes, no e-voting/consent** | `secretarial.ts:14,71` | **HALF** |
| C8 Stamp duty / registration | HALF Status fields on contracts; **no computation of duty payable, no e-stamp integration** | `contracts.ts` (`stampDutyStatus`, `registrationStatus`) | **HALF** |
| C9 Flag "needs a professional" | ✗ No detection/routing of unusual matters | — | **GAP** |

**CS verdict:** The product **knows the calendar** (C1, C6 tracking) but **produces no statutory artifact** (C2, C3) and **does no cap-table math** (C5). An untrained admin using CoheronConnect today would know *that* MGT-7 is due and *what* the penalty is, but would still have to hire a CS to actually prepare MGT-7, draft the AGM minutes, and process the ESOP allotment. **Cannot run unaided.**

---

## 4. Legal function — can it run unaided? (task-by-task)

| Lawyer task | Shipped today | Evidence | Draft-to-done verdict |
|---|---|---|---|
| L1 **Draft routine contract** | ✗ Stores a contract + per-contract `clauses` jsonb; **no generation from templates**, India-only `contractClauseTemplates` unused for assembly | `contracts.ts`; `issuer-programme.ts:190` | **GAP** |
| L2 **Redline counterparty paper** | ✗ `amendments` jsonb log only; no compare/redline | `contracts.ts` | **GAP** |
| L3 **Approved clause library** | ✗ No org-level clause library with fallback positions | — | **GAP** |
| L4 Obligation & renewal tracking | ✓ Obligations table (party/frequency/status/due); expiry status | `contracts.ts:105`; `contracts.ts:210` | **DONE** |
| L5 Employment/HR legal (offer, PoSH) | HALF Offer e-sign path exists; **no policy/offer generation**; PoSH via investigations only | `esign.ts` sourceType=offer_letter; `legal.ts` investigations | **HALF** |
| L6 Cap-table / financing legal | ✗ No SAFE/note/SHA modelling or documents | `secretarial.ts` (holdings only) | **GAP** |
| L7 DPDP consent / DSAR / breach | ✗ RoPA + breach-config only; **no consent capture, no DSAR workflow** | `issuer-programme.ts:50,358` | **GAP** |
| L8 Disputes / litigation | HALF Matter register with CNR/hearing/limitation; tracks, doesn't produce notices | `legal.ts:61` | **HALF** (correctly a tracker; judgment stays human) |
| L9 Legal opinion | ✗/NA Irreducibly human | — | **NA — route to human** |

**Legal verdict:** The product **tracks contracts and obligations well** (L4) but **drafts nothing** (L1–L3, L6, L7). A founder still calls a lawyer to draft the NDA, redline the customer's MSA, paper the SAFE, and set up DPDP consent. **Cannot run unaided.**

---

## 5. The one structural gap (and it's the same one)

Both functions fail the draft-to-done bar for **one shared reason: there is no artifact-generation engine.** Everything downstream of "we know what's needed" is missing:

- No **statutory form generation** (MGT-7/AOC-4/DIR-3/MBP-1 from company data).
- No **document assembly** (minutes, resolutions, notices, contracts) from templates + a clause library.
- No **cap-table computation** (ownership, vesting accrual, allotment/transfer, SAFE/note conversion).
- No **DPDP consent/DSAR** production.

The product is a very good **"what's due and what did we agree" system of record**. The CS/lawyer's *replaceable* work is the **"produce the correct document" system of generation** — which does not exist. That is why, despite the broad surface, neither function can currently run without the professional.

---

## 6. Gap closure roadmap — what it takes to hit "draft-to-done"

Grouped by the capability that unlocks the most professional tasks. Effort: S/M/L/XL (relative). All files cited are real.

### 6.1 Foundation — Document Assembly Engine (unlocks C2, C3, L1, C7) **[XL, do first]**
A templating + merge engine that renders a finished document (PDF/DOCX) from structured company data + a versioned template. Everything else in this roadmap depends on it.
- Templates for: board notice, agenda, minutes, ordinary/special resolutions, MBP-1.
- Merge sources already exist: `boardMeetings`, `boardResolutions`, `companyDirectors`, `organizations`.
- Files: new `packages/db/src/schema/doc-templates.ts`; new render service; wire into `apps/api/src/routers/secretarial.ts`.

### 6.2 Statutory form preparation (unlocks C2) **[L]**
Assemble the **data payload** for each India e-form (MGT-7, AOC-4, ADT-1, DIR-3 KYC, MSME-1, DPT-3) from company/financial/director data, validated, exportable for upload to MCA. *Draft-to-done = correct filled form the admin uploads; not auto-file.*
- Files: extend `secretarial.ts` filings; pull from `accounting`/`financial` for AOC-4, `companyDirectors` for DIR-3.
- Note: real MCA e-filing integration is a *later* straight-through upgrade, explicitly out of the agreed bar.

### 6.3 Contract clause library + assembly (unlocks L1, L3) **[L]**
Org-level approved clause library with fallback positions; generate NDA/MSA/SOW/employment/vendor from template + clauses; wire to existing e-sign.
- Files: promote `contractClauseTemplates` (`issuer-programme.ts:190`) to a real library; new assembly procedures in `contracts.ts`; `esign` already handles signing.

### 6.4 Cap-table computation engine (unlocks C5, L6) **[XL]**
Live fully-diluted ownership; vesting accrual (vested/unvested/exercisable over time); allotment/transfer workflow with register update; SAFE/note conversion math; round/dilution modelling. Critical for the **funded-startup** profile.
- Files: `secretarial.ts:117,137` (`shareCapital`, `esopGrants`); new computation lib mirroring the money-path invariant discipline in `CLAUDE.md`.

### 6.5 DPDP consent + DSAR (unlocks L7) **[M]**
Consent capture/proof/revocation; data-principal request lifecycle. (Same item as GRC hardening H-2.)
- Files: `issuer-programme.ts` DPDP tables; new `consent_records`, `data_principal_requests`.

### 6.6 Prescribed statutory registers (unlocks C4) **[M]**
Replace generic jsonb with real registers (members, directors, charges, RPT, loans) in Companies-Act format, auto-maintained from cap table + directors + RPT data.
- Files: `issuer-programme.ts:71` `statutoryRegisterEntries`.

### 6.7 "Needs a professional" detector (unlocks C9, respects L8/L9) **[M]**
Rules that flag transactions/questions requiring real sign-off (restructuring, unusual RPT, litigation, novel contract terms) and route them out — so autonomy is *safe*, not reckless.
- Files: cross-module rules; surface in dashboards.

### 6.8 Redlining (unlocks L2) **[L, later]**
Compare counterparty paper to standard positions. Higher effort, more judgment; acceptable to leave as "assisted" longer.

---

## 7. Roadmap sequencing

1. **6.1 Document Assembly Engine** — nothing else in secretarial/legal reaches draft-to-done without it.
2. **6.2 Statutory form prep** + **6.6 registers** — completes the **CS** function for Private Ltd SMB.
3. **6.3 Clause library + assembly** — completes routine **contract drafting** (biggest lawyer-replaceable chunk).
4. **6.4 Cap-table engine** — required to serve the **funded-startup** profile (SAFE/round/ESOP).
5. **6.5 DPDP consent/DSAR** + **6.7 professional-detector** — makes autonomy compliant and safe.
6. **6.8 Redlining** — last; assisted is acceptable in the interim.

---

## 8. Honest verdict against the bar

| Function | Runs without the professional today? | What's missing to get there |
|---|---|---|
| **Secretarial (CS)** — Private Ltd SMB | **No** — knows the calendar, produces no artifact | Doc-assembly engine (6.1) + form prep (6.2) + registers (6.6) |
| **Secretarial (CS)** — funded startup | **No** — plus cap-table math absent | Above + cap-table engine (6.4) |
| **Legal (Lawyer)** — routine contracting | **No** — tracks contracts, drafts none | Clause library + assembly (6.3) |
| **Legal** — financing / DPDP | **No** | Cap-table engine (6.4) + DPDP consent/DSAR (6.5) |
| **Legal** — disputes / opinions | **Correctly not** — route to human | Professional-detector (6.7); keep human in loop |

**Bottom line:** CoheronConnect has built the **"what and when"** half of both functions to a genuinely strong, India-specialised standard. It has **not** built the **"produce the document"** half — and that half *is* what you pay the CS and lawyer to do. Closing the bar is not many small features; it is essentially **one big capability (a document-assembly + computation engine) plus a clause library and DPDP production**, sequenced so the CS function (SMB) lands first and the startup/legal pieces follow. Until 6.1–6.3 ship, the honest claim is "reduces your reliance on a CS/lawyer," not "replaces them."
