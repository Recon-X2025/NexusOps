import { getIntegrationAdapter, resolveFirstConnected } from "../../services/integrations/registry";
import type { WorkflowAction } from "./types";

interface Input {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string;
}

/**
 * Creates a calendar event on the org's connected productivity suite (Google
 * Calendar via Google Workspace, or Outlook Calendar via Microsoft 365).
 * Used for interview scheduling, change windows, and maintenance reminders.
 */
export const createCalendarEventAction: WorkflowAction<Input> = {
  name: "create_calendar_event",
  category: "automation",
  displayName: "Create calendar event (Google / Outlook)",
  description:
    "Creates a calendar event via the org's connected Google Workspace or Microsoft 365 account.",
  inputs: [
    { key: "summary", label: "Event title", type: "string", required: true },
    { key: "start", label: "Start (ISO-8601)", type: "string", required: true },
    { key: "end", label: "End (ISO-8601)", type: "string", required: true },
    { key: "description", label: "Description", type: "string" },
    { key: "location", label: "Location", type: "string" },
    { key: "attendees", label: "Attendees (comma-separated emails)", type: "string" },
  ],
  async handler(ctx, input) {
    const connected = await resolveFirstConnected(ctx.db, ctx.orgId, [
      "google_workspace",
      "microsoft_365",
    ]);
    if (!connected) {
      return { ok: false, details: "No connected calendar provider (Google Workspace or Microsoft 365)" };
    }

    const adapter = getIntegrationAdapter(connected.provider);
    if (!adapter?.send) {
      return { ok: false, details: `Adapter '${connected.provider}' cannot send` };
    }

    const attendees = input.attendees
      ?.split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const res = await adapter.send(connected.config, {
      kind: "calendar_event",
      summary: input.summary,
      start: input.start,
      end: input.end,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(attendees && attendees.length > 0 ? { attendees } : {}),
    });
    return { ok: true, providerRef: res.providerRef };
  },
};
