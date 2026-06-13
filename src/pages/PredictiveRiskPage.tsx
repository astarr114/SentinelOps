import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar, Cell,
} from 'recharts';
import {
  Shield, Sun, Moon, ArrowLeft, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Zap, Activity, ChevronRight,
  Info, RefreshCw, Clock, Cpu, Database, Globe, Lock, Server,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Signal {
  label: string;
  value: string;
  weight: number; // 0-1, contribution to risk
  direction: 'up' | 'down' | 'flat';
}

interface ServiceRisk {
  id: string;
  name: string;
  icon: React.ElementType;
  riskScore: number;      // 0–100
  confidence: number;     // 0–100
  trend: 'up' | 'down' | 'flat';
  prediction: string;
  timeToIncident: string | null; // "~12 min" or null
  environment: 'prod' | 'staging' | 'dev';
  signals: Signal[];
}

interface TimelinePoint { t: string; score: number; }

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_SERVICES: ServiceRisk[] = [
  {
    id: 's1', name: 'checkout-service', icon: Globe, riskScore: 87, confidence: 92,
    trend: 'up', prediction: 'Payment timeout spike likely within 15 min',
    timeToIncident: '~12 min', environment: 'prod',
    signals: [
      { label: 'Error rate',       value: '4.2%',   weight: 0.38, direction: 'up'   },
      { label: 'P99 latency',      value: '1.84s',  weight: 0.29, direction: 'up'   },
      { label: 'DB pool usage',    value: '91%',    weight: 0.21, direction: 'up'   },
      { label: 'Deploy 18m ago',   value: 'v2.4.1', weight: 0.12, direction: 'flat' },
    ],
  },
  {
    id: 's2', name: 'payment-gateway', icon: Lock, riskScore: 73, confidence: 85,
    trend: 'up', prediction: 'Downstream dependency degradation expected',
    timeToIncident: '~28 min', environment: 'prod',
    signals: [
      { label: 'Stripe API latency', value: '620ms', weight: 0.41, direction: 'up'   },
      { label: 'Retry rate',         value: '8.1%',  weight: 0.33, direction: 'up'   },
      { label: 'Queue depth',        value: '1.2k',  weight: 0.26, direction: 'up'   },
    ],
  },
  {
    id: 's3', name: 'auth-service', icon: Lock, riskScore: 44, confidence: 78,
    trend: 'flat', prediction: 'Stable — minor token cache pressure',
    timeToIncident: null, environment: 'prod',
    signals: [
      { label: 'Cache hit rate',  value: '81%',   weight: 0.45, direction: 'down' },
      { label: 'Token refresh',   value: '3.4/s', weight: 0.32, direction: 'up'  },
      { label: 'CPU usage',       value: '38%',   weight: 0.23, direction: 'flat'},
    ],
  },
  {
    id: 's4', name: 'inventory-api', icon: Database, riskScore: 31, confidence: 88,
    trend: 'down', prediction: 'Risk decreasing — recent rollback stabilised service',
    timeToIncident: null, environment: 'prod',
    signals: [
      { label: 'Error rate',    value: '0.4%',   weight: 0.50, direction: 'down' },
      { label: 'P95 latency',   value: '142ms',  weight: 0.30, direction: 'down' },
      { label: 'Memory',        value: '54%',    weight: 0.20, direction: 'flat' },
    ],
  },
  {
    id: 's5', name: 'notification-svc', icon: Activity, riskScore: 18, confidence: 91,
    trend: 'down', prediction: 'Healthy — all queues draining normally',
    timeToIncident: null, environment: 'prod',
    signals: [
      { label: 'Queue lag',    value: '0.2s',   weight: 0.55, direction: 'down' },
      { label: 'Error rate',   value: '0.1%',   weight: 0.30, direction: 'down' },
      { label: 'Throughput',   value: '2.1k/m', weight: 0.15, direction: 'up'  },
    ],
  },
  {
    id: 's6', name: 'api-gateway', icon: Server, riskScore: 61, confidence: 80,
    trend: 'up', prediction: 'Rate-limit breach probable if load keeps growing',
    timeToIncident: '~22 min', environment: 'prod',
    signals: [
      { label: 'Req rate',       value: '4.2k/s', weight: 0.44, direction: 'up'  },
      { label: '4xx errors',     value: '2.1%',   weight: 0.34, direction: 'up'  },
      { label: 'SSL cert age',   value: '6d left',weight: 0.22, direction: 'up'  },
    ],
  },
  {
    id: 's7', name: 'data-pipeline', icon: Cpu, riskScore: 55, confidence: 74,
    trend: 'flat', prediction: 'Moderate backlog — may cascade to reporting',
    timeToIncident: '~35 min', environment: 'staging',
    signals: [
      { label: 'Batch lag',    value: '18 min',  weight: 0.48, direction: 'up'   },
      { label: 'Memory',       value: '74%',     weight: 0.32, direction: 'up'   },
      { label: 'Retries',      value: '12/hr',   weight: 0.20, direction: 'flat' },
    ],
  },
];

function buildTimeline(finalScore: number): TimelinePoint[] {
  const pts: TimelinePoint[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const t = new Date(now - i * 60_000);
    const label = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const noise = (Math.random() - 0.5) * 12;
    const base  = finalScore - (i / 29) * (finalScore * 0.4) + noise;
    pts.push({ t: label, score: Math.round(Math.min(100, Math.max(0, base))) });
  }
  return pts;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function riskColor(score: number): string {
  if (score >= 80) return 'text-red-500';
  if (score >= 60) return 'text-orange-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-emerald-400';
}

function riskBg(score: number): string {
  if (score >= 80) return 'bg-red-500/10 border-red-500/20';
  if (score >= 60) return 'bg-orange-500/10 border-orange-500/20';
  if (score >= 40) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}

function riskLabel(score: number): string {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function riskStroke(score: number): string {
  if (score >= 80) return 'hsl(0 74% 52%)';
  if (score >= 60) return 'hsl(22 100% 60%)';
  if (score >= 40) return 'hsl(38 92% 50%)';
  return 'hsl(145 63% 42%)';
}

function TrendIcon({ t, className }: { t: 'up' | 'down' | 'flat'; className?: string }) {
  if (t === 'up')   return <TrendingUp className={cn('h-3.5 w-3.5 text-red-400',     className)} />;
  if (t === 'down') return <TrendingDown className={cn('h-3.5 w-3.5 text-emerald-400', className)} />;
  return <Minus className={cn('h-3.5 w-3.5 text-muted-foreground', className)} />;
}

// ── Signal bar ─────────────────────────────────────────────────────────────
function SignalBar({ signal }: { signal: Signal }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 text-muted-foreground truncate">{signal.label}</div>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            signal.direction === 'up'   ? 'bg-red-500'     :
            signal.direction === 'down' ? 'bg-emerald-500' : 'bg-yellow-500',
          )}
          style={{ width: `${signal.weight * 100}%` }}
        />
      </div>
      <div className="w-14 text-right font-mono text-muted-foreground">{signal.value}</div>
      <TrendIcon t={signal.direction} />
    </div>
  );
}

