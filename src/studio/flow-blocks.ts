import type {
  AmandaTier,
  FlowBlockDefinition,
  FlowBlockFieldDefinition,
  FlowBlockKey,
  FlowGraph,
  FlowGraphDocument,
  FlowGraphEdge,
  FlowGraphNode,
  FlowNodeData,
  FlowRuntimeConfig,
} from "./types";

const RUNTIME_TIERS: Exclude<AmandaTier, "no_reply">[] = [
  "banter",
  "question",
  "reasoning",
  "complex",
  "correction",
  "image",
];

export const FLOW_TIER_OPTIONS = RUNTIME_TIERS.map((tier) => ({
  label: tier,
  value: tier,
}));

const TIER_MODEL_DEFAULTS: FlowRuntimeConfig["tierModels"] = {
  banter: { model: process.env.TRIAGE_MODEL ?? "gpt-5.4-nano", maxTurns: 8 },
  question: { model: process.env.STANDARD_MODEL ?? "gpt-5.4", maxTurns: 10 },
  reasoning: { model: process.env.STANDARD_MODEL ?? "gpt-5.4", maxTurns: 15 },
  complex: { model: process.env.REASONING_MODEL ?? "gpt-5.4-nano", maxTurns: 15 },
  correction: { model: process.env.REASONING_MODEL ?? "gpt-5.4-nano", maxTurns: 15 },
  image: { model: process.env.REASONING_MODEL ?? "gpt-5.4-nano", maxTurns: 15 },
};

export const DEFAULT_FLOW_RUNTIME_CONFIG: Omit<FlowRuntimeConfig, "graphId" | "graphName"> = {
  classifyModel: process.env.TRIAGE_MODEL ?? "gpt-5.4-nano",
  holdingReplyTiers: ["reasoning", "complex", "correction", "image"],
  holdingReply: {
    enabled: true,
    fallbackMessage: "On it, give me a moment.",
  },
  historyLimit: 15,
  imageModel: process.env.IMAGE_MODEL ?? "gpt-4o",
  tierModels: TIER_MODEL_DEFAULTS,
  mcps: {
    imessage: { enabled: true, required: true },
    context: { enabled: true, required: true },
    temporal: { enabled: true, required: false },
    browser: { enabled: true, required: false },
  },
  actions: {
    markRead: { enabled: true },
    setTyping: { enabled: true, slowOnly: true },
  },
};

const TIER_MODEL_FIELD: FlowBlockFieldDefinition = {
  key: "tierModels",
  label: "Tier models",
  kind: "tier_models",
  description: "Configure which model and turn budget Amanda uses for each response tier.",
};

