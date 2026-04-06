import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShellContext } from "../context";
import { studioClient } from "../client";
import { defaultJob } from "../defaults";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, JsonBlock, LoadingCopy, PageHeader, StatusPill } from "../components/ui";

export function JobsPage() {
  const navigate = useNavigate();
  const { refreshSnapshot } = useShellContext();
  const [jobSpec, setJobSpec] = useState(defaultJob);
  const [submitting, setSubmitting] = useState(false);
  const { data: jobs, loading, error, reload } = useAsyncData(() => studioClient.listJobs(40), []);

  async function submitJob() {
    try {
      setSubmitting(true);
      const job = await studioClient.scheduleCallback(jobSpec);
      await refreshSnapshot();
      reload();
      navigate(`/jobs/${job.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Jobs"
        title="Scheduled callback workspace"
        description="Queue follow-up work, inspect job state, and review retry policy metadata."
        actions={<button onClick={submitJob}>{submitting ? "Scheduling..." : "Schedule job"}</button>}
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Schedule</p>
              <h3>New callback</h3>
            </div>
          </div>
          <label>
            Execute at
            <input
              type="datetime-local"
              value={jobSpec.executeAt.slice(0, 16)}
              onChange={(event) =>
                setJobSpec({
                  ...jobSpec,
                  executeAt: new Date(event.target.value).toISOString(),
                })
              }
            />
          </label>
          <label>
            Payload input
            <textarea
              value={String(jobSpec.payload.input ?? "")}
              onChange={(event) =>
                setJobSpec({
                  ...jobSpec,
                  payload: {
                    ...jobSpec.payload,
                    input: event.target.value,
                  },
                })
              }
            />
          </label>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Summary</p>
              <h3>Job lane status</h3>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{jobs?.length ?? 0}</strong>
              <span>jobs in view</span>
            </div>
            <div className="stat-card">
              <strong>{jobs?.filter((job) => job.backend === "temporal").length ?? 0}</strong>
              <span>via Temporal</span>
            </div>
            <div className="stat-card">
              <strong>{jobs?.filter((job) => job.status === "scheduled").length ?? 0}</strong>
              <span>scheduled</span>
            </div>
          </div>
          <JsonBlock value={jobSpec} />
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Tracked jobs</p>
            <h3>Current queue</h3>
          </div>
        </div>
        <div className="list">
          {loading ? <LoadingCopy message="Loading jobs..." /> : null}
          {error ? <p className="empty">Jobs issue: {error}</p> : null}
          {!loading && !error && !jobs?.length ? <EmptyState message="No jobs are tracked yet." /> : null}
          {jobs?.map((job) => (
            <Link className="job-card card-link" key={job.id} to={`/jobs/${job.id}`}>
              <div className="panel-row">
                <strong>{job.jobType}</strong>
                <StatusPill value={job.status} />
              </div>
              <span>{job.backend}</span>
              <small>{new Date(job.executeAt).toLocaleString()}</small>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
