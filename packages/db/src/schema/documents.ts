import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────
export const documentScanStatusEnum = pgEnum("document_scan_status", [
  "pending",
  "clean",
  "infected",
  "skipped",
  "failed",
]);

export const documentClassificationEnum = pgEnum("document_classification", [
  "public",
  "internal",
  "confidential",
  "restricted",
  "pii",
]);

export const documentAclPrincipalEnum = pgEnum("document_acl_principal_type", [
  "user",
  "role",
  "team",
  "everyone_in_org",
]);

export const documentAclPermEnum = pgEnum("document_acl_permission", [
  "read",
  "write",
  "delete",
  "share",
]);

// ── Retention policies ─────────────────────────────────────────────────────
export const documentRetentionPolicies = pgTable(
  "document_retention_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationDays: integer("duration_days").notNull(),
    legalHold: boolean("legal_hold").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: uniqueIndex("doc_retention_org_name_idx").on(t.orgId, t.name),
  }),
);

// ── Documents ──────────────────────────────────────────────────────────────
/**
 * Source-of-truth for binary attachments across the platform. Existing
 * jsonb `attachments` columns (tickets etc.) reference rows here by id
 * going forward. Versions are immutable — every put creates a row in
 * document_versions.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Object-store key for the *current* version. Versions table holds history. */
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    /** Foreign attachments — used for files held outside our object store (Google Drive, OneDrive). */
    externalProvider: text("external_provider"),
    externalId: text("external_id"),
    parentId: uuid("parent_id"),
    folderPath: text("folder_path"),
    classification: documentClassificationEnum("classification").notNull().default("internal"),
    scanStatus: documentScanStatusEnum("scan_status").notNull().default("pending"),
    scanResult: jsonb("scan_result").$type<Record<string, unknown>>(),
    retentionPolicyId: uuid("retention_policy_id").references(() => documentRetentionPolicies.id, {
      onDelete: "set null",
    }),
    legalHold: boolean("legal_hold").notNull().default(false),
    /** Cross-module link: e.g. "ticket" + ticketId. Null for free-floating docs. */
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("documents_org_idx").on(t.orgId),
    sourceIdx: index("documents_source_idx").on(t.sourceType, t.sourceId),
    sha256Idx: index("documents_sha256_idx").on(t.sha256),
    deletedIdx: index("documents_deleted_idx").on(t.deletedAt),
  }),
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docVersionIdx: uniqueIndex("doc_versions_doc_version_idx").on(t.documentId, t.version),
  }),
);

export const documentAcls = pgTable(
  "document_acls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    principalType: documentAclPrincipalEnum("principal_type").notNull(),
    principalId: uuid("principal_id"), // null when principalType = everyone_in_org
    permission: documentAclPermEnum("permission").notNull(),
    grantedById: uuid("granted_by_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docPrincipalIdx: index("doc_acls_doc_principal_idx").on(
      t.documentId,
      t.principalType,
      t.principalId,
    ),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const documentsRelations = relations(documents, ({ many, one }) => ({
  versions: many(documentVersions),
  acls: many(documentAcls),
  retentionPolicy: one(documentRetentionPolicies, {
    fields: [documents.retentionPolicyId],
    references: [documentRetentionPolicies.id],
  }),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
}));

export const documentAclsRelations = relations(documentAcls, ({ one }) => ({
  document: one(documents, {
    fields: [documentAcls.documentId],
    references: [documents.id],
  }),
}));