export const FLOW_BLOCK_DEFINITIONS: FlowBlockDefinition[] = [
  {
    blockKey: "trigger.imessage_received",
    label: "iMessage Received",
    nodeType: "trigger",
    description: "Incoming iMessage from a contact",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
  },
  {
    blockKey: "action.mark_read",
    label: "Mark Read",
    nodeType: "action",
    description: "Mark the current chat as read after Amanda accepts the inbound message for processing.",
    singleton: true,
    requiredForRuntime: false,
    schemaVersion: 1,
    defaultEnabled: true,
  },
  {
    blockKey: "classify.message",
    label: "Message Classification",
    nodeType: "classify",
    description: "gpt-5.4-nano classifies into tier: no_reply, banter, question, reasoning, complex, correction, image",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: {
      model: DEFAULT_FLOW_RUNTIME_CONFIG.classifyModel,
      holdingReplyTiers: DEFAULT_FLOW_RUNTIME_CONFIG.holdingReplyTiers,
    },
    inspectorFields: [
      {
        key: "model",
        label: "Classifier model",
        kind: "string",
        description: "The model Amanda uses during message triage.",
      },
      {
        key: "holdingReplyTiers",
        label: "Slow-tier holding replies",
        kind: "multiselect",
        options: FLOW_TIER_OPTIONS,
        description: "Amanda sends a holding reply for these tiers when the holding-reply block is enabled.",
      },
    ],
  },
  {
    blockKey: "logic.no_reply_gate",
    label: "No Reply Gate",
    nodeType: "logic",
    description: "Silent exit — no message sent to sender",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: { action: "silent_exit" },
  },
  {
    blockKey: "action.set_typing",
    label: "Typing Indicator",
    nodeType: "action",
    description: "Start a typing indicator before slow work begins. BlueBubbles will usually clear it automatically after send or timeout.",
    singleton: true,
    requiredForRuntime: false,
    schemaVersion: 1,
    defaultEnabled: true,
    defaultConfig: { slowOnly: true },
    inspectorFields: [
      {
        key: "slowOnly",
        label: "Only for slow tiers",
        kind: "boolean",
        description: "When enabled, typing starts only for tiers that use the holding-reply lane.",
      },
    ],
  },
  {
    blockKey: "logic.holding_reply",
    label: "Holding Reply",
    nodeType: "logic",
    description: "Immediately sends a brief acknowledgement for slow-processing tiers before the agent runs",
    singleton: true,
    requiredForRuntime: false,
    schemaVersion: 1,
    defaultEnabled: true,
    defaultConfig: {
      fallbackMessage: DEFAULT_FLOW_RUNTIME_CONFIG.holdingReply.fallbackMessage,
    },
    inspectorFields: [
      {
        key: "fallbackMessage",
        label: "Fallback message",
        kind: "string",
        description: "Used when the classifier does not return a custom holding reply.",
      },
    ],
  },
  {
    blockKey: "context.load_history",
    label: "Load History",
    nodeType: "context",
    description: "Fetch recent conversation history from BlueBubbles and inject it into Amanda's input",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: { historyLimit: DEFAULT_FLOW_RUNTIME_CONFIG.historyLimit },
    inspectorFields: [
      {
        key: "historyLimit",
        label: "History limit",
        kind: "number",
        min: 1,
        description: "How many recent messages Amanda loads into context for each run.",
      },
    ],
  },
  {
    blockKey: "tool.imessage_mcp",
    label: "iMessage MCP",
    nodeType: "tool",
    description: "Required — send_message, read receipts, typing indicators, and attachment access",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: { required: true },
    inspectorFields: [
      {
        key: "required",
        label: "Required for runtime",
        kind: "boolean",
        description: "If enabled, Studio will block runs when this MCP target is unavailable.",
      },
    ],
  },
  {
    blockKey: "tool.context_mcp",
    label: "Context MCP",
    nodeType: "tool",
    description: "Required — LanceDB vector memory (memory_store, memory_search)",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: { required: true },
    inspectorFields: [
      {
        key: "required",
        label: "Required for runtime",
        kind: "boolean",
        description: "If enabled, Studio will block runs when this MCP target is unavailable.",
      },
    ],
  },
  {
    blockKey: "tool.temporal_mcp",
    label: "Temporal MCP",
    nodeType: "tool",
    description: "Optional — schedule_reminder and job scheduling via Temporal",
    singleton: true,
    requiredForRuntime: false,
    schemaVersion: 1,
    defaultConfig: { required: false },
    inspectorFields: [
      {
        key: "required",
        label: "Required for runtime",
        kind: "boolean",
        description: "If enabled, Studio will block runs when this MCP target is unavailable.",
      },
    ],
  },
  {
    blockKey: "tool.browser_mcp",
    label: "Browser MCP",
    nodeType: "tool",
    description: "Optional — web browsing and page navigation",
    singleton: true,
    requiredForRuntime: false,
    schemaVersion: 1,
    defaultConfig: { required: false },
    inspectorFields: [
      {
        key: "required",
        label: "Required for runtime",
        kind: "boolean",
        description: "If enabled, Studio will block runs when this MCP target is unavailable.",
      },
    ],
  },
  {
    blockKey: "agent.amanda_run",
    label: "Amanda Agent",
    nodeType: "agent",
    description: "OpenAI Agents SDK run — model and maxTurns determined by tier",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
    defaultConfig: {
      imageModel: DEFAULT_FLOW_RUNTIME_CONFIG.imageModel,
      tierModels: DEFAULT_FLOW_RUNTIME_CONFIG.tierModels,
    },
    inspectorFields: [
      {
        key: "imageModel",
        label: "Image model",
        kind: "string",
        description: "The model Amanda uses for image description before the main agent run.",
      },
      TIER_MODEL_FIELD,
    ],
  },
  {
    blockKey: "output.send_reply",
    label: "Send Reply",
    nodeType: "output",
    description: "Deliver response via send_message, send_image, or send_file tool",
    singleton: true,
    requiredForRuntime: true,
    schemaVersion: 1,
  },
];

