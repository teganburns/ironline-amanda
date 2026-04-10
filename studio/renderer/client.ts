import type {
  ApprovalRule,
  BridgeInfo,
  CompiledPromptPreview,
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
  RunResult,
  RunSummary,
  SandboxRunRequest,
  StudioConfigSnapshot,
  StudioSnapshot,
} from "../../src/studio/types";
import { callBridgeMethod } from "./bridge";

export interface StudioProcessRecord {
  id: string;
  running: boolean;
  externallyRunning: boolean;
  command: string;
  cwd: string;
  logs: string[];
}

export const studioClient = {
  getBridgeInfo(): Promise<BridgeInfo> {
    return callBridgeMethod("getBridgeInfo");
  },
  getSnapshot(): Promise<StudioSnapshot> {
    return callBridgeMethod("getSnapshot");
  },
  listRuns(limit = 25): Promise<RunSummary[]> {
    return callBridgeMethod("listRuns", limit);
  },
  getRun(runId: string): Promise<RunResult | null> {
    return callBridgeMethod("getRun", runId);
  },
  listJobs(limit = 100): Promise<JobRecord[]> {
    return callBridgeMethod("listJobs", limit);
  },
  getJob(jobId: string): Promise<JobRecord | null> {
    return callBridgeMethod("getJob", jobId);
  },
  getStudioConfig(): Promise<StudioConfigSnapshot> {
    return callBridgeMethod("getStudioConfig");
  },
  listPromptGraphVariants(): Promise<PromptGraphVariant[]> {
    return callBridgeMethod("listPromptGraphVariants");
  },
  getPromptGraphVariant(variantId: string): Promise<PromptGraphVariant | null> {
    return callBridgeMethod("getPromptGraphVariant", variantId);
  },
  createPromptGraphVariant(input: PromptGraphVariantInput): Promise<PromptGraphVariant> {
    return callBridgeMethod("createPromptGraphVariant", input);
  },
  updatePromptGraphVariant(variantId: string, patch: PromptGraphVariantPatch): Promise<PromptGraphVariant> {
    return callBridgeMethod("updatePromptGraphVariant", variantId, patch);
  },
  deletePromptGraphVariant(variantId: string): Promise<PromptGraphVariant[]> {
    return callBridgeMethod("deletePromptGraphVariant", variantId);
  },
  publishPromptGraphVariant(variantId: string): Promise<PromptGraphVariant> {
    return callBridgeMethod("publishPromptGraphVariant", variantId);
  },
  createPromptGraphNode(variantId: string, input: PromptGraphNodeInput): Promise<PromptGraphVariant> {
    return callBridgeMethod("createPromptGraphNode", variantId, input);
  },
  updatePromptGraphNode(
    variantId: string,
    nodeId: string,
    patch: PromptGraphNodePatch
  ): Promise<PromptGraphVariant> {
    return callBridgeMethod("updatePromptGraphNode", variantId, nodeId, patch);
  },
  deletePromptGraphNode(variantId: string, nodeId: string): Promise<PromptGraphVariant> {
    return callBridgeMethod("deletePromptGraphNode", variantId, nodeId);
  },
  reorderPromptGraphNodes(variantId: string, orderedNodeIds: string[]): Promise<PromptGraphVariant> {
    return callBridgeMethod("reorderPromptGraphNodes", variantId, orderedNodeIds);
  },
  compilePromptGraphVariant(variantId: string): Promise<CompiledPromptPreview> {
    return callBridgeMethod("compilePromptGraphVariant", variantId);
  },
  runSandboxVariantTest(request: SandboxRunRequest): Promise<RunResult> {
    return callBridgeMethod("runSandboxVariantTest", request);
  },
  listMcpTargets(): Promise<McpTargetDefinition[]> {
    return callBridgeMethod("listMcpTargets");
  },
  getMcpOverview(targetId: string): Promise<McpOverview> {
    return callBridgeMethod("getMcpOverview", targetId);
  },
  listMcpTools(targetId: string): Promise<McpToolDescriptor[]> {
    return callBridgeMethod("listMcpTools", targetId);
  },
  listMcpResources(targetId: string): Promise<McpResourceDescriptor[]> {
    return callBridgeMethod("listMcpResources", targetId);
  },
  readMcpResource(targetId: string, uri: string): Promise<McpInvocationResult> {
    return callBridgeMethod("readMcpResource", targetId, uri);
  },
  listMcpPrompts(targetId: string): Promise<McpPromptDescriptor[]> {
    return callBridgeMethod("listMcpPrompts", targetId);
  },
  getMcpPrompt(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return callBridgeMethod("getMcpPrompt", targetId, name, args);
  },
  invokeMcpTool(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return callBridgeMethod("invokeMcpTool", targetId, name, args);
  },
  runAgent(request: RunRequest): Promise<RunResult> {
    return callBridgeMethod("runAgent", request);
  },
  replayRun(runId: string): Promise<RunResult> {
    return callBridgeMethod("replayRun", runId);
  },
  scheduleCallback(spec: JobSpec): Promise<JobRecord> {
    return callBridgeMethod("scheduleCallback", spec);
  },
  listConnectors(): Promise<StudioSnapshot["connectors"]> {
    return callBridgeMethod("listConnectors");
  },
  setApprovalMode(rule: ApprovalRule): Promise<ApprovalRule[]> {
    return callBridgeMethod("setApprovalMode", rule);
  },
  getRunTimeline(runId: string) {
    return callBridgeMethod("getRunTimeline", runId);
  },
  listProcesses(): Promise<StudioProcessRecord[]> {
    return callBridgeMethod("listProcesses") as Promise<StudioProcessRecord[]>;
  },
  startProcess(id: string) {
    return callBridgeMethod("startProcess", id);
  },
  stopProcess(id: string) {
    return callBridgeMethod("stopProcess", id);
  },
  quitApp() {
    return callBridgeMethod("quitApp");
  },
  restartApp() {
    return callBridgeMethod("restartApp");
  },
  rebuildAndRestart() {
    return callBridgeMethod("rebuildAndRestart");
  },
  listFlowGraphs(): Promise<FlowGraph[]> {
    return callBridgeMethod("listFlowGraphs");
  },
  getFlowGraphDocument(): Promise<FlowGraphDocument> {
    return callBridgeMethod("getFlowGraphDocument");
  },
  getFlowGraph(id: string): Promise<FlowGraph | null> {
    return callBridgeMethod("getFlowGraph", id);
  },
  createFlowGraph(input: FlowGraphInput): Promise<FlowGraph> {
    return callBridgeMethod("createFlowGraph", input);
  },
  updateFlowGraph(id: string, patch: FlowGraphPatch): Promise<FlowGraph> {
    return callBridgeMethod("updateFlowGraph", id, patch);
  },
  deleteFlowGraph(id: string): Promise<FlowGraph[]> {
    return callBridgeMethod("deleteFlowGraph", id);
  },
  setActiveFlowGraph(id: string): Promise<FlowGraphDocument> {
    return callBridgeMethod("setActiveFlowGraph", id);
  },
};
