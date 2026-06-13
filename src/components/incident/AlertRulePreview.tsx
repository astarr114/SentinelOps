// AlertRulePreview — shows which sample incidents match a given alert rule
// as the user edits criteria (severity / services) in real time.

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertRule } from '@/contexts/LlmContext';

// ── Representative sample incidents for preview matching ─────────────────────
export const PREVIEW_INCIDENTS = [
  { id: 'INC-1001', title: 'Checkout latency spike after deploy', severity: 'CRITICAL', service: 'checkout-service' },
  { id: 'INC-1002', title: 'Payment API 5xx error surge',         severity: 'HIGH',     service: 'payment-api' },
  { id: 'INC-1003', title: 'Auth token validation failures',      severity: 'MEDIUM',   service: 'auth-service' },
  { id: 'INC-1004', title: 'Inventory service DB timeout',        severity: 'HIGH',     service: 'inventory-service' },
  { id: 'INC-1005', title: 'Notification service queue lag',      severity: 'LOW',      service: 'notification-service' },
  { id: 'INC-1006', title: 'API gateway rate-limit exceeded',     severity: 'CRITICAL', service: 'api-gateway' },
  { id: 'INC-1007', title: 'Search indexer memory pressure',      severity: 'HIGH',     service: 'search-indexer' },
  { id: 'INC-1008', title: 'Scheduled job silent failure',        severity: 'MEDIUM',   service: 'job-scheduler' },
];

const SEV_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  HIGH:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MEDIUM:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  LOW:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

function incidentMatchesRule(
  incident: typeof PREVIEW_INCIDENTS[number],
  rule: Pick<AlertRule, 'severities' | 'services'>,
): boolean {
  // Severity: empty list = match any
  const sevOk = rule.severities.length === 0
    || rule.severities.includes(incident.severity);

  // Service: empty list = match any
  const svcOk = rule.services.length === 0
    || rule.services.some(s =>
        incident.service.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(incident.service.toLowerCase())
      );

  return sevOk && svcOk;
}

interface AlertRulePreviewProps {
  rule:       Pick<AlertRule, 'name' | 'severities' | 'services' | 'action' | 'enabled'>;
  className?: string;
}

export function AlertRulePreview({ rule, className }: AlertRulePreviewProps) {
  const matches = useMemo(
    () => PREVIEW_INCIDENTS.filter(inc => incidentMatchesRule(inc, rule)),
    [rule],
  );

  const pct     = Math.round((matches.length / PREVIEW_INCIDENTS.length) * 100);
  const isEmpty = matches.length === 0;

  return (
    <div className={cn('rounded-lg border border-border bg-secondary/20 p-3 space-y-2.5', className)}>
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        {isEmpty
          ? <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
        }
        <span className="text-xs font-medium text-foreground truncate">
          Live Preview
        </span>
        <span className={cn(
          'ml-auto shrink-0 text-xs font-semibold tabular-nums',
          isEmpty ? 'text-muted-foreground' : 'text-green-400'
        )}>
          {matches.length}/{PREVIEW_INCIDENTS.length} match
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            pct === 0   ? 'bg-muted-foreground/30' :
            pct <= 30   ? 'bg-yellow-500' :
            pct <= 60   ? 'bg-green-500'  : 'bg-orange-400'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* No-match state */}
      {isEmpty ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No sample incidents match these criteria.
          {rule.severities.length === 0 && rule.services.length === 0
            ? ' Add at least one severity or service filter.'
            : ' Try relaxing severity or service constraints.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {matches.map(inc => (
            <li key={inc.id} className="flex items-center gap-2 min-w-0">
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1 py-px shrink-0 font-mono border', SEV_BADGE[inc.severity])}
              >
                {inc.severity}
              </Badge>
              <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                {inc.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                {inc.service}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Disabled rule warning */}
      {!rule.enabled && (
        <p className="text-[10px] text-yellow-400/80 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Rule is disabled — actions will not fire.
        </p>
      )}
    </div>
  );
}
