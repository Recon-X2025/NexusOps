# WIRING — 01

**Fix plan for the layer survey of 2026-08-23.** State and the general queue stay in
`docs/PLAN-*.md` (find it by rule: `ls docs/PLAN-*.md | sort | tail -1`). This file
covers one thing only: the breaks found when the product was walked from the data
layer up to the command centre, and what closing each one means.

Rolls over at 500 lines to `WIRING-02.md`, same convention as the plan.

---

## The principle this plan is built on

> "Everything needs to move up the ladder. Wiring at a grass level needs to be right
> first and the last one needs to be the platform command center."
> — owner, 2026-08-23

A record must **exist**, be **creatable**, be **readable only by its owner**, appear
on a **screen**, roll into a **role view**, and only then reach the **command
centre**. Six layers. A fault is fixed at the layer that owns it, never at the layer
where it happens to be visible.

**The corollary is the important half:** two of the three command-centre faults are
not command-centre faults. Repointing a link or synthesising a trend line at Layer 6
would be cosmetic in one case and dishonest in the other.

---

## The ladder, as measured

All figures from **5434/DEV** on 2026-08-23, each re-measured rather than carried
from an earlier note — two counts in earlier notes were wrong and are corrected here.

| Layer | What it is | State |
|---|---|---|
| 1 | Data foundation | Intact · one gap |
| 2 | Write paths | **BREAK** |
| 3 | Read paths | Intact — closed 2026-08-23 |
| 4 | Module screens | Intact · one orphan |
| 5 | Role workbenches | Present · **not audited** |
| 6 | Command centre | **BREAK** · both inherited from below |

**Layer 1** — 238 tables; 198 carry `org_id` with RLS enabled and forced; of the
other 40, 36 inherit tenancy through a parent FK, 3 are genuinely global, 1 inherits
two hops. **No daily snapshot table exists** — the two tables named `*_history` are
change logs for assets and deals, not measurements over time.

**Layer 3** — five cross-tenant reads, the FK write class, and the Temporal worker
all closed today. `pnpm check:cross-tenant` now runs in CI and fails the build on any
cross-tenant row.

**Layer 4** — 135 pages; 55 of 57 tRPC namespaces are called by the interface.

**Layer 6** — 30 metrics, all of them displayed on a dashboard. None orphaned.

---

## THE WORK — in ladder order

### W1 · Daily metric snapshot — Layer 1

**The break.** 16 of 30 metrics render a number and a flat line. Not a display bug:
there is nowhere to read yesterday's figure from. The code states the reason —
*"a point-in-time count; without a daily snapshot table there is no honest history
to backfill, so leave the series empty."*

**What closing it means.** A snapshot table carrying `org_id` and its RLS policy in
the same migration (CLAUDE.md rule), a daily job writing one row per metric per
tenant, and the resolvers reading their series from it.

**Done when:** two consecutive days of rows exist for a seeded tenant on 5434, and a
metric that previously returned `series: []` returns a two-point series — **observed,
not reasoned about.**

**Deliberately NOT in scope: backfill.** There is no historical data to derive, and
inventing one would be exactly the fabricated-figure problem the standing directive
exists to stop. Series start empty and fill from the first run forward. Say so on the
surface rather than hiding a short line.

**Blocked on:** nothing. **Shape:** migration + worker + resolver change. Largest item
here.

### W2 · GRC create paths — Layer 2

**The break.** `grc.ts` offers `createRisk`, `createPolicy`, `createAudit`,
`createVendorRisk` and `addControlEvidence` — but **no `createControl` and no
`createFinding`**. Meanwhile `risk_controls` holds 40 rows and `audit_findings` 30,
none of which the product can produce. Evidence can be attached to a control no
tenant can create.

**Done when:** a tenant creates a control and a finding through the API, both rows
carry the right `org_id`, and a second tenant cannot see or attach to either —
proven by a two-tenant test, the seeded tenants being there for exactly this.

**Also settle:** where the 40 + 30 existing rows came from. They predate this work and
are recorded in the plan as arriving from outside the repo. Leave them; do not
delete rows whose provenance is unknown.

**Blocked on:** nothing. **Shape:** two procedures plus a screen path, mirroring the
four create paths already in that router.

### W3 · Document permissions — Layer 2

**The break.** `documents.grantAcl` writes `document_acls`. **Nothing in the codebase
reads that table.** A restriction is recorded and never enforced. The write is now
tenant-scoped (`dce6ff4`), which stops it being an isolation hole but does not make
the feature real, and the call site says so.

