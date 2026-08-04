import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const PRStatusEnum = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "ordered",
  "received",
  "closed",
]);

export const POStatusEnum = z.enum([
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
  "received",
  "invoiced",
  "paid",
  "cancelled",
]);

export const InvoiceStatusEnum = z.enum(["pending", "approved", "paid", "disputed"]);

export type PRStatus = z.infer<typeof PRStatusEnum>;
export type POStatus = z.infer<typeof POStatusEnum>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

// ── Purchase Request ───────────────────────────────────────────────────────
export const PurchaseRequestSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  number: z.string(), // e.g. "PR-0001"
  requesterId: z.string().uuid(),
  title: z.string().min(1).max(300),
  justification: z.string().max(2000).optional(),
  totalAmount: z.coerce.number().nonnegative(),
  status: PRStatusEnum.default("draft"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  department: z.string().max(100).optional(),
  budgetCode: z.string().max(100).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;

export const CreatePurchaseRequestSchema = z.object({
  title: z.string().min(1).max(300),
  justification: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  department: z.string().max(100).optional(),
  budgetCode: z.string().max(100).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().nonnegative(),
        vendorId: z.string().uuid().optional(),
        assetTypeId: z.string().uuid().optional(),
      }),
    )
    .min(1, "At least one item required"),
  idempotencyKey: z.string().optional(),
});

// ── Vendor ────────────────────────────────────────────────────────────────
export const VendorSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  paymentTerms: z.string().max(100).optional(),
  status: z.enum(["active", "inactive", "blacklisted"]).default("active"),
  rating: z.coerce.number().min(1).max(5).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Vendor = z.infer<typeof VendorSchema>;

// ── Part Number Validation ────────────────────────────────────────────────
/**
 * Validates a part number according to enterprise inventory rules:
 * Part numbers must be either:
 * 1. A combination of two sets of numbers separated by a hyphen (e.g., "123-456", "001-999")
 * 2. An alphanumeric code containing numbers (e.g., "PN-101", "SRV-FAN-120", "ABC123")
 *
 * Plain text without numbers (e.g., "dgfdsy", "abc") is invalid.
 */
export function isValidPartNumber(partNumber: string): boolean {
  if (!partNumber || typeof partNumber !== "string") return false;
  const trimmed = partNumber.trim();
  if (!trimmed) return false;

  // Must consist only of alphanumeric characters and hyphens
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return false;

  // Case 1: Combination of two sets of numbers separated by a hyphen (e.g., "123-456")
  if (/^\d+-\d+$/.test(trimmed)) return true;

  // Case 2: Cannot be plain letters only (e.g., "dgfdsy")
  if (/^[A-Za-z]+$/.test(trimmed)) return false;

  // Case 3: Alphanumeric code must contain at least one digit
  return /\d/.test(trimmed);
}

export const PartNumberSchema = z.string().trim().min(1, "Part number is required").refine(
  (val) => isValidPartNumber(val),
  {
    message: "Part number must be an alphanumeric code containing numbers (e.g. PN-101) or hyphenated numbers (e.g. 123-456). Plain text is not allowed.",
  }
);

