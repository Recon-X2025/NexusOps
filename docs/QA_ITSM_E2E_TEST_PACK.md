# ITSM module — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | NexusOps — Tickets + related ITSM surfaces |
| **Version** | Align to release under test (record in execution log) |
| **Primary references** | `apps/api/src/routers/tickets.ts`, `apps/web/src/app/app/tickets/`, `e2e/tickets.spec.ts`, `packages/db/src/seed.ts` |

This pack gives **test IDs**, **roles**, **expected results**, and **ITIL 4 practice** traceability. Replace `{BASE_URL}` with your staging URL (e.g. `https://staging.example.com` or `http://localhost:3000`).

---

## 1. Environment and data prerequisites

| ID | Requirement |
|----|-------------|
| ENV-01 | Application reachable at `{BASE_URL}`; API/session cookie domain matches. |
| ENV-02 | Database migrated; **Coheron Demo** org seeded (`pnpm --filter @nexusops/db exec tsx src/seed.ts` or project CLI — follow repo README). |
| ENV-03 | Default demo password for seeded users: **`demo1234!`** (see `e2e/tickets.spec.ts`, `packages/db/src/seed.ts`). |
| ENV-04 | Optional for SLA job tests: **Redis** + worker process running so BullMQ SLA jobs in `apps/api/src/workflows/ticketLifecycleWorkflow.ts` can fire; otherwise mark SLA breach cases **N/A (infra)** and test UI/API fields only. |
| ENV-05 | Optional for AI tests: `ANTHROPIC_API_KEY` set — otherwise mark AI cases **skipped (no key)**. |

**Fresh org note:** If the org already existed, seed may **skip module data**; use a **fresh DB** or follow repo guidance to load ticket statuses, priorities, and sample tickets.

---

## 2. Personas (seeded users)

Use these accounts after a **full** seed of `coheron-demo` (`packages/db/src/seed.ts`).

| Persona | Email | `users.role` (API RBAC) | Matrix role (UX / client RBAC) | Use for |
|---------|-------|-------------------------|----------------------------------|---------|
| **P1 Owner** | `admin@coheron.com` | `owner` | — | Full ITSM + admin paths; delete-level checks if exposed. |
| **P2 Agent** | `agent1@coheron.com` | `member` | `itil` | Standard fulfiller: list, edit, assign, comment. |
| **P3 Field tech** | `agent2@coheron.com` | `member` | `operator_field` | Second assignee; reassignment scenarios. |
| **P4 Employee** | `employee@coheron.com` | `member` | (none) | Self-service / requester-style usage. |
| **P5 Viewer** | `viewer@coheron.com` | `viewer` | — | Read-only regression. |

---

## 3. Server RBAC matrix (tickets module = `incidents`)

Source: `apps/api/src/server/rbac.ts` — enforced by `permissionProcedure("incidents", ...)`.

| Action | `owner` | `admin` | `member` | `viewer` |
|--------|:-------:|:-------:|:--------:|:--------:|
| `read` | ✓ | ✓ | ✓ | ✓ |
| `write` | ✓ | ✓ | ✓ | — |
| `assign` | ✓ | ✓ | ✓ | — |
| `delete` | ✓ | ✓ | — | — |
| `admin` | ✓ | ✓ | — | — |
| `approve` | ✓ | ✓ | — | — |
| `close` | ✓ | ✓ | ✓ | — |

**QA note:** `knowledge` and `catalog` are listed in `apps/api/src/server/rbac.ts` `PERMISSION_MATRIX` (mirror with `@nexusops/types` for UI matrix roles). Server `users.role` is still `owner` | `admin` | `member` | `viewer` for `permissionProcedure` checks.

---

## 4. ITIL 4 practice traceability (columns in test tables)

| Tag | ITIL 4 practice (summary) |
|-----|---------------------------|
| **IM** | Incident management |
| **SRM** | Service request management |
| **PM** | Problem management |
| **CE** | Change enablement |
| **KM** | Knowledge management |
| **SCM** | Service catalogue management |
| **SLM** | Service level management |
| **SIM** | Service configuration management (CMDB) |
| **BRM** | Business analysis / reporting (lightweight) |

---

## 5. Test cases — core tickets (web E2E)

Execute each row in **staging**; record **Pass / Fail / Blocked / N/A** and attach **screenshot or HAR** as evidence.

