"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Scale, ChevronLeft, Send,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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

  if (riskQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="bg-card border border-border rounded p-4 space-y-3">
          <div className="h-5 w-3/4 bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="flex gap-3 mt-2">
            <div className="h-6 w-32 bg-muted rounded" />
            <div className="h-6 w-32 bg-muted rounded" />
            <div className="h-6 w-32 bg-muted rounded" />
          </div>
        </div>
        <div className="bg-card border border-border rounded h-48" />
      </div>
    );
  }

  if (riskQuery.error || !riskQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Scale className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-muted-foreground">Risk Not Found</p>
        <p className="text-[12px] text-muted-foreground/70">
          The requested risk could not be found or you don&apos;t have access.
        </p>
        <Link href="/app/grc" className="text-[12px] text-primary hover:underline">
          ← Back to GRC / Risk Register
        </Link>
      </div>
    );
  }

  const risk = riskQuery.data;
  const controls = (risk.controls ?? []) as Array<{ id: string; title: string; status: string }>;

  const currentLikelihood = likelihood ?? risk.likelihood;
  const currentImpact = impact ?? risk.impact;
  const previewScore = currentLikelihood * currentImpact;

  const residualScore = risk.residualLikelihood && risk.residualImpact
    ? risk.residualLikelihood * risk.residualImpact
    : null;

  const isDirty = likelihood !== null || impact !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <Link href="/app/grc" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> GRC / Risk Register
        </Link>
        <span>/</span>
        <span className="text-muted-foreground font-medium">{risk.number}</span>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Scale className="w-4 h-4 text-primary" />
              <span className="font-mono text-[11px] text-primary">{risk.number}</span>
              <span className={`status-badge font-bold border ${SCORE_COLOR(risk.riskScore)}`}>
                Score: {SCORE_LABEL(risk.riskScore)} ({risk.riskScore})
              </span>
              <span className="status-badge text-muted-foreground bg-muted capitalize">{risk.category}</span>
              <span className={`status-badge capitalize ${STATUS_CFG[risk.status] ?? ""}`}>
                ● {risk.status}
              </span>
              {risk.treatment && (
                <span className="status-badge text-blue-700 bg-blue-100 capitalize">{risk.treatment}</span>
              )}
            </div>
            <h1 className="text-[14px] font-bold text-foreground mb-1">{risk.title}</h1>
            {risk.description && (
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">{risk.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span>Created: <strong className="text-foreground/80">{new Date(risk.createdAt).toLocaleDateString()}</strong></span>
              {risk.reviewDate && (
                <span>Next Review: <strong className="text-foreground/80">{new Date(risk.reviewDate).toLocaleDateString()}</strong></span>
              )}
            </div>
          </div>

          {/* Risk Score Matrix */}
          <div className="flex-shrink-0 space-y-2">
            {[
              {
                label: "Inherent Risk",
                score: risk.riskScore,
                detail: `L${risk.likelihood} × I${risk.impact}`,
              },
              ...(residualScore !== null ? [{
                label: "Residual Risk",
                score: residualScore,
                detail: `L${risk.residualLikelihood} × I${risk.residualImpact}`,
              }] : []),
              ...(isDirty ? [{
                label: "Preview",
                score: previewScore,
                detail: `L${currentLikelihood} × I${currentImpact}`,
              }] : []),
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground/70 w-24">{r.label}:</span>
                <span className={`px-2 py-0.5 rounded border font-bold text-[12px] ${SCORE_COLOR(r.score)}`}>
                  {r.score} — {SCORE_LABEL(r.score)}
                </span>
                <span className="text-muted-foreground/70 font-mono text-[10px]">{r.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mitigation Plan */}
        {risk.mitigationPlan && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            <p className="text-[12px] text-blue-800"><strong>Mitigation Plan:</strong> {risk.mitigationPlan}</p>
          </div>
        )}

        {/* Update Risk Score */}
        <PermissionGate module="grc" action="write">
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-muted-foreground/70 font-semibold uppercase">Update Score:</span>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-muted-foreground">Likelihood</label>
              <select
                value={currentLikelihood}
                onChange={(e) => setLikelihood(Number(e.target.value))}
                className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-card outline-none"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-muted-foreground">Impact</label>
              <select
                value={currentImpact}
                onChange={(e) => setImpact(Number(e.target.value))}
                className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-card outline-none"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            {isDirty && (
              <button
                onClick={() =>
                  updateRiskMutation.mutate({
                    id: risk.id,
                    likelihood: currentLikelihood,
                    impact: currentImpact,
                  })
                }
                disabled={updateRiskMutation.isPending}
                className="px-3 py-0.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {updateRiskMutation.isPending ? "Saving…" : "Save Risk Score"}
              </button>
            )}
          </div>
        </PermissionGate>
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {[
          { key: "overview",   label: `Controls (${controls.length})` },
          { key: "treatments", label: "Treatment Plan" },
          { key: "reviews",    label: "Review History" },
          { key: "policies",   label: "Related Policies" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "overview" && (
          controls.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[12px] text-muted-foreground/70">No controls linked to this risk.</p>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Control ID</th>
                  <th>Control Name</th>
                  <th>Deployment Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="font-medium text-foreground">{c.title}</td>
                    <td>
                      <span className={`status-badge capitalize ${CTRL_STATUS[c.status] ?? "text-muted-foreground bg-muted"}`}>
                        {c.status.replace("_", " ")}
                      </span>
                    </td>
                    <td><button onClick={() => toast.info(`Control "${c.title}" — Status: ${c.status}. Full control detail view coming in the next release.`, { duration: 5000 })} className="text-[11px] text-primary hover:underline">View Control</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "treatments" && (
          <div className="p-4 space-y-3">
            {risk.mitigationPlan ? (
              <div className="border border-border rounded p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="status-badge text-blue-700 bg-blue-100">Mitigate</span>
                  <span className={`status-badge capitalize ${STATUS_CFG[risk.status] ?? ""}`}>{risk.status}</span>
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-1">Mitigation Plan</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{risk.mitigationPlan}</p>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-[12px] text-muted-foreground/70">No treatment plan recorded for this risk.</p>
                <PermissionGate module="grc" action="write">
                  {editingTreatment ? (
                    <div className="mt-3 flex flex-col gap-2 text-left">
                      <textarea rows={4} value={treatmentDraft} onChange={(e) => setTreatmentDraft(e.target.value)} placeholder="Describe the mitigation plan, controls to implement, timelines…" className="w-full px-3 py-2 text-sm border border-border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingTreatment(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
                        <button onClick={() => { if (!treatmentDraft.trim()) { toast.error("Treatment plan cannot be empty"); return; } updateRiskMutation.mutate({ id: risk.id, mitigationPlan: treatmentDraft.trim() }); }} disabled={updateRiskMutation.isPending} className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">{updateRiskMutation.isPending ? "Saving…" : "Save Treatment Plan"}</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setTreatmentDraft(""); setEditingTreatment(true); }} className="mt-3 text-[11px] text-primary hover:underline">+ Add Treatment Plan</button>
                  )}
                </PermissionGate>
              </div>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="p-4 space-y-3">
            <div className="bg-muted/20 rounded p-3 text-[12px] text-muted-foreground">
              <p>Last updated: <strong>{new Date(risk.updatedAt).toLocaleString()}</strong></p>
              {risk.reviewDate && (
                <p>Next scheduled review: <strong>{new Date(risk.reviewDate).toLocaleDateString()}</strong></p>
              )}
            </div>
            <PermissionGate module="grc" action="write">
              <div className="border border-border rounded overflow-hidden mt-2">
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-[12px] outline-none resize-none"
                  placeholder="Add risk review note..." />
                <div className="flex justify-end px-3 py-2 bg-muted/30 border-t border-border">
                  <button
                    onClick={() => { if (!reviewNote.trim()) { toast.error("Review note cannot be empty"); return; } updateRiskMutation.mutate({ id: risk.id, mitigationPlan: risk.mitigationPlan ? `${risk.mitigationPlan}\n\n[Review ${new Date().toLocaleDateString()}]: ${reviewNote.trim()}` : reviewNote.trim() }); }}
                    disabled={updateRiskMutation.isPending || !reviewNote.trim()}
                    className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50">
                    <Send className="w-3 h-3" /> {updateRiskMutation.isPending ? "Saving…" : "Log Review"}
                  </button>
                </div>
              </div>
            </PermissionGate>
          </div>
        )}

        {tab === "policies" && (
          <div className="p-8 text-center">
            <p className="text-[12px] text-muted-foreground/70">No related policies linked to this risk.</p>
          </div>
        )}
      </div>
    </div>
  );
}
