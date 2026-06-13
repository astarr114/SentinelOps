import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield, Sun, Moon, ArrowLeft, GitMerge, AlertTriangle,
  Activity, Database, Globe, Lock, Server, Cpu, Clock,
  ChevronRight, Info, RefreshCw, ZoomIn, ZoomOut, Maximize2, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type NodeKind = 'incident' | 'log' | 'metric' | 'trace' | 'alert' | 'cloud' | 'service';
type Severity  = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Env       = 'all' | 'prod' | 'staging' | 'dev';

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  severity?: Severity;
  service?: string;
  environment?: 'prod' | 'staging' | 'dev';
  timestamp: string;
  evidence: string[];
  isRootCause?: boolean;
  isBlastRadius?: boolean;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  strength: 'strong' | 'medium' | 'weak';
}

// ── Static graph data ──────────────────────────────────────────────────────
const NODES: GraphNode[] = [
  {
    id: 'n-inc-1', kind: 'incident', label: 'Checkout timeout', sublabel: 'INC-0041',
    severity: 'CRITICAL', service: 'checkout-service', environment: 'prod',
    timestamp: new Date(Date.now() - 18 * 60_000).toISOString(), isRootCause: false,
    evidence: ['P99 latency 1.84s', 'Error rate 4.2%', 'DB pool 91%'],
    x: 420, y: 180,
  },
  {
    id: 'n-inc-2', kind: 'incident', label: 'Payment degradation', sublabel: 'INC-0042',
    severity: 'HIGH', service: 'payment-gateway', environment: 'prod',
    timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
    evidence: ['Stripe API 620ms', 'Retry rate 8.1%', 'Queue depth 1.2k'],
    x: 640, y: 340,
  },
  {
    id: 'n-db-1', kind: 'metric', label: 'DB pool saturation', sublabel: '91% utilisation',
    service: 'postgres-primary', environment: 'prod', severity: 'CRITICAL', isRootCause: true,
    timestamp: new Date(Date.now() - 32 * 60_000).toISOString(),
    evidence: ['Connection pool 91/100', 'Avg wait 420ms', 'Deadlock rate 0.8/min'],
    x: 220, y: 310,
  },
  {
    id: 'n-deploy-1', kind: 'cloud', label: 'Deploy v2.4.1', sublabel: '28 min ago',
    service: 'checkout-service', environment: 'prod',
    timestamp: new Date(Date.now() - 28 * 60_000).toISOString(),
    evidence: ['Deployment by CI pipeline', 'Added ORM connection wrapper', 'No DB migration'],
    x: 210, y: 130,
  },
  {
    id: 'n-log-1', kind: 'log', label: 'High error logs', sublabel: '320 errors/min',
    service: 'checkout-service', environment: 'prod',
    timestamp: new Date(Date.now() - 20 * 60_000).toISOString(),
    evidence: ['PSQLException: connection timeout', 'Stack trace from ORM layer', 'Repeated every ~200ms'],
    x: 420, y: 360,
  },
  {
    id: 'n-trace-1', kind: 'trace', label: 'Slow DB spans', sublabel: '>800ms p50',
    service: 'checkout-service', environment: 'prod',
    timestamp: new Date(Date.now() - 22 * 60_000).toISOString(),
    evidence: ['SQL SELECT avg 840ms', 'Connection acquire 410ms', 'No index regression'],
    x: 620, y: 160,
  },
  {
    id: 'n-alert-1', kind: 'alert', label: 'Latency alert fired', sublabel: 'PagerDuty #P-9821',
    service: 'api-gateway', environment: 'prod', severity: 'HIGH',
    timestamp: new Date(Date.now() - 15 * 60_000).toISOString(),
    evidence: ['P99 > 1.5s threshold', 'Triggered SLO burn alert', 'Notified on-call'],
    x: 630, y: 80,
    isBlastRadius: true,
  },
  {
    id: 'n-svc-inv', kind: 'service', label: 'inventory-api', sublabel: 'Healthy',
    service: 'inventory-api', environment: 'prod',
    timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
    evidence: ['Upstream dependency on checkout', 'Read requests queued', '18% increase in timeout errors'],
    x: 250, y: 490,
    isBlastRadius: true,
  },
  {
    id: 'n-svc-notif', kind: 'service', label: 'notification-svc', sublabel: 'Degraded',
    service: 'notification-svc', environment: 'prod',
    timestamp: new Date(Date.now() - 8 * 60_000).toISOString(),
    evidence: ['Order confirm emails delayed', 'Webhook retries backing up', 'Queue depth 2.1k'],
    x: 460, y: 490,
    isBlastRadius: true,
  },
  {
    id: 'n-metric-cpu', kind: 'metric', label: 'CPU spike', sublabel: '78% avg',
    service: 'checkout-service', environment: 'prod',
    timestamp: new Date(Date.now() - 25 * 60_000).toISOString(),
    evidence: ['Before deploy: 34% avg', 'After deploy: 78% avg', 'Spike within 2 min of v2.4.1'],
    x: 80, y: 230,
  },
];

