import { randomUUID } from "node:crypto";
import { createBridgeInfo } from "./bridge";
import { getDefaultAgentDefinition } from "./agent-definition";
import { createDefaultConnectors } from "./connectors";
import { resolveApprovalMode } from "./approval";
import { MCP_TARGET_IDS, StudioMcpService } from "./mcp";
import { compileActiveFlowRuntimeConfig } from "./flow-blocks";
import { PromptGraphStore, compilePublishedPromptGraph } from "./prompt-graphs";
import { FlowGraphStore } from "./flow-graphs";
import { scheduleTemporalJob } from "./temporal";
import { StudioRunStore } from "./run-store";
import type {
  AgentDefinition,
  ApprovalRule,
  BridgeInfo,
  CompiledPromptPreview,
  ConnectorAdapter,
  FlowGraph,
  FlowGraphDocument,
  FlowGraphInput,
  FlowGraphPatch,
  JobRecord,
  JobSpec,
  McpInvocationResult,
  McpOverview,
  McpPromptDescriptor,
  McpResourceDescriptor,
  McpTargetDefinition,
  McpToolDescriptor,
  PromptGraphNodeInput,
  PromptGraphNodePatch,
  PromptGraphVariant,
  PromptGraphVariantInput,
  PromptGraphVariantPatch,
  RunRequest,
  RunPromptSource,
  RunResult,
  RunSummary,
  SandboxRunRequest,
  StudioConfigSnapshot,
  StudioSnapshot,
} from "./types";
import { callAgent, type MessagePayload, type PromptExecutionOptions } from "../agent";

export interface StudioControlDeps {
  runStore?: StudioRunStore;
  connectors?: ConnectorAdapter[];
  agentDefinition?: AgentDefinition;
  promptGraphStore?: PromptGraphStore;
  mcpService?: StudioMcpService;
  agentExecutor?: (
    payload: MessagePayload,
    request: RunRequest,
    promptExecution?: PromptExecutionOptions
  ) => Promise<RunResult>;
}

interface RuntimeReadinessIssue {
  targetId: string;
  label: string;
  state: McpOverview["status"]["state"];
  detail: string;
  failedStage: McpOverview["failedStage"];
  missingRequiredTools: string[];
}

export class StudioRuntimeReadinessError extends Error {
  readonly code = "runtime_readiness";

  constructor(readonly issues: RuntimeReadinessIssue[]) {
    super(
      `Amanda cannot start because required MCPs are not ready: ${issues
        .map((issue) => `${issue.label} (${issue.detail})`)
        .join("; ")}`
    );
    this.name = "StudioRuntimeReadinessError";
  }
}

function normalizeMessagePayload(request: RunRequest): MessagePayload {
  if (request.messagePayload) {
    return request.messagePayload as unknown as MessagePayload;
  }

  const sender = String(request.context?.sender ?? "+10000000000");
  const chatId = String(request.context?.chat_id ?? `any;-;${sender}`);

  return {
    trigger: "imessage",
    sender,
    sender_name: (request.context?.sender_name as string | null | undefined) ?? "Studio Operator",
    message_type: "text",
    text: request.input,
    chat_id: chatId,
    service: "iMessage",
    timestamp: new Date().toISOString(),
  };
}

export class IronlineStudioControl {
  private readonly runStore: StudioRunStore;
  private readonly connectors: ConnectorAdapter[];
  private readonly agentDefinition: AgentDefinition;
  private readonly promptGraphStore: PromptGraphStore;
  private readonly flowGraphStore: FlowGraphStore;
  private readonly mcpService: StudioMcpService;
  private readonly agentExecutor: (
    payload: MessagePayload,
    request: RunRequest,
    promptExecution?: PromptExecutionOptions
  ) => Promise<RunResult>;

  constructor(deps: StudioControlDeps = {}) {
    this.runStore = deps.runStore ?? new StudioRunStore();
    this.agentDefinition = deps.agentDefinition ?? getDefaultAgentDefinition();
    this.promptGraphStore = deps.promptGraphStore ?? new PromptGraphStore(this.agentDefinition.id);
    this.flowGraphStore = new FlowGraphStore();
    this.mcpService = deps.mcpService ?? new StudioMcpService();
    this.connectors = deps.connectors ?? createDefaultConnectors(this.mcpService);
    this.agentExecutor = deps.agentExecutor ?? ((payload, request, promptExecution) => callAgent(payload, request, promptExecution));
  }

  private getCurrentAgentDefinition(): AgentDefinition {
    return {
      ...this.agentDefinition,
      instructions: compilePublishedPromptGraph(this.agentDefinition.id).compiledInstructions,
    };
  }

  private getPublishedPromptSource(): {
    variant: PromptGraphVariant;
    compiledPrompt: CompiledPromptPreview;
    promptSource: RunPromptSource;
  } {
    const published = compilePublishedPromptGraph(this.agentDefinition.id);
    return {
      variant: published.variant,
      compiledPrompt: {
        variantId: published.variant.id,
        compiledInstructions: published.compiledInstructions,
      },
      promptSource: {
        variantId: published.variant.id,
        variantName: published.variant.name,
        sourceMode: "published",
      },
    };
  }

