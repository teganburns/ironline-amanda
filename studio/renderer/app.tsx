import { startTransition, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import type { StudioSnapshot } from "../../src/studio/types";
import { studioClient } from "./client";
import { getBridgeDiagnostics } from "./bridge";
import { AmandaMark } from "./components/amanda-mark";
import { ShellLayout } from "./components/shell-layout";
import { OverviewPage } from "./pages/overview-page";
import { RunsPage } from "./pages/runs-page";
import { RunDetailPage } from "./pages/run-detail-page";
import { JobsPage } from "./pages/jobs-page";
import { JobDetailPage } from "./pages/job-detail-page";
import { ConnectorsPage } from "./pages/connectors-page";
import { McpsPage } from "./pages/mcps-page";
import { AgentPage } from "./pages/agent-page";
import { ObservabilityPage } from "./pages/observability-page";
import type { ShellContextValue } from "./context";

const STARTUP_MESSAGES = [
  "Warming the lattice",
  "Teaching the gradients to behave",
  "Untangling Amanda's thought graph",
  "Giving the MCPs a quick pep talk",
  "Polishing the cotton-candy control plane",
  "Aligning the pastel field",
];

function getStartupSplashConfig() {
  const params = new URLSearchParams(window.location.search);
  const holdMs = Number.parseInt(params.get("startupSplashMs") ?? "0", 10);
  const mode = params.get("startupSplashMode") ?? "normal";

  return {
    holdMs: Number.isFinite(holdMs) && holdMs > 0 ? holdMs : 0,
    preview: mode === "hold",
  };
}

function getStartupHoldMs(config: ReturnType<typeof getStartupSplashConfig>) {
  if (config.holdMs > 0) {
    return config.holdMs;
  }

  const randomizedHoldMs = 3_200 + Math.floor(Math.random() * 500);
  return config.preview ? Math.max(randomizedHoldMs, 3_600) : randomizedHoldMs;
}

function formatStartupError(message: string | null) {
  if (!message) {
    return null;
  }

  if (message.includes("HTTP 404") && message.includes("studio:get-bridge-info")) {
    return "Startup issue: a stale Amanda backend was detected. Fully quit Amanda and relaunch so the new bridge and backend start together.";
  }

  return `Startup issue: ${message}`;
}

export function App() {
  const splashConfig = getStartupSplashConfig();
  const [startupHoldMs] = useState(() => getStartupHoldMs(splashConfig));
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [splashReleased, setSplashReleased] = useState(splashConfig.preview);
  const [startupMessageIndex, setStartupMessageIndex] = useState(0);

  async function refreshSnapshot() {
    try {
      setSnapshotBusy(true);
      setStartupError(null);
      const next = await studioClient.getSnapshot();
      startTransition(() => {
        setSnapshot(next);
      });
      return next;
    } catch (error: any) {
      setStartupError(error?.message ?? "Unable to load the initial studio snapshot.");
      return null;
    } finally {
      setSnapshotBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const diagnostics = await getBridgeDiagnostics();
      if (!diagnostics.ok) {
        if (!cancelled) {
          setStartupError(diagnostics.message);
          setSnapshotBusy(false);
        }
        return;
      }

      if (!cancelled) {
        await refreshSnapshot();
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (splashConfig.preview) {
      setSplashReleased(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSplashReleased(true);
    }, startupHoldMs);

    return () => window.clearTimeout(timeout);
  }, [splashConfig.preview, startupHoldMs]);

  useEffect(() => {
    if (startupError) return;

    const interval = window.setInterval(() => {
      setStartupMessageIndex((current) => (current + 1) % STARTUP_MESSAGES.length);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [startupError]);

  const formattedStartupError = formatStartupError(startupError);

  if (!snapshot || !splashReleased) {
    return (
      <main className="shell loading startup-shell">
        <section className="startup-splash">
          <div className="startup-aura startup-aura-blue" aria-hidden="true" />
          <div className="startup-aura startup-aura-lilac" aria-hidden="true" />
          <div className="startup-aura startup-aura-pink" aria-hidden="true" />
          <div className="startup-grid" aria-hidden="true" />
          <div className="startup-brand">
            <AmandaMark animated className="startup-mark" />
            <div className="startup-wordmark" aria-label="Amanda">
              Amanda
            </div>
            {formattedStartupError ? (
              <p className="startup-status">{formattedStartupError}</p>
            ) : (
              <div className="startup-status-rotator" aria-label="Amanda startup activity">
                <div className="startup-status-item" key={STARTUP_MESSAGES[startupMessageIndex]}>
                  <span className="startup-status-dot" aria-hidden="true" />
                  <span>{STARTUP_MESSAGES[startupMessageIndex]}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  const shellContext: ShellContextValue = {
    snapshot,
    refreshSnapshot,
    snapshotBusy,
    startupError,
  };

  return (
    <HashRouter>
      <Routes>
        <Route element={<ShellLayout shell={shellContext} />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/mcps" element={<McpsPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/observability" element={<ObservabilityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
