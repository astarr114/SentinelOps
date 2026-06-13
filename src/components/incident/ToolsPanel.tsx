import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SplAutocomplete } from '@/components/incident/SplAutocomplete';
import { SplHighlight } from '@/components/incident/SplHighlight';
import { toast } from 'sonner';
import { useSplunk } from '@/contexts/SplunkContext';
import { useLlm } from '@/contexts/LlmContext';
import { supabase } from '@/db/supabase';
import { validateSpl, type SplValidationError } from '@/lib/splValidator';
import {
  Search, Globe, ScanText, BookOpen, BarChart2, Presentation,
  Loader2, ExternalLink, ChevronDown, ChevronUp, Upload, Cpu,
  Sparkles, History, Trash2, RotateCcw, Share2, Download, Info,
  GitCompare, Bookmark, BookmarkCheck, Bell, Play,
  CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { createParser } from 'eventsource-parser';
import type { AnalysisResult, SplSavedQuery } from '@/types/types';
import { SavedQueriesPanel, SaveQueryDialog } from '@/components/incident/SavedQueriesPanel';
import { SplunkAlertsPanel } from '@/components/incident/SplunkAlertsPanel';

interface SplQueryHistoryItem {
  id: string;
  query_text: string;
  generated_spl: string;
  service_context: string | null;
  incident_id: string | null;
  created_at: string;
}

type Tool = 'web-search' | 'ai-search' | 'ocr' | 'web-reader' | 'data-viz' | 'nl-spl' | 'export' | 'splunk-alerts';

function ToolTab({ id, icon: Icon, label, active, onClick }: {
  id: Tool; icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors shrink-0',
        active ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent'
      )}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

// ── Web Search Tool ──────────────────────────────────────────────────────────
function WebSearchTool() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; url: string; snippet: string; displayUrl: string }>>([]);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const { data, error } = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query, count: 5 }),
        }
      ).then(r => r.json()).then(d => ({ data: d, error: null })).catch(e => ({ data: null, error: e }));

      if (error || !data) throw error ?? new Error('No response');
      setResults(data.webPages?.value ?? data.results ?? []);
    } catch (err) {
      toast.error('Web search failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          className="bg-input border-border text-base placeholder:text-muted-foreground/50 flex-1"
          placeholder="Search incident patterns, CVEs, runbooks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <Button size="sm" onClick={search} disabled={loading || !query.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
              className="block rounded-lg border border-border bg-secondary/20 p-3 hover:border-border/80 hover:bg-secondary transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground group-hover:text-primary text-balance">{r.name}</p>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <p className="text-[10px] text-muted-foreground/70 font-mono truncate mt-0.5">{r.displayUrl}</p>
              <p className="text-xs text-muted-foreground mt-1 text-pretty line-clamp-2">{r.snippet}</p>
            </a>
          ))}
        </div>
      )}
      {!loading && results.length === 0 && query && (
        <p className="text-xs text-muted-foreground text-center py-4">No results found. Try a different query.</p>
      )}
    </div>
  );
}

// ── AI Search Tool ───────────────────────────────────────────────────────────
function AiSearchTool() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const search = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer('');
    setError('');
    abortRef.current = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: query }] }] }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasContent = false;

      const parser = createParser({
        onEvent: (event) => {
          if (!event.data) return;
          try {
            const frame = JSON.parse(event.data);
            const text = frame?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { setAnswer(prev => prev + text); hasContent = true; }
          } catch { /* skip malformed SSE frame */ }
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data:')) parser.feed(line + '\n');
        }
      }

      if (!hasContent) setError('No response received. The AI service may be temporarily unavailable.');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg.includes('fetch') ? 'Could not reach AI service. Check network connectivity.' : msg.slice(0, 200));
      toast.error('AI search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          className="bg-input border-border text-base placeholder:text-muted-foreground/50 flex-1"
          placeholder="Ask AI: known issues with HikariCP pool starvation..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <Button size="sm" onClick={search} disabled={loading || !query.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {(answer || loading || error) && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          {loading && !answer && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Searching the web...
            </div>
          )}
          {error && !answer && <p className="text-xs text-destructive">{error}</p>}
          {answer && <p className="text-xs text-foreground text-pretty leading-relaxed whitespace-pre-wrap">{answer}</p>}
        </div>
      )}
    </div>
  );
}

