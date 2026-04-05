"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  Workflow, ChevronRight, Save, X, Loader2, AlertTriangle,
  Zap, GitBranch, UserCheck, Bell, Edit3, Clock, Globe, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateUUID } from "@/lib/uuid";

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 72;

const TRIGGERS = [
  { value: "ticket_created", label: "Ticket Created" },
  { value: "ticket_updated", label: "Ticket Updated" },
  { value: "status_changed", label: "Status Changed" },
  { value: "scheduled",      label: "Scheduled" },
  { value: "webhook",        label: "Webhook / API" },
  { value: "manual",         label: "Manual Trigger" },
];

type NodeType = "TRIGGER" | "CONDITION" | "ASSIGN" | "NOTIFY" | "UPDATE_FIELD" | "WAIT" | "WEBHOOK";

interface NodeMeta {
  label: string;
  color: string;      // bg colour class
  border: string;     // border colour class
  text: string;       // text colour class
  icon: React.ReactNode;
}

const NODE_META: Record<NodeType, NodeMeta> = {
  TRIGGER:      { label: "Trigger",       color: "bg-orange-50 dark:bg-orange-950",  border: "border-orange-300 dark:border-orange-700",  text: "text-orange-700 dark:text-orange-300",  icon: <Zap      className="h-3.5 w-3.5" /> },
  CONDITION:    { label: "Condition",     color: "bg-yellow-50 dark:bg-yellow-950",  border: "border-yellow-300 dark:border-yellow-700",  text: "text-yellow-700 dark:text-yellow-300",  icon: <GitBranch className="h-3.5 w-3.5" /> },
  ASSIGN:       { label: "Assign",        color: "bg-blue-50 dark:bg-blue-950",      border: "border-blue-300 dark:border-blue-700",      text: "text-blue-700 dark:text-blue-300",      icon: <UserCheck className="h-3.5 w-3.5" /> },
  NOTIFY:       { label: "Notify",        color: "bg-purple-50 dark:bg-purple-950",  border: "border-purple-300 dark:border-purple-700",  text: "text-purple-700 dark:text-purple-300",  icon: <Bell      className="h-3.5 w-3.5" /> },
  UPDATE_FIELD: { label: "Update Field",  color: "bg-teal-50 dark:bg-teal-950",      border: "border-teal-300 dark:border-teal-700",      text: "text-teal-700 dark:text-teal-300",      icon: <Edit3     className="h-3.5 w-3.5" /> },
  WAIT:         { label: "Wait",          color: "bg-slate-50 dark:bg-slate-800",    border: "border-slate-300 dark:border-slate-600",    text: "text-slate-700 dark:text-slate-300",    icon: <Clock     className="h-3.5 w-3.5" /> },
  WEBHOOK:      { label: "Webhook",       color: "bg-red-50 dark:bg-red-950",        border: "border-red-300 dark:border-red-700",        text: "text-red-700 dark:text-red-300",        icon: <Globe     className="h-3.5 w-3.5" /> },
};

const PALETTE_NODES: NodeType[] = ["TRIGGER", "CONDITION", "ASSIGN", "NOTIFY", "UPDATE_FIELD", "WAIT", "WEBHOOK"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

type DraggingState = { nodeId: string; offsetX: number; offsetY: number } | null;

// ─── Default data per node type ───────────────────────────────────────────────

function defaultData(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "TRIGGER":      return { event: "ticket_created" };
    case "CONDITION":    return { expression: "", trueLabel: "Yes", falseLabel: "No" };
    case "ASSIGN":       return { team: "", user: "" };
    case "NOTIFY":       return { message: "", notificationType: "in_app" };
    case "UPDATE_FIELD": return { fieldName: "", newValue: "" };
    case "WAIT":         return { duration: 1, unit: "hours" };
    case "WEBHOOK":      return { url: "", method: "POST", payload: "" };
  }
}

/** Normalize legacy lowercase types coming from the DB */
function normalizeType(raw: string): NodeType {
  const up = raw.toUpperCase() as NodeType;
  if (up in NODE_META) return up;
  // legacy mappings
  const map: Record<string, NodeType> = {
    assign: "ASSIGN", notify: "NOTIFY", email: "NOTIFY",
    update_field: "UPDATE_FIELD", create_task: "ASSIGN",
    webhook: "WEBHOOK", trigger: "TRIGGER", condition: "CONDITION",
    wait: "WAIT",
  };
  return map[raw.toLowerCase()] ?? "NOTIFY";
}

