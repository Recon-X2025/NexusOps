# HANDOVER — full browser audit of CoheronConnect

**Written 2026-08-23. For a NEW session. Read this file first, then `ls docs/PLAN-*.md | sort | tail -1`.**

You are being handed one job: **open every page of this product in a browser,
signed in, against a tenant that has data, and report what you see — with a
screenshot of every page in your reply.** Nothing else in this file matters
more than that sentence.

---

## WHY THIS EXISTS — read this before you plan anything

The previous session audited this platform for a full day. It swept the
database, the routers, the workers, the metric registry and the workbench
payloads. It found and fixed real defects. It also **repeatedly declared
things verified that had not been opened in a browser**, and the owner then
found bugs in under a minute of clicking that the sweeps had missed:

- A React key error on the general-ledger page. Every row rendered with
  `key={undefined}`. Structural sweeps cannot see this.
- Accounts Receivable listing counterparties named "Vendor NNN Pvt Ltd",
  because customers are stored as vendor records and no vendor type means
  "customer". No query would flag it; a human reading the screen flags it
  instantly.

Both were found by the owner, not by the audit. That is the whole reason for
this handover. **A page that returns HTTP 200 is not a page that works.**

The previous session also, when asked "all 12 checked?", had to admit that
12 had been checked at the data layer and only 4 had actually been rendered.
Do not repeat that. If you have not looked at it, say you have not looked at it.

---

## THE JOB, PRECISELY

### Scope — 136 pages, none optional

| group | count | notes |
|---|---|---|
| Static `/app/*` | 102 | visit directly |
| Dynamic `/app/*` (`[id]`) | 22 | need a real record id — get one from the list page above it |
| Non-`/app` (login, portal, invite, survey) | 12 | some need a token; say so if unreachable |
| **Total** | **136** | |

The complete enumerated list is at the end of this file. Work through it in
order and tick every line. **Do not sample.**

### Method — non-negotiable

1. Sign in as a **tenant that has data**. Empty pages prove a route loads;
   they do not prove it renders rows. Thirty rows break where zero do not.
2. For each page: open it, wait for it to settle, **take a screenshot**,
   and read what is on the screen as a person would.
3. Capture, per page: console errors, failed network requests, and whether
   what is displayed makes sense for the page's title.
4. **Put every screenshot in your reply to the owner.** They asked for this
   explicitly. A summary table without images does not satisfy the request.

### What counts as a finding

Not just crashes. Report all of:

- a console error or an unhandled promise rejection
- a 404 or 5xx on any request the page makes
- a blank page, or a page that is all skeletons after loading
- **a label that does not match its content** — the AR/vendor case above
- a number that cannot be right (a negative duration, a 125% conversion,
  a total that does not match its parts)
- an empty state on a page that should have data for this tenant
- a button or link that goes nowhere
- anything you would query if you were the customer paying for this

### What does NOT count

- An empty state on the two structure-only tenants. That is correct.
- Data being obviously fake on `audit-baseline`. It is fake by design and
  now says so in its name. Report the SHAPE being wrong, not the values.

---

## ENVIRONMENT — everything you need to start

### Sign in

| | |
|---|---|
| App | `http://localhost:3000` |
| API | `http://localhost:3001` |
| Password | `demo1234!` — **the same for every account** |

**Use the tenant with data:**

```
admin@audit.test        role=owner   ← use this one; it is the only tenant with records
admin@roles.test        role=admin
```

The other two tenants are deliberately structure-only (people, roles, config; no
tickets, invoices or deals). They are for isolation testing, not for this job:

```
ceo@meridian.test       Meridian Textiles Pvt Ltd
ceo@calibre.test        Calibre Analytics LLP
```

Every matrix role also has a login on those two, as `role.name@meridian.test`
(e.g. `finance.manager@meridian.test`) — useful if you need to check what a
non-admin sees, but note the caveat below about `settings`.

### The tenants

| slug | name | data |
|---|---|---|
| `audit-baseline` | **DEMO DATA — generated, do not trust** | 400 tickets, 120 invoices, 220 deals, 200 employees, 70 work orders, 120 incidents |
| `meridian-textiles` | Meridian Textiles Pvt Ltd | 28 people, structure only |
| `calibre-analytics` | Calibre Analytics LLP | 28 people, structure only |

`audit-baseline` is ~99% generated: every row is timestamped exactly midnight
across ten months. It was renamed so nobody mistakes its figures for real ones.

### Databases

- **5434** = DEV. What the running app uses.
- **5433** = TEST. What vitest uses. Holds thousands of orgs of accumulated exhaust.

**State which port every number came from.** They are different databases.

---

## TRAPS — each of these has already cost this project real time

1. **`tsx watch` does not reliably reload the API.** If a change seems not to
   apply, restart it before concluding the code is wrong. The dev API may be
   running older code than the repo. This already produced one misleading result.
