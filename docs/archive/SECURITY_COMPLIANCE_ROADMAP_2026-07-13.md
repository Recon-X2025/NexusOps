> **⚠️ SUPERSEDED (2026-07-15) — merged into `docs/INDIA_ROADMAP.md`.**
> Its 5 items are re-verified there against code at head `0032_damp_la_nuit`:
> Vuln-SLA and MFA have since **shipped** (were "to build" here). Archived for reference.

# Security & Compliance Roadmap

**Date:** 2026-07-13
**Status:** Draft for review
**Scope:** The 5 technical roadmap items surfaced during the website security brief, plus the two certification tracks (SOC 2 Type II, ISO 27001) that depend on them.

This roadmap is **grounded in a read-only audit of the actual codebase** (agent audit 2026-07-13). The dominant finding matches the standing CLAUDE.md theme: **the data models and computation are largely right; the missing piece is the automation loop** — scheduled sweeps, dispatch, and enforcement. Several items are far more complete than the earlier "stubbed" labels implied.

---

## 0. TL;DR — where each item actually stands

| # | Item | Real status (verified) | Missing piece | Relative effort |
|---|------|------------------------|---------------|-----------------|
| 1 | **DPDP tooling** | **~90% built** — routers, tables, state machines, SLA compute all exist | Automation: scheduled DSR/breach/consent sweeps + notification dispatch + erasure execution | **S–M** |
| 2 | **Remediation SLAs** | Computation done (CVSS→SLA, due dates persisted) | Overdue scan + escalation + notification dispatch | **S** |
| 3 | **MFA (TOTP)** | Gate + policy + `mfaEnrolled` flag exist | Enrollment: TOTP secret store, QR provisioning, verify endpoint, backup codes | **M** |
| 4 | **KMS + rotation** | AES-256-CBC works; DB columns (`kmsKeyId`, `dekWrappedB64`) plumbed | KMS provider, DEK wrap/unwrap, rotation, key-use audit | **M–L** |
| 5 | **DB row-level security (RLS)** | Not started; manual `orgId` scoping across ~50 routers | Postgres RLS policies + per-tenant/session DB role + tests | **L** |
| — | **SOC 2 Type II** | Technical controls partial | Items 1–5 + org program + evidence period + CPA audit | **External** |
| — | **ISO 27001** | Technical controls partial | Items 1–5 + ISMS docs + accredited audit | **External** |

**Infrastructure available:** Temporal (`@temporalio` 1.11) is already wired in `apps/worker` — durable workflows, retries, approval signals. It supports the **Schedule API** (cron-like) but no scheduled compliance sweeps are wired yet. This is the natural home for every "automation loop" below.

---

## 1. Sequencing rationale

Ordered by **regulatory/financial risk × build leverage × unblock value** — cheap, high-value automation first; the heavy defense-in-depth and external audits last.

```
Phase A  DPDP automation loop        (biggest legal exposure, mostly done — finish it)
Phase B  Remediation SLA escalation  (cheapest win, reuses same scheduler pattern)
Phase C  MFA TOTP enrollment         (unblocks a real "MFA" website claim + SOC2/ISO)
Phase D  KMS + secrets rotation      (regulatory + enterprise procurement requirement)
Phase E  Database RLS backstop       (defense-in-depth; largest, do deliberately)
Phase F  Compliance program + audits (parallel org track → SOC 2 Type II, ISO 27001)
```

Phases A–E are code (buildable in-house). Phase F is organizational + external attestation and **cannot be replaced by code** — it runs in parallel from the start.

---

## 2. Phase A — DPDP automation loop  *(highest priority)*

**Why first:** Largest India-first legal exposure, and it's ~90% built. The tables, state machines, SLA clocks, RBAC (`privacy_officer`), and tests already exist. What's missing is the loop that *acts* on the clocks.

**What exists (verified):**
- DSR lifecycle + state machine + `dueAt` clock — `apps/api/src/routers/compliance.ts:87`
- Consent ledger (grant/renew/withdraw, `expireLapsed()`) — `compliance.ts:355`
- Breach register + notification clock (`notifyDueAt`) — `compliance.ts:574`
- Tables — `packages/db/src/schema/issuer-programme.ts:397` (`dpdpDataSubjectRequests`, `dpdpConsentRecords`, `dpdpBreachIncidents` + event logs)
- Tests — `apps/api/src/__tests__/dpdp-{dsr,consent,breach}.test.ts`

**What to build:**
1. **Scheduled sweeps (Temporal Schedules)** — daily/hourly recurring workflow that:
   - flags/alerts **overdue DSRs** (`slaSummary` already computes them; wire the dispatch)
   - fires **breach notification** actions at `notifyDueAt` (board + principals)
   - runs **consent expiry** (`expireLapsed()`) automatically instead of manual mutation
