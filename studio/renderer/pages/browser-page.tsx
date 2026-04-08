import { useEffect, useMemo, useState } from "react";
import type { McpToolDescriptor } from "../../../src/studio/types";
import { studioClient } from "../client";
import { CompactListRow, EmptyState, JsonBlock, LoadingCopy, LiveTimestamp, PageHeader, StatusPill } from "../components/ui";
import { useShellContext } from "../context";
import { useAsyncData } from "../hooks/use-async-data";
import { listMcpSessionHistory, recordMcpSessionHistory } from "../mcp-session-history";
import type { McpSessionHistoryEntry } from "../mcp-session-history";
import {
  BROWSER_PROCESS_ID,
  BROWSER_TARGET_ID,
  type BrowserActionLogEntry,
  type BrowserToolName,
  createBrowserActionLogEntry,
  createBrowserHistorySeed,
  getBrowserEndpoint,
  getBrowserProcess,
  getBrowserTarget,
  parseBrowserScreenshotPreview,
  parseBrowserSnapshotPreview,
} from "../browser-console";

const TOOL_DISPLAY_ORDER: BrowserToolName[] = [
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_screenshot",
];

const TOOL_LABELS: Record<BrowserToolName, string> = {
  browser_navigate: "Navigate",
  browser_snapshot: "Snapshot",
  browser_click: "Click",
  browser_type: "Type",
  browser_screenshot: "Screenshot",
};

const TOOL_HINTS: Record<BrowserToolName, { description: string; example: string }> = {
  browser_navigate: {
    description: "Load a full URL in the active Chrome tab.",
    example: "https://example.com",
  },
  browser_snapshot: {
    description: "Read the active page title and the visible text on screen.",
    example: "Useful after navigation or after form interactions.",
  },
  browser_click: {
    description: "Click the first element that matches a CSS selector.",
    example: "button[type='submit']",
  },
  browser_type: {
    description: "Focus a field, place text into it, and emit input/change events.",
    example: "input[name='email']",
  },
  browser_screenshot: {
    description: "Capture the current visible tab as a PNG.",
    example: "Best after navigation or right before a click.",
  },
};

function asBrowserHistory(entries: McpSessionHistoryEntry[]) {
  return createBrowserHistorySeed(entries).slice(0, 20);
}

function getToolDescription(toolName: BrowserToolName, tools: McpToolDescriptor[] | null) {
  return tools?.find((tool) => tool.name === toolName)?.description ?? TOOL_HINTS[toolName].description;
}

function renderInlineStatus(value: "connected" | "disconnected" | "running" | "stopped") {
  if (value === "connected" || value === "running") {
    return <span className="status ready">{value}</span>;
  }

  return <span className="status offline">{value}</span>;
}

