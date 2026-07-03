# Platform Gap Analysis — Cluster 4: IT Asset & Configuration Management

**Date:** 2026-07-03
**Hat worn:** IT Asset Manager / SAM Manager / CMDB Owner
**Benchmarks:** ServiceNow ITAM/SAM, Flexera One (+ Snow), Lansweeper (discovery), Archibus (facilities)
**Modules covered:** Hardware asset mgmt, Software Asset Mgmt (SAM/licenses), CMDB/CI, APM (application portfolio), Facilities, Asset financials/depreciation, Asset↔contract linking, Discovery/import
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB.

---

## 0. Executive verdict

**Everything you can store is real; almost nothing you can *compute* is.** This cluster has correct, well-modelled data structures across the board — an asset register with lifecycle, a license/seat model, a facilities booking system, and — the genuine standout — a **real CMDB with working topology, service-map BFS, and upstream/downstream impact analysis**. But every layer that produces *financial or compliance intelligence* — hardware depreciation, SAM installed-vs-entitled reconciliation, license compliance position, APM rationalization — is absent. The register knows what you own; it can't tell you what it's worth, whether you're license-compliant, or what to retire.

**One-line summary:** *A solid asset register and a genuinely good CMDB, with every "so what does it cost / are we compliant" calculation missing.*

**Cluster maturity ≈ 42/100** — pulled up by the CMDB, pulled down by the total absence of depreciation and SAM reconciliation.

**Maturity scores:**

| Domain | Score | Verdict |
|---|---|---|
| CMDB / CI + relationships + impact | 68 | REAL — topology, service map, impact analysis |
| Hardware asset register + lifecycle | 58 | REAL CRUD, no financials |
| Software licenses (seat counting) | 45 | REAL assignment, no reconciliation |
| APM inventory + lifecycle tags | 45 | REAL inventory, no rationalization |
| Facilities (room booking) | 55 | REAL bookings w/ conflict detection |
| Bulk import / discovery ingest | 40 | PARTIAL — bulk upsert, no agents |
| Asset↔contract linking | 20 | MISSING — decoupled |
| **Asset financials / depreciation** | **10** | **STUB — no engine, manual JE only** |
| **SAM compliance / true-up** | **5** | **MISSING** |
| **Cluster weighted average** | **~42** | **Register real, intelligence absent** |

---

## 1. CMDB / CI — REAL, the cluster's strength (68)

`assets.ts` + `schema/assets.ts`:
- **CI types** (server/application/database/network/service/cloud) and **relationship types** (depends_on/runs_on/connected_to/member_of/hosts) modelled (`schema/assets.ts:25-47`).
- **Topology graph** dump as nodes/edges (`assets.ts:200-226`).
- **Service map** — real BFS from a root CI with configurable depth/node caps (`assets.ts:232-302`).
- **Impact analysis** — recursive upstream (dependencies) / downstream (dependents) traversal (`assets.ts:304-345`). This is the capability ServiceNow's CMDB is bought for, and it's genuinely implemented.
- **Bulk import** idempotent by `(orgId, externalKey)` (`assets.ts:433-484`) — the right discovery-ingest anchor.

**Gaps:**
- **No relationship semantics** — the only validation is `sourceId ≠ targetId` (`assets.ts:410-411`); no cardinality rules, no "hosts must target a database"-type constraints, **no circular-dependency detection**.
- **In-memory traversal** loads all CIs then walks (`assets.ts:243-283`) — fine for SMB, O(n) load won't scale to large estates.
- This CMDB is also the missing piece for Cluster 3's change-impact and event-correlation gaps — it *has* the graph; those modules just don't traverse it.

---

## 2. Hardware asset management — REAL CRUD, no financials (58)

`assets.ts:619-683` + `schema/assets.ts:90-138`:
- Asset register with auto `AST-NNNN` tags, lifecycle `in_stock→deployed→maintenance→retired→disposed`, employee assignment (assign/unassign), parent-child bundles, warranty-expiry date, and a real per-mutation **asset history audit trail** (`schema/assets.ts:122-138`).

