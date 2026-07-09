"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Rocket,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getDeployStatus, triggerDeploy } from "@/lib/mac-api";
import type { DeployStatus } from "@/lib/mac-api";

function runIcon(conclusion: string | null, status: string) {
  if (status !== "completed") return <Clock className="h-4 w-4 text-amber-500" />;
  if (conclusion === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

export default function DeployPage() {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageTag, setImageTag] = useState("latest");
  const [deployMode, setDeployMode] = useState<"pull" | "build">("pull");
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getDeployStatus());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load deploy status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTrigger() {
    if (
      !window.confirm(
        `Trigger a production deploy?\n\nImage tag: ${imageTag}\nMode: ${deployMode}\n\nThis dispatches the deploy-vultr GitHub Action against main.`,
      )
    ) {
      return;
    }
    setTriggering(true);
    try {
      await triggerDeploy({ imageTag, deployMode });
      toast.success("Deploy dispatched — watch the runs below");
      setTimeout(() => void load(), 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  const health = status?.health ?? null;
  const healthStatus = typeof health?.["status"] === "string" ? (health["status"] as string) : "unknown";
  const healthy = healthStatus === "ok" || healthStatus === "healthy";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Deploy</h1>
          <p className="text-sm text-slate-500">Trigger and observe production deployments</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !status ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Live status cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live version</p>
              <p className="mt-2 font-mono text-lg font-bold text-slate-800">{status?.version ?? "unknown"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">API health</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-bold">
                {healthy ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                <span className={healthy ? "text-emerald-600" : "text-amber-600"}>{healthStatus}</span>
              </p>
            </div>
          </div>

          {/* Trigger form */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-800">Trigger deployment</h2>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Dispatches the <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono">deploy-vultr</code> workflow
              on <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono">main</code>. Requires a
              server-side <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono">GITHUB_PAT</code>.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Image tag
                <input
                  value={imageTag}
                  onChange={(e) => setImageTag(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Mode
                <select
                  value={deployMode}
                  onChange={(e) => setDeployMode(e.target.value as "pull" | "build")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="pull">Pull (use prebuilt image)</option>
                  <option value="build">Build (build on host)</option>
                </select>
              </label>
              <button
                onClick={() => void handleTrigger()}
                disabled={triggering}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Deploy
              </button>
            </div>
          </div>

          {/* Recent runs */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Recent deploy runs</h2>
            </div>
            {status?.recentRuns == null ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Run history unavailable (no GITHUB_PAT configured).
              </p>
            ) : status.recentRuns.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No deploy runs yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {status.recentRuns.map((run) => (
                  <li key={run.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      {runIcon(run.conclusion, run.status)}
                      <div>
                        <p className="text-sm font-medium text-slate-800">{run.displayTitle}</p>
                        <p className="font-mono text-xs text-slate-400">
                          {run.status}
                          {run.conclusion ? ` · ${run.conclusion}` : ""} ·{" "}
                          {run.createdAt ? format(new Date(run.createdAt), "dd MMM HH:mm") : "—"}
                        </p>
                      </div>
                    </div>
                    <a
                      href={run.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
