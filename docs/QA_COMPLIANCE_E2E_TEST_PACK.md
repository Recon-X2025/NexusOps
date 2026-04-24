# Compliance (GRC + security + India) — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | Risk, policy, audits, vendor risks, security incidents, India GST (when enabled) |
| **References** | `apps/api/src/routers/grc.ts`, `security.ts`, `indiaCompliance.ts`, Layer 8 §8.10–8.11 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-COMP-01 | Standard DB + migrations. |
| ENV-COMP-02 | India GST / filing features — **N/A** unless `indiaCompliance` configured and keys documented. |

---

## 2. Personas

| ID | Matrix / role | Use |
|----|---------------|-----|
| P-COMP-1 | owner / admin | All mutations |
| P-COMP-2 | security_analyst | Security incident lifecycle |
| P-COMP-3 | grc_analyst | Risk/policy/audit |
| P-COMP-4 | viewer | Read-only dashboards |

---

## 3. Test cases

| ID | Area | Steps | Expected |
|----|------|-------|----------|
| COMP-01 | Risk | Create risk; verify score | Score = likelihood × impact |
| COMP-02 | Risk | Update likelihood | Score recalculates |
| COMP-03 | Policy | Create draft policy | Saved |
| COMP-04 | Policy | Publish policy | Status published |
| COMP-05 | Audit | Create audit plan | Appears in `listAudits` |
| COMP-06 | Vendor risk | Create + update vendor risk | `riskScore` persists |
| COMP-07 | Security | Create incident; run triage→closed | All transitions succeed |
| COMP-08 | Security | Severity field edits (if UI) | Persist |
| COMP-09 | Evidence export | Request export (if shipped) | Audit log entry |
| COMP-10 | India | GST compute / ITC | **N/A** or pass with test GSTIN |

**API parity:** Layer 8 extended GRC + existing security lifecycle.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.6 |
