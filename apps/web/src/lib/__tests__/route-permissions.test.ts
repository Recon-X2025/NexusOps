import { describe, it, expect } from "vitest";
import {
  resolveRouteModule,
  PUBLIC_APP_ROUTES,
} from "../route-permissions";
import { canAccessModule, type SystemRole } from "@coheronconnect/types";

/**
 * Fairness check for the layout route guard (RBAC-UI finding, 2026-08-06).
 *
 * Proves the guard resolves each /app route to the module the sidebar assigns,
 * and — combined with the shared matrix — that a base `requester` is denied the
 * modules that leaked before (finance/admin/etc.) while an admin is allowed
 * everywhere. Red-before: with no guard, every one of these rendered for anyone.
 */

const REQUESTER: SystemRole[] = ["requester"];
const ADMIN: SystemRole[] = ["requester", "admin"];

/** Mirror of the guard's decision: allowed iff the route is public/unmapped or
 *  the roles can read the resolved module. */
function guardAllows(pathname: string, roles: SystemRole[]): boolean {
  const module = resolveRouteModule(pathname);
  if (!module) return true; // public or unmapped → render
  return canAccessModule(roles, module);
}

describe("resolveRouteModule — route → module map", () => {
  it("maps hub and sub-routes to their owning module", () => {
    expect(resolveRouteModule("/app/hr")).toBe("hr");
    expect(resolveRouteModule("/app/hr/expenses")).toBe("hr");
    expect(resolveRouteModule("/app/hr/abc123")).toBe("hr");
    expect(resolveRouteModule("/app/financial")).toBe("financial");
    expect(resolveRouteModule("/app/finance/accounting/coa")).toBe("financial");
    expect(resolveRouteModule("/app/procurement")).toBe("financial");
    expect(resolveRouteModule("/app/admin")).toBe("admin");
    expect(resolveRouteModule("/app/admin/custom-fields")).toBe("admin");
    expect(resolveRouteModule("/app/security")).toBe("security");
    expect(resolveRouteModule("/app/payroll")).toBe("payroll");
    expect(resolveRouteModule("/app/crm/deals")).toBe("accounts");
    expect(resolveRouteModule("/app/settings/api-keys")).toBe("settings");
    expect(resolveRouteModule("/app/workbench/hr-ops")).toBe("workbench");
  });

  it("does not let a shorter prefix bleed across a hyphen boundary", () => {
    // /app/security must not swallow /app/security-compliance, nor /app/finance
    // swallow /app/finance-procurement — both are distinct explicit rules.
    expect(resolveRouteModule("/app/security-compliance")).toBe("security");
    expect(resolveRouteModule("/app/finance-procurement")).toBe("financial");
    expect(resolveRouteModule("/app/strategy-projects")).toBe("projects");
  });

  it("treats the app root and public routes as always-allowed (null module)", () => {
    expect(resolveRouteModule("/app")).toBeNull();
    expect(resolveRouteModule("/app/")).toBeNull();
    for (const r of PUBLIC_APP_ROUTES) {
      expect(resolveRouteModule(r)).toBeNull();
    }
    // The app root must NOT act as a prefix that allows everything under it.
    expect(resolveRouteModule("/app/financial")).not.toBeNull();
  });

  it("falls through to allow (null) for an unmapped route — API stays authoritative", () => {
    expect(resolveRouteModule("/app/some-brand-new-page")).toBeNull();
  });
});

describe("guard outcome — requester denied leaked modules, admin allowed", () => {
  it("BLOCKS a requester from the modules that leaked before the fix", () => {
    for (const path of [
      "/app/financial",
      "/app/finance/accounting/journal",
      "/app/admin",
      "/app/vendors",
      "/app/crm",
      "/app/payroll",
      "/app/secretarial",
      "/app/security",
    ]) {
      expect(guardAllows(path, REQUESTER), `requester should be denied ${path}`).toBe(false);
    }
  });

  it("ALLOWS a requester on their legitimate self-service surfaces", () => {
    for (const path of [
      "/app/command",
      "/app/profile",
      "/app/employee-portal",
      "/app/employee-center",
      "/app/hr", // reachable — the page itself scopes the directory to own record
      "/app/knowledge",
    ]) {
      expect(guardAllows(path, REQUESTER), `requester should be allowed ${path}`).toBe(true);
    }
  });

  it("ALLOWS an admin everywhere", () => {
    for (const path of [
      "/app/financial",
      "/app/admin",
      "/app/vendors",
      "/app/payroll",
      "/app/secretarial",
      "/app/security",
      "/app/hr",
    ]) {
      expect(guardAllows(path, ADMIN), `admin should be allowed ${path}`).toBe(true);
    }
  });
});