**Gaps:**
- **No depreciation fields at all** — no `usefulLife`, `salvageValue`, `depreciationMethod`, `bookValue` (`schema/assets.ts:106` stores only `purchaseCost`).
- **No cost center / department allocation** — no chargeback.
- **No lease-vs-owned** tracking.
- Warranty date is stored but **not enforced** — no expiry alerts.
- Asset tags are sequential, not device identifiers — **no serial number, MAC, IMEI** fields (limits any future discovery matching).

---

## 3. Software Asset Management — the biggest compliance gap (45 / 5)

`assets.ts:488-617` + `schema/assets.ts:186-226`:
- **What's real:** license records with type (per_seat/device/site/enterprise), acquisition type (perpetual/subscription/trial/open_source/freeware), license→user/asset assignment, and **on-the-fly utilization %** = active-assignments / totalSeats (`assets.ts:497-519`).
- **What's missing — the entire point of SAM:**
  - **No installed-vs-entitled reconciliation.** `usedSeats` is just a count of un-revoked assignment rows — there's **no import of actually-installed software**, no discovery feed, no comparison to entitlements.
  - **No compliance position / Effective License Position (ELP).** No overage calculation, no compliance score, no true-up workflow, no audit trail of position over time.
  - **No renewal/expiry alerting.**

*Benchmark (Flexera One / ServiceNow SAM):* advanced reconciliation across physical/virtual/container/IaaS produces an ELP; the 2026 trend is **monthly ELP snapshots** for quarterly true-ups (Microsoft moved off annual). Median M365 true-up findings run **$300k–$500k for 1,000–5,000 seats** — i.e. this is exactly the risk SAM exists to catch, and this module catches none of it. **This is the single most valuable thing to build in the cluster if IT-cost/audit-defense is in the ICP.**

---

## 4. APM — inventory real, rationalization missing (45)

`apm.ts` + `schema/apm.ts`:
- Application inventory with vendor/owner/version/department, **TIME lifecycle tags** (evaluating/investing/sustaining/harvesting/retiring/obsolete), cloud-readiness enum, annual cost, and a portfolio summary aggregating cost + avg health (`apm.ts:98-130`).

**Gaps:**
- Lifecycle is a **free-form tag, not an enforced workflow** — no transitions.
- `healthScore`/`techDebtScore` are **manually-set static fields** with no computation.
- **No business-criticality field** (only the static health score).
- **No rationalization engine** — no candidate-to-retire list generated from lifecycle × health × cloud-readiness × cost, no cost-benefit analysis. That decision engine is the reason APM tools exist.
- **No tech-stack dependency graph** (version is unstructured text).

---

## 5. Facilities — real bookings, thin workplace (55)

`facilities.ts` + `schema/facilities.ts`:
- Buildings→rooms hierarchy, **room bookings with real SQL temporal conflict detection** (`facilities.ts:85-106`) — genuine double-booking prevention. Facility requests (maintenance/cleaning/catering/…) and move requests with status workflows.

**Gaps vs Archibus:**
- **No floor plans / spatial model, no desk-level reservations** — room-level only. Hybrid-work desk hoteling is the modern workplace ask and it's absent.
- **Move requests don't link assets or employees** — no move execution/asset-reconciliation orchestration.
- Capacity is stored but occupancy isn't enforced.

---

## 6. Asset financials / depreciation — STUB (10)

The accounting GL *has* the accounts (`fixed_asset`, `accumulated_depreciation` sub-types) and a `depreciation` journal-entry type (`schema/accounting.ts:76`), so depreciation can be **manually journaled**. But:
- **No depreciation engine** — no `computeAssetDepreciation()`, no straight-line/WDV schedule, no auto-post on period close.
- **No book-value view** (`purchaseCost − accumulatedDepreciation`).
- **No useful-life/salvage/method fields** on the asset to drive it.

