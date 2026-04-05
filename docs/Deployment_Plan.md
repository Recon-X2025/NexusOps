# NexusOps — Deployment plan (Vultr and beyond)

This document improves on the old model: **manual `rsync` + remote `docker compose build`**, **CI images to GHCR that production did not pull**, **PostgreSQL on the WAN**, and **placeholder GitHub deploy jobs**.

### Implemented in this repo (gap fixes)

| Item | What changed |
|------|----------------|
| **Postgres exposure** | `127.0.0.1:5432:5432` in `docker-compose.vultr-test.yml` |
| **GHCR pull deploy** | `docker-compose.vultr.images.yml` + `scripts/vultr-remote-deploy.sh`; `push-to-vultr.sh` defaults to `DEPLOY_MODE=pull` and `up --no-build` after `pull` |
| **On-server build fallback** | `DEPLOY_MODE=build bash scripts/push-to-vultr.sh` |
| **CI honesty** | Removed no-op staging/production/smoke jobs from `ci.yml` |
| **GitHub deploy** | `.github/workflows/deploy-vultr.yml` (`workflow_dispatch`; needs `VULTR_HOST` + `VULTR_SSH_PRIVATE_KEY` secrets) |
| **Firewall helper** | `scripts/harden-vultr-firewall.sh` (UFW; run once on VPS) |
| **API startup order** | `api` `depends_on` `meilisearch` (healthy) |

---

## 1. Where you were (historical snapshot)

| Area | Current behavior | Risk / cost |
|------|------------------|-------------|
| **Delivery** | Laptop → `rsync` → `/opt/nexusops` → on-VPS `docker compose build` | Slow, non-reproducible, no immutable artifact per commit |
| **CI** | `main` builds and pushes `web` / `api` to `ghcr.io` | Images are not what the VPS runs unless you wire pull |
| **Secrets** | `.env.production` only on server (good), excluded from rsync | No rotation runbook; no sealed/encrypted backup story in repo |
| **Database** | Postgres port mapped to host | **Critical:** if bound to all interfaces, the internet can reach Postgres |
| **Migrations** | Mixed: bootstrap script vs ad-hoc; API “seed” in push script is best-effort | Risk of app starting before schema is ready |
| **Rollback** | Re-sync old tree + rebuild, or manual image tags | No one-command rollback |
| **Staging** | Same host / same flow as prod or absent | Changes hit “prod-like” without isolation |
| **CD** | None from GitHub to Vultr | Human in the loop every time |

---

## 2. Target principles

1. **One immutable artifact per commit** (image digest), promoted through environments.
2. **Server does not compile** — it **pulls** images and restarts; optional tiny config-only sync.
3. **Secrets never in git** — server env, SOPS, or a host secret manager; CI gets deploy tokens only.
4. **Database not on the public Internet** — bind to loopback or private network; admin access via SSH tunnel or VPN.
5. **Migrations are a deliberate step** — run before or as part of a job that gates traffic (or short maintenance window).
6. **Deploy is observable** — health checks, structured logs, post-deploy smoke (HTTP + optional Playwright against public URL).

---

## 3. Recommended phases

### Phase A — Safety and hygiene (do first)

- **Postgres listen/bind:** map Postgres to **`127.0.0.1:5432:5432`** on the VPS so only local processes (and Docker bridge to `api`) hit it; operators use `ssh -L` for tools. *(Applied in `docker-compose.vultr-test.yml` in this repo.)*
- **Firewall:** `ufw` default deny; allow `22`, `80`, `443` (and **not** `5432` from WAN).
- **Document** how to obtain `DATABASE_URL` for chaos / ops (tunnel only).

### Phase B — Wire CI images to the VPS ✅ (done)

- **Files:** `docker-compose.vultr.images.yml` sets `NEXUSOPS_WEB_IMAGE` / `NEXUSOPS_API_IMAGE`; `scripts/vultr-remote-deploy.sh` runs `pull` then `up -d --no-build` (base compose still declares `build:` for local dev).
- **GHCR login on VPS:** add `GHCR_USERNAME` + `GHCR_TOKEN` to `.env.production`, or run `docker login ghcr.io` once as root.
- **Tags:** set `NEXUSOPS_IMAGE_TAG` to `latest`, branch name, or short SHA when deploying.

### Phase C — Automated deploy from GitHub ✅ (starter)

- **Workflow:** `.github/workflows/deploy-vultr.yml` — manual **Run workflow**, input `image_tag` (default `latest`).
- **Secrets:** `VULTR_HOST`, `VULTR_SSH_PRIVATE_KEY` (see workflow header comments).
- **Migrations:** API container already runs `node dist/migrate.mjs` before `index.js` (see `apps/api/Dockerfile`); no separate job required for basic deploys.
- **Next hardening:** GitHub Environment + required reviewers; optional `workflow_run` trigger after `CI` build job.

### Phase D — Staging

- Second VPS or second compose project on same host with different ports/env (`staging` subdomain or IP).
- Pipeline: merge to `develop` → deploy staging → smoke → manual promote tag to prod.

### Phase E — Hardening and operations

- **TLS:** `certbot --nginx` (you already documented nginx in ops guides).
- **Backups:** automated `pg_dump` (you have cron on VPS); verify restore quarterly.
- **Rollback:** keep previous image tags on GHCR; `docker compose up -d` with `IMAGE_TAG=previous`.
- **Observability:** ship logs to one place (e.g. Loki, CloudWatch, or journald + rotation).

---

## 4. Concrete commands (after Phase B)

On the VPS (example — adjust registry and tag):

```bash
cd /opt/nexusops
export WEB_IMAGE=ghcr.io/<owner>/nexusops/web:main
export API_IMAGE=ghcr.io/<owner>/nexusops/api:main
docker compose --env-file .env.production -f docker-compose.vultr-test.yml pull
docker compose --env-file .env.production -f docker-compose.vultr-test.yml up -d
```

Your compose file must reference those image variables (see Phase B implementation when you adopt it).

---

## 5. What not to do

- Do not rely on **public Postgres** for convenience.
- Do not treat **skip-seed chaos** as equivalent to **full vertical** with DB assert.
- Do not commit **GHCR_TOKEN** or **DATABASE_URL** with production passwords to git.

---

## 6. Mapping to existing scripts

| Script | Role |
|--------|------|
| `scripts/deploy-vultr.sh` | One-time VPS bootstrap |
| `scripts/push-to-vultr.sh` | Rsync + `vultr-remote-deploy.sh` (default **pull** from GHCR) |
| `scripts/vultr-remote-deploy.sh` | On-server: `pull`/`build`, `down`, `up` (`--no-build` when pulling) |
| `scripts/harden-vultr-firewall.sh` | Optional UFW (SSH/HTTP/HTTPS; optional 3001) |
| `tests/chaos/run-vultr-full-vertical.sh` | Post-deploy verification; use **tunneled** DB URL when Postgres is loopback-only |

---

*Revision: Phases A–C starter implemented; staging split and full CD gates remain optional.*
