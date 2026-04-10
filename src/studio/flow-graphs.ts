import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_FLOW_GRAPH_EDGES,
  createDefaultFlowGraphDocument,
  createDefaultFlowGraphNodes,
  normalizeFlowGraphDocument,
} from "./flow-blocks";
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
  return createDefaultFlowGraphDocument(nowIso());
}

function readFlowGraphDocument(): FlowGraphDocument {
  const path = getFlowGraphsPath();
  try {
    if (!existsSync(path)) return getDefaultFlowGraphDocument();
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as FlowGraphDocument;
    if (!parsed.graphs || !Array.isArray(parsed.graphs)) {
      return getDefaultFlowGraphDocument();
    }
    return normalizeFlowGraphDocument(parsed);
  } catch {
    return getDefaultFlowGraphDocument();
  }
}

async function writeFlowGraphDocument(document: FlowGraphDocument): Promise<void> {
  ensureStudioHome();
  await writeFile(getFlowGraphsPath(), await formatJsonDocument(normalizeFlowGraphDocument(document)), "utf-8");
}

export class FlowGraphStore {
  getDocument(): FlowGraphDocument {
    return readFlowGraphDocument();
  }

  listGraphs(): FlowGraph[] {
    return readFlowGraphDocument().graphs;
  }

  getActiveGraphId(): string | null {
    return readFlowGraphDocument().activeGraphId;
  }

  getActiveGraph(): FlowGraph | null {
    const document = readFlowGraphDocument();
    return document.graphs.find((graph) => graph.id === document.activeGraphId) ?? null;
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
      nodes: createDefaultFlowGraphNodes(),
      edges: DEFAULT_FLOW_GRAPH_EDGES,
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

  async setActiveGraph(id: string): Promise<FlowGraphDocument> {
    const document = readFlowGraphDocument();
    if (!document.graphs.some((graph) => graph.id === id)) {
      throw new Error(`Flow graph ${id} not found`);
    }

    const next: FlowGraphDocument = {
      ...document,
      activeGraphId: id,
    };
    await writeFlowGraphDocument(next);
    return next;
  }
}
