# Auth & RBAC — Audit

Subsystem: **auth-rbac** (who can log in, sessions, multi-factor, and the
permission matrix deciding what each role may do)
Audited against: `docs/quality-bar.md` (rule 6 "endpoints declare authorisation";
Security section; Tests section)
Date: 2026-07-31
Scope: standing code at migration head `0059_volatile_midnight` — not a diff.

---

## 1. In plain English

Logging in is done well: passwords are properly hashed, login is rate-limited,
and multi-factor (the 6-digit authenticator code) is genuinely solid — an
attacker gets exactly one guess per login before they must start over, and the
secret is stored encrypted. That part you can trust.

The problem is what happens **after** login. For speed, the system remembers who
you are in a short-lived memory cache. But several important actions don't clear
that memory: **when an admin deactivates or deletes a user, or changes their
role, the person who is already logged in keeps their old access** — a disabled
user keeps working, and a demoted admin keeps admin powers, for a window of time
(up to 5 minutes for role changes, and for account disabling essentially until
their login token naturally expires, which can be 30 days). "Deactivate user"
does not actually kick anyone out.

Separately, the **"create API key" feature is broken**: the keys it hands out
carry a prefix (`nxk_`) that the login-checker doesn't recognise (it looks for
`nxo_`), so every API key made through the app is dead on arrival — and even if
that were fixed, the per-key permission limits are ignored, so a key silently
inherits its creator's full powers.

The one thing to fix first: **make "deactivate/delete user" immediately end that
user's sessions** (and clear the cache), because "I removed their access and
they still got in" is the kind of failure that turns a routine offboarding into
a breach. It is also completely untested today.

---

## 2. Verdict

