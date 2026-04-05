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

async function startStep(
  pool: Pool,
  runId: string,
  nodeId: string,
  nodeType: string,
  input: Record<string, unknown>,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO workflow_step_runs (run_id, node_id, node_type, status, input, attempt_count, started_at)
     VALUES ($1, $2, $3, 'running', $4, 1, now())
     RETURNING id`,
    [runId, nodeId, nodeType, JSON.stringify(input)],
  );
  return result.rows[0]!.id;
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

// ── Activity factory ──────────────────────────────────────────────────────────

export function createActivities(pool: Pool): WorkflowActivities {
  return {
    // ── evaluateCondition ───────────────────────────────────────────────────
    async evaluateCondition({ orgId: _orgId, runId, nodeId, expression, context }) {
      const stepId = await startStep(pool, runId, nodeId, "CONDITION", { expression, context });
      try {
        // Support simple `context.field == value` comparisons
        let result = false;
        const match = /^context\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/.exec(expression?.trim() ?? "");
        if (match) {
          const [, field, op, rawValue] = match as [string, string, string, string];
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
    async assignTicket({ orgId: _orgId, runId, nodeId, data, context }) {
      const stepId = await startStep(pool, runId, nodeId, "ASSIGN", { data });
      try {
        const ticketId = context["ticketId"] as string | undefined;
        if (ticketId) {
          const updates: string[] = [];
          const params: unknown[] = [];
          if (data["assigneeId"]) {
            params.push(data["assigneeId"]);
            updates.push(`assignee_id = $${params.length}`);
          }
          if (data["teamId"]) {
            params.push(data["teamId"]);
            updates.push(`team_id = $${params.length}`);
          }
          if (updates.length > 0) {
            params.push(ticketId);
            await pool.query(
              `UPDATE tickets SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
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
      const stepId = await startStep(pool, runId, nodeId, "NOTIFY", { data });
      try {
        const userId = (context["userId"] ?? data["userId"]) as string | undefined;
        const title   = (data["title"]   as string) ?? "Workflow Notification";
        const message = (data["message"] as string) ?? "";

        await pool.query(
          `INSERT INTO notifications (org_id, user_id, title, message, type, is_read, created_at)
           VALUES ($1, $2, $3, $4, 'workflow', false, now())`,
          [orgId, userId ?? null, title, message],
        );
        await finishStep(pool, stepId, { sent: true, userId: userId ?? null });
      } catch (err) {
        await failStep(pool, stepId, String(err));
        throw err;
      }
    },

    // ── updateTicketField ───────────────────────────────────────────────────
    async updateTicketField({ orgId: _orgId, runId, nodeId, data, context }) {
      const stepId = await startStep(pool, runId, nodeId, "UPDATE_FIELD", { data });
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
          await pool.query(
            `UPDATE tickets SET "${column}" = $1, updated_at = now() WHERE id = $2`,
            [value, ticketId],
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
      const stepId = await startStep(pool, runId, nodeId, "WEBHOOK", { data });
      try {
        const url = data["url"] as string;
        if (!url) throw new Error("Webhook node missing url");

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
