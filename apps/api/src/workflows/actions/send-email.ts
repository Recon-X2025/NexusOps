import { getIntegrationAdapter, resolveFirstConnected } from "../../services/integrations/registry";
import type { WorkflowAction } from "./types";

interface Input {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

/**
 * Sends an email through the org's connected productivity suite (Gmail via
 * Google Workspace, or Outlook via Microsoft 365), whichever is connected.
 * Falls back to a no-op success if neither is connected so rules don't fail.
 */
export const sendEmailAction: WorkflowAction<Input> = {
  name: "send_email",
  category: "comms",
  displayName: "Send email (Gmail / Outlook)",
  description:
    "Sends an email via the org's connected Google Workspace (Gmail) or Microsoft 365 (Outlook) account.",
  inputs: [
    { key: "to", label: "To address", type: "string", required: true },
    { key: "subject", label: "Subject", type: "string", required: true },
    { key: "body", label: "HTML body", type: "string", required: true },
    { key: "cc", label: "Cc (comma-separated)", type: "string" },
    { key: "bcc", label: "Bcc (comma-separated)", type: "string" },
  ],
  async handler(ctx, input) {
    const connected = await resolveFirstConnected(ctx.db, ctx.orgId, [
      "google_workspace",
      "microsoft_365",
    ]);
    if (!connected) {
      return { ok: false, details: "No connected email provider (Google Workspace or Microsoft 365)" };
    }

    const adapter = getIntegrationAdapter(connected.provider);
    if (!adapter?.send) {
      return { ok: false, details: `Adapter '${connected.provider}' cannot send` };
    }

    const res = await adapter.send(connected.config, {
      kind: "email",
      to: input.to,
      subject: input.subject,
      body: input.body,
      ...(input.cc !== undefined ? { cc: input.cc } : {}),
      ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
    });
    return { ok: true, providerRef: res.providerRef };
  },
};
