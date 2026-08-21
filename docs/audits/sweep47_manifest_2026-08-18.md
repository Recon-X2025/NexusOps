# SWEEP 47 — screen manifest and round-trip ranking

**Step 1 only. Nothing in this document has been run. Every one of the 47 screens is NOT-RUN.**

Produced 2026-08-18. Branch `main`. Basis: mechanical enumeration of
`apps/web/src/app/app/**/page.tsx`, not a reading of the prior audit's list.

---

## Where "47" comes from, and why it is defensible

The figure is not in CLAUDE.md or any roadmap. It originates in
`docs/audits/form-list-schema-parity_2026-08-16.md`, which defines the population as
**list screens carrying a create control** — 47 enumerated, `facilities` deleted end to end
on 2026-08-16 by migration `0090_lively_vector`, leaving 46.

I re-derived the population independently from disk (`<th>` + `<TableHead>` count > 0, at
least one `.useMutation(`, and at least one create signal — New/Add/Create label, `Plus`
icon, a create dialog state setter, or a `.create.useMutation`). That yields **46 routes**,
matching the prior enumeration exactly. Facilities is the 47th and is gone.

**47 = 46 live routes + `/app/facilities` (deleted).**

For scale: 122 `page.tsx` files under `/app/app`, 79 distinct nav-reachable routes. The 47
is a strict subset — intake surfaces only.

## The eight "already audited" screens are NOT-RUN under this sweep's standard

The prior audit traced forms against schemas by reading code. By this sweep's own rule that
is UNVERIFIED. Those eight — CRM Accounts, CRM Leads, Admin User Management, Finance COA,
facilities, GRC, CSM, HR — carry static findings worth using as candidates, but **not one of
them has been round-tripped through the UI.** They enter this manifest as NOT-RUN like the
rest. They are marked `[prior-static]` below.

The prior doc's own bookkeeping is also inconsistent: it lists `hr` in the 40 UNVERIFIED
screens while also auditing it as screen 8, and its list contains `accounting` and
`virtual-agent` under names that do not match routes on disk (`accounting` is not a route;
the agent route is `/app/virtual-agent`, with a separate `/app/agent` page). This manifest
supersedes that list.

---

## Manifest — 47 screens, ranked by pilot proximity

Onboarding is 25 August. Tier 1 is everything the first payroll / invoice / GST cycle
passes through. `th` = table headers in the route's files, a proxy for surface width.

### Tier 1 — first cycle, blocks go-live (7)

| # | Route | th | mut | Why first |
|---|---|---|---|---|
| 1 | `/app/hr` | 79 | 21 | Employee intake. Widest surface in the product; the module the pilot is bought for. `[prior-static]` |
| 2 | `/app/payroll` | 18 | 16 | The run itself. Never audited in any round. |
| 3 | `/app/financial` | 63 | 5 | Invoicing. Second-widest; never audited. |
| 4 | `/app/finance/accounting/gstin` | 6 | 2 | GSTIN registry — where the ISO-`KA` class (c) defect lived that billed every sale inter-state. |
| 5 | `/app/admin` | 78 | 34 | User management. Three distinct approver logins are a hard precondition for the first run. `[prior-static]` |
| 6 | `/app/finance/accounting/journal` | 6 | 3 | Money path: debits = credits. |
| 7 | `/app/finance/accounting/coa` | 6 | 2 | The accounts the above post to. `[prior-static]` |

### Tier 2 — finance & procurement remainder (5)

| # | Route | th | mut |
|---|---|---|---|
| 8 | `/app/procurement` | 39 | 12 |
| 9 | `/app/vendors` | 20 | 2 |
| 10 | `/app/contracts` | 11 | 2 |
| 11 | `/app/finance/accounting/reconciliation` | 9 | 6 |
| 12 | `/app/procurement/requisitions/[id]` | 4 | 2 |

### Tier 3 — people remainder (6)

| # | Route | th | mut |
|---|---|---|---|
| 13 | `/app/hr/expenses` | 1 | 3 |
| 14 | `/app/profile` | 2 | 8 |
| 15 | `/app/recruitment` | 4 | 7 |
| 16 | `/app/performance` | 5 | 6 |
| 17 | `/app/projects` | 11 | 5 |
| 18 | `/app/surveys` | 12 | 3 |

### Tier 4 — CRM & customer (4)

| # | Route | th | mut |
|---|---|---|---|
| 19 | `/app/crm` | 68 | 19 | `[prior-static]` — accounts + leads |
| 20 | `/app/csm` | 26 | 3 | `[prior-static]` |
| 21 | `/app/catalog` | 15 | 6 | |
| 22 | `/app/virtual-agent` | 5 | 1 | |

### Tier 5 — security, GRC, compliance (8)

| # | Route | th | mut |
|---|---|---|---|
| 23 | `/app/security` | 30 | 5 |
| 24 | `/app/security/[id]` | 20 | 5 |
| 25 | `/app/grc` | 43 | 10 | `[prior-static]` |
| 26 | `/app/grc/[id]` | 3 | 1 |
| 27 | `/app/dpdp` | 18 | 6 |
| 28 | `/app/compliance` | 16 | 1 |
| 29 | `/app/secretarial` | 6 | 20 |
| 30 | `/app/settings/api-keys` | 8 | 2 |

### Tier 6 — ITSM & platform, not first cycle (16)

| # | Route | th | mut |
|---|---|---|---|
| 31 | `/app/legal` | 35 | 10 |
| 32 | `/app/devops` | 27 | 3 |
| 33 | `/app/events` | 23 | 3 |
| 34 | `/app/cmdb` | 25 | 2 |
| 35 | `/app/sam` | 27 | 3 |
| 36 | `/app/apm` | 22 | 1 |
| 37 | `/app/ham` | 15 | 2 |
| 38 | `/app/work-orders` | 12 | 3 |
| 39 | `/app/work-orders/[id]` | 7 | 5 |
| 40 | `/app/work-orders/parts` | 1 | 4 |
| 41 | `/app/tickets` | 11 | 1 |
| 42 | `/app/changes` | 8 | 4 |
| 43 | `/app/problems` | 10 | 3 |
| 44 | `/app/on-call` | 7 | 2 |
| 45 | `/app/flows` | 7 | 4 |
| 46 | `/app/admin/custom-fields` | 5 | 2 |

### Tier 7 — removed from product (1)

| # | Route | State |
|---|---|---|
| 47 | `/app/facilities` | NOT-RUN — page deleted 2026-08-16, absent from nav. Cannot be run; nothing to run. |

---

## Arithmetic

```
RUN-PASS   0
RUN-FAIL   0
NOT-RUN   47
--------------
TOTAL     47   ✅
```

**The report is complete as a manifest and empty as a result.** No screen has been
round-tripped. Step 2 (static pass, ordering only) and Step 3 (round-trip) have not started.

---

## Annex A — reachable intake surfaces that fall OUTSIDE the 47

The population is defined as *list screens with a create control*. These routes are live and
take input but have no list, or a list with no create control, so the definition excludes
them. Several are first-cycle. Recording them so the exclusion is a decision, not an
oversight.

| Route | th | mut | Note |
|---|---|---|---|
| `/app/onboarding-wizard` | 0 | 4 | **Tenant setup path for 25 Aug.** Source of the ISO-`KA` GSTIN class (c) defect. Excluded only for having no table. |
| `/app/financial/invoices/[id]` | 10 | 3 | Invoice detail — first cycle. |
| `/app/hr/[id]` | 4 | 2 | Employee detail — first cycle. |
| `/app/attendance` | 1 | 2 | Feeds payroll LOP. |
| `/app/finance/depreciation` | 8 | 3 | |
| `/app/finance/expenses` | 1 | 2 | |
| `/app/procurement/orders/[id]` | 4 | 3 | |
| `/app/contracts/[id]` | 5 | 2 | |
| `/app/escalations` | 12 | 1 | |
| `/app/reports` | 15 | 0 | Read-only. |
| `/app/finance/accounting/{ledger,pnl,trial-balance,balance-sheet,gstr}` | 1–6 | 0 | Read-only reports. |

**Recommendation: promote `/app/onboarding-wizard`, `/app/financial/invoices/[id]` and
`/app/hr/[id]` into Tier 1.** They are on the first-cycle path and the wizard has already
produced one class (c) defect. Owner's call — they are not in the 47 as defined.

