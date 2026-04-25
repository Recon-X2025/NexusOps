# Security — ITSM-grade QA pack (Seq 12)

**Scope:** **`security`** router — security **incidents** (SOC lifecycle, containment journal, `false_positive` exit) and **vulnerabilities** (create, list, remediate).  
**Router:** `apps/api/src/routers/security.ts`.  
**Permissions:** `security:read` / `security:write`; `vulnerabilities:read` / `vulnerabilities:write` (see `permissionProcedure` per procedure).

**Cross-reference:** Program umbrella **`QA_COMPLIANCE_E2E_TEST_PACK.md`** (when present) covers broader compliance posture; this pack is the **hero** evidence for the `security` namespace alone.

---

## Part I — API cases

| ID | Persona | Procedure | Expected |
|----|---------|-----------|----------|
| SEC-TC-01 | SOC lead | `security.createIncident` | Numbered incident; org + reporter scoped |
| SEC-TC-02 | SOC lead | `security.transition` happy path | `new` → … → `closed`; invalid edge → `BAD_REQUEST` |
| SEC-TC-03 | SOC lead | `security.addContainment` | JSON `containmentActions` appended |
| SEC-TC-04 | Analyst | `new` → `triage` → `false_positive` | Terminal state per state machine |
| SEC-TC-05 | Vuln mgmt | `security.createVulnerability` + `listVulnerabilities` | Row visible org-scoped |
| SEC-TC-06 | Vuln mgmt | `security.remediateVulnerability` | Status `remediated` |
| SEC-TC-07 | Ops | `security.statusCounts` | Per-severity counts object |
| SEC-TC-08 | Ops | `security.openIncidentCount` | Excludes `closed` / `false_positive` |
| SEC-TC-09 | Reader | `security.listIncidents` + `getIncident` | Filters + single-row fetch |
| SEC-TC-10 | Requester | `createIncident` / `createVulnerability` | `403` (no write) |
| SEC-TC-11 | Web P1 | `/app/security` | No runtime crash (`e2e/security.spec.ts`) |

---

## Part II — C6 / C7

| Item | Detail |
|------|--------|
| **C6** | Vitest `security-rbac.test.ts`: **requester** denied writes; **`security_analyst`** can create + list. |
| **C7** | State machine keys in router (`STATE_MACHINE`) ↔ Postgres enums `sec_incident_status` / `vuln_status` — no orphan transitions in UI copy. |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 12 C1 |
