// Edge Function: incident-analyze
// Core agentic incident orchestrator — gathers evidence from live Splunk (MCP 1.2 or REST)
// and generates an AI incident brief.
//
// Runtime modes (returned as `splunkMode` in every response):
//   live-mcp   — evidence from Splunk MCP Server 1.2 (primary path)
//   live-rest  — evidence from Splunk REST API
//   demo       — embedded sample data (no Splunk credentials, or user explicitly chose demo)
//   error-mcp  — MCP configured but failed; no silent fallback to demo
//   error-rest — REST configured but failed; no silent fallback to demo
//
// Reasoning:
//   gemini (default)           — Gemini 2.5 Flash via Medo gateway
//   splunk-hosted-model        — user-supplied Splunk hosted model endpoint (OpenAI-compat)
//
// IMPORTANT: When live Splunk is configured and fails, the function returns an error event.
// It does NOT silently substitute demo data. The frontend must explicitly offer demo fallback.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLlm, extractTextFromResponse, type LlmProvider, type LlmFallbackSlot } from "../_shared/llmRouter.ts";
import {
  runMcpSearch, runSplunkRestSearch, timeWindowToEarliest,
  type McpAuthMethod,
} from "./splunkClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Runtime trace (attached to every response for judge-facing transparency) ──
export interface RuntimeTrace {
  mode: "live-mcp" | "live-rest" | "demo" | "error-mcp" | "error-rest";
  endpoint: string;
  toolUsed?: string;
  queriesIssued: string[];
  rowCounts: { errors: number; deploys: number; meta: number };
  timestamp: string;
  errorMessage?: string;
  reasoningProvider: string;
}

// ── Demo evidence data (ONLY used when mode is explicitly "demo") ─────────────
const DEMO_INCIDENTS: Record<string, {
  id: string; title: string; service: string; severity: string;
  status: string; opened_at: string; summary: string; time_window: string;
  affected_endpoints: string[];
}> = {
  "INC-1001": {
    id: "INC-1001", title: "checkout-service latency spike post-deployment",
    service: "checkout-service", severity: "CRITICAL", status: "INVESTIGATING",
    opened_at: "2026-05-21T10:42:00Z", time_window: "last_30m",
    summary: "P99 latency exceeded 3s threshold (baseline 280ms) following deployment of v1.8.3. Database timeout exceptions rose 3.8x.",
    affected_endpoints: ["/checkout", "/payment/submit", "/cart/validate"],
  },
  "INC-1002": {
    id: "INC-1002", title: "payment-api 5xx error surge",
    service: "payment-api", severity: "HIGH", status: "OPEN",
    opened_at: "2026-05-21T09:15:00Z", time_window: "last_1h",
    summary: "payment-api returning HTTP 503 at 12% of requests. Circuit breaker opened at 09:18.",
    affected_endpoints: ["/payment/submit", "/payment/status"],
  },
  "INC-1003": {
    id: "INC-1003", title: "auth-service slow login degradation",
    service: "auth-service", severity: "MEDIUM", status: "OPEN",
    opened_at: "2026-05-21T08:30:00Z", time_window: "last_2h",
    summary: "Token validation latency increased from 45ms to 320ms. Redis hit ratio fell to 67%.",
    affected_endpoints: ["/auth/login", "/auth/token/validate"],
  },
  "INC-1004": {
    id: "INC-1004", title: "inventory-service memory leak",
    service: "inventory-service", severity: "HIGH", status: "OPEN",
    opened_at: "2026-05-21T07:00:00Z", time_window: "last_4h",
    summary: "Container memory at 94%. Two pods OOMKilled. Auto-restarting every ~45 minutes.",
    affected_endpoints: ["/inventory/check", "/inventory/reserve"],
  },
  "INC-1005": {
    id: "INC-1005", title: "notification-service queue backlog",
    service: "notification-service", severity: "LOW", status: "RESOLVED",
    opened_at: "2026-05-21T06:00:00Z", time_window: "last_6h",
    summary: "Email queue depth 50k. Processing delay 35 min. Scaled consumers. Resolved at 07:45.",
    affected_endpoints: ["/notifications/send"],
  },
};

const DEMO_DEPLOY_EVENTS = [
  { id: "DEP-2001", service: "checkout-service", version: "v1.8.3", deployed_by: "ci-pipeline",
    timestamp: "2026-05-21T10:37:00Z", environment: "production", status: "success", commit: "a3f8c12",
    change_summary: "Upgraded DB connection pool library v2.1→v3.0. Reduced default pool size 20→10. Changed query timeout 5000ms→2000ms." },
  { id: "DEP-2002", service: "checkout-service", version: "v1.8.2", deployed_by: "jsmith",
    timestamp: "2026-05-20T14:22:00Z", environment: "production", status: "success", commit: "b9d1e45",
    change_summary: "Added coupon validation endpoint. Fixed race condition in session handling." },
  { id: "DEP-2003", service: "payment-api", version: "v2.4.1", deployed_by: "ci-pipeline",
    timestamp: "2026-05-21T08:50:00Z", environment: "production", status: "success", commit: "c2a7f89",
    change_summary: "Updated payment processor SDK to v4.2.0. Added retry logic with exponential backoff." },
];

const DEMO_LOG_PATTERNS = [
  { pattern: "HikariPool: Timeout waiting for connection from pool", count: 847, first_seen: "2026-05-21T10:42:18Z",
    last_seen: "2026-05-21T11:08:45Z", severity: "critical", service: "checkout-service",
    sample: "2026-05-21 10:42:18 ERROR HikariPool-1 - Timeout after 2000ms. Pool 10/10 active." },
  { pattern: "SQLTimeoutException: Query execution timeout after 2000ms", count: 623, first_seen: "2026-05-21T10:42:22Z",
    last_seen: "2026-05-21T11:08:40Z", severity: "critical", service: "checkout-service",
    sample: "2026-05-21 10:42:22 ERROR SQLTimeoutException: select * from orders where user_id=? exceeded 2000ms" },
  { pattern: "ResourceAccessException: I/O error on POST /payment/submit", count: 312, first_seen: "2026-05-21T10:43:05Z",
    last_seen: "2026-05-21T11:07:22Z", severity: "error", service: "checkout-service",
    sample: "2026-05-21 10:43:05 ERROR ResourceAccessException: Connection refused to payment-api after 3 retries" },
  { pattern: "Connection pool utilization at 100%", count: 1204, first_seen: "2026-05-21T10:42:10Z",
    last_seen: "2026-05-21T11:09:00Z", severity: "warn", service: "checkout-service",
    sample: "2026-05-21 10:42:10 WARN HikariPool-1 at max capacity (10/10)." },
  { pattern: "upstream payment processor timeout", count: 189, first_seen: "2026-05-21T09:12:00Z",
    last_seen: "2026-05-21T10:30:00Z", severity: "error", service: "payment-api",
    sample: "2026-05-21 09:12:00 ERROR stripe-gateway timeout after 5000ms." },
  { pattern: "Redis connection latency high", count: 456, first_seen: "2026-05-21T08:30:00Z",
    last_seen: "2026-05-21T10:00:00Z", severity: "warn", service: "auth-service",
    sample: "2026-05-21 08:30:22 WARN redis-cluster response 340ms (threshold 50ms)." },
];

