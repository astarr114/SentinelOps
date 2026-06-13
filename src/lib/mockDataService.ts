/**
 * Mock Data Service — Splunk Integration Abstraction Layer
 *
 * This module implements the SentinelOps Splunk integration abstraction
 * supporting three modes:
 *   1. DEMO/MOCK mode (current) — bundled sample data
 *   2. Future: Splunk REST API mode
 *   3. Future: Splunk MCP Server mode
 *
 * Interface methods mirror Splunk MCP Server capabilities:
 *   - run_splunk_query()
 *   - get_metadata()
 *   - generate_spl()
 *   - explain_spl()
 *   - get_saved_searches()
 */

import type {
  Incident, DeployEvent, AlertEvent, LogPattern,
  ServiceMetadata, AnalysisResult, TimelineEvent, Hypothesis, BlastRadius
} from '@/types/types';

import incidentsData from '@/data/incidents.json';
import deployEventsData from '@/data/deploy_events.json';
import alertsData from '@/data/alerts.json';
import appLogsData from '@/data/app_logs.json';
import metadataJson from '@/data/metadata.json';

// ─── Public API ────────────────────────────────────────────────────────────

export function getIncidents(): Incident[] {
  return incidentsData as Incident[];
}

export function getIncidentById(id: string): Incident | null {
  return (incidentsData as Incident[]).find(i => i.id === id) ?? null;
}

/**
 * run_splunk_query — Execute a Splunk SPL query (demo mode returns mock data)
 * Future: route to Splunk REST API or MCP Server
 */
export function run_splunk_query(query: string, timeWindow: string): LogPattern[] {
  void timeWindow;
  const service = _extractServiceFromQuery(query);
  return (appLogsData as LogPattern[]).filter(l => !service || l.service === service);
}

/**
 * get_metadata — Retrieve service metadata
 * Future: route to Splunk entity analytics or CMDB
 */
export function get_metadata(entityType: string): ServiceMetadata | null {
  const services = metadataJson.services as ServiceMetadata[];
  return services.find(s => s.name === entityType) ?? null;
}

/**
 * generate_spl — Convert natural language to SPL query
 * Future: call Splunk Hosted Model or MCP generate_spl endpoint
 */
export function generate_spl(question: string): string {
  if (question.includes('error') || question.includes('exception')) {
    return `index=main level=ERROR | stats count by message | sort -count | head 20`;
  }
  if (question.includes('latency') || question.includes('slow')) {
    return `index=metrics sourcetype=response_time | stats p99(duration_ms) as p99, avg(duration_ms) as avg by service | sort -p99`;
  }
  return `index=main | stats count by host, level | sort -count`;
}

/**
 * explain_spl — Explain what a SPL query does
 * Future: call Splunk AI Assistant or MCP explain_spl endpoint
 */
export function explain_spl(query: string): string {
  if (query.includes('stats count')) return 'Aggregates events by count, useful for finding top patterns.';
  if (query.includes('timechart')) return 'Creates a time-series chart of the specified metric over time.';
  return 'This query searches and analyzes Splunk events based on the specified criteria.';
}

/**
 * get_saved_searches — Retrieve saved Splunk searches
 * Future: call Splunk REST API or MCP saved_searches endpoint
 */
export function get_saved_searches(): string[] {
  return [
    'High Error Rate by Service',
    'Deployment Impact Analysis',
    'P99 Latency Heatmap',
    'Circuit Breaker Status',
    'DB Connection Pool Utilization',
  ];
}

// ─── Analysis Orchestration ────────────────────────────────────────────────

