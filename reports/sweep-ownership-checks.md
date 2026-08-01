# Sweep — Cross-Tenant FK Ownership Checks

**Type:** Sweep, not an audit. No code changes were made.
**Question:** Which mutations accept a foreign-key ID from the caller and link to
it *without* first verifying the referenced row belongs to the caller's own
organisation?

## Why this matters (plain English)

Every request in this platform runs scoped to one organisation. A database
safety net called Row-Level Security (RLS) makes sure a request can only *read*
or *write* rows tagged with the caller's own org id.

But there is a gap RLS does **not** cover. When a row stores a pointer to another
row — an invoice pointing at a vendor, a deal pointing at an account, a ticket
pointing at an assignee — Postgres checks that the pointed-to row *exists*, but
it does **not** run that existence check through RLS. The check runs with the
table owner's full privileges. So a caller can hand the server the id of a row
belonging to a *different* company, and the pointer is accepted.

The only thing that stops this is the application code itself explicitly
re-reading the referenced row `WHERE id = <input> AND org_id = <caller's org>`
and rejecting it if nothing comes back. Where that re-read is missing, one
tenant can silently link their records to another tenant's data — see another
company's vendor name on an invoice, attach their deal to a competitor's
account, assign a ticket to a stranger, point a payroll salary structure at
another org's row. It is a data-leak / data-integrity hole, not a crash, so it
is invisible until someone goes looking.

**The single most exposed area is CRM and the "spread the whole input" pattern**
(`{ orgId, ...input }`) — it dumps every caller-supplied id straight into the row
with no per-id check. That one idiom is the root of most findings below.

---

## The correct pattern (this is what "checked" looks like)

Re-select the referenced row, scoped to the caller's org, and throw if it is not
found — *before* writing the link.

`apps/api/src/routers/assets.ts:250-260` — `linkContract` (the reference the
task named):

```ts
const [contract] = await db
  .select({ id: contracts.id })
  .from(contracts)
  .where(and(eq(contracts.id, input.contractId), eq(contracts.orgId, org!.id)));
if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found in this organisation" });
// …only now update the asset to point at contractId
```

Other correctly-checked examples (the pattern *is* present in the codebase, just
not applied consistently):

| Mutation | file:line | Notes |
|---|---|---|
| `financial.createInvoice` | financial.ts:185 | re-selects `legalEntityId` (213), `vendorId` (221), `gstinId` (229) each `AND orgId` |
| `procurement.purchaseOrders.createFromPR` | procurement.ts:508 | checks `legalEntityId` (524) and `prId` (533) — **but misses `vendorId`, see below** |
| `accounting.journal.post` | accounting.ts:327 | `and(eq(journalEntries.id, id), eq(journalEntries.orgId, org.id))` (332) |
| `assets.assign` | assets.ts:167 | re-selects the asset `AND orgId` (175) |
| `assets.softwareLicenses.revoke` | assets.ts:883 | innerJoins the parent license `AND orgId` (894) — assignments table has no orgId |
| `assets.cmdb.linkCi` | assets.ts:658 | checks both `sourceId` and `targetId` `AND orgId` |
| `inventory.valuation.setMethod` | inventory.ts:313 | re-selects `itemId AND orgId` (320) — same for issueStock/intake/reorder |
| `projects.addProjectDependency` | projects.ts:189 | checks **both** `fromProjectId` (203) and `toProjectId` (207) `AND orgId` |
| `projects.createMilestone` | projects.ts:293 | checks parent `projectId AND orgId` (301) |
| `projects.updateMilestone` | projects.ts:312 | innerJoins parent project `AND orgId` (323) |
| `hr.employees.create` | hr.ts:252 | verifies `userId` is in-org (301-308) — **but misses `managerId`/`salaryStructureId`, see below** |
| `hr.cases.triggerOnboarding` | hr.ts:551 | checks `templateId AND orgId` (559) — **but misses `employeeId`, see below** |
| `tickets.create` (partial) | tickets.ts:856 | checks `configurationItemId` (954), `knownErrorId` (963), `parentTicketId` (972) — **but misses assignee/category/priority, see below** |

