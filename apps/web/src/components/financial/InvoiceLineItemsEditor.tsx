"use client";

/**
 * InvoiceLineItemsEditor — M-07 line-item entry for the Create Invoice forms.
 *
 * Both the AR (`createReceivableInvoice`) and AP (`createInvoice`) forms mount
 * this same component, so the two paths cannot drift — mirroring how the API
 * shares `computeInvoiceFromLines` (`apps/api/src/lib/invoice-lines.ts`).
 *
 * The CA ruling this UI enforces (see invoice-lines.ts):
 *  - Lines are AUTHORITATIVE; the header is DERIVED from them.
 *  - Each line's tax rounds half-up to 2dp independently.
 *  - The header equals the SUM of the already-rounded line values.
 *  - A user-entered total that disagrees with the lines is exactly the case the
 *    e-invoice (IRN) generator and the GSTR-1 offline tool reject — so here the
 *    header is DERIVED and READ-ONLY; there is nothing for the user to disagree
 *    with. `taxableValue` is the authoritative per-line figure the API accepts.
 *
 * The header preview is computed with the SAME integer-paise, half-up arithmetic
 * as the server (`computeGST`: Math.round(taxableValue * rate) / 100 per
 * component; header = sum of rounded lines in paise). What the user sees here
 * therefore equals what the server persists, to the paise — so the server's
 * hard ₹0.01 mismatch guard never fires from a value this form produced.
 */

import { Plus, Trash2 } from "lucide-react";

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/** One editable row. `taxableValue` is authoritative; qty/unitPrice are conveniences. */
export interface InvoiceLineRow {
  description: string;
  hsnSacCode: string;
  quantity: string;
  unitPrice: string;
  taxableValue: string;
  gstRate: GstRate;
}

export function emptyLine(): InvoiceLineRow {
  return { description: "", hsnSacCode: "", quantity: "1", unitPrice: "", taxableValue: "", gstRate: 18 };
}

/** The payload shape both API create paths accept (INVOICE_LINE_INPUT). */
export interface InvoiceLinePayload {
  description: string;
  taxableValue: number;
  gstRate: GstRate;
  hsnSacCode?: string;
  quantity?: number;
  unitPrice?: number;
}

export interface DerivedHeader {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  invoiceTotal: number;
}

