# IT Services module — product upgrade plan (ServiceNow & Salesforce baseline)

**Authors:** Product Specialist + ITIL / ITSM practice alignment  
**Audience:** Product, engineering, customer success, executive sponsors  
**Scope:** **IT Services module only** — tickets, service requests, SLM, knowledge, catalog, change/problem adjacency, self-service, reporting *as they relate to service delivery*. Excludes HR, Finance, full GRC, unless they touch the service desk experience.  
**Related engineering artifacts:** `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md`, `docs/QA_ITSM_E2E_TEST_PACK.md`, `docs/ITSM_STAGING_RUNBOOK.md`

---

## 1. Purpose and product thesis

NexusOps IT Services competes for mindshare with **ServiceNow ITSM** and **Salesforce Service Cloud** not by cloning every surface, but by delivering a **coherent, fast, multi-tenant incident and request engine** with **clear ITIL behaviour**, **lower operational cost**, and **opinionated defaults** that enterprise teams can extend.

This plan:

1. **Benchmarks** SNOW and SFDC on dimensions that matter for IT Services.
2. **States** where NexusOps is already differentiated or behind.
3. **Sequences** upgrades by **customer value × ITIL maturity × feasibility**.

---

## 2. Competitive review (Product + ITIL lens)

### 2.1 ServiceNow ITSM — what customers buy

| Capability area | Typical SNOW value | ITIL 4 practice anchor |
|-----------------|-------------------|-------------------------|
| **Incident & case core** | Mature workflows, templates, task hierarchy | Incident management |
| **Service request & fulfilment** | Request items, fulfilment tasks, cart | Service request management |
| **Change & release** | CAB, risk, collision detection, blackout | Change enablement |
| **Problem & known error** | KEDB, root-cause workflows | Problem management |
| **SLM / OLAs** | Contracts, schedules, holidays, multi-SLA | Service level management |
| **CMDB & service mapping** | CI relationships, impact analysis | Service configuration management |
| **Knowledge & deflection** | KB lifecycle, search, portal deflection | Knowledge management |
| **Major incident** | War room, comms, status pages | Incident management (scale) |
| **Automation** | Flow Designer, IntegrationHub | Continual improvement + automation |
| **Reporting & experience** | dashboards, Agent Workspace, mobile | Measurement & continual improvement |

**SNOW implication for NexusOps:** Buyers expect **predictable lifecycle**, **auditability**, **SLA honesty**, and a **path** to CMDB and major incident—not necessarily day-one parity.

---

### 2.2 Salesforce Service Cloud — what customers buy

| Capability area | Typical SFDC value | ITIL 4 practice anchor |
|-----------------|-------------------|-------------------------|
| **Case model** | Channels, entitlements, milestones | SLM + incident/request |
| **Omnichannel** | Voice, chat, messaging, routing | Request fulfilment + operations |
| **Self-service & communities** | Portals, Experience Cloud | Service request management |
| **Einstein / AI** | Classification, summaries, bots | Knowledge + automation |
| **B2B complexity** | Accounts, contracts on case | SLM (commercial) |
| **Platform** | Metadata, AppExchange, sandboxes | General (out of strict ITSM scope) |

**SFDC implication for NexusOps:** Buyers expect **entitlement-grade SLM narrative**, **omnichannel story** (even if integrated), and **strong self-service**—not necessarily SFDC’s full platform depth.

---

### 2.3 NexusOps IT Services — current position (summary)

| Strength | Gap |
|----------|-----|
| Unified **ticket** model (incident / request / problem / change type) + **relations** API/UI | **CMDB–ticket** linkage and impact analysis |
| **Priority + policy-based SLA** targets + breach jobs (with Redis) | **Calendars**, **pending** enum ops (see runbook §7), **OLA** between teams |
| **Change** module + **catalog** + **KB** + RBAC hardening | **Major incident**, **native omni**, **enterprise analytics** |
| **Developer-friendly** API (tRPC), idempotent create | **Integration catalogue** size vs SNOW/SFDC |

---

## 3. Strategic pillars (how we upgrade the product)

| Pillar | Customer promise | ITIL alignment |
|--------|------------------|----------------|
| **P1 — Trustworthy service operations** | Every ticket transition, SLA minute, and permission is defensible in an audit. | Incident + SLM + information security |
| **P2 — Fulfilment, not just logging** | Requests and catalog items complete with tasks, approvals, and visibility. | Service request management + catalogue |
| **P3 — Connected service model** | Tickets link to services/CIs/assets when customers adopt CMDB depth. | SIM + incident/problem |
| **P4 — Scale & crisis** | Major incident and comms when the organisation needs it. | Incident management (major) |
| **P5 — Insight & improvement** | Dashboards and exports that answer “backlog, SLA, quality, rework.” | Measurement + continual improvement |

---

## 4. Phased product roadmap (IT Services only)

Phases are **product horizons**; engineering can map them to epics/sprints. Dependencies: **P1** before **P3** (data model integrity); **P2** can parallel **P1** after RBAC/SLA baseline is stable.

### Phase A — “Production credible” (0–2 quarters)

