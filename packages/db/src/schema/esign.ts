import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────
export const esignProviderEnum = pgEnum("esign_provider", [
  "emudhra",
  "docusign",
  "internal_otp", // for low-value internal acknowledgments where IT Act §3A is not required
]);

export const esignRequestStatusEnum = pgEnum("esign_request_status", [
  "draft",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
  "voided",
  "completed",
]);

export const esignerStatusEnum = pgEnum("esigner_status", [
  "pending",
  "viewed",
  "signed",
  "declined",
]);

// ── Signature requests ─────────────────────────────────────────────────────
/**
 * Universal e-sign envelope. Source modules link via sourceType + sourceId
 * (e.g. "contract" + contracts.id, "offer_letter" + recruitment.offers.id).
 * Provider-specific envelope id is stored in providerEnvelopeId.
 */
export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: esignProviderEnum("provider").notNull(),
    providerEnvelopeId: text("provider_envelope_id"),
    title: text("title").notNull(),
    message: text("message"),
    sourceType: text("source_type").notNull(), // contract | offer_letter | resolution | policy_ack | vendor_msme | form16
    sourceId: uuid("source_id").notNull(),
    documentStorageKey: text("document_storage_key").notNull(),
    documentSha256: text("document_sha256").notNull(),
    status: esignRequestStatusEnum("status").notNull().default("draft"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    signedDocumentStorageKey: text("signed_document_storage_key"),
    signedDocumentSha256: text("signed_document_sha256"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("signature_requests_org_idx").on(t.orgId),
    sourceIdx: index("signature_requests_source_idx").on(t.sourceType, t.sourceId),
    statusIdx: index("signature_requests_status_idx").on(t.status),
  }),
);

// ── Signers ────────────────────────────────────────────────────────────────
export const signatureSigners = pgTable(
  "signature_signers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => signatureRequests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    role: text("role"), // signer | approver | witness
    routingOrder: integer("routing_order").notNull().default(1),
    status: esignerStatusEnum("status").notNull().default("pending"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    aadhaarMaskedHash: text("aadhaar_masked_hash"), // SHA256 of last 4 digits — never raw Aadhaar
    certificateHash: text("certificate_hash"),
    /** User in this CoheronConnect tenant if this signer is internal. */
    internalUserId: uuid("internal_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("signature_signers_request_idx").on(t.requestId),
    emailIdx: index("signature_signers_email_idx").on(t.email),
  }),
);

// ── Audit ──────────────────────────────────────────────────────────────────
/**
 * Append-only audit trail. Required by IT Act §3A for legal admissibility.
 * Retained 8 years (Companies Act 2013 + IT Act).
 */
export const signatureAudit = pgTable(
  "signature_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => signatureRequests.id, { onDelete: "cascade" }),
    signerId: uuid("signer_id").references(() => signatureSigners.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(), // sent | opened | otp_requested | otp_verified | signed | declined | expired
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    geoCountry: text("geo_country"),
    geoCity: text("geo_city"),
    /** OTP reference id from the e-sign provider (never the OTP itself). */
    otpRefId: text("otp_ref_id"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("signature_audit_request_idx").on(t.requestId),
    occurredIdx: index("signature_audit_occurred_idx").on(t.occurredAt),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const signatureRequestsRelations = relations(signatureRequests, ({ many, one }) => ({
  signers: many(signatureSigners),
  audit: many(signatureAudit),
  org: one(organizations, {
    fields: [signatureRequests.orgId],
    references: [organizations.id],
  }),
}));

export const signatureSignersRelations = relations(signatureSigners, ({ one, many }) => ({
  request: one(signatureRequests, {
    fields: [signatureSigners.requestId],
    references: [signatureRequests.id],
  }),
  audit: many(signatureAudit),
}));

export const signatureAuditRelations = relations(signatureAudit, ({ one }) => ({
  request: one(signatureRequests, {
    fields: [signatureAudit.requestId],
    references: [signatureRequests.id],
  }),
  signer: one(signatureSigners, {
    fields: [signatureAudit.signerId],
    references: [signatureSigners.id],
  }),
}));