  private async executeRun(
    request: RunRequest,
    promptSource: RunPromptSource,
    compiledInstructions: string
  ): Promise<RunResult> {
    const approvalRules = this.runStore.listApprovalRules();
    const normalized: RunRequest = {
      ...request,
      id: request.id ?? randomUUID(),
      agentId: request.agentId ?? this.getCurrentAgentDefinition().id,
      approvalMode: resolveApprovalMode(
        request.approvalMode,
        this.getCurrentAgentDefinition().defaultApprovalMode,
        approvalRules
      ),
    };

    await this.ensureRuntimeReadiness(normalized);

    const payload = normalizeMessagePayload(normalized);
    const result = await this.agentExecutor(payload, normalized, {
      compiledInstructions,
      promptSource,
    });
    return this.runStore.saveRun(result);
  }

  private async ensureRuntimeReadiness(request: RunRequest): Promise<void> {
    const flowConfig = compileActiveFlowRuntimeConfig(this.flowGraphStore.getDocument());
    const requiredTargetIds: string[] = [];

    if (flowConfig.mcps.context.enabled && flowConfig.mcps.context.required) {
      requiredTargetIds.push(MCP_TARGET_IDS.localContext);
    }

    if (
      flowConfig.mcps.imessage.enabled &&
      flowConfig.mcps.imessage.required &&
      request.trigger === "imessage"
    ) {
      requiredTargetIds.push(MCP_TARGET_IDS.localIMessage);
    }

    if (flowConfig.mcps.temporal.enabled && flowConfig.mcps.temporal.required) {
      requiredTargetIds.push(MCP_TARGET_IDS.localTemporal);
    }

    if (flowConfig.mcps.browser.enabled && flowConfig.mcps.browser.required) {
      requiredTargetIds.push(MCP_TARGET_IDS.localBrowser);
    }

    if (!requiredTargetIds.length) {
      return;
    }

    const overviews = await Promise.all(requiredTargetIds.map((targetId) => this.mcpService.getOverview(targetId)));
    const blocked = overviews.filter((overview) => overview.status.state !== "ready");

    if (!blocked.length) return;

    throw new StudioRuntimeReadinessError(
      blocked.map((overview) => ({
        targetId: overview.target.id,
        label: overview.target.label,
        state: overview.status.state,
        detail: overview.status.detail,
        failedStage: overview.failedStage,
        missingRequiredTools: overview.missingRequiredTools,
      }))
    );
  }

  async runAgent(request: RunRequest): Promise<RunResult> {
    const published = this.getPublishedPromptSource();
    return this.executeRun(request, published.promptSource, published.compiledPrompt.compiledInstructions);
  }

  async replayRun(runId: string): Promise<RunResult> {
    const prior = this.runStore.getRun(runId);
    if (!prior) {
      throw new Error(`Run ${runId} not found`);
    }

    if (prior.promptSource?.variantId) {
      const variant = this.promptGraphStore.getVariant(prior.promptSource.variantId);
      if (variant) {
        return this.executeRun(
          {
            ...prior.request,
            id: undefined,
            trigger: "replay",
            replayOfRunId: runId,
          },
          {
            variantId: variant.id,
            variantName: variant.name,
            sourceMode: "sandbox",
          },
          this.promptGraphStore.compileVariant(variant.id).compiledInstructions
        );
      }
    }

    return this.runAgent({
      ...prior.request,
      id: undefined,
      trigger: "replay",
      replayOfRunId: runId,
    });
  }

  async scheduleCallback(spec: JobSpec): Promise<JobRecord> {
    const normalized: JobSpec = {
      ...spec,
      id: spec.id ?? randomUUID(),
      status: spec.status ?? "scheduled",
    };
    const scheduled = await scheduleTemporalJob(normalized, {
      allowLocalFallback: normalized.jobType !== "reminder.send",
    });
    return this.runStore.saveJob(
      { ...normalized, id: scheduled.remoteId, status: "scheduled" },
      scheduled.backend
    );
  }

  async listConnectors() {
    const statuses = await Promise.all(
      this.connectors.map(async (connector) => ({
        id: connector.id,
        label: connector.label,
        capabilities: connector.capabilities(),
        status: await connector.health(),
      }))
    );
    return statuses;
  }

  async setApprovalMode(rule: ApprovalRule) {
    return this.runStore.saveApprovalRule(rule);
  }

  async getBridgeInfo(): Promise<BridgeInfo> {
    return createBridgeInfo();
  }

  async getRunTimeline(runId: string) {
    return this.runStore.getRunTimeline(runId);
  }

  async listRuns(limit = 25): Promise<RunSummary[]> {
    return this.runStore.listRunSummaries(limit);
  }

  async getRun(runId: string): Promise<RunResult | null> {
    return this.runStore.getRun(runId);
  }

  async listJobs(limit = 100): Promise<JobRecord[]> {
    return this.runStore.listJobs(limit);
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    return this.runStore.getJob(jobId);
  }