2. **`preview_start` has reported "reused" on a dead server.** Verify with
   `curl localhost:3001/health`.
3. **A page returning 200 can still be blank.** Read the rendered text, not the
   status code.
4. **Reading the DOM as text runs adjacent elements together.** The previous
   session nearly reported `Screening 867%` as a bug; a screenshot showed
   `Screening 8 67%`, correctly spaced. **Screenshot before reporting a layout
   defect.**
5. **The session drops.** A page that suddenly renders the login form has logged
   you out; sign back in rather than recording it as blank.
6. **Documents are administrator-only.** Every `documents.*` procedure is gated
   on the `settings` module, and of 27 roles only `admin` has it. A non-admin
   seeing nothing under documents is expected, not a bug.
7. **`rg` and `grep` are shell functions here, not binaries** — they do not exist
   inside `zsh script.sh`. Run searches inline.
8. **zsh does not word-split unquoted variables.** `pnpm vitest run $SPECS`
   passes the whole string as one argument and silently matches nothing.

---

## WHAT WAS DONE TODAY — so you do not re-audit it

All six items of `docs/WIRING-01.md` are closed, plus three extras. Each was
verified by a test seen to fail first.

| item | what |
|---|---|
| W1 | Daily metric snapshots — 16 of 30 metrics had no trend line because nothing recorded yesterday's figure. Migration 0100. **No backfill, deliberately.** |
| W2 | GRC controls and findings could not be created, though 40 and 30 rows existed. Added create + list paths. |
| W3 | Document permissions were written and never enforced. Now enforced: owner break-glass (audited), uploader retains, deny beats grant, rules have a validity window. Migration 0101. |
| W4 | Five metric drill-throughs pointed at pages that do not exist. Repointed + guarded in CI. |
| W5 | Expense reports — left as-is. It is a deliberate second namespace for finance integrations, not an orphan. |
| W6 | All 12 workbenches audited, with data, in a browser. |
| extra | Built `/app/admin/audit-log` — a security alert linked to it and it did not exist. |
| extra | Four more notification links pointed at non-existent pages. Fixed + guarded. |
| extra | Ledger rows keyed on a field the row does not have. |

### Three CI guards now exist for classes no other gate can see

```
pnpm check:cross-tenant        cross-tenant foreign keys in data
pnpm check:metric-links        metric drill-throughs that 404
pnpm check:notification-links  notification links that 404
```

Each refuses to report a clean result if it discovers suspiciously little —
a checker that finds nothing reports success and proves nothing.

---

## KNOWN OPEN ITEMS — do not re-discover these

1. **AR/AP counterparties.** One `vendors` table serves both customers and
   suppliers, and `vendor_type` has no "customer" value. All 30 counterparties
   are used as both. Awaiting a product decision.
2. **Approvals architecture.** Two parallel systems: five module approve buttons
   that work, and a central inbox whose Approve changes nothing. Recommendation
   made (central authoritative, per-entity handlers); owner has not decided.
3. **Documents are admin-only** — see trap 6. Per-document sharing to a
   non-admin is unreachable until that module gate is relaxed.
4. **`INTERNAL_API_TOKEN` unset in production.** Compose change committed; needs
   one line on the server. Parked by the owner.
5. **Presentation oddities** seen but not fixed: negative durations
   (`Breached -357d 11h`), and Company Secretary's "Next 60 days" calendar
   listing items 61 days past. May be artifacts of the synthetic dates.

---

## GIT STATE

```
live (deployed)   5868295
origin/main       5868295
local main        6e5df5b   ← 4 commits AHEAD, unpushed
```

Unpushed, in order:

```
0ac4b2c  feat(admin): build the audit-log page the alert was pointing at
6f3435a  fix(notifications): four more links pointed at pages that do not exist
7b2570f  feat(documents): enforce document permissions — WIRING-01 W3
6e5df5b  fix(ledger): key ledger rows on the journal line
```

**Two carry migrations (0100, 0101).** A push to `main` deploys. The owner
decides when. Do not push without being asked.

---

## HOW TO REPORT

Your reply to the owner must contain:

1. **A screenshot of every page you opened.** This was asked for explicitly.
2. A table: route · verdict · what is wrong. One line per page, all 136.
3. Findings ordered by severity, each with the screenshot that shows it.
4. **A NOT-CHECKED section.** Every page you could not reach, and why —
   needed a token, needed a record that does not exist, timed out. An empty
   NOT-CHECKED section on a 136-page sweep is not credible.

### The standard, in one line

**A claim is unverified unless you can paste the artifact that produced it.**
Reading code, tracing a call chain and matching a form to a schema are all
UNVERIFIED — say so in those words. Stop when you have RUN it, not when you
have understood it.

