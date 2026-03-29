"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nexusops/ui";
import { cn } from "@/lib/utils";
import type { ClauseField, WizardClauseState } from "@/lib/contract-templates";
import { getDisplayedClauseBody } from "@/lib/contract-templates";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-slate-200",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

const CATEGORY_STYLES: Record<WizardClauseState["category"], string> = {
  core: "border-transparent bg-blue-100 text-blue-800",
  commercial: "border-transparent bg-amber-100 text-amber-800",
  legal: "border-transparent bg-violet-100 text-violet-800",
  operational: "border-transparent bg-slate-200 text-slate-700",
};

function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: code }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "₹";
  } catch {
    return "₹";
  }
}

function parseFieldValue(field: ClauseField, raw: string): string | number {
  if (field.type === "number") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : field.defaultValue;
  }
  return raw;
}

export type ClauseEditorProps = {
  clauses: WizardClauseState[];
  onChange: (next: WizardClauseState[]) => void;
  currencyCode?: string;
};

export function ClauseEditor({ clauses, onChange, currencyCode = "INR" }: ClauseEditorProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const sym = currencySymbol(currencyCode);

  const toggleExpand = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  };

  const patchClause = (index: number, patch: Partial<WizardClauseState>) => {
    const next = clauses.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  const updateField = (index: number, fieldId: string, raw: string, field: ClauseField) => {
    const c = clauses[index];
    if (!c) return;
    const value = parseFieldValue(field, raw);
    patchClause(index, {
      fieldValues: { ...c.fieldValues, [fieldId]: value },
      bodyOverride: null,
    });
  };

  const moveClause = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= clauses.length) return;
    const next = [...clauses];
    [next[index], next[j]] = [next[j]!, next[index]!];
    onChange(next);
  };

  const resetClause = (index: number) => {
    const c = clauses[index];
    if (!c) return;
    const templateFields = c.fields;
    patchClause(index, {
      fieldValues: Object.fromEntries(templateFields.map((f) => [f.id, f.defaultValue])) as Record<string, string | number>,
      bodyOverride: null,
    });
  };

  const addCustomClause = () => {
    const id = `custom_${Date.now()}`;
    const custom: WizardClauseState = {
      id,
      title: "Custom clause",
      description: "User-defined clause — edit title and body below.",
      bodyTemplate: "",
      isRequired: false,
      isEnabled: true,
      category: "operational",
      fields: [],
      fieldValues: {},
      bodyOverride: null,
      isCustom: true,
    };
    onChange([...clauses, custom]);
    setExpanded((e) => ({ ...e, [id]: true }));
  };

  return (
    <div className="space-y-2">
      {clauses.map((c, index) => {
        const isOpen = !!expanded[c.id];
        const displayIndex = index + 1;
        const previewValue = getDisplayedClauseBody(c);

        return (
          <div
            key={c.id}
            className={cn(
              "border border-border rounded-lg overflow-hidden bg-white",
              !c.isEnabled && "opacity-60",
            )}
          >
            <div
              className="flex items-stretch gap-1 border-b border-border/80 bg-slate-50/80"
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(c.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  toggleExpand(c.id);
                }
              }}
            >
              <div className="flex flex-col justify-center border-r border-border/60 px-1 py-1">
                <button
                  type="button"
                  className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
                  aria-label="Move clause up"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveClause(index, -1);
                  }}
                  disabled={index === 0}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <GripVertical className="w-3.5 h-3.5 text-slate-300 mx-auto" aria-hidden />
                <button
                  type="button"
                  className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
                  aria-label="Move clause down"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveClause(index, 1);
                  }}
                  disabled={index === clauses.length - 1}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0">
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={c.isEnabled}
                    disabled={c.isRequired}
                    onCheckedChange={(checked) => patchClause(index, { isEnabled: checked })}
                    aria-label={c.isRequired ? "Required clause always on" : "Enable clause"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-slate-400 w-5">{displayIndex}</span>
                    <span className="text-[12px] font-semibold text-slate-800 truncate">{c.title}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", CATEGORY_STYLES[c.category])}>
                      {c.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>
                </div>
                <ChevronDown
                  className={cn("w-4 h-4 text-slate-400 flex-shrink-0 transition-transform", isOpen && "rotate-180")}
                />
              </div>
            </div>

            {isOpen && (
              <div className="px-3 py-3 space-y-4 border-t border-border/60">
                {c.fields.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Clause parameters</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {c.fields.map((field) => (
                        <div key={field.id} className="space-y-1 sm:col-span-2">
                          <Label className="field-label text-[11px]">{field.label}</Label>
                          {field.type === "textarea" && (
                            <textarea
                              value={String(c.fieldValues[field.id] ?? field.defaultValue ?? "")}
                              onChange={(e) => updateField(index, field.id, e.target.value, field)}
                              placeholder={field.placeholder}
                              rows={3}
                              className="w-full min-h-[4.5rem] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                            />
                          )}
                          {field.type === "text" && (
                            <Input
                              value={String(c.fieldValues[field.id] ?? field.defaultValue ?? "")}
                              onChange={(e) => updateField(index, field.id, e.target.value, field)}
                              placeholder={field.placeholder}
                            />
                          )}
                          {field.type === "number" && (
                            <Input
                              type="number"
                              step="any"
                              value={String(c.fieldValues[field.id] ?? field.defaultValue ?? "")}
                              onChange={(e) => updateField(index, field.id, e.target.value, field)}
                            />
                          )}
                          {field.type === "currency" && (
                            <div className="flex rounded-lg border border-input shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                              <span className="flex items-center px-2.5 bg-muted/50 text-muted-foreground text-sm border-r border-input">
                                {sym}
                              </span>
                              <Input
                                className="border-0 shadow-none rounded-none focus-visible:ring-0"
                                value={String(c.fieldValues[field.id] ?? field.defaultValue ?? "")}
                                onChange={(e) => updateField(index, field.id, e.target.value, { ...field, type: "text" })}
                              />
                            </div>
                          )}
                          {field.type === "date" && (
                            <Input
                              type="date"
                              value={String(c.fieldValues[field.id] ?? field.defaultValue ?? "")}
                              onChange={(e) => updateField(index, field.id, e.target.value, field)}
                            />
                          )}
                          {field.type === "select" && field.options && (
                            <Select
                              value={String(c.fieldValues[field.id] ?? field.defaultValue)}
                              onValueChange={(v) => updateField(index, field.id, v, { ...field, type: "text" })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select…" />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt.length > 80 ? `${opt.slice(0, 80)}…` : opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {field.helperText && (
                            <p className="text-[11px] text-muted-foreground">{field.helperText}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Live preview</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => resetClause(index)}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset to default
                    </Button>
                  </div>
                  <textarea
                    value={previewValue}
                    onChange={(e) => patchClause(index, { bodyOverride: e.target.value })}
                    className="w-full min-h-[140px] rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap font-sans resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    spellCheck
                  />
                  {c.bodyOverride == null && (
                    <p className="text-[10px] text-slate-400">
                      Placeholders are filled from parameters above. Edit this text directly to override the template for this clause.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" className="w-full mt-2" onClick={addCustomClause}>
        <Plus className="w-3.5 h-3.5" />
        Add custom clause
      </Button>
    </div>
  );
}

export function buildContractDocumentHtml(params: {
  title: string;
  counterparty: string;
  clauses: WizardClauseState[];
}): string {
  const enabled = params.clauses.filter((c) => c.isEnabled);
  const sections = enabled
    .map((c) => {
      const body = getDisplayedClauseBody(c).replace(/\n/g, "<br/>");
      return `<section style="margin-bottom:1.25rem"><h2 style="font-size:14px;margin:0 0 0.5rem">${escapeHtml(c.title)}</h2><div style="font-size:12px;line-height:1.55;color:#334155">${body}</div></section>`;
    })
    .join("");
  return `
    <header style="margin-bottom:1.5rem;border-bottom:1px solid #e2e8f0;padding-bottom:1rem">
      <h1 style="font-size:18px;margin:0 0 0.5rem">${escapeHtml(params.title)}</h1>
      <p style="font-size:12px;color:#64748b;margin:0">Counterparty: ${escapeHtml(params.counterparty)}</p>
    </header>
    ${sections}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openContractPdfPrint(title: string, innerHtml: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #0f172a; }
    @media print { body { padding: 16px; } }
  </style></head><body>${innerHtml}<p style="margin-top:2rem;font-size:10px;color:#94a3b8">Generated by NexusOps — templates are not legal advice.</p></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
}
