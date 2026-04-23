# NexusOps — formal sprint records (program)

**Program:** API ↔ web alignment, payroll employee experience, finance honesty, technical debt reduction  
**Team:** Core dev + module specialists (conceptual)  
**Sprint length:** 2 weeks (assumed — adjust dates when you calendar them)

Fill in **Sprint dates** when you run planning; **Velocity** when you track points.

---

## Sprint 0 — discovery & backlog (pre–Sprint 1)

| Field | Record |
|--------|--------|
| **Outcome** | Module gap analysis (tRPC usage vs routers, `(trpc as any)`, duplicate `expenses`, payroll stub, India compliance typing, `mac` / `customFields` orphan risk). |
| **Artefacts** | Gap table by module (HR, Financial, CSM, Payroll, cross-cutting). README Quick Start hardened (migrations, secrets, parity, troubleshooting). |
| **Velocity** | — (spike / discovery) |

---

## Sprint 1 — safety net & typed client

| Field | Record |
|--------|--------|
| **Sprint goal** | No silent API drift: parity-checked procedures; eliminate `(trpc as any)` on critical paths. |
| **Dates** | _Start: _______  End: _______ |
| **Committed (plan)** | S1-1 Parity / lint guard; S1-2 India compliance typed web; S1-3 CRM/CSM typed; S1-4 Payroll expectations doc; S1-5 Expenses router spike. |
| **Completed** | **S1-1:** Second parity test — `apps/web` must not contain `(trpc as any)`. **S1-2/S1-3:** `hr`, `financial`, `csm` — `indiaCompliance`, `hr.leave`, `financial.gstFilingCalendar` / invalidation via `trpc.useUtils()`. **S1-4:** Payroll router header documents pipeline vs UI. **S1-5:** Decision: **`hr.expenses`** = web canonical; **`expensesRouter`** documented and **not** mounted on `appRouter` until a consumer exists. README **API surfaces** + local dev/troubleshooting. |
| **Not done / carry-over** | _None — optional ESLint duplicate of parity test waived (Vitest is source of truth)._ |
| **Velocity** | _Points planned: ___  Done: ___ |
| **DoD** | `pnpm check:trpc-parity` green; `turbo` build api + web green. |
| **Sprint review demo** | Show parity test output; show removal of casts in HR / Financial / CSM. |
| **Retro theme** | “Casts hid missing procedures — tests caught what types didn’t.” |

---

## Sprint 2 — single API story & platform clarity

| Field | Record |
|--------|--------|
| **Sprint goal** | One clear story per API surface; no mystery routers. |
| **Dates** | _Start: _______  End: _______ |
| **Committed (plan)** | S2-1 Expenses consolidation; S2-2 Custom fields wire or document; S2-3 `mac` document; S2-4 Search/dashboard triage. |
| **Completed** | **S2-1:** No duplicate top-level `expenses` on `appRouter`; README documents **`hr.expenses`** vs **`expensesRouter`**. **S2-2:** **Custom fields** — documented as Phase 7 API (committed scope was document-or-wire; document path satisfied). **S2-3:** **`mac`** — documented (managed endpoint / automation, not main sidebar). **S2-4:** README **API surfaces** table; search/dashboard deep work deferred to product backlog. |
| **Not done / carry-over** | _Product backlog only:_ full **custom fields admin UI**; **`mac` web entry** if product requires — out of program “committed” wording (was “if product requires”). |
| **Velocity** | _Points planned: ___  Done: ___ |
| **DoD** | README accurate; no conflicting “two expenses APIs” in navigation. |
| **Sprint review demo** | Walk README “API surfaces” table with team. |
| **Retro theme** | “Document unmounted routers instead of leaving dead `appRouter` keys.” |

---

## Sprint 3 — payroll employee path & finance honesty

