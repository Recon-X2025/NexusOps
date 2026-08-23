import type { Pool } from "pg";

// ── Shared parameter shapes ───────────────────────────────────────────────────

interface StepParams {
  orgId: string;
  runId: string;
  nodeId: string;
}

interface NodeParams extends StepParams {
  data: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface EvaluateConditionParams extends StepParams {
  expression: string;
  context: Record<string, unknown>;
}

export interface CompleteRunParams {
  orgId: string;
  runId: string;
}

// ── Activity interface ────────────────────────────────────────────────────────

export interface WorkflowActivities {
  evaluateCondition(params: EvaluateConditionParams): Promise<void>;
  assignTicket(params: NodeParams): Promise<void>;
  sendNotification(params: NodeParams): Promise<void>;
  updateTicketField(params: NodeParams): Promise<void>;
  callWebhook(params: NodeParams): Promise<void>;
  completeRun(params: CompleteRunParams): Promise<void>;
}

// ── Step run helpers ──────────────────────────────────────────────────────────

interface StepHandle {
  /** Step row id. */
  stepId: string;
  /** True if this (run, node) step already finished successfully on a prior attempt. */
  alreadyCompleted: boolean;
}

/**
 * "Does this id belong to that org?" for the Temporal worker.
 *
 * This process connects with its own `pg` Pool as the application database
 * user, which is a superuser and BYPASSRLS — so row-level security constrains
 * NOTHING here. Every predicate on this connection is load-bearing, and unlike
 * `apps/api` there is no second wall behind it.
 *
 * `apps/api` has `lib/assert-same-org.ts` for this, but it is built on Drizzle
 * table objects; this worker speaks raw SQL to a `pg` Pool, so the rule is
 * re-expressed rather than imported. Keep the two in step.
 *
 * The table name is NOT caller-supplied — it is a literal at each call site —
 * so interpolating it does not create an injection point. The id and org are
 * bound as parameters.
 */
async function belongsToOrg(
  pool: Pool,
  table: "users" | "teams" | "tickets",
  id: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [id, orgId],
  );
  return rows.length > 0;
}

/**
 * Idempotently begin a step for (runId, nodeId).
 *
 * Relies on the UNIQUE(run_id, node_id) index: on Temporal retry the same step
 * row is reused (ON CONFLICT) rather than duplicated, and attempt_count is
 * incremented. If the step is already `completed`, the caller should skip the
 * side effect entirely (see `alreadyCompleted`).
 */
async function startStep(
  pool: Pool,
  runId: string,
  nodeId: string,
  nodeType: string,
  input: Record<string, unknown>,
): Promise<StepHandle> {
  // Capture the prior status (if any) in a CTE before the upsert, because
  // Postgres RETURNING in DO UPDATE only exposes the *post*-update row.
  const result = await pool.query<{ id: string; was_completed: boolean }>(
    `WITH prev AS (
       SELECT id, status FROM workflow_step_runs
       WHERE run_id = $1 AND node_id = $2
     ),
     upsert AS (
       INSERT INTO workflow_step_runs (run_id, node_id, node_type, status, input, attempt_count, started_at)
       VALUES ($1, $2, $3, 'running', $4, 1, now())
       ON CONFLICT (run_id, node_id) DO UPDATE
         SET attempt_count = workflow_step_runs.attempt_count + 1,
             -- keep a completed step terminal; otherwise re-arm it for this attempt
             status = (CASE WHEN workflow_step_runs.status = 'completed'
                           THEN 'completed' ELSE 'running' END)::workflow_step_status,
             input = EXCLUDED.input,
             started_at = CASE WHEN workflow_step_runs.status = 'completed'
                               THEN workflow_step_runs.started_at ELSE now() END
       RETURNING id
     )
     SELECT upsert.id,
            COALESCE((SELECT status = 'completed' FROM prev), false) AS was_completed
     FROM upsert`,
    [runId, nodeId, nodeType, JSON.stringify(input)],
  );
  const row = result.rows[0]!;
  return { stepId: row.id, alreadyCompleted: row.was_completed };
}

