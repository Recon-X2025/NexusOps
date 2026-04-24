import { describe, it, expect } from "vitest";
import { checkPermission } from "../server/rbac";

describe("server PERMISSION_MATRIX (ITSM gap remediation)", () => {
  it("viewer can read knowledge but not write", () => {
    expect(checkPermission("viewer", "knowledge", "read")).toBe(true);
    expect(checkPermission("viewer", "knowledge", "write")).toBe(false);
  });

  it("viewer can read catalog but not write or admin", () => {
    expect(checkPermission("viewer", "catalog", "read")).toBe(true);
    expect(checkPermission("viewer", "catalog", "write")).toBe(false);
    expect(checkPermission("viewer", "catalog", "admin")).toBe(false);
  });

  it("member can write knowledge and catalog", () => {
    expect(checkPermission("member", "knowledge", "write")).toBe(true);
    expect(checkPermission("member", "catalog", "write")).toBe(true);
  });
});
