# Form / list / schema parity audit — 2026-08-16

**47 list screens with a create control were enumerated. 3 were audited in full; 1 further screen was
audited to confirm a prior fix. 2 carry Class E findings. The worst offender is CRM → Accounts, which
renders SEVEN columns from fields that exist nowhere in the schema and are computed by nothing.**

> **Coverage warning — read this first.** This document does NOT cover all 47 screens. It covers the
> full enumeration (auditable), a complete mechanical sweep of the four cross-cutting patterns, and a
> deep audit of 4 screens. The remaining 43 are listed as **UNVERIFIED** with the exact method to
> finish them. Nothing here is guessed: where a thing was not established, it says so.

Verified against `d436969` (deployed), migration head `0088`.

---

## Classification

| Class | Meaning | Severity |
|---|---|---|
| **E** | Displayed from a field that **does not exist in the schema at all** | **Worst** — the column can never show anything, and reviewers assume it can |
| **A** | Displayed, never collected, never populated → dead column | Serious |
| **B** | Displayed, not collected, but populated by a workflow/import/aggregate | **Fine — not a defect.** Recorded only to prove it was traced |
| **C** | Collected by the form but not stored | Data loss at the point of entry |
| **D** | Collected and stored but never displayed | Minor |

---

## Screens with Class E findings

### 1. CRM → Accounts — `/app/crm` (accounts tab) — **WORST OFFENDER**

