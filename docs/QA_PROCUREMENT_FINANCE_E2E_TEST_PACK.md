# Procurement + vendors + financial — E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | PRs, vendors, POs (as shipped), invoices, budget lines |
| **References** | `procurement.ts`, `vendors.ts`, `financial.ts`, Layer 8 §8.12 + §8.24 + §8.39 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-PF-01 | Thresholds in `procurement` router documented (auto-approve below ₹75k in code comments). |
| ENV-PF-02 | Redis N/A unless testing durable approval workflows. |

---

## 2. Personas

| ID | Use |
|----|-----|
| P-PF-1 | Procurement admin — PR approve/reject |
| P-PF-2 | Requester — create PR |
| P-PF-3 | Finance — invoices (if matrix) |
| P-PF-4 | Viewer — read vendors list only |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| PF-TC-01 | Create vendor (nested + top-level list) | Both paths consistent |
| PF-TC-02 | Update vendor notes | Persists (`vendors.update`) |
| PF-TC-03 | Small PR auto-approved | Status approved |
| PF-TC-04 | Large PR pending → reject | Status rejected |
| PF-TC-05 | Large PR pending → approve (alternate) | Approved path |
| PF-TC-06 | Multi-line PR | Line items sum = total |
| PF-TC-07 | List invoices (may be empty) | 200 + JSON shape |
| PF-TC-08 | List budget lines | Array |
| PF-TC-09 | Create budget line (finance) | Row visible |
| PF-TC-10 | P-PF-4 attempt PR create | 403 or hidden |

**API parity:** Layer 8 procurement + vendors + financial smoke.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.8 |
