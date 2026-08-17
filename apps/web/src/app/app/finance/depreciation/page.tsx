"use client";

/**
 * Fixed-asset depreciation — `depreciation.*` given a screen.
 *
 * The engine (SLM / WDV / Schedule II, with a balanced Dr 5500 / Cr 1290 GL
 * posting) has been correct and unreachable: no route, no nav, no caller
 * anywhere in the web app. The 15 August audit put it at 10%.
 *
 * Two things this screen refuses to do:
 *
 *  1. **Post without showing what will post.** The Run control is a two-step:
 *     the preview lists every enrolled asset with the charge it would take and
 *     WHY it is or is not included, and only then does the button post. An
 *     accountant does not press a button that silently writes to the ledger.
 *  2. **Present zeroes as a schedule.** A fresh tenant has no assets enrolled;
 *     it gets an empty state that says so, not a register of ₹0.00 rows.
 *
 * NOTE ON THE PERIOD. The engine's period is a YEAR — `usefulLifeYears`, and
 * SLM charges `(cost − salvage) / life` per period. There is no monthly charge
 * to render, so this screen talks in financial years, and says so.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    TrendingDown, AlertTriangle, CheckCircle2, PlayCircle, Info, Clock, Boxes,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { formatStatementInr } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/** India FY containing `d`, as the API formats it (`2026-2027`). */
