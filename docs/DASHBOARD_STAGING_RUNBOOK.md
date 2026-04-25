# Dashboard — staging runbook (Seq 9)

**Companion:** `docs/ITSM_STAGING_RUNBOOK.md`.

---

## ENV

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Ticket aggregates. |
| Redis | No | Speeds `getMetrics` / `getTimeSeries`; safe to omit (falls back to DB). |

---

## Checklist

1. Cold load **`/app/dashboard`** — numbers match order-of-magnitude vs DB counts.
2. Toggle Redis — second load should remain correct (cache vs no cache).

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 9 C3 |
