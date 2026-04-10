import { describe, expect, test } from "bun:test";
import {
  compileActiveFlowRuntimeConfig,
  createDefaultFlowGraphDocument,
  normalizeFlowGraphDocument,
} from "./flow-blocks";

describe("flow block compiler", () => {
  test("migrates legacy graphs and defaults activeGraphId", () => {
    const document = normalizeFlowGraphDocument({
      graphs: [
        {
          id: "legacy",
          name: "Legacy Flow",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
          nodes: [
            {
              id: "classify-1",
              type: "amanda-flow-node",
              position: { x: 10, y: 10 },
              data: {
                label: "Old classifier",
                nodeType: "classify",
                config: {
                  model: "gpt-5.4-mini",
                },
              },
            },
          ],
          edges: [],
        },
      ],
      activeGraphId: null,
    });

    expect(document.activeGraphId).toBe("legacy");
    expect(document.graphs[0]?.nodes[0]?.data.blockKey).toBe("classify.message");
    expect(document.graphs[0]?.nodes[0]?.data.config?.model).toBe("gpt-5.4-mini");
  });

  test("compiles the active graph instead of graphs[0]", () => {
    const document = createDefaultFlowGraphDocument("2026-04-10T00:00:00.000Z");
    const alternate = createDefaultFlowGraphDocument("2026-04-10T00:00:00.000Z").graphs[0]!;
    alternate.id = "alternate";
    alternate.name = "Alternate";
    alternate.nodes = alternate.nodes.map((node) =>
      node.id === "context-1"
        ? {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                historyLimit: 42,
              },
            },
          }
        : node
    );

    const nextDocument = {
      graphs: [document.graphs[0]!, alternate],
      activeGraphId: alternate.id,
    };

    const compiled = compileActiveFlowRuntimeConfig(nextDocument);
    expect(compiled.graphId).toBe("alternate");
    expect(compiled.historyLimit).toBe(42);
  });

  test("rejects duplicate enabled singleton blocks", () => {
    const document = createDefaultFlowGraphDocument("2026-04-10T00:00:00.000Z");
    const graph = document.graphs[0]!;
    const classifyNode = graph.nodes.find((node) => node.id === "classify-1")!;

    graph.nodes.push({
      ...classifyNode,
      id: "classify-2",
      position: { x: 900, y: 900 },
    });

    expect(() => compileActiveFlowRuntimeConfig(document)).toThrow(
      "multiple enabled classify.message blocks"
    );
  });

  test("keeps disabled holding reply block authoritative", () => {
    const document = createDefaultFlowGraphDocument("2026-04-10T00:00:00.000Z");
    const graph = document.graphs[0]!;
    graph.nodes = graph.nodes.map((node) =>
      node.id === "holding-reply-1"
        ? {
            ...node,
            data: {
              ...node.data,
              enabled: false,
              config: {
                ...node.data.config,
                fallbackMessage: "Checking now.",
              },
            },
          }
        : node
    );

    const compiled = compileActiveFlowRuntimeConfig(document);
    expect(compiled.holdingReply.enabled).toBe(false);
    expect(compiled.holdingReply.fallbackMessage).toBe("Checking now.");
  });
});
