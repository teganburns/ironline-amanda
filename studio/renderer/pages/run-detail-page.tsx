import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShellContext } from "../context";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, JsonBlock, LiveTimestamp, LoadingCopy, PageHeader, StatusPill } from "../components/ui";
import { buildLangfuseTraceUrl, findArtifact } from "../trace-utils";

export function RunDetailPage() {
  const navigate = useNavigate();
  const { runId } = useParams();
  const { refreshSnapshot } = useShellContext();
  const [replayError, setReplayError] = useState<string | null>(null);
  const { data: run, loading, error, reload } = useAsyncData(
    () => (runId ? studioClient.getRun(runId) : Promise.resolve(null)),
    [runId],
    { pollMs: 10_000 }
  );
  const { data: config } = useAsyncData(() => studioClient.getStudioConfig(), []);

  async function replayRun() {
    if (!run) return;
    try {
      setReplayError(null);
      const replayed = await studioClient.replayRun(run.id);
      await refreshSnapshot();
      reload();
      navigate(`/runs/${replayed.id}`);
    } catch (error: any) {
      setReplayError(error?.message ?? "Amanda could not replay this run.");
    }
  }

  const compiledPromptArtifact = run ? findArtifact(run.artifacts, "Compiled instructions") : null;
  const formattedInputArtifact = run ? findArtifact(run.artifacts, "Formatted agent input") : null;
  const traceLink = buildLangfuseTraceUrl(config?.langfuseBaseUrl, run?.traceId);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Run detail"
        title={run?.request.input || "Run detail"}
        description="Inspect the full output, trace metadata, tool activity, and timeline for a single execution."
        secondaryActions={
          run?.promptSource ? (
            <Link className="quick-link subtle-link" to={`/agent?variant=${run.promptSource.variantId}`}>
              Open source variant
            </Link>
          ) : undefined
        }
        actions={run ? <button onClick={replayRun}>Replay</button> : null}
      />

      {loading ? <LoadingCopy message="Loading run detail..." /> : null}
      {error ? <p className="empty">Run detail issue: {error}</p> : null}
      {replayError ? <p className="empty">Replay issue: {replayError}</p> : null}
      {!loading && !error && !run ? <EmptyState message="This run could not be found." /> : null}

      {run ? (
        <>
          <section className="grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Output</p>
                  <h3>Final result</h3>
                </div>
                <StatusPill value={run.status} />
              </div>
              <p className="meta">Trace: {run.traceId ?? "No Langfuse trace"}</p>
              <p className="output">{run.output ?? "No final output captured."}</p>
              <div className="quick-links">
                {traceLink ? (
                  <a className="quick-link subtle-link" href={traceLink} rel="noreferrer" target="_blank">
                    Open Langfuse trace
                  </a>
                ) : null}
              </div>
              {run.error ? <p className="empty">Error: {run.error}</p> : null}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Metadata</p>
                  <h3>Execution envelope</h3>
                </div>
              </div>
              <div className="meta-grid">
                <div className="definition-card">
                  <strong>Started</strong>
                  <p><LiveTimestamp value={run.startedAt} /></p>
                </div>
                <div className="definition-card">
                  <strong>Finished</strong>
                  <p><LiveTimestamp value={run.finishedAt} /></p>
                </div>
                <div className="definition-card">
                  <strong>Tool events</strong>
                  <p>{run.toolEvents.length}</p>
                </div>
                <div className="definition-card">
                  <strong>Artifacts</strong>
                  <p>{run.artifacts.length}</p>
                </div>
                <div className="definition-card">
                  <strong>Prompt variant</strong>
                  <p>{run.promptSource?.variantName ?? "Unknown"}</p>
                </div>
                <div className="definition-card">
                  <strong>Source mode</strong>
                  <p>{run.promptSource?.sourceMode ?? "Unknown"}</p>
                </div>
              </div>
              <JsonBlock value={run.request} />
            </article>
          </section>

          <section className="grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Prompt</p>
                  <h3>Compiled instructions</h3>
                </div>
              </div>
              {compiledPromptArtifact?.content ? (
                <pre className="json">{compiledPromptArtifact.content}</pre>
              ) : (
                <EmptyState message="No compiled instructions were captured for this run." />
              )}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Input</p>
                  <h3>Formatted agent input</h3>
                </div>
              </div>
              {formattedInputArtifact?.content ? (
                <pre className="json">{formattedInputArtifact.content}</pre>
              ) : (
                <EmptyState message="No formatted input artifact was captured for this run." />
              )}
            </article>
          </section>

          <section className="grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Tool events</p>
                  <h3>What the agent did</h3>
                </div>
              </div>
              <div className="list">
                {run.toolEvents.length ? (
                  run.toolEvents.map((event) => (
                    <div key={`${event.timestamp}-${event.name}`} className="timeline-event">
                      <div className="panel-row">
                        <strong>{event.name}</strong>
                        <StatusPill value={event.status} />
                      </div>
                      <span>{event.summary ?? "No summary captured."}</span>
                      <small><LiveTimestamp value={event.timestamp} /></small>
                    </div>
                  ))
                ) : (
                  <EmptyState message="No tool events captured for this run." />
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Artifacts</p>
                  <h3>Captured artifacts</h3>
                </div>
              </div>
              <div className="list">
                {run.artifacts.length ? (
                  run.artifacts.map((artifact, index) => (
                    <div key={`${artifact.kind}-${index}`} className="definition-card">
                      <strong>{artifact.label}</strong>
                      <span>{artifact.kind}</span>
                      <p>{artifact.content ?? artifact.uri ?? "No content captured."}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState message="No artifacts were captured for this run." />
                )}
              </div>
            </article>
          </section>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Timeline</p>
                <h3>Execution sequence</h3>
              </div>
            </div>
            <div className="timeline">
              {run.timeline.length ? (
                run.timeline.map((event) => (
                  <div key={`${event.timestamp}-${event.kind}`} className="timeline-event">
                    <div className="panel-row">
                      <strong>{event.kind}</strong>
                      <small>{event.source}</small>
                    </div>
                    <span>{event.summary}</span>
                    <small><LiveTimestamp value={event.timestamp} /></small>
                  </div>
                ))
              ) : (
                <EmptyState message="No timeline events captured for this run." />
              )}
            </div>
          </article>
        </>
      ) : null}
    </div>
  );
}
