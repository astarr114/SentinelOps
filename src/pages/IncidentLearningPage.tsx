import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Sun, Moon, RefreshCw, Brain, TrendingUp,
  ThumbsUp, ThumbsDown, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Target, MessageCircle, Plus, Bot, User,
  BarChart2, Lightbulb, Flame,
} from 'lucide-react';

type FeedbackType = 'helpful' | 'not_helpful' | 'false_positive' | 'missed' | 'correct_diagnosis';

interface Feedback {
  id: string;
  incident_id: string;
  action_id: string | null;
  feedback_type: FeedbackType;
  comment: string | null;
  submitted_by: string | null;
  confidence_delta: number | null;
  created_at: string;
}

const FB_META: Record<FeedbackType, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  helpful:           { label: 'Helpful',            color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: ThumbsUp     },
  not_helpful:       { label: 'Not Helpful',        color: 'text-red-400',     bg: 'bg-red-500/10',     Icon: ThumbsDown   },
  false_positive:    { label: 'False Positive',     color: 'text-orange-400',  bg: 'bg-orange-500/10',  Icon: AlertTriangle },
  missed:            { label: 'Missed Incident',    color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  Icon: XCircle      },
  correct_diagnosis: { label: 'Correct Diagnosis',  color: 'text-blue-400',    bg: 'bg-blue-500/10',    Icon: CheckCircle2  },
};

