/**
 * MED10 — notification fan-out per-channel idempotency.
 *
 * The dispatch queue runs with attempts:3, so a mid-loop failure re-runs the
 * whole job. Without per-channel idempotency the channel that already went out
 * (e.g. Slack) is re-delivered on the retry. These tests drive
 * runNotificationDispatch directly with spy dispatchers + the real test Redis
 * marker store, so no integrations are required.
 */
import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import {
  runNotificationDispatch,
  type NotificationDispatchJobData,
  type NotificationDispatchChannel,
} from "../workflows/notificationDispatchWorkflow";

const baseData = (): NotificationDispatchJobData => ({
  orgId: "org-1",
  channels: ["slack", "sms"],
  title: "t",
  body: "b",
});

function spyDispatchers(calls: string[], failing?: { channel: NotificationDispatchChannel; until: { fail: boolean } }) {
  return {
    slack: async () => {
      calls.push("slack");
      if (failing?.channel === "slack" && failing.until.fail) throw new Error("slack transport down");
    },
    sms: async () => {
      calls.push("sms");
      if (failing?.channel === "sms" && failing.until.fail) throw new Error("sms transport down");
    },
  };
}

describe("runNotificationDispatch idempotency (MED10)", () => {
  it("does not re-deliver a channel already delivered on a prior attempt", async () => {
    const key = `test-${nanoid(8)}`;
    const calls: string[] = [];
    const dispatchers = spyDispatchers(calls);

    await runNotificationDispatch(null as never, baseData(), { idempotencyKey: key, dispatchers });
    expect(calls).toEqual(["slack", "sms"]);

    // Retry with the SAME key → both channels skipped (already marked).
    await runNotificationDispatch(null as never, baseData(), { idempotencyKey: key, dispatchers });
    expect(calls).toEqual(["slack", "sms"]);
  });

  it("retries only the failed channel; the already-sent one is skipped", async () => {
    const key = `test-${nanoid(8)}`;
    const calls: string[] = [];
    const until = { fail: true };
    const dispatchers = spyDispatchers(calls, { channel: "sms", until });

    // First attempt: slack delivers, sms throws → the job fails.
    await expect(
      runNotificationDispatch(null as never, baseData(), { idempotencyKey: key, dispatchers }),
    ).rejects.toThrow(/sms transport/);
    expect(calls).toEqual(["slack", "sms"]);

    // Retry: slack was marked → skipped; sms retried (now succeeds).
    until.fail = false;
    await runNotificationDispatch(null as never, baseData(), { idempotencyKey: key, dispatchers });
    expect(calls).toEqual(["slack", "sms", "sms"]);
  });

  it("no idempotency key → no dedup (direct-call path unchanged)", async () => {
    const calls: string[] = [];
    const dispatchers = spyDispatchers(calls);
    await runNotificationDispatch(null as never, baseData(), { dispatchers });
    await runNotificationDispatch(null as never, baseData(), { dispatchers });
    expect(calls).toEqual(["slack", "sms", "slack", "sms"]);
  });
});
