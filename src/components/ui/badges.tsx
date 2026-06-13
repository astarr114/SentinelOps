import type { Severity, IncidentStatus } from '@/types/types';
import { cn } from '@/lib/utils';

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; className: string }> = {
  CRITICAL: { label: 'CRITICAL', className: 'severity-critical' },
  HIGH:     { label: 'HIGH',     className: 'severity-high'     },
  MEDIUM:   { label: 'MEDIUM',   className: 'severity-medium'   },
  LOW:      { label: 'LOW',      className: 'severity-low'      },
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest', config.className, className)}>
      {config.label}
    </span>
  );
}

interface StatusBadgeProps {
  status: IncidentStatus;
  className?: string;
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; className: string; dot: string }> = {
  OPEN:          { label: 'OPEN',          className: 'status-open',          dot: 'status-dot-open'          },
  INVESTIGATING: { label: 'INVESTIGATING', className: 'status-investigating', dot: 'status-dot-investigating' },
  RESOLVED:      { label: 'RESOLVED',      className: 'status-resolved',      dot: 'status-dot-resolved'      },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider', config.className, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot, status === 'OPEN' && 'animate-pulse')} />
      {config.label}
    </span>
  );
}

interface ConfidenceBarProps {
  confidence: number; // 0-1
  className?: string;
}

export function ConfidenceBar({ confidence, className }: ConfidenceBarProps) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.8 ? 'bg-red-400' : confidence >= 0.6 ? 'bg-orange-400' : confidence >= 0.4 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}