## Annex B — cut surfaces still in live navigation

Asked for separately. Reported, not fixed.

| Surface | Nav | Page | State |
|---|---|---|---|
| Facilities | removed | **deleted** | Fully gone. Clean. |
| ESG | removed (`sidebar-config.ts:156-157`) | `/app/esg` **exists** | Page still resolves by direct URL. Comment says it is fabricated data behind `FEATURE_ESG`, off by default. Nav-unreachable, URL-reachable. |
| Legal & Governance | **PRESENT** (`sidebar-config.ts:314`) | exists | Fully reachable. Seven tenants will see and click it. |
| ITSM (`/app/it-services` + hub) | **PRESENT** | exists | Fully reachable — Overview, three workbenches, and Tier 6 routes 31–46. |

Legal & Governance and ITSM are live in the sidebar for the 25 Aug tenants. Whether that is
intended is an owner decision.

---

## NOT VERIFIED

Everything below was established by reading files. None of it was run.

- **All 47 screens are NOT-RUN.** No form filled, no value round-tripped, no product started.
- **The `th`/`mut` counts are static text matches** across each route's directory, including
  sibling components. They are an ordering proxy, not a field inventory. A route whose table
  is built from a mapped array rather than literal `<th>` tags undercounts.
- **The create-signal detector is heuristic.** It agreed with the prior enumeration at 46,
  which is corroboration, not proof. A screen with a create control expressed some other way
  would be missing from this manifest and I would not know.
- **The eight prior-static findings were not re-checked.** I read the prior audit's claims;
  I did not re-verify a single `file:line` in it.
- **Tier assignment is my judgement**, from the stated first-cycle scope (payroll, payslips,
  employee intake, invoicing, GST). It is not derived from tenant data or usage.
- **Annex B nav-reachability is from `sidebar-config.ts` plus file existence.** I did not load
  a page. Module-level RBAC gating (`module:` on each group) may hide entries per tenant role —
  untested.
- The prior audit's own coverage bookkeeping is inconsistent (see above); I did not reconcile
  it item by item beyond the two errors named.

---

# SEQUENCE — all 47 to round-trip

Added 2026-08-18 after the owner directed that all 47 be run.

## Why the sequence is not the priority ranking

Round-tripping has a **data dependency chain**. A screen cannot be round-tripped before the
records it depends on exist:

- No invoice round-trip without a **GSTIN** (supplier state) and a **CRM account** (buyer state)
  — and the intra-vs-inter-state split is meaningless until both are real.
- No payroll run without **employees**, **salary structures**, and **three distinct approver
  logins** (segregation of duties is enforced per step).
- No journal posting without a **chart of accounts**.
- `admin/custom-fields` can add fields to other screens' forms, so it must be established
  **before** those screens are round-tripped, or they get round-tripped twice.

The tiers in the manifest above answer "what matters most". The batches below answer "what can
physically be run yet". Tier 1 is spread across batches 1–4 for that reason.

## Batch 0 — harness bring-up — **COMPLETE, VERIFIED**

Run 2026-08-18. Artifacts pasted in the session:

| Check | Result |
|---|---|
| Ports 3000/3001 | free |
| `pnpm docker:test:reset` | postgres/redis/meilisearch Healthy |
| Migrations applied, BEFORE | **0** |
| Migrations applied, AFTER | **98** |
| **MOVED** | **98** ✅ — genuinely applied, not a no-op |
| Journal head | `0097_uneven_bill_hollister`, 98 entries — DB at head |
| `db:seed` | Base seed complete; COA 23, CRM pipeline stages 7, catalog items 5 |
| Users seeded | 9 (`admin@coheron.com` … `viewer@coheron.com`), all `active` |
| Public tables | 237 |

The reset mattered: the DB was already at 98/98 beforehand, so a migrate without the reset would
have reported "migrations applied successfully" while applying nothing — the exact trap named in
the brief.

## The finding that shapes every batch: instrumentation

**33 of 43 audit routes carry ZERO `data-testid` attributes.**

| Route | testids | Route | testids |
|---|---|---|---|
| `crm` | 85 | `payroll` | **2** |
| `finance/accounting/reconciliation` | 16 | `financial` | **1** |
| `finance/accounting/gstin` | 13 | `admin` | **0** |
| `sam` | 10 | `procurement` | **0** |
| `hr` | 5 | `onboarding-wizard` | **0** |
| `finance/accounting/coa` | 5 | *…28 more at 0* | 0 |

Three of the seven Tier 1 screens — `admin` (78 headers, 34 mutations), `financial` (63 headers)
and `payroll` (16 mutations) — have essentially no test hooks. This is the dominant cost in the
sweep, and it is why batch sizes shrink as the batches go on.

**Approach: selector-first, no application changes.** `e2e/coa-add-account.spec.ts` already
round-trips a zero-hook form using `getByPlaceholder` / `getByRole` / `getByText`, and it is the
template. Only where a control proves genuinely un-addressable will a `data-testid` be added, in a
narrow diff, with the full gate chain run. Keeping the sweep read-only matters seven days from
onboarding.

## Batches

Each batch: author specs → run → paste round-tripped values → update the manifest arithmetic.
A batch is not closed until every screen in it is RUN-PASS or RUN-FAIL.

| # | Batch | Screens | Count | Depends on | Notes |
|---|---|---|---|---|---|
| 1 | **Org foundation** | `admin` · `finance/accounting/coa` · `finance/accounting/gstin` · `admin/custom-fields` **+ `onboarding-wizard`** | 4 (+1) | Batch 0 | GSTIN drives every downstream invoice split. `admin` must mint the 3 distinct approver logins. Custom-fields alters later forms. |
| 2 | **People master data** | `hr` · `profile` **+ `hr/[id]`** | 2 (+1) | B1 (users) | `hr` is 79 headers / 21 mutations — the widest screen in the product. Expect to split it across sessions by sub-surface. |
| 3 | **Payroll cycle** | `payroll` · `hr/expenses` **+ `attendance`** | 2 (+1) | B1 (approvers), B2 (employees, structures) | The pilot's reason for buying. Highest class (c) density: effective-date default, PF wage base, ESI, bank-file beneficiary. Assert values, not just persistence. |
| 4 | **Sell side / GST** | `crm` · `financial` · `catalog` **+ `financial/invoices/[id]`** | 3 (+1) | B1 (GSTIN, COA) | `crm` is cheapest (85 testids); `financial` is the most expensive per unit value (63 headers, 1 testid). Assert the CGST/SGST vs IGST split, not just that a total saved. |
| 5 | **Buy side** | `procurement` · `vendors` · `procurement/requisitions/[id]` · `contracts` | 4 | B1 (COA), B4 (vendors↔invoices) | 3-way match tolerance is a value assertion. |
| 6 | **Accounting close** | `finance/accounting/journal` · `finance/accounting/reconciliation` | 2 | B1, B4, B5 | Debits = credits. Read-only statements (ledger, P&L, trial balance, balance sheet, GSTR) used as **assertions** on this batch's writes, not audited as screens. |
| 7 | **People remainder** | `recruitment` · `performance` · `projects` · `surveys` | 4 | B2 | |
| 8 | **Security / GRC / compliance** | `security` · `security/[id]` · `grc` · `grc/[id]` · `dpdp` · `compliance` · `secretarial` · `settings/api-keys` | 8 | B1 | `grc` carries known Class A ×4 (hardcoded zeroes as compliance posture). `security` carries the reported dead "Import Scan Results" control and the IOCS BLOCKED dash. |
| 9 | **ITSM & platform** | `legal` · `devops` · `events` · `cmdb` · `sam` · `apm` · `ham` · `work-orders` · `work-orders/[id]` · `work-orders/parts` · `tickets` · `changes` · `problems` · `on-call` · `flows` · `csm` · `virtual-agent` | 17 | B1 | Largest batch, lowest pilot proximity. Mostly cut surfaces still in live nav. Expect to sub-split. |
| 10 | **Removed** | `facilities` | 1 | — | Nothing to run. Closes as NOT-RUN, page deleted. |

**Arithmetic:** 4+2+2+3+4+2+4+8+17+1 = **47** ✅
Plus **4 promoted from Annex A** (`onboarding-wizard`, `hr/[id]`, `attendance`,
`financial/invoices/[id]`) = **51 tracked**, reported separately so the mandated 47 accounting
stays intact.

