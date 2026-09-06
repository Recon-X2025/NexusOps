# Product Requirements Document — CoheronConnect

**Repo:** NexusOps · **Product:** CoheronConnect · **Production:** `connect.coheron.tech`
**Status:** Live, onboarding first pilot cohort · **Last refreshed:** 2026-08-27

> **Reporting discipline.** This document follows the repo's reporting standard
> (`CLAUDE.md`): a capability is described as **built** only where it is reachable
> and exercised; everything else is marked **GAP** and traced to the
> pilot-readiness backlog. It is a product spec, not a sales sheet — where the
> product is thin, it says so. Strategic gaps live in
> [`docs/PILOT-READINESS.md`](PILOT-READINESS.md); tactical per-run state lives in
> the newest [`docs/PLAN-*.md`](.).

---

## 1. Overview

CoheronConnect is a **multi-tenant, India-first enterprise operations platform** —
one system where a mid-market Indian company runs its people, money, service, sales,
assets, procurement and compliance instead of stitching together a dozen point tools.
The differentiator is not breadth alone (many suites are broad); it is that the
**India statutory layer is native** — payroll PF/ESI/PT/TDS, GST, TDS, EPFO ECR,
professional tax, DPDP data-protection — rather than bolted on as an afterthought or
left to a spreadsheet.

Each customer is a **tenant** (an "organization"); every tenant's data is isolated
at the database row level. A single deployment serves many tenants.

## 2. Vision & positioning

**Vision.** The system of record for running an Indian business's back office and
front-line operations, with compliance correctness treated as a first-class product
requirement rather than a manual step.

**Positioning.**
- **Against global suites** (large HRMS/ERP/ITSM vendors): CoheronConnect speaks
  Indian statute natively — the payroll engine, GST engine and filing artifacts are
  built to Indian rules, not localized approximations.
- **Against point tools** (separate HRMS + helpdesk + CRM + accounting): one tenant,
  one identity model, one permission model, one audit trail — data does not have to
  be reconciled across silos.
- **Against spreadsheets + consultants** (the real incumbent for many SMBs): the
  statutory math is in the product and reproducible, not in a consultant's private
  workbook.

## 3. Target users & personas

The platform is organized around the teams that actually run an Indian company:

| Persona | Role | What they need |
|---|---|---|
| **HR / People Ops** | Employee lifecycle, onboarding, leave, performance | Accurate records, statutory identity (PAN/UAN/Aadhaar), leave & attendance, offboarding on a date |
| **Payroll / Finance** | Pay runs, statutory filing prep, accounting | Correct PF/ESI/PT/TDS, payslips, Form 16, journal entries that balance, approval chains |
| **IT / Service Desk** | Incidents, requests, assets, changes | Ticketing with SLAs, CMDB/assets, change management, on-call |
| **Sales / CRM** | Pipeline, deals, quotes | Leads → deals → quotes → invoices, no duplicate/lost records |
| **Procurement** | Purchase orders, vendors, receipts | PO lifecycle, 3-way match, over-receipt guards |
| **Compliance / Secretarial / Legal** | Statutory registers, GRC, contracts | Compliance tracking, secretarial obligations, contract lifecycle |
| **Executives (CxO)** | Cross-functional visibility | Command-center dashboards with honest, period-windowed metrics |
| **Platform admin / operator** | Tenant configuration, managed-account support | Config surfaces, secure impersonation for support |

## 4. Problem & value proposition

**Problem.** Indian mid-market operations run on fragmented tools plus manual
statutory work. The statutory math (payroll, GST, TDS) is error-prone, the data is
scattered, and audit trails are weak. Compliance mistakes are expensive and, under
DPDP, personal-data handling is now a legal obligation.

**Value.**
1. **One tenant, one truth** — people, money, service, sales and compliance share
   one identity and permission model.
2. **India statutory correctness by construction** — the engines encode the rules
   (documented invariants in `CLAUDE.md`), with money invariants asserted in tests.
3. **Isolation and auditability** — row-level tenant isolation, role-based access,
   envelope-encrypted PII, and an append-only audit trail.
4. **Generate, don't just display** — statutory and commercial documents (payslip,
   tax invoice, quotation, Form 16) are produced as real PDFs that **refuse to render
   rather than mislead** when inputs are incomplete.

## 5. Scope — functional surface

The product spans ~57 functional areas (tRPC routers). Grouped by persona:

**People & Payroll**
`hr`, `onboarding`, `leave-accrual`, `performance`, `recruitment`, `workforce`,
`payroll`, `gratuity`, `expenses`, `india-compliance`.

**Service & IT Operations**
`tickets` (service desk), `assets`, `changes`, `work-orders`, `oncall`, `apm`,
`devops`, `inventory`, `catalog`, `assignment-rules`.

