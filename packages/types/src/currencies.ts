import { z } from "zod";

/** ISO 4217 codes supported for money fields across NexusOps. */
export const SUPPORTED_CURRENCY_CODES = ["USD", "GBP", "EUR", "AUD", "CAD", "INR"] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const supportedCurrencyCodeSchema = z.enum(SUPPORTED_CURRENCY_CODES);
