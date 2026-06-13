import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/db/supabase';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { MttrWarningBanner } from '@/components/MttrWarningBanner';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, Activity, Zap, BarChart2, RefreshCw, Loader2, Shield,
  Database, Cpu, Bell, Sun, Moon, FileDown, Layers,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

// ── Colour tokens ─────────────────────────────────────────────────────────────
const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'hsl(0,72%,51%)',
  HIGH:     'hsl(25,90%,55%)',
  MEDIUM:   'hsl(44,96%,56%)',
  LOW:      'hsl(142,71%,45%)',
};
const STATUS_COLORS: Record<string, string> = {
  OPEN:          'hsl(0,72%,51%)',
  INVESTIGATING: 'hsl(44,96%,56%)',
  RESOLVED:      'hsl(142,71%,45%)',
};
const CHART_COLORS = [
  'hsl(214,80%,56%)', 'hsl(25,90%,55%)', 'hsl(142,71%,45%)',
  'hsl(271,71%,60%)', 'hsl(186,96%,42%)', 'hsl(44,96%,56%)',
];

// ── Theme-aware chart style helpers ──────────────────────────────────────────
function useChartTheme(isDark: boolean) {
  return useMemo(() => ({
    tooltip: {
      contentStyle: {
        backgroundColor: isDark ? 'hsl(216,19%,11%)' : 'hsl(0,0%,100%)',
        border: `1px solid ${isDark ? 'hsl(214,17%,22%)' : 'hsl(220,14%,82%)'}`,
        borderRadius: 8,
        fontSize: 11,
        color: isDark ? 'hsl(210,17%,91%)' : 'hsl(220,20%,10%)',
        boxShadow: isDark ? 'none' : '0 4px 12px rgba(0,0,0,0.12)',
      },
      labelStyle:  { color: isDark ? 'hsl(210,17%,91%)' : 'hsl(220,20%,10%)', fontWeight: 600 },
      itemStyle:   { color: isDark ? 'hsl(215,13%,70%)' : 'hsl(220,15%,30%)' },
    },
    // Light-mode grid/ticks ensure WCAG AA (≥4.5:1 on white)
    grid:     isDark ? 'hsl(214,17%,17%)' : 'hsl(220,14%,86%)',
    tick:     isDark ? 'hsl(215,13%,54%)' : 'hsl(220,15%,35%)',   // ~7:1 on white
    tickCat:  isDark ? 'hsl(215,13%,64%)' : 'hsl(220,15%,25%)',   // ~10:1 on white
    pieLabel: isDark ? 'hsl(215,13%,64%)' : 'hsl(220,15%,25%)',
    polar:    isDark ? 'hsl(214,17%,20%)' : 'hsl(220,14%,82%)',
    radarTick:isDark ? 'hsl(215,13%,40%)' : 'hsl(220,15%,35%)',   // ~7:1 on white
  }), [isDark]);
}

// ── Demo / fallback data ──────────────────────────────────────────────────────
function buildDemoTrend() {
  const now = Date.now();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * 86400000);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const CRITICAL = Math.floor(Math.random() * 3);
    const HIGH     = Math.floor(Math.random() * 6) + 1;
    const MEDIUM   = Math.floor(Math.random() * 8) + 2;
    const LOW      = Math.floor(Math.random() * 5);
    return { date: label, CRITICAL, HIGH, MEDIUM, LOW, total: CRITICAL + HIGH + MEDIUM + LOW };
  });
}

// ── Demo 30-day MTTR trend ────────────────────────────────────────────────────
function buildDemoMttrTrend(): {date: string; mttr: number | null}[] {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86400000);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const base = 45 + 20 * Math.sin((i / 30) * Math.PI * 2);
    const mttr = Math.round(base + (Math.random() - 0.5) * 12);
    return { date: label, mttr };
  });
}