const BLOCK_DEFINITION_MAP = new Map(FLOW_BLOCK_DEFINITIONS.map((definition) => [definition.blockKey, definition]));

const LEGACY_NODE_BLOCK_KEYS: Record<string, FlowBlockKey> = {
  "trigger-1": "trigger.imessage_received",
  "classify-1": "classify.message",
  "no-reply-gate-1": "logic.no_reply_gate",
  "holding-reply-1": "logic.holding_reply",
  "context-1": "context.load_history",
  "tool-imessage-1": "tool.imessage_mcp",
  "tool-context-1": "tool.context_mcp",
  "tool-temporal-1": "tool.temporal_mcp",
  "tool-browser-1": "tool.browser_mcp",
  "agent-1": "agent.amanda_run",
  "output-1": "output.send_reply",
  "action-mark-read-1": "action.mark_read",
  "action-typing-1": "action.set_typing",
};

type DefaultBlockTemplate = {
  id: string;
  blockKey: FlowBlockKey;
  position: { x: number; y: number };
};

const DEFAULT_BLOCK_TEMPLATES: DefaultBlockTemplate[] = [
  { id: "trigger-1", blockKey: "trigger.imessage_received", position: { x: 60, y: 300 } },
  { id: "action-mark-read-1", blockKey: "action.mark_read", position: { x: 180, y: 180 } },
  { id: "classify-1", blockKey: "classify.message", position: { x: 300, y: 300 } },
  { id: "no-reply-gate-1", blockKey: "logic.no_reply_gate", position: { x: 520, y: 80 } },
  { id: "action-typing-1", blockKey: "action.set_typing", position: { x: 520, y: 210 } },
  { id: "holding-reply-1", blockKey: "logic.holding_reply", position: { x: 520, y: 340 } },
  { id: "context-1", blockKey: "context.load_history", position: { x: 300, y: 480 } },
  { id: "tool-imessage-1", blockKey: "tool.imessage_mcp", position: { x: 760, y: 80 } },
  { id: "tool-context-1", blockKey: "tool.context_mcp", position: { x: 760, y: 200 } },
  { id: "tool-temporal-1", blockKey: "tool.temporal_mcp", position: { x: 760, y: 320 } },
  { id: "tool-browser-1", blockKey: "tool.browser_mcp", position: { x: 760, y: 440 } },
  { id: "agent-1", blockKey: "agent.amanda_run", position: { x: 1020, y: 300 } },
  { id: "output-1", blockKey: "output.send_reply", position: { x: 1280, y: 300 } },
];

export const DEFAULT_FLOW_GRAPH_EDGES: FlowGraphEdge[] = [
  { id: "e1", source: "trigger-1", target: "action-mark-read-1", type: "smoothstep" },
  { id: "e2", source: "action-mark-read-1", target: "classify-1", type: "smoothstep" },
  { id: "e3", source: "classify-1", target: "no-reply-gate-1", type: "smoothstep", label: "no_reply" },
  { id: "e4", source: "classify-1", target: "action-typing-1", type: "smoothstep", label: "reply" },
  { id: "e5", source: "action-typing-1", target: "holding-reply-1", type: "smoothstep", label: "slow tier" },
  { id: "e6", source: "classify-1", target: "agent-1", type: "smoothstep", label: "fast tier" },
  { id: "e7", source: "holding-reply-1", target: "agent-1", type: "smoothstep" },
  { id: "e8", source: "context-1", target: "agent-1", type: "smoothstep" },
  { id: "e9", source: "tool-imessage-1", target: "agent-1", type: "smoothstep" },
  { id: "e10", source: "tool-context-1", target: "agent-1", type: "smoothstep" },
  { id: "e11", source: "tool-temporal-1", target: "agent-1", type: "smoothstep" },
  { id: "e12", source: "tool-browser-1", target: "agent-1", type: "smoothstep" },
  { id: "e13", source: "agent-1", target: "output-1", type: "smoothstep", animated: true },
];

