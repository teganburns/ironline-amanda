import type { BridgeInfo } from "./types";

export const STUDIO_BRIDGE_VERSION = "2026-04-10-flow-runtime-config";

export const STUDIO_BRIDGE_CAPABILITIES = [
  "getBridgeInfo",
  "getSnapshot",
  "listRuns",
  "getRun",
  "listJobs",
  "getJob",
  "getStudioConfig",
  "listPromptGraphVariants",
  "getPromptGraphVariant",
  "createPromptGraphVariant",
  "updatePromptGraphVariant",
  "deletePromptGraphVariant",
  "publishPromptGraphVariant",
  "createPromptGraphNode",
  "updatePromptGraphNode",
  "deletePromptGraphNode",
  "reorderPromptGraphNodes",
  "compilePromptGraphVariant",
  "runSandboxVariantTest",
  "listMcpTargets",
  "getMcpOverview",
  "listMcpTools",
  "listMcpResources",
  "readMcpResource",
  "listMcpPrompts",
  "getMcpPrompt",
  "invokeMcpTool",
  "runAgent",
  "replayRun",
  "scheduleCallback",
  "listConnectors",
  "setApprovalMode",
  "getRunTimeline",
  "listProcesses",
  "startProcess",
  "stopProcess",
  "listFlowGraphs",
  "getFlowGraphDocument",
  "getFlowGraph",
  "createFlowGraph",
  "updateFlowGraph",
  "deleteFlowGraph",
  "setActiveFlowGraph",
] as const;

export type StudioBridgeCapability = (typeof STUDIO_BRIDGE_CAPABILITIES)[number];

export function createBridgeInfo(): BridgeInfo {
  return {
    version: STUDIO_BRIDGE_VERSION,
    capabilities: [...STUDIO_BRIDGE_CAPABILITIES],
  };
}
