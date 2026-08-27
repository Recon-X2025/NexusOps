# Pilot-Readiness Backlog

Prioritized gap backlog for CoheronConnect, agreed 2026-08-27. This is the
**strategic** roadmap (breadth of gaps); the tactical per-run queue stays in
`docs/PLAN-*.md`.

## How to read this

- **Priority** — P0 (before/while pilots) · P1 (before exposing that functionality)
  · P2 (product evolution).
- **Timing** — **PRE** (do before a pilot) · **PRE-IF** (pre-pilot only if the pilot
  exercises it) · **POST** (after the pilot). Owner rule: *if needed, pre-pilot;
  else post — **barring S3, which is a definite go.***
- **Effort** — rough bands for one engineer already familiar with the codebase.
  **S** = 1–2 d · **M** = 3–6 d · **L** = 1–3 wk · **XL** = 1+ mo. Estimates are ±;
  every item still needs a focused verify first (some session-era gaps have already
  moved — e.g. GRC create paths are now built).
- **Depth caveat** — this list is *breadth of missing capability*. The bigger pilot
  risk is **depth within "done" modules** (a metric that renders a confident wrong
  number, a save that silently no-ops). Budget a **module-level click-through of the
  exact surfaces the pilot will use** alongside P0 — it catches more pilot-killers
  than any single line here.

---

## P0 — before / while pilots

| # | Item | Timing | Effort | Scope / notes |
|---|------|--------|--------|----------------|
| 1 | **Global record search** | PRE | **M** (3–5 d) | `indexDocument` is defined but called nowhere → the Meili record index is always empty. Wire index/update/delete into the 8 searchable entities (tickets, assets, CIs, KB, employees, contracts, deals, accounts) + a one-time backfill script. Header module-search already fixed. |
| 2 | **Approval architecture** | PRE-IF (approvals in scope) | **M–L** (5–8 d) | Two parallel systems; generic `approvals.decide` transitions nothing; contracts has no approval verb; procurement double-wired (can silently disagree); 4 chains route to nobody (`rules:[]`). **Owner architecture decision first** (replace vs reporting layer), then consolidate to one path. |
| 3 | **Admin / configuration surfaces** | PRE | **M** (4–6 d) | SLA policies, ticket categories/priorities, professional-tax slabs, leave-exit rules are schema-configurable but have no admin CRUD → silent hardcoded defaults. Add mutations + admin screens per config area. |
| 4 | **DMS / object storage (S3 → Vultr)** | **PRE — go** | **S** (1–2 d) | Owner: no-brainer. Client is already Vultr/Ceph-compatible (checksums + SSE gated on custom endpoint). Remaining: bucket + creds (India hub for DPDP), the encryption decision (app-side recommended), verify. Graceful degradation already ships. |
| 5 | **ACL enforcement** | PRE-IF (per-doc access) | **S–M** (2–3 d) | `grantAcl` writes `document_acls` but enforcement is thin. Wire ACL checks into the document read/download paths. Only needed if the pilot has documents with per-user (not per-org) access. |
| 6 | **Critical workflow edge cases** | PRE | **M** (3–5 d) | Scope to the money/statute paths only: **procure-to-pay** (over-receipt/3-way — partly hardened), **leave** (deprecated-twin/backfill traps), **payroll run → statutory generation**, **lead-to-cash** (quote→invoice handoff). Targeted hardening + tests, not "all workflows". |
| 7 | **Billing / paywall enforcement** | PRE-IF (commercial onboarding) | **L+** (8–15 d) | No paywall today: open signup, `plan` = feature flags only, `trialEndsAt`/`stripeCustomerId` stored but never enforced. Needs subscription/trial/seat enforcement **+ a payment processor (external dependency)**. Only if you charge pilot tenants. |

**Unconditional P0 cut (search + config + S3 + workflows + truth-fix #8a): ~12–19 dev-days** (~2.5–4 wk solo, less if parallelized). Add #2/#5/#7 only as the pilot scope demands.

---

## P1 — before exposing the relevant functionality

| # | Item | Timing | Effort | Scope / notes |
|---|------|--------|--------|----------------|
| 8a | **Compliance-matrix truth-fix** | **PRE** (pull forward) | **S** (0.5–1 d) | The matrix seeds `status:'implemented'` as hardcoded literals over unbuilt tables. Cheap fix: seed `not_implemented` / derive the status. A false compliance claim is a liability under the "never ship a false claim" rule — do this now even though the build (8b) is post. Latent only while no screen renders the matrix. |
| 8b | **Tier-3 Compliance / Secretarial (build)** | POST | **XL** (weeks–months) | Statutory registers, XBRL, FEMA/RBI, CCI, LODOR, shareholder grievances/voting, director disclosures, MSME, e-sign events, whistleblower, sector licences, legal hold. Tables exist, **no write paths** (shells). Real regulatory semantics — sequence per obligation, not as a batch. |
| 9 | **Contract lifecycle** | POST (PRE-IF exposed) | **M** (4–6 d) | Clause-template count/content disagree (no write path for `contract_clause_templates`); no driven approval state machine. Do before exposing contract approvals/clauses. |
| 10 | **Form 16 Part A (TRACES)** | POST | **M** (3–5 d) | Part B (computation) is done + correct, incl. this session's HRA fix. Part A is the TRACES challan-download flow (**external TRACES dependency**). Only bites at issuance season. |

---

## P2 — product evolution (post-pilot)

| # | Item | Effort | Note |
|---|------|--------|------|
| 11 | AI / Agent depth | L (ongoing) | `agent`/`ai` routers are lean today. |
| 12 | Automation UX (visual builder) | L | Engine exists (Temporal/BullMQ); no visual builder. |
| 13 | Notifications depth | M | Thin router (74 lines). |
| 14 | Custom fields | M | Exists; depth/UX. |
| 15 | No-code builder | XL | Net-new surface. |
| 16 | External BI / Data-Warehouse connector | M | Reporting is internal-only today. |
| 17 | Mobile | L | `apps/mobile` parked — unpark. |
| 18 | App Marketplace | L | Integrations exist (13 providers); no marketplace. |
| 19 | Scenario Planning | L | Net-new module. |
| 20 | Marketing / Communities | L each | Net-new modules. |

---

## Recommended sequence

1. **Now (P0 core):** #4 S3 (go), #1 search, #8a truth-fix, #3 config surfaces, #6 named workflows — plus the pilot-surface click-through.
2. **P0 conditional:** add #2 (if approvals in scope), #5 (if per-doc ACLs), #7 (if charging tenants) — decide per pilot.
3. **P1:** #9 / #10 as their surfaces get exposed; #8b as a sequenced statutory roadmap.
4. **P2:** post-pilot product evolution.