// ── OCR Tool ─────────────────────────────────────────────────────────────────
function OcrTool() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const processUrl = async () => {
    if (!imageUrl.trim()) return;
    setLoading(true);
    setResult('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error(`OCR service error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.text || '(No text found in image)');
    } catch (err) {
      toast.error('OCR extraction failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setResult('');
    try {
      // Wrap FileReader in a Promise so async/await and error handling work correctly
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: base64 }),
      });
      if (!res.ok) throw new Error(`OCR service error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.text || '(No text found in image)');
    } catch (err) {
      toast.error('File processing failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border-2 border-dashed border-border bg-secondary/10 p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-secondary/20 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) processFile(file); }}
      >
        <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Drop screenshot or click to upload</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, GIF supported</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground">or paste URL</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-2">
        <Input className="bg-input border-border text-base flex-1 placeholder:text-muted-foreground/50" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
        <Button size="sm" onClick={processUrl} disabled={loading || !imageUrl.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {result && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Extracted Text</p>
          <Textarea readOnly value={result} rows={6} className="bg-input border-border font-mono text-xs resize-none" />
        </div>
      )}
    </div>
  );
}

// ── Web Reader Tool ───────────────────────────────────────────────────────────
function WebReaderTool() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);

  const fetch_ = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setContent('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-reader`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, returnFormat: 'markdown' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setContent(data.content ?? '');
      setExpanded(true);
    } catch (err) {
      toast.error('Web reader failed. Check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input className="bg-input border-border text-base flex-1 placeholder:text-muted-foreground/50" placeholder="https://runbook.example.com/checkout-service..." value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetch_()} />
        <Button size="sm" onClick={fetch_} disabled={loading || !url.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {content && (
        <div className="rounded-lg border border-border bg-secondary/20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Page Content (Markdown)</p>
            <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          {expanded && (
            <div className="max-h-64 overflow-y-auto p-3">
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">{content.slice(0, 3000)}{content.length > 3000 && '\n... (truncated)'}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Data Viz Tool ─────────────────────────────────────────────────────────────
const DEMO_DATA = {
  latency: [
    { t: '10:30', p99: 280, p50: 140 },
    { t: '10:33', p99: 295, p50: 145 },
    { t: '10:36', p99: 310, p50: 148 },
    { t: '10:37', p99: 850, p50: 420 },  // deploy
    { t: '10:39', p99: 1840, p50: 890 },
    { t: '10:42', p99: 3241, p50: 1620 }, // incident
    { t: '10:45', p99: 3510, p50: 1780 },
    { t: '10:48', p99: 3200, p50: 1650 },
    { t: '10:51', p99: 2900, p50: 1400 },
  ],
  errors: [
    { t: '10:30', rate: 0.2 },
    { t: '10:33', rate: 0.3 },
    { t: '10:36', rate: 0.4 },
    { t: '10:37', rate: 2.1 },
    { t: '10:39', rate: 12.4 },
    { t: '10:42', rate: 38.2 },
    { t: '10:45', rate: 41.0 },
    { t: '10:48', rate: 36.5 },
    { t: '10:51', rate: 29.8 },
  ],
};

function DataVizTool() {
  const [metric, setMetric] = useState<'latency' | 'errors'>('latency');

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['latency', 'errors'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium border transition-colors', metric === m ? 'bg-primary/20 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground bg-secondary/20')}
          >
            {m === 'latency' ? 'P99 Latency' : 'Error Rate'}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-secondary/10 p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
          {metric === 'latency' ? 'Response Latency (ms) — checkout-service' : 'HTTP 5xx Error Rate (%) — checkout-service'}
        </p>
        <div className="h-40 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DEMO_DATA[metric]} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(24,100%,58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(24,100%,58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,17%,18%)" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'hsl(215,13%,54%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215,13%,54%)' }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(216,19%,11%)', border: '1px solid hsl(214,17%,18%)', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: 'hsl(210,17%,91%)' }} itemStyle={{ color: 'hsl(24,100%,58%)' }} />
              {metric === 'latency' ? (
                <>
                  <Area type="monotone" dataKey="p99" name="P99 ms" stroke="hsl(24,100%,58%)" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="p50" name="P50 ms" stroke="hsl(214,80%,56%)" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </>
              ) : (
                <Area type="monotone" dataKey="rate" name="Error %" stroke="hsl(0,72%,51%)" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-orange-400 inline-block" />Deploy v1.8.3 at 10:37</span>
          <span className="flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-red-400 inline-block" />Incident at 10:42</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Demo data — connect Splunk metrics index for live charts</p>
      </div>
    </div>
  );
}

// ── DiffSpl: word-level token diff between two SPL strings ───────────────────
function DiffSpl({ spl, other, side }: { spl: string; other: string; side: 'left' | 'right' }) {
  // Tokenize on whitespace + pipe boundaries
  const tokenize = (s: string) =>
    s.split(/(\s+|\|)/).filter(Boolean);

  const aTokens = tokenize(side === 'left' ? spl : other);
  const bTokens = tokenize(side === 'left' ? other : spl);
  const bSet    = new Set(bTokens.map(t => t.trim().toLowerCase()));
  const aSet    = new Set(aTokens.map(t => t.trim().toLowerCase()));

  const current = tokenize(spl);
  const otherTokens = tokenize(other);
  const otherSet = new Set(otherTokens.map(t => t.trim().toLowerCase()));

  return (
    <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
      {current.map((tok, i) => {
        const normalized = tok.trim().toLowerCase();
        const isWhitespace = /^\s+$/.test(tok);
        if (isWhitespace) return <span key={i}>{tok}</span>;
        const inOther = otherSet.has(normalized);
        return (
          <span
            key={i}
            className={cn(
              inOther ? 'text-foreground/80' : side === 'left' ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'
            )}
          >
            {tok}
          </span>
        );
      })}
    </pre>
  );
}

// ── NL → SPL Tool ─────────────────────────────────────────────────────────────
interface NlSplToolProps {
  incidentId: string;
  incidentService: string;
  timeWindow: string;
  suggestedQueries?: string[];
  deepLinkQuery?: string;
  deepLinkService?: string;
}

function NlSplTool({ incidentId, incidentService, timeWindow, suggestedQueries, deepLinkQuery, deepLinkService }: NlSplToolProps) {
  const { isMcp, config } = useSplunk();
  const { activeLlm, buildFallbackChain } = useLlm();
  // Pre-fill from deep-link ?nlq= param if provided
  const [question, setQuestion]       = useState(deepLinkQuery ?? '');
  const [loading, setLoading]         = useState(false);
  const [running, setRunning]         = useState(false); // true while SPL is being executed
  const [spl, setSpl]                 = useState('');
  const [splErrors, setSplErrors]     = useState<SplValidationError[]>([]);
  const [results, setResults]         = useState<Array<Record<string, string>>>([]);
  const [explanation, setExplanation] = useState('');
  const [mcpMode, setMcpMode]         = useState<'idle' | 'live' | 'demo' | 'error'>('idle');
  const [mcpError, setMcpError]       = useState('');
  const [execPath, setExecPath]       = useState<'mcp' | 'rest' | ''>('');
  const [mcpFallbackNote, setMcpFallbackNote] = useState('');
  const [resultView, setResultView]   = useState<'table' | 'chart'>('table');

  // Query history state
  const [history, setHistory]               = useState<SplQueryHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory]       = useState(false);
  const [clearConfirm, setClearConfirm]     = useState(false);
  const [historySearch, setHistorySearch]   = useState('');
  const [splunkImporting, setSplunkImporting] = useState(false);

  // ── Scheduled auto-run state ─────────────────────────────────────────────
  const AUTO_RUN_OPTIONS = [
    { label: 'Off',     value: 0    },
    { label: '1 min',   value: 60   },
    { label: '5 min',   value: 300  },
    { label: '15 min',  value: 900  },
    { label: '30 min',  value: 1800 },
  ] as const;
  const [autoRunInterval, setAutoRunInterval] = useState<number>(0);
  const [autoRunCountdown, setAutoRunCountdown] = useState<number>(0);
  const [autoRunLastRun, setAutoRunLastRun]     = useState<string | null>(null);
  const autoRunRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start/stop the auto-run timer whenever autoRunInterval changes
  useEffect(() => {
    // Clear any existing timers
    if (autoRunRef.current)   clearInterval(autoRunRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    autoRunRef.current   = null;
    countdownRef.current = null;
    setAutoRunCountdown(0);

    if (autoRunInterval <= 0) return;

    setAutoRunCountdown(autoRunInterval);
    autoRunRef.current = setInterval(() => {
      handleRerunAll();
      setAutoRunLastRun(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setAutoRunCountdown(autoRunInterval);
    }, autoRunInterval * 1000);

    countdownRef.current = setInterval(() => {
      setAutoRunCountdown(prev => (prev > 0 ? prev - 1 : autoRunInterval));
    }, 1000);

    return () => {
      if (autoRunRef.current)   clearInterval(autoRunRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunInterval]);

  // Saved queries dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [showSaved, setShowSaved]           = useState(false);

  // Save current SPL to library
  const handleSaveQuery = async (name: string, category: string, description: string, tags: string[]) => {
    const { error } = await supabase.from('spl_saved_queries').insert({
      name, category, spl, description: description || null, tags,
    });
    if (error) throw error;
    toast.success('Query saved to library');
  };

  // Load a saved query into the input and run it
  const handleRunSavedQuery = (savedSpl: string, savedName: string) => {
    setSpl(savedSpl);
    setQuestion(savedName);
    setShowSaved(false);
    toast.info(`Loaded: ${savedName}`);
  };
  const [diffMode, setDiffMode]             = useState(false);
  const [diffItems, setDiffItems]           = useState<SplQueryHistoryItem[]>([]);
  // Replay diff: stores {original SPL from history, question} so after generate we can auto-diff
  const [replayDiff, setReplayDiff]         = useState<{ originalSpl: string; question: string } | null>(null);

  // Auto-run on deep-link once on mount
  const deepLinkRan = useRef(false);
  useEffect(() => {
    if (deepLinkQuery && !deepLinkRan.current) {
      deepLinkRan.current = true;
      // Only auto-execute if service matches or no service filter
      if (!deepLinkService || deepLinkService === incidentService) {
        handleGenerate(deepLinkQuery);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default generic suggestions (used when analysis hasn't run yet)
  const genericSuggestions = [
    `Show error rate for ${incidentService} in the last 30 minutes`,
    `Top 10 error messages from ${incidentService}`,
    `Latency percentiles for ${incidentService} over time`,
    `Deployment events near ${incidentService} in the last hour`,
    `Distinct users affected by ${incidentService} errors`,
  ];
  const chips = (suggestedQueries && suggestedQueries.length > 0) ? suggestedQueries : genericSuggestions;

  // Load history from DB
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('spl_query_history')
        .select('id, query_text, generated_spl, service_context, incident_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load query history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0) loadHistory();
  };

  const handleClearHistory = async () => {
    try {
      const { error } = await supabase.from('spl_query_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      setHistory([]);
      setClearConfirm(false);
      toast.success('Query history cleared');
    } catch {
      toast.error('Failed to clear history');
    }
  };

  const replayHistoryItem = (item: SplQueryHistoryItem) => {
    setQuestion(item.query_text);
    setShowHistory(false);
    // Store original SPL so we can auto-diff once the new one is generated
    setReplayDiff({ originalSpl: item.generated_spl, question: item.query_text });
    handleGenerate(item.query_text);
  };

  // Load the saved SPL directly into the textarea and execute it —
  // no LLM round-trip required. Collapses the history panel so results are visible.
  const runFromHistory = (item: SplQueryHistoryItem) => {
    setSpl(item.generated_spl);
    setSplErrors(item.generated_spl.trim() ? validateSpl(item.generated_spl) : []);
    setShowHistory(false);
    // Pass SPL explicitly to avoid stale-closure on the `spl` state
    handleRunSpl(item.generated_spl);
  };

  // ── Re-run All ────────────────────────────────────────────────────────────
  type RerunSummaryItem = { query: string; spl: string; status: 'ok' | 'error'; resultCount?: number; error?: string };
  const [rerunning, setRerunning]           = useState(false);
  const [rerunProgress, setRerunProgress]   = useState<{ current: number; total: number } | null>(null);
  const [rerunSummary, setRerunSummary]     = useState<RerunSummaryItem[] | null>(null);
  const [showRerunSummary, setShowRerunSummary] = useState(false);

  const handleRerunAll = async () => {
    if (history.length === 0) return;
    setRerunning(true);
    setRerunSummary(null);
    setShowRerunSummary(false);
    const items = historySearch.trim()
      ? history.filter(item => {
          const kw = historySearch.toLowerCase();
          return item.query_text.toLowerCase().includes(kw)
              || item.generated_spl.toLowerCase().includes(kw);
        })
      : history;
    const results: RerunSummaryItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setRerunProgress({ current: i + 1, total: items.length });
      setSpl(item.generated_spl);
      try {
        const { data, error } = await supabase.functions.invoke('splunk-search', {
          body: {
            spl: item.generated_spl,
            splunkHost:  config.splunkHost,
            splunkToken: config.splunkToken,
            maxResults:  50,
          },
        });
        if (error) {
          const raw = await error?.context?.text?.().catch(() => null);
          throw new Error(raw ?? error.message);
        }
        const rows = Array.isArray(data?.results) ? data.results : [];
        results.push({ query: item.query_text, spl: item.generated_spl, status: 'ok', resultCount: rows.length });
      } catch (e) {
        results.push({
          query: item.query_text,
          spl: item.generated_spl,
          status: 'error',
          error: e instanceof Error ? e.message.slice(0, 120) : 'Unknown error',
        });
      }
    }
    setRerunning(false);
    setRerunProgress(null);
    setRerunSummary(results);
    setShowRerunSummary(true);
    const ok = results.filter(r => r.status === 'ok').length;
    toast.success(`Re-run All complete — ${ok}/${results.length} succeeded`);
  };

  // Bidirectional: pull recent search jobs from Splunk → upsert into local history
  const fetchSplunkHistory = async () => {
    if (!config.splunkHost || !config.splunkToken) {
      toast.error('Splunk REST connection required', {
        description: 'Configure Splunk Host and Token in Settings to import history.',
      });
      return;
    }
    setSplunkImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('splunk-history', {
        body: { splunkHost: config.splunkHost, splunkToken: config.splunkToken, count: 50 },
      });
      if (error) {
        const msg = await error?.context?.text?.().catch(() => error.message);
        throw new Error(msg || error.message);
      }
      const jobs: Array<{ id: string; query: string; createdAt: string; status: string; resultCount: number }> =
        Array.isArray(data?.jobs) ? data.jobs : [];
      if (jobs.length === 0) {
        toast.info('No search jobs found in Splunk history.');
        return;
      }
      // Insert as history items (ignore duplicates via generated_spl uniqueness)
      let imported = 0;
      for (const job of jobs) {
        if (!job.query?.trim()) continue;
        const { error: insertErr } = await supabase.from('spl_query_history').insert({
          query_text:      `[Imported] ${job.query.slice(0, 120)}`,
          generated_spl:   job.query,
          service_context: incidentService || null,
          incident_id:     incidentId || null,
        });
        if (!insertErr) imported++;
      }
      toast.success(`Imported ${imported} queries from Splunk`, {
        description: `${jobs.length} jobs found — ${imported} new entries added to history.`,
      });
      loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      toast.error('Failed to import from Splunk', { description: msg.slice(0, 150) });
    } finally {
      setSplunkImporting(false);
    }
  };

  const handleGenerate = async (q?: string) => {
    const query = (q ?? question).trim();
    if (!query) return;
    setLoading(true);
    setSpl('');
    setResults([]);
    setSplErrors([]);
    setExplanation('');
    setMcpMode('idle');
    setMcpError('');
    setExecPath('');
    setMcpFallbackNote('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/splunk-mcp`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: query,
            service: incidentService,
            timeWindow,
            llmProvider:      activeLlm.provider,
            llmApiKey:        activeLlm.apiKey,
            llmModel:         activeLlm.modelId,
            llmFallbackChain: buildFallbackChain(),
            // Generate-only: skip execution so user can review/edit SPL first
            generateOnly: true,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const generatedSpl = data.spl ?? '';
      setSpl(generatedSpl);
      setSplErrors(generatedSpl ? validateSpl(generatedSpl) : []);
      // Do NOT set results/mcpMode — user must click "Run SPL" explicitly
      setMcpMode('idle');

      // Auto-open replay diff if this was triggered from a history replay
      setReplayDiff(prev => {
        if (prev && generatedSpl && prev.originalSpl !== generatedSpl) {
          return { ...prev };
        }
        return null;
      });

      // Persist to history (generation only, no execution yet)
      if (generatedSpl) {
        const { error: insertErr } = await supabase.from('spl_query_history').insert({
          query_text:      query,
          generated_spl:   generatedSpl,
          service_context: incidentService || null,
          incident_id:     incidentId || null,
        });
        if (insertErr) console.warn('History insert failed:', insertErr.message);
        if (showHistory) loadHistory();
      }

      return generatedSpl;
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to generate SPL';
      const isFetchErr = raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror');
      const description = isFetchErr
        ? 'Edge function unreachable. Ensure the app is online and the Supabase project is active.'
        : raw.slice(0, 120);
      toast.error('NL→SPL failed', { description });
    } finally {
      setLoading(false);
    }
    return '';
  };

  // One-click generate + run: used by MCP-badged suggestion chips.
  // Generates SPL via LLM then immediately executes it via MCP without
  // requiring a second manual "Run SPL" click.
  const handleGenerateAndRun = async (q: string) => {
    const generatedSpl = await handleGenerate(q);
    if (generatedSpl) await handleRunSpl(generatedSpl);
  };

  // Execute the SPL currently in the text area (or an explicit override).
  // Called when the user clicks "Run SPL" or "Run from History".
  const handleRunSpl = async (explicitSplOverride?: string) => {
    const splToRun = (explicitSplOverride ?? spl).trim();
    if (!splToRun) return;
    setRunning(true);
    setResults([]);
    setExplanation('');
    setMcpMode('idle');
    setMcpError('');
    setExecPath('');
    setMcpFallbackNote('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/splunk-mcp`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Signal to edge function: skip LLM, run this SPL directly
            explicitSpl: splToRun,
            question:    `[direct] ${splToRun.slice(0, 80)}`,
            service:     incidentService,
            timeWindow,
            mcpUrl:        config.splunkMcpUrl      || undefined,
            mcpToken:      config.splunkMcpToken    || undefined,
            mcpAuthMethod: config.mcpAuthMethod,
            mcpUsername:   config.splunkMcpUsername || undefined,
            mcpPassword:   config.splunkMcpPassword || undefined,
            splunkHost:    config.splunkHost        || undefined,
            splunkToken:   config.splunkToken       || undefined,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
      setExplanation(data.explanation ?? '');
      setMcpMode(data.mcpMode ?? 'demo');
      setMcpError(data.mcpError ?? '');
      setExecPath(data.execPath ?? '');
      setMcpFallbackNote(data.mcpFallbackNote ?? '');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to run SPL';
      const isFetchErr = raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror');
      toast.error('SPL execution failed', {
        description: isFetchErr ? 'Edge function unreachable.' : raw.slice(0, 120),
      });
      setMcpMode('error');
      setMcpError(raw.slice(0, 200));
    } finally {
      setRunning(false);
    }
  };

  const resultColumns = results.length > 0
    ? Object.keys(results[0]).filter(k => !k.startsWith('_') || k === '_raw').slice(0, 6)
    : [];

  // Auto-detect: first string-like col = label, numeric cols = chart series
  const numericCols = resultColumns.filter(col =>
    results.length > 0 && results.some(r => r[col] !== '' && !isNaN(Number(r[col])))
  );
  const labelCol    = resultColumns.find(col => !numericCols.includes(col)) ?? resultColumns[0] ?? '_row';
  const chartData   = results.slice(0, 20).map((row, i) => ({
    _label: row[labelCol] ?? String(i + 1),
    ...Object.fromEntries(numericCols.map(c => [c, Number(row[c] ?? 0)])),
  }));
  const canChart    = numericCols.length > 0 && chartData.length > 0;
  const CHART_COLORS = ['#22d3ee', '#f97316', '#a78bfa', '#34d399', '#fb923c'];

  // ── Filtered history (client-side search) ──────────────────────────────────
  const filteredHistory = historySearch.trim()
    ? history.filter(item => {
        const kw = historySearch.toLowerCase();
        return item.query_text.toLowerCase().includes(kw)
            || item.generated_spl.toLowerCase().includes(kw);
      })
    : history;

  // ── Share: copy deep-link URL to clipboard ─────────────────────────────────
  const handleShare = () => {
    const url = new URL(window.location.href.split('?')[0]);
    url.searchParams.set('nlq', question);
    if (incidentService && incidentService !== 'unknown-service') {
      url.searchParams.set('service', incidentService);
    }
    navigator.clipboard.writeText(url.toString())
      .then(() => toast.success('Link copied!', { description: 'Share this URL to pre-fill the query.' }))
      .catch(() => toast.error('Clipboard unavailable', { description: url.toString() }));
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (results.length === 0) return;
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = resultColumns.join(',');
    const rows   = results.map(row => resultColumns.map(c => escape(row[c] ?? '')).join(','));
    const csv    = [header, ...rows].join('\n');
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link   = document.createElement('a');
    link.href    = URL.createObjectURL(blob);
    link.download = `spl_results_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('CSV downloaded');
  };

  // ── Export JSON ─────────────────────────────────────────────────────────────
  const handleExportJson = () => {
    if (results.length === 0) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `spl_results_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('JSON downloaded');
  };

  // ── Export Query History as CSV ─────────────────────────────────────────────
  const handleExportHistory = () => {
    if (history.length === 0) return;
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['timestamp', 'query_text', 'generated_spl', 'service_context', 'incident_id'];
    const rows = history.map(item => [
      escape(new Date(item.created_at).toISOString()),
      escape(item.query_text),
      escape(item.generated_spl),
      escape(item.service_context ?? ''),
      escape(item.incident_id ?? ''),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `spl_query_history_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Query history exported as CSV');
  };

  // ── Diff mode helpers ────────────────────────────────────────────────────────
  const toggleDiffItem = (item: SplQueryHistoryItem) => {
    setDiffItems(prev => {
      const already = prev.find(d => d.id === item.id);
      if (already) return prev.filter(d => d.id !== item.id);
      if (prev.length >= 2) return [prev[1], item]; // replace oldest
      return [...prev, item];
    });
  };
  const isDiffSelected = (id: string) => diffItems.some(d => d.id === id);

  return (
    <>
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Cpu className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Natural Language → SPL
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          {/* LLM status */}
          <span className={cn(
            'flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border',
            activeLlm.apiKey
              ? 'bg-teal-900/30 border-teal-700/40 text-teal-300'
              : 'bg-amber-900/20 border-amber-700/30 text-amber-400'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', activeLlm.apiKey ? 'bg-teal-400' : 'bg-amber-400')} />
            {activeLlm.apiKey ? activeLlm.provider.toUpperCase() : 'GATEWAY'}
          </span>
          {/* MCP / Splunk status */}
          <span className={cn(
            'flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border',
            isMcp
              ? 'bg-purple-900/30 border-purple-700/40 text-purple-300'
              : 'bg-secondary border-border text-muted-foreground'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isMcp ? 'bg-purple-400' : 'bg-muted-foreground/50')} />
            {isMcp ? 'MCP LIVE' : 'SPL DEMO'}
          </span>
        </div>
      </div>

      {/* Connection health note — only shown when nothing is configured */}
      {!activeLlm.apiKey && !isMcp && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            Using platform Gemini gateway for SPL generation. SPL runs in demo mode — no live Splunk execution.{' '}
            <Link to="/settings" className="underline underline-offset-2 hover:text-amber-200">
              Configure an LLM key or MCP URL in Settings
            </Link>{' '}
            to enable live Splunk query execution.
          </p>
        </div>
      )}
      {activeLlm.apiKey && !isMcp && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            SPL will be generated but <strong className="text-foreground">not executed</strong> — no MCP Server configured.{' '}
            <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
              Add SPLUNK_MCP_URL in Settings
            </Link>{' '}
            to run queries live.
          </p>
        </div>
      )}

      {/* Suggested queries from analysis (chips) */}
      {suggestedQueries && suggestedQueries.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <p className="text-[10px] font-medium text-amber-400/80 uppercase tracking-wider">
              Suggested from analysis
            </p>
            {isMcp && (
              <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-900/30 text-[9px] font-semibold text-purple-300 uppercase tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                MCP live — click to generate &amp; run
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedQueries.map((q, i) => (
              <button
                key={i}
                onClick={async () => {
                  setQuestion(q);
                  if (isMcp) {
                    // MCP mode: generate SPL then immediately run it
                    await handleGenerateAndRun(q);
                  } else {
                    handleGenerate(q);
                  }
                }}
                className={cn(
                  'text-[10px] px-2.5 py-1 rounded-full border transition-all duration-150 text-left max-w-full truncate',
                  isMcp
                    ? 'border-purple-600/50 bg-purple-950/30 text-purple-200 hover:bg-purple-900/50 hover:border-purple-400/70'
                    : 'border-amber-600/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/50 hover:border-amber-500/60',
                )}
                title={isMcp ? `${q} — will generate SPL and execute via MCP` : q}
              >
                {isMcp && <span className="mr-1.5 text-purple-400 font-mono font-bold text-[8px]">▶MCP</span>}
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="space-y-2">
        <SplAutocomplete
          value={question}
          onChange={setQuestion}
          onSubmit={() => handleGenerate()}
          service={incidentService}
          placeholder={`Ask a question about ${incidentService}… (Ctrl+Space for suggestions)`}
          disabled={loading || running}
        />
        {/* Two-button row: Generate SPL (NL→SPL) + Run SPL (execution) */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleGenerate()}
            disabled={loading || running || !question.trim()}
            className="flex-1 h-9 gap-2 text-xs"
            title="Use AI to generate SPL from your question. You can edit the result before running."
          >
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
              : <><Cpu className="h-3.5 w-3.5" />Generate SPL</>
            }
          </Button>
          <Button
            size="sm"
            onClick={() => handleRunSpl()}
            disabled={running || loading || !spl.trim()}
            className="flex-1 h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            title={!spl.trim() ? 'Generate SPL first, then click Run SPL to execute it.' : 'Execute the SPL in the box below against Splunk.'}
          >
            {running
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Running…</>
              : <><Play className="h-3.5 w-3.5" />Run SPL</>
            }
          </Button>
        </div>
      </div>

      {/* Generic suggestions (shown when no analysis chips and no result yet) */}
      {!spl && !loading && !(suggestedQueries && suggestedQueries.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested queries</p>
          <div className="space-y-1">
            {chips.map((s, i) => (
              <button
                key={i}
                onClick={() => { setQuestion(s); handleGenerate(s); }}
                className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground bg-secondary/20 hover:bg-secondary/40 rounded px-2.5 py-1.5 transition-colors truncate"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generated SPL (editable) + action buttons */}
      {spl && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Generated SPL
              <span className="ml-1.5 normal-case font-normal text-muted-foreground/60">— edit before running</span>
            </p>
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded',
              mcpMode === 'live'  ? 'bg-teal-600/30 text-teal-300'
              : mcpMode === 'error' ? 'bg-red-600/30 text-red-300'
              : 'bg-secondary text-muted-foreground'
            )}>
              {mcpMode === 'live'
                ? execPath === 'rest' ? '▶ Executed via Splunk REST'
                  : execPath === 'mcp' ? '▶ Executed via MCP'
                  : '▶ Executed'
                : mcpMode === 'error' ? '⚠ Execution Error'
                : '○ Not yet executed'}
            </span>
          </div>
          {/* SPL validation banner */}
          {splErrors.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {splErrors.map((err, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-[11px]',
                    err.severity === 'error'
                      ? 'bg-red-950/40 border border-red-600/30 text-red-300'
                      : 'bg-yellow-950/40 border border-yellow-600/30 text-yellow-300'
                  )}
                >
                  <span className="shrink-0 font-bold mt-px">
                    {err.severity === 'error' ? '✕' : '⚠'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{err.message}</p>
                    {err.detail && <p className="text-[10px] opacity-75 mt-0.5 text-pretty">{err.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Editable SPL textarea */}
          <div className="rounded-lg border border-purple-700/30 bg-purple-950/20 p-3 space-y-2">
            <Textarea
              value={spl}
              onChange={e => {
                setSpl(e.target.value);
                setSplErrors(e.target.value.trim() ? validateSpl(e.target.value) : []);
              }}
              rows={Math.max(3, spl.split('\n').length)}
              spellCheck={false}
              className="w-full font-mono text-[11px] leading-relaxed bg-transparent border-none resize-y p-0 text-purple-200 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
              placeholder="SPL will appear here — you can edit it before running"
            />
            <div className="flex items-center gap-3 pt-1 border-t border-purple-700/20">
              <button
                onClick={() => { navigator.clipboard.writeText(spl); toast.success('SPL copied'); }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Copy SPL
              </button>
              <button
                onClick={() => setSaveDialogOpen(true)}
                className="flex items-center gap-1 text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors"
                title="Save to SPL query library"
              >
                <Bookmark className="h-3 w-3" />Save query
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 text-[10px] text-cyan-400/80 hover:text-cyan-300 transition-colors"
                title="Copy shareable deep-link URL for this query"
              >
                <Share2 className="h-3 w-3" />Share link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MCP error / fallback note */}
      {mcpMode === 'error' && mcpError && (
        <div className="rounded-lg border border-red-700/30 bg-red-950/20 px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Execution Error</p>
          <p className="text-[11px] text-red-300">{mcpError}</p>
          <p className="text-[10px] text-muted-foreground">The SPL was generated but could not be executed. Check Settings → Splunk Connection and MCP Server configuration.</p>
        </div>
      )}
      {mcpMode === 'live' && mcpFallbackNote && (
        <div className="rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2 flex items-start gap-2">
          <span className="text-amber-400 text-xs mt-0.5">⚠</span>
          <p className="text-[11px] text-amber-300">{mcpFallbackNote}</p>
        </div>
      )}

      {/* Results table + Chart toggle + Export */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          {/* Header row: view tabs + export buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setResultView('table')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-l-md border border-border text-[10px] font-medium transition-colors',
                  resultView === 'table'
                    ? 'bg-secondary text-foreground border-primary/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
              >
                <BarChart2 className="h-3 w-3 rotate-90" />Table
              </button>
              <button
                onClick={() => setResultView('chart')}
                disabled={!canChart}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-r-md border border-l-0 border-border text-[10px] font-medium transition-colors',
                  resultView === 'chart'
                    ? 'bg-secondary text-foreground border-primary/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                  !canChart && 'opacity-40 cursor-not-allowed'
                )}
                title={!canChart ? 'No numeric columns detected for charting' : 'Show bar chart'}
              >
                <BarChart2 className="h-3 w-3" />Chart
              </button>
              <span className="ml-2 text-[10px] text-muted-foreground">{results.length} rows</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 text-[10px] text-teal-400/80 hover:text-teal-300 transition-colors"
                title="Download results as CSV"
              >
                <Download className="h-3 w-3" />CSV
              </button>
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1 text-[10px] text-blue-400/80 hover:text-blue-300 transition-colors"
                title="Download results as JSON"
              >
                <Download className="h-3 w-3" />JSON
              </button>
            </div>
          </div>

          {/* Table view */}
          {resultView === 'table' && (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {resultColumns.map(col => (
                        <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                        {resultColumns.map(col => (
                          <td key={col} className="px-2 py-1.5 text-muted-foreground font-mono whitespace-nowrap max-w-[120px] truncate">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.length > 20 && (
                <p className="text-[10px] text-muted-foreground text-center">Showing 20 of {results.length} rows</p>
              )}
            </>
          )}

          {/* Chart view */}
          {resultView === 'chart' && canChart && (
            <div className="rounded-lg border border-border bg-secondary/10 p-3">
              <p className="text-[10px] text-muted-foreground mb-2">
                Chart: <span className="text-foreground font-mono">{numericCols.join(', ')}</span>
                {' '}by <span className="text-foreground font-mono">{labelCol}</span>
              </p>
              <div className="w-full min-w-0 overflow-hidden" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="_label"
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      height={36}
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        fontSize: 11,
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    {numericCols.map((col, idx) => (
                      <Bar key={col} dataKey={col} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[2, 2, 0, 0]}>
                        {chartData.map((_, ci) => (
                          <Cell key={ci} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
                Showing up to 20 rows · connect live Splunk for real data
              </p>
            </div>
          )}
        </div>
      )}

      {/* Demo explanation */}
      {explanation && !mcpError && (
        <div className="rounded-lg border border-blue-700/30 bg-blue-950/20 p-3">
          <pre className="text-[11px] text-blue-200 whitespace-pre-wrap break-words font-mono leading-relaxed">{explanation}</pre>
          <p className="text-[10px] text-muted-foreground mt-2">
            Configure MCP Server in Settings to execute queries against live Splunk data.
          </p>
        </div>
      )}

      {/* Context pill */}
      {!spl && !loading && (
        <div className="rounded-lg border border-border bg-secondary/10 px-3 py-2.5 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground/60">Context: </span>
          {incidentId} · {incidentService} · {timeWindow}
        </div>
      )}

      {/* ── Query History Panel ──────────────────────────────────────────── */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={handleToggleHistory}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            Query History
            {history.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-secondary text-[10px]">{history.length}</span>
            )}
            {showHistory ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {/* Saved queries toggle */}
            <button
              onClick={() => { setShowSaved(v => !v); setShowHistory(false); }}
              className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors',
                showSaved
                  ? 'border-amber-600/60 bg-amber-900/20 text-amber-300'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
              title="Open saved queries library"
            >
              <BookmarkCheck className="h-3 w-3" />Saved
            </button>
            {history.length > 0 && (
              <>
                {/* Diff mode toggle */}
                <button
                  onClick={() => { setDiffMode(v => !v); setDiffItems([]); }}
                  className={cn(
                    'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors',
                    diffMode
                      ? 'border-purple-600/60 bg-purple-900/20 text-purple-300'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  )}
                  title="Compare two SPL queries side by side"
                >
                  <GitCompare className="h-3 w-3" />Diff
                </button>
                {/* Export CSV */}
                <button
                  onClick={handleExportHistory}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Export query history as CSV"
                >
                  <Download className="h-3 w-3" />CSV
                </button>
              </>
            )}
          </div>
        </div>

        {/* Saved queries library inline panel */}
        {showSaved && (
          <div className="rounded-lg border border-amber-700/30 bg-amber-950/10 overflow-hidden" style={{ maxHeight: 420 }}>
            <SavedQueriesPanel
              onRunQuery={handleRunSavedQuery}
              incidentService={incidentService}
              timeWindow={timeWindow}
            />
          </div>
        )}

        {showHistory && (
          <div className="space-y-2">
            {/* Search box */}
            {history.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <Input
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search query history…"
                  className="h-7 pl-7 text-[11px] bg-secondary/20 border-border"
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-2.5 w-2.5 rotate-45" />
                  </button>
                )}
              </div>
            )}

            {/* History actions: Import from Splunk + Re-run All + Clear */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Import from Splunk (bidirectional pull) */}
              {config.splunkHost && config.splunkToken && (
                <button
                  onClick={fetchSplunkHistory}
                  disabled={splunkImporting}
                  className="flex items-center gap-1.5 text-[10px] text-cyan-400/80 hover:text-cyan-300 transition-colors disabled:opacity-50"
                >
                  {splunkImporting
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RotateCcw className="h-3 w-3" />}
                  {splunkImporting ? 'Importing…' : 'Import from Splunk'}
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {/* Re-run All */}
                {history.length > 0 && !rerunning && (
                  <button
                    onClick={handleRerunAll}
                    disabled={rerunning}
                    className="flex items-center gap-1 text-[10px] text-violet-400/80 hover:text-violet-300 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    Re-run All{historySearch.trim() ? ' (filtered)' : ''}
                  </button>
                )}
                {rerunning && rerunProgress && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-300/70">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running {rerunProgress.current}/{rerunProgress.total}…
                  </span>
                )}

                {/* ── Auto-run scheduler ── */}
                {history.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground/60 shrink-0">Auto:</span>
                    <div className="relative">
                      <select
                        value={autoRunInterval}
                        onChange={e => setAutoRunInterval(Number(e.target.value))}
                        className={cn(
                          'appearance-none h-5 rounded border text-[9px] px-1.5 pr-5 focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
                          autoRunInterval > 0
                            ? 'bg-violet-900/30 border-violet-600/50 text-violet-300'
                            : 'bg-secondary/30 border-border text-muted-foreground'
                        )}
                      >
                        {AUTO_RUN_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground pointer-events-none" />
                    </div>
                    {autoRunInterval > 0 && (
                      <span className="text-[9px] text-violet-400/70 tabular-nums shrink-0">
                        {autoRunCountdown}s
                      </span>
                    )}
                    {autoRunLastRun && autoRunInterval > 0 && (
                      <span className="text-[9px] text-muted-foreground/50 shrink-0 hidden sm:inline">
                        Last: {autoRunLastRun}
                      </span>
                    )}
                  </div>
                )}

                {/* Clear history */}
                {history.length > 0 && (
                  <div className="flex items-center gap-2">
                    {clearConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Confirm clear?</span>
                        <button
                          onClick={handleClearHistory}
                          className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
                        >Yes, clear</button>
                        <button
                          onClick={() => setClearConfirm(false)}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setClearConfirm(true)}
                        className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />Clear History
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {historyLoading && (
              <div className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading history…
              </div>
            )}

            {!historyLoading && history.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center py-3">
                No query history yet. Generate your first SPL query above.
              </p>
            )}

            {!historyLoading && history.length > 0 && filteredHistory.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center py-3">
                No matching queries found.
              </p>
            )}

            {!historyLoading && filteredHistory.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {diffMode && (
                  <p className="text-[10px] text-purple-300/70 px-1">
                    {diffItems.length === 0 && 'Select 2 queries to compare'}
                    {diffItems.length === 1 && 'Select 1 more query to compare'}
                    {diffItems.length === 2 && 'Scroll down to see diff ↓'}
                  </p>
                )}
                {filteredHistory.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border transition-colors group',
                      diffMode && isDiffSelected(item.id)
                        ? 'border-purple-600/60 bg-purple-900/20'
                        : 'border-border bg-secondary/10 hover:bg-secondary/30 hover:border-border/80'
                    )}
                  >
                    {/* Clickable label zone — replay (regenerate) or diff-select */}
                    <button
                      type="button"
                      onClick={() => diffMode ? toggleDiffItem(item) : replayHistoryItem(item)}
                      className="w-full text-left px-2.5 pt-2 pb-1 min-w-0"
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <p className="text-[11px] font-medium text-foreground/80 group-hover:text-foreground truncate flex-1 min-w-0">
                          {item.query_text}
                        </p>
                        {diffMode
                          ? <span className={cn(
                              'h-3.5 w-3.5 rounded border shrink-0 mt-0.5 flex items-center justify-center text-[8px]',
                              isDiffSelected(item.id) ? 'border-purple-400 bg-purple-900/40 text-purple-300' : 'border-border'
                            )}>
                              {isDiffSelected(item.id) ? '✓' : ''}
                            </span>
                          : <RotateCcw className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary shrink-0 mt-0.5 transition-colors" aria-label="Regenerate SPL" />
                        }
                      </div>
                      <p className="text-[10px] text-purple-400/70 font-mono mt-1 truncate">
                        {item.generated_spl.slice(0, 80)}{item.generated_spl.length > 80 ? '…' : ''}
                      </p>
                    </button>
                    {/* Footer: metadata + Run from History button */}
                    <div className="flex items-center gap-2 px-2.5 pb-2 pt-0.5">
                      {item.service_context && (
                        <span className="text-[9px] text-muted-foreground/60 font-mono truncate flex-1 min-w-0">{item.service_context}</span>
                      )}
                      <span className="text-[9px] text-muted-foreground/40 shrink-0">
                        {new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {/* Run from History — loads SPL + executes immediately, no LLM call */}
                      {!diffMode && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); runFromHistory(item); }}
                          disabled={running}
                          title="Load this SPL and run it now (no LLM regeneration)"
                          className={cn(
                            'shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold transition-colors',
                            running
                              ? 'border-border text-muted-foreground cursor-not-allowed'
                              : 'border-teal-700/50 bg-teal-900/20 text-teal-300 hover:bg-teal-900/40 hover:border-teal-600/60',
                          )}
                        >
                          <Play className="h-2.5 w-2.5" />
                          Run
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Re-run All summary ───────────────────────────────────── */}
            {showRerunSummary && rerunSummary && (
              <div className="rounded-lg border border-violet-700/40 bg-violet-950/15 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Play className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span className="text-[11px] font-medium text-violet-300">Re-run All — Summary</span>
                    <span className="text-[10px] text-muted-foreground">
                      {rerunSummary.filter(r => r.status === 'ok').length}/{rerunSummary.length} succeeded
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRerunSummary(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >Dismiss</button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {rerunSummary.map((r, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-2 rounded px-2 py-1.5 text-[10px]',
                      r.status === 'ok'
                        ? 'bg-teal-900/10 border border-teal-800/20'
                        : 'bg-red-900/10 border border-red-800/20',
                    )}>
                      {r.status === 'ok'
                        ? <CheckCircle2 className="h-3 w-3 text-teal-400 shrink-0 mt-0.5" />
                        : <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-foreground/70">{r.query}</p>
                        {r.status === 'ok' && (
                          <p className="text-muted-foreground/50">{r.resultCount} result{r.resultCount !== 1 ? 's' : ''}</p>
                        )}
                        {r.status === 'error' && (
                          <p className="text-red-400/70 truncate">{r.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Replay diff: original vs regenerated SPL ─────────────── */}
            {replayDiff && spl && replayDiff.originalSpl !== spl && (
              <div className="mt-3 rounded-lg border border-purple-700/40 bg-purple-950/15 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="text-[11px] font-medium text-purple-300">Replay Diff — original vs regenerated</span>
                  <button
                    onClick={() => setReplayDiff(null)}
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >Dismiss</button>
                </div>
                <p className="text-[10px] text-muted-foreground text-pretty">
                  "{replayDiff.question.slice(0, 80)}{replayDiff.question.length > 80 ? '…' : ''}"
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Original */}
                  <div className="rounded border border-cyan-700/40 bg-cyan-950/15 p-2 space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">A — Original (from history)</p>
                    <DiffSpl spl={replayDiff.originalSpl} other={spl} side="left" />
                  </div>
                  {/* Regenerated */}
                  <div className="rounded border border-amber-700/40 bg-amber-950/15 p-2 space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400">B — Regenerated (now)</p>
                    <DiffSpl spl={spl} other={replayDiff.originalSpl} side="right" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Diff view: side-by-side SPL compare ──────────────────── */}
            {diffMode && diffItems.length === 2 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="text-[11px] font-medium text-purple-300">SPL Diff</span>
                  <button
                    onClick={() => setDiffItems([])}
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >Clear</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {diffItems.map((item, idx) => (
                    <div key={item.id} className={cn(
                      'rounded-lg border p-2 space-y-1',
                      idx === 0 ? 'border-cyan-700/40 bg-cyan-900/10' : 'border-purple-700/40 bg-purple-900/10'
                    )}>
                      <p className={cn(
                        'text-[9px] font-semibold uppercase tracking-wider',
                        idx === 0 ? 'text-cyan-400' : 'text-purple-400'
                      )}>
                        {idx === 0 ? 'A' : 'B'} — {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-foreground/70 text-pretty">{item.query_text}</p>
                      <DiffSpl
                        spl={item.generated_spl}
                        other={diffItems[idx === 0 ? 1 : 0].generated_spl}
                        side={idx === 0 ? 'left' : 'right'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    <SaveQueryDialog
      open={saveDialogOpen}
      spl={spl}
      initialName={question.slice(0, 60)}
      onSave={handleSaveQuery}
      onClose={() => setSaveDialogOpen(false)}
    />
    </>
  );
}

// ── Export Tool ───────────────────────────────────────────────────────────────
interface ExportToolProps {
  analysis: AnalysisResult & { aiBrief?: Record<string, string> } | null;
  incidentId: string;
  incidentTitle: string;
}

function buildMarkdown(analysis: NonNullable<ExportToolProps['analysis']>, title: string) {
  const lines = [
    `# Incident Report: ${analysis.incidentId}`,
    `**${title}**`,
    `Generated: ${new Date(analysis.generatedAt).toISOString()}`,
    '',
    '## Executive Summary',
    analysis.aiBrief?.executiveSummary ?? analysis.summary,
    '',
    '## Root Cause Hypotheses',
    ...analysis.hypotheses.map((h, i) =>
      `${i + 1}. **${h.title}** (${Math.round(h.confidence * 100)}% confidence)\n   - ${h.evidence.join('\n   - ')}`
    ),
    '',
    '## Blast Radius',
    `- **Services**: ${analysis.blastRadius.services.join(', ')}`,
    `- **Endpoints**: ${analysis.blastRadius.endpoints.join(', ')}`,
    analysis.blastRadius.estimated_users_affected ? `- **Users affected**: ${analysis.blastRadius.estimated_users_affected.toLocaleString()}` : '',
    analysis.blastRadius.estimated_revenue_impact ? `- **Revenue impact**: ${analysis.blastRadius.estimated_revenue_impact}` : '',
    '',
    '## Recommended Actions',
    ...analysis.recommendedActions.map((a, i) => `${i + 1}. ${a}`),
    '',
    '## Timeline',
    ...analysis.timeline.map(e => `- \`${e.timestamp}\` **[${e.type.toUpperCase()}]** ${e.event}`),
    '',
    '## Open Questions',
    ...analysis.openQuestions.map(q => `- ${q}`),
    '',
    '---',
    `_Generated by SentinelOps — Agentic Incident Commander_`,
  ];
  return lines.filter(l => l !== null).join('\n');
}

function buildSlack(analysis: NonNullable<ExportToolProps['analysis']>, title: string) {
  return [
    `:rotating_light: *INCIDENT UPDATE — ${analysis.incidentId}*`,
    `*Title:* ${title}`,
    '',
    `*Summary:* ${analysis.aiBrief?.executiveSummary ?? analysis.summary}`,
    '',
    `*Top Hypothesis:* ${analysis.hypotheses[0]?.title} (${Math.round((analysis.hypotheses[0]?.confidence ?? 0) * 100)}% confidence)`,
    `*Blast Radius:* ${analysis.blastRadius.services.join(' → ')}`,
    analysis.blastRadius.estimated_revenue_impact ? `*Revenue Impact:* ${analysis.blastRadius.estimated_revenue_impact}` : '',
    '',
    '*Immediate Actions:*',
    ...analysis.recommendedActions.slice(0, 3).map((a, i) => `${i + 1}. ${a}`),
    '',
    `_SentinelOps — ${new Date().toISOString()}_`,
  ].filter(Boolean).join('\n');
}

function buildJira(analysis: NonNullable<ExportToolProps['analysis']>, title: string) {
  return [
    `h1. ${analysis.incidentId}: ${title}`,
    '',
    `h2. Summary`,
    analysis.aiBrief?.executiveSummary ?? analysis.summary,
    '',
    `h2. Impact`,
    `* Services: ${analysis.blastRadius.services.join(', ')}`,
    analysis.blastRadius.estimated_users_affected ? `* Users affected: ${analysis.blastRadius.estimated_users_affected.toLocaleString()}` : '',
    analysis.blastRadius.estimated_revenue_impact ? `* Revenue impact: ${analysis.blastRadius.estimated_revenue_impact}` : '',
    '',
    `h2. Root Cause Analysis`,
    ...analysis.hypotheses.map((h, i) => `${i + 1}. ${h.title} (${Math.round(h.confidence * 100)}% confidence)\n** Evidence: ${h.evidence.join('; ')}`),
    '',
    `h2. Next Steps`,
    ...analysis.recommendedActions.map((a, i) => `${i + 1}. ${a}`),
    '',
    `_Generated by SentinelOps on ${new Date().toISOString()}_`,
  ].filter(Boolean).join('\n');
}

function ExportTool({ analysis, incidentId, incidentTitle }: ExportToolProps) {
  const [format, setFormat] = useState<'markdown' | 'slack' | 'jira'>('markdown');
  const [copied, setCopied] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);

  if (!analysis) {
    return <p className="text-xs text-muted-foreground text-center py-8">Run an analysis first to enable export.</p>;
  }

  const content = format === 'markdown' ? buildMarkdown(analysis, incidentTitle) :
    format === 'slack' ? buildSlack(analysis, incidentTitle) :
      buildJira(analysis, incidentTitle);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${incidentId}-report.${format === 'markdown' ? 'md' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPpt = async () => {
    setPptLoading(true);
    try {
      // Find the incident from analysis
      const incident = {
        id: incidentId,
        title: incidentTitle,
        severity: (analysis as AnalysisResult & { aiBrief?: Record<string, string> }).blastRadius?.services?.length ? 'CRITICAL' : 'HIGH',
        status: 'INVESTIGATING',
        service: analysis.affectedServices?.[0] ?? analysis.metadata?.name ?? 'unknown',
        opened_at: analysis.generatedAt,
        time_window: 'last_30m',
      };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ppt-export`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ analysis, incident }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${incidentId}-briefing.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PowerPoint briefing downloaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PPT';
      toast.error('PPT generation failed', { description: msg.slice(0, 120) });
    } finally {
      setPptLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* PPT Export button — prominent CTA */}
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Presentation className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">Executive Briefing (PowerPoint)</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Generate a 6-slide PPTX: cover, summary, hypotheses, blast radius, timeline, and next actions.
        </p>
        <Button
          size="sm"
          onClick={downloadPpt}
          disabled={pptLoading}
          className="w-full h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
        >
          {pptLoading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating PPTX…</>
            : <><Presentation className="h-3.5 w-3.5" />Download Briefing PPT</>
          }
        </Button>
      </div>

      {/* Text export section */}
      <div className="space-y-2 pt-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Text Formats</p>
        <div className="flex gap-2">
          {(['markdown', 'slack', 'jira'] as const).map(f => (
            <button key={f} onClick={() => setFormat(f)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize', format === f ? 'bg-primary/20 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground bg-secondary/20')}
            >
              {f === 'markdown' ? 'Markdown' : f === 'slack' ? 'Slack' : 'Jira'}
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 max-h-52 overflow-y-auto p-3">
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{content}</pre>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy} className="border-border text-muted-foreground hover:text-foreground flex-1 h-8 text-xs">
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={download} className="border-border text-muted-foreground hover:text-foreground flex-1 h-8 text-xs">
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main ToolsPanel ───────────────────────────────────────────────────────────
interface ToolsPanelProps {
  analysis: (AnalysisResult & { aiBrief?: Record<string, string> }) | null;
  incidentId: string;
  incidentTitle: string;
  incidentService?: string;
  timeWindow?: string;
  suggestedQueries?: string[];
  deepLinkQuery?: string;
  deepLinkService?: string;
}

const TOOLS: { id: Tool; icon: React.ElementType; label: string }[] = [
  { id: 'web-search',     icon: Search,       label: 'Web' },
  { id: 'ai-search',      icon: Globe,        label: 'AI' },
  { id: 'ocr',            icon: ScanText,     label: 'OCR' },
  { id: 'web-reader',     icon: BookOpen,     label: 'Reader' },
  { id: 'data-viz',       icon: BarChart2,    label: 'Charts' },
  { id: 'nl-spl',         icon: Cpu,          label: 'NL→SPL' },
  { id: 'splunk-alerts',  icon: Bell,         label: 'Alerts' },
  { id: 'export',         icon: Presentation, label: 'Export' },
];

export function ToolsPanel({ analysis, incidentId, incidentTitle, incidentService = 'unknown-service', timeWindow = 'last_30m', suggestedQueries, deepLinkQuery, deepLinkService }: ToolsPanelProps) {
  const [activeTool, setActiveTool] = useState<Tool>('web-search');

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Tools</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Investigation & export utilities</p>
      </div>

      {/* Tool tabs */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-1 flex-wrap">
          {TOOLS.map(t => (
            <ToolTab key={t.id} {...t} active={activeTool === t.id} onClick={() => setActiveTool(t.id)} />
          ))}
        </div>
      </div>

      {/* Tool content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        {activeTool === 'web-search' && <WebSearchTool />}
        {activeTool === 'ai-search' && <AiSearchTool />}
        {activeTool === 'ocr' && <OcrTool />}
        {activeTool === 'web-reader' && <WebReaderTool />}
        {activeTool === 'data-viz' && <DataVizTool />}
        {activeTool === 'nl-spl' && (
          <NlSplTool
            incidentId={incidentId}
            incidentService={incidentService}
            timeWindow={timeWindow}
            suggestedQueries={suggestedQueries}
            deepLinkQuery={deepLinkQuery}
            deepLinkService={deepLinkService}
          />
        )}
        {activeTool === 'export' && (
          <ExportTool analysis={analysis} incidentId={incidentId} incidentTitle={incidentTitle} />
        )}
        {activeTool === 'splunk-alerts' && <SplunkAlertsPanel />}
      </div>
    </div>
  );
}
