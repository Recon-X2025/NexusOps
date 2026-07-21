# Secretarial — Build-and-Own vs Track-with-Paid-Add-ons

**Date:** 2026-07-03
**Prepared by:** Engineering (code-grounded + market-cadence research)
**The question (from product):** *"Legal will hold, but Secretarial keeps drifting because of constant statutory change — do we keep Secretarial as a 'track-it-all' record with add-ons at cost, or build it and keep updating it?"*
**Companion docs:** `docs/LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md`, `docs/LEGAL_GOVERNANCE_RUN_WITHOUT_PROFESSIONAL_2026-07-03.md`, `docs/GRC_TIER_WORKITEM_MAP_2026-07-03.md`.

---

## 0. TL;DR — the answer is per-layer, not binary

The framing "track-it-all + paid add-ons **vs** build-and-keep-updating" collapses three different economic bets into one word ("Secretarial"). Split it and the answer is clear:

| Secretarial sub-layer | What it is | Drift rate | **Decision** |
|---|---|---|---|
| **A. Process / state** | Meetings, resolutions, registers *exist*, deadlines, penalties, reminders | **Very low** — Companies Act 2013 structure is stable | **BUILD & OWN. Included tier.** |
| **C. Statutory content artifacts** | Minutes (SS-1/SS-2), resolution text, notices, prescribed registers (MGT-1/SH-3) | **Medium** — but updates become *content*, not code, once an assembly engine exists | **BUILD & OWN. Included tier.** |
| **B. Prescribed e-forms + XBRL + e-filing** | MGT-7/AOC-4/DIR-12/PAS-3 exact layouts, XBRL taxonomy, MCA21 V3 submission | **High** — MCA re-cuts forms, taxonomy, and portal on its own cadence | **DO NOT own the generation/submission treadmill as included scope. Paid, integration-backed add-on.** |

