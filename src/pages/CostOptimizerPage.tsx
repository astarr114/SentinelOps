import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  ArrowLeft, Sun, Moon, RefreshCw, DollarSign, Shield, Activity,
  TrendingUp, TrendingDown, Minus, ChevronRight, Info, Zap, Loader2,
  AlertTriangle, CheckCircle2, Target,
} from 'lucide-react';

interface Tradeoff {
  service: string;
  cost_score: number;       // 0-100 (higher = more expensive)
  security_score: number;   // 0-100 (higher = more secure)
  reliability_score: number;// 0-100 (higher = more reliable)
  cost_monthly: number;     // USD
  mttr_minutes: number;
  slo_burn_rate: number;    // % of SLO budget consumed
  open_incidents: number;
  compliance_pct: number;
}

interface Recommendation {
  service: string;
  title: string;
  description: string;
  impact: 'cost' | 'security' | 'reliability' | 'all';
  estimated_savings: number | null;
  effort: 'low' | 'medium' | 'high';
  priority: 'high' | 'medium' | 'low';
}

const MOCK_DATA: Tradeoff[] = [
  { service: 'checkout-service',  cost_score: 82, security_score: 74, reliability_score: 55, cost_monthly: 3200, mttr_minutes: 42, slo_burn_rate: 68, open_incidents: 3, compliance_pct: 91 },
  { service: 'payment-gateway',   cost_score: 71, security_score: 88, reliability_score: 72, cost_monthly: 2800, mttr_minutes: 28, slo_burn_rate: 31, open_incidents: 1, compliance_pct: 97 },
  { service: 'auth-service',      cost_score: 44, security_score: 95, reliability_score: 91, cost_monthly: 1200, mttr_minutes: 12, slo_burn_rate: 8,  open_incidents: 0, compliance_pct: 100 },
  { service: 'inventory-api',     cost_score: 55, security_score: 68, reliability_score: 84, cost_monthly: 1800, mttr_minutes: 18, slo_burn_rate: 14, open_incidents: 0, compliance_pct: 88 },
  { service: 'notification-svc',  cost_score: 38, security_score: 61, reliability_score: 77, cost_monthly: 900,  mttr_minutes: 22, slo_burn_rate: 20, open_incidents: 1, compliance_pct: 80 },
  { service: 'api-gateway',       cost_score: 67, security_score: 79, reliability_score: 88, cost_monthly: 2100, mttr_minutes: 9,  slo_burn_rate: 12, open_incidents: 0, compliance_pct: 95 },
];

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { service: 'checkout-service',  title: 'Downscale off-peak from 8→4 pods',        description: 'Traffic analysis shows <30% utilisation between 02:00–07:00 UTC. Auto-scaling policy can save $640/month.',    impact: 'cost',        estimated_savings: 640,  effort: 'low',    priority: 'high'   },
  { service: 'checkout-service',  title: 'Enable mutual TLS on DB connections',      description: 'Database connections are currently unencrypted within the VPC. Enabling mTLS improves security posture.',       impact: 'security',    estimated_savings: null, effort: 'medium', priority: 'high'   },
  { service: 'notification-svc',  title: 'Upgrade from TLS 1.2 to 1.3',             description: 'TLS 1.2 is deprecated in PCI-DSS 4.0. Upgrade eliminates cipher-suite vulnerabilities.',                        impact: 'security',    estimated_savings: null, effort: 'low',    priority: 'high'   },
  { service: 'inventory-api',     title: 'Add circuit breaker to upstream calls',    description: 'No retry/circuit-breaker pattern detected on external warehouse API. Adding one will reduce timeout cascades.', impact: 'reliability', estimated_savings: null, effort: 'medium', priority: 'medium' },
  { service: 'payment-gateway',   title: 'Cache exchange rates for 60s',             description: 'FX API is called on every transaction. A 60s TTL cache would cut API costs and reduce P99 latency by ~40ms.',   impact: 'all',         estimated_savings: 280,  effort: 'low',    priority: 'medium' },
  { service: 'api-gateway',       title: 'Enable request coalescing for GET /items', description: 'High fan-out GET requests can be coalesced, reducing backend load by ~35% and saving ~$180/month.',            impact: 'cost',        estimated_savings: 180,  effort: 'medium', priority: 'low'    },
];

const IMPACT_META: Record<Recommendation['impact'], { color: string; label: string }> = {
  cost:        { color: 'text-yellow-400',  label: 'Cost'        },
  security:    { color: 'text-red-400',     label: 'Security'    },
  reliability: { color: 'text-blue-400',    label: 'Reliability' },
  all:         { color: 'text-primary',     label: 'All 3 axes'  },
};

