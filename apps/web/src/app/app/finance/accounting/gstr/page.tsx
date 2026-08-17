"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { Receipt, Loader2, Download, Building2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { EmptyState } from "@coheronconnect/ui";
import { PageHeader } from "@/components/ui/page-header";
import { formatInr } from "@/lib/utils";

/**
 * GSTR Generation — `accounting.gstr.generateGSTR1` / `generateGSTR3B` given a
 * screen with a navigation path.
 *
 * Both procedures previously had exactly one caller in the whole web app: a tab
 * on the orphaned `/app/accounting` page, which is absent from
 * `sidebar-config.ts`. GST return generation was therefore reachable only by
 * typing the URL — the same failure mode that stranded Post/Reverse on that page
 * and let a balanced journal entry save without reaching the ledger
 * (see `e2e/journal-post.spec.ts`). This route gives it a door.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A GST return is filed for a period that has ENDED, so the useful default is
 * last month, not this one. December rolls the year back with it.
 */
function previousPeriod(now = new Date()): { month: number; year: number } {
    const m = now.getMonth(); // 0-indexed; this is already "last month" as a 1-indexed value
    return m === 0
        ? { month: 12, year: now.getFullYear() - 1 }
        : { month: m, year: now.getFullYear() };
}

export default function GstrPage() {
    const { can } = useRBAC();
    if (!can("financial", "read")) return <AccessDenied module="GSTR Generation" />;
    return <GstrPageInner />;
}

function GstrPageInner() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const initial = useMemo(() => previousPeriod(), []);

    const [gstinId, setGstinId] = useState("");
    const [formType, setFormType] = useState<"GSTR-1" | "GSTR-3B">("GSTR-1");
    const [month, setMonth] = useState(initial.month);
    const [year, setYear] = useState(initial.year);
    const [generated, setGenerated] = useState<any>(null);

    /**
     * The year list is derived, not literal. It used to be `[2024, 2025, 2026]`,
     * which silently stops offering the current year the moment the calendar
     * passes its last entry — a filing screen that expires.
     */
    const years = useMemo(() => {
        const y = new Date().getFullYear();
        return [y - 3, y - 2, y - 1, y];
    }, []);

    const gstinQ = trpc.accounting.gstin.list.useQuery(
        undefined,
        mergeTrpcQueryOpts("accounting.gstin.list", undefined),
    );
    const gstins = (gstinQ.data ?? []) as any[];

    // Generated on demand: `enabled: false` + an explicit refetch, so changing a
    // dropdown does not fire a return generation.
    const gstr1Q = trpc.accounting.gstr.generateGSTR1.useQuery(
        { gstinId, month, year },
        mergeTrpcQueryOpts("accounting.gstr.generateGSTR1", { enabled: false }),
    );
    const gstr3bQ = trpc.accounting.gstr.generateGSTR3B.useQuery(
        { gstinId, month, year },
        mergeTrpcQueryOpts("accounting.gstr.generateGSTR3B", { enabled: false }),
    );

    const isFetching = gstr1Q.isFetching || gstr3bQ.isFetching;

    async function generate() {
        if (!gstinId) {
            toast.error("Select a GSTIN first");
            return;
        }
        const result = formType === "GSTR-1" ? await gstr1Q.refetch() : await gstr3bQ.refetch();
        if (result.data) setGenerated({ ...(result.data as any), formType, month, year });
        else if (result.error) toast.error(result.error.message ?? "Generation failed");
    }

    function download() {
        if (!generated) return;
        const blob = new Blob([JSON.stringify(generated.payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${generated.formType}-${MONTHS[generated.month - 1]}-${generated.year}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="GSTR Generation"
                subtitle="Compile GSTR-1 (outward supplies) and GSTR-3B (summary return) from posted invoices and matched GSTR-2B input credit."
                icon={Receipt}
            />

            <div className="flex items-center gap-2 flex-wrap">
                <select
                    value={gstinId}
                    onChange={(e) => setGstinId(e.target.value)}
                    className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none min-w-[200px]"
                >
                    <option value="">Select GSTIN…</option>
                    {gstins.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.gstin} — {g.legalName}</option>
                    ))}
                </select>
                <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "GSTR-1" | "GSTR-3B")}
                    className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none"
                >
                    <option value="GSTR-1">GSTR-1 (Outward Supplies)</option>
                    <option value="GSTR-3B">GSTR-3B (Summary Return)</option>
                </select>
                <select
                    value={month}
                    onChange={(e) => setMonth(+e.target.value)}
                    className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none"
                >
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select
                    value={year}
                    onChange={(e) => setYear(+e.target.value)}
                    className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none"
                >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                    onClick={generate}
                    disabled={!gstinId || isFetching}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-50"
                >
                    {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
                    Generate {formType}
                </button>
                {generated && (
                    <button
                        onClick={download}
                        className="flex items-center gap-1 px-2 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                    >
                        <Download className="w-3 h-3" /> Download JSON
                    </button>
                )}
            </div>

            {generated && (
                <div className="bg-card border border-border rounded-lg p-4">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-3">
                        {generated.formType} — {MONTHS[generated.month - 1]} {generated.year} · GSTIN: {generated.gstin}
                    </h3>
                    {generated.formType === "GSTR-1" ? (
                        <div className="text-[12px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{generated.invoiceCount}</span> invoices compiled into GSTR-1 payload.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                { l: "Output IGST", v: formatInr(generated.summary.outputIGST) },
                                { l: "Output CGST", v: formatInr(generated.summary.outputCGST) },
                                { l: "Output SGST", v: formatInr(generated.summary.outputSGST) },
                                { l: "Total Output Tax", v: formatInr(generated.summary.totalOutputTax) },
                                // Read the computed credit, never a literal. This tile was
                                // hardcoded to ₹0 while `netPayable` beside it WAS net of ITC,
                                // so the two figures on screen contradicted each other. The
                                // downloaded payload always carried the real credit in table 4,
                                // so this was a wrong number shown, not a wrong return filed.
                                { l: "Total ITC", v: formatInr(generated.summary.totalInputTax) },
                                { l: "Net Payable", v: formatInr(generated.summary.netPayable) },
                            ].map((k) => (
                                <div key={k.l} className="bg-muted/40 rounded p-2">
                                    <div className="text-[11px] text-muted-foreground">{k.l}</div>
                                    <div className="font-mono font-semibold text-foreground text-[13px]">{k.v}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    <details className="mt-3">
                        <summary className="text-[11px] text-primary cursor-pointer hover:underline">View raw JSON payload</summary>
                        <pre className="mt-2 text-[10px] bg-muted p-3 rounded overflow-auto max-h-80">
                            {JSON.stringify(generated.payload, null, 2)}
                        </pre>
                    </details>
                </div>
            )}

            {!gstinQ.isLoading && gstins.length === 0 && (
                <EmptyState
                    icon={Building2}
                    title="No GSTINs registered"
                    description="Add your GSTIN(s) under Organisation Settings → Financial → GSTIN Registry to generate GSTR returns."
                />
            )}
        </div>
    );
}