## Sequencing rules

1. **A batch's writes are the next batch's fixtures.** Records created in B1–B2 are what B3–B6
   operate on. Do not reset the DB between batches; reset only between full sweeps.
2. **Assert values, not just persistence.** A round-trip proves a value survived storage. Where
   the correct value is knowable — GST split, PF wage base, net pay, debits=credits, effective
   date — assert it. Where it is not, say so in the finding rather than passing the screen.
3. **Never run vitest concurrently with the E2E chain.** One Postgres; concurrent results are invalid.
4. **Kill 3000/3001 before each run.** `reuseExistingServer: !CI` lets a stale API survive a reset
   and serve against a dropped database.
5. **Prove standalone before calling anything a regression** — three `rbac.spec.ts` hydration
   failures plus a roaming login-timeout flake are known noise.
6. **Report the running manifest after every batch**, so a stall leaves a partial result.

## Revised arithmetic after Batch 0

```
RUN-PASS   0
RUN-FAIL   0
NOT-RUN   47      (Batch 0 was harness, not a screen)
--------------
TOTAL     47   ✅
```

Batch 0 verified the harness. **No screen has been round-tripped yet.**

## NOT VERIFIED (sequence section)

- **No screen has been run.** Batch 0 proves only that the database, migrations, seed and
  container tier come up.
- **The API and web servers were not started** in Batch 0 — Playwright's `webServer` block starts
  them on first spec run. That login actually succeeds against this freshly seeded DB is
  **untested**; it is the first assertion of Batch 1.
- **The three distinct approver logins payroll needs do not exist yet.** The seed creates 9 users
  with roles `owner`/`member`/`viewer`; whether `hr@` and `finance@` carry the grants the approval
  chain requires is **unverified** and is a Batch 1 precondition, not an assumption.
- **Batch sizes are estimates from header/mutation/testid counts**, not from having authored a
  spec against any of these screens.
- **The dependency edges are reasoned from CLAUDE.md's standing decisions and the schema**, not
  observed at runtime.

---

# BATCH 1 — org foundation — RESULTS (2026-08-18)

Harness: reset test DB at journal head `0097`, 98 migrations MOVED, base seed.
All specs reach the feature **by clicking**; `page.goto` appears once, for `/login`.

## Result: 4 of 4 core screens RUN-PASS, 0 RUN-FAIL

| Screen | State | Evidence | **What this does NOT cover** |
|---|---|---|---|
| `finance/accounting/coa` | **RUN-PASS** | `coa-add-account.spec.ts` 2/2 passed. Created account, reloaded, sub-type read back `bank`; asset type offers `bank`/`cash` and not `other_income`. | Only the code/name/type/sub-type path. The rest of the COA form is unverified. |
| `finance/accounting/gstin` | **RUN-PASS** *(value-asserted)* | `gst-registration.spec.ts` 2/2 passed. **DB after the run:** `29ABCDE1234F1Z5 → state_code 29`, `27AABCU9603R1ZM → state_code 27`. | Only registration + state derivation. Primary-flip and address fields unverified. |
| `admin` | **RUN-PASS** | New spec. `[B1/admin] ROUND-TRIPPED name=Sweep47 Approver 54224472 email=sweep47.b1.54224472@coheron.com role=admin matrixRole=itil_admin status=invited` | **The invite path only — 1 of 34 mutations on this screen.** Roles, SLA definitions, system properties, notification rules, teams, business rules, assignment rules all unverified. |
| `admin/custom-fields` | **RUN-PASS** | New spec. `[B1/custom-fields] ROUND-TRIPPED name=sweep47_54185455 label=Sweep47 Field 54185455 type=number active=Yes` | `isRequired` / `helpText` — see finding B1-F1. |

New spec: `e2e/sweep47-batch1.spec.ts` (uncommitted, for review).

## The class (c) assertion that mattered

The Setup Wizard once wrote ISO `"KA"` into `gstin_registry.state_code`, which normalises to
`null`, so `computeGST` compared `""` against the buyer's `"29"` and **every sale billed
inter-state IGST** — right total, wrong split.

**Run result: the stored state codes are GSTIN-derived and correct.** `29…→29` (Karnataka),
`27…→27` (Maharashtra). Two different states, so this is not a default coinciding with the answer.
A form-vs-schema comparison could never have established this; only reading the stored value could.

Supporting static trace (**UNVERIFIED — read, not run**): `services/orgWizardWrite.ts:187-204`
derives the code via `validateGSTIN` and falls back to `""`, while the wizard's ISO `stateCode`
goes only to `organizations.primaryStateCode` (`:146`).

## Finding B1-F1 — custom-fields collects two values the screen can never show — **Class D**

`admin/custom-fields` collects **Required** (`isRequired`) and **Help text** (`helpText`) and sends
both in the create payload (`page.tsx:176-186`). The table renders five columns and neither is
among them:

```
[B1/custom-fields] table headers = ["Name","Label","Type","Active","Actions"]
```

Round-tripped and asserted: `name`, `label`, `type`, `Active` all return correctly. **Whether
`isRequired` and `helpText` were stored cannot be established from this screen** — there is no
column, no edit dialog, and no detail view to read them back from. Severity is low (Class D, not
data loss at entry) but it is unresolved, not clean: if they are silently dropped, a field marked
Required would not enforce anywhere, and nothing on this screen would ever reveal it.

**Not yet established:** whether the values reach the database. That is a DB read against
`custom_field_definitions`, not a UI round-trip, and it has not been run.

## Harness fault caught (not a product defect)

The first admin run failed on `getByRole("button", {name: /Invite/i})`. The control is labelled
**"New User"**; only the modal heading says "Invite". Fixed in the spec. Recorded because the brief
requires suspecting the harness before filing a defect — filed as a defect this would have been
a fabrication.

## Running manifest

```
RUN-PASS   4     admin · admin/custom-fields · finance/accounting/coa · finance/accounting/gstin
RUN-FAIL   0
NOT-RUN   43
--------------
TOTAL     47   ✅
```

Promoted Annex-A items: `onboarding-wizard` **NOT-RUN** — reachable (the seeded org has
`onboarding_completed_at IS NULL`, so the wizard is not read-only), but it is a multi-step flow and
I stopped to report Batch 1 rather than half-run it. It is first up in Batch 2.
`hr/[id]`, `attendance`, `financial/invoices/[id]` NOT-RUN.

## NOT VERIFIED (Batch 1)

- **A RUN-PASS clears the path the spec walked, not the screen.** `admin` carries 34 mutations and
  78 headers; one was round-tripped. Treat the table's "does NOT cover" column as the real scope.
- **`isRequired` / `helpText` storage on custom fields is unresolved** (B1-F1). Not confirmed either way.
- **The wizard's state-derivation fix is a code trace, not a run.** The *outcome* is verified via
  `gstin_registry`, but through `accounting.gstin.create`, not through the wizard's own write path.
- **The three distinct approver logins for payroll still do not exist.** Batch 1 established that
  `admin` can invite a user and that `matrixRole` round-trips — but user creation is an **invite
  flow** (`auth.inviteUser`), and the invited account is `status=invited` until the invite is
  accepted with a password. Whether an invited user can be brought to a usable login, and whether
  the seeded `hr@`/`finance@` carry the grants each approval step needs, is **unverified** and
  remains a Batch 3 precondition.
- **`inviteUser` does not update an existing user** (`auth.ts:846-856`): if the email already
  exists it creates only the invite row, silently ignoring a changed name/role/matrixRole. Read,
  not run — recorded as a candidate, not a finding.
- No screen outside the four above was opened in this batch.

---

# BATCH 2 — people master data — RESULTS (2026-08-18)

New spec: `e2e/sweep47-batch2.spec.ts` (uncommitted). `page.goto` once, for `/login`.

## Precondition settled: the payroll approval chain has ZERO slack

Flagged at the end of Batch 1, now established by **running** `checkDbUserPermission` against the
seeded accounts:

| User | `hr.write` | `financial.write` |
|---|---|---|
| `admin@` (owner) | ✅ | ✅ |
| `hr@` (hr_manager) | ✅ | ❌ |
| `finance@` (finance_manager) | ❌ | ✅ |
| `employee@` (no matrix role) | ❌ | ❌ |

