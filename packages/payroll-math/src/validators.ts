/**
 * India statutory identifier validators.
 * All validation is server-side; client may show format hints only.
 */

// ── PAN ───────────────────────────────────────────────────────────────────
// Format: AAAAA9999A  (5 alpha + 4 numeric + 1 alpha, all uppercase)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function validatePAN(pan: string): { valid: boolean; error?: string } {
  const cleaned = pan.trim().toUpperCase();
  if (!PAN_REGEX.test(cleaned)) {
    return { valid: false, error: "PAN must be in format AAAAA9999A" };
  }
  return { valid: true };
}

// ── Aadhaar (Verhoeff check digit) ────────────────────────────────────────
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffCheck(number: string): boolean {
  let c = 0;
  const digits = number.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![digits[i]!]!]!;
  }
  return c === 0;
}

export function validateAadhaar(aadhaar: string): { valid: boolean; error?: string } {
  const cleaned = aadhaar.replace(/\s|-/g, "");
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: "Aadhaar must be exactly 12 digits" };
  }
  if (cleaned[0] === "0" || cleaned[0] === "1") {
    return { valid: false, error: "Aadhaar cannot start with 0 or 1" };
  }
  if (!verhoeffCheck(cleaned)) {
    return { valid: false, error: "Aadhaar check digit validation failed" };
  }
  return { valid: true };
}

export function maskAadhaar(aadhaar: string): string {
  const cleaned = aadhaar.replace(/\s|-/g, "");
  return `XXXX-XXXX-${cleaned.slice(-4)}`;
}

// ── GSTIN ─────────────────────────────────────────────────────────────────
// Format: 2-digit state code + 10-char PAN + 1-digit entity number + Z + 1 checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const GSTIN_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam",
  "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana",
  "37": "Andhra Pradesh (New)", "38": "Ladakh", "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export function validateGSTIN(gstin: string): { valid: boolean; stateCode?: string; stateName?: string; error?: string } {
  const cleaned = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(cleaned)) {
    return { valid: false, error: "GSTIN must be 15 characters in format: 2-digit state + PAN + entity + Z + checksum" };
  }
  const stateCode = cleaned.slice(0, 2);
  if (!GSTIN_STATE_CODES[stateCode]) {
    return { valid: false, error: `Unknown state code: ${stateCode}` };
  }
  return { valid: true, stateCode, stateName: GSTIN_STATE_CODES[stateCode] };
}

export function getStateFromGSTIN(gstin: string): string | null {
  const result = validateGSTIN(gstin);
  return result.valid ? (result.stateName ?? null) : null;
}

// ── IFSC ──────────────────────────────────────────────────────────────────
// Format: 4 alpha (bank code) + 0 + 6 alphanumeric (branch code)
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateIFSC(ifsc: string): { valid: boolean; bankCode?: string; error?: string } {
  const cleaned = ifsc.trim().toUpperCase();
  if (!IFSC_REGEX.test(cleaned)) {
    return { valid: false, error: "IFSC must be 11 characters: 4-letter bank code + 0 + 6 alphanumeric" };
  }
  return { valid: true, bankCode: cleaned.slice(0, 4) };
}

// ── UAN ───────────────────────────────────────────────────────────────────
export function validateUAN(uan: string): { valid: boolean; error?: string } {
  const cleaned = uan.replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: "UAN must be exactly 12 digits" };
  }
  return { valid: true };
}

// ── DIN ───────────────────────────────────────────────────────────────────
export function validateDIN(din: string): { valid: boolean; error?: string } {
  const cleaned = din.replace(/\s/g, "");
  if (!/^\d{8}$/.test(cleaned)) {
    return { valid: false, error: "DIN must be exactly 8 digits" };
  }
  return { valid: true };
}