const EDGES: GraphEdge[] = [
  { from: 'n-deploy-1',   to: 'n-db-1',      label: 'caused',    strength: 'strong' },
  { from: 'n-deploy-1',   to: 'n-metric-cpu', label: 'caused',    strength: 'medium' },
  { from: 'n-db-1',       to: 'n-log-1',      label: 'generated', strength: 'strong' },
  { from: 'n-db-1',       to: 'n-trace-1',    label: 'surfaced',  strength: 'strong' },
  { from: 'n-db-1',       to: 'n-inc-1',      label: 'triggered', strength: 'strong' },
  { from: 'n-inc-1',      to: 'n-inc-2',      label: 'cascaded',  strength: 'medium' },
  { from: 'n-inc-1',      to: 'n-alert-1',    label: 'fired',     strength: 'strong' },
  { from: 'n-inc-1',      to: 'n-svc-inv',    label: 'impacted',  strength: 'medium' },
  { from: 'n-inc-1',      to: 'n-svc-notif',  label: 'impacted',  strength: 'medium' },
  { from: 'n-trace-1',    to: 'n-inc-1',      label: 'correlated',strength: 'medium' },
  { from: 'n-log-1',      to: 'n-inc-1',      label: 'evidence',  strength: 'strong' },
  { from: 'n-metric-cpu', to: 'n-inc-1',      label: 'correlated',strength: 'weak'   },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const KIND_META: Record<NodeKind, { color: string; bg: string; border: string; Icon: React.ElementType }> = {
  incident: { color: 'text-red-400',     bg: 'bg-red-500/20',     border: 'border-red-500/40',     Icon: AlertTriangle },
  log:      { color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/40',    Icon: Activity      },
  metric:   { color: 'text-yellow-400',  bg: 'bg-yellow-500/20',  border: 'border-yellow-500/40',  Icon: Cpu           },
  trace:    { color: 'text-purple-400',  bg: 'bg-purple-500/20',  border: 'border-purple-500/40',  Icon: GitMerge      },
  alert:    { color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/40',  Icon: Clock         },
  cloud:    { color: 'text-cyan-400',    bg: 'bg-cyan-500/20',    border: 'border-cyan-500/40',    Icon: Globe         },
  service:  { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', Icon: Server        },
};

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: 'text-red-400', HIGH: 'text-orange-400', MEDIUM: 'text-yellow-400', LOW: 'text-emerald-400',
};

const EDGE_STROKE: Record<GraphEdge['strength'], string> = {
  strong: 'hsl(22 100% 60%)', medium: 'hsl(214 80% 58%)', weak: 'hsl(215 14% 40%)',
};

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Canvas graph ───────────────────────────────────────────────────────────
const NODE_W = 140;
const NODE_H = 48;

interface CanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: string | null;
  onSelect: (id: string) => void;
}

function GraphCanvas({ nodes, edges, selected, onSelect }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const clampZoom = (z: number) => Math.min(2, Math.max(0.35, z));

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node]')) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => clampZoom(z - e.deltaY * 0.001));
  }, []);

  // Build SVG edges
  const edgePaths = useMemo(() => edges.map(edge => {
    const src = nodes.find(n => n.id === edge.from);
    const dst = nodes.find(n => n.id === edge.to);
    if (!src || !dst) return null;
    const x1 = src.x + NODE_W / 2;
    const y1 = src.y + NODE_H / 2;
    const x2 = dst.x + NODE_W / 2;
    const y2 = dst.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 30;
    const stroke = EDGE_STROKE[edge.strength];
    const opacity = edge.strength === 'weak' ? 0.35 : edge.strength === 'medium' ? 0.6 : 0.85;
    return { edge, x1, y1, x2, y2, mx, my, stroke, opacity };
  }).filter(Boolean), [nodes, edges]);

  const svgW = 820;
  const svgH = 580;

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-card/30"
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <button onClick={() => setZoom(z => clampZoom(z + 0.15))}
          className="h-7 w-7 bg-card border border-border rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setZoom(z => clampZoom(z - 0.15))}
          className="h-7 w-7 bg-card border border-border rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="h-7 w-7 bg-card border border-border rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Zoom label */}
      <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground font-mono z-10">
        {Math.round(zoom * 100)}%
      </div>

      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', width: '100%', height: '100%' }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="hsl(215 14% 40%)" />
            </marker>
            <marker id="arrowhead-strong" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="hsl(22 100% 60%)" />
            </marker>
          </defs>
          {edgePaths.map((ep, i) => {
            if (!ep) return null;
            const { edge, x1, y1, x2, y2, mx, my, stroke, opacity } = ep;
            const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
            return (
              <g key={i} opacity={opacity}>
                <path d={d} fill="none" stroke={stroke} strokeWidth={edge.strength === 'strong' ? 2 : 1.5}
                  strokeDasharray={edge.strength === 'weak' ? '4 3' : undefined}
                  markerEnd={edge.strength === 'strong' ? 'url(#arrowhead-strong)' : 'url(#arrowhead)'}
                />
                {edge.label && (
                  <text x={mx} y={my - 4} textAnchor="middle" fontSize={9}
                    fill="hsl(215 14% 48%)" style={{ pointerEvents: 'none' }}>
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const meta = KIND_META[node.kind];
          const isSelected = selected === node.id;
          return (
            <button
              key={node.id}
              data-node
              onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
              style={{ position: 'absolute', left: node.x, top: node.y, width: NODE_W }}
              className={cn(
                'rounded-lg border px-2 py-2 text-left transition-all',
                meta.bg, meta.border,
                isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20 scale-105' : 'hover:scale-102 hover:brightness-110',
                node.isRootCause    && 'ring-2 ring-red-500 shadow-red-500/30 shadow-lg',
                node.isBlastRadius  && 'border-dashed opacity-80',
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <meta.Icon className={cn('h-3 w-3 shrink-0', meta.color)} />
                <span className="text-[11px] font-semibold text-foreground truncate">{node.label}</span>
                {node.isRootCause && (
                  <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 px-1 rounded shrink-0">ROOT</span>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground truncate">{node.sublabel}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────
function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const meta = KIND_META[node.kind];
  const connected = EDGES
    .filter(e => e.from === node.id || e.to === node.id)
    .map(e => {
      const otherId = e.from === node.id ? e.to : e.from;
      const other = NODES.find(n => n.id === otherId);
      const dir   = e.from === node.id ? 'out' : 'in';
      return other ? { node: other, edge: e, dir } : null;
    })
    .filter(Boolean) as { node: GraphNode; edge: GraphEdge; dir: 'in' | 'out' }[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg border', meta.bg, meta.border)}>
            <meta.Icon className={cn('h-4 w-4', meta.color)} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{node.label}</h3>
            <p className="text-[11px] text-muted-foreground">{node.sublabel} · {fmtTs(node.timestamp)}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">{node.kind.toUpperCase()}</Badge>
        {node.service   && <Badge variant="outline" className="text-[10px]">{node.service}</Badge>}
        {node.environment && <Badge variant="outline" className="text-[10px] text-blue-400">{node.environment}</Badge>}
        {node.severity  && <span className={cn('text-[10px] font-bold', SEV_COLOR[node.severity])}>{node.severity}</span>}
        {node.isRootCause   && <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">Root Cause</Badge>}
        {node.isBlastRadius && <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30">Blast Radius</Badge>}
      </div>

      {/* Evidence */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evidence</h4>
        <ul className="flex flex-col gap-1">
          {node.evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
              {e}
            </li>
          ))}
        </ul>
      </div>

      {/* Connections */}
      {connected.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Connections ({connected.length})
          </h4>
          <div className="flex flex-col gap-1.5">
            {connected.map(({ node: cn2, edge, dir }) => {
              const m = KIND_META[cn2.kind];
              return (
                <div key={cn2.id} className="flex items-center gap-2 text-xs">
                  <m.Icon className={cn('h-3 w-3 shrink-0', m.color)} />
                  <span className="flex-1 min-w-0 text-muted-foreground truncate">{cn2.label}</span>
                  <span className={cn('text-[10px] font-mono',
                    edge.strength === 'strong' ? 'text-primary' :
                    edge.strength === 'medium' ? 'text-blue-400' : 'text-muted-foreground/50')}>
                    {dir === 'out' ? '→' : '←'} {edge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Summary ─────────────────────────────────────────────────────────────
function AiSummaryCard() {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-semibold text-blue-300">AI Root Cause Summary</span>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded && (
        <div className="text-xs text-muted-foreground leading-relaxed text-pretty">
          <p className="mb-2">
            <strong className="text-foreground">Root cause identified:</strong> Deployment of <span className="text-cyan-400 font-mono">checkout-service v2.4.1</span> (28 min ago)
            introduced a connection pool contention issue in the ORM layer. The new wrapper does not release connections on timeout,
            saturating the pool (91%) and causing cascading latency across all DB-bound operations.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Blast radius:</strong> checkout-service → payment-gateway (downstream queue pressure) →
            inventory-api (upstream reads failing) → notification-svc (order-confirm webhooks backing up).
          </p>
          <p>
            <strong className="text-foreground">Recommended action:</strong> Roll back <span className="text-cyan-400 font-mono">checkout-service</span> to <span className="text-cyan-400 font-mono">v2.4.0</span> or
            apply hot-patch to release DB connections on ORM timeout. Estimated recovery: 3–5 min post-rollback.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────
function Legend() {
  const kinds: NodeKind[] = ['incident', 'log', 'metric', 'trace', 'alert', 'cloud', 'service'];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {kinds.map(k => {
        const m = KIND_META[k];
        return (
          <div key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <m.Icon className={cn('h-3 w-3', m.color)} />
            <span className="capitalize">{k}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-2">
        <div className="w-4 h-0.5 bg-red-500 rounded" />
        <span>Root cause</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <div className="w-4 h-0.5 border-t border-dashed border-emerald-500" />
        <span>Blast radius</span>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function CorrelationGraphPage() {
  const { theme, toggleTheme } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [envFilter, setEnvFilter]      = useState<Env>('all');
  const [kindFilter, setKindFilter]    = useState<NodeKind | 'all'>('all');
  const [sevFilter, setSevFilter]      = useState<Severity | 'all'>('all');

  const filteredNodes = useMemo(() => NODES.filter(n => {
    if (envFilter  !== 'all' && n.environment !== envFilter) return false;
    if (kindFilter !== 'all' && n.kind !== kindFilter)       return false;
    if (sevFilter  !== 'all' && n.severity !== sevFilter)    return false;
    return true;
  }), [envFilter, kindFilter, sevFilter]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map(n => n.id));
    return EDGES.filter(e => ids.has(e.from) && ids.has(e.to));
  }, [filteredNodes]);

  const selectedNode = NODES.find(n => n.id === selectedId) ?? null;

  const rootCauses  = NODES.filter(n => n.isRootCause);
  const blastRadius = NODES.filter(n => n.isBlastRadius);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">

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
          <GitMerge className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Incident Correlation Graph</span>
        </div>
        <div className="flex-1" />

        {/* Filters */}
        <div className="hidden md:flex items-center gap-2">
          <Select value={envFilter} onValueChange={v => setEnvFilter(v as Env)}>
            <SelectTrigger className="h-7 text-xs w-28 bg-card border-border">
              <SelectValue placeholder="Env" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All envs</SelectItem>
              <SelectItem value="prod">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="dev">Dev</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={v => setKindFilter(v as NodeKind | 'all')}>
            <SelectTrigger className="h-7 text-xs w-28 bg-card border-border">
              <SelectValue placeholder="Signal type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(['incident','log','metric','trace','alert','cloud','service'] as NodeKind[]).map(k => (
                <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sevFilter} onValueChange={v => setSevFilter(v as Severity | 'all')}>
            <SelectTrigger className="h-7 text-xs w-28 bg-card border-border">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severity</SelectItem>
              {(['CRITICAL','HIGH','MEDIUM','LOW'] as Severity[]).map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={toggleTheme}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: AI Summary + blast radius */}
        <aside className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden bg-card/30">
          <div className="p-3 border-b border-border">
            <AiSummaryCard />
          </div>

          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Root Cause Candidates ({rootCauses.length})
            </h3>
            {rootCauses.map(n => {
              const m = KIND_META[n.kind];
              return (
                <button key={n.id} onClick={() => setSelectedId(n.id)}
                  className={cn('w-full flex items-center gap-2 p-2 rounded border mb-1 transition-all text-left',
                    m.bg, m.border, selectedId === n.id && 'ring-1 ring-primary')}>
                  <m.Icon className={cn('h-3.5 w-3.5 shrink-0', m.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{n.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{n.sublabel}</p>
                  </div>
                  <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded shrink-0">ROOT</span>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Blast Radius ({blastRadius.length} services)
            </h3>
            {blastRadius.map(n => {
              const m = KIND_META[n.kind];
              return (
                <button key={n.id} onClick={() => setSelectedId(n.id)}
                  className={cn('w-full flex items-center gap-2 p-1.5 rounded mb-1 transition-all text-left hover:bg-accent/30')}>
                  <m.Icon className={cn('h-3 w-3 shrink-0', m.color)} />
                  <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{n.label}</span>
                  <span className="text-[9px] text-orange-400">{n.sublabel}</span>
                </button>
              );
            })}
          </div>

          <div className="p-3 mt-auto">
            <Legend />
          </div>
        </aside>

        {/* Centre: graph canvas */}
        <main className="flex-1 min-w-0 p-3 flex flex-col gap-3 overflow-hidden">
          <GraphCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            selected={selectedId}
            onSelect={id => setSelectedId(prev => prev === id ? null : id)}
          />
        </main>

        {/* Right: node detail */}
        {selectedNode && (
          <aside className="w-72 shrink-0 border-l border-border overflow-y-auto p-4 bg-card/30">
            <NodeDetail node={selectedNode} onClose={() => setSelectedId(null)} />
          </aside>
        )}
        {!selectedNode && (
          <aside className="w-64 shrink-0 border-l border-border p-4 bg-card/20 hidden lg:flex flex-col items-center justify-center text-center gap-3">
            <GitMerge className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Click any node to see its evidence, timestamps, and connections.</p>
          </aside>
        )}
      </div>
    </div>
  );
}
