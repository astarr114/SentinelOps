// SavedQueriesPanel — bookmark, categorize, and reuse SPL queries
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Bookmark, BookmarkCheck, Search, FolderOpen, Trash2, Edit3, Copy,
  ChevronDown, ChevronRight, Plus, X, Tag, Loader2, Sparkles, Play
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SplSavedQuery } from '@/types/types';

// ── Built-in SPL Templates ────────────────────────────────────────────────────
interface SplTemplate {
  id: string;
  name: string;
  description: string;
  spl: string; // may contain {service} and {time_window} placeholders
}

export const SPL_TEMPLATES: SplTemplate[] = [
  {
    id: 'tpl-error-rate',
    name: 'Error Rate Analysis',
    description: 'Analyze error rate trends for a service over time',
    spl: 'index=main service={service} earliest={time_window} | timechart span=1m count(eval(status>=400)) as errors, count as total | eval error_rate=round(errors/total*100,2)',
  },
  {
    id: 'tpl-latency-pct',
    name: 'Latency Percentiles (p50/p95/p99)',
    description: 'Calculate request latency percentiles for a service',
    spl: 'index=main service={service} earliest={time_window} | stats p50(latency) as p50_ms, p95(latency) as p95_ms, p99(latency) as p99_ms by endpoint | sort -p99_ms',
  },
  {
    id: 'tpl-deploy-corr',
    name: 'Deployment Correlation',
    description: 'Find deployments near the incident start time',
    spl: 'index=deployments service={service} earliest={time_window} | table _time, version, deployer, environment | sort -_time',
  },
  {
    id: 'tpl-top-errors',
    name: 'Top Error Messages',
    description: 'Show the most frequent error messages for a service',
    spl: 'index=main service={service} earliest={time_window} (status>=400 OR level=ERROR) | top limit=10 error_message | table error_message, count, percent',
  },
  {
    id: 'tpl-user-impact',
    name: 'User Impact (Distinct Users Affected)',
    description: 'Count distinct users receiving errors',
    spl: 'index=main service={service} earliest={time_window} status>=400 | stats dc(user_id) as affected_users, count as total_errors | eval pct=round(affected_users/total_errors*100,1)',
  },
  {
    id: 'tpl-availability',
    name: 'Service Availability',
    description: 'Calculate service availability percentage',
    spl: 'index=main service={service} earliest={time_window} | stats count(eval(status<400)) as success, count as total | eval availability_pct=round(success/total*100,3)',
  },
  {
    id: 'tpl-log-anomaly',
    name: 'Log Volume Anomaly Detection',
    description: 'Detect unusual log volume spikes using anomalydetection',
    spl: 'index=main service={service} earliest={time_window} | timechart span=1m count as log_volume | anomalydetection log_volume | where isOutlier=1',
  },
  {
    id: 'tpl-slow-endpoints',
    name: 'Slow Endpoint Detection',
    description: 'Identify endpoints with high average latency',
    spl: 'index=main service={service} earliest={time_window} | stats avg(latency) as avg_ms, count by endpoint | where avg_ms>1000 | sort -avg_ms | head 20',
  },
];

const BUILT_IN_CATEGORIES = ['General', 'Error Analysis', 'Latency', 'Deployment', 'Security', 'Custom'];

// ── Save Dialog ───────────────────────────────────────────────────────────────
interface SaveDialogProps {
  open: boolean;
  spl: string;
  initialName?: string;
  onSave: (name: string, category: string, description: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}

export function SaveQueryDialog({ open, spl, initialName = '', onSave, onClose }: SaveDialogProps) {
  const [name, setName]           = useState(initialName);
  const [category, setCategory]   = useState('General');
  const [description, setDesc]    = useState('');
  const [tagInput, setTagInput]   = useState('');
  const [tags, setTags]           = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);

