import { describe, it, expect, vi, afterEach } from "vitest";
import { googleWorkspaceAdapter } from "../services/integrations/google-workspace";
import { microsoft365Adapter } from "../services/integrations/microsoft-365";

const GOOGLE_CONFIG = {
  clientId: "cid",
  clientSecret: "secret",
  refreshToken: "rt",
};

const MS_CONFIG = {
  clientId: "cid",
  clientSecret: "secret",
  tenantId: "tenant",
  refreshToken: "rt",
};

/** Build a fetch mock that returns the access-token response first, then the
 * per-call API responses in order. */
function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { status: 200, body: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("googleWorkspaceAdapter.send()", () => {
  it("sends an email via the Gmail API with a base64url raw message", async () => {
    const calls = mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } }, // refresh
      { status: 200, body: { id: "msg-1" } }, // gmail send
    ]);

    const res = await googleWorkspaceAdapter.send!(GOOGLE_CONFIG, {
      kind: "email",
      to: "user@example.com",
      subject: "Hello",
      body: "<p>Hi</p>",
    });

    expect(res.providerRef).toBe("msg-1");
    expect(calls[1]!.url).toContain("gmail/v1/users/me/messages/send");
    const sendBody = JSON.parse(String(calls[1]!.init!.body));
    expect(typeof sendBody.raw).toBe("string");
    // base64url must not contain +, /, or = padding
    expect(sendBody.raw).not.toMatch(/[+/=]/);
  });

  it("creates a calendar event via the Calendar API", async () => {
    const calls = mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } },
      { status: 200, body: { id: "evt-1" } },
    ]);

    const res = await googleWorkspaceAdapter.send!(GOOGLE_CONFIG, {
      kind: "calendar_event",
      summary: "Interview",
      start: "2026-07-01T10:00:00Z",
      end: "2026-07-01T10:30:00Z",
      attendees: ["a@example.com", "b@example.com"],
    });

    expect(res.providerRef).toBe("evt-1");
    expect(calls[1]!.url).toContain("calendar/v3/calendars/primary/events");
    const body = JSON.parse(String(calls[1]!.init!.body));
    expect(body.start.dateTime).toBe("2026-07-01T10:00:00Z");
    expect(body.attendees).toEqual([{ email: "a@example.com" }, { email: "b@example.com" }]);
  });

  it("throws on a Gmail API error", async () => {
    mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } },
      { status: 403, body: { error: "forbidden" } },
    ]);
    await expect(
      googleWorkspaceAdapter.send!(GOOGLE_CONFIG, {
        kind: "email",
        to: "x@example.com",
        subject: "s",
        body: "b",
      }),
    ).rejects.toThrow(/Gmail send failed: 403/);
  });
});

describe("microsoft365Adapter.send()", () => {
  it("sends an email via Graph sendMail", async () => {
    const calls = mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } }, // refresh
      { status: 202, body: {} }, // sendMail (202 Accepted, no body)
    ]);

    const res = await microsoft365Adapter.send!(MS_CONFIG, {
      kind: "email",
      to: "user@example.com, second@example.com",
      subject: "Hello",
      body: "<p>Hi</p>",
    });

    expect(res.providerRef).toBe("accepted");
    expect(calls[1]!.url).toContain("graph.microsoft.com/v1.0/me/sendMail");
    const body = JSON.parse(String(calls[1]!.init!.body));
    expect(body.message.toRecipients).toHaveLength(2);
    expect(body.message.toRecipients[0].emailAddress.address).toBe("user@example.com");
  });

  it("creates a calendar event via Graph events", async () => {
    const calls = mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } },
      { status: 201, body: { id: "evt-ms" } },
    ]);

    const res = await microsoft365Adapter.send!(MS_CONFIG, {
      kind: "calendar_event",
      summary: "Change window",
      start: "2026-07-01T22:00:00Z",
      end: "2026-07-01T23:00:00Z",
    });

    expect(res.providerRef).toBe("evt-ms");
    expect(calls[1]!.url).toContain("graph.microsoft.com/v1.0/me/events");
    const body = JSON.parse(String(calls[1]!.init!.body));
    expect(body.subject).toBe("Change window");
    expect(body.start.dateTime).toBe("2026-07-01T22:00:00Z");
  });

  it("throws on a Graph sendMail error", async () => {
    mockFetchSequence([
      { status: 200, body: { access_token: "at", expires_in: 3600 } },
      { status: 401, body: { error: "unauthorized" } },
    ]);
    await expect(
      microsoft365Adapter.send!(MS_CONFIG, {
        kind: "email",
        to: "x@example.com",
        subject: "s",
        body: "b",
      }),
    ).rejects.toThrow(/Outlook send failed: 401/);
  });
});
