import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useSplunk, type McpAuthMethod, type McpTool, type ReasoningProvider, DEFAULT_SEVERITY_RULES, type SeverityRules } from '@/contexts/SplunkContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLlm, PROVIDERS, type LlmProvider, type AlertAction } from '@/contexts/LlmContext';
import { actionLabel } from '@/lib/alertRulesEngine';
import { AlertRulePreview } from '@/components/incident/AlertRulePreview';
import { SimulateAlertDialog } from '@/components/SimulateAlertDialog';
import { useTheme } from '@/hooks/useTheme';
import {
  Shield, ArrowLeft, Save, Wifi, WifiOff, Loader2,
  Eye, EyeOff, CheckCircle2, XCircle, Info, Radio,
  Database, Settings2, Cpu, Zap, Bot, Bell, Plus, Trash2, ChevronDown,
  ArrowRight, GitBranch, Send, RefreshCw, GripVertical, FlaskConical, ChevronRight,
  Webhook, SendHorizontal, AlertTriangle, Download, Sun, Moon, Clock, Copy,
  Wrench, Play, Server, ToggleLeft, ToggleRight, Layers, Bug, Terminal, History, Coins,
  ShieldCheck, BrainCircuit,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { McpToolMapperPanel } from '@/components/McpToolMapperPanel';
import { supabase } from '@/db/supabase';
import { cn } from '@/lib/utils';

// Severity and service options for alert rules
const SEVERITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SERVICE_OPTIONS = [
  'checkout-service', 'payment-service', 'auth-service',
  'api-gateway', 'user-service', 'notification-service',
  'inventory-service', 'search-service',
];
const ACTION_OPTIONS: { value: AlertAction; label: string; group?: string }[] = [
  { value: 'toast',               label: 'Toast notification',              group: 'In-app' },
  { value: 'highlight',           label: 'Highlight incident',              group: 'In-app' },
  { value: 'sound',               label: 'Play alert sound',                group: 'In-app' },
  { value: 'toast_and_highlight', label: 'Toast + Highlight',               group: 'In-app' },
  { value: 'toast_and_sound',     label: 'Toast + Sound',                   group: 'In-app' },
  { value: 'all',                 label: 'Toast + Highlight + Sound',       group: 'In-app' },
  { value: 'email',               label: 'Email notification',              group: 'External' },
  { value: 'pagerduty',           label: 'PagerDuty trigger',               group: 'External' },
  { value: 'slack',               label: 'Slack message',                   group: 'External' },
  { value: 'all_channels',        label: 'All (Toast + Email + PD + Slack)', group: 'External' },
];

// Toggle-chip multi-select
function MultiChipSelect({
  options, selected, onChange, colorClass,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  colorClass?: string;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
            selected.includes(opt)
              ? colorClass ?? 'bg-primary/20 border-primary/50 text-primary'
              : 'bg-secondary/50 border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
          )}
        >
          {opt}
        </button>
      ))}
      {selected.length === 0 && (
        <span className="text-[11px] text-muted-foreground italic">All (no filter)</span>
      )}
    </div>
  );
}

// ── Priority badge colour by rank ─────────────────────────────────────────────
function priorityBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-red-500/15 text-red-400 border border-red-500/30 light:bg-red-100 light:text-red-700 light:border-red-400';
  if (rank <= 3)  return 'bg-orange-500/15 text-orange-400 border border-orange-500/30 light:bg-orange-100 light:text-orange-700 light:border-orange-400';
  return 'badge-demo';
}

// ── Sortable rule card wrapper ────────────────────────────────────────────────
interface SortableRuleCardProps {
  rule: import('@/contexts/LlmContext').AlertRule;
  idx: number;
  updateAlertRule: (id: string, partial: Partial<import('@/contexts/LlmContext').AlertRule>) => void;
  deleteAlertRule: (id: string) => void;
  children: React.ReactNode;
}

