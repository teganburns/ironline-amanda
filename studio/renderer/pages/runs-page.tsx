import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RunRequest } from "../../../src/studio/types";
import { useShellContext } from "../context";
import { studioClient } from "../client";
import { defaultRunRequest } from "../defaults";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, LoadingCopy, PageHeader, StatusPill } from "../components/ui";

export function RunsPage() {
  const navigate = useNavigate();
  const { snapshot, refreshSnapshot } = useShellContext();
  const [runRequest, setRunRequest] = useState<RunRequest>(defaultRunRequest);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: runs, loading, error, reload } = useAsyncData(() => studioClient.listRuns(30), []);

  async function submitRun() {
    try {
      setSubmitting(true);
      setSubmitError(null);
      const result = await studioClient.runAgent(runRequest);
      await refreshSnapshot();
      reload();
      navigate(`/runs/${result.id}`);
    } catch (error: any) {
      setSubmitError(error?.message ?? "Amanda could not start this run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Runs"
        title="Manual execution workspace"
        description="Launch new runs, review recent history, and jump into detailed traces."
        actions={<button onClick={submitRun}>{submitting ? "Running..." : "Run Agent"}</button>}
      />

      {submitError ? <p className="empty">Run launch issue: {submitError}</p> : null}

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Compose</p>
              <h3>New run</h3>
            </div>
          </div>
          <label>
            Prompt
            <textarea
              value={runRequest.input}
              onChange={(event) => setRunRequest({ ...runRequest, input: event.target.value })}
              placeholder="Ask Amanda to do something"
            />
          </label>
          <div className="field-row">
            <label>
              Sender
              <input
                value={String(runRequest.context?.sender ?? "")}
                onChange={(event) =>
                  setRunRequest({
                    ...runRequest,
                    context: {
                      ...runRequest.context,
                      sender: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              Approval
              <select
                value={runRequest.approvalMode}
                onChange={(event) =>
                  setRunRequest({
                    ...runRequest,
                    approvalMode: event.target.value as RunRequest["approvalMode"],
                  })
                }
              >
                <option value="autonomous">Autonomous</option>
                <option value="suggest">Suggest</option>
                <option value="always_require">Always require</option>
              </select>
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Summary</p>
              <h3>Run lane status</h3>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{runs?.length ?? 0}</strong>
              <span>runs in view</span>
            </div>
            <div className="stat-card">
              <strong>{snapshot.recentRuns.filter((run) => run.traceId).length}</strong>
              <span>with traces</span>
            </div>
            <div className="stat-card">
              <strong>{snapshot.recentRuns.filter((run) => run.status === "failed").length}</strong>
              <span>failed recently</span>
            </div>
          </div>
          {snapshot.recentRuns[0] ? (
            <div className="definition-card">
              <strong>Latest run</strong>
              <span>{snapshot.recentRuns[0].request.input || "Untitled run"}</span>
              <p>{snapshot.recentRuns[0].traceId ?? "No Langfuse trace on the latest run."}</p>
              <Link className="quick-link subtle-link" to={`/runs/${snapshot.recentRuns[0].id}`}>
                Open latest run
              </Link>
            </div>
          ) : (
            <EmptyState message="No recent runs yet." />
          )}
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">History</p>
            <h3>Recent runs</h3>
          </div>
        </div>
        <div className="list">
          {loading ? <LoadingCopy /> : null}
          {error ? <p className="empty">Run history issue: {error}</p> : null}
          {!loading && !error && !runs?.length ? <EmptyState message="No runs available yet." /> : null}
          {runs?.map((run) => (
            <Link className="run-card card-link" key={run.id} to={`/runs/${run.id}`}>
              <div className="panel-row">
                <span>{run.request.input || "Untitled run"}</span>
                <StatusPill value={run.status} />
              </div>
              <small>{new Date(run.startedAt).toLocaleString()}</small>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
