# Contract Content — Indian-Law Legal Audit

**Date:** 2026-07-03
**Reviewer stance:** Indian commercial lawyer reviewing the product's shipped contract templates for **enforceability, statutory correctness, and drafting rigour**.
**Scope:** The actual clause text that ships in `apps/web/src/lib/contract-templates.ts` (7 templates, ~40 clauses) and the PDF assembly in `apps/web/src/components/contracts/clause-editor.tsx`.
**Not in scope:** UI, storage, e-sign plumbing (covered elsewhere). This is a review of *words on the page*.
**Standard applied:** Indian Contract Act 1872; Indian Stamp Act 1899 + State stamp Acts; Registration Act 1908; Arbitration & Conciliation Act 1996 (post-2015/2019/2021 amendments); Specific Relief Act 1963 (as amended 2018); DPDP Act 2023; IT Act 2000; Companies Act 2013; Income-tax Act (s.194 TDS, s.40(a) etc.); CGST Act 2017.

---

## 0. Headline verdict

The templates are **well-drafted as US/common-law boilerplate** but are **loose-to-defective as Indian instruments**. They will *often* work because Indian courts enforce commercial intent — but they carry **specific, avoidable Indian-law defects that a counterparty's lawyer would exploit**, and at least three that go to **admissibility/enforceability**, not mere polish.

**The single most serious defect is structural, not clausal:** the generated document has **no execution architecture** — no parties recital, no effective-date, no place-of-execution, **no signature/attestation block, and no stamp-duty endorsement.** The PDF is literally `title → "Counterparty: X" → clause bodies → "not legal advice"` (`clause-editor.tsx:358-364`). An instrument in that form is **inadequately stamped and unexecuted on its face**, which under **s.35 Indian Stamp Act makes it inadmissible in evidence** until stamped/penalty-paid, and leaves the "who signed, when, where" open to challenge. Every clause quality issue below is secondary to this.

**Rating summary (Indian-law readiness):**

| Template | Drafting quality | Indian-law correctness | Verdict |
|---|---|---|---|
| Mutual NDA | Good | **Loose** | Enforceable but exposed on remedies + non-solicit + notice |
| Vendor MSA | Very good (US-style) | **Loose–Defective** | Best content; wrong on taxes/TDS, interest, indemnity control, penalty |
| SOW | Good | Adequate | Mostly commercial; low legal risk |
| Software License | Good | Loose | IP/data OK; missing Indian tax + termination-notice conflict |
| Customer Agreement | Thin | Loose | Over-compressed; SLA-credit "sole remedy" risk |
| Colocation/Lease | Good | **Defective** | Lease → **compulsorily registrable + heavy stamp**; silent on both |
| SLA/Support | Good | Adequate | Operational; low legal risk |

---

## 1. Structural / cross-cutting defects (apply to ALL templates)

These are the highest-priority fixes because they affect every document the engine emits.

### 1.1 No execution block — **[CRITICAL]**
The rendered instrument has no:
- **Parties recital** ("This Agreement is made on [date] at [place] BETWEEN A [CIN/registered office] AND B …") — required to identify legal persons, establish *situs* (which decides stamp jurisdiction), and fix the date.
- **Testimonium + execution block** ("IN WITNESS WHEREOF …"), signatory name/designation/authority, and **witness lines** (needed for certain instruments and prudent for all).
- **Stamp endorsement area** (space for e-stamp certificate number / franking / stamp paper details).

*Consequence:* Under **s.35 Indian Stamp Act**, an unstamped/under-stamped instrument is **inadmissible in evidence** (curable only by paying duty + penalty up to 10×). Without a signature/authority block, execution and authority (Companies Act s.21 / Board authorisation) are contestable.
**Fix:** Add a mandatory, non-editable **Execution & Stamp schedule** to `buildContractDocumentHtml`: parties recital with CIN/PAN/GSTIN/registered office, effective date, place of execution, per-party signatory block (name, designation, "duly authorised vide Board Resolution dated ___"), witness block, and a stamp-duty endorsement placeholder.

### 1.2 No stamp-duty logic anywhere — **[CRITICAL]**
Stamp duty in India is **State-specific and instrument-specific** (e.g., agreements, leases, and agreements *with* security/indemnity attract different duty across Maharashtra, Karnataka, Delhi, etc.). The `contracts` schema *tracks* `stampDutyStatus`/`registrationStatus` (`contracts.ts:90-92`) but **no template tells the user what duty applies, in which State, or that it must be paid before/at execution.**
**Fix:** Per template + governing-State, surface a **stamp-duty + registration advisory** (even if just guidance text + a "confirm stamped" gate before marking `active`). This is the difference between "a tracker" and "a compliant instrument."

