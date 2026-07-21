# Platform Gap Analysis — Cluster 3: ITSM & IT Operations

**Date:** 2026-07-03
**Hat worn:** IT Service Management Lead / SRE / Incident Commander
**Benchmarks:** ServiceNow ITSM, Jira Service Management, Freshservice (service desk / change / problem); PagerDuty (on-call / event intelligence)
**Modules covered:** Incident/ticket, SLA, Change (CAB), Release/Deployment, Problem/KEDB, Service Catalog, Events/ITOM, On-call/escalation, Work orders, DevOps, KB, CMDB tie-in, Business rules
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**The "desk" is real; the "ops" is not.** The reactive service-desk half of ITSM — incidents, SLAs, change with CAB gating, problem management, service catalog, work orders — is genuinely built, enforced, and in several places better than mid-market tools (real SLA business-calendar math with dual breach detection, real high-risk-change CAB gating). But the proactive IT-operations half — event correlation, on-call paging/escalation, deployment-failure-to-incident — is **schema without engine**. The tables exist; the automation that makes them useful does not run.

**One-line summary:** *A credible ITIL service desk with real SLA and change discipline, bolted to an ITOM/on-call layer that stores policies it never evaluates.*

**Cluster maturity ≈ 55/100** — a strong service-desk core dragged down by three stubbed automation loops (events, escalation, deploy→incident).

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| Incident / ticket management | 78 | REAL — lifecycle, idempotency, assignment |
| SLA management | 80 | REAL — business calendar + dual breach detection |
| Change management (CAB) | 78 | REAL — high-risk gating enforced |
| Problem / KEDB | 70 | REAL — lifecycle + KB publish |
| Service catalog / requests | 72 | REAL — multi-item cart + fulfillment |
| Work orders / field service | 75 | REAL — lifecycle + auto-assign + audit |
| Knowledge base | 72 | REAL — versioned, problem→KB |
| CMDB / CI tie-in | 55 | PARTIAL — model real, no impact analysis |
| Business rules engine | 60 | REAL but shallow condition/action DSL |
| Release / deployment mgmt | 40 | PARTIAL — tracking, no gates |
| **Events / ITOM** | **20** | **STUB — stores, never correlates** |
| **On-call / escalation** | **35** | **PARTIAL — rotation only, no paging** |
| DevOps / CI-CD | 25 | STUB — metrics only, MTTR null |
| **Cluster weighted average** | **~55** | **Desk real, ops stubbed** |

---

## 1. Incident / ticket management — REAL (78)

`tickets.ts` + `schema/tickets.ts` + `lib/ticket-lifecycle.ts`:
- **Typed state machine** with enforced transitions via `assertTicketTransition()` (`lib/ticket-lifecycle.ts:15-24`) — illegal transitions throw.
- **Impact × urgency** fields stored (`schema/tickets.ts:27-28`), major-incident parent/child linkage (`schema/tickets.ts:170-178`).
- **Auto-assignment** via `resolveAssignment()` with load-based + round-robin and **team-level capacity parking** when a threshold is hit (`services/assignment.ts:256-264`) — genuinely good.
- **Idempotency**: idempotency key with a 5-second auto-window + Redis 24h cache + partial unique index (`tickets.ts:126-132`, `schema/tickets.ts:213-215`) — prevents duplicate tickets on retry. This is a maturity signal most mid-market tools lack.

**Gaps:**
- **No priority derivation** from the impact×urgency matrix — the values are stored but priority isn't computed from them (ServiceNow's canonical P1–P4 matrix). Easy win.
- **No multi-channel intake.** `intakeChannel` defaults to "portal" (`schema/tickets.ts:179`) but there's no email-to-ticket, chat-to-ticket, or inbound webhook. Freshservice/JSM treat email intake as table-stakes.
- **No major-incident war room** (comms channel, live timeline) despite the parent/child model existing.

---

## 2. SLA management — REAL, and genuinely good (80)

This is the standout of the cluster. `services/ticket-sla-policy.ts` + `lib/sla-business-calendar.ts` + `workflows/ticketLifecycleWorkflow.ts`:
- **Policy matching** by ticket type + category with an any-match fallback (`ticket-sla-policy.ts:41-66`).
- **Business-calendar adjustment** — deadlines roll forward past weekends and org-configured holiday dates (`sla-business-calendar.ts:32-46`). Real business-hours math, not naïve wall-clock.
- **Dual breach detection:**
  1. Per-ticket **BullMQ delayed jobs** with deterministic IDs (`sla-response-{id}`, `sla-resolve-{id}`) that fire at the deadline (`ticketLifecycleWorkflow.ts:5-11`), and
  2. A **periodic sweeper** every 60s as a safety net for lost jobs/seed data, using `FOR UPDATE SKIP LOCKED` and a 1000-row batch cap (`ticketLifecycleWorkflow.ts:118-182`).
- **Pause/resume** with auditable `slaPauseReasonCode` (`schema/tickets.ts:173-174`) and job re-sync on `pending` (`tickets.ts:153-182`).

This is real durability engineering — the dual mechanism plus skip-locked is what a production SLA engine should look like.

