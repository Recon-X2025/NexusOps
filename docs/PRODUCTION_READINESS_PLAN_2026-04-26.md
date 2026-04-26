# NexusOps — Production Readiness Plan (locked)

**Date:** 2026-04-26
**Owner:** Product
**Audience:** Engineering, QA, GTM, Founders
**Status:** LOCKED — decisions taken; this is the GA plan we ship against.

---

## 0. Positioning (locked)

**NexusOps is the India-first all-in-one operations platform for mid-market (0–500 employees).** ITSM + HR + Payroll + Finance + Statutory Compliance in a single system, replacing 6–8 SaaS tools.

We do **not** market against ServiceNow / Workday / Salesforce as a global ITSM/HCM/CRM. We market against the *combination* of: ClearTax + RazorpayX Payroll + Keka + Freshservice + Zoho Books + DocuSign — bundled, India-tax-aware, and on a single data spine.

---

## 1. Decisions (locked)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | GA target | **Day 90**, soft launch at Day 60 with 3 design-partner tenants | Preserves runway, gives QA buffer |
| 2 | Capacity | 2 senior engineers + 1 QA full-time | What we have today |
| 3 | e-Sign ASP | **eMudhra** primary, DocuSign secondary | Cleanest sandbox, best Indian SMB pricing, IT Act §3A compliance |
| 4 | GST integration | **ClearTax wrapper** (paid SaaS API), direct GSP post-GA | Avoids 3-6 month GSP onboarding lead time |
| 5 | WhatsApp Business | **AiSensy** (BSP) — Indian, faster Meta template approval | Same tech as direct, faster approval cycle |
| 6 | AI Copilot | **IN scope** — read-only tools first, write tools v1.1 | Schema breadth across modules makes this our actual wedge |

---

## 2. Workstreams

| WS | Workstream | Eng-days | Owner |
|----|---|----|----|
| WS-1 | Integration foundation + 7 segment-correct connectors | 24 | Eng-A |
| WS-2 | E-sign (eMudhra) + universal SignButton | 12 | Eng-A |
| WS-3 | DMS (documents schema + storage extension + FilePicker) | 9 | Eng-B |
| WS-4 | AI Copilot (tool-calling, read-only first) | 18 | Eng-B |
| WS-5 | Workflow action library (7 actions + 5 templates) | 12 | Eng-A |
| WS-6 | QA, Playwright, observability, GA polish | 15 | QA |
| **Total** | | **~90 eng-days** | |

---

## 3. WS-1 — Integration foundation

### 3.1 Adapter interface (locked)

All connectors implement a single interface (`apps/api/src/services/integrations/types.ts`):

```ts
interface IntegrationAdapter<C, M = unknown> {
  provider: string;
  displayName: string;
  test(config: C): Promise<{ ok: boolean; details?: string }>;
  send?(config: C, message: M): Promise<{ providerRef: string }>;
  receiveWebhook?(config: C, body: unknown, headers: Record<string,string>):
    Promise<{ kind: string; payload: unknown }>;
  capabilities: { send: boolean; receive: boolean; oauth: boolean };
}
```

Connectors register themselves in `services/integrations/registry.ts`. The `integrations` tRPC router resolves the adapter by `provider` and dispatches.

### 3.2 Connector matrix (locked priority order)

| # | Provider | First-release scope | Eng-days | Status |
|---|---|---|---|---|
| 1 | **WhatsApp (AiSensy)** | Send templated message; webhook-in for inbound | 4 | Phase 1 |
| 2 | **SMS (MSG91)** | DLT-compliant send; OTP, payslip dispatch | 1 | Phase 1 |
| 3 | **Google Workspace** | OAuth2, Gmail watch (email→ticket), Calendar event create | 4 | Phase 1 |
| 4 | **Microsoft 365** | OIDC via Entra, Outlook→ticket, Teams notify | 5 | Phase 1 |
| 5 | **Razorpay** | Payment-link create on AR invoice; webhook→reconcile | 3 | Phase 1 |
| 6 | **ClearTax GST** | IRN generation on invoice; GSTR-1 push | 5 | Phase 1 |
| 7 | **eMudhra (e-sign)** | Lives under WS-2 — uses same adapter pattern | — | Phase 2 |

Slack / Salesforce / GitHub deliberately deferred — wrong segment fit (see §6).

### 3.3 Acceptance