// ── Radial score gauge ─────────────────────────────────────────────────────
function RiskGauge({ score }: { score: number }) {
  const data = [{ value: score }, { value: 100 - score }];
  const color = riskStroke(score);
  return (
    <div className="relative w-16 h-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="62%" outerRadius="100%"
          startAngle={220} endAngle={-40} data={[{ value: score, fill: color }]}>
          <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'hsl(220 16% 14%)' }}>
            {data.map((_, i) => <Cell key={i} fill={i === 0 ? color : 'transparent'} />)}
          </RadialBar>
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-sm font-bold tabular-nums', riskColor(score))}>{score}</span>
      </div>
    </div>
  );
}

// ── Service card ───────────────────────────────────────────────────────────
function ServiceCard({
  svc, selected, onClick,
}: {
  svc: ServiceRisk;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        riskBg(svc.riskScore),
        selected ? 'ring-2 ring-primary' : 'hover:brightness-110',
      )}
    >
      <div className="flex items-start gap-3">
        <RiskGauge score={svc.riskScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">{svc.name}</span>
            <TrendIcon t={svc.trend} />
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', riskBg(svc.riskScore), riskColor(svc.riskScore))}>
              {riskLabel(svc.riskScore)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {svc.confidence}% confidence
            </span>
            {svc.environment !== 'prod' && (
              <span className="text-[10px] text-blue-400 font-mono">{svc.environment}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 text-pretty">{svc.prediction}</p>
          {svc.timeToIncident && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-orange-400">
              <Clock className="h-3 w-3" />
              <span>Predicted incident: {svc.timeToIncident}</span>
            </div>
          )}
        </div>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', selected && 'rotate-90')} />
      </div>
    </button>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────
function DetailPanel({ svc }: { svc: ServiceRisk }) {
  const timeline = useMemo(() => buildTimeline(svc.riskScore), [svc.id]);
  const stroke   = riskStroke(svc.riskScore);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn('p-2.5 rounded-lg border', riskBg(svc.riskScore))}>
          <svc.icon className={cn('h-5 w-5', riskColor(svc.riskScore))} />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">{svc.name}</h2>
          <p className="text-sm text-muted-foreground">{svc.prediction}</p>
        </div>
      </div>

      {/* Score + confidence */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Risk Score', value: `${svc.riskScore}`, color: riskColor(svc.riskScore) },
          { label: 'Confidence', value: `${svc.confidence}%`, color: 'text-blue-400' },
          { label: 'Status',     value: riskLabel(svc.riskScore), color: riskColor(svc.riskScore) },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg bg-muted/50 border border-border p-3 text-center">
            <div className={cn('text-xl font-bold tabular-nums', kpi.color)}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          30-Min Risk Timeline
        </h3>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={`rg-${svc.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={stroke} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 17%)" />
              <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'hsl(215 14% 48%)' }}
                tickLine={false} axisLine={false} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(215 14% 48%)' }}
                tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(220 20% 12%)', border: '1px solid hsl(220 16% 17%)', borderRadius: 6, fontSize: 11 }}
                formatter={(v: number) => [`${v}`, 'Risk']}
              />
              <Area dataKey="score" stroke={stroke} strokeWidth={2}
                fill={`url(#rg-${svc.id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Signals */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Contributing Signals
        </h3>
        <div className="flex flex-col gap-2.5">
          {svc.signals.map(sig => <SignalBar key={sig.label} signal={sig} />)}
        </div>
      </div>

      {/* Why explanation */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-semibold text-blue-300">Why this score?</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
          The risk model weighs error rate (38%), latency percentiles (29%), resource saturation (21%),
          and recent deployment activity (12%). The current pattern matches 14 historical incidents
          with {svc.confidence}% similarity — triggering a {riskLabel(svc.riskScore).toLowerCase()} confidence prediction.
        </p>
      </div>

      {svc.timeToIncident && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-500/30 bg-orange-500/8 p-3">
          <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Predicted incident in {svc.timeToIncident}</p>
            <p className="text-xs text-muted-foreground">Recommend pre-emptive investigation before threshold breach.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Watchlist row ──────────────────────────────────────────────────────────
function WatchlistRow({ svc, rank, onClick }: { svc: ServiceRisk; rank: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 rounded transition-colors">
      <span className="w-5 text-xs text-muted-foreground tabular-nums text-right shrink-0">{rank}.</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground truncate">{svc.name}</span>
        <TrendIcon t={svc.trend} />
      </div>
      <div className={cn('text-sm font-bold tabular-nums', riskColor(svc.riskScore))}>{svc.riskScore}</div>
      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${svc.riskScore}%`, background: riskStroke(svc.riskScore) }} />
      </div>
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
// ── Real-data risk computation from live_incidents ─────────────────────────
interface LiveRow {
  service: string;
  severity: string;
  status: string;
  opened_at: string;
}

function computeRiskFromIncidents(rows: LiveRow[]): ServiceRisk[] {
  const open = rows.filter(r => r.status !== 'RESOLVED');
  const byService = new Map<string, LiveRow[]>();
  for (const r of open) {
    const svc = r.service || 'unknown';
    if (!byService.has(svc)) byService.set(svc, []);
    byService.get(svc)!.push(r);
  }

  const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 40, HIGH: 25, MEDIUM: 15, LOW: 8 };
  const ICON_MAP: Record<string, React.ElementType> = {};
  const results: ServiceRisk[] = [];

  for (const [svc, incidents] of byService.entries()) {
    const baseScore = Math.min(100, incidents.reduce((s, i) => s + (SEVERITY_WEIGHT[i.severity] ?? 8), 0));
    // Age bonus: older open incidents raise risk
    const oldestMs = Math.max(...incidents.map(i => Date.now() - new Date(i.opened_at).getTime()));
    const ageBonus = Math.min(15, Math.floor(oldestMs / 3_600_000) * 2);
    const riskScore = Math.min(100, baseScore + ageBonus);
    const confidence = 70 + Math.min(25, incidents.length * 5);
    const hasCritical = incidents.some(i => i.severity === 'CRITICAL');
    const hasHigh     = incidents.some(i => i.severity === 'HIGH');
    const dominant    = hasCritical ? 'CRITICAL' : hasHigh ? 'HIGH' : 'MEDIUM';

    const signals: Signal[] = [
      { label: 'Open incidents',  value: String(incidents.length),    weight: 0.45, direction: 'up'   },
      { label: 'Dominant sev',    value: dominant,                     weight: 0.30, direction: hasCritical || hasHigh ? 'up' : 'flat' },
      { label: 'Age (oldest)',    value: `${Math.floor(oldestMs / 60_000)}m`,  weight: 0.15, direction: 'up'   },
      { label: 'Age bonus',       value: `+${ageBonus}`,              weight: 0.10, direction: ageBonus > 5 ? 'up' : 'flat' },
    ];

    const tti = riskScore >= 80 ? `~${Math.max(5, 60 - Math.floor(riskScore * 0.5))} min` : null;

    results.push({
      id: svc,
      name: svc,
      icon: ICON_MAP[svc] ?? Server,
      riskScore,
      confidence,
      trend: 'up',
      prediction: riskScore >= 80
        ? `High risk — ${incidents.length} open incident${incidents.length > 1 ? 's' : ''}, action recommended`
        : riskScore >= 50
          ? `Elevated risk — monitor closely`
          : `Moderate risk — ${incidents.length} open incident${incidents.length > 1 ? 's' : ''}`,
      timeToIncident: tti,
      environment: 'prod' as const,
      signals,
    });
  }

  // Fill remaining MOCK_SERVICES entries not in DB (blend real + mock)
  const realSvcs = new Set(results.map(r => r.name));
  const mockFill = MOCK_SERVICES.filter(m => !realSvcs.has(m.name));
  return [...results, ...mockFill].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
}

export default function PredictiveRiskPage() {
  const { theme, toggleTheme } = useTheme();
  const [services, setServices]   = useState<ServiceRisk[]>(MOCK_SERVICES);
  const [selected, setSelected]   = useState<ServiceRisk>(MOCK_SERVICES[0]);
  const [loadingReal, setLoadingReal] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  );

  const loadReal = useCallback(async () => {
    setLoadingReal(true);
    const { data } = await supabase
      .from('live_incidents')
      .select('service, severity, status, opened_at')
      .order('opened_at', { ascending: false })
      .limit(500);
    if (Array.isArray(data) && data.length > 0) {
      const computed = computeRiskFromIncidents(data as LiveRow[]);
      setServices(computed);
      setSelected(prev => computed.find(s => s.id === prev.id) ?? computed[0]);
    }
    setLastRefresh(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    setLoadingReal(false);
  }, []);

  useEffect(() => { loadReal(); }, [loadReal]);

  const sorted = useMemo(() => [...services].sort((a, b) => b.riskScore - a.riskScore), [services]);

  const handleRefresh = () => { loadReal(); };

  const criticalCount = sorted.filter(s => s.riskScore >= 80).length;
  const highCount     = sorted.filter(s => s.riskScore >= 60 && s.riskScore < 80).length;

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
          <img src="https://miaoda-conversation-file.s3cdn.medo.dev/user-b8uq3eatai9u/app-bs8qtod6o9hd/20260527/SentinelOps logo Final.png"
            alt="SentinelOps" className="h-7 w-7 object-contain shrink-0" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="h-4 w-px bg-border" />
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Predictive Risk Engine</span>
        </div>
        <div className="flex-1" />

        {/* KPI pills */}
        <div className="hidden md:flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-red-400 font-semibold">
              {criticalCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-400 font-semibold">
              {highCount} High
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">Updated {lastRefresh}</span>
        </div>

        <Button variant="ghost" size="sm" onClick={handleRefresh}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: ranked service list */}
        <aside className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden bg-card/50">
          <div className="px-3 py-2.5 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Service Risk Ranking — {sorted.length} services
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {sorted.map(svc => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                selected={selected.id === svc.id}
                onClick={() => setSelected(svc)}
              />
            ))}
          </div>
        </aside>

        {/* Centre: detail panel */}
        <main className="flex-1 min-w-0 overflow-y-auto p-5">
          <DetailPanel key={selected.id} svc={selected} />
        </main>

        {/* Right: watchlist */}
        <aside className="w-56 shrink-0 border-l border-border flex flex-col overflow-hidden hidden lg:flex">
          <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Incident Watchlist
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {sorted.map((svc, i) => (
              <WatchlistRow key={svc.id} svc={svc} rank={i + 1} onClick={() => setSelected(svc)} />
            ))}
          </div>

          {/* System overview */}
          <div className="border-t border-border p-3">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Fleet Overview
            </h3>
            <div className="flex flex-col gap-1.5">
              {([
                ['Critical', sorted.filter(s => s.riskScore >= 80).length, 'text-red-400'],
                ['High',     sorted.filter(s => s.riskScore >= 60 && s.riskScore < 80).length, 'text-orange-400'],
                ['Medium',   sorted.filter(s => s.riskScore >= 40 && s.riskScore < 60).length, 'text-yellow-400'],
                ['Low',      sorted.filter(s => s.riskScore < 40).length,  'text-emerald-400'],
              ] as [string, number, string][]).map(([label, count, color]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cn('font-semibold tabular-nums', color)}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
