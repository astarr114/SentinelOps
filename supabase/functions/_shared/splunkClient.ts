/**
 * Shared Splunk client utilities — single source of truth for ALL Splunk integrations.
 *
 * Used by:
 *   - incident-analyze  (primary agentic analysis workflow)
 *   - splunk-mcp        (NL→SPL tool + direct MCP tool calls)
 *   - splunk-test       (connectivity tests, tools/list probe)
 *
 * MCP implementation strictly follows Splunk MCP Server 1.2 spec:
 *   Transport : Streamable HTTP  (POST {base}/services/mcp)
 *   Protocol  : JSON-RPC 2.0     ({ jsonrpc, id, method, params })
 *   Tool names: splunk_run_query (primary) → splunk_run_search (fallback)
 *   Arguments : { query | search, earliest_time, latest_time, max_results | max_count }
 *
 * Ngrok support: ngrok-skip-browser-warning header auto-injected for ngrok-hosted instances.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type McpAuthMethod = "bearer" | "basic";

export interface McpSearchOptions {
  mcpUrl: string;
  mcpToken?: string;
  mcpAuthMethod?: McpAuthMethod;
  mcpUsername?: string;
  mcpPassword?: string;
  /** Override earliest_time (default "-1h") */
  earliestTime?: string;
  /** Override latest_time (default "now") */
  latestTime?: string;
  /** Max rows (default 50) */
  maxResults?: number;
  timeoutMs?: number;
}

export interface McpSearchResult {
  results: Array<Record<string, string>>;
  raw: unknown;
  endpoint: string;
  toolUsed: string;
  rowCount: number;
}

export interface RestSearchOptions {
  splunkHost: string;
  splunkToken: string;
  timeWindow?: string;
  timeoutMs?: number;
}

export interface RestSearchResult {
  results: Array<Record<string, string>>;
  raw: unknown;
  rowCount: number;
}

// ── URL normalisation ─────────────────────────────────────────────────────────

/**
 * Strip any MCP-path suffix from a URL so we can append /services/mcp cleanly.
 * Handles: bare host, host/services/mcp, host/mcp, host/messages, trailing slashes.
 */
export function normalizeMcpBase(url: string): string {
  return url
    .replace(/\/$/, "")
    .replace(/\/services\/mcp$/i, "")
    .replace(/\/mcp$/i, "")
    .replace(/\/messages$/i, "");
}

/** Return true when the URL is an ngrok-hosted endpoint. */
export function isNgrokUrl(url: string): boolean {
  return url.includes("ngrok-free.app") || url.includes("ngrok.io") || url.includes("ngrok.dev");
}

/** Build auth + ngrok headers for MCP requests. */
export function buildMcpHeaders(
  mcpToken = "",
  mcpAuthMethod: McpAuthMethod = "bearer",
  mcpUsername = "",
  mcpPassword = "",
  url = "",
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mcpAuthMethod === "basic" && mcpUsername) {
    headers["Authorization"] = `Basic ${btoa(`${mcpUsername}:${mcpPassword}`)}`;
  } else if (mcpToken) {
    headers["Authorization"] = `Bearer ${mcpToken}`;
  }
  if (isNgrokUrl(url)) {
    headers["ngrok-skip-browser-warning"] = "true";
  }
  return headers;
}

// ── MCP 1.2 search ────────────────────────────────────────────────────────────

/**
 * Execute a SPL query via Splunk MCP Server 1.2 (Streamable HTTP transport).
 *
 * Tries tool candidates in order:
 *   1. splunk_run_query  — confirmed tool name on real Splunk MCP Server
 *   2. splunk_run_search — fallback for alternate deployments
 *
 * Throws on connection failure, auth error, or when all tool candidates fail.
 */
