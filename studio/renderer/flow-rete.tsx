import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from "react";
import { ClassicPreset, NodeEditor, type GetSchemes } from "rete";
import { AreaExtensions, AreaPlugin } from "rete-area-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets, type SocketData } from "rete-connection-plugin";
import {
  Presets,
  ReactPlugin,
  useRete,
  type ReactArea2D,
  type RenderEmit,
} from "rete-react-plugin";
import { createRoot } from "react-dom/client";
import type { FlowGraphEdge, FlowGraphNode, FlowNodeData, FlowNodeType } from "../../src/studio/types";
import { FlowNodeCard } from "./components/flow-node";
import {
  FLOW_INPUT_HANDLE_ID,
  FLOW_OUTPUT_HANDLE_ID,
  createFlowEdge,
  createFlowNode,
  normalizeFlowEdge,
  normalizeFlowEdges,
  normalizeFlowNode,
  normalizeFlowNodes,
} from "./flow-editor";

const flowSocket = new ClassicPreset.Socket("flow");
const FLOW_NODE_WIDTH = 188;

type AmandaInputs = { [FLOW_INPUT_HANDLE_ID]: ClassicPreset.Socket };
type AmandaOutputs = { [FLOW_OUTPUT_HANDLE_ID]: ClassicPreset.Socket };

class AmandaFlowReteNode extends ClassicPreset.Node<AmandaInputs, AmandaOutputs> {
  readonly kind = "amanda-flow-node";
  nodeType: FlowNodeType;
  description?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  selected?: boolean;
  width = FLOW_NODE_WIDTH;

  constructor(node: FlowGraphNode) {
    const normalized = normalizeFlowNode(node);

    super(normalized.data.label);
    this.id = normalized.id;
    this.nodeType = normalized.data.nodeType;
    this.description = normalized.data.description;
    this.enabled = normalized.data.enabled !== false;
    this.config = normalized.data.config ?? {};
    this.selected = false;

    this.addInput(FLOW_INPUT_HANDLE_ID, new ClassicPreset.Input(flowSocket, "Input", false));
    this.addOutput(FLOW_OUTPUT_HANDLE_ID, new ClassicPreset.Output(flowSocket, "Output", true));
  }

  update(patch: Partial<FlowNodeData>) {
    if (typeof patch.label === "string") {
      this.label = patch.label;
    }

    if (typeof patch.description === "string") {
      this.description = patch.description;
    }

    if (typeof patch.enabled === "boolean") {
      this.enabled = patch.enabled;
    }

    if (patch.config && typeof patch.config === "object" && !Array.isArray(patch.config)) {
      this.config = patch.config;
    }
  }
}

class AmandaFlowReteConnection extends ClassicPreset.Connection<AmandaFlowReteNode, AmandaFlowReteNode> {
  label?: string;
  type?: FlowGraphEdge["type"];
  animated?: boolean;

  constructor(source: AmandaFlowReteNode, target: AmandaFlowReteNode, edge?: FlowGraphEdge) {
    const normalized = edge ? normalizeFlowEdge(edge) : null;

    super(source, FLOW_OUTPUT_HANDLE_ID, target, FLOW_INPUT_HANDLE_ID);
    this.id = normalized?.id ?? `edge-${globalThis.crypto.randomUUID()}`;
    this.label = normalized?.label;
    this.type = normalized?.type ?? "smoothstep";
    this.animated = normalized?.animated;
  }
}

type FlowSchemes = GetSchemes<AmandaFlowReteNode, AmandaFlowReteConnection>;
type AreaExtra = ReactArea2D<FlowSchemes>;

interface FlowEditorController {
  destroy(): void;
  addNode(type: FlowNodeType, position?: { x: number; y: number }): Promise<void>;
  addNodeAtClientPoint(type: FlowNodeType, point: { x: number; y: number }): Promise<void>;
  updateNode(nodeId: string, patch: Partial<FlowNodeData>): Promise<void>;
  selectNode(nodeId: string | null): Promise<void>;
  deleteSelectedNode(): Promise<void>;
  zoomIn(): Promise<void>;
  zoomOut(): Promise<void>;
  fit(): Promise<void>;
}

export interface FlowCanvasHandle {
  addNode(type: FlowNodeType): Promise<void>;
  updateNode(nodeId: string, patch: Partial<FlowNodeData>): Promise<void>;
  selectNode(nodeId: string | null): Promise<void>;
  deleteSelectedNode(): Promise<void>;
  zoomIn(): Promise<void>;
  zoomOut(): Promise<void>;
  fit(): Promise<void>;
}

