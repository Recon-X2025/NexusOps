# Audit — secrets-kms-integrations

_Audited 2026-07-31 against `docs/quality-bar.md`. Standing-code audit, not a diff._

Scope: the envelope-encryption layer (`services/kms.ts`, `services/encryption.ts`),
the at-rest storage of integration secrets / OAuth tokens / TOTP seeds, and the
outbound connectors to third-party portals (Razorpay, Microsoft 365, Google
Workspace, ClearTax, EPFO, NIC e-way, MCA21, PT/ESI, Slack, WhatsApp, SMS).
Governing rule: quality-bar #9 — integration secrets are KMS envelope-encrypted
before storage; storing one in plaintext is a BLOCKER.

---

## 1. In plain English

The core vault is well built. When you connect an integration (a payment
gateway, a filing portal), its API keys are sealed with real authenticated
encryption before they touch the database, the master key can live in AWS's key
service in production, and the app refuses to start if that is misconfigured.
The tests for this part are genuinely good.

There is one real hole, and it is narrow but clear-cut: when a user signs in
through their company's Microsoft/Google login (single sign-on), the access and
refresh tokens that come back are written into the database **in plain text** —
not through the vault that every other secret goes through. Those particular
tokens happen not to be read back by anything today, so nobody is actively
abusing them, but they are live credentials sitting unencrypted, and the quality
bar explicitly calls that a blocker. That is the one thing to fix first.

Beyond that, two smaller issues: the "connect this integration" flow doesn't
check the anti-forgery token it hands out, and none of the outbound calls to
external portals have a time limit, so a portal that accepts a connection but
never answers can hang a request indefinitely. Neither is catastrophic, but both
are the kind of thing that bites under real-world conditions.

---

## 2. Verdict

The envelope-encryption machinery (`kms.ts`/`encryption.ts`) is production-grade:
AES-256-GCM with per-payload data keys, authenticated key-wrap, plaintext-DEK
scrubbing, a versioned on-disk format with backward-compat, and a boot guard that
fails a misconfigured production deploy. The integrations-router and workflow
paths route every secret through it correctly. The defect is at the **edges** the
vault doesn't cover: the SSO login path (`oidc.ts`) writes OAuth tokens straight
to `accounts` in plaintext, bypassing the vault entirely. That is a genuine
rule-#9 BLOCKER even though its current blast radius is limited by the tokens
being write-only. The rest is boundary-hardening (OAuth state, fetch timeouts).

---

## 3. Findings

### BLOCKER

#### B-1 — SSO OAuth access/refresh tokens are stored in plaintext, bypassing KMS

`apps/api/src/services/oidc.ts:157-158` (insert) and `:166-167` (update), into
`accounts.accessToken` / `accounts.refreshToken`
(`packages/db/src/schema/auth.ts:181-182` — bare `text` columns, no envelope).

Every other secret in the system goes through `encryptIntegrationConfigEnvelope`
/ `encryptSecretEnvelope` before storage. The OIDC login path does not: it takes
the IdP's token response and writes `accessToken: tokens.access_token`,
`refreshToken: tokens.refresh_token` directly. The columns hold the raw token.

**Concrete failure:** A user signs in via Microsoft Entra SSO. The IdP returns an
access token (Graph scope) and a long-lived refresh token. Both land in
`accounts` as cleartext. Anyone with read access to that table or a database
backup — a DBA, a leaked dump, a `pg_dump` in an unencrypted artifact — reads a
live Microsoft refresh token and can mint Graph access tokens for that user until
it is revoked. Contrast the integrations table, where the same class of Microsoft
refresh token (stored via the connector flow) is sealed in a `v2:` envelope
(`integrations.configEncrypted`).

**What this means in practice:** The product stores live single-sign-on
credentials unencrypted, which is exactly the exposure the KMS layer exists to
prevent. The quality bar names "OAuth tokens" as must-encrypt and plaintext
storage as a BLOCKER.

> Blast-radius note (why it is still ranked first but is not a live breach
> today): a repo-wide search shows **nothing reads `accounts.accessToken` /
> `refreshToken` back** — the SSO path uses them only to establish a session, and
> Graph calls use the separately-stored integration config. So the tokens are
> currently write-only dead weight. They are nonetheless real, un-expired
> credentials at rest in plaintext, and the moment any feature starts consuming
> them the exposure becomes active. Not accepted debt: `GAP_ANALYSIS.md` has no
> entry for this, and quality-bar #9 lists it as a blocker.

### HIGH

#### H-1 — OAuth connect callback never validates the anti-CSRF `state` nonce

`apps/api/src/http/integration-oauth.ts:20` mints `state = randomUUID()` on
`begin`, but the `callback` handler (`:44-47`) only *splits* the returned state to
extract `orgId` — it never checks the nonce against anything stored. There is no
`oauth_state` table and no `verificationTokens` lookup in this file (grep: no
match).

**Concrete failure:** An attacker constructs a callback URL
`/api/integrations/oauth/microsoft_365/callback?code=<attacker_code>&state=<victimOrgId>:<any-uuid>`
and induces a logged-in victim to hit it (classic OAuth CSRF). Because the
handler trusts `state` without verifying the nonce it issued, it runs
`completeOAuth` with the attacker's `code`, and connects the *attacker's*
Microsoft/Google account as the victim org's integration — sealing the
attacker's tokens into the victim org's `integrations` row. Subsequent org
emails/calendar events flow through an account the attacker controls.

