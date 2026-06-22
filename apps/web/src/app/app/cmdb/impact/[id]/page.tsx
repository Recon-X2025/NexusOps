"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { ChevronRight, ChevronDown, ArrowLeft, Zap, ArrowUp, ArrowDown, X, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRBAC } from "@/lib/rbac-context";

// ── Types ──────────────────────────────────────────────────────────────────

type CINode = { id: string; name: string; type: string; status: string };
type Edge   = { id: string; source: string; target: string; type: string };

type TreeNode = {
  ci: CINode;
  relationType: string;
  children: TreeNode[];
};

// ── Build dependency trees ─────────────────────────────────────────────────

function buildUpstream(
  ciId: string,
  edges: Edge[],
  ciMap: Map<string, CINode>,
  visited = new Set<string>(),
  depth = 0,
): TreeNode[] {
  if (depth > 5 || visited.has(ciId)) return [];
  visited.add(ciId);
  return edges
    .filter(e => e.source === ciId)
    .map(e => ({
      ci: ciMap.get(e.target) ?? { id: e.target, name: e.target.slice(0, 8) + "…", type: "unknown", status: "unknown" },
      relationType: e.type,
      children: buildUpstream(e.target, edges, ciMap, new Set(visited), depth + 1),
    }));
}

function buildDownstream(
  ciId: string,
  edges: Edge[],
  ciMap: Map<string, CINode>,
  visited = new Set<string>(),
  depth = 0,
): TreeNode[] {
  if (depth > 5 || visited.has(ciId)) return [];
  visited.add(ciId);
  return edges
    .filter(e => e.target === ciId)
    .map(e => ({
      ci: ciMap.get(e.source) ?? { id: e.source, name: e.source.slice(0, 8) + "…", type: "unknown", status: "unknown" },
      relationType: e.type,
      children: buildDownstream(e.source, edges, ciMap, new Set(visited), depth + 1),
    }));
}

function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
}

// ── CI type colours ────────────────────────────────────────────────────────

const CI_COLOR: Record<string, string> = {
  server: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
  service: "text-green-600 bg-green-50 dark:bg-green-950/30",
  database: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  network: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
  application: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
  cloud: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
};

const STATUS_COLOR: Record<string, string> = {
  operational: "text-green-600",
  degraded:    "text-yellow-600",
  down:        "text-red-600",
  planned:     "text-slate-500",
};

