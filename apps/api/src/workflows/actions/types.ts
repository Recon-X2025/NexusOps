/**
 * Workflow action library — composable building blocks invoked by workflow
 * rules and Temporal activities. Each action declares:
 *   - a stable name (used in business_rules.action JSON)
 *   - a Zod-style JSON schema for inputs (validated at registration time)
 *   - a handler that takes (ctx, input)
 *
 * Actions are intentionally side-effect-only — they don't return rich data;
 * they perform their work and may emit a small status object for the rules
 * engine logger.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbAny = any;

export interface ActionContext {
  db: DbAny;
  orgId: string;
  actorId: string;
}

export interface WorkflowActionResult {
  ok: boolean;
  details?: string;
  providerRef?: string;
}

export interface WorkflowAction<TInput = Record<string, unknown>> {
  name: string;
  category: "comms" | "itsm" | "statutory" | "legal" | "crm" | "hr";
  displayName: string;
  description: string;
  /**
   * Lightweight schema (key → type-string) for the rules-engine UI editor.
   * Full validation lives inside the handler — this is purely declarative.
   */
  inputs: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "uuid" | "select" | "json";
    required?: boolean;
    options?: string[];
  }>;
  handler: (ctx: ActionContext, input: TInput) => Promise<WorkflowActionResult>;
}