function currentFyKey(d = new Date()): string {
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-${y + 1}`;
}

const STATUS_STYLE: Record<string, { cls: string; label: string; hint: string }> = {
    postable: {
        cls: "text-red-700 bg-red-100 font-semibold",
        label: "will post",
        hint: "This charge will be written to the ledger when you run.",
    },
    already_charged: {
        cls: "text-green-700 bg-green-100",
        label: "already charged",
        hint: "This financial year is already in the ledger — running again posts nothing.",
    },
    not_due: {
        cls: "text-muted-foreground bg-muted",
        label: "not due",
        hint: "The next period falls in a later financial year.",
    },
    fully_depreciated: {
        cls: "text-slate-600 bg-slate-100",
        label: "fully depreciated",
        hint: "Book value has reached salvage; there is nothing left to charge.",
    },
};

export default function DepreciationPage() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const [fy, setFy] = useState(currentFyKey());
    const [enrolFor, setEnrolFor] = useState("");
    const [enrolForm, setEnrolForm] = useState({ method: "SLM", usefulLifeYears: "5", salvageValue: "0" });

    /**
     * A register whose figures move when you press a button must never be read
     * from cache — the app-wide default is a 10 s stale window, which showed
     * pre-mutation figures on both prior rounds' screens.
     */
    const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };

    const qRegister = trpc.depreciation.register.useQuery(
        {},
        mergeTrpcQueryOpts("depreciation.register", alwaysFresh),
    );
    const qPreview = trpc.depreciation.preview.useQuery(
        { throughFinancialYear: fy },
        mergeTrpcQueryOpts("depreciation.preview", alwaysFresh),
    );
    const qAutoRun = trpc.depreciation.autoRun.useQuery(
        undefined,
        mergeTrpcQueryOpts("depreciation.autoRun", alwaysFresh),
    );
    // `assets.list` caps `limit` at 100 and returns `{ items, nextCursor }`,
    // NOT a bare array. Passing 200 fails zod (the query errors and the picker
    // is silently empty); reading `data` as an array yields undefined names.
    const qAssets = trpc.assets.list.useQuery(
        { limit: 100 },
        mergeTrpcQueryOpts("assets.list", { refetchOnWindowFocus: false }),
    );
    const assetList: any[] = (qAssets.data as any)?.items ?? [];

    const refetchAll = () => {
        void qRegister.refetch();
        void qPreview.refetch();
        void qAutoRun.refetch();
    };

    const mRunAll = trpc.depreciation.runAll.useMutation({
        onSuccess: (r: any) => {
            refetchAll();
            if (r.charged === 0) {
                toast.info("Nothing was due — no depreciation posted.");
            } else {
                toast.success(
                    `Posted ${r.charged} period${r.charged === 1 ? "" : "s"} across ${r.assetsTouched} asset${r.assetsTouched === 1 ? "" : "s"} — ${formatStatementInr(r.totalDepreciation)}`,
                );
            }
            if (r.failures?.length) {
                toast.error(`${r.failures.length} asset(s) could not be charged — see the register.`);
            }
            // A charge that records but never posts is the dangerous case: book
            // value drops, the register reads settled, and the ledger never
            // moved. The API reports it rather than swallowing it; say so here
            // instead of showing an unqualified success.
            if (r.unposted > 0) {
                toast.error(
                    `${r.unposted} charge(s) were recorded but did NOT reach the ledger — accounts 5500 (Depreciation) and 1290 (Accumulated Depreciation) are missing from the chart of accounts. The balance sheet and P&L will not show them.`,
                    { duration: 12_000 },
                );
            }
        },
        onError: (e: any) => toast.error(e?.message ?? "Depreciation run failed"),
    });

    /**
     * Enrolment lives here rather than on the asset screen: useful life, method
     * and salvage are accounting decisions, and without a control for them the
     * register can never acquire a row — the screen would be a permanently
     * empty table over a working engine.
     */
    const mSetup = trpc.depreciation.setup.useMutation({
        onSuccess: () => {
            refetchAll();
            setEnrolFor("");
            toast.success("Asset enrolled for depreciation");
        },
        onError: (e: any) => toast.error(e?.message ?? "Could not enrol the asset"),
    });

    const mSetAutoRun = trpc.depreciation.setAutoRun.useMutation({
        onSuccess: (r: any) => {
            void qAutoRun.refetch();
            toast.success(r.enabled ? "Monthly run enabled" : "Monthly run turned off");
        },
        onError: (e: any) => toast.error(e?.message ?? "Could not change the setting"),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetName = (id: string): string => assetList.find((x) => x.id === id)?.name ?? "—";

    const preview = qPreview.data;
    const previewByAsset = new Map<string, any>((preview?.items ?? []).map((i: any) => [i.assetId, i]));
    const enrolledIds = new Set<string>(
        (((qRegister.data as any)?.items ?? []) as any[]).map((r) => r.assetId),
    );

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Depreciation"
                subtitle="Fixed-asset register, book values, and the period charge posted to the ledger. Charges are annual — one per financial year."
                icon={TrendingDown}
                showBack={false}
                actions={
                    <Link
                        href="/app/finance/accounting/balance-sheet"
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors"
                    >
                        Balance Sheet
                    </Link>
                }
            />

            {/* ── The month-end job: state, and the switch ────────────────── */}
            <div className="flex flex-wrap items-center gap-3 bg-card border border-border p-4 rounded-xl">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-[16rem]">
                    <p className="text-body-sm font-medium text-foreground">
                        Automatic month-end run —{" "}
                        <span data-testid="depr-autorun-state" className={qAutoRun.data?.enabled ? "text-green-700" : "text-muted-foreground"}>
                            {qAutoRun.data?.enabled ? "on" : "off"}
                        </span>
                    </p>
                    <p className="text-caption text-muted-foreground mt-0.5">
                        {qAutoRun.data?.lastRunAt
                            ? `Last posted ${new Date(qAutoRun.data.lastRunAt as string).toLocaleString("en-IN")} — ${String((qAutoRun.data.lastRun as any)?.periodsCharged ?? 0)} period(s), ${formatStatementInr(Number((qAutoRun.data.lastRun as any)?.totalDepreciation ?? 0))}.`
                            : "Has not posted anything yet. When on, it runs with the monthly sweep and charges only financial years that have fully ended."}
                    </p>
                </div>
                <PermissionGate module="cmdb" action="write">
                    <button
                        data-testid="depr-autorun-toggle"
                        onClick={() => mSetAutoRun.mutate({ enabled: !qAutoRun.data?.enabled })}
                        disabled={mSetAutoRun.isPending}
                        className="px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {qAutoRun.data?.enabled ? "Turn off" : "Turn on"}
                    </button>
                </PermissionGate>
            </div>

            {/* ── Enrol an asset ─────────────────────────────────────────── */}
            <PermissionGate module="cmdb" action="write">
                <div className="flex flex-wrap items-end gap-3 bg-card border border-border p-4 rounded-xl">
                    <div className="space-y-1.5 flex-1 min-w-[14rem]">
                        <label htmlFor="depr-asset" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Enrol an asset
                        </label>
                        <select
                            id="depr-asset"
                            data-testid="depr-enrol-asset"
                            value={enrolFor}
                            onChange={(e) => setEnrolFor(e.target.value)}
                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-body-sm focus:ring-1 focus:ring-primary outline-none"
                        >
                            <option value="">Select an asset…</option>
                            {assetList
                                .filter((a) => !enrolledIds.has(a.id))
                                .map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                        {a.purchaseCost ? ` — ${formatStatementInr(Number(a.purchaseCost))}` : " — no cost recorded"}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="depr-method" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Method</label>
                        <select
                            id="depr-method"
                            data-testid="depr-enrol-method"
                            value={enrolForm.method}
                            onChange={(e) => setEnrolForm((f) => ({ ...f, method: e.target.value }))}
                            className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-body-sm outline-none"
                        >
                            <option value="SLM">Straight line</option>
                            <option value="WDV">Written-down value</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="depr-life" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Life (years)</label>
                        <input
                            id="depr-life"
                            data-testid="depr-enrol-life"
                            type="number"
                            min={1}
                            value={enrolForm.usefulLifeYears}
                            onChange={(e) => setEnrolForm((f) => ({ ...f, usefulLifeYears: e.target.value }))}
                            className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-body-sm w-24 outline-none"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="depr-salvage" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Salvage (₹)</label>
                        <input
                            id="depr-salvage"
                            data-testid="depr-enrol-salvage"
                            type="number"
                            min={0}
                            value={enrolForm.salvageValue}
                            onChange={(e) => setEnrolForm((f) => ({ ...f, salvageValue: e.target.value }))}
                            className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-body-sm w-32 outline-none"
                        />
                    </div>
                    <button
                        data-testid="depr-enrol-submit"
                        disabled={!enrolFor || mSetup.isPending || !Number(enrolForm.usefulLifeYears)}
                        onClick={() =>
                            mSetup.mutate({
                                assetId: enrolFor,
                                method: enrolForm.method as "SLM" | "WDV",
                                usefulLifeYears: Number(enrolForm.usefulLifeYears),
                                salvageValue: Number(enrolForm.salvageValue || 0),
                            })
                        }
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-body-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                    >
                        {mSetup.isPending ? "Enrolling…" : "Enrol"}
                    </button>
                </div>
            </PermissionGate>

            {/* ── Preview, then post ─────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/40 flex flex-wrap items-end gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="depr-fy" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Financial year
                        </label>
                        <input
                            id="depr-fy"
                            data-testid="depr-fy"
                            value={fy}
                            onChange={(e) => setFy(e.target.value)}
                            placeholder="2026-2027"
                            className="px-3 py-2 bg-background border border-border rounded-lg text-body-sm w-40 focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="flex-1 min-w-[14rem]">
                        <p data-testid="depr-preview-summary" className="text-body-sm text-foreground">
                            {preview
                                ? preview.postableCount === 0
                                    ? "Nothing to post for this financial year."
                                    : `${preview.postableCount} asset${preview.postableCount === 1 ? "" : "s"} will be charged ${formatStatementInr(preview.totalDepreciation)}.`
                                : "…"}
                        </p>
                        <p className="text-caption text-muted-foreground mt-0.5">
                            Reviewed before anything is written. Running is idempotent — a
                            financial year already charged posts nothing.
                        </p>
                    </div>
                    <PermissionGate module="cmdb" action="write">
                        <button
                            data-testid="depr-run"
                            onClick={() => mRunAll.mutate({ throughFinancialYear: fy })}
                            disabled={mRunAll.isPending || !preview || preview.postableCount === 0}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-body-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                        >
                            <PlayCircle className="w-4 h-4" />
                            {mRunAll.isPending ? "Posting…" : `Post ${fy}`}
                        </button>
                    </PermissionGate>
                </div>

                <ResourceView query={qRegister} resourceName="Depreciation register">
                    {(reg) => {
                        const rows = (reg as any).items as any[];

                        if (rows.length === 0) {
                            return (
                                <div data-testid="depr-empty" className="text-center py-12 px-6 space-y-3">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                        <Boxes className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                    <h3 className="text-body-lg font-bold text-foreground">
                                        No assets are enrolled for depreciation
                                    </h3>
                                    <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
                                        This is an empty register, not a company whose assets are worth
                                        nothing. Add a fixed asset with a purchase cost and date under
                                        Asset Management, then enrol it here with a method and useful
                                        life.
                                    </p>
                                    <Link
                                        href="/app/ham"
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-body-sm font-medium hover:bg-primary/90"
                                    >
                                        Go to Asset Management
                                    </Link>
                                </div>
                            );
                        }

                        return (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest">Asset</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest w-20">Method</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-center w-24">Life (yrs)</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right w-36">Cost</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right w-40">Accumulated</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right w-36">This charge</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right w-36">Net book value</th>
                                                <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest w-40">For {fy}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {rows.map((r) => {
                                                const p = previewByAsset.get(r.assetId);
                                                const style = STATUS_STYLE[p?.status ?? "not_due"]!;
                                                return (
                                                    <tr
                                                        key={r.id}
                                                        data-testid={`depr-row-${r.assetId}`}
                                                        className={cn(p?.status === "postable" && "bg-red-50/30")}
                                                    >
                                                        <td className="px-4 py-2.5 text-body-sm font-medium text-foreground">
                                                            {assetName(r.assetId)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-body-sm text-muted-foreground">{r.method}</td>
                                                        <td className="px-4 py-2.5 text-center font-mono text-body-sm text-muted-foreground">
                                                            {r.usefulLifeYears}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-mono text-body-sm">
                                                            {formatStatementInr(Number(r.cost))}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-mono text-body-sm">
                                                            {formatStatementInr(Number(r.accumulatedDepreciation))}
                                                        </td>
                                                        <td
                                                            data-testid={`depr-charge-${r.assetId}`}
                                                            className={cn(
                                                                "px-4 py-2.5 text-right font-mono text-body-sm",
                                                                p?.status === "postable" && "font-bold text-red-700",
                                                            )}
                                                        >
                                                            {p?.status === "postable"
                                                                ? formatStatementInr(p.depreciation)
                                                                : "—"}
                                                        </td>
                                                        <td
                                                            data-testid={`depr-nbv-${r.assetId}`}
                                                            className="px-4 py-2.5 text-right font-mono text-body-sm font-bold"
                                                        >
                                                            {formatStatementInr(Number(r.bookValue))}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <span
                                                                title={style.hint}
                                                                className={cn("status-badge px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", style.cls)}
                                                            >
                                                                {style.label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-border bg-muted/40">
                                                <td colSpan={3} className="px-4 py-3 text-body-sm font-bold uppercase tracking-wider">
                                                    Total
                                                </td>
                                                <td data-testid="depr-total-cost" className="px-4 py-3 text-right font-mono text-body-sm font-bold">
                                                    {formatStatementInr((reg as any).totalCost)}
                                                </td>
                                                <td data-testid="depr-total-accum" className="px-4 py-3 text-right font-mono text-body-sm font-bold">
                                                    {formatStatementInr((reg as any).totalAccumulated)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-body-sm font-bold">
                                                    {preview ? formatStatementInr(preview.totalDepreciation) : "—"}
                                                </td>
                                                <td data-testid="depr-total-nbv" className="px-4 py-3 text-right font-mono text-body-sm font-bold">
                                                    {formatStatementInr((reg as any).totalBookValue)}
                                                </td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <div className="px-4 py-3 border-t border-border space-y-1.5">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        How these figures were built
                                    </p>
                                    <p className="text-caption text-muted-foreground">
                                        Cost, method and useful life come from the asset&apos;s enrolment.
                                        Accumulated depreciation and net book value are maintained on the
                                        register as each period is charged. <strong>The period is a
                                        financial year</strong>, not a month — straight-line charges
                                        (cost − salvage) ÷ life each year, written-down-value charges a
                                        derived rate on the opening book value, and the final period is
                                        trued up so the closing value lands exactly on salvage. Every
                                        charge posts a balanced journal entry — debit Depreciation
                                        Expense (5500), credit Accumulated Depreciation (1290) — so it
                                        appears on the{" "}
                                        <Link href="/app/finance/accounting/pnl" className="text-primary hover:underline">
                                            Profit &amp; Loss
                                        </Link>{" "}
                                        and nets down assets on the{" "}
                                        <Link href="/app/finance/accounting/balance-sheet" className="text-primary hover:underline">
                                            Balance Sheet
                                        </Link>
                                        .
                                    </p>
                                </div>
                            </>
                        );
                    }}
                </ResourceView>
            </div>

            {/* Failures from the last manual run, if any. */}
            {mRunAll.data && (mRunAll.data as any).failures?.length > 0 && (
                <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
                    <p className="flex items-center gap-2 text-body-sm font-bold text-red-800">
                        <AlertTriangle className="w-4 h-4" />
                        {(mRunAll.data as any).failures.length} asset(s) could not be charged
                    </p>
                    <p className="text-caption text-red-800 mt-1">
                        The rest of the run was posted — charging is transactional per asset, so
                        one failure does not roll back the others. Re-running picks up only what
                        is still owed.
                    </p>
                </div>
            )}

            {mRunAll.data && (mRunAll.data as any).charged > 0 && !(mRunAll.data as any).failures?.length && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
                    <p className="text-body-sm text-green-800">
                        Posted {(mRunAll.data as any).charged} period(s) —{" "}
                        {formatStatementInr((mRunAll.data as any).totalDepreciation)} to Depreciation
                        Expense.
                    </p>
                </div>
            )}

            <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Depreciation is charged per financial year. An asset acquired part-way
                through a year still takes a full year&apos;s charge — the engine does not
                prorate by acquisition date.
            </p>
        </div>
    );
}
