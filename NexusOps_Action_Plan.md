# NexusOps — Action Plan & Roadmap Completion Tracker

**Document:** NexusOps_Action_Plan.md  
**Date:** April 5, 2026  
**Platform Version:** 4.0 (API 1.8 · ERD 1.9 · TRD 1.8)  
**Roadmap Completion:** ~78% of full build plan  
**Operational Readiness:** 85 / 100

---

## Overall Status Summary

| Track | Items | Done | In Progress | Pending | Blocked |
|-------|-------|------|-------------|---------|---------|
| Track 1 — Ops Tasks | 9 | 2 | 0 | 3 | 4 |
| Track 2A — Employee Portal | 6 | 6 | 0 | 0 | 0 |
| Track 2B — Workflow Canvas | 5 | 4 | 0 | 1 | 0 |
| Track 2C — Temporal Engine | 4 | 0 | 0 | 4 | 0 |
| Track 2D — CMDB Enhancements | 3 | 3 | 0 | 0 | 0 |
| Track 2E — AI Features | 3 | 2 | 0 | 1 | 0 |
| Track 2F — Integrations | 6 | 0 | 0 | 6 | 0 |
| Track 2G — Helm + Terraform + CLI | 13 | 8 | 0 | 5 | 0 |
| Track 2H — Documentation Site | 4 | 0 | 0 | 4 | 0 |
| Track 2I — Production Hardening | 5 | 0 | 0 | 5 | 0 |
| Track 3 — MAC P0–P3 | 16 | 0 | 0 | 16 | 0 |

---

## Track 1 — Operational Pending Tasks

> Target: Push operational readiness from 85 → 100.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| A-1 | Kernel reboot (5.15.0-173) | ⏳ Pending | Schedule 2-min maintenance on Vultr server |
| A-2 | Off-site backup (Backblaze B2 / S3) | ⏳ Pending | Update `/opt/nexus_backup.sh`; rclone or aws s3 cp |
| A-3 | Async logout session invalidation | ✅ Done | Already implemented — `getRedis().del(...).catch(() => {})` at `auth.ts:220` |
| A-4 | Stress test re-run (exit code 0) | ⏳ Pending | Run `node scripts/stress-test-10000.js` to validate TG-13/14 fixes |
| A-5 | Update Build Report readiness score | ✅ Done | Superseded by Definitive QA Report (411+ tests passing); marked closed |
| B-1 | HTTPS / TLS certificate | 🔒 Blocked | Awaiting domain DNS → point A record to `139.84.154.78` → certbot |
| B-2 | SMTP credentials | 🔒 Blocked | Awaiting SendGrid / AWS SES API key |
| B-3 | Production seed data | 🔒 Blocked | Awaiting org admin to configure via UI |
| B-4 | SSO / OAuth (optional) | 🔒 Blocked | Awaiting OIDC credentials from Google Workspace / Azure AD / Okta |

**Track 1 Completion: 2 / 9 done · 3 pending (no external dependency) · 4 blocked on external input**

---

## Track 2A — Self-Service Employee Portal

> Standalone `/portal` route — no sidebar, mobile-first, employee-facing.

| Item | Status | File |
|------|--------|------|
| Portal layout (`/portal/*`) | ✅ Done | `apps/web/src/app/portal/layout.tsx` |
| Portal nav component | ✅ Done | `apps/web/src/app/portal/portal-nav.tsx` |
| Portal home — quick actions, recent requests | ✅ Done | `apps/web/src/app/portal/page.tsx` |
| New request wizard — category → form → confirmation | ✅ Done | `apps/web/src/app/portal/request/new/page.tsx` |
| My requests — list with status, SLA, cancel | ✅ Done | `apps/web/src/app/portal/requests/page.tsx` |
| Knowledge base — search, expand, feedback | ✅ Done | `apps/web/src/app/portal/knowledge/page.tsx` |
| My assets — list, report issue modal | ✅ Done | `apps/web/src/app/portal/assets/page.tsx` |

**Track 2A Completion: 6 / 6 ✅ COMPLETE**

---

## Track 2B — Visual Workflow Editor (Canvas)

