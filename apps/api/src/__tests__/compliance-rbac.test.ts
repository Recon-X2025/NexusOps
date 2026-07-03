/**
 * Compliance module + privacy_officer role RBAC scaffolding (Sprint 1.0).
 *
 * Sprint 1 introduces a data-protection compliance surface (DPDP Act 2023):
 * data-subject requests, consent ledger and breach register. These are gated
 * under a NEW `compliance` module owned by a NEW `privacy_officer` matrix role
 * (Data Protection Officer), with separation of duties from GRC / legal /
 * security. This test locks in that gating so the Sprint 1.1–1.3 routers can
 * rely on it.
 */
import { describe, it, expect } from "vitest";
import { systemRolesForDbUser, checkDbUserPermission } from "../lib/rbac-db";
import { hasPermission, canAccessModule, ROLE_PERMISSIONS } from "@coheronconnect/types";

describe("compliance module / privacy_officer role (Sprint 1.0)", () => {
  it("privacy_officer is a registered matrix role", () => {
    expect(ROLE_PERMISSIONS["privacy_officer"]).toBeDefined();
  });

  it("privacy_officer owns the compliance module (read/write/admin)", () => {
    const roles = systemRolesForDbUser("member", "privacy_officer");
    expect(roles).toContain("requester");
    expect(roles).toContain("privacy_officer");

    expect(hasPermission(roles, "compliance", "read")).toBe(true);
    expect(hasPermission(roles, "compliance", "write")).toBe(true);
    expect(hasPermission(roles, "compliance", "admin")).toBe(true);
    expect(canAccessModule(roles, "compliance")).toBe(true);
  });

  it("privacy_officer can see privacy matters (legal read) but NOT write legal/grc/security", () => {
    const roles = systemRolesForDbUser("member", "privacy_officer");
    expect(hasPermission(roles, "legal", "read")).toBe(true);
    // separation of duties — DPO is not a legal/GRC/security editor
    expect(hasPermission(roles, "legal", "write")).toBe(false);
    expect(hasPermission(roles, "grc", "read")).toBe(false);
    expect(hasPermission(roles, "security", "read")).toBe(false);
  });

  it("checkDbUserPermission gates compliance behind privacy_officer", () => {
    // A privacy_officer passes
    expect(checkDbUserPermission("member", "compliance", "write", "privacy_officer")).toBe(true);
    // A plain member does not
    expect(checkDbUserPermission("member", "compliance", "read", null)).toBe(false);
    // An unrelated matrix role (itil) does not
    expect(checkDbUserPermission("member", "compliance", "read", "itil")).toBe(false);
  });

  it("admin retains full compliance access (short-circuit)", () => {
    const roles = systemRolesForDbUser("owner", null);
    expect(hasPermission(roles, "compliance", "admin")).toBe(true);
  });

  it("legal_counsel gets collaborative compliance read/write; company_secretary does not by default", () => {
    const counsel = systemRolesForDbUser("member", "legal_counsel");
    expect(hasPermission(counsel, "compliance", "read")).toBe(true);
    expect(hasPermission(counsel, "compliance", "write")).toBe(true);

    const secretary = systemRolesForDbUser("member", "company_secretary");
    expect(hasPermission(secretary, "compliance", "read")).toBe(false);
  });
});
