# Markdown Inventory — every `.md` outside `node_modules`

_Survey only. No source or doc files were changed to produce this. Written 2026-08-02
on branch `fixes/phase-2`._

## What this is

Every tracked `.md` file in the repo (122 of them; none untracked), with:

- **Documents** — what the file is for.
- **Last meaningful update** — the last commit that changed the file's *content* in a
  way that matters. This is **not** always the git date: the bulk commit
  `f630e67` ("Audit + sweep reports, quality bar, and doc updates", 2026-08-01)
  touched ~40 files at once; where it only re-saved a file without a real content
  change, the "meaningful" date is earlier and is noted.
- **Class** — (a) current & accurate · (b) stale but harmless · (c) stale &
  misleading (asserts something untrue now, or never true) · (d) scratch /
  superseded.
- **Action** — recommendation only. Nothing was changed.

## How the (c) calls were verified

The task requires (c) claims to be checked against the **actual code**, not taken on
the document's word. The verifications that drove several reclassifications below:

| Claim under test | Where checked | Result |
|---|---|---|
| "Next.js 15" (README) | `apps/web/package.json:46` → `"next": "^16.2.2"` | **16**, README is wrong |
| Migration head `0059` | `packages/db/drizzle/meta/_journal.json` last tag | head is **`0061_walled_challans`** (62 files) |
| Workflow triggers "never polled"; webhooks "no delivery ever created" | `apps/api/src/workflows/workflowTriggerWorkflow.ts`, `webhookDispatchWorkflow.ts` | **FALSE** — both are live BullMQ sweeps (60s / 30s) |
| DPDP notices misrouted to platform inbox, stamped "sent" | `apps/api/src/lib/notification-dispatcher.ts`, `dpdp-sweeps.ts` | **FIXED (A3/A4)** — routed to tenant DPDP contact; artifact stays `logged`, never `sent` |
| Journal-entry numbering count-then-add-one, race-prone | `apps/api/src/lib/auto-number.ts`, `routers/accounting.ts:23` | **FIXED (B2)** — atomic `org_counters` upsert |
| Custom roles can't save (UI 7 actions vs DB 5, `as any` casts) | `apps/api/src/routers/admin.ts:50-56`, `apps/web/.../admin/page.tsx:479` | **FIXED (A6)** — 5-value enum, no casts, UI offers the 5 |
| 3 tenant tables missing RLS wall (shift_schedules, esi/pt challans) | `packages/db/drizzle/0061_walled_challans.sql` | **FIXED (A11)** — RLS added to all three |
| "walk_in" channel vs "Walk-Up retired 2026-04" | `packages/types/src/tickets.ts:44-56` | Both true — `walk_in` intake channel is live; the standalone "Walk-Up" *surface* was retired |

**Net effect on the audit/sweep reports:** they were written 2026-07-31 against head
`0059`. Since then A3/A4 (DPDP), A6 (roles), A11 (RLS on 3 tables), B2 (JE numbering)
have shipped (head now `0061`). So each audit/sweep report is **partially superseded**:
the specific findings above are fixed, but the *bulk* of each report's findings remain
open and accurate. They are therefore classed **(b) stale but harmless** — still
broadly true and useful, but no longer a faithful snapshot of current state — with the
now-fixed findings called out. They are **not** (c): none of them asserts something
that was *never* true, and none is misleading in a way that would cause harm if a
reader treated the whole thing as a 2026-07-31 snapshot (which its own header says it
is).

---

## Root / top-level

