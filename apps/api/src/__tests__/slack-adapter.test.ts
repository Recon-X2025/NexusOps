import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { slackAdapter, buildSlackPayload } from "../services/integrations/slack";

/**
 * Slack adapter verification.
 *
 * - test() validates the webhook URL shape with NO network call (a live test
 *   would spam the customer's real channel).
 * - send() hard-guards the hostname, so a non-Slack URL throws before any POST.
 * - buildSlackPayload() produces the exact Block Kit wire shape the worker
 *   depends on (coloured attachment, fallback text, conditional link button).
 *
 * The local HTTP server below proves the guard actually blocks non-Slack hosts
 * (it must never receive a request from send()).
 */

let server: Server;
let received = false;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((_req, res) => {
    received = true;
    res.statusCode = 200;
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/services/T000/B000/xxxx`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("slackAdapter.test()", () => {
  it("rejects a missing webhook URL", async () => {
    const r = await slackAdapter.test({ webhookUrl: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-Slack URL", async () => {
    const r = await slackAdapter.test({ webhookUrl: "https://evil.example.com/hook" });
    expect(r.ok).toBe(false);
  });

  it("accepts a well-formed hooks.slack.com URL without posting", async () => {
    const r = await slackAdapter.test({
      webhookUrl: "https://hooks.slack.com/services/T000/B000/xxxx",
    });
    expect(r.ok).toBe(true);
  });
});

describe("slackAdapter.send() hostname guard", () => {
  it("throws on a non-Slack URL and never reaches the network", async () => {
    received = false;
    await expect(
      slackAdapter.send!({ webhookUrl: baseUrl }, { title: "T", body: "B" }),
    ).rejects.toThrow(/Invalid Slack webhook URL/);
    expect(received).toBe(false);
  });
});

describe("buildSlackPayload()", () => {
  it("includes a coloured attachment, fallback text, and a link button", () => {
    const payload = buildSlackPayload({
      title: "Ticket #42 escalated",
      body: "SLA breach imminent",
      link: "https://app.example.com/tickets/42",
      type: "warning",
    }) as any;

    expect(payload.text).toBe("Ticket #42 escalated");
    expect(payload.attachments[0].color).toBe("#f59e0b");
    const blocks = payload.attachments[0].blocks;
    expect(blocks[0].text.text).toContain("*Ticket #42 escalated*");
    expect(blocks[0].text.text).toContain("SLA breach imminent");
    const actions = blocks.find((b: any) => b.type === "actions");
    expect(actions.elements[0].url).toBe("https://app.example.com/tickets/42");
  });

  it("defaults to the info colour and omits the link button when no link is given", () => {
    const payload = buildSlackPayload({ title: "Info", body: "No link here" }) as any;
    expect(payload.attachments[0].color).toBe("#6366f1");
    const hasActions = payload.attachments[0].blocks.some((b: any) => b.type === "actions");
    expect(hasActions).toBe(false);
  });

  it("maps each notification type to its accent colour", () => {
    const colour = (t: "info" | "warning" | "success" | "error") =>
      (buildSlackPayload({ title: "x", body: "y", type: t }) as any).attachments[0].color;
    expect(colour("success")).toBe("#22c55e");
    expect(colour("error")).toBe("#ef4444");
    expect(colour("warning")).toBe("#f59e0b");
    expect(colour("info")).toBe("#6366f1");
  });
});
