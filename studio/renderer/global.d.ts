import type {
  ApprovalRule,
  BridgeInfo,
  CompiledPromptPreview,
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
  RunResult,
  RunSummary,
  SandboxRunRequest,
  StudioConfigSnapshot,
  StudioSnapshot,
} from "../../src/studio/types";

declare global {
  interface Window {
    ironlineStudio: {
      getBridgeInfo(): Promise<BridgeInfo>;
      getSnapshot(): Promise<StudioSnapshot>;
      listRuns(limit?: number): Promise<RunSummary[]>;
      getRun(runId: string): Promise<RunResult | null>;
      listJobs(limit?: number): Promise<JobRecord[]>;
      getJob(jobId: string): Promise<JobRecord | null>;
      getStudioConfig(): Promise<StudioConfigSnapshot>;
      listPromptGraphVariants(): Promise<PromptGraphVariant[]>;
      getPromptGraphVariant(variantId: string): Promise<PromptGraphVariant | null>;
      createPromptGraphVariant(input: PromptGraphVariantInput): Promise<PromptGraphVariant>;
      updatePromptGraphVariant(variantId: string, patch: PromptGraphVariantPatch): Promise<PromptGraphVariant>;
      deletePromptGraphVariant(variantId: string): Promise<PromptGraphVariant[]>;
      publishPromptGraphVariant(variantId: string): Promise<PromptGraphVariant>;
      createPromptGraphNode(variantId: string, input: PromptGraphNodeInput): Promise<PromptGraphVariant>;
      updatePromptGraphNode(
        variantId: string,
        nodeId: string,
        patch: PromptGraphNodePatch
      ): Promise<PromptGraphVariant>;
      deletePromptGraphNode(variantId: string, nodeId: string): Promise<PromptGraphVariant>;
      reorderPromptGraphNodes(variantId: string, orderedNodeIds: string[]): Promise<PromptGraphVariant>;
      compilePromptGraphVariant(variantId: string): Promise<CompiledPromptPreview>;
      runSandboxVariantTest(request: SandboxRunRequest): Promise<RunResult>;
      listMcpTargets(): Promise<McpTargetDefinition[]>;
      getMcpOverview(targetId: string): Promise<McpOverview>;
      listMcpTools(targetId: string): Promise<McpToolDescriptor[]>;
      listMcpResources(targetId: string): Promise<McpResourceDescriptor[]>;
      readMcpResource(targetId: string, uri: string): Promise<McpInvocationResult>;
      listMcpPrompts(targetId: string): Promise<McpPromptDescriptor[]>;
      getMcpPrompt(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult>;
      invokeMcpTool(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult>;
      runAgent(request: RunRequest): Promise<RunResult>;
      replayRun(runId: string): Promise<RunResult>;
      scheduleCallback(spec: JobSpec): Promise<JobRecord>;
      listConnectors(): Promise<StudioSnapshot["connectors"]>;
      setApprovalMode(rule: ApprovalRule): Promise<ApprovalRule[]>;
      getRunTimeline(runId: string): Promise<RunResult["timeline"]>;
      listProcesses(): Promise<unknown>;
      startProcess(id: string): Promise<unknown>;
      stopProcess(id: string): Promise<unknown>;
      quitApp(): Promise<void>;
      restartApp(): Promise<void>;
      rebuildAndRestart(): Promise<void>;
    };
  }
}

export {};
