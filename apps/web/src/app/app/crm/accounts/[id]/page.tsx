"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Building2, Users, TrendingUp, Activity, Phone, Mail, Globe,
    MapPin, Calendar, Plus, Trash2, Edit3, ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";
import { ResourceView } from "@/components/ui/resource-view";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, type FieldDef } from "@/components/ui/detail-grid";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const qAccount = trpc.crm.getAccount.useQuery({ id });
    const qContacts = trpc.crm.listContacts.useQuery({ accountId: id });
    const qDeals = trpc.crm.listDeals.useQuery({ accountId: id });
    const qActivities = trpc.crm.listActivities.useQuery({ limit: 50 });

    const deleteAccount = trpc.crm.deleteAccount.useMutation({
        onSuccess: () => {
            toast.success("Account deleted");
            router.push("/app/crm");
        },
        onError: (e: any) => toast.error(e.message),
    });

    return (
        <ResourceView
            query={qAccount}
            resourceName="Account"
            backHref="/app/crm"
        >
            {(account) => {
                const accountFields: FieldDef[] = [
                    { label: "Website", icon: Globe, value: account.website?.replace(/^https?:\/\//, "") ?? "—", href: account.website ?? undefined },
                    { label: "Employees", icon: Users, value: account.employees?.toLocaleString() ?? "—" },
                    { label: "Annual Revenue", icon: TrendingUp, value: `₹${((account.annualRevenue ?? 0) / 10000000).toFixed(1)} Cr` },
                    {
                        type: "progress" as const,
                        label: "Health Score",
                        icon: Activity,
                        value: account.healthScore ?? 0,
                    },
                    { label: "Industry", icon: MapPin, value: account.industry ?? "—" },
                    { label: "Country", icon: MapPin, value: account.country ?? "—" },
                ];

                const tierBadge = (
                    <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                        account.tier === "enterprise" ? "bg-purple-100 text-purple-700" :
                            account.tier === "mid_market" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                    )}>
                        {account.tier.replace("_", " ")}
                    </span>
                );

                const actions = (
                    <PermissionGate module="accounts" action="write">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors">
                            <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Are you sure you want to delete this account?")) {
                                    deleteAccount.mutate({ id });
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm font-medium hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Delete
                        </button>
                    </PermissionGate>
                );

                const activityItems: TimelineItem[] = (qActivities.data ?? []).slice(0, 5).map((a: any) => ({
                    id: a.id,
                    icon: Activity,
                    title: a.subject,
                    subtitle: a.description ?? "No description provided.",
                    timestamp: a.createdAt,
                    tags: [a.type, `Logged by ${a.ownerId.slice(0, 8)}`],
                }));

                return (
                    <div className="flex flex-col gap-6 p-6">
                        <PageHeader
                            icon={Building2}
                            title={account.name}
                            subtitle={`${account.industry ?? ""} · ${account.country ?? ""}`}
                            badge={tierBadge}
                            actions={actions}
                            backHref="/app/crm"
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Info & Stats */}
                            <div className="lg:col-span-1 space-y-6">
                                <DetailGrid title="Account Details" fields={accountFields} />

                                {/* Contacts Card */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Contacts</h3>
                                    <div className="space-y-3">
                                        {qContacts.data?.map((contact: any) => (
                                            <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                        {contact.firstName[0]}{contact.lastName[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{contact.firstName} {contact.lastName}</p>
                                                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="p-1.5 hover:bg-white rounded border border-transparent hover:border-border"><Mail className="w-3.5 h-3.5" /></button>
                                                    <button className="p-1.5 hover:bg-white rounded border border-transparent hover:border-border"><Phone className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </div>
                                        ))}
                                        <button className="w-full mt-2 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                                            + Add Contact
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Deals & Timeline */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Active Deals */}
                                <div className="bg-card border border-border rounded-xl overflow-hidden">
                                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Deals</h3>
                                        <button className="text-xs text-primary font-bold hover:underline">+ New Deal</button>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {qDeals.data?.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage)).map((deal: any) => (
                                            <div key={deal.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between cursor-pointer" onClick={() => router.push(`/app/crm/deals/${deal.id}`)}>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-mono text-muted-foreground">{deal.number}</span>
                                                        <p className="text-sm font-semibold">{deal.title}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {deal.stage.replace("_", " ")}</span>
                                                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Closes {new Date(deal.expectedClose).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold">₹{(Number(deal.value) / 1000).toFixed(0)}K</p>
                                                    <p className="text-[10px] text-muted-foreground">{deal.probability}% Probability</p>
                                                </div>
                                            </div>
                                        ))}
                                        {qDeals.data?.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage)).length === 0 && (
                                            <div className="p-8 text-center text-sm text-muted-foreground">No active deals for this account.</div>
                                        )}
                                    </div>
                                </div>

                                {/* Activity Timeline */}
                                <Timeline
                                    items={activityItems}
                                    isLoading={qActivities.isLoading}
                                    emptyMessage="No activities logged for this account yet."
                                    emptyIcon={Activity}
                                    header={
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recent Activity</h3>
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
