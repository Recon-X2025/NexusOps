# Finance segregation of duties (starter matrix)

| Role / actor | Create vendor | Approve PR (high $) | Approve invoice | Mark invoice paid |
|--------------|---------------|---------------------|-----------------|-------------------|
| Procurement buyer | ✓ | — | — | — |
| Finance approver | — | ✓ | ✓ | — |
| AP clerk | — | — | — | ✓ |

## Revenue path (CRM) — US-CRM-006

High-value **closed_won** moves require recorded approval separate from day-to-day pipeline edits: org thresholds in `settings.crm`, **`crm.approveDealWon`** / Admin **CRM deal thresholds**, and **`movePipeline`** enforcement (see **US-CRM-003**). This is the revenue-cycle analogue to AP approve vs pay.

## Enforced in product (US-FIN-006 / US-SEC-008)

- **`financial.markPaid`**: rejects when `approved_by_id` equals the current user (same person cannot approve and pay). Covered by **layer8** SoD test.
- **`financial.approveInvoice`** and **`financial.markPaid`**: optional **step-up** when `organizations.settings.security.requireStepUpForMatrixRoles` includes the user’s `matrix_role` (see `auth.verifyStepUp`). Step-up validity is stored in **Redis** per session (not in `users`).

## Org settings (JSON)

```json
{
  "security": {
    "requireStepUpForMatrixRoles": ["finance_manager", "admin"]
  },
  "procurement": {
    "poMatchToleranceAbs": 1,
    "duplicatePayableInvoicePolicy": "warn"
  },
  "financial": {
    "closedPeriods": ["2025-04"]
  }
}
```

Legal entities: `financial.listLegalEntities`, `financial.createLegalEntity`; invoices may set `legalEntityId`.
