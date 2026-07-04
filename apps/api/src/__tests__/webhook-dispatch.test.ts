/**
 * Outbound webhook dispatcher (Sprint 3.2).
 *
 * Closes the automation loop's second half: `webhooks` + `webhook_deliveries`
 * were fully modelled but nothing ever created a delivery or POSTed a
 * subscriber. Verifies:
 *   • `enqueueWebhookEvent` — one pending delivery row per active subscriber
 *     to the event; nothing for non-subscribers / inactive hooks.
 *   • `sweepPendingDeliveries` — claims due rows, HMAC-SHA256 signs the body,
 *     POSTs, and records the outcome (`success` on 2xx; `failed` + backoff
 *     `nextRetryAt` on non-2xx; terminal `failed` at max attempts).
 *
 * Delivery invariants asserted:
 *   • at-least-once with an idempotency key (`X-Coheron-Delivery`),
 *   • HMAC signature is verifiable by the subscriber's shared secret,
 *   • no financial mutation happens as a side effect of delivery.
 *
 * `fetchImpl` is injected as a stub so no real HTTP server is needed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { seedFullOrg, testDb } from "./helpers";
import { webhooks, webhookDeliveries, journalEntries } from "@coheronconnect/db";
import { enqueueWebhookEvent, sweepPendingDeliveries } from "../workflows/webhookDispatchWorkflow";

const SECRET = "whsec_test_shared_secret";

/** Build a fetch stub that records calls and returns a scripted response. */
function stubFetch(script: { status: number; body?: string } | ((url: string, init: RequestInit) => { status: number; body?: string })) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = typeof script === "function" ? script(url, init) : script;
    return {
      status: r.status,
      async text() {
        return r.body ?? "";
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("Outbound webhook dispatcher (Sprint 3.2)", () => {
  let orgId: string;

  beforeEach(async () => {
    // The dispatch sweep is global (claims all due deliveries DB-wide), so
    // clear any leftovers from prior tests before seeding this one. The suite
    // runs serially in a single fork against a shared DB.
    await testDb().execute(sql`DELETE FROM webhook_deliveries`);
    await testDb().execute(sql`DELETE FROM webhooks`);
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  async function seedWebhook(opts: { events: string[]; isActive?: boolean; url?: string }): Promise<string> {
    const [hook] = await testDb()
      .insert(webhooks)
      .values({
        orgId,
        name: "Subscriber",
        url: opts.url ?? "https://sub.example.com/hook",
        events: opts.events,
        secret: SECRET,
        isActive: opts.isActive ?? true,
      })
      .returning();
    return hook!.id;
  }

  async function listDeliveries(webhookId: string) {
    return testDb().select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId));
  }

  // ── enqueue ────────────────────────────────────────────────────────────

  it("enqueues one pending delivery per active subscriber to the event", async () => {
    const a = await seedWebhook({ events: ["ticket.created", "ticket.updated"] });
    const b = await seedWebhook({ events: ["ticket.created"] });
    await seedWebhook({ events: ["invoice.paid"] }); // not subscribed to ticket.created

    const n = await enqueueWebhookEvent(testDb(), {
      orgId,
      event: "ticket.created",
      payload: { ticketId: "T-1" },
    });
    expect(n).toBe(2);

    const da = await listDeliveries(a);
    const db_ = await listDeliveries(b);
    expect(da).toHaveLength(1);
    expect(db_).toHaveLength(1);
    expect(da[0]!.status).toBe("pending");
    expect(da[0]!.event).toBe("ticket.created");
    expect(da[0]!.payload).toEqual({ ticketId: "T-1" });
  });

  it("does not enqueue for inactive subscribers or non-matching events", async () => {
    await seedWebhook({ events: ["ticket.created"], isActive: false });
    await seedWebhook({ events: ["ticket.updated"] });

    const n = await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });
    expect(n).toBe(0);
  });

  // ── dispatch: success ────────────────────────────────────────────────────

  it("delivers a pending delivery: POSTs, signs HMAC, marks success", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: { ticketId: "T-1" } });

    const { impl, calls } = stubFetch({ status: 200, body: "ok" });
    const r = await sweepPendingDeliveries(testDb(), impl);

    expect(r.claimed).toBe(1);
    expect(r.delivered).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.exhausted).toBe(0);

    // One POST with the expected headers.
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://sub.example.com/hook");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Coheron-Event"]).toBe("ticket.created");
    expect(headers["X-Coheron-Delivery"]).toBeTruthy(); // idempotency key
    expect(headers["Content-Type"]).toBe("application/json");

    // HMAC signature is verifiable with the shared secret over the raw body.
    const rawBody = init.body as string;
    const expected = createHmac("sha256", SECRET).update(rawBody).digest("hex");
    expect(headers["X-Coheron-Signature"]).toBe(`sha256=${expected}`);

    const [d] = await listDeliveries(hookId);
    expect(d!.status).toBe("success");
    expect(d!.statusCode).toBe(200);
    expect(d!.attempts).toBe(1);
    expect(d!.completedAt).not.toBeNull();
  });

  // ── dispatch: retry with backoff ───────────────────────────────────────────

  it("marks failed + sets nextRetryAt backoff on a non-2xx response (retryable)", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });

    const { impl } = stubFetch({ status: 500, body: "boom" });
    const r = await sweepPendingDeliveries(testDb(), impl);

    expect(r.claimed).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.delivered).toBe(0);

    const [d] = await listDeliveries(hookId);
    expect(d!.status).toBe("failed");
    expect(d!.statusCode).toBe(500);
    expect(d!.attempts).toBe(1);
    expect(d!.nextRetryAt).not.toBeNull();
    // Backoff scheduled in the future.
    expect(d!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    // Not terminal yet.
    expect(d!.completedAt).toBeNull();
  });

  it("re-claims a failed delivery once nextRetryAt has elapsed and can then succeed", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });

    // First tick fails.
    await sweepPendingDeliveries(testDb(), stubFetch({ status: 500 }).impl);

    // Force the retry due by backdating nextRetryAt.
    await testDb()
      .update(webhookDeliveries)
      .set({ nextRetryAt: new Date(Date.now() - 1000) })
      .where(eq(webhookDeliveries.webhookId, hookId));

    // Second tick succeeds.
    const r = await sweepPendingDeliveries(testDb(), stubFetch({ status: 200 }).impl);
    expect(r.claimed).toBe(1);
    expect(r.delivered).toBe(1);

    const [d] = await listDeliveries(hookId);
    expect(d!.status).toBe("success");
    expect(d!.attempts).toBe(2);
  });

  it("marks a delivery terminally failed once attempts reach the max", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });

    // Pre-set attempts to one below the cap so the next failure exhausts it.
    // MAX_ATTEMPTS is 6; set attempts=5 so this attempt (=6) is terminal.
    await testDb()
      .update(webhookDeliveries)
      .set({ attempts: 5 })
      .where(eq(webhookDeliveries.webhookId, hookId));

    const r = await sweepPendingDeliveries(testDb(), stubFetch({ status: 503 }).impl);
    expect(r.exhausted).toBe(1);
    expect(r.failed).toBe(0);

    const [d] = await listDeliveries(hookId);
    expect(d!.status).toBe("failed");
    expect(d!.attempts).toBe(6);
    expect(d!.nextRetryAt).toBeNull(); // no further retry scheduled
    expect(d!.completedAt).not.toBeNull(); // terminal
  });

  it("does not attempt deliveries already at the attempt cap", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });
    await testDb()
      .update(webhookDeliveries)
      .set({ attempts: 6, status: "failed" })
      .where(eq(webhookDeliveries.webhookId, hookId));

    const { impl, calls } = stubFetch({ status: 200 });
    const r = await sweepPendingDeliveries(testDb(), impl);
    expect(r.claimed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("marks failed (inactive) when the subscriber was deactivated after enqueue", async () => {
    const hookId = await seedWebhook({ events: ["ticket.created"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "ticket.created", payload: {} });

    // Deactivate the subscriber between enqueue and dispatch.
    await testDb().update(webhooks).set({ isActive: false }).where(eq(webhooks.id, hookId));

    const { impl, calls } = stubFetch({ status: 200 });
    const r = await sweepPendingDeliveries(testDb(), impl);
    expect(r.failed).toBe(1);
    expect(calls).toHaveLength(0); // no POST to a dead endpoint

    const [d] = await listDeliveries(hookId);
    expect(d!.status).toBe("failed");
    expect(d!.response).toContain("inactive");
  });

  // ── money-path invariant ───────────────────────────────────────────────

  it("performs NO financial mutation as a side effect of delivery", async () => {
    const before = await testDb().select().from(journalEntries);
    const beforeCount = before.length;

    await seedWebhook({ events: ["invoice.paid"] });
    await enqueueWebhookEvent(testDb(), { orgId, event: "invoice.paid", payload: { amount: 999999 } });
    await sweepPendingDeliveries(testDb(), stubFetch({ status: 200 }).impl);

    const after = await testDb().select().from(journalEntries);
    expect(after.length).toBe(beforeCount);
  });
});