async function finishStep(
  pool: Pool,
  stepId: string,
  output: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE workflow_step_runs
     SET status = 'completed', output = $2, completed_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
     WHERE id = $1`,
    [stepId, JSON.stringify(output)],
  );
}

async function failStep(pool: Pool, stepId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE workflow_step_runs
     SET status = 'failed', error = $2, completed_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
     WHERE id = $1`,
    [stepId, error],
  );
}

/** Read a single key out of a completed step's stored JSON output. */
async function loadStepResult(pool: Pool, stepId: string, key: string): Promise<unknown> {
  const res = await pool.query<{ value: unknown }>(
    `SELECT output -> $2 AS value FROM workflow_step_runs WHERE id = $1`,
    [stepId, key],
  );
  return res.rows[0]?.value ?? null;
}

// ── Activity factory ──────────────────────────────────────────────────────────

export function createActivities(pool: Pool): WorkflowActivities {
  return {
    // ── evaluateCondition ───────────────────────────────────────────────────
    async evaluateCondition({ orgId: _orgId, runId, nodeId, expression, context }) {
      const { stepId, alreadyCompleted } = await startStep(pool, runId, nodeId, "CONDITION", { expression, context });
      if (alreadyCompleted) {
        // Re-derive the condition result into context without re-recording the step.
        context[`__cond_${nodeId}`] = await loadStepResult(pool, stepId, "result");
        return;
      }
      try {
        // Support simple `context.field == value` comparisons
        let result = false;
        const match = /^context\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/.exec(expression?.trim() ?? "");
        if (match) {
          // The regex has three capture groups, so these are present when it matches.
          const field = match[1]!;
          const op = match[2]!;
          const rawValue = match[3]!;
          const actual = context[field];
          const expected: unknown = (() => {
            try { return JSON.parse(rawValue); } catch { return rawValue.replace(/^['"]|['"]$/g, ""); }
          })();
          if (op === "==")  result = actual == expected;
          else if (op === "!=") result = actual != expected;
          else if (op === ">")  result = (actual as number) > (expected as number);
          else if (op === "<")  result = (actual as number) < (expected as number);
          else if (op === ">=") result = (actual as number) >= (expected as number);
          else if (op === "<=") result = (actual as number) <= (expected as number);
        }
        context[`__cond_${nodeId}`] = result;
        await finishStep(pool, stepId, { result });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── assignTicket ────────────────────────────────────────────────────────
    async assignTicket({ orgId, runId, nodeId, data, context }) {
      const { stepId, alreadyCompleted } = await startStep(pool, runId, nodeId, "ASSIGN", { data });
      if (alreadyCompleted) return;
      try {
        const ticketId = context["ticketId"] as string | undefined;
        if (ticketId) {
          // Verify the TICKET, not just the ids being written onto it. Without
          // this the org predicate below matches zero rows and the activity
          // resolves successfully having changed nothing — the step is marked
          // `completed` and the workflow believes it assigned the ticket.
          if (!(await belongsToOrg(pool, "tickets", ticketId, orgId))) {
            throw new Error("ticketId does not belong to this organisation");
          }
          const updates: string[] = [];
          const params: unknown[] = [];
          // `assigneeId` and `teamId` come from the workflow NODE's own config,
          // which an author types in. Neither is validated upstream, so resolve
          // each against this org before it is written onto a ticket.
          if (data["assigneeId"]) {
            if (!(await belongsToOrg(pool, "users", data["assigneeId"] as string, orgId))) {
              throw new Error("assigneeId does not belong to this organisation");
            }
            params.push(data["assigneeId"]);
            updates.push(`assignee_id = $${params.length}`);
          }
          if (data["teamId"]) {
            if (!(await belongsToOrg(pool, "teams", data["teamId"] as string, orgId))) {
              throw new Error("teamId does not belong to this organisation");
            }
            params.push(data["teamId"]);
            updates.push(`team_id = $${params.length}`);
          }
          if (updates.length > 0) {
            params.push(ticketId);
            params.push(orgId);
            await pool.query(
              `UPDATE tickets SET ${updates.join(", ")}, updated_at = now()
                WHERE id = $${params.length - 1} AND org_id = $${params.length}`,
              params,
            );
          }
        }
        await finishStep(pool, stepId, { ticketId: ticketId ?? null });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── sendNotification ────────────────────────────────────────────────────
    async sendNotification({ orgId, runId, nodeId, data, context }) {
      const { stepId, alreadyCompleted } = await startStep(pool, runId, nodeId, "NOTIFY", { data });
      // Non-idempotent side effect: never re-send a notification on retry.
      if (alreadyCompleted) return;
      try {
        const userId = (context["userId"] ?? data["userId"]) as string | undefined;
        const title   = (data["title"]   as string) ?? "Workflow Notification";
        // `notifications` stores the text in `body`; `message` is the node-data key.
        const body    = (data["message"] as string) ?? "";

        // user_id is NOT NULL on `notifications`; without a recipient there is
        // nothing to deliver, so record the step as completed without inserting.
        // The row is stamped with OUR org_id, so RLS would accept it whoever the
        // recipient is — the notification would simply be delivered to another
        // tenant's user. `userId` comes from trigger context or node config and
        // is not validated upstream, so it is resolved here.
        if (userId) {
          if (!(await belongsToOrg(pool, "users", userId, orgId))) {
            throw new Error("notification recipient does not belong to this organisation");
          }
          await pool.query(
            `INSERT INTO notifications (org_id, user_id, title, body, type, is_read, created_at)
             VALUES ($1, $2, $3, $4, 'info', false, now())`,
            [orgId, userId, title, body],
          );
        }
        await finishStep(pool, stepId, { sent: !!userId, userId: userId ?? null });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── updateTicketField ───────────────────────────────────────────────────
    async updateTicketField({ orgId, runId, nodeId, data, context }) {
      const { stepId, alreadyCompleted } = await startStep(pool, runId, nodeId, "UPDATE_FIELD", { data });
      if (alreadyCompleted) return;
      try {
        const ticketId = context["ticketId"] as string | undefined;
        const field    = data["field"]  as string | undefined;
        const value    = data["value"];

        // Restrict updates to a known set of safe, user-facing ticket columns
        const ALLOWED_FIELDS: Record<string, string> = {
          priority:     "priority",
          status:       "status",
          title:        "title",
          description:  "description",
          // eslint-disable-next-line camelcase
          due_date:     "due_date",
          // eslint-disable-next-line camelcase
          assignee_id:  "assignee_id",
          // eslint-disable-next-line camelcase
          team_id:      "team_id",
        };

        const column = field ? ALLOWED_FIELDS[field] : undefined;
        if (!column) throw new Error(`Field '${field ?? ""}' is not an allowed updatable ticket field`);

        if (ticketId) {
          // Same reason as assignTicket: a foreign ticket id must fail loudly,
          // not silently update zero rows and report the step completed.
          if (!(await belongsToOrg(pool, "tickets", ticketId, orgId))) {
            throw new Error("ticketId does not belong to this organisation");
          }
          await pool.query(
            `UPDATE tickets SET "${column}" = $1, updated_at = now()
              WHERE id = $2 AND org_id = $3`,
            [value, ticketId, orgId],
          );
        }
        await finishStep(pool, stepId, { updated: !!ticketId, field: column });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── callWebhook ─────────────────────────────────────────────────────────
    async callWebhook({ orgId: _orgId, runId, nodeId, data, context }) {
      const { stepId, alreadyCompleted } = await startStep(pool, runId, nodeId, "WEBHOOK", { data });
      // Non-idempotent external side effect: never re-POST on retry.
      if (alreadyCompleted) return;
      try {
        const url = data["url"] as string;
        if (!url) throw new Error("Webhook node missing url");

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Stable per (run, node) so the receiver can also dedup replays.
            "Idempotency-Key": `${runId}:${nodeId}`,
          },
          body: JSON.stringify({ context, nodeData: data, runId }),
        });

        const responseBody = await response.text().catch(() => "");
        if (!response.ok) {
          throw new Error(`Webhook returned HTTP ${response.status}: ${responseBody}`);
        }
        await finishStep(pool, stepId, { status: response.status, body: responseBody });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── completeRun ─────────────────────────────────────────────────────────
    async completeRun({ runId }) {
      await pool.query(
        `UPDATE workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1`,
        [runId],
      );
    },
  };
}
