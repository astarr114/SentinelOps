import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSplunk } from '@/contexts/SplunkContext';
import { useLlm } from '@/contexts/LlmContext';
import { useLiveAlerts } from '@/hooks/useLiveAlerts';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { IncidentList } from '@/components/incident/IncidentList';
import { IncidentDetail } from '@/components/incident/IncidentDetail';
import { FollowUpPanel } from '@/components/incident/FollowUpPanel';
import { ToolsPanel } from '@/components/incident/ToolsPanel';
import { AlertBanner } from '@/components/AlertBanner';
import { MttrWarningBanner } from '@/components/MttrWarningBanner';
import { useAppConfig } from '@/hooks/useAppConfig';
import { SimulateAlertDialog } from '@/components/SimulateAlertDialog';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { getIncidents } from '@/lib/mockDataService';
import type { Incident, AnalysisResult } from '@/types/types';
import type { RuntimeTrace } from '@/components/incident/RuntimeEvidencePanel';
import { AnalysisSourceBadge, ReasoningSourceBadge } from '@/components/incident/AnalysisSourceBadge';
import { PagerDutyStatusPanel } from '@/components/PagerDutyStatusPanel';
import {
  LogOut, Menu, MessageSquare, Wrench, User, Settings, Database, Radio,
  Keyboard, Sun, Moon, RefreshCw, BarChart2, History, AlertTriangle,
  Zap, GitMerge, BookOpen, RotateCcw, ShieldCheck, Brain, Lock, FileText,
  Target, Sparkles, Cpu, ChevronDown, ChevronRight, PlayCircle, CheckCircle2, FlaskConical,
  MoreHorizontal, LayoutDashboard, Map, WifiOff, BrainCircuit, Server, Info,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

type RightPanel = 'followup' | 'tools' | 'pd';

export default function DashboardPage() {
  const { profile, signOut } = useAuth();
  const { isLive, isMcp, isRest, isConfigLoading, isHostedModelActive, config: splunkConfig } = useSplunk();
  const { activeLlm, buildFallbackChain } = useLlm();
  const { theme, toggleTheme } = useTheme();
  const { config: appConfig } = useAppConfig();
  const staticIncidents = getIncidents();
  const [searchParams] = useSearchParams();

  // -- Live incidents from DB (simulated + real-time) ------------------------
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const liveChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Helper: map a DB row to an Incident object
  const rowToIncident = (r: Record<string, unknown>): Incident => ({
    id:           r.id as string,
    title:        r.title as string,
    service:      (r.service as string) ?? 'unknown',
    severity:     (r.severity as Incident['severity']) ?? 'HIGH',
    status:       ((r.status ?? 'OPEN') as Incident['status']),
    opened_at:    r.opened_at as string,
    resolved_at:  (r.resolved_at as string | null) ?? null,
    summary:      (r.summary as string) ?? '',
    time_window:  (r.time_window as string) ?? 'last_30m',
    is_synthetic: true,
  });

  useEffect(() => {
    // Load all live_incidents rows on mount (no status filter — we need RESOLVED too)
    supabase
      .from('live_incidents')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setLiveIncidents(data.map(rowToIncident));
        }
      });

    // Subscribe to INSERT and UPDATE so resolved incidents disappear instantly
    const channel = supabase
      .channel('live-incidents-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_incidents' },
        (payload) => {
          const inc = rowToIncident(payload.new as Record<string, unknown>);
          setLiveIncidents(prev => {
            if (prev.find(i => i.id === inc.id)) return prev;
            return [inc, ...prev];
          });
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_incidents' },
        (payload) => {
          const updated = rowToIncident(payload.new as Record<string, unknown>);
          setLiveIncidents(prev =>
            prev.map(i => i.id === updated.id ? updated : i)
          );
        }
      )
      .subscribe();
    liveChannelRef.current = channel;
    return () => { channel.unsubscribe(); };
  // rowToIncident is defined in render scope — intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Auto-refresh interval --------------------------------------------------
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    try { return Number(localStorage.getItem('sentinel_refresh_interval') ?? '0'); } catch { return 0; }
  });
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLiveIncidents = () => {
    supabase
      .from('live_incidents')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setLiveIncidents(data.map(rowToIncident));
        }
      });
  };

  // Called when an incident card's "Mark as Resolved" succeeds
  const handleResolveIncident = (id: string) => {
    const now = new Date().toISOString();
    setLiveIncidents(prev => {
      const exists = prev.find(i => i.id === id);
      if (exists) {
        // Update in-place
        return prev.map(i => i.id === id ? { ...i, status: 'RESOLVED' as Incident['status'], resolved_at: now } : i);
      }
      // Static incident not yet in liveIncidents — upsert so it becomes RESOLVED in merged list
      const staticInc = staticIncidents.find(s => s.id === id);
      if (staticInc) {
        return [{ ...staticInc, status: 'RESOLVED' as Incident['status'], resolved_at: now, is_synthetic: true }, ...prev];
      }
      return prev;
    });
    // Deselect if it was the selected incident (it will vanish from the filtered list)
    setSelectedId(prev => prev === id ? null : prev);
  };

  // Called after bulk resolve to mark resolved incidents in live list (upserts statics too)
  const handleBulkResolveIncidents = (ids: string[]) => {
    const now = new Date().toISOString();
    setLiveIncidents(prev => {
      const liveUpdated = prev.map(i =>
        ids.includes(i.id) ? { ...i, status: 'RESOLVED' as Incident['status'], resolved_at: now } : i
      );
      // Any ids not yet in liveIncidents (static) — upsert them
      const liveIds = new Set(liveUpdated.map(i => i.id));
      const newEntries: Incident[] = [];
      for (const id of ids) {
        if (!liveIds.has(id)) {
          const staticInc = staticIncidents.find(s => s.id === id);
          if (staticInc) {
            newEntries.push({ ...staticInc, status: 'RESOLVED' as Incident['status'], resolved_at: now, is_synthetic: true });
          }
        }
      }
      return [...newEntries, ...liveUpdated];
    });
    // Deselect if currently selected incident was bulk-resolved
    setSelectedId(prev => (prev && ids.includes(prev)) ? null : prev);
  };

  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (refreshInterval > 0) {
      refreshTimerRef.current = setInterval(fetchLiveIncidents, refreshInterval * 1000);
    }
    try { localStorage.setItem('sentinel_refresh_interval', String(refreshInterval)); } catch { /* ignore */ }
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval]);

  const incidents: Incident[] = [
    ...liveIncidents,
    ...staticIncidents.filter(s => !liveIncidents.find(l => l.id === s.id)),
  ];

  // -- 7-day rolling MTTR (for MTTR alert banner) ----------------------------
  const sevenDayMttr = (() => {
    const cutoff = Date.now() - 7 * 24 * 3_600_000;
    const resolved = incidents.filter(i =>
      i.status === 'RESOLVED' && i.resolved_at &&
      new Date(i.resolved_at).getTime() >= cutoff
    );
    if (resolved.length === 0) return null;
    const total = resolved.reduce((sum, i) => {
      const opened   = new Date(i.opened_at).getTime();
      const resolved = new Date(i.resolved_at!).getTime();
      return sum + Math.max(0, resolved - opened);
    }, 0);
    return Math.round(total / resolved.length / 60_000);
  })();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<(AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace; fromCache?: boolean }) | null>(null);
  // Explicit live-error state: populated when MCP/REST fails and user hasn't opted into demo
  const [liveError, setLiveError] = useState<{ mode: 'error-mcp' | 'error-rest'; message: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Streaming state: brief text typed out token-by-token while LLM responds
  const [streamingBrief, setStreamingBrief] = useState<string>('');
  const [streamStep, setStreamStep] = useState<'idle' | 'evidence' | 'streaming' | 'done'>('idle');
  const [streamStopReason, setStreamStopReason] = useState<string>('');
  // Live token count + estimated cost during streaming
  const [streamTokens, setStreamTokens] = useState(0);
  // Auto-save draft banner — shown when a page-refresh interrupted a prior stream
  const [draftRestoreId, setDraftRestoreId] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('tools');
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [judgeDemoOpen, setJudgeDemoOpen] = useState(false);
  const [judgeDemoRunning, setJudgeDemoRunning] = useState(false);
  const [judgeDemoStep, setJudgeDemoStep] = useState(0);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Stable callback refs — break the circular dependency between
  // handleSelectIncident (needs bannerAlerts) and useLiveAlerts (needs handleSelectIncident).
  const selectCallbackRef   = useRef<(id: string) => void>(() => {});
  const highlightCallbackRef = useRef<(id?: string) => void>(() => {});
  const bannerAlertsRef      = useRef<import('@/hooks/useLiveAlerts').LiveIncident[]>([]);

  // -- Live alerts hook — must be called before handleSelectIncident so
  //    bannerAlerts is available for the race-condition guard below ----------
  const {
    bannerAlerts, dismissAlert,
    notifications, unreadCount, markAllRead, clearNotifications,
  } = useLiveAlerts(
    (id) => selectCallbackRef.current(id),
    (id) => highlightCallbackRef.current(id),
  );

  // Keep bannerAlertsRef in sync so handleSelectIncident can read it without
  // re-creating itself on every bannerAlerts update.
  useEffect(() => { bannerAlertsRef.current = bannerAlerts; }, [bannerAlerts]);

  // Deep-link: read ?nlq and ?service from URL on mount
  const deepLinkQuery   = searchParams.get('nlq')     ?? undefined;
  const deepLinkService = searchParams.get('service') ?? undefined;

  const selectedIncident = incidents.find(i => i.id === selectedId) ?? null;

  const handleSelectIncident = useCallback((id: string) => {
    setSelectedId(id);
    setAnalysis(null);
    setLiveError(null);
    setStreamingBrief('');
    setStreamStep('idle');
    setStreamStopReason('');
    setMobileLeftOpen(false);
    setHighlightedIds(prev => { const n = new Set(prev); n.delete(id); return n; });

    // Check for a saved draft from a previous interrupted stream
    const draft = loadDraft(id);
    if (draft) {
      setDraftRestoreId(id);
    }

    // Race-condition guard: if this id isn't yet in liveIncidents or staticIncidents
    // (can happen when the user clicks "View" on a banner alert before the Realtime
    // INSERT propagates to the live-incidents-list channel), synthesise a minimal
    // incident entry from the banner so the detail panel opens immediately.
    setLiveIncidents(prev => {
      if (prev.find(i => i.id === id)) return prev;
      if (staticIncidents.find(i => i.id === id)) return prev;
      const banner = bannerAlertsRef.current.find(a => a.id === id);
      if (!banner) return prev;
      const synth: Incident = {
        id:           banner.id,
        title:        banner.title,
        service:      banner.service,
        severity:     banner.severity,
        status:       (banner.status ?? 'OPEN') as Incident['status'],
        opened_at:    banner.opened_at,
        summary:      banner.summary ?? '',
        time_window:  'last_30m',
        is_synthetic: true,
      };
      return [synth, ...prev];
    });
  }, [staticIncidents]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep stable ref callbacks pointing at latest functions
  useEffect(() => { selectCallbackRef.current = handleSelectIncident; }, [handleSelectIncident]);

  const handleHighlight = useCallback((incidentId?: string) => {
    if (incidentId) {
      setHighlightedIds(prev => new Set([...prev, incidentId]));
      setTimeout(() => setHighlightedIds(prev => { const n = new Set(prev); n.delete(incidentId!); return n; }), 8000);
    }
  }, []);

  useEffect(() => { highlightCallbackRef.current = handleHighlight; }, [handleHighlight]);

  // -- Keyboard shortcuts ----------------------------------------------------
  const handleKeyNav = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const ids = incidents.map(i => i.id);
    const idx = selectedId ? ids.indexOf(selectedId) : -1;
    const currentIncident = selectedId ? incidents.find(i => i.id === selectedId) ?? null : null;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = ids[Math.min(idx + 1, ids.length - 1)];
      if (next) handleSelectIncident(next);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = ids[Math.max(idx - 1, 0)];
      if (prev) handleSelectIncident(prev);
    } else if ((e.key === 'Enter' || e.key === ' ') && currentIncident && !analyzing) {
      e.preventDefault();
      handleAnalyze();
    } else if (e.key === 'Escape') {
      setSelectedId(null);
      setAnalysis(null);
    } else if (e.key === 'f' || e.key === 'F') {
      setRightPanel('followup');
    } else if (e.key === 't' || e.key === 'T') {
      setRightPanel('tools');
    } else if (e.key === 'd' || e.key === 'D') {
      setJudgeDemoOpen(prev => !prev);
    }
  }, [incidents, selectedId, analyzing]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [handleKeyNav]);

  // -- Rate-limit error detection ---------------------------------------------
  const isRateLimitError = (msg: string) =>
    /rate.?limit|too many request|request limit|quota|429|RATE_LIMIT:/i.test(msg) ||
    msg.includes('All LLM providers failed');

  // -- Cost-per-token map ($ per 1k output tokens, approximate) --------------
  const COST_PER_1K: Record<string, number> = {
    gemini:    0.00035, // Gemini 2.5 Flash
    openai:    0.002,   // GPT-4o-mini
    anthropic: 0.003,   // Claude 3 Haiku
    grok:      0.001,
    deepseek:  0.00028,
  };
  const estimateCost = (tokens: number) => {
    const rate = COST_PER_1K[activeLlm?.provider ?? 'gemini'] ?? 0.001;
    return ((tokens / 1000) * rate).toFixed(4);
  };

  // -- DB cache helpers -------------------------------------------------------
  const { cacheTtlMinutes, maxTokenBudget } = useLlm();
  const cacheTtlMs = (cacheTtlMinutes ?? 30) * 60 * 1000;

  // -- Analysis draft helpers (localStorage auto-save / restore) -------------
  const draftKey = (incidentId: string) => `sentinelops_draft_${incidentId}`;

  const saveDraft = (incidentId: string, partial: object, tokens: number, brief: string) => {
    try {
      localStorage.setItem(draftKey(incidentId), JSON.stringify({
        analysis: partial,
        tokens,
        brief,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* storage quota — non-critical */ }
  };

  const loadDraft = (incidentId: string) => {
    try {
      const raw = localStorage.getItem(draftKey(incidentId));
      if (!raw) return null;
      return JSON.parse(raw) as { analysis: object; tokens: number; brief: string; savedAt: string };
    } catch { return null; }
  };

  const clearDraft = (incidentId: string) => {
    try { localStorage.removeItem(draftKey(incidentId)); } catch { /* ignore */ }
  };

  const loadFromCache = async (incidentId: string) => {
    const { data } = await supabase
      .from('incident_analyses')
      .select('analysis_result, splunk_mode, created_at')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.analysis_result) return null;
    const age = Date.now() - new Date(data.created_at).getTime();
    if (age > cacheTtlMs) return null;
    return { ...(data.analysis_result as AnalysisResult & { aiBrief?: Record<string, string>; runtimeTrace?: RuntimeTrace }), splunkMode: data.splunk_mode, fromCache: true, cachedAt: data.created_at };
  };

  const saveToCache = async (
    incidentId: string,
    result: AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace },
  ) => {
    if (!profile) return;
    const { splunkMode, fromCache, ...payload } = result as typeof result & { fromCache?: boolean };
    await supabase.from('incident_analyses').insert({
      user_id:        profile.id,
      incident_id:    incidentId,
      incident_title: selectedIncident?.title ?? '',
      service:        selectedIncident?.service ?? '',
      severity:       selectedIncident?.severity ?? '',
      splunk_mode:    splunkMode ?? 'demo',
      analysis_result: payload,
    });
  };

  // -- Main analyze handler (streaming + cache) -------------------------------
  const handleAnalyze = async (forceRefresh = false, forceDemoMode = false) => {
    if (!selectedIncident) return;

    setAnalyzing(true);
    setAnalysis(null);
    setLiveError(null);
    setStreamingBrief('');
    setStreamStep('idle');
    setStreamStopReason('');
    setStreamTokens(0);
    setDraftRestoreId(null);

    // Clear any pre-existing draft for this incident (we are starting fresh)
    clearDraft(selectedIncident.id);

    try {
      // 1. Cache check (skip when user explicitly requests re-analysis)
      if (!forceRefresh) {
        const cached = await loadFromCache(selectedIncident.id);
        if (cached) {
          setAnalysis(cached);
          setStreamStep('done');
          setRightPanel('followup');
          toast.success('Analysis loaded from cache', {
            description: `Cached ${Math.round((Date.now() - new Date((cached as { cachedAt?: string }).cachedAt ?? 0).getTime()) / 60000)}m ago`,
            action: { label: 'Re-analyze', onClick: () => handleAnalyze(true) },
          });
          return;
        }
      }

      // 2. Fire streaming request — send all Splunk + reasoning credentials
      setStreamStep('evidence');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/incident-analyze`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey:         import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            incidentId:           selectedIncident.id,
            service:              selectedIncident.service,
            timeWindow:           selectedIncident.time_window,
            incidentTitle:        selectedIncident.title,
            incidentSummary:      selectedIncident.summary,
            incidentSeverity:     selectedIncident.severity,
            incidentEndpoints:    selectedIncident.affected_endpoints ?? [],
            // LLM fields
            llmProvider:          activeLlm.provider,
            llmApiKey:            activeLlm.apiKey,
            llmModel:             activeLlm.modelId,
            llmFallbackChain:     buildFallbackChain(),
            // Splunk REST fields
            splunkHost:           splunkConfig.splunkHost  || undefined,
            splunkToken:          splunkConfig.splunkToken || undefined,
            // Splunk MCP fields
            mcpUrl:               splunkConfig.splunkMcpUrl      || undefined,
            mcpToken:             splunkConfig.splunkMcpToken     || undefined,
            mcpAuthMethod:        splunkConfig.mcpAuthMethod      || 'bearer',
            mcpUsername:          splunkConfig.splunkMcpUsername  || undefined,
            mcpPassword:          splunkConfig.splunkMcpPassword  || undefined,
            // Reasoning provider fields
            reasoningProvider:    splunkConfig.reasoningProvider  || 'gemini',
            splunkHostedModelEndpoint: splunkConfig.splunkHostedModelEndpoint || undefined,
            splunkHostedModelToken:    splunkConfig.splunkHostedModelToken    || undefined,
            // Force demo override (user chose "Switch to demo" after live failure)
            forceDemoMode:        forceDemoMode || undefined,
            stream: true,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      // 3. Process SSE stream
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && res.body) {
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let partialAnalysis: (AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace }) | null = null;
        let briefAccum = '';
        let runningTokens = 0;
        let budgetHit = false;

        const incidentIdForDraft = selectedIncident.id;
        if (autoSaveRef.current) clearInterval(autoSaveRef.current);
        autoSaveRef.current = setInterval(() => {
          if (partialAnalysis) saveDraft(incidentIdForDraft, partialAnalysis, runningTokens, briefAccum);
        }, 30_000);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const evt = JSON.parse(raw) as { type: string; data: unknown };

              if (evt.type === 'metadata') {
                partialAnalysis = evt.data as typeof partialAnalysis;
                setAnalysis(partialAnalysis);
                setRightPanel('followup');
                setStreamStep('streaming');

              } else if (evt.type === 'token') {
                const token = evt.data as string;
                briefAccum += token;
                setStreamingBrief(briefAccum);
                const newTokens = Math.ceil(token.length / 4);
                runningTokens += newTokens;
                setStreamTokens(runningTokens);

                if (runningTokens >= maxTokenBudget && !budgetHit) {
                  budgetHit = true;
                  reader.cancel().catch(() => {});
                  if (autoSaveRef.current) { clearInterval(autoSaveRef.current); autoSaveRef.current = null; }
                  clearDraft(incidentIdForDraft);
                  const reason = `Analysis stopped at token limit (${runningTokens.toLocaleString()} tokens)`;
                  setStreamStopReason(reason);
                  setStreamingBrief('');
                  setStreamStep('done');
                  if (partialAnalysis) {
                    const partial = {
                      ...(partialAnalysis as AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace }),
                      aiBrief: { executiveSummary: briefAccum },
                    };
                    setAnalysis(partial);
                    saveToCache(selectedIncident.id, partial).catch(() => {});
                  }
                  toast.warning('Token budget reached', {
                    description: reason,
                    duration: 6000,
                    action: { label: 'Increase budget →', onClick: () => window.location.href = '/settings#llm-settings-section' },
                  });
                  break;
                }

              } else if (evt.type === 'done') {
                const final = evt.data as AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace };
                if (autoSaveRef.current) { clearInterval(autoSaveRef.current); autoSaveRef.current = null; }
                clearDraft(incidentIdForDraft);
                setAnalysis(final);
                setStreamingBrief('');
                setStreamStep('done');

                // -- Explicit mode handling (no silent fallback) --------
                const mode = final.splunkMode ?? 'demo';
                if (mode === 'error-mcp' || mode === 'error-rest') {
                  // Live attempt failed — surface error, do NOT replace with demo silently
                  const errorMsg = final.runtimeTrace?.errorMessage ?? `${mode === 'error-mcp' ? 'MCP' : 'REST'} connection failed`;
                  setLiveError({ mode, message: errorMsg });
                  setAnalysis(null);
                  setStreamStep('idle');
                  toast.error(`Live Splunk ${mode === 'error-mcp' ? 'MCP' : 'REST'} failed`, {
                    description: errorMsg.slice(0, 180),
                    duration: 10000,
                    action: { label: 'Open Settings', onClick: () => window.location.href = '/settings' },
                  });
                } else {
                  const modeLabel =
                    mode === 'live-mcp'  ? '(Live · Splunk MCP)'  :
                    mode === 'live-rest' ? '(Live · Splunk REST)' :
                    mode === 'mcp'       ? '(Live · Splunk MCP)'  :
                    mode === 'live'      ? '(Live · Splunk REST)' : '(Demo data)';
                  toast.success(`Analysis complete — AI brief ready ${modeLabel}`);
                  saveToCache(selectedIncident.id, final).catch(() => {});
                }

              } else if (evt.type === 'live_error') {
                // Edge function returned an explicit live_error event
                const errData = evt.data as { mode: 'error-mcp' | 'error-rest'; message: string };
                if (autoSaveRef.current) { clearInterval(autoSaveRef.current); autoSaveRef.current = null; }
                clearDraft(selectedIncident.id);
                setLiveError(errData);
                setAnalysis(null);
                setStreamStep('idle');
                toast.error(`Live Splunk ${errData.mode === 'error-mcp' ? 'MCP' : 'REST'} failed`, {
                  description: errData.message.slice(0, 180),
                  duration: 10000,
                  action: { label: 'Open Settings', onClick: () => window.location.href = '/settings' },
                });

              } else if (evt.type === 'error') {
                throw new Error(String(evt.data));
              }
            } catch (parseErr) { /* skip malformed line */ }
          }
          if (budgetHit) break;
        }
      } else {
        // Fallback: non-streaming JSON response
        const data = await res.json() as AnalysisResult & { aiBrief?: Record<string, string>; splunkMode?: string; runtimeTrace?: RuntimeTrace; error?: string };
        if (data.error) throw new Error(data.error);
        const mode = data.splunkMode ?? 'demo';
        if (mode === 'error-mcp' || mode === 'error-rest') {
          setLiveError({ mode, message: data.runtimeTrace?.errorMessage ?? `${mode} failed` });
        } else {
          setAnalysis(data);
          setStreamStep('done');
          setRightPanel('followup');
          const modeLabel =
            mode === 'live-mcp'  ? '(Live · Splunk MCP)'  :
            mode === 'live-rest' ? '(Live · Splunk REST)' : '(Demo data)';
          toast.success(`Analysis complete — AI brief ready ${modeLabel}`);
          saveToCache(selectedIncident.id, data).catch(() => {});
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Analysis error:', err);
      setStreamStep('idle');

      if (isRateLimitError(msg)) {
        toast.error('LLM rate limit reached', {
          description: 'The shared gateway is throttled. Add your own API key to use your quota.',
          duration: 8000,
          action: { label: 'Open LLM Settings →', onClick: () => window.location.href = '/settings#llm-settings-section' },
        });
      } else {
        toast.error('Analysis failed', { description: msg.slice(0, 200) });
      }
    } finally {
      if (autoSaveRef.current) { clearInterval(autoSaveRef.current); autoSaveRef.current = null; }
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">

      {/* Real-time critical incident alert banner */}
      <AlertBanner
        alerts={bannerAlerts}
        onDismiss={dismissAlert}
        onSelect={handleSelectIncident}
      />
      {/* MTTR threshold warning banner */}
      {appConfig.mttr_threshold_enabled && (
        <MttrWarningBanner
          currentMttrMinutes={sevenDayMttr}
          thresholdMinutes={appConfig.mttr_threshold_minutes}
        />
      )}

      {/* ── Judge-safe architecture status bar ───────────────────────────── */}
      {!isConfigLoading && (
        <div className="shrink-0 border-b border-border/60 bg-secondary/20 px-4 py-1.5 flex items-center gap-3 flex-wrap">
          {/* Live Splunk Evidence status */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground/70">Evidence:</span>
            {isLive && isMcp ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                LIVE · SPLUNK MCP
              </span>
            ) : isLive && isRest ? (
              <span className="flex items-center gap-1 text-blue-400 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                LIVE · SPLUNK REST
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400/80">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 shrink-0" />
                DEMO MODE
              </span>
            )}
          </div>

          <span className="text-border/60 select-none">·</span>

          {/* Splunk Hosted Model status */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <FlaskConical className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground/70">Splunk Hosted Model:</span>
            {isHostedModelActive ? (
              <span className="flex items-center gap-1 text-orange-400 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                ON
              </span>
            ) : (
              <span className="text-muted-foreground/60">OFF</span>
            )}
          </div>

          <span className="text-border/60 select-none">·</span>

          {/* Current reasoning provider */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <BrainCircuit className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground/70">Reasoning:</span>
            <span className={cn(
              'font-semibold',
              isHostedModelActive ? 'text-orange-400' : 'text-blue-400',
            )}>
              {isHostedModelActive
                ? 'SPLUNK HOSTED MODEL'
                : (splunkConfig.reasoningProvider === 'splunk-hosted-model' ? 'GEMINI (fallback — hosted model not configured)' : 'GEMINI')}
            </span>
          </div>

          <span className="flex-1 min-w-0" />

          {/* Link to settings */}
          <Link
            to="/settings#reasoning-provider-section"
            className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="Configure evidence and reasoning providers"
          >
            <Info className="h-3 w-3" />
            <span className="hidden md:inline">Configure layers</span>
          </Link>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3 z-30">
        {/* Mobile left panel toggle */}
        <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="lg:hidden h-8 w-8 p-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
            <IncidentList incidents={incidents} selectedId={selectedId} onSelect={handleSelectIncident} onResolve={handleResolveIncident} onBulkResolve={handleBulkResolveIncidents} highlightedIds={highlightedIds} />
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="https://miaoda-conversation-file.s3cdn.medo.dev/user-b8uq3eatai9u/app-bs8qtod6o9hd/20260527/SentinelOps logo Final.png"
            alt="SentinelOps"
            className="h-8 w-8 object-contain shrink-0"
          />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>

        {/* Live/Demo/REST mode indicator + last-verified timestamp */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Link
            to="/settings"
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1.5 rounded-md border transition-all',
              isLive && isMcp
                ? 'mode-live'
                : isLive && isRest
                  ? 'bg-blue-950/40 border-blue-600/40 text-blue-300 hover:border-blue-500/60'
                  : isConfigLoading
                    ? 'bg-secondary/30 border-border/50 text-muted-foreground/40'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
            )}
            title={
              isLive && isMcp
                ? `Live · MCP: ${splunkConfig.splunkHost || splunkConfig.splunkMcpUrl}`
                : isLive && isRest
                  ? `Live · REST: ${splunkConfig.splunkHost}`
                  : isConfigLoading
                    ? 'Loading configuration…'
                    : 'Demo mode — click to configure Splunk'
            }
          >
            {isConfigLoading
              ? <><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />LOADING</>
              : isLive && isMcp
                ? <><Radio className="h-2.5 w-2.5 animate-pulse" />LIVE · MCP</>
                : isLive && isRest
                  ? <><Radio className="h-2.5 w-2.5 animate-pulse text-blue-400" />LIVE · REST</>
                  : <><WifiOff className="h-2.5 w-2.5" />DEMO</>
            }
          </Link>
          {/* Last verified timestamp */}
          {isLive && splunkConfig.lastLiveVerifiedAt && (
            <span
              className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-green-400/80 px-1.5 py-1 rounded border border-green-700/30 bg-green-950/20"
              title={`Connection verified at ${new Date(splunkConfig.lastLiveVerifiedAt).toLocaleString()}`}
            >
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
              {(() => {
                const diffMs = Date.now() - new Date(splunkConfig.lastLiveVerifiedAt).getTime();
                const diffMin = Math.floor(diffMs / 60000);
                if (diffMin < 1)  return 'verified just now';
                if (diffMin < 60) return `verified ${diffMin}m ago`;
                const diffH = Math.floor(diffMin / 60);
                return `verified ${diffH}h ago`;
              })()}
            </span>
          )}
        </div>

        {/* MCP status pill */}
        <Link
          to="/settings"
          className={cn(
            'hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1.5 rounded-md border transition-all',
            isMcp
              ? 'bg-purple-950/30 border-purple-600/40 text-purple-300 hover:border-purple-500/60'
              : 'bg-secondary/30 border-border/50 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80'
          )}
          title={
            isMcp
              ? [
                  splunkConfig.mcpServerName ? `MCP: ${splunkConfig.mcpServerName}` : 'MCP Server connected',
                  splunkConfig.mcpServerVersion ? `v${splunkConfig.mcpServerVersion}` : '',
                  splunkConfig.mcpToolList?.length ? `${splunkConfig.mcpToolList.length} tools` : '',
                ].filter(Boolean).join(' · ')
              : 'MCP Server not configured — click to configure'
          }
        >
          <Cpu className="h-2.5 w-2.5 shrink-0" />
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', isMcp ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.8)] animate-pulse' : 'bg-muted-foreground/40')} />
          <span className="hidden md:inline">MCP</span>
        </Link>

        <div className="flex-1 min-w-0" />

        {/* Right panel toggle (visible when incident selected) */}
        {selectedIncident && (
          <div className="hidden md:flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-secondary/40">
            {([
              { key: 'tools',    icon: Wrench,        label: 'Tools'     },
              { key: 'followup', icon: MessageSquare,  label: 'Follow-up' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setRightPanel(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all',
                  rightPanel === key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3 w-3" />{label}
                {key === 'followup' && analysis && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* - Right action cluster - */}
        <div className="flex items-center gap-1">

          {/* Judge Demo Mode button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setJudgeDemoOpen(true)}
            className="hidden md:flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 border border-amber-700/40 hover:border-amber-600/60 rounded-md"
            title="Judge Demo Mode — one-click walkthrough with sample data"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Demo</span>
          </Button>

          {/* Simulate alert */}
          <SimulateAlertDialog compact />

          {/* Notifications */}
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onClear={clearNotifications}
            onSelectIncident={handleSelectIncident}
          />

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* - Navigate dropdown — all page links - */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex h-8 items-center gap-1 px-2 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                title="Navigate to a page"
              >
                <LayoutDashboard className="h-4 w-4" />
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Core</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-3.5 w-3.5" />Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/analytics" className="flex items-center gap-2 cursor-pointer">
                  <BarChart2 className="h-3.5 w-3.5" />Analytics
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/history" className="flex items-center gap-2 cursor-pointer">
                  <History className="h-3.5 w-3.5" />Incident History
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Intelligence</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/risk" className="flex items-center gap-2 cursor-pointer">
                  <Zap className="h-3.5 w-3.5" />Predictive Risk
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/correlation" className="flex items-center gap-2 cursor-pointer">
                  <GitMerge className="h-3.5 w-3.5" />Correlation Graph
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/learning" className="flex items-center gap-2 cursor-pointer">
                  <Brain className="h-3.5 w-3.5" />Incident Learning
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/command" className="flex items-center gap-2 cursor-pointer">
                  <Sparkles className="h-3.5 w-3.5" />AI Command Center
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Operations</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/remediation" className="flex items-center gap-2 cursor-pointer">
                  <RotateCcw className="h-3.5 w-3.5" />Auto-Remediation
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/guardrails" className="flex items-center gap-2 cursor-pointer">
                  <ShieldCheck className="h-3.5 w-3.5" />Policy Guardrails
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/journal" className="flex items-center gap-2 cursor-pointer">
                  <BookOpen className="h-3.5 w-3.5" />Decision Journal
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/optimizer" className="flex items-center gap-2 cursor-pointer">
                  <Target className="h-3.5 w-3.5" />Optimizer
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/audit" className="flex items-center gap-2 cursor-pointer">
                  <Lock className="h-3.5 w-3.5" />Audit Trail
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/compliance" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-3.5 w-3.5" />Compliance Packs
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* - More / tools dropdown - */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                title="More options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Keyboard Shortcuts</DropdownMenuLabel>
              {([
                ['j / ↓',  'Next incident'],
                ['k / ↑',  'Prev incident'],
                ['Enter',  'Analyze'],
                ['t',      'Tools panel'],
                ['f',      'Follow-up'],
                ['Esc',    'Deselect'],
              ] as const).map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between px-2 py-1">
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                  <kbd className="text-[10px] font-mono bg-secondary border border-border rounded px-1.5 py-0.5 text-foreground shrink-0">{key}</kbd>
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings#e2e" className="flex items-center gap-2 cursor-pointer">
                  <FlaskConical className="h-3.5 w-3.5" />Run E2E MCP Test
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Map className="h-3.5 w-3.5" />View MCP Tool Map
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User pill + sign out */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/40 border border-border">
            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-2.5 w-2.5 text-primary" />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">{profile?.username ?? 'anonymous'}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="h-8 gap-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent hover:border-sidebar-border"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* - Judge Demo Mode dialog - */}
      <Dialog open={judgeDemoOpen} onOpenChange={setJudgeDemoOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !judgeDemoRunning) {
              e.preventDefault();
              // Trigger the Run button programmatically by finding and clicking it
              (e.currentTarget.querySelector('[data-judge-run]') as HTMLButtonElement | null)?.click();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <PlayCircle className="h-5 w-5" />
              Judge Demo Mode
            </DialogTitle>
            <DialogDescription>
              One-click walkthrough using the pre-configured demo incident (checkout-service latency spike).
              No Splunk credentials required — all evidence is sourced from realistic embedded data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Keyboard shortcut hint */}
            <p className="text-[10px] text-muted-foreground font-mono text-center">
              Press <kbd className="px-1 py-0.5 rounded border border-border bg-secondary text-[9px]">D</kbd> to toggle this dialog · <kbd className="px-1 py-0.5 rounded border border-border bg-secondary text-[9px]">Enter</kbd> to start walkthrough
            </p>
            {/* Walkthrough steps */}
            {([
              { step: 1, label: 'Select demo incident', desc: 'INC-1001 · checkout-service · CRITICAL' },
              { step: 2, label: 'Stream AI analysis',   desc: 'Gemini 2.5 Flash · demo evidence · SSE stream' },
              { step: 3, label: 'Inspect evidence',     desc: 'Runtime trace · source badge · diagnostic download' },
              { step: 4, label: 'Follow-up Q&A',        desc: 'Ask the AI follow-up questions about root cause' },
            ]).map(({ step, label, desc }) => (
              <div key={step} className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                judgeDemoRunning && judgeDemoStep >= step
                  ? 'border-amber-700/50 bg-amber-950/20'
                  : 'border-border bg-secondary/20'
              )}>
                <div className={cn(
                  'h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                  judgeDemoRunning && judgeDemoStep > step
                    ? 'border-green-600 bg-green-900/40 text-green-400'
                    : judgeDemoRunning && judgeDemoStep === step
                    ? 'border-amber-500 bg-amber-900/40 text-amber-400 animate-pulse'
                    : 'border-border text-muted-foreground'
                )}>
                  {judgeDemoRunning && judgeDemoStep > step
                    ? <CheckCircle2 className="h-3 w-3" />
                    : step}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{desc}</p>
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <Button
                data-judge-run
                className="flex-1 gap-2 h-9 bg-amber-600 hover:bg-amber-500 text-white"
                disabled={judgeDemoRunning}
                onClick={async () => {
                  setJudgeDemoRunning(true);
                  setJudgeDemoStep(1);
                  // Step 1: select demo incident
                  const demoId = 'INC-1001';
                  handleSelectIncident(demoId);
                  await new Promise(r => setTimeout(r, 600));
                  // Step 2: run analysis
                  setJudgeDemoStep(2);
                  setJudgeDemoOpen(false);
                  await handleAnalyze(true, true);
                  // Step 3: open followup
                  setJudgeDemoStep(3);
                  setRightPanel('followup');
                  await new Promise(r => setTimeout(r, 500));
                  setJudgeDemoStep(4);
                  setJudgeDemoRunning(false);
                }}
              >
                <PlayCircle className="h-4 w-4" />
                {judgeDemoRunning ? 'Running…' : 'Run Demo Walkthrough'}
              </Button>
              <Button variant="secondary" className="h-9" onClick={() => setJudgeDemoOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Sidebar — Incident List (desktop lg+) */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border bg-sidebar overflow-hidden">
          {/* Auto-refresh bar */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-sidebar-background/60">
            <RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">Auto-refresh</span>
            <div className="flex gap-1 ml-auto">
              {([
                { label: 'Off', value: 0 },
                { label: '15s', value: 15 },
                { label: '30s', value: 30 },
                { label: '60s', value: 60 },
              ] as const).map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setRefreshInterval(value)}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                    refreshInterval === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <IncidentList incidents={incidents} selectedId={selectedId} onSelect={handleSelectIncident} onResolve={handleResolveIncident} onBulkResolve={handleBulkResolveIncidents} highlightedIds={highlightedIds} />
          </div>
        </aside>

        {/* Center — Incident Detail + Mobile stacked panels */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {!selectedIncident ? (
            <EmptyState incidents={incidents} onSelect={handleSelectIncident} />
          ) : (
            <>
              {/* Live Splunk error banner — shown when MCP/REST fails, user must explicitly choose demo */}
              {liveError && !analyzing && (
                <div className="shrink-0 border-b border-red-700/40 bg-red-950/20 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-red-300 mb-0.5">
                        Live Splunk {liveError.mode === 'error-mcp' ? 'MCP' : 'REST'} failed
                      </p>
                      <p className="text-[11px] text-red-400/80 font-mono break-all leading-relaxed">
                        {liveError.message}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] border border-red-700/50 text-red-300 hover:bg-red-900/30"
                        onClick={() => handleAnalyze(true)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] border border-amber-700/50 text-amber-300 hover:bg-amber-900/30"
                        onClick={() => { setLiveError(null); handleAnalyze(true, true); }}
                      >
                        <Database className="h-3 w-3 mr-1" />Use demo data
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] border border-border text-muted-foreground hover:text-foreground"
                        onClick={() => setLiveError(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {/* Draft restore banner — shown when a previous stream was interrupted */}
              {draftRestoreId === selectedIncident.id && (() => {
                const draft = loadDraft(draftRestoreId);
                if (!draft) return null;
                const age = Math.round((Date.now() - new Date(draft.savedAt).getTime()) / 60000);
                return (
                  <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-yellow-500/10 border-b border-yellow-500/30">
                    <span className="text-[11px] text-yellow-300 flex-1">
                      ⚡ Interrupted analysis from {age}m ago recovered ({draft.tokens.toLocaleString()} tokens). Restore the partial result?
                    </span>
                    <button
                      className="text-[11px] font-semibold text-yellow-200 hover:text-white underline underline-offset-2 shrink-0"
                      onClick={() => {
                        setAnalysis(draft.analysis as typeof analysis);
                        setStreamingBrief(draft.brief);
                        setStreamStep('done');
                        setStreamStopReason(`Restored partial draft (${draft.tokens.toLocaleString()} tokens)`);
                        setDraftRestoreId(null);
                        clearDraft(draftRestoreId);
                      }}
                    >
                      Restore
                    </button>
                    <button
                      className="text-[11px] text-yellow-400/70 hover:text-yellow-300 shrink-0"
                      onClick={() => { clearDraft(draftRestoreId); setDraftRestoreId(null); }}
                    >
                      Dismiss
                    </button>
                  </div>
                );
              })()}
              {/* Incident detail scrollable area */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <IncidentDetail
                  incident={selectedIncident as Incident}
                  analysis={analysis}
                  loading={analyzing}
                  streamingBrief={streamingBrief}
                  streamStep={streamStep}
                  streamTokens={streamTokens}
                  streamCostUsd={estimateCost(streamTokens)}
                  streamStopReason={streamStopReason}
                  onAnalyze={handleAnalyze}
                />
              </div>

              {/* - Mobile stacked Tools/Follow-up panel (hidden md+) - */}
              <div className="md:hidden flex flex-col shrink-0 border-t border-border bg-sidebar" style={{ height: '50vh' }}>
                {/* Tab bar */}
                <div className="shrink-0 flex border-b border-border">
                  <button
                    onClick={() => setRightPanel('tools')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium border-r border-border transition-colors',
                      rightPanel === 'tools' ? 'text-primary bg-sidebar-accent' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Wrench className="h-3.5 w-3.5" />Tools
                  </button>
                  <button
                    onClick={() => setRightPanel('followup')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors',
                      rightPanel === 'followup' ? 'text-primary bg-sidebar-accent' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />Follow-up
                    {analysis && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                </div>
                {/* Panel content — fills remaining height */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {rightPanel === 'followup'
                    ? <FollowUpPanel analysis={analysis ?? undefined} />
                    : <ToolsPanel
                        analysis={analysis}
                        incidentId={selectedIncident.id}
                        incidentTitle={selectedIncident.title}
                        incidentService={selectedIncident.service}
                        timeWindow={selectedIncident.time_window}
                        suggestedQueries={analysis?.suggestedQueries}
                        deepLinkQuery={deepLinkQuery}
                        deepLinkService={deepLinkService}
                      />
                  }
                </div>
              </div>
            </>
          )}
        </main>

        {/* Right Panel — Tools or Follow-up (md+ only) */}
        {selectedIncident && (
          <aside className="hidden md:flex flex-col w-80 shrink-0 border-l border-border bg-sidebar overflow-hidden">
            {/* Tab switcher */}
            <div className="shrink-0 flex gap-0.5 p-1.5 border-b border-border bg-sidebar-background/50">
              {([
                { key: 'tools',    icon: Wrench,       label: 'Tools'     },
                { key: 'followup', icon: MessageSquare, label: 'Follow-up' },
                { key: 'pd',       icon: Radio,        label: 'PD Status' },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setRightPanel(key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all',
                    rightPanel === key
                      ? 'bg-card text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden lg:inline">{label}</span>
                  {key === 'followup' && analysis && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            {rightPanel === 'pd'
              ? <div className="flex-1 min-h-0 overflow-y-auto p-3"><PagerDutyStatusPanel /></div>
              : rightPanel === 'followup'
                ? <FollowUpPanel analysis={analysis ?? undefined} />
                : <ToolsPanel
                    analysis={analysis}
                    incidentId={selectedIncident.id}
                    incidentTitle={selectedIncident.title}
                    incidentService={selectedIncident.service}
                    timeWindow={selectedIncident.time_window}
                    suggestedQueries={analysis?.suggestedQueries}
                    deepLinkQuery={deepLinkQuery}
                    deepLinkService={deepLinkService}
                  />
            }
          </aside>
        )}
      </div>
    </div>
  );
}

function EmptyState({ incidents, onSelect }: { incidents: Incident[]; onSelect: (id: string) => void }) {
  const active = incidents.filter(i => i.status !== 'RESOLVED').slice(0, 4);
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center overflow-y-auto gap-8">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
            <img
              src="https://miaoda-conversation-file.s3cdn.medo.dev/user-b8uq3eatai9u/app-bs8qtod6o9hd/20260527/SentinelOps logo Final.png"
              alt="SentinelOps"
              className="h-14 w-14 object-contain"
            />
          </div>
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary border-2 border-background animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1 text-balance">SentinelOps Ready</h2>
          <p className="text-sm text-muted-foreground max-w-xs text-pretty leading-relaxed">
            Select an incident to begin AI-powered triage. Correlates Splunk signals, deployments, and logs into an actionable response brief.
          </p>
        </div>
      </div>

      {/* Active incidents grid */}
      {active.length > 0 && (
        <div className="w-full max-w-lg">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-left mb-3">
            Active Incidents
          </p>
          <div className="grid gap-2">
            {active.map(inc => (
              <button
                key={inc.id}
                onClick={() => onSelect(inc.id)}
                className={cn(
                  'w-full text-left rounded-xl border bg-card hover:bg-secondary/30 transition-all p-3.5 flex items-center gap-3 group',
                  inc.severity === 'CRITICAL'
                    ? 'border-red-500/20 hover:border-red-500/30 hover:glow-primary'
                    : inc.severity === 'HIGH'
                      ? 'border-orange-500/20 hover:border-orange-500/30'
                      : 'border-border hover:border-border/80'
                )}
              >
                <div className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  inc.severity === 'CRITICAL' ? 'dot-critical animate-pulse' :
                  inc.severity === 'HIGH'     ? 'dot-high' :
                  inc.severity === 'MEDIUM'   ? 'dot-medium' : 'dot-low'
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate text-left">{inc.title}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{inc.id} · {inc.service}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    'text-[10px] font-bold',
                    inc.severity === 'CRITICAL' ? 'text-sev-critical' :
                    inc.severity === 'HIGH'     ? 'text-sev-high' :
                    inc.severity === 'MEDIUM'   ? 'text-sev-medium' : 'text-sev-low'
                  )}>{inc.severity}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors rotate-[-90deg]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PagerDuty status */}
      <div className="w-full max-w-lg">
        <PagerDutyStatusPanel />
      </div>
    </div>
  );
}