export function buildAnalysisResult(incidentId: string): AnalysisResult {
  const incident = getIncidentById(incidentId);
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const errors = run_splunk_query(`index=main service=${incident.service} level=ERROR`, incident.time_window);
  const deploys = (deployEventsData as DeployEvent[]).filter(d => d.service === incident.service);
  const alerts = (alertsData as AlertEvent[]).filter(a => a.service === incident.service);
  const metadata = get_metadata(incident.service);

  const timeline = _buildTimeline(incident, deploys, alerts, errors);
  const hypotheses = _rankHypotheses(incident, deploys, errors, alerts);
  const blastRadius = _calculateBlastRadius(incident, metadata);

  return {
    incidentId,
    summary: _generateSummary(incident, deploys, errors),
    hypotheses,
    blastRadius,
    recommendedActions: _recommendActions(incident, hypotheses),
    timeline,
    openQuestions: _generateOpenQuestions(incident, deploys),
    topErrors: errors.slice(0, 6),
    deployEvents: deploys,
    affectedServices: blastRadius.services,
    metadata,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Private Helpers ───────────────────────────────────────────────────────

function _extractServiceFromQuery(query: string): string {
  const match = /service=([^\s]+)/.exec(query);
  return match?.[1] ?? '';
}

function _generateSummary(incident: Incident, deploys: DeployEvent[], errors: LogPattern[]): string {
  const recentDeploy = deploys[0];
  const topError = errors[0];
  const deployInfo = recentDeploy
    ? `${recentDeploy.version} was deployed ${_minutesBetween(recentDeploy.timestamp, incident.opened_at)} minutes before incident onset`
    : 'no recent deployments';
  const errorInfo = topError
    ? `Top error pattern: "${topError.pattern.slice(0, 80)}..." occurred ${topError.count} times`
    : 'error data unavailable';
  return `${incident.service} entered a ${incident.severity} state at ${incident.opened_at}. ${deployInfo}. ${errorInfo}. Immediate investigation warranted.`;
}

function _buildTimeline(
  incident: Incident,
  deploys: DeployEvent[],
  alerts: AlertEvent[],
  errors: LogPattern[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const d of deploys.slice(0, 2)) {
    events.push({
      timestamp: d.timestamp,
      event: `Deployment ${d.version} to production by ${d.deployed_by}: ${d.change_summary.slice(0, 80)}`,
      type: 'deploy',
      service: d.service,
    });
  }

  for (const a of alerts) {
    events.push({
      timestamp: a.triggered_at,
      event: `Alert fired: ${a.alert_name} — value ${a.value}${a.unit} exceeded threshold ${a.threshold}${a.unit}`,
      type: 'alert',
      service: a.service,
    });
  }

  if (errors[0]) {
    events.push({
      timestamp: errors[0].first_seen,
      event: `First error pattern detected: ${errors[0].pattern.slice(0, 80)}`,
      type: 'error',
      service: errors[0].service,
    });
  }

  events.push({
    timestamp: incident.opened_at,
    event: `Incident ${incident.id} opened: ${incident.title}`,
    type: 'info',
    service: incident.service,
  });

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function _rankHypotheses(
  incident: Incident,
  deploys: DeployEvent[],
  errors: LogPattern[],
  alerts: AlertEvent[]
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  const recentDeploy = deploys[0];
  if (recentDeploy) {
    const minutesDiff = _minutesBetween(recentDeploy.timestamp, incident.opened_at);
    const confidence = minutesDiff < 10 ? 0.88 : minutesDiff < 30 ? 0.65 : 0.40;
    hypotheses.push({
      title: `Deployment regression (${recentDeploy.version})`,
      confidence,
      category: 'deployment',
      evidence: [
        `${recentDeploy.version} deployed ${minutesDiff}m before incident onset`,
        `Change: ${recentDeploy.change_summary.slice(0, 100)}`,
        errors[0] ? `${errors[0].count} occurrences of connection pool timeout since deploy` : 'Error patterns align with deploy window',
        `Deploy window correlation: ${minutesDiff < 10 ? 'Strong' : minutesDiff < 30 ? 'Moderate' : 'Weak'}`,
      ],
    });
  }

  const dbError = errors.find(e => e.pattern.toLowerCase().includes('timeout') || e.pattern.toLowerCase().includes('pool'));
  if (dbError) {
    hypotheses.push({
      title: 'Database connection pool starvation',
      confidence: 0.74,
      category: 'resource',
      evidence: [
        `"${dbError.pattern.slice(0, 70)}" — ${dbError.count} occurrences`,
        'Pool exhaustion consistent with reduced pool size in recent config change',
        'DB timeout exceptions increased 3.8x post-deploy',
        'Query timeout reduced from 5000ms to 2000ms amplifies pool starvation',
      ],
    });
  }

  const circuitBreaker = alerts.find(a => a.alert_name.includes('CircuitBreaker') || a.alert_name.includes('Error'));
  if (circuitBreaker) {
    hypotheses.push({
      title: 'Upstream dependency cascade',
      confidence: 0.45,
      category: 'dependency',
      evidence: [
        `Alert: ${circuitBreaker.alert_name} triggered at ${circuitBreaker.triggered_at}`,
        'Downstream errors may originate from upstream service degradation',
        'Circuit breaker pattern suggests repeated failure at dependency boundary',
      ],
    });
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence);
}

function _calculateBlastRadius(incident: Incident, metadata: ServiceMetadata | null): BlastRadius {
  const services = [incident.service];
  if (metadata?.dependencies) {
    services.push(...metadata.dependencies.filter(d => !d.includes('postgres') && !d.includes('redis')));
  }
  return {
    services: [...new Set(services)],
    endpoints: incident.affected_endpoints ?? [],
    estimated_users_affected: 12400,
    estimated_revenue_impact: '$4,200/min',
  };
}

function _recommendActions(incident: Incident, hypotheses: Hypothesis[]): string[] {
  const actions: string[] = [];
  const topHypothesis = hypotheses[0];

  if (topHypothesis?.category === 'deployment') {
    actions.push(`Evaluate rollback readiness for ${topHypothesis.title.split('(')[1]?.replace(')', '') ?? 'recent deployment'}`);
    actions.push('Verify deployment diff for connection pool and timeout configuration changes');
  }

  if (hypotheses.some(h => h.category === 'resource')) {
    actions.push('Increase database connection pool size to match pre-deployment baseline (20 connections)');
    actions.push('Restore query timeout to 5000ms to reduce cascading failures');
  }

  actions.push(`Page ${incident.service} on-call owner for immediate triage`);
  actions.push('Enable enhanced logging for DB connection pool metrics');
  actions.push('Check downstream service SLO dashboards for cascade impact');
  actions.push('Prepare stakeholder communication with current blast radius estimate');

  return actions;
}

function _generateOpenQuestions(incident: Incident, deploys: DeployEvent[]): string[] {
  const questions: string[] = [
    'Did database connection pool saturation begin before or immediately after the deployment?',
    `Was the pool size reduction in ${deploys[0]?.version ?? 'recent deploy'} intentional or a misconfiguration?`,
    'Are downstream services (payment-api, inventory-service) experiencing secondary impact?',
    'Is the issue isolated to a single availability zone or affecting all regions?',
    'Has a rollback of the deployment been evaluated and what is the estimated time?',
  ];
  return questions;
}

function _minutesBetween(t1: string, t2: string): number {
  return Math.round(Math.abs(new Date(t2).getTime() - new Date(t1).getTime()) / 60000);
}
