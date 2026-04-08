import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowGraph, FlowGraphEdge, FlowGraphNode, FlowNodeData, FlowNodeType } from "../../../src/studio/types";
import { studioClient } from "../client";
import { EmptyState, LoadingCopy, LiveTimestamp, StatusPill } from "../components/ui";
import { flowNodeTypeColors } from "../components/flow-node";
import {
  FLOW_PALETTE_ITEMS,
  flowNodeTypeLabels,
  formatFlowConfigInput,
  normalizeFlowEdges,
  normalizeFlowNodes,
  parseFlowConfigInput,
} from "../flow-editor";
import { FlowReteCanvas, type FlowCanvasHandle } from "../flow-rete";
import { useAsyncData } from "../hooks/use-async-data";

function getNodeData(node: FlowGraphNode | null): FlowNodeData | null {
  if (!node || !node.data || typeof node.data !== "object") {
    return null;
  }

  return node.data;
}

export function FlowPage() {
  const {
    data: graphs,
    loading: graphsLoading,
    error: graphsError,
    reload: reloadGraphs,
  } = useAsyncData(() => studioClient.listFlowGraphs(), []);

  const canvasRef = useRef<FlowCanvasHandle | null>(null);

  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [graph, setGraph] = useState<FlowGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [nodes, setNodes] = useState<FlowGraphNode[]>([]);
  const [edges, setEdges] = useState<FlowGraphEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [configInput, setConfigInput] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);
  const [newGraphName, setNewGraphName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [canvasRevision, setCanvasRevision] = useState(0);

  useEffect(() => {
    if (!selectedGraphId && graphs?.length) {
      setSelectedGraphId(graphs[0]!.id);
    }
  }, [graphs, selectedGraphId]);

  function resetGraphDraft(source: FlowGraph) {
    setDraftName(source.name);
    setDraftDescription(source.description ?? "");
    setNodes(normalizeFlowNodes(source.nodes));
    setEdges(normalizeFlowEdges(source.edges));
    setSelectedNodeId(null);
    setConfigInput("{}");
    setConfigError(null);
    setConfirmDelete(false);
    setIsDirty(false);
    setActionError(null);
    setCanvasRevision((current) => current + 1);
  }

  useEffect(() => {
    if (!selectedGraphId) return;
    const flowGraphId = selectedGraphId;

    let cancelled = false;

    async function loadGraph() {
      try {
        setGraphLoading(true);
        setGraphError(null);
        setGraph(null);
        const next = await studioClient.getFlowGraph(flowGraphId);
        if (!next || cancelled) {
          return;
        }

        setGraph(next);
        resetGraphDraft(next);
      } catch (error: any) {
        if (!cancelled) {
          setGraphError(error?.message ?? "Unable to load the selected flow graph.");
        }
      } finally {
        if (!cancelled) {
          setGraphLoading(false);
        }
      }
    }

    void loadGraph();

    return () => {
      cancelled = true;
    };
  }, [selectedGraphId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setConfigInput("{}");
      setConfigError(null);
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedNodeData = getNodeData(selectedNode);
    setConfigInput(formatFlowConfigInput((selectedNodeData?.config as Record<string, unknown> | undefined) ?? {}));
    setConfigError(null);
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setConfigInput("{}");
      setConfigError(null);
    }
  }, [nodes, selectedNodeId]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedNodeData = getNodeData(selectedNode);
  const incomingEdgeCount = selectedNodeId ? edges.filter((edge) => edge.target === selectedNodeId).length : 0;
  const outgoingEdgeCount = selectedNodeId ? edges.filter((edge) => edge.source === selectedNodeId).length : 0;
  const deleteBlocked = (graphs?.length ?? 0) <= 1;

  const graphCards = useMemo(
    () =>
      (graphs ?? []).map((item) => ({
        ...item,
        displayName: item.id === graph?.id ? draftName || item.name : item.name,
        nodeCount: item.id === graph?.id ? nodes.length : item.nodes.length,
        edgeCount: item.id === graph?.id ? edges.length : item.edges.length,
        dirty: item.id === graph?.id ? isDirty : false,
      })),
    [draftName, edges.length, graph?.id, graphs, isDirty, nodes.length]
  );

  const saveDisabled = !graph || saving || Boolean(configError);

  function handleCanvasGraphChange(nextNodes: FlowGraphNode[], nextEdges: FlowGraphEdge[]) {
    setNodes(normalizeFlowNodes(nextNodes));
    setEdges(normalizeFlowEdges(nextEdges));
    setIsDirty(true);
    setActionError(null);
  }

  function handleCreateNode(type: FlowNodeType) {
    setActionError(null);
    void canvasRef.current?.addNode(type);
  }

  function discardChanges() {
    if (!graph) return;
    resetGraphDraft(graph);
  }

  async function saveGraph() {
    if (!graph) return;

    if (configError) {
      setActionError("Fix the selected node config JSON before saving.");
      return;
    }

    try {
      setSaving(true);
      setGraphError(null);
      setActionError(null);
      const updated = await studioClient.updateFlowGraph(graph.id, {
        name: draftName.trim() || graph.name,
        description: draftDescription.trim() || undefined,
        nodes: normalizeFlowNodes(nodes),
        edges: normalizeFlowEdges(edges),
      });

      setGraph(updated);
      resetGraphDraft(updated);
      reloadGraphs();
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to save this flow graph.");
    } finally {
      setSaving(false);
    }
  }

  async function createGraph() {
    if (isDirty) {
      setCreateError("Save or discard the current flow before creating another one.");
      return;
    }

    const trimmedName = newGraphName.trim();
    if (!trimmedName) {
      setCreateError("Give the new flow a name first.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      const created = await studioClient.createFlowGraph({ name: trimmedName });
      reloadGraphs();
      setNewGraphName("");
      setSelectedGraphId(created.id);
    } catch (error: any) {
      setCreateError(error?.message ?? "Unable to create a new flow graph.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteGraph() {
    if (!graph) return;

    if (deleteBlocked) {
      setActionError("At least one flow graph must remain.");
      return;
    }

    if (isDirty) {
      setActionError("Save or discard the current flow before deleting it.");
      return;
    }

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setActionError(null);
      const remaining = await studioClient.deleteFlowGraph(graph.id);
      reloadGraphs();
      setConfirmDelete(false);
      setSelectedGraphId(remaining[0]?.id ?? null);
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to delete this flow graph.");
    }
  }

  function handleSelectGraph(nextGraphId: string) {
    if (nextGraphId === selectedGraphId) return;

    if (isDirty) {
      setActionError("Save or discard the current flow before switching to another one.");
      return;
    }

    setActionError(null);
    setSelectedGraphId(nextGraphId);
  }

  function updateSelectedNode(patch: Partial<FlowNodeData>) {
    if (!selectedNodeId) return;

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) return node;

        return normalizeFlowNodes([
          {
            ...node,
            data: {
              ...node.data,
              ...patch,
            },
          },
        ])[0]!;
      })
    );

    setIsDirty(true);
    setActionError(null);
    void canvasRef.current?.updateNode(selectedNodeId, patch);
  }

  function handleConfigInputChange(value: string) {
    setConfigInput(value);

    try {
      const nextConfig = parseFlowConfigInput(value);
      setConfigError(null);
      updateSelectedNode({ config: nextConfig });
    } catch (error: any) {
      setConfigError(error?.message ?? "Config JSON must be a valid object.");
    }
  }

  return (
    <div className="flow-editor-page">
      <aside className="panel flow-sidebar-panel">
        <div className="flow-pane-header">
          <div>
            <p className="eyebrow">Flows</p>
            <h3>Saved graphs</h3>
          </div>
          <span className="meta">{graphCards.length}</span>
        </div>

        <div className="compact-list flow-graph-list">
          {graphsLoading ? <LoadingCopy message="Loading flows..." /> : null}
          {graphsError ? <p className="empty">Flow list issue: {graphsError}</p> : null}
          {!graphsLoading && !graphsError && !graphCards.length ? (
            <EmptyState message="No flow graphs are available yet." />
          ) : null}
          {graphCards.map((item) => (
            <button
              className={`flow-graph-card${selectedGraphId === item.id ? " active" : ""}`}
              key={item.id}
              onClick={() => handleSelectGraph(item.id)}
              type="button"
            >
              <div className="flow-graph-card-top">
                <strong>{item.displayName}</strong>
                {item.dirty ? <span className="flow-card-dirty-dot" aria-hidden="true" /> : null}
              </div>
              <div className="flow-graph-card-meta">
                <span>{item.nodeCount} nodes</span>
                <span>{item.edgeCount} edges</span>
                <LiveTimestamp value={item.updatedAt} />
              </div>
            </button>
          ))}
        </div>

        <div className="flow-create-card">
          <p className="eyebrow">New flow</p>
          <label>
            Flow name
            <input
              placeholder="Reminder Follow-up"
              value={newGraphName}
              onChange={(event) => setNewGraphName(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void createGraph()} disabled={creating}>
            {creating ? "Creating..." : "Create flow"}
          </button>
          {createError ? <p className="empty">Flow creation issue: {createError}</p> : null}
        </div>

        <div className="flow-palette">
          <div className="flow-pane-header">
            <div>
              <p className="eyebrow">Palette</p>
              <h3>Workflow blocks</h3>
            </div>
          </div>
          <div className="flow-palette-grid">
            {FLOW_PALETTE_ITEMS.map(({ type, label, description }) => (
              <button
                key={type}
                className={`flow-palette-item flow-palette-${type}`}
                draggable
                onClick={() => handleCreateNode(type)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/amanda-flow-node", type);
                  event.dataTransfer.effectAllowed = "move";
                }}
                type="button"
              >
                <span className="flow-palette-swatch" style={{ background: flowNodeTypeColors[type] }} />
                <div className="flow-palette-copy">
                  <strong>{label}</strong>
                  <small>{description}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="panel flow-shell-panel">
        <header className="flow-editor-toolbar">
          <div className="flow-toolbar-copy">
            <p className="eyebrow">Workflow canvas</p>
            <div className="flow-toolbar-title-row">
              <h2>{draftName || graph?.name || "Flow Editor"}</h2>
              <span className={`flow-save-state${isDirty ? " dirty" : ""}`}>
                {isDirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
            <p className="flow-toolbar-meta">
              {selectedNodeData
                ? `${flowNodeTypeLabels[selectedNodeData.nodeType]} selected • ${incomingEdgeCount} inbound • ${outgoingEdgeCount} outbound`
                : `${nodes.length} nodes • ${edges.length} edges • Select a node to edit its properties`}
            </p>
          </div>

          <div className="flow-toolbar-actions">
            <button className="secondary-button" type="button" onClick={() => setSelectedNodeId(null)}>
              Graph settings
            </button>
            <button className="secondary-button" type="button" onClick={discardChanges} disabled={!isDirty || saving}>
              Discard changes
            </button>
            <button
              className={`secondary-button${confirmDelete ? " danger-button" : ""}`}
              type="button"
              onClick={() => void deleteGraph()}
              disabled={deleteBlocked || saving}
            >
              {confirmDelete ? "Confirm delete" : "Delete flow"}
            </button>
            <button type="button" onClick={() => void saveGraph()} disabled={saveDisabled}>
              {saving ? "Saving..." : isDirty ? "Save flow" : "Saved"}
            </button>
          </div>
        </header>

        {actionError ? (
          <div className="flow-status-banner flow-status-banner-error">
            <strong>Flow issue</strong>
            <p>{actionError}</p>
          </div>
        ) : null}
        {configError ? (
          <div className="flow-status-banner flow-status-banner-warning">
            <strong>Config JSON needs attention</strong>
            <p>{configError}</p>
          </div>
        ) : null}

        <div className="flow-shell-canvas">
          {graphLoading ? <LoadingCopy message="Loading selected flow..." /> : null}
          {graphError ? <p className="empty">Flow load issue: {graphError}</p> : null}
          {!graphLoading && !graphError && !graph ? (
            <EmptyState message="Select a flow from the left sidebar to start editing." />
          ) : null}
          {graph ? (
            <FlowReteCanvas
              key={`${graph.id}:${canvasRevision}`}
              ref={canvasRef}
              nodes={nodes}
              edges={edges}
              selectedNodeId={selectedNodeId}
              onSelectionChange={setSelectedNodeId}
              onGraphChange={handleCanvasGraphChange}
            />
          ) : null}
        </div>
      </section>

      <aside className="panel flow-inspector-panel">
        {!graph && !graphLoading ? (
          <EmptyState message="Choose a flow to inspect it." />
        ) : selectedNodeData ? (
          <div className="flow-inspector-stack">
            <div className="flow-pane-header">
              <div>
                <p className="eyebrow">Node inspector</p>
                <h3>{selectedNodeData.label}</h3>
              </div>
              <StatusPill value={selectedNodeData.enabled === false ? "offline" : "ready"} />
            </div>

            <div className="flow-node-type-chip">
              <span
                className="flow-node-type-dot"
                style={{ background: flowNodeTypeColors[selectedNodeData.nodeType] }}
              />
              <span>{flowNodeTypeLabels[selectedNodeData.nodeType]}</span>
            </div>

            <label>
              Node label
              <input
                value={selectedNodeData.label}
                onChange={(event) => updateSelectedNode({ label: event.target.value })}
              />
            </label>

            <label>
              Description
              <textarea
                className="flow-inspector-textarea"
                rows={4}
                value={selectedNodeData.description ?? ""}
                onChange={(event) => updateSelectedNode({ description: event.target.value })}
              />
            </label>

            <label className="flow-toggle-row">
              <input
                checked={selectedNodeData.enabled !== false}
                onChange={(event) => updateSelectedNode({ enabled: event.target.checked })}
                type="checkbox"
              />
              <span>Enabled in this workflow</span>
            </label>

            <div className="meta-grid flow-inspector-stats">
              <div className="stat-card">
                <strong>{incomingEdgeCount}</strong>
                <span>incoming</span>
              </div>
              <div className="stat-card">
                <strong>{outgoingEdgeCount}</strong>
                <span>outgoing</span>
              </div>
            </div>

            <label>
              Config JSON
              <textarea
                className="json-input flow-config-input"
                rows={10}
                value={configInput}
                onChange={(event) => handleConfigInputChange(event.target.value)}
              />
            </label>

            {configError ? (
              <p className="empty">Config issue: {configError}</p>
            ) : (
              <p className="meta">Valid JSON object. These keys are stored on the node and saved with the graph.</p>
            )}

            <button className="secondary-button" type="button" onClick={() => setSelectedNodeId(null)}>
              Back to graph settings
            </button>
          </div>
        ) : (
          <div className="flow-inspector-stack">
            <div className="flow-pane-header">
              <div>
                <p className="eyebrow">Graph inspector</p>
                <h3>{draftName || graph?.name || "Workflow graph"}</h3>
              </div>
              <StatusPill value={isDirty ? "degraded" : "ready"} />
            </div>

            <label>
              Graph name
              <input
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setIsDirty(true);
                  setActionError(null);
                }}
              />
            </label>

            <label>
              Description
              <textarea
                className="flow-inspector-textarea"
                rows={5}
                value={draftDescription}
                onChange={(event) => {
                  setDraftDescription(event.target.value);
                  setIsDirty(true);
                  setActionError(null);
                }}
              />
            </label>

            <div className="stats-grid flow-inspector-stats">
              <div className="stat-card">
                <strong>{nodes.length}</strong>
                <span>nodes</span>
              </div>
              <div className="stat-card">
                <strong>{edges.length}</strong>
                <span>edges</span>
              </div>
              <div className="stat-card">
                <strong>{isDirty ? "dirty" : "saved"}</strong>
                <span>editor state</span>
              </div>
            </div>

            {graph ? (
              <div className="definition-card flow-graph-meta-card">
                <div className="panel-row">
                  <strong>Created</strong>
                  <LiveTimestamp value={graph.createdAt} />
                </div>
                <div className="panel-row">
                  <strong>Last saved</strong>
                  <LiveTimestamp value={graph.updatedAt} />
                </div>
              </div>
            ) : null}

            <p className="meta">Select any node on the canvas to edit its label, description, enabled state, and raw config.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
