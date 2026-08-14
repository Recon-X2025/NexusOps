# WALK 2 — Authorization & tenant isolation (localhost, SHA 5c5490d)

**Method:** browser is the test. Two orgs on one dev DB — **WALK2 QA Co** (`e526a530-…`, fully provisioned: 2 employees, COA seeded, a completed payroll run) and **WALK2 Org B** (`85dabe5f-…`, minimal seed: admin only, per the handoff's org-B allowance). Logged in as each via session-token injection and checked what org-B can see/reach.

## RBAC — matrix roles & SoD (from Part 5, re-summarised)
- **Payroll SoD is server-enforced.** HR (`hr_manager`) → Finance (`finance_manager`) → CFO (`finance_manager`) approvals require **3 distinct identities**; a repeat approver is rejected **403** `payroll.runs.approve` *"Segregation of duties…"*. ✅
- **Permission gating on statutory generate:** CFO (`finance_manager`) → **403** `Permission denied: payroll.write`; only a `payroll.write` holder (admin) can generate statutory outputs. ✅ (correct RBAC)
- **UX note F12:** forbidden controls are still *rendered* (CFO-approve Execute shown to Finance; statutory Execute shown to CFO) — they 403 on click rather than being hidden/disabled.

## Tenant isolation — org-B cannot see or reach org-A data (all ✅)

| Vector | As org-B admin | Result |
|--------|----------------|--------|
| **HR employee directory** (`/app/hr`) | WALK2 has 2 employees (Ravi/Devi/EMP-0001/0002) | org-B shows **none** — no leak. `32-orgb-hr-isolated.png` |
| **Payslip PDF direct fetch** (`/api/payroll/payslip-pdf/42137da4-…`, Ravi's WALK2 payslip) | route scopes by org + user (`payroll-payslip-pdf.ts:42`) | **HTTP 404 Not Found** — cross-tenant read denied |
| **Chart of Accounts** (`/app/finance/accounting/coa`) | WALK2 has ~47 seeded accounts | org-B CoA is **empty (0 rows)** — no leak |

**Conclusion:** tenant scoping (orgId on every query, plus the RLS wall described in CLAUDE.md / migration `0052`) holds on the paths exercised. No cross-tenant data leak observed; a direct object-reference attempt (org-B fetching org-A's payslip by id) is correctly refused with 404.

## Coverage / not-tested
- Verified vectors: HR directory, payroll payslip PDF (IDOR attempt), CoA. All isolated.
- Not exhaustively swept: every module's list endpoint for cross-tenant leakage (would require seeding org-A records in each module). The three highest-value surfaces (people PII, payslip money doc, financial CoA) were checked and hold; the shared `rlsTenant` middleware + orgId scoping is the same mechanism across modules.
- Employee self-service scoping also confirmed in Part 5: the payslip PDF route restricts to the employee's **own** user (`employees.userId = userId`) — one employee cannot read another's payslip (this is also **F13**: no admin/HR override path exists).
