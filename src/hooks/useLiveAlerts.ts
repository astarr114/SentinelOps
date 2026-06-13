import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { useLlm } from '@/contexts/LlmContext';
import { useSplunk } from '@/contexts/SplunkContext';
import { fireAlertRuleActions } from '@/lib/alertRulesEngine';
import type { Severity, AlertNotification } from '@/types/types';

export interface LiveIncident {
  id: string;
  title: string;
  severity: Severity;
  status: string;
  service: string;
  summary: string | null;
  opened_at: string;
  is_synthetic?: boolean;
}

async function persistNotification(inc: LiveIncident) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('alert_notifications').insert({
    user_id:     user.id,
    incident_id: inc.id,
    severity:    inc.severity,
    service:     inc.service,
    title:       inc.title,
  });
}

export function useLiveAlerts(
  onSelect?:    (id: string) => void,
  onHighlight?: (incidentId?: string) => void,
) {
  const { alertRules } = useLlm();
  const { config } = useSplunk();
  const [bannerAlerts, setBannerAlerts]   = useState<LiveIncident[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const seenIds   = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load existing notifications from DB on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('alert_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (Array.isArray(data)) {
        setNotifications(data as AlertNotification[]);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    })();
  }, []);

  const markAllRead = useCallback(async () => {
    await supabase
      .from('alert_notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const clearNotifications = useCallback(async () => {
    await supabase.from('alert_notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setBannerAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleNew = useCallback((inc: LiveIncident) => {
    if (seenIds.current.has(inc.id)) return;
    if (inc.severity !== 'CRITICAL' && inc.severity !== 'HIGH') return;

    seenIds.current.add(inc.id);

    // Persist to notification center
    persistNotification(inc).then(() => {
      const newNotif: AlertNotification = {
        id:          crypto.randomUUID(),
        user_id:     '',
        incident_id: inc.id,
        severity:    inc.severity,
        service:     inc.service,
        title:       inc.title,
        is_read:     false,
        created_at:  new Date().toISOString(),
      };
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    // Fire alert routing rules (replaces hard-coded toast)
    const matched = fireAlertRuleActions(
      inc.severity, inc.service, inc.title,
      alertRules, onHighlight, inc.id,
      {
        pagerdutyRoutingKey: config.pagerdutyRoutingKey || undefined,
        alertEmail:          config.alertEmail          || undefined,
        resendApiKey:        config.resendApiKey        || undefined,
        slackWebhookUrl:     config.slackWebhookUrl     || undefined,
      },
    );

    // If no rules matched (or no rule covers toast), fall back to default toast
    const hasToastRule = matched.some(m =>
      m.action === 'toast' || m.action === 'toast_and_highlight' ||
      m.action === 'toast_and_sound' || m.action === 'all'
    );
    if (!hasToastRule) {
      toast.error(`${inc.severity}: ${inc.title}`, {
        id:          `alert-${inc.id}`,
        description: `${inc.id} · ${inc.service}`,
        duration:    10000,
        action:      onSelect ? { label: 'View', onClick: () => onSelect(inc.id) } : undefined,
      });
    }

    setBannerAlerts(prev => [inc, ...prev].slice(0, 5));
  }, [onSelect, onHighlight, alertRules]);

  useEffect(() => {
    const channel = supabase
      .channel('live-incidents-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_incidents' }, payload => {
        handleNew(payload.new as LiveIncident);
      })
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [handleNew]);

  const simulateAlert = useCallback(() => {
    const simulated: LiveIncident = {
      id:        `INC-SIM-${Date.now().toString().slice(-4)}`,
      title:     'Simulated: api-gateway circuit breaker tripped on checkout-service',
      severity:  'CRITICAL',
      status:    'OPEN',
      service:   'api-gateway',
      summary:   'Realtime alert simulation triggered from Settings demo.',
      opened_at: new Date().toISOString(),
    };
    handleNew(simulated);
  }, [handleNew]);

  return {
    bannerAlerts, dismissAlert, simulateAlert,
    notifications, unreadCount, markAllRead, clearNotifications,
  };
}
