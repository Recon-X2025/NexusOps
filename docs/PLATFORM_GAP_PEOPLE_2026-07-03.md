# Platform Gap Analysis — Cluster 2: People (HR / Payroll / Talent)

**Date:** 2026-07-03
**Hat worn:** CHRO / Head of HR Ops + Payroll Controller (Indian context)
**Benchmarks:** Keka, Darwinbox, greytHR, HROne (HRMS/payroll); Greenhouse, Lever (ATS); Lattice (performance/engagement)
**Modules covered:** HR core, Payroll, Recruitment/ATS, Performance, Attendance & Leave, Surveys/eNPS, OKR/Workforce planning
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**This is the strongest cluster in the entire platform, and it's carried almost entirely by payroll.** The India statutory payroll engine is genuinely production-grade and, on pure compliance depth, competitive with greytHR and Keka — which is a high bar. HR core (employee master, onboarding/offboarding cases, manager hierarchy) is solid. The talent layer (recruitment, performance, surveys) has real, correctly-modelled data structures but stops at CRUD — the *intelligence* on top (calibration, 9-box, eNPS, accrual, gratuity) is not built yet.

**One-line summary:** *A best-in-class India payroll core with a competent HR spine, wrapped in talent modules that are correctly scaffolded but not yet smart.*

**Cluster maturity ≈ 68/100** — the highest of any cluster, but with two compliance-grade holes (leave accrual, gratuity) that stop it from being a complete HR-of-record.

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| Payroll — India statutory engine | 88 | REAL, tested, production-grade |
| HR core (master, cases, onboarding, hierarchy) | 80 | REAL |
| Recruitment / ATS | 55 | REAL data model, PARTIAL workflow |
| Performance management | 55 | REAL reviews/OKRs, STUB calibration |
| Attendance & Leave | 45 | REAL requests, MISSING accrual/carry-forward |
| Surveys / engagement | 45 | REAL CRUD, MISSING eNPS math |
| OKR / Goals | 65 | REAL, cascading |
| Workforce planning / succession | 10 | MISSING |
| Gratuity (statutory) | 5 | MISSING |
| **Cluster weighted average** | **~68** | **Best cluster; payroll-led** |

---

## 1. Payroll — REAL, production-grade India engine (88)

This is the crown jewel. The math lives in **`packages/payroll-math/`** (correctly consolidated in Phase 5 commit `3e1404f`; the old `apps/api/src/lib/payroll-cycle.ts` stub is retired).

### What's genuinely correct and tested
- **12-step orchestrated payroll run** with an explicit state machine: `DRAFT → PERIOD_LOCKED → GROSS_COMPUTED → PF → ESI → PT → LWF → TDS → PAYSLIPS_GENERATED → HR/Finance/CFO approvals → STATUTORY_GENERATED → COMPLETED` (`payroll.ts:85-92`). Multi-approver gating is real.
- **EPF** — 12% employee, 8.33% EPS / 3.67% EPF employer split, 0.50% admin, 0.50% EDLI, all on the **₹15,000 statutory wage ceiling**, with voluntary-higher-PF support (`statutory-deductions.ts:66-103`).
- **ESI** — 0.75% / 3.25% on the **₹21,000 gross ceiling** with conditional applicability (`statutory-deductions.ts:105-124`).
- **Professional Tax** — genuine **state-specific slabs**: Maharashtra (incl. the ₹300 February top-up to hit the ₹2,500 cap), Karnataka, Tamil Nadu (5-slab), Telangana, WB, Delhi (nil), Gujarat (`statutory-deductions.ts:126-226`). Multi-state PT is exactly where greytHR/Keka differentiate — and it's here.
- **LWF** — state rates, correctly deducted half-yearly in June & December (FY months 3 & 9) (`statutory-deductions.ts:228-252`).
- **Income tax** — both **old and new regime slabs**, surcharge bands (10/15/25/37%) **with marginal relief** (`tax-engine.ts:93-164`), standard deduction (₹50k old / ₹75k new), Chapter VI-A (80C/80D/80CCD(1B)/80TTA/24(b)), HRA 3-condition exemption, 87A rebate, 4% cess.
- **Payslip PDF** — full layout, employer contributions, YTD, Indian number-to-words (`services/payslip-pdf.ts`), served with org/user isolation.
- **Form 16 Part B** — real FY aggregation of 12 payslips (`lib/india/form16-aggregator.ts:51-101`).
- **Statutory outputs** — ECR v2.0 (pipe-delimited, UAN/EPF/EPS/EDLI wages), PT challan, and a Form 24Q data structure (`payroll-cycle.ts:330-475`).
- **Tested** — `india-payroll-engine.test.ts` (~18KB) parametrically checks PF/ESI/PT/TDS; `money-invariants.test.ts` guards `netPay = max(0, gross − deductions)`.

*Benchmark:* greytHR/Keka auto-generate Form 16, Form 24Q, ECR, ESIC challans as payroll by-products — this engine produces the same class of outputs. On payroll-accuracy TrustRadius rates Keka 9.7 / greytHR 8.7; this engine's math is in that league.

