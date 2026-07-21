/**
 * SMS notification channel (G13).
 *
 * SMS is now a first-class fan-out channel in `runNotificationDispatch`
 * alongside Slack. Delivery routes through the DLT-compliant MSG91 adapter and
 * is best-effort:
 *   • an org with a connected `sms_msg91` integration and an `sms` payload gets
 *     a real MSG91 flow POST (template id + E.164 recipient, leading + stripped);
 *   • a job that lists "sms" but carries no `sms` payload is a no-op;
 *   • an org that has NOT connected MSG91 is a no-op even with a payload;
 *   • the Slack and SMS channels are independent — one being absent never
 *     suppresses the other.
 *
 * The MSG91 request is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-sms-do-not-use-in-prod";

import { seedFullOrg, testDb } from "./helpers";
import { runNotificationDispatch } from "../workflows/notificationDispatchWorkflow";
import { encryptIntegrationConfig } from "../services/encryption";
import { integrations } from "@coheronconnect/db";

function mockFetch() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: "req-ok", type: "success" }),
      text: async () => JSON.stringify({ message: "req-ok" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

describe("SMS notification channel (G13)", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectMsg91 = async () =>
    testDb().insert(integrations).values({
      orgId,
      provider: "sms_msg91",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({ authKey: "ak", senderId: "COHERN" }),
    });

  const smsJob = () => ({
    orgId,
    channels: ["sms"] as const,
    title: "Ticket assigned",
    body: "INC-42 was assigned to you",
    sms: {
      to: "+919876543210",
      templateId: "tmpl-assign",
      variables: { ticket: "INC-42" },
    },
  });

  it("delivers via MSG91 when the org has connected SMS and a payload is present", async () => {
    await connectMsg91();
    const calls = mockFetch();

    await runNotificationDispatch(testDb(), smsJob());

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("control.msg91.com/api/v5/flow");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.template_id).toBe("tmpl-assign");
    expect(body.sender).toBe("COHERN");
    expect(body.recipients[0].mobiles).toBe("919876543210"); // leading + stripped
    expect(body.recipients[0].ticket).toBe("INC-42");
  });

  it("is a no-op when the org has not connected MSG91", async () => {
    const calls = mockFetch();
    await runNotificationDispatch(testDb(), smsJob());
    expect(calls).toHaveLength(0);
  });

  it("is a no-op when the sms channel is requested but no payload is supplied", async () => {
    await connectMsg91();
    const calls = mockFetch();

    await runNotificationDispatch(testDb(), {
      orgId,
      channels: ["sms"],
      title: "t",
      body: "b",
      // no `sms` payload
    });

    expect(calls).toHaveLength(0);
  });

  it("does not send SMS for a Slack-only job", async () => {
    await connectMsg91();
    const calls = mockFetch();

    await runNotificationDispatch(testDb(), {
      orgId,
      channels: ["slack"],
      title: "t",
      body: "b",
      sms: { to: "+911111111111", templateId: "x", variables: {} },
    });

    // Slack isn't connected → no Slack call; SMS wasn't a requested channel → no SMS call.
    expect(calls).toHaveLength(0);
  });

  it("is tenant-scoped — another org's MSG91 connection does not deliver ours", async () => {
    const other = await seedFullOrg();
    await testDb().insert(integrations).values({
      orgId: other.orgId,
      provider: "sms_msg91",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({ authKey: "ak", senderId: "OTHER" }),
    });
    const calls = mockFetch();

    // Our org has no connection of its own.
    await runNotificationDispatch(testDb(), smsJob());
    expect(calls).toHaveLength(0);
  });
});
