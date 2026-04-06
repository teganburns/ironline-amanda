import { useEffect, useMemo, useState } from "react";
import type { McpInvocationResult } from "../../../src/studio/types";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { listMcpSessionHistory, recordMcpSessionHistory } from "../mcp-session-history";
import { EmptyState, JsonBlock, LoadingCopy, PageHeader, StatusPill } from "../components/ui";

function parseJsonInput(source: string): Record<string, unknown> {
  if (!source.trim()) return {};
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function McpsPage() {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string>("");
  const [selectedPromptName, setSelectedPromptName] = useState<string>("");
  const [toolArgsInput, setToolArgsInput] = useState("{\n  \n}");
  const [promptArgsInput, setPromptArgsInput] = useState("{\n  \n}");
  const [lastResult, setLastResult] = useState<McpInvocationResult | null>(null);
  const [history, setHistory] = useState(() => listMcpSessionHistory());
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    data: targets,
    loading: targetsLoading,
    error: targetsError,
  } = useAsyncData(() => studioClient.listMcpTargets(), []);
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    reload: reloadOverview,
  } = useAsyncData(
    () => (selectedTargetId ? studioClient.getMcpOverview(selectedTargetId) : Promise.resolve(null)),
    [selectedTargetId]
  );
  const {
    data: tools,
    loading: toolsLoading,
    error: toolsError,
    reload: reloadTools,
  } = useAsyncData(
    () => (selectedTargetId ? studioClient.listMcpTools(selectedTargetId) : Promise.resolve([])),
    [selectedTargetId]
  );
  const {
    data: resources,
    loading: resourcesLoading,
    error: resourcesError,
    reload: reloadResources,
  } = useAsyncData(
    () => (selectedTargetId ? studioClient.listMcpResources(selectedTargetId) : Promise.resolve([])),
    [selectedTargetId]
  );
  const {
    data: prompts,
    loading: promptsLoading,
    error: promptsError,
    reload: reloadPrompts,
  } = useAsyncData(
    () => (selectedTargetId ? studioClient.listMcpPrompts(selectedTargetId) : Promise.resolve([])),
    [selectedTargetId]
  );

  useEffect(() => {
    if (!selectedTargetId && targets?.length) {
      setSelectedTargetId(targets[0]!.id);
    }
  }, [selectedTargetId, targets]);

  useEffect(() => {
    if (tools?.length && !tools.some((tool) => tool.name === selectedToolName)) {
      setSelectedToolName(tools[0]!.name);
    }
  }, [selectedToolName, tools]);

  useEffect(() => {
    if (prompts?.length && !prompts.some((prompt) => prompt.name === selectedPromptName)) {
      setSelectedPromptName(prompts[0]!.name);
    }
  }, [prompts, selectedPromptName]);

  const selectedTool = useMemo(
    () => tools?.find((tool) => tool.name === selectedToolName) ?? null,
    [selectedToolName, tools]
  );
  const selectedPrompt = useMemo(
    () => prompts?.find((prompt) => prompt.name === selectedPromptName) ?? null,
    [prompts, selectedPromptName]
  );

  async function refreshTargetData() {
    reloadOverview();
    reloadTools();
    reloadResources();
    reloadPrompts();
  }

  async function invokeTool() {
    if (!selectedTargetId || !selectedToolName) return;

    try {
      setActionBusy(`tool:${selectedToolName}`);
      setActionError(null);
      const result = await studioClient.invokeMcpTool(selectedTargetId, selectedToolName, parseJsonInput(toolArgsInput));
      setLastResult(result);
      recordMcpSessionHistory(result);
      setHistory(listMcpSessionHistory());
      await refreshTargetData();
    } catch (error: any) {
      setActionError(error?.message ?? "Tool invocation failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function fetchPrompt() {
    if (!selectedTargetId || !selectedPromptName) return;

    try {
      setActionBusy(`prompt:${selectedPromptName}`);
      setActionError(null);
      const result = await studioClient.getMcpPrompt(
        selectedTargetId,
        selectedPromptName,
        parseJsonInput(promptArgsInput)
      );
      setLastResult(result);
      recordMcpSessionHistory(result);
      setHistory(listMcpSessionHistory());
    } catch (error: any) {
      setActionError(error?.message ?? "Prompt fetch failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function readResource(uri: string) {
    if (!selectedTargetId) return;

    try {
      setActionBusy(`resource:${uri}`);
      setActionError(null);
      const result = await studioClient.readMcpResource(selectedTargetId, uri);
      setLastResult(result);
      recordMcpSessionHistory(result);
      setHistory(listMcpSessionHistory());
    } catch (error: any) {
      setActionError(error?.message ?? "Resource read failed.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="MCPs"
        title="Amanda MCP workspace"
        description="Inspect Amanda's iMessage and LanceDB MCP servers, both remote and local, then test tools, prompts, and resources without exposing credentials to the renderer."
        actions={<button onClick={() => void refreshTargetData()}>{overviewLoading ? "Refreshing..." : "Refresh MCP Data"}</button>}
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Targets</p>
              <h3>Available MCP endpoints</h3>
            </div>
          </div>
          <div className="list">
            {targetsLoading ? <LoadingCopy message="Loading MCP targets..." /> : null}
            {targetsError ? <p className="empty">MCP target issue: {targetsError}</p> : null}
            {!targetsLoading && !targetsError && !targets?.length ? (
              <EmptyState message="No MCP targets are configured." />
            ) : null}
            {targets?.map((target) => (
              <button
                className={`graph-variant-card${selectedTargetId === target.id ? " active" : ""}`}
                key={target.id}
                onClick={() => {
                  setSelectedTargetId(target.id);
                  setLastResult(null);
                  setActionError(null);
                }}
              >
                <div className="panel-row">
                  <strong>{target.label}</strong>
                  <small>{target.kind}</small>
                </div>
                <small>{target.baseUrl ?? "Endpoint not configured"}</small>
                <span>{target.capabilities.join(", ")}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Overview</p>
              <h3>Target status and server capabilities</h3>
            </div>
          </div>
          {overviewLoading ? <LoadingCopy message="Loading MCP overview..." /> : null}
          {overviewError ? <p className="empty">MCP overview issue: {overviewError}</p> : null}
          {!overviewLoading && !overviewError && !overview ? (
            <EmptyState message="Choose an MCP target to inspect it." />
          ) : null}
          {overview ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <strong>{overview.configured ? "Yes" : "No"}</strong>
                  <span>configured</span>
                </div>
                <div className="stat-card">
                  <strong>{overview.authConfigured ? "Yes" : "No"}</strong>
                  <span>auth configured</span>
                </div>
                <div className="stat-card">
                  <strong>{overview.failedStage ?? "ready"}</strong>
                  <span>readiness stage</span>
                </div>
              </div>
              <div className="definition-card">
                <div className="panel-row">
                  <strong>{overview.target.label}</strong>
                  <StatusPill value={overview.status.state} />
                </div>
                <small>{overview.target.baseUrl ?? "Endpoint not configured"}</small>
                <p>{overview.status.detail}</p>
                <span>
                  {overview.serverVersion?.name ?? "Unknown server"} {overview.serverVersion?.version ?? ""}
                </span>
              </div>
              <JsonBlock
                value={{
                  configured: overview.configured,
                  auth: overview.target.auth,
                  requiredTools: overview.target.requiredTools,
                  availableTools: overview.availableTools,
                  missingRequiredTools: overview.missingRequiredTools,
                  failedStage: overview.failedStage,
                  instructions: overview.instructions,
                  serverCapabilities: overview.serverCapabilities,
                }}
              />
            </>
          ) : null}
        </article>
      </section>

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Tools</p>
              <h3>Inspect and invoke MCP tools</h3>
            </div>
          </div>
          <div className="list">
            {toolsLoading ? <LoadingCopy message="Loading tools..." /> : null}
            {toolsError ? <p className="empty">Tool list issue: {toolsError}</p> : null}
            {!toolsLoading && !toolsError && !tools?.length ? <EmptyState message="No tools exposed by this target." /> : null}
            {tools?.map((tool) => (
              <button
                className={`graph-variant-card${selectedToolName === tool.name ? " active" : ""}`}
                key={tool.name}
                onClick={() => setSelectedToolName(tool.name)}
              >
                <div className="panel-row">
                  <strong>{tool.name}</strong>
                </div>
                <span>{tool.description ?? "No description provided."}</span>
              </button>
            ))}
          </div>
          {selectedTool ? (
            <div className="mcp-console">
              <div className="panel-row">
                <strong>{selectedTool.name}</strong>
                <button onClick={() => void invokeTool()}>
                  {actionBusy === `tool:${selectedTool.name}` ? "Running..." : "Invoke Tool"}
                </button>
              </div>
              <label>
                JSON args
                <textarea
                  className="json-input"
                  value={toolArgsInput}
                  onChange={(event) => setToolArgsInput(event.target.value)}
                />
              </label>
              <JsonBlock value={selectedTool.inputSchema ?? {}} />
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Resources</p>
              <h3>Read resource payloads</h3>
            </div>
          </div>
          <div className="list">
            {resourcesLoading ? <LoadingCopy message="Loading resources..." /> : null}
            {resourcesError ? <p className="empty">Resource issue: {resourcesError}</p> : null}
            {!resourcesLoading && !resourcesError && !resources?.length ? (
              <EmptyState message="No readable resources exposed by this target." />
            ) : null}
            {resources?.map((resource) => (
              <div className="connector-card" key={resource.uri}>
                <div className="panel-row">
                  <strong>{resource.name}</strong>
                  <button onClick={() => void readResource(resource.uri)}>
                    {actionBusy === `resource:${resource.uri}` ? "Reading..." : "Read"}
                  </button>
                </div>
                <small>{resource.uri}</small>
                <p>{resource.description ?? "No description provided."}</p>
                <span>{resource.mimeType ?? "Unknown MIME type"}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Prompts</p>
              <h3>Fetch MCP prompt output</h3>
            </div>
          </div>
          <div className="list">
            {promptsLoading ? <LoadingCopy message="Loading prompts..." /> : null}
            {promptsError ? <p className="empty">Prompt issue: {promptsError}</p> : null}
            {!promptsLoading && !promptsError && !prompts?.length ? (
              <EmptyState message="No prompts exposed by this target." />
            ) : null}
            {prompts?.map((prompt) => (
              <button
                className={`graph-variant-card${selectedPromptName === prompt.name ? " active" : ""}`}
                key={prompt.name}
                onClick={() => setSelectedPromptName(prompt.name)}
              >
                <div className="panel-row">
                  <strong>{prompt.name}</strong>
                </div>
                <span>{prompt.description ?? "No description provided."}</span>
              </button>
            ))}
          </div>
          {selectedPrompt ? (
            <div className="mcp-console">
              <div className="panel-row">
                <strong>{selectedPrompt.name}</strong>
                <button onClick={() => void fetchPrompt()}>
                  {actionBusy === `prompt:${selectedPrompt.name}` ? "Fetching..." : "Get Prompt"}
                </button>
              </div>
              <label>
                JSON args
                <textarea
                  className="json-input"
                  value={promptArgsInput}
                  onChange={(event) => setPromptArgsInput(event.target.value)}
                />
              </label>
              <JsonBlock value={selectedPrompt.arguments ?? []} />
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Result</p>
              <h3>Last MCP response</h3>
            </div>
          </div>
          {actionError ? <p className="empty">Invocation issue: {actionError}</p> : null}
          {lastResult ? (
            <>
              <div className="definition-card">
                <div className="panel-row">
                  <strong>{lastResult.summary}</strong>
                  <StatusPill value={lastResult.ok ? "ready" : "failed"} />
                </div>
                <span>{lastResult.actionType}</span>
              </div>
              <pre className="json">{lastResult.formattedJson}</pre>
            </>
          ) : (
            <EmptyState message="Read a resource, fetch a prompt, or invoke a tool to inspect the raw MCP response here." />
          )}
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Session history</p>
            <h3>Recent MCP invocations</h3>
          </div>
        </div>
        <div className="list">
          {!history.length ? <EmptyState message="No MCP calls have been made in this app session yet." /> : null}
          {history.map((entry) => (
            <div className="run-card" key={entry.id}>
              <div className="panel-row">
                <strong>{entry.summary}</strong>
                <StatusPill value={entry.actionType === "tool" ? "ready" : "placeholder"} />
              </div>
              <small>
                {entry.targetId} • {new Date(entry.createdAt).toLocaleString()}
              </small>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
