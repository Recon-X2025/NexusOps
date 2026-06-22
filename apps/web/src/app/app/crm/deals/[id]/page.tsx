"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    TrendingUp, Building2, Users, Calendar, DollarSign,
    Trash2, Edit3, CheckCircle2, Activity, MessageSquare,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate } from "@/lib/rbac-context";
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

export default function DealDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const qDeal = trpc.crm.getDeal.useQuery({ id });
    const qActivities = trpc.crm.listActivities.useQuery({ dealId: id });

    const movePipeline = trpc.crm.movePipeline.useMutation({
        onSuccess: () => { toast.success("Deal stage updated"); qDeal.refetch(); },
        onError: (e) => toast.error(e.message),
    });

    const deleteDeal = trpc.crm.deleteDeal.useMutation({
        onSuccess: () => { toast.success("Deal deleted"); router.push("/app/crm"); },
        onError: (e) => toast.error(e.message),
    });

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
                        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors">
                            <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                            onClick={() => { if (confirm("Are you sure you want to delete this deal?")) deleteDeal.mutate({ id }); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm font-medium hover:bg-red-50 transition-colors"
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
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Deal Financials</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">Deal Value</p>
                                            <p className="text-2xl font-bold text-foreground">₹{Number(deal.value).toLocaleString()}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">Probability</p>
                                                <p className="text-lg font-semibold text-foreground">{deal.probability}%</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">Weighted Value</p>
                                                <p className="text-lg font-semibold text-primary">₹{Number(deal.weightedValue).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">Expected Close</p>
                                            <p className="text-sm font-medium text-foreground flex items-center gap-2 mt-1">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                {new Date(deal.expectedClose).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Pipeline Stage Selector */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Pipeline Stage</h3>
                                    <div className="space-y-2">
                                        {(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"] as const).map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => movePipeline.mutate({ id, stage: s })}
                                                disabled={movePipeline.isPending || deal.stage === s}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                                                    deal.stage === s ? cn("font-bold", STAGE_CFG[s].color) : "hover:bg-muted text-muted-foreground"
                                                )}
                                            >
                                                {STAGE_CFG[s].label}
                                                {deal.stage === s && <CheckCircle2 className="w-4 h-4" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Activities & Details */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Deal Overview */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Deal Overview</h3>
                                    <div className="prose prose-sm max-w-none text-muted-foreground">
                                        {(deal as any).description || "No description provided for this deal."}
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-border">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-2">Deal Owner</p>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                    {deal.ownerId.slice(0, 2).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium">{deal.ownerId.slice(0, 8)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-2">Source</p>
                                            <span className="text-sm font-medium">{(deal as any).source || "Direct"}</span>
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
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Activity Timeline</h3>
                                            <button className="text-xs text-primary font-bold hover:underline">+ Log Activity</button>
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
