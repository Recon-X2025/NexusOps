import { z } from "zod";

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
