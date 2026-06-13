import { useRef, useCallback, useState } from 'react';
import { diffWords } from 'diff';
import type { AnalysisResult } from '@/types/types';
import { ArrowLeft, GitCompare, Minus, Plus, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FullAnalysis = AnalysisResult & { aiBrief?: Record<string, string> };

interface PastEntry {
  id: string;
  created_at: string;
  splunk_mode: string;
  analysis_result: FullAnalysis;
}

interface AnalysisDiffProps {
  left: PastEntry;
  right: PastEntry;
  incidentTitle?: string;
  alertEmail?: string;
  onBack: () => void;
}

/** Build a plain-text email body summarising the diff */
function buildEmailBody(
  incidentTitle: string,
  left: PastEntry,
  right: PastEntry,
  leftTexts: Record<string, string>,
  rightTexts: Record<string, string>,
  changedSections: { key: string; label: string }[],
): string {
  const lines: string[] = [
    `SentinelOps — Analysis Comparison Report`,
    `==========================================`,
    ``,
    `Incident: ${incidentTitle}`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `OLDER analysis: ${new Date(left.created_at).toLocaleString()}  [${left.splunk_mode ?? 'demo'}]`,
    `NEWER analysis: ${new Date(right.created_at).toLocaleString()}  [${right.splunk_mode ?? 'demo'}]`,
    ``,
    `${changedSections.length} section(s) changed out of ${DIFF_SECTIONS.length} total.`,
    ``,
  ];

  changedSections.forEach(({ label, key }) => {
    const l = leftTexts[key] ?? '(empty)';
    const r = rightTexts[key] ?? '(empty)';
    lines.push(`--- ${label} (OLDER) ---`);
    lines.push(l);
    lines.push('');
    lines.push(`+++ ${label} (NEWER) +++`);
    lines.push(r);
    lines.push('');
    lines.push('──────────────────────────────────────────');
    lines.push('');
  });

  lines.push('-- SentinelOps Agentic AI Commander');
  return lines.join('\n');
}
function DiffText({ a, b }: { a: string; b: string }) {
  const changes = diffWords(a, b);
  return (
    <span className="text-xs leading-relaxed">
      {changes.map((part, i) => {
        if (part.added) {
          return (
            <mark key={i} className="bg-green-500/20 text-green-300 rounded-[2px] px-[1px] not-italic">
              {part.value}
            </mark>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className="bg-red-500/15 text-red-400 line-through decoration-red-500/60 rounded-[2px] px-[1px]">
              {part.value}
            </del>
          );
        }
        return <span key={i} className="text-foreground/80">{part.value}</span>;
      })}
    </span>
  );
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function extractTexts(a: FullAnalysis): Record<string, string> {
  return {
    executiveSummary:     a.aiBrief?.executiveSummary ?? '',
    technicalFindings:    a.aiBrief?.technicalFindings ?? '',
    immediateRisk:        a.aiBrief?.immediateRisk ?? '',
    hypotheses:           a.hypotheses.map((h, i) =>
      `${i + 1}. [${h.category}] ${h.title} (${Math.round(h.confidence * 100)}%)\n${h.evidence.join('; ')}`
    ).join('\n\n'),
    recommendedActions:   a.recommendedActions.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    openQuestions:        a.openQuestions.join('\n'),
    timeline:             a.timeline.map(t =>
      `[${t.type.toUpperCase()}] ${t.event} — ${t.timestamp}${t.service ? ` (${t.service})` : ''}`
    ).join('\n'),
    blastRadiusServices:  a.blastRadius.services.join(', '),
    blastRadiusEndpoints: a.blastRadius.endpoints.join(', '),
    topErrors:            a.topErrors.map(e => `[${e.severity}] ${e.pattern} (×${e.count})`).join('\n'),
    deployEvents:         a.deployEvents.map(d =>
      `${d.version} — ${d.status} by ${d.deployed_by} @ ${d.timestamp}: ${d.change_summary}`
    ).join('\n'),
  };
}

const DIFF_SECTIONS: { key: string; label: string }[] = [
  { key: 'executiveSummary',     label: 'Executive Summary' },
  { key: 'technicalFindings',    label: 'Technical Findings' },
  { key: 'immediateRisk',        label: 'Immediate Risk' },
  { key: 'hypotheses',           label: 'Root Cause Hypotheses' },
  { key: 'recommendedActions',   label: 'Recommended Actions' },
  { key: 'openQuestions',        label: 'Open Questions' },
  { key: 'timeline',             label: 'Event Timeline' },
  { key: 'blastRadiusServices',  label: 'Blast Radius — Services' },
  { key: 'blastRadiusEndpoints', label: 'Blast Radius — Endpoints' },
  { key: 'topErrors',            label: 'Error Patterns' },
  { key: 'deployEvents',         label: 'Deployment Events' },
];

export function AnalysisDiff({ left, right, incidentTitle = 'Incident', alertEmail = '', onBack }: AnalysisDiffProps) {
  const leftTexts  = extractTexts(left.analysis_result);
  const rightTexts = extractTexts(right.analysis_result);

  // Two separate scroll refs for synchronized scrolling
  const leftScrollRef  = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  // Email prompt state
  const [emailInput, setEmailInput] = useState(alertEmail);
  const [showEmailInput, setShowEmailInput] = useState(false);

  const handleLeftScroll = useCallback(() => {
    if (syncing.current || !leftScrollRef.current || !rightScrollRef.current) return;
    syncing.current = true;
    const { scrollTop, scrollHeight, clientHeight } = leftScrollRef.current;
    const pct = scrollHeight - clientHeight > 0 ? scrollTop / (scrollHeight - clientHeight) : 0;
    rightScrollRef.current.scrollTop = pct * (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const handleRightScroll = useCallback(() => {
    if (syncing.current || !leftScrollRef.current || !rightScrollRef.current) return;
    syncing.current = true;
    const { scrollTop, scrollHeight, clientHeight } = rightScrollRef.current;
    const pct = scrollHeight - clientHeight > 0 ? scrollTop / (scrollHeight - clientHeight) : 0;
    leftScrollRef.current.scrollTop = pct * (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const changedCount = DIFF_SECTIONS.filter(
    s => (leftTexts[s.key] || rightTexts[s.key]) && leftTexts[s.key] !== rightTexts[s.key]
  ).length;

  const changedSections = DIFF_SECTIONS.filter(
    s => (leftTexts[s.key] || rightTexts[s.key]) && leftTexts[s.key] !== rightTexts[s.key]
  );

  const activeSections = DIFF_SECTIONS.filter(s => leftTexts[s.key] || rightTexts[s.key]);

  const handleSendEmail = () => {
    const to = emailInput.trim();
    if (!to) { setShowEmailInput(true); return; }
    const subject = encodeURIComponent(`[SentinelOps] Analysis Comparison: ${incidentTitle}`);
    const body = encodeURIComponent(
      buildEmailBody(incidentTitle, left, right, leftTexts, rightTexts, changedSections)
    );
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
    setShowEmailInput(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-card/80 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-foreground hover:bg-secondary" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GitCompare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">Analysis Diff</span>
        </div>
        <span className={cn(
          'shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border',
          changedCount > 0
            ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
            : 'text-muted-foreground border-border bg-secondary/30'
        )}>
          {changedCount === 0 ? 'identical' : `${changedCount} changed`}
        </span>
        {/* Email report button */}
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 text-xs font-semibold shrink-0"
          onClick={() => setShowEmailInput(v => !v)}
          title="Email comparison report to on-call team"
        >
          <Mail className="h-3.5 w-3.5" />Send Report
        </Button>
      </div>

      {/* Inline email input — shown when Send Report is clicked with no pre-configured email */}
      {showEmailInput && (
        <div className="shrink-0 border-b border-border bg-secondary/30 px-4 py-2.5 flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendEmail(); if (e.key === 'Escape') setShowEmailInput(false); }}
            placeholder="oncall@yourcompany.com"
            autoFocus
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
          />
          <Button
            size="sm"
            className="h-7 gap-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            onClick={handleSendEmail}
          >
            Open in Mail Client
          </Button>
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setShowEmailInput(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Column header strip */}
      <div className="shrink-0 grid grid-cols-2 divide-x divide-border border-b border-border">
        {[
          { entry: left,  side: 'older', accent: 'text-red-400',   bg: 'bg-red-500/5'   },
          { entry: right, side: 'newer', accent: 'text-green-400', bg: 'bg-green-500/5' },
        ].map(({ entry, side, accent, bg }) => (
          <div key={side} className={cn('px-4 py-3', bg)}>
            <p className={cn('text-[9px] font-semibold uppercase tracking-widest mb-1', accent)}>{side}</p>
            <p className="text-xs font-mono text-foreground leading-none">{fmtTs(entry.created_at)}</p>
            <span className={cn(
              'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border mt-1.5 inline-block',
              entry.splunk_mode === 'live' ? 'text-green-400 border-green-500/30 bg-green-500/10'
              : entry.splunk_mode === 'mcp'  ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
              : 'text-muted-foreground border-border bg-secondary/30'
            )}>
              {entry.splunk_mode ?? 'demo'}
            </span>
          </div>
        ))}
      </div>

      {/* Diff body — two synchronized scroll columns */}
      <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border overflow-hidden">
        {/* Left scroll column */}
        <div
          ref={leftScrollRef}
          onScroll={handleLeftScroll}
          className="overflow-y-auto min-h-0 bg-red-500/5"
        >
          <div className="p-3 space-y-3">
            {activeSections.map(({ key, label }) => {
              const l = leftTexts[key] ?? '';
              const r = rightTexts[key] ?? '';
              const changed = l !== r;
              return (
                <div key={key} className={cn(
                  'rounded-lg border overflow-hidden',
                  changed ? 'border-red-500/25' : 'border-border'
                )}>
                  <p className={cn(
                    'text-[9px] font-semibold uppercase tracking-wider px-3 py-1.5 border-b',
                    changed
                      ? 'text-red-400/80 bg-red-500/10 border-red-500/20 flex items-center gap-1'
                      : 'text-muted-foreground bg-secondary/30 border-border'
                  )}>
                    {changed && <Minus className="h-2.5 w-2.5 shrink-0" />}
                    {label}
                  </p>
                  <div className="px-3 py-2.5">
                    {l
                      ? <DiffText a={l} b={r} />
                      : <span className="text-[11px] text-muted-foreground/40 italic">— not present —</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right scroll column */}
        <div
          ref={rightScrollRef}
          onScroll={handleRightScroll}
          className="overflow-y-auto min-h-0 bg-green-500/5"
        >
          <div className="p-3 space-y-3">
            {activeSections.map(({ key, label }) => {
              const l = leftTexts[key] ?? '';
              const r = rightTexts[key] ?? '';
              const changed = l !== r;
              return (
                <div key={key} className={cn(
                  'rounded-lg border overflow-hidden',
                  changed ? 'border-green-500/25' : 'border-border'
                )}>
                  <p className={cn(
                    'text-[9px] font-semibold uppercase tracking-wider px-3 py-1.5 border-b',
                    changed
                      ? 'text-green-400/80 bg-green-500/10 border-green-500/20 flex items-center gap-1'
                      : 'text-muted-foreground bg-secondary/30 border-border'
                  )}>
                    {changed && <Plus className="h-2.5 w-2.5 shrink-0" />}
                    {label}
                  </p>
                  <div className="px-3 py-2.5">
                    {r
                      ? <DiffText a={l} b={r} />
                      : <span className="text-[11px] text-muted-foreground/40 italic">— not present —</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

