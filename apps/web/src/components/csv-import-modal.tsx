"use client";

/**
 * Generic, schema-driven CSV import modal.
 *
 * Reuses the proven 5-step wizard UX from the CMDB bulk-import modal but is
 * entity-agnostic: callers pass a `fields` spec (which columns are expected,
 * which are required, optional enum validation) and an `onImport` callback that
 * receives the validated rows and performs the actual write (typically a tRPC
 * bulk-ingest mutation). Presentation + client-side validation only — all
 * authorization and persistence happen server-side in the ingest router.
 */

import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export type ImportField = {
  /** Column key (snake_case, matches normalized CSV header). */
  key: string;
  /** Human label shown in the expected-columns hint. */
  label: string;
  required?: boolean;
  /** If set, value must be one of these (case-insensitive). */
  enumValues?: readonly string[];
};

export type ImportedRow = Record<string, string>;

interface CsvImportModalProps {
  title: string;
  fields: ImportField[];
  /**
   * Performs the write for a batch of validated rows. Should resolve to the
   * number imported (or throw). Receives plain {key: value} string maps.
   */
  onImport: (rows: ImportedRow[]) => Promise<{ imported: number; skipped?: number }>;
  onClose: () => void;
  /** Optional note rendered under the expected columns. */
  hint?: string;
}

type ParsedRow = {
  rowNum: number;
  values: ImportedRow;
  errors: string[];
};

// --- CSV parser: handles quoted fields and escaped quotes ---
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === "," && !inQ) {
        fields.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const [headerLine, ...dataLines] = nonEmpty;
  return {
    headers: parseLine(headerLine!).map((h) => h.toLowerCase().replace(/\s+/g, "_")),
    rows: dataLines.map(parseLine),
  };
}

// Headers are normalized to lowercase + underscores during parsing, so field
// keys (often camelCase, e.g. "firstName") must be normalized the same way
// before matching against header columns.
function normKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, "_");
}

function validate(headers: string[], rows: string[][], fields: ImportField[]): ParsedRow[] {
  const idx = (col: string) => headers.indexOf(normKey(col));

  return rows.map((row, i) => {
    const get = (col: string) => row[idx(col)]?.trim() ?? "";
    const values: ImportedRow = {};
    const errors: string[] = [];

    for (const f of fields) {
      const v = get(f.key);
      if (v) values[f.key] = v;
      if (f.required && !v) errors.push(`${f.label} is required`);
      if (v && f.enumValues && !f.enumValues.some((e) => e.toLowerCase() === v.toLowerCase())) {
        errors.push(`invalid ${f.label} "${v}" — must be one of: ${f.enumValues.join(", ")}`);
      }
    }

    return { rowNum: i + 2, values, errors };
  });
}

export function CsvImportModal({ title, fields, onImport, onClose, hint }: CsvImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<{ success: number; skipped: number; error?: string }>({
    success: 0,
    skipped: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
        toast.error("Please upload a CSV file");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers, rows: rawRows } = parseCSV(text);
        if (headers.length === 0) {
          toast.error("CSV file appears to be empty");
          return;
        }
        const missing = requiredKeys.filter((k) => !headers.includes(normKey(k)));
        if (missing.length > 0) {
          toast.error(`CSV is missing required column(s): ${missing.join(", ")}`);
          return;
        }
        setRows(validate(headers, rawRows, fields));
        setStep(2);
      };
      reader.readAsText(file);
    },
    [fields, requiredKeys],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  const downloadTemplate = useCallback(() => {
    const header = fields.map((f) => f.key).join(",");
    const blob = new Blob([header + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fields, title]);

  const handleImport = useCallback(async () => {
    setStep(4);
    try {
      const res = await onImport(validRows.map((r) => r.values));
      setResults({ success: res.imported, skipped: res.skipped ?? 0 });
    } catch (err: any) {
      setResults({ success: 0, skipped: 0, error: err?.message ?? "Import failed" });
    }
    setStep(5);
  }, [validRows, onImport]);

  const stepLabels = ["Upload CSV", "Preview & Validate", "Confirm Import", "Importing…", "Done"];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Step {step} of 5 — {stepLabels[step - 1]}
            </p>
          </div>
          {step !== 4 && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Step progress */}
        <div className="flex px-5 py-2 gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                  ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
              >
                <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Drag &amp; drop a CSV file here, or <span className="text-primary underline">browse</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-foreground">Expected columns:</p>
                  <button
                    onClick={downloadTemplate}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download template
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fields.map((f) => (
                    <code
                      key={f.key}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${f.required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {f.key}
                      {f.required ? " *" : ""}
                    </code>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  <span className="text-primary">*</span> required · First row must be headers
                  {hint ? ` · ${hint}` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-3 text-[11px]">
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {validRows.length} valid
                  </span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errorRows.length} with errors
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Re-upload
                </button>
              </div>

              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                      {fields.slice(0, 4).map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row) => (
                      <tr key={row.rowNum} className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <td className="px-2 py-1.5 text-muted-foreground">{row.rowNum}</td>
                        {fields.slice(0, 4).map((f) => (
                          <td key={f.key} className="px-2 py-1.5 text-foreground">
                            {row.values[f.key] || <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                        <td className="px-2 py-1.5">
                          {row.errors.length > 0 ? (
                            <span className="text-red-600 text-[10px]">{row.errors.join("; ")}</span>
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && (
                <p className="text-[10px] text-muted-foreground text-center">Showing first 10 of {rows.length} rows</p>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-4">
              <FileText className="w-10 h-10 text-primary/60" />
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Ready to import</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-green-600 font-bold">{validRows.length}</span> records will be created
                  {errorRows.length > 0 && (
                    <>
                      , <span className="text-red-600 font-bold">{errorRows.length}</span> will be skipped (errors)
                    </>
                  )}
                </p>
              </div>
              {errorRows.length > 0 && (
                <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-3">
                  <p className="text-[11px] font-medium text-red-700 mb-1">Rows that will be skipped:</p>
                  {errorRows.slice(0, 5).map((r) => (
                    <p key={r.rowNum} className="text-[10px] text-red-600">
                      Row {r.rowNum}: {r.errors.join(", ")}
                    </p>
                  ))}
                  {errorRows.length > 5 && <p className="text-[10px] text-red-500">…and {errorRows.length - 5} more</p>}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 4 && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Importing {validRows.length} records…</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="flex flex-col items-center gap-4 py-4">
              {results.error ? (
                <AlertCircle className="w-10 h-10 text-red-500" />
              ) : (
                <CheckCircle className="w-10 h-10 text-green-500" />
              )}
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  {results.error ? "Import failed" : "Import complete"}
                </p>
                {results.error ? (
                  <p className="text-sm text-red-600 mt-1">{results.error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="text-green-600 font-bold">{results.success}</span> records created
                    {results.skipped > 0 && (
                      <>
                        , <span className="text-amber-600 font-bold">{results.skipped}</span> skipped
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border flex justify-between items-center">
          <button
            onClick={step === 5 ? onClose : () => setStep((s) => Math.max(1, s - 1) as any)}
            disabled={step === 4}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent disabled:opacity-40"
          >
            {step === 5 ? "Close" : "Back"}
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep((s) => (s + 1) as any)}
              disabled={step === 2 && validRows.length === 0}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40"
            >
              {step === 2 ? `Continue with ${validRows.length} valid rows` : "Next"}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleImport}
              disabled={validRows.length === 0}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40"
            >
              Import {validRows.length} Records
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
