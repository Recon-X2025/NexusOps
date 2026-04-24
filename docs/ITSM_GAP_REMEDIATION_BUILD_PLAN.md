# ITSM gap remediation — build plan (DevOps + Scrum)

**Inputs:** `docs/QA_ITSM_E2E_TEST_PACK.md` (known gaps §11, ENV prerequisites, RBAC note §3).  
**Roles:** Product Owner (priorities), Tech Lead (architecture), DevOps (platform + CI), QA (pack execution + automation), Scrum Master (cadence + dependencies).

---

## 1. Objectives (measurable)

| # | Objective | Success signal |
|---|-----------|----------------|
| O1 | **Ticket relations** usable E2E | ITSM pack extended with pass/fail for link/unlink; API + UI covered |
| O2 | **SLA** matches product intent | Either conditional `sla_policies` drive deadlines **or** docs + code aligned on priority-only; **pending** status + pause/resume documented and tested |
| O3 | **RBAC parity** on ITSM-adjacent modules | `knowledge` + `catalog` entries in `PERMISSION_MATRIX`; QA §3 note retired |
| O4 | **Reproducible QA** | Staging profile: DB seed + Redis worker + env template; G4 (Playwright) green on main |
| O5 | **Concurrency** explicit | ITSM-NEG-003 behaviour documented + optional optimistic locking story |

---

## 2. Gap → epic mapping

| Gap (from QA pack) | Epic ID | Epic title | Priority |
|--------------------|---------|------------|----------|
| `ticket_relations` no API | **E-REL** | Ticket relationships (blocks / related / duplicate) | P0 — data model exists; finish vertical slice |
| `sla_policies` unused; pending vs enum | **E-SLA** | SLM: policies, calendars, pause | P0 — ITIL SLM credibility |
| Docs vs DB status (`pending`) | **E-DOC** | ITSM docs + schema alignment | P1 — blocks false QA fails |
| `knowledge` / `catalog` RBAC open | **E-RBAC** | Extend server RBAC matrix | P0 — security |
| ENV-04 / seed idempotency | **E-DEVOPS** | Staging + CI ITSM profile | P1 — unblocks ITSM-E2E-016 |
| ITSM-AUTO-001 narrow | **E-QA** | Expand Playwright + API tests | P1 — regression |

---

## 3. Suggested release train (3 sprints)

Assume **2-week sprints**; adjust for team velocity. Order minimizes rework: **RBAC first** (small, reduces risk), then **relations**, then **SLA** (most behavioural).

### Sprint 1 — “Trust & safety”

| Story | Epic | Work (summary) | Acceptance criteria (high level) |
|-------|------|----------------|----------------------------------|
| S1.1 | E-RBAC | Add `knowledge` and `catalog` (and any other ITSM routers using `permissionProcedure` without matrix) to `apps/api/src/server/rbac.ts`; mirror client matrix if present in `apps/web/src/lib/rbac.ts`. | Viewer cannot `knowledge.write` / `catalog` mutations per matrix; integration tests for 403; update QA pack §3 |
| S1.2 | E-DEVOPS | Document + script **ITSM staging stack**: `DATABASE_URL`, migrations, seed, `REDIS_URL`, API worker command for SLA queue. Add to README or `docs/` runbook. | QA can run ITSM-E2E-016 without ad-hoc tribal knowledge |
| S1.3 | E-DOC | Decision record: **pending** — add DB enum + seed status **or** remove from docs; align `apps/docs/.../tickets.mdx` with code. | Single source of truth; QA pack §11 item 3 closed or marked “by design” |

**Sprint 1 DoD:** E-RBAC merged; staging runbook published; doc drift resolved.

---

### Sprint 2 — “Relationships & CMDB-lite”

| Story | Epic | Work (summary) | Acceptance criteria |
|-------|------|----------------|---------------------|
| S2.1 | E-REL | tRPC: `tickets.addRelation`, `tickets.removeRelation`, `tickets.listRelations` (or nested in `get`); validate org + no cycles where required; audit log. | API tests; P2 can link two tickets |
| S2.2 | E-REL | Web: Related tab on ticket detail — pick target ticket, type, save. | ITSM-E2E-* extended cases pass manually |
| S2.3 | E-QA | Playwright: relation happy path; keep under 5 min in CI with test DB. | New spec or extend `e2e/tickets.spec.ts`; documented in QA pack §9 |

**Sprint 2 DoD:** Relations vertical slice; automated smoke for relations.

---

### Sprint 3 — “SLM hardening”

