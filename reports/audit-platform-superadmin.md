# Audit — platform-superadmin

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing code, not a diff._

Scope: the cross-tenant super-admin control plane — the tRPC `mac.*` router
(`apps/api/src/routers/mac.ts`), its gate (`apps/api/src/lib/trpc.ts`
`enforceMacOperator` / `macProcedure`), the parallel REST surface
(`apps/api/src/http/super-admin.ts`, mounted at `/super-admin/*`), the
`super_admin_audit_logs` table (`packages/db/src/schema/audit.ts`), and the
`apps/mac` console. This is the one plane in the product that deliberately reads
and writes **every tenant's** data at once, so its blast radius is the whole
customer base.

---

## 1. In plain English

There are **two different doors** into the super-admin powers, and they don't
have the same lock. The main door (the one the admin console uses day to day) is
well built: it's switched off by default, refuses to open without the right key,
and fails safely if the key is missing. But there's a **second door** — a set of
web addresses under `/super-admin/` — that stays unlocked even when the operator
has flipped the master "super-admin off" switch. Anyone still holding a valid
operator token (which lasts 12 hours) can walk through that second door and read
every customer's tax IDs, suspend companies, or edit their onboarding data, even
though the operator believes the whole super-admin system is turned off. That's
the one thing to fix first.

Two more things matter. First, when a super-admin reads a company's record
through that second door, the response hands back **raw, unmasked legal and tax
identifiers** (PAN, TAN, GSTIN, CIN) — the kind of sensitive data the rest of the
platform is careful with. Second, the log that is supposed to record what
super-admins do is **incomplete and not tamper-proof**: most of the powerful
actions (creating a company, revoking everyone's sessions, changing a company's
plan/billing) write **no record at all**, and the records that do get written can
be silently edited or deleted afterwards because — unlike the normal tenant audit
log — this one has no tamper-evident chain. If a super-admin account is ever
misused, you would not be able to prove what happened.

Nothing here is a live remote break-in on its own: all of it still requires a
valid operator token. The danger is what a **leaked token or a rogue/compromised
operator** can do, and how little of it you could reconstruct afterwards.

---

## 2. Verdict

The authentication *gate* on the tRPC plane is genuinely solid — fail-closed,
role-checked, hidden-when-disabled. The problems are all on the **surrounding
surface**: a second (REST) entry point that ignores the master kill-switch, raw
PII in responses, and an audit trail that is both patchy and not tamper-evident.
This is the classic "two sessions, two contracts" failure mode — the REST routes
and the tRPC router were clearly built at different times and never reconciled to
one security posture. No cross-tenant *leak between customers* exists (the plane
is cross-tenant **by design** and correctly gated), and there is no
unauthenticated bypass. Health: **usable, but not yet trustworthy for an
audited/regulated deployment** until the kill-switch asymmetry and the audit gaps
are closed.

---

## 3. Findings

### HIGH

#### H-1 — REST `/super-admin/*` ignores the `MAC_ENABLED` kill-switch (tRPC plane hides, REST plane does not)

- **Where:** `apps/api/src/http/super-admin.ts:18-37` (auth preHandler) and
  `apps/api/src/index.ts:732-733` (unconditional registration). Contrast with
  the tRPC gate `apps/api/src/lib/trpc.ts:311-313`
  (`if (process.env["MAC_ENABLED"] !== "true") throw NOT_FOUND`) and
  `apps/api/src/routers/mac.ts:15-19` (`assertMacEnabled`).
- **Offending code** (super-admin.ts:18-37): the preHandler checks `Bearer`
  prefix, `MAC_JWT_SECRET`, `jwt.verify`, and `payload.role === "mac_operator"`
  — but **never checks `MAC_ENABLED`**. The plugin is registered at
  index.ts:733 with no guard, so all six routes are always mounted.
