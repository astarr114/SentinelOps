import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Sun, Moon, Zap, RefreshCw, CheckCircle2, XCircle,
  Clock, PlayCircle, AlertTriangle, ChevronRight, Loader2,
  RotateCcw, Scale, Server, Shield, Activity, Info,
  ThumbsUp, ThumbsDown, Bot, User,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type ActionStatus = 'pending' | 'awaiting_approval' | 'approved' | 'running' | 'success' | 'failed' | 'rejected' | 'skipped';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ActionType = 'restart' | 'scale' | 'rollback' | 'notify' | 'custom';

interface RemAction {
  id: string;
  incident_id: string;
  title: string;
  description: string;
  playbook: string;
  action_type: ActionType;
  target_service: string;
  status: ActionStatus;
  risk_level: RiskLevel;
  requires_approval: boolean;
  auto_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  output_log: string | null;
  created_at: string;
}

// ── Mock seed (first load if DB empty) ────────────────────────────────────
const MOCK_ACTIONS: Omit<RemAction, 'id'>[] = [
  {
    incident_id: 'INC-0041', title: 'Restart checkout-service pods', description: 'Rolling restart of all 4 checkout-service pods to clear ORM connection leak.',
    playbook: 'pod-restart', action_type: 'restart', target_service: 'checkout-service', status: 'awaiting_approval',
    risk_level: 'medium', requires_approval: true, auto_approved: false,
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
    started_at: null, completed_at: null, output_log: null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    incident_id: 'INC-0042', title: 'Scale payment-gateway to 8 pods', description: 'Horizontal scale from 4 → 8 worker pods to drain queue depth.',
    playbook: 'hpa-scale', action_type: 'scale', target_service: 'payment-gateway', status: 'success',
    risk_level: 'low', requires_approval: false, auto_approved: true,
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
    started_at: new Date(Date.now() - 22 * 60_000).toISOString(),
    completed_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    output_log: 'HPA updated: payment-gateway replicas 4 → 8\nPods Ready: 8/8 in 3m 42s\nQueue depth dropped: 1200 → 180 messages',
    created_at: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  {
    incident_id: 'INC-0041', title: 'Rollback checkout-service to v2.4.0', description: 'Roll back to last known-good image to eliminate ORM regression.',
    playbook: 'kubectl-rollout', action_type: 'rollback', target_service: 'checkout-service', status: 'awaiting_approval',
    risk_level: 'high', requires_approval: true, auto_approved: false,
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
    started_at: null, completed_at: null, output_log: null, created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    incident_id: 'INC-0039', title: 'Restart notification-svc pod #3', description: 'OOMKilled pod. Autonomous restart within policy limits for P2 single-pod crash.',
    playbook: 'pod-restart', action_type: 'restart', target_service: 'notification-svc', status: 'success',
    risk_level: 'low', requires_approval: false, auto_approved: true,
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
    started_at: new Date(Date.now() - 41 * 60_000).toISOString(),
    completed_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    output_log: 'kubectl delete pod notification-svc-3 -n prod\npod "notification-svc-3" deleted\nnew pod "notification-svc-3-xk8d2" Running in 12s',
    created_at: new Date(Date.now() - 43 * 60_000).toISOString(),
  },
  {
    incident_id: 'INC-0038', title: 'Block IP range 203.0.113.0/24', description: 'Block abusive IP range triggering 12k rate-limit violations.',
    playbook: 'firewall-block', action_type: 'custom', target_service: 'api-gateway', status: 'rejected',
    risk_level: 'critical', requires_approval: true, auto_approved: false,
    approved_by: null, approved_at: null,
    rejected_by: 'Policy Engine', rejected_at: new Date(Date.now() - 65 * 60_000).toISOString(),
    rejection_reason: 'IP block requires security team approval. False-positive risk: ISP NAT.',
    started_at: null, completed_at: null, output_log: null, created_at: new Date(Date.now() - 67 * 60_000).toISOString(),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_META: Record<ActionStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pending:           { label: 'Pending',           color: 'text-muted-foreground', bg: 'bg-muted/50',        Icon: Clock         },
  awaiting_approval: { label: 'Awaiting Approval', color: 'text-yellow-400',       bg: 'bg-yellow-500/10',   Icon: Clock         },
  approved:          { label: 'Approved',           color: 'text-blue-400',         bg: 'bg-blue-500/10',     Icon: CheckCircle2  },
  running:           { label: 'Running',            color: 'text-primary',          bg: 'bg-primary/10',      Icon: Activity      },
  success:           { label: 'Success',            color: 'text-emerald-400',      bg: 'bg-emerald-500/10',  Icon: CheckCircle2  },
  failed:            { label: 'Failed',             color: 'text-red-400',          bg: 'bg-red-500/10',      Icon: XCircle       },
  rejected:          { label: 'Rejected',           color: 'text-red-400',          bg: 'bg-red-500/10',      Icon: XCircle       },
  skipped:           { label: 'Skipped',            color: 'text-muted-foreground', bg: 'bg-muted/30',        Icon: ChevronRight  },
};

const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'text-emerald-400' },
  medium:   { label: 'Medium',   color: 'text-yellow-400'  },
  high:     { label: 'High',     color: 'text-orange-400'  },
  critical: { label: 'Critical', color: 'text-red-400'     },
};

