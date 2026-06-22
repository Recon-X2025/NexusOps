"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Connection,
  Edge,
  Node,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Workflow,
  Plus,
  Play,
  Pause,
  ChevronRight,
  Settings,
  Mail,
  Bell,
  MessageSquare,
  Zap,
  Clock,
  Save,
  Trash2,
  GitBranch,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

// ── Types ──────────────────────────────────────────────────────────────────
type Action = {
  name: string;
  category: string;
  displayName: string;
  description: string;
  inputs: Record<string, any>;
};

const CATEGORY_COLOR: Record<string, string> = {
  Incident: "text-red-700 bg-red-100 border-red-200",
  HRSD: "text-blue-700 bg-blue-100 border-blue-200",
  SecOps: "text-orange-700 bg-orange-100 border-orange-200",
  Change: "text-yellow-700 bg-yellow-100 border-yellow-200",
  SAM: "text-green-700 bg-green-100 border-green-200",
  ITOM: "text-purple-700 bg-purple-100 border-purple-200",
  "Service Catalog": "text-indigo-700 bg-indigo-100 border-indigo-200",
  Automation: "text-slate-700 bg-slate-100 border-slate-200",
};

const ICON_MAP: Record<string, any> = {
  "Notify via Email": Mail,
  "Notify via WhatsApp": MessageSquare,
  "Escalate on SLA Breach": Zap,
  "Schedule Check": Clock,
  "External HTTP Request (Webhook)": GitBranch,
  "Custom JavaScript Script": Settings,
  "Blank Custom Step": Plus,
};

