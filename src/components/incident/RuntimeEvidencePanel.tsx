import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Terminal, Database, Cpu, Rows3, BrainCircuit, Server, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RuntimeTrace {
  mode: 'live-mcp' | 'live-rest' | 'demo' | 'error-mcp' | 'error-rest';
  endpoint: string;
  toolUsed?: string;
  queriesIssued: string[];
  rowCounts: { errors: number; deploys: number; meta: number };
  timestamp: string;
  errorMessage?: string;
  reasoningProvider: string;

  // ── Hybrid architecture transparency fields ────────────────────────────────
  /** Canonical evidence source label */
  evidenceSource?: 'live-mcp' | 'live-rest' | 'demo';
  /** Canonical reasoning source label */
  reasoningSource?: 'splunk-hosted-model' | 'gemini' | 'openai' | 'anthropic' | 'grok' | 'deepseek' | 'unknown';
  /** True when evidence came from a live Splunk instance */
  usedLiveSplunk?: boolean;
  /** True when reasoning used a Splunk Hosted Model endpoint */
  usedSplunkHostedModel?: boolean;
  /** Hosted model endpoint URL (when usedSplunkHostedModel is true) */
  hostedModelEndpoint?: string;
  /** Hosted model name / deployment ID */
  hostedModelName?: string;
}