**This is not a bug fix.** Enforcing an ACL means deciding what it overrides, how it
composes with the existing role permissions, and which read paths consult it. Those
are product semantics, not a missing predicate.

**Blocked on:** owner decision, informed by research (in progress). **Do not build
until the semantics are written down.**

**Interim honesty:** if the grant surface stays visible while unenforced, it asserts a
control that does not exist. Either the research lands quickly or the surface should
say plainly that restrictions are recorded but not yet applied.

### W4 · Five metric addresses — Layer 4

**The break.** Five financial metrics drill through to routes that do not exist:

```
financial.cash_runway_months  → /app/accounting
financial.burn_rate           → /app/accounting
financial.gross_margin        → /app/accounting
financial.ar_aged_60_plus     → /app/finance
financial.ap_aged_60_plus     → /app/finance
```

**These are wrong addresses, not missing features.** The accounting pages exist one
level deeper — `/app/finance/accounting/{pnl,balance-sheet,trial-balance,ledger,coa,
journal,reconciliation,gstr,gstin}` — and `/app/financial` exists for the ageing
figures. Each metric needs the specific page that answers *its* question; do not
point all five at one index.

**Done when:** every metric's `drillUrl` resolves to a route that exists, asserted by
a test that fails if it does not — this class recurs and a one-time correction will
rot. **Cheapest item here; do not let cheapness promote it above Layer 2.**

### W5 · Expense reports has no screen — Layer 4

**The break.** `expenseReports` is one of two tRPC namespaces no screen calls. The
other is `mac`, the platform super-admin console, which is switched off deliberately
and is not a fault.

**Done when:** either a screen calls it, or the router is removed. Under the standing
directive an unreachable capability is a gap, not a feature — but deleting working
code needs the owner's word.

**Blocked on:** owner decision — build the screen, or remove it.

### W6 · Audit the twelve workbenches — Layer 5

**Not a known break.** The 12 workbenches were **counted, not opened**. No claim is
made about whether each shows the right thing. Given that three consecutive queue
items were found wrong on inspection this week, an uninspected layer should be
treated as unknown rather than working.

**Done when:** each workbench has been opened as a role that should see it, against a
tenant with data, and what it shows has been compared to what the layer beneath
actually holds.

### Layer 6 · Nothing

**No work belongs here.** Both faults resolve from W1 and W4. Anything done at this
layer would be repointing links (W4's job) or synthesising history (which W1 exists
to make honest).

---

## Sequencing

Ladder order, with one exception argued rather than assumed:

1. **W2** — GRC create paths. Layer 2, unblocked, clean scope.
2. **W4** — the five addresses. Layer 4, but ~30 minutes and it removes visibly broken
   behaviour. Promoted only because it cannot displace anything: it blocks nothing and
   nothing blocks it.
3. **W1** — snapshot table. Layer 1, largest, unblocked.
4. **W6** — workbench audit. Cannot be scoped until it is done.
5. **W3** — document permissions. Blocked on research, then a decision.
6. **W5** — expense reports. Blocked on a decision.

---

## Owner decisions this plan is waiting on

1. **Document permissions** — what should a restriction actually do? (W3)
2. **Expense reports** — build the screen, or remove the router? (W5)
3. **Approvals architecture** — carried from `PLAN-05` item 4, unrelated to this
   survey but blocking a larger piece of work: is the central approvals inbox
   authoritative, or a read-only view over the per-module approve buttons?

---

## Standard for every item here

Same as the rest of the repo, and it is the reason this survey found what earlier
notes missed:

- **A claim is UNVERIFIED unless the artifact that produced it can be pasted.**
  Reading code and matching a call chain are UNVERIFIED — say so in those words.
- **Stop when it has been RUN, not when it is understood.**
- **Sanity-check every detector against a case that MUST be non-zero.** This survey
  produced two false results before correction: 24 of 30 metrics "on no dashboard"
  (a window that stopped before the field that says otherwise — the true figure is 0)
  and "documents has no screen" (name matching; it is wired).
- **Two tenants exist on 5434 for this purpose.** A single-tenant database cannot
  express a cross-tenant fault, and an empty dashboard there is correct rather than
  broken.

---

## RUN LOG

### 2026-08-23 — survey and plan

Walked the product from the data layer to the command centre and wrote this file.
No code changed. Findings and their evidence are recorded above; the visual form of
the same survey was published as an artifact for the owner.

**Corrected two of my own earlier figures** in the process, both from detectors that
returned confident wrong answers.
