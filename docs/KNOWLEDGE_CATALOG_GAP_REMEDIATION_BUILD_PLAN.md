# Knowledge + catalog — gap remediation (Seq 3–4)

**Primary C1:** `docs/QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` (KCP-TC + KNG/KCT split below).  
**C5:** Layer 8 §8.22 + §8.35.  
**C6:** `apps/api/src/__tests__/knowledge-catalog-rbac.test.ts`.

---

## Hero scope

- **Knowledge:** list/search, create, publish, get (view count), feedback.
- **Catalog:** items CRUD surface (`listItems`, `getItem`, `createItem`), requests (`submitRequest`, `listRequests`), `stats`.
- **RBAC:** KB write restricted to roles with `knowledge:write`; catalog write requires `catalog:write` (deny `security_analyst` create smoke).

**Deferred:** Meilisearch-backed portal search (ENV-KCP-02), fulfilment worker automation.

---

## Exit criteria

- [x] Layer 8 depth + dedicated Vitest RBAC + `e2e/knowledge.spec.ts` + `e2e/catalog.spec.ts`.
- [x] Register rows **3–4** → Class **L** with traceability.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 3–4 C2 |
