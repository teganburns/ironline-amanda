import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class StudioErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[studio-renderer] unhandled render error", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="shell loading startup-shell">
        <section className="startup-splash">
          <div className="startup-aura startup-aura-blue" aria-hidden="true" />
          <div className="startup-aura startup-aura-lilac" aria-hidden="true" />
          <div className="startup-aura startup-aura-pink" aria-hidden="true" />
          <div className="startup-grid" aria-hidden="true" />
          <div className="startup-brand">
            <div className="startup-wordmark" aria-label="Amanda">
              Amanda
            </div>
            <p className="startup-status">
              Studio hit a renderer error instead of loading normally.
            </p>
            <p className="startup-status">
              {this.state.error.message || "Unknown renderer error"}
            </p>
            <div className="flow-toolbar-actions">
              <button type="button" onClick={() => window.location.assign("#/")}>
                Go Home
              </button>
              <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
                Reload Window
              </button>
              <button className="secondary-button" type="button" onClick={() => void window.ironlineStudio.restartApp()}>
                Restart App
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
