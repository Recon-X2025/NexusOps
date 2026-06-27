import { describe, it, expect } from "vitest";
import { getOrgSamlConfig } from "../lib/org-settings";

/**
 * SAML SSO config gate + validation behavior.
 *
 * `getOrgSamlConfig` is the security gate that decides whether a SAML flow may
 * start at all: it must refuse unless SSO is explicitly enabled AND both the IdP
 * endpoint and its signing cert are present (without the cert we cannot verify
 * assertion signatures).
 */
describe("getOrgSamlConfig", () => {
  const FULL = {
    sso: {
      saml: {
        enabled: true,
        entryPoint: "https://idp.example.com/sso",
        idpIssuer: "https://idp.example.com/entity",
        idpCert: "MIIBfakeCERTbody",
        attributeMapping: { email: "mail", name: "displayName" },
      },
    },
  };

  it("returns an effective config when enabled and complete", () => {
    const cfg = getOrgSamlConfig(FULL);
    expect(cfg).not.toBeNull();
    expect(cfg!.entryPoint).toBe("https://idp.example.com/sso");
    expect(cfg!.idpCert).toBe("MIIBfakeCERTbody");
    expect(cfg!.idpIssuer).toBe("https://idp.example.com/entity");
    expect(cfg!.attributeMapping).toEqual({ email: "mail", name: "displayName" });
  });

  it("returns null when SSO is not enabled (default-deny)", () => {
    const cfg = getOrgSamlConfig({
      sso: { saml: { ...FULL.sso.saml, enabled: false } },
    });
    expect(cfg).toBeNull();
  });

  it("returns null when the `enabled` flag is missing entirely", () => {
    const { enabled: _e, ...rest } = FULL.sso.saml;
    expect(getOrgSamlConfig({ sso: { saml: rest } })).toBeNull();
  });

  it("returns null when the IdP signing cert is absent (cannot verify signatures)", () => {
    const cfg = getOrgSamlConfig({
      sso: { saml: { enabled: true, entryPoint: "https://idp.example.com/sso" } },
    });
    expect(cfg).toBeNull();
  });

  it("returns null when the IdP entryPoint is absent", () => {
    const cfg = getOrgSamlConfig({
      sso: { saml: { enabled: true, idpCert: "cert" } },
    });
    expect(cfg).toBeNull();
  });

  it("trims whitespace around endpoint, cert, and issuer", () => {
    const cfg = getOrgSamlConfig({
      sso: {
        saml: {
          enabled: true,
          entryPoint: "  https://idp.example.com/sso  ",
          idpCert: "  certbody  ",
          idpIssuer: "  issuer  ",
        },
      },
    });
    expect(cfg!.entryPoint).toBe("https://idp.example.com/sso");
    expect(cfg!.idpCert).toBe("certbody");
    expect(cfg!.idpIssuer).toBe("issuer");
  });

  it("omits idpIssuer / attributeMapping when not provided", () => {
    const cfg = getOrgSamlConfig({
      sso: { saml: { enabled: true, entryPoint: "https://idp/sso", idpCert: "cert" } },
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.idpIssuer).toBeUndefined();
    expect(cfg!.attributeMapping).toBeUndefined();
  });

  it("tolerates absent / malformed settings without throwing", () => {
    expect(getOrgSamlConfig(undefined)).toBeNull();
    expect(getOrgSamlConfig(null)).toBeNull();
    expect(getOrgSamlConfig("not-an-object")).toBeNull();
    expect(getOrgSamlConfig({})).toBeNull();
    expect(getOrgSamlConfig({ sso: {} })).toBeNull();
  });
});

/**
 * Validation behavior of the underlying node-saml instance built from an org's
 * config. We assert the *negative* security property here (invalid input is
 * rejected) which is the property that matters for SSO safety. A full positive
 * signed-assertion round-trip requires live IdP key material and is exercised in
 * integration, not this unit suite.
 */
describe("SAML response validation (negative security checks)", () => {
  // A syntactically-valid self-signed cert so the SAML instance constructs.
  const TEST_CERT = [
    "-----BEGIN CERTIFICATE-----",
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAfakefakefakefakefake",
    "-----END CERTIFICATE-----",
  ].join("\n");

  async function buildInstance() {
    const { SAML } = await import("@node-saml/node-saml");
    return new SAML({
      callbackUrl: "https://sp.example.com/auth/saml/callback",
      entryPoint: "https://idp.example.com/sso",
      issuer: "https://sp.example.com/auth/saml/metadata",
      idpCert: TEST_CERT,
      audience: "https://sp.example.com/auth/saml/metadata",
      wantAssertionsSigned: true,
      validateInResponseTo: "never" as never,
    });
  }

  it("rejects a non-base64 / garbage SAMLResponse", async () => {
    const saml = await buildInstance();
    await expect(
      saml.validatePostResponseAsync({ SAMLResponse: "not-valid-base64-xml" }),
    ).rejects.toBeTruthy();
  });

  it("rejects an unsigned SAML Response (wantAssertionsSigned)", async () => {
    const saml = await buildInstance();
    const unsignedResponse = Buffer.from(
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
         xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r1" Version="2.0"
         IssueInstant="2026-01-01T00:00:00Z">
         <saml:Issuer>https://idp.example.com/entity</saml:Issuer>
         <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
         <saml:Assertion ID="_a1" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
           <saml:Issuer>https://idp.example.com/entity</saml:Issuer>
           <saml:Subject><saml:NameID>attacker@example.com</saml:NameID></saml:Subject>
         </saml:Assertion>
       </samlp:Response>`,
    ).toString("base64");

    await expect(
      saml.validatePostResponseAsync({ SAMLResponse: unsignedResponse }),
    ).rejects.toBeTruthy();
  });

  it("can build an SP-initiated AuthnRequest redirect URL", async () => {
    const saml = await buildInstance();
    const url = await saml.getAuthorizeUrlAsync("acme", "sp.example.com", {});
    expect(url).toContain("https://idp.example.com/sso");
    expect(url).toContain("SAMLRequest=");
    // RelayState carries the org slug used by the ACS callback.
    expect(url).toContain("RelayState=acme");
  });
});
