import { describe, expect, test } from "bun:test";
import {
  createFlowEdge,
  createFlowNode,
  FLOW_INPUT_HANDLE_ID,
  FLOW_OUTPUT_HANDLE_ID,
  formatFlowConfigInput,
  isValidFlowConnection,
  normalizeFlowEdge,
  normalizeFlowEdges,
  normalizeFlowNode,
  normalizeFlowNodes,
  parseFlowConfigInput,
} from "./flow-editor";

describe("flow editor helpers", () => {
  test("creates new nodes with sensible defaults", () => {
    const node = createFlowNode("agent", { x: 120, y: 240 });

    expect(node.type).toBe("amanda-flow-node");
    expect(node.position).toEqual({ x: 120, y: 240 });
    expect(node.data.nodeType).toBe("agent");
    expect(node.data.label).toBe("New Agent");
    expect(node.data.enabled).toBe(true);
    expect(node.data.config).toEqual({});
  });

  test("parses and formats node config JSON", () => {
    expect(parseFlowConfigInput('{ "tool": "memory_search" }')).toEqual({
      tool: "memory_search",
    });
    expect(formatFlowConfigInput({ tool: "memory_search" })).toBe('{\n  "tool": "memory_search"\n}');
  });

  test("rejects non-object node config JSON", () => {
    expect(() => parseFlowConfigInput("[]")).toThrow("Node config must be a JSON object.");
  });

  test("normalizes nodes and preserves Amanda metadata", () => {
    const [node] = normalizeFlowNodes([
      {
        id: "node-1",
        type: "amanda-flow-node",
        position: { x: 20, y: 40 },
        data: {
          label: "Run Amanda",
          nodeType: "agent",
          description: "",
          enabled: true,
          config: { model: "gpt-5.4" },
        },
      },
    ]);

    expect(node).toEqual({
      id: "node-1",
      type: "amanda-flow-node",
      position: { x: 20, y: 40 },
      data: {
        label: "Run Amanda",
        nodeType: "agent",
        description: "Run Amanda or another model-driven orchestration step.",
        enabled: true,
        config: { model: "gpt-5.4" },
      },
    });
  });

  test("normalizes edges to out-to-in defaults for older saved graphs", () => {
    const [edge] = normalizeFlowEdges([
      {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
      },
    ]);

    expect(edge).toEqual({
      id: "edge-1",
      source: "node-a",
      target: "node-b",
      sourceHandle: FLOW_OUTPUT_HANDLE_ID,
      targetHandle: FLOW_INPUT_HANDLE_ID,
      label: undefined,
      type: "smoothstep",
      animated: undefined,
    });
  });

  test("accepts only directional out-to-in connections", () => {
    expect(
      isValidFlowConnection({
        source: "node-a",
        target: "node-b",
        sourceHandle: FLOW_OUTPUT_HANDLE_ID,
        targetHandle: FLOW_INPUT_HANDLE_ID,
      })
    ).toBe(true);

    expect(
      isValidFlowConnection({
        source: "node-a",
        target: "node-b",
        sourceHandle: FLOW_INPUT_HANDLE_ID,
        targetHandle: FLOW_OUTPUT_HANDLE_ID,
      })
    ).toBe(false);

    expect(
      isValidFlowConnection({
        source: "node-a",
        target: "node-a",
        sourceHandle: FLOW_OUTPUT_HANDLE_ID,
        targetHandle: FLOW_INPUT_HANDLE_ID,
      })
    ).toBe(false);
  });

  test("rejects duplicate directional edges", () => {
    expect(
      isValidFlowConnection(
        {
          source: "node-a",
          target: "node-b",
          sourceHandle: FLOW_OUTPUT_HANDLE_ID,
          targetHandle: FLOW_INPUT_HANDLE_ID,
        },
        [
          {
            id: "edge-1",
            source: "node-a",
            target: "node-b",
            sourceHandle: FLOW_OUTPUT_HANDLE_ID,
            targetHandle: FLOW_INPUT_HANDLE_ID,
          },
        ]
      )
    ).toBe(false);
  });

  test("creates and normalizes new edges with persistent handle ids", () => {
    const edge = normalizeFlowEdge(
      createFlowEdge({
        source: "node-a",
        target: "node-b",
        sourceHandle: FLOW_OUTPUT_HANDLE_ID,
        targetHandle: FLOW_INPUT_HANDLE_ID,
      })
    );

    expect(edge.sourceHandle).toBe(FLOW_OUTPUT_HANDLE_ID);
    expect(edge.targetHandle).toBe(FLOW_INPUT_HANDLE_ID);
    expect(edge.type).toBe("smoothstep");
  });

  test("fills sensible defaults when node metadata is incomplete", () => {
    const node = normalizeFlowNode({
      id: "node-9",
      type: "amanda-flow-node",
      position: { x: Number.NaN, y: Number.NaN },
      data: {
        label: "",
        nodeType: "tool",
        config: [] as unknown as Record<string, unknown>,
      },
    });

    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.data.label).toBe("Tool");
    expect(node.data.description).toBe("Call a concrete MCP tool or external action.");
    expect(node.data.config).toEqual({});
  });
});
