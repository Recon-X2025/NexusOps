"use client";

/**
 * GST Registrations — the tenant's own GSTINs.
 *
 * Why this screen exists. `gstin_registry` is the SUPPLIER side of every GST
 * split: `resolveOrgState` reads its state code and `computeGST` decides
 * intra- vs inter-state from it. Until now the only way to populate it was the
 * Setup Wizard, which asked for a "2-letter ISO 3166-2:IN code" (placeholder
 * "MH", default "KA") and wrote that value into the column. Both normalise to
 * null, so the supplier had no state at all, `computeGST` compared "" against
 * the buyer's "29", and every sale was billed INTER-state IGST — the right
 * total with the wrong split, on documents customers claim input credit
 * against. A seeded org had no GSTIN at all, so no quotation could even be
 * produced.
 *
 * The state is DERIVED from the GSTIN here and on the server, never typed. The
 * first two characters of a GSTIN are its state code, and `validateGSTIN` covers
 * all 39 GST jurisdictions — 01–24 and 26–38 (25 was merged into 26 in 2020),
 * plus 97 Other Territory and 99 Centre Jurisdiction. No state or union
 * territory is left out, and none has to be maintained by hand.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, AlertTriangle, Star, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import { PageHeader } from "@/components/ui/page-header";
import { GSTIN_STATE_CODES } from "@coheronconnect/payroll-math";
import { cn } from "@/lib/utils";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * The state a GSTIN declares, or null. Mirrors `validateGSTIN` on the server so
 * the form can show the resolved state as the user types — the derivation is
 * visible, not a hidden server behaviour.
 */
function stateFromGstin(gstin: string): { code: string; name: string } | null {
    const cleaned = gstin.trim().toUpperCase();
    if (!GSTIN_RE.test(cleaned)) return null;
    const code = cleaned.slice(0, 2);
    const name = (GSTIN_STATE_CODES as Record<string, string>)[code];
    return name ? { code, name } : null;
}

const EMPTY_FORM = {
    gstin: "",
    legalName: "",
    tradeName: "",
    address: "",
    invoiceSeriesPrefix: "",
    isPrimary: false,
};

