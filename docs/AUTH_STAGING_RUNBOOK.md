# Auth — staging runbook (Seq 11)

**Surfaces:** `/login` · `/signup` · `/invite/:token` · `/reset-password/:token` · **API** `auth.*`.

## Preconditions

- `DATABASE_URL` / Redis available for session + rate-limit keys.
- `AUTH_URL` (or app origin) correct for invite and reset links in logs/email.

## Smoke checklist

1. **Anonymous:** `auth.me` → `null`.
2. **Login:** Valid tenant user → dashboard redirect in web; invalid password → stay on login with error (no user enumeration).
3. **Logout:** Session removed; refresh / new `me` → unauthenticated.
4. **Invite:** Admin sends invite → accept with new password → lands in app; invited user appears in `listUsers`.
5. **RBAC:** Non-admin cannot open user-invite flows in API (`403` on `inviteUser`).
6. **Rate limit:** Rapid login attempts hit `TOO_MANY_REQUESTS` per env (`LOGIN_RATE_PER_MIN`).

## N/A / follow-ups

- **Email delivery** for reset/invite may still log URL to stdout in dev — confirm SES/SMTP before customer demo.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 11 C3 |
