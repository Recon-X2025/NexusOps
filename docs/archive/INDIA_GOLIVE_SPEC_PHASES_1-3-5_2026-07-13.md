> **⚠️ SUPERSEDED (2026-07-15) — merged into `docs/INDIA_ROADMAP.md`.**
> Detailed impl spec; several targets (MFA enrollment, DPDP artifacts) have since shipped
> at head `0032_damp_la_nuit`. Retained for its schema/procedure detail. Archived.

# India Go-Live — Detailed Implementation Spec (Phases 1 → 3 → 5)

**Date:** 2026-07-13
**Status:** Draft spec for review (planning only — **no application code written**)
**Scope constraint:** **No external integrations.** Everything here is buildable in-house. The one external touchpoint (notification *delivery*) is abstracted behind a `NotificationDispatcher` interface with a **log-only/persist-to-artifact** implementation; the real email/SMS adapter is deferred to the final external pass. KMS (Phase 4) and SMS-OTP are explicitly **out of scope** here.

Order: **Phase 1 (DPDP engine) → Phase 3 (MFA TOTP) → Phase 5 (DB RLS).** Grounded in the code audit of 2026-07-13; all identifiers below are verified against the codebase.

**Effort labels are relative sizing (S/M/L), not time estimates.**

---

## Shared building blocks (built in Phase 1, reused later)

### B1. Scheduler harness (Temporal Schedules)
- **Where:** `apps/worker` (task queue `"coheronconnect-workflow"`, `apps/worker/src/index.ts:15`).
- **Today:** workflows are triggered externally; **Temporal Schedule API is not used yet**.
- **Build:** a small module that registers recurring "sweep" workflows via Temporal's Schedule API (e.g., every 1h). Each sweep workflow iterates orgs and calls activities. Follow the existing activity pattern: `createActivities(pool)` factory (`apps/worker/src/activities/workflow-activities.ts:125`), raw `pool.query(...)`, idempotent steps via `startStep/finishStep/failStep` on `workflow_step_runs` (UNIQUE `(run_id, node_id)`).
- **Retry:** reuse the proxy config pattern (`proxyActivities` with `maximumAttempts: 5`, backoff — `nexusWorkflow.ts:9`).

### B2. NotificationDispatcher interface (the one external seam)
```
interface NotificationDispatcher {
  dispatch(input: {
    orgId: string;
    channel: "email" | "board" | "principal" | "internal";
    audience: string;            // role name, email, or principal ref
    subject: string;
    body: string;
    relatedType: string;         // "dsr" | "breach" | "consent" | "vuln"
    relatedId: string;
  }): Promise<{ artifactId: string }>;
}
```
- **Now:** `LogOnlyDispatcher` — writes a row to a new **notification artifact table** (below) and logs; performs **no external send**.
- **Later (external pass):** `EmailDispatcher` / `SmsDispatcher` implement the same interface; swap via config. No caller changes.

---

# PHASE 1 — DPDP privacy engine (automation loop)  🔴 BLOCKER · effort S–M

**Goal:** close the automation loops on the already-built DPDP engine (`apps/api/src/routers/compliance.ts`), so DSR/breach/consent clocks *act* on schedule and erasure actually executes — without any external delivery yet.

## 1.1 What already exists (verified — do NOT rebuild)
- **DSR:** `dsr.slaSummary` returns `{total, open, overdue, dueSoon, closed}` (`compliance.ts:324`); state machine `DSR_TRANSITIONS` (`compliance.ts:34`); `dueAt = receivedAt + responseWindowDays*86400000` (`compliance.ts:158`).
- **Consent:** `consent.expireLapsed` mutation already finds & expires lapsed grants, returns `{expired}` (`compliance.ts:538`) — currently only callable manually.
- **Breach:** `breach.slaSummary` with 24h `dueSoon` (`compliance.ts:871`); `notifyDueAt = detectedAt + notificationWindowHours*3600000` (`compliance.ts:663`); per-jurisdiction window via `privacyBreachNotificationProfiles` (`issuer-programme.ts:358`).
- **Tables** (`packages/db/src/schema/issuer-programme.ts`): `dpdpDataSubjectRequests` (l.427), `dpdpDsrEvents` (l.473), `dpdpConsentRecords` (l.528), `dpdpConsentEvents` (l.571), `dpdpBreachIncidents` (l.637), `dpdpBreachEvents` (l.682), `dpdpProcessingActivities` (l.50), `privacyBreachNotificationProfiles` (l.358).
- **Jurisdiction tag:** `dpdpBreachIncidents.jurisdictionCode` + profiles already exist (India default "IN"). DSR/consent do **not** yet carry a regime tag.

