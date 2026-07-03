/**
 * E-sign provider gating tests (Sprint 0.6).
 *
 * DocuSign was advertised as a selectable e-sign provider (router input enum +
 * DB enum) but had no adapter implementation — a stub. The API must no longer
 * offer it: only implemented providers may be requested, and the provider
 * registry must not resolve "docusign".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { esignRouter } from "../routers/esign";
import {
  getEsignProvider,
  IMPLEMENTED_ESIGN_PROVIDERS,
} from "../services/esign";

describe("E-sign provider gating (Sprint 0.6)", () => {
  it("registry does not resolve the unimplemented docusign stub", () => {
    expect(getEsignProvider("docusign")).toBeNull();
    expect(getEsignProvider("emudhra")).not.toBeNull();
  });

  it("only implemented providers are advertised", () => {
    expect(IMPLEMENTED_ESIGN_PROVIDERS).toContain("emudhra");
    expect(IMPLEMENTED_ESIGN_PROVIDERS).not.toContain("docusign");
  });

  describe("router input validation", () => {
    let caller: any;

    beforeEach(async () => {
      const seeded = await seedFullOrg();
      caller = esignRouter.createCaller(createMockContext(seeded.adminId, seeded.orgId));
    });

    it("rejects createRequest with provider=docusign at input validation", async () => {
      await expect(
        caller.createRequest({
          title: "Contract",
          sourceType: "contract",
          sourceId: "11111111-1111-1111-1111-111111111111",
          documentStorageKey: "docs/x.pdf",
          documentSha256: "a".repeat(64),
          signers: [{ name: "Alice", email: "alice@example.com" }],
          provider: "docusign" as any,
        }),
      ).rejects.toThrow();
    });

    it("accepts emudhra as a provider (fails later on missing integration, not on the enum)", async () => {
      // No emudhra integration is configured, so this should fail with a
      // PRECONDITION about the integration — proving the provider itself is
      // accepted by input validation.
      await expect(
        caller.createRequest({
          title: "Contract",
          sourceType: "contract",
          sourceId: "11111111-1111-1111-1111-111111111111",
          documentStorageKey: "docs/x.pdf",
          documentSha256: "a".repeat(64),
          signers: [{ name: "Alice", email: "alice@example.com" }],
          provider: "emudhra",
        }),
      ).rejects.toThrow(/integration not configured/i);
    });
  });
});