export async function runMcpSearch(
  spl: string,
  opts: McpSearchOptions,
): Promise<McpSearchResult> {
  const {
    mcpUrl,
    mcpToken = "",
    mcpAuthMethod = "bearer",
    mcpUsername = "",
    mcpPassword = "",
    earliestTime = "-1h",
    latestTime = "now",
    maxResults = 50,
    timeoutMs = 30_000,
  } = opts;

  const base     = normalizeMcpBase(mcpUrl);
  const endpoint = `${base}/services/mcp`;
  const headers  = buildMcpHeaders(mcpToken, mcpAuthMethod, mcpUsername, mcpPassword, base);

  const toolCandidates = [
    {
      name:      "splunk_run_query",
      arguments: { query: spl, earliest_time: earliestTime, latest_time: latestTime, max_results: maxResults },
    },
    {
      name:      "splunk_run_search",
      arguments: { search: spl, earliest_time: earliestTime, latest_time: latestTime, max_count: maxResults },
    },
  ];

  let lastErr = "";

  for (const tool of toolCandidates) {
    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id:      1,
      method:  "tools/call",
      params:  { name: tool.name, arguments: tool.arguments },
    });

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method:  "POST",
        headers,
        body:    rpcBody,
        signal:  AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`MCP Server unreachable at ${endpoint}: ${msg}`);
    }

    if (!res.ok) {
      if (res.status === 401) throw new Error(`MCP authentication failed (HTTP 401) at ${endpoint}. Check bearer token or credentials.`);
      if (res.status === 403) throw new Error(`MCP access denied (HTTP 403) at ${endpoint}. Token lacks required permissions.`);
      if (res.status === 404) { lastErr = `tool ${tool.name} → 404`; continue; }
      const body = await res.text().catch(() => "");
      throw new Error(`MCP Server error HTTP ${res.status} at ${endpoint}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();

    if (data?.error) {
      const errMsg: string = data.error.message ?? JSON.stringify(data.error);
      if (/not found|unknown tool|invalid tool/i.test(errMsg)) {
        lastErr = `${tool.name}: ${errMsg}`;
        continue;
      }
      throw new Error(`MCP JSON-RPC error: ${errMsg}`);
    }

    // Unwrap MCP result: { result: { content: [{ type: "text", text: "<json>" }] } }
    const content = data?.result?.content ?? data?.content;
    let results: Array<Record<string, string>> = [];
    let raw: unknown = data;

    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === "text" && typeof item?.text === "string") {
          try {
            const parsed = JSON.parse(item.text);
            results = Array.isArray(parsed?.results) ? parsed.results
              : Array.isArray(parsed) ? parsed
              : [];
            raw = parsed;
          } catch {
            results = [{ _raw: item.text }];
          }
          break;
        }
      }
    } else if (Array.isArray(data?.result?.results)) {
      results = data.result.results;
    } else if (Array.isArray(data?.results)) {
      results = data.results;
    }

    return { results, raw, endpoint, toolUsed: tool.name, rowCount: results.length };
  }

  throw new Error(
    `MCP search failed — tried both tool names (splunk_run_query, splunk_run_search). Last error: ${lastErr}. Endpoint: ${endpoint}`,
  );
}

// ── Splunk REST API search ────────────────────────────────────────────────────

/**
 * Execute a SPL query via Splunk REST API (POST /services/search/jobs, poll, fetch results).
 * Throws on job creation failure or result fetch failure.
 */
export async function runSplunkRestSearch(
  spl: string,
  opts: RestSearchOptions,
): Promise<RestSearchResult> {
  const {
    splunkHost,
    splunkToken,
    timeWindow = "last_1h",
    timeoutMs  = 15_000,
  } = opts;

  const timeMap: Record<string, string> = {
    "last_15m": "-15m", "last_30m": "-30m", "last_1h":  "-1h",
    "last_2h":  "-2h",  "last_4h":  "-4h",  "last_6h":  "-6h",
    "last_12h": "-12h", "last_24h": "-24h",
  };
  const earliest = timeMap[timeWindow] ?? "-1h";

  const base = splunkHost.replace(/\/$/, "");

  // Splunk REST requires `search` keyword prefix
  const splForRest = /^\s*search\s+/i.test(spl) ? spl : `search ${spl}`;

  // 1) Create search job
  const createRes = await fetch(`${base}/services/search/jobs`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${splunkToken}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      search:        splForRest,
      earliest_time: earliest,
      latest_time:   "now",
      output_mode:   "json",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!createRes.ok) {
    const msg = await createRes.text().catch(() => "");
    throw new Error(`Splunk REST job create failed (HTTP ${createRes.status}): ${msg.slice(0, 300)}`);
  }
  const createData = await createRes.json();
  const sid: string = createData?.sid;
  if (!sid) throw new Error("Splunk REST: no search ID (sid) returned from job creation");

  // 2) Poll until done (max 25 s)
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1_500));
    const statusRes = await fetch(`${base}/services/search/jobs/${sid}?output_mode=json`, {
      headers: { "Authorization": `Bearer ${splunkToken}` },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const state: string = statusData?.entry?.[0]?.content?.dispatchState ?? "";
    if (state === "DONE" || state === "FAILED") break;
  }

  // 3) Fetch results
  const resultsRes = await fetch(
    `${base}/services/search/jobs/${sid}/results?output_mode=json&count=50`,
    { headers: { "Authorization": `Bearer ${splunkToken}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!resultsRes.ok) {
    throw new Error(`Splunk REST results fetch failed (HTTP ${resultsRes.status})`);
  }
  const resultsData = await resultsRes.json();
  const results = Array.isArray(resultsData?.results) ? resultsData.results : [];
  return { results, raw: resultsData, rowCount: results.length };
}

// ── Time window helper ────────────────────────────────────────────────────────

export function timeWindowToEarliest(tw: string): string {
  const map: Record<string, string> = {
    "last_15m": "-15m", "last_30m": "-30m", "last_1h": "-1h",
    "last_2h":  "-2h",  "last_4h":  "-4h",  "last_6h": "-6h",
    "last_12h": "-12h", "last_24h": "-24h",
  };
  return map[tw] ?? "-1h";
}
