import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const AssetStatusEnum = z.enum([
  "in_stock",
  "deployed",
  "maintenance",
  "retired",
  "disposed",
]);

export const CITypeEnum = z.enum([
  "server",
  "application",
  "database",
  "network",
  "service",
  "cloud",
]);

export const CIStatusEnum = z.enum(["operational", "degraded", "down", "planned"]);

export const CIRelationTypeEnum = z.enum([
  "depends_on",
  "runs_on",
  "connected_to",
  "member_of",
  "hosts",
]);

export const LicenseTypeEnum = z.enum(["per_seat", "device", "site", "enterprise"]);

export type AssetStatus = z.infer<typeof AssetStatusEnum>;
export type CIType = z.infer<typeof CITypeEnum>;
export type LicenseType = z.infer<typeof LicenseTypeEnum>;

// ── Asset ──────────────────────────────────────────────────────────────────
export const AssetSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  assetTag: z.string(), // e.g. "AST-0001"
  name: z.string().min(1).max(200),
  typeId: z.string().uuid(),
  status: AssetStatusEnum,
  ownerId: z.string().uuid().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseCost: z.coerce.number().nullable().optional(),
  warrantyExpiry: z.coerce.date().nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  parentAssetId: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Asset = z.infer<typeof AssetSchema>;

export const CreateAssetSchema = z.object({
  name: z.string().min(1).max(200),
  typeId: z.string().uuid(),
  status: AssetStatusEnum.default("in_stock"),
  ownerId: z.string().uuid().optional(),
  location: z.string().max(200).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.coerce.number().positive().optional(),
  warrantyExpiry: z.coerce.date().optional(),
  vendor: z.string().max(200).optional(),
  customFields: z.record(z.unknown()).optional(),
  parentAssetId: z.string().uuid().optional(),
});

// ── CI Item ────────────────────────────────────────────────────────────────
export const CIItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  ciType: CITypeEnum,
  status: CIStatusEnum,
  environment: z.string().max(100).nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CIItem = z.infer<typeof CIItemSchema>;