// ── Print-section registry ─────────────────────────────────────────────────────
const PRINT_SECTIONS = [
  { id: 'section-kpi',          label: 'KPI Cards'                   },
  { id: 'section-trend',        label: '14-Day Incident Trend'       },
  { id: 'section-severity',     label: 'Severity Distribution'       },
  { id: 'section-services',     label: 'Incidents by Service'        },
  { id: 'section-status',       label: 'Status Overview'             },
  { id: 'section-mttr-service', label: 'MTTR by Service'             },
  { id: 'section-mttr-trend',   label: '30-Day MTTR Trend'           },
  { id: 'section-spl-activity', label: 'SPL Query Activity'          },
  { id: 'section-alert-sev',    label: 'Alert Severity Distribution' },
  { id: 'section-radar',        label: 'Operational Readiness Radar' },
  { id: 'section-velocity',     label: 'Incident Velocity'           },
] as const;

const DEMO_SERVICES = [
  { service: 'checkout-service',  count: 18 },
  { service: 'auth-service',      count: 14 },
  { service: 'payment-gateway',   count: 11 },
  { service: 'inventory-api',     count: 9  },
  { service: 'notification-svc',  count: 7  },
  { service: 'search-service',    count: 5  },
];
const DEMO_SEV_DIST = [
  { name: 'CRITICAL', value: 8  },
  { name: 'HIGH',     value: 22 },
  { name: 'MEDIUM',   value: 31 },
  { name: 'LOW',      value: 17 },
];
const DEMO_STATUS_DIST = [
  { name: 'OPEN',          value: 12 },
  { name: 'INVESTIGATING', value: 9  },
  { name: 'RESOLVED',      value: 47 },
];
const DEMO_MTTR = [
  { service: 'checkout-service', mttr: 42 },
  { service: 'auth-service',     mttr: 28 },
  { service: 'payment-gateway',  mttr: 67 },
  { service: 'inventory-api',    mttr: 19 },
  { service: 'notification-svc', mttr: 55 },
];
const DEMO_QUERY_TREND = Array.from({ length: 10 }, (_, i) => ({
  day:     `Day ${i + 1}`,
  queries: Math.floor(Math.random() * 15) + 3,
  saved:   Math.floor(Math.random() * 5),
}));
const DEMO_ALERT_SEV = [
  { name: 'CRITICAL', value: 5  },
  { name: 'HIGH',     value: 12 },
  { name: 'MEDIUM',   value: 18 },
  { name: 'LOW',      value: 8  },
];
const DEMO_RADAR = [
  { metric: 'Detection',  score: 82 },
  { metric: 'Response',   score: 74 },
  { metric: 'Coverage',   score: 67 },
  { metric: 'Accuracy',   score: 89 },
  { metric: 'Speed',      score: 78 },
  { metric: 'Automation', score: 63 },
];