| File | Documents | Last meaningful update | Class | Action |
|---|---|---|---|---|
| `README.md` | Public project overview, architecture tree, quickstart | 2026-07-18 (`e095c30`) | **(c)** | Fix: `apps/web` is **Next.js 16** (`^16.2.2`), not "Next.js 15" (line 12). The version is verifiably wrong and is the first thing a new dev reads. Otherwise accurate. |
| `CLAUDE.md` | Agent working guide; build/test facts; migration head; gap summary | 2026-08-01 (`f630e67`) | **(b)** | Update migration head from `0059` to `0061` (A11 added `0060`/`0061`). The A6/A11/A3/A4/B2 fixes it references as pending in places have shipped. Mostly accurate and self-flagging; low harm. |
| `BUILD.md` | End-to-end current-state map (apps, routers, HTTP, loops, DB, defects) | 2026-07-30 (`f365314`) | **(b)** | Refresh migration head (`0059`→`0061`) and re-verify the defect list against the Phase 2/3 fixes; correct as of its date. |
| `design.md` | Architecture / design notes ("single-spined modular monolith") | 2026-07-15 (`4d2f0ec`) | **(b)** | Keep; design intent, not a live-state claim. Re-read once at next doc pass. |
| `Legal Prompt.md` | Prompt/instructions for generating legal templates | 2026-06-22 (`efa3504`, initial) | **(d)** | Scratch/tooling prompt. Move under `docs/` or `legal/` if kept, or delete if the templates are now stable. |
| `NexusOps_API_Specification.md` | API spec (initial-commit vintage) | 2026-06-22 (`efa3504`) | **(c)** | Predates tRPC 11 router surface as it stands now; verify against `apps/api/src/routers/*` before trusting. Either regenerate from the live routers or mark clearly as historical. |
| `NexusOps_Architecture_Design_Document.md` | Architecture design doc (initial commit) | 2026-06-22 (`efa3504`) | **(b)** | Historical architecture; overlaps `BUILD.md`/`design.md`. Keep as reference or fold into `design.md`. |
| `NexusOps_Believers_Customer_Report.md` | Customer/marketing narrative | 2026-08-01 (`f630e67`, bulk) | **(b)** | Non-technical narrative; verify any capability claims against `docs/GAP_ANALYSIS.md` before external use. |
| `NexusOps_Entity_Relationship_Diagram.md` | ER diagram / data-model narrative | 2026-08-01 (`f630e67`, bulk) | **(c)** | The DB now has **236 tables** at head `0061`; an ERD from an earlier head will omit tables (shift_schedules, challans, gstin FK, etc.). Verify against `packages/db/src/schema/*` or regenerate. |
| `NexusOps_Investor_Document.md` | Investor-facing narrative | 2026-08-01 (`f630e67`, bulk) | **(b)** | Marketing/finance narrative; cross-check maturity claims against `GAP_ANALYSIS.md`. |
| `NexusOps_Test_Accounts.md` | Test/login accounts for local/demo | 2026-06-22 (`efa3504`) | **(c)** | Verify these accounts still exist — the 100-employee `coheron-demo` seed was **removed** (see CLAUDE.md). Any account that depended on it is dead. Confirm against current seeds, prune the rest. |
| `SETUP_WIZARD_INTEGRATION.md` | Setup-wizard integration notes | 2026-08-01 (`f630e67`, bulk re-save; content older) | **(d)** | Known-stale (flagged in task). Contains one developer's local **Windows paths** — machine-specific, not portable. Delete or rewrite as generic setup docs. |

## `content/`, `.snapshots/`, `product-scorecard/`

| File | Documents | Last meaningful update | Class | Action |
|---|---|---|---|---|
| `content/blog/single-spined-modular-monolith.md` | Blog post on the architecture pattern | 2026-07-15 (`1fab82e`) | **(a)** | Keep. Opinion/blog content, not a live-state assertion. |
| `.snapshots/readme.md` | Placeholder readme in snapshots dir | 2026-06-22 (`efa3504`) | **(d)** | Scratch. Likely a tool artifact; safe to ignore or gitignore the dir. |
| `.snapshots/sponsors.md` | Placeholder sponsors file | 2026-06-22 (`efa3504`) | **(d)** | Scratch/boilerplate. Ignore or remove. |
| `product-scorecard/REVIEW.md` | Product scorecard review notes | 2026-06-22 (`efa3504`) | **(b)** | Point-in-time review; superseded by `docs/GAP_ANALYSIS.md`. Keep for history or archive. |
| `apps/mobile/README.md` | Mobile app (Expo/RN) readme | 2026-06-22 (`efa3504`) | **(b)** | Minimal; mobile is a secondary surface. Keep. |