function SortableRuleCard({ rule, idx, children }: SortableRuleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rule.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Priority badge */}
      <span className={cn(
        'absolute -top-2 -left-1 z-10 inline-flex items-center justify-center rounded border px-1.5 text-[9px] font-bold tabular-nums',
        priorityBadgeClass(idx + 1)
      )}>
        #{idx + 1}
      </span>
      {/* Drag handle — rendered as an overlay so clicks on the card body don't drag */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="absolute top-2 right-2 z-10 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 cursor-grab active:cursor-grabbing transition-colors"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

interface E2eAssertion {
  name: string;
  spl: string;
  passed: boolean;
  rowCount: number;
  durationMs: number;
  error?: string;
  toolUsed?: string;
  category?: 'connectivity' | 'data';
  splunkServerError?: boolean;
}
interface E2eTestResult {
  ok: boolean;
  status?: 'healthy' | 'degraded' | 'failed';
  connectivityOk?: boolean;
  dataOk?: boolean;
  durationMs: number;
  passCount: number;
  totalCount: number;
  assertions: E2eAssertion[];
  runId?: string;
}
interface E2eHistoryRun {
  id: string;
  ran_at: string;
  ok: boolean;
  pass_count: number;
  total_count: number;
  duration_ms: number;
  mcp_url: string;
  assertions: E2eAssertion[];
}

export default function SettingsPage() {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    config, isLive, isMcp, isHostedModelActive,
    isSaving, isTesting, testResult, testError,
    isMcpTesting, mcpTestResult, mcpTestError,
    isVerifyingLive, verifyLiveResult, verifyLiveError,
    isHostedModelTesting, hostedModelTestResult, hostedModelTestError,
    updateConfig, saveConfig, testConnection, testMcpConnection, verifyLiveConnection, testHostedModelConnection,
  } = useSplunk();

  const {
    llmConfigs, activeProvider, isSavingLlm,
    setActiveProvider, updateLlmConfig, saveLlmConfigs, buildFallbackChain,
    alertRules, isSavingRules,
    addAlertRule, updateAlertRule, deleteAlertRule, reorderAlertRules, saveAlertRules,
    cacheTtlMinutes, setCacheTtlMinutes,
    maxTokenBudget, setMaxTokenBudget,
  } = useLlm();

  // Derive active LLM config for passing to edge functions
  const activeLlm = llmConfigs[activeProvider];

  // Scroll to hash anchor on mount (e.g. /settings#llm-settings-section from rate-limit toast)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  const [showToken,    setShowToken]    = useState(false);
  const [showMcpToken, setShowMcpToken] = useState(false);
  const [showMcpPass,  setShowMcpPass]  = useState(false);

  // ── MTTR Threshold Alert state ────────────────────────────────────────────
  const [mttrEnabled,   setMttrEnabled]   = useState(false);
  const [mttrThreshold, setMttrThreshold] = useState('60');
  const [savingMttr, setSavingMttr]       = useState(false);

  // ── Auto-Resolve Rule state ───────────────────────────────────────────────
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(false);
  const [autoResolveHours,   setAutoResolveHours]   = useState('4');
  const [savingAutoResolve,  setSavingAutoResolve]   = useState(false);
  const [runningAutoResolve, setRunningAutoResolve]  = useState(false);

  // ── Load app_config from Supabase on mount ────────────────────────────────
  useEffect(() => {
    supabase.from('app_config').select('key, value').then(({ data }) => {
      if (!Array.isArray(data)) return;
      const map = Object.fromEntries(data.map(r => [r.key, r.value]));
      if (map.mttr_threshold_enabled !== undefined) setMttrEnabled(map.mttr_threshold_enabled === 'true');
      if (map.mttr_threshold_minutes !== undefined) setMttrThreshold(map.mttr_threshold_minutes);
      if (map.auto_resolve_enabled   !== undefined) setAutoResolveEnabled(map.auto_resolve_enabled === 'true');
      if (map.auto_resolve_hours     !== undefined) setAutoResolveHours(map.auto_resolve_hours);
    });
  }, []);

  const saveMttrConfig = async () => {
    const mins = parseInt(mttrThreshold, 10);
    if (isNaN(mins) || mins < 1 || mins > 1440) { toast.error('Threshold must be 1–1440 minutes'); return; }
    setSavingMttr(true);
    try {
      const rows = [
        { key: 'mttr_threshold_enabled', value: String(mttrEnabled)  },
        { key: 'mttr_threshold_minutes', value: String(mins)          },
      ];
      for (const row of rows) {
        await supabase.from('app_config').upsert(row, { onConflict: 'key' });
      }
      toast.success('MTTR threshold settings saved');
    } catch { toast.error('Failed to save MTTR settings'); }
    finally { setSavingMttr(false); }
  };

  const saveAutoResolveConfig = async () => {
    const hrs = parseInt(autoResolveHours, 10);
    if (isNaN(hrs) || hrs < 1 || hrs > 168) { toast.error('Timeout must be 1–168 hours'); return; }
    setSavingAutoResolve(true);
    try {
      const rows = [
        { key: 'auto_resolve_enabled', value: String(autoResolveEnabled) },
        { key: 'auto_resolve_hours',   value: String(hrs)                },
      ];
      for (const row of rows) {
        await supabase.from('app_config').upsert(row, { onConflict: 'key' });
      }
      toast.success('Auto-resolve settings saved');
    } catch { toast.error('Failed to save auto-resolve settings'); }
    finally { setSavingAutoResolve(false); }
  };

  const runAutoResolveNow = async () => {
    const hrs = parseInt(autoResolveHours, 10);
    if (isNaN(hrs) || hrs < 1) { toast.error('Configure a valid timeout first'); return; }
    setRunningAutoResolve(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-resolve-incidents');
      if (error) {
        const msg = await error?.context?.text?.();
        throw new Error(msg || error.message);
      }
      if (data?.skipped) {
        toast.info('Auto-resolve is disabled — enable it in Settings first');
      } else if (data?.resolved === 0) {
        toast.info('No stale incidents found');
      } else {
        toast.success(`${data.resolved} stale incident${data.resolved > 1 ? 's' : ''} auto-resolved`);
      }
    } catch (err) {
      console.error('auto-resolve error:', err);
      toast.error('Auto-resolve failed — check console for details');
    } finally {
      setRunningAutoResolve(false);
    }
  };

  // MCP Diagnostic panel state
  const [diagOpen, setDiagOpen]         = useState(false);
  const [diagMethod, setDiagMethod]     = useState('tools/list');
  const [diagParams, setDiagParams]     = useState('{}');
  const [diagRunning, setDiagRunning]   = useState(false);
  const [diagResult, setDiagResult]     = useState<null | {
    requestPayload: unknown;
    probeResults: Array<{
      endpoint: string; status: number | null; ok: boolean;
      responseBody: unknown; durationMs: number; error?: string;
    }>;
  }>(null);
  const [diagError, setDiagError]       = useState('');

  // MCP NL→SPL via MCP quick-run panel state
  const [mcpNlOpen, setMcpNlOpen]       = useState(false);
  const [mcpNlQuery, setMcpNlQuery]     = useState('');
  const [mcpNlSpl, setMcpNlSpl]         = useState('');
  const [mcpNlRunning, setMcpNlRunning] = useState(false);
  const [mcpNlResult, setMcpNlResult]   = useState<unknown>(null);
  const [mcpNlError, setMcpNlError]     = useState('');
  const [mcpNlStep, setMcpNlStep]       = useState<'idle' | 'generated' | 'ran'>('idle');

  // MCP Tool Mapper visibility
  const [mcpToolsOpen, setMcpToolsOpen] = useState(false);

  // MCP verbose auth debug mode
  const [mcpVerboseDebug, setMcpVerboseDebug] = useState(false);
  const [authDebugRunning, setAuthDebugRunning] = useState(false);
  const [authDebugOpen, setAuthDebugOpen]       = useState(false);
  type AuthDebugResult = {
    ok: boolean;
    status: number | null;
    diagnosis: string;
    endpoint: string;
    durationMs: number;
    requestHeaders: Record<string, string>;
    requestPayload: unknown;
    responseHeaders: Record<string, string>;
    responseBody: unknown;
    networkError: string | null;
  };
  const [authDebugResult, setAuthDebugResult]   = useState<AuthDebugResult | null>(null);
  const [authDebugError, setAuthDebugError]     = useState('');

  const [pdSyncState, setPdSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [pdSyncResult, setPdSyncResult] = useState<{ synced: number; errors: string[] } | null>(null);
  const [pdLastSyncedAt, setPdLastSyncedAt] = useState<Date | null>(null);
  const [pdElapsed, setPdElapsed]           = useState<number>(0); // seconds since last sync
  const autoSyncTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Format elapsed seconds → human-readable string
  const fmtElapsed = (s: number) => {
    if (s < 60)  return `${s} second${s !== 1 ? 's' : ''} ago`;
    if (s < 3600) { const m = Math.floor(s / 60); return `${m} minute${m !== 1 ? 's' : ''} ago`; }
    const h = Math.floor(s / 3600); return `${h} hour${h !== 1 ? 's' : ''} ago`;
  };

  // Stable sync function (wrapped in useCallback so timer can call it without stale closure)
  const handlePdSync = useCallback(async () => {
    if (!config.pdRestApiKey) { toast.error('Enter your PagerDuty REST API key first'); return; }
    setPdSyncState('syncing'); setPdSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('pagerduty-sync', {
        body: { restApiKey: config.pdRestApiKey, limit: 50 },
      });
      if (error) {
        const msg = await error?.context?.text?.() ?? error?.message ?? 'Unknown error';
        throw new Error(msg);
      }
      setPdSyncResult({ synced: data.synced ?? 0, errors: data.errors ?? [] });
      setPdSyncState('success');
      setPdLastSyncedAt(new Date());
      setPdElapsed(0);
      if ((data.synced ?? 0) > 0) {
        toast.success(`Sync complete — ${data.synced} incident${data.synced !== 1 ? 's' : ''} imported`);
      }
    } catch (err) {
      setPdSyncState('error');
      toast.error('PagerDuty sync failed', {
        description: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }, [config.pdRestApiKey]);

  // Start/stop background auto-sync timer whenever toggle or interval changes
  useEffect(() => {
    // Stop any existing timers
    if (autoSyncTimerRef.current)  clearInterval(autoSyncTimerRef.current);
    if (elapsedTimerRef.current)   clearInterval(elapsedTimerRef.current);
    autoSyncTimerRef.current = null;
    elapsedTimerRef.current  = null;

    if (config.pdAutoSync && config.pdRestApiKey) {
      const intervalMs = Math.max(30, Math.min(3600, config.pdSyncInterval)) * 1000;
      // Immediate first sync
      handlePdSync();
      // Recurring sync
      autoSyncTimerRef.current = setInterval(handlePdSync, intervalMs);
      // Tick elapsed counter every second
      elapsedTimerRef.current = setInterval(() => {
        setPdElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (autoSyncTimerRef.current)  clearInterval(autoSyncTimerRef.current);
      if (elapsedTimerRef.current)   clearInterval(elapsedTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pdAutoSync, config.pdSyncInterval, config.pdRestApiKey]);

  // per-provider key visibility
  const [showKeys, setShowKeys] = useState<Partial<Record<LlmProvider, boolean>>>({});

  // ── Test Slack state ───────────────────────────────────────────────────────
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');

  // ── Webhook secret + test state ───────────────────────────────────────────
  // The user types their secret here; it's used to build the full URL preview
  // and to send a live test ping with the correct ?secret= value.
  const [webhookSecret, setWebhookSecret]       = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [webhookTesting, setWebhookTesting]     = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<'idle' | 'ok' | 'fail' | 'no_secret'>('idle');
  const [webhookTestDetail, setWebhookTestDetail] = useState('');

  // ── Webhook delivery log (persisted in sessionStorage, max 20 entries) ────
  type WebhookLogEntry = {
    ts: string;            // ISO timestamp
    result: 'ok' | 'fail' | 'no_secret';
    detail: string;
    secret: string;        // masked: last 4 chars only
  };
  const WEBHOOK_LOG_KEY = 'sentinelops_webhook_log';
  const loadWebhookLog = (): WebhookLogEntry[] => {
    try { return JSON.parse(sessionStorage.getItem(WEBHOOK_LOG_KEY) ?? '[]'); }
    catch { return []; }
  };
  const [webhookLog, setWebhookLog] = useState<WebhookLogEntry[]>(loadWebhookLog);

  const appendWebhookLog = (entry: WebhookLogEntry) => {
    setWebhookLog(prev => {
      const next = [entry, ...prev].slice(0, 20);
      try { sessionStorage.setItem(WEBHOOK_LOG_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    setWebhookTestResult('idle');
    setWebhookTestDetail('');
    const secretParam = webhookSecret.trim();
    const fnPath = secretParam
      ? `splunk-alert-webhook?_test=1&secret=${encodeURIComponent(secretParam)}`
      : 'splunk-alert-webhook?_test=1';
    try {
      const { data, error } = await supabase.functions.invoke(
        fnPath,
        { method: 'POST', body: { __test: true } },
      );
      if (error) {
        const raw = await error?.context?.text?.().catch(() => null);
        throw new Error(raw ?? error.message);
      }
      const secretStatus = data?.secretStatus as string | undefined;
      let result: WebhookLogEntry['result'];
      let detail: string;
      if (secretStatus === 'mismatch') {
        result = 'fail';
        detail = 'Endpoint reachable but secret mismatch — check SPLUNK_WEBHOOK_SECRET in Supabase Edge Function secrets.';
        toast.error('Webhook reachable — secret mismatch');
      } else if (secretStatus === 'not_configured') {
        result = 'no_secret';
        detail = 'Endpoint reachable. SPLUNK_WEBHOOK_SECRET not yet configured — alerts accepted without auth.';
        toast.warning('Webhook reachable — secret not configured');
      } else {
        result = 'ok';
        detail = 'Endpoint reachable and secret verified ✓';
        toast.success('Webhook test passed!');
      }
      setWebhookTestResult(result);
      setWebhookTestDetail(detail);
      appendWebhookLog({
        ts: new Date().toISOString(),
        result,
        detail,
        secret: secretParam ? `••••${secretParam.slice(-4)}` : '(none)',
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message.slice(0, 200) : 'Connection failed';
      setWebhookTestResult('fail');
      setWebhookTestDetail(detail);
      toast.error('Webhook test failed', { description: detail.slice(0, 120) });
      appendWebhookLog({
        ts: new Date().toISOString(),
        result: 'fail',
        detail,
        secret: secretParam ? `••••${secretParam.slice(-4)}` : '(none)',
      });
    } finally {
      setWebhookTesting(false);
      setTimeout(() => { setWebhookTestResult('idle'); setWebhookTestDetail(''); }, 10000);
    }
  };

  /** POST a sample Splunk alert payload — creates a real incident in the dashboard (E2E test). */
  const handleSimulateSplunkAlert = async () => {
    setWebhookTesting(true);
    const secretParam = webhookSecret.trim();
    const fnPath = secretParam
      ? `splunk-alert-webhook?secret=${encodeURIComponent(secretParam)}`
      : 'splunk-alert-webhook';
    const sid = `sim_${Date.now().toString(36)}`;
    try {
      const { data, error } = await supabase.functions.invoke(fnPath, {
        method: 'POST',
        body: {
          result: {
            _time: new Date().toISOString(),
            service: 'checkout-service',
            severity: 'CRITICAL',
            message: 'Simulated Splunk alert — error rate exceeded threshold (test from Settings)',
            host: 'splunk-sim',
          },
          sid,
          search_name: 'SentinelOps - Simulated high error rate',
          results_link: config.splunkHost
            ? `${config.splunkHost.replace(/\/$/, '')}/app/search`
            : null,
        },
      });
      if (error) {
        const raw = await error?.context?.text?.().catch(() => null);
        throw new Error(raw ?? error.message);
      }
      const incidentId = (data as { incident_id?: string })?.incident_id ?? `INC-SPLUNK-${sid.slice(0, 8).toUpperCase()}`;
      toast.success('Simulated Splunk alert created incident', {
        description: `${incidentId} — check the Command Center incident list.`,
        duration: 8000,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message.slice(0, 200) : 'Simulation failed';
      toast.error('Could not create test incident', { description: detail });
    } finally {
      setWebhookTesting(false);
    }
  };

  // ── Severity rules state ──────────────────────────────────────────────────
  // Local draft — a copy of config.severityRules (or built-in defaults) so the
  // user can edit keywords without affecting live detection until they save.
  const effectiveRules = config.severityRules ?? DEFAULT_SEVERITY_RULES;
  const [severityDraft, setSeverityDraft] = useState<SeverityRules>(effectiveRules);
  const [severityUnsaved, setSeverityUnsaved] = useState(false);
  const [savingSeverity, setSavingSeverity] = useState(false);

  // Keep draft in sync when config loads from DB for the first time
  const severityRulesLoaded = !!config.severityRules;
  const [severityInitialised, setSeverityInitialised] = useState(false);
  if (!severityInitialised && severityRulesLoaded) {
    setSeverityDraft(config.severityRules!);
    setSeverityInitialised(true);
  }

  const updateSeverityDraft = (level: keyof SeverityRules, value: string) => {
    setSeverityDraft(prev => ({
      ...prev,
      [level]: value.split('\n').map(s => s.trim()).filter(Boolean),
    }));
    setSeverityUnsaved(true);
  };

  const handleSaveSeverityRules = async () => {
    setSavingSeverity(true);
    try {
      updateConfig({ severityRules: severityDraft });
      await saveConfig();
      setSeverityUnsaved(false);
      toast.success('Severity rules saved', {
        description: 'New keyword mappings will apply on the next Splunk import.',
      });
    } catch {
      toast.error('Failed to save severity rules');
    } finally {
      setSavingSeverity(false);
    }
  };

  const handleResetSeverityRules = () => {
    setSeverityDraft(DEFAULT_SEVERITY_RULES);
    setSeverityUnsaved(true);
  };

  // ── Severity live-preview ─────────────────────────────────────────────────
  // The user types a sample SPL string; we run it through the same keyword
  // matching logic used by the edge function and show which level it hits.
  const [severityPreviewInput, setSeverityPreviewInput] = useState('');
  const severityPreviewResult = useMemo(() => {
    const text = severityPreviewInput.trim().toLowerCase();
    if (!text) return null;
    for (const level of ['critical', 'high', 'medium'] as const) {
      const keywords = severityDraft[level];
      const matched = keywords.find(kw => kw && text.includes(kw.toLowerCase()));
      if (matched) return { level: level.toUpperCase(), keyword: matched };
    }
    return { level: 'LOW', keyword: null };
  }, [severityPreviewInput, severityDraft]);

  const handleTestSlack = async () => {
    if (!config.slackWebhookUrl) return;
    setSlackTesting(true);
    setSlackTestResult('idle');
    try {
      const { data, error } = await supabase.functions.invoke('slack-alert', {
        body: {
          webhookUrl:  config.slackWebhookUrl,
          title:       'SentinelOps — Slack Test',
          summary:     'This is a test message from SentinelOps. Your Slack webhook is connected and working.',
          severity:    'LOW',
          service:     'sentinelops-settings',
          incidentId:  'TEST-001',
        },
      });
      if (error) throw new Error(await error?.context?.text?.() ?? error.message);
      if (data?.error) throw new Error(data.error);
      setSlackTestResult('ok');
      toast.success('Test message sent to Slack!');
    } catch (e) {
      setSlackTestResult('fail');
      toast.error('Slack test failed', { description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setSlackTesting(false);
      setTimeout(() => setSlackTestResult('idle'), 5000);
    }
  };

  const handleSave = async () => { await saveConfig(); toast.success('Splunk configuration saved'); };
  const handleTest = async () => { await testConnection(); };
  const handleMcpTest = async () => { await testMcpConnection(); };

  const [e2eRunning, setE2eRunning] = useState(false);
  const [e2eResult, setE2eResult] = useState(null as E2eTestResult | null);
  const [e2eError, setE2eError] = useState('');
  const [e2eCustomQuery, setE2eCustomQuery] = useState('');
  const [e2eCustomQueryName, setE2eCustomQueryName] = useState('');
  const [e2eHistory, setE2eHistory] = useState<E2eHistoryRun[]>([]);
  const [e2eHistoryLoading, setE2eHistoryLoading] = useState(false);
  const [e2eExpandedRun, setE2eExpandedRun] = useState<string | null>(null);
  const [e2eSplExpanded, setE2eSplExpanded] = useState<number | null>(null);

  const loadE2eHistory = useCallback(async () => {
    if (!profile?.id) return;
    setE2eHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('e2e_test_runs')
        .select('id, ran_at, ok, pass_count, total_count, duration_ms, mcp_url, assertions')
        .eq('user_id', profile.id)
        .order('ran_at', { ascending: false })
        .limit(10);
      setE2eHistory((data ?? []) as E2eHistoryRun[]);
    } finally {
      setE2eHistoryLoading(false);
    }
  }, [profile?.id]);

  // Load history once when MCP section is visible
  useEffect(() => {
    if (config.splunkMcpUrl && profile?.id) loadE2eHistory();
  }, [config.splunkMcpUrl, profile?.id, loadE2eHistory]);

  const handleRunE2eTest = useCallback(async () => {
    if (!config.splunkMcpUrl) return;
    setE2eRunning(true);
    setE2eResult(null);
    setE2eError('');
    try {
      const { data, error } = await supabase.functions.invoke('splunk-mcp-e2e', {
        body: {
          mcpUrl:        config.splunkMcpUrl,
          mcpToken:      config.splunkMcpToken,
          mcpAuthMethod: config.mcpAuthMethod,
          mcpUsername:   config.splunkMcpUsername,
          mcpPassword:   config.splunkMcpPassword,
          userId:        profile?.id ?? '',
          ...(e2eCustomQuery ? { customQuery: e2eCustomQuery, customQueryName: e2eCustomQueryName || 'Custom query' } : {}),
          ...(config.splunkHostedModelEndpoint
            ? { splunkHostedModelEndpoint: config.splunkHostedModelEndpoint,
                splunkHostedModelToken:    config.splunkHostedModelToken }
            : {}),
        },
      });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await (error as any)?.context?.text?.().catch(() => null);
        setE2eError(raw ?? error.message);
        return;
      }
      setE2eResult(data as E2eTestResult);
      // Refresh history after a successful run
      loadE2eHistory();
    } catch (e) {
      setE2eError(e instanceof Error ? e.message : 'E2E test failed');
    } finally {
      setE2eRunning(false);
    }
  }, [config, profile?.id, e2eCustomQuery, e2eCustomQueryName, loadE2eHistory]);

  // Verbose auth debug: captures full request/response headers for 401 diagnosis
  const handleAuthDebug = async () => {
    if (!config.splunkMcpUrl) return;
    setAuthDebugRunning(true);
    setAuthDebugResult(null);
    setAuthDebugError('');
    setAuthDebugOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke('splunk-test', {
        body: {
          mode: 'mcp-auth-debug',
          mcpUrl:        config.splunkMcpUrl,
          mcpToken:      config.splunkMcpToken,
          mcpAuthMethod: config.mcpAuthMethod,
          mcpUsername:   config.splunkMcpUsername,
          mcpPassword:   config.splunkMcpPassword,
        },
      });
      if (error) {
        const raw = await error?.context?.text?.().catch(() => null);
        setAuthDebugError(raw ?? error.message);
        return;
      }
      setAuthDebugResult(data as AuthDebugResult);
    } catch (e) {
      setAuthDebugError(e instanceof Error ? e.message : 'Auth debug failed');
    } finally {
      setAuthDebugRunning(false);
    }
  };

  // NL→SPL via MCP quick-run: generate SPL from NL, then execute via MCP
  const handleMcpNlRun = async (runSpl?: boolean) => {
    if (!config.splunkMcpUrl) return;
    setMcpNlRunning(true);
    setMcpNlError('');
    if (!runSpl) {
      setMcpNlResult(null);
      setMcpNlSpl('');
      setMcpNlStep('idle');
    }
    try {
      const { data, error } = await supabase.functions.invoke('splunk-mcp', {
        body: {
          question: mcpNlQuery,
          explicitSpl: runSpl ? mcpNlSpl : undefined,
          generateOnly: !runSpl && !mcpNlSpl,
          mcpUrl: config.splunkMcpUrl,
          mcpToken: config.splunkMcpToken,
          mcpAuthMethod: config.mcpAuthMethod,
          mcpUsername: config.splunkMcpUsername,
          mcpPassword: config.splunkMcpPassword,
          // Pass user's active LLM so SPL generation uses their own key
          // instead of falling back to the shared gateway (which can rate-limit)
          llmProvider:      activeProvider,
          llmApiKey:        activeLlm?.apiKey  || undefined,
          llmModel:         activeLlm?.modelId || undefined,
          llmFallbackChain: buildFallbackChain(),
        },
      });
      if (error) {
        let msg = error.message;
        try { const raw = await error?.context?.text?.(); if (raw) { const p = JSON.parse(raw); msg = p?.error ?? p?.message ?? raw; } } catch { /* ignore */ }
        setMcpNlError(msg || 'Failed.');
        return;
      }
      if (data?.spl && !runSpl) {
        setMcpNlSpl(data.spl);
        setMcpNlStep('generated');
      }
      if (runSpl || data?.results) {
        setMcpNlResult(data?.results ?? data);
        setMcpNlStep('ran');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed.';
      setMcpNlError(msg);
      // Show rate-limit toast with direct link to LLM settings tab
      if (/rate.?limit|too many request|request limit|quota|429|All LLM providers/i.test(msg)) {
        toast.error('LLM rate limit reached', {
          description: 'The shared gateway is throttled. Add your own API key below.',
          duration: 8000,
          action: {
            label: 'Go to LLM Settings ↓',
            onClick: () => document.getElementById('llm-settings-section')?.scrollIntoView({ behavior: 'smooth' }),
          },
        });
      }
    } finally {
      setMcpNlRunning(false);
    }
  };

  const handleMcpDiag = async () => {
    if (!config.splunkMcpUrl) return;
    let parsedParams: unknown = {};
    try { parsedParams = JSON.parse(diagParams || '{}'); } catch { /* use empty */ }
    setDiagRunning(true);
    setDiagResult(null);
    setDiagError('');
    try {
      const { data, error } = await supabase.functions.invoke('splunk-test', {
        body: { mode: 'mcp-debug', mcpUrl: config.splunkMcpUrl, mcpToken: config.splunkMcpToken, rpcMethod: diagMethod, rpcParams: parsedParams },
      });
      if (error) {
        const raw = await error?.context?.text?.().catch(() => null);
        setDiagError(raw ?? error.message);
        return;
      }
      setDiagResult(data);
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : 'Diagnostic failed');
    } finally {
      setDiagRunning(false);
    }
  };

  const handleSaveLlm = async () => {
    await saveLlmConfigs();
    toast.success('AI model configuration saved');
  };

  const handleSaveRules = async () => {
    await saveAlertRules();
    setRulesUnsaved(false);
    toast.success('Alert routing rules saved');
  };

  // ── Drag-to-reorder state + handlers ─────────────────────────────────────
  const [rulesUnsaved, setRulesUnsaved] = useState(false);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = alertRules.findIndex(r => r.id === active.id);
    const newIdx = alertRules.findIndex(r => r.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(alertRules, oldIdx, newIdx);
    reorderAlertRules(reordered.map(r => r.id));
    setRulesUnsaved(true);
  }, [alertRules, reorderAlertRules]);

  const activeMeta = PROVIDERS.find(p => p.id === activeProvider)!;

  // Derived fallback chain — recomputes live as user changes keys / active provider
  const fallbackChain = useMemo(() => buildFallbackChain(), [buildFallbackChain, llmConfigs, activeProvider]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/images/logo/sentinelops-logo.png"
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
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Settings</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border border-transparent hover:border-sidebar-border">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">

          {/* Page title */}
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Settings2 className="h-4 w-4 text-primary" />
              </div>
              Application Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 text-pretty">
              Configure Splunk connection, AI model, alert routing rules, and test real-time alerting.
            </p>
          </div>

          {/* ── Connection Mode Status (full width) ───────────────────────── */}
          <div className={cn(
            'rounded-xl border p-4 flex items-start gap-4',
            isLive ? 'banner-teal rounded-xl' : 'banner-info rounded-xl'
          )}>
            <div className={cn('shrink-0 mt-0.5 flex items-center justify-center h-10 w-10 rounded-full', isLive ? 'bg-teal-500/15' : 'bg-blue-500/15')}>
              {isLive ? <Wifi className="h-5 w-5 icon-teal" /> : <Database className="h-5 w-5 icon-blue" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-sm font-semibold', isLive ? 'text-live' : 'text-demo-mode')}>
                  {isLive ? 'Live Splunk Mode' : 'Demo Mode'}
                </span>
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide', isLive ? 'badge-live' : 'badge-demo')}>
                  <Radio className="h-2.5 w-2.5" />
                  {isLive ? 'CONNECTED' : 'DEMO'}
                </span>
                {isMcp && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-purple-600/30 text-purple-300">
                    <Cpu className="h-2.5 w-2.5" />MCP
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLive
                  ? `Querying live Splunk at ${config.splunkHost}${isMcp ? ' · MCP Server configured' : ''}`
                  : 'Using bundled sample data. Configure Splunk credentials below to switch to live mode.'}
              </p>
            </div>
          </div>

          {/* ══ Two-column grid ════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
          <div className="space-y-8">

          {/* ── Splunk REST API — Section A: Evidence Layer ────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <Wifi className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5 bg-secondary/40">
                    Section A
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">Evidence Layer — Splunk REST API</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect to your local Splunk Enterprise instance for live evidence retrieval.
                  Recommended URL: <code className="font-mono bg-muted/50 px-1 rounded text-[11px]">https://localhost:8089</code>
                </p>
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground">Splunk REST Base URL</label>
                <Input value={config.splunkHost} onChange={e => updateConfig({ splunkHost: e.target.value })}
                  placeholder="https://localhost:8089"
                  className="font-mono text-sm h-10 bg-secondary/30 border-border" />
                <p className="text-[11px] text-muted-foreground">
                  Include port (default 8089). For local Splunk Enterprise use <code className="font-mono bg-muted/50 px-1 rounded">https://localhost:8089</code>.
                  For ngrok use <code className="font-mono bg-muted/50 px-1 rounded">https://&lt;subdomain&gt;.ngrok-free.app</code>.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground">REST Authentication Token</label>
                <div className="relative">
                  <Input type={showToken ? 'text' : 'password'} value={config.splunkToken}
                    onChange={e => updateConfig({ splunkToken: e.target.value })}
                    placeholder="Splunk Bearer token (REST scope)"
                    className="font-mono text-sm h-10 bg-secondary/30 border-border pr-10" />
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* SSL verify toggle */}
              <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => updateConfig({ sslVerify: !config.sslVerify })}
                  className={cn(
                    'mt-0.5 h-4 w-7 shrink-0 rounded-full border transition-all flex items-center',
                    config.sslVerify
                      ? 'bg-primary border-primary justify-end pr-0.5'
                      : 'bg-secondary/60 border-border justify-start pl-0.5',
                  )}
                  title={config.sslVerify ? 'SSL verification enabled' : 'SSL verification disabled (self-signed cert)'}
                >
                  <span className="h-3 w-3 rounded-full bg-white shadow-sm" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Verify SSL certificate</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {config.sslVerify
                      ? 'SSL verification ON — requires a valid certificate on your Splunk instance.'
                      : 'SSL verification OFF — allows self-signed certs. '}
                    {!config.sslVerify && (
                      <span className="text-amber-400">
                        Note: Supabase Edge Functions cannot bypass SSL natively — use ngrok for local Splunk.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {testResult === 'ok' && (
                <div className="flex items-center gap-2 rounded-lg banner-teal px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 icon-teal shrink-0" />
                  <span className="text-xs text-live">Connection successful. Mode set to Live.</span>
                </div>
              )}
              {testResult === 'fail' && (
                <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2.5">
                  <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-red-400 dark:text-red-300">{testError || 'Connection failed.'}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={handleTest}
                  disabled={isTesting || !config.splunkHost || !config.splunkToken} className="h-9 gap-2 flex-1">
                  {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                  {isTesting ? 'Testing…' : 'Test Connection'}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 flex-1">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>

              {/* ── Splunk Webhook Info + Test ─────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Splunk Webhook Integration</span>
                  </div>
                  {/* Test buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleTestWebhook}
                      disabled={webhookTesting}
                      className="h-7 gap-1.5 text-xs"
                    >
                      {webhookTesting
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : webhookTestResult === 'ok'
                          ? <CheckCircle2 className="h-3 w-3 icon-teal" />
                          : webhookTestResult === 'fail'
                            ? <XCircle className="h-3 w-3 text-red-400" />
                            : <SendHorizontal className="h-3 w-3" />}
                      {webhookTesting ? 'Testing…' : 'Test ping'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSimulateSplunkAlert}
                      disabled={webhookTesting}
                      className="h-7 gap-1.5 text-xs border-orange-600/40 text-orange-300 hover:bg-orange-900/20"
                      title="POST a sample Splunk alert and create a real incident in the dashboard"
                    >
                      <Zap className="h-3 w-3" />
                      Simulate alert
                    </Button>
                  </div>
                </div>

                {/* ── Secret input ── */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-foreground/70">
                    Webhook Secret <span className="text-muted-foreground font-normal">(used in the URL below and for test ping)</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showWebhookSecret ? 'text' : 'password'}
                      value={webhookSecret}
                      onChange={e => setWebhookSecret(e.target.value)}
                      placeholder="Enter your SPLUNK_WEBHOOK_SECRET value…"
                      className="h-8 text-xs font-mono bg-secondary/30 border-border pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWebhookSecret(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showWebhookSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* ── Live URL preview ── */}
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    Configure a Splunk Webhook action to POST to this URL:
                  </p>
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 rounded border border-border bg-secondary/30 px-3 py-2 font-mono text-[10px] text-foreground/80 break-all select-all">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/splunk-alert-webhook?secret=${webhookSecret.trim() || '<YOUR_SECRET>'}`}
                    </div>
                    <Button size="sm" variant="secondary" className="h-auto shrink-0 px-3 gap-1.5 text-xs"
                      onClick={() => {
                        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/splunk-alert-webhook?secret=${webhookSecret.trim() || ''}`;
                        navigator.clipboard.writeText(url).then(() => toast.success('Webhook URL copied to clipboard'));
                      }}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>

                {/* ── Step-by-step Splunk setup instructions ── */}
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-foreground">Splunk alert setup checklist</p>
                  <ol className="space-y-1.5 text-[11px] text-muted-foreground list-none">
                    {[
                      ['1', 'Set SPLUNK_WEBHOOK_SECRET in Supabase → Project Settings → Edge Functions → Secrets (any alphanumeric string you choose).'],
                      ['2', 'Enter the same secret value in the "Webhook Secret" field above so the URL preview updates.'],
                      ['3', 'Copy the full Webhook URL above.'],
                      ['4', 'In Splunk: open a Saved Search → Edit → Alert actions → Add Actions → Webhook. Paste the URL.'],
                      ['5', 'Add a Webhook allow-list entry in Splunk (Settings → Server settings) for the base URL without ?secret=.'],
                      ['6', 'Ensure the saved search is scheduled. Include eval fields in your SPL: severity, service, message (see docs/splunk-webhook.md).'],
                      ['7', 'Click "Test ping" to verify connectivity, then "Simulate alert" to create a test incident in the dashboard.'],
                    ].map(([n, text]) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                        <span className="text-pretty">{text}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Test result feedback */}
                {webhookTestResult !== 'idle' && webhookTestDetail && (
                  <div className={cn(
                    'flex items-start gap-2 rounded px-2.5 py-2 text-[11px]',
                    webhookTestResult === 'ok'        && 'banner-success',
                    webhookTestResult === 'no_secret' && 'bg-amber-900/20 border border-amber-700/30 text-amber-300',
                    webhookTestResult === 'fail'      && 'bg-red-500/10 border border-red-500/30 text-red-600 dark:bg-red-900/20 dark:border-red-700/30 dark:text-red-300',
                  )}>
                    {webhookTestResult === 'ok'
                      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      : webhookTestResult === 'no_secret'
                        ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                    {webhookTestDetail}
                  </div>
                )}

                {/* ── Delivery log ── */}
                {webhookLog.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recent test pings</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const header = 'timestamp,result,detail,secret\n';
                            const rows = webhookLog.map(e =>
                              `"${e.ts}","${e.result}","${e.detail.replace(/"/g, '""')}","${e.secret}"`
                            ).join('\n');
                            const blob = new Blob([header + rows], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'webhook-delivery-log.csv'; a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="text-[9px] text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <Download className="h-2.5 w-2.5" />Export CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWebhookLog([]);
                            try { sessionStorage.removeItem(WEBHOOK_LOG_KEY); } catch { /* ignore */ }
                          }}
                          className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        >Clear log</button>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {webhookLog.map((entry, i) => (
                        <div key={i} className={cn(
                          'flex items-start gap-2 rounded px-2 py-1.5 text-[10px]',
                          entry.result === 'ok'        && 'banner-success/30',
                          entry.result === 'no_secret' && 'bg-amber-900/10 border border-amber-800/20',
                          entry.result === 'fail'      && 'bg-red-900/10 border border-red-800/20',
                        )}>
                          {entry.result === 'ok'
                            ? <CheckCircle2 className="h-3 w-3 icon-teal shrink-0 mt-0.5" />
                            : entry.result === 'no_secret'
                              ? <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                              : <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground/70 truncate">{entry.detail}</p>
                            <p className="text-muted-foreground/50 mt-0.5">
                              {new Date(entry.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              {' · '}secret: {entry.secret}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Set <code className="bg-secondary px-1 rounded text-[9px]">SPLUNK_WEBHOOK_SECRET</code> in Supabase Dashboard → Edge Functions → Secrets. In Splunk:{' '}
                  <strong className="text-foreground/70">Settings → Webhook allow list</strong> — add the URL above. Method: <strong className="text-foreground/70">POST</strong>.
                </p>
              </div>

              {/* ── Severity Keyword Rules ─────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Severity Keyword Rules</span>
                    {severityUnsaved && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-400">Unsaved</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleResetSeverityRules}
                      className="h-7 gap-1 text-xs shrink-0">
                      <RefreshCw className="h-3 w-3" />Reset to defaults
                    </Button>
                    <Button size="sm" onClick={handleSaveSeverityRules}
                      disabled={savingSeverity || !severityUnsaved}
                      className="h-7 gap-1 text-xs shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
                      {savingSeverity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {savingSeverity ? 'Saving…' : 'Save rules'}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Keywords matched (case-insensitive substring) against SPL text and alert name when importing from Splunk.
                  Enter one keyword per line. Higher-priority levels are checked first; unmatched alerts default to{' '}
                  <span className="icon-blue font-medium">Low</span>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(['critical', 'high', 'medium'] as const).map(level => {
                    const colours: Record<string, string> = {
                      critical: 'text-red-600 border-red-400 dark:text-red-400 dark:border-red-700/30',
                      high:     'text-orange-600 border-orange-400 dark:text-orange-400 dark:border-orange-700/30',
                      medium:   'text-yellow-700 border-yellow-400 dark:text-yellow-400 dark:border-yellow-700/30',
                    };
                    return (
                      <div key={level} className="space-y-1.5">
                        <label className={cn('text-[11px] font-semibold uppercase tracking-wide', colours[level].split(' ')[0])}>
                          {level}
                        </label>
                        <textarea
                          rows={5}
                          value={severityDraft[level].join('\n')}
                          onChange={e => updateSeverityDraft(level, e.target.value)}
                          placeholder={`One keyword per line…`}
                          className={cn(
                            'w-full rounded border bg-secondary/30 px-2.5 py-2 font-mono text-[11px] text-foreground/90',
                            'placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none',
                            colours[level].split(' ')[1],
                          )}
                        />
                      </div>
                    );
                  })}
                  {/* Low — read-only (catch-all) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wide icon-blue">
                      Low <span className="text-muted-foreground normal-case font-normal">(catch-all — no keywords needed)</span>
                    </label>
                    <div className="w-full rounded border border-blue-700/30 bg-secondary/20 px-2.5 py-2 text-[11px] text-muted-foreground/50 h-[94px] flex items-center justify-center">
                      Any alert not matched by Critical / High / Medium
                    </div>
                  </div>
                </div>

                {/* ── Live SPL preview ── */}
                <div className="space-y-1.5 pt-1 border-t border-border/40">
                  <label className="text-[11px] font-semibold text-foreground/70 flex items-center gap-1.5">
                    <FlaskConical className="h-3 w-3 text-purple-400 shrink-0" />
                    Live preview — type a sample SPL or alert name to see which level it would match
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={severityPreviewInput}
                      onChange={e => setSeverityPreviewInput(e.target.value)}
                      placeholder="e.g.  index=main error critical OR search sourcetype=syslog warning…"
                      className="h-8 text-[11px] font-mono bg-secondary/30 border-border flex-1"
                    />
                    {severityPreviewInput.trim() && (
                      <button
                        type="button"
                        onClick={() => setSeverityPreviewInput('')}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {severityPreviewResult && (
                    <div className={cn(
                      'flex items-center gap-2 rounded px-2.5 py-2 text-[11px] font-medium',
                      severityPreviewResult.level === 'CRITICAL' && 'bg-red-500/10 border border-red-500/30 text-red-500 dark:bg-red-900/20 dark:border-red-700/30 dark:text-red-300',
                      severityPreviewResult.level === 'HIGH'     && 'bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:bg-orange-900/20 dark:border-orange-700/30 dark:text-orange-300',
                      severityPreviewResult.level === 'MEDIUM'   && 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700/30 dark:text-yellow-300',
                      severityPreviewResult.level === 'LOW'      && 'banner-info',
                    )}>
                      <span className="shrink-0">→</span>
                      <span>Severity: <strong>{severityPreviewResult.level}</strong></span>
                      {severityPreviewResult.keyword && (
                        <span className="text-muted-foreground font-normal">
                          matched keyword: <code className="bg-secondary/50 px-1 rounded">{severityPreviewResult.keyword}</code>
                        </span>
                      )}
                      {!severityPreviewResult.keyword && (
                        <span className="text-muted-foreground font-normal">(no keyword matched — catch-all)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Splunk MCP Server — Section A: Evidence Layer ─────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <Cpu className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5 bg-secondary/40">
                    Section A
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">Evidence Layer — Splunk MCP Server 1.2</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect via JSON-RPC 2.0 over HTTPS to <code className="font-mono bg-muted/50 px-1 rounded text-[11px]">/services/mcp</code>.
                  Enables NL→SPL, tool discovery, and direct tool invocation for live evidence retrieval.
                  MCP token may differ from the REST token above.
                </p>
              </div>
            </div>

            {/* Connected server info badge */}
            {config.mcpServerName && mcpTestResult === 'ok' && (
              <div className="flex items-center gap-2.5 rounded-lg border border-purple-600/40 bg-purple-950/20 px-3 py-2.5">
                <Server className="h-4 w-4 text-purple-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-purple-300 truncate">
                    {config.mcpServerName}
                    {config.mcpServerVersion && <span className="text-purple-400/70 ml-1.5">v{config.mcpServerVersion}</span>}
                  </div>
                  <div className="text-[10px] text-purple-400/70 mt-0.5">
                    {config.mcpToolList.length > 0 ? `${config.mcpToolList.length} tools available` : 'MCP Server connected'}
                    {' · '}{config.splunkMcpUrl.replace(/\/services\/mcp$/, '')}
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              </div>
            )}

            <div className="space-y-5">
              {/* URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground">MCP Server Base URL</label>
                <Input value={config.splunkMcpUrl} onChange={e => updateConfig({ splunkMcpUrl: e.target.value })}
                  placeholder="https://battered-lukewarm-had.ngrok-free.dev"
                  className="font-mono text-sm h-10 bg-secondary/30 border-border" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Enter your Splunk base URL — SentinelOps automatically appends{' '}
                  <code className="font-mono bg-muted/50 px-1 rounded">/services/mcp</code> (Splunk MCP 1.2).
                  For ngrok: use <code className="font-mono bg-muted/50 px-1 rounded">https://&lt;subdomain&gt;.ngrok-free.app</code> (HTTPS only, no port).
                </p>
              </div>

              {/* Ngrok header toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/10 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-foreground">Skip ngrok browser warning</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Adds <code className="font-mono bg-muted/50 px-1 rounded">ngrok-skip-browser-warning: true</code> header to all MCP requests.
                    Auto-detected when URL contains "ngrok", but can be forced here.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig({ mcpSkipNgrok: !config.mcpSkipNgrok })}
                  className="shrink-0"
                  title={config.mcpSkipNgrok ? 'Disable ngrok header override' : 'Enable ngrok header override'}
                >
                  {config.mcpSkipNgrok
                    ? <ToggleRight className="h-6 w-6 text-purple-400" />
                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                </button>
              </div>

              {/* Auth method */}
              <div className="space-y-2">
                <label className="text-sm font-normal text-foreground">Authentication Method</label>
                <div className="flex gap-4">
                  {(['bearer', 'basic'] as McpAuthMethod[]).map(method => (
                    <label key={method} className="flex items-center gap-2 cursor-pointer select-none min-h-12">
                      <input type="radio" name="mcpAuthMethod" value={method}
                        checked={config.mcpAuthMethod === method}
                        onChange={() => updateConfig({ mcpAuthMethod: method })}
                        className="accent-purple-500" />
                      <span className="text-sm text-foreground">
                        {method === 'bearer' ? 'Bearer Token' : 'Basic Auth (username / password)'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bearer token */}
              {config.mcpAuthMethod === 'bearer' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">
                    Bearer Token <span className="text-muted-foreground">(leave blank if not required)</span>
                  </label>
                  <div className="relative">
                    <Input type={showMcpToken ? 'text' : 'password'} value={config.splunkMcpToken}
                      onChange={e => updateConfig({ splunkMcpToken: e.target.value })}
                      placeholder="eyJ… or your Splunk token"
                      className="font-mono text-sm h-10 bg-secondary/30 border-border pr-10" />
                    <button type="button" onClick={() => setShowMcpToken(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showMcpToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Basic auth */}
              {config.mcpAuthMethod === 'basic' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-normal text-foreground">Username</label>
                    <Input value={config.splunkMcpUsername}
                      onChange={e => updateConfig({ splunkMcpUsername: e.target.value })}
                      placeholder="admin"
                      className="font-mono text-sm h-10 bg-secondary/30 border-border" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-normal text-foreground">Password</label>
                    <div className="relative">
                      <Input type={showMcpPass ? 'text' : 'password'} value={config.splunkMcpPassword}
                        onChange={e => updateConfig({ splunkMcpPassword: e.target.value })}
                        placeholder="••••••••"
                        className="font-mono text-sm h-10 bg-secondary/30 border-border pr-10" />
                      <button type="button" onClick={() => setShowMcpPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showMcpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Test result banners */}
              {mcpTestResult === 'ok' && (
                <div className="flex items-center gap-2 rounded-lg border border-purple-600/40 bg-purple-950/20 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0" />
                  <span className="text-xs text-purple-300">
                    MCP Server reachable.
                    {config.mcpToolList.length > 0 && ` ${config.mcpToolList.length} tools discovered.`}
                    {' '}NL→SPL live execution enabled.
                  </span>
                </div>
              )}
              {mcpTestResult === 'fail' && (
                <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2.5">
                  <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-red-400 dark:text-red-300 font-medium">
                      {mcpTestError || 'MCP connection failed.'}
                    </p>
                    <ul className="text-[10px] text-red-400/80 mt-1 space-y-0.5 list-disc list-inside">
                      <li>Check that the ngrok tunnel is running and URL is current</li>
                      <li>Verify bearer token is correct (HTTP 401 = bad token)</li>
                      <li>Ensure Splunk MCP Server App is installed in Splunk</li>
                      <li>Use HTTPS URL — HTTP connections are blocked</li>
                    </ul>
                    {mcpVerboseDebug && (
                      <Button size="sm" variant="secondary"
                        onClick={handleAuthDebug}
                        disabled={authDebugRunning}
                        className="mt-2 h-7 gap-1.5 text-[11px]">
                        {authDebugRunning
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Bug className="h-3 w-3" />}
                        {authDebugRunning ? 'Capturing headers…' : 'Run Auth Debug'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Verbose auth debug toggle ─────────────────────────────── */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/10 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bug className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Verbose auth debug</p>
                    <p className="text-[10px] text-muted-foreground">
                      On 401/403 — capture full request &amp; response headers (token redacted)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMcpVerboseDebug(v => !v);
                    if (mcpVerboseDebug) { setAuthDebugResult(null); setAuthDebugOpen(false); }
                  }}
                  className="shrink-0 ml-3"
                  aria-label={mcpVerboseDebug ? 'Disable verbose debug' : 'Enable verbose debug'}
                >
                  {mcpVerboseDebug
                    ? <ToggleRight className="h-6 w-6 text-purple-400" />
                    : <ToggleLeft  className="h-6 w-6 text-muted-foreground/50" />}
                </button>
              </div>

              {/* ── Auth debug result panel ───────────────────────────────── */}
              {mcpVerboseDebug && (authDebugResult || authDebugError || authDebugRunning) && (
                <div className="rounded-lg border border-border bg-secondary/10">
                  <button type="button"
                    onClick={() => setAuthDebugOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-amber-400" />
                      Auth Debug Report
                      {authDebugResult && (
                        <span className={cn(
                          'ml-1 px-1.5 py-0 rounded-full text-[10px] border',
                          authDebugResult.ok
                            ? 'bg-green-500/15 text-green-400 border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30',
                        )}>
                          {authDebugResult.ok ? `HTTP ${authDebugResult.status} OK` : `HTTP ${authDebugResult.status ?? 'ERR'}`}
                        </span>
                      )}
                    </span>
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', authDebugOpen && 'rotate-90')} />
                  </button>

                  {authDebugOpen && (
                    <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                      {authDebugRunning && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Capturing request/response headers…
                        </div>
                      )}

                      {authDebugError && (
                        <div className="rounded border border-red-700/40 bg-red-950/20 px-2 py-1.5">
                          <p className="text-[11px] text-red-400 font-mono break-all">{authDebugError}</p>
                        </div>
                      )}

                      {authDebugResult && (
                        <div className="space-y-3 text-[11px]">
                          {/* Diagnosis */}
                          <div className={cn(
                            'rounded border px-2 py-2',
                            authDebugResult.ok
                              ? 'border-green-700/40 bg-green-950/20'
                              : 'border-amber-700/40 bg-amber-950/20',
                          )}>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              Diagnosis
                            </p>
                            <pre className="font-mono whitespace-pre-wrap break-words text-foreground text-[11px]">
                              {authDebugResult.diagnosis || `HTTP ${authDebugResult.status} · ${authDebugResult.durationMs}ms`}
                            </pre>
                          </div>

                          {/* Request headers (token redacted) */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                              <ArrowRight className="h-3 w-3" />
                              Request headers sent ({authDebugResult.durationMs}ms)
                            </p>
                            <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all text-foreground max-h-40">
                              {JSON.stringify(authDebugResult.requestHeaders, null, 2)}
                            </pre>
                          </div>

                          {/* Request payload */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                              <ArrowRight className="h-3 w-3" />
                              Request body (JSON-RPC payload)
                            </p>
                            <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
                              {JSON.stringify(authDebugResult.requestPayload, null, 2)}
                            </pre>
                          </div>

                          {/* Response headers */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                              <ArrowLeft className="h-3 w-3" />
                              Response headers received
                            </p>
                            {Object.keys(authDebugResult.responseHeaders).length > 0 ? (
                              <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all text-foreground max-h-40">
                                {JSON.stringify(authDebugResult.responseHeaders, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-[10px] text-muted-foreground italic">No response headers captured (network error)</p>
                            )}
                          </div>

                          {/* Raw response body */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                              <ArrowLeft className="h-3 w-3" />
                              Raw response body
                            </p>
                            <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all text-foreground max-h-48">
                              {typeof authDebugResult.responseBody === 'string'
                                ? authDebugResult.responseBody
                                : JSON.stringify(authDebugResult.responseBody, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Test + Save actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={handleMcpTest}
                  disabled={isMcpTesting || !config.splunkMcpUrl} className="h-9 gap-2 flex-1">
                  {isMcpTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                  {isMcpTesting ? 'Testing MCP…' : 'Test MCP Connection'}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}
                  className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 flex-1">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSaving ? 'Saving…' : 'Save Configuration'}
                </Button>
              </div>

              {/* ── Verify Live Splunk Connection ──────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10 px-3 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      Verify Live Splunk Connection
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Runs a minimal live query (<code className="font-mono bg-muted/50 px-1 rounded">index=_internal | head 1</code>) to confirm Splunk responds at runtime. Useful as judge evidence.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={verifyLiveConnection}
                    disabled={isVerifyingLive || (!config.splunkMcpUrl && !config.splunkHost)}
                    className="h-8 gap-1.5 shrink-0 text-xs"
                  >
                    {isVerifyingLive
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <ShieldCheck className="h-3.5 w-3.5" />}
                    {isVerifyingLive ? 'Verifying…' : 'Verify Live Splunk'}
                  </Button>
                </div>

                {/* Verify result banners */}
                {verifyLiveResult === 'ok' && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-950/20 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-emerald-300 font-medium">Live Splunk verified ✓</p>
                      {config.lastLiveVerifiedAt && (
                        <p className="text-[10px] text-emerald-400/70 font-mono mt-0.5">
                          Last verified: {new Date(config.lastLiveVerifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {verifyLiveResult === 'fail' && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2">
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300">{verifyLiveError || 'Verify failed — check credentials and try again.'}</p>
                  </div>
                )}
                {verifyLiveResult === 'idle' && config.lastLiveVerifiedAt && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Last verified: {new Date(config.lastLiveVerifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </p>
                )}
              </div>

              {/* E2E MCP Connectivity Test */}
              <div id="e2e" className="rounded-lg border border-border bg-secondary/10 px-3 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FlaskConical className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      E2E MCP Connectivity Test
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Runs 3 live SPL queries via your MCP Server and asserts each returns rows — proof of end-to-end MCP connectivity. If a Splunk Hosted Model endpoint is configured, a 4th assertion probes it for reachability.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={handleRunE2eTest}
                    disabled={e2eRunning || !config.splunkMcpUrl}
                    className="h-8 gap-1.5 shrink-0 text-xs">
                    {e2eRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {e2eRunning ? 'Running…' : 'Run E2E Test'}
                  </Button>
                </div>

                {/* Custom query input */}
                {config.splunkMcpUrl && (
                  <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Custom Assertion (optional)</p>
                    <div className="flex flex-col gap-1.5">
                      <Input
                        value={e2eCustomQueryName}
                        onChange={e => setE2eCustomQueryName(e.target.value)}
                        placeholder="Assertion label (e.g. My app index)"
                        className="h-7 text-xs px-2"
                      />
                      <Input
                        value={e2eCustomQuery}
                        onChange={e => setE2eCustomQuery(e.target.value)}
                        placeholder="index=myapp earliest=-1h | head 5"
                        className="h-7 text-xs px-2 font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Enter a SPL query targeting your own index. It will run as a 4th assertion.</p>
                  </div>
                )}

                {e2eError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2">
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300 break-words">{e2eError}</p>
                  </div>
                )}

                {/* Current run results */}
                {e2eResult && (
                  <div className="space-y-2">
                    <div className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5',
                      e2eResult.status === 'healthy' || (e2eResult.ok && !e2eResult.status)
                        ? 'border-emerald-600/40 bg-emerald-950/20'
                        : e2eResult.status === 'degraded'
                          ? 'border-amber-600/40 bg-amber-950/20'
                          : 'border-red-600/40 bg-red-950/20',
                    )}>
                      {e2eResult.status === 'degraded'
                        ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        : e2eResult.ok
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                      <span className={cn(
                        'text-xs font-semibold',
                        e2eResult.status === 'degraded'
                          ? 'text-amber-300'
                          : e2eResult.ok ? 'text-emerald-300' : 'text-red-300',
                      )}>
                        {e2eResult.status === 'degraded'
                          ? `MCP connected — Splunk data plane degraded (${e2eResult.passCount}/${e2eResult.totalCount} passed)`
                          : `${e2eResult.passCount}/${e2eResult.totalCount} assertions passed`}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">{e2eResult.durationMs}ms total</span>
                      {e2eResult.runId && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono hidden md:inline">saved #{e2eResult.runId.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-max text-[11px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">Assertion</th>
                            <th className="text-left font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">SPL</th>
                            <th className="text-center font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">Result</th>
                            <th className="text-right font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">Rows</th>
                            <th className="text-right font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">Time</th>
                            <th className="text-left font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap">Tool</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e2eResult.assertions.map((a, i) => (
                            <tr key={i} className="border-b border-border/50 last:border-0">
                              <td className="px-2 py-1.5 text-foreground whitespace-nowrap">
                                <div>{a.name}</div>
                                {a.error && <div className="text-[10px] text-red-400 font-mono mt-0.5 max-w-xs truncate">{a.error}</div>}
                              </td>
                              <td className="px-2 py-1.5 max-w-[240px]">
                                <button
                                  type="button"
                                  onClick={() => setE2eSplExpanded(e2eSplExpanded === i ? null : i)}
                                  className="text-left group"
                                  title="Click to expand SPL"
                                >
                                  {e2eSplExpanded === i
                                    ? <span className="font-mono text-[10px] text-foreground/80 whitespace-pre-wrap break-all leading-snug block">{a.spl}</span>
                                    : <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[200px] group-hover:text-foreground/70 transition-colors">{a.spl}</span>
                                  }
                                </button>
                              </td>
                              <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                {a.passed
                                  ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" />Pass</span>
                                  : a.splunkServerError
                                    ? <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" />Splunk</span>
                                    : <span className="inline-flex items-center gap-1 text-red-400"><XCircle className="h-3 w-3" />Fail</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap">{a.rowCount}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap">{a.durationMs}ms</td>
                              <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{a.toolUsed ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Run history */}
                {config.splunkMcpUrl && (e2eHistory.length > 0 || e2eHistoryLoading) && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <History className="h-3 w-3" />
                      Past Runs
                      {e2eHistoryLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                    </p>
                    <div className="space-y-1">
                      {e2eHistory.map(run => (
                        <div key={run.id} className="rounded-md border border-border/50 bg-background/30 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setE2eExpandedRun(e2eExpandedRun === run.id ? null : run.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-background/60 transition-colors"
                          >
                            {run.ok
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                              : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                            <span className={cn('text-[10px] font-semibold shrink-0', run.ok ? 'text-emerald-400' : 'text-red-400')}>
                              {run.pass_count}/{run.total_count}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate flex-1 min-w-0">
                              {new Date(run.ran_at).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">{run.duration_ms}ms</span>
                            <ChevronRight className={cn('h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform', e2eExpandedRun === run.id && 'rotate-90')} />
                          </button>
                          {e2eExpandedRun === run.id && (
                            <div className="px-3 pb-2 overflow-x-auto">
                              <table className="w-full min-w-max text-[10px]">
                                <thead>
                                  <tr className="border-b border-border/40">
                                    <th className="text-left font-medium text-muted-foreground px-1.5 py-1 whitespace-nowrap">Assertion</th>
                                    <th className="text-left font-medium text-muted-foreground px-1.5 py-1 whitespace-nowrap">SPL</th>
                                    <th className="text-center font-medium text-muted-foreground px-1.5 py-1 whitespace-nowrap">Result</th>
                                    <th className="text-right font-medium text-muted-foreground px-1.5 py-1 whitespace-nowrap">Rows</th>
                                    <th className="text-right font-medium text-muted-foreground px-1.5 py-1 whitespace-nowrap">Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(run.assertions as E2eAssertion[]).map((a, i) => (
                                    <tr key={i} className="border-b border-border/30 last:border-0">
                                      <td className="px-1.5 py-1 text-foreground/80 whitespace-nowrap">{a.name}</td>
                                      <td className="px-1.5 py-1 max-w-[200px]">
                                        <span className="font-mono text-muted-foreground truncate block max-w-[180px]" title={a.spl}>{a.spl}</span>
                                      </td>
                                      <td className="px-1.5 py-1 text-center whitespace-nowrap">
                                        {a.passed
                                          ? <span className="text-emerald-400">Pass</span>
                                          : <span className="text-red-400">Fail</span>}
                                      </td>
                                      <td className="px-1.5 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">{a.rowCount}</td>
                                      <td className="px-1.5 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">{a.durationMs}ms</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!config.splunkMcpUrl && (
                  <p className="text-[10px] text-muted-foreground italic">Configure MCP Server URL above to enable E2E testing.</p>
                )}
              </div>

              {/* ── Reasoning Provider Selector ────────────────────────── */}
              <div id="reasoning-provider-section" className="rounded-lg border border-border bg-secondary/10 px-3 py-3 space-y-2.5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5 bg-background/40">
                      Section B
                    </span>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <BrainCircuit className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      Reasoning Provider
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Splunk provides <strong className="text-foreground">live operational evidence</strong> via MCP or REST (Section A).
                    The reasoning layer (LLM) is separate — it synthesises the incident analysis brief.
                    Choose which provider performs reasoning. Both layers are independently attributed in every result.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Gemini option */}
                  <button
                    type="button"
                    onClick={() => updateConfig({ reasoningProvider: 'gemini' })}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                      config.reasoningProvider === 'gemini' || !config.reasoningProvider
                        ? 'border-blue-600/50 bg-blue-950/20'
                        : 'border-border bg-secondary/20 hover:border-border/80',
                    )}
                  >
                    <Cpu className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Gemini 2.5 Flash</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                        Google Gemini 2.5 Flash. Splunk provides evidence; Gemini provides reasoning.
                        Safe to claim at hackathon — clearly attributed.
                      </p>
                      {(config.reasoningProvider === 'gemini' || !config.reasoningProvider) && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-300 mt-1 font-mono">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Active
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Splunk Hosted Model option */}
                  <button
                    type="button"
                    onClick={() => updateConfig({ reasoningProvider: 'splunk-hosted-model' })}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                      config.reasoningProvider === 'splunk-hosted-model'
                        ? 'border-purple-600/50 bg-purple-950/20'
                        : 'border-border bg-secondary/20 hover:border-border/80',
                    )}
                  >
                    <BrainCircuit className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Splunk Hosted Model</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                        Route reasoning through a real Splunk-hosted LLM endpoint (Splunk Cloud Platform only — not available on local Enterprise).
                        Requires endpoint URL, token, and model name.
                      </p>
                      {config.reasoningProvider === 'splunk-hosted-model' && (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] mt-1 font-mono',
                          isHostedModelActive ? 'text-purple-300' : 'text-amber-300',
                        )}>
                          {isHostedModelActive
                            ? <><CheckCircle2 className="h-2.5 w-2.5" /> Active &amp; configured</>
                            : <><AlertTriangle className="h-2.5 w-2.5" /> Selected — awaiting credentials</>}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Splunk Hosted Model credential fields — only shown when selected */}
                {config.reasoningProvider === 'splunk-hosted-model' && (
                  <div className="space-y-2.5 border-t border-border/60 pt-2.5">
                    {/* Important limitation notice */}
                    <div className="flex items-start gap-2 rounded-lg border border-blue-700/40 bg-blue-950/20 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-blue-300 leading-relaxed">
                        <strong className="text-foreground">Important:</strong> Splunk Foundation Models (AI Assistant) are available on <strong className="text-foreground">Splunk Cloud Platform</strong> only.
                        Local Splunk Enterprise does not provide hosted LLM inference endpoints.
                        Only configure this section if you have a real Splunk Cloud Platform instance with AI capabilities enabled.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-normal text-foreground">Hosted Model Endpoint URL</label>
                      <Input
                        value={config.splunkHostedModelEndpoint}
                        onChange={e => updateConfig({ splunkHostedModelEndpoint: e.target.value })}
                        placeholder="https://your-splunk-cloud.splunkcloud.com/services/llm/v1/chat"
                        className="font-mono text-sm h-10 bg-secondary/30 border-border"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        OpenAI-compatible chat completions endpoint on your Splunk Cloud Platform instance.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-normal text-foreground">Hosted Model Token</label>
                      <Input
                        type="password"
                        value={config.splunkHostedModelToken}
                        onChange={e => updateConfig({ splunkHostedModelToken: e.target.value })}
                        placeholder="••••••••"
                        className="font-mono text-sm h-10 bg-secondary/30 border-border"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-normal text-foreground">Model Name / Deployment ID</label>
                      <Input
                        value={config.splunkHostedModelName ?? ''}
                        onChange={e => updateConfig({ splunkHostedModelName: e.target.value })}
                        placeholder="e.g. hosted-llm-prod or default"
                        className="font-mono text-sm h-10 bg-secondary/30 border-border"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        The model identifier or deployment name returned by your Splunk Cloud AI endpoint.
                      </p>
                    </div>

                    {/* Test hosted model button */}
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={testHostedModelConnection}
                        disabled={isHostedModelTesting || !config.splunkHostedModelEndpoint || !config.splunkHostedModelToken}
                        className="h-9 gap-2 self-start"
                      >
                        {isHostedModelTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        {isHostedModelTesting ? 'Testing inference…' : 'Test Hosted Model Inference'}
                      </Button>
                      {hostedModelTestResult === 'ok' && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Hosted model responded — inference is live
                        </div>
                      )}
                      {hostedModelTestResult === 'fail' && (
                        <div className="rounded border border-red-700/40 bg-red-950/20 px-2.5 py-2">
                          <p className="text-[11px] text-red-300">{hostedModelTestError || 'Test failed — check endpoint, token, and model name.'}</p>
                        </div>
                      )}
                    </div>

                    {(!config.splunkHostedModelEndpoint || !config.splunkHostedModelToken) && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-300">
                          Endpoint URL and token are required to activate Splunk-hosted reasoning.
                          Until configured, Gemini will be used as the fallback reasoning provider and clearly labelled as such.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Honest attribution footer */}
                <div className="rounded border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] text-muted-foreground leading-relaxed space-y-0.5">
                  <p><strong className="text-foreground">Evidence layer (Section A):</strong> Splunk MCP or REST — live operational data from your Splunk instance.</p>
                  <p><strong className="text-foreground">Reasoning layer (Section B):</strong>{' '}
                    {config.reasoningProvider === 'splunk-hosted-model' && isHostedModelActive
                      ? 'Splunk Hosted Model — routing analysis through your configured Splunk Cloud AI endpoint. Both layers active.'
                      : config.reasoningProvider === 'splunk-hosted-model' && !isHostedModelActive
                        ? 'Splunk Hosted Model selected but not yet configured — Gemini will be used until credentials are provided.'
                        : 'Gemini 2.5 Flash — Splunk provides evidence; Gemini synthesises the analysis brief.'}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 mt-1">Every analysis result includes explicit evidence_source and reasoning_source fields for judge verification.</p>
                </div>
              </div>

              {/* ── NL→SPL via MCP quick-run panel ──────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10">
                <button type="button" onClick={() => setMcpNlOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                    NL→SPL via MCP — run natural language queries
                  </span>
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', mcpNlOpen && 'rotate-90')} />
                </button>
                {mcpNlOpen && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                    <p className="text-[10px] text-muted-foreground">
                      Type a question in plain English. SentinelOps generates SPL, then executes it via the{' '}
                      <code className="font-mono bg-muted/50 px-1 rounded">splunk_run_query</code> MCP tool.
                    </p>
                    <div className="space-y-1">
                      <label className="text-xs font-normal text-foreground">Natural Language Query</label>
                      <Textarea value={mcpNlQuery} onChange={e => setMcpNlQuery(e.target.value)}
                        placeholder="Show me the top 10 error events in the last hour"
                        className="text-sm min-h-[60px] bg-secondary/30 border-border resize-none" />
                    </div>
                    {mcpNlStep !== 'idle' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-normal text-foreground">Generated SPL</label>
                          <span className="text-[10px] text-muted-foreground">Edit before running if needed</span>
                        </div>
                        <Textarea value={mcpNlSpl} onChange={e => setMcpNlSpl(e.target.value)}
                          className="font-mono text-xs min-h-[56px] bg-secondary/30 border-border resize-y" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" className="h-8 gap-1.5 flex-1"
                        onClick={() => handleMcpNlRun(false)}
                        disabled={mcpNlRunning || !mcpNlQuery.trim() || !config.splunkMcpUrl}>
                        {mcpNlRunning && mcpNlStep === 'idle'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Bot className="h-3.5 w-3.5" />}
                        Generate SPL
                      </Button>
                      {mcpNlStep !== 'idle' && (
                        <Button size="sm" className="h-8 gap-1.5 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => handleMcpNlRun(true)}
                          disabled={mcpNlRunning || !mcpNlSpl.trim()}>
                          {mcpNlRunning
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Play className="h-3.5 w-3.5" />}
                          Run via MCP
                        </Button>
                      )}
                    </div>
                    {mcpNlError && (
                      <div className="rounded border border-red-700/40 bg-red-950/20 px-2 py-1.5">
                        <p className="text-[11px] text-red-400 dark:text-red-300 font-mono break-all">{mcpNlError}</p>
                      </div>
                    )}
                    {mcpNlStep === 'ran' && mcpNlResult != null && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> Results
                        </p>
                        <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground">
                          {JSON.stringify(mcpNlResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── MCP Tool Mapper ──────────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10">
                <button type="button" onClick={() => setMcpToolsOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    MCP Tool Explorer
                    {config.mcpToolList.length > 0 && (
                      <span className="ml-1 px-1.5 py-0 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] border border-cyan-500/30">
                        {config.mcpToolList.length} tools
                      </span>
                    )}
                  </span>
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', mcpToolsOpen && 'rotate-90')} />
                </button>
                {mcpToolsOpen && (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <p className="text-[10px] text-muted-foreground mb-3">
                      Explore and invoke all Splunk MCP tools. Run <strong>Test MCP Connection</strong> first to discover tools.
                    </p>
                    <McpToolMapperPanel
                      tools={config.mcpToolList}
                      mcpUrl={config.splunkMcpUrl}
                      mcpToken={config.splunkMcpToken}
                      mcpAuthMethod={config.mcpAuthMethod}
                      mcpUsername={config.splunkMcpUsername}
                      mcpPassword={config.splunkMcpPassword}
                    />
                  </div>
                )}
              </div>

              {/* ── MCP Diagnostic Panel ──────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/10">
                <button type="button" onClick={() => setDiagOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-purple-400" />
                    MCP Diagnostic — raw JSON-RPC probe
                  </span>
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', diagOpen && 'rotate-90')} />
                </button>

                {diagOpen && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                    <p className="text-[10px] text-muted-foreground">
                      Send a raw JSON-RPC 2.0 request to your MCP server and inspect the full response from every candidate endpoint.
                    </p>

                    {/* Method */}
                    <div className="space-y-1">
                      <label className="text-xs font-normal text-foreground">RPC Method</label>
                      <div className="relative">
                        <select
                          value={diagMethod}
                          onChange={e => setDiagMethod(e.target.value)}
                          className="w-full appearance-none h-8 rounded border border-border bg-secondary/30 px-2 pr-6 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="tools/list">tools/list — enumerate available tools</option>
                          <option value="tools/call">tools/call — invoke a tool (edit params below)</option>
                          <option value="initialize">initialize — MCP handshake</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    {/* Params */}
                    <div className="space-y-1">
                      <label className="text-xs font-normal text-foreground">RPC Params (JSON)</label>
                      <textarea
                        value={diagParams}
                        onChange={e => setDiagParams(e.target.value)}
                        rows={3}
                        spellCheck={false}
                        className="w-full rounded border border-border bg-secondary/30 px-2 py-1.5 text-[11px] font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder='{"name":"splunk_run_query","arguments":{"query":"index=main | head 5"}}'
                      />
                    </div>

                    <Button size="sm" variant="secondary" onClick={handleMcpDiag}
                      disabled={diagRunning || !config.splunkMcpUrl}
                      className="h-8 gap-1.5 w-full">
                      {diagRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                      {diagRunning ? 'Probing…' : 'Run Diagnostic'}
                    </Button>

                    {diagError && (
                      <div className="rounded border border-red-700/40 bg-red-950/20 px-2 py-1.5">
                        <p className="text-[11px] text-red-500 dark:text-red-300 font-mono break-all">{diagError}</p>
                      </div>
                    )}

                    {diagResult && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Request Payload</p>
                          <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
                            {JSON.stringify(diagResult.requestPayload, null, 2)}
                          </pre>
                        </div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Endpoint Probes</p>
                        {diagResult.probeResults.map((probe, i) => (
                          <div key={i} className={cn(
                            'rounded border px-2 py-1.5 space-y-1',
                            probe.ok ? 'banner-teal' : 'border border-border bg-secondary/20'
                          )}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('text-[10px] font-bold', probe.ok ? 'text-live' : 'text-muted-foreground')}>
                                {probe.ok ? '✓' : '✗'}
                              </span>
                              <span className="text-[10px] font-mono text-foreground break-all flex-1">{probe.endpoint}</span>
                              <span className={cn('text-[10px] shrink-0', probe.ok ? 'text-live' : 'text-destructive')}>
                                {probe.status ?? 'ERR'} · {probe.durationMs}ms
                              </span>
                            </div>
                            {probe.error && (
                              <p className="text-[10px] font-mono text-red-500 dark:text-red-300 break-all">{probe.error}</p>
                            )}
                            <pre className="text-[10px] font-mono bg-secondary/40 rounded px-1.5 py-1 overflow-x-auto whitespace-pre-wrap break-all text-foreground max-h-40">
                              {typeof probe.responseBody === 'string'
                                ? probe.responseBody
                                : JSON.stringify(probe.responseBody, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          </div>
          {/* ── END LEFT COLUMN ──────────────────────────────────────────── */}

          {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
          <div className="space-y-8">

          {/* ── Integrations: PagerDuty + Email + Slack ─────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <Bell className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Integrations</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure PagerDuty, Resend email, and Slack notification channels. Keys are stored
                  per-user and sent securely to edge functions — never exposed to other users.
                </p>
              </div>
            </div>
            <div className="space-y-6">

              {/* ── PagerDuty ──────────────────────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">PagerDuty</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">Events API v2 Routing Key</label>
                  <Input
                    type="password"
                    value={config.pagerdutyRoutingKey}
                    onChange={e => updateConfig({ pagerdutyRoutingKey: e.target.value })}
                    placeholder="32-character routing key (for triggering incidents)"
                    className="font-mono text-sm h-10 bg-secondary/30 border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    PagerDuty → Services → Integrations → <strong>Events API v2</strong>. Enables Trigger / Acknowledge / Resolve from each incident card.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">REST API Key</label>
                  <Input
                    type="password"
                    value={config.pdRestApiKey}
                    onChange={e => updateConfig({ pdRestApiKey: e.target.value })}
                    placeholder="PagerDuty REST API key (for status panel)"
                    className="font-mono text-sm h-10 bg-secondary/30 border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    PagerDuty → My Profile → <strong>User Settings → API Access</strong>. Powers the PagerDuty Status Panel on the dashboard (open / acknowledged / resolved counts).
                  </p>
                </div>

                {/* ── PagerDuty Live Sync ──────────────────────────────── */}
                <div className="rounded-lg border border-border bg-secondary/10 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">Live Incident Sync</p>
                      <p className="text-[11px] text-muted-foreground">
                        Pull open &amp; acknowledged PagerDuty incidents into the incident list.
                        Incidents appear instantly and trigger your alert routing rules.
                      </p>
                    </div>
                    {/* Manual Sync Now (shown when auto-sync is off) */}
                    {!config.pdAutoSync && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handlePdSync}
                        disabled={pdSyncState === 'syncing' || !config.pdRestApiKey}
                        className="h-8 gap-1.5 shrink-0 text-xs"
                      >
                        {pdSyncState === 'syncing'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />}
                        {pdSyncState === 'syncing' ? 'Syncing…' : 'Sync Now'}
                      </Button>
                    )}
                  </div>

                  {/* Auto-sync toggle row */}
                  <div className={cn(
                    'flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors',
                    config.pdAutoSync
                      ? 'banner-teal'
                      : 'border-border bg-secondary/20'
                  )}>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-foreground">Auto-Sync</p>
                      <p className="text-[10px] text-muted-foreground">
                        {config.pdAutoSync
                          ? `Running every ${config.pdSyncInterval}s automatically`
                          : 'Disabled — use Sync Now for one-time pulls'}
                      </p>
                    </div>
                    {/* Toggle switch */}
                    <button
                      type="button"
                      disabled={!config.pdRestApiKey}
                      onClick={() => updateConfig({ pdAutoSync: !config.pdAutoSync })}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
                        config.pdAutoSync ? 'bg-primary' : 'bg-secondary'
                      )}
                      title={config.pdRestApiKey ? 'Toggle auto-sync' : 'Enter REST API key first'}
                    >
                      <span className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
                        config.pdAutoSync ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </button>
                  </div>

                  {/* Interval input — shown when auto-sync is ON */}
                  {config.pdAutoSync && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Sync interval (seconds)
                        </label>
                        <Input
                          type="number"
                          min={30}
                          max={3600}
                          value={config.pdSyncInterval}
                          onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) updateConfig({ pdSyncInterval: Math.max(30, Math.min(3600, v)) });
                          }}
                          className="h-8 text-sm bg-input border-border w-32"
                        />
                        <p className="text-[10px] text-muted-foreground/60">Range: 30 – 3600 seconds</p>
                      </div>

                      {/* Live "last synced" timestamp */}
                      <div className="flex-1 rounded-md banner-teal px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Last synced</p>
                        {pdSyncState === 'syncing' ? (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin icon-teal" />
                            <span className="text-[11px] text-live">Syncing…</span>
                          </div>
                        ) : pdLastSyncedAt ? (
                          <p className="text-[11px] text-live font-medium">{fmtElapsed(pdElapsed)}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">Pending first sync…</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sync status row */}
                  {pdSyncState === 'success' && pdSyncResult && !config.pdAutoSync && (
                    <div className="flex items-center gap-2 rounded-md banner-teal px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 icon-teal shrink-0" />
                      <p className="text-[11px] text-live">
                        {pdSyncResult.synced > 0
                          ? `${pdSyncResult.synced} incident${pdSyncResult.synced !== 1 ? 's' : ''} synced to incident list`
                          : 'No open incidents found in PagerDuty'}
                      </p>
                      {pdSyncResult.errors.length > 0 && (
                        <span className="ml-auto text-[10px] text-amber-400">
                          {pdSyncResult.errors.length} error{pdSyncResult.errors.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {pdSyncState === 'error' && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <p className="text-[11px] text-destructive">
                        Sync failed — check your REST API key and network connection.
                      </p>
                    </div>
                  )}
                  {!config.pdRestApiKey && (
                    <p className="text-[11px] text-muted-foreground/60 italic">
                      Enter your REST API key above to enable sync.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* ── Email via Resend ───────────────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Email (via Resend)</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">Resend API Key</label>
                  <Input
                    type="password"
                    value={config.resendApiKey}
                    onChange={e => updateConfig({ resendApiKey: e.target.value })}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                    className="font-mono text-sm h-10 bg-secondary/30 border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Get your key at <strong>resend.com/api-keys</strong>. Used when an alert rule action is set to "Email notification" or "All channels".
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">Alert Email Address</label>
                  <Input
                    type="email"
                    value={config.alertEmail}
                    onChange={e => updateConfig({ alertEmail: e.target.value })}
                    placeholder="oncall@yourcompany.com"
                    className="text-sm h-10 bg-secondary/30 border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Recipient address for alert email notifications.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => { await saveConfig(); toast.success('Resend email settings saved'); }}
                  disabled={isSaving}
                  className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSaving ? 'Saving…' : 'Save Email Settings'}
                </Button>
              </div>

              <div className="border-t border-border" />

              {/* ── Slack ──────────────────────────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Slack</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">Incoming Webhook URL</label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={config.slackWebhookUrl}
                      onChange={e => updateConfig({ slackWebhookUrl: e.target.value })}
                      placeholder="https://hooks.slack.com/services/T.../B.../..."
                      className="font-mono text-sm h-10 bg-secondary/30 border-border flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestSlack}
                      disabled={slackTesting || !config.slackWebhookUrl}
                      className={cn(
                        'h-10 gap-2 shrink-0 transition-colors',
                        slackTestResult === 'ok'   && 'border-green-500 text-green-600',
                        slackTestResult === 'fail'  && 'border-red-500 text-red-600 dark:border-red-600 dark:text-red-400',
                      )}
                      title="Send a test message to your Slack channel"
                    >
                      {slackTesting
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : slackTestResult === 'ok'
                          ? <CheckCircle2 className="h-3.5 w-3.5" />
                          : slackTestResult === 'fail'
                            ? <XCircle className="h-3.5 w-3.5" />
                            : <Send className="h-3.5 w-3.5" />
                      }
                      <span className="hidden sm:inline">
                        {slackTesting ? 'Sending…' : slackTestResult === 'ok' ? 'Sent!' : slackTestResult === 'fail' ? 'Failed' : 'Test'}
                      </span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Create at <strong>api.slack.com/apps</strong> → Incoming Webhooks. Used when an alert rule action is set to "Slack" or "All channels".
                  </p>
                </div>
              </div>

              <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSaving ? 'Saving…' : 'Save Integrations'}
              </Button>
            </div>
          </div>

          {/* ── AI Model Configuration ────────────────────────────────────── */}
          <div id="llm-settings-section" className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <Bot className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">AI Model Configuration</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which LLM powers incident analysis, follow-up chat, and NL→SPL generation.
                  API keys are stored per user and sent directly to each provider.
                </p>
              </div>
            </div>

            {/* Provider tabs */}
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Active Provider</p>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(p => (
                    <button key={p.id} type="button" onClick={() => setActiveProvider(p.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        activeProvider === p.id
                          ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                          : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                      )}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active provider config */}
              <div className="rounded-lg border border-cyan-700/30 bg-cyan-950/10 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-cyan-300">{activeMeta.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-cyan-600/20 text-cyan-400 rounded font-mono">active</span>
                </div>

                {/* Model selector */}
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">Model</label>
                  <div className="relative">
                    <select
                      value={llmConfigs[activeProvider].modelId}
                      onChange={e => updateLlmConfig(activeProvider, { modelId: e.target.value })}
                      className="w-full appearance-none h-10 rounded-md border border-border bg-secondary/30 px-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {activeMeta.models.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label className="text-sm font-normal text-foreground">{activeMeta.apiKeyLabel}</label>
                  <div className="relative">
                    <Input
                      type={showKeys[activeProvider] ? 'text' : 'password'}
                      value={llmConfigs[activeProvider].apiKey}
                      onChange={e => updateLlmConfig(activeProvider, { apiKey: e.target.value })}
                      placeholder={activeMeta.apiKeyHint}
                      className="font-mono text-sm h-10 bg-secondary/30 border-border pr-10"
                    />
                    <button type="button"
                      onClick={() => setShowKeys(v => ({ ...v, [activeProvider]: !v[activeProvider] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showKeys[activeProvider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to use the platform's default Gemini gateway (Gemini only). Keys are stored securely in your account.
                  </p>
                </div>
              </div>

              {/* Other providers — compact key inputs */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 select-none py-1">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  Configure other providers (optional)
                </summary>
                <div className="mt-3 space-y-3 pl-2 border-l border-border">
                  {PROVIDERS.filter(p => p.id !== activeProvider).map(p => (
                    <div key={p.id} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{p.label} — {p.apiKeyLabel}</label>
                      <div className="relative">
                        <Input type={showKeys[p.id] ? 'text' : 'password'}
                          value={llmConfigs[p.id].apiKey}
                          onChange={e => updateLlmConfig(p.id, { apiKey: e.target.value })}
                          placeholder={p.apiKeyHint}
                          className="font-mono text-xs h-9 bg-secondary/30 border-border pr-9" />
                        <button type="button"
                          onClick={() => setShowKeys(v => ({ ...v, [p.id]: !v[p.id] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showKeys[p.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              <Button size="sm" onClick={handleSaveLlm} disabled={isSavingLlm}
                className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
                {isSavingLlm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSavingLlm ? 'Saving…' : 'Save AI Model Config'}
              </Button>

              {/* ── Analysis Cache TTL ────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Analysis Cache TTL</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {cacheTtlMinutes} min{cacheTtlMinutes !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Re-opening an incident within this window loads the cached AI analysis instantly — no new LLM call.
                  Set to <strong>0</strong> to always run a fresh analysis.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground w-6 shrink-0">1m</span>
                  <input
                    type="range"
                    min={1}
                    max={240}
                    step={5}
                    value={cacheTtlMinutes}
                    onChange={e => setCacheTtlMinutes(Number(e.target.value))}
                    className="flex-1 accent-primary h-1.5 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">240m</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={cacheTtlMinutes}
                    onChange={e => setCacheTtlMinutes(Number(e.target.value))}
                    className="w-16 h-7 rounded border border-border bg-secondary/30 px-2 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[5, 15, 30, 60, 120].map(v => (
                    <button
                      key={v}
                      onClick={() => setCacheTtlMinutes(v)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
                        cacheTtlMinutes === v
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                      )}
                    >
                      {v}m
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Max Token Budget ─────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Max Token Budget</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {maxTokenBudget.toLocaleString()} tokens
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Streaming stops gracefully when the AI response hits this limit. The partial result is saved and displayed.
                  Increase for exhaustive analyses; decrease to reduce latency and cost.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">1k</span>
                  <input
                    type="range"
                    min={1000}
                    max={16000}
                    step={500}
                    value={maxTokenBudget}
                    onChange={e => setMaxTokenBudget(Number(e.target.value))}
                    className="flex-1 accent-primary h-1.5 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0 text-right">16k</span>
                  <input
                    type="number"
                    min={1000}
                    max={16000}
                    step={500}
                    value={maxTokenBudget}
                    onChange={e => setMaxTokenBudget(Number(e.target.value))}
                    className="w-20 h-7 rounded border border-border bg-secondary/30 px-2 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {/* Named presets with recommended use-case descriptions */}
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {[
                    {
                      value: 2000,
                      label: 'Quick',
                      badge: '2k',
                      tagColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/8',
                      desc: 'Fast triage — brief executive summary only. Best for initial on-call assessment under time pressure.',
                    },
                    {
                      value: 8000,
                      label: 'Standard',
                      badge: '8k',
                      tagColor: 'text-primary border-primary/30 bg-primary/8',
                      desc: 'Balanced depth — full hypotheses, timeline, blast radius, and recommended actions. Recommended default.',
                    },
                    {
                      value: 16000,
                      label: 'Deep Dive',
                      badge: '16k',
                      tagColor: 'text-violet-400 border-violet-500/30 bg-violet-500/8',
                      desc: 'Exhaustive investigation — maximum detail across all sections. Use for post-mortems and complex multi-service incidents.',
                    },
                  ].map(({ value, label, badge, tagColor, desc }) => {
                    const active = maxTokenBudget === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setMaxTokenBudget(value)}
                        className={cn(
                          'flex items-start gap-3 w-full rounded-lg border px-3 py-2.5 text-left transition-all',
                          active
                            ? 'border-primary/40 bg-primary/8 ring-1 ring-primary/20'
                            : 'border-border bg-secondary/10 hover:border-muted-foreground/40 hover:bg-secondary/30'
                        )}
                      >
                        <span className={cn(
                          'shrink-0 mt-0.5 text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border',
                          tagColor
                        )}>
                          {badge}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-[11px] font-semibold leading-none mb-1',
                            active ? 'text-foreground' : 'text-foreground/80'
                          )}>
                            {label}
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
                        </div>
                        {active && (
                          <span className="shrink-0 text-[9px] font-semibold text-primary mt-0.5">✓ Active</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Fine-tune with extra presets */}
                <div className="flex gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-muted-foreground self-center mr-1">Custom:</span>
                  {[4000, 6000, 12000].map(v => (
                    <button
                      key={v}
                      onClick={() => setMaxTokenBudget(v)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
                        maxTokenBudget === v
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                      )}
                    >
                      {v / 1000}k
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Fallback chain order indicator ────────────────────── */}
              <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Fallback Chain Order</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {fallbackChain.length === 0 ? 'no providers configured' : `${fallbackChain.length} provider${fallbackChain.length > 1 ? 's' : ''}`}
                  </span>
                </div>

                {fallbackChain.length === 0 ? (
                  <p className="text-[11px] text-yellow-600/90 dark:text-yellow-400/80 flex items-center gap-1.5">
                    <XCircle className="h-3 w-3 shrink-0" />
                    No providers have API keys. Add a key above to enable AI features.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      When a provider fails, requests automatically retry the next one in order.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {fallbackChain.map((slot, idx) => {
                        const meta = PROVIDERS.find(p => p.id === slot.provider);
                        const isActive = slot.provider === activeProvider;
                        return (
                          <div key={slot.provider} className="flex items-center gap-1.5">
                            <div className={cn(
                              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium',
                              isActive
                                ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300'
                                : 'bg-secondary/60 border-border text-muted-foreground'
                            )}>
                              <span className={cn(
                                'h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                                isActive ? 'bg-cyan-500/30 text-cyan-300' : 'bg-secondary text-muted-foreground'
                              )}>
                                {idx + 1}
                              </span>
                              {meta?.label ?? slot.provider}
                              {isActive && (
                                <span className="text-[9px] uppercase tracking-wider text-cyan-400/70 font-mono">active</span>
                              )}
                            </div>
                            {idx < fallbackChain.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {fallbackChain.length === 1 && (
                      <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                        <Info className="h-3 w-3 shrink-0" />
                        Add API keys for other providers to enable automatic fallback on failure.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Alert Routing Rules ───────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Alert Routing Rules</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define conditions that trigger custom actions when new alerts arrive.
                    Rules are evaluated for every incoming real-time alert.
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={addAlertRule} className="h-8 gap-1.5 shrink-0 text-xs">
                <Plus className="h-3.5 w-3.5" />Add Rule
              </Button>
            </div>

            {alertRules.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No rules defined yet.</p>
                <p className="text-xs mt-1">Click "Add Rule" to create your first routing rule.</p>
              </div>
            ) : (
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={alertRules.map(r => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {alertRules.map((rule, idx) => (
                      <SortableRuleCard
                        key={rule.id}
                        rule={rule}
                        idx={idx}
                        updateAlertRule={updateAlertRule}
                        deleteAlertRule={deleteAlertRule}
                      >
                        <div className={cn(
                          'rounded-lg border transition-colors overflow-hidden',
                          rule.enabled ? 'border-border bg-card' : 'border-border/40 bg-secondary/5 opacity-60'
                        )}>
                          {/* Rule header bar */}
                          <div className={cn(
                            'flex items-center gap-2 px-3 py-2 border-b border-border pr-10',
                            rule.enabled ? 'bg-secondary/30' : 'bg-secondary/10'
                          )}>
                            <Input
                              value={rule.name}
                              onChange={e => updateAlertRule(rule.id, { name: e.target.value })}
                              className="flex-1 min-w-0 h-6 text-xs bg-transparent border-0 border-b border-border/50 rounded-none px-1 focus-visible:ring-0 focus-visible:border-primary"
                              placeholder="Rule name…"
                            />
                            <button
                              type="button"
                              onClick={() => updateAlertRule(rule.id, { enabled: !rule.enabled })}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors shrink-0',
                                rule.enabled
                                  ? 'badge-live'
                                  : 'bg-secondary border-border text-muted-foreground'
                              )}
                            >
                              {rule.enabled ? 'On' : 'Off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAlertRule(rule.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Visual IF → WHEN → THEN flow */}
                          <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 items-center">

                            {/* IF — Severity */}
                            <div className="rounded-md border border-red-700/30 bg-red-950/15 p-2.5 space-y-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-red-500 dark:text-red-400">IF severity</span>
                              <MultiChipSelect
                                options={SEVERITY_OPTIONS}
                                selected={rule.severities}
                                onChange={v => updateAlertRule(rule.id, { severities: v })}
                                colorClass="severity-critical"
                              />
                              {rule.severities.length === 0 && (
                                <p className="text-[10px] text-muted-foreground/60 italic">any severity</p>
                              )}
                            </div>

                            {/* connector */}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mx-1 hidden md:block" />

                            {/* WHEN — Service */}
                            <div className="rounded-md banner-info p-2.5 space-y-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-widest icon-blue">WHEN service</span>
                              <MultiChipSelect
                                options={SERVICE_OPTIONS}
                                selected={rule.services}
                                onChange={v => updateAlertRule(rule.id, { services: v })}
                                colorClass="badge-demo"
                              />
                              {rule.services.length === 0 && (
                                <p className="text-[10px] text-muted-foreground/60 italic">any service</p>
                              )}
                            </div>

                            {/* connector */}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mx-1 hidden md:block" />

                            {/* THEN — Channel/Action */}
                            <div className="rounded-md border border-orange-700/30 bg-orange-950/15 p-2.5 space-y-2">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-orange-500 dark:text-orange-400">THEN notify via</span>
                              <div className="relative">
                                <select
                                  value={rule.action}
                                  onChange={e => updateAlertRule(rule.id, { action: e.target.value as AlertAction })}
                                  className="w-full appearance-none h-7 rounded border border-border bg-secondary/30 px-2 pr-6 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {ACTION_OPTIONS.map(a => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                              </div>
                              <p className="text-[10px] text-orange-600/80 dark:text-orange-300/80">↳ {actionLabel(rule.action)}</p>
                            </div>
                          </div>

                          {/* Live preview */}
                          <div className="px-3 pb-3">
                            <AlertRulePreview rule={rule} className="mt-0" />
                          </div>
                        </div>
                      </SortableRuleCard>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" onClick={handleSaveRules} disabled={isSavingRules}
                className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                {isSavingRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSavingRules ? 'Saving…' : 'Save Alert Rules'}
              </Button>
              {rulesUnsaved && !isSavingRules && (
                <span className="text-[11px] text-amber-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  Unsaved order — click Save to persist
                </span>
              )}
            </div>
          </div>

          {/* ── Simulate Alert ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <Zap className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Real-time Alert Pipeline Test</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Insert a test incident to verify Supabase Realtime and your alert routing rules fire end-to-end.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-orange-700/30 bg-orange-950/20 p-4">
              <SimulateAlertDialog />
            </div>
          </div>

          {/* ── Demo mode info ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 icon-blue mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground">Demo Mode</h3>
                <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                  Without Splunk credentials, SentinelOps uses bundled sample incidents (INC-1001–1005).
                  All AI analysis, follow-up chat, NL→SPL, and export features work fully in demo mode.
                  If no LLM API key is configured, analysis falls back to the platform's Gemini gateway.
                </p>
              </div>
            </div>
          </div>

          {/* ── MTTR Threshold Alert ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  MTTR Threshold Alert
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Show a warning banner on Dashboard and Analytics when the 7-day rolling MTTR exceeds this value.
                </p>
              </div>
              <button
                onClick={() => setMttrEnabled(v => !v)}
                className={cn(
                  'relative shrink-0 h-5 w-9 rounded-full border transition-colors',
                  mttrEnabled ? 'bg-primary border-primary' : 'bg-secondary border-border'
                )}
                aria-pressed={mttrEnabled}
                title={mttrEnabled ? 'Disable MTTR alert' : 'Enable MTTR alert'}
              >
                <span className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  mttrEnabled ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-normal text-muted-foreground">Threshold (minutes)</label>
                <Input
                  type="number"
                  min={1} max={1440}
                  value={mttrThreshold}
                  onChange={e => setMttrThreshold(e.target.value)}
                  disabled={!mttrEnabled}
                  className="h-9 text-sm"
                  placeholder="60"
                />
              </div>
              <Button
                size="sm"
                onClick={saveMttrConfig}
                disabled={savingMttr}
                className="h-9 px-4 text-xs"
              >
                {savingMttr ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {mttrEnabled && (
              <p className="text-[11px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Alert fires when 7-day MTTR &gt; {mttrThreshold || '?'} min
              </p>
            )}
          </div>

          {/* ── Auto-Resolve Rule ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Auto-Resolve Rule
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically close OPEN / INVESTIGATING incidents that have had no updates for the configured duration.
                </p>
              </div>
              <button
                onClick={() => setAutoResolveEnabled(v => !v)}
                className={cn(
                  'relative shrink-0 h-5 w-9 rounded-full border transition-colors',
                  autoResolveEnabled ? 'bg-primary border-primary' : 'bg-secondary border-border'
                )}
                aria-pressed={autoResolveEnabled}
                title={autoResolveEnabled ? 'Disable auto-resolve' : 'Enable auto-resolve'}
              >
                <span className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  autoResolveEnabled ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-normal text-muted-foreground">Stale timeout (hours)</label>
                <Input
                  type="number"
                  min={1} max={168}
                  value={autoResolveHours}
                  onChange={e => setAutoResolveHours(e.target.value)}
                  disabled={!autoResolveEnabled}
                  className="h-9 text-sm"
                  placeholder="4"
                />
              </div>
              <Button
                size="sm"
                onClick={saveAutoResolveConfig}
                disabled={savingAutoResolve}
                className="h-9 px-4 text-xs"
              >
                {savingAutoResolve ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {autoResolveEnabled && (
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <p className="text-[11px] text-muted-foreground">
                  Incidents stale for &gt;{autoResolveHours || '?'}h will be auto-resolved.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runAutoResolveNow}
                  disabled={runningAutoResolve}
                  className="h-7 px-3 text-[11px] gap-1.5"
                >
                  <RefreshCw className={cn('h-3 w-3', runningAutoResolve && 'animate-spin')} />
                  {runningAutoResolve ? 'Running…' : 'Run now'}
                </Button>
              </div>
            )}
          </div>

          {/* ── Account info ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-3">
            <div className="shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary uppercase">{(profile?.username ?? 'U')[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{profile?.username ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{profile?.role ?? 'user'} · {profile?.email ?? ''}</p>
            </div>
          </div>

          {/* Disconnect */}
          {isLive && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm"
                onClick={() => { updateConfig({ splunkHost: '', splunkToken: '', mode: 'demo', lastConnectedAt: null }); toast.info('Switched to Demo Mode'); }}
                className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5">
                <WifiOff className="h-3.5 w-3.5" />Disconnect & use demo mode
              </Button>
            </div>
          )}

          </div>
          {/* ── END RIGHT COLUMN ─────────────────────────────────────────── */}

          </div>
          {/* ── END Two-column grid ─────────────────────────────────────── */}

        </div>
      </div>
    </div>
  );
}

