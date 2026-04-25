# Search — staging runbook (Seq 7)

**Companion:** `docs/ITSM_STAGING_RUNBOOK.md` · **ENV:** `MEILISEARCH_URL`, `MEILISEARCH_KEY` (optional).

---

## Checklist

1. With Meili **down** — `search.global` returns **[]**; web does not white-screen.
2. With Meili **up** — reindex jobs per ops playbook; spot-check ticket title search.
3. Confirm **`org_id`** filter in index settings matches `search.ts` expectations.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 7 C3 |