- **Concrete failure scenario:** An operator treats `MAC_ENABLED=false` as the
  master off-switch for the entire super-admin plane (that is exactly what the
  tRPC side does — `mac.stats()` returns `NOT_FOUND` when disabled, per
  `mac-auth.test.ts:66-74`). A 12-hour operator token was issued earlier (or
  leaked via logs/a laptop). After the operator "turns off" MAC, that token still
  succeeds against `DELETE /super-admin/orgs/:orgId` (suspend a live tenant),
  `PUT /super-admin/orgs/:orgId` (rewrite onboarding/GSTIN), and
  `GET /super-admin/orgs` (dump every tenant's PII). The kill-switch the operator
  relied on covered only half the attack surface.
- **What this means in practice:** Your "super-admin is off" switch doesn't
  actually turn off super-admin. In an incident (suspected token leak) disabling
  MAC gives false assurance — the REST door is still open to anyone with a valid
  token until that token expires or the secret is rotated.

---

### MEDIUM

#### M-1 — `super_admin_audit_logs` is not tamper-evident, and most privileged actions write no audit row at all

- **Where:** schema `packages/db/src/schema/audit.ts:4-21`; write sites
  `apps/api/src/http/super-admin.ts:214-220` (flag), `:240-246` (suspend),
  `apps/api/src/services/orgWizardWrite.ts:176` (wizard write). Contrast the
  tenant hash chain `packages/db/src/schema/auth.ts:315-324`
  (`seq` / `prevHash` / `entryHash`, "Any mutation, deletion, or reordering of
  historical rows breaks the chain and is detectable via verifyAuditChain").
- **Offending facts:**
  1. `super_admin_audit_logs` has **no `seq`/`prevHash`/`entryHash`** — it is a
     plain append table. A row can be `UPDATE`d or `DELETE`d with no detectable
     break (the tenant `audit_logs` cannot).
  2. The following privileged `mac.*` mutations write **no audit row**:
     `createOrganization` (mac.ts:151), `suspendOrganization` (mac.ts:184),
     `resumeOrganization` (mac.ts:211), `revokeOrgSessions` (mac.ts:240),
     `updateBillingInfo` (mac.ts:314), `setFeatureFlag` (mac.ts:351),
     `resetFeatureFlags` (mac.ts:368), `startImpersonation` (mac.ts:396). Only the
     REST `flag`/`suspend` routes and the wizard write persist anything.
- **Concrete failure scenario:** An operator uses the tRPC console to
  `suspendOrganization` a competitor-tenant, `revokeOrgSessions` (logs every user
  in an org out), then `resumeOrganization` — none of it recorded. Separately, a
  compromised operator who *did* trip the REST `SUSPEND_ORG` row (super-admin.ts:243)
  simply `DELETE`s that row afterward; because there is no hash chain, the
  deletion is undetectable. Post-incident you cannot answer "who suspended
  Acme Corp and when."
- **What this means in practice:** The super-admin log cannot be relied on as
  evidence. For a plane that can touch every customer, that is a compliance and
  forensics hole. Note: quality-bar rule #4's BLOCKER language is about the tenant
  hash chain specifically; this is a *separate* table, so it is scored MEDIUM
  rather than BLOCKER — but it is the same class of risk one level down.

#### M-2 — REST `GET /super-admin/orgs` and `GET /orgs/:orgId` return raw, unmasked PII (PAN/TAN/GSTIN/CIN)

- **Where:** `apps/api/src/http/super-admin.ts:84-91` (list) and `:150-157`
  (single) — the `compliance` object returns `pan`, `tan`, `epfCode`,
  `primaryStateCode`, `gstin`, `cin` verbatim from `legalEntities` /
  `gstinRegistry`.
- **Concrete failure scenario:** A single authenticated
  `GET /super-admin/orgs?limit=200` returns every tenant's statutory identifiers
  in one unmasked page. Combined with H-1 (the route answers even when MAC is
  "disabled") and M-1 (that read is not audited), a leaked token yields a silent
  bulk export of regulated identity data for the entire customer base.
- **What this means in practice:** The most sensitive fields the platform holds
  leave the building in bulk, unmasked and unlogged, through the door that
  ignores the kill-switch. Quality-bar rule #5 leaves PII-in-statutory-output as
  an open question, so this is scored MEDIUM (fragile / policy-dependent) rather
  than a definite BLOCKER — but it is the finding most worth a policy decision.

---

### LOW

#### L-1 — `startImpersonation` mints a token and redirect URL that nothing consumes (non-functional, and would leak the token in the URL if it ever worked)

- **Where:** `apps/api/src/routers/mac.ts:396-418`. Signs a token with
  `JWT_SECRET` carrying `{ sub, impersonated: true, reason, exp }` and returns
  `redirectUrl: .../app?token=<jwt>`.
- **Why it is only LOW:** the tenant auth path does **not** `jwt.verify` bearer
  tokens — it hashes the token and looks it up in the `sessions` table
  (`apps/api/src/middleware/auth.ts:200-268`). No code path consumes an
  `impersonated:true` JWT: `routers/auth.ts` has no `impersonated`/`sub`
  handling, and no `apps/web` route reads `?token=`. So the procedure is a
  **dead last-mile stub** — it cannot currently grant access, hence not an auth
  bypass.
- **Concrete failure scenario (latent):** the day someone wires the
  `?token=` handoff to actually establish a session, two defects ship together:
  (a) it is **not audited** (M-1) — operators could log in as any tenant user
  with no record; (b) the token rides in the **URL query string**, landing in
  browser history, referer headers, and access logs. This matches the CLAUDE.md
  anti-pattern "mock/placeholder in the last mile."
- **What this means in practice:** Impersonation looks implemented but isn't; do
  not rely on it, and do not complete it without adding an audit write and moving
  the token out of the URL.

---

## 4. Root causes

1. **Two surfaces, one privilege, never reconciled.** The tRPC `mac.*` router and
   the REST `/super-admin/*` plugin implement overlapping powers with
   *different* security postures — the tRPC side is fail-closed and
   `MAC_ENABLED`-gated; the REST side authenticates identically but forgot the
   kill-switch and returns richer (raw-PII) payloads. H-1 and M-2 both fall out
   of this split. The fix is to make the REST plane inherit the exact same gate
   as `enforceMacOperator` (including `MAC_ENABLED`), or route it through the same
   middleware, so there is one contract, not two.

2. **Audit was added per-endpoint as an afterthought, not as an invariant.** The
   super-admin log is written at three hand-picked call sites and skipped
   everywhere else, on a table that (unlike the tenant chain the team already
   built) has no tamper-evidence. M-1 is the symptom; the cause is that "every
   super-admin mutation must leave a tamper-evident record" was never enforced as
   a structural rule the way per-org RLS and the tenant hash chain were.

3. **Placeholder shipped as if finished.** `startImpersonation` returns a
   plausible token+URL with no consumer — the "capture without consequence"
   pattern. It reads as a working feature in the console but is inert, which is
   worse than an obvious TODO because a future dev may "finish" it by wiring the
   URL handoff and inherit the un-audited, token-in-URL defects wholesale.

---

## 5. Recommended order of work (by blast radius)

1. **Close the kill-switch gap (H-1).** Add the `MAC_ENABLED !== "true"` check to
   the REST preHandler (super-admin.ts:18-37) — or gate the registration at
   index.ts:733 — so `/super-admin/*` behaves like the tRPC plane when disabled.
   Biggest blast radius: it re-arms the switch operators already believe they
   have.
2. **Make the super-admin audit complete and tamper-evident (M-1).** Give
   `super_admin_audit_logs` the same `seq`/`prevHash`/`entryHash` chain as
   `audit_logs`, and write a row from *every* `mac.*` mutation (create/suspend/
   resume/revoke-sessions/billing/feature-flag/impersonate), not just three REST
   routes.
3. **Decide the PII-masking policy for super-admin reads (M-2).** Either mask
   PAN/TAN/GSTIN/CIN in the list/detail responses (super-admin.ts:84-91,150-157)
   or gate the unmasked view behind an explicit, audited "reveal" action. This is
   a policy call tied to quality-bar rule #5.
4. **Do not finish `startImpersonation` (L-1) until 1–3 are done.** When wired,
   audit it and move the token out of the URL.

---

## 6. Tests — do they actually guard this?

- `apps/api/src/__tests__/mac-auth.test.ts` — **good negative coverage of the
  tRPC gate:** MAC disabled → `NOT_FOUND` (incl. `login`); no token / wrong-secret
  token / valid-signature-wrong-role → `UNAUTHORIZED`; valid login token accepted.
  These would fail if the gate logic were inverted. This is the strongest part of
  the suite.
- `apps/api/src/__tests__/mac-surface-guarded.test.ts` — a **static regex guard**
  asserting only `login` uses `publicProcedure`. Useful as a regression tripwire,
  but it inspects source text, not behaviour: it would not catch a `macProcedure`
  whose *implementation* leaks cross-tenant data, and it says nothing about the
  REST plane.
- **Uncovered branches (named):**
  - The entire REST `/super-admin/*` surface (super-admin.ts) — **no test**. In
    particular H-1's missing `MAC_ENABLED` check on the preHandler is asserted by
    nothing; a test that hits `GET /super-admin/orgs` with `MAC_ENABLED` unset and
    a valid token would currently **pass with the data returned**, proving the
    gap.
  - The audit-write branches (M-1): no test asserts that `createOrganization`,
    `revokeOrgSessions`, `updateBillingInfo`, `setFeatureFlag`, or
    `suspendOrganization` persist a `super_admin_audit_logs` row — so their total
    absence of auditing is invisible to CI.
  - Impersonation (L-1): no test; the fact that the minted token grants no access
    is unverified in either direction.
  - PII exposure (M-2): no test asserts whether `compliance.pan`/`gstin`/etc. are
    masked, so a future mask (or its removal) is untracked.

_No BLOCKER found. Highest severity is HIGH (H-1). No source files were modified._