| Story | Epic | Work (summary) | Acceptance criteria |
|-------|------|----------------|---------------------|
| S3.1 | E-SLA | On `tickets.create` / priority change: evaluate **active** `sla_policies` where `conditions` match (category, type, tag, etc.); fallback to priority minutes; persist deadlines. | Unit tests for matcher; at least one integration path |
| S3.2 | E-SLA | If **pending** introduced: `ticket_statuses` + category `pending` (migration); `assertTicketTransition` + SLA pause in `tickets.update` aligned with `slaPausedAt` fields. | ITSM-E2E-015/016 reproducible; BullMQ reschedule/cancel verified |
| S3.3 | E-SLA | Optional: business-calendar (v2) — **spike** 2 days then PO go/no-go | Spike outcome in ticket; calendar deferred or scoped |

**Sprint 3 DoD:** SLA policy engine v1 or explicit “priority-only + documented” with no table orphan; pause rules tested if pending ships.

---

## 4. Backlog (post–Sprint 3, prioritized)

| Item | Epic | Notes |
|------|------|------|
| Catalog → ticket fulfilment workflow | SCM / IM | Closes ITSM-E2E-020 “full path” if product wants one record |
| KB suggested articles on ticket detail | KM | AI-assisted already partial; deterministic KB links optional |
| CMDB link on ticket (`configuration_item_id` or join table) | SIM | Larger; depends on product scope |
| Optimistic locking (`version` on tickets) | O5 | Reduces ITSM-NEG-003 ambiguity |

---

## 5. DevOps & quality gates (per sprint)

| Gate | Check |
|------|--------|
| **CI** | API unit tests + affected Playwright (or nightly full E2E) on PR touching `tickets`, `rbac`, SLA |
| **Staging** | Deploy with Redis + worker; smoke: create ticket → SLA fields populated |
| **Security** | RBAC regression: P5 on all new procedures |
| **Release** | QA execution log (QA pack §10) attached to release ticket; G1–G4 from pack |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| SLA policy DSL scope creep | Start with **fixed fields** (type, categoryId, priorityId); JSON `conditions` v1 schema in Zod + docs |
| Pending status breaks existing transitions | Feature flag or migration that adds status without breaking orgs with 4 statuses |
| Playwright flakiness | Seed deterministic data; use `data-testid` already on ticket form |

---

## 7. Ceremonies (Scrum Master)

- **Sprint 0 (½ day):** PO ranks O1–O5; team estimates S1.1–S1.3; agree **definition of ready** (mocked API for UI if split).
- **Per sprint:** mid-sprint **QA sync** (blockers on ENV-04); end **demo** to PO on staging URL.
- **Retro:** track “doc vs code drift” as a recurring theme on ITSM-adjacent changes.

---

## 8. Delivery status (engineering — 2026-04-07)

| Sprint / epic | Status | Notes |
|-----------------|--------|--------|
| **E-RBAC** (`knowledge` / `catalog` in `PERMISSION_MATRIX`) | **Done** | `apps/api/src/server/rbac.ts`; `catalog.submitRequest` → `write` (viewers cannot order). Tests: `server-rbac-matrix.test.ts`. |
| **E-DEVOPS** (staging runbook) | **Done** | `docs/ITSM_STAGING_RUNBOOK.md` |
| **E-REL** (ticket relations API + UI) | **Done** | `tickets.addRelation` / `tickets.removeRelation`; `tickets.get` returns `relations`; web Related tab; `layer1` + new layer8 test; cleanup in test helpers. |
| **E-SLA** (policy-driven minutes) | **Done (v1)** | `resolveSlaPolicyMinutes` in `apps/api/src/services/ticket-sla-policy.ts` wired in `tickets.create`. |
| **E-SLA** (`pending` + pause in DB) | **Done** | Migration `0013_ticket_status_pending_enum_and_rows` (enum rebuild + rows); lifecycle in `ticket-lifecycle.ts`; `tickets.update` pause timestamps; `syncTicketSlaJobs` skips scheduling while `pending`. |
| **E-DOC** (`pending` in product docs) | **Done** | `apps/docs/src/pages/modules/tickets.mdx` + `docs/ITSM_STAGING_RUNBOOK.md` §7 aligned with shipped migrations. |
| **QA pack §11 (engineering)** | **Closed** | As of QA pack v1.2, every §11 item is **Addressed**. Product roadmap (`ITSM_PRODUCT_UPGRADE_PLAN_SNOW_SFDC.md`) remains separate backlog. |

## 9. Document history

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-04-07 | Initial build plan from QA_ITSM_E2E_TEST_PACK gaps |
| 1.1 | 2026-04-07 | Delivery status table |
| 1.2 | 2026-04-07 | E-SLA pending + E-DOC marked **Done**; migration 0013 + runbook §7. |
