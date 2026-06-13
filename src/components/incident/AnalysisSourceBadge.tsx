import { Radio, Database, Cpu, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SplunkModeValue =
  | 'live-mcp'
  | 'live-rest'
  | 'demo'
  | 'error-mcp'
  | 'error-rest'
  // legacy values returned by older cached analyses
  | 'mcp'
  | 'live'
  | 'mcp-fallback'
  | 'live-fallback'
  | string;

interface AnalysisSourceBadgeProps {
  splunkMode: SplunkModeValue | undefined;
  className?: string;
  size?: 'sm' | 'md';
}

function normalise(mode: string | undefined): 'live-mcp' | 'live-rest' | 'demo' | 'error' {
  if (!mode) return 'demo';
  if (mode === 'live-mcp' || mode === 'mcp') return 'live-mcp';
  if (mode === 'live-rest' || mode === 'live') return 'live-rest';
  if (mode === 'error-mcp' || mode === 'error-rest') return 'error';
  return 'demo';
}

const CONFIG = {
  'live-mcp': {
    label: 'LIVE · SPLUNK MCP',
    icon: Cpu,
    cls: 'bg-purple-950/40 border-purple-600/50 text-purple-300',
    dot: 'bg-purple-400 animate-pulse',
  },
  'live-rest': {
    label: 'LIVE · SPLUNK REST',
    icon: Radio,
    cls: 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300',
    dot: 'bg-emerald-400 animate-pulse',
  },
  'demo': {
    label: 'DEMO DATA',
    icon: Database,
    cls: 'bg-amber-950/30 border-amber-600/40 text-amber-300',
    dot: 'bg-amber-400',
  },
  'error': {
    label: 'LIVE FAILED',
    icon: AlertTriangle,
    cls: 'bg-red-950/40 border-red-600/50 text-red-300',
    dot: 'bg-red-400',
  },
} as const;

export function AnalysisSourceBadge({ splunkMode, className, size = 'sm' }: AnalysisSourceBadgeProps) {
  const key = normalise(splunkMode);
  const { label, icon: Icon, cls, dot } = CONFIG[key];

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md border font-mono font-semibold tracking-wider',
      size === 'sm' ? 'text-[10px] px-2 py-1' : 'text-xs px-2.5 py-1.5',
      cls,
      className,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} />
      <Icon className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {label}
    </span>
  );
}
