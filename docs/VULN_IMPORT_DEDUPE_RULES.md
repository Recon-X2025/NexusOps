# Vulnerability import — dedupe & SLAs (US-SEC-005)

## Idempotent import

Procedure: **`security.importVulnerabilities`**

- Each finding MUST include a stable **`fingerprint`** (e.g. `scanner:asset:CVE-2024-1234` or vendor UID).
- Unique index: `(org_id, external_fingerprint)` where fingerprint is not null.
- Re-import with the same fingerprint **updates** title, severity, SLA fields, and `scannerSource`.

## SLA fields

- **`remediation_sla_days`**: optional; drives `remediation_due_at` from import time.
- Overdue tracking can be implemented via scheduled jobs (customer-specific).

## Exception records

Procedure: **`security.createVulnerabilityException`**

- Persists an approval trail (`approved_by`, `expires_at`).
- Sets vulnerability `status` to **`accepted`** (product simplification — adjust if you need distinct `exception` enum later).

## Dedup rules doc (summary)

| Rule | Behaviour |
|------|-----------|
| Same fingerprint | Update existing row |
| Missing fingerprint | Rejected at API validation (min length) |
| Conflicting CVE-only rows | Prefer vendor fingerprint; avoid CVE-only keys when assets matter |