| Field | Record |
|--------|--------|
| **Sprint goal** | Payslip download and honest tax/AR signals for employees and finance UI. |
| **Dates** | _Start: _______  End: _______ |
| **Committed (plan)** | S3-1 Real payroll step engine (full); S3-2 Run aggregates from engine; S3-3 Payslip PDF; S3-4 Tax preview / payslip tax enrichment. |
| **Completed** | **S3-1:** **Step engine** — `lockPeriod` → `PERIOD_LOCKED`; `advanceComputationStep` (gross → PF → ESI → PT → LWF → TDS); `computePayslips` persists **`payslips`** and sets `PAYSLIPS_GENERATED`; web **Execute** wired per step. **S3-2:** **`lockPeriod`** writes run totals from **`payroll-cycle`** (`computePayrollRunTotals`) + `payrollEmployeeCount` in workflow metadata. **S3-3:** Payslip PDF (Fastify + Next proxy). **S3-4:** **`payroll.payslips.myPayslips`** includes **`taxComputation`**; full FY in **`payroll.taxPreview`**. **Finance:** `invoices.invoice_flow` (`payable` \| `receivable`), migration `0010_invoice_flow`, **`financial.listInvoices`** filters by `direction`; AP list uses **`direction: "payable"`**; **`createInvoice`** sets `payable`. README API surfaces updated. |
| **Not done / carry-over** | _None for committed Sprint 3 plan._ Optional future: receivable **creation** UX / customer master when product defines AR. |
| **Velocity** | _Points planned: ___  Done: ___ |
| **DoD** | Builds + `pnpm check:trpc-parity` green; PDF path documented. |
| **Sprint review demo** | Full payroll run Execute path; payslip PDF; finance AP vs AR lists. |
| **Retro theme** | “Ship the real state machine before polishing edge cases.” |

---

## Sprint 4 — ITSM scale & platform hardening

| Field | Record |
|--------|--------|
| **Sprint goal** | Confidence in high-traffic paths and workflow dependencies. |
| **Dates** | _Start: _______  End: _______ |
| **Committed (plan)** | S4-1 ITSM / tickets / changes regression + RBAC checks; S4-2 Workflows + Temporal local behaviour documented; S4-3 Security/GRC sensitive mutation audit. |
| **Completed** | **S4-1:** Ticket lifecycle rules extracted to **`apps/api/src/lib/ticket-lifecycle.ts`**; **`apps/api/src/__tests__/ticket-lifecycle.test.ts`** regression pack; `tickets` router imports shared guard (RBAC unchanged — `incidents` module). **S4-2:** **`docs/TEMPORAL_LOCAL_RUNBOOK.md`** — local worker, `TEMPORAL_ADDRESS`, degraded publish when Temporal down (`workflows` router). **S4-3:** **`docs/SECURITY_SENSITIVE_MUTATIONS.md`** — inventory of write/admin `permissionProcedure` surfaces for access review. |
| **Carry-in** | None from this program increment. |
| **Velocity** | _Points planned: ___  Done: ___ |
| **DoD** | New tests green; runbook + security audit doc in `docs/`; README cross-links where relevant. |
| **Sprint review demo** | Ticket lifecycle test output; Temporal runbook excerpt; security doc table walkthrough. |
| **Retro theme** | “Small extractions + docs ship faster than monolithic hardening PRs.” |

---

## Cumulative ship list (Sprints 1–4)

- tRPC web ↔ API parity test + **ban `(trpc as any)` in `apps/web`**
- Typed **`indiaCompliance`**, **`hr.leave`**, **`financial`** invalidations
- **`hr.expenses`** as sole web expense claims surface; **`expensesRouter`** retained, unmounted, documented
- README: local dev, troubleshooting, **API surfaces** (expenses, India, mac, custom fields, payslip PDF, payroll pipeline, AP/AR)
- Payroll: **`payroll` router** — **lockPeriod + aggregates**, **advanceComputationStep**, **computePayslips**, approvals, statutory stub, **PDF**, **payslip `taxComputation`**
- Financial: **`invoice_flow`**, **`listInvoices`** direction filter, AP UI **`payable`**
- ITSM: **`ticket-lifecycle`** lib + tests; Temporal + security **docs**

---

## Program backlog (post–Sprint 4)

| Epic | Notes |
|------|-------|
| Receivable authoring | Customer / AR invoice create flows + UI when product defines model. |
| Custom fields admin | UI on `customFields` router (product). |
| `mac` web entry | If product requires sidebar / portal surfacing. |
| Payroll ESI / richer statutory | Extend `computePayslips` / engine when compliance scope grows. |

---

## How to use this file each sprint

1. At **sprint planning**: set **Dates**, copy **Committed** from backlog, estimate **Velocity**.  
2. At **sprint end**: fill **Completed**, **Not done**, actual **Velocity**, **Retro theme**.  
3. Link PRs / tickets in a column if you track in Jira/Linear (optional addendum).

---

*Maintainer: update this file at sprint boundaries so “all sprints” stay the single source of truth for release narrative.*
