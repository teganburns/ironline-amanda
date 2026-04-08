import { useParams } from "react-router-dom";
import { studioClient } from "../client";
import { useAsyncData } from "../hooks/use-async-data";
import { EmptyState, JsonBlock, LiveTimestamp, LoadingCopy, PageHeader, StatusPill } from "../components/ui";
import type { AgentRunJobPayload, JobRecord, ReminderJobPayload } from "../../../src/studio/types";

function isReminderJob(job: JobRecord): job is JobRecord & { payload: ReminderJobPayload } {
  return job.jobType === "reminder.send";
}

function getAgentRunPayload(job: JobRecord): AgentRunJobPayload {
  return job.payload as AgentRunJobPayload;
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const { data: job, loading, error } = useAsyncData(
    () => (jobId ? studioClient.getJob(jobId) : Promise.resolve(null)),
    [jobId],
    { pollMs: 10_000 }
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Job detail"
        title={job?.jobType === "reminder.send" ? "Reminder delivery" : job?.jobType || "Job detail"}
        description="Inspect backend, schedule, retry policy, payload, and delivery metadata for a tracked callback."
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
                  <p><LiveTimestamp value={job.executeAt} /></p>
                </div>
                <div className="definition-card">
                  <strong>Created</strong>
                  <p><LiveTimestamp value={job.createdAt} /></p>
                </div>
                <div className="definition-card">
                  <strong>Updated</strong>
                  <p><LiveTimestamp value={job.updatedAt} /></p>
                </div>
                {job.completedAt ? (
                  <div className="definition-card">
                    <strong>Completed</strong>
                    <p><LiveTimestamp value={job.completedAt} /></p>
                  </div>
                ) : null}
              </div>
              {job.lastError ? <p className="empty">Last error: {job.lastError}</p> : null}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{isReminderJob(job) ? "Reminder" : "Retry policy"}</p>
                  <h3>{isReminderJob(job) ? "Delivery details" : "Resilience configuration"}</h3>
                </div>
              </div>
              {isReminderJob(job) ? (
                <div className="meta-grid">
                  <div className="definition-card">
                    <strong>Message</strong>
                    <p>{job.payload.messageText}</p>
                  </div>
                  <div className="definition-card">
                    <strong>Target</strong>
                    <p>{job.payload.target.summary ?? job.payload.target.recipient ?? job.payload.target.chatId ?? "Current chat"}</p>
                  </div>
                  <div className="definition-card">
                    <strong>Requested time</strong>
                    <p>{job.payload.requestedTime}</p>
                  </div>
                  <div className="definition-card">
                    <strong>Delivery outcome</strong>
                    <p>{job.delivery?.ok ? job.delivery.targetSummary : job.failureDetail ?? "Pending delivery"}</p>
                  </div>
                </div>
              ) : job.retryPolicy ? (
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

          {!isReminderJob(job) ? (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Agent rerun</p>
                  <h3>Scheduled run payload</h3>
                </div>
              </div>
              <div className="definition-card">
                <strong>Input</strong>
                <p>{getAgentRunPayload(job).input}</p>
              </div>
            </article>
          ) : null}

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
