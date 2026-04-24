# NexusOps — long-tail market readiness & ship plan

**Role:** Product specialist (execution owner: assign PM + Eng + QA).  
**ICP:** Startups and SMBs (long tail of ServiceNow / Salesforce).  
**North star:** **Command centre** — one place to see state, act on exceptions, run workflows across ops, people, money, risk, and customer surface.  
**Non-goal (v1 ship):** Enterprise platform parity with SNOW/SFDC (see §8).

**Inputs:** Mirror the discipline proven on ITSM (`docs/QA_ITSM_E2E_TEST_PACK.md`, `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md`, `docs/ITSM_STAGING_RUNBOOK.md`).

**Module vs ITSM bar:** Per-pillar gaps and concrete actions — `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md`. **All-router long-tail QA index (non–ITSM-grade):** `docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md`.  

**Execution ledger:** `docs/MODULE_GAP_EXECUTION_STATUS.md` (what shipped vs open).

---

## 1. Definition of “market ready” (ship bar)

| Gate | Must be true |
|------|----------------|
| **G0 — ICP** | Single-page ICP: employee band, industries in/out, “we replace X not Y” for top 3 alternatives. |
| **G1 — First-run** | Fresh org: migrate → seed → **first value in &lt; 1 day** (documented path); demo tenant health check in CI or nightly. |
| **G2 — Trust** | RBAC: no critical **UI/API permission drift** on shipped pillars; `mergeTrpcQueryOpts` (or equivalent) on gated queries; P5 viewer regressions pass. |
| **G3 — Proof** | Per **shipped pillar** (§4): mini QA pack + API smoke in CI + ≥1 Playwright happy path where UI exists. |
| **G4 — Ops** | Staging runbook covers **all ENV dependencies** for shipped features (DB, Redis where jobs exist, optional keys documented as N/A). |
| **G5 — Narrative** | Website/deck copy matches **actual** behaviour (no orphan statuses, no dead premium claims). |

**Ship = G0–G5 green on the “v1 pillar set” in §3.**

---

## 2. v1 pillar set (what ships first)

**Tier A — launch backbone (non-negotiable)**

| Pillar | User promise | Primary routes / routers |
|--------|----------------|---------------------------|
| **Identity & org** | Sign up, invite, roles, session | `auth`, admin users |
| **Command surface** | Home / dashboard: “what needs attention” | `dashboard`, notifications |
| **ITSM** | Tickets, SLA honesty, portal self-service | `tickets`, `knowledge`, `catalog`, portal |
| **Approvals** | Cross-module queue | `approvals` |

**Tier B — long-tail differentiators (ship if green by date; else “beta” flag)**

| Pillar | Promise | Notes |
|--------|---------|--------|
| **HR (ops slice)** | Cases, leave, directory — **not** full Workday | `hr`, payroll only if stable |
| **CRM** | Pipeline + accounts for SMB | `crm` |
| **Customer service** | Cases linked to customer; avoid double truth with tickets | `csm` + explicit positioning vs `tickets` |
| **Compliance (ops slice)** | Risks, policies, evidence-lite | `grc` + `security` read paths |
| **Legal + contracts** | Register, lifecycle, obligations | `legal`, `contracts` |

**Tier C — post-ship (do not block v1)**

Deep CMDB, full CLM, enterprise GRC, omnichannel, heavy analytics — document as **roadmap**, not ship criteria.

---

## 3. Execution timeline (12 weeks, tight)

Assume **one** full-stack squad + **0.5** QA + **0.25** DevOps; adjust parallelism if staffed.

### Phase 0 — Lock & instrument (Week 0–1)

| Deliverable | Owner | Exit |
|-------------|-------|------|
| ICP one-pager + “out of scope v1” | PM | G0 |
| **Quality bar template** cloned from ITSM for Tier A/B | PM + Eng | `docs/MODULE_QUALITY_BAR.md` (or per-module stubs) |
| CI: **smoke** on `auth`, `tickets`, `dashboard`, `approvals` on every PR touching those | Eng | Failing PR blocks merge |
| Demo tenant / seed smoke (nightly or CI) | DevOps + Eng | G1 draft |

