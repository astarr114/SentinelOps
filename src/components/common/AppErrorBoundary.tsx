// AppErrorBoundary — catches runtime errors (including Fast Refresh context mismatches)
// and shows a friendly reconnect prompt instead of a blank crash screen.
// Also exports ContextHealthIndicator — a dev-mode pill that confirms all providers are live.

import React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── ErrorBoundary ─────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  /** Narrow label shown in the heading, e.g. "Dashboard" */
  pageName?: string;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console so Sentry / other monitors can pick it up
    console.error('[AppErrorBoundary]', error, errorInfo);
  }

  private handleReload = () => {
    // Clear the error state then trigger a full page reload to re-initialise providers
    this.setState({ hasError: false, error: null, errorInfo: null }, () => {
      window.location.reload();
    });
  };

  private handleHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null }, () => {
      window.location.href = '/';
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isContextError =
      this.state.error?.message?.includes('must be used within') ||
      this.state.error?.message?.includes('Provider');

    const isDev = import.meta.env.DEV;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          {/* Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground text-balance">
              {isContextError ? 'Provider state out of sync' : `Something went wrong`}
              {this.props.pageName ? ` in ${this.props.pageName}` : ''}
            </h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {isContextError
                ? 'A hot-reload caused a React context mismatch. Reload the page to re-initialise all providers — your settings are saved.'
                : 'An unexpected error occurred. Reload to try again or navigate back to the dashboard.'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={this.handleReload} className="gap-2 h-9">
              <RefreshCw className="h-4 w-4" />
              Reload page
            </Button>
            <Button variant="secondary" onClick={this.handleHome} className="gap-2 h-9">
              <Home className="h-4 w-4" />
              Back to dashboard
            </Button>
          </div>

          {/* Dev-only error details */}
          {isDev && this.state.error && (
            <details className="text-left rounded-lg border border-border bg-secondary/30 p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
                <Bug className="h-3.5 w-3.5" />
                Dev details
              </summary>
              <div className="mt-2 space-y-2">
                <pre className="text-[10px] font-mono text-destructive whitespace-pre-wrap break-all">
                  {this.state.error.message}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }
}

// ─── ContextHealthIndicator (dev-mode only) ─────────────────────────────────
// Renders a small pill in the top-right confirming all providers are live.
// Automatically hidden in production builds (import.meta.env.DEV === false).

import { useContext } from 'react';
// We import the raw context objects — not the hooks — to avoid throwing
// when a provider is missing (that's exactly what we want to detect).
import { SplunkContext }  from '@/contexts/SplunkContext';
import { AuthContext }    from '@/contexts/AuthContext';
import { LlmContext }     from '@/contexts/LlmContext';

interface ProviderStatus {
  name: string;
  alive: boolean;
}

function useProviderStatuses(): ProviderStatus[] {
  const splunk = useContext(SplunkContext);
  const auth   = useContext(AuthContext);
  const llm    = useContext(LlmContext);
  return [
    { name: 'Auth',   alive: auth   != null },
    { name: 'Splunk', alive: splunk != null },
    { name: 'LLM',    alive: llm    != null },
  ];
}

export function ContextHealthIndicator() {
  // Only render in dev — no-op in production
  if (!import.meta.env.DEV) return null;

  return <ContextHealthInner />;
}

function ContextHealthInner() {
  const statuses = useProviderStatuses();
  const allOk    = statuses.every(s => s.alive);
  const [open, setOpen] = React.useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-1">
      {/* Detail pop-up */}
      {open && (
        <div className="rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-xs space-y-1 mb-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Provider health</p>
          {statuses.map(s => (
            <div key={s.name} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.alive ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={s.alive ? 'text-foreground' : 'text-destructive font-medium'}>
                {s.name}: {s.alive ? 'live' : 'NOT mounted'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Toggle pill */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow transition-colors ${
          allOk
            ? 'border-green-600/40 bg-green-950/60 text-green-400 hover:bg-green-950'
            : 'border-red-600/40 bg-red-950/60 text-red-400 hover:bg-red-950 animate-pulse'
        }`}
        title="Context provider health (dev only)"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${allOk ? 'bg-green-400' : 'bg-red-400'}`} />
        {allOk ? 'Providers OK' : 'Provider error'}
      </button>
    </div>
  );
}
