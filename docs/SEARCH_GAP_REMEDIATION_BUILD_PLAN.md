# Search — gap remediation (Seq 7)

**QA pack:** `docs/QA_SEARCH_ITSM_E2E_TEST_PACK.md`.  
**C5:** Layer 8 §8.30.

---

## Hero scope

- **`search.global`** stable contract: array return, optional **`entityTypes`**, graceful degradation without Meilisearch.
- **Org isolation** via Meili filter `org_id`.

**Deferred:** embedding / semantic search, federated external connectors, RBAC per hit type.

---

## Exit criteria

- [x] SRCH-TC-01–02 + 09 automated in Layer 8.
- [x] Register row **7** → Class **L**.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 7 C2 |
