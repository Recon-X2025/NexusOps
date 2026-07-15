> **⚠️ SUPERSEDED (2026-07-15) — merged into `docs/INDIA_ROADMAP.md`.**
> Re-verified against code at head `0032_damp_la_nuit`: Phases 2 (Vuln-SLA) and 3 (MFA)
> have since **shipped**. Archived for reference.

# India Go-Live — Phased Development Plan

**Date:** 2026-07-13
**Status:** Draft for review
**Scope:** **India market only** (pilot go-live with real production PII). The US track (CCPA/CPRA privacy rules, US-enterprise MFA hardening, SOC 2 program) is **deferred** behind US OS customization and is out of scope here — except for one cheap forward-hook (jurisdiction-aware design in Phase 1) noted below.

Grounded in the read-only code audit of 2026-07-13. Dominant pattern (per CLAUDE.md): **schema + computation exist; the automation loop is missing.** This plan finishes those loops.

**Effort labels are relative sizing (S/M/L), not time estimates.**

---

## Priority summary

| Phase | Item | Go-live role | Status today | Effort |
|-------|------|--------------|--------------|--------|
| **1** | DPDP privacy engine (automation loop) | **🔴 Launch blocker** | ~90% built | S–M |
| **2** | Remediation SLA escalation | 🟡 Bundle (cheap) | Computation done | S |
| **3** | MFA (TOTP) | 🟢 Early fast-follow* | Gate exists, enrollment missing | M |
| **4** | KMS + secrets rotation | 🟢 Fast-follow | AES works; columns plumbed | M–L |
| **5** | Database row-level security (RLS) | 🟢 Deliberate post-launch | Not started | L |

\* *If any India pilot customer is enterprise-grade, promote Phase 3 (MFA) to near-blocker.*

**Shared infrastructure:** Temporal (`@temporalio` 1.11) is already wired in `apps/worker` with durable workflows, retries, and approval signals. It supports the **Schedule API** (cron-like) but no scheduled compliance sweeps exist yet. Phase 1 builds the reusable schedule harness + notification dispatcher; Phases 2 and 4 reuse them.

---

## Phase 1 — DPDP privacy engine (automation loop)  🔴 BLOCKER

**Why the blocker:** India pilot holds real PII, so DSR response windows and breach-notification deadlines are **statutory from day one**. Mostly built — this is finishing work, not net-new.

**What exists (verified):**
- DSR lifecycle + state machine + `dueAt` clock — `apps/api/src/routers/compliance.ts:87`
- Consent ledger (grant/renew/withdraw, `expireLapsed()`) — `compliance.ts:355`
- Breach register + notification clock (`notifyDueAt`) — `compliance.ts:574`
- Tables — `packages/db/src/schema/issuer-programme.ts:397` (`dpdpDataSubjectRequests`, `dpdpConsentRecords`, `dpdpBreachIncidents` + event logs); per-jurisdiction windows via `privacyBreachNotificationProfiles`
- Tests — `apps/api/src/__tests__/dpdp-{dsr,consent,breach}.test.ts`

**Work items:**
1. **Schedule harness (reusable)** — wrap Temporal Schedule API in `apps/worker` as a generic recurring-workflow runner. *This is the shared building block for Phases 2 & 4.*
2. **Notification dispatcher (reusable)** — one "notify role/person + persist an artifact record" service. *Also reused by Phase 2.*
3. **DSR overdue sweep** — scheduled workflow that reads `slaSummary()` and dispatches alerts on overdue / due-soon DSRs.
4. **Breach notification firing** — at `notifyDueAt`, trigger board + principal notification actions; record artifacts.
5. **Consent expiry automation** — run `expireLapsed()` on a schedule instead of manual mutation.
6. **DSR erasure execution** — when an *erasure*-type DSR reaches `fulfilled`, execute actual deletion/anonymization via a documented **per-table erasure map** (currently the state advances but no data is purged).
7. **Notification artifact log** — new table recording what was sent, to whom, when (audit evidence; today only intent/clock is stored).
8. **Jurisdiction-aware hook (cheap US insurance)** — ensure DSR/consent records carry a regime tag and per-jurisdiction windows, **populating India/DPDP rules only.** Costs little now; avoids a painful retrofit when the US track starts.

