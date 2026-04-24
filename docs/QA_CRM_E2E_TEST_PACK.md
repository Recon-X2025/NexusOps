# CRM — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | Accounts, contacts, deals, pipeline |
| **References** | `apps/api/src/routers/crm.ts`, `apps/api/src/__tests__/layer8-module-smoke.test.ts` §8.15 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-CRM-01 | Standard app + seed; CRM tables empty is valid. |

---

## 2. Personas

| ID | Use |
|----|-----|
| P-CRM-1 | Sales owner — full write |
| P-CRM-2 | Viewer — read accounts/deals |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| CRM-TC-01 | Create account (SMB tier) | Row in list |
| CRM-TC-02 | Create contact linked to account | Contact visible under account |
| CRM-TC-03 | Create deal on account | Default stage `prospect` |
| CRM-TC-04 | Move deal to `qualification` then `negotiation` | Allowed transitions |
| CRM-TC-05 | Move deal to `closed_won` | `closedAt` set |
| CRM-TC-06 | Move deal to `closed_lost` | Stage lost; filters work |
| CRM-TC-07 | `listAccounts` filter by tier | Enterprise filter returns seeded row |
| CRM-TC-08 | `listDeals` filter by stage | Matches UI |
| CRM-TC-09 | Dashboard metrics after deals | Non-zero where data exists |
| CRM-TC-10 | P-CRM-2 attempt edit deal value | Denied or field read-only |

**API parity:** Layer 8 §8.15 including `closed_lost` + tier list test.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.4 |