2. **DSR erasure execution** — when a DSR of type *erasure* reaches `fulfilled`, execute the actual data deletion/anonymization (currently the state advances but no data is purged). Needs a documented, per-table erasure map.
3. **Notification artifact log** — a table recording *what* was sent, *to whom*, *when* (currently only the intent/clock is stored). Required as audit evidence.

**Deliverables:** scheduled workflows in `apps/worker`; erasure executor + data map; notification dispatch adapter (email/board); artifact table + migration; tests extending the existing DPDP suites.

**Legal caveat:** pair the erasure map and notification windows with an **Indian privacy lawyer** — statutory windows and "data principal rights" interpretation are legal calls, not engineering ones.

---

## 3. Phase B — Remediation SLA escalation  *(cheapest win)*

**Why second:** Reuses the exact same Temporal-schedule + dispatch pattern from Phase A, so marginal cost is low. Computation is already done.

**What exists (verified):**
- CVSS→SLA mapping + due-date derivation — `apps/api/src/lib/vuln-sla-policy.ts:74` (Critical 7d / High 30d / Medium 90d / Low 180d)
- `remediationSlaDays` / `remediationDueAt` persisted on create/import — `apps/api/src/routers/security.ts:222`
- Tests — `apps/api/src/__tests__/vuln-sla-policy.test.ts`

**What to build:**
1. **`slaSummary()` for vulnerabilities** — mirror the DPDP pattern (open / overdue / dueSoon) so there's a queryable overdue set.
2. **Daily overdue scan (Temporal Schedule)** — detect `remediationDueAt < now` for unresolved vulns.
3. **Escalation + dispatch** — notify owner → manager → director on a tiered timeline; log to a new `vulnerabilitySlaEvents` table (when breached, who notified).
4. **Recompute on re-score** — if `cvssScore` is raised later, recompute the SLA (currently frozen at create time).

**Deliverables:** `slaSummary` query; scheduled workflow; `vulnerabilitySlaEvents` table + migration; escalation policy config; tests.

---

## 4. Phase C — MFA TOTP enrollment  *(unblocks a real website claim)*

**Why third:** The gate already enforces "MFA required" for sensitive roles — but there's no way to actually *enroll*, so the flag is set manually by an admin. Shipping real TOTP lets you legitimately list **MFA** under "Available Today" and is a checkbox for SOC 2 / ISO / enterprise buyers.

**What exists (verified):**
- Policy gate `assertMfaIfRequired()` reads `users.mfaEnrolled` + `settings.security.requireMfaForMatrixRoles` — `apps/api/src/lib/mfa-policy.ts:31`
- `users.mfaEnrolled` boolean — `packages/db/src/schema/auth.ts:76`
- Admin manual toggle + session invalidation — `apps/api/src/routers/admin.ts`

**What to build:**
1. **Secret storage** — `users.totpSecret` (encrypted at rest — use the Phase D key path) or a dedicated `mfaSecrets` table.
2. **Provisioning endpoint** — generate TOTP secret + otpauth:// URI / QR for authenticator apps.
3. **Verify endpoint** — validate a TOTP code, then set `mfaEnrolled = true` (real proof, not just a flag).
4. **Backup codes** — one-time recovery codes table (hashed).
5. **Enforce at login/step-up** — require a valid TOTP for enrolled users, not merely the boolean.
6. *(Optional)* SMS OTP fallback — the `smsMsg91` gateway exists; wire an OTP flow if desired (SMS is weaker than TOTP — TOTP first).

**Deliverables:** schema + migration; enroll/verify/disable procedures; backup-code flow; login/step-up integration; tests. Depends on Phase D only if you want the secret KMS-wrapped (otherwise use existing AES path initially).

---

## 5. Phase D — KMS-backed key management & secrets rotation

**Why fourth:** Enterprise procurement and SOC 2/ISO auditors expect managed keys + rotation. The DB plumbing already anticipates it.

**What exists (verified):**
- AES-256-CBC via `APP_SECRET` — `apps/api/src/services/encryption.ts:11`
- Plumbed columns `integrations.kmsKeyId`, `dekWrappedB64` (never populated) — `packages/db/src/schema/integrations.ts:32`
- Timing-safe HMAC for webhooks (keep) — `encryption.ts:40`

**What to build:**
1. **Pick a provider** — AWS KMS is the likely default (envelope encryption). Decide before building.
2. **Envelope encryption** — generate per-tenant DEK, wrap with KMS CMK, store `dekWrappedB64` + `kmsKeyId`; unwrap on use. Replaces the single shared `APP_SECRET` for tenant data.
3. **Rotation** — scheduled re-wrap of DEKs on CMK version bump; `APP_SECRET` break-glass/rotation procedure.
4. **Key-use audit** — log key access (who/when/why) for evidence.
5. **Migration path** — re-encrypt existing `configEncrypted` payloads under the new envelope scheme without downtime.

