# SMB "Needed-Now" Backlog — Scoped Stories

**Date:** 2026-06-27
**Source:** `docs/SMB_MARKET_POSITION_2026.md` §4 (🔴 Needed right away)
**Purpose:** Convert the four SMB deal-blocker gaps into ready-to-build stories. Prototype on a feature branch (see `docs/FEATURE_BRANCH_PLAYBOOK.md`); subsystem owners review/own anything touching auth, RBAC, or tenant isolation.

> **Build-process note:** These touch shared, security-sensitive subsystems (auth/RBAC, integrations, mobile API contract). Do **not** build them on an offline fork. Branch from `main`, rebase often, ship via PR with CI + tRPC parity checks. See the playbook.

---

## Verification notes (from a 2026-06-27 codebase pass)

Two of the four items are **partially started** in the repo — confirm current state before estimating:

- **SSO:** An OIDC service already exists at `apps/api/src/services/oidc.ts`. SAML is the missing leg. Scope may be smaller than the gap docs (P2-11) assumed.
- **Mobile:** More built than the gap docs (P1-12) implied. `apps/mobile/` already has `expenses/new.tsx`, `leave/new.tsx`, `tickets/new.tsx`, `changes/new.tsx`, an `approvals` tab, and `push-notifications.ts`. The remaining work is **approve actions + manager views**, not net-new screens.

This means the real "needed-now" effort is smaller than the report's headline. Re-baseline with the subsystem owners.

---

## Priority order

| # | Story | Rationale | Risk surface |
|---|---|---|---|
| 1 | **SAML SSO** | Hardest deal-blocker; touches auth/RBAC; needs owner | Security-critical |
| 2 | **Core connectors** (Gmail/Outlook/Slack/Calendar) | Most-asked integrations; adapter pattern already exists | Medium |
| 3 | **Mobile approve + manager views** | Mostly wiring existing screens to approve mutations | Low–medium |
| 4 | **CSAT loop on ticket close** | Cheapest; `surveys` router already exists | Low |

---

## Story 1 — SAML SSO (in addition to existing OIDC)

**As an** IT admin at an SMB that standardizes on Okta / Azure AD / Google Workspace
**I want** to log my users into CoheronConnect via SAML 2.0
**So that** I don't have to manage a separate set of credentials (a hard procurement blocker).

**Context / current state**
- OIDC service exists: `apps/api/src/services/oidc.ts`. Reuse its session-issuance and org-binding patterns.
- Auth + session model: `packages/db/src/schema/auth.ts`, `apps/api/src/index.ts` (auth wiring).