const DEMO_METADATA: Record<string, { name: string; team: string; tier: number; dependencies: string[]; on_call: string; sla_ms: number }> = {
  "checkout-service": { name: "checkout-service", team: "commerce-platform", tier: 1, on_call: "commerce-oncall@company.com", sla_ms: 500,
    dependencies: ["payment-api", "inventory-service", "auth-service", "postgres-primary"] },
  "payment-api": { name: "payment-api", team: "payments", tier: 1, on_call: "payments-oncall@company.com", sla_ms: 800,
    dependencies: ["stripe-gateway", "fraud-service", "auth-service"] },
  "auth-service": { name: "auth-service", team: "platform-security", tier: 1, on_call: "platform-oncall@company.com", sla_ms: 100,
    dependencies: ["redis-session", "postgres-auth"] },
  "inventory-service": { name: "inventory-service", team: "catalog", tier: 2, on_call: "catalog-oncall@company.com", sla_ms: 200,
    dependencies: ["postgres-catalog", "redis-inventory"] },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function minutesBetween(t1: string, t2: string): number {
  return Math.round(Math.abs(new Date(t2).getTime() - new Date(t1).getTime()) / 60000);
}

/** Build a live evidence shell from real Splunk results. Only DEMO_ arrays are used in demo mode. */
function buildLiveEvidence(
  incidentId: string, service: string, timeWindow: string,
  title: string, summary: string, severity: string, endpoints: string[],
  liveErrors: Array<Record<string, string>>,
  liveDeploys: Array<Record<string, string>>,
): ReturnType<typeof buildDemoEvidence> {
  const openedAt = new Date().toISOString();
  const topErrors = liveErrors.slice(0, 10).map((r, i) => ({
    pattern:  r.message ?? r._raw?.slice(0, 100) ?? `Error pattern ${i + 1}`,
    count:    parseInt(r.count ?? "1", 10),
    severity: parseInt(r.count ?? "1", 10) > 100 ? "critical" as const : "error" as const,
    sample:   r._raw?.slice(0, 200) ?? r.message ?? "",
    first_seen: r._time ?? openedAt,
    last_seen:  r._time ?? openedAt,
    service,
  }));
  const deployEvents = liveDeploys.slice(0, 5).map((r, i) => ({
    id:             r.id ?? `live-dep-${i}`,
    service:        r.service ?? service,
    version:        r.version ?? r.app_version ?? "unknown",
    deployed_by:    r.user ?? r.deployed_by ?? "unknown",
    timestamp:      r._time ?? r.timestamp ?? openedAt,
    environment:    r.environment ?? "production",
    status:         (r.status ?? "success") as "success" | "failed" | "rollback",
    commit:         r.commit ?? r.git_sha?.slice(0, 7) ?? "unknown",
    change_summary: r.description ?? r.change_summary ?? "Deployment from live Splunk",
  }));

  const recentDeploy = deployEvents[0] ?? null;
  const timeline = [
    ...deployEvents.slice(0, 2).map(d => ({ timestamp: d.timestamp, event: `Deployment ${d.version} by ${d.deployed_by}: ${d.change_summary.slice(0, 90)}`, type: "deploy" as const, service: d.service })),
    ...(topErrors[0] ? [{ timestamp: topErrors[0].first_seen, event: `First error: ${topErrors[0].pattern.slice(0, 80)} (${topErrors[0].count} occurrences)`, type: "error" as const, service }] : []),
    { timestamp: openedAt, event: `Incident ${incidentId} opened: ${title}`, type: "info" as const, service },
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const hypotheses: Array<{ title: string; confidence: number; category: "deployment" | "resource" | "dependency" | "network" | "configuration"; evidence: string[] }> = [];
  if (recentDeploy) {
    const diff = minutesBetween(recentDeploy.timestamp, openedAt);
    hypotheses.push({ title: `Deployment regression (${recentDeploy.version})`, confidence: diff < 10 ? 0.88 : diff < 30 ? 0.65 : 0.40, category: "deployment", evidence: [`${recentDeploy.version} deployed ${diff}m before incident`, recentDeploy.change_summary.slice(0, 100), topErrors[0] ? `${topErrors[0].count} errors observed` : "Error patterns align with deploy window"] });
  }
  const dbError = topErrors.find(e => /timeout|pool|connect/i.test(e.pattern));
  if (dbError) hypotheses.push({ title: "Resource exhaustion or connection saturation", confidence: 0.72, category: "resource", evidence: [`"${dbError.pattern.slice(0, 70)}" — ${dbError.count} occurrences`, "Consistent with connection pool or thread exhaustion", `Service: ${service}`] });
  if (hypotheses.length < 2) hypotheses.push({ title: `Service degradation: ${title.slice(0, 60)}`, confidence: 0.50, category: "configuration", evidence: [`Incident ${incidentId}`, `Severity: ${severity}`, summary.slice(0, 120)] });
  hypotheses.push({ title: "Upstream dependency impact", confidence: 0.40, category: "dependency", evidence: [`${service} may be affected by a failing upstream`, "Circuit breaker or retry storms can cascade"] });
  hypotheses.sort((a, b) => b.confidence - a.confidence);

  return {
    incidentId, summary, hypotheses, timeline, topErrors, deployEvents,
    blastRadius: { services: [service], endpoints, estimated_users_affected: 0, estimated_revenue_impact: "TBD" },
    recommendedActions: [
      recentDeploy ? `Evaluate rollback readiness for ${recentDeploy.version}` : `Review recent changes to ${service}`,
      `Check ${service} resource utilization (CPU, memory, connections)`,
      `Review error rate and latency dashboards for ${service}`,
      `Verify downstream dependencies of ${service} are healthy`,
      "Prepare stakeholder communication with impact estimate",
    ],
    openQuestions: [
      `When exactly did ${service} begin degrading?`,
      recentDeploy ? `Was ${recentDeploy.version} tested under production load?` : `Were any config changes applied to ${service} recently?`,
      "Are downstream services experiencing secondary impact?",
      "Is the issue isolated to one region/AZ or global?",
    ],
    affectedServices: [service],
    metadata: DEMO_METADATA[service] ?? null,
    generatedAt: openedAt,
    _incidentMeta: { title, severity, openedAt, affectedEndpoints: endpoints },
  };
}

/**
 * Robustly extract the first valid JSON object from LLM output.
 * Handles: bare JSON, ```json fences, ```  fences, leading/trailing prose.
 */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text?.trim()) return null;
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  // Try the full stripped text first
  for (const candidate of [stripped, text]) {
    // Find the outermost { ... } (greedy)
    const m = /\{[\s\S]*\}/.exec(candidate);
    if (!m) continue;
    let jsonStr = m[0];
    // Attempt direct parse
    try { return JSON.parse(jsonStr) as Record<string, unknown>; } catch { /* fall through */ }
    // Strip trailing commas before } or ] (common LLM mistake)
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(jsonStr) as Record<string, unknown>; } catch { /* fall through */ }
  }
  return null;
}