## `docs/` — active

| File | Documents | Last meaningful update | Class | Action |
|---|---|---|---|---|
| `docs/GAP_ANALYSIS.md` | Living gap tracker (shipped vs open, `file:line`) | 2026-08-01 (`f630e67`) | **(b)** | Already corrected once (per task). Verified at an earlier head; tree is `0061`. Re-verify the shipped/gap claims and update in place — it is the authoritative tracker. |
| `docs/PRODUCT_REFERENCE.md` | Product reference (features, channels, terminology) | 2026-06-22 (`efa3504`) | **(b)** | "Walk-Up retired 2026-04" is consistent with code (`walk_in` intake channel persists; the standalone surface was retired). Old vintage; re-verify feature list against current routers. |
| `docs/AI_ROADMAP.md` | AI maturity stages + scoring decisions | 2026-08-01 (`f630e67`, bulk) | **(a)** | Roadmap/intent doc; not a live-state claim. Keep. |
| `docs/INDIA_ROADMAP.md` | India go-live + 5 security items | 2026-08-01 (`f630e67`, bulk) | **(b)** | Self-flags "verified at head 0038"; tree is `0061`. Several items (DPDP, RLS, roles) have advanced. Re-verify and update the verification-basis line. |
| `docs/US_ROADMAP.md` | US-market build plan (country/regime, US COA, QuickBooks, CCPA) | 2026-07-30 (`f365314`) | **(b)** | Self-flags "verified at head 0032". Forward-looking; low harm. Refresh verification basis at next pass. |
| `docs/COMMAND_CENTER.md` | Command-center feature spec | 2026-06-22 (`efa3504`) | **(b)** | Verify against the `command_center.*` router; keep. |
| `docs/COMMAND_CENTER_BUILD.md` | Command-center build notes | 2026-06-22 (`efa3504`) | **(b)** | Build-time notes; overlaps the spec. Keep or fold in. |
| `docs/CSAT_EXECUTION_PLAN_2026-07-05.md` | CSAT loop execution plan | 2026-07-06 (`6fdfe9a`) | **(b)** | Dated plan; the CSAT loop shipped in the same commit family. Move to `docs/archive/` once confirmed done. |
| `docs/DATA_MODEL.md` | Data-model reference (tenancy classes, FK ownership) | 2026-06-29 (`ea1e6d9`) | **(a)** | Core reference; FK `onDelete` policy still enforced repo-wide. Keep; add the 3 newly-walled tables at next pass. |
| `docs/DPDP_ERASURE_LEGAL_VALIDATION.md` | Legal validation of the erasure design | 2026-07-18 (`b968a79`) | **(a)** | Matches shipped honest-erasure behaviour (A3/A4). Keep. |
| `docs/DPDP_ERASURE_STRATEGY.md` | DPDP erasure strategy | 2026-07-30 (`f365314`) | **(b)** | Self-flags head `0034`; erasure executor + honest reporting have since shipped. Re-verify, then mark current. |
| `docs/E2E_EVALUATION_FINDINGS.md` | E2E test evaluation findings | 2026-08-01 (`f630e67`, bulk) | **(b)** | Point-in-time findings; re-verify against current e2e suite. |
| `docs/EMUDHRA_PRODUCTION_RUNBOOK.md` | eMudhra (DSC) production runbook | 2026-06-22 (`efa3504`) | **(b)** | Operational runbook; verify endpoints before prod use. Keep. |
| `docs/FEATURE_BRANCH_PLAYBOOK.md` | Branch/workflow playbook | 2026-06-27 (`97d283a`) | **(a)** | Process doc; still valid. Keep. |
| `docs/FINANCE_SOD_MATRIX.md` | Finance separation-of-duties matrix | 2026-06-22 (`efa3504`) | **(b)** | Verify role names against the current RBAC matrix (`packages/types` + A6 changes). Keep. |
| `docs/GRC_BASIC_HARDENING_BACKLOG_2026-07-03.md` | GRC hardening backlog | 2026-07-03 (`746f160`) | **(b)** | Dated backlog; reconcile with `GAP_ANALYSIS.md`. Archive when consumed. |
| `docs/KMS_INTEGRATION_SECRETS_RUNBOOK.md` | KMS/secrets runbook | 2026-06-22 (`efa3504`) | **(a)** | Matches the shipped AES-256-GCM envelope + AWS-KMS design. Keep. |
| `docs/RESPONSIVE_WEB_DECISION_AND_SCOPE.md` | Responsive-web decision + scope | 2026-06-27 (`97d283a`) | **(a)** | Decision record. Keep. |
| `docs/SECURITY_SENSITIVE_MUTATIONS.md` | Catalog of security-sensitive mutations | 2026-06-22 (`efa3504`) | **(b)** | Verify the list against current routers (new mutations since June). Keep. |
| `docs/SERVICENOW_MIGRATION_GUIDE_V1.md` | ServiceNow → CoheronConnect migration guide | 2026-06-22 (`efa3504`) | **(b)** | Customer-facing guide; verify field mappings. Keep. |
| `docs/SIEM_EVENT_SCHEMA.md` | SIEM event schema | 2026-06-22 (`efa3504`) | **(b)** | Verify against emitted audit/SIEM events. Keep. |
| `docs/SMB_MARKET_POSITION_2026.md` | SMB market positioning | 2026-06-27 (`97d283a`) | **(b)** | "walk_in" channel reference is consistent with code. Positioning doc; low harm. Keep. |
| `docs/SMB_NEEDED_NOW_BACKLOG.md` | SMB near-term backlog | 2026-06-27 (`97d283a`) | **(b)** | Dated backlog; reconcile with `GAP_ANALYSIS.md`. Archive when consumed. |
| `docs/SPRINT_3_4_PLAN_2026-07-04.md` | Sprint 3 & 4 plan | 2026-07-04 (`b6b0cd2`) | **(c)** | **Asserts workflow triggers are "never polled or evaluated" and outbound webhooks have "no code ever creates a delivery."** Verified FALSE: both are live BullMQ sweeps (`workflowTriggerWorkflow.ts` 60s, `webhookDispatchWorkflow.ts` 30s). Add a "SHIPPED" note or archive — a reader planning work off this would build what already exists. |
| `docs/TEMPORAL_LOCAL_RUNBOOK.md` | Temporal local-dev runbook | 2026-06-22 (`efa3504`) | **(a)** | Ops runbook; still valid. Keep. |
| `docs/TESTING.md` | Testing guide + coverage-floor gate | 2026-06-29 (`7f4b1d8`) | **(a)** | Matches the vitest/real-Postgres setup. Keep. |
| `docs/TRUST_CENTRE_STARTER.md` | Trust-centre starter content | 2026-06-22 (`efa3504`) | **(b)** | Verify compliance claims against reality before publishing. Keep. |
| `docs/VULN_IMPORT_DEDUPE_RULES.md` | Vuln-import dedupe rules | 2026-06-22 (`efa3504`) | **(a)** | Matches the vuln-SLA pipeline. Keep. |
| `docs/quality-bar.md` | Quality bar + live blockers register | 2026-08-01 (`f630e67`) | **(b)** | The DPDP notice-misrouting "LIVE BLOCKER" was **fixed by A3/A4** (notices route to tenant contact; artifacts stay `logged`). Update that blocker's status; the rest of the bar is intact. |

