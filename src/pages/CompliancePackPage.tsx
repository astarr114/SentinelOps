import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Sun, Moon, FileText, RefreshCw, Plus, Download,
  Loader2, CheckCircle2, Clock, AlertTriangle, Shield, Database,
  BarChart2, Trash2, Eye, Zap,
} from 'lucide-react';

type Framework = 'SOC2' | 'ISO27001' | 'HIPAA' | 'PCI-DSS' | 'GDPR' | 'NIST';
type PackStatus = 'draft' | 'generating' | 'ready' | 'exported';

interface CompliancePack {
  id: string;
  title: string;
  framework: Framework;
  period_start: string;
  period_end: string;
  status: PackStatus;
  generated_by: string | null;
  evidence_count: number;
  download_url: string | null;
  created_at: string;
  updated_at: string;
}

const FW_META: Record<Framework, { label: string; color: string; bg: string }> = {
  SOC2:     { label: 'SOC 2',     color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
  ISO27001: { label: 'ISO 27001', color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
  HIPAA:    { label: 'HIPAA',     color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'PCI-DSS':{ label: 'PCI DSS',   color: 'text-yellow-400',  bg: 'bg-yellow-500/10'  },
  GDPR:     { label: 'GDPR',      color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
  NIST:     { label: 'NIST',      color: 'text-red-400',     bg: 'bg-red-500/10'     },
};

const STATUS_META: Record<PackStatus, { label: string; color: string; Icon: React.ElementType }> = {
  draft:      { label: 'Draft',      color: 'text-muted-foreground', Icon: Clock         },
  generating: { label: 'Generating…', color: 'text-primary',         Icon: Loader2       },
  ready:      { label: 'Ready',       color: 'text-emerald-400',     Icon: CheckCircle2  },
  exported:   { label: 'Exported',    color: 'text-blue-400',        Icon: Download      },
};

// Evidence categories for a compliance pack detail view
const EVIDENCE_CATEGORIES = [
  { icon: Shield,    label: 'Access Controls',       count: 24, pct: 100 },
  { icon: Database,  label: 'Incident Response',     count: 38, pct: 100 },
  { icon: BarChart2, label: 'Monitoring & Logging',  count: 61, pct: 100 },
  { icon: FileText,  label: 'Change Management',     count: 18, pct: 95  },
  { icon: Zap,       label: 'Vulnerability Mgmt',    count: 6,  pct: 83  },
];

function generateMockJSON(pack: CompliancePack): string {
  return JSON.stringify({
    compliance_pack: {
      id: pack.id, title: pack.title, framework: pack.framework,
      period: { start: pack.period_start, end: pack.period_end },
      generated_at: new Date().toISOString(),
      evidence_count: pack.evidence_count,
      categories: EVIDENCE_CATEGORIES.map(c => ({
        name: c.label, evidence_items: c.count, compliance_pct: c.pct,
      })),
      attestation: 'Evidence collected from SentinelOps incident management system.',
    },
  }, null, 2);
}

function PackCard({ pack, onGenerate, onExport, onDelete }: {
  pack: CompliancePack;
  onGenerate: (p: CompliancePack) => void;
  onExport: (p: CompliancePack) => void;
  onDelete: (p: CompliancePack) => void;
}) {
  const fw = FW_META[pack.framework];
  const sm = STATUS_META[pack.status];
  const StatusIcon = sm.Icon;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', fw.bg, fw.color)}>{fw.label}</span>
            <div className="flex items-center gap-1">
              <StatusIcon className={cn('h-3 w-3', sm.color, pack.status === 'generating' && 'animate-spin')} />
              <span className={cn('text-[10px] font-semibold', sm.color)}>{sm.label}</span>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-foreground text-balance">{pack.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(pack.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' – '}
            {new Date(pack.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button onClick={() => onDelete(pack)} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {pack.status === 'ready' || pack.status === 'exported' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{pack.evidence_count} evidence items</span>
            {pack.generated_by && <span>by {pack.generated_by}</span>}
          </div>
          {EVIDENCE_CATEGORIES.map(c => (
            <div key={c.label} className="flex items-center gap-2">
              <c.icon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{c.label}</span>
              <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden shrink-0">
                <div className="h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
              </div>
              <span className={cn('text-[10px] font-mono w-8 text-right shrink-0', c.pct === 100 ? 'text-emerald-400' : 'text-yellow-400')}>{c.pct}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-20 rounded bg-muted/20 border border-border/50">
          <p className="text-xs text-muted-foreground">No evidence collected yet</p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2">
        {pack.status === 'draft' && (
          <Button size="sm" onClick={() => onGenerate(pack)}
            className="flex-1 h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            <Zap className="h-3.5 w-3.5" />Generate Evidence Pack
          </Button>
        )}
        {pack.status === 'generating' && (
          <div className="flex-1 h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground rounded-md border border-border bg-muted/20">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Collecting evidence…
          </div>
        )}
        {(pack.status === 'ready' || pack.status === 'exported') && (
          <Button size="sm" variant="secondary" onClick={() => onExport(pack)}
            className="flex-1 h-8 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />Export JSON
          </Button>
        )}
      </div>
    </div>
  );
}

function NewPackDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '', framework: 'SOC2' as Framework,
    period_start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('compliance_packs').insert({
      ...form,
      status: 'draft',
      evidence_count: 0,
    });
    setSaving(false);
    if (error) { toast.error('Failed to create pack: ' + error.message); return; }
    toast.success('Compliance pack created');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />New Compliance Pack</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Title</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="SOC 2 Type II — Q1 2026" className="bg-secondary/30 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Compliance Framework</label>
            <select value={form.framework} onChange={e => setForm(f => ({ ...f, framework: e.target.value as Framework }))}
              className="h-9 w-full rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
              {Object.entries(FW_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Period Start</label>
              <Input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} className="bg-secondary/30 h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Period End</label>
              <Input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} className="bg-secondary/30 h-9 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-9 bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Creating…</> : 'Create Pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CompliancePackPage() {
  const { theme, toggleTheme } = useTheme();
  const [packs, setPacks]     = useState<CompliancePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CompliancePack | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('compliance_packs').select('*').order('created_at', { ascending: false }).limit(50);
    setPacks(Array.isArray(data) ? data as CompliancePack[] : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (pack: CompliancePack) => {
    // Mark as generating
    await supabase.from('compliance_packs').update({ status: 'generating', updated_at: new Date().toISOString() }).eq('id', pack.id);
    setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, status: 'generating' } : p));
    toast.info('Collecting evidence from incident database…');

    // Simulate collection delay
    setTimeout(async () => {
      const now = new Date().toISOString();
      const evidenceCount = 147 + Math.floor(Math.random() * 30);
      await supabase.from('compliance_packs').update({
        status: 'ready', evidence_count: evidenceCount,
        generated_by: 'system', updated_at: now,
      }).eq('id', pack.id);
      setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, status: 'ready', evidence_count: evidenceCount, generated_by: 'system' } : p));
      toast.success(`Evidence pack ready — ${evidenceCount} items collected`);
    }, 3000);
  };

  const handleExport = async (pack: CompliancePack) => {
    const json = generateMockJSON(pack);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.framework}-evidence-pack-${pack.period_start}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from('compliance_packs').update({ status: 'exported', updated_at: new Date().toISOString() }).eq('id', pack.id);
    setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, status: 'exported' } : p));
    toast.success('Evidence pack exported');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('compliance_packs').delete().eq('id', deleting.id);
    if (error) { toast.error('Delete failed'); return; }
    setPacks(prev => prev.filter(p => p.id !== deleting.id));
    toast.success('Pack deleted');
    setDeleting(null);
  };

  const readyCount = packs.filter(p => p.status === 'ready' || p.status === 'exported').length;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <Link to="/"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-2">
          <img src="https://miaoda-conversation-file.s3cdn.medo.dev/user-b8uq3eatai9u/app-bs8qtod6o9hd/20260527/SentinelOps logo Final.png" alt="SentinelOps" className="h-7 w-7 object-contain shrink-0" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><FileText className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Compliance Evidence Packs</span></div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          <span className="text-muted-foreground"><span className="text-emerald-400 font-semibold">{readyCount}</span>/{packs.length} ready</span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />New Pack
        </Button>
        <Button variant="ghost" size="sm" onClick={load} className="h-8 w-8 p-0 text-muted-foreground"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <FileText className="h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No compliance packs yet</p>
            <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" />Create first pack
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {packs.map(p => (
              <PackCard key={p.id} pack={p} onGenerate={handleGenerate} onExport={handleExport} onDelete={setDeleting} />
            ))}
          </div>
        )}
      </main>

      <NewPackDialog open={creating} onClose={() => setCreating(false)} onSaved={load} />

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.title}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">This compliance pack and all its evidence metadata will be permanently deleted.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
