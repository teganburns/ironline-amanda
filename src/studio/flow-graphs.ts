import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatJsonDocument } from "./json";
import { ensureStudioHome, getStudioHome } from "./paths";
import type { FlowGraph, FlowGraphDocument, FlowGraphEdge, FlowGraphInput, FlowGraphNode, FlowGraphPatch } from "./types";

function getFlowGraphsPath(): string {
  return join(getStudioHome(), "flow-graphs.json");
}

function nowIso() {
  return new Date().toISOString();
}

function getDefaultFlowGraphDocument(): FlowGraphDocument {
  const now = nowIso();
  const defaultGraph: FlowGraph = {
    id: "amanda-pipeline-default",
    name: "Amanda Pipeline",
    description: "The default Amanda message processing pipeline",
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: "trigger-1",
        type: "amanda-flow-node",
        position: { x: 60, y: 300 },
        data: { label: "iMessage Received", nodeType: "trigger", description: "Incoming iMessage from a contact", enabled: true },
      },
      {
        id: "classify-1",
        type: "amanda-flow-node",
        position: { x: 300, y: 300 },
        data: {
          label: "Message Classification",
          nodeType: "classify",
          description: "gpt-5.4-nano classifies into tier: no_reply, banter, question, reasoning, complex, correction, image",
          config: {
            model: "gpt-5.4-nano",
            holdingReplyTiers: ["reasoning", "complex", "correction", "image"],
          },
          enabled: true,
        },
      },
      {
        id: "no-reply-gate-1",
        type: "amanda-flow-node",
        position: { x: 520, y: 100 },
        data: {
          label: "No Reply Gate",
          nodeType: "logic",
          description: "Silent exit — no message sent to sender",
          config: { action: "silent_exit" },
          enabled: true,
        },
      },
      {
        id: "holding-reply-1",
        type: "amanda-flow-node",
        position: { x: 520, y: 220 },
        data: {
          label: "Holding Reply",
          nodeType: "logic",
          description: "Immediately sends a brief acknowledgement for slow-processing tiers before the agent runs",
          config: { message: "On it, give me a moment." },
          enabled: true,
        },
      },
      {
        id: "context-1",
        type: "amanda-flow-node",
        position: { x: 300, y: 480 },
        data: {
          label: "Load History",
          nodeType: "context",
          description: "Fetch recent conversation history from chat.db and inject into agent input",
          config: { historyLimit: 15 },
          enabled: true,
        },
      },
      {
        id: "tool-imessage-1",
        type: "amanda-flow-node",
        position: { x: 740, y: 100 },
        data: {
          label: "iMessage MCP",
          nodeType: "tool",
          description: "Required — send_message, read receipts, attachment access",
          config: { required: true, enabled: true },
          enabled: true,
        },
      },
      {
        id: "tool-context-1",
        type: "amanda-flow-node",
        position: { x: 740, y: 220 },
        data: {
          label: "Context MCP",
          nodeType: "tool",
          description: "Required — LanceDB vector memory (memory_store, memory_search)",
          config: { required: true, enabled: true },
          enabled: true,
        },
      },
      {
        id: "tool-temporal-1",
        type: "amanda-flow-node",
        position: { x: 740, y: 340 },
        data: {
          label: "Temporal MCP",
          nodeType: "tool",
          description: "Optional — schedule_reminder and job scheduling via Temporal",
          config: { required: false, enabled: true },
          enabled: true,
        },
      },
      {
        id: "tool-browser-1",
        type: "amanda-flow-node",
        position: { x: 740, y: 460 },
        data: {
          label: "Browser MCP",
          nodeType: "tool",
          description: "Optional — web browsing and page navigation",
          config: { required: false, enabled: true },
          enabled: true,
        },
      },
      {
        id: "agent-1",
        type: "amanda-flow-node",
        position: { x: 1020, y: 300 },
        data: {
          label: "Amanda Agent",
          nodeType: "agent",
          description: "OpenAI Agents SDK run — model and maxTurns determined by tier",
          config: {
            imageModel: "gpt-4o",
            tierModels: {
              banter:     { model: "gpt-5.4-nano", maxTurns: 8 },
              question:   { model: "gpt-5.4",      maxTurns: 10 },
              reasoning:  { model: "gpt-5.4",      maxTurns: 15 },
              complex:    { model: "gpt-5.4-nano",  maxTurns: 15 },
              correction: { model: "gpt-5.4-nano",  maxTurns: 15 },
              image:      { model: "gpt-5.4-nano",  maxTurns: 15 },
            },
          },
          enabled: true,
        },
      },
      {
        id: "output-1",
        type: "amanda-flow-node",
        position: { x: 1280, y: 300 },
        data: { label: "Send Reply", nodeType: "output", description: "Deliver response via send_message, send_image, or send_file tool", enabled: true },
      },
    ],
    edges: [
      { id: "e1",  source: "trigger-1",       target: "classify-1",      type: "smoothstep" },
      { id: "e2",  source: "classify-1",       target: "no-reply-gate-1", type: "smoothstep", label: "no_reply" },
      { id: "e3",  source: "classify-1",       target: "holding-reply-1", type: "smoothstep", label: "slow tier" },
      { id: "e4",  source: "classify-1",       target: "agent-1",         type: "smoothstep" },
      { id: "e5",  source: "context-1",        target: "agent-1",         type: "smoothstep" },
      { id: "e6",  source: "tool-imessage-1",  target: "agent-1",         type: "smoothstep" },
      { id: "e7",  source: "tool-context-1",   target: "agent-1",         type: "smoothstep" },
      { id: "e8",  source: "tool-temporal-1",  target: "agent-1",         type: "smoothstep" },
      { id: "e9",  source: "tool-browser-1",   target: "agent-1",         type: "smoothstep" },
      { id: "e10", source: "agent-1",          target: "output-1",        type: "smoothstep", animated: true },
    ],
  };

  return {
    graphs: [defaultGraph],
    activeGraphId: defaultGraph.id,
  };
}

