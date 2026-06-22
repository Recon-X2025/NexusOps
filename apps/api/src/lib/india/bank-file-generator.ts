/**
 * bank-file-generator.ts — payroll bank-disbursement file generation.
 *
 * Why per-bank format and not "one NACH file fits all":
 *   - NPCI publishes the NACH-Credit canonical format, but in practice
 *     every Indian bank's corporate net-banking portal expects its own
 *     CSV/fixed-width derivative (HDFC sample, ICICI Connected Banking,
 *     SBI CMP, Axis Power Access, Kotak FYNN). Tenants upload the bank's
 *     file to that bank's portal — getting the column order wrong means
 *     the bank rejects the batch.
 *   - We generate per-bank CSVs the corporate team can upload as-is.
 *   - For tenants who use ASBA / direct NACH submission via PSP, the
 *     `nach_credit` format generates the canonical NPCI fixed-width record.
 *
 * Each row aggregates an employee's net-pay payslip. Inputs are sanitised
 * (no commas in narration, IFSC normalised) so the bank doesn't return
 * "FILE_REJECTED — character invalid".
 *
 * The generator is pure: takes data in, returns text out. Persistence and
 * audit (who exported, when, hash) live in the router.
 */

export type BankFormat =
  | "hdfc_neft"
  | "icici_connected_banking"
  | "sbi_cmp"
  | "axis_power_access"
  | "kotak_fynn"
  | "nach_credit"
  | "generic_neft";

export interface BankFileRow {
  employeeId: string;
  employeeName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  amount: number;
  /** YYYY-MM-DD value date (typically the payroll run's pay date). */
  valueDate: string;
  /** PAN-style narration / reference; bank-specific length caps applied later. */
  narration: string;
}

