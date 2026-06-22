/**
 * ai-receipt-ocr.ts — Anthropic vision pipeline for expense receipts.
 *
 * Why a dedicated service (vs. extending ai.ts):
 *   - Vision requires a different content-block shape (image/base64 vs.
 *     text-only). Mixing it into ai.ts would break the existing
 *     text-only callers.
 *   - We want explicit auditability: callers persist
 *     `expense_claims.ocr_extracted` (raw JSON from the model) and
 *     `ocr_confidence` so finance can re-extract without re-uploading.
 *
 * The function is intentionally side-effect-free. The expense create
 * mutation (`hr.expenses.createMine`) decides whether to run OCR and
 * how to apply the suggestions.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-3-5-sonnet-20241022";
const MAX_TOKENS = 512;
const TIMEOUT_MS = 20_000;

function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`OCR timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export type ReceiptCategory =
  | "travel"
  | "transport"
  | "fuel"
  | "meals"
  | "accommodation"
  | "office_supplies"
  | "communication"
  | "miscellaneous";

export interface ReceiptOcrResult {
  /** ISO date the bill was issued (YYYY-MM-DD). null if unreadable. */
  expenseDate: string | null;
  /** Total in major units (e.g. 1234.50). null if unreadable. */
  amount: number | null;
  currency: string; // ISO 4217 — defaults to "INR" when ambiguous in INR context
  merchant: string | null;
  category: ReceiptCategory;
  /** GST number printed on the receipt, if any. */
  gstin: string | null;
  /** Concise human description suitable for the claim title. */
  description: string;
  /** 0..1, the model's stated extraction confidence. */
  confidence: number;
  raw: unknown;
}

/**
 * Extracts structured fields from a receipt image using Claude vision.
 * `imageBase64` should be the bare base64 (no data: prefix). `mediaType`
 * must be one of the supported Anthropic image MIMEs.
 *
 * Returns null on any failure (timeout, missing API key, malformed
 * response). Callers must always tolerate null and fall back to manual
 * entry — OCR is an aid, not a gate.
 */
export async function extractReceipt(args: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  defaultCurrency?: string;
}): Promise<ReceiptOcrResult | null> {
  try {
    const client = getClient();
    const defaultCurrency = args.defaultCurrency ?? "INR";

    const prompt = `You are an expense-receipt OCR extractor. Given the image of a
receipt or bill, extract the following fields. Be conservative: leave
unreadable fields as null and lower your confidence rather than
guess. Use INR amounts when the context is Indian (₹/Rs/INR symbols
or visible GSTIN).

Respond with JSON ONLY, exactly this shape:
{
  "expenseDate": "YYYY-MM-DD or null",
  "amount": <number or null>,
  "currency": "ISO 4217 (default ${defaultCurrency})",
  "merchant": "<merchant name or null>",
  "category": "<one of: travel|transport|fuel|meals|accommodation|office_supplies|communication|miscellaneous>",
  "gstin": "<GSTIN or null>",
  "description": "<one-line description for the claim title>",
  "confidence": <0.0 to 1.0>
}`;

    const response = await withTimeout(
      client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: args.mediaType,
                  data: args.imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ReceiptOcrResult> & {
      [k: string]: unknown;
    };
    const validCategories: ReceiptCategory[] = [
      "travel",
      "transport",
      "fuel",
      "meals",
      "accommodation",
      "office_supplies",
      "communication",
      "miscellaneous",
    ];

    const safeAmount =
      typeof parsed.amount === "number" && Number.isFinite(parsed.amount) && parsed.amount > 0
        ? Math.round(parsed.amount * 100) / 100
        : null;
    const safeDate =
      typeof parsed.expenseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expenseDate)
        ? parsed.expenseDate
        : null;
    const safeCategory: ReceiptCategory = validCategories.includes(
      parsed.category as ReceiptCategory,
    )
      ? (parsed.category as ReceiptCategory)
      : "miscellaneous";

    return {
      expenseDate: safeDate,
      amount: safeAmount,
      currency: typeof parsed.currency === "string" ? parsed.currency : defaultCurrency,
      merchant: typeof parsed.merchant === "string" ? parsed.merchant : null,
      category: safeCategory,
      gstin: typeof parsed.gstin === "string" ? parsed.gstin : null,
      description: typeof parsed.description === "string" ? parsed.description : "",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
      raw: parsed,
    };
  } catch (err) {
    console.warn("[ai-receipt-ocr] Failed:", (err as Error).message);
    return null;
  }
}
