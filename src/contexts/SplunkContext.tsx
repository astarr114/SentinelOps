// @refresh reset
import { createContext, useContext, useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type SplunkMode = 'live' | 'demo';
export type McpAuthMethod = 'bearer' | 'basic';
export type ReasoningProvider = 'gemini' | 'splunk-hosted-model';

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/** Per-user keyword lists that override the default severity heuristic.
 *  Each array holds plain lowercase substrings checked against SPL + alert name.
 *  NULL / empty array = fall back to built-in defaults. */
export interface SeverityRules {
  critical: string[];
  high:     string[];
  medium:   string[];
  low:      string[];
}

export const DEFAULT_SEVERITY_RULES: SeverityRules = {
  critical: ['index=security', 'index=audit', 'index=auth', 'critical', 'failed login', 'authentication failure', 'brute force', 'ransomware', 'malware'],
  high:     ['error', 'failure', 'failed', 'exception', 'crash', 'outage', 'down', 'severity=high', 'priority=high'],
  medium:   ['warn', 'warning', 'threshold', 'latency', 'slow', 'timeout', 'severity=medium'],
  low:      [],
};

interface SplunkConfig {
  // ── Evidence Layer (Local Splunk Enterprise) ────────────────────────────────
  splunkHost: string;
  splunkToken: string;
  splunkMcpUrl: string;
  splunkMcpToken: string;
  mcpAuthMethod: McpAuthMethod;
  splunkMcpUsername: string;
  splunkMcpPassword: string;
  mcpSkipNgrok: boolean;
  mcpServerName: string;
  mcpServerVersion: string;
  mcpToolList: McpTool[];
  /** Skip SSL verification for local Splunk with self-signed certs.
   *  NOTE: Supabase Edge Functions cannot bypass SSL; use ngrok for local dev. */
  sslVerify: boolean;
  mode: SplunkMode;
  lastConnectedAt: string | null;
  lastLiveVerifiedAt: string | null;
  // ── Reasoning Layer ─────────────────────────────────────────────────────────
  reasoningProvider: ReasoningProvider;
  /** Splunk Hosted Model endpoint (OpenAI-compat, Splunk Cloud Platform only) */
  splunkHostedModelEndpoint: string;
  /** Auth token for the Splunk Hosted Model */
  splunkHostedModelToken: string;
  /** Model name / deployment ID for the Splunk Hosted Model */
  splunkHostedModelName: string;
  // ── Integrations ────────────────────────────────────────────────────────────
  pagerdutyRoutingKey: string;
  alertEmail: string;
  resendApiKey: string;
  pdRestApiKey: string;
  pdAutoSync: boolean;
  pdSyncInterval: number;
  slackWebhookUrl: string;
  severityRules: SeverityRules | null;
}

interface SplunkContextValue {
  config: SplunkConfig;
  isConfigLoading: boolean;
  isLive: boolean;
  isMcp: boolean;
  isRest: boolean;
  /** True when a valid Splunk Hosted Model endpoint + token are configured AND the provider is set to splunk-hosted-model */
  isHostedModelActive: boolean;
  isSaving: boolean;
  isTesting: boolean;
  testResult: 'idle' | 'ok' | 'fail';
  testError: string;
  isMcpTesting: boolean;
  mcpTestResult: 'idle' | 'ok' | 'fail';
  mcpTestError: string;
  isVerifyingLive: boolean;
  verifyLiveResult: 'idle' | 'ok' | 'fail';
  verifyLiveError: string;
  isHostedModelTesting: boolean;
  hostedModelTestResult: 'idle' | 'ok' | 'fail';
  hostedModelTestError: string;
  updateConfig: (partial: Partial<SplunkConfig>) => void;
  saveConfig: () => Promise<void>;
  testConnection: () => Promise<void>;
  testMcpConnection: () => Promise<void>;
  verifyLiveConnection: () => Promise<void>;
  testHostedModelConnection: () => Promise<void>;
}

const DEFAULT_CONFIG: SplunkConfig = {
  splunkHost: '',
  splunkToken: '',
  splunkMcpUrl: '',
  splunkMcpToken: '',
  mcpAuthMethod: 'bearer',
  splunkMcpUsername: '',
  splunkMcpPassword: '',
  mcpSkipNgrok: false,
  mcpServerName: '',
  mcpServerVersion: '',
  mcpToolList: [],
  sslVerify: false,
  mode: 'demo',
  lastConnectedAt: null,
  lastLiveVerifiedAt: null,
  reasoningProvider: 'gemini',
  splunkHostedModelEndpoint: '',
  splunkHostedModelToken: '',
  splunkHostedModelName: '',
  pagerdutyRoutingKey: '',
  alertEmail: '',
  resendApiKey: '',
  pdRestApiKey: '',
  pdAutoSync: false,
  pdSyncInterval: 60,
  slackWebhookUrl: '',
  severityRules: null,
};

// ── SplunkErrorBoundary ──────────────────────────────────────────────────────
// Class component (must be class — hooks can't catch render errors).
// Wraps SplunkProvider children specifically so context-level failures surface
// a targeted recovery UI rather than propagating to AppErrorBoundary.

interface SplunkErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  countdown: number;
}

