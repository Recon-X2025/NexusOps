# Audit & Remediation Plan — 2026-08-17

_Supersedes `reports/audit-plan.md` as the working plan. That file's 16 boxes are all ticked and
its ticks are **no longer meaningful**: they were earned at migration head `0059`, and the head is
now `0093`. This plan re-states coverage honestly and sequences the work._

**Written for a non-developer.** Every status below was checked against source in this pass or is
explicitly marked as unverified.

---

## 1. In plain English

The audit programme looks complete — sixteen ticked boxes — but the ticks are stale. All sixteen
audits were done at the end of July against a database schema thirty-four migrations older than
today's. Since then the payroll engine, the tax configuration, depreciation, CRM and the GST
plumbing have all been substantially rewritten. **A tick from July is not evidence about the code
that is running now.**

What I verified today is narrow but real: the five underlying mistakes that produced almost every
July finding have all been fixed properly, and I confirmed each in the code rather than trusting the
notes. I also ran one fresh audit — invoicing and payments — which found two genuine defects, one of
which I have now fixed.

The honest position is this: **the foundations are in good shape, one area is freshly audited, and
fourteen areas are running on a July verdict that no longer applies.** Nothing here suggests
something is on fire. It suggests the map is out of date.

**The one thing to do first** is re-audit payroll and tax. It has changed more than anything else,
it moves real money to real people, and it produces filings a regulator reads.

## 2. Coverage map — what is actually verified

| Subsystem | Last real audit | Confidence now | Why |
|---|---|---|---|
| **finance AR/AP** | **2026-08-17** | **High** | Audited today (`audit-finance-ar-ap.md`); 1 of 2 HIGHs already fixed |
| The 5 root causes | 2026-08-17 | High | Each re-verified in source today (`audit-summary-2026-08-17.md` §3) |
| payroll-tax | 2026-07-31 | **Very low** | Migs 0063-0080, 0093 rewrote PF, PT, DA, Para 26(6), tax declarations, arrears |
| money-accounting | 2026-07-31 | Low | Partly superseded by today's AR/AP pass; statements themselves unre-checked |
| gst-invoicing | 2026-07-31 | Low | Migs 0069-0072 added AATO, B2CL threshold, credit/debit-note FK |
| crm-sales | 2026-07-31 | **Low** | Migs 0086-0089; `CLAUDE.md` records the deprecated-twin trap biting 3× |
| assets-procurement-inventory | 2026-07-31 | Low | Depreciation engine + mig 0092 rewrote the idempotency key |
| hr-people | 2026-07-31 | Low | Migs 0082-0085 added settlements, leave/exit rules |
| data-layer-migrations | 2026-07-31 | Low | 34 migrations since |
| tenant-isolation | 2026-07-31 | Medium | RLS convention still being followed — spot-checked on 0093 today |
| auth-rbac | 2026-07-31 | Medium | No large schema change; RBAC map drift is a known standing risk |
| audit-log-integrity | 2026-07-31 | Medium | Head-read + advisory lock fix verified today |
| dpdp-privacy | 2026-07-31 | Medium | Dispatcher routing + no-`sent`-state verified today |
| secrets-kms-integrations | 2026-07-31 | Unverified | No re-check this pass |
| background-automation | 2026-07-31 | Unverified | No re-check this pass |
| itsm-service | 2026-07-31 | Unverified | No re-check this pass |
| platform-superadmin | 2026-07-31 | Unverified | Live cross-tenant surface; quality-bar rule 6 says treat as in-scope |
| observability-health | 2026-07-31 | Unverified | No re-check this pass |

### Never audited at all — new units in the working tree

These are uncommitted and have had **no** audit pass:

| Unit | Size | Risk note |
|---|---|---|
| `packages/payroll-math/src/arrears.ts` + mig `0093` | 127 lines | Money owed to a named employee. Table **is** correctly RLS-walled (verified today). |
| `apps/api/src/services/quote-pdf.ts` + `http/crm-quote-pdf.ts` | 651 lines | Customer-facing document; CRM/GST surface |
| `apps/api/src/lib/depreciation-sweep.ts` + mig `0092` | 145 lines | Money path; 0092 changes the idempotency key from an ordinal to a calendar period |
| Two new web routes (mine, 2026-08-17) | — | GSTR Generation, Trial Balance — typechecked, unit-tested, **not** browser-verified |

## 3. Consolidated open defect register

Everything currently known to be wrong, from all sources, newest first.

