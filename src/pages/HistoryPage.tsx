import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { getIncidents } from '@/lib/mockDataService';
import { SeverityBadge, StatusBadge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Incident, Severity, IncidentStatus } from '@/types/types';
import {
  ArrowLeft, Search, X, ChevronUp, ChevronDown,
  ChevronsUpDown, Calendar, RefreshCw, Shield,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

// ── Types ──────────────────────────────────────────────────────────────────
type SortCol = 'id' | 'title' | 'service' | 'severity' | 'status' | 'opened_at' | 'resolved_at' | 'mttr';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [25, 50, 100] as const;
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED'];
const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER: Record<IncidentStatus, number> = { OPEN: 0, INVESTIGATING: 1, RESOLVED: 2 };

function computeMttr(inc: Incident): number | null {
  if (inc.status !== 'RESOLVED' || !inc.resolved_at) return null;
  const opened = new Date(inc.opened_at).getTime();
  const resolved = new Date(inc.resolved_at).getTime();
  return Math.round((resolved - opened) / 60_000);
}

function fmtTs(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function SortIcon({ col, active, dir }: { col: SortCol; active: SortCol; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />;
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { theme } = useTheme();
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Sort ───────────────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<SortCol>('opened_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(50);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('live_incidents')
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(500);

      const liveRows: Incident[] = Array.isArray(data) ? data.map(r => ({
        id: r.id,
        title: r.title,
        service: r.service ?? 'unknown',
        severity: r.severity as Severity,
        status: r.status as IncidentStatus,
        opened_at: r.opened_at,
        resolved_at: r.resolved_at ?? null,
        summary: r.summary ?? '',
        time_window: r.time_window ?? 'last_30m',
        is_synthetic: r.is_synthetic ?? false,
        source: r.source ?? 'manual',
        splunk_results_link: r.splunk_results_link ?? null,
      })) : [];

      // Merge with static demo incidents, live takes precedence
      const staticRows = getIncidents();
      const liveIds = new Set(liveRows.map(r => r.id));
      const merged = [...liveRows, ...staticRows.filter(s => !liveIds.has(s.id))];
      setAllIncidents(merged);
    } catch {
      // Fall back to static data only
      setAllIncidents(getIncidents());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  // ── Derived: unique services ───────────────────────────────────────────────
  const services = useMemo(() => {
    const s = new Set(allIncidents.map(i => i.service));
    return ['all', ...Array.from(s).sort()];
  }, [allIncidents]);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;

    return allIncidents.filter(inc => {
      if (statusFilter !== 'all' && inc.status !== statusFilter) return false;
      if (severityFilter !== 'all' && inc.severity !== severityFilter) return false;
      if (serviceFilter !== 'all' && inc.service !== serviceFilter) return false;
      if (kw && !inc.id.toLowerCase().includes(kw)
             && !inc.title.toLowerCase().includes(kw)
             && !inc.service.toLowerCase().includes(kw)) return false;
      if (from && new Date(inc.opened_at).getTime() < from) return false;
      if (to   && new Date(inc.opened_at).getTime() > to)   return false;
      return true;
    });
  }, [allIncidents, keyword, statusFilter, severityFilter, serviceFilter, dateFrom, dateTo]);

  // ── Sorted ─────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const d = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortCol) {
        case 'id':          return a.id.localeCompare(b.id) * d;
        case 'title':       return a.title.localeCompare(b.title) * d;
        case 'service':     return a.service.localeCompare(b.service) * d;
        case 'severity':    return (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) * d;
        case 'status':      return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * d;
        case 'opened_at':   return (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()) * d;
        case 'resolved_at': {
          const ta = a.resolved_at ? new Date(a.resolved_at).getTime() : 0;
          const tb = b.resolved_at ? new Date(b.resolved_at).getTime() : 0;
          return (ta - tb) * d;
        }
        case 'mttr': {
          const ma = computeMttr(a) ?? -1;
          const mb = computeMttr(b) ?? -1;
          return (ma - mb) * d;
        }
        default: return 0;
      }
    });
  }, [filtered, sortCol, sortDir]);

  // ── Paginated ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const resetFilters = () => {
    setKeyword(''); setStatusFilter('all'); setSeverityFilter('all');
    setServiceFilter('all'); setDateFrom(''); setDateTo(''); setPage(1);
  };

  const hasFilters = keyword || statusFilter !== 'all' || severityFilter !== 'all'
    || serviceFilter !== 'all' || dateFrom || dateTo;

  const thCls = (col: SortCol) => cn(
    'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors',
    sortCol === col && 'text-primary'
  );

  return (
    <div className={cn('min-h-screen flex flex-col bg-background', theme)}>
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 bg-sidebar-background/60 backdrop-blur">
        <Link to="/">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Button>
        </Link>
        <div className="h-5 w-px bg-border" />
        <Shield className="h-5 w-5 text-primary shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-foreground leading-none">Incident History</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">All incidents — open and resolved</p>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={loadIncidents}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </header>

      <main className="flex-1 min-h-0 p-4 md:p-6 space-y-4">
        {/* Filter controls */}
        <div className="flex flex-col md:flex-row gap-2 flex-wrap">
          {/* Keyword */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1); }}
              placeholder="Search ID, title, service…"
              className="h-9 pl-8 pr-7 text-sm"
            />
            {keyword && (
              <button onClick={() => { setKeyword(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status */}
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
            <SelectTrigger className="h-9 w-[145px] text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Severity */}
          <Select value={severityFilter} onValueChange={v => { setSeverityFilter(v as typeof severityFilter); setPage(1); }}>
            <SelectTrigger className="h-9 w-[145px] text-sm">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Service */}
          <Select value={serviceFilter} onValueChange={v => { setServiceFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              {services.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All Services' : s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 w-[140px] text-sm"
              title="From date"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 w-[140px] text-sm"
              title="To date"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />Clear filters
            </Button>
          )}
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${sorted.length} incident${sorted.length !== 1 ? 's' : ''} found`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows:</span>
            {PAGE_SIZES.map(s => (
              <button
                key={s}
                onClick={() => { setPageSize(s); setPage(1); }}
                className={cn(
                  'px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
                  pageSize === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-x-auto w-full max-w-full bg-card min-w-0">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                {([
                  ['id',          'ID'],
                  ['title',       'Title'],
                  ['service',     'Service'],
                  ['severity',    'Severity'],
                  ['status',      'Status'],
                  ['opened_at',   'Opened'],
                  ['resolved_at', 'Resolved'],
                  ['mttr',        'MTTR (min)'],
                ] as [SortCol, string][]).map(([col, label]) => (
                  <th key={col} className={thCls(col)} onClick={() => handleSort(col)}>
                    <span className="flex items-center gap-1">
                      {label}
                      <SortIcon col={col} active={sortCol} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <p className="text-sm text-muted-foreground">No incidents match your filters</p>
                    {hasFilters && (
                      <button onClick={resetFilters} className="mt-2 text-xs text-primary hover:underline">
                        Clear all filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((inc, idx) => {
                  const mttr = computeMttr(inc);
                  return (
                    <tr
                      key={inc.id}
                      className={cn(
                        'border-b border-border/40 transition-colors cursor-default',
                        idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10',
                        'hover:bg-primary/5'
                      )}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-muted-foreground">{inc.id}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[280px]">
                        <span className="text-xs text-foreground line-clamp-2">{inc.title}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">{inc.service}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <SeverityBadge severity={inc.severity} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground font-mono">{fmtTs(inc.opened_at)}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground font-mono">{fmtTs(inc.resolved_at)}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {mttr !== null ? (
                          <span className={cn(
                            'text-xs font-mono font-semibold',
                            mttr < 30  ? 'text-green-500' :
                            mttr < 60  ? 'text-yellow-500' :
                            mttr < 120 ? 'text-orange-500' : 'text-red-500'
                          )}>{mttr}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && sorted.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages} · {sorted.length} total
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="h-7 px-2 text-xs"
              >
                ← Prev
              </Button>
              {/* Page number chips — show up to 7 */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => {
                  if (totalPages <= 7) return true;
                  return p === 1 || p === totalPages || Math.abs(p - safePage) <= 2;
                })
                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                  if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={cn(
                          'h-7 min-w-[28px] px-2 rounded text-xs font-medium transition-colors',
                          safePage === p
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        )}
                      >{p}</button>
                    )
                )
              }
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="h-7 px-2 text-xs"
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