### 1.3 "Attorneys' fees" is a US import — **[MODERATE]**
MSA indemnity says "including reasonable **attorneys' fees**" (`:443`). Indian costs regimes don't award attorneys' fees as of right; the enforceable Indian phrasing is "**legal costs and expenses on a full-indemnity / solicitor-client basis**." Harmless but signals a foreign template; a counterparty will argue the cost-shifting is unenforceable as drafted.

### 1.4 Governing-law/seat coupling for arbitration — **[MODERATE]**
Templates let the user pick governing law ("Republic of India") and, separately, a dispute method that may name a **foreign seat/rules (ICC/LCIA)** (`:544-549`). Two Indian parties choosing a **foreign seat** raises live enforceability questions (*PASL v GE*, and s.28 Contract Act on ousting Indian law). There is no guard preventing an India-law + foreign-seat combination between two Indian entities.
**Fix:** Constrain/warn: if both parties are Indian and governing law is India, default seat must be Indian; foreign-seat options should gate on a "cross-border" flag.

### 1.5 "Effective Date" referenced but never defined/collected — **[MODERATE]**
Clauses repeatedly say "commence on the **Effective Date**" (NDA `:236`, MSA `:486`) but the document has no field that *sets* the Effective Date. An undefined defined-term is a classic ambiguity a counterparty exploits.

---

## 2. Template-by-template Indian-law findings

### 2.1 Mutual NDA
- **Remedies clause overreaches (`:279`)** — "entitled to seek equitable relief … **without the necessity of proving actual damages or posting any bond**." Under the **Specific Relief Act** and CPC Order XXXIX, Indian courts grant injunctions on their own tests (prima facie case, balance of convenience, irreparable harm) and **routinely require an undertaking as to damages**. A clause purporting to pre-empt the court's discretion is **not binding on the court** and reads as amateur to Indian eyes. *Recommend:* soften to "may seek interim and permanent injunctive relief **in addition to** damages," and delete the "no bond/no proof" language.
- **Non-solicitation (`:296`) — s.27 Contract Act risk.** Blanket "**not … hire**" for 12 months post-term is a **restraint of trade**; s.27 voids agreements in restraint of trade, and Indian courts strike **post-term** hiring bans while sometimes upholding **non-solicitation** (active poaching). *Recommend:* limit to non-*solicitation* only (not "hire"), tie to employees with whom there was actual contact, and add a "does not restrain general employment" carve-out (already partly present — strengthen).
- **Notice period conflict (`:236`)** — NDA is terminable on 30 days' notice but confidentiality "survives … for {{nda_survival_years}} from **the date of disclosure**." Survival keyed to date-of-disclosure means obligations on early disclosures may **expire during the term** — likely not intended. *Recommend:* survival "from termination/expiry."
- **Stamp:** an NDA is a low-duty agreement in most States but **still stampable** — see §1.2.

### 2.2 Vendor MSA (the flagship — most exposure because most-used)
- **Taxes clause is India-wrong (`:370`)** — "Fees are exclusive of all taxes. Client shall be responsible for all applicable taxes, **excluding taxes based on Service Provider's income**." In India this collides with **TDS**: the Client is *statutorily obliged* to **withhold TDS** (s.194C/194J) on the provider's income and remit it. The clause as drafted implies the Client won't touch income-based taxes, which contradicts the withholding duty and invites a gross-up dispute. *Recommend:* add "**Client shall deduct tax at source (TDS) as required under the Income-tax Act and provide Form 16A; GST shall be charged by Service Provider on a valid tax invoice and is payable by Client.**"
- **No GST mechanics** — Indian B2B services require a **GST-compliant tax invoice**, correct **place-of-supply**, and reverse-charge edge cases. "Fees are exclusive of taxes" is insufficient. *Recommend:* explicit GST clause (registration numbers, valid invoice condition precedent to payment, RCM handling).
- **Interest rate "1.5%/month" (`:361,366`)** — 18% p.a. As a **liquidated sum it's fine**, but for **MSME suppliers** the **MSMED Act 2006 mandates interest at 3× the RBI bank rate (compounded monthly)** and overrides contractual rates. If the *provider* is an MSME, the contractual 1.5%/month is *floor-not-ceiling* and the clause is misleading. *Recommend:* add "or, where the payee is a registered MSME, the rate prescribed under the MSMED Act 2006, whichever is higher."
- **Indemnity — "sole control over defense and settlement" (`:447`)** — pairing "sole control" with the indemnitee's consent-not-unreasonably-withheld is standard, but Indian counsel will want the indemnitee's right to **participate with own counsel** and a carve-out that no settlement admitting **liability/criminality or non-monetary obligations** binds the indemnitee. Minor but worth tightening.
- **Limitation of liability (`:469`)** — the cap + consequential-loss waiver is good drafting. Under **s.74 Contract Act**, India doesn't distinguish liquidated vs penalty the way the US does; caps are generally upheld as agreed risk allocation, so this survives. **Keep**, but note the ALL-CAPS is cosmetic in India (no conspicuousness doctrine like UCC) — fine to retain.
- **Insurance in ₹ (`:502-503`)** — correctly localised (₹1cr GL / ₹2cr PI). Good. Consider **Workmen's Compensation Act 1923** naming rather than generic "Workers' Compensation" (`:505`).
- **Data Protection (`:525`)** — references DPDP Act 2023 and a DPA schedule but **no DPA is generated** and DPDP's specific constructs (Data Fiduciary/Processor, consent, breach notice **to the Data Protection Board**, s.8 obligations) aren't reflected. The 72-hour breach-notice (imported from GDPR) is **not** the DPDP standard (DPDP requires notification to the Board and affected principals in the form/manner prescribed — timing per rules). *Recommend:* DPDP-specific processor clause + generate the referenced DPA, or stop referencing a schedule that doesn't exist.

