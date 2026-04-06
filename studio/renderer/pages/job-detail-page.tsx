import { useParams } from "react-router-dom";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, JsonBlock, LoadingCopy, PageHeader, StatusPill } from "../components/ui";

export function JobDetailPage() {
  const { jobId } = useParams();
  const { data: job, loading, error } = useAsyncData(
    () => (jobId ? studioClient.getJob(jobId) : Promise.resolve(null)),
    [jobId]
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Job detail"
        title={job?.jobType || "Job detail"}
        description="Inspect backend, schedule, retry policy, and payload for a tracked callback."
      />

      {loading ? <LoadingCopy message="Loading job detail..." /> : null}
      {error ? <p className="empty">Job detail issue: {error}</p> : null}
      {!loading && !error && !job ? <EmptyState message="This job could not be found." /> : null}

      {job ? (
        <>
          <section className="grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Metadata</p>
                  <h3>Execution state</h3>
                </div>
                <StatusPill value={job.status} />
              </div>
              <div className="meta-grid">
                <div className="definition-card">
                  <strong>Backend</strong>
                  <p>{job.backend}</p>
                </div>
                <div className="definition-card">
                  <strong>Execute at</strong>
                  <p>{new Date(job.executeAt).toLocaleString()}</p>
                </div>
                <div className="definition-card">
                  <strong>Created</strong>
                  <p>{new Date(job.createdAt).toLocaleString()}</p>
                </div>
                <div className="definition-card">
                  <strong>Updated</strong>
                  <p>{new Date(job.updatedAt).toLocaleString()}</p>
                </div>
              </div>
              {job.lastError ? <p className="empty">Last error: {job.lastError}</p> : null}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Retry policy</p>
                  <h3>Resilience configuration</h3>
                </div>
              </div>
              {job.retryPolicy ? (
                <div className="meta-grid">
                  <div className="definition-card">
                    <strong>Max attempts</strong>
                    <p>{job.retryPolicy.maxAttempts}</p>
                  </div>
                  <div className="definition-card">
                    <strong>Backoff seconds</strong>
                    <p>{job.retryPolicy.backoffSeconds}</p>
                  </div>
                  <div className="definition-card">
                    <strong>Dedupe key</strong>
                    <p>{job.dedupeKey ?? "None"}</p>
                  </div>
                </div>
              ) : (
                <EmptyState message="No retry policy is configured for this job." />
              )}
            </article>
          </section>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Payload</p>
                <h3>Job input</h3>
              </div>
            </div>
            <JsonBlock value={job.payload} />
          </article>
        </>
      ) : null}
    </div>
  );
}