- List headers: [crm/page.tsx:1158-1169](../../apps/web/src/app/app/crm/page.tsx#L1158)
- Row cells: [crm/page.tsx:1174-1200](../../apps/web/src/app/app/crm/page.tsx#L1174)
- Data source: `ACCOUNTS_LIVE` at [crm/page.tsx:539](../../apps/web/src/app/app/crm/page.tsx#L539) — the raw API rows, **no mapping, no computation**
- API: `select().from(crmAccounts)` with no join — [crm/accounts.ts:19](../../apps/api/src/routers/crm/accounts.ts#L19) and the deprecated twin at [crm/index.ts:100](../../apps/api/src/routers/crm/index.ts#L100)
- Schema: `crmAccounts` — [crm.ts](../../packages/db/src/schema/crm.ts) — `id, orgId, name, industry, tier, healthScore, annualRevenue, website, billingAddress, creditLimit, stateCode, gstin, ownerId, notes, archived, createdAt, updatedAt`

| Column displayed | Cell reads | In schema? | Class |
|---|---|---|---|
| Account Name | `a.name` | ✅ | — |
| Industry | `a.industry` | ✅ | — |
| **Type** | `a.type` | ❌ | **E** |
| Tier | `a.tier` | ✅ | — |
| **Country** | `a.country` | ❌ | **E** |
| **Employees** | `a.employees` | ❌ | **E** |
| Annual Revenue | `a.annualRevenue` | ✅ | — |
| **Open Opps** | `a.openOpps` | ❌ — no aggregate computes it | **E** |
| **Total Revenue** | `a.totalRevenue` | ❌ — no aggregate computes it | **E** |
| Health | `a.healthScore` | ✅ | — |
| **Owner** | `a.owner` | ❌ (`ownerId` exists; no join resolves a name) | **E** |
| **Last Contact** | `a.lastContact` | ❌ | **E** |

**Seven of eleven columns cannot show anything.** `Open Opps` and `Total Revenue` were traced
specifically because an aggregate would have made them Class B — there is none; the query is a plain
select with no join. This is the same class as the Campaign and USERNAME columns, at seven times the
scale, on the screen a salesperson opens first.

Add Account form collects: company name, industry, tier, website — [crm/page.tsx](../../apps/web/src/app/app/crm/page.tsx).
- **Class D:** `website` is collected and stored but never displayed in the list.
- **Class A:** `billingAddress`, `creditLimit`, `stateCode`, `gstin`, `notes` are real columns that
  the form does not collect and the list does not show. `gstin` and `stateCode` matter — they drive
  the GST place-of-supply split on invoices.

### 2. CRM → Leads — `/app/crm` (leads tab) — **fixed in Round 9a, recorded for reference**

`campaign` was rendered from a field that existed only on a web-side TS interface — Class E. Deleted
in Round 9a. The list now shows Est. Value / Expected Close / Next Action, all real columns, and
`lastActivityAt` resolved by a real aggregate (**Class B — correct, not a defect**).

---

## Screens confirmed clean (previously Class E, now fixed)

### 3. Administration → User Management — `/app/admin`

`USERNAME` (`email.split("@")[0]`) and `DEPARTMENT` (hardcoded em-dash) were both Class E. Removed in
Round 7; `Department` now reads `employees.department` through a 1:1 join — **Class B, correct**.
Guarded by `e2e/admin-user-table.spec.ts`.

### 4. Finance → Chart of Accounts — `/app/finance/accounting/coa`

Audited because Round 7 touched it. Form collects code, name, type, sub-type, opening balance,
description; all six are real columns. List shows code, name, type, sub-type, balance, status. **No
mismatch in either direction.** This is what a clean screen looks like.

---

## UNVERIFIED — 43 screens not yet audited

Enumerated but not opened. Listed so coverage is auditable and the work is resumable.

`accounting` · `admin/custom-fields` · `apm` · `attendance` · `changes` · `cmdb` · `compliance` ·
`contracts` · `csm` · `devops` · `dpdp` · `escalations` · `events` · `facilities` ·
`finance/accounting/journal` · `finance/accounting/ledger` · `finance/accounting/reconciliation` ·
`finance/expenses` · `financial` · `flows` · `grc` · `ham` · `hr/expenses` · `hr` · `legal` ·
`on-call` · `payroll` · `people-analytics` · `performance` · `problems` · `procurement` · `profile` ·
`projects` · `recruitment` · `sam` · `secretarial` · `security` · `settings/api-keys` · `surveys` ·
`tickets` · `vendors` · `virtual-agent` · `work-orders` · `work-orders/parts`

**Method to finish one screen (~10 minutes each):**
1. `grep -n "<th>" <page>` → the displayed columns.
2. Read the row cells directly beneath → what each column actually reads.
3. Find the list's data source (`*_LIVE` mapping or the query hook) → is anything computed client-side?
4. Read the tRPC list procedure → is anything joined or aggregated? **This step is what separates
   Class B from Class E** and must not be skipped.
5. Read the backing Drizzle table → the real columns.
6. Read the create form's state object and its mutation payload → what is collected and sent.

**Priority order for the remainder**, by likely Class E density (headers far exceeding the backing
table's column count): `facilities` (50 headers), `grc` (47), `procurement` (44), `legal` (38),
`financial` (37), `csm` (29), `security` (28), `events` (27), `vendors` (22), `cmdb` (21).

---

## Sweep 1 — displayed identifiers derived by truncating a field

**Round 7's list of twelve was NOT complete. 43 occurrences across 24 files match the pattern; ~20
are genuine displayed identifiers.** (The unfiltered pattern matches 155 sites, most of which are
legitimate array/date slicing — `tags.slice(0,3)`, `toISOString().slice(0,16)` — and are excluded.)

| File:line | What it invents |
|---|---|
| [financial/page.tsx:521](../../apps/web/src/app/app/financial/page.tsx#L521) | Invoice ID from `inv.id.slice(-8)` **while a real `invoiceNumber` exists and is ignored** |
| [financial/page.tsx:603](../../apps/web/src/app/app/financial/page.tsx#L603), [:684](../../apps/web/src/app/app/financial/page.tsx#L684) | `invoiceNumber ?? id.slice(0,8)` |
| [grc/page.tsx:450](../../apps/web/src/app/app/grc/page.tsx#L450), [:587](../../apps/web/src/app/app/grc/page.tsx#L587) | Audit plan / finding id from `id.slice(-8)` |
| [crm/page.tsx:552](../../apps/web/src/app/app/crm/page.tsx#L552) | `LD-${id.substring(0,6)}` |
| [vendors/page.tsx:383](../../apps/web/src/app/app/vendors/page.tsx#L383), [:384](../../apps/web/src/app/app/vendors/page.tsx#L384) | `contractNumber ?? id.slice(-10)`; `Vendor …${vendorId.slice(-6)}` |
| [employee-center/page.tsx:49](../../apps/web/src/app/app/employee-center/page.tsx#L49), [:150](../../apps/web/src/app/app/employee-center/page.tsx#L150) | **Not previously listed** — request id from `id.slice(0,10)` |
| [security/page.tsx:700](../../apps/web/src/app/app/security/page.tsx#L700), [:737](../../apps/web/src/app/app/security/page.tsx#L737), [security/[id]:175](../../apps/web/src/app/app/security/[id]/page.tsx#L175), [:535](../../apps/web/src/app/app/security/[id]/page.tsx#L535) | `INC-${id.slice(0,8)}`; CVE fallback |
| [devops/page.tsx:123](../../apps/web/src/app/app/devops/page.tsx#L123), [:151](../../apps/web/src/app/app/devops/page.tsx#L151), [:161](../../apps/web/src/app/app/devops/page.tsx#L161) | **Not previously listed** — pipeline/deployment/change number from `id.slice(0,8)` |
| [tickets/page.tsx:805](../../apps/web/src/app/app/tickets/page.tsx#L805) | **Not previously listed** — assignee initials from `assigneeId.slice(0,2)` |
| [financial/invoices/[id]:100](../../apps/web/src/app/app/financial/invoices/[id]/page.tsx#L100), [grc/[id]:102](../../apps/web/src/app/app/grc/[id]/page.tsx#L102), [changes/[id]:102](../../apps/web/src/app/app/changes/[id]/page.tsx#L102), [contracts/[id]:90](../../apps/web/src/app/app/contracts/[id]/page.tsx#L90), [:235](../../apps/web/src/app/app/contracts/[id]/page.tsx#L235) | Page-title UUID fallbacks |
| [work-orders/new:43](../../apps/web/src/app/app/work-orders/new/page.tsx#L43), [changes/new:47](../../apps/web/src/app/app/changes/new/page.tsx#L47) | Toast ids |

`devops.commit: sha.slice(0,7)` ([:132](../../apps/web/src/app/app/devops/page.tsx#L132)) is **legitimate** — a
7-char short SHA is the git convention, not an invented identifier.

Since Round 7 guaranteed the real identifiers are unique, most `?? id.slice(…)` fallbacks are now dead
code hiding a data problem: if the number is missing, that is a data defect, not a display one.

## Sweep 2 — TypeScript unions declaring values the database enum does not have

**Four found; three previously unknown.** Each lets a developer write a value the column will reject,
and makes exhaustive `switch`/config maps look complete when they are not.

| TS type | Declares but DB lacks | DB has but TS lacks |
|---|---|---|
| `LeadStatus` [crm/page.tsx:57](../../apps/web/src/app/app/crm/page.tsx#L57) | `nurturing`, `dead` | `disqualified` |
| `ActivityType` [crm/page.tsx:58](../../apps/web/src/app/app/crm/page.tsx#L58) | `task` | `note` |
| `SurveyStatus` [surveys/page.tsx:22](../../apps/web/src/app/app/surveys/page.tsx#L22) | `closed`, `scheduled` | `completed` |
| `ContractType` [contracts/page.tsx:44](../../apps/web/src/app/app/contracts/page.tsx#L44) | `customer`, `sla`, `lease`, `licensing` | `license`, `customer_agreement`, `sla_support`, `colocation`, `partnership` |

`DealStage` [crm/page.tsx:56](../../apps/web/src/app/app/crm/page.tsx#L56) matches `dealStageEnum` exactly — verified, clean.
`WOPriority` [work-orders/page.tsx:39](../../apps/web/src/app/app/work-orders/page.tsx#L39) matches — clean (fixed in Round 1).

`ContractType` is the worst: **four of nine declared values do not exist**, and five real ones are absent.

## Sweep 3 — the same value formatted two ways

There is **no shared money formatter**. Three distinct idioms are in use across 12 files:

| Idiom | Renders | Where |
|---|---|---|
| `toLocaleString("en-IN")` | `₹2,50,000` | CRM leads list, procurement, contracts |
| `(v / 1000).toFixed(0) + "K"` | `₹250K` | CRM Pipeline ([:1007](../../apps/web/src/app/app/crm/page.tsx#L1007), [:1102](../../apps/web/src/app/app/crm/page.tsx#L1102)), KPI tiles :934-936, :981, :1051, :1088 |
| `fmtInr(...)` | varies | accounting (23 uses), financial (21) |

The same 250,000 appears as `₹250K` on the Pipeline tab and `₹2,50,000` on the Leads tab of the *same
page*. A shared formatter is the fix; this audit only records it.

## Sweep 4 — the same list rendered twice in one file

| File | Duplication |
|---|---|
| [crm/page.tsx:1007](../../apps/web/src/app/app/crm/page.tsx#L1007) and [:1102](../../apps/web/src/app/app/crm/page.tsx#L1102) | Pipeline deal cards render through **two code paths**; only one is shown by default. Found in Round 9c when a test id added to the first had no effect. |
| `crm/page.tsx` (Edit Lead ×2) | **Fixed in Round 9b.** Both gated on the same state, so both rendered and stacked; they saved different field sets. |
| `apps/web/src/app/app/accounting/page.tsx` vs `finance/accounting/*` | **UNVERIFIED** — two accounting surfaces exist (one orphaned per Round 4). Whether they duplicate a list is not established. |

---

## NOT-FOUND

- **"`website` is not a column on `crm_accounts`"** — it **is** a real column. The Add Account form
  collects it and it is stored; the list simply never shows it. That makes it **Class D (minor)**, not
  the Class C the brief expected. The Accounts screen is still the worst offender, for the seven other
  columns.
