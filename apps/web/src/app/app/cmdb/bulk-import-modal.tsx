"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const REQUIRED_COLS = ["name"] as const;
const VALID_STATUSES = ["in_stock", "deployed", "maintenance", "retired", "disposed"] as const;
const EXPECTED_COLUMNS = ["name", "type", "status", "serial_number", "manufacturer", "model", "location"];

type ParsedRow = {
  rowNum: number;
  name: string;
  type: string;
  status: string;
  location: string;
  vendor: string;
  customFields: Record<string, string>;
  errors: string[];
  typeId: string | null;
};

type AssetType = { id: string; name: string };

// --- CSV parser: handles quoted fields and escaped quotes ---
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim() !== "");
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        fields.push(cur.trim()); cur = "";
      } else {
        cur += c;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const [headerLine, ...dataLines] = nonEmpty;
  return {
    headers: parseLine(headerLine!).map(h => h.toLowerCase().replace(/\s+/g, "_")),
    rows: dataLines.map(parseLine),
  };
}

function validateAndMap(
  headers: string[],
  rows: string[][],
  types: AssetType[],
): ParsedRow[] {
  const typeMap = new Map(types.map(t => [t.name.toLowerCase(), t.id]));
  const idx = (col: string) => headers.indexOf(col);

  return rows.map((row, i) => {
    const get = (col: string) => row[idx(col)]?.trim() ?? "";
    const name     = get("name");
    const type     = get("type");
    const status   = get("status") || "in_stock";
    const location = get("location");
    const vendor   = get("manufacturer") || get("vendor") || "";
    const errors: string[] = [];

    if (!name) errors.push("name is required");
    if (status && !VALID_STATUSES.includes(status as any)) {
      errors.push(`invalid status "${status}" — must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    // Resolve typeId
    const normalised = type.toLowerCase();
    let typeId: string | null = typeMap.get(normalised) ?? null;
    if (!typeId && types.length > 0) typeId = types[0]!.id; // fallback to first type
    if (!typeId) errors.push("no asset types configured — please create asset types first");

    // Extra columns go into customFields
    const customFields: Record<string, string> = {};
    for (const col of ["serial_number", "model"]) {
      const v = get(col);
      if (v) customFields[col] = v;
    }
    if (type) customFields["ci_type"] = type;

    return { rowNum: i + 2, name, type, status, location, vendor, customFields, errors, typeId };
  });
}

interface BulkImportModalProps {
  onClose: () => void;
}

export function BulkImportModal({ onClose }: BulkImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: typesData } = trpc.assets.listTypes.useQuery(undefined, { refetchOnWindowFocus: false });
  const types: AssetType[] = (typesData ?? []).map((t: any) => ({ id: t.id, name: t.name }));

  const createAsset = trpc.assets.create.useMutation();

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows: rawRows } = parseCSV(text);
      if (headers.length === 0) { toast.error("CSV file appears to be empty"); return; }
      if (!headers.includes("name")) {
        toast.error('CSV must have a "name" column');
        return;
      }
      const parsed = validateAndMap(headers, rawRows, types);
      setRows(parsed);
      setStep(2);
    };
    reader.readAsText(file);
  }, [types]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const validRows  = rows.filter(r => r.errors.length === 0);
  const errorRows  = rows.filter(r => r.errors.length > 0);

  const handleImport = useCallback(async () => {
    setStep(4);
    setProgress({ done: 0, total: validRows.length });
    let done = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      try {
        await createAsset.mutateAsync({
          name:       row.name,
          typeId:     row.typeId!,
          status:     row.status as any,
          location:   row.location || undefined,
          vendor:     row.vendor   || undefined,
          customFields: Object.keys(row.customFields).length > 0 ? row.customFields : undefined,
        });
        done++;
      } catch (err: any) {
        errors.push(`Row ${row.rowNum} (${row.name}): ${err?.message ?? "Unknown error"}`);
      }
      setProgress({ done, total: validRows.length });
    }

    setResults({ success: done, errors });
    setStep(5);
  }, [validRows, createAsset]);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Bulk Import Assets</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Step {step} of 5 — {["Upload CSV", "Preview & Validate", "Confirm Import", "Importing…", "Done"][step - 1]}
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
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                  ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
              >
                <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Drag &amp; drop a CSV file here, or <span className="text-primary underline">browse</span></p>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <p className="text-[11px] font-medium text-foreground mb-2">Expected columns:</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPECTED_COLUMNS.map(col => (
                    <code key={col}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${REQUIRED_COLS.includes(col as any) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {col}{REQUIRED_COLS.includes(col as any) ? " *" : ""}
                    </code>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  <span className="text-primary">*</span> required · First row must be headers ·
                  Valid statuses: {VALID_STATUSES.join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-3 text-[11px]">
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />{validRows.length} valid
                  </span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />{errorRows.length} with errors
                    </span>
                  )}
                </div>
                <button onClick={() => setStep(1)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
                  Re-upload
                </button>
              </div>

              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Location</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map(row => (
                      <tr key={row.rowNum} className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <td className="px-2 py-1.5 text-muted-foreground">{row.rowNum}</td>
                        <td className="px-2 py-1.5 font-medium text-foreground">{row.name || <em className="text-red-500">missing</em>}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{row.type || "—"}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${
                            VALID_STATUSES.includes(row.status as any) ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {row.status || "in_stock"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{row.location || "—"}</td>
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
                <p className="text-[10px] text-muted-foreground text-center">
                  Showing first 10 of {rows.length} rows
                </p>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-4">
              <FileText className="w-10 h-10 text-primary/60" />
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Ready to import</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-green-600 font-bold">{validRows.length}</span> assets will be created
                  {errorRows.length > 0 && (
                    <>, <span className="text-red-600 font-bold">{errorRows.length}</span> will be skipped (errors)</>
                  )}
                </p>
              </div>
              {errorRows.length > 0 && (
                <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-3">
                  <p className="text-[11px] font-medium text-red-700 mb-1">Rows that will be skipped:</p>
                  {errorRows.slice(0, 5).map(r => (
                    <p key={r.rowNum} className="text-[10px] text-red-600">
                      Row {r.rowNum} ({r.name || "unnamed"}): {r.errors.join(", ")}
                    </p>
                  ))}
                  {errorRows.length > 5 && (
                    <p className="text-[10px] text-red-500">…and {errorRows.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Importing ──────────────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Importing assets…</p>
              <p className="text-[11px] text-muted-foreground">{progress.done} / {progress.total}</p>
              <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-2 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{pct}% complete</p>
            </div>
          )}

          {/* ── Step 5: Done ───────────────────────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Import complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-green-600 font-bold">{results.success}</span> assets created successfully
                  {results.errors.length > 0 && (
                    <>, <span className="text-red-600 font-bold">{results.errors.length}</span> failed</>
                  )}
                </p>
              </div>
              {results.errors.length > 0 && (
                <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-3 max-h-32 overflow-y-auto">
                  {results.errors.map((e, i) => (
                    <p key={i} className="text-[10px] text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border flex justify-between items-center">
          <button
            onClick={step === 5 ? onClose : () => setStep(s => Math.max(1, s - 1) as any)}
            disabled={step === 4}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent disabled:opacity-40">
            {step === 5 ? "Close" : "Back"}
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(s => (s + 1) as any)}
              disabled={(step === 2 && validRows.length === 0)}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40">
              {step === 2 ? `Continue with ${validRows.length} valid rows` : "Next"}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleImport}
              disabled={validRows.length === 0}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40">
              Import {validRows.length} Assets
            </button>
          )}
          {step === 5 && results.success > 0 && (
            <span className="text-[11px] text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Inventory updated
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
