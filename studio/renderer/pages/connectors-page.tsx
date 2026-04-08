import { useShellContext } from "../context";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, LoadingCopy, PageHeader, StatusPill } from "../components/ui";

export function ConnectorsPage() {
  const { refreshSnapshot } = useShellContext();
  const {
    data: connectors,
    loading: connectorsLoading,
    error: connectorsError,
    reload: reloadConnectors,
  } = useAsyncData(() => studioClient.listConnectors(), []);
  const {
    data: processes,
    loading: processesLoading,
    error: processesError,
    reload: reloadProcesses,
  } = useAsyncData(() => studioClient.listProcesses(), []);

  async function toggleProcess(id: string, running: boolean) {
    if (running) {
      await studioClient.stopProcess(id);
    } else {
      await studioClient.startProcess(id);
    }

    reloadProcesses();
    reloadConnectors();
    await refreshSnapshot();
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Connectors"
        title="Connectors and managed services"
        description="Inspect connector health and local managed services here, then use the MCPs page for deeper tool, prompt, and resource testing."
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Connector health</p>
              <h3>Capabilities and status</h3>
            </div>
          </div>
          <div className="list">
            {connectorsLoading ? <LoadingCopy message="Loading connectors..." /> : null}
            {connectorsError ? <p className="empty">Connector issue: {connectorsError}</p> : null}
            {!connectorsLoading && !connectorsError && !connectors?.length ? (
              <EmptyState message="No connectors are configured yet." />
            ) : null}
            {connectors?.map((connector) => (
              <div key={connector.id} className="connector-card">
                <div className="panel-row">
                  <strong>{connector.label}</strong>
                  <StatusPill value={connector.status.state} />
                </div>
                <small>{connector.id}</small>
                <p>{connector.status.detail}</p>
                <span>{connector.capabilities.join(", ") || "No capabilities declared."}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Processes</p>
              <h3>Managed local services</h3>
            </div>
          </div>
          <div className="list">
            {processesLoading ? <LoadingCopy message="Loading managed processes..." /> : null}
            {processesError ? <p className="empty">Process issue: {processesError}</p> : null}
            {!processesLoading && !processesError && !processes?.length ? (
              <EmptyState message="No managed processes are available." />
            ) : null}
            {processes?.map((process) => (
              <div key={process.id} className="connector-card">
                <div className="process-header">
                  <strong>{process.id}</strong>
                  {process.externallyRunning ? (
                    <span className="process-external-note">Managed by LaunchAgent</span>
                  ) : (
                    <button onClick={() => void toggleProcess(process.id, process.running)}>
                      {process.running ? "Stop" : "Start"}
                    </button>
                  )}
                </div>
                <StatusPill value={process.running ? "ready" : process.externallyRunning ? "external" : "offline"} />
                <small>{process.command}</small>
                <p>{process.cwd}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
