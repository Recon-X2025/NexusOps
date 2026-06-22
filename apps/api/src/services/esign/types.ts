/**
 * Provider-agnostic e-sign interface. eMudhra and DocuSign both implement
 * this; call-sites in the routers / workflows never branch on provider.
 */

export interface EsignSigner {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  routingOrder?: number;
}

export interface EsignInitRequest {
  title: string;
  message?: string;
  documentBase64: string;
  documentSha256: string;
  signers: EsignSigner[];
  expiresAt?: Date;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface EsignInitResponse {
  envelopeId: string;
  signingUrls: Array<{ email: string; url: string }>;
}

export interface EsignStatus {
  envelopeId: string;
  status: "sent" | "viewed" | "signed" | "declined" | "expired" | "voided" | "completed";
  signers: Array<{
    email: string;
    status: "pending" | "viewed" | "signed" | "declined";
    signedAt?: Date;
    aadhaarMaskedHash?: string;
    certificateHash?: string;
  }>;
}

export interface EsignSignedDocument {
  bytes: Buffer;
  sha256: string;
}

export interface EsignProvider<TConfig = Record<string, string>> {
  provider: "emudhra" | "docusign" | "internal_otp";
  displayName: string;
  init(config: TConfig, req: EsignInitRequest): Promise<EsignInitResponse>;
  getStatus(config: TConfig, envelopeId: string): Promise<EsignStatus>;
  fetchSignedDocument(config: TConfig, envelopeId: string): Promise<EsignSignedDocument>;
  /**
   * Verify a webhook callback. Returns the envelopeId so the router can
   * look up the signature_request and update status.
   */
  verifyCallback(
    config: TConfig,
    body: string,
    headers: Record<string, string>,
  ): Promise<{ envelopeId: string; status: EsignStatus["status"] }>;
}
