# Platform Gap Analysis — Cluster 7: Platform & Automation

**Date:** 2026-07-03
**Hat worn:** Platform Owner / Automation Architect / Head of RevOps-Tooling
**Benchmarks:** ServiceNow Flow Designer + IntegrationHub, Workato / Power Automate (iPaaS), Zapier/Make (triggers), Salesforce reports/dashboards, Jira/Asana (PMO)
**Modules covered:** Workflow engine, approvals, assignment/business rules, integrations/webhooks, custom fields, agent/AI copilot, reporting/command-center, projects/PMO, strategy/OKR
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**The automation *primitives* are real and unusually good — but nothing schedules them and nothing pushes out.** This cluster is the platform's connective tissue, and much of it is genuinely built: a working action-dispatch runtime that fires real side effects, a durable BullMQ-backed approval engine, a real load-based/round-robin assignment resolver, flexible JSONB custom fields, an RBAC-gated Claude copilot with a real tool-use loop, and SQL-backed dashboards. The two structural gaps are both about *closing the loop*: **workflow triggers are stored but never evaluated** (no scheduler polls `scheduled`, no event bus fans out to workflows beyond the ticket-only business-rules path), and **outbound webhooks are schema-only** (tables exist; no code ever creates a delivery or POSTs a subscriber). So automations run only when a ticket lifecycle rule or a human canary-click invokes them — the platform can *do* the actions but can't yet *trigger itself* or *notify the outside world*.

**One-line summary:** *Excellent automation building blocks with real side effects, but the trigger layer and the outbound-webhook layer are unwired — automations must be pushed by tickets or humans, never fired by a schedule or an event.*

**Cluster maturity ≈ 60/100** — strong primitives, held back by the missing trigger/dispatch loop and PMO/reporting depth.

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| Approvals | 74 | REAL — multi-level, BullMQ-durable, gates mutations |
| Assignment / business rules | 72 | REAL — load-based/round-robin, rule evaluator |
| Custom fields | 72 | REAL — per-entity JSONB, full CRUD |
| Agent / AI copilot | 70 | REAL — RBAC-gated tool-use loop, persistence |
| Integrations (inbound) | 62 | REAL inbound (HMAC, IP allowlist, encrypted) |
| Reporting / dashboards | 58 | REAL SQL aggregation, no saved/scheduled reports |
| Workflow engine | 52 | PARTIAL — actions fire, triggers never evaluated |
| Projects / PMO | 48 | PARTIAL — model+CRUD, no scheduling/resourcing |
| Strategy / OKR | 55 | REAL tracking, no cascade/alignment map |
| **Outbound webhooks** | **15** | **STUB — schema only, no dispatcher** |
| **Cluster weighted average** | **~60** | **Primitives real, loop unclosed** |

---

## 1. Workflow engine — PARTIAL: actions fire, triggers don't (52)

`schema/workflows.ts:44-127` + `routers/workflows.ts` + `workflows/actions/`:
- **Real:** a proper data model (`workflows`/`workflowVersions`/`workflowRuns`/`workflowStepRuns`) with visual-builder backing (`nodes`/`edges` JSONB). A real **action-dispatch runtime** (`workflows/actions/runtime.ts:26-52`) that validates required inputs, executes the handler, catches throws, and returns a structured result. A dozen registered actions (`send_email`, `http_request`, `escalate_on_sla_breach`, reminders, `notify_via_whatsapp`, `custom_js_script`, …) that **fire genuine side effects**.
- **The gap — nothing triggers workflows automatically:**
  - `triggerType` (incl. `scheduled`, `webhook`, `ticket_created`) is **stored but never evaluated** (`routers/workflows.ts:107-172`). No scheduler polls for `scheduled`; no generic event bus fans events out to matching workflows.
  - The **only** live invocation path is the ticket-scoped business-rules engine (`run_workflow_action`) plus the manual `runActionNow` canary in the designer. Everything else (assets, HR, finance events) can't start a workflow.
  - **Temporal is imported but not wired** (`lib/temporal.ts` exists; the runtime header at `runtime.ts:13-15` explicitly notes step-result persistence is "the caller's responsibility if invoked from a Temporal activity" — and no such activity exists). So multi-step runs aren't durably orchestrated.

*Benchmark: ServiceNow Flow Designer / Workato are fundamentally a trigger+condition+action loop with a scheduler and event triggers. Here the action half is real; the trigger half is a stored enum.* **This is the single highest-leverage build in the cluster** — the actions already exist and just need something to fire them.

---

## 2. Approvals — REAL (74)

`schema/approvals.ts` + `routers/approvals.ts` + `workflows/approvalWorkflow.ts`:
- **Multi-level sequential** approval steps (`sequence`, status pending/approved/rejected/skipped). Requester/approver/manager-subtree views (`approvals.ts:21-125`). Decisions enqueued to **BullMQ** (`services/workflow.ts:51-58`) and processed durably with retries + notifications + audit (`approvalWorkflow.ts:20-93`). Approvals actually **gate** downstream mutations (expenses, procurement).