- Demo: a tenant signs in via Google SSO, gets an email and it lands as a ticket, gets a WA status update, sends an AR invoice with a Razorpay payment link, and an outbound invoice picks up an IRN automatically.
- Each connector has a Playwright smoke test against its sandbox.

---

## 4. WS-2 — E-Sign

### 4.1 Provider stack

- **Primary:** eMudhra (Aadhaar e-Sign / DSC). Provider integration as ASP.
- **Secondary:** DocuSign (for non-Indian counterparties).
- Both expose the same `EsignProvider` interface so call-sites are provider-agnostic.

### 4.2 Wire-up points

| Module | Document type | Trigger |
|---|---|---|
| Recruitment | Offer letters | "Send for e-sign" on offer creation |
| Contracts | MSAs, NDAs, vendor agreements | "Send for e-sign" from contract page |
| Secretarial | Board resolutions, ESOP grants | Required for resolution finalize |
| HR | Policy acknowledgments | Bulk send on policy publish |
| Procurement | Vendor onboarding (MSME declaration, GST cert) | On vendor create |
| Payroll | Annual Form 16 | On generate |

### 4.3 Audit + retention

Every e-sign event writes to `signature_audit` with: timestamp, IP, geoloc, OTP ref hash, signer Aadhaar masked, certificate hash. Audit retained 8 years (per IT Act + Companies Act 2013 retention).

### 4.4 ASP onboarding (commercial path)

Start week 1 in parallel — eMudhra ASP onboarding takes ~2-3 weeks legal + ~2 days technical. **This is the longest critical-path item; do not let it slip.**

---

## 5. WS-3 — DMS

### 5.1 Schema (`packages/db/src/schema/documents.ts`)

- `documents` — id, orgId, name, mimeType, sizeBytes, storageKey, sha256, version, parentId, scanStatus, retentionPolicyId, classifiedAs, ownerId, createdAt
- `document_versions` — auto-written on every put
- `document_acls` — principalType (user/role/team), principalId, perms (read/write/delete/share)
- `document_retention_policies` — orgId, name, durationDays, legalHoldFlag

### 5.2 Storage layer

Extend `apps/api/src/services/storage.ts`:

- `putWithVersioning(orgId, name, bytes) → { docId, version }`
- `signedDownloadUrl(docId, ttlSeconds)`
- `virusScan(docId)` — async; ClamAV worker job (BullMQ)
- `enforceRetention()` — daily worker; deletes expired non-legal-hold docs

### 5.3 FilePicker component

Universal `<FilePicker mode="dms|drive|onedrive|upload">` drops into ticket attachments, HR cases, contracts, ESOP grants, board resolutions, payslip archive, GRN photos, expense receipts.

---

## 6. WS-4 — AI Copilot v1

### 6.1 Architecture

- One agent loop in `apps/api/src/services/ai-agent.ts`, runs Anthropic tool-use against Claude.
- **Every tool call goes through `permissionProcedure`** — agent inherits caller's RBAC. If the user can't read the module, neither can the agent acting for them.
- Long-running agent runs execute in a Temporal child workflow (durable across restarts).

### 6.2 Tool registry — read-only first release

| Tool | RBAC module / action | Use case |
|---|---|---|
| `search_tickets(query, filters)` | tickets.read | "Show me my open P1s" |
| `get_ticket(id)` | tickets.read | "Pull up TKT-1234" |
| `search_kb(query)` | knowledge.read | "How do we onboard a new hire?" |
| `search_employees(query)` | hr.read | "Who's the HR partner for engineering?" |
| `get_payslip(employeeId, period)` | payroll.read OR self | "My March payslip" |
| `search_invoices(query, status)` | financial.read | "Unpaid invoices over 30 days" |
| `search_contracts(query, state)` | contracts.read | "Contracts expiring this quarter" |
| `get_compliance_calendar(monthOffset)` | secretarial.read | "What's due this month?" |
| `get_okrs(cycle)` | hr.read | "Q3 OKR progress" |
| `search_changes(query, status)` | changes.read | "Changes scheduled this weekend" |

### 6.3 Write tools (v1.1, post-GA)

Follow plan→preview→confirm→execute. Examples: `create_ticket`, `add_comment`, `assign_ticket`, `approve_request`. Every write requires a confirmation step where the user sees a structured diff before commit.

---

## 7. WS-5 — Workflow action library