**Sales & Revenue**
`crm` (leads/deals/accounts), `contracts`, `settlement`, `financial`, `accounting`,
`depreciation`, `vendors`, `procurement`.

**Compliance, Governance & Documents**
`compliance`, `grc`, `secretarial`, `legal`, `documents` (DMS), `esign`,
`custom-fields`, `surveys`.

**Cross-cutting platform**
`auth`, `security`, `admin`, `approvals`, `notifications`, `search`, `reports`,
`command-center`, `dashboard`, `workbench`, `integrations`, `teams`, `events`,
`ingest`, `agent`/`ai`, `mac` (managed-account console).

## 6. Functional requirements by area (built vs. gap)

Concise, honest per-area status. "Built" = reachable and exercised; "GAP" traces to
[`PILOT-READINESS.md`](PILOT-READINESS.md).

### 6.1 HR & workforce
- **Built:** employee records with statutory identity (PAN encrypted + masked, UAN,
  Aadhaar verification flags); exactly-one-login-per-employee identity model; org
  chart (manager / dotted-line); onboarding; leave accrual; performance review
  cycles; offboarding that revokes access on a **date** via a daily job.
- **Requirement:** every employee-scoped write is tenant-isolated; secondary
  references (manager, reviewer, owner) must be validated to the caller's org.
- **GAP:** leave-policy / exit-rule configuration is API/default-only (no admin UI).

### 6.2 Payroll (India)
- **Built:** salary structures (Base Pay = gross, Basic derived from DA, server
  validated); payroll cycle with `netPay = max(0, gross − deductions)`; PF/ESI/PT/TDS
  computation; VPF and Para 26(6) as configuration; payslip PDF; Form 16 Part B
  (computation, incl. HRA s.10(13A) exemption); EPFO ECR line builder; approval chain
  (2–3 distinct approvers, chain length stamped at creation).
- **Requirement:** the reported statutory wage is the wage the contribution was
  computed on; dates feeding a payroll **period** default to period start, never
  today; user-facing dates never built via `toISOString()`.
- **GAP:** statutory **filing artifacts** (ECR/ESI/PT/24Q as downloadable files) —
  today the data exists as records, not always as filing-ready files; Form 16 **Part A**
  (TRACES challan download) is an external-dependency, issuance-season item.

### 6.3 Service desk & IT operations
- **Built:** tickets with categories/priorities/statuses and SLA timers, auto-assignment
  rules, reopen semantics, bulk update; assets/CMDB with atomic asset-tag allocation;
  change management; on-call; work orders.
- **Requirement:** assignee/owner references validated to org (hardened 2026-08-27).
- **GAP:** SLA policies, ticket categories & priorities are schema-configurable but
  lack admin CRUD screens (hardcoded defaults).

### 6.4 CRM & revenue
- **Built:** leads → deals → accounts pipeline; quotes; quote→invoice handoff;
  contracts; accounting journal entries (debits = credits within tolerance); GST
  engine (intra-state CGST+SGST, inter-state IGST) driven by GSTIN-derived state.
- **Requirement:** identifiers allocated atomically per org (never `Math.random()` or
  `count(*)+1`); lead conversion idempotent on the durable fact.
- **GAP:** contract lifecycle (clause templates, driven approval state machine) is
  partial.

### 6.5 Procurement
- **Built:** purchase orders, vendors, goods receipt, 3-way match (invoice ≈ PO ≈ GRN
  within tolerance), over-receipt guard, cross-tenant line-item protection.

### 6.6 Compliance, GRC & secretarial
- **Built:** GRC create/track paths; compliance tracking surfaces.
- **GAP (significant):** Tier-3 secretarial/statutory registers (XBRL, FEMA/RBI, CCI,
  LODOR, director disclosures, MSME, whistleblower, legal hold) are **table shells with
  no write paths**. A **compliance-matrix truth-fix** is required first: the matrix
  must not seed `status: implemented` over unbuilt tables — a false compliance claim is
  a liability. (Pulled forward as pre-pilot P1.)

### 6.7 Documents & e-sign
- **Built:** document management; server-side PDF generation (PDFKit) for payslip,
  invoice, quotation, Form 16; e-sign event tracking.
- **Requirement:** one PDF mechanism, ASCII-only ("Rs.", not "₹"); documents render
  **stored** totals, and **refuse (409, naming the field) rather than mislead**.
- **GAP:** object storage not yet enabled in production (graceful degradation ships;
  Vultr-compatible client ready — see §10); per-document ACL enforcement is thin.

### 6.8 Command center & dashboards
- **Built (reworked 2026-08-25):** period-windowed executive metrics with sample-size
  floors, honest empty/error states, finance-metric visibility filtering, verified
  drill-through targets, trend-series normalization.