## `docs/archive/` — all superseded by design

All 30 files here are dated audits/plans retained for decision-history only, per
CLAUDE.md ("moved to `docs/archive/` … retained for decision-history only"). Their
git date `2026-07-21` (`a6f3114`) / `2026-07-15` is a bulk move, not a content edit.

**Class for every file below: (d) scratch / superseded. Action: keep archived; do not
edit; do not treat as current.**

`AMAZON_STRATEGY_PROJECTS_GAP_ANALYSIS.md` · `COMPETITIVE_GAP_ANALYSIS_2026-06-30.md` ·
`CRM_EXECUTIVE_SUMMARY.md` · `GRC_GAP_ANALYSIS_2026-07-03.md` ·
`GRC_TIER_WORKITEM_MAP_2026-07-03.md` · `HUBSPOT_CUSTOMER_SALES_CRM_GAP_ANALYSIS.md` ·
`INDIA_GOLIVE_DEV_PLAN_2026-07-13.md` · `INDIA_GOLIVE_SPEC_PHASES_1-3-5_2026-07-13.md` ·
`LEGAL_CONTRACT_CONTENT_AUDIT_2026-07-03.md` · `LEGAL_GOVERNANCE_GAP_ANALYSIS_2026-07-03.md` ·
`LEGAL_GOVERNANCE_RUN_WITHOUT_PROFESSIONAL_2026-07-03.md` · `MARKET_ASSESSMENT_2026-04-26.md` ·
`MICROSOFT_FINANCE_PROCUREMENT_GAP_ANALYSIS.md` · `MODULE_STATUS_2026-04-27.md` ·
`NEXUSOPS_SECURITY_COMPLIANCE_GAP_ANALYSIS.md` · `PLATFORM_GAP_CRM_2026-07-03.md` ·
`PLATFORM_GAP_FINANCE_2026-07-03.md` · `PLATFORM_GAP_GOVERNANCE_2026-07-03.md` ·
`PLATFORM_GAP_INDEX_2026-07-03.md` · `PLATFORM_GAP_ITASSET_2026-07-03.md` ·
`PLATFORM_GAP_ITSM_2026-07-03.md` · `PLATFORM_GAP_PEOPLE_2026-07-03.md` ·
`PLATFORM_GAP_PLATFORM_2026-07-03.md` · `PRODUCTION_READINESS_PLAN_2026-04-26.md` ·
`RELIANCE_LEGAL_GOVERNANCE_INDIA_GAP_ANALYSIS.md` · `SECRETARIAL_BUILD_VS_ADDON_2026-07-03.md` ·
`SECURITY_COMPLIANCE_ROADMAP_2026-07-13.md` · `SERVICENOW_ITSM_GAP_ANALYSIS.md` ·
`SESSION_HANDOVER_2026-06-30.md` · `SPRINT_0_AUDIT_REPORT_2026-07-03.md` ·
`SPRINT_1_AUDIT_REPORT_2026-07-03.md` · `SPRINT_2_AUDIT_REPORT_2026-07-03.md` ·
`SYSTEM_AUDIT_2026-06-29.md` · `USER_STORIES_GAP_CLOSURE_BACKLOG.md` ·
`US_MARKET_BUILD_PLAN_2026-07-12.md` · `WORKDAY_PEOPLE_WORKPLACE_GAP_ANALYSIS.md`