function AmandaFlowConnectionView() {
  const { path } = Presets.classic.useConnection();

  if (!path) {
    return null;
  }

  return (
    <svg className="flow-connection-svg">
      <path className="flow-connection-path" d={path} />
    </svg>
  );
}

function AmandaFlowNodeView({
  data,
  emit,
}: {
  data: AmandaFlowReteNode;
  emit: RenderEmit<FlowSchemes>;
}) {
  const input = data.inputs[FLOW_INPUT_HANDLE_ID];
  const output = data.outputs[FLOW_OUTPUT_HANDLE_ID];

  return (
    <div className="flow-rete-node-shell">
      <FlowNodeCard
        data={{
          label: data.label,
          nodeType: data.nodeType,
          description: data.description,
          enabled: data.enabled,
          config: data.config,
        }}
        selected={data.selected === true}
        inputPort={
          input ? (
            <Presets.classic.RefSocket
              name="flow-port-socket-anchor"
              side="input"
              socketKey={FLOW_INPUT_HANDLE_ID}
              nodeId={data.id}
              emit={emit}
              payload={input.socket}
            />
          ) : null
        }
        outputPort={
          output ? (
            <Presets.classic.RefSocket
              name="flow-port-socket-anchor"
              side="output"
              socketKey={FLOW_OUTPUT_HANDLE_ID}
              nodeId={data.id}
              emit={emit}
              payload={output.socket}
            />
          ) : null
        }
      />
    </div>
  );
}

function normalizeSocketPair(from: SocketData, to: SocketData) {
  if (from.side === "output" && to.side === "input") {
    return { source: from, target: to };
  }

  if (from.side === "input" && to.side === "output") {
    return { source: to, target: from };
  }

  return null;
}

function getFlowPositionFromClientPoint(
  container: HTMLElement,
  area: AreaPlugin<FlowSchemes, AreaExtra>,
  point: { x: number; y: number }
) {
  const bounds = container.getBoundingClientRect();
  const transform = area.area.transform;

  return {
    x: (point.x - bounds.left - transform.x) / transform.k,
    y: (point.y - bounds.top - transform.y) / transform.k,
  };
}

function getCanvasCenterPosition(container: HTMLElement, area: AreaPlugin<FlowSchemes, AreaExtra>) {
  const bounds = container.getBoundingClientRect();

  return getFlowPositionFromClientPoint(container, area, {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  });
}

function serializeFlowGraph(
  editor: NodeEditor<FlowSchemes>,
  area: AreaPlugin<FlowSchemes, AreaExtra>
): { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } {
  const nodes = editor.getNodes().map((node) => {
    const position = area.nodeViews.get(node.id)?.position ?? { x: 0, y: 0 };

    return normalizeFlowNode({
      id: node.id,
      type: "amanda-flow-node",
      position,
      data: {
        label: node.label,
        nodeType: node.nodeType,
        description: node.description,
        enabled: node.enabled,
        config: node.config,
      },
    });
  });

  const edges = editor
    .getConnections()
    .map((connection) =>
      normalizeFlowEdge({
        id: connection.id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceOutput as string,
        targetHandle: connection.targetInput as string,
        label: connection.label,
        type: connection.type,
        animated: connection.animated,
      })
    );

  return { nodes, edges };
}