### Payroll gaps (the two that matter)
1. **Gratuity — NOT IMPLEMENTED (5).** No `computeGratuity()`, no accrual, no final-settlement `(15/26) × last-drawn × years` formula. For any employee crossing 5 years this is a statutory payout obligation and a balance-sheet provision. greytHR automates it. **This is the single biggest payroll gap.**
2. **Form 24Q is a data structure, not a filing.** `generateForm24QData()` returns entries (`payroll-cycle.ts:461-475`) but there's no FVU/return assembly or challan mapping. Same for ECR/PT — generated as data, not filed.
3. **Multi-entity / multi-state PT auto-apply** is single-org today. Benchmark scoring puts HROne 7/7, Darwinbox 5/7 on multi-entity; this is a 1-entity design. Flag before multi-legal-entity customers.

### Regulatory watch — do not ignore
Two 2026 events reshape this engine's assumptions:
- **Four New Labour Codes active November 2025** — redefine "wages," working hours, and **gratuity eligibility**. The wage-definition change alone can shift PF/gratuity bases.
- **New Income Tax Act effective 1 April 2026** — the slab/deduction logic in `tax-engine.ts` must be re-validated against the new Act, not the 2025-26 rules it currently encodes.
This is exactly the "Layer B treadmill" risk from the Secretarial memo, now hitting payroll. Budget for a compliance refresh.

---

## 2. HR core — REAL (80)

`hr.ts` (1622 lines) + `schema/hr.ts`:
- **Employee master** with India fields: PAN, Aadhaar, UAN, tax regime, salary structure FK, statuses `active/probation/on_leave/resigned/terminated/offboarded` (`schema/hr.ts:99-140`). Full org-scoped CRUD.
- **HR cases** — onboarding/offboarding/leave/policy/benefits/equipment lifecycle with tasks and notes; `triggerOnboarding` instantiates template tasks with computed due dates (`hr.ts:396-432`). Real.
- **Manager hierarchy** — `managerId` + `dottedLineManagerId`, reportee tree via `employees.get` (`schema/hr.ts:113-114`).

Gaps: no position-management (seat/req vs person), no document-of-record vault per employee (ties to DMS cluster), no full offboarding checklist wired to asset-return/access-revocation (ties to ITAM/IAM).

---

## 3. Recruitment / ATS — REAL model, PARTIAL workflow (55)

`recruitment.ts` (~22KB) + `schema/recruitment.ts`:
- **Requisitions** (draft/open/on_hold/closed/cancelled), **candidates**, **applications** with a real 10-stage pipeline (`applied→screening→…→offer→hired/rejected`) and `stageUpdatedAt` tracking, **interviews** (typed, JSONB scorecard, rating/decision), **offers** (draft→sent→accepted/declined/expired/revoked with components). All real data structures.