**Gaps:**
- **No SLA/deadline on approval steps** — a pending approval can sit forever; no auto-escalation on approver unavailability (only SLA-breach escalation exists on tickets).
- **No delegation / out-of-office reassignment.**
- **No parallel/quorum approvals** (N-of-M) — sequential only.

---

## 3. Assignment / business rules — REAL (72)

`services/assignment.ts:138-230` + `services/business-rules-engine.ts:90-151`:
- **Assignment resolver** matches rules by entity+category specificity, loads team members, counts open items, and applies **load_based** (fewest-open, oldest-`lastAssignedAt` tiebreak) or **round_robin**, updating `userAssignmentStats` atomically and parking when all agents are at capacity. Wired into ticket/work-order/HR-case create.
- **Business-rules engine** evaluates a small condition DSL (`status_category_is`, `field_changed`) → actions (`notify_user`, `notify_assignee`, `run_workflow_action`), firing on ticket create/update.

**Gaps:**
- **Rules engine is ticket-only** — the same engine doesn't run on other entities (this is the same limitation as §1's trigger gap).
- **Condition DSL is thin** — two predicates; no AND/OR grouping, no numeric/date comparators, no cross-field logic.
- **No skills-based routing** (only team + load/RR).

---

## 4. Integrations / webhooks — REAL inbound, STUB outbound (62 / 15)

`schema/integrations.ts:31-152` + `http/webhooks.ts:105-200` + `services/integrations/`:
- **Real (inbound):** Fastify `/webhooks/*` receiver with **raw-body HMAC verification before parse** (`webhooks.ts:108-125`), **per-provider IP allowlist** (`webhooks.ts:56-103`), CORS/OPTIONS rejection, and handlers for eMudhra, AiSensy (WhatsApp), Razorpay. Integration configs stored **AES-256 encrypted**. A broad provider adapter registry (Slack/Teams/Jira/SAP/Google/M365/GST/MCA/SMS).
- **STUB (outbound):** the `webhooks` + `webhookDeliveries` tables model outbound perfectly (events array, HMAC secret, retry/`nextRetryAt`/`attempts` — `integrations.ts:96-116`), **but no code ever produces a delivery or POSTs a subscriber.** A grep for any delivery-insert / dispatch / `sendWebhook` returns **nothing**; the only reference to `webhookDeliveries` is a read-only list endpoint (`routers/integrations.ts:576-578`). So the platform can *receive* signed webhooks but cannot *emit* them.

**Gaps:**
- **Build the outbound dispatcher** — emit-on-event, sign, deliver, retry with backoff off `nextRetryAt`. The schema is ready; the worker is missing.
- **No OAuth2 authorization-code flow** for provider connections (configs are keys, not OAuth grants).

---

## 5. Custom fields — REAL (72)

`schema/custom-fields.ts:58-120` + `routers/custom-fields.ts:14-140`:
- **Per-entity user-defined fields** across ~11 entities (ticket/asset/employee/contract/vendor/project/change/lead/invoice/expense/okr), 15 field types incl. select/multi-select/user_reference/file/json. Values in **JSONB** with unique `(fieldId, entityId)`. Full CRUD with snake_case validation and soft-delete.

**Gaps:**
- **Validation is API-layer only** — no DB-level type/enforcement; a bad writer path could store an off-type value.
- **No conditional visibility / dependent fields, no required-on-form enforcement, no per-field RBAC.**

---

## 6. Agent / AI copilot — REAL (70)

`services/agent-copilot.ts` + `routers/agent.ts:19-107` + `schema/agent.ts:29-93` + `services/ai-tools/`:
- **Stateful multi-turn copilot** on Claude 3.5 Sonnet with a real **tool-use loop** (max 4 rounds), conversation persistence (`agentConversations`/`agentMessages`), history windowing/summarisation, and — importantly — **server-side RBAC enforcement inside tool-use** (`checkDbUserPermission`) so the agent can't exceed the caller's permissions. Real tools: search invoices/contracts/tickets/employees/KB, create/update tickets, fetch OKRs/payslip/compliance-calendar. System prompt requires confirmation before write actions.

**Gaps:**
- **No RAG / vector store** — KB retrieval is full-text, not embeddings (limits semantic recall).
- **A second stateless `ai-agent.ts` surface** exists but is thinner; two agent paths risk drift.
- **No eval/guardrail harness** on tool outputs.

---

## 7. Reporting / command-center — REAL aggregation, no builder (58)

`routers/reports.ts:84-162` + `routers/dashboard.ts:47-162`:
- **Real SQL aggregation** — `executiveOverview` computes open/resolved/SLA-breached tickets, pending changes, budget variance, avg resolution time, CSAT via genuine `count()/SUM/AVG(EXTRACT(EPOCH…))` with day/week/month bucketing, Redis-cached. Dashboard metrics run parallel org-scoped `Promise.all` counts.