// ─── Auto-layout for nodes without positions ──────────────────────────────────

function autoLayout(nodes: CanvasNode[]): CanvasNode[] {
  const COLS = 4;
  const PAD_X = 40;
  const PAD_Y = 40;
  const GAP_X = 220;
  const GAP_Y = 120;
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: PAD_X + (i % COLS) * GAP_X,
      y: PAD_Y + Math.floor(i / COLS) * GAP_Y,
    },
  }));
}

// ─── NodeCard component ───────────────────────────────────────────────────────

interface NodeCardProps {
  node: CanvasNode;
  isSelected: boolean;
  isConnecting: boolean;
  connectingFrom: string | null;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onDelete: (id: string) => void;
  onConnectStart: (id: string) => void;
}

function NodeCard({
  node, isSelected, isConnecting, connectingFrom,
  onMouseDown, onClick, onDelete, onConnectStart,
}: NodeCardProps) {
  const meta = NODE_META[node.type];
  const isSource = connectingFrom === node.id;

  return (
    <div
      style={{ left: node.position.x, top: node.position.y, width: NODE_W }}
      className={cn(
        "absolute rounded-lg border-2 shadow-sm select-none overflow-hidden",
        meta.color, meta.border,
        isSelected && "ring-2 ring-primary ring-offset-1",
        isSource && "ring-2 ring-indigo-400 ring-offset-1",
        isConnecting && !isSource && "cursor-crosshair",
      )}
      onClick={(e) => onClick(e, node.id)}
    >
      {/* Header — drag handle */}
      <div
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 cursor-grab active:cursor-grabbing",
          meta.color,
        )}
        onMouseDown={(e) => onMouseDown(e, node.id)}
      >
        <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold", meta.text)}>
          {meta.icon}
          <span>{meta.label}</span>
        </div>
        <button
          className="text-muted-foreground/50 hover:text-red-500 transition ml-1"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          title="Remove node"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <div className="px-2.5 pb-1.5 pt-0.5 text-[10px] text-muted-foreground truncate">
        {nodePreview(node)}
      </div>

      {/* Connect button */}
      <div className="flex justify-end px-2 pb-1.5">
        <button
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-medium border transition",
            isSource
              ? "bg-indigo-100 border-indigo-400 text-indigo-700"
              : "bg-background/60 border-border hover:bg-accent text-muted-foreground",
          )}
          onClick={(e) => { e.stopPropagation(); onConnectStart(node.id); }}
          title="Draw connection to another node"
        >
          {isSource ? "cancel" : "→ connect"}
        </button>
      </div>
    </div>
  );
}

function nodePreview(node: CanvasNode): string {
  const d = node.data;
  switch (node.type) {
    case "TRIGGER":      return `Event: ${d.event ?? "—"}`;
    case "CONDITION":    return (d.expression as string) || "No condition set";
    case "ASSIGN":       return `Team: ${d.team || "—"}  User: ${d.user || "—"}`;
    case "NOTIFY":       return (d.message as string)?.slice(0, 40) || "No message";
    case "UPDATE_FIELD": return `${d.fieldName || "—"} = ${d.newValue || "—"}`;
    case "WAIT":         return `Wait ${d.duration ?? 1} ${d.unit ?? "hours"}`;
    case "WEBHOOK":      return (d.url as string) || "No URL";
  }
}

// ─── Config panel ─────────────────────────────────────────────────────────────

interface ConfigPanelProps {
  node: CanvasNode;
  onChange: (id: string, data: Record<string, unknown>) => void;
}