## 1.2 New schema (Phase 1)
1. **`dpdp_notification_artifacts`** — the audit-evidence log the dispatcher writes to:
   ```
   id uuid PK, orgId uuid FK→organizations CASCADE,
   relatedType text NOT NULL,           // "dsr" | "breach" | "consent"
   relatedId uuid NOT NULL,
   channel text NOT NULL,               // email | board | principal | internal
   audience text NOT NULL,
   subject text NOT NULL, body text NOT NULL,
   status text NOT NULL DEFAULT 'logged', // logged | sent | failed (future)
   dispatchedAt timestamptz NOT NULL defaultNow,
   createdAt timestamptz NOT NULL defaultNow
   Indexes: (orgId, relatedType, relatedId), (orgId, dispatchedAt)
   ```
2. **Jurisdiction hook (cheap US insurance):** add nullable `regimeCode text DEFAULT 'DPDP'` to `dpdpDataSubjectRequests` and `dpdpConsentRecords` (populate `'DPDP'` only for now). Avoids a painful retrofit later; no behavior change today.
3. **Erasure evidence:** add `erasureExecutedAt timestamptz` + `erasureSummary text` to `dpdpDataSubjectRequests` (records that a fulfilled *erasure* DSR actually purged data).

> Migration discipline (CLAUDE.md): edit `packages/db/src/schema/*`, run `pnpm --filter @coheronconnect/db build`, `pnpm db:generate`, validate against a throwaway real DB copy before `db:migrate`. (Audit note: state is tracked in `drizzle/meta/`, not a `_journal.json`.)

## 1.3 New worker sweeps (reusing B1 + B2)
- **`dsrOverdueSweep`** (hourly): per org, query overdue/dueSoon DSRs (mirror `slaSummary` logic: `closedAt IS NULL AND dueAt < now` / `≤7d`) → `dispatch({channel:"internal", relatedType:"dsr", ...})` to the assigned user/privacy_officer. Idempotent: skip if an artifact for `(dsr, "overdue")` already exists this window.
- **`breachNotifySweep`** (hourly, tighter): per org, find breaches where `principalsNotifiedAt IS NULL AND notifyDueAt` within/over window → dispatch `board` + `principal` notifications; record artifacts. (Does **not** auto-advance state; it surfaces + logs the obligation. Actual state change stays a human action via `breach.transition`.)
- **`consentExpirySweep`** (daily): call the existing `expireLapsed` logic per org (lift it into a shared function callable by both the router mutation and the activity).

## 1.4 DSR erasure executor (internal)
- **Trigger:** when `dsr.transition` moves an *erasure*-type DSR to `fulfilled`, invoke an **erasure executor** that runs a documented **per-table erasure map** (delete or anonymize rows keyed to the principal), then set `erasureExecutedAt` + `erasureSummary`.
- **Erasure map:** a declarative table→strategy list (`delete` | `anonymize` | `retain-with-reason`). **Ships as a draft**; the *rules* require Indian privacy counsel sign-off before running against real data (mechanism is code; the rules are legal input). Guard behind a config flag until signed off.

## 1.5 Tests
- Extend `apps/api/src/__tests__/dpdp-{dsr,consent,breach}.test.ts`: sweep produces artifacts; `expireLapsed` shared fn parity; erasure executor deletes/anonymizes per map and stamps `erasureExecutedAt`; jurisdiction/regime defaults to DPDP.

## 1.6 Exit criteria
Overdue DSRs and due breaches generate **logged notification artifacts** on schedule; consent expiry runs automatically; fulfilled erasure DSRs actually purge/anonymize with evidence. (Real *delivery* of those artifacts is the deferred external pass — see §"Go-live caveat".)