export default function GstinRegistrationsPage() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const [showNew, setShowNew] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    /**
     * A registration written on this screen immediately changes how every quote
     * and invoice is taxed, so the list must never render a pre-write answer.
     * The app-wide default is `staleTime: 10s` with `refetchOnMount: true`.
     */
    const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };
    const qList = trpc.accounting.gstin.list.useQuery(
        undefined,
        mergeTrpcQueryOpts("accounting.gstin.list", alwaysFresh),
    );

    const rows: any[] = (qList.data as any[]) ?? [];
    const derived = stateFromGstin(form.gstin);

    const mCreate = trpc.accounting.gstin.create.useMutation({
        onSuccess: (r: any) => {
            void qList.refetch();
            setForm(EMPTY_FORM);
            setShowNew(false);
            toast.success(
                `Registered ${r.gstin} — place of supply ${r.stateName ?? r.stateCode}. Quotes and invoices for this state will now be taxed CGST + SGST.`,
                { duration: 8_000 },
            );
        },
        onError: (e: any) => toast.error(e?.message ?? "Could not register the GSTIN", { duration: 10_000 }),
    });

    const mUpdate = trpc.accounting.gstin.update.useMutation({
        onSuccess: () => {
            void qList.refetch();
            toast.success("Registration updated");
        },
        onError: (e: any) => toast.error(e?.message ?? "Could not update the registration"),
    });

    const canSubmit = derived !== null && form.legalName.trim().length > 0 && !mCreate.isPending;

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="GST Registrations"
                subtitle="Your own GSTINs. The place of supply on every quote and invoice is read from the primary registration."
                icon={ShieldCheck}
                showBack={false}
                actions={
                    <PermissionGate module="financial" action="write">
                        <button
                            data-testid="gstin-new"
                            onClick={() => setShowNew((v) => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-body-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add GSTIN
                        </button>
                    </PermissionGate>
                }
            />

            {/* Nothing registered: say what breaks, not just that the table is empty. */}
            {!qList.isLoading && rows.length === 0 && (
                <div
                    data-testid="gstin-empty"
                    className="border border-amber-300 bg-amber-50 text-amber-900 rounded px-4 py-3 text-body-sm"
                >
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold">No GST registration on file.</p>
                            <p className="mt-1">
                                Until one is added this organisation has no place of supply, so quotations cannot be
                                generated and every sale is treated as inter-state (IGST) — the correct total with the
                                wrong split. Add the GSTIN you invoice from.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showNew && (
                <PermissionGate module="financial" action="write">
                    <div className="border border-border rounded-lg p-4 bg-card flex flex-col gap-3" data-testid="gstin-form">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    GSTIN *
                                </label>
                                <input
                                    data-testid="gstin-input"
                                    className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
                                    placeholder="29ABCDE1234F1Z5"
                                    value={form.gstin}
                                    onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                                />
                                {/* The derivation, shown as it happens. */}
                                {form.gstin.trim() !== "" && (
                                    <p
                                        data-testid="gstin-derived-state"
                                        className={cn(
                                            "mt-1 text-[11px] flex items-center gap-1",
                                            derived ? "text-green-700" : "text-amber-700",
                                        )}
                                    >
                                        <MapPin className="w-3 h-3" />
                                        {derived
                                            ? `Place of supply: ${derived.name} (${derived.code}) — taken from the GSTIN`
                                            : "Not a valid GSTIN, so no place of supply can be determined."}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    Legal name *
                                </label>
                                <input
                                    data-testid="gstin-legal-name"
                                    className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                                    placeholder="As registered with GST"
                                    value={form.legalName}
                                    onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    Trade name
                                </label>
                                <input
                                    className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                                    value={form.tradeName}
                                    onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    Invoice series prefix
                                </label>
                                <input
                                    className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
                                    placeholder="INV"
                                    value={form.invoiceSeriesPrefix}
                                    onChange={(e) => setForm((f) => ({ ...f, invoiceSeriesPrefix: e.target.value }))}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    Registered address
                                </label>
                                <input
                                    data-testid="gstin-address"
                                    className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                                    placeholder="Printed on quotations and invoices"
                                    value={form.address}
                                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <input
                                type="checkbox"
                                data-testid="gstin-primary"
                                checked={form.isPrimary}
                                onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                            />
                            Use as the primary registration (the one quotes and invoices are issued from)
                        </label>
                        <div className="flex gap-2">
                            <button
                                data-testid="gstin-save"
                                disabled={!canSubmit}
                                onClick={() =>
                                    mCreate.mutate({
                                        gstin: form.gstin.trim().toUpperCase(),
                                        legalName: form.legalName.trim(),
                                        tradeName: form.tradeName.trim() || undefined,
                                        address: form.address.trim() || undefined,
                                        invoiceSeriesPrefix: form.invoiceSeriesPrefix.trim() || undefined,
                                        isPrimary: form.isPrimary,
                                        // stateCode is deliberately NOT sent — the server derives it
                                        // from the GSTIN, and a supplied value that disagrees is rejected.
                                    })
                                }
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-body-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                            >
                                {mCreate.isPending ? "Registering…" : "Register GSTIN"}
                            </button>
                            <button
                                onClick={() => { setShowNew(false); setForm(EMPTY_FORM); }}
                                className="px-3 py-1.5 border border-border rounded text-body-sm hover:bg-muted/40"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </PermissionGate>
            )}

            {/*
              A plain titled section, NOT `ResourceView`.
              `ResourceView` is a render-prop boundary over a tRPC query
              (`children: (data: T) => ReactNode`) and it renders a NOT_FOUND
              ErrorState whenever the query resolves empty — which would replace
              the amber "No GST registration on file" banner above, and with it
              the `gstin-empty` hook that surfaces WHY an empty registry matters.
              This page already owns its loading and empty states, so the
              boundary has nothing to add here.
            */}
            <section aria-label="Registrations">
                <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Registrations <span className="text-foreground">({rows.length})</span>
                </h2>
                <table className="w-full text-body-sm" data-testid="gstin-table">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                            <th className="py-2">GSTIN</th>
                            <th>Legal name</th>
                            <th>Place of supply</th>
                            <th>Address</th>
                            <th>Status</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} className="border-b border-border/60" data-testid="gstin-row">
                                <td className="py-2 font-mono text-[12px]">{r.gstin}</td>
                                <td>{r.legalName}</td>
                                <td data-testid="gstin-row-state" data-state={r.stateCode}>
                                    {(GSTIN_STATE_CODES as Record<string, string>)[r.stateCode] ?? r.stateName ?? "—"}{" "}
                                    <span className="text-muted-foreground">({r.stateCode})</span>
                                </td>
                                <td className="text-muted-foreground">{r.address ?? "—"}</td>
                                <td>
                                    {r.isPrimary ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-100 rounded px-1.5 py-0.5 font-semibold">
                                            <Star className="w-3 h-3" /> Primary
                                        </span>
                                    ) : r.isActive === false ? (
                                        <span className="text-[11px] text-muted-foreground">Inactive</span>
                                    ) : (
                                        <span className="text-[11px] text-muted-foreground">Active</span>
                                    )}
                                </td>
                                <td className="text-right">
                                    {!r.isPrimary && (
                                        <PermissionGate module="financial" action="write">
                                            <button
                                                data-testid="gstin-make-primary"
                                                onClick={() => mUpdate.mutate({ id: r.id, isPrimary: true })}
                                                className="text-[11px] text-primary hover:underline"
                                            >
                                                Make primary
                                            </button>
                                        </PermissionGate>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