| ID | ITIL | Persona | Preconditions | Steps (summary) | Expected result |
|----|------|-----------|---------------|-----------------|-----------------|
| **ITSM-E2E-001** | IM, SRM | P1 | Seed OK | Open `{BASE_URL}/login`; sign in as P1; open `/app/tickets`. | Page loads; no unhandled runtime error; list or empty state visible. |
| **ITSM-E2E-002** | IM | P5 | Seed OK | Sign in as P5; open `/app/tickets`. | List readable; no 500. |
| **ITSM-E2E-003** | IM | P5 | On ticket detail URL as P5 | Open an existing ticket (e.g. from list); attempt edit/assign if UI offers it. | **If** viewer can mutate: **Fail** (security); **Else** controls disabled or API FORBIDDEN — **Pass**. |
| **ITSM-E2E-004** | IM, SRM | P2 | — | `/app/tickets/new`; fill title + description; choose type **incident**; submit. | Redirect to `/app/tickets/{uuid}`; ticket shows correct type and title. |
| **ITSM-E2E-005** | SRM | P2 | — | Create type **request**; submit. | Record created; type request visible on detail. |
| **ITSM-E2E-006** | PM | P2 | — | Create type **problem**; submit. | Record created; appears in list filters for problem. |
| **ITSM-E2E-007** | CE | P2 | — | Create type **change** (ticket-level); submit. | Record created; distinguish from `/app/changes` **change requests** in tester notes. |
| **ITSM-E2E-008** | IM | P2 | Ticket in Open | Move status toward **In Progress** (per org statuses); add **public** comment. | Comment visible; activity log shows `comment_added` or equivalent. |
| **ITSM-E2E-009** | IM | P2 | Same ticket | Add **internal** comment; open same ticket as **P4** (requester) in another session/incognito. | Internal note **not** visible to requester; public visible. |
| **ITSM-E2E-010** | IM | P2 | Ticket open | Assign from UI to P3. | Assignee updates; notification optional (ENV). |
| **ITSM-E2E-011** | IM | P1 | Two tickets selected | Use bulk assign from list (if enabled). | Both tickets show new assignee. |
| **ITSM-E2E-012** | IM | P2 | Ticket in progress | Resolve with resolution notes; then close. | Status categories follow allowed transitions; no server error. |
| **ITSM-E2E-013** | IM | P2 | Resolved/closed | Reopen to **Open** or **In Progress** (per UI). | Allowed transition succeeds; reopen count increments if exposed. |
| **ITSM-E2E-014** | IM | P2 | Ticket | Toggle **watch**; confirm toast/state. | Watch state toggles; refetch consistent. |
| **ITSM-E2E-015** | SLM | P2 | Priority with short SLA | Create **Critical** ticket; capture `slaResponseDueAt` / `slaResolveDueAt` via API or DB if permitted. | Deadlines set per priority SLA minutes from seed (e.g. Critical 30m / 240m response/resolve — verify against `seed.ts`). |
| **ITSM-E2E-016** | SLM | P2 | ENV-04 satisfied | Wait or trigger SLA breach job; observe ticket **slaBreached** and UI. | Breach reflected when worker ran; else **N/A (infra)** documented. |
| **ITSM-E2E-017** | BRM | P1 | Tickets exist | Export CSV from list if available; open file. | CSV contains expected columns/rows. |
| **ITSM-E2E-018** | IM | P2 | — | Search/filter by type, SLA breached, status. | Results match filters; no crash. |
| **ITSM-E2E-019** | KM | P1 | KB articles seeded | Open KB module; open article; link from ticket context if present. | Article loads; view count increments on get (API behaviour). |
| **ITSM-E2E-020** | SCM | P2 | Catalog items seeded | Submit catalog request (`catalog.submitRequest` via UI path). | Request row created; status `pending_approval` or `submitted` per item. |

---

## 6. Test cases — change enablement (separate module)

| ID | ITIL | Persona | Steps | Expected result |
|----|------|---------|-------|-----------------|
| **ITSM-E2E-101** | CE | P1 | `/app/changes`; open **CHG-0001** (or first change). | Detail loads; status matches seed (`cab_review` etc.). |
| **ITSM-E2E-102** | CE | P2 | Valid transition per UI (e.g. toward **approved** if allowed). | Server accepts only transitions allowed by `CHANGE_LIFECYCLE` in `changes` router; invalid → error message. |
| **ITSM-E2E-103** | CE | P5 | Open changes list read-only. | List visible; mutations blocked. |