**Gaps:**
- **No saved-report schema** — reports are a fixed set computed on demand; users can't define/save their own.
- **No scheduled report delivery** (no subscription job → email/Slack).
- **No widget builder** — dashboard tiles are hardcoded in the router.
- **No cross-module ad-hoc query builder** (contrast Salesforce report types).

---

## 8. Projects / PMO — PARTIAL (48)

`schema/projects.ts:49-202` + `routers/projects.ts:83-300`:
- **Real:** strategic-initiative → project → milestone → task hierarchy with status/health/budget/owner, **dependency graph with cycle detection** (`projects.ts:35-61`), CRUD, and a cached strategy-dashboard summary.
- **Stub:** **no Gantt/schedule computation** (dates stored, never sequenced), **no resource allocation / load-levelling**, **no time tracking** linked to tasks, **no burndown/velocity** analytics.

*Benchmark: Jira/Asana/MS-Project compute schedule from dependencies + effort and level resources; here it's a task tracker with a dependency DAG but no planning engine.*

---

## 9. Strategy / OKR — REAL tracking, no alignment (55)

`schema/hr.ts:512-564` + `routers/hr.ts:1313-1383`:
- **Real:** org/team/individual objectives by cycle (Q1–Q4/annual) + key results with decimal target/current and status, **auto-aggregating overall progress** on KR update (`hr.ts:1378-1381`). Custom-field taggable; surfaced in dashboard.

**Gaps:**
- **No OKR cascade / parent-child alignment** — objectives don't link up a tree (the `parentGoalId` in `projects.ts:100` is a *different* goals table).
- **No strategy/alignment map** (OKR → initiative → project linkage exists in data but isn't traversed/visualised).
- **No check-in / review cadence workflow.**

---

## 10. Prioritized fix list (Platform Owner ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **Workflow trigger layer** (scheduler for `scheduled` + generic event bus → workflows) | Workflow | High | Actions already exist; unlocks the entire automation product |
| 2 | **Outbound webhook dispatcher** (emit→sign→deliver→retry off `nextRetryAt`) | Integrations | Med | Schema is ready; makes the platform an event source |
| 3 | **Generalise business-rules engine beyond tickets** | Rules | Med | Same engine, more entities; compounds #1 |
| 4 | **Temporal-wire multi-step workflow runs** (durable orchestration) | Workflow | High | Turns single-action fires into reliable multi-step flows |
| 5 | **Approval SLAs + delegation + parallel/quorum** | Approvals | Med | Closes real approval-desk gaps |
| 6 | **Saved + scheduled reports** (subscription job) | Reporting | Med | The most-requested "email me this weekly" ask |
| 7 | **PMO scheduling + resource allocation + time tracking** | PMO | High | Turns the tracker into a planner |
| 8 | **OKR cascade + alignment map traversal** | Strategy | Low-Med | Data exists; expose the tree |
| 9 | **Condition DSL richness** (AND/OR, comparators, cross-field) | Rules | Low-Med | Makes rules/workflows expressive |
| 10 | **OAuth2 for integrations + RAG for copilot** | Integrations/AI | Med | Modernises connections + semantic recall |

Items **1, 2, 3** are the structural loop-closers; **8, 9** are cheap; **4, 7** are the deep durability/planning builds.

---

## 11. Bottom line for this cluster

This is the platform at its most capable *and* its most incomplete in the same breath. The **primitives are real and well-engineered** — an action runtime that fires side effects, durable approvals, a genuine assignment/rules resolver, flexible custom fields, an RBAC-safe AI copilot, and SQL-backed dashboards. What's missing is the **loop**: nothing evaluates a `scheduled` or event trigger (so workflows only run when a ticket rule or a human starts them), and nothing emits outbound webhooks (so the platform can't tell other systems what happened). Both gaps sit on top of schema that's already built for them.

Close those two — a **trigger scheduler/event-bus** and an **outbound webhook dispatcher** — and generalise the rules engine beyond tickets, and this cluster jumps from ~60 to a credible ~75, converting a strong toolbox into an actual automation platform. The PMO planning engine and saved/scheduled reports are the next tier of depth.

**Sources:**
- [ServiceNow — Flow Designer (No-Code Workflows)](https://www.servicenow.com/products/platform-flow-designer.html)
- [ServiceNow — Workflow Automation](https://www.servicenow.com/platform/workflow-automation.html)
- [Best No-Code Workflow Automation Platforms in 2026](https://launchpad.io/best-no-code-workflow-automation-platforms)
- [Workflow Automation Technology — 2026 Guide (Activepieces)](https://www.activepieces.com/blog/workflow-automation-technology)
- [14 Best Workflow Automation Software Platforms for 2026](https://www.invensislearning.com/blog/best-workflow-automation-software/)