// Mock feedback on first load
const MOCK_FEEDBACK: Omit<Feedback, 'id'>[] = [
  { incident_id: 'INC-0041', action_id: null, feedback_type: 'helpful', comment: 'Root cause identified correctly within 2 minutes. The checkout ORM leak suggestion was spot on.', submitted_by: 'on-call-eng', confidence_delta: 15, created_at: new Date(Date.now() - 30 * 60_000).toISOString() },
  { incident_id: 'INC-0039', action_id: null, feedback_type: 'false_positive', comment: 'Alert fired for a planned maintenance window. The system should have suppressed this.', submitted_by: 'sre-lead', confidence_delta: -20, created_at: new Date(Date.now() - 90 * 60_000).toISOString() },
  { incident_id: 'INC-0038', action_id: null, feedback_type: 'correct_diagnosis', comment: 'Correlation with the upstream DNS latency spike was accurate. Saved 40 minutes of investigation.', submitted_by: 'network-ops', confidence_delta: 25, created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { incident_id: 'INC-0037', action_id: null, feedback_type: 'not_helpful', comment: 'Suggested restart when the real issue was a misconfigured circuit breaker threshold. Needs more context on config changes.', submitted_by: 'dev-team', confidence_delta: -10, created_at: new Date(Date.now() - 6 * 3600_000).toISOString() },
  { incident_id: 'INC-0036', action_id: null, feedback_type: 'missed', comment: 'Memory leak in worker service was not flagged until P99 latency spiked. Should detect RSS growth trend earlier.', submitted_by: 'backend-eng', confidence_delta: -15, created_at: new Date(Date.now() - 24 * 3600_000).toISOString() },
  { incident_id: 'INC-0035', action_id: null, feedback_type: 'helpful', comment: 'Blast radius prediction was accurate — correctly identified 3 downstream services at risk.', submitted_by: 'sre-lead', confidence_delta: 20, created_at: new Date(Date.now() - 36 * 3600_000).toISOString() },
];

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function FeedbackCard({ fb }: { fb: Feedback }) {
  const meta = FB_META[fb.feedback_type];
  const Icon = meta.Icon;
  const delta = fb.confidence_delta ?? 0;

  return (
    <div className={cn('rounded-lg border p-3 bg-card border-border')}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded border shrink-0 mt-0.5', meta.bg)}>
          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={cn('text-[10px] font-semibold', meta.color)}>{meta.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              {delta !== 0 && (
                <span className={cn('text-[10px] font-mono font-semibold', delta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {delta > 0 ? '+' : ''}{delta} confidence
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{timeAgo(fb.created_at)}</span>
            </div>
          </div>
          {fb.comment && <p className="text-xs text-muted-foreground text-pretty leading-relaxed">{fb.comment}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-[10px]">
            <span className="font-mono text-blue-400">{fb.incident_id}</span>
            {fb.submitted_by && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="h-2.5 w-2.5" />{fb.submitted_by}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ incident_id: '', feedback_type: 'helpful' as FeedbackType, comment: '', confidence_delta: '0' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.incident_id.trim()) { toast.error('Incident ID is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('incident_feedback').insert({
      incident_id: form.incident_id.trim().toUpperCase(),
      feedback_type: form.feedback_type,
      comment: form.comment.trim() || null,
      submitted_by: 'user',
      confidence_delta: parseInt(form.confidence_delta) || 0,
    });
    setSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    toast.success('Feedback submitted — AI model will incorporate this signal');
    setForm({ incident_id: '', feedback_type: 'helpful', comment: '', confidence_delta: '0' });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Submit Learning Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Incident ID</label>
            <input value={form.incident_id} onChange={e => setForm(f => ({ ...f, incident_id: e.target.value }))}
              placeholder="INC-0041" className="h-9 w-full rounded-md border border-border bg-secondary/30 px-3 text-sm text-foreground font-mono outline-none focus:ring-1 ring-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Feedback type</label>
            <select value={form.feedback_type} onChange={e => setForm(f => ({ ...f, feedback_type: e.target.value as FeedbackType }))}
              className="h-9 w-full rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
              {Object.entries(FB_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Comment <span className="text-muted-foreground">(optional)</span></label>
            <Textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder="What should the AI have done differently?" className="text-sm resize-none h-24 bg-secondary/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal">Confidence delta <span className="text-muted-foreground">(-100 to +100)</span></label>
            <input type="number" min="-100" max="100" value={form.confidence_delta} onChange={e => setForm(f => ({ ...f, confidence_delta: e.target.value }))}
              className="h-9 w-full rounded-md border border-border bg-secondary/30 px-3 text-sm text-foreground outline-none focus:ring-1 ring-primary" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-9 bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Submitting…</> : <><Brain className="h-3.5 w-3.5 mr-1.5" />Submit Feedback</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IncidentLearningPage() {
  const { theme, toggleTheme } = useTheme();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedbackType | 'all'>('all');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('incident_feedback').select('*').order('created_at', { ascending: false }).limit(200);
    if (Array.isArray(data) && data.length > 0) {
      setFeedbacks(data as Feedback[]);
    } else {
      const { data: inserted } = await supabase.from('incident_feedback').insert(MOCK_FEEDBACK).select();
      setFeedbacks(Array.isArray(inserted) ? inserted as Feedback[] : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? feedbacks : feedbacks.filter(f => f.feedback_type === filter);

  // Aggregate stats
  const totDelta = feedbacks.reduce((s, f) => s + (f.confidence_delta ?? 0), 0);
  const positive = feedbacks.filter(f => ['helpful', 'correct_diagnosis'].includes(f.feedback_type)).length;
  const negative = feedbacks.filter(f => ['not_helpful', 'false_positive', 'missed'].includes(f.feedback_type)).length;

  const filterTabs: { value: FeedbackType | 'all'; label: string }[] = [
    { value: 'all', label: `All (${feedbacks.length})` },
    ...Object.entries(FB_META).map(([k, m]) => ({
      value: k as FeedbackType,
      label: `${m.label} (${feedbacks.filter(f => f.feedback_type === k).length})`,
    })),
  ];

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
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><Brain className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Incident Learning Loop</span></div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setSubmitting(true)} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />Submit Feedback
        </Button>
        <Button variant="ghost" size="sm" onClick={load} className="h-8 w-8 p-0 text-muted-foreground"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      {/* Summary stats */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border bg-card/20">
        {[
          { label: 'Total Feedback', value: feedbacks.length, Icon: MessageCircle, color: 'text-foreground' },
          { label: 'Positive Signals', value: positive, Icon: ThumbsUp, color: 'text-emerald-400' },
          { label: 'Negative Signals', value: negative, Icon: ThumbsDown, color: 'text-red-400' },
          { label: 'Net Confidence Δ', value: totDelta > 0 ? `+${totDelta}` : String(totDelta), Icon: TrendingUp, color: totDelta >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
            <s.Icon className={cn('h-5 w-5 shrink-0', s.color)} />
            <div>
              <div className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* How it works banner */}
      <div className="shrink-0 mx-4 mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
        <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-primary/80">Every feedback signal is stored in the learning database. The confidence delta adjusts the AI model's weighting for similar incident patterns — positive signals reinforce good diagnoses, negative signals trigger recalibration for that incident class.</p>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 border-b border-border px-4 mt-2 flex items-center gap-1 overflow-x-auto bg-card/20">
        {filterTabs.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={cn('h-9 px-3 text-xs whitespace-nowrap border-b-2 transition-colors',
              filter === t.value ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Brain className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No feedback in this category yet</p>
            <Button size="sm" onClick={() => setSubmitting(true)} className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" />Be the first
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {filtered.map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
          </div>
        )}
      </main>

      <SubmitDialog open={submitting} onClose={() => setSubmitting(false)} onSaved={load} />
    </div>
  );
}
