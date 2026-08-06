import { describe, it, expect } from "vitest";
import { filterEmployeeDirectory } from "../employee-directory-access";

/**
 * Fairness check for the employee-directory scoping (RBAC-UI finding, 2026-08-06).
 *
 * Red-before: the directory mapped the full `hr.employees.list` for everyone, so
 * a requester saw the whole roster. Green-after: a non-manager sees only their
 * own record; a manager (hr:assign) sees all.
 */

const rows = [
  { id: "e1", userId: "u1", name: "Amit" },
  { id: "e2", userId: "u2", name: "Karthik" },
  { id: "e3", userId: "u3", name: "Kartik" },
];

describe("filterEmployeeDirectory", () => {
  it("a manager (canManage) sees every row", () => {
    const out = filterEmployeeDirectory(rows, "u2", true);
    expect(out).toHaveLength(3);
  });

  it("a non-manager sees only their own record", () => {
    const out = filterEmployeeDirectory(rows, "u2", false);
    expect(out).toHaveLength(1);
    expect(out[0]!.userId).toBe("u2");
  });

  it("a non-manager with no matching employee record sees nothing", () => {
    const out = filterEmployeeDirectory(rows, "u-none", false);
    expect(out).toHaveLength(0);
  });

  it("a non-manager with an unknown user id sees nothing (never the full list)", () => {
    expect(filterEmployeeDirectory(rows, null, false)).toHaveLength(0);
    expect(filterEmployeeDirectory(rows, undefined, false)).toHaveLength(0);
  });

  it("handles a null/undefined row set", () => {
    expect(filterEmployeeDirectory(null, "u1", true)).toEqual([]);
    expect(filterEmployeeDirectory(undefined, "u1", false)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    filterEmployeeDirectory(rows, "u1", true);
    expect(rows).toEqual(copy);
  });
});
