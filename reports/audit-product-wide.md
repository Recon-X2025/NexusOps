# Product-wide audit — ranked fix register

_Date: 2026-08-24. Produced by a 12-subsystem parallel audit (adversarial self-refutation
per subsystem) + a synthesis pass. 13 agents, 0 errors. Read-only; findings are code-traced
and **UNVERIFIED by execution** — each will be re-verified in source before it is fixed._

Full per-finding detail (offending code, concrete failure scenario, refutation attempt) lives in
the run journal:
`~/.claude/projects/-Users-kathikiyer-Documents-NexusOps/9a79e89a-6e14-485f-8322-b22fd89a40e3/subagents/workflows/wf_1d4f0c28-182/journal.jsonl`

The three already-fixed dashboard items (aggregate truncation, stateFromTrend, drill-link 404s) are
excluded.

## In plain English

The platform's problems cluster in three areas: **who-can-see-and-do-what** (privacy and access),
**money/tax correctness**, and the **reliability of automated background jobs**.

The single worst issue: **any ordinary employee can pull any coworker's real PAN card number and full
salary straight from the API** — the payslip "only see your own" rule is missing on four payroll
endpoints. Close behind, **firing or disabling someone does not end their existing session**, so a
terminated employee keeps full access for up to a month, and the main offboarding automation has this
exact hole. On money and tax: **the GST sales return mixes supplier bills in as if they were your own
sales** (you'd over-report tax and claim you sold to yourself); **Form 16 certificates and monthly tax
withholding are wrong for the default tax regime**; and the **tamper-proof audit log can be quietly
"healed"** after someone deletes recent entries. **Automated leave accrual silently does nothing every
month**, so balances drift. A recurring **"click twice quickly" pattern creates duplicate accounting
reversals, duplicate purchase orders, and duplicate sales opportunities** — all corrupting figures with
no error shown. Two **cross-tenant holes** let one customer corrupt or delete another's data, but only
if they get hold of an internal id.

Below these sits a tail of medium/low hardening gaps: missing audit trails on platform-admin actions,
missing timeouts on government-portal calls, duplicate notifications on retry, and several silent
"swallow the error and show an empty screen" spots.

**Recommended order:** lock down the payroll PII leak and session revocation first, then GST filing and
audit-chain integrity, then the tax-calculation and concurrency fixes, then the isolation hardening.

## BLOCKERS (6)

| # | Subsystem | Finding | Location |
|---|---|---|---|
| 1 | payroll | Payroll read procedures leak **decrypted PAN, full salary, UAN** of any employee to any coworker (`hr:read`, no self-scope) — `computeCurrentSlip`, `listPayslips`, `computeMonthlySlip`, `generateECR` | `apps/api/src/routers/hr.ts:1707` |
| 2 | auth-rbac | Disabling/offboarding a user **never revokes live sessions** — auth path never checks `users.status` (terminated user keeps access ~1 month) | `apps/api/src/middleware/auth.ts:230` |
| 3 | gst-invoicing | `generateGSTR1` has **no `invoiceFlow` filter** — payable (purchase) invoices filed as your own outward supplies | `apps/api/src/routers/accounting.ts:952` |
| 4 | audit-log-chain | `appendAuditEntry` regresses the tail-truncation anchor, so the **next normal write silently heals a truncated chain** | `apps/api/src/lib/audit-hash.ts:178` |
| 5 | tenant-isolation | `work-orders.delete` **deletes another tenant's activity logs** (no-`org_id` table, no RLS, no app filter) | `apps/api/src/routers/work-orders.ts:357` |
| 6 | procurement | `purchaseOrders.receive` updates `po_line_items` by caller-supplied id with **no org/PO scoping** — cross-tenant write | `apps/api/src/routers/procurement.ts:806` |

## HIGH (17)

| # | Subsystem | Finding | Location |
|---|---|---|---|
| 7 | india-statutory | `computeTax` deducts professional tax under the NEW regime → under-withholds TDS for the default regime | `packages/payroll-math/src/tax-engine.ts:340` |
| 8 | hr-leave | Scheduled monthly leave accrual + year-end close **silently never persist** (cron writes a non-UUID `createdById`) | `apps/api/src/workflows/hrPeriodicWorkflow.ts:160` |
| 9 | generated-docs | Form 16 Part B hardcodes Rs.50,000 std deduction, taxable income on a different basis than the tax it prints | `apps/api/src/lib/india/form16-aggregator.ts:60` |
| 10 | accounting | `journal.reverse` has no row lock / re-check → concurrent double-reverse posts two reversals | `apps/api/src/routers/accounting.ts:431` |
| 11 | crm-csm | Lead conversion is check-then-act, no lock/unique → concurrent converts mint duplicate deal+account+contact | `apps/api/src/lib/crm/lead-convert.ts:68` |
| 12 | procurement | `createFromPR` reads PR status outside tx, no compare-and-set → two POs from one requisition | `apps/api/src/routers/procurement.ts:782` |
| 13 | hr-leave | `hr.leave.reject` has no status guard → rejecting an approved leave leaves `usedDays` inflated | `apps/api/src/routers/hr.ts:1118` |
| 14 | hr-leave | Year-end close lapses compensatory-off balances (cap 0), destroying in-window comp-off | `apps/api/src/routers/leave-accrual.ts:555` |
| 15 | auth-rbac | Custom-role perms stored in a vocabulary (create/update/manage) no server gate matches (write/admin) | `apps/api/src/lib/rbac-db.ts:79` |
| 16 | auth-rbac | `updateUserRole` lets any `users:write` holder promote themselves to owner/admin — no hierarchy/self guard | `apps/api/src/routers/auth.ts:961` |
| 17 | gst-invoicing | Automatic e-invoice IRN never fires for receivables; only enqueue site is dead code on the payable path | `apps/api/src/routers/financial.ts:1545` |
| 18 | gst-invoicing | Tax-invoice PDF prints row `createdAt` as invoice date, not statutory `invoiceDate` — disagrees with IRN/GSTR-1 | `apps/api/src/http/financial-invoice-pdf.ts:198` |
| 19 | hr-leave | Offboarding revocation skips `invited` users (contradicts its own comment) — never-activated logins never disabled | `apps/api/src/lib/offboarding-revoke.ts:97` |
| 20 | workflows-worker | Retention sweep hard-deletes every soft-deleted doc immediately when `RETENTION_DEFAULT_DAYS` is blank/malformed | `apps/api/src/workflows/documentRetentionWorkflow.ts:149` |

_(HIGH ranks 15/16 are auth-rbac; the full list continues through rank 20.)_

## MEDIUM (12) & LOW (6) — summary

MEDIUM: spoofable internal-endpoint IP fallback (`index.ts:653`); MAC super-admin mutations unaudited
(`trpc.ts:383`); `auditMutation` swallows append failures (`trpc.ts:447`); `purchaseOrders.receive`
absolute over-receipt (`procurement.ts:808`); GRN counter absent from `COUNTER_SPECS`
(`auto-number.ts:14`); Form 16 no HRA exemption (`form16-aggregator.ts:55`); offboarding false comment
(`offboarding-revoke.ts:14`); offboarding 3-table write no transaction (`hr.ts:1540`); retention
purge+audit not atomic (`documentRetentionWorkflow.ts:173`); notification retry re-delivers channels
(`notificationDispatchWorkflow.ts:158`); GSP fetch no timeout (`epfo-ecr.ts:70`); CSM status free string
vs hardcoded metric filters (`csm.ts:80`).

LOW: journal.create no per-line org check (`accounting.ts:325`); MAC impersonation mints unusable JWT
(`mac.ts:412`); Temporal updates by PK without org_id (`workflow-activities.ts:352`); expiry/retention
bare LIMIT no ORDER BY (`expiryAlertWorkflow.ts:157`); `csm.cases.list` swallows errors → empty queue
(`csm.ts:38`); tax-invoice "(rate-wise above)" label when table dropped (`invoice-pdf.ts:338`).

## Dropped / merged / excluded

- **Dropped as accepted debt (1):** gst-invoicing "createGSTInvoice never persists invoice_line_items"
  — quality-bar "Known accepted debt" documents the header-fallback as the accepted current state; the
  only novel angle (mixed-rate blending) is reachable solely via the deprecated `createGSTInvoice`
  twin. Flagged for owner: if mixed-rate blending is considered distinct, re-open as LOW + add a
  twin-guard.
- **Nothing dropped as refuted** — all 43 input findings survived their auditors' own refutation.
- **Merged:** three payroll auth findings → rank 1 (one root cause: `hr:read` reads with no self-scope;
  `generateECR`'s fabricated EPFO establishment-id noted there). Form 16 Rs.50,000 reported by two
  auditors → rank 9. Audit-chain test-gap folded into rank 4's fix.
- **Checked against GAP_ANALYSIS** (G23/G24/G26/G27): no overlap with any surviving finding.
