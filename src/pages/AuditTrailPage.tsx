import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Sun, Moon, Shield, RefreshCw, Search, Loader2,
  Activity, User, Bot, Settings2, AlertTriangle, CheckCircle2,
  XCircle, Zap, Lock, Download, Filter, Clock, Database,
} from 'lucide-react';

interface AuditEvent {
  id: number;
  event_type: string;
  actor: string;
  target_type: string | null;
  target_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  session_id: string | null;
  created_at: string;
}

const EVENT_META: Record<string, { color: string; bg: string; Icon: React.ElementType }> = {
  'incident.resolved':      { color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: CheckCircle2  },
  'incident.created':       { color: 'text-blue-400',    bg: 'bg-blue-500/10',    Icon: AlertTriangle },
  'remediation.executed':   { color: 'text-primary',     bg: 'bg-primary/10',     Icon: Zap           },
  'remediation.approved':   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: CheckCircle2  },
  'remediation.rejected':   { color: 'text-red-400',     bg: 'bg-red-500/10',     Icon: XCircle       },
  'policy.evaluated':       { color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  Icon: Shield        },
  'config.changed':         { color: 'text-orange-400',  bg: 'bg-orange-500/10',  Icon: Settings2     },
  'user.login':             { color: 'text-blue-400',    bg: 'bg-blue-500/10',    Icon: User          },
  'user.logout':            { color: 'text-muted-foreground', bg: 'bg-muted/40',  Icon: User          },
  'alert.fired':            { color: 'text-red-400',     bg: 'bg-red-500/10',     Icon: Activity      },
  'feedback.submitted':     { color: 'text-purple-400',  bg: 'bg-purple-500/10',  Icon: Database      },
};

function getEventMeta(type: string) {
  return EVENT_META[type] ?? { color: 'text-muted-foreground', bg: 'bg-muted/30', Icon: Clock };
}

function actorIcon(actor: string) {
  if (actor === 'system' || actor.toLowerCase().includes('ai') || actor.toLowerCase().includes('engine') || actor.toLowerCase().includes('splunk')) {
    return <Bot className="h-3 w-3 text-blue-400" />;
  }
  return <User className="h-3 w-3 text-muted-foreground" />;
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function EventRow({ event, expanded, onToggle }: { event: AuditEvent; expanded: boolean; onToggle: () => void }) {
  const meta = getEventMeta(event.event_type);
  const Icon = meta.Icon;
  const hasMetadata = Object.keys(event.metadata).length > 0;

  return (
    <div className={cn('border-b border-border/50 last:border-0 transition-colors', expanded && 'bg-accent/10')}>
      <button onClick={onToggle} className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors">
        {/* Timestamp */}
        <span className="shrink-0 w-36 text-[10px] font-mono text-muted-foreground tabular-nums pt-0.5">
          {fmtTs(event.created_at)}
        </span>
        {/* Event type icon */}
        <div className={cn('p-1 rounded border shrink-0 mt-0.5', meta.bg)}>
          <Icon className={cn('h-3 w-3', meta.color)} />
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-mono font-semibold', meta.color)}>{event.event_type}</span>
            {event.target_type && event.target_id && (
              <span className="text-[10px] text-muted-foreground">→ {event.target_type}:<span className="font-mono text-foreground/60">{event.target_id}</span></span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.description}</p>
        </div>
        {/* Actor */}
        <div className="shrink-0 flex items-center gap-1.5 ml-2">
          {actorIcon(event.actor)}
          <span className="text-[10px] text-muted-foreground">{event.actor}</span>
        </div>
        {/* Row ID (immutable proof) */}
        <span className="shrink-0 text-[9px] font-mono text-muted-foreground/40 w-8 text-right">#{event.id}</span>
      </button>
      {expanded && hasMetadata && (
        <div className="px-4 pb-3 ml-16">
          <pre className="rounded bg-black/30 border border-border px-3 py-2 text-[10px] font-mono text-foreground/70 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditTrailPage() {
  const { theme, toggleTheme } = useTheme();
  const [events, setEvents]   = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [page, setPage]       = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_trail')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    setEvents(prev => page === 0 ? (Array.isArray(data) ? data as AuditEvent[] : []) : [...prev, ...(Array.isArray(data) ? data as AuditEvent[] : [])]);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleExportCSV = () => {
    const header = 'id,event_type,actor,target_type,target_id,description,created_at\n';
    const rows = events.map(e =>
      `"${e.id}","${e.event_type}","${e.actor}","${e.target_type ?? ''}","${e.target_id ?? ''}","${e.description.replace(/"/g, '""')}","${e.created_at}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit-trail-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpanded = (id: number) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const eventTypes = Array.from(new Set(events.map(e => e.event_type))).sort();

  const filtered = events.filter(e => {
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.description.toLowerCase().includes(s) ||
      e.event_type.toLowerCase().includes(s) ||
      e.actor.toLowerCase().includes(s) ||
      (e.target_id ?? '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <Link to="/"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-2">
          <img src="/images/logo/sentinelops-logo.png" alt="SentinelOps" className="h-7 w-7 object-contain shrink-0" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><Lock className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Immutable Audit Trail</span></div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          <span className="text-muted-foreground"><span className="text-foreground font-semibold">{events.length}</span> events</span>
          <span className="flex items-center gap-1 text-emerald-400"><Lock className="h-3 w-3" />Append-only</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleExportCSV} className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export CSV</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setPage(0); load(); }} className="h-8 w-8 p-0 text-muted-foreground"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-card/20 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events, actors, targets…"
            className="pl-8 h-8 text-xs bg-secondary/30" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-secondary/30 px-2 text-xs text-foreground min-w-0 max-w-48">
            <option value="all">All event types</option>
            {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} matching</span>
      </div>

      {/* Immutability notice */}
      <div className="shrink-0 mx-4 mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 flex items-center gap-2">
        <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
        <p className="text-[10px] text-emerald-300/80">This log is append-only. Rows are assigned sequential IDs and cannot be modified or deleted. Guaranteed tamper-evident record for compliance and forensic audit.</p>
      </div>

      {/* Table header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 bg-muted/20 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span className="w-36 shrink-0">Timestamp</span>
        <span className="w-6 shrink-0" />
        <span className="flex-1">Description</span>
        <span className="shrink-0">Actor</span>
        <span className="w-8 text-right shrink-0">#ID</span>
      </div>

      <main className="flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Database className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No events match your filter</p>
          </div>
        ) : (
          <div>
            {filtered.map(e => (
              <EventRow key={e.id} event={e} expanded={expanded.has(e.id)} onToggle={() => toggleExpanded(e.id)} />
            ))}
            {events.length >= (page + 1) * PAGE && (
              <div className="flex justify-center py-4">
                <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={loading} className="h-8 gap-1.5 text-xs">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