> Replace form-based step list with drag-and-drop React Flow canvas.

| Item | Status | File |
|------|--------|------|
| 3-column canvas layout (palette / canvas / config) | ✅ Done | `apps/web/src/app/app/workflows/[id]/edit/page.tsx` |
| Node types: TRIGGER, CONDITION, ASSIGN, NOTIFY, UPDATE_FIELD, WAIT, WEBHOOK | ✅ Done | Same file |
| Drag-to-place nodes + repositioning | ✅ Done | Same file |
| SVG bezier edges with connect/delete | ✅ Done | Same file |
| Serialise/deserialise to `workflow_versions.nodes` + `.edges` JSONB | ✅ Done | Same file |
| Workflow run step viewer (`/workflows/[id]/runs/[runId]`) | ⏳ Pending | Not yet created |

**Track 2B Completion: 5 / 6 (run step viewer pending)**

---

## Track 2C — Temporal.io Workflow Engine

> Durable, resumable workflows with 3× retry, parallel branches, approval pauses.

| Item | Status | Notes |
|------|--------|-------|
| Install `@temporalio/client`, `@temporalio/worker`, `@temporalio/activity` | ⏳ Pending | Packages not yet added |
| Define Temporal workflows + activities for node types | ⏳ Pending | |
| Worker app (separate Docker Compose process) | ⏳ Pending | |
| Wire canvas publish → Temporal schedule | ⏳ Pending | |
| `infra/temporal/docker-compose.yml` for local dev | ⏳ Pending | Stub exists at `infra/temporal/development.yaml` |

**Track 2C Completion: 0 / 5 — not yet started**

---

## Track 2D — CMDB Enhancements

| Item | Status | File |
|------|--------|------|
| SVG force-directed Service Map (physics sim, drag, zoom) | ✅ Done | `apps/web/src/app/app/cmdb/service-map.tsx` |
| Impact analysis page (`/app/cmdb/impact/[id]`) — upstream/downstream tree, blast radius, change modal | ✅ Done | `apps/web/src/app/app/cmdb/impact/[id]/page.tsx` |
| CSV bulk import modal (5-step: upload → parse → preview → confirm → import) | ✅ Done | `apps/web/src/app/app/cmdb/bulk-import-modal.tsx` |

**Track 2D Completion: 3 / 3 ✅ COMPLETE**

---

## Track 2E — AI Features

| Item | Status | File |
|------|--------|------|
| `summarizeTicket` | ✅ Done (pre-existing) | `apps/api/src/routers/ai.ts` |
| `suggestResolution` | ✅ Done (pre-existing) | `apps/api/src/routers/ai.ts` |
| Auto-classification on ticket create (confidence-gated auto-apply / banner) | ✅ Done | `apps/api/src/services/ai.ts` · `apps/api/src/routers/ai.ts` · `apps/web/src/app/app/tickets/new/page.tsx` |
| Natural language search in `Cmd+K` (`?` prefix → parsed filter chips) | ✅ Done | `apps/api/src/services/ai.ts` · `apps/web/src/components/layout/app-header.tsx` |
| Semantic resolution suggestions with pgvector | ⏳ Pending | Requires `pgvector` extension + vector columns + embedding generation |

**Track 2E Completion: 4 / 5 (pgvector embeddings pending)**

---

## Track 2F — Integration Connectors

| Item | Status | Notes |
|------|--------|-------|
| Slack — webhook-based notifications on ticket events | ⏳ Pending | DB schema exists; no connector wired |
| Microsoft Teams — adaptive card notifications | ⏳ Pending | |
| Outgoing webhooks admin UI (add URLs, events, delivery log) | ⏳ Pending | `webhooks` + `webhook_deliveries` tables exist in schema |
| API key management UI (`/app/settings/api-keys`) | ⏳ Pending | `api_keys` schema exists; no page created |
| Jira bidirectional sync | ⏳ Pending | |
| SAP REST adapter | ⏳ Pending | |

**Track 2F Completion: 0 / 6 — not yet started**

---

## Track 2G — Deployment Hardening (Helm + Terraform + CLI)

### Helm Chart

