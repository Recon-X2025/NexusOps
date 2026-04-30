#!/usr/bin/env bash
# Start Docker infra (dev compose), wait for Postgres, migrate, then Turbo dev.
# Prerequisites: Docker Desktop running, pnpm install done, .env from .env.example (DATABASE_URL :5434).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo ""
  echo "❌ Docker is not running."
  echo "   Open Docker Desktop (macOS) or start the Docker daemon, wait until it is \"ready\", then run:"
  echo "   bash scripts/start-dev-stack.sh"
  echo ""
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "❌ Missing .env — copy .env.example to .env and set AUTH_SECRET / ENCRYPTION_KEY (see README)."
  exit 1
fi

echo "==> Starting docker-compose.dev.yml (Postgres :5434, Redis, Temporal :7233, …)"
docker compose -f docker-compose.dev.yml up -d

echo "==> Waiting for Postgres (coheronconnect@postgres:5432 inside container)…"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U coheronconnect >/dev/null 2>&1; then
    echo "    Postgres is accepting connections."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "❌ Postgres did not become ready in time. Try: docker compose -f docker-compose.dev.yml logs postgres"
    exit 1
  fi
  sleep 1
done

echo "==> Applying DB migrations (.env DATABASE_URL should use localhost:5434 for dev compose)"
pnpm exec dotenv -e .env -- pnpm db:migrate

echo ""
echo "✅ Infra + migrations are ready."
echo "   Optional demo data: pnpm db:seed   (admin@coheron.com / demo1234! per README)"
echo "   Starting Turbo dev (web :3000, API :3001, …) — Ctrl+C to stop."
echo ""

exec pnpm dev
