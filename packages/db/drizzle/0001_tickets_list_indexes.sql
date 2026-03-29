-- Migration: 0001_tickets_list_indexes
--
-- Adds two composite indexes to support tickets.list query patterns.
--
-- EXECUTION REQUIREMENT:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   Do NOT run this file through drizzle-kit migrate (which wraps in BEGIN/COMMIT).
--   Run each statement directly via psql or your DB admin tool, outside any
--   open transaction, e.g.:
--
--     psql $DATABASE_URL -f packages/db/drizzle/0001_tickets_list_indexes.sql
--
--   Or run each statement individually:
--
--     psql $DATABASE_URL -c "CREATE INDEX CONCURRENTLY ..."
--
-- Both indexes use CONCURRENTLY so the table remains fully available during
-- index build. Safe to run against a live production database.
--
-- These indexes supersede the following Phase 0 single-column index plans:
--   - tickets_org_idx      (org_id)           already exists, not replaced
--   - tickets_status_idx   (status_id)        already exists, not replaced
--   - tickets_created_at_idx (created_at)     already exists, not replaced

-- Index 1: Default unfiltered list with sort pushdown
--
-- Covers:
--   SELECT ... FROM tickets
--   WHERE org_id = $1
--   ORDER BY created_at DESC
--   LIMIT N OFFSET M
--
-- Planner improvement:
--   Without this index: tickets_org_idx scan → separate in-memory sort step.
--   With this index: single B-tree scan returns rows already in created_at DESC
--   order. No sort step. LIMIT applied at scan level — Postgres stops reading
--   after N+1 rows rather than sorting all matching rows.

CREATE INDEX CONCURRENTLY tickets_org_created_at_idx
  ON tickets (org_id, created_at DESC);

--> statement-breakpoint

-- Index 2: Status-filtered list with sort pushdown
--
-- Covers:
--   SELECT ... FROM tickets
--   WHERE org_id = $1 AND status_id = $2
--   ORDER BY created_at DESC
--   LIMIT N OFFSET M
--
-- Planner improvement:
--   Without this index: bitmap AND merge of tickets_org_idx and tickets_status_idx,
--   then a separate sort step on the merged result set.
--   With this index: single range scan on (org_id, status_id) with rows returned
--   in created_at DESC order. No bitmap merge. No sort step.
--   This is the most common filtered list pattern (status board / kanban views).

CREATE INDEX CONCURRENTLY tickets_org_status_created_at_idx
  ON tickets (org_id, status_id, created_at DESC);