**Deliverables:** schedule harness + dispatcher in `apps/worker`; three scheduled workflows (DSR / breach / consent); erasure executor + data map; artifact table + migration; extended DPDP test suites.

**Off-code dependencies (start in parallel — these can become the bottleneck):**
- **Indian privacy counsel** to sign off the **erasure map** and confirm statutory DSR/breach windows (legal call, not engineering).
- Data-model owner to confirm the **per-table erasure map**.

**Exit criteria (go-live gate):** overdue DSRs alert automatically; breach clock fires notifications; consent expiry runs on schedule; erasure actually deletes/anonymizes on fulfilled erasure DSRs; every notification is logged as an artifact; tests green.

---

## Phase 2 — Remediation SLA escalation  🟡 BUNDLE (cheap)

**Why here:** Reuses Phase 1's schedule harness + dispatcher, so marginal cost is low. Computation already done.

**What exists (verified):**
- CVSS→SLA mapping + due-date derivation — `apps/api/src/lib/vuln-sla-policy.ts:74` (Critical 7d / High 30d / Medium 90d / Low 180d)
- `remediationSlaDays` / `remediationDueAt` persisted on create/import — `apps/api/src/routers/security.ts:222`
- Tests — `apps/api/src/__tests__/vuln-sla-policy.test.ts`

**Work items:**
1. **`slaSummary()` for vulnerabilities** — mirror the DPDP pattern (open / overdue / dueSoon).
2. **Daily overdue scan** — scheduled workflow (reuse harness) detecting `remediationDueAt < now` on unresolved vulns.
3. **Tiered escalation + dispatch** — owner → manager → director timeline (reuse dispatcher); log to a new `vulnerabilitySlaEvents` table.
4. **Recompute on re-score** — recompute SLA if `cvssScore` is raised later (currently frozen at create time).

**Deliverables:** `slaSummary` query; scheduled scan workflow; `vulnerabilitySlaEvents` table + migration; escalation-policy config; tests.

**Exit criteria:** overdue vulns are detected and escalate on a tiered schedule with logged notifications.

---

## Phase 3 — MFA (TOTP enrollment)  🟢 EARLY FAST-FOLLOW

**Why here:** The gate already enforces "MFA required" for sensitive roles, but there's no real enrollment — the flag is set manually by an admin. Shipping TOTP closes account-takeover risk on real PII and lets you legitimately list **MFA** as available. *Promote to near-blocker if an India pilot customer is enterprise-grade.*

**What exists (verified):**
- Policy gate `assertMfaIfRequired()` reads `users.mfaEnrolled` + `settings.security.requireMfaForMatrixRoles` — `apps/api/src/lib/mfa-policy.ts:31`
- `users.mfaEnrolled` boolean — `packages/db/src/schema/auth.ts:76`
- Admin manual toggle + session invalidation — `apps/api/src/routers/admin.ts`

**Work items:**
1. **Secret storage** — `users.totpSecret` (encrypted) or dedicated `mfaSecrets` table. Ship on the existing AES path now; re-wrap under KMS in Phase 4 (no dependency block).
2. **Provisioning endpoint** — generate TOTP secret + `otpauth://` URI / QR for authenticator apps.
3. **Verify endpoint** — validate a TOTP code, then set `mfaEnrolled = true` (real proof, not just a flag).
4. **Backup codes** — one-time recovery codes (hashed) table.
5. **Enforce at login/step-up** — require a valid TOTP for enrolled users, not merely the boolean.

**Deliverables:** schema + migration; enroll/verify/disable procedures; backup-code flow; login/step-up integration; tests.

**Exit criteria:** a user can self-enroll via authenticator app, is challenged for TOTP at login/step-up, and can recover via backup codes.

---

## Phase 4 — KMS + secrets rotation  🟢 FAST-FOLLOW

**Why here:** Existing AES-256 is adequate for pilot; KMS is a hardening/audit upgrade. Needs your cloud provisioning.

**What exists (verified):**
- AES-256-CBC via `APP_SECRET` — `apps/api/src/services/encryption.ts:11`
- Plumbed columns `integrations.kmsKeyId`, `dekWrappedB64` (never populated) — `packages/db/src/schema/integrations.ts:32`
- Timing-safe HMAC (keep) — `encryption.ts:40`