const EFFORT_COLOR: Record<string, string> = { low: 'text-emerald-400', medium: 'text-yellow-400', high: 'text-red-400' };

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-bold tabular-nums', color)}>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color.replace('text-', 'bg-'))} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function CostOptimizerPage() {
  const { theme, toggleTheme } = useTheme();
  const [data, setData]         = useState<Tradeoff[]>(MOCK_DATA);
  const [selected, setSelected] = useState<Tradeoff>(MOCK_DATA[0]);
  const [loading, setLoading]   = useState(false);
  const [recs, setRecs]         = useState<Recommendation[]>(MOCK_RECOMMENDATIONS);
  const [recFilter, setRecFilter] = useState<'all' | 'cost' | 'security' | 'reliability'>('all');

  // Load real incident counts per service to overlay on mock data
  const loadReal = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from('live_incidents')
      .select('service, severity, status')
      .neq('status', 'RESOLVED')
      .limit(500);
    if (Array.isArray(rows) && rows.length > 0) {
      const countBySvc = new Map<string, number>();
      for (const r of rows) { countBySvc.set(r.service, (countBySvc.get(r.service) ?? 0) + 1); }
      setData(MOCK_DATA.map(d => ({
        ...d,
        open_incidents: countBySvc.get(d.service) ?? d.open_incidents,
        reliability_score: Math.max(10, d.reliability_score - (countBySvc.get(d.service) ?? 0) * 8),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadReal(); }, [loadReal]);

  const radarData = [
    { axis: 'Cost Efficiency',    value: 100 - selected.cost_score },
    { axis: 'Security',           value: selected.security_score     },
    { axis: 'Reliability',        value: selected.reliability_score  },
    { axis: 'Compliance',         value: selected.compliance_pct     },
    { axis: 'SLO Health',         value: 100 - selected.slo_burn_rate},
  ];

  const totalMonthlyCost = data.reduce((s, d) => s + d.cost_monthly, 0);
  const totalSavings = recs.reduce((s, r) => s + (r.estimated_savings ?? 0), 0);
  const avgReliability = Math.round(data.reduce((s, d) => s + d.reliability_score, 0) / data.length);
  const avgSecurity    = Math.round(data.reduce((s, d) => s + d.security_score,    0) / data.length);

  const filteredRecs = recFilter === 'all' ? recs : recs.filter(r => r.impact === recFilter || r.impact === 'all');

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
        <div className="flex items-center gap-1.5 ml-2"><div className="h-4 w-px bg-border" /><Target className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Cost · Security · Reliability Optimizer</span></div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadReal} disabled={loading} className="h-8 w-8 p-0 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border bg-card/20">
          {[
            { label: 'Monthly Infra Cost',    value: `$${totalMonthlyCost.toLocaleString()}`,    Icon: DollarSign, color: 'text-yellow-400'  },
            { label: 'Potential Savings',     value: `$${totalSavings.toLocaleString()}/mo`,      Icon: TrendingDown, color: 'text-emerald-400' },
            { label: 'Avg Security Score',    value: `${avgSecurity}/100`,                        Icon: Shield,  color: 'text-red-400'     },
            { label: 'Avg Reliability Score', value: `${avgReliability}/100`,                     Icon: Activity, color: 'text-blue-400'    },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <k.Icon className={cn('h-5 w-5 shrink-0', k.color)} />
              <div>
                <div className={cn('text-xl font-bold tabular-nums', k.color)}>{k.value}</div>
                <div className="text-[10px] text-muted-foreground">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Service list */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Services</h2>
            {data.map(svc => (
              <button key={svc.service} onClick={() => setSelected(svc)}
                className={cn('text-left p-3 rounded-lg border transition-all bg-card hover:bg-accent/30',
                  selected.service === svc.service ? 'ring-2 ring-primary border-primary/40' : 'border-border')}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-foreground font-mono truncate">{svc.service}</span>
                  <span className="text-[10px] text-yellow-400 shrink-0">${svc.cost_monthly.toLocaleString()}/mo</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Cost',  value: svc.cost_score,        invert: true,  color: 'bg-yellow-500'  },
                    { label: 'Sec',   value: svc.security_score,    invert: false, color: 'bg-red-500'     },
                    { label: 'Rel',   value: svc.reliability_score, invert: false, color: 'bg-blue-500'    },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="text-[9px] text-muted-foreground mb-0.5">{m.label}</div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', m.color)} style={{ width: `${m.invert ? 100 - m.value : m.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {svc.open_incidents > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5 text-red-400" />
                    <span className="text-[9px] text-red-400">{svc.open_incidents} open incident{svc.open_incidents > 1 ? 's' : ''}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Radar + detail */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-xs font-semibold text-foreground mb-3 font-mono">{selected.service}</h2>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-2">
                <ScoreBar label="Cost efficiency"  value={100 - selected.cost_score}     color="text-yellow-400" />
                <ScoreBar label="Security"          value={selected.security_score}       color="text-red-400"    />
                <ScoreBar label="Reliability"       value={selected.reliability_score}    color="text-blue-400"   />
                <ScoreBar label="Compliance"        value={selected.compliance_pct}       color="text-emerald-400"/>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'Monthly cost',   value: `$${selected.cost_monthly.toLocaleString()}`, Icon: DollarSign  },
                { label: 'MTTR',           value: `${selected.mttr_minutes} min`,                Icon: Activity    },
                { label: 'SLO burn rate',  value: `${selected.slo_burn_rate}%`,                 Icon: TrendingUp  },
                { label: 'Compliance',     value: `${selected.compliance_pct}%`,                 Icon: Shield      },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-2">
                  <k.Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-semibold text-foreground">{k.value}</div>
                    <div className="text-[10px] text-muted-foreground">{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</h2>
              <select value={recFilter} onChange={e => setRecFilter(e.target.value as typeof recFilter)}
                className="h-7 rounded border border-border bg-secondary/30 px-1.5 text-[10px] text-foreground">
                <option value="all">All</option>
                <option value="cost">Cost</option>
                <option value="security">Security</option>
                <option value="reliability">Reliability</option>
              </select>
            </div>
            {filteredRecs.map((rec, i) => {
              const im = IMPACT_META[rec.impact];
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground text-pretty leading-tight">{rec.title}</span>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={cn('text-[10px] font-semibold', im.color)}>{im.label}</span>
                      {rec.estimated_savings && (
                        <span className="text-[10px] text-emerald-400 font-mono">-${rec.estimated_savings}/mo</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed text-pretty">{rec.description}</p>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="font-mono text-blue-400">{rec.service}</span>
                    <span className={EFFORT_COLOR[rec.effort]}>Effort: {rec.effort}</span>
                    <span className={rec.priority === 'high' ? 'text-red-400' : rec.priority === 'medium' ? 'text-yellow-400' : 'text-muted-foreground'}>
                      {rec.priority} priority
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