The recurring theme: several handlers check *some* of the FKs they accept but not
all of them. A partial check is still a hole for the unchecked ids.

---

## Findings — unchecked caller-supplied FK ids

For each: file:line of the write, which id is unchecked, and what a caller could
link to. All referenced tables (`crm_accounts`, `crm_contacts`, `crm_deals`,
`vendors`, `legal_entities`, `chart_of_accounts`, `users`, `employees`,
`salary_structures`, `legal_matters`, etc.) are org-scoped, so every id below is
a genuine cross-tenant vector. (`users.orgId` confirmed at
`packages/db/src/schema/auth.ts:88`.)

### CRM — the canonical instances (task named contacts/deals/activities)

Root cause is the `{ orgId: org!.id, ...input }` spread, which carries the
caller's raw ids into the row untouched.

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 1 | `crm.createContact` | crm/index.ts:152 | `accountId` | another org's CRM account |
| 2 | `crm.updateContact` | crm/index.ts:161 | `accountId` (in `data`) | another org's CRM account |
| 3 | `crm.createDeal` | crm/index.ts:201 | `accountId`, `contactId` | another org's account / contact |
| 4 | `crm.createActivity` | crm/index.ts:384 | `dealId`, `accountId`, `contactId` | another org's deal / account / contact |
| 5 | `crm.updateActivity` | crm/index.ts:411 | `dealId`, `accountId`, `contactId` (in `data`) | same as above |

The own-row on updates *is* scoped (`WHERE id AND orgId`), so a caller cannot
edit another org's contact/activity — but the **new FK value they set inside it**
is never validated.

### Procurement / Finance

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 6 | `procurement.purchaseOrders.create` | procurement.ts:428, 433 | `vendorId`, `legalEntityId` | another org's vendor / legal entity (task-named PO vendorId) |
| 7 | `procurement.purchaseOrders.createFromPR` | procurement.ts:557 | `vendorId` | another org's vendor — `legalEntityId` and `prId` *are* checked here, `vendorId` slips through |
| 8 | `procurement.purchaseRequests.create` | procurement.ts:264, 265 | per-item `vendorId`, `assetTypeId` | another org's vendor / asset type on a PR line |
| 9 | `accounting.journal.create` | accounting.ts:316 | per-line `accountId` | another org's GL account — money path: posts a debit/credit against a foreign account |

### IT Assets / SAM / Inventory

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 10 | `assets.create` | assets.ts:111, 113, 120 | `typeId`, `ownerId`, `parentAssetId` | another org's asset type / user / parent asset |
| 11 | `assets.softwareLicenses.assign` | assets.ts:875, 876 | `assetId`, `userId` | another org's asset / user (parent `licenseId` *is* checked at 848) |
| 12 | `assets.sam.licenses.assign` | assets.ts:1047 | `userId` | another org's user (parent `licenseId` *is* checked at 1034) |
| 13 | `inventory.createPolicy` | inventory.ts:300 | `itemId` (via `...input`) | another org's inventory item |

### ITSM — Tickets / Work Orders

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 14 | `tickets.create` | tickets.ts:1043, 1044, 1050 | `categoryId`, `priorityId`, `assigneeId` | another org's category / priority / user (CI, known-error, parent *are* checked) |
| 15 | `tickets.update` | tickets.ts:1214 (+ assignee/priority/category in `data`) | `statusId`, `assigneeId`, `priorityId`, `categoryId` | another org's status/user/priority; note the new-status lookup at 1225 is `WHERE id` only — **no orgId** |
| 16 | `work-orders.create` | work-orders.ts:157 | `assignedToId` | another org's user |
| 17 | `work-orders.updateTask` | work-orders.ts:280 | (whole row) `assignedToId` + **the task row itself** | **worst case: `WHERE id` only, no orgId at all** — can read/modify *any* org's WO task, and set `assignedToId` to any user |
| 18 | `work-orders.addTask` | work-orders.ts:304 | `workOrderId` | attach a task to another org's work order (parent WO never verified) |
| 19 | `work-orders.addNote` | work-orders.ts:327 | `workOrderId` | post a note onto another org's work order |