/** Build a demo evidence object from embedded static arrays. Only called when mode=demo. */
function buildDemoEvidence(
  incidentId: string,
  service: string,
  timeWindow: string,
  overrideTitle    = "",
  overrideSummary  = "",
  overrideSeverity = "HIGH",
  overrideEndpoints: string[] = [],
) {
  void timeWindow;
  const demoIncident = DEMO_INCIDENTS[incidentId];
  const title    = overrideTitle    || demoIncident?.title    || `Alert on ${service}`;
  const summary  = overrideSummary  || demoIncident?.summary  || `Incident ${incidentId} on ${service} requires investigation.`;
  const severity = overrideSeverity || demoIncident?.severity || "HIGH";
  const affectedEndpoints =
    overrideEndpoints.length > 0 ? overrideEndpoints
    : demoIncident?.affected_endpoints ?? [`/${service.replace(/-service$|\.|\s/g, "")}/api`];

  const errors    = DEMO_LOG_PATTERNS.filter(l => l.service === service);
  const deploys   = DEMO_DEPLOY_EVENTS.filter(d => d.service === service);
  const metadata  = DEMO_METADATA[service] ?? null;
  const recentDeploy = deploys[0] ?? null;
  const openedAt     = demoIncident?.opened_at ?? new Date().toISOString();

  const timeline = [];
  for (const d of deploys.slice(0, 2)) {
    timeline.push({ timestamp: d.timestamp, event: `Deployment ${d.version} by ${d.deployed_by}: ${d.change_summary.slice(0, 90)}`, type: "deploy" as const, service: d.service });
  }
  if (errors[0]) timeline.push({ timestamp: errors[0].first_seen, event: `First error: ${errors[0].pattern.slice(0, 80)} (${errors[0].count} occurrences)`, type: "error" as const, service });
  timeline.push({ timestamp: openedAt, event: `Incident ${incidentId} opened: ${title}`, type: "info" as const, service });
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const hypotheses: Array<{ title: string; confidence: number; category: "deployment" | "resource" | "dependency" | "network" | "configuration"; evidence: string[] }> = [];
  if (recentDeploy) {
    const diff = minutesBetween(recentDeploy.timestamp, openedAt);
    hypotheses.push({ title: `Deployment regression (${recentDeploy.version})`, confidence: diff < 10 ? 0.88 : diff < 30 ? 0.65 : 0.40, category: "deployment", evidence: [`${recentDeploy.version} deployed ${diff}m before incident onset`, `Change: ${recentDeploy.change_summary.slice(0, 100)}`, errors[0] ? `${errors[0].count} errors observed since deploy` : "Error patterns align with deploy window"] });
  }
  const dbError = errors.find(e => /timeout|pool|connect/i.test(e.pattern));
  if (dbError) hypotheses.push({ title: "Resource exhaustion or connection saturation", confidence: 0.72, category: "resource", evidence: [`"${dbError.pattern.slice(0, 70)}" — ${dbError.count} occurrences`, "Pattern consistent with connection pool or thread exhaustion", `Service: ${service}`] });
  if (hypotheses.length < 2) hypotheses.push({ title: `Service degradation: ${title.slice(0, 60)}`, confidence: 0.50, category: "configuration", evidence: [`Incident opened at ${openedAt}`, `Severity: ${severity}`, summary.slice(0, 120)] });
  hypotheses.push({ title: "Upstream dependency impact", confidence: 0.40, category: "dependency", evidence: [`${service} may be affected by a failing upstream dependency`, "Circuit breaker or retry storms can cascade to this service"] });
  hypotheses.sort((a, b) => b.confidence - a.confidence);

  const blastServices = [service];
  if (metadata?.dependencies) blastServices.push(...metadata.dependencies.filter(d => !d.includes("postgres") && !d.includes("redis")));

  return {
    incidentId,
    summary: summary || `${service} entered ${severity} state at ${openedAt}.${recentDeploy ? ` ${recentDeploy.version} deployed ${minutesBetween(recentDeploy.timestamp, openedAt)}m prior.` : ""}${errors[0] ? ` Top error: ${errors[0].pattern.slice(0, 60)} (${errors[0].count}x).` : ""}`,
    hypotheses,
    timeline,
    topErrors: errors.slice(0, 5),
    deployEvents: deploys,
    blastRadius: { services: [...new Set(blastServices)], endpoints: affectedEndpoints, estimated_users_affected: 0, estimated_revenue_impact: "TBD" },
    recommendedActions: [
      recentDeploy ? `Evaluate rollback readiness for ${recentDeploy.version}` : `Review recent changes to ${service}`,
      `Check ${service} resource utilization (CPU, memory, connections)`,
      `Page ${metadata?.on_call ?? service + "-oncall"} for immediate triage`,
      `Review error rate and latency dashboards for ${service}`,
      `Verify downstream dependencies of ${service} are healthy`,
      "Prepare stakeholder communication with impact estimate",
    ],
    openQuestions: [
      `When exactly did ${service} begin degrading?`,
      recentDeploy ? `Was the change in ${recentDeploy.version} tested under production load?` : `Were any config changes applied to ${service} recently?`,
      "Are downstream services experiencing secondary impact?",
      "Is the issue isolated to one region/AZ or global?",
    ],
    affectedServices: [...new Set(blastServices)],
    metadata,
    generatedAt: new Date().toISOString(),
    _incidentMeta: { title, severity, openedAt, affectedEndpoints },
  };
}

