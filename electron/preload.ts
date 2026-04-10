import electron from "electron";
import { studioIpc } from "../src/studio/ipc";

const { contextBridge, ipcRenderer } = electron;

const api = {
  getBridgeInfo: () => ipcRenderer.invoke(studioIpc.getBridgeInfo),
  getSnapshot: () => ipcRenderer.invoke(studioIpc.snapshot),
  listRuns: (limit?: number) => ipcRenderer.invoke(studioIpc.listRuns, limit),
  getRun: (runId: string) => ipcRenderer.invoke(studioIpc.getRun, runId),
  listJobs: (limit?: number) => ipcRenderer.invoke(studioIpc.listJobs, limit),
  getJob: (jobId: string) => ipcRenderer.invoke(studioIpc.getJob, jobId),
  getStudioConfig: () => ipcRenderer.invoke(studioIpc.getStudioConfig),
  listPromptGraphVariants: () => ipcRenderer.invoke(studioIpc.listPromptGraphVariants),
  getPromptGraphVariant: (variantId: string) => ipcRenderer.invoke(studioIpc.getPromptGraphVariant, variantId),
  createPromptGraphVariant: (input: unknown) => ipcRenderer.invoke(studioIpc.createPromptGraphVariant, input),
  updatePromptGraphVariant: (variantId: string, patch: unknown) =>
    ipcRenderer.invoke(studioIpc.updatePromptGraphVariant, variantId, patch),
  deletePromptGraphVariant: (variantId: string) => ipcRenderer.invoke(studioIpc.deletePromptGraphVariant, variantId),
  publishPromptGraphVariant: (variantId: string) =>
    ipcRenderer.invoke(studioIpc.publishPromptGraphVariant, variantId),
  createPromptGraphNode: (variantId: string, input: unknown) =>
    ipcRenderer.invoke(studioIpc.createPromptGraphNode, variantId, input),
  updatePromptGraphNode: (variantId: string, nodeId: string, patch: unknown) =>
    ipcRenderer.invoke(studioIpc.updatePromptGraphNode, variantId, nodeId, patch),
  deletePromptGraphNode: (variantId: string, nodeId: string) =>
    ipcRenderer.invoke(studioIpc.deletePromptGraphNode, variantId, nodeId),
  reorderPromptGraphNodes: (variantId: string, orderedNodeIds: string[]) =>
    ipcRenderer.invoke(studioIpc.reorderPromptGraphNodes, variantId, orderedNodeIds),
  compilePromptGraphVariant: (variantId: string) =>
    ipcRenderer.invoke(studioIpc.compilePromptGraphVariant, variantId),
  runSandboxVariantTest: (request: unknown) => ipcRenderer.invoke(studioIpc.runSandboxVariantTest, request),
  listMcpTargets: () => ipcRenderer.invoke(studioIpc.listMcpTargets),
  getMcpOverview: (targetId: string) => ipcRenderer.invoke(studioIpc.getMcpOverview, targetId),
  listMcpTools: (targetId: string) => ipcRenderer.invoke(studioIpc.listMcpTools, targetId),
  listMcpResources: (targetId: string) => ipcRenderer.invoke(studioIpc.listMcpResources, targetId),
  readMcpResource: (targetId: string, uri: string) => ipcRenderer.invoke(studioIpc.readMcpResource, targetId, uri),
  listMcpPrompts: (targetId: string) => ipcRenderer.invoke(studioIpc.listMcpPrompts, targetId),
  getMcpPrompt: (targetId: string, name: string, args?: unknown) =>
    ipcRenderer.invoke(studioIpc.getMcpPrompt, targetId, name, args),
  invokeMcpTool: (targetId: string, name: string, args?: unknown) =>
    ipcRenderer.invoke(studioIpc.invokeMcpTool, targetId, name, args),
  runAgent: (request: unknown) => ipcRenderer.invoke(studioIpc.runAgent, request),
  replayRun: (runId: string) => ipcRenderer.invoke(studioIpc.replayRun, runId),
  scheduleCallback: (spec: unknown) => ipcRenderer.invoke(studioIpc.scheduleCallback, spec),
  listConnectors: () => ipcRenderer.invoke(studioIpc.listConnectors),
  setApprovalMode: (rule: unknown) => ipcRenderer.invoke(studioIpc.setApprovalMode, rule),
  getRunTimeline: (runId: string) => ipcRenderer.invoke(studioIpc.getRunTimeline, runId),
  listProcesses: () => ipcRenderer.invoke(studioIpc.listProcesses),
  startProcess: (id: string) => ipcRenderer.invoke(studioIpc.startProcess, id),
  stopProcess: (id: string) => ipcRenderer.invoke(studioIpc.stopProcess, id),
  quitApp: () => ipcRenderer.invoke(studioIpc.quitApp),
  restartApp: () => ipcRenderer.invoke(studioIpc.restartApp),
  rebuildAndRestart: () => ipcRenderer.invoke(studioIpc.rebuildAndRestart),
  listFlowGraphs: () => ipcRenderer.invoke(studioIpc.listFlowGraphs),
  getFlowGraphDocument: () => ipcRenderer.invoke(studioIpc.getFlowGraphDocument),
  getFlowGraph: (id: string) => ipcRenderer.invoke(studioIpc.getFlowGraph, id),
  createFlowGraph: (input: unknown) => ipcRenderer.invoke(studioIpc.createFlowGraph, input),
  updateFlowGraph: (id: string, patch: unknown) => ipcRenderer.invoke(studioIpc.updateFlowGraph, id, patch),
  deleteFlowGraph: (id: string) => ipcRenderer.invoke(studioIpc.deleteFlowGraph, id),
  setActiveFlowGraph: (id: string) => ipcRenderer.invoke(studioIpc.setActiveFlowGraph, id),
};

contextBridge.exposeInMainWorld("ironlineStudio", api);