The front door (login, password, MFA, rate limiting, fail-closed permission
matrix) is in good shape. The subsystem's weakness is **session and permission
freshness**: identity and permissions are snapshotted into an L1/L2 cache at
first request and are re-validated by almost nothing. Deactivation, deletion,
role change and password-reset do not consistently invalidate that snapshot, and
the session-validation path never re-checks `status`. That converts three
"security controls" (disable, delete, demote) into best-effort-eventually
controls with a silent window. Add a broken API-key path (prefix drift + ignored
scoping) and an auth-critical test gap, and the overall health is **needs
attention**: one BLOCKER-adjacent HIGH (deactivation doesn't revoke access),
several HIGHs, and clear root causes. Nothing here is a cross-tenant leak or a
password/MFA weakness.

---

## 3. Findings

### HIGH

#### H-1 — Deactivating or deleting a user does not end their existing sessions

**Evidence.**
- `deactivateUser` (`apps/api/src/routers/auth.ts:979-984`) sets
  `status: "disabled"` and returns. No `db.delete(sessions…)`, no
  `invalidateSessionCache`.
- `deleteUser` (`auth.ts:1000`) sets `status: "disabled"` and returns. Same —
  no session deletion, no cache invalidation.
- The session-validation path never checks `status`: `fetchSession`
  (`middleware/auth.ts:229-244`) selects the user by id and builds the context
  with no `status` predicate; a full-text search confirms **no** `status` /
  `disabled` check exists anywhere in `middleware/auth.ts` or the `enforceAuth`
  middleware in `lib/trpc.ts`.

**Concrete failure scenario.** An employee is offboarded: an admin calls
"Deactivate user" (or "Delete user"). The employee still has the app open (or a
saved session cookie / bearer token). Their next request finds a live
`sessions` row (`expiresAt` unchanged — "remember me" sets 30 days,
`auth.ts:91-93`) and a user row whose `status` is never inspected, so
`createContext` returns a fully authenticated + authorised context. They
continue reading and writing tenant data — approving invoices, exporting
data — for up to **30 days**, until the token row expires on its own. Login is
blocked (`auth.ts:208`), but they never need to log in again.

**What this means in practice.** "Remove this person's access" doesn't remove
their access. The single most common security action after login — cutting
someone off — silently doesn't work for anyone already signed in.

---

#### H-2 — Role/permission changes are served stale from cache for up to 5 minutes

**Evidence.**
- `updateUserRole` (`auth.ts:955-961`) updates `role`/`matrixRole` and returns.
  No cache invalidation.
- RBAC decisions read the **cached** user object, not the DB:
  `permissionProcedure` (`lib/trpc.ts:574-577`) uses
  `ctx.user.role` / `ctx.user.matrixRole` / `ctx.user.customPermissions`;
  `adminProcedure` (`lib/trpc.ts:635`) uses `ctx.user.role`. Those fields are
  populated once by `fetchSession` and cached in L1 for up to
  `SESSION_CACHE_TTL_MS = 300_000` ms (`middleware/auth.ts:38,100-103`) and in
  Redis L2 for `REDIS_TTL_SECS = 300` s (`auth.ts` L2, `middleware/auth.ts:53`).

**Concrete failure scenario.** A user is abusing admin rights. An admin demotes
them from `admin` to `viewer` via `updateUserRole`. Because nothing clears the
demoted user's cached context, their in-process L1 entry keeps `role: "admin"`
for up to 5 minutes, and every `adminProcedure` / `permissionProcedure` call in
that window passes on the **old** role. The same applies in reverse for
custom-role permission edits — `fetchSession:247-258` resolves a UUID
`matrixRole`'s permissions once and caches them; editing that role's rows in
`role_permissions` does not refresh live sessions.

**What this means in practice.** Revoking a dangerous permission is not
immediate. For up to five minutes after you take away someone's access, they
still have it.

---

#### H-3 — Every API key created through the app is unusable (prefix contract drift)

**Evidence.**
- Keys are minted with an `nxk_` prefix: `createApiKey`
  (`routers/integrations.ts:633`) → `const rawKey = "nxk_" + …`.
- The auth middleware only routes `nxo_` tokens to the API-key branch:
  `middleware/auth.ts:351` → `if (token.startsWith("nxo_"))`. `grep` confirms
  `nxk_` appears only in `integrations.ts` and `nxo_` only in
  `middleware/auth.ts` — the two module halves disagree.

**Concrete failure scenario.** A customer creates an API key in Settings, copies
the `nxk_…` value, and calls the API with `Authorization: Bearer nxk_…`. The
middleware sees a token that does **not** start with `nxo_`, so it skips the
API-key branch, treats the value as a session token, SHA-256-hashes it, finds no
matching `sessions` row, and returns an unauthenticated context. Every
programmatic integration built on app-created keys fails with 401.

**What this means in practice.** The API-key feature looks like it works (the key
is generated and shown once) but no key it produces can ever authenticate. Any
customer automation depending on it is silently dead.

---

#### H-4 — API-key authentication ignores the key's stored permission scope

**Evidence.**
- The `api_keys.permissions` column exists and is populated at creation:
  `packages/db/src/schema/auth.ts:217` (`permissions jsonb … notNull().default({})`);
  `createApiKey` writes `permissions: input.permissions`
  (`routers/integrations.ts:649`).
- The auth middleware never reads it: the `nxo_` branch
  (`middleware/auth.ts:351-386`) resolves the key to `apiKey.createdById`, loads
  that user, and returns the user's full context. `grep` for `.permissions` in
  `middleware/auth.ts` returns nothing — the key's scope is discarded.

**Concrete failure scenario.** An admin creates a deliberately narrow key
(`{ "invoices": ["read"] }`) for a reporting integration. Once H-3 is fixed and
the key authenticates, the request runs as the **creating user** with that
user's full role — e.g. `owner` — so the "read-only invoices" key can create
journal entries, delete records, or manage users. The scoping the customer set
is silently ignored.

**What this means in practice.** "Limited" API keys aren't limited. A key handed
to a third-party tool carries the full power of whoever made it.

---

#### H-5 — Password reset leaves the old session live in cache for up to 5 minutes

**Evidence.**
- `resetPassword` (`auth.ts:797`) deletes the DB session rows but does **not**
  invalidate the L1/L2 cache. The code comment concedes it:
  `// Invalidate all active sessions (cache entries are per-token so we can't
  enumerate them here — Redis keys expire via TTL, good enough)` (`auth.ts:795-796`).
- Contrast `changePassword` (`auth.ts:693-700`), which enumerates the user's
  sessions and calls `invalidateSessionCache(s.id)` for each — the correct
  pattern, absent here.

**Concrete failure scenario.** A user's session token is stolen. The user (or an
admin) triggers "forgot password" and resets it — the standard compromise
response. The `sessions` rows are deleted, but the attacker's token is still in
the L1 in-process cache (TTL up to 5 min, `getL1`/`setL1`,
`middleware/auth.ts:75-111`) and possibly Redis L2. The attacker keeps a valid
authenticated context for up to five minutes **after** the password was changed
to lock them out.

**What this means in practice.** The one action people take when they think an
account is hacked — reset the password — doesn't immediately evict the intruder.

---

### MEDIUM

#### M-1 — Auth-critical branches have no tests; the gaps above are invisible

**Evidence.**
- `layer2-auth.test.ts:128` tests only that a disabled user **cannot log in**
  ("user with status=disabled → FORBIDDEN"). No test exercises a disabled/
  deleted user who **already holds a live session** — the H-1 branch.
- No test touches the `nxo_` API-key branch of `createContext`: `grep` for
  `nxo_`/`nxk_`/API-key auth across `apps/api/src/__tests__/` returns nothing
  relevant (the matches are integration-config tests, not auth). H-3 and H-4
  are completely uncovered — which is why H-3 shipped.
- `auth-rbac.test.ts` checks permission enforcement at a point in time; no test
  demotes a user and asserts the change is effective on the next request, so H-2
  is uncovered.

**Concrete failure scenario.** The quality bar (Tests section) requires "every
failure branch … has a test" and "a test that would still pass with the logic
inverted is a finding." Here the logic could be inverted (e.g. remove the login
`status` check) and the suite would still be green for the post-login paths,
because nothing drives a request through a warm cache after a
status/role/password change.

**What this means in practice.** The safety checks that are missing are also the
ones no test would notice were missing. The suite gives false confidence on
exactly the weakest area.

---

#### M-2 — MFA and step-up "verified" state is keyed to a session token that outlives a password change

