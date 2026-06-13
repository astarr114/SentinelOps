/**
 * RunbookPanel — fetches PagerDuty Response Plays for the incident's service
 * and displays them as runbook steps the on-call team can follow.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { useSplunk } from '@/contexts/SplunkContext';
import { cn } from '@/lib/utils';
import {
  BookOpen, RefreshCw, ExternalLink, AlertTriangle, Play,
  Users, MessageSquare, Loader2, Settings, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface PdResponsePlay {
  id: string;
  name: string;
  description: string | null;
  team: { id: string; summary: string } | null;
  responders: Array<{ id: string; summary: string; type: string }>;
  subscribers: Array<{ id: string; summary: string; type: string }>;
  responders_message: string | null;
  runnability: string;
  html_url: string;
}

interface RunbookPanelProps {
  service: string;
  incidentId: string;
}

export function RunbookPanel({ service, incidentId }: RunbookPanelProps) {
  const { config } = useSplunk();
  const [plays, setPlays]     = useState<PdResponsePlay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasKey = !!config.pdRestApiKey;

  const fetchPlays = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ serviceName: service });
      if (config.pdRestApiKey) params.set('restApiKey', config.pdRestApiKey);
      const { data, error: fnErr } = await supabase.functions.invoke(
        `pagerduty-runbook?${params.toString()}`,
        { method: 'GET' },
      );
      if (fnErr) {
        const msg = await fnErr?.context?.text?.() ?? fnErr.message;
        setError(msg);
      } else if (data?.error) {
        setError(data.error);
      } else {
        setPlays(Array.isArray(data?.plays) ? data.plays : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch response plays');
    } finally {
      setLoading(false);
    }
  }, [config.pdRestApiKey, hasKey, service]);

  useEffect(() => { fetchPlays(); }, [fetchPlays]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-purple-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">Response Plays</span>
          {plays.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/30 border border-purple-700/40 text-purple-300 font-medium">
              {plays.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchPlays}
          disabled={loading || !hasKey}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Not configured */}
      {!hasKey && (
        <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
          <div className="h-10 w-10 rounded-full border border-border bg-secondary/30 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Runbooks not connected</p>
            <p className="text-xs text-muted-foreground mt-1 text-pretty max-w-[200px]">
              Add your PagerDuty REST API key in Settings to load response plays for {service}.
            </p>
          </div>
          <Link to="/settings">
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
              <Settings className="h-3.5 w-3.5" />Configure in Settings
            </Button>
          </Link>
        </div>
      )}

      {/* Loading */}
      {hasKey && loading && (
        <div className="flex items-center gap-2 px-4 py-5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading response plays…
        </div>
      )}

      {/* Error */}
      {hasKey && !loading && error && (
        <div className="px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-300 font-medium">Failed to load runbooks</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 text-pretty">{error}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {hasKey && !loading && !error && plays.length === 0 && (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground">No response plays found for <span className="font-mono text-foreground/60">{service}</span>.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Create Response Plays in your PagerDuty account to see them here.</p>
        </div>
      )}

      {/* Plays list */}
      {hasKey && !loading && plays.length > 0 && (
        <div className="divide-y divide-border">
          {plays.map(play => {
            const isOpen = expanded.has(play.id);
            return (
              <div key={play.id} className="hover:bg-secondary/20 transition-colors">
                <button
                  className="w-full text-left px-4 py-3 flex items-start gap-3"
                  onClick={() => toggleExpand(play.id)}
                >
                  <div className="h-7 w-7 rounded-lg bg-purple-900/30 border border-purple-700/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Play className="h-3 w-3 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug text-pretty">{play.name}</p>
                    {play.description && !isOpen && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{play.description}</p>
                    )}
                    {play.team && (
                      <span className="inline-block mt-1 text-[9px] font-medium px-1.5 py-px rounded-full bg-secondary border border-border text-muted-foreground">
                        {play.team.summary}
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                  }
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {play.description && (
                      <p className="text-[11px] text-muted-foreground text-pretty leading-relaxed">
                        {play.description}
                      </p>
                    )}

                    {play.responders_message && (
                      <div className="rounded-lg bg-blue-900/10 border border-blue-700/30 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MessageSquare className="h-3 w-3 text-blue-400 shrink-0" />
                          <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Responder Message</span>
                        </div>
                        <p className="text-[11px] text-foreground/70 text-pretty leading-relaxed">
                          {play.responders_message}
                        </p>
                      </div>
                    )}

                    {play.responders.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Users className="h-3 w-3 text-teal-400 shrink-0" />
                          <span className="text-[10px] font-semibold text-teal-300 uppercase tracking-wider">Responders</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {play.responders.map(r => (
                            <span key={r.id} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-900/20 border border-teal-700/30 text-teal-300">
                              {r.summary}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <a
                      href={play.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open in PagerDuty
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      {hasKey && !loading && (
        <div className="px-4 py-2 border-t border-border bg-secondary/10">
          <p className="text-[9px] text-muted-foreground/60">
            Showing response plays for <span className="font-mono">{service}</span> · {incidentId}
          </p>
        </div>
      )}
    </div>
  );
}
