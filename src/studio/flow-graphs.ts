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
        position: { x: 60, y: 200 },
        data: { label: "iMessage Received", nodeType: "trigger", description: "Incoming iMessage from a contact", enabled: true },
      },
      {
        id: "classify-1",
        type: "amanda-flow-node",
        position: { x: 320, y: 200 },
        data: { label: "Classify Message", nodeType: "classify", description: "Tier detection: no_reply, banter, question, reasoning, complex, correction, image", enabled: true },
      },
      {
        id: "context-1",
        type: "amanda-flow-node",
        position: { x: 320, y: 380 },
        data: { label: "Load History", nodeType: "context", description: "Fetch last 50 messages + memory lookup", enabled: true },
      },
      {
        id: "agent-1",
        type: "amanda-flow-node",
        position: { x: 580, y: 200 },
        data: {
          label: "Amanda Agent",
          nodeType: "agent",
          description: "Run LLM with iMessage, context, temporal, and browser MCPs",
          config: { agentId: "amanda-core", model: "gpt-5.4-nano" },
          enabled: true,
        },
      },
      {
        id: "output-1",
        type: "amanda-flow-node",
        position: { x: 840, y: 200 },
        data: { label: "Send Reply", nodeType: "output", description: "Deliver response via send_message tool", enabled: true },
      },
    ],
    edges: [
      { id: "e1", source: "trigger-1", target: "classify-1", type: "smoothstep" },
      { id: "e2", source: "classify-1", target: "agent-1", type: "smoothstep" },
      { id: "e3", source: "context-1", target: "agent-1", type: "smoothstep" },
      { id: "e4", source: "agent-1", target: "output-1", type: "smoothstep", animated: true },
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