### 2.3 SOW — adequate
Commercial scope/acceptance/change-control; low Indian-law risk. Only note: "If no MSA exists, payment is due within thirty (30) days" — a bare SOW then needs its own governing-law/dispute/stamp block, which the engine won't add (see §1.1). Flag SOW-without-MSA as needing full boilerplate.

### 2.4 Software License — loose
- Same **TDS/GST** gap as MSA (software licensing raises **royalty-vs-services** characterisation and **s.194J / equalisation-levy / cross-border withholding** questions — material if licensor is foreign). *Recommend:* Indian tax clause + a cross-border withholding line.
- **Termination-notice internal conflict:** term clause auto-renews (`sl_auto_renew`) but "Termination for Breach … thirty (30) days" is hard-coded while other templates parameterise the cure period — inconsistent and non-editable here.
- "**Data breach … within seventy-two (72) hours**" — again a GDPR figure, not DPDP.

### 2.5 Customer Agreement — thin + one substantive risk
- **SLA credits "sole remedy" (`:1001`)** — "Service credits are Customer's **sole remedy** for availability shortfalls." Under Indian law an exclusive-remedy clause that leaves the customer without recourse for **persistent** breach can be attacked as **unconscionable / defeating s.23 Contract Act** in B2C-adjacent or unequal-bargaining contexts. For SMB customers it's usually fine; keep but add "except for [chronic failure/termination right]."
- Over-compression: clauses 4–9 are one-paragraph summaries. Enforceable, but the **IP, liability, and data clauses are materially thinner** than the MSA equivalents for what is often a **revenue** contract. Recommend promoting them to MSA-depth.

### 2.6 Colocation / Lease — **defective for Indian law [HIGH]**
This template is styled as a **lease/leave-and-licence of immovable property**, and Indian law treats those very differently from a services contract:
- **Registration Act 1908, s.17:** a **lease of immovable property from year to year or for a term exceeding one year** (or reserving yearly rent) is **compulsorily registrable**; an unregistered such lease is **inadmissible to prove its terms (s.49)**. The template auto-renews for 12-month periods (`:1107-1125`) and is silent on registration.
- **Stamp duty on leases is high and State-specific**, computed on rent + term + deposit — the template says nothing.
- **Leave-and-licence vs lease** distinction (Transfer of Property Act s.105 vs Easements Act s.52) is legally decisive in India and unaddressed — many "colocation/office" arrangements are deliberately structured as **licences** to avoid tenancy protection.
*Recommend:* either (a) re-cast as a **leave-and-licence** with the correct recitals and a **mandatory registration + stamp advisory**, or (b) add a prominent gate: "Immovable-property arrangements may require registration under the Registration Act 1908 — obtain advice." As drafted it risks producing an **unregistered, inadmissible** lease.

### 2.7 SLA/Support — adequate
Operational; the priority matrix and credit mechanics are fine. Low Indian-law risk. Same generic execution/stamp gap (§1.1).

---

## 3. Coverage gaps — the "counts" question

You asked about **content quality *and* counts**. Two count problems:

### 3.1 Missing template types (enum promises, content doesn't deliver)
`contractTypeEnum` advertises **10 types**; only **7 have content**. Three ship as **enum-only with zero text**:
- **`employment`** — **highest-value gap for the ICP.** An Indian employment contract must speak to: Shops & Establishments Act (State), **gratuity (Payment of Gratuity Act)**, **PF/ESI**, **POSH Act 2013** (mandatory), notice/probation, **s.27 non-compete unenforceability** (so garden-leave/non-solicit instead), IP assignment (s.19 Copyright / patents), and maternity benefit. Its absence is conspicuous for an HR-adjacent product.
- **`vendor`** — ironically the **default `type`** (`contracts.ts:75`) has no template (users likely map it to MSA, but the default lands on empty content).
- **`partnership`** — needs LLP Act 2008 / Partnership Act 1932 framing.