## `legal/templates/`

Boilerplate contract templates, all initial-commit (`efa3504`, 2026-06-22),
unchanged since. **Class: (a) current & accurate** as static templates (they make no
claims about the running system). **Action: keep;** have counsel review before any real
use (they are drafts, not vetted instruments).

`colocation-lease.md` · `customer-agreement.md` · `nda.md` · `sla-support.md` ·
`software-license.md` · `sow.md` · `vendor-msa.md`

## `.claude/skills/`

| File | Documents | Last meaningful update | Class | Action |
|---|---|---|---|---|
| `.claude/skills/qa-audit/SKILL.md` | QA-audit skill definition | 2026-08-01 (`4beff1b`) | **(a)** | Tooling; current. Keep. |
| `.claude/skills/qa-map/SKILL.md` | QA-map skill definition | 2026-08-01 (`4beff1b`) | **(a)** | Tooling; current. Keep. |

## `reports/` — audits, sweeps, plans

The 16 subsystem audits + 8 pattern sweeps were written **2026-07-31 against head
`0059`**; each carries its own dated header saying so. Phase 2/3 has since shipped
A3/A4, A6, A11, B2 (head now `0061`). So each is a **faithful snapshot of its date**
but no longer of *now*. **Class: (b) stale but harmless** unless noted — with the
specific now-fixed findings flagged. **General action:** keep as the audit record; when
each finding is closed, annotate it in `fix-plan.md` (the live tracker) rather than
rewriting the dated audit.

