import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ShellContextValue } from "../context";
import { getPageTitle, isNavItemActive, navItems, resolveBackNavigation } from "../routes";
import { AmandaMark } from "./amanda-mark";
import { NavIcon } from "./nav-icon";

export function ShellLayout({ shell }: { shell: ShellContextValue }) {
  const [navExpanded, setNavExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const readyConnectors = shell.snapshot.connectors.filter((connector) => connector.status.state === "ready").length;
  const backNavigation =
    typeof window === "undefined" ? null : resolveBackNavigation(location.pathname, window.history.state);
  const topbarMeta = shell.startupError
    ? `Sync issue: ${shell.startupError}`
    : shell.snapshotBusy
    ? "Refreshing studio data..."
    : `${readyConnectors} connectors ready • ${shell.snapshot.jobs.length} jobs • ${shell.snapshot.recentRuns.length} recent runs`;

  function handleBack() {
    if (!backNavigation) return;

    if (backNavigation.mode === "history") {
      navigate(-1);
      return;
    }

    navigate(backNavigation.to);
  }

  return (
    <main className={`shell${navExpanded ? " shell-expanded" : ""}`}>
      <header className="topbar">
        <div className="topbar-main">
          {backNavigation ? (
            <button className="topbar-back" onClick={handleBack} title={`Back to ${backNavigation.label}`} type="button">
              <span aria-hidden="true">←</span>
              <span className="topbar-back-label">{backNavigation.label}</span>
            </button>
          ) : null}
          <div className="topbar-copy">
            <AmandaMark className="topbar-logo" />
            <span className="topbar-title">Amanda / {getPageTitle(location.pathname)}</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="topbar-meta">{topbarMeta}</span>
        </div>
      </header>

      <aside
        className="rail"
        onMouseEnter={() => setNavExpanded(true)}
        onMouseLeave={() => setNavExpanded(false)}
      >
        <nav className="nav">
          {navItems.map((item) => {
            const isActive = isNavItemActive(location.pathname, item.to);

            return (
              <Link className={`nav-link${isActive ? " active" : ""}`} key={item.to} to={item.to} title={item.label}>
                <span className="nav-active-indicator" aria-hidden="true" />
                <span className="nav-icon-shell">
                  <NavIcon icon={item.icon} />
                </span>
                <span className="nav-copy">
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="rail-footer">
          <button className="refresh" onClick={() => void shell.refreshSnapshot()} title="Refresh snapshot">
            <span className="nav-icon-shell refresh-icon">↻</span>
            <span className="refresh-copy">{shell.snapshotBusy ? "Refreshing..." : "Refresh Snapshot"}</span>
          </button>
        </div>
      </aside>

      <section className="content">
        <div className="content-inner">
          <Outlet context={shell} />
        </div>
      </section>
    </main>
  );
}
