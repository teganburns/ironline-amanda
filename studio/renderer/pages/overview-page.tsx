import { Link } from "react-router-dom";
import { useShellContext } from "../context";
import { CompactListRow, EmptyState, PageHeader, StatusPill } from "../components/ui";

export function OverviewPage() {
  const { snapshot } = useShellContext();
  const readyConnectors = snapshot.connectors.filter((connector) => connector.status.state === "ready").length;
  const activeJobs = snapshot.jobs.filter((job) => job.status === "scheduled" || job.status === "running").length;

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-title">
          <p className="eyebrow">Local-first agent control</p>
          <h2>Amanda</h2>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Overview</p>
          <h3>One orchestration surface for Amanda, MCPs, Langfuse, and future channels.</h3>
        </div>
        <div className="hero-card">
          <span>{readyConnectors} connectors ready</span>
          <span>{activeJobs} active jobs</span>
          <span>{snapshot.recentRuns.length} recent runs</span>
        </div>
      </section>

      <PageHeader
        eyebrow="Overview"
        title="Operating picture"
        description="Quick status for runs, jobs, connectors, and the primary agent surface."
      />

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">At a glance</p>
              <h3>Studio status</h3>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{snapshot.agents.length}</strong>
              <span>agent definitions</span>
            </div>
            <div className="stat-card">
              <strong>{readyConnectors}</strong>
              <span>healthy connectors</span>
            </div>
            <div className="stat-card">
              <strong>{snapshot.approvalRules.length}</strong>
              <span>approval rules</span>
            </div>
          </div>
          <div className="quick-links">
            <Link className="quick-link" to="/runs">
              Open runs workspace
            </Link>
            <Link className="quick-link" to="/jobs">
              Open jobs workspace
            </Link>
            <Link className="quick-link" to="/observability">
              Review traces and raw state
            </Link>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Connectors</p>
              <h3>Health snapshot</h3>
            </div>
          </div>
          <div className="list">
            {snapshot.connectors.map((connector) => (
              <div key={connector.id} className="connector-card">
                <div className="panel-row">
                  <strong>{connector.label}</strong>
                  <StatusPill value={connector.status.state} />
                </div>
                <small>{connector.id}</small>
                <p>{connector.status.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two-up">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent runs</p>
              <h3>Latest executions</h3>
            </div>
            <Link className="quick-link subtle-link" to="/runs">
              View all
            </Link>
          </div>
          <div className="compact-list">
            {snapshot.recentRuns.length ? (
              snapshot.recentRuns.slice(0, 5).map((run) => (
                <CompactListRow
                  key={run.id}
                  title={
                    <Link className="compact-row-link" to={`/runs/${run.id}`}>
                      {run.request.input || "Untitled run"}
                    </Link>
                  }
                  meta={run.promptSource?.variantName ?? "Unknown variant"}
                  status={run.status}
                  time={run.startedAt}
                />
              ))
            ) : (
              <EmptyState message="No runs have been captured yet." />
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent jobs</p>
              <h3>Scheduled callbacks</h3>
            </div>
            <Link className="quick-link subtle-link" to="/jobs">
              View all
            </Link>
          </div>
          <div className="compact-list">
            {snapshot.jobs.length ? (
              snapshot.jobs.slice(0, 5).map((job) => (
                <CompactListRow
                  key={job.id}
                  title={
                    <Link className="compact-row-link" to={`/jobs/${job.id}`}>
                      {job.jobType === "reminder.send" && "messageText" in job.payload
                        ? job.payload.messageText
                        : job.jobType}
                    </Link>
                  }
                  meta={job.backend}
                  status={job.status}
                  time={job.executeAt}
                />
              ))
            ) : (
              <EmptyState message="No jobs have been scheduled yet." />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
