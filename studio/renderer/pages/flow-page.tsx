import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FLOW_RUNTIME_CONFIG,
  FLOW_TIER_OPTIONS,
  getFlowBlockDefinition,
} from "../../../src/studio/flow-blocks";
import type {
  AmandaTier,
  FlowBlockDefinition,
  FlowBlockFieldDefinition,
  FlowGraph,
  FlowGraphEdge,
  FlowGraphNode,
  FlowNodeData,
} from "../../../src/studio/types";
import { studioClient } from "../client";
import { EmptyState, LoadingCopy, LiveTimestamp, StatusPill } from "../components/ui";
import { flowNodeTypeColors } from "../components/flow-node";
import {
  FLOW_BLOCK_PALETTE_ITEMS,
  flowNodeTypeLabels,
  formatFlowConfigInput,
  normalizeFlowEdges,
  normalizeFlowNodes,
  parseFlowConfigInput,
} from "../flow-editor";
import { FlowReteCanvas, type FlowCanvasHandle } from "../flow-rete";
import { useAsyncData } from "../hooks/use-async-data";

const RUNTIME_TIERS: Exclude<AmandaTier, "no_reply">[] = [
  "banter",
  "question",
  "reasoning",
  "complex",
  "correction",
  "image",
];

function getNodeData(node: FlowGraphNode | null): FlowNodeData | null {
  if (!node || !node.data || typeof node.data !== "object") {
    return null;
  }

  return node.data;
}

function getNodeConfig(nodeData: FlowNodeData | null): Record<string, unknown> {
  if (!nodeData?.config || typeof nodeData.config !== "object" || Array.isArray(nodeData.config)) {
    return {};
  }

  return nodeData.config;
}