const ACTION_ICON: Record<ActionType, React.ElementType> = {
  restart:  RotateCcw,
  scale:    Scale,
  rollback: RefreshCw,
  notify:   Activity,
  custom:   Zap,
};

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// ── Approval dialog ────────────────────────────────────────────────────────
function ApprovalDialog({ action, open, onClose, onDone }: {
  action: RemAction | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const handle = async (approve: boolean) => {
    if (!action) return;
    if (!approve && !rejectionReason.trim()) { toast.error('Please provide a rejection reason'); return; }
    setProcessing(true);
    const now = new Date().toISOString();
    const patch = approve
      ? { status: 'approved' as ActionStatus, approved_by: 'on-call', approved_at: now }
      : { status: 'rejected' as ActionStatus, rejected_by: 'on-call', rejected_at: now, rejection_reason: rejectionReason };
    const { error } = await supabase.from('remediation_actions').update(patch).eq('id', action.id);
    if (error) { toast.error('Update failed: ' + error.message); setProcessing(false); return; }
    // Write to immutable audit trail
    await supabase.from('audit_trail').insert({
      event_type: approve ? 'remediation.approved' : 'remediation.rejected',
      actor: 'on-call',
      target_type: 'action',
      target_id: action.id,
      description: approve
        ? `Approved remediation: ${action.title} on ${action.target_service}`
        : `Rejected remediation: ${action.title} — ${rejectionReason}`,
      metadata: { action_id: action.id, incident_id: action.incident_id, service: action.target_service },
    });
    toast.success(approve ? 'Action approved — execution queued' : 'Action rejected');
    setProcessing(false);
    setRejectionReason('');
    onDone();
    onClose();
  };

  if (!action) return null;
  const ActionIcon = ACTION_ICON[action.action_type];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ActionIcon className="h-4 w-4 text-primary" />
            Review Remediation Action
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">{action.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{action.description}</p>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="text-muted-foreground">Service: <span className="text-foreground font-mono">{action.target_service}</span></span>
              <span className="text-muted-foreground">Incident: <span className="text-foreground font-mono">{action.incident_id}</span></span>
              <span className={RISK_META[action.risk_level].color}>Risk: {RISK_META[action.risk_level].label}</span>
            </div>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-300">Approval required</span>
            </div>
            <p className="text-xs text-muted-foreground">This action has risk level <strong className={RISK_META[action.risk_level].color}>{RISK_META[action.risk_level].label}</strong> and requires explicit approval before execution. Once approved, the automation engine will execute the playbook <span className="font-mono text-foreground/70">{action.playbook}</span>.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-normal text-foreground">Rejection reason <span className="text-muted-foreground">(required if rejecting)</span></label>
            <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
              placeholder="Explain why this action should not be executed…"
              className="text-sm resize-none h-20 bg-secondary/30" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={processing} className="h-9">Cancel</Button>
          <Button variant="outline" onClick={() => handle(false)} disabled={processing}
            className="h-9 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60">
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
            Reject
          </Button>
          <Button onClick={() => handle(true)} disabled={processing}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Action card ────────────────────────────────────────────────────────────
function ActionCard({ action, onApprove, onSelect, selected }: {
  action: RemAction; onApprove: (a: RemAction) => void; onSelect: (a: RemAction) => void; selected: boolean;
}) {
  const sm = STATUS_META[action.status];
  const rm = RISK_META[action.risk_level];
  const ActionIcon = ACTION_ICON[action.action_type];

  return (
    <button onClick={() => onSelect(action)}
      className={cn('w-full text-left p-3 rounded-lg border transition-all',
        'bg-card hover:bg-accent/30',
        selected ? 'ring-2 ring-primary border-primary/40' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 p-1.5 rounded border shrink-0', sm.bg)}>
          <ActionIcon className={cn('h-3.5 w-3.5', sm.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground truncate">{action.title}</span>
            <span className={cn('text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded', sm.bg, sm.color)}>
              {sm.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5 text-pretty">{action.description}</p>
          <div className="flex items-center gap-3 text-[10px] flex-wrap">
            <span className="font-mono text-muted-foreground">{action.incident_id}</span>
            <span className="font-mono text-blue-400">{action.target_service}</span>
            <span className={rm.color}>Risk: {rm.label}</span>
            <span className="text-muted-foreground">{timeAgo(action.created_at)}</span>
          </div>
          {action.status === 'awaiting_approval' && (
            <div className="mt-2">
              <Button size="sm" onClick={e => { e.stopPropagation(); onApprove(action); }}
                className="h-7 gap-1.5 text-xs bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/30">
                <Clock className="h-3 w-3" /> Review & Approve
              </Button>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────────
function ActionDetail({ action }: { action: RemAction }) {
  const sm = STATUS_META[action.status];
  const rm = RISK_META[action.risk_level];
  const ActionIcon = ACTION_ICON[action.action_type];

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className={cn('p-2.5 rounded-lg border shrink-0', sm.bg)}>
          <ActionIcon className={cn('h-5 w-5', sm.color)} />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">{action.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{action.description}</p>
        </div>
      </div>

      {/* Status + metadata */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Status',   value: sm.label,          color: sm.color       },
          { label: 'Risk',     value: rm.label,          color: rm.color       },
          { label: 'Incident', value: action.incident_id, color: 'text-foreground' },
          { label: 'Service',  value: action.target_service, color: 'text-blue-400' },
          { label: 'Playbook', value: action.playbook,   color: 'text-muted-foreground' },
          { label: 'Type',     value: action.action_type, color: 'text-muted-foreground' },
        ].map(k => (
          <div key={k.label} className="rounded bg-muted/40 border border-border p-2.5">
            <div className="text-[10px] text-muted-foreground mb-0.5">{k.label}</div>
            <div className={cn('text-xs font-semibold font-mono truncate', k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { ts: action.created_at,   label: 'Created',   actor: action.auto_approved ? 'AI System' : 'AI System', always: true },
            { ts: action.approved_at,  label: 'Approved',  actor: action.approved_by ?? '—',  always: false },
            { ts: action.rejected_at,  label: 'Rejected',  actor: action.rejected_by ?? '—',  always: false },
            { ts: action.started_at,   label: 'Started',   actor: 'Automation Engine',        always: false },
            { ts: action.completed_at, label: 'Completed', actor: 'Automation Engine',        always: false },
          ].filter(t => t.always || t.ts).map(t => (
            <div key={t.label} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-muted-foreground shrink-0">{t.label}</span>
              <span className="flex-1 text-foreground/70">{t.ts ? fmtTs(t.ts) : '—'}</span>
              <div className="flex items-center gap-1 shrink-0">
                {t.actor === 'AI System' ? <Bot className="h-3 w-3 text-blue-400" /> : <User className="h-3 w-3 text-muted-foreground" />}
                <span className="text-muted-foreground text-[10px]">{t.actor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rejection reason */}
      {action.rejection_reason && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-300">Rejection reason</span>
          </div>
          <p className="text-xs text-muted-foreground">{action.rejection_reason}</p>
        </div>
      )}

      {/* Output log */}
      {action.output_log && (
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Execution Output</h3>
          <pre className="rounded bg-black/40 border border-border p-3 text-[10px] text-emerald-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
            {action.output_log}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function RemediationPage() {
  const { theme, toggleTheme } = useTheme();
  const [actions, setActions] = useState<RemAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RemAction | null>(null);
  const [approving, setApproving] = useState<RemAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('remediation_actions').select('*').order('created_at', { ascending: false }).limit(100);
    if (Array.isArray(data) && data.length > 0) {
      setActions(data as RemAction[]);
      setSelected(prev => data.find(d => d.id === prev?.id) as RemAction ?? data[0] as RemAction);
    } else {
      // Seed mock data on first visit
      const { data: inserted } = await supabase.from('remediation_actions').insert(MOCK_ACTIONS).select();
      if (Array.isArray(inserted)) {
        setActions(inserted as RemAction[]);
        setSelected(inserted[0] as RemAction);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter === 'all' ? actions : actions.filter(a => a.status === statusFilter);

  const pendingApprovals = actions.filter(a => a.status === 'awaiting_approval').length;
  const successCount     = actions.filter(a => a.status === 'success').length;

  const statusTabs: { value: ActionStatus | 'all'; label: string }[] = [
    { value: 'all',               label: `All (${actions.length})` },
    { value: 'awaiting_approval', label: `Needs Review (${pendingApprovals})` },
    { value: 'success',           label: 'Succeeded' },
    { value: 'failed',            label: 'Failed' },
    { value: 'rejected',          label: 'Rejected' },
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
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><Zap className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Autonomous Remediation</span></div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          {pendingApprovals > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 font-semibold">{pendingApprovals} awaiting approval</span>}
          <span className="text-muted-foreground">{successCount}/{actions.length} successful</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      {/* Status filter tabs */}
      <div className="shrink-0 border-b border-border px-4 flex items-center gap-1 overflow-x-auto bg-card/20">
        {statusTabs.map(t => (
          <button key={t.value} onClick={() => setStatusFilter(t.value)}
            className={cn('h-9 px-3 text-xs whitespace-nowrap border-b-2 transition-colors',
              statusFilter === t.value ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left list */}
        <aside className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden bg-card/30">
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Shield className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No actions found</p>
              </div>
            ) : filtered.map(a => (
              <ActionCard key={a.id} action={a} onApprove={setApproving} onSelect={setSelected} selected={selected?.id === a.id} />
            ))}
          </div>
        </aside>

        {/* Detail */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {selected ? <ActionDetail action={selected} /> : (
            <div className="flex items-center justify-center h-full gap-3 flex-col">
              <Zap className="h-12 w-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Select a remediation action to view details</p>
            </div>
          )}
        </main>
      </div>

      <ApprovalDialog action={approving} open={!!approving} onClose={() => setApproving(null)} onDone={load} />
    </div>
  );
}
