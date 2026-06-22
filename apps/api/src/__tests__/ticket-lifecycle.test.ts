import { describe, it, expect } from "vitest";
import { TICKET_LIFECYCLE, assertTicketTransition } from "../lib/ticket-lifecycle";

describe("ITSM ticket lifecycle (regression)", () => {
  it("defines expected open → in_progress → resolved → closed paths", () => {
    expect(TICKET_LIFECYCLE.open).toContain("in_progress");
    expect(TICKET_LIFECYCLE.in_progress).toContain("resolved");
    expect(TICKET_LIFECYCLE.resolved).toContain("closed");
    expect(TICKET_LIFECYCLE.closed).toContain("open");
  });

  it("allows open → resolved (skip in_progress)", () => {
    expect(() => assertTicketTransition("open", "resolved")).not.toThrow();
  });

  it("rejects open → bogus", () => {
    expect(() => assertTicketTransition("open", "bogus")).toThrow(/Invalid status transition/);
  });

  it("allows unknown from-category (custom statuses)", () => {
    expect(() => assertTicketTransition("custom_waiting", "open")).not.toThrow();
  });

  it("allows in_progress → pending and pending → in_progress", () => {
    expect(() => assertTicketTransition("in_progress", "pending")).not.toThrow();
    expect(() => assertTicketTransition("pending", "in_progress")).not.toThrow();
  });

  it("rejects pending → bogus", () => {
    expect(() => assertTicketTransition("pending", "bogus")).toThrow(/Invalid status transition/);
  });
});