  async getStudioConfig(): Promise<StudioConfigSnapshot> {
    return {
      agents: [this.getCurrentAgentDefinition()],
      approvalRules: this.runStore.listApprovalRules(),
      langfuseBaseUrl: process.env.LANGFUSE_BASE_URL ?? null,
    };
  }

  async listPromptGraphVariants(): Promise<PromptGraphVariant[]> {
    return this.promptGraphStore.listVariants();
  }

  async getPromptGraphVariant(variantId: string): Promise<PromptGraphVariant | null> {
    return this.promptGraphStore.getVariant(variantId);
  }

  async createPromptGraphVariant(input: PromptGraphVariantInput): Promise<PromptGraphVariant> {
    return this.promptGraphStore.createVariant({
      ...input,
      agentId: input.agentId ?? this.agentDefinition.id,
    });
  }

  async updatePromptGraphVariant(variantId: string, patch: PromptGraphVariantPatch): Promise<PromptGraphVariant> {
    return this.promptGraphStore.updateVariant(variantId, patch);
  }

  async deletePromptGraphVariant(variantId: string): Promise<PromptGraphVariant[]> {
    return this.promptGraphStore.deleteVariant(variantId);
  }

  async publishPromptGraphVariant(variantId: string): Promise<PromptGraphVariant> {
    const published = await this.promptGraphStore.publishVariant(variantId);
    return published;
  }

  async createPromptGraphNode(variantId: string, input: PromptGraphNodeInput): Promise<PromptGraphVariant> {
    return this.promptGraphStore.createNode(variantId, input);
  }

  async updatePromptGraphNode(
    variantId: string,
    nodeId: string,
    patch: PromptGraphNodePatch
  ): Promise<PromptGraphVariant> {
    return this.promptGraphStore.updateNode(variantId, nodeId, patch);
  }

  async deletePromptGraphNode(variantId: string, nodeId: string): Promise<PromptGraphVariant> {
    return this.promptGraphStore.deleteNode(variantId, nodeId);
  }

  async reorderPromptGraphNodes(variantId: string, orderedNodeIds: string[]): Promise<PromptGraphVariant> {
    return this.promptGraphStore.reorderNodes(variantId, orderedNodeIds);
  }

  async compilePromptGraphVariant(variantId: string): Promise<CompiledPromptPreview> {
    return this.promptGraphStore.compileVariant(variantId);
  }

  async runSandboxVariantTest(request: SandboxRunRequest): Promise<RunResult> {
    const variant = this.promptGraphStore.getVariant(request.variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${request.variantId} not found`);
    }

    return this.executeRun(
      {
        ...request.runRequest,
        agentId: request.runRequest.agentId ?? this.agentDefinition.id,
      },
      {
        variantId: variant.id,
        variantName: variant.name,
        sourceMode: "sandbox",
      },
      this.promptGraphStore.compileVariant(variant.id).compiledInstructions
    );
  }

  listFlowGraphs(): Promise<FlowGraph[]> {
    return Promise.resolve(this.flowGraphStore.listGraphs());
  }

  getFlowGraphDocument(): Promise<FlowGraphDocument> {
    return Promise.resolve(this.flowGraphStore.getDocument());
  }

  getFlowGraph(id: string): Promise<FlowGraph | null> {
    return Promise.resolve(this.flowGraphStore.getGraph(id));
  }

  createFlowGraph(input: FlowGraphInput): Promise<FlowGraph> {
    return this.flowGraphStore.createGraph(input);
  }

  updateFlowGraph(id: string, patch: FlowGraphPatch): Promise<FlowGraph> {
    return this.flowGraphStore.updateGraph(id, patch);
  }

  deleteFlowGraph(id: string): Promise<FlowGraph[]> {
    return this.flowGraphStore.deleteGraph(id);
  }

  setActiveFlowGraph(id: string): Promise<FlowGraphDocument> {
    return this.flowGraphStore.setActiveGraph(id);
  }

  async listMcpTargets(): Promise<McpTargetDefinition[]> {
    return this.mcpService.listTargets();
  }

  async getMcpOverview(targetId: string): Promise<McpOverview> {
    return this.mcpService.getOverview(targetId);
  }

  async listMcpTools(targetId: string): Promise<McpToolDescriptor[]> {
    return this.mcpService.listTools(targetId);
  }

  async listMcpResources(targetId: string): Promise<McpResourceDescriptor[]> {
    return this.mcpService.listResources(targetId);
  }

  async readMcpResource(targetId: string, uri: string): Promise<McpInvocationResult> {
    return this.mcpService.readResource(targetId, uri);
  }

  async listMcpPrompts(targetId: string): Promise<McpPromptDescriptor[]> {
    return this.mcpService.listPrompts(targetId);
  }

  async getMcpPrompt(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return this.mcpService.getPrompt(targetId, name, args);
  }

  async invokeMcpTool(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return this.mcpService.invokeTool(targetId, name, args);
  }

  async getSnapshot(): Promise<StudioSnapshot> {
    return {
      agents: (await this.getStudioConfig()).agents,
      connectors: await this.listConnectors(),
      recentRuns: await this.listRuns(10),
      jobs: await this.listJobs(20),
      approvalRules: (await this.getStudioConfig()).approvalRules,
    };
  }
}
