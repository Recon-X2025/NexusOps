/**
 * On-shift roster resolution (H5).
 *
 * The service-desk workbench used to report `members[0]` as who is on shift
 * regardless of rotation or time, and hard-code the shift end to null. These
 * unit tests lock the honest replacement: overrides win, daily/weekly rotations
 * step deterministically from the schedule's creation anchor, and anything not
 * derivable from stored data reports unknown instead of a fabricated name.
 */

import { describe, it, expect } from "vitest";
import { resolveOnShift } from "../services/workbench-payloads/service-desk";

const WEEK = 7 * 86400000;
const DAY = 86400000;

const members = [
  { userId: "u-a", name: "Alice" },
  { userId: "u-b", name: "Bob" },
  { userId: "u-c", name: "Carol" },
];

describe("resolveOnShift", () => {
  it("prefers an override that is active right now, with its exact end time", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const end = new Date("2026-08-25T18:00:00.000Z");
    const r = resolveOnShift(
      {
        rotationType: "weekly",
        members,
        overrides: [
          { userId: "u-b", start: "2026-08-25T06:00:00.000Z", end: end.toISOString() },
        ],
        createdAt: new Date(now.getTime() - 4 * WEEK),
      },
      now,
    );
    expect(r.ownerName).toBe("Bob");
    expect(r.endsAt).toBe(end.toISOString());
  });

  it("steps a weekly rotation from the creation anchor (not always members[0])", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    // Created 4.5 weeks ago → cycle 4 → index 4 % 3 = 1 → Bob.
    const anchor = new Date(now.getTime() - 4.5 * WEEK);
    const r = resolveOnShift({ rotationType: "weekly", members, overrides: [], createdAt: anchor }, now);
    expect(r.ownerName).toBe("Bob");
    // Shift ends at the next weekly boundary, in the future.
    expect(new Date(r.endsAt!).getTime()).toBe(anchor.getTime() + 5 * WEEK);
    expect(new Date(r.endsAt!).getTime()).toBeGreaterThan(now.getTime());
  });

  it("steps a daily rotation likewise", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    // Created 2.25 days ago → cycle 2 → index 2 % 3 = 2 → Carol.
    const anchor = new Date(now.getTime() - 2.25 * DAY);
    const r = resolveOnShift({ rotationType: "daily", members, overrides: [], createdAt: anchor }, now);
    expect(r.ownerName).toBe("Carol");
    expect(new Date(r.endsAt!).getTime()).toBe(anchor.getTime() + 3 * DAY);
  });

  it("reports unknown for a custom rotation rather than fabricating a name", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const r = resolveOnShift(
      { rotationType: "custom", members, overrides: [], createdAt: new Date(now.getTime() - WEEK) },
      now,
    );
    expect(r.ownerName).toBeNull();
    expect(r.endsAt).toBeNull();
  });

  it("reports unknown for an empty roster", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const r = resolveOnShift(
      { rotationType: "weekly", members: [], overrides: [], createdAt: new Date(now.getTime() - WEEK) },
      now,
    );
    expect(r.ownerName).toBeNull();
    expect(r.endsAt).toBeNull();
  });

  it("ignores an override whose window does not contain now", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const anchor = new Date(now.getTime() - 1 * WEEK); // cycle 1 → index 1 → Bob
    const r = resolveOnShift(
      {
        rotationType: "weekly",
        members,
        overrides: [
          { userId: "u-c", start: "2026-08-20T06:00:00.000Z", end: "2026-08-20T18:00:00.000Z" },
        ],
        createdAt: anchor,
      },
      now,
    );
    // Override elapsed → falls through to rotation.
    expect(r.ownerName).toBe("Bob");
  });
});