### Projects

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 20 | `projects.create` | projects.ts:128 (`...rest`) | `initiativeId` | another org's strategic initiative |
| 21 | `projects.update` | projects.ts:160 (`...data`) | `initiativeId` | another org's strategic initiative |
| 22 | `projects.createTask` | projects.ts:355 (`values(input)`) | `milestoneId`, `assigneeId` | another project's milestone / another org's user (parent `projectId` *is* checked at 351) |
| 23 | `projects.updateTask` | projects.ts:374 (`...data`) | `assigneeId` | another org's user (parent project *is* checked via innerJoin at 370) |

### HR

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 24 | `hr.employees.create` | hr.ts:327, 329, 333 | `managerId`, `dottedLineManagerId`, `salaryStructureId` | another org's employee-as-manager / salary structure (`userId` *is* verified at 301) |
| 25 | `hr.employees.update` | hr.ts:364 (`...data`) | `managerId`, `dottedLineManagerId`, `salaryStructureId` | same as above |
| 26 | `hr.cases.create` | hr.ts:499 (`{ orgId, ...input }`) | `employeeId`, `assigneeId` | another org's employee / user |
| 27 | `hr.cases.triggerOnboarding` | hr.ts:568 | `employeeId` | another org's employee (`templateId` *is* checked at 559) |

### Legal

| # | Mutation | file:line | Unchecked id(s) | A caller could link to |
|---|---|---|---|---|
| 28 | `legal.createRequest` | legal.ts:215 (`{ orgId, ...input }`) | `linkedMatterId` | another org's legal matter |
| 29 | `legal.updateRequest` | legal.ts:233 (`...data`) | `linkedMatterId`, `assignedTo` | another org's matter / user |
| 30 | `legal.createInvestigation` | legal.ts:277 (`{ orgId, ...rest }`) | `linkedMatterId`, `reporterId` | another org's matter / user |
| 31 | `legal.updateInvestigation` | legal.ts:301 (`...rest`) | `linkedMatterId`, `reporterId`, `investigatorId` | another org's matter / user |

---

## Highest-severity note

**`work-orders.updateTask` (#17, work-orders.ts:266-283)** is the one that stands
apart. Every other finding scopes at least the *host* row to the caller's org and
only mis-handles the *linked-to* id. This one has **no org scoping at all** — the
update is `WHERE workOrderTasks.id = <input.id>` with no `orgId` and no parent-WO
join. A caller passing another org's task id can modify that task directly
(state, hours, work notes, assignee). It is both a cross-tenant *write* to a
foreign row and an unchecked FK on `assignedToId`.

## Root cause

Two idioms produce almost all 31 findings:

1. **`{ orgId: org!.id, ...input }` / `values(input)` spreads** — the whole
   validated input is written straight to the row. Zod validates the *shape and
   type* of each id (it is a uuid) but nothing checks *ownership*. This is the
   source of the CRM set, inventory.createPolicy, hr.cases.create, and the legal
   create/update handlers.
2. **Partial checks** — a handler carefully checks the FK it "thinks of" (the
   parent, the template, the CI) and forgets the incidental ones (assignee,
   category, salary structure). tickets.create, createFromPR, hr.employees.create
   and licenses.assign all check some and miss others.

The correct pattern exists and is used in ~a dozen places, so the fix per site is
mechanical (a scoped re-select + NOT_FOUND). There is no architectural blocker —
only inconsistent application.

## Scope / method note

Verified by direct source read of each handler body (Explore agents were used only
to inventory candidates; every file:line above was confirmed against source). This
sweep covered the CRM, procurement, financial, accounting, assets/SAM, inventory,
tickets, work-orders, projects, hr, and legal routers. `changes.ts` and `grc.ts`
were inventoried and their link-mutations (`linkIncidentToProblem`,
`addControlEvidence`) were found to check correctly. No code was changed.