---

# PHASE 3 — MFA (TOTP enrollment)  🟢 · effort M · fully internal

**Goal:** turn the existing MFA *gate* into real TOTP, with **zero external services** (TOTP is pure crypto; SMS-OTP is deferred).

## 3.1 What already exists (verified)
- Gate `assertMfaIfRequired(ctx)` reads `settings.security.requireMfaForMatrixRoles` and `users.mfaEnrolled`, throws `FORBIDDEN("MFA_ENROLLMENT_REQUIRED")` (`apps/api/src/lib/mfa-policy.ts:31`); wired as `mfaGate` middleware (`trpc.ts:554`).
- `users.mfaEnrolled boolean NOT NULL default false` (`packages/db/src/schema/auth.ts:76`).
- Session/token patterns to mirror: `nanoid(32)` + `SHA-256` for sessions (`auth.ts:75`); `randomBytes(32).hex` + `SHA-256` for reset tokens (`auth.ts:415`); bcrypt(12) (`auth.ts:58`).
- Procedure types: `publicProcedure`, `protectedProcedure`, `stepUpGate` (`trpc.ts:280/496/548`).

## 3.2 New schema
1. **`mfa_totp_secrets`**:
   ```
   userId uuid PK FK→users CASCADE,
   secretEnc text NOT NULL,      // TOTP secret, encrypted at rest (existing AES path now; KMS-wrap in Phase 4)
   confirmedAt timestamptz,      // null until first successful verify
   createdAt timestamptz NOT NULL defaultNow
   ```
2. **`mfa_backup_codes`**:
   ```
   id uuid PK, userId uuid FK→users CASCADE,
   codeHash text NOT NULL,       // SHA-256 of one-time code
   usedAt timestamptz,
   createdAt timestamptz NOT NULL defaultNow
   Index: (userId)
   ```
- Reuse `apps/api/src/services/encryption.ts` (`encryptIntegrationConfig`-style AES-256-CBC) for `secretEnc` now; swap to KMS envelope in Phase 4 without schema change.

## 3.3 New procedures (in a new `mfa` router or extend `auth`)
- **`mfa.beginEnroll`** (`protectedProcedure` + `stepUpGate`): generate TOTP secret, store `secretEnc` (unconfirmed), return `otpauth://` URI + secret for QR rendering client-side. **No external QR service** — client renders the URI.
- **`mfa.confirmEnroll`** (`protectedProcedure`): input a TOTP code; verify against secret (TOTP lib, ±1 step drift); on success set `confirmedAt`, `users.mfaEnrolled=true`, generate & return N backup codes (store hashes).
- **`mfa.verify`** (`publicProcedure`, used during login step-up): validate TOTP or a backup code (mark `usedAt`).
- **`mfa.disable`** (`protectedProcedure` + `stepUpGate`): clear secret + codes, set `mfaEnrolled=false`, audit.
- **Login integration:** in `auth.ts` login, if the user has `confirmedAt` set, require a valid `mfa.verify` before issuing the full session (mirror existing `createSession` flow).

## 3.4 Tests
New `mfa-totp.test.ts`: enroll→confirm sets `mfaEnrolled`; wrong code rejected; drift window; backup code single-use; login challenges enrolled users; disable path. Keep TOTP deterministic in tests by injecting a fixed clock/secret.

## 3.5 Exit criteria
A user self-enrolls via any authenticator app, is challenged for TOTP at login/step-up, and can recover via one-time backup codes — **no external provider involved.**

---

# PHASE 5 — Database row-level security (RLS)  🟢 · effort L · fully internal

**Goal:** add a database-level backstop so a query that *omits* `orgId` is still blocked. Pure Postgres + app wiring; no external deps and no legal dependency. Largest/most invasive — do it deliberately, behind a flag, table-group by group.

