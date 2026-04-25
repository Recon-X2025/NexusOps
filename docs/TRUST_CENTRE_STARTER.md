# Trust centre starter (US-SEC-008)

Use this as an internal or customer-facing outline; replace placeholders with your production values.

## Security practices

- Authentication: session-based API and web; optional API keys (`nxo_…`).
- Authorization: module × action RBAC matrix (`packages/types/src/rbac-matrix.ts`).
- Step-up verification: `auth.verifyStepUp` for privileged finance actions when enabled via org settings (see `docs/FINANCE_SOD_MATRIX.md`).
- Audit: mutation audit trail (`audit_logs`); sensitive fields redacted in `sanitizeForAudit`.

## Availability & recovery (placeholders)

- **Target RTO / RPO:** _TBD_
- **Backups:** _TBD_ (e.g. daily PostgreSQL snapshots)
- **Incident response:** security incidents module + ITSM tickets (link as per your runbooks)

## Subprocessors

| Vendor | Purpose |
|--------|---------|
| _Your cloud host_ | Infrastructure |
| _Your email provider_ | Notifications |

## Customer responsibilities

- Maintain accurate user roster and role assignments.
- Configure `organizations.settings` for procurement tolerance, duplicate invoice policy, closed accounting periods, and step-up roles.
