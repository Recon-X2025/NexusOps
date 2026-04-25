# Admin console — staging runbook (Seq 10)

**Route:** `/app/admin` · **API:** `admin.*` procedures.

## Preconditions

- Staging org with at least one **`admin`** or **`owner`** user.
- Optional: seeded tickets so **audit log** and **reports** cross-links are non-empty.

## Smoke checklist

1. **RBAC:** Log in as **requester** — `/app/admin` should redirect or show forbidden (matches web shell); API calls return **403**.
2. **Admin user:** Open `/app/admin` — no React runtime error (`e2e/admin.spec.ts` pattern).
3. **API:** `admin.users.list` returns only users in current org.
4. **API:** `admin.auditLog.list` filters by date — no cross-org rows.
5. **Business rules:** Create a test rule → appears in list → disable → delete; confirm org isolation.
6. **Scheduled jobs:** `trigger` produces an **audit** row (when DB insert succeeds) with `resource_type = scheduled_job`.

## N/A / stubs

- **SLA definitions** / **notification rules:** API may return stubs until migrations land — document in release notes if customers expect persistence.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 10 C3 |