  useEffect(() => { if (open) { setName(initialName); setCategory('General'); setDesc(''); setTags([]); setTagInput(''); } }, [open, initialName]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Query name is required'); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), category, description.trim(), tags);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BookmarkCheck className="h-4 w-4 text-primary" />
            Save SPL Query
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {/* SPL preview */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Query</p>
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-all line-clamp-3">{spl}</pre>
          </div>
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-normal">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Checkout error rate last 30m" className="h-8 text-sm bg-input border-border" />
          </div>
          {/* Category */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-normal">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full h-8 rounded-md border border-border bg-input text-sm text-foreground px-2 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {BUILT_IN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-normal">Description (optional)</label>
            <Textarea value={description} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What does this query do?" className="text-sm bg-input border-border resize-none" />
          </div>
          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-normal">Tags</label>
            <div className="flex gap-1.5">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag + Enter"
                className="h-8 text-sm bg-input border-border flex-1"
              />
              <Button size="sm" variant="secondary" onClick={addTag} className="h-8 w-8 p-0 shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    {t}
                    <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))}><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose} className="h-8 flex-1">Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkCheck className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save Query'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
interface SavedQueriesPanelProps {
  onRunQuery: (spl: string, name: string) => void;
  incidentService?: string;
  timeWindow?: string;
}

// Fill {service}/{time_window} placeholders with current incident context
function applyTemplateParams(spl: string, service?: string, timeWindow?: string): string {
  const svc = service || 'your-service';
  const tw  = timeWindow
    ? timeWindow.startsWith('-') ? timeWindow : `-${timeWindow}`
    : '-30m';
  return spl.replace(/\{service\}/g, svc).replace(/\{time_window\}/g, tw);
}