// ── TreeNode component ─────────────────────────────────────────────────────

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const colorClass = CI_COLOR[node.ci.type] || "text-slate-600 bg-slate-50";
  const statusClass = STATUS_COLOR[node.ci.status] || "text-slate-500";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/40 cursor-pointer group"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={() => hasChildren && setExpanded(e => !e)}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${colorClass}`}>
          {node.ci.type}
        </span>
        <span className="text-[12px] font-medium text-foreground">{node.ci.name}</span>
        <span className={`text-[10px] capitalize ${statusClass}`}>{node.ci.status}</span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto opacity-0 group-hover:opacity-100">
          {node.relationType.replace(/_/g, " ")}
        </span>
        {hasChildren && (
          <span className="text-[10px] text-muted-foreground/60">
            {node.children.length} {node.children.length === 1 ? "dep" : "deps"}
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="border-l border-border/50 ml-5">
          {node.children.map((child, i) => (
            <TreeItem key={`${child.ci.id}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Change Request Modal ───────────────────────────────────────────────────

function ChangeRequestModal({ ci, blastRadius, onClose }: { ci: CINode; blastRadius: number; onClose: () => void }) {
  const [form, setForm] = useState({
    title: `Change for ${ci.name}`,
    description: `Impact analysis: ${blastRadius} downstream service(s) affected.\n\nCI: ${ci.name} (${ci.type})\nStatus: ${ci.status}`,
    type: "normal" as "normal" | "standard" | "emergency" | "expedited",
    risk: blastRadius > 5 ? "high" : blastRadius > 2 ? "medium" : "low" as "low" | "medium" | "high" | "critical",
    rollbackPlan: "",
    implementationPlan: "",
  });

  const create = trpc.changes.create.useMutation({
    onSuccess: () => {
      toast.success("Change request created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create change request"),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-xl flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Create Change Request</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {blastRadius > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded text-[11px] text-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            This change affects <strong>{blastRadius}</strong> downstream service{blastRadius !== 1 ? "s" : ""}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Title <span className="text-red-500">*</span></label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Description</label>
          <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
              className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
              {["normal", "standard", "emergency", "expedited"].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Risk Level</label>
            <select value={form.risk} onChange={e => setForm(f => ({ ...f, risk: e.target.value as any }))}
              className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
              {["low", "medium", "high", "critical"].map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Rollback Plan</label>
          <textarea rows={2} value={form.rollbackPlan} onChange={e => setForm(f => ({ ...f, rollbackPlan: e.target.value }))}
            placeholder="Describe rollback steps…"
            className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
          <button
            onClick={() => create.mutate({ ...form, rollbackPlan: form.rollbackPlan || undefined, implementationPlan: undefined })}
            disabled={!form.title.trim() || create.isPending}
            className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create Change Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ImpactAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [showChangeModal, setShowChangeModal] = useState(false);

  const { data: cisData, isLoading: cisLoading } = trpc.assets.cmdb.list.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.list", { refetchOnWindowFocus: false },));

  const { data: topoData, isLoading: topoLoading } = trpc.assets.cmdb.getTopology.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.getTopology", { refetchOnWindowFocus: false },));

  const isLoading = cisLoading || topoLoading;

  const { ci, upstream, downstream, blastRadius } = useMemo(() => {
    const cis   = (cisData ?? []) as CINode[];
    const edges = ((topoData as any)?.edges ?? []) as Edge[];
    const ciMap = new Map(cis.map((c: CINode) => [c.id, c]));

    const ci = ciMap.get(id);
    if (!ci) return { ci: null, upstream: [], downstream: [], blastRadius: 0 };

    const upstream   = buildUpstream(id, edges, ciMap);
    const downstream = buildDownstream(id, edges, ciMap);
    const blastRadius = countNodes(downstream);

    return { ci, upstream, downstream, blastRadius };
  }, [cisData, topoData, id]);

  if (!can("cmdb", "read")) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Access denied — requires CMDB read permission
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading impact analysis…
      </div>
    );
  }

  if (!ci) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-muted-foreground text-sm">Configuration item not found</p>
        <Link href="/app/cmdb" className="text-xs text-primary underline">← Back to CMDB</Link>
      </div>
    );
  }

  const colorClass  = CI_COLOR[ci.type]   || "text-slate-600 bg-slate-50";
  const statusClass = STATUS_COLOR[ci.status] || "text-slate-500";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/app/cmdb"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> CMDB
          </Link>
          <span className="text-muted-foreground/40 text-xs">/</span>
          <span className="text-[11px] text-muted-foreground">Impact Analysis</span>
        </div>
        {can("changes", "write") && (
          <button
            onClick={() => setShowChangeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary/90">
            <Zap className="w-3.5 h-3.5" /> Create Change Request
          </button>
        )}
      </div>

      {/* CI Identity card */}
      <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${colorClass}`}>{ci.type}</span>
            <span className={`text-[11px] capitalize ${statusClass}`}>{ci.status}</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">{ci.name}</h1>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{ci.id}</p>
        </div>

        {/* Blast radius badge */}
        <div className={`flex flex-col items-center px-4 py-2 rounded-lg border ${blastRadius > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900" : "border-border bg-muted/30"}`}>
          <div className={`text-2xl font-bold ${blastRadius > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {blastRadius}
          </div>
          <div className="text-[10px] text-muted-foreground whitespace-nowrap">Blast Radius</div>
          <div className="text-[9px] text-muted-foreground/70 whitespace-nowrap">downstream affected</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Direct Dependencies",  value: upstream.length,   icon: ArrowUp,   color: "text-blue-600" },
          { label: "Direct Dependents",    value: downstream.length, icon: ArrowDown, color: "text-orange-600" },
          { label: "Total Blast Radius",   value: blastRadius,       icon: Zap,       color: blastRadius > 0 ? "text-red-600" : "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Trees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Upstream — Depends On */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-semibold text-foreground">Depends On</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{upstream.length} direct</span>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {upstream.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 text-center py-6">No upstream dependencies</p>
            ) : (
              upstream.map((node, i) => <TreeItem key={`up-${node.ci.id}-${i}`} node={node} />)
            )}
          </div>
        </div>

        {/* Downstream — Depended On By */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <ArrowDown className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-semibold text-foreground">Depended On By</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{downstream.length} direct</span>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {downstream.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 text-center py-6">Nothing depends on this CI</p>
            ) : (
              downstream.map((node, i) => <TreeItem key={`down-${node.ci.id}-${i}`} node={node} />)
            )}
          </div>
        </div>
      </div>

      {/* Change Request Modal */}
      {showChangeModal && (
        <ChangeRequestModal ci={ci} blastRadius={blastRadius} onClose={() => setShowChangeModal(false)} />
      )}
    </div>
  );
}
