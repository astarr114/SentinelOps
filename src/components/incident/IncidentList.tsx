import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { SeverityBadge, StatusBadge } from '@/components/ui/badges';
import type { Incident, Severity, IncidentStatus } from '@/types/types';
import {
  Clock, ChevronRight, Search, Filter, X, AlertTriangle, FlaskConical,
  Check, ArrowUpDown, RotateCcw, ArrowUp, ArrowDown, ChevronDown, Webhook, ExternalLink,
  CheckCircle2, ListChecks, SquareCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

const ALL_SEVERITIES: Severity[]         = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ALL_STATUSES: IncidentStatus[]     = ['OPEN', 'INVESTIGATING', 'RESOLVED'];
const DEFAULT_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING'];
const PAGE_SIZE = 15;

type SortOption = 'newest' | 'oldest' | 'severity' | 'service' | 'status';
type SortDir    = 'asc' | 'desc';

// Options that support asc/desc flipping (newest/oldest are already direction-explicit)
const SORTABLE_OPTIONS = new Set<SortOption>(['severity', 'service', 'status']);

const SORT_OPTIONS: { value: SortOption; label: string; dirLabel?: [string, string] }[] = [
  { value: 'newest',   label: 'Newest first'  },
  { value: 'oldest',   label: 'Oldest first'  },
  { value: 'severity', label: 'Severity',      dirLabel: ['CRIT → LOW', 'LOW → CRIT'] },
  { value: 'service',  label: 'Service',       dirLabel: ['A → Z', 'Z → A']           },
  { value: 'status',   label: 'Status',        dirLabel: ['Open first', 'Resolved first'] },
];
const SEVERITY_ORDER: Record<Severity, number>       = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER:   Record<IncidentStatus, number> = { OPEN: 0, INVESTIGATING: 1, RESOLVED: 2 };

// ── localStorage helpers ────────────────────────────────────────────────────
const LS_KEYS = {
  severities:    'sentinel_filter_severities',
  statuses:      'sentinel_filter_statuses',
  hideSynthetic: 'sentinel_filter_hide_synthetic',
  sort:          'sentinel_filter_sort',
  sortDir:       'sentinel_filter_sort_dir',
} as const;

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function lsWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

interface IncidentListItemProps {
  incident: Incident;
  selected: boolean;
  onClick: () => void;
  /** Called after a successful resolve so parent can refresh */
  onResolve?: (id: string) => void;
  /** Other open incidents on same service for dedup indicator */
  duplicateOf?: string | null;
  showSyntheticBadge?: boolean;
  highlighted?: boolean;
  /** Bulk-select mode: show checkbox */
  bulkSelectMode?: boolean;
  /** Is this incident checked in bulk-select mode */
  bulkChecked?: boolean;
  onBulkToggle?: (id: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function IncidentListItem({ incident, selected, onClick, onResolve, duplicateOf, showSyntheticBadge, highlighted, bulkSelectMode, bulkChecked, onBulkToggle }: IncidentListItemProps) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setResolving(true);
    try {
      const now = new Date().toISOString();

      // For synthetic / static incidents the row may not exist in live_incidents yet.
      // Upsert the full row first so the subsequent UPDATE always hits a real DB row.
      if (incident.is_synthetic) {
        await supabase.from('live_incidents').upsert({
          id:           incident.id,
          title:        incident.title,
          service:      incident.service,
          severity:     incident.severity,
          status:       'OPEN',
          summary:      incident.summary ?? '',
          time_window:  incident.time_window ?? 'last_30m',
          opened_at:    incident.opened_at ?? now,
          is_synthetic: true,
        }, { onConflict: 'id', ignoreDuplicates: true });
      }

      const { error } = await supabase
        .from('live_incidents')
        .update({ status: 'RESOLVED', resolved_at: now })
        .eq('id', incident.id);
      if (error) throw error;
      toast.success(`Incident ${incident.id} marked as resolved`);
      onResolve?.(incident.id);
    } catch (err) {
      console.error('Resolve error:', err);
      toast.error('Failed to resolve incident. Please try again.');
    } finally {
      setResolving(false);
    }
  };
  const severityDot = {
    CRITICAL: 'dot-critical',
    HIGH:     'dot-high',
    MEDIUM:   'dot-medium',
    LOW:      'dot-low',
  }[incident.severity];

  return (
    <TooltipProvider delayDuration={300}>
      <button
        onClick={onClick}
        className={cn(
          'relative w-full text-left p-3.5 rounded-xl border transition-all duration-150 group outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'bg-primary/8 border-primary/35 shadow-md shadow-primary/5 glow-primary'
            : 'bg-card/80 border-border hover:border-border/90 hover:bg-card hover:shadow-sm',
          incident.severity === 'CRITICAL' && selected && 'animate-pulse-critical',
          highlighted && !selected && 'ring-2 ring-orange-400/60 border-orange-400/40 animate-pulse',
          bulkSelectMode && bulkChecked && 'ring-2 ring-primary/60 border-primary/40 bg-primary/5',
        )}
      >
        {/* Bulk-select checkbox overlay */}
        {bulkSelectMode && (
          <span
            className="absolute top-2.5 right-2.5 z-10"
            onClick={e => { e.stopPropagation(); onBulkToggle?.(incident.id); }}
          >
            <Checkbox
              checked={bulkChecked}
              className="h-4 w-4 border-2"
              aria-label={`Select incident ${incident.id}`}
            />
          </span>
        )}
        {/* Top row: ID + badges */}
        <div className={cn('flex items-center justify-between gap-2 mb-2.5', showSyntheticBadge && 'mt-4')}>
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('h-2 w-2 rounded-full shrink-0 shadow-sm', severityDot,
              incident.severity === 'CRITICAL' && 'animate-pulse shadow-red-500/40'
            )} />
            <span className="font-mono text-[11px] text-muted-foreground truncate">{incident.id}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <StatusBadge status={incident.status} />
            {duplicateOf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[200px] text-xs">
                  Possible duplicate: {duplicateOf} also affects {incident.service}
                </TooltipContent>
              </Tooltip>
            )}
            <ChevronRight className={cn(
              'h-3 w-3 text-muted-foreground/40 transition-all',
              selected && 'text-primary rotate-90'
            )} />
          </div>
        </div>

        {/* Synthetic TEST badge */}
        {showSyntheticBadge && (
          <span className="absolute top-2 left-2 flex items-center gap-0.5 bg-secondary border border-border text-[9px] font-bold text-muted-foreground px-1.5 py-0.5 rounded-md z-10">
            <FlaskConical className="h-2.5 w-2.5" />TEST
          </span>
        )}

        {/* Splunk webhook source badge */}
        {incident.source === 'splunk-webhook' && !showSyntheticBadge && (
          <span className="absolute top-2 left-2 flex items-center gap-0.5 badge-splunk text-[9px] font-bold px-1.5 py-0.5 rounded-md z-10">
            <Webhook className="h-2.5 w-2.5" />SPLUNK
          </span>
        )}

        {/* Title */}
        <p className="text-[13px] font-semibold text-foreground text-pretty mb-2 leading-snug line-clamp-2">
          {incident.title}
        </p>

        {/* Service + severity */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-mono text-muted-foreground/80 truncate">{incident.service}</span>
          <SeverityBadge severity={incident.severity} />
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-mono">{formatDate(incident.opened_at)} {formatTime(incident.opened_at)}</span>
        </div>

        {/* Tags */}
        {(incident.tags?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {incident.tags!.slice(0, 3).map(tag => (
              <span key={tag} className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-secondary/60 text-muted-foreground border border-border/60">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Splunk results deep-link */}
        {incident.splunk_results_link && (
          <a
            href={incident.splunk_results_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            View in Splunk
          </a>
        )}

        {/* Mark as Resolved button — only for non-resolved incidents */}
        {incident.status !== 'RESOLVED' && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all resolve-btn"
          >
            {resolving
              ? <><span className="h-3 w-3 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />Resolving…</>
              : <><CheckCircle2 className="h-3 w-3 shrink-0" />Mark as Resolved</>
            }
          </button>
        )}
      </button>
    </TooltipProvider>
  );
}

interface IncidentListProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResolve?: (id: string) => void;
  onBulkResolve?: (ids: string[]) => void;
  highlightedIds?: Set<string>;
}

export function IncidentList({ incidents, selectedId, onSelect, onResolve, onBulkResolve, highlightedIds = new Set() }: IncidentListProps) {
  // ── Persisted state ───────────────────────────────────────────────────────
  const [hideSynthetic, setHideSynthetic] = useState<boolean>(() =>
    lsRead(LS_KEYS.hideSynthetic, true)
  );
  const [keyword, setKeyword]             = useState('');
  const [severities, setSeverities]       = useState<Set<Severity>>(() =>
    new Set(lsRead<Severity[]>(LS_KEYS.severities, ALL_SEVERITIES))
  );
  const [statuses, setStatuses]           = useState<Set<IncidentStatus>>(() =>
    new Set(lsRead<IncidentStatus[]>(LS_KEYS.statuses, DEFAULT_STATUSES))
  );
  const [sortBy, setSortBy]     = useState<SortOption>(() => lsRead<SortOption>(LS_KEYS.sort,    'newest'));
  const [sortDir, setSortDir]   = useState<SortDir>(  () => lsRead<SortDir>(   LS_KEYS.sortDir, 'desc'));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Bulk-select mode ──────────────────────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // ── Popover open state ────────────────────────────────────────────────────
  const [severityOpen, setSeverityOpen] = useState(false);
  const [statusOpen,   setStatusOpen]   = useState(false);
  const [sortOpen,     setSortOpen]     = useState(false);

  // ── Keyboard focus index per popover ──────────────────────────────────────
  const [sevFocusIdx,  setSevFocusIdx]  = useState(-1);
  const [stsFocusIdx,  setStsFocusIdx]  = useState(-1);
  const [srtFocusIdx,  setSrtFocusIdx]  = useState(-1);

  const severityRef = useRef<HTMLDivElement>(null);
  const statusRef   = useRef<HTMLDivElement>(null);
  const sortRef     = useRef<HTMLDivElement>(null);

  // ── Persist to localStorage ───────────────────────────────────────────────
  useEffect(() => { lsWrite(LS_KEYS.hideSynthetic, hideSynthetic); }, [hideSynthetic]);
  useEffect(() => { lsWrite(LS_KEYS.severities, [...severities]);  }, [severities]);
  useEffect(() => { lsWrite(LS_KEYS.statuses,   [...statuses]);    }, [statuses]);
  useEffect(() => { lsWrite(LS_KEYS.sort,    sortBy);              }, [sortBy]);
  useEffect(() => { lsWrite(LS_KEYS.sortDir, sortDir);             }, [sortDir]);

  // ── Reset focus index when popover closes ────────────────────────────────
  useEffect(() => { if (!severityOpen) setSevFocusIdx(-1); }, [severityOpen]);
  useEffect(() => { if (!statusOpen)   setStsFocusIdx(-1); }, [statusOpen]);
  useEffect(() => { if (!sortOpen)     setSrtFocusIdx(-1); }, [sortOpen]);

  // ── Close all popovers on outside click ──────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (severityRef.current && !severityRef.current.contains(e.target as Node)) setSeverityOpen(false);
      if (statusRef.current   && !statusRef.current.contains(e.target as Node))   setStatusOpen(false);
      if (sortRef.current     && !sortRef.current.contains(e.target as Node))     setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Reset visible count when filters change ──────────────────────────────
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [keyword, severities, statuses, hideSynthetic, sortBy, sortDir]);

  const syntheticCount = useMemo(
    () => incidents.filter(i => i.is_synthetic).length,
    [incidents]
  );

  const openByService = useMemo(() => {
    const map = new Map<string, string[]>();
    incidents.forEach(inc => {
      if (inc.status === 'OPEN') {
        const arr = map.get(inc.service) ?? [];
        arr.push(inc.id);
        map.set(inc.service, arr);
      }
    });
    return map;
  }, [incidents]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return incidents.filter(inc => {
      if (hideSynthetic && inc.is_synthetic) return false;
      if (!severities.has(inc.severity))     return false;
      if (!statuses.has(inc.status))         return false;
      if (kw && !inc.title.toLowerCase().includes(kw)
             && !inc.service.toLowerCase().includes(kw)
             && !inc.id.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [incidents, hideSynthetic, severities, statuses, keyword]);

  // ── Sort with direction ───────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'newest':   cmp = new Date(b.opened_at ?? b.id).getTime() - new Date(a.opened_at ?? a.id).getTime(); break;
        case 'oldest':   cmp = new Date(a.opened_at ?? a.id).getTime() - new Date(b.opened_at ?? b.id).getTime(); break;
        case 'severity': cmp = (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) * dir; break;
        case 'service':  cmp = a.service.localeCompare(b.service) * dir;                         break;
        case 'status':   cmp = (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;          break;
      }
      return cmp;
    });
  }, [filtered, sortBy, sortDir]);

  // ── Pagination slice ──────────────────────────────────────────────────────
  const visible      = sorted.slice(0, visibleCount);
  const hasMore      = sorted.length > visibleCount;

  const toggleSeverity = useCallback((s: Severity) => {
    setSeverities(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);
  const toggleStatus = useCallback((s: IncidentStatus) => {
    setStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);

  const isFiltered = useMemo(
    () => keyword.trim() !== ''
       || severities.size < ALL_SEVERITIES.length
       || statuses.size < ALL_STATUSES.length
       || !hideSynthetic,
    [keyword, severities, statuses, hideSynthetic]
  );

  const resetAll = useCallback(() => {
    setKeyword('');
    setSeverities(new Set(ALL_SEVERITIES));
    setStatuses(new Set(DEFAULT_STATUSES));
    setHideSynthetic(true);
    setSortBy('newest');
    setSortDir('desc');
  }, []);

  // ── Bulk-select helpers ───────────────────────────────────────────────────
  const toggleBulkMode = useCallback(() => {
    setBulkMode(v => !v);
    setBulkSelected(new Set());
  }, []);

  const toggleBulkItem = useCallback((id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setBulkSelected(new Set(visible.map(i => i.id)));
  }, [visible]);  // eslint-disable-line react-hooks/exhaustive-deps

  const deselectAll = useCallback(() => {
    setBulkSelected(new Set());
  }, []);

  const handleBulkResolve = useCallback(async () => {
    const ids = [...bulkSelected].filter(id => {
      const inc = incidents.find(i => i.id === id);
      return inc && inc.status !== 'RESOLVED';
    });
    if (ids.length === 0) { setShowBulkConfirm(false); return; }
    try {
      const { error } = await supabase
        .from('live_incidents')
        .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} incident${ids.length > 1 ? 's' : ''} resolved`);
      onBulkResolve?.(ids);
      setBulkSelected(new Set());
      setBulkMode(false);
    } catch {
      toast.error('Bulk resolve failed — please try again');
    } finally {
      setShowBulkConfirm(false);
    }
  }, [bulkSelected, incidents, onBulkResolve]);

  // Toggle sort direction (only for sortable options)
  const toggleSortDir = useCallback(() => {
    if (SORTABLE_OPTIONS.has(sortBy)) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
  }, [sortBy]);

  // ── Keyboard navigation helpers ───────────────────────────────────────────
  const handleKeyNav = useCallback((
    e: React.KeyboardEvent,
    listLen: number,
    focusIdx: number,
    setFocusIdx: (i: number) => void,
    onSelect: (i: number) => void,
    close: () => void,
  ) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(Math.min(focusIdx + 1, listLen - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(Math.max(focusIdx - 1, 0)); }
    if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); onSelect(focusIdx); }
    if (e.key === 'Escape')    { e.preventDefault(); close(); }
  }, []);

  const openCount     = incidents.filter(i => i.status !== 'RESOLVED').length;
  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED').length;
  const activeSortOpt = SORT_OPTIONS.find(o => o.value === sortBy)!;
  const sortChipLabel = sortBy === 'newest' || sortBy === 'oldest'
    ? activeSortOpt.label
    : `${activeSortOpt.label}: ${activeSortOpt.dirLabel?.[sortDir === 'desc' ? 0 : 1]}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 bg-sidebar-background/60">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-foreground tracking-tight">Incidents</h2>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="rounded-md px-2 py-0.5 text-[10px] font-bold badge-crit animate-pulse">
                {criticalCount} CRIT
              </span>
            )}
            <span className="rounded-md px-2 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground border border-border">
              {openCount} open
            </span>
            <button
              onClick={toggleBulkMode}
              title={bulkMode ? 'Exit bulk-select mode' : 'Bulk-select incidents'}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md border transition-colors',
                bulkMode
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          Select an incident to analyze
          <span className="ml-1.5 hidden lg:inline text-[10px] text-muted-foreground/40">
            · j/k to navigate · Enter to analyze
          </span>
        </p>
      </div>

      {/* Filters bar */}
      <div className="px-2 pt-2 pb-1.5 border-b border-border shrink-0 space-y-1.5">
        {/* Keyword search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="Search incidents…"
            className="h-8 pl-8 pr-7 text-xs bg-secondary/30 border-border focus-visible:ring-primary"
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter + sort chips row */}
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* ── Severity popover ── */}
          <div ref={severityRef} className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSeverityOpen(v => !v); setStatusOpen(false); setSortOpen(false); }}
              onKeyDown={e => {
                if (!severityOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                  e.preventDefault(); setSeverityOpen(true); setSevFocusIdx(0);
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={severityOpen}
              className={cn(
                'h-7 px-2 text-[10px] gap-1 border-border',
                severities.size < ALL_SEVERITIES.length && 'border-primary/50 text-primary'
              )}
            >
              <Filter className="h-3 w-3" />
              Severity
              {severities.size < ALL_SEVERITIES.length && (
                <span className="ml-0.5 bg-primary/20 text-primary px-1 rounded-full">{severities.size}</span>
              )}
            </Button>
            {severityOpen && (
              <div
                className="absolute left-0 top-8 z-50 w-44 rounded-md border border-border bg-popover shadow-md py-1"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Filter by severity"
                onKeyDown={e => handleKeyNav(
                  e,
                  ALL_SEVERITIES.length,
                  sevFocusIdx,
                  setSevFocusIdx,
                  i => toggleSeverity(ALL_SEVERITIES[i]),
                  () => setSeverityOpen(false),
                )}
                tabIndex={-1}
              >
                <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Severity</p>
                <div className="h-px bg-border mx-1 mb-1" />
                {ALL_SEVERITIES.map((s, i) => (
                  <button
                    key={s}
                    role="option"
                    aria-selected={severities.has(s)}
                    tabIndex={0}
                    onFocus={() => setSevFocusIdx(i)}
                    onClick={() => toggleSeverity(s)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors outline-none',
                      sevFocusIdx === i && 'bg-accent'
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center h-3.5 w-3.5 rounded border border-border shrink-0',
                      severities.has(s) && 'bg-primary border-primary'
                    )}>
                      {severities.has(s) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Status popover ── */}
          <div ref={statusRef} className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setStatusOpen(v => !v); setSeverityOpen(false); setSortOpen(false); }}
              onKeyDown={e => {
                if (!statusOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                  e.preventDefault(); setStatusOpen(true); setStsFocusIdx(0);
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={statusOpen}
              className={cn(
                'h-7 px-2 text-[10px] gap-1 border-border',
                statuses.size < ALL_STATUSES.length && 'border-primary/50 text-primary'
              )}
            >
              Status
              {statuses.size < ALL_STATUSES.length && (
                <span className="ml-0.5 bg-primary/20 text-primary px-1 rounded-full">{statuses.size}</span>
              )}
            </Button>
            {statusOpen && (
              <div
                className="absolute left-0 top-8 z-50 w-48 rounded-md border border-border bg-popover shadow-md py-1"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Filter by status"
                onKeyDown={e => handleKeyNav(
                  e,
                  ALL_STATUSES.length,
                  stsFocusIdx,
                  setStsFocusIdx,
                  i => toggleStatus(ALL_STATUSES[i]),
                  () => setStatusOpen(false),
                )}
                tabIndex={-1}
              >
                <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                <div className="h-px bg-border mx-1 mb-1" />
                {ALL_STATUSES.map((s, i) => (
                  <button
                    key={s}
                    role="option"
                    aria-selected={statuses.has(s)}
                    tabIndex={0}
                    onFocus={() => setStsFocusIdx(i)}
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors outline-none',
                      stsFocusIdx === i && 'bg-accent'
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center h-3.5 w-3.5 rounded border border-border shrink-0',
                      statuses.has(s) && 'bg-primary border-primary'
                    )}>
                      {statuses.has(s) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sort popover + direction toggle ── */}
          <div className="flex items-center gap-0.5">
            <div ref={sortRef} className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSortOpen(v => !v); setSeverityOpen(false); setStatusOpen(false); }}
                onKeyDown={e => {
                  if (!sortOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                    e.preventDefault(); setSortOpen(true); setSrtFocusIdx(0);
                  }
                }}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                className={cn(
                  'h-7 px-2 text-[10px] gap-1 border-border rounded-r-none border-r-0',
                  sortBy !== 'newest' && 'border-primary/50 text-primary'
                )}
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortBy !== 'newest' ? activeSortOpt.label : 'Sort'}
              </Button>
              {sortOpen && (
                <div
                  className="absolute left-0 top-8 z-50 w-52 rounded-md border border-border bg-popover shadow-md py-1"
                  role="listbox"
                  aria-label="Sort incidents"
                  onKeyDown={e => handleKeyNav(
                    e,
                    SORT_OPTIONS.length,
                    srtFocusIdx,
                    setSrtFocusIdx,
                    i => { setSortBy(SORT_OPTIONS[i].value); setSortOpen(false); },
                    () => setSortOpen(false),
                  )}
                  tabIndex={-1}
                >
                  <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sort by</p>
                  <div className="h-px bg-border mx-1 mb-1" />
                  {SORT_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.value}
                      role="option"
                      aria-selected={sortBy === opt.value}
                      tabIndex={0}
                      onFocus={() => setSrtFocusIdx(i)}
                      onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                      className={cn(
                        'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors outline-none',
                        srtFocusIdx === i && 'bg-accent'
                      )}
                    >
                      <span className={cn(
                        'flex items-center justify-center h-3.5 w-3.5 rounded-full border border-border shrink-0',
                        sortBy === opt.value && 'bg-primary border-primary'
                      )}>
                        {sortBy === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                      <span className="flex-1 text-left">{opt.label}</span>
                      {opt.dirLabel && sortBy === opt.value && (
                        <span className="text-[9px] text-muted-foreground">{opt.dirLabel[sortDir === 'desc' ? 0 : 1]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Direction toggle — only when a sortable option is active */}
            {SORTABLE_OPTIONS.has(sortBy) && (
              <button
                onClick={toggleSortDir}
                className="h-7 w-7 flex items-center justify-center rounded-l-none rounded-r-md border border-border border-l-0 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={`Direction: ${sortDir === 'desc' ? activeSortOpt.dirLabel?.[0] : activeSortOpt.dirLabel?.[1]} — click to flip`}
                aria-label="Toggle sort direction"
              >
                {sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              </button>
            )}
          </div>

          {/* Synthetic toggle */}
          <button
            onClick={() => setHideSynthetic(v => !v)}
            className={cn(
              'h-7 flex items-center gap-1 px-2 rounded-md border text-[10px] font-medium transition-colors',
              hideSynthetic
                ? 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                : 'border-amber-500/50 text-amber-400 bg-amber-950/20'
            )}
            title={hideSynthetic ? 'Show synthetic test incidents' : 'Hide synthetic test incidents'}
          >
            <FlaskConical className="h-3 w-3" />
            {hideSynthetic ? (
              syntheticCount > 0
                ? <><span>Synthetics</span><span className="bg-secondary px-1 rounded-full">{syntheticCount} hidden</span></>
                : 'Synthetics'
            ) : 'Showing tests'}
          </button>

          {/* Reset All */}
          {(isFiltered || sortBy !== 'newest') && (
            <button
              onClick={resetAll}
              className="h-7 flex items-center gap-1 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/50 border border-border/50 hover:border-border"
              title="Reset all filters and sorting to defaults"
            >
              <RotateCcw className="h-3 w-3" />Reset All
            </button>
          )}
        </div>

        {/* Result count + active sort label */}
        {(filtered.length !== incidents.length || sortBy !== 'newest') && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {filtered.length} of {incidents.length} incidents
            </span>
            {sortBy !== 'newest' && (
              <span className="text-[10px] text-muted-foreground/70 truncate max-w-[140px]" title={sortChipLabel}>
                ↕ {sortChipLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bulk-select action bar */}
      {bulkMode && (
        <div className="px-3 py-2 border-b border-border shrink-0 bg-primary/5 flex items-center gap-2 flex-wrap">
          <button
            onClick={selectAllVisible}
            className="h-6 flex items-center gap-1 px-2 text-[10px] font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <SquareCheck className="h-3 w-3" />Select all
          </button>
          <button
            onClick={deselectAll}
            className="h-6 flex items-center gap-1 px-2 text-[10px] font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <X className="h-3 w-3" />Deselect all
          </button>
          <span className="flex-1 text-[10px] text-muted-foreground text-right">
            {bulkSelected.size > 0 ? `${bulkSelected.size} selected` : 'None selected'}
          </span>
          <button
            onClick={() => bulkSelected.size > 0 && setShowBulkConfirm(true)}
            disabled={bulkSelected.size === 0}
            className={cn(
              'h-6 flex items-center gap-1 px-2.5 text-[10px] font-semibold rounded-md transition-colors',
              bulkSelected.size > 0
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            Resolve {bulkSelected.size > 0 ? `(${bulkSelected.size})` : 'Selected'}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-3">
            <Search className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No incidents match your filters</p>
            <button onClick={resetAll} className="mt-2 text-[10px] text-primary hover:underline">
              Reset filters
            </button>
          </div>
        ) : (
          <>
            {visible.map(incident => {
              const sameServiceOpen = (openByService.get(incident.service) ?? []).filter(id => id !== incident.id);
              const duplicateOf     = incident.status === 'OPEN' && sameServiceOpen.length > 0 ? sameServiceOpen[0] : null;
              return (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  selected={selectedId === incident.id}
                  onClick={() => bulkMode ? toggleBulkItem(incident.id) : onSelect(incident.id)}
                  onResolve={onResolve}
                  duplicateOf={duplicateOf}
                  showSyntheticBadge={!hideSynthetic && !!incident.is_synthetic}
                  highlighted={highlightedIds.has(incident.id)}
                  bulkSelectMode={bulkMode}
                  bulkChecked={bulkSelected.has(incident.id)}
                  onBulkToggle={toggleBulkItem}
                />
              );
            })}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/50 border border-dashed border-border"
              >
                <ChevronDown className="h-3 w-3" />
                Load {Math.min(PAGE_SIZE, sorted.length - visibleCount)} more
                <span className="text-muted-foreground/50">({sorted.length - visibleCount} remaining)</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border shrink-0 bg-sidebar-background/60">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">SPLUNK · DEMO</span>
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
          Set SPLUNK_HOST in Settings to connect live data
        </p>
      </div>

      {/* Bulk-resolve confirmation dialog */}
      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve {bulkSelected.size} incident{bulkSelected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all selected incidents as RESOLVED and stamp a resolved timestamp. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkResolve}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Resolve all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