**Acceptance criteria**
- [ ] Org admin can configure a SAML IdP (entity ID, SSO URL, x509 cert) per org via admin/settings UI.
- [ ] SP-initiated SAML login flow issues the same session token as password/OIDC login (no second auth path to maintain).
- [ ] SAML assertions are validated: signature, audience/entityID, NotBefore/NotOnOrAfter, replay protection.
- [ ] User is matched to an existing `employees`/`users` row by email; unmatched users are rejected (no auto-provision in v1 — that's SCIM, explicitly out of scope).
- [ ] Config secrets (cert/keys) encrypted at rest using the existing per-tenant DEK pattern (as integrations do).
- [ ] RBAC unchanged: SAML only authenticates; authorization still flows through the existing module-permission matrix.
- [ ] Tests: Vitest for assertion validation (valid, expired, bad-signature, wrong-audience, replay); e2e for SP-initiated happy path + one negative.

**Explicitly out of scope (do not build):** SCIM provisioning (P2-12), IdP-initiated flow, auto-provisioning, JIT role mapping.

**Owner:** Auth/platform subsystem owner must review. **Risk:** security-critical — assertion validation is the place subtle bugs become auth bypasses.

---

## Story 2 — Core connectors (Gmail/Outlook, Slack, Calendar)

**As an** SMB operator
**I want** CoheronConnect to connect to the 4–5 tools I already use daily
**So that** notifications, calendar events, and email land where my team works.

**Context / current state**
- Adapter pattern is established: `apps/api/src/services/integrations/registry.ts` + per-provider files (`google-workspace.ts`, `microsoft-365.ts`, `whatsapp-aisensy.ts`, etc.).
- `google-workspace.ts` and `microsoft-365.ts` already exist — extend rather than rebuild.
- Encrypted config + test-connection + webhook hardening posture already in place (`integrations.ts` router).

**Acceptance criteria**
- [ ] Slack: post notifications to a channel (outbound) — wire into the existing notification/workflow action path (`apps/api/src/workflows/actions/notify-via-slack.ts` exists; confirm it's reachable per MARKET_ASSESSMENT C2 fix).
- [ ] Gmail/Outlook: send notification emails via the connected account (reuse `google-workspace.ts` / `microsoft-365.ts` auth).
- [ ] Calendar: create a calendar event from a change-window or meeting (one direction in v1).
- [ ] Each connector exposes a working **Test Connection** (per the eMudhra C1 lesson — verify the test path actually dispatches to the adapter).
- [ ] All credentials encrypted at rest (existing DEK pattern); no secrets in logs.
- [ ] e2e tests for each connector's happy path + bad-credential negative path.

**Explicitly out of scope:** Bi-directional email/calendar sync, Salesforce, GitHub, Zoom, Box (these are the wider P2-13 roadmap — pull only on deal demand).

**Owner:** Integrations subsystem owner. **Risk:** medium — OAuth token handling and webhook security.

---

## Story 3 — Mobile: approve actions + manager views

**As a** people/finance manager at an SMB
**I want** to approve expenses and leave, and see my team, from my phone
**So that** approvals don't bottleneck on me being at a desk.

**Context / current state (smaller than gap docs implied)**
- `apps/mobile/` already has: `(tabs)/approvals.tsx`, `expenses/new.tsx`, `leave/new.tsx`, `tickets/new.tsx`, `changes/new.tsx`, `(tabs)/notifications.tsx`, `src/lib/push-notifications.ts`, `src/lib/trpc.ts`.
- Remaining work is **approve/reject actions + manager-scoped lists**, not new capture screens.

**Acceptance criteria**
- [ ] Approvals tab supports **approve/reject with reason** for expense claims and leave requests (reuse existing tRPC mutations; reason capture must match web's ≥4-char rule).
- [ ] Manager can view their team's pending items (manager-scoped query — reuse the same RBAC scoping as web).
- [ ] Push notification on a new approval assigned to the manager (push infra already exists).
- [ ] Org-chart / team view (read-only) listing direct reports.
- [ ] RBAC parity: mobile uses the identical permission checks as web — no mobile-only bypass.
- [ ] tRPC parity check passes (mobile consumes existing procedures; no new shadow API).

**Explicitly out of scope:** Net-new modules on mobile (CRM, procurement). Keep mobile to the manager loop.

**Owner:** Mobile + the HR/finance router owners (for any new manager-scoped queries). **Risk:** low–medium — main risk is RBAC drift between mobile and web.

---

## Story 4 — CSAT loop on ticket close

**As a** service-desk manager
**I want** an automatic satisfaction survey when a ticket is resolved
**So that** I can report CSAT — a basic expectation of any service desk.

**Context / current state**
- `surveys` router already exists (`apps/api/src/routers/surveys.ts`); schema in `packages/db/src/schema/surveys.ts`.
- Ticket lifecycle + business-rules engine exists (`apps/api/src/services/business-rules-engine.ts`) — the C2 fix wired the workflow action library into it; CSAT can be a rule consumer.
- Maps to existing backlog item **P1-10**.

**Acceptance criteria**
- [ ] On `ticket.resolved` for a `requester`, a CSAT survey is auto-triggered (via the business-rules engine / workflow action, not a bespoke call).
- [ ] Survey is delivered as a 1-click deeplink (email and/or in-app; SMS optional if the org has an SMS connector).
- [ ] Response is captured against the ticket and the requester (one response per resolution; re-open → re-survey on next resolve).
- [ ] CSAT score surfaces on the existing dashboard/reports (`dashboard.ts` / `reports.ts`) — no placeholder tile.
- [ ] Configurable per org: on/off, channel, and a suppression window (don't survey the same requester more than once per N hours).
- [ ] Tests: rule fires on resolve, doesn't fire on other transitions, one-response constraint, score aggregation.

**Explicitly out of scope:** eNPS program, multi-question survey designer (the `surveys` router may already cover templates — confirm and reuse).

**Owner:** ITSM router owner. **Risk:** low.

---

## Suggested sequencing

1. **Branch each story separately** off `main` (`feat/saml-sso`, `feat/core-connectors`, `feat/mobile-approvals`, `feat/csat-loop`). Independent branches = independent review = small merges.
2. Land **CSAT (4)** and **mobile (3)** first — lowest risk, fastest reviewer sign-off, builds momentum.
3. Land **connectors (2)** next — extends an existing pattern.
4. Land **SAML (1)** last and with the most review — it's the security-critical one and benefits from the team being warmed up on the branch workflow.

Re-baseline all four estimates with subsystem owners given the "partially started" findings above.
