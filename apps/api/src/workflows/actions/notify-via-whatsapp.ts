import { integrations, eq, and } from "@coheronconnect/db";
import { decryptIntegrationConfig } from "../../services/encryption";
import { whatsAppAiSensyAdapter } from "../../services/integrations/whatsapp-aisensy";
import type { WorkflowAction } from "./types";

interface Input {
  to: string;
  campaignName: string;
  templateParams?: Record<string, string>;
}

export const notifyViaWhatsAppAction: WorkflowAction<Input> = {
  name: "notify_via_whatsapp",
  category: "comms",
  displayName: "Send WhatsApp message",
  description:
    "Send a templated WhatsApp message via the tenant's connected BSP (AiSensy). Uses an approved template and runtime variables.",
  inputs: [
    { key: "to", label: "Recipient phone (E.164)", type: "string", required: true },
    { key: "campaignName", label: "AiSensy campaign / template name", type: "string", required: true },
    { key: "templateParams", label: "Template variables (JSON)", type: "json" },
  ],
  async handler(ctx, input) {
    const [int] = await ctx.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.orgId, ctx.orgId),
          eq(integrations.provider, "whatsapp_aisensy"),
          eq(integrations.status, "connected"),
        ),
      )
      .limit(1);
    if (!int?.configEncrypted) {
      return { ok: false, details: "WhatsApp (AiSensy) not connected" };
    }
    const config = decryptIntegrationConfig(int.configEncrypted) as unknown as Parameters<
      NonNullable<typeof whatsAppAiSensyAdapter.send>
    >[0];
    const result = await whatsAppAiSensyAdapter.send!(config, {
      to: input.to,
      campaignName: input.campaignName,
      ...(input.templateParams ? { templateParams: input.templateParams } : {}),
    });
    return { ok: true, providerRef: result.providerRef };
  },
};
