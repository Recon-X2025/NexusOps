"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    TrendingUp, Building2, Users, Calendar, DollarSign,
    Trash2, Edit3, CheckCircle2, Activity, MessageSquare, X
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate, useRBAC } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";
import { ResourceView } from "@/components/ui/resource-view";
import { PageHeader } from "@/components/ui/page-header";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

const STAGE_CFG: Record<string, { label: string; color: string }> = {
    prospect: { label: "Prospect", color: "text-muted-foreground bg-muted" },
    qualification: { label: "Qualification", color: "text-blue-700 bg-blue-100" },
    proposal: { label: "Proposal", color: "text-indigo-700 bg-indigo-100" },
    negotiation: { label: "Negotiation", color: "text-purple-700 bg-purple-100" },
    verbal_commit: { label: "Verbal Commit", color: "text-orange-700 bg-orange-100" },
    closed_won: { label: "Closed Won", color: "text-green-700 bg-green-100" },
    closed_lost: { label: "Closed Lost", color: "text-red-700 bg-red-100" },
};

function dealCloseTierClient(value: number, low: number, execAbove: number): "none" | "manager" | "executive" {
    if (value < low) return "none";
    if (value >= execAbove) return "executive";
    return "manager";
}

export default function DealDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { isAdmin } = useRBAC();

    const qDeal = trpc.crm.getDeal.useQuery({ id });
    const qActivities = trpc.crm.listActivities.useQuery({ dealId: id });

    const qAccounts = trpc.crm.listAccounts.useQuery({ limit: 200 });
    const qContacts = trpc.crm.listContacts.useQuery({ limit: 200 });

    const movePipeline = trpc.crm.movePipeline.useMutation({
        onSuccess: () => { toast.success("Deal stage updated"); qDeal.refetch(); },
        onError: (e) => toast.error(e.message),
    });

    const dealThresholdsQ = trpc.crm.dealApprovalThresholds.get.useQuery(undefined, { refetchOnWindowFocus: false });

    const approveDealWon = trpc.crm.approveDealWon.useMutation({
        onSuccess: () => {
            toast.success("Deal close approval recorded");
            qDeal.refetch();
        },
        onError: (e: any) => toast.error(e?.message ?? "Approval failed"),
    });

    const updateDeal = trpc.crm.updateDeal.useMutation({
        onSuccess: () => { toast.success("Deal updated successfully"); qDeal.refetch(); setShowEdit(false); },
        onError: (e: any) => toast.error(e.message),
    });

    const deleteDeal = trpc.crm.deleteDeal.useMutation({
        onSuccess: () => { toast.success("Deal deleted"); router.push("/app/crm"); },
        onError: (e) => toast.error(e.message),
    });

    const [showEdit, setShowEdit] = useState(false);
    const [editForm, setEditForm] = useState({
        title: "", value: "", probability: "30", expectedClose: "", accountId: "", contactId: ""
    });

    useEffect(() => {
        if (qDeal.data) {
            setEditForm({
                title: qDeal.data.title || "",
                value: qDeal.data.value ? String(qDeal.data.value) : "",
                probability: String(qDeal.data.probability || 30),
                expectedClose: qDeal.data.expectedClose ? new Date(qDeal.data.expectedClose).toISOString().substring(0, 10) : "",
                accountId: qDeal.data.accountId || "",
                contactId: qDeal.data.contactId || "",
            });
        }
    }, [qDeal.data]);

    return (
        <ResourceView query={qDeal} resourceName="Deal" backHref="/app/crm">
            {(deal) => {
                const stage = STAGE_CFG[deal.stage] || { label: deal.stage, color: "bg-muted" };

                const stageBadge = (
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", stage.color)}>
                        {stage.label}
                    </span>
                );

                const actions = (
                    <PermissionGate module="accounts" action="write">
                        <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors">
                            <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                            onClick={() => { if (confirm("Are you sure you want to delete this deal?")) deleteDeal.mutate({ id }); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded text-body-sm font-medium hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Delete
                        </button>
                    </PermissionGate>
                );

                const activityItems: TimelineItem[] = (qActivities.data ?? []).map((a: any) => ({
                    id: a.id,
                    icon: MessageSquare,
                    title: a.subject,
                    subtitle: a.description,
                    timestamp: a.createdAt,
                    tags: [a.type, a.outcome && `Outcome: ${a.outcome}`].filter(Boolean) as string[],
                }));

                return (
                    <div className="flex flex-col gap-6 p-6">
                        {showEdit && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                                <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-[13px] font-semibold">Edit Deal</h3>
                                        <button onClick={() => setShowEdit(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deal Title *</label>
                                            <input autoFocus className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account *</label>
                                            <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.accountId} onChange={(e) => setEditForm(f => ({ ...f, accountId: e.target.value, contactId: "" }))}>
                                                <option value="">— Select account —</option>
                                                {(qAccounts.data ?? []).map((a: any) => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contact *</label>
                                            <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.contactId} onChange={(e) => setEditForm(f => ({ ...f, contactId: e.target.value }))}>
                                                <option value="">— Select contact —</option>
                                                {(qContacts.data ?? [])
                                                    .filter((c: any) => !editForm.accountId || c.accountId === editForm.accountId)
                                                    .map((c: any) => (
                                                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                                                    ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Value (₹) *</label>
                                            <input type="number" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.value} onChange={(e) => setEditForm(f => ({ ...f, value: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Probability (%) *</label>
                                            <input type="number" min="0" max="100" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.probability} onChange={(e) => setEditForm(f => ({ ...f, probability: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expected Close Date *</label>
                                            <input type="date" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={editForm.expectedClose} onChange={(e) => setEditForm(f => ({ ...f, expectedClose: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button
                                            disabled={!editForm.title || !editForm.accountId || !editForm.contactId || !editForm.value || !editForm.probability || !editForm.expectedClose || updateDeal.isPending}
                                            onClick={() => updateDeal.mutate({
                                                id,
                                                title: editForm.title,
                                                accountId: editForm.accountId || undefined,
                                                contactId: editForm.contactId || undefined,
                                                value: editForm.value || undefined,
                                                probability: Number(editForm.probability) || 30,
                                                expectedClose: editForm.expectedClose || undefined,
                                            })}
                                            className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {updateDeal.isPending ? "Saving…" : "Save Changes"}
                                        </button>
                                        <button onClick={() => setShowEdit(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <PageHeader
                            icon={TrendingUp}
                            title={deal.title}
                            subtitle={`${deal.accountId?.slice(0, 8) ?? "No Account"} · ${deal.contactId?.slice(0, 8) ?? "No Contact"}`}
                            badge={stageBadge}
                            actions={actions}
                            backHref="/app/crm"
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Deal Info */}
                            <div className="lg:col-span-1 space-y-6">
                                {/* Deal Financials */}
                                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                                    <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest">Deal Financials</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide">Deal Value</p>
                                            <p className="text-h3 font-bold text-foreground">₹{Number(deal.value).toLocaleString()}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide">Probability</p>
                                                <p className="text-body-lg font-semibold text-foreground">{deal.probability}%</p>
                                            </div>
                                            <div>
                                                <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide">Weighted Value</p>
                                                <p className="text-body-lg font-semibold text-primary">₹{Number(deal.weightedValue).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide">Expected Close</p>
                                            <p className="text-body-sm font-medium text-foreground flex items-center gap-2 mt-1">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                {deal.expectedClose ? new Date(deal.expectedClose).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Pipeline Stage Selector */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest mb-4">Pipeline Stage</h3>
                                    <div className="space-y-2">
                                        {(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"] as const).map((s) => {
                                            const isClosedWon = deal.stage === "closed_won";
                                            const isActiveStage = ["prospect", "qualification", "proposal", "negotiation", "verbal_commit"].includes(s);
                                            const isRestricted = isClosedWon && isActiveStage;
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => movePipeline.mutate({ id, stage: s })}
                                                    disabled={movePipeline.isPending || deal.stage === s || isRestricted}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-body-sm transition-colors",
                                                        deal.stage === s ? cn("font-bold", STAGE_CFG[s]?.color) : "hover:bg-muted text-muted-foreground",
                                                        isRestricted && "opacity-50 cursor-not-allowed"
                                                    )}
                                                    title={isRestricted ? "Cannot move a Closed Won deal back to an active stage" : undefined}
                                                >
                                                    {STAGE_CFG[s]?.label}
                                                    {deal.stage === s && <CheckCircle2 className="w-4 h-4" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {(() => {
                                        const mv = Number(deal.value ?? 0);
                                        const low = dealThresholdsQ.data?.dealCloseNoApprovalBelow ?? 500000;
                                        const execAbove = dealThresholdsQ.data?.dealCloseExecutiveAbove ?? 5000000;
                                        const needTier = dealCloseTierClient(mv, low, execAbove);
                                        const pendingApproval = needTier !== "none" && !deal.wonApprovedAt;

                                        if (!pendingApproval) return null;

                                        return (
                                            <div className="mt-4 rounded border border-amber-200 bg-amber-50/80 px-3 py-3 text-caption text-amber-900">
                                                <div className="font-semibold mb-1">Closed-won approval required</div>
                                                <div className="opacity-90 mb-3">
                                                    This deal value ({dealThresholdsQ.data?.dealApprovalCurrency ?? "INR"} {mv.toLocaleString()}) requires <strong>{needTier === "executive" ? "executive" : "manager"}</strong> approval before it can be moved to Closed Won.
                                                </div>
                                                {isAdmin() ? (
                                                    <div className="flex flex-col gap-2">
                                                        {needTier === "manager" && (
                                                            <button
                                                                onClick={() => approveDealWon.mutate({ id, tier: "manager" })}
                                                                disabled={approveDealWon.isPending}
                                                                className="px-3 py-1.5 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 text-left w-fit transition-colors"
                                                            >
                                                                Record manager approval
                                                            </button>
                                                        )}
                                                        {needTier === "executive" && (
                                                            <button
                                                                onClick={() => approveDealWon.mutate({ id, tier: "executive" })}
                                                                disabled={approveDealWon.isPending}
                                                                className="px-3 py-1.5 rounded bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-50 text-left w-fit transition-colors"
                                                            >
                                                                Record executive approval
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="opacity-80">Ask an admin to record approval.</div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Right Column: Activities & Details */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Deal Overview */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest mb-4">Deal Overview</h3>
                                    <div className="prose prose-sm max-w-none text-muted-foreground">
                                        {(deal as any).description || "No description provided for this deal."}
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-border">
                                        <div>
                                            <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide mb-2">Deal Owner</p>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                    {deal.ownerId.slice(0, 2).toUpperCase()}
                                                </div>
                                                <span className="text-body-sm font-medium">{deal.ownerId.slice(0, 8)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-caption text-muted-foreground uppercase font-medium tracking-wide mb-2">Source</p>
                                            <span className="text-body-sm font-medium">{(deal as any).source || "Direct"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Activity Timeline */}
                                <Timeline
                                    items={activityItems}
                                    isLoading={qActivities.isLoading}
                                    emptyMessage="No activities logged for this deal yet."
                                    emptyIcon={Activity}
                                    header={
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest">Activity Timeline</h3>
                                            <button className="text-caption text-primary font-bold hover:underline">+ Log Activity</button>
                                        </div>
                                    }
                                />
                            </div>
                        </div>
                    </div>
                );
            }}
        </ResourceView>
    );
}
