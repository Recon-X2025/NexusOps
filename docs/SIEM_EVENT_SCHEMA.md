# SIEM event schema (MVP) — US-SEC-003

## Transport

- **Webhook**: reuse `webhooks` with event channel `security.siem` (customer-configured URL).
- **Signed push**: HMAC-SHA256 using the webhook `secret` over the raw JSON body (same pattern as ticket webhooks).

## Core envelope

```json
{
  "schema": "nexusops.security.event.v1",
  "emittedAt": "2026-04-25T12:00:00.000Z",
  "orgId": "uuid",
  "kind": "audit_log | security_incident | read_audit",
  "payload": {}
}
```

## Kinds

### `audit_log`

Mirrors `audit_logs` rows (no secrets / no PII in `changes` — sanitize upstream).

| Field | Type |
|-------|------|
| `action` | string |
| `resourceType` | string |
| `resourceId` | string \| null |
| `userId` | string \| null |
| `createdAt` | ISO-8601 |

### `security_incident`

| Field | Type |
|-------|------|
| `id` | uuid |
| `number` | string |
| `severity` | enum |
| `status` | enum |
| `updatedAt` | ISO-8601 |

### `read_audit` (optional)

Emitted when `security.recordSensitiveRead` persists and `org.settings.security.sensitiveReadAuditEnabled` is true.

## Preview API

`security.siemExportPreview` returns a **non-production** sample for SIEM onboarding (last 7 days audit slice + incident snapshot).

## Performance

Read-audit is **off by default**. When enabled, batch inserts and cap cardinality (module + resource type) per org.