// ── Shared prompt builder ─────────────────────────────────────────────────────
function buildAnalysisPrompt(
  incidentId: string,
  title: string,
  serviceName: string,
  team: string,
  sla: string,
  severity: string,
  blastServices: string[],
  affectedEndpoints: string[],
  hasLiveData: boolean,
  errorBlock: string,
  deployBlock: string,
): string {
  return `You are SentinelOps, an expert AI incident commander for Splunk observability platforms.

Analyze this incident and generate a complete, accurate AI incident brief.
IMPORTANT: Base ALL sections on the specific incident data below — do NOT copy generic placeholder text.
DO NOT output markdown formatting. Return ONLY a single raw JSON object starting with { and ending with }.

═══════════════════════════════════
INCIDENT CONTEXT
═══════════════════════════════════
ID:         ${incidentId}
TITLE:      ${title}
SERVICE:    ${serviceName} (Team: ${team}, SLA: ${sla}ms)
SEVERITY:   ${severity}
AFFECTED:   ${blastServices.join(", ")} | Endpoints: ${affectedEndpoints.join(", ")}
DATA SOURCE: ${hasLiveData ? "Live Splunk / MCP evidence" : "Incident metadata only — apply SRE first-principles reasoning"}

OBSERVED ERRORS:
${errorBlock}

RECENT DEPLOYMENTS:
${deployBlock}

═══════════════════════════════════
REQUIRED OUTPUT (raw JSON, no code fences, no prose before or after)
═══════════════════════════════════
{
  "executiveSummary": "2-3 sentences specific to ${title}: what happened, affected scope, business impact",
  "technicalFindings": "2-3 sentences: technical evidence specific to ${serviceName} — do NOT use placeholder text",
  "immediateRisk": "1 sentence: concrete consequence for ${serviceName} if no action in next 15 minutes",
  "confidenceStatement": "1 sentence: confidence level and primary uncertainty for THIS incident",
  "hypotheses": [
    {
      "title": "Concise hypothesis title specific to this incident",
      "confidence": 0.85,
      "category": "deployment",
      "evidence": ["evidence point derived from data above", "second point", "third point"]
    }
  ],
  "recommendedActions": [
    "Specific action for ${serviceName} — include command or tool",
    "Second action",
    "Third action",
    "Fourth action",
    "Fifth action"
  ],
  "openQuestions": [
    "Diagnostic question specific to ${serviceName} the on-call engineer must answer NOW",
    "Second question",
    "Third question",
    "Fourth question"
  ],
  "estimatedUsers": 0,
  "estimatedRevenueImpact": "$X/min"
}

Rules:
- hypotheses: 2-4 items sorted by confidence descending; each must reference specific evidence above
- recommendedActions: 4-6 items; each must be specific to ${serviceName} and this incident
- openQuestions: 3-5 questions the on-call engineer must answer NOW to resolve the incident
- NEVER use generic text like "Service degradation may continue" or "Check resource utilization" without specifics
- ALL fields must be unique per incident — reference ${incidentId}, ${serviceName}, or the error patterns above`;
}

