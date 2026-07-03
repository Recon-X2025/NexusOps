/**
 * CVSS → remediation-SLA policy tests (Sprint 0.5).
 *
 * The remediation SLA on a vulnerability must be derived from CVSS score
 * (preferred) or severity, instead of relying on caller-supplied values. A
 * caller may still override with an explicit SLA on import.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { securityRouter } from "../routers/security";
import { vulnerabilities, eq, and } from "@coheronconnect/db";
import {
  resolveRemediationSlaDays,
  severityFromCvss,
  computeRemediationSla,
} from "../lib/vuln-sla-policy";

describe("CVSS → SLA policy (Sprint 0.5)", () => {
  describe("pure policy helper", () => {
    it("maps CVSS scores to severity bands", () => {
      expect(severityFromCvss(9.8)).toBe("critical");
      expect(severityFromCvss(7.0)).toBe("high");
      expect(severityFromCvss(5.5)).toBe("medium");
      expect(severityFromCvss(2.1)).toBe("low");
      expect(severityFromCvss(0)).toBe("none");
    });

    it("derives SLA days from CVSS band", () => {
      expect(resolveRemediationSlaDays({ cvssScore: "9.5" })).toBe(7);
      expect(resolveRemediationSlaDays({ cvssScore: "7.2" })).toBe(30);
      expect(resolveRemediationSlaDays({ cvssScore: "4.5" })).toBe(90);
      expect(resolveRemediationSlaDays({ cvssScore: "1.0" })).toBe(180);
      expect(resolveRemediationSlaDays({ cvssScore: "0" })).toBeNull();
    });

    it("falls back to severity when CVSS is absent", () => {
      expect(resolveRemediationSlaDays({ severity: "critical" })).toBe(7);
      expect(resolveRemediationSlaDays({ severity: "low" })).toBe(180);
    });

    it("respects an explicit override", () => {
      expect(resolveRemediationSlaDays({ cvssScore: "9.9", override: 3 })).toBe(3);
    });

    it("computes an absolute due date from discoveredAt", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      const { remediationSlaDays, remediationDueAt } = computeRemediationSla({
        cvssScore: "9.5",
        discoveredAt: base,
      });
      expect(remediationSlaDays).toBe(7);
      expect(remediationDueAt!.toISOString()).toBe("2026-01-08T00:00:00.000Z");
    });
  });

  describe("router integration", () => {
    let caller: any;
    let orgId: string;

    beforeEach(async () => {
      const seeded = await seedFullOrg();
      orgId = seeded.orgId;
      caller = securityRouter.createCaller(createMockContext(seeded.adminId, orgId));
    });

    it("createVulnerability derives SLA from CVSS score", async () => {
      const vuln = await caller.createVulnerability({
        title: "Critical RCE",
        severity: "critical",
        cvssScore: "9.8",
      });
      expect(vuln.remediationSlaDays).toBe(7);
      expect(vuln.remediationDueAt).not.toBeNull();
    });

    it("createVulnerability falls back to severity when no CVSS score", async () => {
      const vuln = await caller.createVulnerability({
        title: "Medium finding",
        severity: "medium",
      });
      expect(vuln.remediationSlaDays).toBe(90);
    });

    it("importVulnerabilities derives SLA from CVSS unless overridden", async () => {
      await caller.importVulnerabilities({
        source: "qualys",
        findings: [
          { fingerprint: "fp-derived", title: "High CVE", severity: "high", cvssScore: "8.1" },
          { fingerprint: "fp-override", title: "Override CVE", severity: "critical", remediationSlaDays: 2 },
        ],
      });

      const rows = await testDb()
        .select()
        .from(vulnerabilities)
        .where(and(eq(vulnerabilities.orgId, orgId)));

      const derived = rows.find((r) => r.externalFingerprint === "fp-derived")!;
      const overridden = rows.find((r) => r.externalFingerprint === "fp-override")!;
      expect(derived.remediationSlaDays).toBe(30); // CVSS 8.1 → high → 30d
      expect(overridden.remediationSlaDays).toBe(2); // explicit override respected
    });
  });
});