- **GAP:** **global record search never populates its index** (the index-write path is
  defined but not called), so header search finds *modules* but not *records*.

## 7. India compliance requirements (cross-module)

These are product requirements, not optional features:
- **Payroll statutory:** PF composition on Basic+DA; ₹15,000 EPS/EDLI ceiling on the
  wage base upstream; ESI, PT (state-slab driven), gratuity, leave encashment; TDS via
  the income-tax engine.
- **GST:** buyer/supplier state derived from the **GSTIN** (first two digits are the
  state code); both parties normalized to a code before intra- vs inter-state split;
  tax invoice issued only for receivable flows.
- **State vocabulary:** three incompatible lists (PT slab names, GSTIN state codes, ISO
  3166-2:IN) must be normalized — the dropdown must match the PT canonical list.
- **DPDP (data protection):** personal data (PAN, bank, Aadhaar) stored **encrypted**
  (KMS envelope) with masked display and peppered match-hash; never plaintext.

## 8. Cross-cutting requirements

- **Multi-tenancy:** every tenant table carries `org_id` and a row-level-security
  policy; secondary references validated to org (`assertSameOrg`); a committed,
  read-only **cross-tenant scan** gates CI.
- **RBAC:** permission-checked procedures (`module:action`) enforced server-side, plus
  row-level security; ownership expressed via a single helper.
- **Auditability:** append-only audit logs; managed-account operations audited; secure,
  short-lived, marked impersonation for support.
- **Approvals:** a request must route to an approver who can actually approve, in this
  org; idempotent on the durable fact.
- **Notifications:** every notification link must resolve to a real page (CI-gated).
- **Identifiers:** unique per org, allocated atomically from a per-org counter.

## 9. Non-functional requirements (summary; details in TRD)

- **Isolation** is a correctness requirement, not a performance one — a cross-tenant
  leak is a P0 defect.
- **Statutory correctness** verified by money-invariant tests.
- **Availability:** production self-migrates on container boot; a failed migration must
  stop the server rather than serve a half-migrated schema.
- **Observability:** health endpoints must reflect real readiness (encryption, search),
  not merely process liveness.

## 10. Non-goals / out of scope (current)

- **Filing to government portals.** The product **generates**, it does not file. Document
  rendering never contacts a government portal.
- **Net-new surfaces not yet built:** no-code/visual workflow builder, external BI /
  data-warehouse connector, app marketplace, scenario planning, marketing &
  communities modules. Mobile (`apps/mobile`) is parked.
- **A handful of `docs/MANUAL_SET.md` items** (some statutory filing, a few PT states,
  LTA/bonus edge cases) are handled outside the system for the first cycle by design.

## 11. Known gaps & roadmap

Authoritative backlog: [`docs/PILOT-READINESS.md`](PILOT-READINESS.md). Summary:

- **Pre-pilot (P0, ~12–19 dev-days):** object storage (Vultr — definite go); global
  record search (populate the index); admin/config surfaces; named critical workflows
  hardening (procure-to-pay, leave, payroll→statutory, lead-to-cash); compliance-matrix
  truth-fix. Conditional: approvals consolidation, per-doc ACL, billing/paywall — only
  if the pilot exercises them.
- **P1 (before exposing the surface):** Tier-3 secretarial build; contract lifecycle;
  Form 16 Part A (TRACES).
- **P2 (post-pilot evolution):** AI/agent depth, visual automation builder,
  notifications depth, custom-field UX, no-code builder, external BI, mobile unpark,
  app marketplace, scenario planning, marketing/communities.

**Depth caveat:** the larger pilot risk is *depth within "done" modules* (a metric that
renders a confident wrong number, a save that silently no-ops), not breadth. A
module-level click-through of the exact pilot surfaces is budgeted alongside P0.

## 12. Success metrics

- **Compliance correctness:** zero statutory-math defects in a pilot payroll cycle;
  money invariants hold.
- **Isolation:** zero cross-tenant rows (the CI scan and a production scan both clean).
- **Adoption:** a pilot tenant completes a real end-to-end cycle per module they use
  (hire→pay, request→resolve, lead→invoice, PO→receipt) without leaving the system.
- **Honesty of surfaces:** no dashboard or document asserts a number it cannot stand
  behind (refusal over misleading).

## 13. References

- [`CLAUDE.md`](../CLAUDE.md) — operating rules & documented invariants.
- [`docs/PILOT-READINESS.md`](PILOT-READINESS.md) — prioritized gap backlog.
- Newest `docs/PLAN-*.md` — current tactical state & run log.
- [`docs/TRD.md`](TRD.md) — technical requirements & architecture.
- [`README.md`](../README.md) — repo overview.