## 5.1 What exists (verified)
- Manual scoping across ~50 routers; `withOrg(table, orgId)` helper exists but is **unused** (`apps/api/src/lib/with-org.ts:10`).
- Single global postgres.js client singleton via `getDb()` (`packages/db/src/client.ts:170`); **no per-request connection context** today.
- Cross-tenant tests: `apps/api/src/__tests__/tenant-isolation.test.ts`.
- **Zero** existing RLS (confirmed: no `CREATE POLICY` / `ROW LEVEL SECURITY` in any of the 30 migrations).

## 5.2 The hard part — session tenant context
RLS policies read a session variable; today there's no per-request DB context. Options (spec recommends **B**):
- **A. Per-request transaction with `SET LOCAL app.current_org_id = $orgId`** wrapping each authenticated request's DB work. Cleanest isolation, but requires routing queries through a request-scoped tx.
- **B. Wrap the tRPC context's db handle** so the first statement on a checked-out connection issues `SET LOCAL app.current_org_id` inside a transaction per request (middleware in `trpc.ts` sets it from `ctx.orgId`). Least invasive to routers.
- Reserve a migration/admin role with `BYPASSRLS` for the worker/migrator and MAC surface.

## 5.3 RLS migration
- Hand-written migration: for every table with `orgId`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY org_isolation ON <t> USING (org_id = current_setting('app.current_org_id')::uuid);`
- ~50 tables → generate the SQL programmatically from the schema, but commit it as a reviewed static migration. Validate against a throwaway real DB copy (Drizzle diffs its own snapshot — hand-write, don't rely on `db:generate` for policies).
- Roll out **behind a feature flag / per-table-group** to de-risk; verify app still works with the session var set on each group before enabling the next.

## 5.4 Adopt `withOrg`
- As belt-and-suspenders, migrate router queries to the searchable `withOrg(table, orgId)` helper so app-layer scoping stays greppable alongside RLS.

## 5.5 Tests
- Extend `tenant-isolation.test.ts`: run a query **deliberately omitting** the `orgId` filter under a set session var and assert the DB returns zero cross-tenant rows (proving RLS, not app logic, blocks it). Test `BYPASSRLS` role still works for migrator/worker.

## 5.6 Exit criteria
A deliberately unscoped query is blocked by Postgres, not just the application layer; admin/worker paths still function via the bypass role.

---

## Cross-cutting engineering notes (CLAUDE.md)
- **Build order for schema:** `pnpm --filter @coheronconnect/db build` before `apps/api` typechecks see changes. Phases 1, 3, 5 all add tables → follow generate → validate-on-throwaway-DB → migrate each time.
- **Tests:** real Postgres on 5433 (`pnpm docker:test:up`); self-isolating (fresh org per suite).
- **No secrets in code; don't commit unless asked.**

## Go-live caveat (important, not optional polish)
Phase 1's engine will be **complete and tested internally**, but statutory DSR/breach notifications ultimately need a **real delivery channel** — that's the deferred external pass (swap `LogOnlyDispatcher` → email/SMS). So the external pass is the *final step to fully close the go-live gate*, not discretionary. Until then, notifications are logged as artifacts (visible/queryable in-app) but not delivered externally.

## Off-code dependency still to start in parallel
- **Indian privacy counsel** to sign off the Phase 1 **erasure map** + statutory windows before erasure runs against real data. The executor is buildable now; the rules it enforces are a legal input.

---

## Build sequence & what unblocks what
```
Phase 1  ─ B1 scheduler harness ─┐
         ─ B2 dispatcher (log)   ─┼─► reused by Phase 2 (SLA, later) & Phase 4 rotation
         ─ sweeps + erasure + artifact table
Phase 3  ─ TOTP (independent; AES-at-rest now, KMS-wrap in Phase 4)
Phase 5  ─ session-context + RLS migration + tests   (independent; do deliberately)
```

## Decisions before coding
1. **Approve this spec** (or adjust scope per phase).
2. **RLS session-context approach** — confirm Option B (wrap ctx db handle) vs A (per-request tx).
3. **Erasure map ownership** — who confirms the per-table strategy (with counsel).
4. **Where MFA lives** — new `mfa` router vs. extend `auth`.

*This document modified no application code — planning only. SOC 2 / ISO claims remain off all public surfaces until earned.*
