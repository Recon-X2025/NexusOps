"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Search, Loader2, RotateCcw } from "lucide-react";
import { getOrganizations, getFeatureFlags, setFeatureFlag, resetFeatureFlags } from "@/lib/mac-api";
import type { OrgRow } from "@/lib/mac-api";

const FLAG_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  ai_features: { label: "AI Features", description: "AI-powered suggestions and automation" },
  advanced_workflows: { label: "Advanced Workflows", description: "Multi-step approval chains and automation rules" },
  custom_branding: { label: "Custom Branding", description: "Logo, colors, and white-label options" },
  sso: { label: "SSO / SAML", description: "Single sign-on via SAML or OIDC" },
  api_access: { label: "API Access", description: "REST/GraphQL API access for integrations" },
  reports: { label: "Reports", description: "Advanced reporting and export features" },
};

export default function FeatureFlagsPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<OrgRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const data = await getOrganizations(1, search);
      setResults(data as OrgRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const loadFlags = useCallback(async (org: OrgRow) => {
    setSelectedOrg(org);
    setLoadingFlags(true);
    try {
      const data = await getFeatureFlags(org.id);
      setFlags(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load flags");
    } finally {
      setLoadingFlags(false);
    }
  }, []);

  async function handleToggle(flag: string, enabled: boolean) {
    if (!selectedOrg) return;
    setToggling(flag);
    setFlags((f) => ({ ...f, [flag]: enabled }));
    try {
      await setFeatureFlag(selectedOrg.id, flag, enabled);
      toast.success(`${flag} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      setFlags((f) => ({ ...f, [flag]: !enabled }));
      toast.error(err instanceof Error ? err.message : "Failed to update flag");
    } finally {
      setToggling(null);
    }
  }

  async function handleReset() {
    if (!selectedOrg) return;
    try {
      await resetFeatureFlags(selectedOrg.id);
      toast.success("Reset to plan defaults");
      await loadFlags(selectedOrg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Feature Flags</h1>
        <p className="text-sm text-slate-500">Manage per-org feature overrides</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organization…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
        <button type="submit" disabled={searching} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {results.length > 0 && !selectedOrg && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ul className="divide-y divide-slate-50">
            {results.map((org) => (
              <li key={org.id}>
                <button onClick={() => void loadFlags(org)} className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between">
                  <span className="font-medium text-slate-800">{org.name}</span>
                  <span className="text-xs text-slate-400">{org.plan}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedOrg && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">{selectedOrg.name}</h2>
              <p className="text-xs text-slate-500">Plan: {selectedOrg.plan}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReset} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <RotateCcw className="h-3.5 w-3.5" />Reset to Plan Defaults
              </button>
              <button onClick={() => { setSelectedOrg(null); setResults([]); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Change Org</button>
            </div>
          </div>

          {loadingFlags ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    {["Flag", "Description", "Enabled"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {Object.entries(flags).map(([flag, enabled]) => {
                    const meta = FLAG_DESCRIPTIONS[flag] ?? { label: flag, description: "" };
                    return (
                      <tr key={flag} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{meta.label}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{meta.description}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void handleToggle(flag, !enabled)}
                            disabled={toggling === flag}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-slate-200"} disabled:opacity-60`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
