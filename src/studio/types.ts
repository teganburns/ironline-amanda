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

export interface JobSpec {
  id?: string;
  jobType: string;
  executeAt: string;
  payload: Record<string, unknown>;
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
