"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Scale, ChevronLeft, Send, Clock, Activity, TrendingUp, TrendingDown, Tag, ArrowLeft,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";

const SCORE_COLOR = (score: number) => {
  if (score >= 16) return "text-red-700 bg-red-100 border-red-300";
  if (score >= 9)  return "text-orange-700 bg-orange-100 border-orange-300";
  if (score >= 4)  return "text-yellow-700 bg-yellow-100 border-yellow-300";
  return "text-green-700 bg-green-100 border-green-300";
};

const SCORE_LABEL = (score: number) => {
  if (score >= 16) return "Critical";
  if (score >= 9)  return "High";
  if (score >= 4)  return "Medium";
  return "Low";
};

const CTRL_STATUS: Record<string, string> = {
  operational:  "text-green-700 bg-green-100",
  partial:      "text-yellow-700 bg-yellow-100",
  not_deployed: "text-red-700 bg-red-100",
  under_review: "text-blue-700 bg-blue-100",
  active:       "text-green-700 bg-green-100",
  inactive:     "text-red-700 bg-red-100",
};

const STATUS_CFG: Record<string, string> = {
  identified: "text-slate-700 bg-slate-100",
  assessed:   "text-yellow-700 bg-yellow-100",
  mitigating: "text-blue-700 bg-blue-100",
  accepted:   "text-purple-700 bg-purple-100",
  closed:     "text-green-700 bg-green-100",
};


export default function GRCRiskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("overview");
  const [likelihood, setLikelihood] = useState<number | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [treatmentDraft, setTreatmentDraft] = useState("");
  const [editingTreatment, setEditingTreatment] = useState(false);
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  // @ts-ignore
  const riskQuery = trpc.grc.getRisk.useQuery({ id }, mergeTrpcQueryOpts("grc.getRisk", undefined));

  // @ts-ignore
  const updateRiskMutation = trpc.grc.updateRisk.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.grc.getRisk.invalidate({ id });
      setLikelihood(null);
      setImpact(null);
      setEditingTreatment(false);
      setTreatmentDraft("");
      setReviewNote("");
      toast.success("Risk updated");
    },
    onError: (e: any) => { console.error("grc.updateRisk failed:", e); toast.error(e.message || "Failed to update risk"); },
  });

  if (!can("grc", "read")) return <AccessDenied module="GRC / Risk Management" />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={riskQuery}
        resourceName="Risk"
        backHref="/app/grc"
      >
        {(risk) => {
          const controls = (risk.controls ?? []) as Array<{ id: string; title: string; status: string }>;
          const currentLikelihood = likelihood ?? risk.likelihood;
          const currentImpact = impact ?? risk.impact;
          const previewScore = currentLikelihood * currentImpact;
          const residualScore = risk.residualLikelihood && risk.residualImpact
            ? risk.residualLikelihood * risk.residualImpact
            : null;
          const isDirty = likelihood !== null || impact !== null;

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={risk.number || `RISK-${id.slice(0, 8)}`}
                subtitle={risk.title}
                icon={Scale}
                backHref="/app/grc"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", SCORE_COLOR(risk.riskScore))}>
                      {SCORE_LABEL(risk.riskScore)} ({risk.riskScore})
                    </span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", STATUS_CFG[risk.status] ?? "bg-muted text-muted-foreground")}>
                      {risk.status}
                    </span>
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Summary Card */}
                  <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Description</h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {risk.description || "No description provided."}
                    </p>
                    {risk.mitigationPlan && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 leading-relaxed italic">
                        <strong>Mitigation Plan:</strong> {risk.mitigationPlan}
                      </div>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-border gap-6">
                    {[
                      { key: "overview", label: `Controls (${controls.length})` },
                      { key: "treatments", label: "Treatment Plan" },
                      { key: "reviews", label: "Review History" },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                          "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all",
                          tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {tab === "overview" && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                      {controls.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">No controls linked.</div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border">
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Control ID</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Name</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {controls.map((c) => (
                              <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-3 text-sm font-mono text-primary">{c.id}</td>
                                <td className="px-4 py-3 text-sm font-medium text-foreground">{c.title}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", CTRL_STATUS[c.status] || "bg-muted text-muted-foreground")}>
                                    {c.status.replace("_", " ")}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {tab === "treatments" && (
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-left-4 duration-300">
                      {editingTreatment ? (
                        <div className="flex flex-col gap-4">
                          <textarea rows={6} value={treatmentDraft} onChange={(e) => setTreatmentDraft(e.target.value)} placeholder="Describe the mitigation plan..." className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-background resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                          <div className="flex justify-end gap-3">
                            <button onClick={() => setEditingTreatment(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-all">Cancel</button>
                            <button onClick={() => updateRiskMutation.mutate({ id: risk.id, mitigationPlan: treatmentDraft })} className="px-6 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-all shadow-md">Save Plan</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <p className="text-sm text-foreground leading-relaxed">{risk.mitigationPlan || "No treatment plan recorded."}</p>
                          <PermissionGate module="grc" action="write">
                            <button onClick={() => { setTreatmentDraft(risk.mitigationPlan || ""); setEditingTreatment(true); }} className="text-sm font-bold text-primary hover:underline self-start">
                              {risk.mitigationPlan ? "Edit Treatment Plan" : "Add Treatment Plan"}
                            </button>
                          </PermissionGate>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "reviews" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={(risk.logs ?? []).map((l: any) => ({
                          id: l.id,
                          title: l.action,
                          timestamp: l.createdAt,
                          icon: Scale,
                          subtitle: l.authorName
                        }))}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <DetailGrid
                    title="Risk Metrics"
                    icon={Scale}
                    items={[
                      { label: "Inherent Risk", value: risk.riskScore, className: SCORE_COLOR(risk.riskScore), icon: Activity },
                      { label: "Likelihood", value: risk.likelihood, icon: TrendingUp },
                      { label: "Impact", value: risk.impact, icon: TrendingDown },
                      { label: "Category", value: risk.category, icon: Tag },
                    ]}
                  />

                  <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Update Risk Score</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Likelihood</label>
                        <select
                          value={currentLikelihood}
                          onChange={(e) => setLikelihood(Number(e.target.value))}
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Impact</label>
                        <select
                          value={currentImpact}
                          onChange={(e) => setImpact(Number(e.target.value))}
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    {isDirty && (
                      <button
                        onClick={() => updateRiskMutation.mutate({ id: risk.id, likelihood: currentLikelihood, impact: currentImpact })}
                        className="w-full py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md"
                      >
                        Save New Score
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