So fixed-asset accounting is entirely manual. This also links back to the Finance cluster's "no balance sheet" gap — you can't show net fixed assets without this. *Benchmark: ServiceNow/Flexera auto-compute straight-line and WDV.*

---

## 7. Asset↔contract linking — MISSING (20)

Contract lifecycle is real (see Legal cluster), but **contracts have no `assetId`/`ciId`** and there's no association table. So maintenance contracts and vendor-support agreements can't be tied to the equipment they cover, and asset warranty (a date field) isn't linked to any warranty contract. No "asset X's AMC expires in 30 days" alerting is possible. Cheap to add, high operational value.

---

## 8. Discovery / auto-import — PARTIAL (40)

- **Real:** idempotent bulk CI import via `externalKey` (`assets.ts:433-484`) — supports a one-time CSV/export from Lansweeper/Snow.
- **Missing:** no active discovery agents (SNMP/WMI/SSH/API polling), no scheduled scans, no scan history/failure tracking, no software-inventory discovery, no change-detection/reconciliation of disappeared assets, no device fingerprint fields to match on. Discovery is manual/batch only. *Benchmark: Lansweeper/Flexera agents continuously discover; this is import-only.*

---

## 9. Prioritized fix list (IT Asset Manager ranking)

| # | Fix | Domain | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **SAM reconciliation + ELP/compliance position** | SAM | High | Highest $ risk (true-up defense); the point of SAM |
| 2 | **Depreciation engine** (fields + straight-line/WDV + auto-post) | Financials | Med | Unlocks book value + Finance balance sheet |
| 3 | **Asset↔contract linking** (assetId/ciId on contracts + AMC/warranty alerts) | Linking | Low | Cheap, high operational value |
| 4 | **Circular-dependency detection + relationship semantics** in CMDB | CMDB | Low-Med | Prevents corrupt graphs; hardens the cluster's best asset |
| 5 | **APM rationalization engine** (retire candidates from lifecycle×health×cloud×cost) | APM | Med | Turns inventory into decisions |
| 6 | **Warranty/license expiry alerting** (worker job) | HAM/SAM | Low | Cheap; reuse notification infra |
| 7 | **Cost center / lease-vs-owned on assets** | Financials | Low-Med | Chargeback + capex/opex |
| 8 | **Desk-level reservations + floor plans** | Facilities | Med | Hybrid-work workplace ask |
| 9 | **Device fingerprint fields** (serial/MAC) + software discovery ingest | Discovery | Med | Prereq for real reconciliation (feeds #1) |
| 10 | **CMDB traversal query optimization** | CMDB | Med | Only when estates get large |

Items **3, 4, 6, 7 are cheap**; **1, 2** are the strategic intelligence builds (compliance + financials); **9** is the prerequisite that makes #1 real.

---

## 10. Bottom line for this cluster

The data model is right and the CMDB is genuinely good — real topology, service mapping, and impact analysis that even the ITSM cluster doesn't yet consume. But this cluster is the clearest example of the platform's recurring pattern: **correct schema, missing computation.** It can tell you *what* you own and *how it's connected*, but not *what it's worth* (no depreciation), *whether you're compliant* (no SAM reconciliation), or *what to retire* (no APM rationalization).

The two highest-value builds are **SAM reconciliation** (audit-defense $ risk) and the **depreciation engine** (which also unblocks the Finance cluster's balance sheet). The cheap wins — asset↔contract linking, expiry alerting, CMDB cycle detection — remove real operational risk for little effort. Do those and this moves from ~42 to a credible ~65, with the CMDB already at leader-adjacent quality.

**Sources:**
- [Flexera — Software Asset Management](https://www.flexera.com/solutions/software-usage-costs/software-asset-management)
- [Gartner Peer Insights — SAM Tools 2026](https://www.gartner.com/reviews/market/software-asset-management-tools)
- [Software License Management Tools 2026: Audit Defence](https://sobrii.io/blog/software-license-management-tools)
- [Best ITAM Tools 2026](https://cloudaware.com/blog/asset-management-tools/)
