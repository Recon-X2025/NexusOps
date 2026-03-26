import { describe, it, expect } from "vitest";
import { hasPermission } from "@nexusops/types";

describe("RBAC: Permission Matrix", () => {
  it("admin role can write incidents", () => {
    expect(hasPermission(["admin"], "incidents", "write")).toBe(true);
  });

  it("admin role can admin financial", () => {
    expect(hasPermission(["admin"], "financial", "admin")).toBe(true);
  });

  it("itil role can write incidents", () => {
    expect(hasPermission(["itil"], "incidents", "write")).toBe(true);
  });

  it("requester role cannot delete incidents", () => {
    // requesters can read/write (submit) incidents but cannot delete them
    expect(hasPermission(["requester"], "incidents", "delete")).toBe(false);
  });

  it("finance_manager role can admin financial", () => {
    expect(hasPermission(["finance_manager"], "financial", "admin")).toBe(true);
  });

  it("itil role cannot admin financial", () => {
    expect(hasPermission(["itil"], "financial", "admin")).toBe(false);
  });

  it("report_viewer role can read reports", () => {
    expect(hasPermission(["report_viewer"], "reports", "read")).toBe(true);
  });

  it("requester role cannot delete anything", () => {
    const modules = ["incidents", "changes", "financial", "grc"] as const;
    for (const m of modules) {
      expect(hasPermission(["requester"], m, "delete")).toBe(false);
    }
  });
});

describe("RBAC: Admin Procedure", () => {
  it("admin matrix role bypasses module permission check", () => {
    // admin role short-circuits and returns true for all modules/actions
    expect(hasPermission(["admin"], "incidents", "read")).toBe(true);
    expect(hasPermission(["admin"], "financial", "write")).toBe(true);
    expect(hasPermission(["admin"], "hr", "admin")).toBe(true);
  });
});