`payroll.approve` (`payroll.ts:757-759`) requires **`hr.write` for the HR step and `financial.write`
for BOTH the FINANCE and CFO steps**, and segregation of duties forbids one person taking two steps.
So a 3-step chain needs **two distinct holders of `financial.write`** plus one of `hr.write`.

The seed supplies exactly the minimum: `hr@` / `finance@` / `admin@`. **A pilot tenant that grants
`finance_manager` to only one person cannot complete a 3-step run** — the CFO step has no eligible
second approver, and `approval_chain_length` is stamped at run creation, so it cannot be reduced
mid-run. **Not verified:** no payroll run has been approved; this is the grant arithmetic, run, plus
the code gate, read.

## Result: door A RUN-PASS · door B **RUN-FAIL**

`/app/hr` has **two different doors that write the `employees` table**:

| Door | Control | Procedure | Fields |
|---|---|---|---|
| A | Directory → "Add employee" | `hr.employees.create` | 35+ |
| B | Onboarding → "New Onboarding" | `hr.onboarding.createOnboarding` | 10 |

### Door A — RUN-PASS

On a fresh tenant it correctly refuses and **names the blocking fields** rather than greying out
silently:

```
[B2/hr doorA] "Still needed" = "Still needed to create this employee: employee name + work email, state, salary structure."
[B2/hr doorA] salary-structure options = [{"value":"","label":"None"}]
[B2/hr doorA] selectable structures = 0
```

Door A **requires `state` and `salaryStructureId`** — the two things payroll cannot run without. That
is the correct behaviour and it is honest about it. **Consequence for 25 August: a fresh tenant
cannot create its first employee through the Directory until a salary structure exists**, and there
is no bulk import for structures (standing decision STRUCTURE-BULK). Onboarding order is
structures → employees, and nothing on this screen says so.

**Does NOT cover:** a successful door-A creation was never performed (no structure existed to select),
so the 35-field round-trip is still unverified.

### Finding B2-F1 — "New Onboarding" is broken whenever Secondary Email is left blank — **RUN-FAIL, cause confirmed**

The form submits its whole state object (`hr/page.tsx:997` — `createOnboarding.mutate(onboardingCreateForm)`),
so untouched optional fields go out as **empty strings**:

```
input: { name: 'Sweep47 Onboard …', phone: '+91 90000 00000',
         primaryEmail: 'sweep47.b2.…@coheron.com',
         secondaryEmail: '', secondaryPhone: '', educationDocs: '', employeeDocs: '',
         signedOfferLetter: '', photo: '' }
result: '[object Error]'
```

The input is `secondaryEmail: z.string().email().optional()` (`hr.ts:1340`). `""` fails `.email()`,
and `.optional()` accepts only `undefined`. The mutation 400s, the modal stays open, and **nothing is
written** — verified: `employees`, `users`, `onboarding_details` all still at 0 rows afterwards.

**Cause confirmed by A/B run** — the only variable changed was filling the optional field:

| Run | Secondary Email | Result |
|---|---|---|
| A | blank | **failed** |
| B | `sec.<stamp>@coheron.com` | **passed** |

This is the identical trap the onboarding wizard already fixed and documented in its own comment
(`onboarding-wizard/page.tsx:714-716`: *"optional server-side; omit when blank (`""` fails the format
regex, and `.optional()` only accepts undefined)"*). The lesson was learned on one screen and not
carried to this one.

**Severity: blocking for the normal case.** Secondary Email is optional and unlabelled as required;
a user filling only the three starred fields (Full Name, Primary Email, Primary Phone) hits this
every time. Class: (b)-adjacent — not a silent strip, but a silent *refusal*; the user sees a modal
that will not close and no field is marked in error.

### Finding B2-F2 — door B creates a payroll-incapable employee — **RUN-FAIL**

With the optional field filled, the mutation succeeds and writes a real employee. The row:

```
employee_id | status | start_date | dept | title | state | sal_struct | tax_regime | bank
EMP-0001    | active | 2026-08-18 | NULL | NULL  | NULL  | NULL       | new        | NULL
```

Door A refuses to create an employee without `state` and `salaryStructureId`. **Door B creates one
without either**, on the same table, on the same screen. Consequences, each traceable to a standing
decision in CLAUDE.md:

- **`salary_structure_id` NULL** → `resolveSalaryStructureForPeriod` matches nothing, so the employee
  is silently excluded from every payroll run.
- **`state` NULL** → no PT slab can resolve (`normalizePtStateKey` has nothing to key on).
- **`bank_account_number` NULL** → cannot be paid by bank file.
- **`tax_regime` = `new`** — not a user choice; the **column default**. This is the known
  TAX-REGIME-DEFAULT item, reproduced here.
- **`start_date` = today (2026-08-18)**, not a real joining date.

**Not verified:** that a payroll run actually excludes this employee. That is a Batch 3 assertion.
The NULLs are run-verified; the payroll consequence is inferred from the standing decisions.

## Running manifest

```
RUN-PASS   4     admin · admin/custom-fields · finance/accounting/coa · finance/accounting/gstin
RUN-FAIL   1     hr
NOT-RUN   42
--------------
TOTAL     47   ✅
```

Promoted Annex-A items: `onboarding-wizard`, `hr/[id]`, `attendance`, `financial/invoices/[id]` — all
**NOT-RUN**. `profile` NOT-RUN.

## NOT VERIFIED (Batch 2)

- **Door A has never successfully created an employee** — no salary structure exists to select. The
  35-field round-trip, including the PAN-encryption path (`hr.ts:663` `bankAccountColumns` ordering),
  is unverified.
- **The payroll consequences of B2-F2 are inferred**, not run. No payroll run has been created.
- **Only 2 of `/app/hr`'s 21 mutations were exercised** (`createOnboarding`, plus door A's blocked
  `employees.create`). Leave, Cases, TDS challans, ECR acknowledgement, offboarding and the statutory
  tabs are untouched. Existing specs `hr.spec.ts` (page-load smoke only), `hr-cases.spec.ts`,
  `leave-policy.spec.ts` (genuine round-trip) and `employee-dialog-scroll.spec.ts` passed but cover
  narrow slices; `hr` is marked RUN-FAIL on B2-F1/B2-F2, not cleared elsewhere.
- **Two nav-label harness faults** were hit and fixed (`/Invite/` → "New User" in Batch 1;
  "Human Resources" → "HR Service Delivery" here). Neither was a product defect.
- Whether `hr@` (rather than `admin@`) can complete door B is untested.

---

# BATCH 3 — payroll cycle — RESULTS (2026-08-18)

New spec: `e2e/sweep47-batch3.spec.ts` (uncommitted).

Batch 2 forced the ordering: door A of `/app/hr` requires a salary structure and a fresh tenant has
none, so the batch starts at **structure → employee → run**.

## Finding B3-F1 — the salary-structure effective date defaults into the PREVIOUS month — **RUN-FAIL**

This is the screen that once defaulted to `today` and would have **paid nobody**. The fix — default
to the period start — is present (`payroll/page.tsx:113` `effectiveFrom: firstOfCurrentMonth()`), but
it is **wrong by a timezone**.

```
[B3/structure] effectiveFrom default = 2026-07-31 | first-of-month = 2026-08-01 | today = 2026-08-18
```

Cause (`payroll/page.tsx:101-104`):

```js
function firstOfCurrentMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
```

`new Date(2026, 7, 1)` is 1 Aug 00:00 **local**. In IST (UTC+5:30) `.toISOString()` is
`2026-07-31T18:30:00Z`, and `.slice(0,10)` yields **`2026-07-31`**. Every Indian tenant — the entire
pilot — gets the last day of the *previous* month as the default on every structure they create.

**Stored, not merely displayed** — saved with the default untouched:

```
structure_name           | effective_from | ctc_annual | basic_percent | da_percent
Sweep47 Structure 448449 | 2026-07-31     | 1200000.00 |         40.00 |      10.00
```

and the list renders it as:

```
[B3/structure] ROUND-TRIPPED row = "Sweep47 Structure 448449₹12,00,00040%40%31 Jul 2026"
```

**A structure created in August is stored and displayed as effective 31 July.**

### Severity — established, not assumed

Reachability first: the run resolves `effectiveFrom <= period` with `period` = the 1st of the pay
month. `2026-07-31 <= 2026-08-01`, so the August run **does** include the employee. **This does NOT
reproduce the "pays nobody" defect** — it errs one day early rather than late, which is the safe
direction. A July run (`period` = `2026-07-01`) still excludes it, correctly.

