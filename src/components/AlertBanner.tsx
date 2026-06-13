import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveIncident } from '@/hooks/useLiveAlerts';

interface AlertBannerProps {
  alerts: LiveIncident[];
  onDismiss: (id: string) => void;
  onSelect?: (id: string) => void;
}

function severityStyle(severity: string) {
  if (severity === 'CRITICAL') return { bar: 'bg-red-600', bg: 'bg-red-950/60', border: 'border-red-700/60', text: 'text-red-300', badge: 'bg-red-600 text-white' };
  return { bar: 'bg-orange-500', bg: 'bg-orange-950/50', border: 'border-orange-700/50', text: 'text-orange-300', badge: 'bg-orange-500 text-white' };
}

function AlertBannerItem({ alert, onDismiss, onSelect }: { alert: LiveIncident; onDismiss: (id: string) => void; onSelect?: (id: string) => void }) {
  const s = severityStyle(alert.severity);
  const ago = (() => {
    const diff = Math.floor((Date.now() - new Date(alert.opened_at).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  })();

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 border-b last:border-b-0 border-border/40 transition-colors relative overflow-hidden', s.bg)}>
      {/* Left severity stripe */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-0.5', s.bar)} />

      {/* Pulsing indicator */}
      <span className="shrink-0 relative flex h-2 w-2 ml-1">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', alert.severity === 'CRITICAL' ? 'bg-red-400' : 'bg-orange-400')} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', alert.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-500')} />
      </span>

      {/* Severity badge */}
      <span className={cn('text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-md border shrink-0',
        alert.severity === 'CRITICAL'
          ? 'bg-red-500/20 border-red-500/40 text-red-300'
          : 'bg-orange-500/20 border-orange-500/40 text-orange-300'
      )}>
        {alert.severity}
      </span>

      {/* ID (desktop) */}
      <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0 hidden sm:inline">{alert.id}</span>

      {/* Title */}
      <span className={cn('text-[12px] font-semibold flex-1 min-w-0 truncate', s.text)}>
        {alert.title}
      </span>

      {/* Service (desktop) */}
      <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0 hidden md:inline">{alert.service}</span>

      {/* Time */}
      <span className="text-[10px] text-muted-foreground/50 shrink-0">{ago}</span>

      {/* View button */}
      {onSelect && (
        <button
          onClick={() => onSelect(alert.id)}
          className={cn(
            'shrink-0 flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all',
            alert.severity === 'CRITICAL'
              ? 'border-red-700/40 text-red-300 hover:bg-red-950/40'
              : 'border-orange-700/40 text-orange-300 hover:bg-orange-950/40'
          )}
        >
          View <ChevronRight className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(alert.id)}
        className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
        aria-label="Dismiss alert"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function AlertBanner({ alerts, onDismiss, onSelect }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border w-full bg-card/95 backdrop-blur-sm z-30">
      {alerts.map(alert => (
        <AlertBannerItem
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
