import { integrations, eq, and, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../encryption";
import type { IntegrationAdapter } from "./types";
import { whatsAppAiSensyAdapter } from "./whatsapp-aisensy";
import { smsMsg91Adapter } from "./sms-msg91";
import { razorpayAdapter } from "./razorpay";
import { clearTaxGstAdapter } from "./cleartax-gst";
import { epfoEcrAdapter } from "./epfo-ecr";
import { esicReturnAdapter } from "./esic-return";
import { ptChallanAdapter } from "./pt-challan";
import { nicEwayBillAdapter } from "./nic-ewaybill";
import { mca21Adapter } from "./mca21";
import { googleWorkspaceAdapter } from "./google-workspace";
import { microsoft365Adapter } from "./microsoft-365";
import { slackAdapter } from "./slack";

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
  epfo_ecr: epfoEcrAdapter,
  esic_return: esicReturnAdapter,
  pt_challan: ptChallanAdapter,
  nic_ewaybill: nicEwayBillAdapter,
  mca21: mca21Adapter,
  google_workspace: googleWorkspaceAdapter,
  microsoft_365: microsoft365Adapter,
  slack: slackAdapter,
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

/** Resolve + decrypt a connected integration config for an org, or null. */
export async function resolveConnectedConfig(
  db: Db,
  orgId: string,
  provider: string,
): Promise<Record<string, string> | null> {
  const [row] = await db
    .select({ configEncrypted: integrations.configEncrypted, status: integrations.status })
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
  if (!row || row.status !== "connected" || !row.configEncrypted) return null;
  try {
    return await decryptIntegrationConfigEnvelope(row.configEncrypted);
  } catch (err) {
    console.error(`[integrations] Failed to decrypt ${provider} config for org ${orgId}:`, err);
    return null;
  }
}

/**
 * Find the first connected provider (in preference order) that supports send,
 * returning its provider key + decrypted config. Used by send-email and
 * create-calendar-event actions to pick whichever productivity suite the org
 * has connected (Google Workspace or Microsoft 365).
 */
export async function resolveFirstConnected(
  db: Db,
  orgId: string,
  providers: string[],
): Promise<{ provider: string; config: Record<string, string> } | null> {
  for (const provider of providers) {
    const config = await resolveConnectedConfig(db, orgId, provider);
    if (config) return { provider, config };
  }
  return null;
}