function readStringConfig(config: Record<string, unknown>, key: string, fallback = "") {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function readNumberConfig(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBooleanConfig(config: Record<string, unknown>, key: string, fallback = false) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function readTierArrayConfig(config: Record<string, unknown>, key: string, fallback: AmandaTier[]) {
  const value = config[key];
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = value.filter((item): item is AmandaTier => typeof item === "string");
  return next.length ? next : fallback;
}

function readTierModelsConfig(config: Record<string, unknown>) {
  const current = config.tierModels;
  const fallback = DEFAULT_FLOW_RUNTIME_CONFIG.tierModels;

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return fallback;
  }

  const next = { ...fallback };

  for (const tier of RUNTIME_TIERS) {
    const value = (current as Record<string, unknown>)[tier];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    next[tier] = {
      model: readStringConfig(value as Record<string, unknown>, "model", fallback[tier].model),
      maxTurns: readNumberConfig(value as Record<string, unknown>, "maxTurns", fallback[tier].maxTurns),
    };
  }

  return next;
}

function GraphStatusNote({
  editing,
  active,
}: {
  editing: boolean;
  active: boolean;
}) {
  return (
    <div className="definition-card flow-graph-meta-card">
      <div className="panel-row">
        <strong>Editing</strong>
        <span>{editing ? "Selected in Studio" : "Not selected"}</span>
      </div>
      <div className="panel-row">
        <strong>Runtime</strong>
        <span>{active ? "Used by Amanda" : "Inactive graph"}</span>
      </div>
    </div>
  );
}

export function FlowPage() {
  const {
    data: flowDocument,
    loading: graphsLoading,
    error: graphsError,
    reload: reloadGraphs,
    setData: setFlowDocument,
  } = useAsyncData(() => studioClient.getFlowGraphDocument(), []);

  const canvasRef = useRef<FlowCanvasHandle | null>(null);

  const graphs = flowDocument?.graphs ?? [];
  const activeGraphId = flowDocument?.activeGraphId ?? null;

  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [graph, setGraph] = useState<FlowGraph | null>(null);
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
  const [activating, setActivating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [canvasRevision, setCanvasRevision] = useState(0);

  useEffect(() => {
    if (!graphs.length) {
      setSelectedGraphId(null);
      return;
    }

    if (!selectedGraphId || !graphs.some((item) => item.id === selectedGraphId)) {
      setSelectedGraphId(activeGraphId ?? graphs[0]!.id);
    }
  }, [activeGraphId, graphs, selectedGraphId]);

  const selectedGraph = useMemo(
    () => graphs.find((item) => item.id === selectedGraphId) ?? null,
    [graphs, selectedGraphId]
  );

  function resetGraphDraft(source: FlowGraph) {
    setGraph(source);
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
    if (!selectedGraph) {
      setGraph(null);
      return;
    }

    resetGraphDraft(selectedGraph);
  }, [selectedGraph]);

  useEffect(() => {
    if (!selectedNodeId) {
      setConfigInput("{}");
      setConfigError(null);
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedNodeData = getNodeData(selectedNode);
    setConfigInput(formatFlowConfigInput(getNodeConfig(selectedNodeData)));
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
  const selectedNodeConfig = getNodeConfig(selectedNodeData);
  const selectedBlockDefinition = selectedNodeData?.blockKey
    ? getFlowBlockDefinition(selectedNodeData.blockKey)
    : null;
  const incomingEdgeCount = selectedNodeId ? edges.filter((edge) => edge.target === selectedNodeId).length : 0;
  const outgoingEdgeCount = selectedNodeId ? edges.filter((edge) => edge.source === selectedNodeId).length : 0;
  const deleteBlocked = graphs.length <= 1;
  const graphCards = useMemo(
    () =>
      graphs.map((item) => ({
        ...item,
        displayName: item.id === graph?.id ? draftName || item.name : item.name,
        nodeCount: item.id === graph?.id ? nodes.length : item.nodes.length,
        edgeCount: item.id === graph?.id ? edges.length : item.edges.length,
        dirty: item.id === graph?.id ? isDirty : false,
        active: item.id === activeGraphId,
      })),
    [activeGraphId, draftName, edges.length, graph?.id, graphs, isDirty, nodes.length]
  );

  const saveDisabled = !graph || saving || Boolean(configError);
  const canActivateSelectedGraph = Boolean(graph && graph.id !== activeGraphId && !isDirty && !saving);

  function handleCanvasGraphChange(nextNodes: FlowGraphNode[], nextEdges: FlowGraphEdge[]) {
    setNodes(normalizeFlowNodes(nextNodes));
    setEdges(normalizeFlowEdges(nextEdges));
    setIsDirty(true);
    setActionError(null);
  }

  function handleCreateBlock(blockKey: (typeof FLOW_BLOCK_PALETTE_ITEMS)[number]["blockKey"]) {
    setActionError(null);
    void canvasRef.current?.addBlock(blockKey);
  }

  function discardChanges() {
    if (!graph) return;
    resetGraphDraft(graph);
  }

  async function saveGraph() {
    if (!graph) return;

    if (configError) {
      setActionError("Fix the selected block JSON before saving.");
      return;
    }

    try {
      setSaving(true);
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
      setNewGraphName("");
      reloadGraphs();
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

  async function activateSelectedGraph() {
    if (!graph) return;

    if (isDirty) {
      setActionError("Save or discard this flow before making it Amanda's active runtime graph.");
      return;
    }

    try {
      setActivating(true);
      setActionError(null);
      const nextDocument = await studioClient.setActiveFlowGraph(graph.id);
      setFlowDocument(nextDocument);
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to activate this flow graph.");
    } finally {
      setActivating(false);
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

  function updateSelectedNodeConfig(patch: Record<string, unknown>) {
    updateSelectedNode({
      config: {
        ...selectedNodeConfig,
        ...patch,
      },
    });
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

  function renderConfigField(field: FlowBlockFieldDefinition, definition: FlowBlockDefinition) {
    switch (field.kind) {
      case "string":
        return (
          <label key={field.key}>
            {field.label}
            <input
              value={readStringConfig(selectedNodeConfig, field.key)}
              onChange={(event) => updateSelectedNodeConfig({ [field.key]: event.target.value })}
            />
            {field.description ? <p className="meta">{field.description}</p> : null}
          </label>
        );
      case "number":
        return (
          <label key={field.key}>
            {field.label}
            <input
              min={field.min ?? 0}
              type="number"
              value={readNumberConfig(selectedNodeConfig, field.key, field.min ?? 0)}
              onChange={(event) =>
                updateSelectedNodeConfig({
                  [field.key]: Math.max(
                    field.min ?? 0,
                    Number.parseInt(event.target.value || String(field.min ?? 0), 10) || field.min || 0
                  ),
                })
              }
            />
            {field.description ? <p className="meta">{field.description}</p> : null}
          </label>
        );
      case "boolean":
        return (
          <label className="flow-toggle-row" key={field.key}>
            <input
              checked={readBooleanConfig(selectedNodeConfig, field.key, false)}
              onChange={(event) => updateSelectedNodeConfig({ [field.key]: event.target.checked })}
              type="checkbox"
            />
            <span>{field.label}</span>
            {field.description ? <span className="meta">{field.description}</span> : null}
          </label>
        );
      case "multiselect": {
        const selectedValues = new Set(
          readTierArrayConfig(
            selectedNodeConfig,
            field.key,
            DEFAULT_FLOW_RUNTIME_CONFIG.holdingReplyTiers
          )
        );
        return (
          <div className="definition-card flow-graph-meta-card" key={field.key}>
            <strong>{field.label}</strong>
            {field.description ? <p className="meta">{field.description}</p> : null}
            {(field.options ?? FLOW_TIER_OPTIONS).map((option) => (
              <label className="flow-toggle-row" key={option.value}>
                <input
                  checked={selectedValues.has(option.value as AmandaTier)}
                  onChange={(event) => {
                    const next = new Set(selectedValues);
                    if (event.target.checked) {
                      next.add(option.value as AmandaTier);
                    } else {
                      next.delete(option.value as AmandaTier);
                    }
                    updateSelectedNodeConfig({ [field.key]: [...next] });
                  }}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );
      }
      case "tier_models": {
        const tierModels = readTierModelsConfig(selectedNodeConfig);
        return (
          <div className="definition-card flow-graph-meta-card" key={field.key}>
            <strong>{field.label}</strong>
            {field.description ? <p className="meta">{field.description}</p> : null}
            <div className="flow-tier-model-table">
              {RUNTIME_TIERS.map((tier) => (
                <div className="flow-tier-model-row" key={tier}>
                  <strong>{tier}</strong>
                  <input
                    value={tierModels[tier].model}
                    onChange={(event) =>
                      updateSelectedNodeConfig({
                        tierModels: {
                          ...tierModels,
                          [tier]: {
                            ...tierModels[tier],
                            model: event.target.value,
                          },
                        },
                      })
                    }
                    placeholder="model"
                  />
                  <input
                    min={1}
                    type="number"
                    value={tierModels[tier].maxTurns}
                    onChange={(event) =>
                      updateSelectedNodeConfig({
                        tierModels: {
                          ...tierModels,
                          [tier]: {
                            ...tierModels[tier],
                            maxTurns: Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1),
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      default:
        return (
          <p className="meta" key={`${definition.blockKey}:${field.key}`}>
            No typed renderer is available for this field yet.
          </p>
        );
    }
  }

  function renderSelectedNodeInspector() {
    if (!selectedNodeData || !selectedBlockDefinition) {
      return null;
    }

    return (
      <div className="flow-inspector-stack">
        <div className="flow-pane-header">
          <div>
            <p className="eyebrow">Block inspector</p>
            <h3>{selectedNodeData.label}</h3>
          </div>
          <StatusPill value={selectedNodeData.enabled === false ? "offline" : "ready"} />
        </div>

        <div className="flow-node-type-chip">
          <span
            className="flow-node-type-dot"
            style={{ background: flowNodeTypeColors[selectedNodeData.nodeType] }}
          />
          <span>{selectedBlockDefinition.label}</span>
        </div>

        <label>
          Block label
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

        <div className="flow-inspector-stack">
          <div className="flow-pane-header">
            <div>
              <p className="eyebrow">Runtime config</p>
              <h3>{selectedBlockDefinition.label}</h3>
            </div>
          </div>

          {selectedBlockDefinition.inspectorFields?.length
            ? selectedBlockDefinition.inspectorFields.map((field) =>
                renderConfigField(field, selectedBlockDefinition)
              )
            : (
                <p className="meta">
                  No runtime settings yet. This block is represented in the flow, but Layer 1 does not compile any
                  custom config from it yet.
                </p>
              )}
        </div>

        <details>
          <summary>Advanced JSON</summary>
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
            <p className="meta">Unknown keys are preserved when saved and ignored unless a registered block schema uses them.</p>
          )}
        </details>

        <button className="secondary-button" type="button" onClick={() => setSelectedNodeId(null)}>
          Back to graph settings
        </button>
      </div>
    );
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
                <div>
                  {item.active ? <span className="flow-node-state">Active</span> : null}
                  {item.dirty ? <span className="flow-card-dirty-dot" aria-hidden="true" /> : null}
                </div>
              </div>
              <div className="flow-graph-card-meta">
                <span>{item.nodeCount} blocks</span>
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
              <h3>Block templates</h3>
            </div>
          </div>
          <div className="flow-palette-grid">
            {FLOW_BLOCK_PALETTE_ITEMS.map(({ blockKey, nodeType, label, description }) => (
              <button
                key={blockKey}
                className={`flow-palette-item flow-palette-${nodeType}`}
                draggable
                onClick={() => handleCreateBlock(blockKey)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/amanda-flow-block", blockKey);
                  event.dataTransfer.effectAllowed = "move";
                }}
                type="button"
              >
                <span className="flow-palette-swatch" style={{ background: flowNodeTypeColors[nodeType] }} />
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
                : activeGraphId === graph?.id
                  ? "Editing Amanda's active runtime graph"
                  : "Editing a non-active graph. Amanda will keep using the active graph until you activate this one."}
            </p>
          </div>

          <div className="flow-toolbar-actions">
            <button className="secondary-button" type="button" onClick={() => setSelectedNodeId(null)}>
              Graph settings
            </button>
            <button className="secondary-button" type="button" onClick={discardChanges} disabled={!isDirty || saving}>
              Discard changes
            </button>
            <button className="secondary-button" type="button" onClick={() => void activateSelectedGraph()} disabled={!canActivateSelectedGraph || activating}>
              {activating ? "Activating..." : activeGraphId === graph?.id ? "Active at runtime" : "Make active"}
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
          {graphsLoading ? <LoadingCopy message="Loading selected flow..." /> : null}
          {graphsError ? <p className="empty">Flow load issue: {graphsError}</p> : null}
          {!graphsLoading && !graphsError && !graph ? (
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
        {!graph && !graphsLoading ? (
          <EmptyState message="Choose a flow to inspect it." />
        ) : selectedNodeData ? (
          renderSelectedNodeInspector()
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
                <span>blocks</span>
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

            <GraphStatusNote editing={Boolean(graph)} active={activeGraphId === graph?.id} />

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

            <p className="meta">
              The selected graph is what you are editing. The active graph is what Amanda compiles and uses at runtime.
            </p>
            <p className="meta">
              Select any block on the canvas to edit its label, enablement, typed runtime settings, and advanced JSON.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
