.PHONY: dev build test lint format docker-up docker-down docker-logs \
        db-push db-migrate db-seed db-studio install clean \
        docker-test-up docker-test-down docker-test-reset local-test-ready

# ── Development ────────────────────────────────────────────────────────────
dev:
	pnpm dev

build:
	pnpm build

install:
	pnpm install

clean:
	pnpm turbo clean && rm -rf node_modules **/node_modules

# ── Testing ─────────────────────────────────────────────────────────────────
test:
	pnpm test

test-stage1:
	pnpm test:stage1

test-stage2:
	pnpm test:stage2

test-e2e:
	pnpm turbo run test:e2e

test-all:
	pnpm test:all

# ── Linting / Formatting ────────────────────────────────────────────────────
lint:
	pnpm lint

format:
	pnpm format

# ── Database ────────────────────────────────────────────────────────────────
db-push:
	pnpm db:push

db-migrate:
	pnpm db:migrate

db-seed:
	pnpm db:seed

db-studio:
	pnpm db:studio

# ── Docker ──────────────────────────────────────────────────────────────────
docker-up:
	docker compose -f docker-compose.dev.yml up -d

docker-down:
	docker compose -f docker-compose.dev.yml down

docker-logs:
	docker compose -f docker-compose.dev.yml logs -f

docker-reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d

# ── Local QA stack (tmpfs Postgres :5433 — matches .env.test) ───────────────
docker-test-up:
	docker compose -f docker-compose.test.yml up -d --wait

docker-test-down:
	docker compose -f docker-compose.test.yml down

docker-test-reset:
	docker compose -f docker-compose.test.yml down -v
	docker compose -f docker-compose.test.yml up -d --wait

local-test-ready:
	bash scripts/local-test-ready.sh