### Phase 1 — Backbone hardening (Weeks 2–4)

| Workstream | Exit |
|------------|------|
| Onboarding: signup → org → first ticket OR first approval | G1 |
| Dashboard: real “attention” KPIs only (remove or gate dead widgets) | G2 |
| ITSM: close any **open §11-style gaps** still tagged in QA pack | G3 ITSM |
| Portal: requester paths match QA personas | G3 portal slice |

### Phase 2 — Pillar parity pass (Weeks 5–8)

For **each** of HR, CRM, CSM, GRC (compliance slice), Legal+contracts:

| Step | Output |
|------|--------|
| 1. **Hero journey** map (1 page) | 3–7 steps from login to “done” |
| 2. **RBAC matrix** audit vs `apps/api/src/server/rbac.ts` | List of fixes + tests |
| 3. **Mini QA pack** (10–20 cases) | `docs/QA_<PILLAR>_E2E_TEST_PACK.md` |
| 4. **API layer tests** | Extend existing layer smoke pattern |
| 5. **Playwright** | 1 path per pillar minimum |
| 6. **Runbook addendum** | ENV + seed notes in `docs/ITSM_STAGING_RUNBOOK.md` or sibling doc |

**Rule:** No pillar is “launch” without steps 2–5.

### Phase 3 — Polish & cut (Weeks 9–10)

| Activity | Exit |
|----------|------|
| Remove or hide **non–hero** screens that fail G2/G3 | PM + Eng |
| Performance pass on list pages (N+1, query limits) | Eng |
| Copy pass: empty states, error messages, “beta” labels | PM + Design |

### Phase 4 — Ship prep (Weeks 11–12)

| Activity | Exit |
|----------|------|
| Release notes + **known limitations** | PM |
| Support runbook (escalation, log locations) | DevOps |
| **Go / no-go** review against G0–G5 | Leadership |

---

## 4. Workstreams (parallel tracks)

| Track | Lead | Week focus |
|-------|------|--------------|
| **Product / ICP** | PM | Phase 0–1 |
| **ITSM + portal** | Eng | 1–4 |
| **HR** | Eng | 5–6 |
| **CRM + CSM** | Eng | 6–7 (align customer record model in copy + tests) |
| **Compliance + Legal** | Eng | 7–8 |
| **Platform** | Eng + DevOps | 0–12 continuous: CI, staging, observability |
| **QA** | QA | 2–12: pack execution logs per release |

---

## 5. Metrics (leading, weekly)

| Metric | Target |
|--------|--------|
| **Time-to-first-value** (tester script) | &lt; 4 hours hands-on |
| **Critical path Playwright** | 100% green on `main` |
| **RBAC regression** | 0 P0/P1 open |
| **Open QA-pack failures** (Tier A) | 0 at ship |
| **Open QA-pack failures** (Tier B) | ≤ agreed “beta” budget or scope cut |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Scope creep** (“just one more module”) | Tier C locked; everything else backlog |
| **Double truth** (CSM vs tickets) | Written decision in ICP + one diagram in runbook |
| **Payroll / HR regulatory** | Ship HR **cases/leave** first; payroll **beta** or region-gated |
| **Sales promises ≠ build** | G5 narrative gate; sales one-pager from same doc set |

---

## 7. Launch checklist (day before ship)

- [ ] G0–G5 satisfied for Tier A + agreed Tier B set  
- [ ] All Tier A Playwright + API smoke green  
- [ ] Staging URL + seed credentials documented  
- [ ] Pricing / packaging page matches edition limits (if applicable)  
- [ ] Rollback: previous release tag + DB migration notes  

---

## 8. Explicit post–v1 (do not conflate with long-tail ship)

- Enterprise SNOW/SFDC **platform** competition  
- Full CMDB / service mapping  
- Full CLM + e-sign  
- Omnichannel contact centre  
- Multi-region, complex data residency  

These belong to **Variant 2** roadmap, not this ship plan.

---

## 9. Document control

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-04-07 | Initial long-tail market readiness & 12-week ship plan |

---

*Next optional artifact: `docs/MODULE_QUALITY_BAR.md` (template checklist cloned from ITSM discipline) — create when Eng agrees on repo layout.*
