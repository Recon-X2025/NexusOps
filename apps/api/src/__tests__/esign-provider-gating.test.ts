/**
 * E-sign provider gating tests (Sprint 0.6 → G17).
 *
 * The API only offers e-sign providers that have a real adapter implementation:
 * a name in the DB/router enum must resolve to a registered provider before it
 * can be requested. As of G17 both eMudhra and DocuSign are implemented; a
 * provider name with no adapter (or one absent from the input enum) is still
 * rejected.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { esignRouter } from "../routers/esign";
import {
  getEsignProvider,
  IMPLEMENTED_ESIGN_PROVIDERS,
} from "../services/esign";

describe("E-sign provider gating (G17)", () => {
  it("registry resolves every implemented provider", () => {
    expect(getEsignProvider("emudhra")).not.toBeNull();
    expect(getEsignProvider("docusign")).not.toBeNull();
  });

  it("registry does not resolve an unregistered provider name", () => {
    expect(getEsignProvider("adobe_sign")).toBeNull();
    expect(getEsignProvider("internal_otp")).toBeNull();
  });

  it("both eMudhra and DocuSign are advertised", () => {
    expect(IMPLEMENTED_ESIGN_PROVIDERS).toContain("emudhra");
    expect(IMPLEMENTED_ESIGN_PROVIDERS).toContain("docusign");
  });

  describe("router input validation", () => {
    let caller: any;

    beforeEach(async () => {
      const seeded = await seedFullOrg();
      caller = esignRouter.createCaller(createMockContext(seeded.adminId, seeded.orgId));
    });

    it("rejects createRequest with an unadvertised provider at input validation", async () => {
      await expect(
        caller.createRequest({
          title: "Contract",
          sourceType: "contract",
          sourceId: "11111111-1111-1111-1111-111111111111",
          documentStorageKey: "docs/x.pdf",
          documentSha256: "a".repeat(64),
          signers: [{ name: "Alice", email: "alice@example.com" }],
          provider: "adobe_sign" as any,
        }),
      ).rejects.toThrow();
    });

    it("accepts emudhra as a provider (fails later on missing integration, not on the enum)", async () => {
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

    it("accepts docusign as a provider (fails later on missing integration, not on the enum)", async () => {
      await expect(
        caller.createRequest({
          title: "Contract",
          sourceType: "contract",
          sourceId: "11111111-1111-1111-1111-111111111111",
          documentStorageKey: "docs/x.pdf",
          documentSha256: "a".repeat(64),
          signers: [{ name: "Alice", email: "alice@example.com" }],
          provider: "docusign",
        }),
      ).rejects.toThrow(/integration not configured/i);
    });
  });
});
