import type { IntegrationAdapter } from "./types";
import { whatsAppAiSensyAdapter } from "./whatsapp-aisensy";
import { smsMsg91Adapter } from "./sms-msg91";
import { razorpayAdapter } from "./razorpay";
import { clearTaxGstAdapter } from "./cleartax-gst";
import { googleWorkspaceAdapter } from "./google-workspace";
import { microsoft365Adapter } from "./microsoft-365";

/**
 * Central adapter registry — `integrations` tRPC router resolves a provider
 * here and dispatches send/test/oauth/webhook calls.
 *
 * Adding a new connector is a 1-line PR: implement IntegrationAdapter, drop
 * it in this map.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapters: Record<string, IntegrationAdapter<any, any>> = {
  whatsapp_aisensy: whatsAppAiSensyAdapter,
  sms_msg91: smsMsg91Adapter,
  razorpay: razorpayAdapter,
  cleartax_gst: clearTaxGstAdapter,
  google_workspace: googleWorkspaceAdapter,
  microsoft_365: microsoft365Adapter,
};

export type SupportedProvider = keyof typeof adapters;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIntegrationAdapter(provider: string): IntegrationAdapter<any, any> | null {
  return adapters[provider] ?? null;
}

export function listSupportedProviders(): Array<{
  provider: string;
  displayName: string;
  capabilities: IntegrationAdapter["capabilities"];
}> {
  return Object.values(adapters).map((a) => ({
    provider: a.provider,
    displayName: a.displayName,
    capabilities: a.capabilities,
  }));
}
