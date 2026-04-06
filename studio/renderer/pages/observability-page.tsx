import { Link } from "react-router-dom";
import { useShellContext } from "../context";
import { useAsyncData } from "../hooks/use-async-data";
import { studioClient } from "../client";
import { JsonBlock, PageHeader, StatusPill } from "../components/ui";
import { buildLangfuseTraceUrl } from "../trace-utils";

export function ObservabilityPage() {
  const { snapshot } = useShellContext();
  const tracedRuns = snapshot.recentRuns.filter((run) => run.traceId);
  const { data: config } = useAsyncData(() => studioClient.getStudioConfig(), []);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Observability"
        title="Traces and raw studio state"
        description="Use this view for trace-oriented inspection now, with room for deeper Langfuse workflows later."
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trace pointers</p>
              <h3>Runs with Langfuse traces</h3>
            </div>
          </div>
          <div className="list">
            {tracedRuns.map((run) => (
              <div key={run.id} className="run-card">
                <div className="panel-row">
                  <Link className="quick-link" to={`/runs/${run.id}`}>
                    {run.request.input || "Untitled run"}
                  </Link>
                  <StatusPill value={run.promptSource?.sourceMode ?? "placeholder"} />
                </div>
                <small>{run.traceId}</small>
                <div className="quick-links">
                  {run.promptSource ? (
                    <Link className="quick-link subtle-link" to={`/agent?variant=${run.promptSource.variantId}`}>
                      {run.promptSource.variantName}
                    </Link>
                  ) : null}
                  {buildLangfuseTraceUrl(config?.langfuseBaseUrl, run.traceId) ? (
                    <a
                      className="quick-link subtle-link"
                      href={buildLangfuseTraceUrl(config?.langfuseBaseUrl, run.traceId)!}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open Langfuse trace
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Snapshot</p>
              <h3>Current overview payload</h3>
            </div>
          </div>
          <JsonBlock value={snapshot} />
        </article>
      </section>
    </div>
  );
}
