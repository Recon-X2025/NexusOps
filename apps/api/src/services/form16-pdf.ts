/**
 * Form 16 (Part B) PDF Generator
 * ──────────────────────────────
 * Place at: apps/api/src/services/form16-pdf.ts
 *
 * Generates an Income-Tax-Department-style Form 16 Part B for an employee
 * for a given financial year. Part A (TRACES download) is a separate flow
 * driven by `tdsChallanRecords`; this generator covers the salary-detail
 * Part B that employers compute themselves and which is what employees
 * actually need for filing ITR.
 *
 * Why we do this in pdfkit (not a TRACES upload):
 *   - SMBs we target don't have a TAN-bound TRACES login workflow yet.
 *   - The Part B PDF + computation is the same content TRACES would emit;
 *     the IT Department accepts employer-issued Form 16 for ITR.
 *   - Once a tenant has TRACES wired in (post-GA P2), this becomes the
 *     fall-back / preview path.
 *
 * Layout (single A4 page, mirroring Form 16 Part B):
 *   - Header (employer name, PAN, TAN, period)
 *   - Employee block (name, PAN, designation, period)
 *   - "Details of salary paid and any other income" table
 *   - Section 16/24/80C/80D/etc. deductions
 *   - Tax computation (slabs vs total income)
 *   - "Verification" block
 *   - Signature line
 *
 * Uses PDFKit. amountInWords / fmt are reused from payslip-pdf.ts.
 */
import PDFDocument from "pdfkit";
import { amountInWords } from "./payslip-pdf";