| ID | Sev | What | Where | Status |
|---|---|---|---|---|
| ARAP-1 | HIGH | Invoice GL numbering collided with the ledger's atomic counter; could fail an invoice outright | `lib/invoice-journal.ts` ×5 | **FIXED 2026-08-17** — one shared `nextJournalNumber`; regression test added; 4/4 pass |
| ARAP-2 | HIGH | Approve-before-pay enforced only in the UI; two screens let an unapproved invoice be paid; SoD check passes vacuously | `routers/financial.ts`; `app/financial/page.tsx` | **FIXED 2026-08-17** — `lib/invoice-transitions.ts`, called by both mutations; both UI blocks corrected; 10 tests |
| ARAP-3 | MED | `approveInvoice` can regress a paid invoice → settled money returns to AP aging | `routers/financial.ts` | **FIXED** — terminal-state rule in the shared guard |
| ARAP-4 | MED | `approveInvoice` has no period-close check while `markPaid` does | `routers/financial.ts` | **FIXED** — period close moved into the shared guard, applied to both actions |
| ZB-F1/F3 | MED | Legacy `/app/accounting` P&L tab shows inception-to-date as "Net Profit"; overstates income when a credit note exists | `app/app/accounting/page.tsx` | **FIXED 2026-08-17** — page deleted; route-permission entry, RBAC map entry and 4 e2e specs repointed |
| ZB-F2 | MED | `incomeStatement` **and** `trialBalance` declare date inputs and ignore them | `routers/accounting.ts` | **PARTLY FIXED** — `incomeStatement` removed with its only caller. **`trialBalance` still ignores `asOfDate`/`financialYear`** — its screen ships without a date control for that reason |
| ZB-F4 | LOW | Two chart-of-accounts seed lists can drift; base seed omitted 1290/5500 | `packages/db/src/seed.ts` vs `routers/accounting.ts` | **FIXED 2026-08-17** — both codes added to the base seed; `coa-seed-parity.test.ts` pins every code a GL posting path requires |

## 4. Audit backlog — ranked by exposure × how much changed

1. **payroll-tax** — largest change since the last pass (PF composition, VPF, Para 26(6), DA, PT slabs, tax declarations, arrears), moves real money, produces statutory filings. Includes auditing `arrears.ts` + mig `0093` from scratch.
2. **money-accounting (statements)** — the AR/AP half is done; the balance sheet, P&L, trial balance and period close were not re-read today beyond the defects listed above.
3. **gst-invoicing** — AATO, B2CL threshold and the credit/debit-note FK all landed after the last pass. Quality-bar rule 10 requires tracing a **non-18%** invoice end to end into GSTR-1; also now covers `createCreditDebitNote`'s sign handling against the 4130/4140 convention, which today's audit left untraced.
4. **crm-sales** — four migrations, and `CLAUDE.md` records the deprecated-flat-twin trap silently dropping fields three separate times. Also covers the unaudited quote-PDF unit.
5. **assets-procurement-inventory** — depreciation rewritten; mig `0092` changed the idempotency key. Confirm the calendar-period guard actually prevents a triple charge.
6. **hr-people** — settlements, leave/exit rules (migs 0082-0085).
7. **data-layer-migrations** — 34 migrations, including several hand-written RLS additions.
8. **platform-superadmin** — unchanged but cross-tenant; the quality bar explicitly says do not skip it.
9. The remaining four (secrets-kms, background-automation, itsm-service, observability) — lowest change, lowest exposure.

## 5. Remediation sequence

**Now — ~~small, all inside code already open~~ ALL DONE 2026-08-17:**
1. ~~ARAP-1 invoice numbering~~ **done**.
2. ~~ARAP-2 shared transition guard~~ **done** — closed ARAP-2, 3 and 4 together, as predicted.
3. ~~Retire `/app/accounting`~~ **done** — `incomeStatement` removed with it.
4. ~~ZB-F4 parity test~~ **done** — and the underlying gap fixed, not just detected.

**Residual from this batch — one item, deliberately not fixed:**
- **`trialBalance` still ignores `asOfDate`/`financialYear`** (`routers/accounting.ts`). Honouring it
  means deriving balances from posted journal movements up to a date, the way `balanceSheet` already
  does — a real change to a money path, not a cleanup, so it belongs in the money-accounting audit
  (backlog #2) rather than riding along here. The Trial Balance screen ships without a date control
  and says so in its subtitle, so nothing on screen lies in the meantime.

**Then — the audit backlog above, in order.** Each produces its own dated report; none of them
edits this plan.

**Standing rule that came out of today's work:** the dominant defect shape in this codebase is no
longer "we didn't build it" — it is **a fix applied where the bug was reported, not across the
invariant it belongs to.** ARAP-1 was five copies of a bug already fixed in a sixth file, with a
comment describing the failure. ARAP-2 is a guard that exists on CRM deals and not on invoices. When
auditing, the highest-yield move is: **find a fix, then look for its untouched twin.**

## 6. Method and honesty notes

- This plan **re-verifies coverage**; it is not itself sixteen audits. Confidence ratings above are
  about how much the code has moved since the last real pass, not about how bad it is.
- `reports/audit-plan.md` and `reports/audit-summary.md` were **not** edited — `docs/quality-bar.md`
  rule 11 makes dated audit artefacts immutable.
- The working tree currently holds several **unrelated, uncommitted units** from a parallel session
  (payroll arrears, quote PDF, CRM page edits, migrations 0092/0093) alongside this work. They
  should be reconciled into separate commits; a blanket `git add -A` would merge them.
- Nothing in this plan has been committed or deployed.