interface PerLineTax {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

/** Round a rupee value to whole paise (server uses Math.round on paise). */
function toPaise(v: number): number {
  return Math.round(v * 100);
}

/**
 * Per-line tax, byte-identical to the server's computeGST for positive values:
 * component = Math.round(taxableValue * rate) / 100. Intra-state splits CGST/SGST
 * 50/50; inter-state is a single IGST leg.
 */
export function computeLineTax(taxableValue: number, gstRate: number, isInterstate: boolean): PerLineTax {
  const halfRate = gstRate / 2;
  const cgstAmount = isInterstate ? 0 : Math.round(taxableValue * halfRate) / 100;
  const sgstAmount = isInterstate ? 0 : Math.round(taxableValue * halfRate) / 100;
  const igstAmount = isInterstate ? Math.round(taxableValue * gstRate) / 100 : 0;
  return {
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    lineTotal: taxableValue + cgstAmount + sgstAmount + igstAmount,
  };
}

/** Header = sum of the ALREADY-ROUNDED lines, summed in integer paise (no float drift). */
export function deriveHeader(rows: InvoiceLineRow[], isInterstate: boolean): DerivedHeader {
  let txvalP = 0, cgstP = 0, sgstP = 0, igstP = 0, totalP = 0;
  for (const r of rows) {
    const tv = Number(r.taxableValue || 0);
    if (!(tv > 0)) continue;
    const t = computeLineTax(tv, r.gstRate, isInterstate);
    txvalP += toPaise(t.taxableValue);
    cgstP += toPaise(t.cgstAmount);
    sgstP += toPaise(t.sgstAmount);
    igstP += toPaise(t.igstAmount);
    totalP += toPaise(t.lineTotal);
  }
  return {
    taxableValue: txvalP / 100,
    cgstAmount: cgstP / 100,
    sgstAmount: sgstP / 100,
    igstAmount: igstP / 100,
    totalTax: (cgstP + sgstP + igstP) / 100,
    invoiceTotal: totalP / 100,
  };
}

/** Rows that have a description and a positive taxable value → API payload. */
export function toLinePayload(rows: InvoiceLineRow[]): InvoiceLinePayload[] {
  return rows
    .filter((r) => r.description.trim() !== "" && Number(r.taxableValue || 0) > 0)
    .map((r) => ({
      description: r.description.trim(),
      taxableValue: Number(r.taxableValue),
      gstRate: r.gstRate,
      hsnSacCode: r.hsnSacCode.trim() || undefined,
      quantity: r.quantity.trim() ? Number(r.quantity) : undefined,
      unitPrice: r.unitPrice.trim() ? Number(r.unitPrice) : undefined,
    }));
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  rows: InvoiceLineRow[];
  onChange: (rows: InvoiceLineRow[]) => void;
  /** Drives the CGST/SGST-vs-IGST preview only; the server re-derives it authoritatively. */
  isInterstate: boolean;
}

export function InvoiceLineItemsEditor({ rows, onChange, isInterstate }: Props) {
  const header = deriveHeader(rows, isInterstate);

  function update(idx: number, patch: Partial<InvoiceLineRow>) {
    const next = rows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      // When qty or unit price changes, default the authoritative taxable value to
      // qty × unitPrice. The user may still override taxableValue directly (the CA
      // ruling makes it the authoritative figure, not qty × price).
      if (("quantity" in patch || "unitPrice" in patch) && !("taxableValue" in patch)) {
        const q = Number(merged.quantity || 0);
        const up = Number(merged.unitPrice || 0);
        if (q > 0 && up > 0) merged.taxableValue = String(Math.round(q * up * 100) / 100);
      }
      return merged;
    });
    onChange(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Line items *</label>
        <span className="text-[10px] text-muted-foreground/70">Lines are authoritative — the header below is derived.</span>
      </div>
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left font-medium px-2 py-1">Description</th>
              <th className="text-left font-medium px-2 py-1 w-20">HSN/SAC</th>
              <th className="text-right font-medium px-2 py-1 w-14">Qty</th>
              <th className="text-right font-medium px-2 py-1 w-24">Unit price</th>
              <th className="text-right font-medium px-2 py-1 w-28">Taxable ₹ *</th>
              <th className="text-right font-medium px-2 py-1 w-16">GST</th>
              <th className="text-right font-medium px-2 py-1 w-28">Tax</th>
              <th className="text-right font-medium px-2 py-1 w-28">Line total</th>
              <th className="px-1 py-1 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const tv = Number(r.taxableValue || 0);
              const t = computeLineTax(tv > 0 ? tv : 0, r.gstRate, isInterstate);
              const lineTax = t.cgstAmount + t.sgstAmount + t.igstAmount;
              return (
                <tr key={idx} className="border-t border-border">
                  <td className="px-1 py-1">
                    <input
                      className="w-full min-w-[9rem] border border-border rounded px-1.5 py-1 bg-background"
                      placeholder="Goods / service"
                      value={r.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className="w-full border border-border rounded px-1.5 py-1 bg-background"
                      placeholder="9983"
                      value={r.hsnSacCode}
                      onChange={(e) => update(idx, { hsnSacCode: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      className="w-full border border-border rounded px-1.5 py-1 bg-background text-right"
                      value={r.quantity}
                      onChange={(e) => update(idx, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      className="w-full border border-border rounded px-1.5 py-1 bg-background text-right"
                      placeholder="0.00"
                      value={r.unitPrice}
                      onChange={(e) => update(idx, { unitPrice: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      className="w-full border border-border rounded px-1.5 py-1 bg-background text-right font-medium"
                      placeholder="0.00"
                      value={r.taxableValue}
                      onChange={(e) => update(idx, { taxableValue: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      className="w-full border border-border rounded px-1 py-1 bg-background text-right"
                      value={r.gstRate}
                      onChange={(e) => update(idx, { gstRate: Number(e.target.value) as GstRate })}
                    >
                      {GST_RATES.map((rate) => (
                        <option key={rate} value={rate}>{rate}%</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                    {tv > 0 ? inr(lineTax) : "—"}
                    {tv > 0 && !isInterstate && (
                      <div className="text-[9px] text-muted-foreground/60">
                        C {inr(t.cgstAmount)} · S {inr(t.sgstAmount)}
                      </div>
                    )}
                    {tv > 0 && isInterstate && (
                      <div className="text-[9px] text-muted-foreground/60">IGST</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium">{tv > 0 ? inr(t.lineTotal) : "—"}</td>
                  <td className="px-1 py-1 text-center">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove line"
                        onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, emptyLine()])}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>

      {/* Derived, read-only header — the numbers that will hit `invoices`. */}
      <div className="mt-3 rounded border border-border bg-muted/30 px-3 py-2 text-[11px]">
        <div className="flex justify-between py-0.5">
          <span className="text-muted-foreground">Taxable value</span>
          <span className="font-mono">{inr(header.taxableValue)}</span>
        </div>
        {isInterstate ? (
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">IGST</span>
            <span className="font-mono">{inr(header.igstAmount)}</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">CGST</span>
              <span className="font-mono">{inr(header.cgstAmount)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">SGST</span>
              <span className="font-mono">{inr(header.sgstAmount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between py-0.5 mt-1 border-t border-border pt-1 font-semibold">
          <span>Invoice total (derived)</span>
          <span className="font-mono">{inr(header.invoiceTotal)}</span>
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-1">
          Derived from the rounded lines — not entered. The e-invoice / GSTR-1 tools reject any header that
          disagrees with the lines, so this is the figure that is filed.
        </p>
      </div>
    </div>
  );
}
