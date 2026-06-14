import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield, Sun, Moon, ArrowLeft, BookOpen, Search, X, Filter,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
  ThumbsUp, ThumbsDown, AlertTriangle, Info, Zap, Download,
  RefreshCw, FileText, Activity, Lock, User, Bot,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type ActionType = 'recommendation' | 'approval' | 'rejection' | 'execution' | 'escalation' | 'rollback';
type OutcomeType = 'success' | 'partial' | 'failed' | 'pending' | 'skipped';
type FeedbackType = 'helpful' | 'not_helpful' | null;

interface PolicyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface JournalEntry {
  id: string;
  timestamp: string;
  actionType: ActionType;
  title: string;
  description: string;
  incidentId?: string;
  service?: string;
  actor: string;       // 'AI System' | user name
  isAi: boolean;
  confidence?: number;
  outcome: OutcomeType;
  outcomeDetail?: string;
  rationale: string;
  evidence: string[];
  policyChecks: PolicyCheck[];
  tags: string[];
  why: string;         // "Why was this action suggested?" content
  feedback: FeedbackType;
}

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_ENTRIES: JournalEntry[] = [
  {
    id: 'j-001',
    timestamp: new Date(Date.now() - 8 * 60_000).toISOString(),
    actionType: 'recommendation',
    title: 'Roll back checkout-service to v2.4.0',
    description: 'AI recommends immediate rollback due to DB pool saturation caused by v2.4.1 ORM regression.',
    incidentId: 'INC-0041', service: 'checkout-service', actor: 'AI System', isAi: true,
    confidence: 93, outcome: 'pending',
    rationale: 'Pattern match with 14 historical incidents involving connection pool exhaustion post-deployment. ORM wrapper in v2.4.1 does not release connections on timeout, saturating pool (91%) and causing cascading latency.',
    evidence: ['DB pool utilisation: 91%', 'P99 latency: 1.84s (SLO: 800ms)', 'Error rate: 4.2%', 'Deploy v2.4.1 18 min ago', 'CPU spike from 34% to 78% post-deploy'],
    policyChecks: [
      { name: 'Production rollback policy',        passed: true,  detail: 'Owner approval not required for severity P1' },
      { name: 'Rollback window (no freeze)',        passed: true,  detail: 'Not in change-freeze period' },
      { name: 'Previous stable version available', passed: true,  detail: 'v2.4.0 image present in registry' },
      { name: 'Blast radius < 3 services',         passed: false, detail: '4 downstream services impacted — approval required' },
    ],
    tags: ['rollback', 'checkout', 'P1', 'db-pool'],
    why: 'The model detected a strong temporal correlation between the v2.4.1 deployment and the onset of DB pool saturation (R=0.97). The ORM connection-wrapper change in the diff lacks a finally{} release block, matching a known anti-pattern from 3 past incidents (INC-0031, INC-0028, INC-0019). Rolling back is ranked #1 by the action model with 93% confidence — higher than patching (74%) or pool-scaling (61%).',
    feedback: null,
  },
  {
    id: 'j-002',
    timestamp: new Date(Date.now() - 22 * 60_000).toISOString(),
    actionType: 'approval',
    title: 'Approve scale-up of payment-gateway workers',
    description: 'On-call engineer approved AI recommendation to scale payment-gateway from 4 to 8 worker pods.',
    incidentId: 'INC-0042', service: 'payment-gateway', actor: 'Alex Chen', isAi: false,
    outcome: 'success', outcomeDetail: 'Queue depth dropped from 1.2k to 180 within 4 min of scaling.',
    rationale: 'Queue depth exceeded 1k messages for 8+ min with no sign of drain. Scaling workers is the fastest lever to reduce queue pressure without touching the DB layer.',
    evidence: ['Queue depth: 1,240 messages', 'Worker utilisation: 100% (4/4)', 'Retry rate: 8.1%', 'Stripe API latency: 620ms'],
    policyChecks: [
      { name: 'Auto-scale policy',     passed: true,  detail: 'Horizontal scaling approved for payment-gateway tier' },
      { name: 'Cost threshold',        passed: true,  detail: 'Estimated $12/hr additional cost within approved limit' },
      { name: 'Kubernetes quota',      passed: true,  detail: 'Cluster has capacity for 4 additional pods' },
    ],
    tags: ['scale', 'payment-gateway', 'approved'],
    why: 'Queue depth had been growing at ~140 messages/min for 8 consecutive minutes. At that rate, the retry loop would begin rejecting new transactions within 6 minutes. Scaling pods is the least-risk, fastest-impact action. The model ruled out DB connection tuning (would not help within 5 min) and circuit-breaker toggle (would cause immediate 5xx storm).',
    feedback: 'helpful',
  },
  {
    id: 'j-003',
    timestamp: new Date(Date.now() - 41 * 60_000).toISOString(),
    actionType: 'execution',
    title: 'Restart notification-svc pod #3',
    description: 'AI autonomously restarted a crashed pod within policy limits (pod restart, low-risk, P2 severity).',
    incidentId: 'INC-0039', service: 'notification-svc', actor: 'AI System', isAi: true,
    confidence: 88, outcome: 'success', outcomeDetail: 'Pod restarted in 12s, queue resumed draining. Incident auto-resolved.',
    rationale: 'Pod 3 had entered CrashLoopBackOff state with OOMKilled exit code. Memory usage had grown steadily over 2h suggesting a leak. Pod restart is safe and pre-approved for low-severity single-pod crashes.',
    evidence: ['Exit reason: OOMKilled', 'Memory trend: +12MB/hr over 2h', 'Other pods healthy', 'CrashLoopBackOff: 3rd restart'],
    policyChecks: [
      { name: 'Autonomous action policy',   passed: true,  detail: 'Pod restart allowed without approval for P2 and below' },
      { name: 'Single-pod scope',           passed: true,  detail: 'Only 1 of 4 pods affected — no service impact' },
      { name: 'Not in maintenance window',  passed: true,  detail: 'No active maintenance window' },
      { name: 'Rollback possible',          passed: true,  detail: 'Previous pod spec retained' },
    ],
    tags: ['restart', 'notification-svc', 'autonomous', 'oom'],
    why: 'CrashLoopBackOff with OOMKilled is a deterministic, recoverable condition. The memory growth trend confirms a soft leak rather than a sudden spike (which would indicate a different root cause). A pod restart clears the memory state without data loss for a stateless notification worker. This action has a 98.3% success rate in the historical playbook for this exact pattern.',
    feedback: 'helpful',
  },
  {
    id: 'j-004',
    timestamp: new Date(Date.now() - 65 * 60_000).toISOString(),
    actionType: 'rejection',
    title: 'Block IP range 203.0.113.0/24',
    description: 'AI recommendation rejected — policy requires security team approval for IP block actions.',
    incidentId: 'INC-0038', service: 'api-gateway', actor: 'Policy Engine', isAi: false,
    outcome: 'skipped',
    rationale: 'Anomalous traffic pattern from this CIDR caused 12k 429 responses in 5 min. Blocking would stop the abuse but requires security team sign-off to avoid blocking legitimate users.',
    evidence: ['12,234 requests in 5 min from /24', '100% hit rate-limit', 'No user-agent rotation — bot pattern', 'No current customer IP records in this range'],
    policyChecks: [
      { name: 'IP block policy',        passed: false, detail: 'Network-level blocks require security team approval' },
      { name: 'GDPR/data retention',    passed: true,  detail: 'No PII exposure in this block' },
      { name: 'False positive check',   passed: false, detail: 'Unable to rule out ISP NAT — approval required' },
    ],
    tags: ['rejected', 'security', 'ip-block', 'policy'],
    why: 'The traffic pattern has a 91% bot signature match. However, the /24 block could affect up to 256 IP addresses. Without security team verification, there is a 9% chance of false-positive blocking a legitimate user or corporate NAT. Policy requires explicit approval for network-level actions with broad blast radius.',
    feedback: 'helpful',
  },
  {
    id: 'j-005',
    timestamp: new Date(Date.now() - 92 * 60_000).toISOString(),
    actionType: 'escalation',
    title: 'Escalate INC-0037 to on-call lead',
    description: 'AI escalated unresolved P1 incident after 45 min with no remediation progress.',
    incidentId: 'INC-0037', service: 'checkout-service', actor: 'AI System', isAi: true,
    confidence: 99, outcome: 'success', outcomeDetail: 'On-call lead acknowledged within 3 min. Incident resolved in 22 min.',
    rationale: 'SLA requires P1 incidents to show remediation progress within 30 min. After 45 min with no status change and no AI action successfully executed, escalation to on-call lead is mandatory.',
    evidence: ['Incident age: 45 min', 'No status update in 45 min', '3 failed auto-remediation attempts', 'SLA breach in 15 min'],
    policyChecks: [
      { name: 'Escalation SLA policy',   passed: true,  detail: 'P1 escalation required after 30 min' },
      { name: 'On-call roster active',   passed: true,  detail: 'Lead on-call: Sarah Kim (responded)' },
    ],
    tags: ['escalation', 'P1', 'sla'],
    why: 'All three automated remediation attempts (pod restart, cache flush, DB connection pool reset) failed to resolve the incident. The confidence score for a further autonomous action dropped below 40%, which crosses the model\'s uncertainty threshold. Escalation is the correct action when the AI cannot confidently resolve a P1 incident within SLA.',
    feedback: null,
  },
  {
    id: 'j-006',
    timestamp: new Date(Date.now() - 130 * 60_000).toISOString(),
    actionType: 'rollback',
    title: 'Rollback auth-service to v3.1.4',
    description: 'Rollback executed after failed canary deployment caused 3.2% token validation errors.',
    incidentId: 'INC-0036', service: 'auth-service', actor: 'AI System', isAi: true,
    confidence: 97, outcome: 'success', outcomeDetail: 'Error rate dropped from 3.2% to 0.1% within 90s. Incident resolved.',
    rationale: 'Canary deployment v3.2.0 introduced a JWT validation regression. 5% canary traffic showed 3.2% error rate vs 0.08% on stable. Statistical significance reached at p<0.001 after 8 min.',
    evidence: ['Canary error rate: 3.2% (5% traffic)', 'Stable error rate: 0.08%', 'Statistical significance p<0.001', 'Error pattern: JWT expiry validation', 'No data migration performed'],
    policyChecks: [
      { name: 'Canary rollback policy',   passed: true,  detail: 'Error delta > 1% triggers autonomous rollback' },
      { name: 'Data integrity',           passed: true,  detail: 'No schema change — safe to rollback' },
      { name: 'Session impact',           passed: true,  detail: 'Rolling restart preserves active sessions' },
    ],
    tags: ['rollback', 'auth-service', 'canary', 'jwt'],
    why: 'The canary analysis model uses Bayesian comparison of error rates between canary and stable traffic. With p<0.001 after 8 minutes, the probability that the canary regression is noise is less than 0.1%. The rollback policy threshold (error delta > 1%) was exceeded at minute 6. Autonomous rollback was executed at minute 8 after a 2-min stabilisation window to confirm the trend was not transient.',
    feedback: 'helpful',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const ACTION_META: Record<ActionType, { color: string; bg: string; border: string; Icon: React.ElementType; label: string }> = {
  recommendation: { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    Icon: Bot,          label: 'Recommendation' },
  approval:       { color: 'text-emerald-400',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', Icon: CheckCircle2, label: 'Approval'       },
  rejection:      { color: 'text-red-400',      bg: 'bg-red-500/10',     border: 'border-red-500/25',     Icon: XCircle,      label: 'Rejected'       },
  execution:      { color: 'text-primary',      bg: 'bg-primary/10',     border: 'border-primary/25',     Icon: Zap,          label: 'Executed'       },
  escalation:     { color: 'text-yellow-400',   bg: 'bg-yellow-500/10',  border: 'border-yellow-500/25',  Icon: AlertTriangle,label: 'Escalation'     },
  rollback:       { color: 'text-purple-400',   bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  Icon: RefreshCw,    label: 'Rollback'       },
};

const OUTCOME_META: Record<OutcomeType, { color: string; label: string }> = {
  success: { color: 'text-emerald-400', label: 'Success'  },
  partial: { color: 'text-yellow-400',  label: 'Partial'  },
  failed:  { color: 'text-red-400',     label: 'Failed'   },
  pending: { color: 'text-blue-400',    label: 'Pending'  },
  skipped: { color: 'text-muted-foreground', label: 'Skipped' },
};

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// ── Entry card ─────────────────────────────────────────────────────────────
function EntryCard({ entry, expanded, onToggle, onFeedback }: {
  entry: JournalEntry;
  expanded: boolean;
  onToggle: () => void;
  onFeedback: (id: string, f: FeedbackType) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const am = ACTION_META[entry.actionType];
  const om = OUTCOME_META[entry.outcome];

  return (
    <div className={cn('rounded-lg border transition-all', am.bg, am.border, expanded && 'shadow-md')}>
      {/* Header row */}
      <button onClick={onToggle} className="w-full flex items-start gap-3 p-3 text-left">
        <div className={cn('mt-0.5 p-1.5 rounded border shrink-0', am.bg, am.border)}>
          <am.Icon className={cn('h-3.5 w-3.5', am.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{entry.title}</span>
              {entry.incidentId && (
                <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{entry.incidentId}</span>
              )}
            </div>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn('text-[11px] font-semibold', am.color)}>{am.label}</span>
            <span className={cn('text-[11px] font-semibold', om.color)}>· {om.label}</span>
            <span className="text-[11px] text-muted-foreground">{fmtTs(entry.timestamp)} ({timeAgo(entry.timestamp)})</span>
            <div className="flex items-center gap-1">
              {entry.isAi ? <Bot className="h-3 w-3 text-blue-400" /> : <User className="h-3 w-3 text-muted-foreground" />}
              <span className="text-[11px] text-muted-foreground">{entry.actor}</span>
            </div>
            {entry.confidence && (
              <span className="text-[11px] text-muted-foreground">{entry.confidence}% confidence</span>
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 text-pretty">{entry.description}</p>
          )}
          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {entry.tags.map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">#{t}</span>
            ))}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-4">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{entry.description}</p>
          {entry.outcomeDetail && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
              <span className="text-muted-foreground">{entry.outcomeDetail}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rationale */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rationale</h4>
              <p className="text-xs text-muted-foreground leading-relaxed text-pretty">{entry.rationale}</p>
            </div>

            {/* Evidence */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evidence</h4>
              <ul className="flex flex-col gap-1">
                {entry.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />{e}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Policy checks */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Policy Checks ({entry.policyChecks.filter(p => p.passed).length}/{entry.policyChecks.length} passed)
            </h4>
            <div className="flex flex-col gap-1.5">
              {entry.policyChecks.map(pc => (
                <div key={pc.name} className="flex items-start gap-2 text-xs">
                  {pc.passed
                    ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
                    : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                  }
                  <span className={cn('font-medium', pc.passed ? 'text-foreground' : 'text-red-300')}>{pc.name}</span>
                  <span className="text-muted-foreground">— {pc.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Why section */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5">
            <button onClick={() => setWhyOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left">
              <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-blue-300 flex-1">Why was this action suggested?</span>
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', whyOpen && 'rotate-180')} />
            </button>
            {whyOpen && (
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed border-t border-blue-500/15 pt-2 text-pretty">
                {entry.why}
              </div>
            )}
          </div>

          {/* Feedback */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Was this suggestion helpful?</span>
              <button
                onClick={() => onFeedback(entry.id, entry.feedback === 'helpful' ? null : 'helpful')}
                className={cn('flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all',
                  entry.feedback === 'helpful'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400')}>
                <ThumbsUp className="h-3 w-3" /> Yes
              </button>
              <button
                onClick={() => onFeedback(entry.id, entry.feedback === 'not_helpful' ? null : 'not_helpful')}
                className={cn('flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all',
                  entry.feedback === 'not_helpful'
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400')}>
                <ThumbsDown className="h-3 w-3" /> No
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
              <Lock className="h-3 w-3" /> Immutable entry — {entry.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function DecisionJournalPage() {
  const { theme, toggleTheme } = useTheme();
  const [entries, setEntries] = useState<JournalEntry[]>(MOCK_ENTRIES);
  const [expandedId, setExpandedId] = useState<string | null>('j-001');

  // ── Filters ────────────────────────────────────────────────────────────────
  const [keyword, setKeyword]       = useState('');
  const [typeFilter, setTypeFilter] = useState<ActionType | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeType | 'all'>('all');
  const [actorFilter, setActorFilter] = useState<'all' | 'ai' | 'human'>('all');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return entries.filter(e => {
      if (typeFilter    !== 'all' && e.actionType !== typeFilter)           return false;
      if (outcomeFilter !== 'all' && e.outcome    !== outcomeFilter)        return false;
      if (actorFilter   === 'ai'    && !e.isAi)                             return false;
      if (actorFilter   === 'human' && e.isAi)                              return false;
      if (kw && !e.title.toLowerCase().includes(kw)
             && !e.description.toLowerCase().includes(kw)
             && !(e.incidentId ?? '').toLowerCase().includes(kw)
             && !(e.service ?? '').toLowerCase().includes(kw)
             && !e.tags.some(t => t.includes(kw)))                         return false;
      return true;
    });
  }, [entries, keyword, typeFilter, outcomeFilter, actorFilter]);

  const hasFilters = keyword || typeFilter !== 'all' || outcomeFilter !== 'all' || actorFilter !== 'all';

  const handleFeedback = (id: string, feedback: FeedbackType) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, feedback } : e));
  };

  // KPI counts
  const aiActions   = entries.filter(e => e.isAi).length;
  const successRate = Math.round((entries.filter(e => e.outcome === 'success').length / entries.length) * 100);
  const pending     = entries.filter(e => e.outcome === 'pending').length;

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">

      {/* Header */}
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <img src="/images/logo/sentinelops-logo.png"
            alt="SentinelOps" className="h-7 w-7 object-contain shrink-0" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="h-4 w-px bg-border" />
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Decision Journal</span>
        </div>
        <div className="flex-1" />

        {/* KPIs */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-muted-foreground">{aiActions} AI actions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-muted-foreground">{successRate}% success</span>
          </div>
          {pending > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-blue-400">{pending} pending</span>
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => {}}
          className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Sub-bar: filters */}
      <div className="shrink-0 border-b border-border px-4 py-2 flex flex-wrap items-center gap-2 bg-card/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search journal..."
            className="h-7 pl-8 pr-7 text-xs w-48 bg-background" />
          {keyword && (
            <button onClick={() => setKeyword('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as ActionType | 'all')}>
          <SelectTrigger className="h-7 text-xs w-36 bg-background border-border">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(Object.keys(ACTION_META) as ActionType[]).map(t => (
              <SelectItem key={t} value={t}>{ACTION_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={outcomeFilter} onValueChange={v => setOutcomeFilter(v as OutcomeType | 'all')}>
          <SelectTrigger className="h-7 text-xs w-32 bg-background border-border">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            {(Object.keys(OUTCOME_META) as OutcomeType[]).map(o => (
              <SelectItem key={o} value={o}>{OUTCOME_META[o].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actorFilter} onValueChange={v => setActorFilter(v as 'all' | 'ai' | 'human')}>
          <SelectTrigger className="h-7 text-xs w-32 bg-background border-border">
            <SelectValue placeholder="Actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            <SelectItem value="ai">AI System</SelectItem>
            <SelectItem value="human">Human</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <button onClick={() => { setKeyword(''); setTypeFilter('all'); setOutcomeFilter('all'); setActorFilter('all'); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-[11px] text-muted-foreground">
          {filtered.length} of {entries.length} entries
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No journal entries match the current filters.</p>
              <button onClick={() => { setKeyword(''); setTypeFilter('all'); setOutcomeFilter('all'); setActorFilter('all'); }}
                className="text-xs text-primary hover:underline">Reset filters</button>
            </div>
          ) : (
            filtered.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(id => id === entry.id ? null : entry.id)}
                onFeedback={handleFeedback}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