### 7.1 Starter actions (7 ship at GA)

| Category | Action | Indian-SMB use |
|---|---|---|
| Comms | `notify_via_whatsapp(template, vars, recipient)` | Approval, OTP, status update |
| Comms | `notify_via_email(template, vars, recipient)` | Standard fallback |
| ITSM | `escalate_on_sla_breach(ticketId)` | Auto-escalate after SLA pause |
| Statutory | `gst_filing_reminder(month)` | 11th and 20th of every month |
| Statutory | `dir3_kyc_reminder(directorId)` | Annual MCA filing |
| Legal | `contract_renewal_reminder(contractId, days)` | 90/60/30 day cadence |
| CRM | `stale_lead_nudge(leadId, sinceDays)` | >7-day inactive leads |

### 7.2 Five workflow templates shipped on first install

1. **Inbound email → ticket → AI classify → assign → SLA timer**
2. **PO approval chain → WA approval button → 3-way match → invoice scheduled**
3. **New hire onboarding** (HR case + asset request + payroll line + offer e-sign + GW account)
4. **Monthly GST + TDS filing cadence** (calendar + reminder + checklist)
5. **Contract renewal 90/60/30-day reminders + e-sign re-up**

---

## 8. Out of scope for GA (locked deferral)

| Deferred | Reason for 0–500 India |
|---|---|
| Salesforce / HubSpot connector | We replace them, not integrate |
| Slack | Teams is dominant in our segment |
| Okta SCIM | Buyers use Workspace / Entra, not Okta |
| GitHub / Backstage / OpsLevel | Wrong category for the segment |
| Gainsight-grade CSM | Use CRM account health instead |
| Jira-style agile board | Already flag-gated off |
| LMS | Buy/integrate post-GA |
| Visual Gantt | v2 inside Strategy Center |
| Multi-language KB beyond Hindi/English | Post-GA |
| Standalone APM module | OTel layer is the answer; module gated off |

---

## 9. KPIs at GA

| KPI | Target |
|---|---|
| Default-build Playwright pass rate | 100% green |
| Tenant install → first useful workflow run | < 30 minutes |
| GSTR-1 push success rate (sandbox) | > 99% |
| Aadhaar e-sign completion rate | > 95% |
| AI Copilot grounded-answer rate | > 90% (no hallucinated entity refs) |
| p95 tRPC latency | < 250ms |

---

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| eMudhra ASP onboarding slips | High | Started week 1; DocuSign fallback for non-Indian counterparties |
| WhatsApp template approval slips | Med | AiSensy BSP route is faster than direct; submit templates week 1 |
| Copilot hallucinates entity refs | High | Read-only tools only; require structured tool calls; UI shows tool-call trace |
| GSTN sandbox flakiness | High | Wrap ClearTax with retry + circuit-breaker; manual JSON export remains as fallback |
| Drizzle migrations conflict with prod data | Med | All new tables only; no destructive changes in 90-day plan |

---

## 11. Sequencing — 90-day calendar

```
W1   ┃ ASP onboarding kickoff  ┃ Adapter interface  ┃ WA + SMS adapters
W2   ┃ Razorpay + ClearTax GST ┃ DMS schema         ┃ E-sign schema
W3   ┃ Google Workspace OAuth  ┃ Storage extension  ┃ eMudhra integration
W4   ┃ Microsoft 365 OAuth     ┃ FilePicker         ┃ SignButton
W5   ┃ AI tool registry        ┃ Tool: search_tix   ┃ Tool: search_kb
W6   ┃ Tool: get_payslip       ┃ Tool: gst_calendar ┃ CopilotPanel
W7   ┃ Workflow actions x 4    ┃ Workflow template 1┃ Soft-launch (3 design partners)
W8   ┃ Workflow actions x 3    ┃ Workflow template 2-5
W9   ┃ Playwright e2e on integrations / e-sign / DMS / copilot
W10  ┃ Hardening, observability, runbooks, security review
W11  ┃ GA freeze, smoke, design-partner sign-off
W12  ┃ GA launch
W13  ┃ Post-GA fast-follow: Copilot write tools (v1.1)
```

---

## 12. How this document stays current

This plan is **owned by Product** and updated weekly. When a workstream slips or a decision changes, edit this file and tag in the commit. The market assessment (`docs/MARKET_ASSESSMENT_2026-04-26.md`) is the *why*; this file is the *what + when*.
