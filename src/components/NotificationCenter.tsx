import { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Trash2, AlertTriangle, AlertCircle, ExternalLink, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertNotification, Severity } from '@/types/types';

interface NotificationCenterProps {
  notifications: AlertNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onClear: () => void;
  onSelectIncident?: (id: string) => void;
}

type SevFilter = 'ALL' | 'CRITICAL' | 'HIGH';

function severityIcon(severity: Severity) {
  if (severity === 'CRITICAL') return <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  return <AlertCircle className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
}

function formatTs(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAllRead,
  onClear,
  onSelectIncident,
}: NotificationCenterProps) {
  const [open, setOpen]           = useState(false);
  const [sevFilter, setSevFilter] = useState<SevFilter>('ALL');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (incidentId: string) => {
    onSelectIncident?.(incidentId);
    setOpen(false);
  };

  // Filter by severity tab
  const displayed = sevFilter === 'ALL'
    ? notifications
    : notifications.filter(n => n.severity === sevFilter);

  // Export filtered view as JSON
  const handleExport = () => {
    if (displayed.length === 0) return;
    const payload = displayed.map(n => ({
      id: n.id, incident_id: n.incident_id, severity: n.severity,
      service: n.service, title: n.title, is_read: n.is_read, created_at: n.created_at,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `alerts_${sevFilter.toLowerCase()}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Bulk CSV export — always exports ALL notifications regardless of active tab
  const handleExportCsv = () => {
    if (notifications.length === 0) return;
    const esc = (v: string) => `"${String(v).replace(/"/g, '\"\"')}"`;
    const header = 'id,incident_id,severity,service,title,is_read,created_at';
    const rows   = notifications.map(n =>
      [n.id, n.incident_id, n.severity, n.service, n.title, String(n.is_read), n.created_at]
        .map(esc).join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `alert_history_all_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Count per severity for tab badges
  const critCount = notifications.filter(n => n.severity === 'CRITICAL').length;
  const highCount = notifications.filter(n => n.severity === 'HIGH').length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative h-8 w-8 flex items-center justify-center rounded-md transition-all',
          'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent',
          open && 'bg-sidebar-accent text-foreground'
        )}
        title="Notification Center"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            'absolute right-0 top-10 z-50 w-[400px] max-h-[540px] flex flex-col',
            'rounded-xl border border-border bg-card shadow-2xl shadow-black/40',
            'animate-in slide-in-from-top-2 duration-200'
          )}
          role="region"
          aria-label="Notification Center"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-card/90 rounded-t-xl">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bell className="h-3 w-3 text-primary" />
              </div>
              <span className="text-sm font-bold text-foreground">Alert Center</span>
              {notifications.length > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded-full">
                  {notifications.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {/* CSV Export */}
              {notifications.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-teal-400 transition-colors px-2 py-1 rounded-md hover:bg-teal-950/30"
                  title="Download all alert history as CSV"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClear}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-secondary"
                  title="Clear all notifications"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Severity filter tabs */}
          {notifications.length > 0 && (
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 bg-secondary/10">
              {(['ALL', 'CRITICAL', 'HIGH'] as SevFilter[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSevFilter(tab)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all',
                    sevFilter === tab
                      ? tab === 'CRITICAL'
                        ? 'bg-red-500/15 text-red-400 border border-red-500/25 shadow-sm'
                        : tab === 'HIGH'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25 shadow-sm'
                          : 'bg-secondary text-foreground border border-border shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent'
                  )}
                >
                  {tab}
                  {tab === 'CRITICAL' && critCount > 0 && (
                    <span className="bg-red-500/25 text-red-300 px-1.5 rounded-full text-[9px] font-bold">{critCount}</span>
                  )}
                  {tab === 'HIGH' && highCount > 0 && (
                    <span className="bg-orange-500/25 text-orange-300 px-1.5 rounded-full text-[9px] font-bold">{highCount}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center gap-3">
                <div className="h-12 w-12 rounded-xl border border-border bg-secondary/30 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No alerts yet</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">CRITICAL and HIGH incidents will appear here</p>
                </div>
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <p className="text-sm text-muted-foreground">No {sevFilter} alerts</p>
                <button onClick={() => setSevFilter('ALL')} className="mt-2 text-[11px] text-primary hover:underline">
                  Show all
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayed.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => handleSelect(notif.incident_id)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-secondary/30 group',
                      !notif.is_read && 'bg-secondary/10'
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{severityIcon(notif.severity as Severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-[12px] leading-snug text-pretty',
                          !notif.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}>
                          {notif.title}
                        </p>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn(
                          'text-[10px] font-bold',
                          notif.severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'
                        )}>
                          {notif.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-mono">{notif.incident_id}</span>
                        <span className="text-[10px] text-muted-foreground/40 font-mono truncate">{notif.service}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">{formatTs(notif.created_at)}</span>
                      {!notif.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border shrink-0 rounded-b-xl bg-secondary/10">
              <p className="text-[10px] text-muted-foreground/40 text-center">
                {displayed.length} of {notifications.length} alerts · Click to navigate to incident
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

