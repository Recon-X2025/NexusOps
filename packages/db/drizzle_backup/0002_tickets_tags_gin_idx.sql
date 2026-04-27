-- Migration: 0002_tickets_tags_gin_idx
--
-- Adds a GIN index on tickets.tags to support array-overlap queries
-- used by the tags filter in tickets.list.
--
-- EXECUTION REQUIREMENT:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   Do NOT run this file through drizzle-kit migrate (which wraps in BEGIN/COMMIT).
--   Run directly via psql outside any open transaction, e.g.:
--
--     psql $DATABASE_URL -f packages/db/drizzle/0002_tickets_tags_gin_idx.sql
--
--   Or as a single statement:
--
--     psql $DATABASE_URL -c "CREATE INDEX CONCURRENTLY tickets_tags_gin_idx ON tickets USING GIN (tags);"
--
-- CONCURRENTLY: table remains fully readable and writable during the index build.
-- Safe to run against a live production database. Build time scales with row count.

-- Index: GIN index for tags array-overlap filtering
--
-- Covers:
--   SELECT ... FROM tickets
--   WHERE org_id = $1
--     AND tags && ARRAY[$2, $3, ...]::text[]
--
-- Operator supported:
--   && (overlap)  — "ticket has at least one of the requested tags"
--   @> (contains) — "ticket has all of the requested tags" (also supported by GIN)
--
-- Planner improvement:
--   Without this index: sequential scan with per-row array comparison.
--   With this index: GIN bitmap scan — PostgreSQL builds a posting list per tag
--   value and unions (&&) or intersects (@>) them. O(matching rows) rather than
--   O(total rows). Effectively eliminates full-table scan for tag-filtered queries.

CREATE INDEX CONCURRENTLY tickets_tags_gin_idx
  ON tickets USING GIN (tags);
