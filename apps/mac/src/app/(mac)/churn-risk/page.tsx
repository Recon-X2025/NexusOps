"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { listOrgsWithHealth, updateBillingInfo } from "@/lib/mac-api";
import type { OrgWithHealth } from "@/lib/mac-api";

interface OrgRisk extends OrgWithHealth {
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
  riskFactors: string[];
}

function computeRisk(org: OrgWithHealth): OrgRisk {
  const factors: string[] = [];
  let score = 0;
  if (org.plan === "free") { score += 40; factors.push("Free plan"); }
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const trialEndsAt = settings.trialEndsAt as string | undefined;
  if (trialEndsAt) {
    const daysLeft = (new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 7) { score += 30; factors.push("Trial ending < 7 days"); }
  }
  if (org.userCount === 0) { score += 20; factors.push("No users"); }
  const level: "high" | "medium" | "low" = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { ...org, riskScore: score, riskLevel: level, riskFactors: factors };
}

const RISK_STYLES = {
  high: "bg-red-50 text-red-700",
  medium: "bg-yellow-50 text-yellow-700",
  low: "bg-emerald-50 text-emerald-700",
};

export default function ChurnRiskPage() {
  const [orgs, setOrgs] = useState<OrgRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    listOrgsWithHealth()
      .then((data) => {
        const risks = data.map(computeRisk).sort((a, b) => b.riskScore - a.riskScore);
        setOrgs(risks);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function logAction(msg: string) {
    setActionLog((l) => [msg, ...l].slice(0, 10));
    toast.success(msg);
  }

  async function handleExtendTrial(org: OrgRisk) {
    const trialEndsAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    try {
      await updateBillingInfo({ orgId: org.id, trialEndsAt });
      logAction(`Extended trial for ${org.name} by 14 days`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extend trial");
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Churn Risk</h1>
        <p className="text-sm text-slate-500">Organizations at risk of churning, sorted by risk score</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {["Organization", "Plan", "Users", "Risk Score", "Risk Factors", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{org.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500 capitalize">{org.plan}</td>
                <td className="px-4 py-3 text-slate-700">{org.userCount}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[org.riskLevel]}`}>
                    {org.riskLevel} ({org.riskScore})
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{org.riskFactors.join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => logAction(`Engagement email logged for ${org.name}`)}
                      className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >Send Email</button>
                    {org.plan !== "free" && (
                      <button onClick={() => void handleExtendTrial(org)} className="rounded px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50">Extend Trial</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actionLog.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Action Log</h2>
          {actionLog.map((entry, i) => (
            <p key={i} className="text-xs text-slate-600">• {entry}</p>
          ))}
        </div>
      )}
    </div>
  );
}