export interface RuntimeEvidencePanelProps {
  trace: RuntimeTrace;
  className?: string;
  defaultOpen?: boolean;
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0 w-36">{label}</span>
      <span className={cn('text-[11px] text-foreground break-all', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

export function RuntimeEvidencePanel({ trace, className, defaultOpen = false }: RuntimeEvidencePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isLive  = trace.mode === 'live-mcp' || trace.mode === 'live-rest';
  const isError = trace.mode === 'error-mcp' || trace.mode === 'error-rest';
  const isDemo  = trace.mode === 'demo';

  const modeLabel = {
    'live-mcp':   '✅ Live · Splunk MCP',
    'live-rest':  '✅ Live · Splunk REST',
    'demo':       '📦 Demo (embedded sample data)',
    'error-mcp':  '❌ Error · MCP failed',
    'error-rest': '❌ Error · REST failed',
  }[trace.mode] ?? trace.mode;

  const totalRows = trace.rowCounts.errors + trace.rowCounts.deploys + trace.rowCounts.meta;

  // Derive canonical reasoning label
  const resolvedReasoning = trace.reasoningSource
    ?? (trace.usedSplunkHostedModel ? 'splunk-hosted-model' : trace.reasoningProvider ?? 'unknown');

  const reasoningLabel =
    resolvedReasoning === 'splunk-hosted-model' ? '🧠 Splunk Hosted Model (live inference)' :
    resolvedReasoning === 'gemini'               ? '🤖 Gemini (gateway)' :
    resolvedReasoning === 'openai'               ? '🤖 OpenAI' :
    resolvedReasoning === 'anthropic'            ? '🤖 Anthropic Claude' :
    resolvedReasoning === 'grok'                 ? '🤖 Grok' :
    resolvedReasoning === 'deepseek'             ? '🤖 DeepSeek' :
    `🤖 ${resolvedReasoning}`;

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary/40 hover:bg-secondary/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isLive  && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
          {isError && <XCircle      className="h-3.5 w-3.5 text-red-400    shrink-0" />}
          {isDemo  && <Database     className="h-3.5 w-3.5 text-amber-400  shrink-0" />}
          <span className="text-xs font-semibold text-foreground">Runtime Diagnostics</span>
          <span className={cn(
            'text-[10px] font-mono px-1.5 py-0.5 rounded border',
            isLive  ? 'bg-emerald-950/40 border-emerald-700/40 text-emerald-300' :
            isError ? 'bg-red-950/40    border-red-700/40    text-red-300'    :
                      'bg-amber-950/30  border-amber-700/40  text-amber-300',
          )}>
            {trace.mode}
          </span>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 py-2 bg-background/60 space-y-0">
          {/* ── Evidence Layer ─────────────────────────────────────────────── */}
          <div className="py-1.5 border-b border-border/40">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Evidence Layer</p>
            <Row label="Status"     value={modeLabel} />
            <Row label="Mode"       value={<span className="font-mono">{trace.mode}</span>} />
            <Row label="REST/MCP endpoint" value={
              trace.endpoint && trace.endpoint !== 'embedded-demo-data'
                ? <span className="font-mono break-all">{trace.endpoint}</span>
                : <span className="text-muted-foreground italic">embedded demo data</span>
            } />
            {trace.toolUsed && (
              <Row label="MCP Tool" value={<span className="font-mono flex items-center gap-1"><Cpu className="h-3 w-3 text-purple-400" />{trace.toolUsed}</span>} />
            )}
            <Row label="Row counts" value={
              <span className="flex items-center gap-1 font-mono">
                <Rows3 className="h-3 w-3 text-muted-foreground" />
                {totalRows} rows ({trace.rowCounts.errors} errors, {trace.rowCounts.deploys} deploys, {trace.rowCounts.meta} meta)
              </span>
            } />
            <Row label="Timestamp"  value={
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3 text-muted-foreground" />
                {new Date(trace.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            } />
            <Row label="Live Splunk" value={
              trace.usedLiveSplunk === true
                ? <span className="text-emerald-400 font-mono">YES ✅</span>
                : trace.usedLiveSplunk === false
                  ? <span className="text-amber-400 font-mono">NO (demo)</span>
                  : <span className="text-muted-foreground font-mono">—</span>
            } />
          </div>

          {/* ── Reasoning Layer ────────────────────────────────────────────── */}
          <div className="py-1.5 border-b border-border/40">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1 mt-1">Reasoning Layer</p>
            <Row label="Provider" value={
              <span className="font-mono flex items-center gap-1">
                {trace.usedSplunkHostedModel
                  ? <FlaskConical className="h-3 w-3 text-orange-400" />
                  : <BrainCircuit className="h-3 w-3 text-blue-400" />
                }
                {reasoningLabel}
              </span>
            } />
            {trace.hostedModelEndpoint && (
              <Row label="Hosted endpoint" value={<span className="font-mono break-all">{trace.hostedModelEndpoint}</span>} />
            )}
            {trace.hostedModelName && (
              <Row label="Model / deployment" value={<span className="font-mono">{trace.hostedModelName}</span>} />
            )}
            {!trace.usedSplunkHostedModel && (
              <Row label="Gateway key" value={<span className="text-muted-foreground italic">platform-injected</span>} />
            )}
            <Row label="Splunk Hosted Model" value={
              trace.usedSplunkHostedModel === true
                ? <span className="text-orange-400 font-mono">YES ✅</span>
                : <span className="text-muted-foreground font-mono">NO (using {resolvedReasoning})</span>
            } />
            <Row label="Reasoning" value={
              <span className="font-mono flex items-center gap-1">
                <Terminal className="h-3 w-3 text-blue-400" />{trace.reasoningProvider ?? resolvedReasoning}
              </span>
            } />
          </div>

          {/* ── SPL queries ────────────────────────────────────────────────── */}
          {trace.queriesIssued.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground mb-1.5">SPL queries issued</p>
              <div className="space-y-1.5">
                {trace.queriesIssued.map((q, i) => (
                  <div key={i} className="font-mono text-[10px] text-foreground/80 bg-muted/50 rounded px-2 py-1.5 break-all">
                    {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Error detail ───────────────────────────────────────────────── */}
          {trace.errorMessage && (
            <div className="mt-2 rounded border border-red-700/40 bg-red-950/30 px-2.5 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Error detail</p>
              <p className="text-[11px] text-red-300 font-mono break-all">{trace.errorMessage}</p>
            </div>
          )}

          {/* ── Status summary ─────────────────────────────────────────────── */}
          {isLive && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Live Splunk evidence verified — analysis used real Splunk data
            </div>
          )}
          {isDemo && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
              <Database className="h-3 w-3 shrink-0" />
              Demo mode — no Splunk credentials configured or demo explicitly selected
            </div>
          )}
          {trace.usedSplunkHostedModel && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-400">
              <Server className="h-3 w-3 shrink-0" />
              Reasoning used a real Splunk Hosted Model endpoint — not a simulated response
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Standalone download helper — exports the trace as a JSON diagnostic report */
export function downloadDiagnosticReport(trace: RuntimeTrace, incidentId: string) {
  const report = {
    generatedAt:  new Date().toISOString(),
    incidentId,
    runtimeTrace: trace,
    _note: 'SentinelOps runtime diagnostic report — attach to Devpost submission as judge evidence',
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sentinelops-runtime-${incidentId}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