export interface Form16PDFInput {
  // Employer
  employerName: string;
  employerAddress: string;
  employerPan: string;
  employerTan: string;
  // Employee
  employeeName: string;
  employeePan: string;
  designation: string;
  // Period
  financialYear: string; // "2025-2026"
  assessmentYear: string; // "2026-2027"
  fromMonth: string; // "April 2025"
  toMonth: string; // "March 2026"
  // Salary block
  grossSalary: number;
  lessHraExempt: number;
  lessLtaExempt: number;
  lessOtherExempt: number;
  netSalary: number;
  // Section 16
  standardDeduction: number;
  professionalTax: number;
  entertainmentAllowance: number;
  // Section 80C / 80D / 80CCD etc. — flatten to a few rows the UI fills
  deductions: Array<{ section: string; label: string; amount: number }>;
  // Tax computation
  taxableIncome: number;
  taxOnIncome: number;
  rebate87a: number;
  surcharge: number;
  cessHealthEducation: number;
  totalTaxLiability: number;
  totalTdsDeducted: number;
  refundDue: number;
  // Tax regime used
  taxRegime: "old" | "new";
  // Verification
  signedBy: string;
  signedDesignation: string;
  signedAt: string; // "Bengaluru on 15-Apr-2026"
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const A4_W = 595.28;
const MARGIN = 40;
const CONTENT_W = A4_W - MARGIN * 2;

function row(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  value: string | number,
  opts: { bold?: boolean; indent?: number; rupee?: boolean } = {},
): void {
  const indent = opts.indent ?? 0;
  const valueText =
    typeof value === "number"
      ? opts.rupee !== false
        ? `₹ ${fmt(value)}`
        : fmt(value)
      : value;
  doc
    .fontSize(9)
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fillColor("#1a1a1a")
    .text(label, MARGIN + indent, y, { width: CONTENT_W * 0.7 - indent });
  doc
    .fontSize(9)
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fillColor("#1a1a1a")
    .text(valueText, MARGIN + CONTENT_W * 0.7, y, {
      width: CONTENT_W * 0.3,
      align: "right",
    });
}

function divider(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(MARGIN, y).lineTo(A4_W - MARGIN, y).strokeColor("#888").stroke();
}

export async function generateForm16PDF(input: Form16PDFInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    // ── Title ────────────────────────────────────────────────────────────
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#1a1a1a")
      .text("FORM No. 16", MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 14;
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(
        "[See rule 31(1)(a)] — Certificate under section 203 of the Income-tax Act, 1961 for TDS on salary",
        MARGIN,
        y,
        { width: CONTENT_W, align: "center" },
      );
    y += 22;

    // ── Employer / Employee block ────────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 80).strokeColor("#bbb").stroke();
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#1a1a1a")
      .text("Name & address of Employer", MARGIN + 6, y + 6);
    doc.font("Helvetica").text(input.employerName, MARGIN + 6, y + 18);
    doc.text(input.employerAddress, MARGIN + 6, y + 30, {
      width: CONTENT_W / 2 - 12,
    });
    doc.font("Helvetica-Bold").text("PAN of Employer", MARGIN + 6, y + 56);
    doc.font("Helvetica").text(input.employerPan, MARGIN + 110, y + 56);
    doc.font("Helvetica-Bold").text("TAN of Employer", MARGIN + 6, y + 68);
    doc.font("Helvetica").text(input.employerTan, MARGIN + 110, y + 68);

    doc
      .font("Helvetica-Bold")
      .text("Name of Employee", MARGIN + CONTENT_W / 2 + 6, y + 6);
    doc.font("Helvetica").text(input.employeeName, MARGIN + CONTENT_W / 2 + 6, y + 18);
    doc.font("Helvetica-Bold").text("PAN of Employee", MARGIN + CONTENT_W / 2 + 6, y + 32);
    doc.font("Helvetica").text(input.employeePan, MARGIN + CONTENT_W / 2 + 110, y + 32);
    doc.font("Helvetica-Bold").text("Designation", MARGIN + CONTENT_W / 2 + 6, y + 44);
    doc.font("Helvetica").text(input.designation, MARGIN + CONTENT_W / 2 + 110, y + 44);
    doc.font("Helvetica-Bold").text("Assessment Year", MARGIN + CONTENT_W / 2 + 6, y + 56);
    doc.font("Helvetica").text(input.assessmentYear, MARGIN + CONTENT_W / 2 + 110, y + 56);
    doc.font("Helvetica-Bold").text("Period", MARGIN + CONTENT_W / 2 + 6, y + 68);
    doc.font("Helvetica").text(`${input.fromMonth} – ${input.toMonth}`, MARGIN + CONTENT_W / 2 + 110, y + 68);

    y += 92;

    // ── PART B ───────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#1a1a1a")
      .text("PART B (Annexure) — Details of Salary paid and any other income & tax deducted", MARGIN, y);
    y += 16;
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor("#666")
      .text(
        `Computed under the ${input.taxRegime === "new" ? "NEW" : "OLD"} tax regime`,
        MARGIN,
        y,
      );
    y += 14;

    divider(doc, y);
    y += 6;
    row(doc, y, "1. Gross salary", input.grossSalary, { bold: true });
    y += 14;
    row(doc, y, "(a) Less: HRA exemption u/s 10(13A)", input.lessHraExempt, { indent: 12 });
    y += 12;
    row(doc, y, "(b) Less: LTA exemption u/s 10(5)", input.lessLtaExempt, { indent: 12 });
    y += 12;
    row(doc, y, "(c) Less: Other exempt allowances", input.lessOtherExempt, { indent: 12 });
    y += 14;
    row(doc, y, "2. Net salary (1 - exemptions)", input.netSalary, { bold: true });
    y += 16;

    divider(doc, y);
    y += 6;
    row(doc, y, "3. Deductions u/s 16", "", { bold: true });
    y += 14;
    row(doc, y, "(a) Standard deduction u/s 16(ia)", input.standardDeduction, { indent: 12 });
    y += 12;
    row(doc, y, "(b) Entertainment allowance u/s 16(ii)", input.entertainmentAllowance, { indent: 12 });
    y += 12;
    row(doc, y, "(c) Tax on employment u/s 16(iii)", input.professionalTax, { indent: 12 });
    y += 16;

    divider(doc, y);
    y += 6;
    row(doc, y, "4. Deductions under Chapter VI-A", "", { bold: true });
    y += 14;
    if (input.deductions.length === 0) {
      doc.fontSize(8).font("Helvetica-Oblique").fillColor("#888").text("(none claimed)", MARGIN + 12, y);
      y += 12;
    } else {
      for (const d of input.deductions) {
        row(doc, y, `   ${d.section} — ${d.label}`, d.amount, { indent: 12 });
        y += 12;
      }
    }
    y += 4;

    divider(doc, y);
    y += 6;
    row(doc, y, "5. Total taxable income", input.taxableIncome, { bold: true });
    y += 14;
    row(doc, y, "6. Tax on total income (slab basis)", input.taxOnIncome);
    y += 12;
    row(doc, y, "7. Less: Rebate u/s 87A", input.rebate87a);
    y += 12;
    row(doc, y, "8. Add: Surcharge", input.surcharge);
    y += 12;
    row(doc, y, "9. Add: Health & Education Cess (4%)", input.cessHealthEducation);
    y += 14;
    row(doc, y, "10. Total tax liability", input.totalTaxLiability, { bold: true });
    y += 14;
    row(doc, y, "11. Total TDS deducted (as per challans)", input.totalTdsDeducted, { bold: true });
    y += 14;
    row(
      doc,
      y,
      input.refundDue >= 0 ? "12. Refund due / Tax payable" : "12. Tax payable",
      Math.abs(input.refundDue),
      { bold: true },
    );
    y += 18;

    // Words
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor("#444")
      .text(
        `Tax deducted in words: ${amountInWords(input.totalTdsDeducted)}`,
        MARGIN,
        y,
        { width: CONTENT_W },
      );
    y += 24;

    // ── Verification ─────────────────────────────────────────────────────
    divider(doc, y);
    y += 6;
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#1a1a1a")
      .text("Verification", MARGIN, y);
    y += 14;
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#1a1a1a")
      .text(
        `I, ${input.signedBy}, working as ${input.signedDesignation}, do hereby certify that the information given above is true, ` +
          `complete and correct and is based on the books of accounts, documents, TDS statements, TDS deposited and other available records.`,
        MARGIN,
        y,
        { width: CONTENT_W, align: "justify" },
      );
    y += 60;

    doc.fontSize(8).text(`Place & Date: ${input.signedAt}`, MARGIN, y);
    doc.fontSize(8).text("Signature of person responsible for deduction of tax", MARGIN + CONTENT_W - 220, y);
    y += 12;
    doc.fontSize(8).text(`Designation: ${input.signedDesignation}`, MARGIN + CONTENT_W - 220, y);

    doc.end();
  });
}