async function createFlowEditor(
  container: HTMLElement,
  {
    initialNodes,
    initialEdges,
    onGraphChange,
    onSelectionChange,
  }: {
    initialNodes: FlowGraphNode[];
    initialEdges: FlowGraphEdge[];
    onGraphChange: (nodes: FlowGraphNode[], edges: FlowGraphEdge[]) => void;
    onSelectionChange: (nodeId: string | null) => void;
  }
): Promise<FlowEditorController> {
  const editor = new NodeEditor<FlowSchemes>();
  const area = new AreaPlugin<FlowSchemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<FlowSchemes, AreaExtra>();
  const render = new ReactPlugin<FlowSchemes, AreaExtra>({ createRoot });

  container.classList.add("flow-rete-canvas");

  render.addPreset(
    Presets.classic.setup({
      customize: {
        node() {
          return AmandaFlowNodeView;
        },
        connection() {
          return AmandaFlowConnectionView;
        },
        socket(context) {
          return function AmandaSocket() {
            return <div className={`flow-port flow-port-${context.side}`} title={context.payload.name} />;
          };
        },
      },
    })
  );

  connection.addPreset(
    ConnectionPresets.classic.setup({
      canMakeConnection(from: SocketData, to: SocketData) {
        const pair = normalizeSocketPair(from, to);
        if (!pair) {
          return false;
        }

        if (pair.source.nodeId === pair.target.nodeId) {
          return false;
        }

        return !editor.getConnections().some(
          (item) =>
            item.source === pair.source.nodeId &&
            item.target === pair.target.nodeId &&
            item.sourceOutput === FLOW_OUTPUT_HANDLE_ID &&
            item.targetInput === FLOW_INPUT_HANDLE_ID
        );
      },
      makeConnection(
        from: SocketData,
        to: SocketData,
        context: { editor: NodeEditor<FlowSchemes> }
      ) {
        const pair = normalizeSocketPair(from, to);
        if (!pair) {
          return false;
        }

        const source = editor.getNode(pair.source.nodeId);
        const target = editor.getNode(pair.target.nodeId);

        if (!source || !target || source.id === target.id) {
          return false;
        }

        void context.editor.addConnection(new AmandaFlowReteConnection(source, target));
        return true;
      },
    })
  );

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

  let muted = false;
  let selectedNodeId: string | null = null;

  const notifyGraphChange = () => {
    if (muted) {
      return;
    }

    const snapshot = serializeFlowGraph(editor, area);
    onGraphChange(snapshot.nodes, snapshot.edges);
  };

  const setSelectedNode = async (nextNodeId: string | null) => {
    if (selectedNodeId === nextNodeId) {
      return;
    }

    selectedNodeId = nextNodeId;

    await Promise.all(
      editor.getNodes().map(async (node) => {
        const nextSelected = node.id === nextNodeId;

        if (node.selected === nextSelected) {
          return;
        }

        node.selected = nextSelected;
        await area.update("node", node.id);
      })
    );

    onSelectionChange(nextNodeId);
  };

  editor.addPipe((context) => {
    if (muted) {
      return context;
    }

    if (
      context.type === "connectioncreated" ||
      context.type === "connectionremoved" ||
      context.type === "noderemoved"
    ) {
      queueMicrotask(() => {
        notifyGraphChange();
      });
    }

    return context;
  });

  area.addPipe((context) => {
    if (context.type === "nodepicked") {
      void setSelectedNode(context.data.id);
    }

    if (context.type === "pointerdown") {
      const target = context.data.event.target;

      if (
        target instanceof HTMLElement &&
        !target.closest(".flow-node") &&
        !target.closest(".flow-port-anchor") &&
        !target.closest(".flow-port-socket-anchor") &&
        !target.closest(".flow-canvas-control-cluster")
      ) {
        void setSelectedNode(null);
      }
    }

    if (context.type === "nodedragged" && !muted) {
      queueMicrotask(() => {
        notifyGraphChange();
      });
    }

    return context;
  });

  const nodeById = new Map<string, AmandaFlowReteNode>();

  muted = true;

  for (const node of normalizeFlowNodes(initialNodes)) {
    const reteNode = new AmandaFlowReteNode(node);
    nodeById.set(reteNode.id, reteNode);
    await editor.addNode(reteNode);
    await area.translate(reteNode.id, node.position);
  }

  for (const edge of normalizeFlowEdges(initialEdges)) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source || !target) {
      continue;
    }

    await editor.addConnection(new AmandaFlowReteConnection(source, target, edge));
  }

  muted = false;

  if (editor.getNodes().length) {
    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: 0.9 });
  }

  return {
    async addNode(type, position) {
      muted = true;

      const nextNode = createFlowNode(type, position ?? getCanvasCenterPosition(container, area));
      const reteNode = new AmandaFlowReteNode(nextNode);

      nodeById.set(reteNode.id, reteNode);
      await editor.addNode(reteNode);
      await area.translate(reteNode.id, nextNode.position);
      await setSelectedNode(reteNode.id);

      muted = false;
      notifyGraphChange();
    },
    async addNodeAtClientPoint(type, point) {
      const position = getFlowPositionFromClientPoint(container, area, point);
      await this.addNode(type, position);
    },
    async updateNode(nodeId, patch) {
      const node = editor.getNode(nodeId);
      if (!node) {
        return;
      }

      node.update(patch);
      await area.update("node", nodeId);
      notifyGraphChange();
    },
    async selectNode(nodeId) {
      await setSelectedNode(nodeId);
    },
    async deleteSelectedNode() {
      if (!selectedNodeId) {
        return;
      }

      const node = editor.getNode(selectedNodeId);
      if (!node) {
        return;
      }

      muted = true;

      const connections = editor
        .getConnections()
        .filter((item) => item.source === selectedNodeId || item.target === selectedNodeId);

      for (const connection of connections) {
        await editor.removeConnection(connection.id);
      }

      await editor.removeNode(node.id);
      nodeById.delete(node.id);
      await setSelectedNode(null);

      muted = false;
      notifyGraphChange();
    },
    async zoomIn() {
      const bounds = container.getBoundingClientRect();
      const transform = area.area.transform;
      await area.area.zoom(transform.k * 1.16, bounds.width / 2, bounds.height / 2, "dblclick");
    },
    async zoomOut() {
      const bounds = container.getBoundingClientRect();
      const transform = area.area.transform;
      await area.area.zoom(transform.k / 1.16, bounds.width / 2, bounds.height / 2, "dblclick");
    },
    async fit() {
      if (!editor.getNodes().length) {
        return;
      }

      await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: 0.9 });
    },
    destroy() {
      area.destroy();
      container.classList.remove("flow-rete-canvas");
    },
  };
}