function ConfigPanel({ node, onChange }: ConfigPanelProps) {
  const d = node.data;
  const set = (key: string, val: unknown) =>
    onChange(node.id, { ...d, [key]: val });

  const inputCls = "w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "text-[10px] font-medium text-muted-foreground uppercase tracking-wide";

  switch (node.type) {
    case "TRIGGER":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Trigger Event</label>
          <select value={d.event as string ?? ""} onChange={(e) => set("event", e.target.value)} className={inputCls}>
            {TRIGGERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      );

    case "CONDITION":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Condition Expression</label>
          <input value={d.expression as string ?? ""} onChange={(e) => set("expression", e.target.value)}
            placeholder="e.g. ticket.priority == 'high'" className={inputCls} />
          <label className={labelCls}>True Branch Label</label>
          <input value={d.trueLabel as string ?? "Yes"} onChange={(e) => set("trueLabel", e.target.value)} className={inputCls} />
          <label className={labelCls}>False Branch Label</label>
          <input value={d.falseLabel as string ?? "No"} onChange={(e) => set("falseLabel", e.target.value)} className={inputCls} />
        </div>
      );

    case "ASSIGN":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Team</label>
          <input value={d.team as string ?? ""} onChange={(e) => set("team", e.target.value)} placeholder="Team name or ID" className={inputCls} />
          <label className={labelCls}>User</label>
          <input value={d.user as string ?? ""} onChange={(e) => set("user", e.target.value)} placeholder="User name or ID" className={inputCls} />
        </div>
      );

    case "NOTIFY":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Notification Type</label>
          <select value={d.notificationType as string ?? "in_app"} onChange={(e) => set("notificationType", e.target.value)} className={inputCls}>
            <option value="in_app">In-App</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </select>
          <label className={labelCls}>Message Template</label>
          <textarea rows={4} value={d.message as string ?? ""} onChange={(e) => set("message", e.target.value)}
            placeholder="Hi {{user.name}}, your ticket {{ticket.id}} has been updated…"
            className={cn(inputCls, "resize-none")} />
        </div>
      );

    case "UPDATE_FIELD":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Field Name</label>
          <input value={d.fieldName as string ?? ""} onChange={(e) => set("fieldName", e.target.value)} placeholder="e.g. status, priority" className={inputCls} />
          <label className={labelCls}>New Value</label>
          <input value={d.newValue as string ?? ""} onChange={(e) => set("newValue", e.target.value)} placeholder="e.g. resolved" className={inputCls} />
        </div>
      );

    case "WAIT":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Duration</label>
          <div className="flex gap-1.5">
            <input type="number" min={1} value={d.duration as number ?? 1}
              onChange={(e) => set("duration", parseInt(e.target.value, 10) || 1)}
              className={cn(inputCls, "w-20")} />
            <select value={d.unit as string ?? "hours"} onChange={(e) => set("unit", e.target.value)} className={inputCls}>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      );

    case "WEBHOOK":
      return (
        <div className="flex flex-col gap-2">
          <label className={labelCls}>URL</label>
          <input value={d.url as string ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/hook" className={inputCls} />
          <label className={labelCls}>HTTP Method</label>
          <select value={d.method as string ?? "POST"} onChange={(e) => set("method", e.target.value)} className={inputCls}>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="GET">GET</option>
          </select>
          <label className={labelCls}>Payload Template (JSON)</label>
          <textarea rows={5} value={d.payload as string ?? ""} onChange={(e) => set("payload", e.target.value)}
            placeholder='{"ticketId": "{{ticket.id}}"}'
            className={cn(inputCls, "resize-none font-mono text-[10px]")} />
        </div>
      );
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditWorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRBAC();
  const canEdit = can("approvals", "write");

  // Workflow metadata
  const [form, setForm] = useState({
    name: "", description: "", trigger: "ticket_created", isActive: false,
  });
  const [nameError, setNameError] = useState("");

  // Canvas state
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Drag state (mutable ref to avoid re-render on every mousemove)
  const draggingRef = useRef<DraggingState>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Load workflow data ──
  const { data: wfData, isLoading } = trpc.workflows.get.useQuery(
    { id },
    { enabled: canEdit },
  );

  useEffect(() => {
    if (!wfData || loaded) return;
    const { workflow, currentVersion } = wfData as any;
    setForm({
      name: workflow?.name ?? "",
      description: workflow?.description ?? "",
      trigger: workflow?.triggerType ?? "ticket_created",
      isActive: workflow?.isActive ?? false,
    });

    const rawNodes: any[] = currentVersion?.nodes ?? [];
    const rawEdges: any[] = currentVersion?.edges ?? [];

    const parsedNodes: CanvasNode[] = rawNodes.map((n: any) => ({
      id: n.id ?? generateUUID(),
      type: normalizeType(n.type ?? "NOTIFY"),
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      data: (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>,
    }));

    // Apply auto-layout if nodes lack meaningful positions
    const needsLayout = parsedNodes.every(
      (n) => n.position.x === 0 && n.position.y === 0,
    );
    setNodes(needsLayout ? autoLayout(parsedNodes) : parsedNodes);
    setEdges(
      rawEdges.map((e: any) => ({ id: e.id ?? generateUUID(), source: e.source, target: e.target })),
    );
    setLoaded(true);
  }, [wfData, loaded]);

  // ── Save ──
  const utils = trpc.useUtils();
  const saveMutation = trpc.workflows.save.useMutation({
    onSuccess: () => {
      toast.success("Workflow saved");
      void utils.workflows.list.invalidate();
      void utils.workflows.get.invalidate({ id });
      router.push("/app/workflows");
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  function handleSave() {
    if (!form.name.trim()) { setNameError("Name is required"); return; }
    setNameError("");
    saveMutation.mutate({
      id,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      name: form.name,
      description: form.description,
      triggerType: form.trigger as any,
      isActive: form.isActive,
    });
  }

  // ── Drag handlers ──
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      draggingRef.current = {
        nodeId,
        offsetX: e.clientX - rect.left + canvas.scrollLeft - node.position.x,
        offsetY: e.clientY - rect.top  + canvas.scrollTop  - node.position.y,
      };
    },
    [nodes],
  );

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left + canvas.scrollLeft - drag.offsetX);
    const y = Math.max(0, e.clientY - rect.top  + canvas.scrollTop  - drag.offsetY);
    setNodes((prev) =>
      prev.map((n) => n.id === drag.nodeId ? { ...n, position: { x, y } } : n),
    );
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Drop from palette ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType") as NodeType;
    if (!type || !(type in NODE_META)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left + canvas.scrollLeft - NODE_W / 2);
    const y = Math.max(0, e.clientY - rect.top  + canvas.scrollTop  - NODE_H / 2);
    setNodes((prev) => [
      ...prev,
      { id: generateUUID(), type, position: { x, y }, data: defaultData(type) },
    ]);
  }, []);

  // ── Node click / connection ──
  const handleNodeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      if (connectingFrom) {
        if (connectingFrom !== nodeId) {
          setEdges((prev) => [
            ...prev,
            { id: generateUUID(), source: connectingFrom, target: nodeId },
          ]);
        }
        setConnectingFrom(null);
      } else {
        setSelectedId(nodeId);
      }
    },
    [connectingFrom],
  );

  const handleConnectStart = useCallback((nodeId: string) => {
    setConnectingFrom((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
  }, [selectedId]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const handleNodeDataChange = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, data } : n));
  }, []);

  // ── Edge path helpers ──
  function edgePath(edge: CanvasEdge): string | null {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) return null;
    const x1 = src.position.x + NODE_W;
    const y1 = src.position.y + NODE_H / 2;
    const x2 = tgt.position.x;
    const y2 = tgt.position.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }

  function edgeMidpoint(edge: CanvasEdge): { x: number; y: number } | null {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) return null;
    return {
      x: (src.position.x + NODE_W + tgt.position.x) / 2,
      y: (src.position.y + tgt.position.y + NODE_H) / 2,
    };
  }

  // ── Early returns ──
  if (!canEdit) return <AccessDenied module="Workflow Designer" />;

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading workflow…
    </div>
  );

  if (!wfData && !isLoading) return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
      <AlertTriangle className="h-8 w-8 opacity-40" />
      <p className="text-sm">Workflow not found.</p>
      <Link href="/app/workflows" className="text-xs text-primary hover:underline">← Back to Workflows</Link>
    </div>
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const canvasH = Math.max(600, ...nodes.map((n) => n.position.y + NODE_H + 60));
  const canvasW = Math.max(900, ...nodes.map((n) => n.position.x + NODE_W + 60));

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70 px-4 pt-2 pb-1 flex-shrink-0">
        <Link href="/app/workflows" className="hover:text-primary">Workflows</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">{form.name || id.slice(0, 8)}</span>
      </nav>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 flex-shrink-0">
        <Workflow className="h-4 w-4 text-indigo-600 flex-shrink-0" />

        <div className="flex flex-col">
          <input
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(""); }}
            placeholder="Workflow name…"
            className={cn(
              "rounded border bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary w-52",
              nameError ? "border-red-400" : "border-input",
            )}
          />
          {nameError && <span className="text-[10px] text-red-500">{nameError}</span>}
        </div>

        <select
          value={form.trigger}
          onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
          className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TRIGGERS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="rounded"
          />
          Active
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <Link
            href="/app/workflows"
            className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition"
          >
            <X className="h-3 w-3" /> Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {saveMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* ── 3-column body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Node palette */}
        <div className="w-[200px] flex-shrink-0 border-r border-border bg-card overflow-y-auto p-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Node Types</p>
          {PALETTE_NODES.map((type) => {
            const meta = NODE_META[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("nodeType", type)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium cursor-grab active:cursor-grabbing select-none transition hover:shadow-sm",
                  meta.color, meta.border, meta.text,
                )}
              >
                {meta.icon}
                {meta.label}
              </div>
            );
          })}
          <p className="text-[9px] text-muted-foreground/60 mt-2 text-center">Drag onto canvas</p>
        </div>

        {/* Center: Canvas */}
        <div
          ref={canvasRef}
          className={cn(
            "flex-1 overflow-auto relative",
            "bg-[radial-gradient(circle,_#d1d5db_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_#374151_1px,_transparent_1px)] bg-[length:20px_20px] bg-slate-50 dark:bg-slate-900",
            connectingFrom ? "cursor-crosshair" : "cursor-default",
          )}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => {
            if (!connectingFrom) setSelectedId(null);
            setConnectingFrom(null);
          }}
        >
          <div style={{ width: canvasW, height: canvasH, position: "relative" }}>
            {/* SVG edge layer */}
            <svg
              style={{ position: "absolute", inset: 0, width: canvasW, height: canvasH, pointerEvents: "none" }}
              overflow="visible"
            >
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const d = edgePath(edge);
                if (!d) return null;
                return (
                  <path
                    key={edge.id}
                    d={d}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.8}
                    markerEnd="url(#arrowhead)"
                    strokeDasharray="none"
                  />
                );
              })}
            </svg>

            {/* Edge delete buttons */}
            {edges.map((edge) => {
              const mid = edgeMidpoint(edge);
              if (!mid) return null;
              return (
                <button
                  key={`del-${edge.id}`}
                  style={{ position: "absolute", left: mid.x - 8, top: mid.y - 8 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                  className="w-4 h-4 rounded-full bg-background border border-border text-muted-foreground hover:text-red-500 hover:border-red-400 flex items-center justify-center text-[10px] leading-none shadow-sm z-10 transition"
                  title="Delete edge"
                >
                  ×
                </button>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                isConnecting={!!connectingFrom}
                connectingFrom={connectingFrom}
                onMouseDown={handleNodeMouseDown}
                onClick={handleNodeClick}
                onDelete={handleDeleteNode}
                onConnectStart={handleConnectStart}
              />
            ))}

            {/* Empty state */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground pointer-events-none">
                <Plug className="h-10 w-10 opacity-20" />
                <p className="text-sm opacity-40">Drag node types from the left panel to start building</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Config panel */}
        <div className="w-[260px] flex-shrink-0 border-l border-border bg-card overflow-y-auto">
          {selectedNode ? (
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className={cn("rounded p-1", NODE_META[selectedNode.type].color, NODE_META[selectedNode.type].text)}>
                  {NODE_META[selectedNode.type].icon}
                </div>
                <div>
                  <p className="text-xs font-semibold">{NODE_META[selectedNode.type].label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{selectedNode.id.slice(0, 8)}</p>
                </div>
              </div>
              <hr className="border-border" />
              <ConfigPanel node={selectedNode} onChange={handleNodeDataChange} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
              <Edit3 className="h-6 w-6 opacity-30" />
              <p className="text-xs text-center opacity-50">Click a node to configure it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