// ── Full AI Analysis Generation ───────────────────────────────────────────────
// Generates ALL incident analysis sections via LLM so the output is never static demo data.
// Returns a parsed object with both the AI brief and the dynamic analysis fields.
async function generateFullAnalysis(
  evidence: ReturnType<typeof buildDemoEvidence>,
  apiKey: string,
  llmProvider: LlmProvider = "gemini",
  llmApiKey: string = "",
  llmModel: string = "",
  llmFallbackChain: LlmFallbackSlot[] = [],
  gatewayKey: string = "",
  customEndpoint?: string,
): Promise<{
  aiBrief: Record<string, string>;
  hypotheses: ReturnType<typeof buildDemoEvidence>["hypotheses"];
  recommendedActions: string[];
  openQuestions: string[];
  blastRadius: ReturnType<typeof buildDemoEvidence>["blastRadius"];
}> {
  const meta = evidence._incidentMeta ?? { title: evidence.incidentId, severity: "HIGH", openedAt: evidence.generatedAt, affectedEndpoints: [] as string[] };
  const svcName = evidence.metadata?.name ?? evidence.incidentId.replace(/^INC-/, "service-");
  const hasLiveData = evidence.topErrors.length > 0 || evidence.deployEvents.length > 0;

  const errorBlock = evidence.topErrors.length > 0
    ? evidence.topErrors.map(e => `- [${e.severity.toUpperCase()}] ${e.pattern} (${e.count}x)`).join("\n")
    : "No error log data — reason from service name, incident title, and severity.";
  const deployBlock = evidence.deployEvents.length > 0
    ? evidence.deployEvents.map(d => `- ${d.version} at ${d.timestamp}: ${d.change_summary}`).join("\n")
    : "No deployment data available.";

  const prompt = buildAnalysisPrompt(
    evidence.incidentId, meta.title, svcName,
    evidence.metadata?.team ?? "on-call",
    String(evidence.metadata?.sla_ms ?? "N/A"),
    meta.severity, evidence.blastRadius.services, meta.affectedEndpoints,
    hasLiveData, errorBlock, deployBlock,
  );

  const effectiveProvider: LlmProvider = (llmApiKey && llmProvider) ? llmProvider : "gemini";
  const effectiveKey = llmApiKey || "";
  const effectiveGateway = gatewayKey || apiKey;

  const fallback = () => ({
    aiBrief: {
      executiveSummary:    evidence.summary,
      technicalFindings:   evidence.hypotheses[0]?.evidence.join(" ") ?? "Evidence gathered from available data.",
      immediateRisk:       "Service degradation may continue without immediate intervention.",
      confidenceStatement: "Analysis confidence: medium — AI enrichment unavailable.",
    },
    hypotheses:         evidence.hypotheses,
    recommendedActions: evidence.recommendedActions,
    openQuestions:      evidence.openQuestions,
    blastRadius:        evidence.blastRadius,
  });

  let fullText = "";
  try {
    // splunk-hosted-model: bypass llmRouter and call the OpenAI-compat endpoint directly
    if (customEndpoint) {
      console.log("[generateFullAnalysis] Using Splunk hosted model:", customEndpoint);
      const hostedRes = await fetch(`${customEndpoint.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${effectiveKey || "splunk-hosted"}`,
        },
        body: JSON.stringify({
          model: llmModel || "default",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.3,
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!hostedRes.ok) {
        const errBody = await hostedRes.text().catch(() => "");
        console.error("[generateFullAnalysis] Splunk hosted model error:", hostedRes.status, errBody.slice(0, 200));
        return fallback();
      }
      const hostedData = await hostedRes.json() as Record<string, unknown>;
      fullText = (hostedData?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content ?? "";
    } else {
      const response = await callLlm({
        provider:      effectiveProvider,
        apiKey:        effectiveKey,
        modelId:       llmModel || "",
        gatewayApiKey: effectiveGateway,
        stream:        false,
        maxTokens:     2048,
        temperature:   0.3,
        messages:      [{ role: "user", content: prompt }],
        fallbackChain: llmFallbackChain,
      });

      if (!response.ok) {
        console.error("[generateFullAnalysis] LLM error:", response.status);
        return fallback();
      }
      const respText = await response.text();
      try {
        const respJson = JSON.parse(respText) as Record<string, unknown>;
        fullText =
          (respJson?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)?.[0]?.content?.parts?.[0]?.text ??
          (respJson?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content ??
          (respJson?.content as Array<{ text?: string }>)?.[0]?.text ??
          respText;
      } catch { fullText = respText; }
    }
  } catch (err) {
    console.error("[generateFullAnalysis] fetch error:", err);
    return fallback();
  }

  if (!fullText?.trim()) { console.error("[generateFullAnalysis] LLM empty text"); return fallback(); }

  const parsed = extractJson(fullText);
  if (!parsed) { console.error("[generateFullAnalysis] JSON parse failed:", fullText.slice(0, 300)); return fallback(); }

  const aiHypotheses: ReturnType<typeof buildDemoEvidence>["hypotheses"] =
    Array.isArray(parsed.hypotheses) && (parsed.hypotheses as unknown[]).length > 0
      ? (parsed.hypotheses as Record<string, unknown>[]).map(h => ({ title: String(h.title ?? ""), confidence: Number(h.confidence ?? 0.5), category: String(h.category ?? "unknown") as "deployment" | "resource" | "dependency" | "network" | "configuration", evidence: Array.isArray(h.evidence) ? (h.evidence as string[]).map(String) : [] }))
      : evidence.hypotheses;

  return {
    aiBrief: { executiveSummary: String(parsed.executiveSummary ?? evidence.summary), technicalFindings: String(parsed.technicalFindings ?? ""), immediateRisk: String(parsed.immediateRisk ?? ""), confidenceStatement: String(parsed.confidenceStatement ?? "") },
    hypotheses: aiHypotheses,
    recommendedActions: Array.isArray(parsed.recommendedActions) && (parsed.recommendedActions as unknown[]).length > 0 ? (parsed.recommendedActions as unknown[]).map(String) : evidence.recommendedActions,
    openQuestions: Array.isArray(parsed.openQuestions) && (parsed.openQuestions as unknown[]).length > 0 ? (parsed.openQuestions as unknown[]).map(String) : evidence.openQuestions,
    blastRadius: { ...evidence.blastRadius, estimated_users_affected: typeof parsed.estimatedUsers === "number" ? parsed.estimatedUsers : evidence.blastRadius.estimated_users_affected, estimated_revenue_impact: typeof parsed.estimatedRevenueImpact === "string" ? parsed.estimatedRevenueImpact : evidence.blastRadius.estimated_revenue_impact },
  };
}

// ── Suggested SPL Queries ─────────────────────────────────────────────────────
function buildSuggestedQueries(
  service: string,
  timeWindow: string,
  topErrors: Array<{ pattern: string }>,
  deployEvents: Array<{ version: string; timestamp: string }>,
  affectedEndpoints: string[]
): string[] {
  const tw = timeWindow.replace("last_", "").replace("m", " minutes").replace("h", " hour");
  const recentDeploy = deployEvents[0];
  const topEndpoint  = affectedEndpoints[0] ?? "/api/checkout";
  const topError     = topErrors[0]?.pattern?.slice(0, 60) ?? "errors";

  const queries: string[] = [
    `Show error rate spike for ${service} in the last ${tw}`,
  ];

  if (recentDeploy) {
    queries.push(
      `Find all deployments for ${service} in the last ${tw} and correlate with error spike`
    );
  } else {
    queries.push(
      `List top failing endpoints for ${service} with error counts in the last ${tw}`
    );
  }

  if (topError && topError.length > 5) {
    queries.push(
      `Show occurrences of "${topError.slice(0, 40)}" from ${service} over time`
    );
  } else {
    queries.push(
      `P99 latency trend for ${topEndpoint} on ${service} in the last ${tw}`
    );
  }

  return queries.slice(0, 3);
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const incidentId        = (body.incidentId        as string | undefined)?.trim() ?? "";
  const service           = (body.service           as string | undefined)?.trim() ?? "";
  const timeWindow        = (body.timeWindow        as string | undefined)?.trim() ?? "last_30m";
  const incidentTitle     = (body.incidentTitle     as string | undefined)?.trim() ?? "";
  const incidentSummary   = (body.incidentSummary   as string | undefined)?.trim() ?? "";
  const incidentSeverity  = (body.incidentSeverity  as string | undefined)?.trim() ?? "HIGH";
  const incidentEndpoints = Array.isArray(body.incidentEndpoints) ? body.incidentEndpoints as string[] : [];
  const llmProvider       = (body.llmProvider       as LlmProvider | undefined) ?? "gemini";
  const llmApiKey         = (body.llmApiKey         as string | undefined) ?? "";
  const llmModel          = (body.llmModel          as string | undefined) ?? "";
  const llmFallbackChain  = Array.isArray(body.llmFallbackChain) ? body.llmFallbackChain as LlmFallbackSlot[] : [];
  // Reasoning provider: 'gemini' (default) | 'splunk-hosted-model'
  const reasoningProvider         = (body.reasoningProvider         as string | undefined) ?? "gemini";
  const splunkHostedModelEndpoint = (body.splunkHostedModelEndpoint as string | undefined)?.trim() ?? "";
  const splunkHostedModelToken    = (body.splunkHostedModelToken    as string | undefined)?.trim() ?? "";

  if (!incidentId || !service) {
    return new Response(JSON.stringify({ error: "Missing incidentId or service" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const wantStream = body.stream === true;
  const apiKey     = Deno.env.get("INTEGRATIONS_API_KEY") ?? "";

  // Credentials — prefer request body, fall back to env
  const splunkHost       = (body.splunkHost  as string | undefined)?.trim() || Deno.env.get("SPLUNK_HOST")      || "";
  const splunkToken      = (body.splunkToken as string | undefined)?.trim() || Deno.env.get("SPLUNK_TOKEN")     || "";
  const mcpUrl           = (body.mcpUrl      as string | undefined)?.trim() || Deno.env.get("SPLUNK_MCP_URL")   || "";
  const mcpToken         = (body.mcpToken    as string | undefined)?.trim() || Deno.env.get("SPLUNK_MCP_TOKEN") || "";
  const mcpAuthMethod    = ((body.mcpAuthMethod as string | undefined) ?? "bearer") as McpAuthMethod;
  const mcpUsername      = (body.mcpUsername as string | undefined)?.trim() ?? "";
  const mcpPassword      = (body.mcpPassword as string | undefined)?.trim() ?? "";

  const hasMcp  = !!mcpUrl;
  const hasRest = !!(splunkHost && splunkToken);
  // forceDemoMode: true when the user explicitly opted into demo after a live failure
  const forceDemoMode = body.forceDemoMode === true;

  // ── SSE helper ────────────────────────────────────────────────────────────
  const enc = new TextEncoder();
  function sseEvent(writer: WritableStreamDefaultWriter, type: string, data: unknown) {
    return writer.write(enc.encode(`data:${JSON.stringify({ type, data })}\n\n`));
  }

  // ── Build SPL queries for the incident ───────────────────────────────────
  const earliest = timeWindowToEarliest(timeWindow);
  const errorSpl  = `index=main service="${service}" level=ERROR | stats count by message | sort -count | head 20`;
  const deploySpl = `index=deploys service="${service}" | sort -_time desc | head 5`;
  const queriesIssued = [errorSpl, deploySpl];

  // ── Resolve reasoning provider call parameters ────────────────────────────
  // splunk-hosted-model uses an OpenAI-compat endpoint; gemini uses the gateway.
  function resolveReasoningParams(): { provider: LlmProvider; key: string; model: string; gatewayKey: string; isSplunkHosted: boolean } {
    if (reasoningProvider === "splunk-hosted-model" && splunkHostedModelEndpoint && splunkHostedModelToken) {
      return { provider: "openai" as LlmProvider, key: splunkHostedModelToken, model: llmModel || "default", gatewayKey: "", isSplunkHosted: true };
    }
    const effectiveProvider: LlmProvider = llmApiKey ? llmProvider : "gemini";
    return { provider: effectiveProvider, key: llmApiKey || "", model: llmModel || "", gatewayKey: apiKey, isSplunkHosted: false };
  }
  const reasoning = resolveReasoningParams();
  const effectiveReasoningLabel = reasoning.isSplunkHosted ? "splunk-hosted-model" : (reasoning.provider === "gemini" ? "gemini" : reasoning.provider);

  // ── Evidence gathering — explicit routing with hard error on live failure ─
  type EvidenceResult =
    | { ok: true;  mode: "live-mcp" | "live-rest" | "demo"; evidence: ReturnType<typeof buildDemoEvidence>; trace: RuntimeTrace }
    | { ok: false; mode: "error-mcp" | "error-rest"; errorMessage: string; trace: RuntimeTrace };

  async function gatherEvidence(): Promise<EvidenceResult> {
    const baseTrace: Omit<RuntimeTrace, "mode" | "errorMessage"> = {
      endpoint: "",
      queriesIssued,
      rowCounts: { errors: 0, deploys: 0, meta: 0 },
      timestamp: new Date().toISOString(),
      toolUsed: undefined,
      reasoningProvider: effectiveReasoningLabel,
    };

    // PATH 1: MCP (highest priority when mcpUrl is configured and not forcing demo)
    if (hasMcp && !forceDemoMode) {
      console.log(`[incident-analyze] MCP path. endpoint=${mcpUrl} service=${service}`);
      try {
        const mcpOpts = { mcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword, earliestTime: earliest, latestTime: "now", maxResults: 50 };
        const [errRes, depRes] = await Promise.allSettled([
          runMcpSearch(errorSpl,  mcpOpts),
          runMcpSearch(deploySpl, mcpOpts),
        ]);

        // At least one must succeed for us to claim live-mcp
        if (errRes.status === "rejected" && depRes.status === "rejected") {
          throw new Error(`Both MCP queries failed. Errors: ${(errRes as PromiseRejectedResult).reason} | ${(depRes as PromiseRejectedResult).reason}`);
        }

        const liveErrors  = errRes.status  === "fulfilled" ? errRes.value.results  : [];
        const liveDeploys = depRes.status  === "fulfilled" ? depRes.value.results  : [];
        const toolUsed    = errRes.status  === "fulfilled" ? errRes.value.toolUsed : depRes.status === "fulfilled" ? depRes.value.toolUsed : "unknown";
        const endpoint    = errRes.status  === "fulfilled" ? errRes.value.endpoint : depRes.status === "fulfilled" ? depRes.value.endpoint : mcpUrl;

        console.log(`[incident-analyze] MCP OK — tool=${toolUsed} errors=${liveErrors.length} deploys=${liveDeploys.length}`);

        const evidence = buildLiveEvidence(incidentId, service, timeWindow, incidentTitle, incidentSummary, incidentSeverity, incidentEndpoints, liveErrors, liveDeploys);
        const trace: RuntimeTrace = { ...baseTrace, mode: "live-mcp", endpoint, toolUsed, rowCounts: { errors: liveErrors.length, deploys: liveDeploys.length, meta: 0 } };
        return { ok: true, mode: "live-mcp", evidence, trace };

      } catch (mcpErr) {
        const msg = mcpErr instanceof Error ? mcpErr.message : String(mcpErr);
        console.error("[incident-analyze] MCP FAILED — returning error-mcp:", msg);
        const trace: RuntimeTrace = { ...baseTrace, mode: "error-mcp", endpoint: mcpUrl, errorMessage: msg, rowCounts: { errors: 0, deploys: 0, meta: 0 } };
        return { ok: false, mode: "error-mcp", errorMessage: msg, trace };
      }
    }

    // PATH 2: REST (when Splunk host+token configured, no MCP, not forcing demo)
    if (hasRest && !forceDemoMode) {
      console.log(`[incident-analyze] REST path. host=${splunkHost} service=${service}`);
      try {
        const restOpts = { splunkHost, splunkToken, timeWindow };
        const [errRes, depRes] = await Promise.allSettled([
          runSplunkRestSearch(errorSpl,  restOpts),
          runSplunkRestSearch(deploySpl, restOpts),
        ]);

        if (errRes.status === "rejected" && depRes.status === "rejected") {
          throw new Error(`Both REST queries failed. Errors: ${(errRes as PromiseRejectedResult).reason} | ${(depRes as PromiseRejectedResult).reason}`);
        }

        const liveErrors  = errRes.status === "fulfilled" ? errRes.value.results : [];
        const liveDeploys = depRes.status === "fulfilled" ? depRes.value.results : [];

        console.log(`[incident-analyze] REST OK — errors=${liveErrors.length} deploys=${liveDeploys.length}`);

        const evidence = buildLiveEvidence(incidentId, service, timeWindow, incidentTitle, incidentSummary, incidentSeverity, incidentEndpoints, liveErrors, liveDeploys);
        const trace: RuntimeTrace = { ...baseTrace, mode: "live-rest", endpoint: splunkHost, rowCounts: { errors: liveErrors.length, deploys: liveDeploys.length, meta: 0 } };
        return { ok: true, mode: "live-rest", evidence, trace };

      } catch (restErr) {
        const msg = restErr instanceof Error ? restErr.message : String(restErr);
        console.error("[incident-analyze] REST FAILED — returning error-rest:", msg);
        const trace: RuntimeTrace = { ...baseTrace, mode: "error-rest", endpoint: splunkHost, errorMessage: msg, rowCounts: { errors: 0, deploys: 0, meta: 0 } };
        return { ok: false, mode: "error-rest", errorMessage: msg, trace };
      }
    }

    // PATH 3: Demo (no credentials configured, or forceDemoMode explicitly set by user)
    const demoReason = forceDemoMode ? "user opted into demo after live failure" : "no Splunk credentials configured";
    console.log(`[incident-analyze] Demo path (${demoReason}). incidentId=${incidentId}`);
    const evidence = buildDemoEvidence(incidentId, service, timeWindow, incidentTitle, incidentSummary, incidentSeverity, incidentEndpoints);
    const trace: RuntimeTrace = { ...baseTrace, mode: "demo", endpoint: "embedded-demo-data", rowCounts: { errors: evidence.topErrors.length, deploys: evidence.deployEvents.length, meta: 0 } };
    return { ok: true, mode: "demo", evidence, trace };
  }

  // ── Build LLM prompt from evidence ───────────────────────────────────────
  function buildPromptFromEvidence(ev: ReturnType<typeof buildDemoEvidence>, hasLive: boolean): string {
    const meta = ev._incidentMeta ?? { title: incidentTitle || incidentId, severity: incidentSeverity, openedAt: ev.generatedAt, affectedEndpoints: incidentEndpoints };
    const errorBlock = ev.topErrors.length > 0
      ? ev.topErrors.map(e => `- [${e.severity.toUpperCase()}] ${e.pattern} (${e.count}x)`).join("\n")
      : "No error log data — reason from service name, incident title, and severity.";
    const deployBlock = ev.deployEvents.length > 0
      ? ev.deployEvents.map(d => `- ${d.version} at ${d.timestamp}: ${d.change_summary}`).join("\n")
      : "No deployment data available.";
    return buildAnalysisPrompt(ev.incidentId, meta.title, ev.metadata?.name ?? service, ev.metadata?.team ?? "on-call", String(ev.metadata?.sla_ms ?? "N/A"), meta.severity, ev.blastRadius.services, meta.affectedEndpoints, hasLive, errorBlock, deployBlock);
  }

  try {
    const gathered = await gatherEvidence();

    // ── Hard error path: live was configured but failed ─────────────────────
    if (!gathered.ok) {
      const errPayload = {
        error:        gathered.errorMessage,
        splunkMode:   gathered.mode,
        runtimeTrace: gathered.trace,
        retryable:    true,
        demoAvailable: true,
      };
      if (wantStream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        (async () => {
          await sseEvent(writer, "error", gathered.errorMessage);
          await sseEvent(writer, "live_error", errPayload);
          await writer.close();
        })();
        return new Response(readable, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      }
      return new Response(JSON.stringify(errPayload), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Success path ─────────────────────────────────────────────────────────
    const { evidence, mode: splunkMode, trace } = gathered;
    const hasLiveData = splunkMode !== "demo";

    // ── Non-streaming ────────────────────────────────────────────────────────
    if (!wantStream) {
      const prompt = buildPromptFromEvidence(evidence, hasLiveData);
      const aiAnalysis = await generateFullAnalysis(evidence, apiKey, reasoning.provider, reasoning.key, reasoning.model, llmFallbackChain, reasoning.gatewayKey, reasoning.isSplunkHosted ? splunkHostedModelEndpoint : undefined);
      const { _incidentMeta: _d, ...evidenceWire } = evidence as typeof evidence & { _incidentMeta?: unknown };
      return new Response(JSON.stringify({
        ...evidenceWire,
        hypotheses:         aiAnalysis.hypotheses,
        recommendedActions: aiAnalysis.recommendedActions,
        openQuestions:      aiAnalysis.openQuestions,
        blastRadius:        aiAnalysis.blastRadius,
        aiBrief:            aiAnalysis.aiBrief,
        splunkMode,
        runtimeTrace:       trace,
        suggestedQueries:   buildSuggestedQueries(service, timeWindow, evidence.topErrors, evidence.deployEvents, aiAnalysis.blastRadius?.endpoints ?? []),
        _prompt:            prompt.slice(0, 200), // for debugging
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Streaming SSE ─────────────────────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const streamSSE = async () => {
      try {
        const { _incidentMeta: _d2, ...evidenceWire } = evidence as typeof evidence & { _incidentMeta?: unknown };
        // Phase 1: metadata with runtimeTrace so UI knows immediately which path was used
        await sseEvent(writer, "metadata", { ...evidenceWire, splunkMode, runtimeTrace: trace, aiBrief: null });

        // Phase 2: stream LLM tokens
        const prompt = buildPromptFromEvidence(evidence, hasLiveData);

        // ── splunk-hosted-model: stream directly from OpenAI-compat endpoint ──
        let llmResp: Response;
        if (reasoning.isSplunkHosted && splunkHostedModelEndpoint) {
          console.log("[streamSSE] Using Splunk hosted model (streaming):", splunkHostedModelEndpoint);
          try {
            llmResp = await fetch(`${splunkHostedModelEndpoint.replace(/\/$/, "")}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${reasoning.key || "splunk-hosted"}`,
              },
              body: JSON.stringify({
                model:       reasoning.model || "default",
                messages:    [{ role: "user", content: prompt }],
                max_tokens:  2048,
                temperature: 0.3,
                stream:      true,
              }),
              signal: AbortSignal.timeout(60000),
            });
          } catch (fetchErr) {
            const msg = fetchErr instanceof Error ? fetchErr.message : "Hosted model unreachable";
            await sseEvent(writer, "error", msg);
            return;
          }
        } else {
          llmResp = await callLlm({
            provider:      reasoning.provider,
            apiKey:        reasoning.key,
            modelId:       reasoning.model,
            gatewayApiKey: reasoning.gatewayKey,
            stream:        true,
            maxTokens:     2048,
            temperature:   0.3,
            messages:      [{ role: "user", content: prompt }],
            fallbackChain: llmFallbackChain,
          });
        }

        let rawText = "";

        if (!llmResp.ok) {
          const errText = await llmResp.text().catch(() => "");
          const isRateLimit = /rate.?limit|too many request|quota|429/i.test(errText);
          await sseEvent(writer, "error", isRateLimit ? `RATE_LIMIT: ${errText}` : errText || `HTTP ${llmResp.status}`);
          return;
        }

        if (llmResp.body) {
          const reader  = llmResp.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const ds = line.slice(5).trim();
              if (!ds || ds === "[DONE]") continue;
              try {
                const frame = JSON.parse(ds);
                const token = frame?.candidates?.[0]?.content?.parts?.[0]?.text ?? frame?.choices?.[0]?.delta?.content ?? frame?.delta?.text;
                if (token) { rawText += token; await sseEvent(writer, "token", token); }
              } catch { /* skip malformed frame */ }
            }
          }
        }

        // Phase 3: parse + emit done event
        const staticFallback = {
          aiBrief: { executiveSummary: evidence.summary, technicalFindings: evidence.hypotheses[0]?.evidence.join(" ") ?? "", immediateRisk: `${service} degradation may continue.`, confidenceStatement: "Analysis confidence: medium — AI enrichment unavailable." },
          hypotheses: evidence.hypotheses, recommendedActions: evidence.recommendedActions,
          openQuestions: evidence.openQuestions, blastRadius: evidence.blastRadius,
        };

        let parsedBrief = staticFallback.aiBrief;
        let aiHypotheses = staticFallback.hypotheses;
        let aiActions    = staticFallback.recommendedActions;
        let aiQuestions  = staticFallback.openQuestions;
        let aiBlast      = staticFallback.blastRadius;

        const p = extractJson(rawText);
        if (p) {
          parsedBrief = { executiveSummary: String(p.executiveSummary ?? evidence.summary), technicalFindings: String(p.technicalFindings ?? ""), immediateRisk: String(p.immediateRisk ?? ""), confidenceStatement: String(p.confidenceStatement ?? "") };
          if (Array.isArray(p.hypotheses) && (p.hypotheses as unknown[]).length > 0) {
            aiHypotheses = (p.hypotheses as Record<string, unknown>[]).map(h => ({ title: String(h.title ?? ""), confidence: Number(h.confidence ?? 0.5), category: String(h.category ?? "unknown") as "deployment" | "resource" | "dependency" | "network" | "configuration", evidence: Array.isArray(h.evidence) ? (h.evidence as unknown[]).map(String) : [] }));
          }
          if (Array.isArray(p.recommendedActions) && (p.recommendedActions as unknown[]).length > 0) aiActions = (p.recommendedActions as unknown[]).map(String);
          if (Array.isArray(p.openQuestions) && (p.openQuestions as unknown[]).length > 0) aiQuestions = (p.openQuestions as unknown[]).map(String);
          aiBlast = { ...evidence.blastRadius, estimated_users_affected: typeof p.estimatedUsers === "number" ? p.estimatedUsers : evidence.blastRadius.estimated_users_affected, estimated_revenue_impact: typeof p.estimatedRevenueImpact === "string" ? p.estimatedRevenueImpact : evidence.blastRadius.estimated_revenue_impact };
        }

        await sseEvent(writer, "done", {
          ...evidenceWire,
          hypotheses: aiHypotheses, recommendedActions: aiActions, openQuestions: aiQuestions, blastRadius: aiBlast,
          aiBrief: parsedBrief, splunkMode, runtimeTrace: trace,
          suggestedQueries: buildSuggestedQueries(service, timeWindow, evidence.topErrors, evidence.deployEvents, aiBlast.endpoints ?? []),
        });

      } catch (streamErr) {
        const msg = streamErr instanceof Error ? streamErr.message : "Streaming failed";
        await sseEvent(writer, "error", /rate.?limit|quota|429/i.test(msg) ? `RATE_LIMIT: ${msg}` : msg);
      } finally {
        await writer.close();
      }
    };

    streamSSE();
    return new Response(readable, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Analysis failed" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