function cloneConfig(config?: Record<string, unknown>) {
  return config ? JSON.parse(JSON.stringify(config)) as Record<string, unknown> : {};
}

function cloneTierModels(models: FlowRuntimeConfig["tierModels"]) {
  return JSON.parse(JSON.stringify(models)) as FlowRuntimeConfig["tierModels"];
}

export function listFlowBlockDefinitions(): FlowBlockDefinition[] {
  return FLOW_BLOCK_DEFINITIONS.map((definition) => ({
    ...definition,
    defaultConfig: cloneConfig(definition.defaultConfig),
    inspectorFields: definition.inspectorFields?.map((field) => ({
      ...field,
      options: field.options ? [...field.options] : undefined,
    })),
  }));
}

export function getFlowBlockDefinition(blockKey: FlowBlockKey): FlowBlockDefinition {
  const definition = BLOCK_DEFINITION_MAP.get(blockKey);
  if (!definition) {
    throw new Error(`Unknown flow block ${blockKey}`);
  }
  return {
    ...definition,
    defaultConfig: cloneConfig(definition.defaultConfig),
    inspectorFields: definition.inspectorFields?.map((field) => ({
      ...field,
      options: field.options ? [...field.options] : undefined,
    })),
  };
}

export function inferLegacyBlockKey(node: Pick<FlowGraphNode, "id" | "data">): FlowBlockKey | null {
  const explicit = node.data?.blockKey;
  if (explicit && BLOCK_DEFINITION_MAP.has(explicit)) {
    return explicit;
  }

  const byId = LEGACY_NODE_BLOCK_KEYS[node.id];
  if (byId) return byId;

  return null;
}

export function createFlowNodeFromBlockTemplate(
  blockKey: FlowBlockKey,
  position: { x: number; y: number },
  id = `node-${globalThis.crypto.randomUUID()}`
): FlowGraphNode {
  const definition = getFlowBlockDefinition(blockKey);

  const data: FlowNodeData = {
    label: definition.label,
    nodeType: definition.nodeType,
    blockKey,
    schemaVersion: definition.schemaVersion,
    description: definition.description,
    enabled: definition.defaultEnabled ?? true,
    config: cloneConfig(definition.defaultConfig),
  };

  return {
    id,
    type: "amanda-flow-node",
    position,
    data,
  };
}

export function createDefaultFlowGraphNodes(): FlowGraphNode[] {
  return DEFAULT_BLOCK_TEMPLATES.map((template) =>
    createFlowNodeFromBlockTemplate(template.blockKey, template.position, template.id)
  );
}

function mergeConfigs(
  definition: FlowBlockDefinition,
  existingConfig?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...cloneConfig(definition.defaultConfig),
    ...(existingConfig ?? {}),
  };
}

function normalizeBlockNode(node: FlowGraphNode): FlowGraphNode {
  const blockKey = inferLegacyBlockKey(node);
  if (!blockKey) {
    return node;
  }

  const definition = getFlowBlockDefinition(blockKey);
  return {
    ...node,
    data: {
      ...node.data,
      label:
        typeof node.data?.label === "string" && node.data.label.trim()
          ? node.data.label
          : definition.label,
      nodeType: definition.nodeType,
      blockKey,
      schemaVersion: definition.schemaVersion,
      description:
        typeof node.data?.description === "string" && node.data.description.trim()
          ? node.data.description
          : definition.description,
      enabled:
        typeof node.data?.enabled === "boolean" ? node.data.enabled : definition.defaultEnabled ?? true,
      config: mergeConfigs(definition, node.data?.config as Record<string, unknown> | undefined),
    },
  };
}

function graphLooksLikeDefaultPipeline(graph: FlowGraph) {
  return (
    graph.id === "amanda-pipeline-default" ||
    ["trigger-1", "classify-1", "agent-1", "output-1"].every((nodeId) =>
      graph.nodes.some((node) => node.id === nodeId)
    )
  );
}