export const FlowReteCanvas = forwardRef<
  FlowCanvasHandle,
  {
    nodes: FlowGraphNode[];
    edges: FlowGraphEdge[];
    selectedNodeId: string | null;
    onSelectionChange: (nodeId: string | null) => void;
    onGraphChange: (nodes: FlowGraphNode[], edges: FlowGraphEdge[]) => void;
  }
>(function FlowReteCanvas({ nodes, edges, selectedNodeId, onSelectionChange, onGraphChange }, ref) {
  const latestCallbacksRef = useRef({ onSelectionChange, onGraphChange });
  const initialGraphRef = useRef({
    nodes: normalizeFlowNodes(nodes),
    edges: normalizeFlowEdges(edges),
  });

  latestCallbacksRef.current = { onSelectionChange, onGraphChange };

  const createEditor = useCallback(
    async (container: HTMLElement) =>
      createFlowEditor(container, {
        initialNodes: initialGraphRef.current.nodes,
        initialEdges: initialGraphRef.current.edges,
        onSelectionChange: (nodeId) => latestCallbacksRef.current.onSelectionChange(nodeId),
        onGraphChange: (nextNodes, nextEdges) => latestCallbacksRef.current.onGraphChange(nextNodes, nextEdges),
      }),
    []
  );

  const [containerRef, editor] = useRete<FlowEditorController>(createEditor);

  useImperativeHandle(
    ref,
    () => ({
      addNode(type) {
        return editor?.addNode(type) ?? Promise.resolve();
      },
      updateNode(nodeId, patch) {
        return editor?.updateNode(nodeId, patch) ?? Promise.resolve();
      },
      selectNode(nodeId) {
        return editor?.selectNode(nodeId) ?? Promise.resolve();
      },
      deleteSelectedNode() {
        return editor?.deleteSelectedNode() ?? Promise.resolve();
      },
      zoomIn() {
        return editor?.zoomIn() ?? Promise.resolve();
      },
      zoomOut() {
        return editor?.zoomOut() ?? Promise.resolve();
      },
      fit() {
        return editor?.fit() ?? Promise.resolve();
      },
    }),
    [editor]
  );

  useEffect(() => {
    void editor?.selectNode(selectedNodeId);
  }, [editor, selectedNodeId]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData("application/amanda-flow-node") as FlowNodeType;
    if (!nodeType || !editor) {
      return;
    }

    void editor.addNodeAtClientPoint(nodeType, { x: event.clientX, y: event.clientY });
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      void editor?.deleteSelectedNode();
    }
  }

  return (
    <div className="flow-canvas-root" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flow-canvas-wrapper" onDragOver={handleDragOver} onDrop={handleDrop}>
        <div className="flow-canvas-control-cluster">
          <button className="secondary-button flow-canvas-control" onClick={() => void editor?.zoomIn()} type="button">
            +
          </button>
          <button className="secondary-button flow-canvas-control" onClick={() => void editor?.zoomOut()} type="button">
            −
          </button>
          <button className="secondary-button flow-canvas-control" onClick={() => void editor?.fit()} type="button">
            Fit
          </button>
        </div>

        <div className="flow-rete-surface" ref={containerRef} />

        {!nodes.length ? (
          <div className="flow-canvas-empty">
            <strong>Start with a trigger or an agent block</strong>
            <p>Drag a block from the left palette or click one to place it on Amanda’s workflow canvas.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
});