**Evidence.**
- `verifyMfa` marks the freshly-minted session MFA-verified via
  `setSessionMfaVerified(session.token)` (`auth.ts:372`), stored in Redis with a
  30-day TTL (per inventory of `mfa-session.ts`). `changePassword` deletes
  sessions and clears their L1/L2 auth cache (`auth.ts:693-700`) but does not
  call `clearSessionMfa` for each revoked session (only `logout` does —
  `auth.ts:300`). Step-up state (`step-up-session.ts`, 15-min TTL) is likewise
  cleared only on `logout`.

**Concrete failure scenario.** Not an auth bypass on its own (the session row is
gone, so the token won't resolve), but the orphaned `mfachal`/step-up Redis keys
for deleted sessions linger until TTL. If a session id were ever reissued or
reused by a future code path that trusts these flags without re-checking the
session, the stale "verified" bit would apply. Today it is dead weight, not an
exploit — hence MEDIUM, and only because the quality bar flags swallowed
lifecycle state.

**What this means in practice.** Some "you already passed MFA / re-auth" markers
aren't cleaned up when sessions are force-revoked. Harmless now; a trap for the
next change to session handling.

---

### LOW

#### L-1 — `x-forwarded-authorization` is trusted unconditionally

**Evidence.** `createContext` accepts an auth token from the
`x-forwarded-authorization` header (`middleware/auth.ts:308`) in addition to the
standard `Authorization` header, with no check that the request actually came
from a trusted proxy.

**Concrete failure scenario.** This is only exploitable if the deployment lets
clients set arbitrary `x-forwarded-*` headers (i.e. the edge proxy does not strip
them). In the documented Vultr/compose deployment the app sits behind a proxy
that would normally overwrite this, so there is no demonstrated exploit path
today — recorded as LOW so the deployment assumption is written down, not
assumed.

**What this means in practice.** A header the app trusts is only safe because the
proxy in front strips it. If that ever changes, it becomes an auth-spoofing
vector.

---

## 4. Root causes

Five of the seven findings collapse into **two** design decisions:

1. **Identity and permissions are cached as a value, but treated as if they were
   live.** `fetchSession` snapshots user + role + custom permissions into L1/L2
   (`middleware/auth.ts:229-275`), and every downstream check
   (`permissionProcedure`, `adminProcedure`, the session path) trusts that
   snapshot without re-reading `status` or permissions. The cache has exactly one
   correct invalidation caller (`changePassword`, `logout`, `revokeSession`);
   every *other* state-changing mutation (`deactivateUser`, `deleteUser`,
   `updateUserRole`, `resetPassword`, custom-role edits) forgets to invalidate.
   This single decision produces **H-1, H-2, H-5, and M-2**. Fixing invalidation
   at the mutation sites — and adding a `status` re-check on the session path so
   disable is enforced even past the cache — closes the whole cluster. **This is
   the decision that matters most.**

2. **The API-key path was written against a contract that the key-minting code
   doesn't honour.** The middleware (`nxo_`, ignores `permissions`) and the
   router (`nxk_`, sets `permissions`) were built in separate sessions and never
   reconciled. This is the classic generated-code "drifted contract between
   modules" and produces **H-3 and H-4** together.

The test gap (**M-1**) is a third, cross-cutting cause: tests assert the
happy-path login and point-in-time RBAC (what the code does) rather than the
lifecycle requirements — disable revokes, demote takes effect, API keys
authenticate and are scoped (what the business needs). That is why every defect
above shipped undetected.

---

## 5. Recommended order of work (by blast radius)

1. **H-1 first — make disable/delete actually cut access.** On `deactivateUser`
   and `deleteUser`, delete the target's `sessions` rows and
   `invalidateSessionCache` each; **and** add a `status !== 'disabled'` check to
   the session-validation path (`fetchSession`) so a disabled account is rejected
   even before its cache entry expires. This is the highest-blast-radius fix:
   offboarding is a routine, high-frequency operation and its failure is a direct
   security exposure.
2. **H-2 + H-5 — invalidate on `updateUserRole` and `resetPassword`** using the
   same enumerate-and-invalidate pattern `changePassword` already uses
   (`auth.ts:693-700`). Consider centralising it as one helper so future
   mutations can't forget.
3. **H-3 then H-4 — reconcile the API-key contract.** Align the prefix (pick one
   of `nxk_`/`nxo_` and use it in both places), then enforce
   `api_keys.permissions` in the API-key branch instead of inheriting the
   creator's full role. Do H-3 before H-4 — there is no point scoping a key that
   can't authenticate.
4. **M-1 — add the missing lifecycle tests** (disabled-user-with-live-session
   rejected; demote effective on next request; API key authenticates and is
   scope-limited). Write these **with** the fixes above so each fix lands with a
   test that would fail if the logic were reverted.
5. **M-2 / L-1 — cleanup and deployment note.** Clear MFA/step-up Redis state on
   forced session revocation; document (or enforce) that the edge proxy strips
   `x-forwarded-authorization`.

The MFA and password-verification core needs no work — it is correct and
single-guess-safe.
