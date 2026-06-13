import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  currentMttrMinutes: number | null;
  thresholdMinutes: number;
  className?: string;
}

export function MttrWarningBanner({ currentMttrMinutes, thresholdMinutes, className }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (currentMttrMinutes === null) return null;
  if (currentMttrMinutes <= thresholdMinutes) return null;

  const hrs = (m: number) =>
    m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm border-b border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
      <span className="flex-1 text-xs">
        <strong className="font-semibold">MTTR Alert:</strong> 7-day rolling MTTR is{' '}
        <strong className="font-semibold">{hrs(currentMttrMinutes)}</strong>, exceeding the{' '}
        {hrs(thresholdMinutes)} threshold.{' '}
        <span className="text-yellow-600 dark:text-yellow-500/80">
          Review recently resolved incidents to identify bottlenecks.
        </span>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
