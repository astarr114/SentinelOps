import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSplunk } from '@/contexts/SplunkContext';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SeverityBadge, StatusBadge, ConfidenceBar } from '@/components/ui/badges';
import { RunbookPanel } from '@/components/RunbookPanel';
import { AnalysisDiff } from '@/components/incident/AnalysisDiff';
import { AnalysisSourceBadge, ReasoningSourceBadge } from '@/components/incident/AnalysisSourceBadge';
import { RuntimeEvidencePanel, downloadDiagnosticReport, type RuntimeTrace } from '@/components/incident/RuntimeEvidencePanel';
import type { Incident, AnalysisResult } from '@/types/types';
import {
  Zap, Clock, Server, AlertTriangle, GitBranch, BarChart2,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, Circle, Terminal,
  Bell, CheckCheck, TrendingUp, ChevronRight, RefreshCw, History, Coins,
  Download, FileText, FileCode2, GitCompare, OctagonAlert, FileJson, Database, Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface IncidentDetailProps {
  incident: Incident;
  analysis: (AnalysisResult & { aiBrief?: { executiveSummary?: string; technicalFindings?: string; immediateRisk?: string; confidenceStatement?: string }; splunkMode?: string; runtimeTrace?: RuntimeTrace; fromCache?: boolean }) | null;
  loading: boolean;
  streamingBrief?: string;
  streamStep?: 'idle' | 'evidence' | 'streaming' | 'done';
  streamTokens?: number;
  streamCostUsd?: string;
  streamStopReason?: string;
  onAnalyze: (forceRefresh?: boolean) => void;
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  deployment: 'text-orange-400',
  resource: 'text-red-400',
  dependency: 'text-blue-400',
  external: 'text-purple-400',
  config: 'text-yellow-400',
};

const TIMELINE_COLORS: Record<string, string> = {
  deploy: 'bg-orange-400',
  alert: 'bg-red-400',
  error: 'bg-red-500',
  recovery: 'bg-green-400',
  change: 'bg-yellow-400',
  info: 'bg-blue-400',
};

interface SaveButtonProps {
  incident: Incident;
  analysis: AnalysisResult & { aiBrief?: Record<string, string> };
}

function SaveAnalysisButton({ incident, analysis }: SaveButtonProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) { toast.error('Sign in to save analyses'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('incident_analyses').insert({
        user_id: user.id,
        incident_id: incident.id,
        incident_title: incident.title,
        service: incident.service,
        severity: incident.severity,
        analysis_result: analysis,
      });
      if (error) throw error;
      toast.success('Analysis saved to your workspace');
    } catch (err) {
      toast.error('Failed to save analysis');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="border-border text-muted-foreground hover:text-foreground h-8 text-xs">
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
      Save Analysis
    </Button>
  );
}

// ── PagerDuty action button ───────────────────────────────────────────────────
function PagerDutyButton({ incident }: { incident: Incident }) {
  const { config } = useSplunk();
  const [pdLoading, setPdLoading] = useState<string | null>(null);

  const hasKey = !!config.pagerdutyRoutingKey;

  async function firePd(action: 'trigger' | 'acknowledge' | 'resolve') {
    if (!hasKey) {
      toast.error('PagerDuty not configured', {
        description: 'Add your PagerDuty routing key in Settings → Integrations.',
      });
      return;
    }
    setPdLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('pagerduty-event', {
        body: {
          action,
          incidentId:  incident.id,
          title:       incident.title,
          severity:    incident.severity,
          service:     incident.service,
          summary:     incident.summary ?? incident.title,
          routingKey:  config.pagerdutyRoutingKey,
        },
      });
      if (error) {
        const msg = await error?.context?.text?.() ?? error.message;
        toast.error(`PagerDuty ${action} failed`, { description: msg });
      } else {
        const labels: Record<string, string> = {
          trigger:     'Triggered in PagerDuty',
          acknowledge: 'Acknowledged in PagerDuty',
          resolve:     'Resolved in PagerDuty',
        };
        toast.success(labels[action], { description: `Dedup key: ${data?.dedup_key ?? '—'}` });
      }
    } finally {
      setPdLoading(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium"
          disabled={!!pdLoading}
          title={hasKey ? 'PagerDuty actions' : 'Configure PagerDuty routing key in Settings to enable'}
        >
          {pdLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Bell className="h-3.5 w-3.5 text-green-400" />}
          PagerDuty
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => firePd('trigger')}
        >
          <Bell className="h-3.5 w-3.5 text-red-400" />
          Trigger incident
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => firePd('acknowledge')}
        >
          <CheckCheck className="h-3.5 w-3.5 text-amber-400" />
          Acknowledge
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => firePd('resolve')}
        >
          <TrendingUp className="h-3.5 w-3.5 text-teal-400" />
          Resolve
        </DropdownMenuItem>
        {!hasKey && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-[10px] text-muted-foreground cursor-default">
              ⚠ Add routing key in Settings
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Markdown / PDF export helpers ─────────────────────────────────────────
type FullAnalysis = AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace };

function buildMarkdown(incident: Incident, analysis: FullAnalysis): string {
  const ts = new Date().toISOString();
  const lines: string[] = [
    `# Incident Analysis: ${incident.title}`,
    '',
    `**Incident ID:** \`${incident.id}\`  `,
    `**Service:** ${incident.service}  `,
    `**Severity:** ${incident.severity}  `,
    `**Status:** ${incident.status}  `,
    `**Opened:** ${formatTs(incident.opened_at)}  `,
    `**Exported:** ${new Date(ts).toLocaleString()}  `,
    `**Data source:** ${analysis.splunkMode ?? 'demo'}  `,
    '',
  ];

  if (incident.summary) {
    lines.push('## Incident Summary', '', incident.summary, '');
  }

  if (analysis.aiBrief) {
    lines.push('## AI Incident Brief', '');
    if (analysis.aiBrief.executiveSummary) {
      lines.push('### Executive Summary', '', analysis.aiBrief.executiveSummary, '');
    }
    if (analysis.aiBrief.technicalFindings) {
      lines.push('### Technical Findings', '', analysis.aiBrief.technicalFindings, '');
    }
    if (analysis.aiBrief.immediateRisk) {
      lines.push('### ⚠️ Immediate Risk', '', `> ${analysis.aiBrief.immediateRisk}`, '');
    }
    if (analysis.aiBrief.confidenceStatement) {
      lines.push('', `_${analysis.aiBrief.confidenceStatement}_`, '');
    }
  }

  if (analysis.hypotheses.length) {
    lines.push('## Root Cause Hypotheses', '');
    analysis.hypotheses.forEach((h, i) => {
      lines.push(
        `### ${i + 1}. ${h.title}`,
        `**Confidence:** ${Math.round(h.confidence * 100)}%  `,
        `**Category:** ${h.category}  `,
        '',
        '**Evidence:**',
        ...h.evidence.map(e => `- ${e}`),
        '',
      );
    });
  }

  if (analysis.recommendedActions.length) {
    lines.push('## Recommended Actions', '');
    analysis.recommendedActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }

  if (analysis.timeline.length) {
    lines.push('## Event Timeline', '');
    analysis.timeline.forEach(t => {
      lines.push(`- **[${t.type.toUpperCase()}]** \`${formatTs(t.timestamp)}\` — ${t.event}${t.service ? ` _(${t.service})_` : ''}`);
    });
    lines.push('');
  }

  lines.push('## Blast Radius', '');
  lines.push(`**Services affected:** ${analysis.blastRadius.services.join(', ') || 'None'}  `);
  if (analysis.blastRadius.estimated_users_affected) {
    lines.push(`**Users impacted:** ${analysis.blastRadius.estimated_users_affected.toLocaleString()}  `);
  }
  if (analysis.blastRadius.estimated_revenue_impact) {
    lines.push(`**Revenue impact:** ${analysis.blastRadius.estimated_revenue_impact}  `);
  }
  if (analysis.blastRadius.endpoints.length) {
    lines.push('', '**Affected endpoints:**');
    analysis.blastRadius.endpoints.forEach(ep => lines.push(`- \`${ep}\``));
  }
  lines.push('');

  if (analysis.openQuestions.length) {
    lines.push('## Open Questions', '');
    analysis.openQuestions.forEach(q => lines.push(`- ${q}`));
    lines.push('');
  }

  if (analysis.topErrors.length) {
    lines.push('## Error Patterns', '');
    analysis.topErrors.forEach(e => {
      lines.push(`- **[${e.severity.toUpperCase()}]** \`${e.pattern}\` (×${e.count})`);
      lines.push(`  _Sample:_ ${e.sample}`);
    });
    lines.push('');
  }

  if (analysis.deployEvents.length) {
    lines.push('## Deployment Events', '');
    analysis.deployEvents.forEach(d => {
      lines.push(`- **${d.version}** — ${d.status} by ${d.deployed_by} @ \`${formatTs(d.timestamp)}\``);
      lines.push(`  ${d.change_summary}`);
    });
    lines.push('');
  }

  lines.push('---', `_Generated by SentinelOps · ${ts}_`);
  return lines.join('\n');
}

function exportMarkdown(incident: Incident, analysis: FullAnalysis) {
  const md = buildMarkdown(incident, analysis);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `incident_${incident.id}_analysis_${ts}.md`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(incident: Incident) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  // Set document title so browser uses it as the default PDF filename
  const prev = document.title;
  document.title = `incident_${incident.id}_analysis_${ts}`;
  window.print();
  document.title = prev;
}

export function IncidentDetail({ incident, analysis, loading, streamingBrief = '', streamStep = 'idle', streamTokens = 0, streamCostUsd = '0.0000', streamStopReason = '', onAnalyze }: IncidentDetailProps) {
  if (!incident) return null;

  const { config } = useSplunk();

  // ── Past Analyses ──────────────────────────────────────────────────────────
  const [showPast, setShowPast] = useState(false);
  const [pastAnalyses, setPastAnalyses] = useState<Array<{
    id: string;
    created_at: string;
    splunk_mode: string;
    analysis_result: AnalysisResult & { aiBrief?: Record<string, string> };
  }>>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);
  // Diff comparison state
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (!showPast) return;
    setLoadingPast(true);
    supabase
      .from('incident_analyses')
      .select('id, created_at, splunk_mode, analysis_result')
      .eq('incident_id', incident.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setPastAnalyses((data ?? []) as typeof pastAnalyses);
        setLoadingPast(false);
      });
  }, [showPast, incident.id]);

  // The analysis to display: a selected past entry or the current live result
  const displayedAnalysis = selectedPastId
    ? pastAnalyses.find(p => p.id === selectedPastId)?.analysis_result ?? null
    : analysis;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Incident Overview Card */}
      <div className="shrink-0 border-b border-border bg-card/50 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-[11px] text-muted-foreground bg-secondary/50 border border-border px-2 py-0.5 rounded-md">
                {incident.id}
              </span>
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
            </div>
            <h1 className="text-[15px] font-bold text-foreground text-balance leading-snug">{incident.title}</h1>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
            {analysis && <SaveAnalysisButton incident={incident} analysis={analysis} />}
            <PagerDutyButton incident={incident} />

            {/* Export dropdown — visible only when there's an analysis to export */}
            {analysis && !loading && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-semibold whitespace-nowrap"
                    title="Export analysis"
                  >
                    <Download className="h-3 w-3" />Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuItem
                    onClick={() => exportMarkdown(incident, analysis as FullAnalysis)}
                    className="gap-2 cursor-pointer"
                  >
                    <FileCode2 className="h-3.5 w-3.5 text-primary/70" />
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => exportPdf(incident)}
                    className="gap-2 cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary/70" />
                    Export as PDF
                  </DropdownMenuItem>
                  {(analysis as FullAnalysis).runtimeTrace && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => downloadDiagnosticReport((analysis as FullAnalysis).runtimeTrace!, incident.id)}
                        className="gap-2 cursor-pointer"
                      >
                        <FileJson className="h-3.5 w-3.5 text-primary/70" />
                        Runtime diagnostic JSON
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Past Analyses toggle */}
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold whitespace-nowrap"
              onClick={() => { setShowPast(v => !v); setSelectedPastId(null); setCompareIds(new Set()); setShowDiff(false); }}
              title="View past analyses for this incident"
            >
              <History className="h-3 w-3" />History
            </Button>

            {/* Re-analyze (force-refresh) button shown when cached result displayed */}
            {analysis?.fromCache && !loading && (
              <Button
                onClick={() => onAnalyze(true)}
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold whitespace-nowrap"
                title="Re-run analysis, ignoring cache"
              >
                <RefreshCw className="h-3 w-3" />Re-analyze
              </Button>
            )}
            <Button
              onClick={() => onAnalyze()}
              disabled={loading}
              size="sm"
              className={cn(
                'h-8 gap-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                loading
                  ? 'bg-primary/70 text-primary-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
              )}
            >
              {loading
                ? <><Loader2 className="h-3 w-3 animate-spin" />Analyzing…</>
                : <><Zap className="h-3 w-3" />{analysis ? 'Re-analyze' : 'Analyze'}</>
              }
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetaItem icon={Server}        label="Service"   value={incident.service} mono />
          <MetaItem icon={Clock}         label="Opened"    value={formatTs(incident.opened_at)} mono />
          <MetaItem icon={BarChart2}     label="Window"    value={incident.time_window.replace('last_', 'Last ').replace('m', ' min').replace('h', ' hr')} />
          <MetaItem icon={AlertTriangle} label="Endpoints" value={incident.affected_endpoints?.length ? `${incident.affected_endpoints.length} affected` : 'Unknown'} />
        </div>

        {incident.summary && (
          <p className="mt-3 text-[12px] text-muted-foreground text-pretty leading-relaxed border-t border-border/50 pt-3">
            {incident.summary}
          </p>
        )}
      </div>

      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">

        {/* ── Past Analyses Panel ─────────────────────────────────────────── */}
        {showPast && (
          showDiff && compareIds.size === 2 ? (
            /* ── Diff view ──────────────────────────────────────────────── */
            (() => {
              const [idA, idB] = [...compareIds];
              const entryA = pastAnalyses.find(p => p.id === idA);
              const entryB = pastAnalyses.find(p => p.id === idB);
              if (!entryA || !entryB) return null;
              // Always put older entry on left, newer on right
              const [leftEntry, rightEntry] = entryA.created_at < entryB.created_at
                ? [entryA, entryB]
                : [entryB, entryA];
              return (
                <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ height: '70vh' }}>
                  <AnalysisDiff
                    left={leftEntry}
                    right={rightEntry}
                    incidentTitle={incident.title}
                    alertEmail={config.alertEmail}
                    onBack={() => setShowDiff(false)}
                  />
                </div>
              );
            })()
          ) : (
            /* ── History list ───────────────────────────────────────────── */
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-secondary/40 border-b border-border gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <History className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground whitespace-nowrap">Past Analyses</span>
                  {pastAnalyses.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-1.5 py-0.5 rounded">
                      {pastAnalyses.length}
                    </span>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {compareIds.size === 2 && (
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => setShowDiff(true)}
                    >
                      <GitCompare className="h-3 w-3" />Compare
                    </Button>
                  )}
                  {compareIds.size > 0 && (
                    <button
                      onClick={() => setCompareIds(new Set())}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                  {selectedPastId && (
                    <button
                      onClick={() => setSelectedPastId(null)}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      ← Back to current
                    </button>
                  )}
                </div>
              </div>

              {compareIds.size > 0 && compareIds.size < 2 && (
                <p className="px-4 py-2 text-[11px] text-muted-foreground bg-secondary/20 border-b border-border">
                  Select one more analysis to compare
                </p>
              )}

              {loadingPast ? (
                <div className="flex items-center gap-2 px-4 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span className="text-xs">Loading history…</span>
                </div>
              ) : pastAnalyses.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground">No past analyses found for this incident.</p>
              ) : (
                <div className="divide-y divide-border">
                  {pastAnalyses.map(pa => {
                    const checked = compareIds.has(pa.id);
                    const disableCheck = !checked && compareIds.size >= 2;
                    return (
                      <div
                        key={pa.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30',
                          pa.id === selectedPastId && 'bg-primary/8 border-l-2 border-l-primary'
                        )}
                      >
                        {/* Checkbox for diff selection */}
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableCheck}
                          onChange={e => {
                            setCompareIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(pa.id);
                              else next.delete(pa.id);
                              return next;
                            });
                          }}
                          className="h-3.5 w-3.5 shrink-0 accent-primary cursor-pointer disabled:opacity-30"
                          title={disableCheck ? 'Deselect one to select another' : 'Select for comparison'}
                          onClick={e => e.stopPropagation()}
                        />
                        {/* Click row to view analysis */}
                        <button
                          className="flex-1 min-w-0 flex items-center justify-between text-left"
                          onClick={() => setSelectedPastId(pa.id === selectedPastId ? null : pa.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">
                              {pa.analysis_result?.aiBrief?.executiveSummary?.slice(0, 72) ?? 'Analysis'}…
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {new Date(pa.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2 ml-3">
                            <span className={cn(
                              'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border',
                              pa.splunk_mode === 'live' ? 'text-green-400 border-green-500/30 bg-green-500/10'
                              : pa.splunk_mode === 'mcp' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
                              : 'text-muted-foreground border-border bg-secondary/30'
                            )}>
                              {pa.splunk_mode ?? 'demo'}
                            </span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}

        {!displayedAnalysis && !loading && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="relative mb-5">
              <div className="h-16 w-16 rounded-2xl border border-primary/20 bg-primary/8 flex items-center justify-center">
                <Zap className="h-8 w-8 text-primary/60" />
              </div>
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Ready to investigate</h3>
            <p className="text-sm text-muted-foreground max-w-xs text-pretty leading-relaxed mb-6">
              Click <span className="text-primary font-semibold">Analyze</span> to gather evidence, correlate deployments, and generate an AI-powered incident brief.
            </p>
            <div className="rounded-xl border border-border bg-card p-4 text-left max-w-xs w-full">
              <p className="text-[11px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-2.5">Will analyze</p>
              <ul className="space-y-2">
                {[
                  'Error log patterns from Splunk',
                  'Recent deployment events',
                  'Service dependency graph',
                  'Alert correlation timeline',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Loading: step-progress cards, advances as streamStep changes */}
        {loading && (
          <div className="space-y-2">
            {([
              { label: 'Gathering evidence from Splunk indexes…',  activeOn: ['evidence', 'streaming', 'done'] },
              { label: 'Correlating deployment events…',           activeOn: ['evidence', 'streaming', 'done'] },
              { label: 'Building service dependency graph…',       activeOn: ['streaming', 'done'] },
              { label: 'Streaming AI incident brief…',             activeOn: ['streaming', 'done'] },
            ] as { label: string; activeOn: string[] }[]).map(({ label, activeOn }, i) => {
              const active = activeOn.includes(streamStep);
              const spinning = i === 3 && streamStep === 'streaming';
              return (
                <div key={label} className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-all duration-300',
                  active ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/50 opacity-40'
                )}>
                  {spinning
                    ? <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
                    : active
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary/70" />
                      : <div className="h-4 w-4 shrink-0 rounded-full border border-border bg-secondary/30" />
                  }
                  <span className={cn('text-[12px] flex-1', active ? 'text-foreground font-medium' : 'text-muted-foreground/40')}>
                    {label}
                  </span>
                  {/* Token counter — shown while LLM is streaming */}
                  {spinning && streamTokens > 0 && (
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[10px] font-mono text-primary/70 bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                        <Coins className="h-2.5 w-2.5" />
                        ~{streamTokens.toLocaleString()} tok
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 border border-border rounded px-1.5 py-0.5">
                        ~${streamCostUsd}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live streaming brief — appears as tokens arrive */}
            {streamingBrief && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 flex items-center gap-1.5">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />AI Brief — streaming
                  </p>
                  {streamTokens > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      ~{streamTokens.toLocaleString()} tokens · ~${streamCostUsd}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap">
                  {streamingBrief}
                  <span className="inline-block w-[2px] h-[13px] bg-primary align-middle ml-[1px] animate-pulse" />
                </p>
              </div>
            )}
          </div>
        )}

        {/* Token-budget stop banner */}
        {streamStopReason && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5">
            <OctagonAlert className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-yellow-300">{streamStopReason}</p>
              <p className="text-[10px] text-yellow-400/70 mt-0.5">
                Partial result saved. Increase the token budget in{' '}
                <a href="/settings#llm-settings-section" className="underline hover:text-yellow-300">Settings</a>
                {' '}and re-analyze for a complete response.
              </p>
            </div>
          </div>
        )}

        {/* Cache badge — shown when result came from DB cache */}
        {analysis?.fromCache && !loading && !selectedPastId && (
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              ⚡ Loaded from cache — analysis ran previously
            </span>
            <button
              onClick={() => onAnalyze(true)}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Re-analyze →
            </button>
          </div>
        )}

        {/* Past-analysis view indicator */}
        {selectedPastId && !loading && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-[11px] text-primary/80 flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Viewing a past analysis
            </span>
            <button
              onClick={() => setSelectedPastId(null)}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Back to current →
            </button>
          </div>
        )}

        {displayedAnalysis && !loading && (
          <AnalysisDisplay
            analysis={displayedAnalysis as FullAnalysis}
            incidentId={incident.id}
            incidentService={incident.service}
          />
        )}
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground/70 shrink-0" />
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('text-[12px] text-foreground font-semibold truncate', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function AnalysisDisplay({ analysis, incidentId, incidentService }: {
  analysis: AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace };
  incidentId: string;
  incidentService: string;
}) {
  return (
    <div className="space-y-3">
      {/* Dual-layer runtime source row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Evidence badge */}
          <AnalysisSourceBadge splunkMode={analysis.evidenceSource ?? analysis.splunkMode} size="md" />
          {/* Reasoning badge */}
          <ReasoningSourceBadge
            reasoningSource={analysis.reasoningSource ?? analysis.runtimeTrace?.reasoningSource ?? analysis.runtimeTrace?.reasoningProvider}
            size="md"
          />
        </div>
        {analysis.runtimeTrace && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors underline underline-offset-2"
            onClick={() => downloadDiagnosticReport(analysis.runtimeTrace!, incidentId)}
            title="Download runtime diagnostic JSON"
          >
            <span className="flex items-center gap-1"><FileJson className="h-3 w-3" />Download diagnostic report</span>
          </button>
        )}
      </div>

      {/* Demo watermark */}
      {(!analysis.evidenceSource && (!analysis.splunkMode || analysis.splunkMode === 'demo')) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-600/40 bg-amber-950/20 px-3 py-2">
          <Database className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-300 font-medium">DEMO DATA — analysis based on sample data, not live Splunk</span>
        </div>
      )}
      {analysis.evidenceSource === 'demo' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-600/40 bg-amber-950/20 px-3 py-2">
          <Database className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-300 font-medium">DEMO DATA — analysis based on sample data, not live Splunk</span>
        </div>
      )}

      {/* Collapsible Runtime Diagnostics panel */}
      {analysis.runtimeTrace && (
        <RuntimeEvidencePanel trace={{
          ...analysis.runtimeTrace,
          evidenceSource: analysis.evidenceSource ?? analysis.runtimeTrace.evidenceSource,
          reasoningSource: analysis.reasoningSource ?? analysis.runtimeTrace.reasoningSource,
          usedLiveSplunk: analysis.usedLiveSplunk ?? analysis.runtimeTrace.usedLiveSplunk,
          usedSplunkHostedModel: analysis.usedSplunkHostedModel ?? analysis.runtimeTrace.usedSplunkHostedModel,
        }} />
      )}
      {/* AI Brief */}
      {analysis.aiBrief && (
        <Section title="AI Incident Brief" icon={Zap} defaultOpen>
          <div className="space-y-3">
            {/* Dual-layer reasoning attribution banner */}
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5 flex-wrap">
              <Brain className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground">
                Evidence:&nbsp;
                <span className={cn(
                  'font-semibold',
                  (analysis.evidenceSource ?? analysis.splunkMode) === 'live-mcp' ? 'text-emerald-400' :
                  (analysis.evidenceSource ?? analysis.splunkMode) === 'live-rest' ? 'text-blue-400' : 'text-amber-400',
                )}>
                  {(analysis.evidenceSource ?? analysis.splunkMode) === 'live-mcp' ? 'Live Splunk MCP' :
                   (analysis.evidenceSource ?? analysis.splunkMode) === 'live-rest' ? 'Live Splunk REST' : 'Demo data'}
                </span>
                &nbsp;·&nbsp;Reasoning:&nbsp;
                <span className={cn(
                  'font-semibold',
                  (analysis.reasoningSource ?? analysis.runtimeTrace?.reasoningSource ?? analysis.runtimeTrace?.reasoningProvider) === 'splunk-hosted-model'
                    ? 'text-orange-400' : 'text-blue-400',
                )}>
                  {(analysis.reasoningSource ?? analysis.runtimeTrace?.reasoningSource ?? analysis.runtimeTrace?.reasoningProvider) === 'splunk-hosted-model'
                    ? 'Splunk Hosted Model'
                    : (analysis.reasoningSource ?? analysis.runtimeTrace?.reasoningProvider ?? 'Gemini')}
                </span>
              </span>
            </div>
            {analysis.aiBrief.executiveSummary && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Executive Summary</p>
                <p className="text-sm text-foreground leading-relaxed text-pretty">{analysis.aiBrief.executiveSummary}</p>
              </div>
            )}
            {analysis.aiBrief.technicalFindings && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Technical Findings</p>
                <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{analysis.aiBrief.technicalFindings}</p>
              </div>
            )}
            {analysis.aiBrief.immediateRisk && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Immediate Risk</p>
                <p className="text-sm text-red-300">{analysis.aiBrief.immediateRisk}</p>
              </div>
            )}
            {analysis.aiBrief.confidenceStatement && (
              <p className="text-xs text-muted-foreground/70 italic text-pretty">{analysis.aiBrief.confidenceStatement}</p>
            )}
          </div>
        </Section>
      )}

      {/* Ranked Hypotheses */}
      <Section title={`Root Cause Hypotheses (${analysis.hypotheses.length})`} icon={AlertTriangle} defaultOpen>
        <div className="space-y-3">
          {analysis.hypotheses.map((h, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="shrink-0 h-5 w-5 rounded-full border border-border bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground mb-0.5 text-balance">{h.title}</p>
                  <span className={cn('text-[10px] font-mono uppercase tracking-wider', CATEGORY_COLORS[h.category] ?? 'text-muted-foreground')}>
                    {h.category}
                  </span>
                </div>
              </div>
              <ConfidenceBar confidence={h.confidence} className="mb-3" />
              <ul className="space-y-1">
                {h.evidence.map((e, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
                    <span className="text-pretty">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Blast Radius */}
      <Section title="Blast Radius" icon={BarChart2} defaultOpen>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Services Affected</p>
            <p className="text-2xl font-bold text-red-400">{analysis.blastRadius.services.length}</p>
          </div>
          {analysis.blastRadius.estimated_users_affected && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Users Impacted</p>
              <p className="text-2xl font-bold text-orange-400">{analysis.blastRadius.estimated_users_affected.toLocaleString()}</p>
            </div>
          )}
        </div>
        {analysis.blastRadius.estimated_revenue_impact && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 mb-3">
            <p className="text-[10px] text-red-400 uppercase tracking-wider mb-0.5">Revenue Impact</p>
            <p className="text-sm font-bold text-red-300">{analysis.blastRadius.estimated_revenue_impact}</p>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Affected Services</p>
          {analysis.blastRadius.services.map(svc => (
            <div key={svc} className="flex items-center gap-2 rounded border border-border bg-secondary/20 px-3 py-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-foreground">{svc}</span>
            </div>
          ))}
        </div>
        {analysis.blastRadius.endpoints.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Affected Endpoints</p>
            {analysis.blastRadius.endpoints.map(ep => (
              <div key={ep} className="flex items-center gap-2 rounded border border-border bg-secondary/20 px-3 py-1.5">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono text-muted-foreground">{ep}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Timeline */}
      <Section title="Event Timeline" icon={Clock} defaultOpen>
        <div className="relative space-y-0">
          {analysis.timeline.map((event, i) => (
            <div key={i} className="flex gap-3 relative">
              <div className="flex flex-col items-center">
                <div className={cn('h-3 w-3 rounded-full border-2 border-background shrink-0 mt-1', TIMELINE_COLORS[event.type] ?? 'bg-muted-foreground')} />
                {i < analysis.timeline.length - 1 && <div className="w-0.5 flex-1 bg-border min-h-[20px]" />}
              </div>
              <div className="pb-4 min-w-0">
                <p className="text-[10px] font-mono text-muted-foreground mb-0.5">{formatTs(event.timestamp)}</p>
                <p className="text-xs text-foreground text-pretty">{event.event}</p>
                {event.service && <span className="text-[10px] font-mono text-muted-foreground/60">{event.service}</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Recommended Actions */}
      <Section title="Recommended Actions" icon={CheckCircle2}>
        <ol className="space-y-2">
          {analysis.recommendedActions.map((action, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
              <span className="shrink-0 h-5 w-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary mt-0.5">{i + 1}</span>
              <span className="text-xs text-foreground text-pretty">{action}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Top Errors */}
      {analysis.topErrors.length > 0 && (
        <Section title={`Error Patterns (${analysis.topErrors.length})`} icon={AlertTriangle} defaultOpen={false}>
          <div className="space-y-2">
            {analysis.topErrors.map((err, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-[10px] font-bold uppercase', err.severity === 'critical' ? 'text-red-400' : err.severity === 'error' ? 'text-orange-400' : 'text-yellow-400')}>
                    {err.severity}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">{err.count}×</span>
                </div>
                <p className="text-xs font-mono text-foreground text-pretty mb-1">{err.pattern}</p>
                <p className="text-[10px] font-mono text-muted-foreground/70 break-words">{err.sample}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Deployment Events */}
      {analysis.deployEvents.length > 0 && (
        <Section title={`Deployment Events (${analysis.deployEvents.length})`} icon={GitBranch} defaultOpen={false}>
          <div className="space-y-2">
            {analysis.deployEvents.map((dep, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-orange-400">{dep.version}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTs(dep.timestamp)}</span>
                  <span className={cn('text-[10px] font-mono uppercase', dep.status === 'success' ? 'text-green-400' : 'text-red-400')}>{dep.status}</span>
                </div>
                <p className="text-xs text-muted-foreground text-pretty">{dep.change_summary}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
                  <span>{dep.environment}</span>
                  <span>by {dep.deployed_by}</span>
                  <span>#{dep.commit}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Open Questions */}
      {analysis.openQuestions.length > 0 && (
        <Section title="Open Questions" icon={Circle} defaultOpen={false}>
          <ul className="space-y-2">
            {analysis.openQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0 mt-1.5" />
                <span className="text-pretty">{q}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Runbook Panel (PagerDuty Response Plays) */}
      <RunbookPanel service={analysis.metadata?.name ?? incidentService} incidentId={incidentId} />

      {/* Splunk Integration Info */}
      <div className="rounded-lg border border-border bg-secondary/10 p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> Splunk Integration Layer
        </p>
        <p className="text-[10px] text-muted-foreground/70 mb-2">Running in <span className="text-yellow-400 font-mono">DEMO MODE</span>. Sample data via mock Splunk abstraction layer.</p>
        <p className="text-[10px] text-muted-foreground/60 font-medium mb-1.5">SPL queries executed:</p>
        {[
          `index=main service=${analysis.metadata?.name ?? 'checkout-service'} level=ERROR | stats count by message | sort -count | head 20`,
          `index=deploys service=${analysis.metadata?.name ?? 'checkout-service'} | sort -timestamp | head 5`,
        ].map((q, i) => (
          <p key={i} className="text-[10px] font-mono text-muted-foreground/50 bg-background rounded px-2 py-1 mb-1 break-all">{q}</p>
        ))}
      </div>
    </div>
  );
}
