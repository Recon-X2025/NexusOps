# Legal + contracts — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | Legal matters, requests, investigations, contracts lifecycle |
| **References** | `apps/api/src/routers/legal.ts`, `contracts.ts`, `layer7-row-access.test.ts`, Layer 8 §8.14 + §8.38 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-LEG-01 | Users with `grc` read/write for legal mutations (server maps legal to `grc` permission module). |
| ENV-LEG-02 | Confidential investigations — two users: investigator vs non-investigator. |

---

## 2. Personas

| ID | Use |
|----|-----|
| P-LEG-1 | Counsel / admin — matters + investigations |
| P-LEG-2 | Standard member — create request |
| P-LEG-3 | Viewer — deny confidential rows |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| LEG-TC-01 | Create legal matter | Number `MAT-*` assigned |
| LEG-TC-02 | Update matter toward closed | Allowed transition |
| LEG-TC-03 | Create legal request | Visible in list |
| LEG-TC-04 | Create investigation (non-confidential) | Listed for org readers |
| LEG-TC-05 | Close investigation with findings | Status closed |
| LEG-TC-06 | Confidential investigation visible only to investigator + grc.admin | Row filtered per policy |
| LEG-TC-07 | Contract create + transition to active | Matches state machine |
| LEG-TC-08 | Wizard create with obligations | Obligations listed on get |
| LEG-TC-09 | Complete obligation | Status `completed` |
| LEG-TC-10 | Expiring contracts report | Array returned |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.7 |
