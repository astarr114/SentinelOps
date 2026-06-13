// @refresh reset
import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ── Provider catalogue ────────────────────────────────────────────────────────
export type LlmProvider = 'gemini' | 'openai' | 'anthropic' | 'grok' | 'deepseek';

export interface ProviderMeta {
  id:      LlmProvider;
  label:   string;
  models:  { id: string; label: string }[];
  apiKeyLabel: string;
  apiKeyHint:  string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini', label: 'Google Gemini',
    apiKeyLabel: 'Gemini API Key', apiKeyHint: 'AIza…',
    models: [
      { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash (default)' },
      { id: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    id: 'openai', label: 'OpenAI',
    apiKeyLabel: 'OpenAI API Key', apiKeyHint: 'sk-…',
    models: [
      { id: 'gpt-4o',          label: 'GPT-4o' },
      { id: 'gpt-4o-mini',     label: 'GPT-4o mini' },
      { id: 'gpt-4-turbo',     label: 'GPT-4 Turbo' },
      { id: 'o3-mini',         label: 'o3-mini' },
    ],
  },
  {
    id: 'anthropic', label: 'Anthropic Claude',
    apiKeyLabel: 'Anthropic API Key', apiKeyHint: 'sk-ant-…',
    models: [
      { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-3-5',  label: 'Claude Haiku 3.5' },
    ],
  },
  {
    id: 'grok', label: 'xAI Grok',
    apiKeyLabel: 'xAI API Key', apiKeyHint: 'xai-…',
    models: [
      { id: 'grok-3',       label: 'Grok 3' },
      { id: 'grok-3-mini',  label: 'Grok 3 mini' },
      { id: 'grok-2',       label: 'Grok 2' },
    ],
  },
  {
    id: 'deepseek', label: 'DeepSeek',
    apiKeyLabel: 'DeepSeek API Key', apiKeyHint: 'sk-…',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
];

export function getProviderMeta(p: LlmProvider): ProviderMeta {
  return PROVIDERS.find(x => x.id === p) ?? PROVIDERS[0];
}

// ── Alert rule types ──────────────────────────────────────────────────────────
export type AlertAction = 'toast' | 'highlight' | 'sound' | 'toast_and_highlight' | 'toast_and_sound' | 'email' | 'pagerduty' | 'slack' | 'all' | 'all_channels';

export interface AlertRule {
  id:         string;
  name:       string;
  severities: string[];
  services:   string[];
  action:     AlertAction;
  enabled:    boolean;
}

// ── Config types ──────────────────────────────────────────────────────────────
export interface LlmConfig {
  provider: LlmProvider;
  apiKey:   string;
  modelId:  string;
}

interface LlmContextValue {
  llmConfigs:      Record<LlmProvider, LlmConfig>;
  activeProvider:  LlmProvider;
  activeLlm:       LlmConfig;
  isSavingLlm:     boolean;
  setActiveProvider: (p: LlmProvider) => void;
  updateLlmConfig:   (p: LlmProvider, partial: Partial<Omit<LlmConfig, 'provider'>>) => void;
  saveLlmConfigs:    () => Promise<void>;
  alertRules:        AlertRule[];
  isSavingRules:     boolean;
  addAlertRule:      () => void;
  updateAlertRule:   (id: string, partial: Partial<AlertRule>) => void;
  deleteAlertRule:   (id: string) => void;
  reorderAlertRules: (orderedIds: string[]) => void;
  saveAlertRules:    () => Promise<void>;
  matchRules:        (severity: string, service: string) => AlertRule[];
  /** Returns ordered fallback-chain array: active provider first, then other configured providers */
  buildFallbackChain: () => Array<{ provider: LlmProvider; apiKey: string; modelId: string }>;
  /** Cache TTL in minutes (user-configurable, default 30) */
  cacheTtlMinutes: number;
  setCacheTtlMinutes: (v: number) => void;
  /** Max output tokens per analysis run (user-configurable, default 8000) */
  maxTokenBudget: number;
  setMaxTokenBudget: (v: number) => void;
}

// ── Default model per provider ────────────────────────────────────────────────
function defaultModel(p: LlmProvider): string {
  return getProviderMeta(p).models[0].id;
}

function buildDefaultConfigs(): Record<LlmProvider, LlmConfig> {
  const result = {} as Record<LlmProvider, LlmConfig>;
  for (const p of PROVIDERS) {
    result[p.id] = { provider: p.id, apiKey: '', modelId: defaultModel(p.id) };
  }
  return result;
}

export const LlmContext = createContext<LlmContextValue | null>(null);

export function LlmContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [llmConfigs, setLlmConfigs]     = useState<Record<LlmProvider, LlmConfig>>(buildDefaultConfigs);
  const [activeProvider, setActiveProvider] = useState<LlmProvider>('gemini');
  const [isSavingLlm, setIsSavingLlm]   = useState(false);

  const [alertRules, setAlertRules]     = useState<AlertRule[]>([]);
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Cache TTL — persisted to localStorage so it survives refresh
  const [cacheTtlMinutes, setCacheTtlMinutesState] = useState<number>(() => {
    const stored = localStorage.getItem('sentinelops_cache_ttl_minutes');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return !isNaN(parsed) && parsed >= 1 && parsed <= 1440 ? parsed : 30;
  });
  const setCacheTtlMinutes = useCallback((v: number) => {
    const clamped = Math.min(1440, Math.max(1, Math.round(v)));
    localStorage.setItem('sentinelops_cache_ttl_minutes', String(clamped));
    setCacheTtlMinutesState(clamped);
  }, []);

  // Max Token Budget — persisted to localStorage
  const [maxTokenBudget, setMaxTokenBudgetState] = useState<number>(() => {
    const stored = localStorage.getItem('sentinelops_max_token_budget');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return !isNaN(parsed) && parsed >= 1000 && parsed <= 16000 ? parsed : 8000;
  });
  const setMaxTokenBudget = useCallback((v: number) => {
    const clamped = Math.min(16000, Math.max(1000, Math.round(v)));
    localStorage.setItem('sentinelops_max_token_budget', String(clamped));
    setMaxTokenBudgetState(clamped);
  }, []);

  // ── Load from DB ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // Load llm configs
    supabase
      .from('llm_configs')
      .select('provider,api_key,model_id,is_active')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setLlmConfigs(prev => {
          const next = { ...prev };
          for (const row of data) {
            const p = row.provider as LlmProvider;
            next[p] = { provider: p, apiKey: row.api_key ?? '', modelId: row.model_id ?? defaultModel(p) };
          }
          return next;
        });
        // Set active to first row with is_active=true
        const active = data.find(r => r.is_active);
        if (active) setActiveProvider(active.provider as LlmProvider);
      });
    // Load alert rules
    supabase
      .from('alert_rules')
      .select('id,name,severities,services,action,enabled')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (!data) return;
        setAlertRules(data.map(r => ({
          id:         r.id,
          name:       r.name,
          severities: r.severities ?? [],
          services:   r.services ?? [],
          action:     r.action as AlertAction,
          enabled:    r.enabled,
        })));
      });
  }, [user]);

  // ── LLM config mutations ────────────────────────────────────────────────────
  const updateLlmConfig = useCallback((p: LlmProvider, partial: Partial<Omit<LlmConfig, 'provider'>>) => {
    setLlmConfigs(prev => ({ ...prev, [p]: { ...prev[p], ...partial } }));
  }, []);

  const saveLlmConfigs = useCallback(async () => {
    if (!user) return;
    setIsSavingLlm(true);
    try {
      const rows = PROVIDERS.map(p => ({
        user_id:    user.id,
        provider:   p.id,
        api_key:    llmConfigs[p.id].apiKey,
        model_id:   llmConfigs[p.id].modelId,
        is_active:  p.id === activeProvider,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('llm_configs').upsert(rows, { onConflict: 'user_id,provider' });
    } finally {
      setIsSavingLlm(false);
    }
  }, [user, llmConfigs, activeProvider]);

  // ── Alert rule mutations ────────────────────────────────────────────────────
  const addAlertRule = useCallback(() => {
    setAlertRules(prev => [...prev, {
      id: `local-${Date.now()}`, name: 'New Rule',
      severities: [], services: [], action: 'toast', enabled: true,
    }]);
  }, []);

  const updateAlertRule = useCallback((id: string, partial: Partial<AlertRule>) => {
    setAlertRules(prev => prev.map(r => r.id === id ? { ...r, ...partial } : r));
  }, []);

  const deleteAlertRule = useCallback((id: string) => {
    setAlertRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const reorderAlertRules = useCallback((orderedIds: string[]) => {
    setAlertRules(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      return orderedIds.map(id => map.get(id)).filter(Boolean) as AlertRule[];
    });
  }, []);

  const saveAlertRules = useCallback(async () => {
    if (!user) return;
    setIsSavingRules(true);
    try {
      // Delete all and reinsert (simplest approach for user-owned rules)
      await supabase.from('alert_rules').delete().eq('user_id', user.id);
      if (alertRules.length > 0) {
        const rows = alertRules.map(r => ({
          user_id:    user.id,
          name:       r.name,
          severities: r.severities,
          services:   r.services,
          action:     r.action,
          enabled:    r.enabled,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('alert_rules').insert(rows);
      }
      // Reload to get real IDs
      const { data } = await supabase.from('alert_rules')
        .select('id,name,severities,services,action,enabled')
        .eq('user_id', user.id).order('created_at');
      if (data) {
        setAlertRules(data.map(r => ({
          id: r.id, name: r.name, severities: r.severities ?? [],
          services: r.services ?? [], action: r.action as AlertAction, enabled: r.enabled,
        })));
      }
    } finally {
      setIsSavingRules(false);
    }
  }, [user, alertRules]);

  // ── Match rules for incoming notification ───────────────────────────────────
  const matchRules = useCallback((severity: string, service: string): AlertRule[] => {
    return alertRules.filter(rule => {
      if (!rule.enabled) return false;
      const sevMatch  = rule.severities.length === 0 || rule.severities.includes(severity);
      const svcMatch  = rule.services.length === 0    || rule.services.includes(service);
      return sevMatch && svcMatch;
    });
  }, [alertRules]);

  const activeLlm = llmConfigs[activeProvider];

  // Build ordered fallback chain: active provider first, then others that have apiKeys
  const buildFallbackChain = useCallback(() => {
    const chain: Array<{ provider: LlmProvider; apiKey: string; modelId: string }> = [];
    // Active provider first
    const active = llmConfigs[activeProvider];
    if (active.apiKey) chain.push({ provider: activeProvider, apiKey: active.apiKey, modelId: active.modelId });
    // Other configured providers as fallbacks
    for (const p of PROVIDERS.map(pr => pr.id)) {
      if (p === activeProvider) continue;
      const cfg = llmConfigs[p];
      if (cfg.apiKey) chain.push({ provider: p, apiKey: cfg.apiKey, modelId: cfg.modelId });
    }
    return chain;
  }, [llmConfigs, activeProvider]);

  return (
    <LlmContext.Provider value={{
      llmConfigs, activeProvider, activeLlm, isSavingLlm,
      setActiveProvider, updateLlmConfig, saveLlmConfigs,
      alertRules, isSavingRules, addAlertRule, updateAlertRule, deleteAlertRule, reorderAlertRules, saveAlertRules,
      matchRules, buildFallbackChain,
      cacheTtlMinutes, setCacheTtlMinutes,
      maxTokenBudget, setMaxTokenBudget,
    }}>
      {children}
    </LlmContext.Provider>
  );
}

export function useLlm() {
  const ctx = useContext(LlmContext);
  if (!ctx) throw new Error('useLlm must be used within LlmContextProvider');
  return ctx;
}
