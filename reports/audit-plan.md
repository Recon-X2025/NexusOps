# NexusOps Audit Plan

Generated: 2026-07-31
Subsystems: 16

## How to use this file

Run one audit at a time. Copy the command next to the first unchecked box and
paste it into Claude Code. Come back here when it finishes and tick the box.

The list is ordered by criticality, highest first. If you stop early, you will
still have covered the areas where a failure hurts most (money, tenant isolation,
who-can-see-what).

"Failure is" tells you whether a bug here would be **visible** to a customer
straight away, **silent** (wrong for a long time before anyone notices), or
**both**. Silent failures are the dangerous ones.

Before you start, read the **"Please confirm these"** section at the top of
`docs/quality-bar.md` and correct anything I got wrong. Every audit measures the
code against that file, so a wrong rule there produces wrong findings here.

## Checklist

- [x] **tenant-isolation** — the wall that stops one customer seeing another customer's data (org filters + database Row-Level Security + the `app_runtime` role)
      Command: /qa-audit tenant-isolation
      Criticality: high | Failure is: silent
      Audited 2026-07-31 → reports/audit-tenant-isolation.md (2 HIGH, 2 MEDIUM, 1 LOW)

- [x] **auth-rbac** — who can log in, sessions, multi-factor, and the permission matrix deciding what each role may do
      Command: /qa-audit auth-rbac
      Criticality: high | Failure is: silent
      Audited 2026-07-31 → reports/audit-auth-rbac.md (5 HIGH, 2 MEDIUM, 1 LOW)

- [x] **money-accounting** — the general ledger, journal entries (debits must equal credits), invoice-to-ledger posting, balance/P&L
      Command: /qa-audit money-accounting
      Criticality: high | Failure is: both
      Audited 2026-07-31 → reports/audit-money-accounting.md (4 HIGH, 1 MEDIUM)

- [x] **payroll-tax** — India payroll engine, salary calculation, income tax/TDS, PF/ESI/PT statutory deductions, Form 16
      Command: /qa-audit payroll-tax
      Criticality: high | Failure is: both
      Audited 2026-07-31 → reports/audit-payroll-tax.md (2 BLOCKER, 2 MEDIUM)

- [x] **gst-invoicing** — GST computation (CGST/SGST/IGST), invoice 3-way match (invoice ≈ PO ≈ goods receipt), input tax credit
      Command: /qa-audit gst-invoicing
      Criticality: high | Failure is: both
      Audited 2026-07-31 → reports/audit-gst-invoicing.md (2 HIGH, 2 MEDIUM)

- [x] **audit-log-integrity** — the tamper-evident audit trail (hash chain) that proves records weren't secretly altered
      Command: /qa-audit audit-log-integrity
      Criticality: high | Failure is: silent
      Audited 2026-07-31 → reports/audit-audit-log-integrity.md (2 HIGH, 2 MEDIUM)

- [x] **dpdp-privacy** — India data-protection: PII hashing, consent expiry, data-subject requests, breach handling, erasure
      Command: /qa-audit dpdp-privacy
      Criticality: high | Failure is: silent
      Audited 2026-07-31 → reports/audit-dpdp-privacy.md (2 BLOCKER, 2 HIGH, 2 MEDIUM)

- [x] **secrets-kms-integrations** — envelope encryption of stored credentials and the outbound connectors (EPFO, NIC e-way, MCA21, ClearTax, Razorpay, M365)
      Command: /qa-audit secrets-kms-integrations
      Criticality: high | Failure is: silent
      Audited 2026-07-31 → reports/audit-secrets-kms-integrations.md (1 BLOCKER, 2 HIGH, 2 MEDIUM)

- [x] **data-layer-migrations** — the database schema, foreign-key delete rules, and the migration chain that evolves the schema safely
      Command: /qa-audit data-layer-migrations
      Criticality: high | Failure is: both
      Audited 2026-07-31 → reports/audit-data-layer-migrations.md (1 BLOCKER, 2 HIGH, 1 MEDIUM)

- [x] **background-automation** — the scheduled loops (Temporal + BullMQ): webhook delivery, SLA escalation, DPDP sweeps, workflow triggers
      Command: /qa-audit background-automation
      Criticality: medium | Failure is: silent
      Audited 2026-07-31 → reports/audit-background-automation.md (0 BLOCKER, 1 HIGH, 2 MEDIUM)

- [x] **itsm-service** — tickets, SLAs, on-call escalation, approvals, change management
      Command: /qa-audit itsm-service
      Criticality: medium | Failure is: visible
      Audited 2026-07-31 → reports/audit-itsm-service.md (0 BLOCKER, 1 HIGH, 1 MEDIUM, 1 LOW)

- [x] **crm-sales** — leads, accounts, contacts, deals, lead scoring, quote/CPQ with tax
      Command: /qa-audit crm-sales
      Criticality: medium | Failure is: visible
      Audited 2026-07-31 → reports/audit-crm-sales.md (0 BLOCKER, 0 HIGH, 1 MEDIUM, 2 LOW)

- [x] **assets-procurement-inventory** — IT asset lifecycle, depreciation, purchase orders, goods receipt, stock valuation
      Command: /qa-audit assets-procurement-inventory
      Criticality: medium | Failure is: both
      Audited 2026-07-31 → reports/audit-assets-procurement-inventory.md (0 BLOCKER, 1 HIGH, 3 MEDIUM, 1 LOW)

- [x] **hr-people** — employee lifecycle, attendance/leave, gratuity, performance/OKR, recruitment
      Command: /qa-audit hr-people
      Criticality: medium | Failure is: visible
      Audited 2026-07-31 → reports/audit-hr-people.md (0 BLOCKER, 1 HIGH, 2 MEDIUM, 1 LOW)

- [x] **platform-superadmin** — the cross-tenant super-admin console (apps/mac): org provisioning, impersonation, billing, feature flags
      Command: /qa-audit platform-superadmin
      Criticality: medium | Failure is: silent
      Audited 2026-07-31 → reports/audit-platform-superadmin.md (0 BLOCKER, 1 HIGH, 2 MEDIUM, 1 LOW)

- [x] **observability-health** — logging, metrics, health checks, rate limiting, database-pool pressure
      Command: /qa-audit observability-health
      Criticality: low | Failure is: silent
      Audited 2026-07-31 → reports/audit-observability-health.md (0 BLOCKER, 1 HIGH, 2 MEDIUM, 1 LOW)