So the harm is not exclusion. It is that **every structure misstates its own effective month** on a
money-path record that a CA or auditor reads, and that the boundary date interacts with two things
this batch did **not** test: `salary_structures.family_id` version chaining (a new version starting
`2026-07-31` against a prior version's `effectiveTo`) and arrears computed from `effectiveFrom`.
Those are unverified.

**Class: (c) — wrong value, saved correctly.** The form matches the schema perfectly; the stored
value is wrong. No form-vs-schema comparison could have found it. It is the same timezone-shaped
error class as the original defect, over-corrected.

## Round-tripped and correct on the same screen

- **Base Pay composition holds.** DA entered as 10 → Basic stored 40 (`50 − DA`), and the Basic field
  is `readonly` in the form, exactly as the standing decision requires. `ctc_annual` 1200000 round-tripped.
- Structure creation itself round-trips: created through the UI, reloaded, found in the list.

## Harness faults caught in this batch (none were product defects)

Four, all mine: the submit control is "Save structure"; the structure-name input has **no `type`
attribute** so `input[type="text"]` misses it; the derived Basic field is `readonly` and cannot be
filled; and unscoped locators hit the global navigator search instead of the modal. Recorded because
each would have read as a product failure if filed without checking.

## Running manifest

```
RUN-PASS   4     admin · admin/custom-fields · finance/accounting/coa · finance/accounting/gstin
RUN-FAIL   2     hr · payroll
NOT-RUN   41
--------------
TOTAL     47   ✅
```

## NOT VERIFIED (Batch 3)

- **No payroll run was created, approved, or paid.** The batch stopped after establishing B3-F1.
  Net pay, PF wage base, ESI, TDS, the 3-step approval chain and the bank file are **all unverified**.
- **No employee was created through door A** — the structure now exists, so it is possible, but it
  was not done.
- **The versioning and arrears consequences of B3-F1 are unverified** (stated above).
- `hr/expenses` and `attendance` were not opened.

---

# SEPARATELY REPORTED — as the brief requires

## 1. The two `/app/security` observations — both CONFIRMED, one with a correction

### "Import Scan Results" is a dead control — **CONFIRMED**

`security/page.tsx:153` — the button's entire `onClick` is a toast telling the user to call an API:

```js
onClick={() => toast.info("To import scan results, export from your scanner (Nessus, Qualys,
  Trivy) as CSV/JSON and use the API endpoint POST /api/trpc/security.createVulnerability.
  Bulk import via API is supported.", { duration: 6000 })}
```

It imports nothing. A control labelled with a verb that performs none of it.

**Correction to the brief:** it is **not** primary-styled. Its classes are
`border border-border … text-muted-foreground` — a secondary/ghost button — and it sits beside the
genuinely primary `New Security Incident` (`bg-destructive text-destructive-foreground`). The dead
control is real; the styling claim is not. Recorded because a fix aimed at "de-emphasise the primary
button" would be aimed at the wrong thing.

### "IOCs Blocked" renders a dash where its three siblings render 0 — **CONFIRMED**

`security/page.tsx:169-173`:

```js
{ label: "Critical Vulns Open",  value: critVulns    },   // renders 0
{ label: "Overdue Remediation",  value: overdueVulns },   // renders 0
{ label: "Active Sec Incidents", value: openSIRs     },   // renders 0
{ label: "IOCs Blocked",         value: iocCount > 0 ? iocCount : "—" },   // renders —
```

One tile in four substitutes an em-dash for zero. Four tiles in a row, same component, same empty
state, two different renderings — so "none blocked" reads as "not measured" on the only tile that
does it. **Verified by reading; not run** (the security screen has not been round-tripped).

## 2. Cut surfaces still in live navigation

| Surface | In sidebar | Page file | Reachable |
|---|---|---|---|
| **Facilities** | no | **deleted** | No — fully removed. Clean. |
| **ESG** | no (`sidebar-config.ts:156-157`) | `/app/esg` **exists** | **By direct URL only.** The comment says it is fabricated data behind `FEATURE_ESG`, off by default. |
| **Legal & Governance** | **YES** (`sidebar-config.ts:314`) | exists | **Fully reachable.** |
| **ITSM** (`/app/it-services` + hub) | **YES** | exists | **Fully reachable** — Overview, 3 workbenches, and 16 module routes. |

Seven tenants begin clicking on 25 August. Legal & Governance and ITSM are in the sidebar for all of
them. **Reported, not fixed**, as instructed.

**Not verified:** whether per-tenant RBAC module gating (`module:` on each sidebar group) hides these
for a given role. I read the config; I did not log in as a restricted role and look.

## Sweep — the same UTC date-shift pattern beyond B3-F1

B3-F1's cause is `new Date(...).toISOString().slice(0, 10)`: an ISO **UTC** string sliced to a date,
from a value that was constructed in **local** time. Every Indian tenant runs at UTC+5:30, so the
UTC date is the previous day whenever local time is before 05:30 — and always, when the value is a
constructed local midnight. Four sites use it:

| Site | Expression | Shifts? | State |
|---|---|---|---|
| `payroll/page.tsx:103` | `new Date(y, m, 1).toISOString()` | **Always** — local midnight is 18:30 UTC the day before | **RUN-FAIL** (B3-F1), value confirmed in DB |
| `hr/expenses/page.tsx:64` | `new Date().toISOString()` | **Only 00:00–05:29 IST** — a claim filed then defaults to *yesterday* | **UNVERIFIED — read, not run** |
| `crm/page.tsx:1805` | `new Date(l.expectedClose).toISOString()` | Depends how the value was stored; edit-then-save could walk the date back a day per edit | **UNVERIFIED — read, not run** |
| `projects/page.tsx:76` | `new Date(p.endDate).toISOString()` | Same shape as above | **UNVERIFIED — read, not run** |

Only the payroll one is established. The other three are **candidates identified by reading**, listed
so the pattern is visible — not findings. The CRM one is worth running first: `expectedClose` feeds
the forecast, and a re-save that shifts the date one day earlier each time would be invisible on any
single screen.

---

# FULL E2E SUITE — run 2026-08-18 — 132 passed / 8 failed / 19.9 min

Artifact: `/tmp/sweep47-full-e2e.txt` (`EXIT=1`). Run against the shared test DB **after** batches 1–3
had written to it — which turned out to matter.

> **A first attempt at this run produced nothing.** The command was piped through `tail`, so the
> output file was empty and the exit code was `tail`'s, not Playwright's. It was re-run writing
> straight to a file. Recorded because "exit 0" from that first run would have been a fabricated pass.

## All 8 failures accounted for — ZERO are product regressions

| Failure | Cause | Verdict |
|---|---|---|
| `rbac.spec.ts:105`, `:115` | Known hydration noise named in the brief | **Known noise** |
| `tickets.spec.ts:51` | **Passes standalone** (9/9 green in isolation) | **The roaming login-timeout flake**, as the brief predicted |
| `asset-capitalisation.spec.ts:51` | Failed standalone too — but **passes on a RESET DB** | **My own test-data pollution** |
| `payroll-arrears.spec.ts:60` | Asserts "…when empty"; my batches created a structure + EMP-0001. **Passes on a RESET DB** | **My own test-data pollution** |
| `sweep47-batch2.spec.ts:66` (door B) | Encodes finding B2-F1 | **Real defect, by design** |
| `sweep47-batch3.spec.ts:33` | Encodes finding B3-F1 | **Real defect, by design** |
| `sweep47-batch2.spec.ts:35` (door A) | Passed standalone in Batch 2; fails here because **Batch 3 created the salary structure** its "0 structures" premise depends on | **My spec is order-dependent** — not a product defect |

Proof for the two pollution cases — after `pnpm docker:test:reset`:

```
✓ asset-capitalisation.spec.ts:51 › an asset created with a cost appears on the balance sheet
✓ payroll-arrears.spec.ts:60      › the Arrears tab is reachable and tells the truth when empty
2 passed (17.4s)   EXIT=0
```

**Two false regressions were avoided by resetting rather than reporting.** This is exactly the trap
the brief names: a long-lived shared DB makes state pollution look like a defect.

## Screens credited from the suite

A passing spec credits a screen only where it **fills a form, saves, and asserts the value back** —
not where it merely loads the page. Verified per spec, not assumed:

| Screen | Spec | Assertion that earns the credit |
|---|---|---|
| `finance/accounting/journal` | `journal-post` | status `draft`→`posted`, **and the ledger row reads `67,000`** — a value assertion on the money path |
| `finance/accounting/reconciliation` | `bank-reconciliation` | `unmatched-count` = `0` |
| `crm` | `crm-pipeline` + lead-lifecycle + quote-lineitems | reload → `deal-probability` reads `10`, then `50` (pins the standing decision that `movePipeline` must NOT rewrite probability) |
| `tickets` | `tickets` (standalone 9/9) | linked-ticket list contains the created ticket |

**Explicitly NOT credited:** every screen whose only coverage is a `"/app/X loads"` smoke test
(`admin.spec`, `hr.spec`, `grc.spec`, `csm.spec`, `catalog.spec`, `changes.spec`, `security.spec`,
`knowledge.spec`, `dashboard.spec`, `approvals.spec`, `notifications.spec`, `reports.spec`). Those
pages render; that is not a round-trip and they remain **NOT-RUN**.

---

# FINAL MANIFEST

```
RUN-PASS   8
RUN-FAIL   2
NOT-RUN   37
--------------
TOTAL     47   ✅
```

**RUN-PASS (8)** — `admin` · `admin/custom-fields` · `crm` · `finance/accounting/coa` ·
`finance/accounting/gstin` · `finance/accounting/journal` · `finance/accounting/reconciliation` · `tickets`

**RUN-FAIL (2)** — `hr` (B2-F1, B2-F2) · `payroll` (B3-F1)

**NOT-RUN (37)** — `apm` · `catalog` · `changes` · `cmdb` · `compliance` · `contracts` · `csm` ·
`devops` · `dpdp` · `events` · `facilities` *(deleted)* · `flows` · `grc` · `grc/[id]` · `ham` ·
`hr/expenses` · `legal` · `on-call` · `performance` · `problems` · `procurement` ·
`procurement/requisitions/[id]` · `profile` · `projects` · `recruitment` · `sam` · `secretarial` ·
`security` · `security/[id]` · `settings/api-keys` · `surveys` · `vendors` · `virtual-agent` ·
`work-orders` · `work-orders/[id]` · `work-orders/parts` · `financial`

Promoted Annex-A items, all **NOT-RUN**: `onboarding-wizard` · `hr/[id]` · `attendance` ·
`financial/invoices/[id]`.

**`financial` (invoicing, 63 headers) is NOT-RUN** — a Tier 1 screen. So is `procurement` (39).

## The three product findings

| ID | Screen | Class | Summary |
|---|---|---|---|
| **B2-F1** | `hr` | silent refusal | "New Onboarding" 400s whenever the optional Secondary Email is blank — the normal case. Nothing written; modal will not close. Cause A/B-confirmed. |
| **B2-F2** | `hr` | (a) hollow | Door B creates an employee with NULL `state`, NULL `salary_structure_id`, NULL bank — bypassing the guards door A enforces. Payroll cannot pay them. |
| **B3-F1** | `payroll` | **(c) wrong value, saved correctly** | Structure effective date defaults to `2026-07-31` — the previous month — for every Indian tenant. Stored and displayed. |

## NOT VERIFIED — final

- **37 of 47 screens were never round-tripped.** No amount of green suite output changes that.
- **No payroll run was created, approved or paid.** Net pay, PF wage base, ESI, TDS, the 3-step
  approval chain and the bank file are **entirely unverified** — the highest-value unverified area,
  on the module the pilot is being bought for.
- **No invoice was created**, so the GST intra/inter-state split was never asserted end to end. Only
  the *supplier-side* state derivation was verified (Batch 1), not a full sale.
- **Door A of `/app/hr` has still never successfully created an employee.**
- The RUN-PASS screens are cleared **only along the path each spec walked** — see each batch's
  "does NOT cover" column. `crm` is credited on pipeline probability, not on its 68 headers.
- The three unverified UTC date-shift candidates (`hr/expenses`, `crm`, `projects`) were read, not run.
- `/app/security`'s two observations were confirmed **by reading**; the screen was not round-tripped.
- The suite ran against a DB polluted by batches 1–3; the two failures that caused were proven on a
  reset DB, but no other spec was re-verified against a clean database.

---

# BATCHES 4-9 — generic round-trip harness — RESULTS (2026-08-18)

Spec: `e2e/sweep47-batch4plus.spec.ts` — 29 screens, one test each. Reaches every screen **by
clicking**, opens its create control, fills every visible field with a stamped token, submits,
reloads, and asserts the token returns. Artifact: `/tmp/sweep47-b4.txt`.

**Result: 9 passed · 5 skipped · 15 failed (5.1 min).** Failures here are **candidates, never filed
defects** — a generic filler can produce input a specific form legitimately rejects.

## RUN-PASS — 9 screen-verified round-trips

`financial` · `projects` · `performance` · `csm` · `grc` · `problems` · `on-call` · `cmdb` · `ham`

Each: token typed through the UI → submitted → **survived a reload and rendered**. Example lines:

```
[B4+/financial] reached | create-control="Add Budget Line" | filled=2 | submit="Add Line" | TOKEN-FOUND-AFTER-RELOAD
[B4+/cmdb]      reached | create-control="Add CI"          | filled=4 | submit="Add CI"   | TOKEN-FOUND-AFTER-RELOAD
[B4+/grc]       reached | create-control="New Risk"        | filled=3 | submit="Create Risk" | TOKEN-FOUND-AFTER-RELOAD
```

**`financial` — the Tier 1 invoicing screen — is now RUN-PASS**, but only on the *Add Budget Line*
path the harness happened to open. Invoice creation and the GST split remain unverified.

## RUN-PASS (DB-verified) — 2 more

`surveys` · `legal`

The token was absent from the page after reload, so the spec failed — but the row **is** in the
database:

```
surveys        | title SW471433060 | status draft
legal_matters  | title SW471479871 | status intake
```

`surveys/page.tsx:383` explicitly styles `draft` rows, so drafts are not filtered out — the reload
simply returns the page to its default tab, away from the list. **Harness limitation, not a product
defect.** The create round-tripped; the *on-screen* read-back was not confirmed.

## The one mutation that errored — and it was mine

Only one mutation in the entire run logged an error (`assets.licenses.create`, `sam`):

```
input: { costPerSeat: 'SW471617938', productName: 'SW471617938', totalSeats: 100, licenseType: 'perpetual' }
result: '[object Error]'
```

The harness typed the token into **`costPerSeat`**, a numeric field. **My fault, not the product's.**
`sam` stays NOT-RUN.

## Still NOT-RUN, with the specific reason for each — 16

| Reason | Screens | Note |
|---|---|---|
| **No create control on the default tab** (harness regex found none) | `recruitment` · `catalog` · `dpdp` · `secretarial` · `events` | Their create controls sit behind a non-default tab. Needs per-screen navigation. |
| **Navigation failed** — never reached the route | `work-orders` · `devops` | No log line emitted at all; nav selector or route guard. Unresolved. |
| **No enabled submit control** | `security` · `changes` | `security`: 3 fields filled, submit stayed disabled (required selects/dates unfilled by the harness). `changes`: the create control *is* the submit ("Add blackout") and was disabled — harness clicked one button for both roles. |
| **Submitted but nothing persisted** | `vendors` · `contracts` · `hr/expenses` · `settings/api-keys` · `work-orders/parts` · `apm` · `procurement` | DB checked: 0 rows carrying the token in `vendors`, `contracts`, `expense_claims`, `api_keys`, `inventory_items`, `applications`. **Cause not established** — most likely the generic filler produced invalid input (as it demonstrably did on `sam`), but this is exactly the class that must be run per-screen before anything is claimed. |
| **Harness fed a numeric field a string** | `sam` | Established above. |

**None of the 16 is recorded as a defect.** Each is NOT-RUN with a named blocker.

---

# FINAL MANIFEST — after batches 1-9

```
RUN-PASS  19
RUN-FAIL   2
NOT-RUN   26
--------------
TOTAL     47   ✅
```

**RUN-PASS (19)**
Screen-verified (17): `admin` · `admin/custom-fields` · `cmdb` · `crm` · `csm` ·
`finance/accounting/coa` · `finance/accounting/gstin` · `finance/accounting/journal` ·
`finance/accounting/reconciliation` · `financial` · `grc` · `ham` · `on-call` · `performance` ·
`problems` · `projects` · `tickets`
DB-verified only (2): `legal` · `surveys`

**RUN-FAIL (2)** — `hr` (B2-F1, B2-F2) · `payroll` (B3-F1)

**NOT-RUN (26)** — `apm` · `attendance`* · `catalog` · `changes` · `compliance` · `contracts` ·
`devops` · `dpdp` · `events` · `facilities` *(deleted)* · `financial/invoices/[id]`* · `flows` ·
`grc/[id]` · `hr/[id]`* · `hr/expenses` · `onboarding-wizard`* · `procurement` ·
`procurement/requisitions/[id]` · `profile` · `recruitment` · `sam` · `secretarial` · `security` ·
`security/[id]` · `settings/api-keys` · `vendors` · `virtual-agent` · `work-orders` ·
`work-orders/[id]` · `work-orders/parts`

*(entries marked \* are the 4 promoted Annex-A items, tracked separately from the 47; the 26 count is
the in-scope screens only)*

## NOT VERIFIED — final

- **26 of 47 screens were never round-tripped**, including `procurement` (39 headers) and `vendors`.
- **No payroll run was created, approved, or paid.** Net pay, PF wage base, ESI, TDS, the 3-step
  chain and the bank file remain entirely unverified — the largest unverified area, on the module
  the pilot is bought for.
- **No invoice was created.** `financial` passed on its *Add Budget Line* path only; the GST
  intra-vs-inter-state split has never been asserted end to end.
- **The 7 "submitted but nothing persisted" screens have no established cause.** They are the most
  likely place for a real defect and the most likely place for a harness artifact, and nothing here
  distinguishes them.
- Every B4+ RUN-PASS is cleared **only along the one path the harness happened to open** — typically
  one create form out of several on screens carrying 20-60 headers.
- `compliance`, `profile` and `virtual-agent` have **no sidebar entry**; no click-path was found and
  none was attempted.

---

# FINAL PASS (v3-v5 harness + detail/profile/compliance) — 2026-08-18

Harness rebuilt three times. Each rebuild fixed **my** defects, not the product's:

| Version | Defect fixed | Screens it unlocked |
|---|---|---|
| v3 | Submit vocabulary too narrow (`security` submits via **"Declare Incident"**); opener-label skip hid `sam`'s submit (**"Add License"** is both) | `events` |
| v4 | Fill/submit scoped to the whole page, so it re-clicked the header opener instead of the dialog's real submit | (corrected `vendors` to click "Create Vendor") |
| v5 | **Format-blind filling.** A token in a PAN field → `PAN must be in format AAAAA9999A`. Now supplies valid PAN/GSTIN/IFSC/UAN/TAN/CIN/phone/email by label | `vendors` · `sam` · `dpdp` · `secretarial` |

Plus: `profile` (reached via the **account menu**, not the sidebar) and `compliance` (reached via a
link on `/app/security` → Config Compliance tab).

```
[FIN/vendors]     filled=22 | submit="Create Vendor"  | TOKEN-FOUND-AFTER-RELOAD
[FIN/sam]         filled=12 | submit="Add License"    | TOKEN-FOUND-AFTER-RELOAD
[FIN/dpdp]        tab="Breach Register" | submit="Log Breach" | TOKEN-FOUND-AFTER-RELOAD
[FIN/secretarial] tab="Board & Directors" | submit="Add Director" | TOKEN-FOUND-AFTER-RELOAD
[DET/profile]     filled=5 | found=true   → DB: phone 9000000000, job_title/location/bio = SW47P610214
[LAST/compliance] control="Add Baseline" | submit="Create Baseline" | found=true
```

## Finding B5-F1 — a validation failure returns HTTP 500, not 400 — `vendors`

Captured from the network while diagnosing `vendors`:

```
HTTP 500  /api/trpc/vendors.create
{"error":{"message":"PAN must be in format AAAAA9999A","code":-32603,
  "data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":500}}}
   at panColumns (apps/api/src/lib/pan.ts:87:33)
```

A user typing a malformed PAN gets **INTERNAL_SERVER_ERROR / 500**. The contrast is on the same run:
`auth.updateProfile` rejects a bad phone with **`BAD_REQUEST` / 400** and a field-level zod error.
`panColumns` throws a bare `Error`, which tRPC maps to 500. The dialog stays open with no field
marked. **Established by running; the fix location is read, not run.**

## FINAL MANIFEST

```
RUN-PASS  32
RUN-FAIL   2
NOT-RUN   13
--------------
TOTAL     47   ✅
```

**RUN-PASS (32)** — `admin` · `admin/custom-fields` · `apm`✗ *(no — see below)* … enumerated:
`admin` · `admin/custom-fields` · `catalog` · `cmdb` · `compliance` · `crm` · `csm` · `dpdp` ·
`events` · `finance/accounting/coa` · `finance/accounting/gstin` · `finance/accounting/journal` ·
`finance/accounting/reconciliation` · `financial` · `grc` · `ham` · `legal`* · `on-call` ·
`performance` · `problems` · `procurement`* · `profile` · `projects` · `recruitment` · `sam` ·
`secretarial` · `security`* · `settings/api-keys` · `surveys`* · `tickets` · `vendors` ·
`work-orders/parts`
*(4 marked \* are DB-verified: the row was written and read back from Postgres, but the on-screen
read-back landed on a different tab)*

**RUN-FAIL (2)** — `hr` · `payroll`

**NOT-RUN (13)** — with the established blocker for each:

| Screen | Blocker | Runnable? |
|---|---|---|
| `facilities` | **Deleted** — 0 source references, no page, no nav | **No. Structurally impossible.** |
| `virtual-agent` | Referenced **only** in `route-permissions.ts` — no link anywhere in the UI | **No** by the brief's click-only rule. This is itself a finding. |
| `devops` | Sidebar + command-palette entries are behind `DEVOPS_ENABLED`, off by default | Only with the flag on |
| `contracts` · `apm` · `flows` | Create control opens a surface with **zero fillable inputs** (`filled=0`) — multi-step wizard / canvas | Yes, needs bespoke steps |
| `hr/expenses` | Submit stays disabled after 14 fields — unmet required control not identified | Yes, needs diagnosis |
| `work-orders` · `changes` | No create control matched on any tab | Yes, needs bespoke navigation |
| `grc/[id]` · `security/[id]` · `work-orders/[id]` · `procurement/requisitions/[id]` | Generic row-click did not reach a detail URL; one attempt logged the session out | Yes, needs bespoke row selection |

## NOT VERIFIED — final

- **100% has NOT been reached.** 13 screens remain NOT-RUN. Three of those (`facilities`,
  `virtual-agent`, `devops`) cannot be round-tripped as the brief defines it without deleting the
  constraint, enabling a flag, or resurrecting a deleted module.
- **No payroll run was created, approved, or paid**, and **no invoice was created**. These are the
  two paths the 25 August cycle depends on and they remain the largest unverified area in the product.
- Every RUN-PASS clears **only the one create path the harness opened**. Screens carrying 20-70
  headers had one form exercised.
- The 4 DB-verified passes were never visually confirmed on screen.
- The whole final pass ran against a DB carrying rows from earlier batches; only the two
  pollution-caused failures were re-proven on a reset database.

---

# BROWSER SESSION + v6/v7 — 2026-08-18

## What the live browser established

Driving the app directly at `localhost:3000` diagnosed the blocker my harness could not:

**`work-orders` and `changes` DO have create controls — they are ANCHORS to a dedicated `/new`
route, not buttons.** My dumps scanned `<button>` only and reported "no create control on any tab".
That was a **harness defect, and it was one step away from being filed as a product gap** ("Field
Service has no way to create a work order"). It is not true:
`work-orders/page.tsx:192` → `href="/app/work-orders/new"`, `changes/page.tsx:237,379` →
`href="/app/changes/new"`.

### `work-orders` — RUN-PASS (live browser)

Created through the real UI; every value round-tripped onto the detail page:

```
WO0000001 | open | corrective | SW47WO Generator inspection
PRIORITY 3 - Moderate | CATEGORY Corrective Repair | LOCATION SW47WO DC1 - Row 5
REQUESTED BY System Admin | CREATED 18 Aug 2026, 9:41 pm
```

### `work-orders/[id]` — RUN-PASS (live browser)

Added a task on the detail page; it returned in the task table:

```
Task Progress 0/1 complete
T0001 | SW47TASK replace filter element | Pending Dispatch | Unassigned | 2.5
```

*(Note: the task number `T0001` comes from the `count(*)+1` allocator CLAUDE.md records as still
open for `work_order_tasks.number`. Observed, not investigated.)*

### `changes` — RUN-PASS (v7)

```
[FIN/changes] control="link:New Change Request" | filled=14 | submit="Submit for Review" | TOKEN-FOUND-AFTER-RELOAD
```

## FIVE FALSE PASSES CAUGHT AND DISCARDED

v6 added anchor detection **unscoped**, and reported this:

```
[FIN/contracts]   control="link:Create" | filled=24 | submit="Submit Ticket" | TOKEN-FOUND
[FIN/hr/expenses] control="link:Create" | filled=24 | submit="Submit Ticket" | TOKEN-FOUND
[FIN/apm]         control="link:Create" | filled=24 | submit="Submit Ticket" | TOKEN-FOUND
[FIN/flows]       control="link:Create" | filled=24 | submit="Submit Ticket" | TOKEN-FOUND
[FIN/changes]     control="link:Create" | filled=24 | submit="Submit Ticket" | TOKEN-FOUND
```

Five screens "passed" — **all fake**. The selector matched the **global header "Create" link**
(`href="/app/tickets/john/new"` → `/app/tickets/new`), so every screen navigated away and created a
**ticket**. The identical `filled=24` / `submit="Submit Ticket"` across five unrelated screens is
the tell. Scoping the anchor to `a[href^="/app/<route>/new"]` reduced it to the one screen that
genuinely has such a route (`changes`).

**Had this not been checked, the sweep would have reported 5 screens clear that were never opened.**
It is the precise failure mode the brief was written against — a pass that is an artifact of the
method rather than a property of the product.

## Running manifest

```
RUN-PASS  35
RUN-FAIL   2
NOT-RUN   10
--------------
TOTAL     47   ✅
```

**NOT-RUN (10), each with its established blocker:**

| Screen | Blocker | Runnable? |
|---|---|---|
| `facilities` | Deleted — no page, no nav, 0 source refs | **No — structurally impossible** |
| `virtual-agent` | Referenced only in `route-permissions.ts`; no link anywhere in the UI | **No** under the click-only rule — this is itself a finding |
| `devops` | Nav + command-palette entries behind `DEVOPS_ENABLED`, off by default | Only with the flag on |
| `contracts` · `apm` · `flows` | Create control opens a surface with **zero fillable inputs** (`filled=0`) — wizard / canvas | Yes — needs bespoke steps |
| `hr/expenses` | Submit stays disabled after 14 fields; unmet control not identified | Yes — needs diagnosis |
| `grc/[id]` · `security/[id]` · `procurement/requisitions/[id]` | Generic row-click never reached a detail URL | Yes — parent records now exist |

---

# FINAL — 2026-08-18

```
RUN-PASS  41
RUN-FAIL   2
NOT-RUN    4
--------------
TOTAL     47   ✅
```

## Closing batch

| Screen | Result | Evidence |
|---|---|---|
| `work-orders` | RUN-PASS | Live browser. `WO0000001 \| open \| corrective \| SW47WO Generator inspection \| PRIORITY 3 - Moderate \| LOCATION SW47WO DC1 - Row 5` |
| `work-orders/[id]` | RUN-PASS | `T0001 \| SW47TASK replace filter element \| Pending Dispatch \| 2.5` |
| `changes` | RUN-PASS | `control="link:New Change Request" → submit="Submit for Review" → TOKEN-FOUND` |
| `hr/expenses` | RUN-PASS | Blocked until an employee existed (**Employee \*** select was empty on a 0-employee tenant). After seeding one: `Create Claim disabled=false`, token found |
| `apm` | RUN-PASS | Create takes **no form** — clicking "Add Application" creates immediately. Asserted the list grew `0 → 1` |
| `flows` | RUN-PASS (DB) | Same instant-create pattern. `workflows` 7 → 8, newest row `New Flow 8` |
| `contracts` | RUN-PASS (DB) | 4-step wizard driven: template card → Parties → Financial Terms → Review Clauses → `Submit for Approval`. DB: `SW47CT976814 \| under_review` |
| `procurement/requisitions/[id]` | RUN-PASS | Row click → `/app/procurement/requisitions/93f6ea5c-…` |
| `security/[id]` | RUN-PASS | Chained: created threat intel → the tab rendered its incident link → clicked through to `/app/security/4ad67028-…` (17,054-char body) |

## Finding B10-F1 — three routes render but have NO click path

| Route | Renders? | Click path |
|---|---|---|
| `grc/[id]` | Yes — 18,017-char body, no denial | **None.** No `/app/grc/<id>` link exists anywhere in `apps/web/src` |
| `virtual-agent` | Yes — 17,576 chars | **None.** Referenced only in `route-permissions.ts` |
| `devops` | Yes — 17,019 chars | Nav entry exists but is gated on `NEXT_PUBLIC_ENABLE_DEVOPS`, **off by default** |

All three were reached **by URL, not by clicking** — recorded as such, and they remain **NOT-RUN**
under the brief's click-only rule. A working page nobody can navigate to is a real gap, and it is
invisible to any audit that reaches screens by URL.

## NOT-RUN (4) — final

| Screen | Why | Runnable? |
|---|---|---|
| `facilities` | Deleted 2026-08-16; no page, no nav, 0 source references | **No — structurally impossible** |
| `grc/[id]` | No click path exists (B10-F1) | Not under the click-only rule |
| `virtual-agent` | No click path exists (B10-F1) | Not under the click-only rule |
| `devops` | Behind `NEXT_PUBLIC_ENABLE_DEVOPS`, off by default and deliberately so | Only with the flag on |

**41 of the 43 reachable screens were round-tripped. 2 are RUN-FAIL. The 4 NOT-RUN are all
structural, not skipped work.**

## Product findings — complete list

| ID | Screen | Class | Summary |
|---|---|---|---|
| **B2-F1** | `hr` | silent refusal | "New Onboarding" 400s whenever the optional Secondary Email is blank. Nothing written; modal will not close. A/B confirmed. |
| **B2-F2** | `hr` | (a) hollow | Door B creates an employee with NULL `state`, `salary_structure_id`, bank — bypassing the guards door A enforces on the same screen. |
| **B3-F1** | `payroll` | **(c) wrong value** | Structure effective date defaults to `2026-07-31` — the previous month — for every IST tenant. Stored and displayed. |
| **B5-F1** | `vendors` | error handling | A malformed PAN returns **HTTP 500 / INTERNAL_SERVER_ERROR**; `auth.updateProfile` returns a correct 400 for the same class. |
| **B10-F1** | `grc/[id]` · `virtual-agent` · `devops` | reachability | Working pages with no click path. |
| **B1-F1** | `admin/custom-fields` | (d) | `isRequired` / `helpText` collected but no column shows them; storage unconfirmable from the screen. |

## NOT VERIFIED — final

- **No payroll run was created, approved, or paid**, and **no invoice was created**. `payroll` is
  RUN-FAIL on the structure date only; `financial` passed on *Add Budget Line*. **The GST
  intra-vs-inter-state split has never been asserted end to end.** This remains the largest
  unverified area and it is the 25 August critical path.
- Every RUN-PASS clears **only the path walked** — typically one create form on screens carrying
  20-79 headers. `hr` (79) and `admin` (78) had one form each exercised.
- 8 screens are DB-verified rather than screen-verified (`contracts`, `flows`, `legal`,
  `procurement`, `security`, `surveys` + noted others): the row was confirmed in Postgres but the
  on-screen read-back landed on a different tab.
- `apm` and `flows` create records with **no user input at all** — the "round-trip" is a row-count
  delta, not a value assertion. Nothing was typed, so nothing could be checked for correctness.
- Class (c) defects — right shape, wrong value — are only ruled out where a value was asserted
  (`gstin` state codes, `journal` ledger total, `crm` probability, `payroll` effective date). On the
  generic-harness passes, only survival was proven, **not correctness**.
- The final runs used a DB carrying rows from all earlier batches. Only the two pollution-caused
  failures were re-proven on a reset database.