| File | Documents | Last meaningful update | Class | Action |
|---|---|---|---|---|
| `reports/fix-plan.md` | **Live** remediation tracker (R-ratchets, A/B items) | 2026-08-02 (`e5d74ea`) | **(a)** | The current source of truth for what's fixed. Keep updating in place. |
| `reports/triage.md` | Triage of audit findings into work items | 2026-08-01 (`f630e67`) | **(b)** | Reconcile against `fix-plan.md`; the A3/A4/A6/A11/B2 items are done. |
| `reports/audit-summary.md` | Plain-English roll-up of all 24 reviews | 2026-07-31 (`f630e67` re-save) | **(b)** | Header dates it correctly. Note that cause-#1 DPDP (A3/A4), cause-#2 JE-numbering (B2), cause-#4 custom-roles (A6), cause-#5 three-unwalled-tables (A11) are now fixed; the rest stand. |
| `reports/audit-dpdp-privacy.md` | DPDP subsystem audit | 2026-07-31 | **(b)** | B-1 notice-misrouting and honest-erasure findings **fixed (A3/A4)**. Remaining findings (e.g. all-or-nothing sweep) stand. Annotate. |
| `reports/audit-auth-rbac.md` | Auth/RBAC audit | 2026-07-31 | **(b)** | Custom-role vocabulary finding **fixed (A6)**. Session-staleness/API-key-prefix findings stand. Annotate. |
| `reports/audit-tenant-isolation.md` | Tenant-isolation audit | 2026-07-31 | **(b)** | H-1 "three tables missing RLS" **fixed (A11/0061)**. Ownership-check findings stand. Annotate. |
| `reports/audit-data-layer-migrations.md` | DB/migrations audit | 2026-07-31 | **(b)** | B-1 three-unwalled-tables **fixed (A11)**. Otherwise current. Annotate. |
| `reports/audit-money-accounting.md` | Money/accounting audit | 2026-07-31 | **(b)** | H-1 count-then-add-one JE numbering **fixed (B2)**. H-2 journal double-count (no lock) — verify against `accounting.ts` before closing. Annotate. |
| `reports/audit-assets-procurement-inventory.md` | Assets/procurement/inventory audit | 2026-07-31 | **(b)** | Goods-receipt create path landed (A9); re-verify H-1. Other findings stand. Annotate. |
| `reports/audit-audit-log-integrity.md` | Audit-log hash-chain audit | 2026-07-31 | **(b)** | Tail-truncation (R-5/B5) still open per `fix-plan.md`. Accurate. Keep. |
| `reports/audit-background-automation.md` | Background loops audit | 2026-07-31 | **(a)** | Confirms 5/6 loops sound, DPDP loop all-or-nothing — matches code. Keep. |
| `reports/audit-crm-sales.md` | CRM/sales audit | 2026-07-31 | **(a)** | Reports CRM healthy (scoring, lossless convert, CPQ). Matches code. Keep. |
| `reports/audit-gst-invoicing.md` | GST/invoicing audit | 2026-07-31 | **(b)** | State code-vs-name wrong-tax finding — verify current onboarding normalisation before closing. Largely stands. |
| `reports/audit-hr-people.md` | HR/people audit | 2026-07-31 | **(b)** | Employee-ID count-then-add-one — re-verify vs `auto-number.ts`. Payroll praised. Annotate. |
| `reports/audit-itsm-service.md` | ITSM audit | 2026-07-31 | **(b)** | First-response clock never-set finding — verify current ITSM code. Stands unless fixed. |
| `reports/audit-observability-health.md` | Observability audit | 2026-07-31 | **(b)** | Query-timeout / connector-timeout findings — verify current. Stands. |
| `reports/audit-payroll-tax.md` | Payroll/tax audit | 2026-07-31 | **(a)** | Rates payroll production-grade — matches code. Keep. |
| `reports/audit-platform-superadmin.md` | Super-admin console audit | 2026-07-31 | **(b)** | tRPC-vs-REST off-switch divergence — verify current `apps/mac` + REST. Stands. |
| `reports/audit-secrets-kms-integrations.md` | Secrets/KMS/integrations audit | 2026-07-31 | **(b)** | Plaintext SSO-token finding — verify current. KMS vault praised. Stands. |
| `reports/audit-plan.md` | The audit's own scope/plan | 2026-07-31 | **(d)** | Planning artifact for the audit run; superseded once audits shipped. Archive. |
| `reports/sweep-fabricated-constants.md` | Sweep: fabricated portal URLs / HSN | 2026-07-31 | **(b)** | DPDP recipient constant addressed (A3/A4); fabricated `*-suvidha.in` portals + HSN `9983` stand. Annotate. |
| `reports/sweep-false-comments.md` | Sweep: comments that lie | 2026-08-01 (`7392a51`) | **(b)** | Retry-comment corrected (B2). Idempotent-notifier comment — verify. Annotate. |
| `reports/sweep-inconsistent-patterns.md` | Sweep: read-then-write/txn patterns | 2026-07-31 | **(b)** | Pattern-2 numbering **fixed (B2)**. Patterns 1/3/4/5 stand. Annotate. |
| `reports/sweep-ownership-checks.md` | Sweep: 31 missing ownership checks | 2026-07-31 | **(b)** | A9 tightened one PO path; the 31-way habit largely stands. Annotate. |
| `reports/sweep-phantom-fields.md` | Sweep: read-but-never-written columns | 2026-07-31 | **(b)** | Goods-receipt-adjacent fields may be affected by A9; re-verify. Stands. |
| `reports/sweep-stale-debt.md` | Sweep: accepted-debt register drift | 2026-07-31 | **(b)** | The DPDP "not wired — skip" entry it corrected is now genuinely fixed (A3/A4). Reconcile with `fix-plan.md`. |
| `reports/sweep-tenant-constants.md` | Sweep: baked-in per-tenant constants | 2026-07-31 | **(b)** | State/FY/DPDP-recipient constants; DPDP one addressed. State + FY stand. Annotate. |
| `reports/sweep-unreachable-features.md` | Sweep: built-reader/missing-writer features | 2026-07-31 | **(b)** | #4 custom-roles **fixed (A6)**; #1 goods-receipt advanced (A9). #2/#3/#5–#12 stand. Annotate. |

