# Knowledge + catalog + portal — E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | KB articles, catalog items/requests, portal self-service tied to tickets/catalog |
| **References** | `knowledge.ts`, `catalog.ts`, ITSM pack §Knowledge, Layer 8 §8.22 + §8.35 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-KCP-01 | ITSM seed + at least one KB article for portal search. |
| ENV-KCP-02 | Meilisearch — N/A for strict DB tests; mark search cases N/A if infra missing. |

---

## 2. Personas

| ID | Use |
|----|-----|
| P-KCP-1 | Agent — publish KB |
| P-KCP-2 | Employee — portal search + catalog request |
| P-KCP-3 | Viewer — read KB; no catalog submit if policy denies |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| KCP-TC-01 | Agent creates KB article | Listed |
| KCP-TC-02 | Agent publishes / sets visibility | Portal can see |
| KCP-TC-03 | Portal search hits article | Result row |
| KCP-TC-04 | Catalog list active items | Only `active` |
| KCP-TC-05 | Submit catalog request | Request row |
| KCP-TC-06 | List my requests | Filter works |
| KCP-TC-07 | Fulfilment path (if UI) | Status transitions per router |
| KCP-TC-08 | KB feedback / helpful (if UI) | Non-500 |
| KCP-TC-09 | RBAC viewer tries `catalog.write` mutation | 403 |
| KCP-TC-10 | Ticket + KB link (if feature) | Relation visible |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.2 |
