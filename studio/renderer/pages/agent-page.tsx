import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  normalizePromptGraphNodes,
  promptGraphNodeTypeLabels,
} from "../../../src/studio/prompt-graph-compiler";
import type {
  PromptGraphNode,
  PromptGraphNodeType,
  PromptGraphVariant,
} from "../../../src/studio/types";
import { useShellContext } from "../context";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, LoadingCopy, PageHeader, StatusPill } from "../components/ui";
import { PromptNodeEditor } from "../components/prompt-node-editor";

const nodeTypeOptions: PromptGraphNodeType[] = ["core", "context", "rules", "examples", "tooling"];

const nodeTypeDotColors: Record<PromptGraphNodeType, string> = {
  core: "#71b7f5",
  context: "#c6a8ee",
  rules: "#ee9dc5",
  examples: "#f4b69d",
  tooling: "#a596f1",
};

function cloneVariant(variant: PromptGraphVariant): PromptGraphVariant {
  return {
    ...variant,
    nodes: variant.nodes.map((node) => ({ ...node })),
  };
}

function variantFingerprint(variant: PromptGraphVariant | null) {
  if (!variant) return "";
  return JSON.stringify({
    name: variant.name,
    nodes: normalizePromptGraphNodes(variant.nodes).map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      content: node.content,
      enabled: node.enabled,
      order: node.order,
    })),
  });
}

function moveNode(nodes: PromptGraphNode[], sourceId: string, targetId: string) {
  const ordered = normalizePromptGraphNodes(nodes);
  const sourceIndex = ordered.findIndex((node) => node.id === sourceId);
  const targetIndex = ordered.findIndex((node) => node.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return ordered;
  }

  const next = [...ordered];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return normalizePromptGraphNodes(next);
}

function nodeHasChanged(previous: PromptGraphNode | undefined, current: PromptGraphNode) {
  if (!previous) return true;
  return (
    previous.type !== current.type ||
    previous.title !== current.title ||
    previous.content !== current.content ||
    previous.enabled !== current.enabled
  );
}

