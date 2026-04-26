import type { AgentTool } from "./types";
import { searchTicketsTool } from "./search-tickets";
import { getTicketTool } from "./get-ticket";
import { searchEmployeesTool } from "./search-employees";
import { getPayslipTool } from "./get-payslip";
import { searchInvoicesTool } from "./search-invoices";
import { searchContractsTool } from "./search-contracts";
import { getComplianceCalendarTool } from "./get-compliance-calendar";
import { searchKbTool } from "./search-kb";
import { createTicketTool } from "./create-ticket";
import { updateTicketStatusTool } from "./update-ticket-status";

/**
 * Registry of every agent tool. Read tools (search_*, get_*) ship
 * with the v1 read-only agent; write tools (create_ticket,
 * update_ticket_status) are gated behind a confirmation prompt at
 * the model level and per-tool RBAC at the runtime level.
 *
 * To add a new tool: drop a file in this folder and append it here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allTools: AgentTool<any>[] = [
  // ── Read tools ────────────────────────────────────────────────
  searchTicketsTool,
  getTicketTool,
  searchEmployeesTool,
  getPayslipTool,
  searchInvoicesTool,
  searchContractsTool,
  getComplianceCalendarTool,
  searchKbTool,
  // ── Write tools (confirmation-gated) ─────────────────────────
  createTicketTool,
  updateTicketStatusTool,
];

/** Alias kept for the new `agent` router; identical to `allTools`. */
export const AGENT_TOOLS = allTools;

export function getAgentTool(name: string): AgentTool | undefined {
  return allTools.find((t) => t.name === name);
}

export type { AgentTool, AgentToolContext, ToolPermission } from "./types";