export function SavedQueriesPanel({ onRunQuery, incidentService, timeWindow }: SavedQueriesPanelProps) {
  const [queries, setQueries]           = useState<SplSavedQuery[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats]   = useState<Set<string>>(new Set());
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [showTemplates, setShowTemplates]   = useState(true);
  const [tplSearch, setTplSearch]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spl_saved_queries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setQueries(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load saved queries'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteQuery = async (id: string) => {
    try {
      const { error } = await supabase.from('spl_saved_queries').delete().eq('id', id);
      if (error) throw error;
      setQueries(prev => prev.filter(q => q.id !== id));
      toast.success('Query deleted');
    } catch { toast.error('Delete failed'); }
    setDeletingId(null);
  };

  const saveEditName = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase.from('spl_saved_queries').update({ name: editName.trim() }).eq('id', id);
      if (error) throw error;
      setQueries(prev => prev.map(q => q.id === id ? { ...q, name: editName.trim() } : q));
      toast.success('Renamed');
    } catch { toast.error('Rename failed'); }
    setEditingId(null);
  };

  const copyToClipboard = (spl: string) => {
    navigator.clipboard.writeText(spl).then(() => toast.success('Copied to clipboard'));
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCats(prev => {
      const n = new Set(prev);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  };

  // Filter
  const filtered = queries.filter(q => {
    const term = search.toLowerCase();
    if (term && !q.name.toLowerCase().includes(term) && !q.spl.toLowerCase().includes(term) && !q.tags.some(t => t.includes(term))) return false;
    if (activeCategory && q.category !== activeCategory) return false;
    return true;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, SplSavedQuery[]>>((acc, q) => {
    const cat = q.category || 'General';
    (acc[cat] ??= []).push(q);
    return acc;
  }, {});

  const categories = [...new Set(queries.map(q => q.category || 'General'))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search saved queries…"
            className="pl-8 h-8 text-sm bg-input border-border"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                !activeCategory ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:text-foreground'
              )}
            >All</button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                  activeCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:text-foreground'
                )}
              >
                {cat} <span className="opacity-60">({queries.filter(q => q.category === cat).length})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Templates section ─────────────────────────────────────────────── */}
      <div className="border-b border-border shrink-0">
        <button
          onClick={() => setShowTemplates(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          {showTemplates
            ? <ChevronDown  className="h-3 w-3 text-primary shrink-0" />
            : <ChevronRight className="h-3 w-3 text-primary shrink-0" />}
          <Sparkles className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[11px] font-semibold text-primary">Templates</span>
          <span className="ml-1 text-[10px] text-primary/60 italic">read-only</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{SPL_TEMPLATES.length}</span>
        </button>

        {showTemplates && (
          <div className="px-3 pt-2 pb-3 space-y-2">
            {/* Template search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="Filter templates…"
                className="pl-6 h-7 text-xs bg-input border-border"
              />
            </div>
            {/* Context hint */}
            {(incidentService || timeWindow) && (
              <p className="text-[10px] text-primary/70">
                Parameterized with:{' '}
                {incidentService && <strong className="text-primary">{incidentService}</strong>}
                {incidentService && timeWindow && ' · '}
                {timeWindow && <strong className="text-primary">{timeWindow}</strong>}
              </p>
            )}
            {/* Template cards */}
            <div className="space-y-1.5">
              {SPL_TEMPLATES
                .filter(t =>
                  !tplSearch ||
                  t.name.toLowerCase().includes(tplSearch.toLowerCase()) ||
                  t.description.toLowerCase().includes(tplSearch.toLowerCase())
                )
                .map(tpl => {
                  const resolved = applyTemplateParams(tpl.spl, incidentService, timeWindow);
                  return (
                    <div
                      key={tpl.id}
                      className="rounded-md border border-border bg-secondary/10 hover:bg-secondary/20 transition-colors p-2.5 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-foreground truncate">{tpl.name}</p>
                          <p className="text-[10px] text-muted-foreground">{tpl.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            title="Copy SPL"
                            onClick={() => { navigator.clipboard.writeText(resolved); toast.success('SPL copied'); }}
                            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            title="Load & run"
                            onClick={() => onRunQuery(resolved, tpl.name)}
                            className="h-5 w-5 flex items-center justify-center rounded text-primary hover:bg-primary/10"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <pre className="text-[9px] font-mono text-muted-foreground bg-secondary/20 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all line-clamp-2">
                        {resolved}
                      </pre>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Query list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Bookmark className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">{queries.length === 0 ? 'No saved queries yet' : 'No matches found'}</p>
            <p className="text-xs mt-1 text-muted-foreground/70">
              {queries.length === 0 ? 'Run a NL→SPL query and click the bookmark icon to save it.' : 'Try a different search term.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left bg-secondary/20 hover:bg-secondary/30 transition-colors"
                >
                  {collapsedCats.has(cat)
                    ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  }
                  <FolderOpen className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[11px] font-semibold text-foreground">{cat}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{items.length}</span>
                </button>

                {!collapsedCats.has(cat) && (
                  <div className="divide-y divide-border/50">
                    {items.map(q => (
                      <div key={q.id} className="p-3 space-y-2 hover:bg-secondary/10 transition-colors">
                        {/* Name row */}
                        <div className="flex items-start gap-2 min-w-0">
                          {editingId === q.id ? (
                            <div className="flex gap-1.5 flex-1 min-w-0">
                              <Input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEditName(q.id); if (e.key === 'Escape') setEditingId(null); }}
                                className="h-7 text-xs flex-1 bg-input border-border"
                                autoFocus
                              />
                              <Button size="sm" variant="secondary" onClick={() => saveEditName(q.id)} className="h-7 px-2 text-xs shrink-0">Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 w-7 p-0 shrink-0"><X className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{q.name}</p>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button title="Edit name" onClick={() => { setEditingId(q.id); setEditName(q.name); }} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button title="Copy SPL" onClick={() => copyToClipboard(q.spl)} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                                  <Copy className="h-3 w-3" />
                                </button>
                                {deletingId === q.id ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => deleteQuery(q.id)} className="text-[10px] text-destructive hover:text-destructive/80 font-medium px-1">Delete?</button>
                                    <button onClick={() => setDeletingId(null)} className="text-[10px] text-muted-foreground px-1">No</button>
                                  </div>
                                ) : (
                                  <button title="Delete" onClick={() => setDeletingId(q.id)} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        {/* SPL preview */}
                        <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/20 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all line-clamp-2">
                          {q.spl}
                        </pre>

                        {/* Tags */}
                        {q.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {q.tags.map(t => (
                              <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-secondary/50 border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                <Tag className="h-2 w-2" />{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description */}
                        {q.description && (
                          <p className="text-[10px] text-muted-foreground/80 italic">{q.description}</p>
                        )}

                        {/* Run button */}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onRunQuery(q.spl, q.name)}
                          className="h-7 w-full text-xs gap-1.5"
                        >
                          <Badge variant="outline" className="text-[9px] px-1 h-4 border-primary/40 text-primary bg-primary/10">SPL</Badge>
                          Run this query
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