| # | Upgrade | SNOW / SFDC parity target | Success metric |
|---|---------|---------------------------|------------------|
| A1 | **SLM v2** — business calendars, holidays, clear pause rules for `pending` (ops-safe enum rollout) | Mid-market SNOW SLM | % tickets with correct SLA deadline vs ground truth |
| A2 | **Seed & demo reliability** — full seed without enum drift; smoke tenant for sales/QA | SFDC “sample data” quality | 100% pack G1 on clean DB |
| A3 | **Service request fulfilment** — catalog request → task/assignment template (minimal) | SNOW RITM-lite | Median time to first fulfilment action |
| A4 | **KB ↔ ticket** — suggested articles on ticket (rules + optional AI); “link article” action | SNOW / SFDC agent assist | Agent clicks to KB from ticket |
| A5 | **Reporting pack** — SLA %, backlog ageing, reopen rate, volume by category | SFDC reports-lite | 5 canned ITSM dashboards shipped |

**Exit criteria:** CIO-ready demo on staging; QA pack G1–G2 green; no P0 security gaps on ITSM-adjacent RBAC.

---

### Phase B — “Enterprise service desk” (2–4 quarters)

| # | Upgrade | SNOW / SFDC parity target | Success metric |
|---|---------|---------------------------|------------------|
| B1 | **CMDB-lite on ticket** — optional `configuration_item_id` / service; impact “read-only” v1 | SNOW CMDB entry | % incidents with linked CI (adopter segment) |
| B2 | **OLA / handoff timers** — between teams or statuses | SNOW OLA | Handoff breach visibility |
| B3 | **Problem workspace** — distinct from ticket-type “problem”; known error linkage to incidents | SNOW Problem | PRB→INC traceability |
| B4 | **Change collision / blackout** (read-only risk v1) | SNOW Change | CAB user avoids conflicting windows |
| B5 | **Customer-safe portal** — requester-only views, branded status | SFDC Experience-lite | CSAT on portal track |

---

### Phase C — “Crisis & platform scale” (4–8 quarters)

| # | Upgrade | SNOW / SFDC parity target | Success metric |
|---|---------|---------------------------|------------------|
| C1 | **Major incident management** — war room, comms templates, status timeline | SNOW Major Incident | Time to first comms |
| C2 | **Omnichannel router** — voice/chat adapters or deep partner integration | SFDC Omni | Channel mix coverage |
| C3 | **Vendor integration hub** — curated connectors (email, Slack, Teams, Jira) | SNOW Spokes count (subset) | Top N integrations GA |
| C4 | **Simulation / what-if SLA** | SNOW advanced planning | Planner adoption |

**Anti-pattern:** Building C1–C4 before A-phase trust is **product debt**—customers will compare broken basics to SNOW, not advanced features.

---

## 5. ITIL 4 practice coverage — upgrade map

| Practice | Phase A focus | Phase B focus | Phase C focus |
|----------|---------------|----------------|---------------|
| Incident management | SLM, pending, reporting | CMDB signal on incident | Major incident |
| Service request management | Fulfilment path | Portal depth | Omni intake |
| Service level management | Calendars, policies | OLAs | Simulation |
| Change enablement | (stabilise existing) | Collision / blackout | Release integration |
| Problem management | Linking + KB | Dedicated PRB lifecycle | Trend analytics |
| Knowledge management | Ticket surfacing | Feedback loop to quality | Deflection metrics |
| Service catalogue management | Item lifecycle | Bundled offerings | Consumer analytics |
| SIM (CMDB) | — | Ticket–CI | Service mapping lite |
| Continual improvement | Dashboards | Reopen / quality KPIs | Improvement backlog export |

---

## 6. Differentiation we preserve (do not trade away)

| Theme | vs SNOW | vs SFDC |
|-------|---------|---------|
| **Single product surface** | Less assembly of plugins | Less metadata complexity for IT-only buyers |
| **Cost predictability** | No per-fulfiller SKU narrative | No Salesforce-wide licence creep for ITSM-only use |
| **Code-level extensibility** | Faster bespoke workflows for one tenant | Faster schema/API iteration |
| **Honest scope** | “Not SNOW CMDB day one” as clarity, not apology | “Not Omni day one” with integration path |

---

## 7. Risks and product decisions

| Risk | Mitigation |
|------|------------|
| **Scope creep into full ITSM suite** | Phase gates: no C-work until A exit criteria met. |
| **SLA mistrust** | Invest in calendars + audit log of SLA clock changes (product, not only tech). |
| **Dual model confusion** (ticket `change` vs `change_requests`) | Product copy + optional “create formal change” CTA from incident. |
| **Seed/demo failures** | First-class “demo tenant” health check in CI (product blocker visibility). |

---

## 8. Governance (how Product + ITIL stay paired)

| Ritual | Output |
|--------|--------|
| **Monthly ITSM council** | Prioritised backlog vs this plan; ITIL practice owner sign-off |
| **Per release** | QA pack execution log + customer-facing “ITSM release notes” |
| **Quarterly competitive scan** | SNOW + SFDC release notes distilled to 1-page impact on NexusOps |

---

## 9. Document control

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial product upgrade plan (SNOW + SFDC baseline, ITIL-aligned phases). |

---

*This is a **product** plan; implementation sequencing lives in `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md` and QA evidence in `docs/QA_ITSM_E2E_TEST_PACK.md`.*
