export type StudioTrigger = "imessage" | "manual" | "replay" | "scheduled";
export type StudioChannel = "imessage" | "gmail" | "web" | "system";
export type ApprovalMode = "autonomous" | "suggest" | "always_require";
export type RunStatus = "completed" | "failed" | "blocked" | "queued";
export type JobStatus = "scheduled" | "running" | "completed" | "failed";
export type ConnectorState = "ready" | "degraded" | "offline" | "placeholder";
export type PromptGraphNodeType = "core" | "context" | "rules" | "examples" | "tooling";
export type McpTargetKind = "remote" | "local";
export type McpTargetAuthMode = "env_bearer" | "auth_token" | "none";
export type McpInvocationActionType = "tool" | "resource" | "prompt";
export type McpProbeStage = "configuration" | "authentication" | "connect" | "ping" | "list_tools" | "required_tools";
export type JobType = "reminder.send" | "agent.run" | string;

export interface BridgeInfo {
  version: string;
  capabilities: string[];
}

export interface ApprovalRule {
  mode: ApprovalMode;
  connectorScope?: string[];
  toolScope?: string[];
  actionScope?: string[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  model: string;
  instructions: string;
  enabledTools: string[];
  defaultApprovalMode: ApprovalMode;
}

export interface RunRequest {
  id?: string;
  trigger: StudioTrigger;
  channel: StudioChannel;
  input: string;
  context?: Record<string, unknown>;
  agentId?: string;
  approvalMode?: ApprovalMode;
  messagePayload?: Record<string, unknown>;
  replayOfRunId?: string;
}

export interface ToolEvent {
  name: string;
  status: "started" | "completed" | "error" | "skipped";
  timestamp: string;
  summary?: string;
  rawPayload?: unknown;
}

export interface ArtifactRecord {
  kind: "image-description" | "prompt" | "log" | "result";
  label: string;
  content?: string;
  uri?: string;
}

export interface RunPromptSource {
  variantId: string;
  variantName: string;
  sourceMode: "published" | "sandbox";
}

export interface TimelineEvent {
  source: "runtime" | "agent" | "tool" | "job" | "connector";
  kind: string;
  timestamp: string;
  summary: string;
  rawPayload?: unknown;
}

export interface RunResult {
  id: string;
  status: RunStatus;
  output: string | null;
  traceId: string | null;
  toolEvents: ToolEvent[];
  artifacts: ArtifactRecord[];
  startedAt: string;
  finishedAt: string;
  timeline: TimelineEvent[];
  request: RunRequest;
  promptSource?: RunPromptSource;
  tier?: string;
  error?: string;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  output: string | null;
  traceId: string | null;
  startedAt: string;
  finishedAt: string;
  request: RunRequest;
  promptSource?: RunPromptSource;
  tier?: string;
  error?: string;
  toolEventCount: number;
  artifactCount: number;
  timelineCount: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffSeconds: number;
}

export interface ReminderSourceChat {
  chatId: string;
  service: string;
}

export interface ReminderSender {
  identifier: string;
  name?: string | null;
}

export interface ReminderTarget {
  recipient?: string;
  chatId?: string;
  service?: string;
  summary?: string;
}

export interface ReminderJobPayload {
  messageText: string;
  requestedTime: string;
  sourceChat: ReminderSourceChat;
  sender: ReminderSender;
  target: ReminderTarget;
  timezone: string;
}

export interface AgentRunJobPayload {
  channel: StudioChannel;
  input: string;
  context?: Record<string, unknown>;
  messagePayload?: Record<string, unknown>;
}

export interface ReminderDeliveryOutcome {
  ok: boolean;
  deliveredAt?: string;
  targetSummary: string;
  rawResponse?: unknown;
}

export type JobPayload = ReminderJobPayload | AgentRunJobPayload | Record<string, unknown>;

export interface JobSpec {
  id?: string;
  jobType: JobType;
  executeAt: string;
  payload: JobPayload;
  retryPolicy?: RetryPolicy;
  dedupeKey?: string;
  status?: JobStatus;
}

export interface JobRecord extends JobSpec {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  backend: "temporal" | "local";
  lastError?: string;
  completedAt?: string;
  failureDetail?: string;
  delivery?: ReminderDeliveryOutcome;
}

export interface ConnectorStatus {
  state: ConnectorState;
  detail: string;
  lastCheckedAt: string;
}

export interface ConnectorInvocation {
  action: string;
  payload?: Record<string, unknown>;
}

export interface ConnectorAdapter {
  id: string;
  label: string;
  health(): Promise<ConnectorStatus>;
  capabilities(): string[];
  invoke(invocation: ConnectorInvocation): Promise<unknown>;
}

export interface McpAuthDescriptor {
  kind: "bearer" | "none";
  headerName?: string;
  envVarNames: string[];
}

export interface McpTargetDefinition {
  id: string;
  label: string;
  kind: McpTargetKind;
  baseUrl: string | null;
  configured: boolean;
  authMode: McpTargetAuthMode;
  auth: McpAuthDescriptor;
  capabilities: string[];
  requiredTools: string[];
  requiredForRuntime: boolean;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown> | null;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptArgumentDescriptor {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  description?: string;
  arguments?: McpPromptArgumentDescriptor[];
}

export interface McpOverview {
  target: McpTargetDefinition;
  status: ConnectorStatus;
  configured: boolean;
  authConfigured: boolean;
  availableTools: string[];
  missingRequiredTools: string[];
  failedStage: McpProbeStage | null;
  serverVersion?: {
    name?: string;
    version?: string;
  } | null;
  instructions?: string | null;
  serverCapabilities?: Record<string, unknown> | null;
}

export interface McpInvocationRequest {
  targetId: string;
  actionType: McpInvocationActionType;
  nameOrUri: string;
  payload?: Record<string, unknown>;
}

export interface McpInvocationResult {
  targetId: string;
  actionType: McpInvocationActionType;
  ok: boolean;
  summary: string;
  rawResponse: unknown;
  formattedJson: string;
}

export interface PromptGraphNode {
  id: string;
  type: PromptGraphNodeType;
  title: string;
  content: string;
  enabled: boolean;
  order: number;
}

export interface PromptGraphVariant {
  id: string;
  name: string;
  agentId: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: PromptGraphNode[];
}

export interface PromptGraphNodeInput {
  type: PromptGraphNodeType;
  title: string;
  content: string;
  enabled?: boolean;
}

export interface PromptGraphNodePatch {
  type?: PromptGraphNodeType;
  title?: string;
  content?: string;
  enabled?: boolean;
}

export interface PromptGraphVariantInput {
  name: string;
  agentId?: string;
  nodes?: PromptGraphNodeInput[];
}

export interface PromptGraphVariantPatch {
  name?: string;
}

export interface CompiledPromptPreview {
  variantId: string;
  compiledInstructions: string;
}

export interface SandboxRunRequest {
  variantId: string;
  runRequest: RunRequest;
}

export interface StudioSnapshot {
  agents: AgentDefinition[];
  connectors: Array<{
    id: string;
    label: string;
    capabilities: string[];
    status: ConnectorStatus;
  }>;
  recentRuns: RunSummary[];
  jobs: JobRecord[];
  approvalRules: ApprovalRule[];
}

export interface StudioConfigSnapshot {
  agents: AgentDefinition[];
  approvalRules: ApprovalRule[];
  langfuseBaseUrl?: string | null;
}

// ─── Flow Graph (Visual Pipeline Editor) ────────────────────────────────────

export type AmandaTier =
  | "no_reply"
  | "banter"
  | "question"
  | "reasoning"
  | "complex"
  | "correction"
  | "image";

export type FlowNodeType =
  | "trigger"
  | "classify"
  | "context"
  | "agent"
  | "tool"
  | "logic"
  | "action"
  | "output";

export type FlowBlockKey =
  | "trigger.imessage_received"
  | "classify.message"
  | "logic.no_reply_gate"
  | "logic.holding_reply"
  | "context.load_history"
  | "tool.imessage_mcp"
  | "tool.context_mcp"
  | "tool.temporal_mcp"
  | "tool.browser_mcp"
  | "agent.amanda_run"
  | "output.send_reply"
  | "action.mark_read"
  | "action.set_typing";

export interface FlowBlockFieldOption {
  label: string;
  value: string;
}

export interface FlowBlockFieldDefinition {
  key: string;
  label: string;
  kind: "string" | "number" | "boolean" | "select" | "multiselect" | "tier_models";
  description?: string;
  options?: FlowBlockFieldOption[];
  min?: number;
}

export interface FlowBlockDefinition {
  blockKey: FlowBlockKey;
  label: string;
  nodeType: FlowNodeType;
  description: string;
  singleton: boolean;
  requiredForRuntime: boolean;
  schemaVersion: number;
  defaultEnabled?: boolean;
  defaultConfig?: Record<string, unknown>;
  inspectorFields?: FlowBlockFieldDefinition[];
}

export interface FlowRuntimeTierModel {
  model: string;
  maxTurns: number;
}

export interface FlowRuntimeConfig {
  graphId: string;
  graphName: string;
  classifyModel: string;
  holdingReplyTiers: AmandaTier[];
  holdingReply: {
    enabled: boolean;
    fallbackMessage: string | null;
  };
  historyLimit: number;
  imageModel: string;
  tierModels: Record<Exclude<AmandaTier, "no_reply">, FlowRuntimeTierModel>;
  mcps: {
    imessage: { enabled: boolean; required: boolean };
    context: { enabled: boolean; required: boolean };
    temporal: { enabled: boolean; required: boolean };
    browser: { enabled: boolean; required: boolean };
  };
  actions: {
    markRead: { enabled: boolean };
    setTyping: { enabled: boolean; slowOnly: boolean };
  };
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: FlowNodeType;
  blockKey?: FlowBlockKey;
  schemaVersion?: number;
  description?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface FlowGraphNode {
  id: string;
  type: "amanda-flow-node";
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: "smoothstep" | "default" | "straight";
  animated?: boolean;
}

export interface FlowGraph {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
}

export interface FlowGraphDocument {
  graphs: FlowGraph[];
  activeGraphId: string | null;
}

export interface FlowGraphInput {
  name: string;
  description?: string;
}

export interface FlowGraphPatch {
  name?: string;
  description?: string;
  nodes?: FlowGraphNode[];
  edges?: FlowGraphEdge[];
}
