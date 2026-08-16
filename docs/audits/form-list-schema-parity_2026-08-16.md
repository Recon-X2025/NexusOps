# Form / list / schema parity audit — 2026-08-16

**47 list screens with a create control were enumerated; `facilities` has since been removed from the
product, leaving 46. EIGHT screens have now been audited in full** (CRM Accounts, CRM Leads,
Administration → User Management, Finance → Chart of Accounts, then batch 1: facilities, GRC, CSM, HR).
**SIX carry Class A or E findings** — only Chart of Accounts and CRM Leads (post-fix) are clean.

**Worst offender by proportion: `facilities` → Buildings — five of nine columns render from fields
that do not exist, AND the form writes "Total Desks" into the `capacity` column while the list reads
`totalDesks`, so a captured, stored number displays as "—".** CRM → Accounts remains the worst by
absolute count (seven dead columns). Facilities has since been deleted end to end, so the standing
worst offender is **CRM → Accounts (fixed in Round 11)** followed by **GRC → Policies**, which renders
four columns of hardcoded zeroes as a compliance posture.

> **Coverage warning — read this first.** This document does NOT cover every screen. It covers the
> full enumeration (auditable), a mechanical sweep of the cross-cutting patterns, and a deep audit of
> **8 screens of 46**. The remainder are listed as **UNVERIFIED** with the exact method to finish
> them, and within an audited screen any sub-surface not opened is named. Nothing here is guessed:
> where a thing was not established, it says so.

Screens 1-4 verified against `d436969`, migration head `0088`. Batch 1 (screens 5-8) verified against
`fbf367b`, migration head `0089`; `facilities` was removed immediately afterwards by migration
`0090_lively_vector`.

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

# BATCH 1 (2026-08-16) — facilities · grc · csm

_Three screens audited in full depth. The batch was scoped at ten; seven were left unopened rather
than guessed (see the batch-1 coverage note below). **Correction to the priority order above: `hr`
has 79 `<th>` headers — more than `facilities` (50). The original ordering, which ranked by header
count among the screens then inspected, understated HR. HR is the highest-header surface in the
product and the module the pilot is being bought for.**_

## 5. Facilities — `/app/facilities` — **WORST OFFENDER OF THE BATCH**

Five sub-tables on one screen. **Four are correct; one is badly broken.** This split is the point:
a fast pass would have flagged all five and been wrong about four.

### 5a. Buildings — the broken one

