# Notifications — staging runbook (Seq 6)

**Companion:** `docs/ITSM_STAGING_RUNBOOK.md`.

---

## Checklist

1. **`/app/notifications`** — inbox renders; mark-read controls do not 500.
2. Trigger a ticket assignment or use **`notifications.send`** from admin API — recipient sees unread badge when UI wired.
3. Confirm **`notification_preferences`** unique constraint exists if testing **`updatePreference`** in UAT.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 6 C3 |
