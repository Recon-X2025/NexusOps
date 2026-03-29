FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile --prod=false

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @nexusops/types build
RUN pnpm --filter @nexusops/db build
RUN pnpm --filter @nexusops/api build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

WORKDIR /app

# Copy the .pnpm virtual store (contains all package files)
COPY --from=builder /app/node_modules ./node_modules
# Copy workspace-level node_modules (symlinks resolved by Docker into real files)
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
# Copy built dist and package metadata
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

USER api

# Run from the package directory so Node.js resolves modules correctly
WORKDIR /app/apps/api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "pnpm --filter @nexusops/db db:migrate && node dist/index.mjs"]