**What this means in practice:** The integration-connect flow can be tricked into
binding an outsider's third-party account to a customer's org, because the
one check that prevents it (matching the state nonce) is missing.

#### H-2 — Outbound connector calls have no timeout; a hung portal blocks the request unbounded

Every connector `fetch` is bare — no `AbortSignal.timeout`. Examples:
`razorpay.ts:42,49`; `microsoft-365.ts:84,110,158,197,219`. The `test` action
runs one of these inside a live tRPC mutation (`routers/integrations.ts:467`,
`adapter.test(config)`), and there is **no global request/socket timeout** at the
server layer (grep of `index.ts` for `requestTimeout`/`connectionTimeout`/
`setGlobalDispatcher`: no match).

**Concrete failure:** An admin clicks "Test connection" for Razorpay while
`api.razorpay.com` (or a state filing portal) accepts the TCP connection but
never sends a response — a common failure mode for overloaded government GSP
endpoints. `adapter.test` awaits the `fetch` forever; the tRPC handler never
returns; the connection and its worker slot are held until the client gives up.
Enough of these exhaust the request pool.

**What this means in practice:** A single slow or half-dead external portal can
tie up server capacity, because nothing bounds how long the app waits for it. The
quality bar's performance rule ("a handler that can run unbounded is a finding")
applies directly.

### MEDIUM

#### M-1 — `resolveConnectedConfig` swallows a decrypt failure into "not connected"

`apps/api/src/services/integrations/registry.ts:70-75`: a failed
`decryptIntegrationConfigEnvelope` is caught, logged, and returns `null`, which
callers treat identically to "no integration configured."

**Concrete failure:** The KEK rotates or `APP_SECRET` changes (local provider) so
existing envelopes can no longer unwrap. Every affected org's integration
silently reads back as *not connected*: send-email and calendar workflows
(`workflows/actions/send-email.ts:31`) find `null` and skip, statutory-filing
workflows find no config and no-op. No alert distinguishes "never configured"
from "configured but undecryptable."

**What this means in practice:** A key-management mistake degrades to silent
integration outage rather than a loud, diagnosable failure — filings and
notifications quietly stop instead of erroring.

#### M-2 — Legacy AES-256-CBC secrets remain readable with no migration or deprecation path

`apps/api/src/services/encryption.ts:42-52,135-150`: the envelope readers fall
back to `legacyDecrypt` (unauthenticated CBC under an `APP_SECRET`-derived key)
for any non-`v2:` blob, indefinitely. Nothing re-wraps legacy rows into the
envelope format.

**Concrete failure:** An integration configured before the G15 KMS rollout keeps
its secret in the weaker CBC format forever — no auth tag (tamper-detection
absent), and its key is `APP_SECRET`-derived rather than KMS-wrapped, so it does
not benefit from the AWS-KMS master-key protection the boot guard assumes in
production. There is no report of which rows are still legacy.

**What this means in practice:** Older integrations silently sit on the weaker
pre-KMS encryption with no visibility and no forced upgrade; the security posture
the quality bar assumes (KMS envelope) is not actually uniform across rows.

---

## 4. Root causes

1. **The vault covers the paths its author was thinking about, not every path a
   secret takes.** The integrations router and the workflow dispatchers route
   through `encryption.ts` faithfully; the SSO login path (`oidc.ts`, written as
   a separate concern) never got the same treatment and writes tokens raw (B-1).
   Same shape as the DPDP finding earlier: a correct mechanism with a path that
   bypasses it.

2. **External boundaries are coded for the happy response, not for hang/forgery.**
   H-1 (no state validation) and H-2 (no fetch timeout) are both the "what if the
   other side misbehaves" branch never being written — the connector assumes the
   portal answers promptly and the callback assumes the caller is honest.

3. **Backward-compat was added as a permanent reader, not a migration.** M-1 and
   M-2 both stem from "keep reading the old format / degrade to null" being the
   whole plan — there is no re-encrypt sweep and no signal when the compat path
   is actually taken, so weaker/legacy state persists invisibly.

---

## 5. Recommended order of work (by blast radius)

1. **B-1 — route SSO OAuth tokens through the envelope**, or stop persisting them
   if nothing consumes them. It is the one standing rule-#9 violation; fix it
   before any feature starts reading those tokens and turns dead plaintext into a
   live exposure.
2. **H-1 — validate the OAuth `state` nonce** in the connect callback, so a
   customer's org cannot be bound to an attacker's third-party account.
3. **H-2 — put a bounded timeout on every connector `fetch`** (and/or a global
   request timeout), so one hung portal cannot exhaust request capacity.
4. **M-1 — distinguish "undecryptable" from "not connected"** so a key mishap is
   loud, not a silent integration outage.
5. **M-2 — inventory and re-wrap legacy CBC rows** so the KMS posture is uniform.

Sound as-is (no action): the envelope codec and KMS providers
(`kms.ts`/`encryption.ts`) — AES-256-GCM, per-payload DEKs, authenticated
key-wrap, plaintext-DEK scrubbing, boot guard; the integrations-router write path
(`integrations.ts:317`) and workflow decrypt paths; the KMS test suite
(`kms-encryption.test.ts`), which asserts the requirement (plaintext absent from
blob, fresh DEK per call, tamper-detection on both ciphertext and wrapped-DEK,
cache behaviour, boot-guard branches) rather than the implementation. TOTP seeds
(`auth.ts:432`/`457`) and API keys (`apiKeys.keyHash`, hash-only) are stored
correctly.

---

_No source files were modified. This report reads and describes standing code only._
