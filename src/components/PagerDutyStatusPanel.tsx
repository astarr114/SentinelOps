/**
 * PagerDutyStatusPanel
 * Shows open / acknowledged / resolved incident counts from the PagerDuty REST API.
 * Calls the pagerduty-status edge function with the user's saved PD REST API key.
 * If no key is configured it renders a friendly setup prompt.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { useSplunk } from '@/contexts/SplunkContext';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Bell, RefreshCw, ExternalLink, AlertTriangle, CheckCheck, TrendingUp, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdIncident {
  id: string;
  title: string;
  status: 'triggered' | 'acknowledged' | 'resolved';
  urgency: string;
  created_at: string;
  html_url: string;
  service: string;
}

interface PdStatus {
  open: number;
  acknowledged: number;
  resolved: number;
  total: number;
  incidents: PdIncident[];
  since: string;
  until: string;
  mock?: boolean;
  error?: string;
}

const STATUS_STYLE: Record<string, { label: string; dot: string; badge: string }> = {
  triggered:    { label: 'Open',         dot: 'bg-red-400',   badge: 'bg-red-900/30 text-red-300 border-red-700/40' },
  acknowledged: { label: 'Acknowledged', dot: 'bg-amber-400', badge: 'bg-amber-900/20 text-amber-300 border-amber-700/30' },
  resolved:     { label: 'Resolved',     dot: 'bg-teal-400',  badge: 'bg-teal-900/20 text-teal-300 border-teal-700/30' },
};

export function PagerDutyStatusPanel() {
  const { config } = useSplunk();
  const [status, setStatus]   = useState<PdStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const hasKey = !!config.pdRestApiKey;

  const fetchStatus = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        `pagerduty-status?restApiKey=${encodeURIComponent(config.pdRestApiKey)}`,
        { method: 'GET' },
      );
      if (fnErr) {
        const msg = await fnErr?.context?.text?.() ?? fnErr.message;
        setError(msg);
      } else {
        setStatus(data as PdStatus);
        setLastRefresh(new Date());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch PagerDuty status');
    } finally {
      setLoading(false);
    }
  }, [config.pdRestApiKey, hasKey]);

  // Auto-fetch on mount and every 2 minutes
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-green-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">PagerDuty Status</span>
          {status && !status.mock && (
            <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border bg-teal-900/30 border-teal-700/40 text-teal-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground hidden md:block">
              {lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            disabled={loading || !hasKey}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Not configured */}
      {!hasKey && (
        <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
          <div className="h-10 w-10 rounded-full border border-border bg-secondary/30 flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">PagerDuty not connected</p>
            <p className="text-xs text-muted-foreground mt-1 text-pretty max-w-[220px]">
              Add your PagerDuty REST API key in Settings to see live incident counts.
            </p>
          </div>
          <Link to="/settings">
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
              <Settings className="h-3.5 w-3.5" />Configure in Settings
            </Button>
          </Link>
        </div>
      )}

      {/* Loading skeleton */}
      {hasKey && loading && !status && (
        <div className="px-4 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3 animate-pulse">
                <div className="h-6 w-8 bg-muted rounded mb-1" />
                <div className="h-3 w-12 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {hasKey && error && (
        <div className="px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs text-red-300 font-medium">Failed to load PagerDuty status</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 text-pretty">{error}</p>
          </div>
        </div>
      )}

      {/* Status data */}
      {hasKey && status && !error && (
        <div className="p-4 space-y-4">
          {/* Summary last 24h */}
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Last 24 hours</p>

          {/* Count cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-red-700/30 bg-red-900/10 p-3 text-center">
              <p className="text-2xl font-bold text-red-300 leading-none">{status.open}</p>
              <p className="text-[10px] text-red-400/70 mt-1 font-medium uppercase tracking-wide">Open</p>
            </div>
            <div className="rounded-lg border border-amber-700/30 bg-amber-900/10 p-3 text-center">
              <p className="text-2xl font-bold text-amber-300 leading-none">{status.acknowledged}</p>
              <p className="text-[10px] text-amber-400/70 mt-1 font-medium uppercase tracking-wide">Ack'd</p>
            </div>
            <div className="rounded-lg border border-teal-700/30 bg-teal-900/10 p-3 text-center">
              <p className="text-2xl font-bold text-teal-300 leading-none">{status.resolved}</p>
              <p className="text-[10px] text-teal-400/70 mt-1 font-medium uppercase tracking-wide">Resolved</p>
            </div>
          </div>

          {/* Recent incidents list */}
          {status.incidents.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Recent Incidents</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {status.incidents.map(inc => {
                  const style = STATUS_STYLE[inc.status] ?? STATUS_STYLE.triggered;
                  return (
                    <a
                      key={inc.id}
                      href={inc.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-lg border border-border bg-secondary/10 hover:bg-secondary/30 px-2.5 py-2 transition-colors group"
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0 mt-1', style.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground/80 group-hover:text-foreground truncate leading-snug">
                          {inc.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={cn('text-[9px] font-medium px-1 py-px rounded border', style.badge)}>
                            {style.label}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 font-mono truncate">{inc.service}</span>
                        </div>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {status.incidents.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-teal-700/20 bg-teal-900/10 px-3 py-2.5">
              <TrendingUp className="h-4 w-4 text-teal-400 shrink-0" />
              <p className="text-xs text-teal-300">No incidents in the last 24 hours</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