export function BrowserPage() {
  const { refreshSnapshot } = useShellContext();
  const [navigateUrl, setNavigateUrl] = useState("https://example.com");
  const [clickSelector, setClickSelector] = useState("button");
  const [typeSelector, setTypeSelector] = useState("input[type='search']");
  const [typeText, setTypeText] = useState("Amanda was here");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [history, setHistory] = useState<BrowserActionLogEntry[]>(() => asBrowserHistory(listMcpSessionHistory()));

  const {
    data: targets,
    loading: targetsLoading,
    error: targetsError,
    reload: reloadTargets,
  } = useAsyncData(() => studioClient.listMcpTargets(), [], {
    pollMs: 10_000,
  });
  const browserTarget = getBrowserTarget(targets);
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    reload: reloadOverview,
  } = useAsyncData(
    () => (browserTarget ? studioClient.getMcpOverview(BROWSER_TARGET_ID) : Promise.resolve(null)),
    [browserTarget?.id],
    {
      pollMs: 5_000,
    }
  );
  const {
    data: tools,
    loading: toolsLoading,
    error: toolsError,
    reload: reloadTools,
  } = useAsyncData(
    () => (browserTarget ? studioClient.listMcpTools(BROWSER_TARGET_ID) : Promise.resolve([])),
    [browserTarget?.id],
    {
      pollMs: 10_000,
    }
  );
  const {
    data: processes,
    loading: processesLoading,
    error: processesError,
    reload: reloadProcesses,
  } = useAsyncData(() => studioClient.listProcesses(), [], {
    pollMs: 5_000,
  });

  const browserProcess = getBrowserProcess(processes);
  const toolNames = useMemo(() => new Set((tools ?? []).map((tool) => tool.name)), [tools]);
  const selectedEntry = history.find((entry) => entry.id === selectedEntryId) ?? history[0] ?? null;
  const lastSuccessfulEntry = history.find((entry) => entry.status === "ok") ?? null;
  const lastErrorEntry = history.find((entry) => entry.status === "error") ?? null;
  const screenshotPreview = selectedEntry?.result ? parseBrowserScreenshotPreview(selectedEntry.result) : null;
  const snapshotPreview = selectedEntry?.result ? parseBrowserSnapshotPreview(selectedEntry.result) : null;
  const browserEndpoint = getBrowserEndpoint(browserTarget);
  const browserReady = overview?.status.state === "ready";
  const extensionConnected = browserReady;
  const processRunning = Boolean(browserProcess?.running || browserProcess?.externallyRunning);

  useEffect(() => {
    if (!history.length) {
      if (selectedEntryId) setSelectedEntryId(null);
      return;
    }

    if (!selectedEntryId || !history.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(history[0]!.id);
    }
  }, [history, selectedEntryId]);

  async function refreshBrowserWorkspace() {
    reloadTargets();
    reloadOverview();
    reloadTools();
    reloadProcesses();
    await refreshSnapshot();
  }

  async function handleRefreshBrowserWorkspace() {
    try {
      setControlBusy("refresh");
      setActionError(null);
      await refreshBrowserWorkspace();
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to refresh browser status.");
    } finally {
      setControlBusy(null);
    }
  }

  function appendHistory(entry: BrowserActionLogEntry) {
    setHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 20));
    setSelectedEntryId(entry.id);
  }

  async function copyText(value: string, successMessage: string) {
    try {
      if (!globalThis.navigator?.clipboard) {
        throw new Error("Clipboard access is unavailable in this session.");
      }

      await globalThis.navigator.clipboard.writeText(value);
      setFeedbackMessage(successMessage);
      setActionError(null);
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to copy to the clipboard.");
    }
  }

  async function invokeBrowserTool(toolName: BrowserToolName, args: Record<string, unknown> = {}) {
    try {
      setActionBusy(toolName);
      setActionError(null);
      setFeedbackMessage(null);
      const result = await studioClient.invokeMcpTool(BROWSER_TARGET_ID, toolName, args);
      recordMcpSessionHistory(result);
      const nextEntry = createBrowserActionLogEntry({
        toolName,
        args,
        result,
      });
      appendHistory(nextEntry);
      await refreshBrowserWorkspace();
    } catch (error: any) {
      const message = error?.message ?? "Browser action failed.";
      appendHistory(
        createBrowserActionLogEntry({
          toolName,
          args,
          errorMessage: message,
        })
      );
      setActionError(message);
      await refreshBrowserWorkspace();
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleBrowserProcess() {
    try {
      setControlBusy(processRunning ? "stop" : "start");
      setActionError(null);
      setFeedbackMessage(null);

      if (processRunning && !browserProcess?.externallyRunning) {
        await studioClient.stopProcess(BROWSER_PROCESS_ID);
      } else if (!processRunning) {
        await studioClient.startProcess(BROWSER_PROCESS_ID);
      }

      await refreshBrowserWorkspace();
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to toggle the Browser MCP process.");
    } finally {
      setControlBusy(null);
    }
  }

  async function restartBrowserProcess() {
    try {
      if (browserProcess?.externallyRunning) {
        setFeedbackMessage("Browser MCP is managed externally. Refreshing status instead.");
        await refreshBrowserWorkspace();
        return;
      }

      setControlBusy("restart");
      setActionError(null);
      setFeedbackMessage(null);

      if (browserProcess?.running) {
        await studioClient.stopProcess(BROWSER_PROCESS_ID);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      await studioClient.startProcess(BROWSER_PROCESS_ID);
      await refreshBrowserWorkspace();
    } catch (error: any) {
      setActionError(error?.message ?? "Unable to restart the Browser MCP process.");
    } finally {
      setControlBusy(null);
    }
  }

  async function rerunEntry(entry: BrowserActionLogEntry | null) {
    if (!entry) return;
    await invokeBrowserTool(entry.toolName, entry.args);
  }

  const disconnectedHelp = !browserReady ? (
    <div className="browser-setup-note">
      <strong>{overview?.status.detail ?? "Browser control is not ready yet."}</strong>
      <p className="meta">
        Start the local MCP on port <code>3003</code>, then load the unpacked Ironline Browser
        extension from <code>/Users/amanda/Development/git/ironline-browser-mcp/extension</code> and
        keep a regular Chrome tab focused.
      </p>
    </div>
  ) : null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tools"
        title="Browser"
        description="Drive the local Browser MCP directly from Amanda: inspect readiness, control the managed process, and test browser navigation, selectors, snapshots, and screenshots without leaving Studio."
        actions={
          <div className="page-actions-inline">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleRefreshBrowserWorkspace()}
            >
              {controlBusy === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void restartBrowserProcess()}
              disabled={Boolean(controlBusy)}
            >
              {controlBusy === "restart" ? "Reloading..." : "Reload process"}
            </button>
          </div>
        }
      />

      <section className="grid two-up browser-console-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Status</p>
              <h3>Browser MCP readiness</h3>
            </div>
          </div>

          <div className="stats-grid browser-stats-grid">
            <div className="stat-card">
              <strong>{overview?.status.state ?? "unknown"}</strong>
              <span>mcp readiness</span>
            </div>
            <div className="stat-card">
              <strong>{extensionConnected ? "attached" : "detached"}</strong>
              <span>extension</span>
            </div>
            <div className="stat-card">
              <strong>{processRunning ? "running" : "stopped"}</strong>
              <span>process</span>
            </div>
          </div>

          <div className="browser-control-row">
            <button
              type="button"
              onClick={() => void toggleBrowserProcess()}
              disabled={Boolean(controlBusy) || browserProcess?.externallyRunning}
            >
              {controlBusy === "start"
                ? "Starting..."
                : controlBusy === "stop"
                ? "Stopping..."
                : processRunning
                ? "Stop Browser MCP"
                : "Start Browser MCP"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleRefreshBrowserWorkspace()}
              disabled={Boolean(controlBusy)}
            >
              Refresh status
            </button>
          </div>

          <div className="compact-list browser-status-list">
            <CompactListRow
              title="Endpoint"
              meta={browserEndpoint}
              action={
                <button
                  className="link-button"
                  type="button"
                  onClick={() => void copyText(browserEndpoint, "Copied Browser MCP endpoint.")}
                >
                  Copy
                </button>
              }
            />
            <CompactListRow
              title="Process id"
              meta={BROWSER_PROCESS_ID}
              status={
                browserProcess?.externallyRunning
                  ? <span className="status placeholder">external</span>
                  : renderInlineStatus(processRunning ? "running" : "stopped")
              }
            />
            <CompactListRow
              title="Extension bridge"
              meta={overview?.status.detail ?? "Waiting for readiness data..."}
              status={renderInlineStatus(extensionConnected ? "connected" : "disconnected")}
            />
            {lastSuccessfulEntry ? (
              <CompactListRow
                title="Last success"
                meta={lastSuccessfulEntry.summary}
                time={lastSuccessfulEntry.createdAt}
              />
            ) : null}
            {lastErrorEntry ? (
              <CompactListRow
                title="Recent error"
                meta={lastErrorEntry.errorMessage ?? lastErrorEntry.summary}
                status={<span className="status offline">error</span>}
                time={lastErrorEntry.createdAt}
              />
            ) : null}
          </div>

          {feedbackMessage ? <p className="meta">{feedbackMessage}</p> : null}
          {actionError ? <p className="empty">Browser issue: {actionError}</p> : null}
          {targetsLoading || overviewLoading || processesLoading ? (
            <LoadingCopy message="Refreshing browser readiness..." />
          ) : null}
          {targetsError ? <p className="empty">Browser target issue: {targetsError}</p> : null}
          {overviewError ? <p className="empty">Browser overview issue: {overviewError}</p> : null}
          {processesError ? <p className="empty">Browser process issue: {processesError}</p> : null}
          {disconnectedHelp}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Action Console</p>
              <h3>Common browser controls</h3>
            </div>
          </div>

          <div className="browser-utility-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void copyText(clickSelector, "Copied click selector.")}
              disabled={!clickSelector}
            >
              Copy click selector
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void copyText(typeSelector, "Copied type selector.")}
              disabled={!typeSelector}
            >
              Copy type selector
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setNavigateUrl("https://example.com");
                setClickSelector("button");
                setTypeSelector("input[type='search']");
                setTypeText("Amanda was here");
                setFeedbackMessage("Reset the browser console inputs.");
              }}
            >
              Clear fields
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void rerunEntry(lastErrorEntry)}
              disabled={!lastErrorEntry || Boolean(actionBusy)}
            >
              Retry last error
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void rerunEntry(lastSuccessfulEntry)}
              disabled={!lastSuccessfulEntry || Boolean(actionBusy)}
            >
              Rerun last action
            </button>
          </div>

          <div className="browser-action-grid">
            <form
              className="browser-tool-card"
              onSubmit={(event) => {
                event.preventDefault();
                void invokeBrowserTool("browser_navigate", { url: navigateUrl });
              }}
            >
              <div className="browser-tool-header">
                <div>
                  <p className="eyebrow">Navigate</p>
                  <h4>{TOOL_LABELS.browser_navigate}</h4>
                </div>
                <StatusPill value={toolNames.has("browser_navigate") ? "ready" : "degraded"} />
              </div>
              <p className="browser-tool-copy">{getToolDescription("browser_navigate", tools)}</p>
              <label>
                URL
                <input
                  type="url"
                  value={navigateUrl}
                  onChange={(event) => setNavigateUrl(event.target.value)}
                  placeholder={TOOL_HINTS.browser_navigate.example}
                />
              </label>
              <p className="browser-tool-hint">Example: {TOOL_HINTS.browser_navigate.example}</p>
              <div className="browser-tool-actions">
                <button
                  type="submit"
                  disabled={!browserReady || !toolNames.has("browser_navigate") || actionBusy !== null}
                >
                  {actionBusy === "browser_navigate" ? "Opening..." : "Open page"}
                </button>
              </div>
            </form>

            <div className="browser-tool-card">
              <div className="browser-tool-header">
                <div>
                  <p className="eyebrow">Inspect</p>
                  <h4>{TOOL_LABELS.browser_snapshot}</h4>
                </div>
                <StatusPill value={toolNames.has("browser_snapshot") ? "ready" : "degraded"} />
              </div>
              <p className="browser-tool-copy">{getToolDescription("browser_snapshot", tools)}</p>
              <p className="browser-tool-hint">{TOOL_HINTS.browser_snapshot.example}</p>
              <div className="browser-tool-actions">
                <button
                  type="button"
                  onClick={() => void invokeBrowserTool("browser_snapshot")}
                  disabled={!browserReady || !toolNames.has("browser_snapshot") || actionBusy !== null}
                >
                  {actionBusy === "browser_snapshot" ? "Inspecting..." : "Capture snapshot"}
                </button>
              </div>
            </div>

            <form
              className="browser-tool-card"
              onSubmit={(event) => {
                event.preventDefault();
                void invokeBrowserTool("browser_click", { selector: clickSelector });
              }}
            >
              <div className="browser-tool-header">
                <div>
                  <p className="eyebrow">Interact</p>
                  <h4>{TOOL_LABELS.browser_click}</h4>
                </div>
                <StatusPill value={toolNames.has("browser_click") ? "ready" : "degraded"} />
              </div>
              <p className="browser-tool-copy">{getToolDescription("browser_click", tools)}</p>
              <label>
                CSS selector
                <input
                  value={clickSelector}
                  onChange={(event) => setClickSelector(event.target.value)}
                  placeholder={TOOL_HINTS.browser_click.example}
                />
              </label>
              <p className="browser-tool-hint">Example: {TOOL_HINTS.browser_click.example}</p>
              <div className="browser-tool-actions">
                <button
                  type="submit"
                  disabled={!browserReady || !toolNames.has("browser_click") || actionBusy !== null}
                >
                  {actionBusy === "browser_click" ? "Clicking..." : "Click selector"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setTypeSelector(clickSelector)}
                >
                  Use for typing
                </button>
              </div>
            </form>

            <form
              className="browser-tool-card"
              onSubmit={(event) => {
                event.preventDefault();
                void invokeBrowserTool("browser_type", {
                  selector: typeSelector,
                  text: typeText,
                });
              }}
            >
              <div className="browser-tool-header">
                <div>
                  <p className="eyebrow">Fill</p>
                  <h4>{TOOL_LABELS.browser_type}</h4>
                </div>
                <StatusPill value={toolNames.has("browser_type") ? "ready" : "degraded"} />
              </div>
              <p className="browser-tool-copy">{getToolDescription("browser_type", tools)}</p>
              <label>
                CSS selector
                <input
                  value={typeSelector}
                  onChange={(event) => setTypeSelector(event.target.value)}
                  placeholder={TOOL_HINTS.browser_type.example}
                />
              </label>
              <label>
                Text
                <input value={typeText} onChange={(event) => setTypeText(event.target.value)} placeholder="Search, sign in, or form text" />
              </label>
              <p className="browser-tool-hint">Example selector: {TOOL_HINTS.browser_type.example}</p>
              <div className="browser-tool-actions">
                <button
                  type="submit"
                  disabled={!browserReady || !toolNames.has("browser_type") || actionBusy !== null}
                >
                  {actionBusy === "browser_type" ? "Typing..." : "Type text"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setClickSelector(typeSelector)}
                >
                  Use for clicking
                </button>
              </div>
            </form>

            <div className="browser-tool-card">
              <div className="browser-tool-header">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h4>{TOOL_LABELS.browser_screenshot}</h4>
                </div>
                <StatusPill value={toolNames.has("browser_screenshot") ? "ready" : "degraded"} />
              </div>
              <p className="browser-tool-copy">{getToolDescription("browser_screenshot", tools)}</p>
              <p className="browser-tool-hint">{TOOL_HINTS.browser_screenshot.example}</p>
              <div className="browser-tool-actions">
                <button
                  type="button"
                  onClick={() => void invokeBrowserTool("browser_screenshot")}
                  disabled={!browserReady || !toolNames.has("browser_screenshot") || actionBusy !== null}
                >
                  {actionBusy === "browser_screenshot" ? "Capturing..." : "Take screenshot"}
                </button>
              </div>
            </div>
          </div>

          {toolsLoading ? <LoadingCopy message="Loading browser tools..." /> : null}
          {toolsError ? <p className="empty">Browser tool issue: {toolsError}</p> : null}
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Results</p>
            <h3>Latest previews and recent action log</h3>
          </div>
          {selectedEntry ? (
            <div className="browser-selection-meta">
              <StatusPill value={selectedEntry.status === "ok" ? "ready" : "offline"} />
              <LiveTimestamp value={selectedEntry.createdAt} />
            </div>
          ) : null}
        </div>

        {!selectedEntry ? <EmptyState message="Run a browser action to see previews and raw MCP output here." /> : null}

        {selectedEntry ? (
          <div className="browser-results-layout">
            <div className="browser-preview-stack">
              <div className="definition-card browser-result-summary">
                <div className="panel-row">
                  <strong>{selectedEntry.summary}</strong>
                  <small>{TOOL_LABELS[selectedEntry.toolName]}</small>
                </div>
                {selectedEntry.errorMessage ? <p>{selectedEntry.errorMessage}</p> : null}
              </div>

              {screenshotPreview ? (
                <div className="browser-screenshot-shell">
                  <img
                    className="browser-screenshot-preview"
                    src={screenshotPreview.src}
                    alt="Latest browser screenshot"
                  />
                </div>
              ) : null}

              {snapshotPreview ? (
                <div className="browser-snapshot-shell">
                  <div className="panel-row">
                    <strong>{snapshotPreview.title || "Untitled page"}</strong>
                    {snapshotPreview.truncated ? <small>Preview truncated at 20,000 chars</small> : null}
                  </div>
                  <pre className="browser-snapshot-text">{snapshotPreview.text || "No visible text returned."}</pre>
                </div>
              ) : null}

              {!screenshotPreview && !snapshotPreview && selectedEntry.result ? (
                <div className="definition-card">
                  <p>{selectedEntry.summary}</p>
                  <span>Use the raw JSON panel below for the full MCP payload.</span>
                </div>
              ) : null}

              <details className="browser-debug-panel">
                <summary>Raw MCP JSON</summary>
                <JsonBlock
                  value={
                    selectedEntry.result?.rawResponse ?? {
                      error: selectedEntry.errorMessage,
                      toolName: selectedEntry.toolName,
                      args: selectedEntry.args,
                    }
                  }
                />
              </details>
            </div>

            <div className="browser-history-stack">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">History</p>
                  <h3>Recent browser actions</h3>
                </div>
              </div>

              <div className="compact-list">
                {history.length ? (
                  history.map((entry) => (
                    <button
                      className={`browser-history-button${selectedEntryId === entry.id ? " active" : ""}`}
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <CompactListRow
                        title={entry.summary}
                        meta={TOOL_LABELS[entry.toolName]}
                        status={
                          entry.status === "ok" ? (
                            <span className="status ready">ok</span>
                          ) : (
                            <span className="status offline">error</span>
                          )
                        }
                        time={entry.createdAt}
                      />
                    </button>
                  ))
                ) : (
                  <EmptyState message="No browser actions have been run in this Studio session yet." />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
