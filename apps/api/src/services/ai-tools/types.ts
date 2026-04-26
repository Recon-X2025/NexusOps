import type { Db } from "@nexusops/db";
import type { SystemRole } from "@nexusops/types";

/** Permission tuple checked by the agent runtime before invoking a tool. */
export interface ToolPermission {
  module: string;
  action: string;
}

/**
 * Runtime context passed to every tool handler. Mirrors the
 * `AgentContext` produced by the tRPC chat procedure so a single
 * shape works for read tools (search_*, get_*) and the new write
 * tools (create_ticket, update_ticket_status).
 */
export interface AgentToolContext {
  db: Db;
  orgId: string;
  userId: string;
  /** Effective system roles for the calling user; informational only. */
  roles?: SystemRole[];
}

/**
 * Property schema shape we hand to Anthropic. We keep it loose
 * (description / enum / items / additionalProperties / nested
 * object) so tools can describe arrays-of-strings or nested objects
 * without us re-deriving the JSON Schema spec.
 */
export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>;
}

/**
 * An agent tool exposes a typed, permission-gated capability to the
 * Claude tool-use loop. `requiredPermission` is mandatory — every
 * tool must declare what it needs so the runtime can RBAC-filter
 * before sending the tool list to the model.
 */
export interface AgentTool<I = Record<string, unknown>> {
  name: string;
  description: string;
  inputJsonSchema: {
    type: "object";
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
  requiredPermission: ToolPermission;
  handler: (ctx: AgentToolContext, input: I) => Promise<Record<string, unknown>>;
}