### 3.2 Missing clauses *within* existing templates (Indian must-haves)
Across the 7 templates, these standard Indian clauses are **absent** and should be added as togg="on" defaults:
1. **Stamp duty & registration** clause (who bears duty; condition precedent) — *all*.
2. **TDS / GST / tax** clause done the Indian way — *MSA, License, Customer, Colocation*.
3. **Anti-bribery / anti-corruption** (Prevention of Corruption Act 1988; and if any US/UK nexus, FCPA/UKBA) — *MSA, Customer, License*.
4. **MSME status representation** (triggers MSMED interest + 45-day payment) — *MSA, SOW, Customer*.
5. **POSH compliance** rep (vendor's on-site personnel) — *MSA, Colocation*.
6. **Notices** with a real mechanism (address, email, deemed-receipt) — several templates say "addresses on the Cover Page" but no cover page is generated (§1.1).
7. **Dispute-resolution seat/venue/language + number of arbitrators + appointment mechanism** — current arbitration options name a forum but not **number of arbitrators / appointment / language / interim-relief-to-courts (s.9)**, which Indian arbitration clauses need to be operable.
8. **Set-off, assignment of receivables, and e-sign validity** (IT Act s.5/s.10A — confirm electronic execution is agreed, given the product's own e-sign flow).

---

## 4. What's actually good (so we don't over-correct)
- Confidentiality mechanics, exclusions, IP pre-existing/work-product split, and limitation-of-liability drafting are **genuinely solid** and survive Indian scrutiny.
- India localisation *has been started* correctly: default governing law "Republic of India," **A&C Act 1996** arbitration option with an Indian seat, **DPDP 2023** default, **₹** insurance figures, and schema fields for **stamp duty / registration**. The bones are right; the flesh (tax, execution, registration, restraint-of-trade) is missing.
- The **"not legal advice" disclaimer** is present (`clause-editor.tsx:383`) — necessary and correct given §5 below.

---

## 5. Regulatory caution (product-level, not clause-level)
Auto-generating executable legal instruments for third parties sits near the line of the **Advocates Act 1961** (practice of law) and consumer-protection exposure if a defective instrument causes loss. The mitigations are: (a) keep the prominent disclaimer, (b) **do not** claim the output is "ready to sign / legally vetted," (c) frame outputs as **"lawyer-reviewable drafts,"** and (d) add the "needs-a-professional" gate for high-stakes types (employment, lease, anything registrable). This aligns with the "reduces reliance on a lawyer, doesn't replace one" positioning in the companion docs.

---

## 6. Prioritised fix list

| # | Fix | Severity | Where |
|---|---|---|---|
| 1 | Add execution architecture (parties recital, effective date, place, signatory + witness + stamp block) | **Critical** | `clause-editor.tsx:346` `buildContractDocumentHtml` |
| 2 | Add stamp-duty + registration advisory/gate per template × State | **Critical** | new content + wizard gate |
| 3 | Fix TDS/GST tax clause (Indian withholding + invoice) | High | MSA `:370`, License, Customer, Colocation |
| 4 | Re-cast Colocation as registrable lease/leave-&-licence with registration warning | High | `COLOCATION_LEASE` |
| 5 | Fix NDA remedies (remove "no bond/no proof"); fix non-solicit for s.27 | High | NDA `:279`, `:296` |
| 6 | Add MSME interest/payment + POSH + anti-bribery clauses | Medium | MSA, SOW, Customer |
| 7 | Replace GDPR "72-hour" with DPDP-correct breach mechanics; generate the referenced DPA | Medium | MSA `:525`, License, Customer |
| 8 | Make arbitration clause operable (arbitrators/appointment/language/s.9) | Medium | `msa_general` + others |
| 9 | Build the 3 missing templates (employment, vendor, partnership) — employment first | Medium | new templates |
| 10 | Define & collect "Effective Date" | Medium | wizard field |

**Effort framing:** items 1, 3, 5, 7 are **content edits** (cheap, high value). Items 2, 4, 8, 10 need **wizard/render changes**. Item 9 is new content. None require the artifact-*engine* work discussed in the run-without-professional memo — this is tightening what already ships.

---

*All clause quotations verified against `apps/web/src/lib/contract-templates.ts` and `apps/web/src/components/contracts/clause-editor.tsx` on 2026-07-03. This memo is an engineering/product legal-quality review, not legal advice; substantive clause changes should be confirmed with Indian counsel before shipping.*