---

## 7. Test cases — API / tRPC (optional but recommended)

Use session cookie or auth method your environment supports.

| ID | ITIL | Procedure | Persona | Expected |
|----|------|-----------|---------|----------|
| **ITSM-API-001** | IM | `tickets.list` | P5 | 200; array (max limit per router guard). |
| **ITSM-API-002** | IM | `tickets.create` | P5 | **403** FORBIDDEN (`incidents:write`). |
| **ITSM-API-003** | IM | `tickets.create` (idempotent key duplicate) | P2 | Same ticket id / snapshot behaviour per idempotency design. |
| **ITSM-API-004** | IM | `tickets.update` (invalid status category jump) | P2 | **400** BAD_REQUEST if transition violates `assertTicketTransition`. |

---

## 8. Negative and edge cases

| ID | Scenario | Expected |
|----|----------|----------|
| **ITSM-NEG-001** | Submit new ticket with empty title | Validation error; remain on form. |
| **ITSM-NEG-002** | XSS string in title/description | Stored value escaped in UI; no script execution. |
| **ITSM-NEG-003** | Concurrent update (two agents) | Last-write-wins or version error — document observed behaviour. |

---

## 9. Automated regression (CI / local)

| ID | Command / artefact | Owner |
|----|--------------------|-------|
| **ITSM-AUTO-001** | `pnpm exec playwright test e2e/tickets.spec.ts` (dev server + DB per `e2e/tickets.spec.ts` header) — includes **Related tab** link / remove flow | QA automation |
| **ITSM-AUTO-002** | `pnpm --filter @nexusops/api test -- ticket-lifecycle` (or full api test suite) | Dev |

---

## 10. Execution log (template)

Copy per run:

```
Run ID: ___________
Date: ___________
Build / commit: ___________
Tester: ___________
BASE_URL: ___________

| Test ID        | Result | Evidence link / notes |
|----------------|--------|-------------------------|
| ITSM-E2E-001   |        |                         |
| ...            |        |                         |
```

---

## 11. Known gaps (do not fail silently)

**Status (v1.2):** All items below are **Addressed** — treat regressions as defects, not silent limitations.

Document outcome as **Expected limitation** only when product owner explicitly waives an item.

1. **`ticket_relations`**: **Addressed** — `tickets.addRelation`, `tickets.removeRelation`, and `relations` on `tickets.get` (+ UI on ticket detail Related tab).
2. **`sla_policies`**: **Addressed (v1)** — active policies with `conditions.ticketTypes` / `conditions.categoryIds` (and `{}` match-all) override SLA minutes on create; fallback remains priority tier.
3. **`pending` status + SLA pause**: **Addressed** — Postgres enum includes `pending`, per-org `ticket_statuses` row (migration **`0013_ticket_status_pending_enum_and_rows`** rebuilds enum in one txn-safe path), seed + `ensureDefaultTicketStatusesForOrg` include Pending. `syncTicketSlaJobs` skips breach scheduling while category is `pending`; `tickets.update` sets **`sla_paused_at`** and accumulates **`sla_pause_duration_mins`** when leaving pending. Runbook §7 documents recovery for unusual DB states.
4. **RBAC**: **Addressed** — `knowledge` and `catalog` are in server `PERMISSION_MATRIX`; `catalog.submitRequest` requires `catalog:write` so **viewer** cannot submit catalog orders.

---

## 12. Sign-off criteria (suggested)

| Gate | Criterion |
|------|-----------|
| **G1** | All **ITSM-E2E-001**–**020** executed; **0** undocumented critical failures. |
| **G2** | **ITSM-E2E-003** (viewer write) and **ITSM-API-002** pass security expectation. |
| **G3** | **ITSM-E2E-101**–**103** pass for change module. |
| **G4** | **ITSM-AUTO-001** green on release branch. |

**Product owner sign-off:** ________________________ **Date:** __________  

**QA lead sign-off:** ________________________ **Date:** __________  

---

## 13. Document history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-07 | NexusOps QA pack | Initial formal pack from codebase review. |
| 1.1 | 2026-04-07 | NexusOps QA pack | §9: Playwright covers ticket relation UI; §11 gap list refresh. |
| 1.2 | 2026-04-07 | NexusOps QA pack | §11 item 3: `pending` + SLA pause marked **Addressed** (migration 0013 + API pause fields). |
