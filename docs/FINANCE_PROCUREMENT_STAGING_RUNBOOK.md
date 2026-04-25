# Finance & Procurement — staging runbook

**Purpose:** ENV and operational notes to exercise FP hero paths in staging or local dev.

---

## 1. Required ENV

| Variable | Used by | Notes |
|----------|---------|--------|
| `DATABASE_URL` | API, migrations | Must match org with seeded users |
| `REDIS_URL` | API (sessions / rate limit) | Optional in some dev setups; match `docker-compose.dev.yml` if used |

---

## 2. Local dev — restart order (avoid `@nexusops/db` race)

`turbo run dev` can start `@nexusops/api#build` before `@nexusops/db` finishes writing `dist/`, which fails the API bundle.

**Recommended:**

```bash
# From repo root — stop old dev processes first
pkill -f "next dev" 2>/dev/null; pkill -f "tsx watch src/index" 2>/dev/null; sleep 1

pnpm --filter @nexusops/db build
```

**Terminal A — API (port 3001):**

```bash
cd /path/to/NexusOps && pnpm --filter @nexusops/api dev
```

**Terminal B — Web (port 3000):**

```bash
cd /path/to/NexusOps && pnpm --filter @nexusops/web dev
```

Web expects API at **`NEXT_PUBLIC_API_URL`** (see `apps/web/.env.example`); default local is often `http://127.0.0.1:3001`.

---

## 3. Smoke URLs (P1 admin)

- `http://localhost:3000/app/financial`  
- `http://localhost:3000/app/procurement`  
- `http://localhost:3000/app/vendors`  
- `http://localhost:3000/app/finance-procurement`  

---

## 4. N/A / thin integrations

- **Accounting** (`/app/accounting`) — separate COA/GSTR program; not required for FP sign-off.  
- **Bank feeds** — not shipped; N/A.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | FP wave C3 |