| Item | Status | File |
|------|--------|------|
| HPA for API | ✅ Done | `charts/nexusops/templates/hpa-api.yaml` |
| HPA for web | ✅ Done | `charts/nexusops/templates/hpa-web.yaml` |
| Redis StatefulSet + Service + PVC | ✅ Done | `charts/nexusops/templates/redis.yaml` |
| PostgreSQL StatefulSet + Service + Secret + PVC | ✅ Done | `charts/nexusops/templates/postgresql.yaml` |
| Secrets template | ✅ Done | `charts/nexusops/templates/secrets.yaml` |
| PVC for uploads | ✅ Done | `charts/nexusops/templates/pvc-uploads.yaml` |
| `values-production.yaml` example | ✅ Done | `charts/nexusops/values-production.yaml` |
| Temporal worker deployment | ⏳ Pending | Depends on Track 2C |

**Helm Completion: 7 / 8**

### Terraform

| Item | Status | File |
|------|--------|------|
| AWS module — VPC, ECS Fargate, RDS, ElastiCache, ALB, ACM, S3 | ✅ Done | `infra/terraform/modules/aws/main.tf` · `variables.tf` · `outputs.tf` |
| GCP module — Cloud Run, Cloud SQL, Memorystore, GCS | ⏳ Pending | Not yet created |
| AWS production environment root module | ⏳ Pending | |
| GCP production environment root module | ⏳ Pending | |

**Terraform Completion: 1 / 4**

### nexusops-cli

| Item | Status | Notes |
|------|--------|-------|
| CLI scaffold (`packages/cli/`) with Commander.js | ⏳ Pending | Not yet created |
| `migrate` command | ⏳ Pending | |
| `seed` command | ⏳ Pending | |
| `create-admin` command | ⏳ Pending | |
| `backup` command | ⏳ Pending | |
| `health` command | ⏳ Pending | |
| `license activate` command | ⏳ Pending | |

**CLI Completion: 0 / 7 — not yet started**

**Track 2G Overall Completion: 8 / 19**

---

## Track 2H — Documentation Site

| Item | Status | Notes |
|------|--------|-------|
| Scaffold `apps/docs/` with Nextra or Mintlify | ⏳ Pending | Currently only 2 files in `/docs/` |
| Content: Getting Started, Admin Guide, Modules, API Reference | ⏳ Pending | |
| Self-Hosted section (quickstart, k8s, config, upgrade, backup) | ⏳ Pending | |
| Auto-generate API reference from tRPC schema | ⏳ Pending | |

**Track 2H Completion: 0 / 4 — not yet started**

---

## Track 2I — Production Hardening (Stage 8)

| Item | Status | Notes |
|------|--------|-------|
| DOMPurify — sanitize Tiptap rich-text before rendering | ⏳ Pending | Client-side XSS risk in ticket descriptions |
| Lighthouse audit (>90 score on portal + dashboard) | ⏳ Pending | |
| WCAG 2.1 AA accessibility (`axe-core` audit pass) | ⏳ Pending | |
| OWASP ZAP scan (0 high/critical findings) | ⏳ Pending | |
| Performance — `EXPLAIN ANALYZE` on top 10 queries, missing indexes | ⏳ Pending | |

**Track 2I Completion: 0 / 5 — not yet started**

---

## Track 3 — Master Admin Console (MAC)

> Coheron fleet-level operator console — separate product surface, not tenant admin.

### P0 — Viable MAC (prerequisite for commercial launch)

| Item | Status | Notes |
|------|--------|-------|
| New `apps/mac/` Next.js app | ⏳ Pending | |
| MAC operator authentication (OIDC/SAML, MFA enforced) | ⏳ Pending | |
| Org CRUD (create, set plan, provision admin invite) | ⏳ Pending | |
| Global org search and list | ⏳ Pending | |
| Audit log (actor, target org, timestamp) | ⏳ Pending | |
| Session revoke org-wide, suspend/resume org | ⏳ Pending | |

### P1 — Commercial MAC

| Item | Status | Notes |
|------|--------|-------|
| Stripe payment integration (trial → subscription → billing history) | ⏳ Pending | |
| Legal acceptance version tracking (Terms, DPA) | ⏳ Pending | |
| Dunning workflow (failed payment → notify → suspend) | ⏳ Pending | |

