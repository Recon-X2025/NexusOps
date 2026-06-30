-- Idempotency for workflow step runs.
-- Pre-existing non-idempotent runs may have produced duplicate (run_id, node_id)
-- rows; collapse them (keep the latest by started_at, then id) before adding the
-- UNIQUE index so the index creation cannot fail.
DELETE FROM "workflow_step_runs" a
USING "workflow_step_runs" b
WHERE a."run_id" = b."run_id"
  AND a."node_id" = b."node_id"
  AND (
    COALESCE(a."started_at", to_timestamp(0)) < COALESCE(b."started_at", to_timestamp(0))
    OR (
      COALESCE(a."started_at", to_timestamp(0)) = COALESCE(b."started_at", to_timestamp(0))
      AND a."id" < b."id"
    )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_step_runs_run_node_unique" ON "workflow_step_runs" USING btree ("run_id","node_id");
