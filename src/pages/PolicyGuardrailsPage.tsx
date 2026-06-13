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
  ArrowLeft, Sun, Moon, Shield, RefreshCw, Plus, Trash2, Info,
  Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Lock, AlertTriangle, Settings2, Zap, DollarSign, Activity,
} from 'lucide-react';

type RuleType = 'deny' | 'require_approval' | 'rate_limit' | 'notify';
type Category = 'safety' | 'compliance' | 'cost' | 'performance';

interface GuardrailPolicy {
  id: string;
  name: string;
  description: string;
  category: Category;
  scope: string;
  rule_type: RuleType;
  condition: string;
  action_types: string[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

const CAT_META: Record<Category, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  safety:      { label: 'Safety',      color: 'text-red-400',     bg: 'bg-red-500/10',     Icon: Shield      },
  compliance:  { label: 'Compliance',  color: 'text-blue-400',    bg: 'bg-blue-500/10',    Icon: CheckCircle2 },
  cost:        { label: 'Cost',        color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  Icon: DollarSign   },
  performance: { label: 'Performance', color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: Activity     },
};

const RULE_META: Record<RuleType, { label: string; color: string }> = {
  deny:             { label: 'Deny',             color: 'text-red-400'     },
  require_approval: { label: 'Require Approval', color: 'text-yellow-400'  },
  rate_limit:       { label: 'Rate Limit',       color: 'text-orange-400'  },
  notify:           { label: 'Notify',           color: 'text-blue-400'    },
};

const BLANK: Omit<GuardrailPolicy, 'id' | 'created_at' | 'updated_at'> = {
  name: '', description: '', category: 'safety', scope: 'all',
  rule_type: 'require_approval', condition: '', action_types: [], is_active: true, priority: 100,
};

function PolicyCard({ policy, onToggle, onDelete, onEdit }: {
  policy: GuardrailPolicy;
  onToggle: (id: string, v: boolean) => void;
  onDelete: (p: GuardrailPolicy) => void;
  onEdit: (p: GuardrailPolicy) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cm = CAT_META[policy.category];
  const rm = RULE_META[policy.rule_type];
  const CatIcon = cm.Icon;

  return (
    <div className={cn('rounded-lg border transition-all', policy.is_active ? 'border-border bg-card' : 'border-border/40 bg-card/40 opacity-60')}>
      <div className="flex items-start gap-3 p-3">
        <div className={cn('p-1.5 rounded border shrink-0 mt-0.5', cm.bg)}>
          <CatIcon className={cn('h-3.5 w-3.5', cm.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground leading-tight">{policy.name}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn('text-[10px] font-semibold', rm.color)}>{rm.label}</span>
              <div className="h-3 w-px bg-border" />
              <span className="text-[10px] text-muted-foreground">P{policy.priority}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty line-clamp-2">{policy.description}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] flex-wrap">
            <span className={cn('px-1.5 py-0.5 rounded font-medium', cm.bg, cm.color)}>{cm.label}</span>
            <span className="font-mono text-muted-foreground">{policy.scope}</span>
            {policy.action_types.length > 0 && (
              <span className="text-muted-foreground">{policy.action_types.join(', ')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded(v => !v)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => onEdit(policy)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onToggle(policy.id, !policy.is_active)}
            className={cn('h-7 w-7 flex items-center justify-center rounded transition-colors',
              policy.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-accent/40')}>
            {policy.is_active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => onDelete(policy)} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-1">
          <div className="mt-2 space-y-1.5">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Condition expression</span>
              <pre className="mt-1 rounded bg-muted/40 border border-border px-3 py-2 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">{policy.condition}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyDialog({ open, onClose, initial, onSaved }: {
  open: boolean; onClose: () => void; initial: GuardrailPolicy | null; onSaved: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK>(initial ? {
    name: initial.name, description: initial.description, category: initial.category,
    scope: initial.scope, rule_type: initial.rule_type, condition: initial.condition,
    action_types: initial.action_types, is_active: initial.is_active, priority: initial.priority,
  } : { ...BLANK });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial ? {
      name: initial.name, description: initial.description, category: initial.category,
      scope: initial.scope, rule_type: initial.rule_type, condition: initial.condition,
      action_types: initial.action_types, is_active: initial.is_active, priority: initial.priority,
    } : { ...BLANK });
  }, [initial, open]);

  const set = <K extends keyof typeof BLANK>(k: K, v: typeof BLANK[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.condition.trim()) { toast.error('Condition is required'); return; }
    setSaving(true);
    const payload = { ...form, updated_at: new Date().toISOString() };
    let error;
    if (initial) {
      ({ error } = await supabase.from('policy_guardrails').update(payload).eq('id', initial.id));
    } else {
      ({ error } = await supabase.from('policy_guardrails').insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    toast.success(initial ? 'Policy updated' : 'Policy created');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{initial ? 'Edit Policy' : 'New Policy Guardrail'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Name</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Policy name…" className="bg-secondary/30 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Description</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="What does this policy prevent?" className="bg-secondary/30 h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value as Category)}
                className="h-9 w-full rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
                {Object.entries(CAT_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Rule Type</label>
              <select value={form.rule_type} onChange={e => set('rule_type', e.target.value as RuleType)}
                className="h-9 w-full rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
                {Object.entries(RULE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Scope</label>
              <Input value={form.scope} onChange={e => set('scope', e.target.value)} placeholder="all / env:prod / service:api" className="bg-secondary/30 h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-normal">Priority (lower = higher)</label>
              <Input type="number" value={form.priority} onChange={e => set('priority', Number(e.target.value))} className="bg-secondary/30 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Applies to action types <span className="text-muted-foreground">(comma-separated)</span></label>
            <Input value={form.action_types.join(', ')} onChange={e => set('action_types', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="restart, rollback, scale…" className="bg-secondary/30 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Condition expression</label>
            <Input value={form.condition} onChange={e => set('condition', e.target.value)} placeholder='action_type = "rollback" AND environment = "prod"' className="bg-secondary/30 h-9 text-sm font-mono" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-9 bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : 'Save Policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PolicyGuardrailsPage() {
  const { theme, toggleTheme } = useTheme();
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');
  const [editing, setEditing] = useState<GuardrailPolicy | null | 'new'>(null);
  const [deleting, setDeleting] = useState<GuardrailPolicy | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('policy_guardrails').select('*').order('priority').limit(100);
    setPolicies(Array.isArray(data) ? data as GuardrailPolicy[] : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: string, v: boolean) => {
    const { error } = await supabase.from('policy_guardrails').update({ is_active: v }).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, is_active: v } : p));
    toast.success(v ? 'Policy enabled' : 'Policy disabled');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('policy_guardrails').delete().eq('id', deleting.id);
    if (error) { toast.error('Delete failed'); return; }
    setPolicies(prev => prev.filter(p => p.id !== deleting.id));
    toast.success('Policy deleted');
    setDeleting(null);
  };

  const filtered = catFilter === 'all' ? policies : policies.filter(p => p.category === catFilter);
  const active = policies.filter(p => p.is_active).length;

  const cats: { value: Category | 'all'; label: string }[] = [
    { value: 'all', label: `All (${policies.length})` },
    ...Object.entries(CAT_META).map(([k, m]) => ({
      value: k as Category,
      label: `${m.label} (${policies.filter(p => p.category === k).length})`,
    })),
  ];

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
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><Lock className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Policy Guardrails</span></div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          <span className="text-muted-foreground"><span className="text-emerald-400 font-semibold">{active}</span>/{policies.length} active</span>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />New Policy
        </Button>
        <Button variant="ghost" size="sm" onClick={load} className="h-8 w-8 p-0 text-muted-foreground"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      {/* Category tabs */}
      <div className="shrink-0 border-b border-border px-4 flex items-center gap-1 overflow-x-auto bg-card/20">
        {cats.map(c => (
          <button key={c.value} onClick={() => setCatFilter(c.value)}
            className={cn('h-9 px-3 text-xs whitespace-nowrap border-b-2 transition-colors',
              catFilter === c.value ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Explainer banner */}
      <div className="shrink-0 mx-4 mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-300/80">Policy guardrails constrain what the Autonomous Remediation engine can execute without human sign-off. Rules are evaluated in priority order (lower number = evaluated first). A <strong>Deny</strong> rule always blocks execution regardless of other approvals.</p>
      </div>

      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Shield className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No policies in this category</p>
            <Button size="sm" onClick={() => setEditing('new')} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" />Add policy
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {filtered.map(p => (
              <PolicyCard key={p.id} policy={p} onToggle={handleToggle} onDelete={setDeleting} onEdit={setEditing} />
            ))}
          </div>
        )}
      </main>

      <PolicyDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing === 'new' || editing === null ? null : editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy "{deleting?.name}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground px-0">This guardrail will be permanently removed. The automation engine will no longer enforce this rule.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