function readFlowGraphDocument(): FlowGraphDocument {
  const path = getFlowGraphsPath();
  try {
    if (!existsSync(path)) return getDefaultFlowGraphDocument();
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as FlowGraphDocument;
    if (!parsed.graphs || !Array.isArray(parsed.graphs)) {
      return getDefaultFlowGraphDocument();
    }
    return parsed;
  } catch {
    return getDefaultFlowGraphDocument();
  }
}

async function writeFlowGraphDocument(document: FlowGraphDocument): Promise<void> {
  ensureStudioHome();
  await writeFile(getFlowGraphsPath(), await formatJsonDocument(document), "utf-8");
}

export class FlowGraphStore {
  listGraphs(): FlowGraph[] {
    return readFlowGraphDocument().graphs;
  }

  getGraph(id: string): FlowGraph | null {
    const doc = readFlowGraphDocument();
    return doc.graphs.find((g) => g.id === id) ?? null;
  }

  async createGraph(input: FlowGraphInput): Promise<FlowGraph> {
    const doc = readFlowGraphDocument();
    const now = nowIso();
    const graph: FlowGraph = {
      id: randomUUID(),
      name: input.name.trim() || "New Pipeline",
      description: input.description,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    };
    const next: FlowGraphDocument = {
      ...doc,
      graphs: [graph, ...doc.graphs],
    };
    await writeFlowGraphDocument(next);
    return graph;
  }

  async updateGraph(id: string, patch: FlowGraphPatch): Promise<FlowGraph> {
    const doc = readFlowGraphDocument();
    const current = doc.graphs.find((g) => g.id === id);
    if (!current) throw new Error(`Flow graph ${id} not found`);

    const updated: FlowGraph = {
      ...current,
      name: patch.name?.trim() ? patch.name.trim() : current.name,
      description: patch.description !== undefined ? patch.description : current.description,
      nodes: patch.nodes !== undefined ? patch.nodes : current.nodes,
      edges: patch.edges !== undefined ? patch.edges : current.edges,
      updatedAt: nowIso(),
    };

    const next: FlowGraphDocument = {
      ...doc,
      graphs: doc.graphs.map((g) => (g.id === id ? updated : g)),
    };
    await writeFlowGraphDocument(next);
    return updated;
  }

  async deleteGraph(id: string): Promise<FlowGraph[]> {
    const doc = readFlowGraphDocument();
    if (doc.graphs.length === 1) throw new Error("Cannot delete the only flow graph");
    const remaining = doc.graphs.filter((g) => g.id !== id);
    if (remaining.length === doc.graphs.length) throw new Error(`Flow graph ${id} not found`);

    const next: FlowGraphDocument = {
      graphs: remaining,
      activeGraphId: doc.activeGraphId === id ? (remaining[0]?.id ?? null) : doc.activeGraphId,
    };
    await writeFlowGraphDocument(next);
    return remaining;
  }
}
