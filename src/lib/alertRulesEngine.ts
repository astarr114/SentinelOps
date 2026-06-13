// Alert routing rules engine
// Evaluates incoming alerts against user-defined rules and fires actions

import { toast } from 'sonner';
import type { AlertRule, AlertAction } from '@/contexts/LlmContext';
import { supabase } from '@/db/supabase';

// Web Audio beep (short 440Hz sine)
function playAlertBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio not available — silent fail
  }
}

export interface AlertRuleMatch {
  rule:   AlertRule;
  action: AlertAction;
}

interface AlertRuleFireOptions {
  /** User's PagerDuty routing key from SplunkConfig */
  pagerdutyRoutingKey?: string;
  /** User's alert email address from SplunkConfig */
  alertEmail?: string;
  /** User's Resend API key from SplunkConfig */
  resendApiKey?: string;
  /** User's Slack incoming webhook URL from SplunkConfig */
  slackWebhookUrl?: string;
}

/**
 * Fires all matched rule actions for an incoming alert.
 * Returns the list of rule matches for UI feedback.
 */
export function fireAlertRuleActions(
  severity:      string,
  service:       string,
  title:         string,
  rules:         AlertRule[],
  onHighlight?:  (incidentId?: string) => void,
  incidentId?:   string,
  options:       AlertRuleFireOptions = {},
): AlertRuleMatch[] {
  const matched: AlertRuleMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const sevMatch = rule.severities.length === 0 || rule.severities.includes(severity);
    const svcMatch = rule.services.length === 0    || rule.services.includes(service);
    if (!sevMatch || !svcMatch) continue;

    matched.push({ rule, action: rule.action });

    const a = rule.action;
    const doToast     = a === 'toast' || a === 'toast_and_highlight' || a === 'toast_and_sound' || a === 'all' || a === 'all_channels';
    const doHighlight = a === 'highlight' || a === 'toast_and_highlight' || a === 'all' || a === 'all_channels';
    const doSound     = a === 'sound' || a === 'toast_and_sound' || a === 'all' || a === 'all_channels';
    const doEmail     = a === 'email' || a === 'all_channels';
    const doPagerDuty = a === 'pagerduty' || a === 'all_channels';
    const doSlack     = a === 'slack' || a === 'all_channels';

    if (doToast) {
      const isCritical = severity === 'CRITICAL' || severity === 'HIGH';
      toast[isCritical ? 'error' : 'warning'](
        `[Rule: ${rule.name}] ${title}`,
        { description: `${severity} • ${service}`, duration: 6000 }
      );
    }
    if (doHighlight && onHighlight) {
      onHighlight(incidentId);
    }
    if (doSound) {
      playAlertBeep();
    }
    if (doEmail && options.alertEmail) {
      // Fire-and-forget — don't block the rule loop
      supabase.functions.invoke('alert-email', {
        body: {
          incidentId: incidentId ?? 'unknown',
          title,
          severity,
          service,
          summary: title,
          recipientEmail: options.alertEmail,
          resendApiKey: options.resendApiKey || undefined,
        },
      }).catch(err => console.warn('alert-email failed:', err));
    }
    if (doPagerDuty && options.pagerdutyRoutingKey) {
      supabase.functions.invoke('pagerduty-event', {
        body: {
          action: 'trigger',
          incidentId: incidentId ?? `rule-${Date.now()}`,
          title,
          severity,
          service,
          summary: title,
          routingKey: options.pagerdutyRoutingKey,
        },
      }).catch(err => console.warn('pagerduty-event failed:', err));
    }
    if (doSlack && options.slackWebhookUrl) {
      supabase.functions.invoke('slack-alert', {
        body: {
          incidentId: incidentId ?? `rule-${Date.now()}`,
          title,
          severity,
          service,
          summary: title,
          webhookUrl: options.slackWebhookUrl,
        },
      }).catch(err => console.warn('slack-alert failed:', err));
    }
  }

  return matched;
}

/**
 * Returns a short human-readable label for a rule action.
 */
export function actionLabel(action: AlertAction): string {
  const map: Record<AlertAction, string> = {
    toast:               'Toast',
    highlight:           'Highlight',
    sound:               'Sound',
    toast_and_highlight: 'Toast + Highlight',
    toast_and_sound:     'Toast + Sound',
    email:               'Email',
    pagerduty:           'PagerDuty',
    slack:               'Slack',
    all:                 'Toast + Highlight + Sound',
    all_channels:        'All (Toast + Email + PD + Slack)',
  };
  return map[action] ?? action;
}
