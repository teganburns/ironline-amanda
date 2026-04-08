import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShellContext } from "../context";
import { studioClient } from "../client";
import { createDefaultAgentRunJob, createDefaultReminderJob, defaultJob } from "../defaults";
import { useAsyncData } from "../hooks/use-async-data";
import { CompactListRow, EmptyState, JsonBlock, LoadingCopy, PageHeader } from "../components/ui";
import type { AgentRunJobPayload, JobSpec, ReminderJobPayload } from "../../../src/studio/types";

function isReminderJob(jobSpec: JobSpec): jobSpec is JobSpec & { payload: ReminderJobPayload } {
  return jobSpec.jobType === "reminder.send";
}

function getAgentRunPayload(jobSpec: JobSpec): AgentRunJobPayload {
  return jobSpec.payload as AgentRunJobPayload;
}

function getJobHeadline(job: JobSpec): string {
  if (isReminderJob(job)) return job.payload.messageText;
  return getAgentRunPayload(job).input || job.jobType;
}

export function JobsPage() {
  const navigate = useNavigate();
  const { refreshSnapshot } = useShellContext();
  const [jobSpec, setJobSpec] = useState<JobSpec>(defaultJob);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: jobs, loading, error, reload } = useAsyncData(() => studioClient.listJobs(40), [], {
    pollMs: 10_000,
  });

  async function submitJob() {
    try {
      setSubmitting(true);
      setSubmitError(null);
      const job = await studioClient.scheduleCallback(jobSpec);
      await refreshSnapshot();
      reload();
      navigate(`/jobs/${job.id}`);
    } catch (submitFailure) {
      setSubmitError(submitFailure instanceof Error ? submitFailure.message : String(submitFailure));
    } finally {
      setSubmitting(false);
    }
  }

  function switchJobType(nextJobType: JobSpec["jobType"]) {
    setSubmitError(null);
    setJobSpec(nextJobType === "reminder.send" ? createDefaultReminderJob() : createDefaultAgentRunJob());
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Jobs"
        title="Scheduled callback workspace"
        description="Queue one-time reminders or scheduled Amanda reruns, inspect job state, and review delivery outcomes."
        actions={<button onClick={submitJob}>{submitting ? "Scheduling..." : "Schedule job"}</button>}
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Schedule</p>
              <h3>New job</h3>
            </div>
          </div>

          <label>
            Job type
            <select value={jobSpec.jobType} onChange={(event) => switchJobType(event.target.value)}>
              <option value="reminder.send">Reminder</option>
              <option value="agent.run">Agent rerun</option>
            </select>
          </label>

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

          {isReminderJob(jobSpec) ? (
            <>
              <label>
                Reminder text
                <textarea
                  value={jobSpec.payload.messageText}
                  onChange={(event) =>
                    setJobSpec({
                      ...jobSpec,
                      payload: {
                        ...jobSpec.payload,
                        messageText: event.target.value,
                      },
                    })
                  }
                />
              </label>

              <label>
                Recipient override
                <input
                  value={jobSpec.payload.target.recipient ?? ""}
                  onChange={(event) =>
                    setJobSpec({
                      ...jobSpec,
                      payload: {
                        ...jobSpec.payload,
                        target: {
                          ...jobSpec.payload.target,
                          recipient: event.target.value || undefined,
                        },
                      },
                    })
                  }
                  placeholder="Defaults to the same sender/chat"
                />
              </label>

              <label>
                Target chat
                <input
                  value={jobSpec.payload.target.chatId ?? ""}
                  onChange={(event) =>
                    setJobSpec({
                      ...jobSpec,
                      payload: {
                        ...jobSpec.payload,
                        target: {
                          ...jobSpec.payload.target,
                          chatId: event.target.value || undefined,
                        },
                      },
                    })
                  }
                />
              </label>
            </>
          ) : (
            <label>
              Payload input
              <textarea
                value={getAgentRunPayload(jobSpec).input ?? ""}
                onChange={(event) =>
                  setJobSpec({
                    ...jobSpec,
                    payload: {
                      ...getAgentRunPayload(jobSpec),
                      input: event.target.value,
                    },
                  })
                }
              />
            </label>
          )}

          {submitError ? <p className="empty">Scheduling issue: {submitError}</p> : null}
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
              <strong>{jobs?.filter((job) => job.jobType === "reminder.send").length ?? 0}</strong>
              <span>reminders</span>
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
        <div className="compact-list">
          {loading ? <LoadingCopy message="Loading jobs..." /> : null}
          {error ? <p className="empty">Jobs issue: {error}</p> : null}
          {!loading && !error && !jobs?.length ? <EmptyState message="No jobs are tracked yet." /> : null}
          {jobs?.map((job) => (
            <CompactListRow
              key={job.id}
              title={
                <Link className="compact-row-link" to={`/jobs/${job.id}`}>
                  {getJobHeadline(job)}
                </Link>
              }
              meta={`${job.jobType === "reminder.send" ? "Reminder" : "Agent rerun"} • ${job.backend}`}
              status={job.status}
              time={job.executeAt}
            />
          ))}
        </div>
      </article>
    </div>
  );
}