---

## THE 136 PAGES — tick every line

Generated from the filesystem on 2026-08-23. Regenerate with:
```bash
find apps/web/src/app -name "page.tsx" | sed "s|apps/web/src/app||;s|/page.tsx||" | sort
```

### Static `/app` — 102 pages, visit directly

```
/app
/app/admin
/app/admin/audit-log
/app/admin/custom-fields
/app/agent
/app/apm
/app/approvals
/app/attendance
/app/catalog
/app/changes
/app/changes/new
/app/cmdb
/app/command
/app/compliance
/app/contracts
/app/crm
/app/csm
/app/customer-sales
/app/dashboard
/app/developer-ops
/app/devops
/app/dpdp
/app/employee-center
/app/employee-portal
/app/escalations
/app/events
/app/expenses
/app/finance-procurement
/app/finance/accounting/balance-sheet
/app/finance/accounting/coa
/app/finance/accounting/gstin
/app/finance/accounting/gstr
/app/finance/accounting/journal
/app/finance/accounting/ledger
/app/finance/accounting/pnl
/app/finance/accounting/reconciliation
/app/finance/accounting/trial-balance
/app/finance/depreciation
/app/finance/expenses
/app/financial
/app/flows
/app/grc
/app/ham
/app/holidays
/app/hr
/app/hr/expenses
/app/it-services
/app/it-services/analytics
/app/it-services/major-incidents
/app/knowledge
/app/legal
/app/legal-governance
/app/notifications
/app/okr
/app/on-call
/app/onboarding-wizard
/app/payroll
/app/people-analytics
/app/people-workplace
/app/performance
/app/problems
/app/procurement
/app/profile
/app/projects
/app/recruitment
/app/releases
/app/reports
/app/sam
/app/secretarial
/app/security
/app/security-compliance
/app/settings/api-keys
/app/settings/approval-chains
/app/settings/integrations
/app/settings/omnichannel
/app/settings/retention
/app/settings/webhooks
/app/strategy
/app/strategy-projects
/app/surveys
/app/tickets
/app/tickets/new
/app/vendors
/app/virtual-agent
/app/walk-up
/app/work-orders
/app/work-orders/new
/app/work-orders/parts
/app/workbench/change-release
/app/workbench/company-secretary
/app/workbench/csm
/app/workbench/field-service
/app/workbench/finance-ops
/app/workbench/grc
/app/workbench/hr-ops
/app/workbench/pmo
/app/workbench/procurement
/app/workbench/recruiter
/app/workbench/secops
/app/workbench/service-desk
/app/workflows
/app/workflows/new
```

### Dynamic `/app` — 22 pages

Each needs a real record id. Get one from the list page above it — that is
also a test of the list-to-detail link, which is where the previous session
found five broken drill-throughs.

```
/app/changes/[id]
/app/cmdb/impact/[id]
/app/contracts/[id]
/app/crm/accounts/[id]
/app/crm/deals/[id]
/app/csm/[id]
/app/financial/invoices/[id]
/app/grc/[id]
/app/hr/[id]
/app/it-services/major-incidents/war-room/[ticketId]
/app/knowledge/[id]
/app/problems/[id]
/app/procurement/orders/[id]
/app/procurement/requisitions/[id]
/app/projects/[id]
/app/releases/[id]
/app/security/[id]
/app/tickets/[id]
/app/vendors/[id]
/app/work-orders/[id]
/app/workflows/[id]/edit
/app/workflows/[id]/runs/[runId]
```

### Outside `/app` — 12 pages

Some need a token (invite, survey, password reset). If you cannot reach one,
put it in NOT-CHECKED with the reason — do not silently drop it.

```
/                     <- the ROOT page (apps/web/src/app/page.tsx). It rendered as a
                      blank line when this list was generated, which is exactly how a
                      page gets silently skipped. Check where it redirects to.
/forgot-password
/invite/[token]
/login
/portal
/portal/assets
/portal/knowledge
/portal/request/new
/portal/requests
/reset-password/[token]
/signup
/survey/[token]
```

---

## FIRST FIVE MINUTES

```bash
# 1. is the app up? (a dead server can report as "reused")
curl -s localhost:3001/health && curl -s -o /dev/null -w "web %{http_code}
" localhost:3000

# 2. which tenant has data
psql "$DATABASE_URL" -c "SELECT slug, name FROM organizations ORDER BY slug;"

# 3. the guards should all be green before you start,
#    so anything you find is new rather than already known
pnpm check:cross-tenant && pnpm check:metric-links && pnpm check:notification-links
```

Then sign in as `admin@audit.test` / `demo1234!` and start at the top of
the static list.

---

_Handover written by the session of 2026-08-23. Its own failure — auditing
structurally and calling it verified — is what this document exists to stop
you repeating._
