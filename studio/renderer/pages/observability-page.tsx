import { Link } from "react-router-dom";
import { useShellContext } from "../context";
import { useAsyncData } from "../hooks/use-async-data";
import { studioClient } from "../client";
import { CompactListRow, EmptyState, JsonBlock, PageHeader } from "../components/ui";
import { buildLangfuseTraceUrl } from "../trace-utils";
import { truncateMiddle } from "../time";

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
          <div className="compact-list">
            {!tracedRuns.length ? <EmptyState message="No Langfuse traces are available in the current run window." /> : null}
            {tracedRuns.map((run) => (
              <CompactListRow
                key={run.id}
                title={
                  <Link className="compact-row-link" to={`/runs/${run.id}`}>
                    {run.request.input || "Untitled run"}
                  </Link>
                }
                meta={`${run.promptSource?.variantName ?? "Unknown variant"} • ${run.traceId ? truncateMiddle(run.traceId) : "No trace id"}`}
                action={
                  buildLangfuseTraceUrl(config?.langfuseBaseUrl, run.traceId) ? (
                    <a
                      className="compact-row-link subtle-link"
                      href={buildLangfuseTraceUrl(config?.langfuseBaseUrl, run.traceId)!}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Langfuse
                    </a>
                  ) : null
                }
                status={run.promptSource?.sourceMode ?? "placeholder"}
                time={run.startedAt}
              />
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
