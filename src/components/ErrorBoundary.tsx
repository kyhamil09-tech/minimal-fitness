import React from 'react';
import { logError } from '../lib/diagnostics';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** What to show instead of the broken part. Without it the whole-app recovery screen is used. */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches a crash while drawing and shows a way out instead of a blank screen.
 * The error goes into the on-device error log (Settings > Data & backup).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(`Screen crashed: ${error?.message ?? String(error)}`, `${error?.stack ?? ''}\n${info.componentStack ?? ''}`);
  }

  reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-5 bg-black px-8 text-center text-white">
        <h1 className="text-2xl font-extrabold italic">Something went wrong</h1>
        <p className="max-w-xs text-sm text-gray-400">
          The screen hit an error. Your saved workouts and settings are not affected. The details are in Settings, Data &amp; backup, Error
          log.
        </p>
        <div className="flex w-full max-w-xs gap-3">
          <button onClick={this.reset} className="flex-1 rounded-2xl bg-white/10 py-3 font-bold text-white">
            Try again
          </button>
          <button onClick={() => window.location.reload()} className="flex-1 rounded-2xl bg-[#FF5500] py-3 font-extrabold text-black">
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