function mergeMissingDefaultBlocks(graph: FlowGraph): FlowGraph {
  if (!graphLooksLikeDefaultPipeline(graph)) {
    return graph;
  }

  const existingIds = new Set(graph.nodes.map((node) => node.id));
  const existingEdges = new Set(graph.edges.map((edge) => edge.id));

  const missingNodes = DEFAULT_BLOCK_TEMPLATES
    .filter((template) => !existingIds.has(template.id))
    .map((template) =>
      createFlowNodeFromBlockTemplate(template.blockKey, template.position, template.id)
    );

  const missingEdges = DEFAULT_FLOW_GRAPH_EDGES.filter((edge) => !existingEdges.has(edge.id));

  if (!missingNodes.length && !missingEdges.length) {
    return graph;
  }

  return {
    ...graph,
    nodes: [...graph.nodes, ...missingNodes],
    edges: [...graph.edges, ...missingEdges],
  };
}

function normalizeGraph(graph: FlowGraph): FlowGraph {
  const nodes = mergeMissingDefaultBlocks({
    ...graph,
    nodes: graph.nodes.map((node) => normalizeBlockNode(node)),
  }).nodes.map((node) => normalizeBlockNode(node));

  return {
    ...graph,
    nodes,
  };
}

export function normalizeFlowGraphDocument(document: FlowGraphDocument): FlowGraphDocument {
  const graphs = (Array.isArray(document.graphs) ? document.graphs : []).map((graph) =>
    normalizeGraph(graph)
  );

  const activeGraphId =
    document.activeGraphId && graphs.some((graph) => graph.id === document.activeGraphId)
      ? document.activeGraphId
      : graphs[0]?.id ?? null;

  return {
    graphs,
    activeGraphId,
  };
}

function getBlockNodes(graph: FlowGraph, blockKey: FlowBlockKey) {
  const matches = graph.nodes.filter((node) => node.data?.blockKey === blockKey);
  const enabled = matches.filter((node) => node.data?.enabled !== false);

  if (enabled.length > 1) {
    throw new Error(`Active flow graph has multiple enabled ${blockKey} blocks. Disable duplicates before running Amanda.`);
  }

  return {
    all: matches,
    selected: enabled[0] ?? matches[0] ?? null,
  };
}

function requireSingletonBlock(graph: FlowGraph, blockKey: FlowBlockKey, required: boolean) {
  const matches = getBlockNodes(graph, blockKey);
  if (required && matches.all.length === 0) {
    throw new Error(`Active flow graph is missing a required ${blockKey} block.`);
  }
  return matches.selected;
}

function coerceTierArray(value: unknown, fallback: AmandaTier[]): AmandaTier[] {
  if (!Array.isArray(value)) return fallback;
  const tiers = value.filter((tier): tier is AmandaTier =>
    typeof tier === "string" &&
    (["no_reply", ...RUNTIME_TIERS] as string[]).includes(tier)
  );
  return tiers.length ? tiers : fallback;
}

function coerceNumber(value: unknown, fallback: number, min = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

function coerceString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function coerceTierModels(value: unknown, fallback: FlowRuntimeConfig["tierModels"]): FlowRuntimeConfig["tierModels"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneTierModels(fallback);
  }

  const next = cloneTierModels(fallback);
  for (const tier of RUNTIME_TIERS) {
    const modelConfig = (value as Record<string, unknown>)[tier];
    if (!modelConfig || typeof modelConfig !== "object" || Array.isArray(modelConfig)) {
      continue;
    }

    next[tier] = {
      model: coerceString((modelConfig as Record<string, unknown>).model, fallback[tier].model),
      maxTurns: coerceNumber((modelConfig as Record<string, unknown>).maxTurns, fallback[tier].maxTurns),
    };
  }

  return next;
}

