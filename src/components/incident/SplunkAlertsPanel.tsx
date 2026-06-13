import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useSplunk } from '@/contexts/SplunkContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  RefreshCw, Loader2, Bell, BellOff, Search, ChevronDown, ChevronUp,
  Clock, Zap, Copy, CheckCircle2, AlertTriangle, Play, X, BarChart2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { SplunkSavedAlert } from '@/types/types';

const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

const SEVERITY_MAP: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/20 border-red-700/40',
  high:     'text-orange-400 bg-orange-900/20 border-orange-700/40',
  medium:   'text-yellow-400 bg-yellow-900/20 border-yellow-700/40',
  low:      'text-blue-400 bg-blue-900/20 border-blue-700/40',
};

function severityClass(s: string) {
  return SEVERITY_MAP[s?.toLowerCase()] ?? 'text-muted-foreground bg-secondary border-border';
}

function ActionChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary border border-border text-muted-foreground">
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handle} title="Copy SPL" className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCircle2 className="h-3 w-3 text-teal-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Run Now results mini-panel ────────────────────────────────────────────────
function RunNowResults({
  results,
  error,
  onClose,
}: {
  results: Array<Record<string, string>> | null;
  error: string | null;
  onClose: () => void;
}) {
  if (!results && !error) return null;

  const columns = results && results.length > 0
    ? Object.keys(results[0]).filter(k => !k.startsWith('_') || k === '_raw').slice(0, 6)
    : [];

  return (
    <div className="mt-2 rounded-lg border border-border bg-secondary/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
          {error ? 'Run Error' : `Results — ${results?.length ?? 0} rows`}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && (
        <div className="px-3 py-2 text-[11px] text-red-300">{error}</div>
      )}
      {results && results.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">No results returned.</div>
      )}
      {results && results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border">
                {columns.map(c => (
                  <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                  {columns.map(c => (
                    <td key={c} className="whitespace-nowrap px-2 py-1 font-mono text-foreground/80 max-w-[200px] truncate">
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {results.length > 20 && (
            <p className="px-3 py-1.5 text-[9px] text-muted-foreground">
              Showing first 20 of {results.length} rows
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Individual alert row ──────────────────────────────────────────────────────
function AlertRow({
  alert,
  onSeverityChange,
}: {
  alert: SplunkSavedAlert;
  onSeverityChange: (id: string, severity: string) => void;
}) {
  const { config } = useSplunk();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<Array<Record<string, string>> | null>(null);
  const [runError, setRunError]   = useState<string | null>(null);

  const handleRunNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!config.splunkHost || !config.splunkToken) {
      toast.error('Splunk REST connection required', {
        description: 'Configure Splunk Host + Token in Settings → Splunk Connection.',
      });
      return;
    }
    setRunning(true);
    setRunResults(null);
    setRunError(null);
    if (!open) setOpen(true); // expand to show results

    try {
      const { data, error } = await supabase.functions.invoke('splunk-alerts', {
        body: {
          mode: 'run-now',
          splunkHost: config.splunkHost,
          splunkToken: config.splunkToken,
          spl: alert.search,
        },
      });

      if (error) {
        const raw = await error?.context?.text?.().catch(() => null);
        let msg = error.message;
        if (raw) {
          try { msg = JSON.parse(raw)?.error ?? raw; } catch { msg = raw; }
        }
        setRunError(msg.slice(0, 200));
        return;
      }

      if (!data?.ok) {
        setRunError(data?.error ?? 'Run failed — check Splunk connection.');
        return;
      }

      setRunResults(Array.isArray(data.results) ? data.results : []);
      toast.success(`Ran "${alert.alert_name}"`, {
        description: `${data.resultCount ?? 0} result${data.resultCount !== 1 ? 's' : ''} returned.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      setRunError(msg.slice(0, 200));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={cn('rounded-lg border transition-colors overflow-hidden', alert.is_enabled ? 'border-border bg-card' : 'border-border/40 bg-secondary/5 opacity-60')}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', alert.is_enabled ? 'bg-teal-400' : 'bg-muted-foreground')} />
          <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">{alert.alert_name}</span>
        </button>

        {/* Severity dropdown — manual override */}
        <select
          value={alert.severity}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onSeverityChange(alert.id, e.target.value); }}
          className={cn(
            'appearance-none shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded border cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring',
            severityClass(alert.severity),
          )}
          title="Override severity"
        >
          {SEVERITY_LEVELS.map(s => (
            <option key={s} value={s} className="bg-background text-foreground">
              {s.toUpperCase()}
            </option>
          ))}
        </select>

        {/* Schedule pill */}
        {alert.cron_schedule && (
          <span className="hidden md:flex items-center gap-1 text-[9px] text-muted-foreground shrink-0">
            <Clock className="h-2.5 w-2.5" />{alert.cron_schedule}
          </span>
        )}

        {/* Run Now button */}
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          title="Run this alert's SPL against Splunk now"
          className={cn(
            'shrink-0 flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-semibold transition-colors',
            running
              ? 'border-border text-muted-foreground cursor-not-allowed'
              : 'border-teal-700/50 bg-teal-900/20 text-teal-300 hover:bg-teal-900/40 hover:border-teal-600/60',
          )}
        >
          {running
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Play className="h-3 w-3" />}
          {running ? 'Running…' : 'Run Now'}
        </button>

        <button type="button" onClick={() => setOpen(v => !v)} className="shrink-0">
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
          <div className="flex items-start gap-2">
            <p className="text-[10px] font-mono text-foreground/80 flex-1 whitespace-pre-wrap break-all leading-relaxed">
              {alert.search}
            </p>
            <CopyButton text={alert.search} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {alert.cron_schedule && (
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {alert.cron_schedule}</span>
            )}
            {alert.next_fire_time && (
              <span className="flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                Next: {new Date(alert.next_fire_time).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            <span>Type: {alert.alert_type}</span>
          </div>

          {Array.isArray(alert.actions) && alert.actions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[9px] text-muted-foreground mr-1">Actions:</span>
              {alert.actions.map(a => <ActionChip key={a} label={a} />)}
            </div>
          )}

          <p className="text-[9px] text-muted-foreground">
            Imported {new Date(alert.imported_at).toLocaleDateString()} · Splunk name: <span className="font-mono">{alert.splunk_name}</span>
          </p>

          {/* Run Now results inline */}
          <RunNowResults
            results={runResults}
            error={runError}
            onClose={() => { setRunResults(null); setRunError(null); }}
          />
        </div>
      )}
    </div>
  );
}

export function SplunkAlertsPanel() {
  const { config } = useSplunk();
  const { user } = useAuth();

  const [alerts, setAlerts]       = useState<SplunkSavedAlert[]>([]);
  const [loading, setLoading]     = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch]       = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all');

  // ── Severity breakdown dialog after import ─────────────────────────────
  type SeverityBreakdown = { critical: number; high: number; medium: number; low: number; total: number };
  const [breakdownOpen, setBreakdownOpen]       = useState(false);
  const [importBreakdown, setImportBreakdown]   = useState<SeverityBreakdown | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('splunk_saved_alerts')
        .select('*')
        .order('alert_name', { ascending: true });
      if (error) throw error;
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load saved alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // Manually override severity for a single alert (DB + local state)
  const handleSeverityChange = useCallback(async (id: string, severity: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, severity } : a));
    const { error } = await supabase
      .from('splunk_saved_alerts')
      .update({ severity, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Failed to update severity');
      loadAlerts(); // revert optimistic update
    }
  }, [loadAlerts]);

  const importFromSplunk = async () => {
    if (!config.splunkHost || !config.splunkToken) {
      toast.error('Splunk REST connection required', {
        description: 'Configure Splunk Host + Token in Settings → Splunk Connection.',
      });
      return;
    }
    if (!user) {
      toast.error('Not authenticated — please sign in first.');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('splunk-alerts', {
        body: {
          splunkHost:    config.splunkHost,
          splunkToken:   config.splunkToken,
          severityRules: config.severityRules ?? null,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          const raw = await error?.context?.text?.();
          if (raw) {
            const parsed = JSON.parse(raw);
            msg = parsed?.error ?? parsed?.message ?? raw;
          }
        } catch { /* fall back */ }
        throw new Error(msg || error.message);
      }

      // data?.error means edge function returned HTTP 200 but embedded an error object
      if (data?.error) throw new Error(data.error);

      const incoming: Array<{
        splunkName: string; alertName: string; search: string;
        cronSchedule: string | null; nextFireTime: string | null;
        isEnabled: boolean; alertType: string; actions: string[];
        severity: string;
      }> = Array.isArray(data?.alerts) ? data.alerts : [];

      if (incoming.length === 0) {
        toast.info('No scheduled alerts found in Splunk.');
        return;
      }

      // Guard: skip entries with an empty splunk_name (NOT NULL constraint)
      const valid = incoming.filter(a => a.splunkName?.trim());

      if (valid.length === 0) {
        toast.warning('Splunk returned alerts but none had a valid name — skipped.');
        return;
      }

      const rows = valid.map(a => ({
        user_id:        user.id,
        alert_name:     a.alertName || a.splunkName,
        search:         a.search,
        cron_schedule:  a.cronSchedule ?? null,
        next_fire_time: a.nextFireTime ?? null,
        is_enabled:     a.isEnabled,
        alert_type:     a.alertType,
        splunk_name:    a.splunkName,
        actions:        a.actions,
        severity:       a.severity,
        updated_at:     new Date().toISOString(),
      }));

      const { error: upsertErr } = await supabase
        .from('splunk_saved_alerts')
        .upsert(rows, { onConflict: 'user_id,splunk_name' });

      if (upsertErr) throw new Error(upsertErr.message);

      // Build severity breakdown
      const breakdown: SeverityBreakdown = { critical: 0, high: 0, medium: 0, low: 0, total: rows.length };
      for (const r of rows) {
        const s = r.severity?.toLowerCase() as keyof SeverityBreakdown;
        if (s in breakdown) (breakdown[s] as number)++;
      }
      setImportBreakdown(breakdown);
      setBreakdownOpen(true);

      toast.success(`Imported ${rows.length} alert${rows.length !== 1 ? 's' : ''} from Splunk`);
      loadAlerts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('SplunkAlertsPanel importFromSplunk:', msg);
      toast.error('Import failed', { description: msg.slice(0, 200) });
    } finally {
      setImporting(false);
    }
  };

  const filtered = alerts.filter(a => {
    const matchSearch = !search ||
      a.alert_name.toLowerCase().includes(search.toLowerCase()) ||
      a.search.toLowerCase().includes(search.toLowerCase());
    const matchEnabled =
      filterEnabled === 'all'      ? true :
      filterEnabled === 'enabled'  ? a.is_enabled :
      !a.is_enabled;
    return matchSearch && matchEnabled;
  });

  const enabledCount  = alerts.filter(a => a.is_enabled).length;
  const disabledCount = alerts.length - enabledCount;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground">
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
          {enabledCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-teal-300">
              <Bell className="h-2.5 w-2.5" />{enabledCount} active
            </span>
          )}
          {disabledCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <BellOff className="h-2.5 w-2.5" />{disabledCount} disabled
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={importFromSplunk}
          disabled={importing || !config.splunkHost}
          className="h-8 gap-1.5 text-xs">
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {importing ? 'Importing…' : 'Import from Splunk'}
        </Button>
      </div>

      {/* No REST config warning */}
      {!config.splunkHost && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-950/15 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-300">Configure Splunk Host + Token in Settings → Splunk Connection to enable import and Run Now.</p>
        </div>
      )}

      {/* Search + filter */}
      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search alerts…"
              className="pl-6 h-7 text-xs" />
          </div>
          <div className="relative">
            <select
              value={filterEnabled}
              onChange={e => setFilterEnabled(e.target.value as typeof filterEnabled)}
              className="appearance-none h-7 rounded border border-border bg-secondary/30 px-2 pr-6 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All</option>
              <option value="enabled">Active only</option>
              <option value="disabled">Disabled only</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading saved alerts…
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No saved alerts imported yet.</p>
          <p className="text-xs mt-1">Click "Import from Splunk" to pull scheduled alerts from your Splunk instance.</p>
          <p className="text-xs mt-0.5 text-muted-foreground/60">Severity is auto-detected from SPL content. You can override it per-card after import.</p>
        </div>
      )}

      {!loading && alerts.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">No alerts match your search.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(a => (
            <AlertRow key={a.id} alert={a} onSeverityChange={handleSeverityChange} />
          ))}
        </div>
      )}

      {/* ── Severity Breakdown Dialog ────────────────────────────────────── */}
      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <BarChart2 className="h-4 w-4 text-primary shrink-0" />
              Import Complete — Severity Breakdown
            </DialogTitle>
          </DialogHeader>
          {importBreakdown && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {importBreakdown.total} alert{importBreakdown.total !== 1 ? 's' : ''} imported. Severity was auto-detected from SPL content and alert names.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'critical', label: 'Critical', cls: 'bg-red-900/20 border-red-700/40 text-red-300' },
                  { key: 'high',     label: 'High',     cls: 'bg-orange-900/20 border-orange-700/40 text-orange-300' },
                  { key: 'medium',   label: 'Medium',   cls: 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300' },
                  { key: 'low',      label: 'Low',      cls: 'bg-blue-900/20 border-blue-700/40 text-blue-300' },
                ] as const).map(({ key, label, cls }) => (
                  <div key={key} className={cn('rounded-lg border px-4 py-3 flex items-center justify-between', cls)}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                    <span className="text-xl font-bold tabular-nums">{importBreakdown[key]}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground text-pretty">
                Override severity on individual cards using the dropdown. Custom keyword rules can be configured in Settings → Severity Keyword Rules.
              </p>
              <Button size="sm" className="w-full h-9" onClick={() => setBreakdownOpen(false)}>
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