**Deliverables:** KMS client wrapper; envelope encrypt/decrypt; rotation workflow (Temporal Schedule); key-use audit table; data-migration script (validate against a throwaway DB copy per CLAUDE.md). Keep local AES path for dev/sandbox.

**Ops caveat:** KMS keys, rotation, and any prod secret changes require **your cloud credentials** — I can build the code but cannot provision KMS or touch prod secrets.

---

## 6. Phase E — Database row-level security (RLS) backstop

**Why fifth:** It's defense-in-depth, not a net-new capability — tenant isolation already works at the app layer (~50 routers scope `orgId`, with passing cross-tenant tests). RLS protects against a *single missed `eq(orgId)`* or a direct-SQL/compromised-connection path. Largest and most invasive, so do it deliberately, last.

**What exists (verified):**
- Manual scoping across ~50 routers; `with-org.ts` helper exists but is **unused** — `apps/api/src/lib/with-org.ts`
- Cross-tenant isolation tests — `apps/api/src/__tests__/tenant-isolation.test.ts`
- **Zero** Postgres RLS today (no `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` in any migration)

**What to build:**
1. **Session tenant context** — set `app.current_org_id` (via `SET LOCAL`) per request/connection so policies can read it.
2. **RLS policies** — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` on every `orgId` table, filtering on the session var. Requires a migration touching ~50 tables — hand-written and validated against a real DB copy (Drizzle diffs its own snapshot; see CLAUDE.md).
3. **DB role model** — an app role subject to RLS (superuser/`BYPASSRLS` reserved for migrations/admin jobs).
4. **Adopt `withOrg` helper** — as a searchable belt-and-suspenders alongside RLS.
5. **Tests** — extend `tenant-isolation` to prove RLS blocks even a query that *omits* the `orgId` filter.

**Deliverables:** session-context middleware; RLS migration + snapshot + journal entry; role/connection wiring; expanded isolation tests. Roll out behind a flag, table-group by table-group, to de-risk.

---

## 7. Phase F — Compliance program & external audits  *(parallel, not code)*

**Runs alongside A–E from day one.** These are **organizational + attestation** tracks. Code (Phases A–E) *supports* them but cannot *earn* them.

**SOC 2 Type II**
- CPA-firm attestation over Trust Services Criteria (Security, Availability, Confidentiality, Processing Integrity, Privacy).
- Requires documented policies, access reviews, change management, vendor register, incident response, and an **evidence-collection period** (~3–12 months of controls operating).
- Technical prerequisites map to: MFA (C), KMS/rotation (D), audit logging (done), RBAC (done), tenant isolation (done + E).

**ISO 27001**
- Certified **ISMS**: risk assessment, Statement of Applicability, management review, internal audits, then Stage 1 + Stage 2 audit by an accredited body.

**To start now (org side):** engage a **GRC consultant / vCISO** and a **licensed auditor**; write core policies; stand up access reviews and a vendor/subprocessor register; begin the evidence window. **Do not publish any SOC 2 / ISO claim** (not even "pursuing") until attestation/certification is in hand — consistent with the website decision to omit them entirely for now.

---

## 8. Dependencies & shared building blocks

- **Temporal Schedules** — one scheduling pattern powers A (DSR/breach/consent sweeps), B (SLA scan), D (rotation). Build the schedule harness once in `apps/worker`, reuse everywhere.
- **Notification dispatch adapter** — A and B both need "notify person/role and log the artifact." Build one dispatcher.
- **Encryption/key path** — C's TOTP secrets ideally ride D's envelope scheme; can ship on the existing AES path first and migrate.
- **Migration discipline** — B, C, D, E all add schema. Follow CLAUDE.md: build `packages/db` before API typecheck, hand-write + snapshot + journal, validate against a throwaway real DB.

---

## 9. What I need from you to proceed

1. **Confirm phase order** — or reprioritize (e.g., if a customer needs MFA now, pull Phase C forward).
2. **KMS provider decision** (Phase D) — AWS KMS / GCP KMS / Vault.
3. **Legal engagement** — Indian privacy counsel for Phase A (erasure map, statutory windows); auditor/vCISO for Phase F.
4. **Green-light depth** — do you want each phase spec'd into an implementation plan (like the existing `docs/` gap set) before any code, or build phase-by-phase with a plan per phase?

**Recommended start:** Phase A (finish the DPDP loop) — highest legal ROI, mostly built, and it establishes the scheduler + dispatcher that Phases B and D reuse.

---

## Notes & caveats

- Effort labels (S/M/L) are **relative sizing, not time estimates**.
- This document modified **no application code** — it is planning only.
- Certification claims stay off all public surfaces until earned (per the 2026-07-13 website brief).