- Headers: [facilities/page.tsx:227-235](../../apps/web/src/app/app/facilities/page.tsx#L227)
- Row cells: [facilities/page.tsx:241-270](../../apps/web/src/app/app/facilities/page.tsx#L241)
- Form state: [facilities/page.tsx:64](../../apps/web/src/app/app/facilities/page.tsx#L64)
- Mutation payload: [facilities/page.tsx:841-847](../../apps/web/src/app/app/facilities/page.tsx#L841)
- Procedure: [facilities.ts:69-77 (list, plain select)](../../apps/api/src/routers/facilities.ts#L69),
  [:89-104 (create)](../../apps/api/src/routers/facilities.ts#L89)
- Schema `buildings`: [facilities.ts:31-45](../../packages/db/src/schema/facilities.ts#L31) —
  `id, orgId, name, address, floors, capacity, status, amenities, createdAt`

| Column displayed | Cell reads | In schema? | Class |
|---|---|---|---|
| Site ID | `b.id` | ✅ (raw UUID shown as a "Site ID") | — |
| Name | `b.name` | ✅ | — |
| Address | `b.address` | ✅ | — |
| Floors | `b.floors` | ✅ | — |
| **Total Desks** | `b.totalDesks` | ❌ | **E** |
| **Occupied** | `b.occupiedDesks` | ❌ | **E** |
| **Meeting Rooms** | `b.rooms` | ❌ | **E** |
| **Data Center** | `b.datacenterFloors` | ❌ | **E** |
| **Type** | `b.badge` | ❌ | **E** |

**Five of nine columns cannot show anything.** `buildings.list` is a plain select with no join and no
aggregate — traced specifically, because CRM Accounts' Open Opps looked identical and turned out to be
buildable.

Form collects **name, address, floors, totalDesks, meetingRooms, type, isDataCenter**; the mutation
sends **name, address, floors, capacity, amenities**.
- **Class C ×3:** `meetingRooms`, `type`, `isDataCenter` are collected and never sent. The procedure
  would not accept them either.
- **The worst single defect on this screen:** the form writes **Total Desks into `capacity`**
  ([:845](../../apps/web/src/app/app/facilities/page.tsx#L845)) while the list reads `b.totalDesks`.
  The number is captured, stored, and then displayed from the wrong name — it renders "—" while
  sitting in the database. That is worse than a dead column, because the data exists.
- **Class D:** `status` and `amenities` are stored and never displayed.

### 5b–5e. Spaces, Bookings, Move Requests, Facility Requests — **all correct (Class B)**

Recorded to prove they were traced, not assumed.

| Sub-table | Fields that look foreign | Verdict |
|---|---|---|
| Spaces ([:299-308](../../apps/web/src/app/app/facilities/page.tsx#L299)) | — | Every column is a real `facility_spaces` column ([facilities.ts:48-65](../../packages/db/src/schema/facilities.ts#L48)). **Clean.** |
| Bookings ([:370-376](../../apps/web/src/app/app/facilities/page.tsx#L370)) | `spaceName`, `spaceBuilding` | **Class B** — `leftJoin(facilitySpaces)` at [facilities.ts:162-166](../../apps/api/src/routers/facilities.ts#L162). |
| Move Requests ([:431-437](../../apps/web/src/app/app/facilities/page.tsx#L431)) | `requesterName` | **Class B** — `leftJoin(users)` at [facilities.ts:229-232](../../apps/api/src/routers/facilities.ts#L229). |
| Facility Requests ([:497-504](../../apps/web/src/app/app/facilities/page.tsx#L497)) | `building`, `floor`, `submittedBy` | **Class B** — `leftJoin(facilitySpaces)` + `leftJoin(users)` at [facilities.ts:279-285](../../apps/api/src/routers/facilities.ts#L279). |

> **DECISION (2026-08-16): facilities is being REMOVED from the product**, not fixed. Four of five
> tables working correctly is the argument *for* removal, not against it: a working module nobody
> needs is one you maintain, support and audit forever. A forty-person company books rooms in
> Outlook. This audit entry is retained as the record of what was found and the justification.

## 6. GRC — `/app/grc`

### 6a. Policies — **Class A ×4, and the code says so**

- Headers: [grc/page.tsx:424-434](../../apps/web/src/app/app/grc/page.tsx#L424)
- Row cells: [grc/page.tsx:438-465](../../apps/web/src/app/app/grc/page.tsx#L438)
- Schema `policies`: [grc.ts:139-162](../../packages/db/src/schema/grc.ts#L139) —
  `id, orgId, title, content, category, version, status, ownerId, reviewCycleMonths, lastReviewed, nextReview, publishedAt, createdAt, updatedAt`

| Column displayed | Cell reads | Class |
|---|---|---|
| Policy ID | `p.id.slice(-8).toUpperCase()` | **Sweep 1** — invented identifier |
| Policy Name | `p.title` | — |
| **Owner** | `` `ID:${p.ownerId.slice(-6)}` `` | **Sweep 1** — a UUID fragment where a name belongs; no join to `users` |
| Last Review | `p.lastReviewed` | — |
| Next Review | `p.nextReview` | — |
| **Compliant** | `const compliant = 0` | **A** — hardcoded |
| **Non-Compliant** | `const nonCompliant = 0` | **A** — hardcoded |
| **Exceptions** | literal `<td>0</td>` | **A** — hardcoded |
| **Compliance %** | derived from the two hardcoded zeroes | **A** — always 0 |

The source carries the admission in a comment at
[grc/page.tsx:439](../../apps/web/src/app/app/grc/page.tsx#L439): *"DB has no compliance counters;
derive presence from status"*. Four columns present a compliance posture that is three literal zeroes.

### 6b. Risks — clean except the Owner column

Headers [grc/page.tsx:341-351](../../apps/web/src/app/app/grc/page.tsx#L341); schema `risks`
[grc.ts:103-137](../../packages/db/src/schema/grc.ts#L103). `number`, `title`, `category`,
`likelihood`, `impact`, `treatment`, `status` are all real columns. **Owner renders `r.ownerId`** — a
raw UUID, same class as the policy Owner column.

**UNVERIFIED on GRC:** the Audits and Vendor Risk tables (headers at
[:565-574](../../apps/web/src/app/app/grc/page.tsx#L565) and
[:643-652](../../apps/web/src/app/app/grc/page.tsx#L643)) were not traced to their schemas.

## 7. CSM — `/app/csm`

Two findings, both observed live on `connect.coheron.tech` first and then confirmed in source.

- **DEAD CONTROL — the Contacts "View" button has no handler at all.**
  [csm/page.tsx:405-407](../../apps/web/src/app/app/csm/page.tsx#L405) is
  `<button className="…">View</button>` with **no `onClick` attribute**. The Cases View
  ([:260](../../apps/web/src/app/app/csm/page.tsx#L260)) and Accounts View
  ([:341](../../apps/web/src/app/app/csm/page.tsx#L341)) buttons on the same page both `router.push`
  correctly — so this is one button, not a screen-wide gap.
- **REPEAT OF A FIXED DEFECT — the Seniority column.** Header
  [csm/page.tsx:389](../../apps/web/src/app/app/csm/page.tsx#L389), cell
  [:403](../../apps/web/src/app/app/csm/page.tsx#L403). `crm_contacts.seniority` is a real column, but
  the **only writer in the repo is `seed-smb-analytics.ts`** — no product path sets it. CRM Contacts
  had this exact column deleted in Round 11; **CSM has its own contacts surface and still renders it.**
  **This is the pattern worth generalising: fixing a dead column on one screen does not fix its twin
  elsewhere. Every previously-found defect needs a repo-wide repeat check, not a single-screen fix.**

**UNVERIFIED on CSM:** the Cases and Accounts tables were not traced to their schemas; only the
Contacts table and the three View buttons were established.

## 8. HR — `/app/hr` — **THE PRIORITY SCREEN**

79 `<th>` headers, the highest in the product, across **ten tab surfaces in one 3,879-line file**:
`directory`, `leave`, `cases`, `onboarding`, `offboarding`, `lifecycle`, `payroll_compliance`,
`leave_accruals`, `gratuity`, `documents` ([hr/page.tsx:2073-3145](../../apps/web/src/app/app/hr/page.tsx#L2073)).

**Opened in this pass: directory, leave, cases.** **NOT opened: onboarding, offboarding, lifecycle,
payroll_compliance, leave_accruals, gratuity, documents** — named so the remaining work is auditable.

### 8a. Directory (employees) — **CLEAN, and it nearly wasn't recorded that way**

- Headers: [hr/page.tsx:2115-2123](../../apps/web/src/app/app/hr/page.tsx#L2115) — Employee, Department,
  Title / Role, Location, Manager, Status, Joined, Actions
- Row cells: [hr/page.tsx:2132-2160](../../apps/web/src/app/app/hr/page.tsx#L2132)
- Procedure: [hr.ts:273-314](../../apps/api/src/routers/hr.ts#L273)
- Schema `employees` (**52 columns**): [hr.ts:193](../../packages/db/src/schema/hr.ts#L193)

Four fields looked like Class E on a first read — `emp.name`, `emp.employeeNumber`, `emp.jobTitle`,
`emp.email` are **not** columns on `employees`. **All four are Class B.** The procedure
`innerJoin`s `users` and explicitly aliases them at
[hr.ts:300-312](../../apps/api/src/routers/hr.ts#L300):

```ts
return { ...emp, pan: null, name: userName, email: userEmail,
         employeeNumber: emp.employeeId, jobTitle: emp.title };
```

**This is the second time in one batch that tracing overturned a Class E call** (the first was
facilities' four correctly-joined tables). A fast pass would have filed four false findings here.

**Manager** resolves properly too — `mgr.name ?? mgr.email`, falling back to a UUID tail only when the
manager is outside the loaded page ([:2130](../../apps/web/src/app/app/hr/page.tsx#L2130)).
**Class D:** of 52 employee columns, the directory displays 7. The rest (banking, PAN/Aadhaar masks,
Para 26(6) fields, tax regime, ESI, shift) are edited in the dialog but never listed — appropriate for
a directory, recorded for completeness.

### 8b. Leave — **CLEAN**

Headers [hr/page.tsx:2290-2297](../../apps/web/src/app/app/hr/page.tsx#L2290) — Employee, Type, From,
To, Days, Reason, Status, Actions. Every one maps to a real `leave_requests` column
(`employeeId, type, startDate, endDate, days, reason, status`). No phantom fields.

### 8c. Cases — **the HR finding: Class E ×2, plus a raw-UUID Assignee**

- Headers: [hr/page.tsx:2440-2451](../../apps/web/src/app/app/hr/page.tsx#L2440)
- Row cells: [hr/page.tsx:2466-2477](../../apps/web/src/app/app/hr/page.tsx#L2466)
- Procedure: [hr.ts:686-703](../../apps/api/src/routers/hr.ts#L686) — returns a joined shape
  `{ hrCase, employee, … }` with `innerJoin(employees)` + `leftJoin(onboardingDetails/offboardingDetails)`
- Schema `hr_cases`: `id, orgId, caseType, employeeId, statusId, status, assigneeId, priority, notes,
  createdAt, updatedAt` — **no `number`, no `subject`, no `sla`**

| Column | Cell reads | Class |
|---|---|---|
| **Case #** | `c.hrCase?.id?.slice(-8)?.toUpperCase()` | **Sweep 1** — `hr_cases` has **no number column**, so the truncated UUID is the only path, not a fallback. Same shape as CRM's `Lead #`. |
| Type | `c.hrCase?.caseType` | ✅ |
| **Subject** | `c.hrCase?.notes` with `[RESOLVED:…]` markers stripped by regex | **E-adjacent** — there is no `subject` column; the header promises a subject and renders the **notes body** with status markers stripped inline. |
| Employee | `c.employee?.employeeId` | ✅ **Class B** (joined) — though it shows the employee CODE, not a name, while the directory resolves names properly |
| Dept | `c.employee?.department` | ✅ **Class B** (joined) |
| State / Priority | `displayStatus`, `casePriority` | ✅ |
| **Assignee** | `c.hrCase?.assigneeId` | **raw UUID** — `users` is joined for neither assignee nor employee name. Same defect as GRC's Owner column. |
| Opened | `createdAt` | ✅ |
| **SLA** | literal `<td …>—</td>` | **A** — hardcoded em-dash, exactly the Administration → DEPARTMENT defect fixed in Round 7 |

**The SLA column is a hardcoded em-dash** — a repeat of a defect already fixed once on another screen,
which is the same pattern CSM's Seniority column shows.

### HR cross-cutting results

- **2a / 3d — deprecated procedures: NONE.** All **29** `trpc.*` call-sites on the HR surface target
  canonical nested procedures (`hr.employees.*`, `hr.cases.*`, `hr.leave.*`, `hr.onboarding.*`,
  `hr.offboarding.*`, `hr.lifecycle.*`, plus `ingest.importEmployees`, `payroll.salaryStructures.list`,
  `settlement.*`). **`grep "@deprecated" apps/api/src/routers/hr.ts` returns zero.** The CRM
  deprecated-twin pattern **does not repeat in HR** — recorded as a NOT-FOUND.
- **2b / 3c — truncated identifiers: SEVEN, not six.** Six are **last-resort fallbacks in dropdown
  option labels** ([:1224](../../apps/web/src/app/app/hr/page.tsx#L1224),
  [:1670](../../apps/web/src/app/app/hr/page.tsx#L1670),
  [:3157](../../apps/web/src/app/app/hr/page.tsx#L3157),
  [:3297](../../apps/web/src/app/app/hr/page.tsx#L3297),
  [:3538](../../apps/web/src/app/app/hr/page.tsx#L3538),
  [:3699](../../apps/web/src/app/app/hr/page.tsx#L3699)) of the form
  `e.employeeNumber ?? e.employeeId ?? e.id.slice(0,8)` — materially **less severe than GRC's**, where
  the truncation is the only thing rendered. **A seventh was missed by the standard pattern**:
  [:2130](../../apps/web/src/app/app/hr/page.tsx#L2130) uses `String(emp.managerId).slice(-8)`, which
  matches neither `.id.slice(` nor `Id.slice(`. **The sweep regex needs widening** — the count of 21
  across the batch is a floor, not a total.
- **2d / 3e — dead controls: NONE.** A JSX-aware pass over every `<button>` in the file (checking for a
  missing `onClick` *and* no `type="submit"`) returns **zero**. The CSM defect does not repeat in HR.
- **2c, 2e — UNVERIFIED** for HR (type-vs-enum drift, duplicate renderings).

## Batch 1 coverage — 3 of 10 opened, plus HR

Scoped at ten (`facilities`, `grc`, `procurement`, `legal`, `financial`, `csm`, `security`,
`tickets`, `hr`, `ham`). **Completed: facilities, grc, csm.** **Not opened: `procurement`, `legal`,
`financial`, `security`, `tickets`, `hr`, `ham`** — deliberately, rather than producing seven shallow
tables. Facilities alone took ~12 traced steps, and that depth is what distinguished its one broken
table from its four correct ones.

---

## UNVERIFIED — 40 screens not yet audited

Enumerated but not opened. Listed so coverage is auditable and the work is resumable.

`accounting` · `admin/custom-fields` · `apm` · `attendance` · `changes` · `cmdb` · `compliance` ·
`contracts` · `devops` · `dpdp` · `escalations` · `events` ·
`finance/accounting/journal` · `finance/accounting/ledger` · `finance/accounting/reconciliation` ·
`finance/expenses` · `financial` · `flows` · `ham` · `hr/expenses` · `hr` · `legal` ·
`on-call` · `payroll` · `people-analytics` · `performance` · `problems` · `procurement` · `profile` ·
`projects` · `recruitment` · `sam` · `secretarial` · `security` · `settings/api-keys` · `surveys` ·
`tickets` · `vendors` · `virtual-agent` · `work-orders` · `work-orders/parts`

_`facilities` removed from this list — the module was deleted end to end on 2026-08-16. `csm` and
`grc` removed — audited in batch 1 above._

**Method to finish one screen (~10 minutes each):**
1. `grep -n "<th>" <page>` → the displayed columns.
2. Read the row cells directly beneath → what each column actually reads.
3. Find the list's data source (`*_LIVE` mapping or the query hook) → is anything computed client-side?
4. Read the tRPC list procedure → is anything joined or aggregated? **This step is what separates
   Class B from Class E** and must not be skipped.
5. Read the backing Drizzle table → the real columns.
6. Read the create form's state object and its mutation payload → what is collected and sent.

**Priority order for the remainder**, by likely Class E density (headers far exceeding the backing
table's column count): **`hr` (79 headers)**, `procurement` (44), `legal` (38), `financial` (37),
`security` (28), `events` (27), `vendors` (22), `cmdb` (21).

> **CORRECTION (2026-08-16) — this ordering understated HR.** The original list ranked `facilities`
> (50) first and did not include `hr` at all. `hr/page.tsx` carries **79 `<th>` headers**, the highest
> in the product, across several sub-surfaces in a single 3,879-line file. It is also the module the
> pilot is being bought for. **HR is the priority screen**, not facilities — which has since been
> deleted anyway. Counts re-derived 2026-08-16: hr 79, facilities 50, grc 47, procurement 44, legal 38,
> financial 37, csm 29, security 28, ham 16, tickets 12. (`assets` does not exist as a route — the IT
> asset surface is `ham`.)

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

### Batch-1 re-count across the ten priority screens (2026-08-16)

Counted mechanically as `.id.slice(` / `.id.substring(` / `Id.slice(` / `email.split(` per file. **21
sites across five screens:**

| Screen | Sites |
|---|---|
| `grc` | **6** — incl. Policy ID `p.id.slice(-8)` and Owner `` `ID:${p.ownerId.slice(-6)}` `` |
| `hr` | **6** — not yet individually traced |
| `financial` | **4** |
| `procurement` | **3** |
| `security` | **2** |
| `facilities`, `legal`, `csm`, `tickets`, `ham` | **0** |

The `grc` Owner cases are the most misleading of the set: the column is headed **Owner** and renders a
six-character UUID fragment, not a person. `users` is never joined.

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

## Sweep 5 — dead controls, and why the obvious grep misses them

**A button with NO `onClick` attribute at all is invisible to the usual search.** The patterns a
sweep reaches for — `onClick={() => {}}`, `onClick={() => null}`, `onClick={undefined}`, `href="#"` —
return **zero hits across all ten batch-1 screens**. The CSM Contacts "View" button
([csm/page.tsx:405](../../apps/web/src/app/app/csm/page.tsx#L405)) is dead and matches none of them,
because it simply has no handler:

```tsx
<button className="text-[11px] text-primary hover:underline px-2">
  View
</button>
```

**A future dead-control sweep needs BOTH patterns:** no-op handlers *and* interactive elements with no
handler attribute. The second is the harder search — it needs a JSX-aware pass (a `<button>` with no
`onClick`, `type="submit"`, or parent `<form>`), not a regex. Until that exists, this class is found
only by clicking the product, which is how the CSM one surfaced.

**Batch-1 status:** no-op patterns — 0 across all ten. No-handler buttons — **1 confirmed (CSM
Contacts View)**; the remaining screens are **UNVERIFIED** for this pattern.

---

## NOT-FOUND

- **"`website` is not a column on `crm_accounts`"** — it **is** a real column. The Add Account form
  collects it and it is stored; the list simply never shows it. That makes it **Class D (minor)**, not
  the Class C the brief expected. The Accounts screen is still the worst offender, for the seven other
  columns.