export class SplunkErrorBoundary extends Component<{ children: ReactNode }, SplunkErrorBoundaryState> {
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', countdown: 10 };
  }

  static getDerivedStateFromError(error: unknown): SplunkErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg, countdown: 10 };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[SplunkErrorBoundary] Context error caught:', error, info.componentStack);
  }

  componentDidUpdate(_: unknown, prev: SplunkErrorBoundaryState) {
    if (this.state.hasError && !prev.hasError) {
      // Start countdown when error appears
      this._timer = setInterval(() => {
        this.setState(s => {
          if (s.countdown <= 1) {
            clearInterval(this._timer!);
            this._timer = null;
            return { hasError: false, errorMessage: '', countdown: 0 };
          }
          return { hasError: s.hasError, errorMessage: s.errorMessage, countdown: s.countdown - 1 };
        });
      }, 1000);
    }
    if (!this.state.hasError && prev.hasError && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  componentWillUnmount() {
    if (this._timer) clearInterval(this._timer);
  }

  handleReset = () => {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.setState({ hasError: false, errorMessage: '', countdown: 10 });
  };

  render() {
    if (this.state.hasError) {
      const { countdown, errorMessage } = this.state;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-background text-foreground">
          <div className="max-w-md w-full rounded-xl border border-red-500/40 bg-red-950/20 p-6 space-y-3">
            <p className="text-sm font-semibold text-red-400">Splunk context error</p>
            <p className="text-xs text-muted-foreground font-mono break-words">{errorMessage}</p>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={this.handleReset}
                className="text-xs px-3 py-1.5 rounded-md border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
              >
                Retry now
              </button>
              {countdown > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  Auto-retry in{' '}
                  <span className="tabular-nums font-semibold text-foreground">{countdown}s</span>
                  {/* Shrinking progress bar */}
                  <span className="block mt-1 h-0.5 rounded-full bg-border overflow-hidden">
                    <span
                      className="block h-full bg-red-500/60 transition-all duration-1000"
                      style={{ width: `${(countdown / 10) * 100}%` }}
                    />
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SplunkContext = createContext<SplunkContextValue | null>(null);

export function SplunkProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [config, setConfig] = useState<SplunkConfig>(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testError, setTestError] = useState('');
  const [isMcpTesting, setIsMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [mcpTestError, setMcpTestError] = useState('');
  const [isVerifyingLive, setIsVerifyingLive] = useState(false);
  const [verifyLiveResult, setVerifyLiveResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [verifyLiveError, setVerifyLiveError] = useState('');
  const [isHostedModelTesting, setIsHostedModelTesting] = useState(false);
  const [hostedModelTestResult, setHostedModelTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [hostedModelTestError, setHostedModelTestError] = useState('');
  // True while the initial DB fetch is in-flight; suppresses premature DEMO badge.
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  // Load config from DB on mount
  useEffect(() => {
    if (!user) { setIsConfigLoading(false); return; }
    setIsConfigLoading(true);
    supabase
      .from('splunk_configs')
      .select('splunk_host,splunk_token,splunk_mcp_url,splunk_mcp_token,mcp_auth_method,splunk_mcp_username,splunk_mcp_password,mcp_skip_ngrok,mcp_server_name,mcp_server_version,mcp_tool_list,ssl_verify,mode,last_connected_at,last_live_verified_at,reasoning_provider,splunk_hosted_model_endpoint,splunk_hosted_model_token,splunk_hosted_model_name,pagerduty_routing_key,alert_email,resend_api_key,pd_rest_api_key,slack_webhook_url,pd_auto_sync,pd_sync_interval,severity_rules')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({
            splunkHost: data.splunk_host ?? '',
            splunkToken: data.splunk_token ?? '',
            splunkMcpUrl: data.splunk_mcp_url ?? '',
            splunkMcpToken: data.splunk_mcp_token ?? '',
            mcpAuthMethod: (data.mcp_auth_method as McpAuthMethod) ?? 'bearer',
            splunkMcpUsername: data.splunk_mcp_username ?? '',
            splunkMcpPassword: data.splunk_mcp_password ?? '',
            mcpSkipNgrok: data.mcp_skip_ngrok ?? false,
            mcpServerName: data.mcp_server_name ?? '',
            mcpServerVersion: data.mcp_server_version ?? '',
            mcpToolList: Array.isArray(data.mcp_tool_list) ? (data.mcp_tool_list as McpTool[]) : [],
            sslVerify: data.ssl_verify ?? false,
            mode: (data.mode as SplunkMode) ?? 'demo',
            lastConnectedAt: data.last_connected_at ?? null,
            lastLiveVerifiedAt: data.last_live_verified_at ?? null,
            reasoningProvider: (data.reasoning_provider as ReasoningProvider) ?? 'gemini',
            splunkHostedModelEndpoint: data.splunk_hosted_model_endpoint ?? '',
            splunkHostedModelToken: data.splunk_hosted_model_token ?? '',
            splunkHostedModelName: data.splunk_hosted_model_name ?? '',
            pagerdutyRoutingKey: data.pagerduty_routing_key ?? '',
            alertEmail: data.alert_email ?? '',
            resendApiKey: data.resend_api_key ?? '',
            pdRestApiKey: data.pd_rest_api_key ?? '',
            pdAutoSync: data.pd_auto_sync ?? false,
            pdSyncInterval: data.pd_sync_interval ?? 60,
            slackWebhookUrl: data.slack_webhook_url ?? '',
            severityRules: (data.severity_rules as SeverityRules | null) ?? null,
          });
        }
        setIsConfigLoading(false);
      });
  }, [user]);

  const updateConfig = useCallback((partial: Partial<SplunkConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
    setTestResult('idle');
    setTestError('');
  }, []);

  const testConnection = useCallback(async () => {
    if (!config.splunkHost || !config.splunkToken) {
      setTestResult('fail');
      setTestError('Host and token are required to test connection.');
      return;
    }
    setIsTesting(true);
    setTestResult('idle');
    setTestError('');
    try {
      // Route through edge function proxy to avoid browser CORS restrictions
      const { data, error } = await supabase.functions.invoke('splunk-test', {
        body: { mode: 'rest', splunkHost: config.splunkHost, splunkToken: config.splunkToken },
      });
      if (error) {
        // Read the actual error body from the edge function response
        let msg = error.message;
        try {
          const raw = await error?.context?.text?.();
          if (raw) {
            const parsed = JSON.parse(raw);
            msg = parsed?.message ?? parsed?.error ?? raw;
          }
        } catch { /* use error.message */ }
        setTestResult('fail');
        setTestError(msg || 'Connection test failed.');
        return;
      }
      if (data?.ok) {
        setTestResult('ok');
        setConfig(prev => ({ ...prev, mode: 'live', lastConnectedAt: new Date().toISOString() }));
      } else {
        setTestResult('fail');
        setTestError(data?.message || 'Connection failed. Check host URL and token.');
      }
    } catch (e) {
      setTestResult('fail');
      setTestError(e instanceof Error ? e.message : 'Connection failed. Check host URL and token.');
    } finally {
      setIsTesting(false);
    }
  }, [config.splunkHost, config.splunkToken]);

  const testMcpConnection = useCallback(async () => {
    if (!config.splunkMcpUrl) {
      setMcpTestResult('fail');
      setMcpTestError('MCP Server URL is required.');
      return;
    }
    setIsMcpTesting(true);
    setMcpTestResult('idle');
    setMcpTestError('');
    try {
      const { data, error } = await supabase.functions.invoke('splunk-test', {
        body: {
          mode: 'mcp-full',
          mcpUrl: config.splunkMcpUrl,
          mcpToken: config.splunkMcpToken,
          mcpAuthMethod: config.mcpAuthMethod,
          mcpUsername: config.splunkMcpUsername,
          mcpPassword: config.splunkMcpPassword,
        },
      });
      if (error) {
        let msg = error.message;
        try {
          const raw = await error?.context?.text?.();
          if (raw) {
            const parsed = JSON.parse(raw);
            msg = parsed?.message ?? parsed?.error ?? raw;
          }
        } catch { /* use error.message */ }
        setMcpTestResult('fail');
        setMcpTestError(msg || 'MCP connection test failed.');
        return;
      }
      if (data?.ok) {
        // Persist discovered server info into config (will be saved on next saveConfig)
        setConfig(prev => ({
          ...prev,
          mcpServerName: data.serverName ?? prev.mcpServerName,
          mcpServerVersion: data.serverVersion ?? prev.mcpServerVersion,
          mcpToolList: Array.isArray(data.toolList) ? data.toolList : prev.mcpToolList,
        }));
        setMcpTestResult('ok');
      } else {
        setMcpTestResult('fail');
        setMcpTestError(data?.message || 'MCP Server connection failed. Check URL and token.');
      }
    } catch (e) {
      setMcpTestResult('fail');
      setMcpTestError(e instanceof Error ? e.message : 'MCP connection failed.');
    } finally {
      setIsMcpTesting(false);
    }
  }, [config.splunkMcpUrl, config.splunkMcpToken, config.mcpAuthMethod, config.splunkMcpUsername, config.splunkMcpPassword]);

  /** Test inference against the configured Splunk Hosted Model endpoint.
   *  Uses a minimal OpenAI-compat /chat/completions request. */
  const testHostedModelConnection = useCallback(async () => {
    if (!config.splunkHostedModelEndpoint || !config.splunkHostedModelToken) {
      setHostedModelTestResult('fail');
      setHostedModelTestError('Hosted model endpoint and token are required.');
      return;
    }
    setIsHostedModelTesting(true);
    setHostedModelTestResult('idle');
    setHostedModelTestError('');
    try {
      const { data, error } = await supabase.functions.invoke('splunk-test', {
        body: {
          mode: 'hosted-model',
          hostedModelEndpoint: config.splunkHostedModelEndpoint,
          hostedModelToken: config.splunkHostedModelToken,
          hostedModelName: config.splunkHostedModelName || 'default',
        },
      });
      if (error) {
        let msg = error.message;
        try {
          const raw = await error?.context?.text?.();
          if (raw) { const parsed = JSON.parse(raw); msg = parsed?.message ?? parsed?.error ?? raw; }
        } catch { /* use error.message */ }
        setHostedModelTestResult('fail');
        setHostedModelTestError(msg || 'Hosted model test failed.');
        return;
      }
      if (data?.ok) {
        setHostedModelTestResult('ok');
      } else {
        setHostedModelTestResult('fail');
        setHostedModelTestError(data?.message || 'Hosted model inference test failed. Check endpoint and token.');
      }
    } catch (e) {
      setHostedModelTestResult('fail');
      setHostedModelTestError(e instanceof Error ? e.message : 'Hosted model test failed.');
    } finally {
      setIsHostedModelTesting(false);
    }
  }, [config.splunkHostedModelEndpoint, config.splunkHostedModelToken, config.splunkHostedModelName]);

  /** Runs a tiny live query ("index=_internal | head 1") to prove live Splunk connection.
   *  Uses MCP if configured, else REST. Records the verified timestamp on success. */
  const verifyLiveConnection = useCallback(async () => {
    const hasMcp  = !!config.splunkMcpUrl;
    const hasRest = !!(config.splunkHost && config.splunkToken);
    if (!hasMcp && !hasRest) {
      setVerifyLiveResult('fail');
      setVerifyLiveError('No Splunk credentials configured. Add MCP URL or REST host + token.');
      return;
    }
    setIsVerifyingLive(true);
    setVerifyLiveResult('idle');
    setVerifyLiveError('');
    try {
      const mode = hasMcp ? 'mcp-tool-call' : 'rest';
      const body = hasMcp
        ? {
            mode,
            mcpUrl:        config.splunkMcpUrl,
            mcpToken:      config.splunkMcpToken,
            mcpAuthMethod: config.mcpAuthMethod,
            mcpUsername:   config.splunkMcpUsername,
            mcpPassword:   config.splunkMcpPassword,
            toolName:      'splunk_run_query',
            toolArgs:      { query: 'index=_internal | head 1', earliest_time: '-5m', latest_time: 'now', max_results: 1 },
          }
        : { mode, splunkHost: config.splunkHost, splunkToken: config.splunkToken };

      const { data, error } = await supabase.functions.invoke('splunk-test', { body });
      if (error || !data?.ok) {
        const msg = data?.message ?? error?.message ?? 'Verify failed';
        setVerifyLiveResult('fail');
        setVerifyLiveError(msg);
        return;
      }
      const now = new Date().toISOString();
      setConfig(prev => ({ ...prev, lastLiveVerifiedAt: now }));
      setVerifyLiveResult('ok');
    } catch (e) {
      setVerifyLiveResult('fail');
      setVerifyLiveError(e instanceof Error ? e.message : 'Verify failed');
    } finally {
      setIsVerifyingLive(false);
    }
  }, [config.splunkMcpUrl, config.splunkMcpToken, config.mcpAuthMethod, config.splunkMcpUsername, config.splunkMcpPassword, config.splunkHost, config.splunkToken]);

  const saveConfig = useCallback(async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await supabase
        .from('splunk_configs')
        .upsert({
          user_id: user.id,
          splunk_host: config.splunkHost || null,
          splunk_token: config.splunkToken || null,
          splunk_mcp_url: config.splunkMcpUrl || null,
          splunk_mcp_token: config.splunkMcpToken || null,
          mcp_auth_method: config.mcpAuthMethod,
          splunk_mcp_username: config.splunkMcpUsername || null,
          splunk_mcp_password: config.splunkMcpPassword || null,
          mcp_skip_ngrok: config.mcpSkipNgrok,
          mcp_server_name: config.mcpServerName || null,
          mcp_server_version: config.mcpServerVersion || null,
          mcp_tool_list: config.mcpToolList.length > 0 ? config.mcpToolList : null,
          ssl_verify: config.sslVerify,
          mode: config.splunkHost && config.splunkToken ? config.mode : 'demo',
          last_connected_at: config.lastConnectedAt,
          last_live_verified_at: config.lastLiveVerifiedAt,
          reasoning_provider: config.reasoningProvider,
          splunk_hosted_model_endpoint: config.splunkHostedModelEndpoint || null,
          splunk_hosted_model_token: config.splunkHostedModelToken || null,
          splunk_hosted_model_name: config.splunkHostedModelName || null,
          updated_at: new Date().toISOString(),
          pagerduty_routing_key: config.pagerdutyRoutingKey || null,
          alert_email: config.alertEmail || null,
          resend_api_key: config.resendApiKey || null,
          pd_rest_api_key: config.pdRestApiKey || null,
          pd_auto_sync: config.pdAutoSync,
          pd_sync_interval: Math.max(30, Math.min(3600, config.pdSyncInterval)),
          slack_webhook_url: config.slackWebhookUrl || null,
          severity_rules: config.severityRules ?? null,
        }, { onConflict: 'user_id' });
    } finally {
      setIsSaving(false);
    }
  }, [user, config]);

  return (
    <SplunkErrorBoundary>
      <SplunkContext.Provider value={{
        config,
        isConfigLoading,
        isLive: config.mode === 'live' && !!config.splunkHost && !!config.splunkToken,
        isMcp: !!config.splunkMcpUrl && (
          config.mcpAuthMethod === 'basic'
            ? !!config.splunkMcpUsername
            : true
        ),
        isRest: !!(config.splunkHost && config.splunkToken) && !(!!config.splunkMcpUrl && (
          config.mcpAuthMethod === 'basic' ? !!config.splunkMcpUsername : true
        )),
        isHostedModelActive:
          config.reasoningProvider === 'splunk-hosted-model' &&
          !!config.splunkHostedModelEndpoint &&
          !!config.splunkHostedModelToken,
        isSaving,
        isTesting,
        testResult,
        testError,
        isMcpTesting,
        mcpTestResult,
        mcpTestError,
        isVerifyingLive,
        verifyLiveResult,
        verifyLiveError,
        isHostedModelTesting,
        hostedModelTestResult,
        hostedModelTestError,
        updateConfig,
        saveConfig,
        testConnection,
        testMcpConnection,
        verifyLiveConnection,
        testHostedModelConnection,
      }}>
        {children}
      </SplunkContext.Provider>
    </SplunkErrorBoundary>
  );
}


export function useSplunk() {
  const ctx = useContext(SplunkContext);
  if (!ctx) throw new Error('useSplunk must be used within SplunkProvider');
  return ctx;
}