export function compileActiveFlowRuntimeConfig(document: FlowGraphDocument): FlowRuntimeConfig {
  const normalized = normalizeFlowGraphDocument(document);
  const activeGraph = normalized.graphs.find((graph) => graph.id === normalized.activeGraphId);

  if (!activeGraph) {
    throw new Error("Amanda has no active flow graph configured.");
  }

  for (const definition of FLOW_BLOCK_DEFINITIONS.filter((item) => item.singleton)) {
    requireSingletonBlock(activeGraph, definition.blockKey, definition.requiredForRuntime);
  }

  const classifyNode = requireSingletonBlock(activeGraph, "classify.message", true);
  const holdingReplyNode = requireSingletonBlock(activeGraph, "logic.holding_reply", false);
  const contextNode = requireSingletonBlock(activeGraph, "context.load_history", true);
  const imessageNode = requireSingletonBlock(activeGraph, "tool.imessage_mcp", true);
  const contextMcpNode = requireSingletonBlock(activeGraph, "tool.context_mcp", true);
  const temporalNode = requireSingletonBlock(activeGraph, "tool.temporal_mcp", false);
  const browserNode = requireSingletonBlock(activeGraph, "tool.browser_mcp", false);
  const agentNode = requireSingletonBlock(activeGraph, "agent.amanda_run", true);
  const markReadNode = requireSingletonBlock(activeGraph, "action.mark_read", false);
  const typingNode = requireSingletonBlock(activeGraph, "action.set_typing", false);

  const classifyConfig = (classifyNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const holdingReplyConfig = (holdingReplyNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const contextConfig = (contextNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const imessageConfig = (imessageNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const contextMcpConfig = (contextMcpNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const temporalConfig = (temporalNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const browserConfig = (browserNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const agentConfig = (agentNode?.data?.config as Record<string, unknown> | undefined) ?? {};
  const typingConfig = (typingNode?.data?.config as Record<string, unknown> | undefined) ?? {};

  return {
    graphId: activeGraph.id,
    graphName: activeGraph.name,
    classifyModel: coerceString(classifyConfig.model, DEFAULT_FLOW_RUNTIME_CONFIG.classifyModel),
    holdingReplyTiers: coerceTierArray(
      classifyConfig.holdingReplyTiers,
      DEFAULT_FLOW_RUNTIME_CONFIG.holdingReplyTiers
    ),
    holdingReply: {
      enabled: holdingReplyNode?.data?.enabled !== false,
      fallbackMessage:
        typeof holdingReplyConfig.fallbackMessage === "string"
          ? holdingReplyConfig.fallbackMessage
          : DEFAULT_FLOW_RUNTIME_CONFIG.holdingReply.fallbackMessage,
    },
    historyLimit: coerceNumber(contextConfig.historyLimit, DEFAULT_FLOW_RUNTIME_CONFIG.historyLimit),
    imageModel: coerceString(agentConfig.imageModel, DEFAULT_FLOW_RUNTIME_CONFIG.imageModel),
    tierModels: coerceTierModels(agentConfig.tierModels, DEFAULT_FLOW_RUNTIME_CONFIG.tierModels),
    mcps: {
      imessage: {
        enabled: imessageNode?.data?.enabled !== false,
        required: coerceBoolean(imessageConfig.required, DEFAULT_FLOW_RUNTIME_CONFIG.mcps.imessage.required),
      },
      context: {
        enabled: contextMcpNode?.data?.enabled !== false,
        required: coerceBoolean(contextMcpConfig.required, DEFAULT_FLOW_RUNTIME_CONFIG.mcps.context.required),
      },
      temporal: {
        enabled: temporalNode?.data?.enabled !== false,
        required: coerceBoolean(temporalConfig.required, DEFAULT_FLOW_RUNTIME_CONFIG.mcps.temporal.required),
      },
      browser: {
        enabled: browserNode?.data?.enabled !== false,
        required: coerceBoolean(browserConfig.required, DEFAULT_FLOW_RUNTIME_CONFIG.mcps.browser.required),
      },
    },
    actions: {
      markRead: {
        enabled: markReadNode?.data?.enabled !== false,
      },
      setTyping: {
        enabled: typingNode?.data?.enabled !== false,
        slowOnly: coerceBoolean(typingConfig.slowOnly, DEFAULT_FLOW_RUNTIME_CONFIG.actions.setTyping.slowOnly),
      },
    },
  };
}

export function createDefaultFlowGraphDocument(nowIso: string): FlowGraphDocument {
  const defaultGraph: FlowGraph = {
    id: "amanda-pipeline-default",
    name: "Amanda Pipeline",
    description: "The default Amanda message processing pipeline",
    createdAt: nowIso,
    updatedAt: nowIso,
    nodes: createDefaultFlowGraphNodes(),
    edges: DEFAULT_FLOW_GRAPH_EDGES,
  };

  return {
    graphs: [defaultGraph],
    activeGraphId: defaultGraph.id,
  };
}