**Work items:**
1. **Provider decision** — AWS KMS likely default; decide before building.
2. **Envelope encryption** — per-tenant DEK wrapped by KMS CMK; store `dekWrappedB64` + `kmsKeyId`; unwrap on use.
3. **Rotation** — scheduled DEK re-wrap on CMK version bump (reuse Phase 1 harness); `APP_SECRET` break-glass procedure.
4. **Key-use audit** — log key access (who/when/why).
5. **Migration** — re-encrypt existing `configEncrypted` payloads under the envelope scheme; validate against a throwaway real DB copy (per CLAUDE.md).

**Deliverables:** KMS client wrapper; envelope encrypt/decrypt; rotation workflow; key-use audit table; data-migration script. Keep local AES path for dev/sandbox.

**Ops dependency:** KMS provisioning + prod secret changes require **your cloud credentials** — code is buildable in-house; provisioning is not.

**Exit criteria:** tenant secrets are envelope-encrypted with a KMS CMK, rotation runs on schedule, key use is audited.

---

## Phase 5 — Database row-level security (RLS)  🟢 DELIBERATE POST-LAUNCH

**Why last:** Defense-in-depth, not new capability. Tenant isolation already works at the app layer (~50 routers scope `orgId`; cross-tenant tests pass). RLS is the largest, most invasive change — do it unhurried after launch, not under launch pressure.

**What exists (verified):**
- Manual scoping across ~50 routers; `with-org.ts` helper present but **unused** — `apps/api/src/lib/with-org.ts`
- Cross-tenant tests — `apps/api/src/__tests__/tenant-isolation.test.ts`
- **Zero** Postgres RLS today (no `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` in any migration)

**Work items:**
1. **Session tenant context** — set `app.current_org_id` via `SET LOCAL` per request/connection.
2. **RLS policies** — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` on every `orgId` table, filtering on the session var. Hand-written migration touching ~50 tables, validated against a real DB copy (Drizzle diffs its own snapshot — see CLAUDE.md).
3. **DB role model** — app role subject to RLS; `BYPASSRLS` reserved for migrations/admin jobs.
4. **Adopt `withOrg`** as a searchable belt-and-suspenders alongside RLS.
5. **Tests** — extend `tenant-isolation` to prove RLS blocks a query that *omits* the `orgId` filter.

**Deliverables:** session-context middleware; RLS migration + snapshot + journal entry; role/connection wiring; expanded isolation tests. Roll out behind a flag, table-group by table-group.

**Exit criteria:** a deliberately unscoped query is blocked by the database, not just the app.

---

## Critical path

```
GO-LIVE GATE ► Phase 1 (DPDP engine)          [blocker; build jurisdiction-aware]
   bundle    ► Phase 2 (SLA escalation)        [reuses Phase 1 harness + dispatcher]
POST-LAUNCH  ► Phase 3 (MFA) → Phase 4 (KMS) → Phase 5 (RLS)
```

Build **Phase 1 first** even though Phase 2 is cheap — Phase 1 creates the schedule harness + dispatcher that Phase 2 (and Phase 4 rotation) reuse, and it's the sole statutory launch gate.

---

## Cross-cutting engineering notes (from CLAUDE.md)

- **Migrations:** build `packages/db` (`pnpm --filter @coheronconnect/db build`) before `apps/api` typechecks see schema changes. Hand-write corrective migrations + journal entry + snapshot; validate against a throwaway real DB, not just typecheck.
- **Tests:** run against real Postgres on port 5433 (`pnpm docker:test:up`); tests must self-isolate (fresh org per suite).
- **Schema-touching phases:** 2, 3, 4, 5 all add tables — follow the migration discipline above each time.
- **No secrets in code**; coverage artifacts gitignored; don't commit unless asked.

---

## Decisions needed to start Phase 1

1. **Engage Indian privacy counsel** for the erasure map + statutory windows (parallel to the build — potential bottleneck).
2. **Confirm the per-table erasure map** with the data-model owner.
3. **Confirm Phase 3 (MFA) placement** — keep as fast-follow, or promote to blocker if a pilot customer is enterprise-grade.
4. **Green-light depth** — want Phase 1 spec'd into a detailed implementation plan (schema deltas, procedure signatures, workflow definitions) before any code?

**Recommended next step:** spec **Phase 1** in detail (planning mode, no code) and start the legal/erasure-map track in parallel.

---

*This document modified no application code — planning only. Certification claims (SOC 2 / ISO) remain off all public surfaces until earned.*