// ── Custom Node ───────────────────────────────────────────────────────────
const WorkflowNode = ({ data, selected }: { data: any, selected?: boolean }) => {
  const Icon = ICON_MAP[data.label] || Settings;
  const colors = CATEGORY_COLOR[data.category] || CATEGORY_COLOR.Automation;

  return (
    <div className={`p-3 rounded-lg border-2 shadow-sm min-w-[200px] bg-white transition-all ${selected ? "border-primary ring-2 ring-primary/20 scale-105" : colors}`}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-slate-400" />
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
          {data.category || "Step"}
        </span>
      </div>
      <div className="text-[12px] font-semibold text-foreground leading-tight">{data.label}</div>
      <div className="text-[10px] opacity-70 mt-1 line-clamp-2">{data.description}</div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
};

const nodeTypes = {
  workflow: WorkflowNode,
};

// ── Page Component ─────────────────────────────────────────────────────────
export default function FlowDesignerPage() {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "designer">("list");
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [customActions, setCustomActions] = useState<Action[]>([]);
  const [isRegisteringAction, setIsRegisteringAction] = useState(false);
  const [newAction, setNewAction] = useState({ displayName: "", category: "Automation", description: "" });

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeData = (id: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
  };

  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  };

  const onNodesDelete = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onEdgesDelete = useCallback(() => {
    // edges are deleted by reactflow automatically if key is pressed
  }, []);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            style: { stroke: "#3b82f6", strokeWidth: 2 },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const canView = can("approvals", "read");
  const flowsQuery = trpc.workflows.list.useQuery(undefined, mergeTrpcQueryOpts("workflows.list", { enabled: canView }));
  const actionsQuery = trpc.workflows.listAvailableActions.useQuery(undefined, mergeTrpcQueryOpts("workflows.listAvailableActions", { enabled: view === "designer" }));
  const flowDetailQuery = trpc.workflows.get.useQuery({ id: selectedFlowId! }, { enabled: !!selectedFlowId && view === "designer" });

  const createFlowMutation = trpc.workflows.create.useMutation({
    onSuccess: (data) => {
      flowsQuery.refetch();
      toast.success("Flow created");
      setSelectedFlowId(data.id);
      setView("designer");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create flow"),
  });

  const saveFlowMutation = trpc.workflows.save.useMutation({
    onSuccess: () => {
      flowsQuery.refetch();
      toast.success("Workflow saved successfully");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save workflow"),
  });

  const publishFlowMutation = trpc.workflows.publish.useMutation({
    onSuccess: () => {
      flowsQuery.refetch();
      toast.success("Flow activated and published");
    },
    onError: (e: any) => toast.error(e.message || "Failed to activate flow"),
  });

  const toggleFlowMutation = trpc.workflows.toggle.useMutation({
    onSuccess: () => flowsQuery.refetch(),
    onError: (e: any) => toast.error(e.message || "Failed to toggle flow"),
  });

  // Load flow data into reactflow state
  useEffect(() => {
    if (flowDetailQuery.data?.currentVersion) {
      // @ts-ignore
      setNodes(flowDetailQuery.data.currentVersion.nodes || []);
      // @ts-ignore
      setEdges(flowDetailQuery.data.currentVersion.edges || []);
    } else if (flowDetailQuery.data) {
      setNodes([]);
      setEdges([]);
    }
  }, [flowDetailQuery.data, setNodes, setEdges]);

  const addNode = (action: Action) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: "workflow",
      position: { x: 100, y: nodes.length * 100 + 50 },
      data: {
        label: action.displayName,
        category: action.category,
        description: action.description,
        actionName: action.name,
        config: {},
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  if (!canView) return <AccessDenied module="Flow Designer" />;

  const FLOWS: any[] = (flowsQuery.data ?? []).map((f: any) => ({
    ...f,
    status: f.isActive ? "active" : "paused",
    trigger: f.triggerType || "manual",
  }));

  const allActions = useMemo(() => {
    const base = actionsQuery.data ?? [];
    return [...base, ...customActions];
  }, [actionsQuery.data, customActions]);

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Flow Designer</h1>
          <span className="text-[11px] text-muted-foreground/70">
            Workflow Automation · Process Triggers · Integration Flows
          </span>
        </div>
        <div className="flex items-center gap-2">
          {view === "designer" && (
             <button
              onClick={() => saveFlowMutation.mutate({
                id: selectedFlowId!,
                // @ts-ignore
                nodes,
                // @ts-ignore
                edges
              })}
              className="flex items-center gap-1 px-3 py-1 border border-border rounded text-[11px] text-muted-foreground hover:bg-muted/30"
            >
              <Save className="w-3 h-3" /> Save Draft
            </button>
          )}
          <button
            onClick={() => setView(view === "list" ? "designer" : "list")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Settings className="w-3 h-3" /> {view === "list" ? "Open Designer" : "Back to List"}
          </button>
          <button
            onClick={() =>
              createFlowMutation.mutate({
                name: `New Flow ${flowsQuery.data?.length ? flowsQuery.data.length + 1 : 1}`,
                triggerType: "manual",
                triggerConfig: {},
              })
            }
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Flow
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Active Flows", value: FLOWS.filter((f) => f.isActive).length, color: "text-green-700" },
              { label: "Executions (30d)", value: FLOWS.reduce((s, f) => s + (f.executionCount30d || 0), 0), color: "text-blue-700" },
              { label: "Avg Success Rate", value: "100%", color: "text-green-700" },
              { label: "Paused / Review", value: FLOWS.filter((f) => !f.isActive).length, color: "text-yellow-700" },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
                <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded overflow-hidden">
            <table className="ent-table w-full text-[12px]">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Flow Name</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Last Run</th>
                  <th className="text-center">Runs (30d)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flowsQuery.isLoading ? (
                   <tr><td colSpan={7} className="text-center py-8">Loading flows...</td></tr>
                ) : FLOWS.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No flows found. Create one to get started.</td></tr>
                ) : (
                  FLOWS.map((f: any) => (
                    <tr key={f.id} className={!f.isActive ? "opacity-70" : ""}>
                      <td className="p-0">
                        <div className={`priority-bar ${f.isActive ? "bg-green-500" : "bg-yellow-500"}`} />
                      </td>
                      <td>
                        <div className="font-medium">{f.name}</div>
                        <div className="text-[10px] text-muted-foreground">{f.description || "No description"}</div>
                      </td>
                      <td className="capitalize font-mono text-[11px]">{f.trigger}</td>
                      <td>
                        <span className={`status-badge ${f.isActive ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                          {f.isActive ? "● Active" : "⏸ Paused"}
                        </span>
                      </td>
                      <td className="text-muted-foreground text-[11px]">
                        {f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="text-center">{f.executionCount30d || 0}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedFlowId(f.id); setView("designer"); }}
                            className="text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleFlowMutation.mutate({ id: f.id, isActive: !f.isActive })}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {f.isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 flex-1 overflow-hidden">
          {/* Action Palette */}
          <div className="w-64 bg-card border border-border rounded flex flex-col shrink-0">
            <div className="p-3 border-b border-border bg-muted/30">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Action Palette</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Add logic to your flowchart</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button 
                  onClick={() => {
                    const blankAction = allActions.find(a => a.name === "blank_step");
                    if (blankAction) addNode(blankAction);
                    else addNode({ 
                      name: "blank_step", 
                      category: "Automation", 
                      displayName: "Blank Step", 
                      description: "Custom step",
                      inputs: {}
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-primary/5 border border-primary/20 text-primary text-[10px] font-semibold rounded hover:bg-primary/10 transition-colors"
                >
                  <Plus className="w-2.5 h-2.5" /> Blank Box
                </button>
                <button 
                  onClick={() => setIsRegisteringAction(true)}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold rounded hover:bg-slate-200 transition-colors"
                >
                  <Zap className="w-2.5 h-2.5 text-orange-500" /> Define New
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {allActions.map((action: Action) => (
                <div
                  key={action.name}
                  onClick={() => addNode(action)}
                  className="p-2 border border-border rounded bg-muted/20 hover:bg-muted/50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-primary/70 uppercase">{action.category}</span>
                    <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <div className="text-[11px] font-semibold">{action.displayName}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{action.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-card border border-border rounded relative overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold">
                  {flowsQuery.data?.find((f) => f.id === selectedFlowId)?.name || "Visual Designer"}
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">v{flowDetailQuery.data?.workflow.currentVersion || 1}</span>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!selectedFlowId || publishFlowMutation.isPending}
                  onClick={() => publishFlowMutation.mutate({ id: selectedFlowId! })}
                  className="px-3 py-1 bg-primary text-white rounded text-[11px] hover:bg-primary/90 flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> {publishFlowMutation.isPending ? "Activating..." : "Activate"}
                </button>
              </div>
            </div>
            <div className="flex-1 relative flex">
              <div className="flex-1">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  onNodesDelete={onNodesDelete}
                  onEdgesDelete={onEdgesDelete}
                  deleteKeyCode={["Backspace", "Delete"]}
                  nodeTypes={nodeTypes}
                  fitView
                >
                  <Background color="#94a3b8" gap={16} />
                  <Controls />
                </ReactFlow>
              </div>

              {selectedNodeId && (
                <div className="w-72 bg-card border-l border-border flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
                  <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between">
                    <h2 className="text-[11px] font-bold uppercase tracking-wider">Step Configuration</h2>
                    <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-foreground">
                      <Plus className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                  <div className="p-4 space-y-4 overflow-y-auto">
                    {(() => {
                      const node = nodes.find((n) => n.id === selectedNodeId);
                      if (!node) return null;
                      return (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">Step Name</label>
                            <input
                              type="text"
                              value={node.data.label}
                              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
                              className="w-full px-2 py-1.5 text-[12px] bg-muted/20 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">Description</label>
                            <textarea
                              rows={3}
                              value={node.data.description}
                              onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
                              className="w-full px-2 py-1.5 text-[11px] bg-muted/20 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                            />
                          </div>
                          
                          <div className="pt-4 border-t border-border">
                            <button
                              onClick={() => deleteNode(node.id)}
                              className="w-full flex items-center justify-center gap-2 py-2 text-[11px] text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Delete Step
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Register Action Modal */}
      {isRegisteringAction && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center z-[100] p-4">
          <div className="bg-white border border-border rounded-lg shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Define New Workflow Action</h3>
              <button onClick={() => setIsRegisteringAction(false)} className="text-muted-foreground hover:text-foreground">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Display Name</label>
                <input 
                  type="text" 
                  value={newAction.displayName}
                  onChange={e => setNewAction(a => ({...a, displayName: e.target.value}))}
                  placeholder="e.g. Jira: Create Ticket"
                  className="w-full px-3 py-2 text-[12px] border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                <select 
                  value={newAction.category}
                  onChange={e => setNewAction(a => ({...a, category: e.target.value}))}
                  className="w-full px-3 py-2 text-[12px] border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-sm bg-white"
                >
                  {Object.keys(CATEGORY_COLOR).map(cat => <option key={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Description</label>
                <textarea 
                  rows={2}
                  value={newAction.description}
                  onChange={e => setNewAction(a => ({...a, description: e.target.value}))}
                  placeholder="What does this action do?"
                  className="w-full px-3 py-2 text-[11px] border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-sm resize-none" 
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button 
                  onClick={() => setIsRegisteringAction(false)}
                  className="flex-1 py-2 text-[12px] border border-border rounded-md hover:bg-muted/30 text-muted-foreground"
                >
                  Cancel
                </button>
                <button 
                  disabled={!newAction.displayName}
                  onClick={() => {
                    const action: Action = {
                      name: `custom_${Date.now()}`,
                      category: newAction.category,
                      displayName: newAction.displayName,
                      description: newAction.description,
                      inputs: {}
                    };
                    setCustomActions(prev => [action, ...prev]);
                    setIsRegisteringAction(false);
                    setNewAction({ displayName: "", category: "Automation", description: "" });
                    toast.success("New action added to palette");
                  }}
                  className="flex-1 py-2 text-[12px] bg-primary text-white rounded-md hover:bg-primary/90 font-semibold disabled:opacity-40"
                >
                  Register Action
                </button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground/70 px-4 italic">
                * Note: Custom actions defined here are local to this session until promoted to system actions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
