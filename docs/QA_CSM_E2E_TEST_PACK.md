# CSM (customer service) — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | NexusOps — Customer service cases |
| **References** | `apps/api/src/routers/csm.ts`, `apps/web/src/app/app/csm/`, Layer 8 §8.34 |
| **Double-truth rule** | If a customer issue is also tracked as an **IT ticket**, document which record is authoritative for SLA and customer comms. |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-CSM-01 | DB migrated; `csm_cases` exists. |
| ENV-CSM-02 | Linked CRM account optional — note N/A if not used. |

---

## 2. Personas

| ID | Role | Use |
|----|------|-----|
| P-CSM-1 | Admin / CSM fulfiller | Create, assign, resolve |
| P-CSM-2 | Viewer | Read queue only |
| P-CSM-3 | Customer portal (if enabled) | Submit-only scope |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| CSM-TC-01 | Open `/app/csm` | Page loads |
| CSM-TC-02 | Create case with title + priority | Row appears in list |
| CSM-TC-03 | Update status to in_progress | Persists after refresh |
| CSM-TC-04 | Assign to fulfiller | Assignee visible |
| CSM-TC-05 | Add resolution; set resolved | Closed state |
| CSM-TC-06 | Filter list by status | Correct subset |
| CSM-TC-07 | Open case detail `/app/csm/[id]` | Detail matches list |
| CSM-TC-08 | Dashboard metrics widget | Numbers non-null |
| CSM-TC-09 | Link to CRM account when `accountId` set | Navigation works |
| CSM-TC-10 | P-CSM-2 export / bulk action (if any) | Denied or hidden |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.5 |
