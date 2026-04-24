# Staging runbook — addenda (non-ITSM modules)

**Companion:** `docs/ITSM_STAGING_RUNBOOK.md` (ITSM remains the primary ENV template).  
Use this addendum for **HR, CSM, catalog, legal, procurement/finance, work orders**, and other modules under test.

---

## Shared prerequisites

| ID | Requirement |
|----|-------------|
| ENV-M01 | Same as ITSM **ENV-01–ENV-03** (app up, migrated DB, seeded demo org). |
| ENV-M02 | **Redis** — optional unless testing approval workflows, SLA jobs, or payroll jobs; mark cases **N/A** if not running. |
| ENV-M03 | **BullMQ workers** — optional; mark async follow-up cases N/A if workers down. |

---

## HR + leave

| ID | Check |
|----|--------|
| HR-01 | Org has at least one **user** without `employees` row for “create employee” QA. |
| HR-02 | Leave approval path: actor with `hr` **approve** (owner/admin or matrix role with approve) available. |
| HR-03 | Payroll / bank export / calendar sync — **N/A** unless those features enabled for the tenant. |

---

## CSM

| ID | Check |
|----|--------|
| CSM-01 | `csm_cases` table present (migrations applied). |
| CSM-02 | Clarify double-truth with **tickets**: CSM case vs IT ticket — document which object is SoT for customer comms. |

---

## Catalog + portal

| ID | Check |
|----|--------|
| CAT-01 | At least one **active** catalog item for self-service request tests. |
| CAT-02 | If Meilisearch disabled, search cases in portal marked **N/A** or limited to DB-backed paths only. |

---

## Legal + contracts

| ID | Check |
|----|--------|
| LEG-01 | Legal procedures use **`grc`** permission module on server — assign test users with `member` + appropriate matrix or `admin`/`owner`. |
| LEG-02 | Confidential investigations: only investigator + `grc.admin` path documented in QA pack. |

---

## Procurement + vendors + financial

| ID | Check |
|----|--------|
| PR-01 | Large PR (> auto-approve threshold in `procurement` router) produces **pending** then **reject**/**approve** path. |
| FIN-01 | Invoice list may be empty on fresh org — valid smoke is **empty list**, not failure. |

---

## Work orders

| ID | Check |
|----|--------|
| WO-01 | Assignment rules optional — if none, work order still **creates** with null assignee. |

---

## Evidence

Store HAR/screenshots per `QA_*` pack execution log; link PRs that add Layer 8 / Playwright for traceability.