**Gaps:** the per-ticket breach job notifies the assignee, but there's **no escalation on breach** (it doesn't page up an on-call chain — see §8); and the pause reason codes aren't validated against a managed catalog.

---

## 3. Change management — REAL with enforced CAB gating (78)

`changes.ts` + `schema/changes.ts`:
- **Change types** normal/standard/emergency/expedited, risk low→critical (`schema/changes.ts:15-27`).
- **Enforced lifecycle** `draft→submitted→cab_review→approved→scheduled→implementing→completed/failed/cancelled` via `assertChangeTransition()` (`changes.ts:43-54`).
- **High-risk CAB gating is REAL:** for high/critical risk, approval **requires** a risk score (1–25) and a completed risk questionnaire (`impact`, `likelihood`, `rollbackValidated`) — the approval mutation is gated on it (`changes.ts:59-81, 278`). This is exactly the control ServiceNow's risk-assessment drives, and it's enforced, not cosmetic.
- **Blackout windows** with overlap detection against scheduled changes (`changes.ts:518-604`).

**Gaps:**
- **Blackout enforcement is advisory, not blocking** — the overlap check informs CAB but doesn't prevent scheduling into a freeze window.
- Impact analysis is 3 questionnaire fields, not a CI-graph-driven blast-radius (CMDB isn't traversed).
- No standard-change catalog (pre-approved templates that skip CAB).

---

## 4. Problem management / KEDB — REAL (70)

`changes.ts` problem endpoints + `schema/changes.ts`:
- **Problem lifecycle** new→investigation→root_cause_identified→known_error→resolved→closed (`schema/changes.ts:47-54`), with root cause / workaround / resolution fields and timestamped notes.
- **Known Error DB** as a separate table linked by `problemId` (`schema/changes.ts:146-159`).
- **Problem→KB publishing** creates a `[Known Error]` article auto-formatted from root cause + workaround (`changes.ts:438-454`).

**Gaps:** **no incident→problem linkage** — there's no FK and no auto-create-problem-after-N-repeated-incidents. This is the core value of problem management (turning recurring incidents into a tracked root-cause), and it's the biggest hole here.

---

## 5. Service catalog / requests — REAL (72)

`catalog.ts` + `schema/catalog.ts`:
- Catalog items with dynamic form fields, `approvalRequired`, `slaDays`, fulfillment group (`schema/catalog.ts:34-58`).
- **Multi-item cart** with transaction-wrapped batch creation, shared `batchId`, per-item variable validation, default fulfillment checklist (`catalog.ts:94-132`).
- Auto-creates a linked fulfillment ticket when no approval required.

**Gaps:** catalog `slaDays` is **not actively monitored** (no timer like tickets have); no approval-routing rules; fulfillment checklist completion isn't enforced before closure.

---

## 6. Work orders / field service — REAL (75)

`work-orders.ts` + `schema/work-orders.ts`: full lifecycle (draft→…→closed), priority/type taxonomy, **auto-assignment with capacity parking**, sub-tasks, and a **transactional activity audit log** (state change + log in one tx, `work-orders.ts:208-223`). Solid. Gap: `slaBreached` boolean exists but there's no deadline/timer wiring like tickets have — SLA on WOs is nominal.

---

## 7. Release / deployment — PARTIAL (40)

`devops.ts` + `schema/devops.ts` + `releases` table: statuses exist (planning→…→completed; deployment pending→success/failed/rolled_back across dev→prod), optional `changeId` link. But **no approval gate, no freeze-window enforcement, no auto-incident on failed deployment**. It's a tracking table, not a release-management discipline.

---

## 8. On-call / escalation — PARTIAL, the PagerDuty-shaped hole (35)

`oncall.ts` + `schema/oncall.ts`:
- Schedules with members, rotation type, **escalation chain** (`[{level, userId, delayMinutes}]`) and **overrides** are all stored.
- `activeRotation()` computes the current on-call by weeks-since-epoch modulo member count (`oncall.ts:101-123`).

**The gaps are the whole point of on-call:**
- **Overrides are stored but never evaluated** — `activeRotation()` doesn't check the override array against the current time, so a scheduled override silently does nothing.
- **Escalation chain is stored but never fired** — `delayMinutes` is never used; there's no timer, no paging, no notification. Nobody gets paged.
- **No integration with SLA breach** — a breached ticket doesn't escalate up the on-call chain.

*Benchmark (PagerDuty):* escalation policies notify one target at a time until acknowledged, escalating on timeout; that timeout-driven escalation loop is exactly `delayMinutes`, and it isn't wired. This module looks like PagerDuty in the schema and does none of it at runtime.

---

## 9. Events / ITOM — STUB, the biggest gap in the cluster (20)

`events.ts` + `schema/events.ts`:
- `itomEvents` table with severity/state, occurrence counting, `linkedIncidentId`, and even an `aiRootCause` field.
- **`itomSuppressionRules` and `itomCorrelationPolicies` tables exist** — with conditions like "count > 10 AND severity = critical" → action "create_incident".

**But none of it runs:**
- **No ingestion webhook** — there's no `/events/ingest` endpoint; events can't actually arrive from monitoring.
- **Suppression rules are listed but never matched** against incoming events.
- **Correlation policies are stored but never evaluated** — no condition evaluator, no incident-creation trigger.
- **`aiRootCause` is never populated.**

*Benchmark (PagerDuty AIOps):* alert grouping filters up to ~98% of noise via ML; correlation surfaces likely origin; transient-alert detection auto-pauses flapping alerts. Here, events are a write-only sink. **This is the single largest gap in the cluster** — the difference between "we store alerts" and "we do IT operations."

---

## 10. DevOps / CI-CD — STUB (25)

`devops.ts`: pipeline-run and deployment tables, DORA metrics (deployment frequency, lead time, change-failure-rate) computed over 30 days — but **MTTR always returns `null`** (`devops.ts:98`) because there's no incident↔deployment linkage. No webhook to update pipeline status, no auto-incident on failure. Tracking without automation.

---

## 11. CMDB tie-in & business rules

- **CMDB (55):** CI model is real and referenced from tickets/events/changes (`configurationItemId`, `affectedCis`), but relationships have **no cascading impact analysis** — a degraded CI doesn't ripple to affected services/tickets, and change impact isn't computed from the CI graph. (Deeper CMDB analysis belongs to Cluster 4.)
- **Business rules (60):** `business-rules-engine.ts` has a real evaluate→act loop (status/field-change conditions → notify/workflow-bridge actions, `:90-152`) but the DSL is shallow — no field-value comparisons, no boolean composition, no webhook/email actions, no rule priority.

---

## 12. Worker / automation wiring — the through-line

The one automation loop that **is** fully wired end-to-end is **SLA breach** (per-ticket jobs + sweeper). Everything else that should be a background loop is **not wired**:
- Escalation/paging jobs — **not found**.
- Event correlation jobs — **not found** (policies stored, never executed).
- Deployment-failure → incident jobs — **not found**.

So the cluster's automation maturity is bimodal: SLA is production-grade; the other three loops are absent.

---

## 13. Prioritized fix list (ITSM Lead ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **Event ingestion webhook + correlation-policy evaluator** (→ auto-create incident) | ITOM | High | Biggest gap; turns a data sink into IT ops |
| 2 | **Wire escalation chain + paging** (fire `delayMinutes`, notify on-call, escalate on SLA breach) | On-call | Med-High | Makes on-call actually page; connects to the real SLA engine |
| 3 | **Incident→problem linkage + auto-problem after N repeats** | Problem | Med | Core problem-mgmt value; cheap-ish given both models exist |
| 4 | **On-call override evaluation** in `activeRotation()` | On-call | Low | Bug-class: overrides silently ignored today |
| 5 | **Deployment-failure → auto-incident + MTTR linkage** | DevOps | Med | Fixes null MTTR; closes DevOps↔ITSM loop |
| 6 | **Priority derivation from impact×urgency matrix** | Incident | Low | Standard ITIL; data already stored |
| 7 | **Blocking blackout-window enforcement** (not just advisory) | Change | Low | Turns freeze windows into real controls |
| 8 | **Multi-channel intake** (email-to-ticket first) | Incident | Med | Table-stakes vs Freshservice/JSM |
| 9 | **Catalog request SLA timer** (reuse ticket SLA engine) | Catalog | Low | Reuse; closes request-SLA gap |
| 10 | **Suppression-rule matching on ingest** | ITOM | Med | Pairs with #1; noise reduction |

Items **4, 6, 7, 9 are cheap**; **1, 2** are the strategic "become IT ops, not just a desk" investments; **3, 5** close the two missing cross-module loops (incident↔problem, deploy↔incident).

---

## 14. Bottom line for this cluster

The reactive service desk is genuinely strong: real state machines, an SLA engine with business-calendar math and dual breach detection that I'd trust in production, and enforced high-risk CAB gating. On the "run a service desk" axis this is competitive with Freshservice/JSM for a mid-market IT team.

Where it collapses is the **proactive/operational** axis. The three loops that define modern IT operations — **event correlation → incident**, **on-call escalation → paging**, and **deployment failure → incident** — are all **schema without runtime**. The tables and policies are modelled correctly (someone clearly knew the target shape), but the evaluators never execute. This is the ServiceNow-ITOM / PagerDuty-AIOps gap, and it's the difference between ~55 and ~75 for this cluster.

Fix the event-correlation and on-call-paging loops first: they're the highest-value, they connect to the SLA engine that already works, and they convert a good ticketing tool into an actual IT operations platform.

**Sources:**
- [ServiceNow vs Jira SM vs Freshservice (2026)](https://stackcoast.com/servicenow-vs-jira-vs-freshservice/)
- [ITSM Tools Comparison 2026](https://www.getint.io/blog/itsm-tools-comparison-2026)
- [PagerDuty Event Intelligence](https://www.pagerduty.com/platform/aiops/event-intelligence/)
- [PagerDuty Escalation Policy Basics](https://support.pagerduty.com/main/docs/escalation-policies)
