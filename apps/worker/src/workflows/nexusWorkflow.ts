import {
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";
import type { WorkflowActivities } from "../activities/workflow-activities";

const acts = proxyActivities<WorkflowActivities>({
  startToCloseTimeout: "30 seconds",
});

export interface NexusWorkflowInput {
  workflowId: string;
  versionId: string;
  orgId: string;
  runId: string;
  triggerData: Record<string, unknown>;
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

export const approvalSignal = defineSignal<[{ approved: boolean; comment?: string }]>("approval");

export async function nexusWorkflow(input: NexusWorkflowInput): Promise<void> {
  const { nodes, edges, orgId, runId, triggerData } = input;

  // Build source → targets adjacency map
  const nextMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!nextMap.has(e.source)) nextMap.set(e.source, []);
    nextMap.get(e.source)!.push(e.target);
  }

  const triggerNode = nodes.find((n) => n.type.toUpperCase() === "TRIGGER");
  if (!triggerNode) return;

  // BFS execution starting from nodes after the trigger
  const queue = [...(nextMap.get(triggerNode.id) ?? [])];
  const visited = new Set<string>([triggerNode.id]);
  const context: Record<string, unknown> = { ...triggerData };

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const type = node.type.toUpperCase();

    if (type === "WAIT") {
      const duration = (node.data["duration"] as number) ?? 1;
      const unit = (node.data["unit"] as string) ?? "hours";
      const ms =
        unit === "minutes" ? duration * 60_000 :
        unit === "hours"   ? duration * 3_600_000 :
        unit === "days"    ? duration * 86_400_000 : 60_000;
      await sleep(ms);
    } else if (type === "CONDITION") {
      await acts.evaluateCondition({
        orgId,
        runId,
        nodeId,
        expression: node.data["expression"] as string,
        context,
      });
      const result = context[`__cond_${nodeId}`] as boolean;
      const trueEdges  = edges.filter((e) => e.source === nodeId && !e.id.includes("false"));
      const falseEdges = edges.filter((e) => e.source === nodeId && e.id.includes("false"));
      const nextNodes  = result ? trueEdges.map((e) => e.target) : falseEdges.map((e) => e.target);
      queue.push(...nextNodes);
      continue;
    } else if (type === "ASSIGN") {
      await acts.assignTicket({ orgId, runId, nodeId, data: node.data, context });
    } else if (type === "NOTIFY") {
      await acts.sendNotification({ orgId, runId, nodeId, data: node.data, context });
    } else if (type === "UPDATE_FIELD") {
      await acts.updateTicketField({ orgId, runId, nodeId, data: node.data, context });
    } else if (type === "WEBHOOK") {
      await acts.callWebhook({ orgId, runId, nodeId, data: node.data, context });
    }

    const nextNodes = nextMap.get(nodeId) ?? [];
    queue.push(...nextNodes);
  }

  await acts.completeRun({ orgId, runId });
}