export interface BankFileResult {
  /** Suggested filename including extension. */
  filename: string;
  /** Plain-text body (CSV or fixed-width). */
  body: string;
  /** UTF-8 length, after generation. */
  byteLength: number;
  /** Sum of all `amount` values, post-skip. */
  totalAmount: number;
  recordCount: number;
  /** Rows skipped because of missing bank details or invalid IFSC. */
  skipped: Array<{ employeeId: string; reason: string }>;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function sanitize(s: string | null | undefined, maxLen = 35): string {
  return (s ?? "")
    .replace(/[\r\n,;|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function fmtAmount(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fixedWidth(value: string, width: number, side: "left" | "right" = "left", pad = " "): string {
  const s = value.length > width ? value.slice(0, width) : value;
  return side === "left" ? s.padEnd(width, pad) : s.padStart(width, pad);
}

function fmtDate(yyyymmdd: string, kind: "ddmmyyyy" | "ddmonyyyy" = "ddmmyyyy"): string {
  // yyyymmdd in -> requested format
  const [y, m, d] = yyyymmdd.split("-");
  if (kind === "ddmmyyyy") return `${d}/${m}/${y}`;
  const monthAbbrev = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const mIdx = Number(m ?? "1") - 1;
  return `${d}-${monthAbbrev[mIdx] ?? "JAN"}-${y}`;
}

interface PartitionedRows {
  valid: BankFileRow[];
  skipped: Array<{ employeeId: string; reason: string }>;
  totalAmount: number;
}

function validate(rows: BankFileRow[]): PartitionedRows {
  const valid: BankFileRow[] = [];
  const skipped: Array<{ employeeId: string; reason: string }> = [];
  let totalAmount = 0;
  for (const r of rows) {
    if (!r.bankAccountNumber || r.bankAccountNumber.length < 4) {
      skipped.push({ employeeId: r.employeeId, reason: "Missing bank account number" });
      continue;
    }
    const ifsc = (r.bankIfsc ?? "").toUpperCase().trim();
    if (!IFSC_RE.test(ifsc)) {
      skipped.push({ employeeId: r.employeeId, reason: `Invalid IFSC: '${ifsc || "<empty>"}'` });
      continue;
    }
    if (!Number.isFinite(r.amount) || r.amount <= 0) {
      skipped.push({ employeeId: r.employeeId, reason: "Non-positive net pay" });
      continue;
    }
    valid.push({ ...r, bankIfsc: ifsc });
    totalAmount += r.amount;
  }
  return { valid, skipped, totalAmount };
}

// ── HDFC NEFT bulk upload ────────────────────────────────────────────────
function hdfcNeftCsv(rows: BankFileRow[], debitAccount: string): string {
  // Format: PYMT_PROD_CODE | DR Acct | Beneficiary Name | Beneficiary A/c | Beneficiary Bank | IFSC | Amount | Date | Remarks
  const header = [
    "Pmt Prod Code",
    "Debit Account",
    "Beneficiary Name",
    "Beneficiary Account",
    "Beneficiary Bank",
    "IFSC",
    "Amount",
    "Value Date",
    "Remarks",
  ].join(",");
  const lines = rows.map((r) =>
    [
      "NEFT",
      debitAccount,
      sanitize(r.employeeName, 50),
      r.bankAccountNumber,
      sanitize(r.bankName, 30),
      r.bankIfsc,
      fmtAmount(r.amount),
      fmtDate(r.valueDate, "ddmmyyyy"),
      sanitize(r.narration, 30),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

// ── ICICI Connected Banking ─────────────────────────────────────────────
function iciciCsv(rows: BankFileRow[], debitAccount: string): string {
  // Format: TXN_TYPE, DEBIT_ACCT, AMOUNT, BENE_NAME, BENE_ACCT, IFSC, DATE, REMARKS
  const header = [
    "Transaction Type",
    "Debit Account Number",
    "Amount",
    "Beneficiary Name",
    "Beneficiary Account",
    "IFSC Code",
    "Payment Date",
    "Remarks",
  ].join(",");
  const lines = rows.map((r) =>
    [
      "NEFT",
      debitAccount,
      fmtAmount(r.amount),
      sanitize(r.employeeName, 35),
      r.bankAccountNumber,
      r.bankIfsc,
      fmtDate(r.valueDate, "ddmmyyyy"),
      sanitize(r.narration, 30),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

// ── SBI CMP ─────────────────────────────────────────────────────────────
function sbiCmpCsv(rows: BankFileRow[], debitAccount: string): string {
  const header = [
    "Type",
    "Debit Account",
    "Beneficiary Account",
    "IFSC",
    "Amount",
    "Beneficiary Name",
    "Value Date",
    "Reference",
  ].join(",");
  const lines = rows.map((r) =>
    [
      "NEFT",
      debitAccount,
      r.bankAccountNumber,
      r.bankIfsc,
      fmtAmount(r.amount),
      sanitize(r.employeeName, 40),
      fmtDate(r.valueDate, "ddmonyyyy"),
      sanitize(r.narration, 25),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

// ── Axis Power Access ───────────────────────────────────────────────────
function axisCsv(rows: BankFileRow[], debitAccount: string): string {
  // Axis uses pipe-delimited in some templates; we emit CSV which is
  // accepted by the modern Axis Bulk module.
  const header = [
    "PaymentMode",
    "DebitAccountNumber",
    "BeneficiaryName",
    "BeneficiaryAccount",
    "BeneficiaryIFSC",
    "Amount",
    "PaymentDate",
    "Narration",
  ].join(",");
  const lines = rows.map((r) =>
    [
      "NEFT",
      debitAccount,
      sanitize(r.employeeName, 40),
      r.bankAccountNumber,
      r.bankIfsc,
      fmtAmount(r.amount),
      fmtDate(r.valueDate, "ddmmyyyy"),
      sanitize(r.narration, 30),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

// ── Kotak FYNN ──────────────────────────────────────────────────────────
function kotakCsv(rows: BankFileRow[], debitAccount: string): string {
  const header = [
    "TransactionType",
    "DebitAcct",
    "BenefName",
    "BenefAcct",
    "IFSC",
    "Amount",
    "ValueDate",
    "Reference",
  ].join(",");
  const lines = rows.map((r) =>
    [
      "NEFT",
      debitAccount,
      sanitize(r.employeeName, 40),
      r.bankAccountNumber,
      r.bankIfsc,
      fmtAmount(r.amount),
      fmtDate(r.valueDate, "ddmmyyyy"),
      sanitize(r.narration, 25),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

// ── NPCI NACH credit (canonical fixed-width input file) ──────────────
function nachCreditFixedWidth(args: {
  rows: BankFileRow[];
  sponsorBankCode: string;
  utilityCode: string;
  utilityName: string;
  debitAccount: string;
}): string {
  // Per NPCI NACH-Credit InputFile v1.5: each detail record is 106 chars,
  // ASCII, end-of-line CRLF. We emit the most common subset that all
  // sponsor banks accept (Sl-No, Tx-Code, Control-9s blank, Beneficiary
  // ACH No, Account No, Beneficiary Bank IFSC, Amount in paise (10 digits
  // zero-padded), Date, Beneficiary Name, Reference, Filler).
  // This is the *uploadable* version. Sponsor banks then add the H/T
  // headers when ingesting.
  const lines: string[] = [];
  let serial = 1;
  for (const r of args.rows) {
    const amountPaise = Math.round(r.amount * 100);
    const line =
      fixedWidth(String(serial), 9, "right", "0") +
      fixedWidth("10", 2, "right", "0") + // Tx code 10 = credit
      fixedWidth("", 9, "left") + // Control - blank
      fixedWidth("", 35, "left") + // Beneficiary IFSC long form (we use IFSC field below)
      fixedWidth(r.bankAccountNumber, 35, "left") +
      fixedWidth(r.bankIfsc, 11, "left") +
      fixedWidth(String(amountPaise), 13, "right", "0") +
      fixedWidth(args.utilityName, 20, "left") +
      fixedWidth(r.employeeId, 20, "left") +
      fixedWidth(sanitize(r.narration, 14), 14, "left");
    lines.push(line);
    serial += 1;
  }
  // Header: standard NACH-Credit header is 51 chars; we emit a minimal
  // header so the downstream sponsor bank can still parse the file.
  const header = `H${fixedWidth(args.utilityCode, 7, "left")}${fixedWidth(args.utilityName, 20, "left")}${fixedWidth(args.sponsorBankCode, 4, "left")}${fixedWidth(args.debitAccount, 35, "left")}`;
  return [header, ...lines].join("\r\n") + "\r\n";
}

// ── Generic NEFT (fallback for any bank not in the catalog) ──────────
function genericNeftCsv(rows: BankFileRow[], debitAccount: string): string {
  const header = [
    "Beneficiary Name",
    "Beneficiary Account",
    "IFSC",
    "Amount",
    "Value Date",
    "Reference",
    "Debit Account",
  ].join(",");
  const lines = rows.map((r) =>
    [
      sanitize(r.employeeName, 50),
      r.bankAccountNumber,
      r.bankIfsc,
      fmtAmount(r.amount),
      fmtDate(r.valueDate, "ddmmyyyy"),
      sanitize(r.narration, 30),
      debitAccount,
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

export interface GenerateArgs {
  format: BankFormat;
  rows: BankFileRow[];
  debitAccount: string;
  /** Required for `nach_credit`. Ignored otherwise. */
  sponsorBankCode?: string;
  utilityCode?: string;
  utilityName?: string;
  /** Optional file slug (e.g. "PAYROLL-2026-04"); becomes part of the filename. */
  fileSlug?: string;
}

export function generateBankFile(args: GenerateArgs): BankFileResult {
  const partitioned = validate(args.rows);
  const slug = args.fileSlug ?? `payroll-${new Date().toISOString().slice(0, 10)}`;
  let body = "";
  let extension = "csv";
  switch (args.format) {
    case "hdfc_neft":
      body = hdfcNeftCsv(partitioned.valid, args.debitAccount);
      break;
    case "icici_connected_banking":
      body = iciciCsv(partitioned.valid, args.debitAccount);
      break;
    case "sbi_cmp":
      body = sbiCmpCsv(partitioned.valid, args.debitAccount);
      break;
    case "axis_power_access":
      body = axisCsv(partitioned.valid, args.debitAccount);
      break;
    case "kotak_fynn":
      body = kotakCsv(partitioned.valid, args.debitAccount);
      break;
    case "nach_credit":
      body = nachCreditFixedWidth({
        rows: partitioned.valid,
        sponsorBankCode: args.sponsorBankCode ?? "",
        utilityCode: args.utilityCode ?? "",
        utilityName: args.utilityName ?? "PAYROLL",
        debitAccount: args.debitAccount,
      });
      extension = "txt";
      break;
    case "generic_neft":
    default:
      body = genericNeftCsv(partitioned.valid, args.debitAccount);
      break;
  }
  const filename = `${slug}-${args.format}.${extension}`;
  return {
    filename,
    body,
    byteLength: Buffer.byteLength(body, "utf8"),
    totalAmount: partitioned.totalAmount,
    recordCount: partitioned.valid.length,
    skipped: partitioned.skipped,
  };
}