export function AgentPage() {
  const { refreshSnapshot } = useShellContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftVariant, setDraftVariant] = useState<PromptGraphVariant | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [savingVariant, setSavingVariant] = useState(false);
  const [publishingVariant, setPublishingVariant] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  const {
    data: variants,
    loading: variantsLoading,
    error: variantsError,
    reload: reloadVariants,
  } = useAsyncData(() => studioClient.listPromptGraphVariants(), []);

  const selectedVariantId = searchParams.get("variant");

  const {
    data: selectedVariant,
    loading: selectedVariantLoading,
    error: selectedVariantError,
    setData: setSelectedVariant,
  } = useAsyncData(
    () => (selectedVariantId ? studioClient.getPromptGraphVariant(selectedVariantId) : Promise.resolve(null)),
    [selectedVariantId]
  );

  useEffect(() => {
    if (!selectedVariantId && variants?.length) {
      setSearchParams({ variant: variants[0]!.id }, { replace: true });
    }
  }, [selectedVariantId, setSearchParams, variants]);

  useEffect(() => {
    if (selectedVariant) {
      setDraftVariant(cloneVariant(selectedVariant));
      setCollapsedNodeIds(new Set(selectedVariant.nodes.map((n) => n.id)));
    }
  }, [selectedVariant?.id, selectedVariant?.updatedAt]);

  const isDirty = useMemo(
    () => variantFingerprint(selectedVariant) !== variantFingerprint(draftVariant),
    [draftVariant, selectedVariant]
  );

  function selectVariant(variantId: string) {
    setSearchParams({ variant: variantId });
  }

  function updateDraftVariant(updater: (variant: PromptGraphVariant) => PromptGraphVariant) {
    setDraftVariant((current) => (current ? updater(current) : current));
  }

  function addNode() {
    const newId = `draft-${globalThis.crypto.randomUUID()}`;
    updateDraftVariant((variant) => ({
      ...variant,
      nodes: normalizePromptGraphNodes([
        ...variant.nodes,
        {
          id: newId,
          type: "rules",
          title: "New Rules Node",
          content: "",
          enabled: true,
          order: variant.nodes.length,
        },
      ]),
    }));
    // new nodes start expanded so you can type immediately
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(newId);
      return next;
    });
  }

  function updateNode(nodeId: string, patch: Partial<PromptGraphNode>) {
    updateDraftVariant((variant) => ({
      ...variant,
      nodes: normalizePromptGraphNodes(
        variant.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
      ),
    }));
  }

  function removeNode(nodeId: string) {
    if (!window.confirm("Delete this prompt node?")) return;
    updateDraftVariant((variant) => ({
      ...variant,
      nodes: normalizePromptGraphNodes(variant.nodes.filter((node) => node.id !== nodeId)),
    }));
  }

  function toggleNodeCollapsed(nodeId: string) {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  async function saveVariant() {
    if (!draftVariant || !selectedVariant) return null;

    try {
      setSavingVariant(true);
      let persisted = selectedVariant;
      const originalNodes = new Map(selectedVariant.nodes.map((node) => [node.id, node]));
      const workingDraft = cloneVariant(draftVariant);

      if (draftVariant.name !== selectedVariant.name) {
        persisted = await studioClient.updatePromptGraphVariant(selectedVariant.id, { name: draftVariant.name });
      }

      for (const node of normalizePromptGraphNodes(workingDraft.nodes)) {
        if (node.id.startsWith("draft-")) {
          const existingIds = new Set(persisted.nodes.map((item) => item.id));
          persisted = await studioClient.createPromptGraphNode(selectedVariant.id, {
            type: node.type,
            title: node.title,
            content: node.content,
            enabled: node.enabled,
          });
          const created = persisted.nodes.find((item) => !existingIds.has(item.id));
          if (created) {
            node.id = created.id;
          }
          continue;
        }

        if (nodeHasChanged(originalNodes.get(node.id), node)) {
          persisted = await studioClient.updatePromptGraphNode(selectedVariant.id, node.id, {
            type: node.type,
            title: node.title,
            content: node.content,
            enabled: node.enabled,
          });
        }
      }

      for (const original of selectedVariant.nodes) {
        if (!workingDraft.nodes.some((node) => node.id === original.id)) {
          persisted = await studioClient.deletePromptGraphNode(selectedVariant.id, original.id);
        }
      }

      persisted = await studioClient.reorderPromptGraphNodes(
        selectedVariant.id,
        normalizePromptGraphNodes(workingDraft.nodes).map((node) => node.id)
      );

      setSelectedVariant(persisted);
      setDraftVariant(cloneVariant(persisted));
      reloadVariants();
      if (persisted.isPublished) {
        await refreshSnapshot();
      }
      return persisted;
    } finally {
      setSavingVariant(false);
    }
  }

  async function createVariant() {
    const name = window.prompt("New prompt graph name", "New Variant");
    if (!name) return;

    const created = await studioClient.createPromptGraphVariant({
      name,
      agentId: "amanda-core",
    });
    reloadVariants();
    selectVariant(created.id);
  }

  async function duplicateVariant() {
    if (!selectedVariant) return;
    const name = window.prompt("Duplicate variant name", `${selectedVariant.name} Copy`);
    if (!name) return;

    const created = await studioClient.createPromptGraphVariant({
      name,
      agentId: selectedVariant.agentId,
      nodes: selectedVariant.nodes.map((node) => ({
        type: node.type,
        title: node.title,
        content: node.content,
        enabled: node.enabled,
      })),
    });
    reloadVariants();
    selectVariant(created.id);
  }

  async function deleteVariant() {
    if (!selectedVariant || !window.confirm(`Delete variant "${selectedVariant.name}"?`)) return;

    const remaining = await studioClient.deletePromptGraphVariant(selectedVariant.id);
    reloadVariants();
    await refreshSnapshot();

    if (remaining.length) {
      selectVariant(remaining[0]!.id);
    }
  }

  async function publishVariant() {
    if (!selectedVariantId) return;

    try {
      setPublishingVariant(true);
      if (isDirty) {
        await saveVariant();
      }
      const published = await studioClient.publishPromptGraphVariant(selectedVariantId);
      setSelectedVariant(published);
      reloadVariants();
      await refreshSnapshot();
    } finally {
      setPublishingVariant(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Agent"
        title="Prompt graph workspace"
        description="Edit Amanda's prompt as ordered nodes, preview the compiled instructions, and publish when ready."
        secondaryActions={<button onClick={createVariant}>New Variant</button>}
        actions={
          <>
            <button onClick={() => void saveVariant()}>{savingVariant ? "Saving..." : "Save"}</button>
            <button onClick={() => void publishVariant()}>{publishingVariant ? "Publishing..." : "Publish"}</button>
          </>
        }
      />

      {variantsLoading ? <LoadingCopy message="Loading prompt graph workspace..." /> : null}
      {variantsError ? <p className="empty">Prompt graph issue: {variantsError}</p> : null}

      {variants ? (
        <section className="graph-workspace">
          {/* Variants sidebar */}
          <article className="panel graph-sidebar">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Variants</p>
                <h3>Saved graphs</h3>
              </div>
              <span className="meta">{variants.length}</span>
            </div>
            <div className="list">
              {variants.map((variant) => (
                <button
                  className={`graph-variant-card${selectedVariantId === variant.id ? " active" : ""}`}
                  key={variant.id}
                  onClick={() => selectVariant(variant.id)}
                >
                  <div className="panel-row">
                    <strong>{variant.name}</strong>
                    {variant.isPublished ? <StatusPill value="published" /> : <StatusPill value="draft" />}
                  </div>
                  <small>{variant.nodes.length} nodes</small>
                </button>
              ))}
            </div>
            <div className="quick-links">
              <button className="ghost-button" onClick={duplicateVariant}>
                Duplicate
              </button>
              <button className="ghost-button" onClick={deleteVariant}>
                Delete
              </button>
            </div>
          </article>

          {/* Node canvas */}
          <div className="graph-main">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Canvas</p>
                  {draftVariant ? (
                    <input
                      className="variant-name-input"
                      value={draftVariant.name}
                      onChange={(e) => setDraftVariant({ ...draftVariant, name: e.target.value })}
                    />
                  ) : (
                    <h3>No variant selected</h3>
                  )}
                </div>
                <div className="page-actions">
                  {draftVariant?.isPublished ? <StatusPill value="published" /> : <StatusPill value="draft" />}
                  {isDirty ? <span className="meta">Unsaved</span> : <span className="meta">Saved</span>}
                </div>
              </div>

              {selectedVariantLoading ? <LoadingCopy message="Loading variant..." /> : null}
              {selectedVariantError ? <p className="empty">Variant issue: {selectedVariantError}</p> : null}
              {!selectedVariantLoading && !selectedVariantError && !draftVariant ? (
                <EmptyState message="Choose a variant to edit." />
              ) : null}

              {draftVariant ? (
                <>
                  <div className="prompt-node-toolbar">
                    <button className="ghost-button" onClick={addNode}>
                      + Add Node
                    </button>
                  </div>
                  <div className="prompt-node-canvas">
                    {normalizePromptGraphNodes(draftVariant.nodes).map((node) => (
                      <div
                        className={`prompt-node-card${!node.enabled ? " node-disabled" : ""}`}
                        key={node.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (!draggingNodeId) return;
                          updateDraftVariant((variant) => ({
                            ...variant,
                            nodes: moveNode(variant.nodes, draggingNodeId, node.id),
                          }));
                          setDraggingNodeId(null);
                        }}
                      >
                        <div
                          className="prompt-node-header"
                          onClick={() => toggleNodeCollapsed(node.id)}
                        >
                          <span
                            className="node-drag-handle"
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); setDraggingNodeId(node.id); }}
                            onDragEnd={() => setDraggingNodeId(null)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⠿
                          </span>
                          <span
                            className="node-type-dot"
                            style={{ background: nodeTypeDotColors[node.type] }}
                          />
                          <input
                            className="node-title-input"
                            value={node.title}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateNode(node.id, { title: e.target.value })}
                          />
                          <select
                            className="node-type-select"
                            value={node.type}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateNode(node.id, { type: e.target.value as PromptGraphNodeType })}
                          >
                            {nodeTypeOptions.map((type) => (
                              <option key={type} value={type}>
                                {promptGraphNodeTypeLabels[type]}
                              </option>
                            ))}
                          </select>
                          <label className="node-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              checked={node.enabled}
                              type="checkbox"
                              onChange={(e) => updateNode(node.id, { enabled: e.target.checked })}
                            />
                            On
                          </label>
                          <span className="node-collapse-icon">
                            {collapsedNodeIds.has(node.id) ? "›" : "⌄"}
                          </span>
                          <button
                            className="node-delete-btn"
                            onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                            title="Delete node"
                          >
                            ×
                          </button>
                        </div>
                        {!collapsedNodeIds.has(node.id) && (
                          <div className="node-editor-wrap">
                            <PromptNodeEditor
                              value={node.content}
                              onChange={(value) => updateNode(node.id, { content: value })}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </article>
          </div>

        </section>
      ) : null}
    </div>
  );
}
