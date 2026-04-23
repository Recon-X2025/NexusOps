# Security / GRC — sensitive mutation audit (API)

**Purpose:** Sprint 4 snapshot of **state-changing** tRPC procedures gated by `permissionProcedure` (RBAC). This is not a penetration test; it is an inventory for access reviews and SoD discussions.

## Pattern

- Default sensitive surface: `permissionProcedure("<module>", "write" | "admin")` in `apps/api/src/routers/*`.
- `protectedProcedure` without module checks is **higher risk** — review call-by-call (e.g. self-service reads).

## Routers — write / admin highlights

| Router | Examples (non-exhaustive) |
|--------|---------------------------|
| **auth** | `inviteUser`, `updateUserRole`, `deactivateUser` |
| **financial** | `createInvoice`, `approveInvoice`, `markPaid`, `createGSTInvoice`, `gstr2bReconcile`, budget/chargeback writes |
| **accounting** | Journal `create` / `post` / `reverse`, COA mutations |
| **hr** | Employees, cases, onboarding, attendance, expenses approve/reimburse, OKRs |
| **payroll** | `runs.create`, `lockPeriod`, `advanceComputationStep`, `computePayslips`, `approve`, `generateStatutory`, `complete` |
| **tickets** | `create`, `update`, `addComment`, `bulkUpdate` |
| **procurement** | Vendors, POs, receive/send |
| **catalog** | `createItem`, `fulfillRequest` |
| **workflows** | `create`, `save`, `publish`, `toggle`, `test` |
| **knowledge** | `create`, `update`, `publish`, `recordFeedback` |
| **integrations** | Webhooks, API keys, integration connect/disconnect |

## ITSM lifecycle guard

- Ticket status transitions for standard categories are enforced in `apps/api/src/lib/ticket-lifecycle.ts` (`assertTicketTransition`), used from `tickets.update`.

## Review cadence

- Re-run inventory after adding routers or changing `permissionProcedure` → `protectedProcedure`.
- Pair with RBAC matrix in product docs (org roles vs modules).

---

*Maintainer: refresh table rows when large new modules ship.*