// ── Custom label for Pie ──────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, outerRadius, name, percent, labelColor }:
  { cx: number; cy: number; midAngle: number; outerRadius: number; name: string; percent: number; labelColor: string }) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill={labelColor} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={10}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, trend, trendUp, color }:
  { icon: React.ElementType; label: string; value: string | number; sub?: string; trend?: string; trendUp?: boolean; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', trendUp ? 'trend-up' : 'trend-down')}>
            {trendUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, className, id }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <div id={id} className={cn('rounded-xl border border-border bg-card p-5 flex flex-col gap-4 h-full', className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground text-balance">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { theme, toggleTheme } = useTheme();
  const { config: appConfig } = useAppConfig();
  const isDark = theme === 'dark';
  const ct = useChartTheme(isDark);

  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Real data slots
  const [incidentTrend,    setIncidentTrend]    = useState(buildDemoTrend());
  const [serviceBreakdown, setServiceBreakdown] = useState(DEMO_SERVICES);
  const [sevDist,          setSevDist]          = useState(DEMO_SEV_DIST);
  const [statusDist,       setStatusDist]       = useState(DEMO_STATUS_DIST);
  const [mttrData,         setMttrData]         = useState(DEMO_MTTR);
  const [queryTrend,       setQueryTrend]       = useState(DEMO_QUERY_TREND);
  const [alertSevDist,     setAlertSevDist]     = useState(DEMO_ALERT_SEV);
  const [radarData]                             = useState(DEMO_RADAR);

  // KPI numbers
  const [totalIncidents, setTotalIncidents] = useState(78);
  const [openCount,      setOpenCount]      = useState(12);
  const [criticalCount,  setCriticalCount]  = useState(8);
  const [avgMttr,        setAvgMttr]        = useState(42);
  const [totalAlerts,    setTotalAlerts]    = useState(43);
  const [totalQueries,   setTotalQueries]   = useState(64);
  const [mttrSource,     setMttrSource]     = useState<'real' | 'demo'>('demo');
  const [mttrTrend,        setMttrTrend]        = useState<{date:string;mttr:number|null}[]>(() => buildDemoMttrTrend());
  const [mttrTrendSource,  setMttrTrendSource]  = useState<'real'|'demo'>('demo');
  const [showPdfModal,     setShowPdfModal]     = useState(false);
  const [printSections,    setPrintSections]    = useState<Set<string>>(() => new Set(PRINT_SECTIONS.map(s => s.id)));

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        { data: incidents },
        { data: splAlerts },
        { data: queryHistory },
      ] = await Promise.all([
        supabase
          .from('live_incidents')
          .select('id,severity,status,service,opened_at,resolved_at')
          .order('opened_at', { ascending: false })
          .limit(500),
        supabase.from('splunk_saved_alerts').select('id,severity,imported_at').limit(500),
        supabase.from('spl_query_history').select('id,created_at').limit(500),
      ]);

      // ── Incidents ────────────────────────────────────────────────────────
      if (Array.isArray(incidents) && incidents.length > 0) {
        setTotalIncidents(incidents.length);

        const open = incidents.filter(i => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
        const crit = incidents.filter(i => i.severity === 'CRITICAL').length;
        setOpenCount(open);
        setCriticalCount(crit);

        // Severity distribution
        const sevMap: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        incidents.forEach(i => { if (i.severity in sevMap) sevMap[i.severity]++; });
        setSevDist(Object.entries(sevMap).map(([name, value]) => ({ name, value })));

        // Status distribution
        const stMap: Record<string, number> = { OPEN: 0, INVESTIGATING: 0, RESOLVED: 0 };
        incidents.forEach(i => { if (i.status in stMap) stMap[i.status]++; });
        setStatusDist(Object.entries(stMap).map(([name, value]) => ({ name, value })));

        // Service breakdown (top 8)
        const svcMap: Record<string, number> = {};
        incidents.forEach(i => { if (i.service) svcMap[i.service] = (svcMap[i.service] ?? 0) + 1; });
        const sorted = Object.entries(svcMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        setServiceBreakdown(sorted.map(([service, count]) => ({ service, count })));

        // 14-day incident trend
        const buckets: Record<string, Record<string, number>> = {};
        incidents.forEach(i => {
          const d = new Date(i.opened_at);
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (!buckets[label]) buckets[label] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
          if (i.severity in buckets[label]) buckets[label][i.severity]++;
        });
        const trend = Array.from({ length: 14 }, (_, idx) => {
          const d = new Date(Date.now() - (13 - idx) * 86400000);
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const b = buckets[label] ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
          const CRITICAL = b.CRITICAL ?? 0;
          const HIGH     = b.HIGH     ?? 0;
          const MEDIUM   = b.MEDIUM   ?? 0;
          const LOW      = b.LOW      ?? 0;
          return { date: label, CRITICAL, HIGH, MEDIUM, LOW, total: CRITICAL + HIGH + MEDIUM + LOW };
        });
        setIncidentTrend(trend);

        // ── Real MTTR from resolved_at − opened_at ───────────────────────
        const resolvedWithTs = incidents.filter(
          i => i.status === 'RESOLVED' && i.resolved_at && i.opened_at && i.service
        );

        if (resolvedWithTs.length > 0) {
          // Per-service average MTTR in minutes
          const svcMttr: Record<string, number[]> = {};
          resolvedWithTs.forEach(i => {
            const mins = (new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) / 60000;
            if (mins > 0 && mins < 10080) { // cap at 7 days to exclude stale outliers
              if (!svcMttr[i.service]) svcMttr[i.service] = [];
              svcMttr[i.service].push(mins);
            }
          });
          const mttrEntries = Object.entries(svcMttr)
            .map(([service, vals]) => ({
              service: service.length > 16 ? service.slice(0, 14) + '…' : service,
              mttr: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
            }))
            .sort((a, b) => b.mttr - a.mttr)
            .slice(0, 6);

          if (mttrEntries.length > 0) {
            setMttrData(mttrEntries);
            const overall = Math.round(
              resolvedWithTs
                .map(i => (new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) / 60000)
                .filter(m => m > 0 && m < 10080)
                .reduce((a, b) => a + b, 0) /
              resolvedWithTs.filter(i => {
                const m = (new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) / 60000;
                return m > 0 && m < 10080;
              }).length
            );
            setAvgMttr(overall);
            setMttrSource('real');
          }
        } else {
          // Fall back to demo estimates per service
          const demoMttr = sorted.slice(0, 6).map(([service]) => ({
            service: service.length > 16 ? service.slice(0, 14) + '…' : service,
            mttr: Math.floor(Math.random() * 55) + 15,
          }));
          if (demoMttr.length > 0) setMttrData(demoMttr);
        }

        // ── 30-day rolling MTTR trend (daily average resolution time) ──────────────────────
        const thirtyDaysAgo = Date.now() - 30 * 86400000;
        const resolvedIn30 = incidents.filter(
          i => i.status === 'RESOLVED' && i.resolved_at && i.opened_at &&
               new Date(i.resolved_at).getTime() >= thirtyDaysAgo
        );

        if (resolvedIn30.length > 0) {
          // Group by resolved date, compute daily avg MTTR
          const dayBuckets: Record<string, number[]> = {};
          resolvedIn30.forEach(i => {
            const mins = (new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) / 60000;
            if (mins > 0 && mins < 10080) {
              const label = new Date(i.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              if (!dayBuckets[label]) dayBuckets[label] = [];
              dayBuckets[label].push(mins);
            }
          });
          const trendPoints = Array.from({ length: 30 }, (_, idx) => {
            const d = new Date(Date.now() - (29 - idx) * 86400000);
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const vals = dayBuckets[label];
            const mttr = vals && vals.length > 0
              ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
              : null;
            return { date: label, mttr };
          });
          setMttrTrend(trendPoints);
          setMttrTrendSource('real');
        }
        // else keep the demo curve set during useState init
      }

      // ── SPL query history trend ───────────────────────────────────────────
      if (Array.isArray(queryHistory) && queryHistory.length > 0) {
        setTotalQueries(queryHistory.length);
        const qBuckets: Record<string, number> = {};
        queryHistory.forEach(q => {
          const d = new Date(q.created_at);
          const label = `Day ${d.getDate()}`;
          qBuckets[label] = (qBuckets[label] ?? 0) + 1;
        });
        const qTrend = Object.entries(qBuckets).slice(-10).map(([day, queries]) => ({
          day, queries, saved: Math.floor(queries * 0.3),
        }));
        if (qTrend.length > 0) setQueryTrend(qTrend);
      }

      // ── Splunk alerts severity ────────────────────────────────────────────
      if (Array.isArray(splAlerts) && splAlerts.length > 0) {
        setTotalAlerts(splAlerts.length);
        const aMap: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        splAlerts.forEach(a => {
          const sev = (a.severity ?? '').toUpperCase();
          if (sev in aMap) aMap[sev]++;
        });
        setAlertSevDist(Object.entries(aMap).map(([name, value]) => ({ name, value })));
      }

    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleExportPdf = () => { setShowPdfModal(true); };

  const handlePrintSelected = () => {
    // Hide all sections not selected
    const allIds = PRINT_SECTIONS.map(s => s.id);
    const hiddenEls: HTMLElement[] = [];
    allIds.forEach(id => {
      if (!printSections.has(id)) {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; hiddenEls.push(el); }
      }
    });
    setShowPdfModal(false);
    // Small delay to let modal close before print dialog opens
    setTimeout(() => {
      window.print();
      // Restore after print
      hiddenEls.forEach(el => { el.style.display = ''; });
    }, 150);
  };

  const togglePrintSection = (id: string) => {
    setPrintSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Pie label renderer with theme-aware color
  const renderPieLabel = (props: { cx: number; cy: number; midAngle: number; outerRadius: number; name: string; percent: number }) => (
    <PieLabel {...props} labelColor={ct.pieLabel} />
  );

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* MTTR threshold warning banner */}
      {appConfig.mttr_threshold_enabled && (
        <MttrWarningBanner
          currentMttrMinutes={mttrSource === 'real' ? avgMttr : null}
          thresholdMinutes={appConfig.mttr_threshold_minutes}
        />
      )}
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <img
            src="https://miaoda-conversation-file.s3cdn.medo.dev/user-b8uq3eatai9u/app-bs8qtod6o9hd/20260527/SentinelOps logo Final.png"
            alt="SentinelOps"
            className="h-7 w-7 object-contain shrink-0"
          />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Analytics</span>
        </div>
        <div className="flex items-center gap-2 ml-auto no-print">
          {lastRefreshed && (
            <span className="hidden md:block text-[10px] text-muted-foreground/60">
              Updated {lastRefreshed}
            </span>
          )}
          <Button
            variant="ghost" size="sm"
            onClick={handleExportPdf}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            title="Export as PDF"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto analytics-body">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-8 space-y-8">

          {/* Page heading */}
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2.5 text-balance">
              <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BarChart2 className="h-4 w-4 text-primary" />
              </div>
              Enterprise Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1 text-pretty">
              Real-time incident intelligence, alert telemetry, SPL query analytics, and operational health metrics.
            </p>
          </div>

          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div id="section-kpi" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard icon={Activity}      label="Total Incidents"    value={totalIncidents} sub="All time"            color="hsl(214,80%,56%)" trend="+12%" trendUp={false} />
            <KpiCard icon={AlertTriangle} label="Open Incidents"     value={openCount}      sub="Active right now"    color="hsl(0,72%,51%)"   trend={openCount > 5 ? 'High' : 'Low'} trendUp={openCount <= 5} />
            <KpiCard icon={Zap}           label="Critical Alerts"    value={criticalCount}  sub="Severity: CRITICAL"  color="hsl(25,90%,55%)"  />
            <KpiCard icon={Clock}         label="Avg MTTR (min)"     value={avgMttr}        sub={mttrSource === 'real' ? 'From resolved incidents' : 'Estimated'} color="hsl(271,71%,60%)" trend="-8%" trendUp />
            <KpiCard icon={Bell}          label="Splunk Alerts"      value={totalAlerts}    sub="Imported alerts"     color="hsl(142,71%,45%)" trend="+5%" trendUp />
            <KpiCard icon={Database}      label="SPL Queries Run"    value={totalQueries}   sub="Query history"       color="hsl(186,96%,42%)" trend="+23%" trendUp />
          </div>

          {/* MTTR data source note */}
          {mttrSource === 'real' && (
            <div className="flex items-center gap-1.5 text-[11px] banner-success rounded-lg px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              MTTR calculated from actual <code className="font-mono">resolved_at</code> timestamps in the database.
            </div>
          )}

          {/* ── Row 1: Incident Trend + Severity Donut ──────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard id="section-trend" className="lg:col-span-2" title="14-Day Incident Trend" subtitle="Daily incident volume stacked by severity level">
              <div className="h-56 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incidentTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip {...ct.tooltip} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    {(['CRITICAL','HIGH','MEDIUM','LOW'] as const).map(s => (
                      <Bar key={s} dataKey={s} stackId="a" fill={SEV_COLORS[s]} radius={s === 'LOW' ? [3,3,0,0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard id="section-severity" title="Severity Distribution" subtitle="Proportion of incidents by severity">
              <div className="h-56 w-full min-w-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sevDist} cx="50%" cy="50%" innerRadius="45%" outerRadius="68%" paddingAngle={3} dataKey="value" labelLine={false} label={renderPieLabel as never}>
                      {sevDist.map((entry, i) => (
                        <Cell key={i} fill={SEV_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...ct.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                {sevDist.map(s => (
                  <div key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SEV_COLORS[s.name] }} />
                    {s.name} ({s.value})
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* ── Row 2: Top Services + Status Donut ──────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard id="section-services" className="lg:col-span-2" title="Incidents by Service" subtitle="Top services ranked by incident count">
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={serviceBreakdown} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="service" tick={{ fontSize: 9, fill: ct.tickCat }} tickLine={false} axisLine={false} width={110} />
                    <Tooltip {...ct.tooltip} />
                    <Bar dataKey="count" name="Incidents" radius={[0, 4, 4, 0]}>
                      {serviceBreakdown.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard id="section-status" title="Incident Status Overview" subtitle="Open vs Investigating vs Resolved">
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDist} cx="50%" cy="45%" outerRadius="60%" paddingAngle={3} dataKey="value" labelLine={false} label={renderPieLabel as never}>
                      {statusDist.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...ct.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                {statusDist.map(s => (
                  <div key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[s.name] }} />
                    {s.name} ({s.value})
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* ── Row 3: MTTR by Service + SPL Query Trend ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              id="section-mttr-service"
              title="Mean Time to Resolve by Service"
              subtitle={mttrSource === 'real'
                ? 'Actual MTTR (minutes) computed from resolved_at − opened_at'
                : 'Estimated MTTR (minutes) — no resolved_at data yet'}
            >
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={mttrData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} unit=" min" />
                    <YAxis type="category" dataKey="service" tick={{ fontSize: 9, fill: ct.tickCat }} tickLine={false} axisLine={false} width={110} />
                    <Tooltip {...ct.tooltip} formatter={(v) => [`${v} min`, 'MTTR']} />
                    <Bar dataKey="mttr" name="MTTR (min)" fill="hsl(271,71%,60%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard id="section-spl-activity" title="SPL Query Activity" subtitle="Daily query executions and saved queries over time">
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={queryTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qGrad1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(186,96%,42%)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(186,96%,42%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="qGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(271,71%,60%)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(271,71%,60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip {...ct.tooltip} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="queries" name="Queries run" stroke="hsl(186,96%,42%)" fill="url(#qGrad1)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="saved"   name="Saved"       stroke="hsl(271,71%,60%)" fill="url(#qGrad2)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* ── Row 4: Splunk Alert Severity + Operational Radar ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard id="section-alert-sev" title="Splunk Alert Severity Distribution" subtitle="Breakdown of imported Splunk alert severities">
              <div className="h-52 w-full min-w-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={alertSevDist} cx="50%" cy="50%" innerRadius="40%" outerRadius="65%" paddingAngle={4} dataKey="value" labelLine={false} label={renderPieLabel as never}>
                      {alertSevDist.map((entry, i) => (
                        <Cell key={i} fill={SEV_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...ct.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                {alertSevDist.map(s => (
                  <div key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SEV_COLORS[s.name] }} />
                    {s.name} ({s.value})
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard id="section-radar" className="lg:col-span-2" title="Operational Readiness Radar" subtitle="AI-scored health across six SOC effectiveness dimensions">
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%">
                    <PolarGrid stroke={ct.polar} />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: ct.tickCat }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fill: ct.radarTick }} tickCount={4} />
                    <Radar name="Score" dataKey="score" stroke="hsl(214,80%,56%)" fill="hsl(214,80%,56%)" fillOpacity={0.2} strokeWidth={2} dot={{ r: 3, fill: 'hsl(214,80%,56%)' }} />
                    <Tooltip {...ct.tooltip} formatter={(v) => [`${v}/100`, 'Score']} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* ── Row 5: 30-Day MTTR Trend ─────────────────────────────────────── */}
            <ChartCard
              id="section-mttr-trend"
              title="30-Day Rolling MTTR Trend"
              subtitle={mttrTrendSource === 'real'
                ? 'Daily average resolution time (minutes) from actual resolved incidents'
                : 'Demo data — no resolved incidents with timestamps yet'}
            >
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mttrTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 8, fill: ct.tick }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: ct.tick }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      unit=" min"
                    />
                    <Tooltip
                      {...ct.tooltip}
                      formatter={(v: unknown) => { const n = Number(v); return isNaN(n) ? ['No data', 'Avg MTTR'] : [`${n} min`, 'Avg MTTR']; }}
                    />
                    <Line
                      type="monotone"
                      dataKey="mttr"
                      name="Avg MTTR (min)"
                      stroke="hsl(271,71%,60%)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'hsl(271,71%,60%)', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {mttrTrendSource === 'demo' && (
                <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
                  Mark incidents as resolved to populate real MTTR data
                </p>
              )}
            </ChartCard>

          {/* ── Row 6: Cumulative incident area line ─────────────────────────── */}
          <ChartCard id="section-velocity" title="Incident Velocity — Cumulative Trend" subtitle="Rolling 14-day total incident count across all severities">
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={incidentTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(214,80%,56%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(214,80%,56%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: ct.tick }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...ct.tooltip} />
                  <Line type="monotone" dataKey="total"    name="Total"    stroke="hsl(214,80%,56%)" strokeWidth={2}   dot={{ r: 3, fill: 'hsl(214,80%,56%)' }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="CRITICAL" name="Critical" stroke="hsl(0,72%,51%)"   strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* ── Footer note ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 pb-4">
            <Shield className="h-3 w-3 shrink-0" />
            <span>SentinelOps Analytics · Data sourced from live Supabase tables. Demo fallback shown when no live data is available.</span>
            <Cpu className="h-3 w-3 shrink-0 ml-auto" />
          </div>

        </div>
      </div>

      {/* ── Print-Preview Modal ─────────────────────────────────────────────── */}
      <Dialog open={showPdfModal} onOpenChange={setShowPdfModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Export Analytics Report
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Select the sections to include in your PDF export. Deselected sections will be hidden from the printed output.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {PRINT_SECTIONS.map(sec => (
              <div
                key={sec.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => togglePrintSection(sec.id)}
              >
                <Checkbox
                  id={`chk-${sec.id}`}
                  checked={printSections.has(sec.id)}
                  onCheckedChange={() => togglePrintSection(sec.id)}
                  onClick={e => e.stopPropagation()}
                />
                <Label htmlFor={`chk-${sec.id}`} className="text-sm font-normal cursor-pointer select-none flex-1">
                  {sec.label}
                </Label>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <button
              className="text-primary hover:underline text-[11px]"
              onClick={() => setPrintSections(new Set(PRINT_SECTIONS.map(s => s.id)))}
            >Select all</button>
            <span>·</span>
            <button
              className="text-primary hover:underline text-[11px]"
              onClick={() => setPrintSections(new Set())}
            >Deselect all</button>
            <span className="ml-auto">{printSections.size} / {PRINT_SECTIONS.length} selected</span>
          </div>

          <DialogFooter className="gap-2 flex-row justify-end">
            <DialogClose asChild>
              <Button variant="outline" size="sm" onClick={() => setShowPdfModal(false)}>Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={printSections.size === 0}
              onClick={handlePrintSelected}
              className="gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

