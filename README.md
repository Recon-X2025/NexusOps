# NexusOps by Coheron

> Enterprise-grade workflow orchestration, ITSM, asset management, HR service delivery, and procurement — without the $100–$200/user/month ServiceNow price tag.

## Architecture

```
nexusops/
├── apps/
│   ├── web/              # Next.js 15 App Router (React 19, TypeScript, Tailwind)
│   └── api/              # Fastify + tRPC API server (TypeScript, Drizzle ORM)
├── packages/
│   ├── db/               # Drizzle ORM schemas + migrations + seed
│   ├── types/            # Shared Zod schemas + TypeScript types
│   ├── ui/               # Shared component library (shadcn/ui style)
│   ├── config/           # ESLint, Prettier, TSConfig shared configs
│   └── auth/             # Better Auth configuration
├── charts/nexusops/      # Helm chart for Kubernetes deployment
├── infra/
│   ├── terraform/        # IaC for AWS/GCP/Azure (Coheron-managed)
│   └── temporal/         # Temporal.io dynamic config
├── docker-compose.dev.yml   # Local development services
├── docker-compose.prod.yml  # Production Docker Compose + Traefik
└── Makefile              # Common commands
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript |
| UI | Tailwind CSS + Radix UI (shadcn/ui pattern) |
| Workflow Editor | React Flow / Xyflow |
| Backend API | Fastify + tRPC (type-safe end-to-end) |
| Workflow Engine | Temporal.io |
| Database | PostgreSQL 16 + Drizzle ORM |
| Search | Meilisearch |
| Cache/Queue | Redis + BullMQ |
| Auth | Better Auth + SAML/OIDC |
| File Storage | S3-compatible (MinIO for self-hosted) |
| AI | Anthropic Claude API |
| Observability | OpenTelemetry + Grafana |
| Deployment | Docker + Kubernetes (Helm) |

## Modules

| Module | Status | Description |
|---|---|---|
| ITSM — Ticket Engine | ✅ | Incidents, requests, problems, changes with SLA tracking |
| Visual Workflow Engine | ✅ | No-code automation with Temporal.io backend |
| Asset Management + CMDB | ✅ | ITAM, topology graph, license management |
| Self-Service Portal | ✅ | Employee-facing portal with KB and request templates |
| Dashboards + Reports | ✅ | Real-time metrics, time-series charts, CSV/PDF export |
| People Ops (HR) | ✅ | Onboarding, leave management, org chart |
| Procurement | ✅ | PR → PO → invoice 3-way match, vendor management |
| AI Layer | ✅ | Smart classification, NL search, resolution suggestions |
| Integrations | ✅ | Slack, Teams, Email, Jira, SAP, webhooks |
| Self-Hosted Deploy | ✅ | Docker Compose + Helm + CLI |
| Coheron-Managed | ✅ | Terraform IaC for AWS/GCP/Azure |

## Quick Start (Development)

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Docker Desktop

```bash
# Clone and install
git clone https://github.com/coheron/nexusops
cd nexusops
pnpm install

# Start infrastructure
make docker-up

# Copy env and configure
cp .env.example .env

# Push schema and seed
make db-push
make db-seed

# Start development servers
make dev
```

Open:
- **Web app**: http://localhost:3000
- **API**: http://localhost:3001
- **API health**: http://localhost:3001/health
- **Drizzle Studio**: http://localhost:4983 (after `make db-studio`)
- **MailHog**: http://localhost:8025
- **MinIO Console**: http://localhost:9001

Default credentials: `admin@coheron.com` / see seed script

## Self-Hosted Production Deployment

```bash
# Single command with Docker Compose + Traefik (auto-SSL)
docker compose -f docker-compose.prod.yml up -d

# Or with Kubernetes (Helm)
helm upgrade --install nexusops charts/nexusops \
  --namespace nexusops \
  --create-namespace \
  --values charts/nexusops/values.yaml \
  --set secret.authSecret=$(openssl rand -hex 32) \
  --set secret.encryptionKey=$(openssl rand -hex 32)
```

## Available Commands

```bash
make dev          # Start all services in development mode
make build        # Build all packages
make test         # Run all tests
make docker-up    # Start dev infrastructure (Postgres, Redis, Meilisearch)
make docker-down  # Stop dev infrastructure
make db-push      # Push schema changes to database
make db-migrate   # Run migrations
make db-seed      # Seed with demo data
make db-studio    # Open Drizzle Studio
```

## Pricing

| Tier | Self-Hosted | Coheron-Managed |
|---|---|---|
| Free (Community) | $0 | — |
| Starter (25 users) | $299/mo | $499/mo |
| Professional (100 users) | $799/mo | $1,299/mo |
| Enterprise | $2,499/mo | $4,999/mo |
| Dedicated | — | From $8,999/mo |

**Up to 93% savings vs ServiceNow at equivalent scale.**

---

*Built by [Coheron](https://coheron.com). Designed to replace what enterprises overpay for.*
