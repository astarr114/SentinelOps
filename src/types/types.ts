export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  created_at: string;
}

// Incident types
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED';

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: Severity;
  status: IncidentStatus;
  opened_at: string;
  resolved_at?: string | null;
  summary: string;
  time_window: string;
  affected_endpoints?: string[];
  tags?: string[];
  is_synthetic?: boolean;
  /** Origin of the incident: 'splunk-webhook' | 'synthetic' | 'pagerduty' | 'manual' */
  source?: string;
  /** Deep-link to the Splunk search results that triggered this incident */
  splunk_results_link?: string | null;
}

export interface AlertNotification {
  id: string;
  user_id: string;
  incident_id: string;
  severity: Severity;
  service: string;
  title: string;
  is_read: boolean;
  created_at: string;
}

export interface DeployEvent {
  id: string;
  service: string;
  version: string;
  deployed_by: string;
  timestamp: string;
  environment: string;
  status: 'success' | 'failed' | 'rollback';
  commit: string;
  change_summary: string;
}

export interface AlertEvent {
  id: string;
  service: string;
  alert_name: string;
  severity: Severity;
  triggered_at: string;
  value: number;
  threshold: number;
  unit: string;
  description: string;
}

export interface LogPattern {
  pattern: string;
  count: number;
  first_seen: string;
  last_seen: string;
  severity: 'error' | 'warn' | 'critical';
  service: string;
  sample: string;
}

export interface ServiceMetadata {
  name: string;
  team: string;
  tier: number;
  language: string;
  version: string;
  dependencies: string[];
  on_call: string;
  sla_ms: number;
  repo: string;
}

export interface TimelineEvent {
  timestamp: string;
  event: string;
  type: 'deploy' | 'alert' | 'error' | 'recovery' | 'change' | 'info';
  service?: string;
}

export interface Hypothesis {
  title: string;
  confidence: number;
  evidence: string[];
  category: 'deployment' | 'dependency' | 'resource' | 'external' | 'config';
}

export interface BlastRadius {
  services: string[];
  endpoints: string[];
  estimated_users_affected?: number;
  estimated_revenue_impact?: string;
}

export interface AnalysisResult {
  incidentId: string;
  summary: string;
  hypotheses: Hypothesis[];
  blastRadius: BlastRadius;
  recommendedActions: string[];
  timeline: TimelineEvent[];
  openQuestions: string[];
  topErrors: LogPattern[];
  deployEvents: DeployEvent[];
  affectedServices: string[];
  metadata: ServiceMetadata | null;
  generatedAt: string;
  suggestedQueries?: string[];

  // ── Hybrid architecture transparency fields ─────────────────────────────────
  /** Where evidence was gathered from */
  evidenceSource?: 'live-mcp' | 'live-rest' | 'demo';
  /** Which AI provider produced the reasoning */
  reasoningSource?: 'splunk-hosted-model' | 'gemini' | 'openai' | 'anthropic' | 'grok' | 'deepseek' | 'unknown';
  /** True when evidence came from a live Splunk instance (MCP or REST) */
  usedLiveSplunk?: boolean;
  /** True when reasoning used a Splunk Hosted Model endpoint */
  usedSplunkHostedModel?: boolean;
}

export interface FollowUpResponse {
  question: string;
  answer: string;
  sources?: Array<{ uri: string; title: string }>;
}

export interface WebSearchResult {
  name: string;
  url: string;
  displayUrl: string;
  snippet: string;
  score: number;
  siteName?: string;
}

export interface OcrResult {
  text: string;
  exitCode: number;
  errorMessage?: string;
}

export interface SplSavedQuery {
  id: string;
  user_id: string;
  name: string;
  category: string;
  spl: string;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SplQueryHistory {
  id: string;
  user_id: string;
  query_text: string;
  generated_spl: string;
  service_context: string | null;
  incident_id: string | null;
  created_at: string;
}

export interface IncidentAnalysis {
  id: string;
  user_id: string;
  incident_id: string;
  incident_title: string;
  service: string;
  severity: string;
  analysis_result: AnalysisResult | null;
  created_at: string;
}

export interface SplunkSavedAlert {
  id: string;
  user_id: string;
  alert_name: string;
  search: string;
  cron_schedule: string | null;
  next_fire_time: string | null;
  severity: string;
  is_enabled: boolean;
  alert_type: string;
  splunk_name: string;
  actions: string[];
  imported_at: string;
  updated_at: string;
}
