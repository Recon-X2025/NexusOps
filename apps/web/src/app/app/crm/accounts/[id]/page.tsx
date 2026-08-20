"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Building2, TrendingUp, Activity, Phone, Mail, Globe,
    MapPin, Calendar, Plus, Trash2, Edit3, ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";
import { ResourceView } from "@/components/ui/resource-view";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, type FieldDef } from "@/components/ui/detail-grid";
import { CrmActivityTimeline } from "@/components/crm/activity-timeline";

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const qAccount = trpc.crm.accounts.get.useQuery({ id });
    const qContacts = trpc.crm.contacts.list.useQuery({ accountId: id });
    const qDeals = trpc.crm.deals.list.useQuery({ accountId: id });
    const deleteAccount = trpc.crm.accounts.delete.useMutation({
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
                    { label: "Annual Revenue", icon: TrendingUp, value: `₹${((Number(account.annualRevenue ?? 0)) / 10000000).toFixed(1)} Cr` },
                    {
                        type: "progress" as const,
                        label: "Health Score",
                        icon: Activity,
                        value: account.healthScore ?? 0,
                    },
                    { label: "Industry", icon: MapPin, value: account.industry ?? "—" },
                    { label: "Billing Address", icon: MapPin, value: account.billingAddress ?? "—" },
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
                        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors">
                            <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Are you sure you want to delete this account?")) {
                                    deleteAccount.mutate({ id });
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded text-body-sm font-medium hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Delete
                        </button>
                    </PermissionGate>
                );

                return (
                    <div className="flex flex-col gap-6 p-6">
                        <PageHeader
                            icon={Building2}
                            title={account.name}
                            subtitle={`${account.industry ?? ""}${account.billingAddress ? ` · ${account.billingAddress}` : ""}`}
                            badge={tierBadge}
                            actions={actions}
                            backHref="/app/crm"
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Info & Stats */}
                            <div className="lg:col-span-1 space-y-6">
                                <DetailGrid title="Account Details" fields={accountFields} />

                                {/*
                                  * Contacts nested under the account — the organisation
                                  * relationship on one page. `contacts.list` is scoped by
                                  * accountId, so these are this account's people and no
                                  * one else's.
                                  *
                                  * The mail/phone controls were BUTTONS WITH NO HANDLER on
                                  * every row, including rows whose contact has no email or
                                  * phone at all. They are anchors now, and each one renders
                                  * only when the value behind it exists — a control that
                                  * cannot act should not be drawn.
                                  */}
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest">Contacts</h3>
                                        {(qContacts.data?.length ?? 0) > 0 && (
                                            <span className="text-caption text-muted-foreground tabular-nums">{qContacts.data!.length}</span>
                                        )}
                                    </div>
                                    <div className="space-y-3" data-testid="account-contacts">
                                        {qContacts.isLoading && (
                                            <div className="space-y-2 animate-pulse">
                                                {[...Array(2)].map((_, i) => (
                                                    <div key={i} className="flex items-center gap-3 p-2">
                                                        <div className="w-8 h-8 rounded-full bg-muted" />
                                                        <div className="flex-1 space-y-1.5">
                                                            <div className="h-3 bg-muted rounded w-2/3" />
                                                            <div className="h-2 bg-muted rounded w-1/2" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!qContacts.isLoading && (qContacts.data?.length ?? 0) === 0 && (
                                            <p className="text-caption text-muted-foreground py-3 leading-relaxed">
                                                No contacts on this account yet. People added against this
                                                company appear here, as does the contact created when a lead
                                                converts.
                                            </p>
                                        )}

                                        {qContacts.data?.map((contact: any) => (
                                            <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors group gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-caption">
                                                        {contact.firstName[0]}{contact.lastName[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-body-sm font-medium truncate">{contact.firstName} {contact.lastName}</p>
                                                        {/* Title is nullable; an empty line reads as a rendering
                                                            fault, so fall back to the next most useful fact. */}
                                                        <p className="text-caption text-muted-foreground truncate">
                                                            {contact.title || contact.email || "No title on file"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                    {contact.email && (
                                                        <a href={`mailto:${contact.email}`} title={contact.email}
                                                            className="p-1.5 hover:bg-white rounded border border-transparent hover:border-border">
                                                            <Mail className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                    {contact.phone && (
                                                        <a href={`tel:${contact.phone}`} title={contact.phone}
                                                            className="p-1.5 hover:bg-white rounded border border-transparent hover:border-border">
                                                            <Phone className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Was a dead button. Contact creation lives on the CRM
                                            Contacts tab, which is where this now goes. */}
                                        <Link href="/app/crm?tab=contacts"
                                            className="block w-full mt-2 py-2 border border-dashed border-border rounded-lg text-caption text-center text-muted-foreground hover:bg-muted/50 transition-colors">
                                            + Add Contact
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Deals & Timeline */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Active Deals */}
                                <div className="bg-card border border-border rounded-xl overflow-hidden">
                                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                                        <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest">Active Deals</h3>
                                        <button className="text-caption text-primary font-bold hover:underline">+ New Deal</button>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {qDeals.data?.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage)).map((deal: any) => (
                                            <div key={deal.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between cursor-pointer" onClick={() => router.push(`/app/crm/deals/${deal.id}`)}>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-mono text-muted-foreground">{deal.number}</span>
                                                        <p className="text-body-sm font-semibold">{deal.title}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-caption text-muted-foreground">
                                                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {deal.stage.replace("_", " ")}</span>
                                                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Closes {new Date(deal.expectedClose).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-body-sm font-bold">₹{(Number(deal.value) / 1000).toFixed(0)}K</p>
                                                    <p className="text-[10px] text-muted-foreground">{deal.probability}% Probability</p>
                                                </div>
                                            </div>
                                        ))}
                                        {qDeals.data?.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage)).length === 0 && (
                                            <div className="p-8 text-center text-body-sm text-muted-foreground">No active deals for this account.</div>
                                        )}
                                    </div>
                                </div>

                                {/* One shared timeline, scoped to this account. */}
                                <CrmActivityTimeline
                                    scope={{ accountId: id }}
                                    title="Recent Activity"
                                    max={5}
                                />
                            </div>
                        </div>
                    </div>
                );
            }}
        </ResourceView>
    );
}
