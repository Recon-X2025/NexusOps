# Auth — ITSM-grade QA pack (Seq 11)

**Scope:** **`auth`** router — signup, login (rate limit + bcrypt path), logout, `me`, profile update, password change + reset tokens, invites, org user list / role update / deactivate / delete, session list + revoke.  
**Router:** `apps/api/src/routers/auth.ts`.  
**Client:** `/login`, `/signup`, `/invite/:token`, `/reset-password/:token` (shell).

---

## Part I — API cases

| ID | Persona | Procedure / surface | Expected |
|----|---------|---------------------|----------|
| AUTH-TC-01 | Anonymous | `auth.me` (no session) | `null` (HTTP 200) |
| AUTH-TC-02 | Anonymous | `auth.login` wrong password | `UNAUTHORIZED` / generic message |
| AUTH-TC-03 | Member | `auth.login` correct + `rememberMe` | `sessionId` + user strip hash |
| AUTH-TC-04 | Authenticated | `auth.updateProfile` | Updated fields; no `passwordHash` |
| AUTH-TC-05 | Authenticated | `auth.listMySessions` | Rows + `isCurrent` on active token |
| AUTH-TC-06 | Authenticated | `auth.logout` | DB row removed; **fresh** `createContext` → `me` is `null` |
| AUTH-TC-07 | Org admin | `auth.listUsers` | Org-scoped users |
| AUTH-TC-08 | Org admin | `auth.inviteUser` → `acceptInvite` | New user + session; invite consumed |
| AUTH-TC-09 | Org admin | `auth.deleteUser` (not self) | User removed |
| AUTH-TC-10 | Requester | `auth.inviteUser` / `updateUserRole` | `403` (`users:write`) |
| AUTH-TC-11 | Web | `/login`, `/signup` | No runtime crash (`e2e/auth.spec.ts`) |

---

## Part II — C6 / C7

| Item | Detail |
|------|--------|
| **C6** | Vitest `auth-rbac.test.ts`: **requester** denied `inviteUser` + `updateUserRole`; **admin** passes `listUsers` + `inviteUser`. |
| **C7** | `deactivateUser` sets DB `user_status` **`disabled`** (not invalid enum values); logout awaits **`invalidateSessionCache`** so Redis cannot resurrect revoked sessions. |

---

## Part III — API test harness note

`tRPC` `createCaller` from a **single** `createContext` snapshot keeps **frozen** `ctx`. After `auth.logout`, build a **new** caller (or re-run `createContext`) before asserting `auth.me` — see `layer8-module-smoke` **§8.44**.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 11 C1 |
