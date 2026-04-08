import type { FlowGraphEdge, FlowGraphNode, FlowNodeData, FlowNodeType } from "../../src/studio/types";

export const FLOW_INPUT_HANDLE_ID = "in";
export const FLOW_OUTPUT_HANDLE_ID = "out";

export const flowNodeTypeLabels: Record<FlowNodeType, string> = {
  trigger: "Trigger",
  classify: "Classify",
  context: "Context",
  agent: "Agent",
  tool: "Tool",
  logic: "Logic",
  output: "Output",
};

export const flowNodeTypeDescriptions: Record<FlowNodeType, string> = {
  trigger: "Start the workflow from an external event or inbound signal.",
  classify: "Route or categorize input before the rest of the pipeline runs.",
  context: "Fetch history, memory, or supporting context for Amanda.",
  agent: "Run Amanda or another model-driven orchestration step.",
  tool: "Call a concrete MCP tool or external action.",
  logic: "Branch, guard, or shape workflow execution rules.",
  output: "Deliver the final result back to the destination channel.",
};

export const FLOW_PALETTE_ITEMS: Array<{
  type: FlowNodeType;
  label: string;
  description: string;
}> = (Object.keys(flowNodeTypeLabels) as FlowNodeType[]).map((type) => ({
  type,
  label: flowNodeTypeLabels[type],
  description: flowNodeTypeDescriptions[type],
}));

type FlowConnectionLike = Pick<FlowGraphEdge, "source" | "target" | "sourceHandle" | "targetHandle">;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createFlowNode(type: FlowNodeType, position: { x: number; y: number }): FlowGraphNode {
  return normalizeFlowNode({
    id: `node-${globalThis.crypto.randomUUID()}`,
    type: "amanda-flow-node",
    position,
    data: {
      label: `New ${flowNodeTypeLabels[type]}`,
      nodeType: type,
      description: flowNodeTypeDescriptions[type],
      enabled: true,
      config: {},
    },
  });
}

export function createFlowEdge(connection: FlowConnectionLike): FlowGraphEdge {
  return normalizeFlowEdge({
    id: `edge-${globalThis.crypto.randomUUID()}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: "smoothstep",
    animated: false,
  });
}

export function formatFlowConfigInput(config?: Record<string, unknown>) {
  return JSON.stringify(config ?? {}, null, 2);
}

export function parseFlowConfigInput(source: string): Record<string, unknown> {
  if (!source.trim()) {
    return {};
  }

  const parsed = JSON.parse(source) as unknown;
  if (!isObject(parsed)) {
    throw new Error("Node config must be a JSON object.");
  }

  return parsed;
}

export function normalizeFlowNode(node: FlowGraphNode): FlowGraphNode {
  const data = isObject(node.data) ? (node.data as FlowNodeData) : ({} as FlowNodeData);
  const nodeType = (data.nodeType ?? "tool") as FlowNodeType;
  const config = isObject(data.config) ? data.config : {};

  return {
    id: node.id,
    type: "amanda-flow-node",
    position: {
      x: Number.isFinite(node.position?.x) ? node.position.x : 0,
      y: Number.isFinite(node.position?.y) ? node.position.y : 0,
    },
    data: {
      label:
        typeof data.label === "string" && data.label.trim()
          ? data.label
          : flowNodeTypeLabels[nodeType],
      nodeType,
      description:
        typeof data.description === "string" && data.description.trim()
          ? data.description
          : flowNodeTypeDescriptions[nodeType],
      enabled: data.enabled !== false,
      config,
    },
  };
}

export function normalizeFlowNodes(nodes: FlowGraphNode[]) {
  return nodes.map((node) => normalizeFlowNode(node));
}

export function normalizeFlowEdge(edge: FlowGraphEdge): FlowGraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      typeof edge.sourceHandle === "string" && edge.sourceHandle.trim()
        ? edge.sourceHandle
        : FLOW_OUTPUT_HANDLE_ID,
    targetHandle:
      typeof edge.targetHandle === "string" && edge.targetHandle.trim()
        ? edge.targetHandle
        : FLOW_INPUT_HANDLE_ID,
    label: typeof edge.label === "string" ? edge.label : undefined,
    type:
      edge.type === "default" || edge.type === "straight" || edge.type === "smoothstep"
        ? edge.type
        : "smoothstep",
    animated: edge.animated === true ? true : undefined,
  };
}

export function normalizeFlowEdges(edges: FlowGraphEdge[]) {
  return edges.map((edge) => normalizeFlowEdge(edge));
}

export function isValidFlowConnection(
  connection: FlowConnectionLike,
  existingEdges: FlowGraphEdge[] = []
) {
  if (!connection.source || !connection.target) {
    return false;
  }

  if (connection.source === connection.target) {
    return false;
  }

  const sourceHandle = connection.sourceHandle ?? FLOW_OUTPUT_HANDLE_ID;
  const targetHandle = connection.targetHandle ?? FLOW_INPUT_HANDLE_ID;

  if (sourceHandle !== FLOW_OUTPUT_HANDLE_ID || targetHandle !== FLOW_INPUT_HANDLE_ID) {
    return false;
  }

  return !existingEdges.some((edge) => {
    const normalized = normalizeFlowEdge(edge);

    return (
      normalized.source === connection.source &&
      normalized.target === connection.target &&
      normalized.sourceHandle === sourceHandle &&
      normalized.targetHandle === targetHandle
    );
  });
}