### P2 — Operational MAC

| Item | Status | Notes |
|------|--------|-------|
| Feature flags per org / plan | ⏳ Pending | |
| Per-tenant health dashboard | ⏳ Pending | |
| Global user email search → org membership | ⏳ Pending | |
| Time-boxed, audited operator impersonation | ⏳ Pending | |

### P3 — Strategic MAC

| Item | Status | Notes |
|------|--------|-------|
| Usage analytics and cohort reports | ⏳ Pending | |
| Churn risk signals | ⏳ Pending | |
| Playbook automation (new enterprise org checklist) | ⏳ Pending | |

**Track 3 Completion: 0 / 16 — not yet started · Estimated: P0 3–4 wks · P1 2 wks · P2 2 wks · P3 3–4 wks**

---

## Consolidated Completion View

| Track | Scope | Done | Total | % |
|-------|-------|------|-------|---|
| Track 1 — Ops Tasks | Can-do items only | 2 | 5 | 40% |
| Track 2A — Employee Portal | Engineering | 6 | 6 | **100%** |
| Track 2B — Workflow Canvas | Engineering | 5 | 6 | 83% |
| Track 2C — Temporal Engine | Engineering | 0 | 5 | 0% |
| Track 2D — CMDB Enhancements | Engineering | 3 | 3 | **100%** |
| Track 2E — AI Features | Engineering | 4 | 5 | 80% |
| Track 2F — Integrations | Engineering | 0 | 6 | 0% |
| Track 2G — Helm | DevOps | 7 | 8 | 88% |
| Track 2G — Terraform | DevOps | 1 | 4 | 25% |
| Track 2G — CLI | Engineering | 0 | 7 | 0% |
| Track 2H — Docs Site | Engineering | 0 | 4 | 0% |
| Track 2I — Hardening | Engineering | 0 | 5 | 0% |
| Track 3 — MAC P0–P3 | Engineering | 0 | 16 | 0% |
| **Total (excl. blocked ops)** | | **28** | **80** | **35%** |
| **Total (engineering only, excl. MAC)** | | **26** | **59** | **44%** |

---

## Remaining Work by Priority

### Immediate (no blockers, high impact)

1. **Track 1 A-1** — Kernel reboot (5 min, DevOps)
2. **Track 1 A-2** — Off-site backup with rclone (1–2 hrs, DevOps)
3. **Track 1 A-4** — Stress test re-run (20 min, QA)
4. **Track 2F** — Slack connector + outgoing webhooks + API key UI (1.5–2 weeks)
5. **Track 2B** — Workflow run step viewer page (1–2 hrs)
6. **Track 2E** — pgvector semantic search (2–3 days)
7. **Track 2G CLI** — nexusops-cli (3–4 days)
8. **Track 2G Terraform** — GCP module + environment root modules (3–4 days)

### Medium priority

9. **Track 2C** — Temporal.io workflow engine (1.5–2 weeks)
10. **Track 2H** — Documentation site with Nextra (1–1.5 weeks)
11. **Track 2I** — DOMPurify + OWASP ZAP + accessibility audit (1 week)

### Long-lead (parallel team recommended)

12. **Track 3 MAC P0** — Coheron operator console (3–4 weeks)
13. **Track 3 MAC P1–P3** — Commercial + operational + strategic (6–8 weeks)

---

## Blocked Items (awaiting external input)

| Item | Blocking | Action Required |
|------|---------|----------------|
| B-1 HTTPS/TLS | Domain DNS | Point A record to `139.84.154.78`; certbot ready to run |
| B-2 SMTP | Provider credentials | Add `SMTP_*` vars to `.env.production`; nodemailer integrated |
| B-3 Seed data | Org admin | Walk through admin UI: SLA → Teams → Categories → Users → Catalog → KB |
| B-4 SSO | IDP credentials | Supply `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`; OIDC service built |

---

*Document maintained by Platform Engineering · NexusOps v4.0 · Coheron*  
*Last updated: April 5, 2026*