**Gaps vs Greenhouse/Lever:**
- **Approval automation is scaffolded but not wired** — requisition has an approver/approvedAt field and a "draft until published" comment (`recruitment.ts:69`), but the publish/approve transition mutations aren't implemented. Same for offer approval.
- **No structured-hiring intelligence.** Greenhouse's differentiation is scorecards feeding **hiring-quality analytics** (funnel conversion, source effectiveness, interviewer calibration, DEI reporting). The scorecard JSONB exists; the analytics on top don't.
- No candidate CRM/sourcing (Lever's strength), no career-site/apply flow, no offer-letter generation (would reuse the contract PDF engine — see Legal cluster).

Verdict: a competent **applicant tracker**, not yet a **hiring system**. The cheap win is wiring the approval transitions that the schema already anticipates.

---

## 4. Performance — REAL reviews/OKRs, STUB calibration (55)

`performance.ts` (~11KB) + `schema/performance.ts`:
- **Review cycles** (annual/mid-year/quarterly/probation) with self/peer/manager deadlines and a `enable360` flag; **reviews** with reviewer roles and a real status lifecycle (`draft→self→peer→manager→calibration→completed`); **goals/OKRs** with parent-child cascading (individual/team/org), progress %, target/current values (`schema/performance.ts:93-120`). All real.

**Gaps vs Lattice:**
- **Calibration is a status, not an engine.** The `calibration` state exists but there's no calibration logic — no cross-manager normalization, no forced-distribution / bell-curve, no rating-inflation flagging.
- **No 9-box** (performance × potential) — not found anywhere. This is the headline talent-review artifact Lattice/Workday ship.
- No competency framework, no continuous 1:1s/feedback, no succession linkage.

Verdict: real appraisal *plumbing*, missing the *talent-review intelligence* layer.

---

## 5. Attendance & Leave — REAL requests, MISSING accrual (45)

`hr.ts` leave + `schema/hr.ts`:
- **Leave requests** (typed, pending/approved/rejected/cancelled) with approver, and **leave balances** (total/used/pending, unique per employee/type/year) updated via upsert on request (`schema/hr.ts:215-265`). **Attendance records** with status/shift/clock-in-out/overtime. Workforce analytics (headcount, tenure, attrition, leave analytics) are real (`workforce.ts`).

**The critical gap — no accrual engine (STUB).** Balances are only mutated when a leave is requested; there is **no monthly accrual, no eligibility rules, no year-end carry-forward/lapse/encashment**. This means:
- Opening balances must be entered manually.
- Carry-forward at FY rollover doesn't happen.
- Leave-encashment-at-exit (a payroll settlement input) can't be computed.
Every India HRMS (greytHR/Keka) treats accrual + carry-forward + encashment as core. **This is the second compliance-grade hole after gratuity**, and the two are linked at full-and-final settlement.

Also missing: attendance regularization workflow, shift rostering, geo/biometric integration, timesheet→payroll LOP wiring (the LOP factor exists in payroll but isn't fed from attendance automatically).

---

## 6. Surveys / engagement — REAL CRUD, MISSING eNPS math (45)

`surveys.ts` (~5KB) + `schema/surveys.ts`:
- Surveys (csat/nps/pulse/exit/onboarding/…), flexible JSONB question types, responses with score, public-invite deeplinks (tokenHash/expiry). Real capture and basic result aggregation (count, avg score).

**Gaps:**
- **No eNPS calculation.** The `nps` type and a `score` field exist, but there's no Promoter(9-10)/Passive(7-8)/Detractor(0-6) bucketing or `%Promoters − %Detractors` math. eNPS is the entire point of the `nps` survey type and it isn't computed.
- No segmentation (by dept/tenure/manager), no trend-over-time, no sentiment/text analysis on open-text, no benchmarking.

Verdict: a survey *form engine*, not an *engagement analytics* product (Lattice/CultureAmp territory).

---

## 7. Workforce planning / succession — MISSING (10)

OKRs are real (covered above). But genuine workforce planning — headcount forecast vs plan, skills/bench, **succession planning**, org-design scenarios — is absent. No tables, no router. This is enterprise-tier (Workday) and reasonably descoped for the ICP, but should be named as a deliberate gap, not an oversight.

---

## 8. Prioritized fix list (CHRO ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **Leave accrual + carry-forward + encashment engine** | Leave | Med-High | Compliance-grade hole; feeds F&F settlement |
| 2 | **Gratuity computation + accrual provision** | Payroll | Med | Statutory payout & balance-sheet provision; benchmark table-stakes |
| 3 | **Re-validate tax engine vs New Income Tax Act (Apr 2026) + Labour Codes** | Payroll | Med | Live regulatory change; current logic encodes 2025-26 rules |
| 4 | **Wire recruitment approval transitions** (publish req, approve offer) | ATS | Low | Schema already anticipates it; cheap credibility win |
| 5 | **eNPS calculation + survey segmentation** | Surveys | Low | Makes the `nps` type actually functional |
| 6 | **Attendance → payroll LOP auto-feed** | Attendance | Med | Closes the manual gap between attendance and pay |
| 7 | **Form 24Q / ECR / PT actual return-file assembly** | Payroll | Med | Turns generated data into filable returns |
| 8 | **Performance calibration + 9-box** | Performance | Med-High | Talent-review intelligence vs Lattice/Workday |
| 9 | **Offer-letter generation** (reuse contract PDF engine) | ATS | Low | Cross-module reuse; closes hire→onboard loop |
| 10 | **Multi-entity / multi-state PT** | Payroll | High | Only for multi-legal-entity customers |

Items **4, 5, 9 are cheap**; **1, 2, 3** are the compliance-grade must-dos; **8** is the talent-differentiation play.

---

## 9. Bottom line for this cluster

Payroll is a genuine competitive asset — on India statutory depth it stands next to greytHR and Keka, which almost nothing else in this platform can claim against its category leader. HR core is solid. The talent modules (ATS, performance, surveys) are **correctly modelled but stop at CRUD** — they have the right tables and the wrong amount of intelligence.

The two things that stop this from being a complete HR-of-record are **leave accrual/carry-forward** and **gratuity** — both compliance-grade, both linked at full-and-final settlement, and both are the difference between "runs payroll" and "runs the employee lifecycle." Add those plus the cheap ATS/eNPS wiring and this cluster moves from ~68 to a genuinely market-credible ~80.

And because payroll is this good, the **regulatory-refresh discipline** (New Labour Codes Nov 2025, new Income Tax Act Apr 2026) is now a standing operational cost, not a one-time build — exactly the drift dynamic flagged in the Secretarial memo.

**Sources:**
- [Keka vs greytHR (India 2026)](https://hrone.cloud/blog/keka-vs-greythr-india/)
- [10 Best Payroll Software for India 2026 (PF/ESI/TDS)](https://hrone.cloud/blog/best-payroll-software-india/)
- [Darwinbox — 10 Best Payroll Software India](https://darwinbox.com/blog/10-best-payroll-software-india)
- [Greenhouse vs Lever ATS 2026](https://bestrecruitingtools.com/blog/greenhouse-vs-lever-ats-comparison-2026)
- [Greenhouse vs Lattice cost/ROI 2026](https://www.itqlick.com/compare/greenhouse/lattice)