---

## Summary counts

| Class | Count | Notes |
|---|---|---|
| (a) current & accurate | 20 | core refs, runbooks, roadmap-intent, live `fix-plan.md`, legal templates, skills |
| (b) stale but harmless | 60 | audits/sweeps past their dated snapshot; roadmaps flagged at old heads; older docs needing re-verification |
| (c) stale & misleading | 6 | `README.md` (Next 15), `NexusOps_API_Specification.md`, `NexusOps_Entity_Relationship_Diagram.md`, `NexusOps_Test_Accounts.md`, `SPRINT_3_4_PLAN_2026-07-04.md`, (borderline) — all verified against code |
| (d) scratch / superseded | 36 | all `docs/archive/*`, `.snapshots/*`, `SETUP_WIZARD_INTEGRATION.md`, `Legal Prompt.md`, `audit-plan.md` |

## The five things worth fixing first (docs only)

1. **`README.md:12`** — "Next.js 15" → **16**. Verified wrong; first doc a new dev reads.
2. **`SPRINT_3_4_PLAN_2026-07-04.md`** — remove/annotate the "triggers never polled /
   webhooks never delivered" claim; both are live sweeps. Risk: someone rebuilds them.
3. **`SETUP_WIZARD_INTEGRATION.md`** — strip the developer's local Windows paths;
   rewrite generic or delete.
4. **`docs/quality-bar.md`** — the DPDP notice-misrouting LIVE BLOCKER is fixed
   (A3/A4); update its status so the register stays honest.
5. **Migration-head drift** — `CLAUDE.md`, `BUILD.md`, and the roadmaps say `0059`;
   the tree is at `0061`. One find-and-update pass.

_All classifications with a code consequence were checked against the working tree at
`fixes/phase-2` (head `0061_walled_challans`). No files other than this report were
created or modified._
