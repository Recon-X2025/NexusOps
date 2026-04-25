# ServiceNow → NexusOps migration guide (v1)

This document supports **US-ITSM-009**: a credible cutover path for incidents, changes, CIs, and KB rows exported from ServiceNow.

## 1. Scope

| SNOW table / export | NexusOps target | Notes |
|---------------------|-----------------|-------|
| `incident` | `tickets` (type incident) + priorities/status mapping | Map `caller_id` to requester; preserve `sys_id` in external reference field when ingesting. |
| `change_request` | `change_requests` | CAB states map to NexusOps change lifecycle. |
| `cmdb_ci` | `ci_items` | Use `assets.cmdb.bulkImportCis` patterns; enforce external key idempotency. |
| `kb_knowledge` | `kb_articles` | Prefer HTML → plain text strip; retain `sys_id` for dedupe. |

## 2. Dry-run prototype

Call **`integrations.serviceNowImportDryRun`** with JSON rows from SNOW export:

- Each row should include a stable key: `sys_id` or `number`.
- Mark rows that already exist in NexusOps with `__nexusops_existing: true` to classify as **wouldUpdate** vs **wouldCreate**.

No database writes occur in dry-run mode.

## 3. Field mapping checklist

1. **Priority** — map SNOW `priority` integers to org-specific `ticket_priorities`.
2. **Assignment** — map `assignment_group` → `teams`; `assigned_to` → `users` by email.
3. **SLA** — recompute `slaResponseDueAt` / `slaResolveDueAt` from NexusOps policy (do not trust SNOW clocks verbatim post-migration).
4. **Attachments** — out of scope for v1; link to external blob store URLs in ticket description if needed.

## 4. Executive scorecard

Use **`reports.itsmExecutiveScorecard`** post-migration to validate volume, SLA breaches, pending changes, catalog throughput, and KB creation rates.

## 5. Professional services

Production cutover still requires customer runbooks, UAT sign-off, and often a filing partner for regulated data.