**One-line answer:** *Build and own the process, the registers, and the minutes/resolutions (they don't really drift once you have an assembly engine). Keep the MCA-form / XBRL / e-filing layer as a paid, integration-backed add-on — because that's the only part that actually drifts fast, and owning it means re-paying the MCA's release cadence forever, per form, with legal-correctness liability if you lag.*

This maps cleanly onto the GRC-style tiering already chosen: **stable high-value governance record = included; the treadmill layer = metered add-on priced to cover its own maintenance.**

---

## 1. Why Legal holds and Secretarial drifts — precisely

The product intuition is right, but the *reason* matters because it tells us **which part** drifts.

**Legal (contracts, matters, disputes) is slow-drift:**
- Contract law, limitation periods, arbitration, court structure move on a decade timescale.
- Artifacts are **bespoke** (each contract is negotiated) — the engine's job is *assembly + clause logic*, not conformance to a government-prescribed byte layout.
- Once built, a clause library + assembly engine needs *content* refreshes, not *engine* rewrites. Low maintenance tail.

**Secretarial is fast-drift — but the drift is concentrated in exactly one layer (B).** The other two layers are as stable as Legal:
- **Layer A** is the skeleton of the Companies Act 2013: a company *has* a board, *holds* an AGM, *passes* resolutions, *keeps* registers. This has not meaningfully changed in a decade. Owning it is cheap.
- **Layer C** (minutes, resolution wording, register formats) tracks Secretarial Standards (SS-1/SS-2) and rules — medium drift, but each change is a **template edit**, not a code change, provided you have a document-assembly engine.
- **Layer B** is where the government re-cuts the *deliverable itself*: the e-form field layout, the XBRL taxonomy, the submission portal. This is the treadmill, and it is genuinely expensive and unavoidable **if you own it.**

---

## 2. Evidence the treadmill is real and concentrated in Layer B

This isn't hypothetical. In the **last 12 months** the MCA moved the Layer-B ground under everyone's feet:

- **V2 → V3 portal migration.** All 38 company/LLP e-forms migrated to MCA21 V3; the V2 portal was **permanently discontinued on 18 June 2025**, with the final "Lot 3" annual forms (AOC-4, MGT-7, ADT-1, CSR-2) mandatory in V3 format from **14 July 2025**. ([MMJC](https://mmjc.in/migration-of-annual-filing-e-forms-to-mca-v3-portal/), [Simplybiz](https://simplybiz.in/key-highlights-as-mca-migrates-final-set-of-e-forms-from-v2-to-v3-portal/))
- **AOC-4 / MGT-7 were restructured, not just re-skinned:** board's report and auditor's report move from *attachments* to **linked forms filed as part of the original form**; a **photograph of the registered office** must be uploaded; **MGT-8** becomes a *declaration field* inside the form rather than a separate attachment. ([ebizfiling](https://ebizfiling.com/blog/aoc4-mgt7-update-mca-v3-filing-rules-2024-25/), [carajput](https://carajput.com/blog/roc-return-filing-migration-of-mgt-7-mgt-7a-to-mca-v3-portal/))
- **Web-based forms replace PDF/offline utilities** for most forms — i.e. the *submission mechanism itself* changed, not merely the field set. ([JustStart](https://juststart.co.in/blog/mca-v3-portal-new-update/))
- **XBRL Validation Tool reached V5.0** (for AOC-4 XBRL C&I + IND-AS, CRA-4 costing), and **MCA is mid-replacement of the C&I taxonomy** to re-sync with Companies Act 2013 provisions. ([MCA21India](https://x.com/MCA21India/status/1945872456234807530), [DataTracks](https://datatracks.com/in/blog/mca-xbrl-validation-tool-update/), [XBRL India](https://in.xbrl.org/ci-taxonomy/))

**Any product that had "built and owned" MGT-7/AOC-4 form generation would have had to re-engineer it in mid-2025** — form structure, attachment model, and portal protocol all at once. Anyone who had treated it as an integration-backed handoff re-paid a much smaller integration-update cost (or none, if the partner absorbed it). That is the whole argument, in one real event.

**Crucial scoping fact:** **XBRL only applies to companies with paid-up capital ≥ ₹5 cr, turnover ≥ ₹100 cr, listed companies + their subsidiaries, or Ind-AS filers.** ([XBRL India / §137 rules](https://in.xbrl.org/ci-taxonomy/)) That is **above the CoheronConnect ICP** (single-entity Private Ltd ≤500 people — see §3). So the single most expensive Layer-B item (XBRL taxonomy chase) is **out of scope by ICP** and should never be built on spec.

---

## 3. What the codebase actually is today (grounded)

A read-only audit confirms Secretarial is, right now, **~5–10% of "run without a CS"** — pure Layer-A record + reminders, zero artifact production.

**Layer A — present and decent (this is the part worth owning):**
- `secretarialFilings` table stores `formNumber` / `srn` / `status` / `filedAt` / `attachment_url` — a filing *happened* record. `packages/db/src/schema/secretarial.ts:93`
- Secretarial router does CRUD + scheduling: `create`, `markFiled`, `update`, `upcomingAlerts`, plus a `seed` that pre-populates 7 standard forms with **due dates only** (MGT-7, AOC-4, ADT-1, DIR-3 KYC, MSME-1 H1/H2, DPT-3). `apps/api/src/routers/secretarial.ts:165`
- Compliance calendar + DIR-3 KYC reminder workflow (notifications, status flips, penalty tracking). `apps/api/src/routers/india-compliance.ts:22`, `apps/api/src/workflows/actions/dir3-kyc-reminder.ts:1`

**Layer C — effectively absent:**
- `boardMeetings.minutesDraft` and `boardResolutions.body` are **free-text fields the user types**, not generated artifacts. `packages/db/src/schema/secretarial.ts:61`
- No statutory register *generation* — `statutoryRegisterEntries` is a generic jsonb stub. `packages/db/src/schema/issuer-programme.ts:71`

**Layer B — stub / mock only:**
- `McaService.getSrnStatus()` / `syncCompanyMaster()` are **mocked** — return hardcoded responses when `MCA_API_KEY` is unset; the real path throws *"MCA API integration not yet configured."* `apps/api/src/services/integrations/mca.ts:34`
- `xbrlExportJobs` stores `status` + a **`handoffUri`** only — no taxonomy, no tagging, no instance doc. `packages/db/src/schema/issuer-programme.ts:107` (zero router references)
- `mcaFilingRecords` exists but is **imported nowhere**. `packages/db/src/schema/issuer-programme.ts:89`
- The **only real statutory integration in the whole codebase is ClearTax GST/eInvoice** (live IRN generation) — *not* MCA/secretarial. `apps/api/src/services/integrations/cleartax-gst.ts:54`; adapter registry lists WhatsApp/SMS/Razorpay/ClearTax-GST/Google/MS365/Slack — **no MCA, no TRACES, no e-sign-for-filing**. `apps/api/src/services/integrations/registry.ts`

**The generation engine question is already half-answered:** the codebase **already runs PDFKit** for payroll (`payslip-pdf.ts`, `form16-pdf.ts`) with real HTTP streaming endpoints. So a server-side document engine *exists and is proven in-repo* — it's simply payroll-only today. Layer-C generation is a **reuse-and-extend**, not a greenfield capability. `apps/api/src/services/payslip-pdf.ts:1`, `apps/api/src/services/form16-pdf.ts:1`

---

## 4. Who the customer is (why B is even more clearly an add-on)

Confirmed from seeds, plan enum, and positioning docs:
- **ICP = single-entity Private Ltd, Indian SMB, ≤500 people.** `SMB_MARKET_POSITION_2026.md:4` ("Startups & SMBs up to ~500 employees"); competitive frame is Zoho One / Keka / ClearTax, not enterprise suites.
- `legalEntities` has a single `parentLegalEntityId` (binary parent, not a group graph), **no entity-type enum**, and **no seed populates it** — multi-entity is unbuilt and unused. `packages/db/src/schema/legal-entity.ts:15`
- **Multi-entity consolidation is explicitly "probably never — do NOT build on spec."** `MARKET_ASSESSMENT_2026-04-26.md` §4.
- Plan enum is `free / starter / professional / enterprise` — tiering exists but isn't feature-gated yet. `packages/db/src/schema/auth.ts:16`

**Filing volume for this ICP is low and routine: ~5–8 forms/org/year**, no per-entity multiplication. That volume does **not** justify owning a per-form generation+submission treadmill. It *does* comfortably support an integration-backed handoff whose cost is amortised across all tenants and priced into an add-on.

---

## 5. The two add-on models for Layer B

| Model | How it works | Who eats the drift cost | When to pick |
|---|---|---|---|
| **(a) Integration-backed handoff** *(recommended)* | Product produces the correct **structured filing data** (validated field set for MGT-7/AOC-4/etc.) and hands off to a maintained filing engine / partner API (or the MCA V3 offline Excel utility) for final form + submission. | The **partner** (or the MCA utility) tracks form/portal changes; you only update the data-mapping when fields change. | Now. Matches ICP volume, matches the ClearTax-GST pattern already in the codebase. |
| **(b) Own the generation engine** | You generate the exact e-form + XBRL yourself and (later) submit via MCA21 V3. | **You**, forever, per form, per taxonomy version, per portal migration. Needs a standing "statutory forms" maintainer. | Only if tenant volume × per-tenant willingness-to-pay funds a dedicated maintainer — not true at current ICP. |

The mid-2025 V2→V3 event is the clearest possible argument for (a): a **structural** re-cut of AOC-4/MGT-7 plus a portal replacement landed in a single window. Under (a) that's a mapping update or a partner's problem; under (b) it's a fire drill with correctness liability.

---

## 6. Recommendation (the decision)

1. **Layer A — Build & own, ship as *included* tier.** This is stable, it's the moat (the system-of-record for governance state), and maintenance is near-zero. Already ~built; harden it.
2. **Layer C — Build & own, ship as *included* tier, on a Document Assembly Engine (roadmap 6.1).** Minutes (SS-1/SS-2), resolutions, notices, prescribed registers. Reuse the existing PDFKit capability. Statutory-standard changes become **template/content edits**, keeping the maintenance tail flat. This is what turns "tracker" into "reduces reliance on a CS."
3. **Layer B — Do NOT own the e-form/XBRL/e-filing generation treadmill. Ship as a *paid, integration-backed add-on* (model a).** Product generates validated filing *data*; a maintained partner/utility produces + submits the form. Price the add-on to cover the integration-maintenance cost. **Explicitly exclude XBRL** at this ICP (statutory thresholds put it above the target segment).
4. **Never build multi-entity / group-consolidation filing on spec** — out of ICP, "probably never."
5. **Positioning stays honest:** included tiers deliver *"run your board/registers/minutes without a CS on retainer, and know exactly what's due"*; the add-on delivers *"…and file it"* via a partner. The claim is **"reduces reliance on a CS,"** not "replaces the CS," until Layer C ships.

---

## 7. How this slots into tiers (GRC-style)

| Tier | Secretarial content | Rationale |
|---|---|---|
| **Included (Basic)** | Layer A (state, calendar, registers-as-records, reminders, penalties) | Stable, cheap, high-value, defensible. |
| **Included / next tier** | Layer C (assembled minutes, resolutions, notices, prescribed registers via assembly engine) | Owned because drift = content edits, not code. The real "less need for a CS" unlock. |
| **Paid add-on (metered)** | Layer B (MCA e-form data-prep + partner filing handoff; SRN reconciliation) | Recurring external-drift cost lives with the integration; add-on price covers it. |
| **Out of scope** | XBRL taxonomy, multi-entity consolidation, listed/LODR | Above ICP; owning the drift is uneconomic. |

---

## 8. Open items to confirm before committing to (a)

1. **Choose the Layer-B handoff target:** a filing-utility partner API vs the MCA V3 **offline Excel pre-fill utility** (the latter is free but manual on the last mile). The data-mapping work is similar either way; pick based on how "click-to-file" you need the last mile to be.
2. **Confirm SS-1/SS-2 minute/resolution templates** as the first Layer-C content set (highest-frequency artifacts an SMB board produces).
3. **Decide the add-on metering unit** (per-filing vs per-entity-per-year) to match the amortised integration cost.

---

*All code claims verified by read-only audit on 2026-07-03. Market-cadence claims sourced inline. No code was modified in producing this memo.*
