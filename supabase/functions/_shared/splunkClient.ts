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
  /** Splunk server-side WARN/ERROR messages (e.g. disk space, license) */
  splunkMessages?: Array<{ type: string; text: string; help?: string }>;
  /** True when Splunk returned isError or blocking server messages */
  splunkServerError?: boolean;
}

export interface ParsedMcpPayload {
  results: Array<Record<string, string>>;
  rowCount: number;
  splunkMessages: Array<{ type: string; text: string; help?: string }>;
  splunkServerError: boolean;
  splunkErrorText?: string;
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

// ── MCP response parsing ──────────────────────────────────────────────────────

/** Extract rows + Splunk server messages from any MCP tool payload shape. */
export function parseMcpPayload(parsed: unknown, raw?: unknown): ParsedMcpPayload {
  const splunkMessages: Array<{ type: string; text: string; help?: string }> = [];
  let results: Array<Record<string, string>> = [];

  const record = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : null;

  if (record) {
    if (Array.isArray(record.messages)) {
      for (const m of record.messages) {
        if (m && typeof m === "object") {
          const msg = m as { type?: string; text?: string; help?: string };
          if (msg.text) splunkMessages.push({ type: msg.type ?? "INFO", text: msg.text, help: msg.help });
        }
      }
    }

    if (Array.isArray(record.results)) {
      results = record.results as Array<Record<string, string>>;
    } else if (Array.isArray(record.data)) {
      results = record.data as Array<Record<string, string>>;
    } else if (Array.isArray(record.rows)) {
      results = record.rows as Array<Record<string, string>>;
    } else if (Array.isArray(record.entries)) {
      results = record.entries as Array<Record<string, string>>;
    } else if (Array.isArray(parsed)) {
      results = parsed as Array<Record<string, string>>;
    }

    const totalRows = record.total_rows ?? record.totalRows ?? record.count;
    if (results.length === 0 && typeof totalRows === "number" && totalRows > 0) {
      results = [{ _summary: String(totalRows) }];
    }
  } else if (Array.isArray(parsed)) {
    results = parsed as Array<Record<string, string>>;
  }

  const blocking = splunkMessages.filter(m =>
    /^(WARN|ERROR|FATAL)$/i.test(m.type) ||
    /not executed|failed|error|denied|disk space|license|quota/i.test(m.text),
  );
  const rawIsError = Boolean(
    (raw as { result?: { isError?: boolean } } | undefined)?.result?.isError,
  );
  const splunkServerError = rawIsError || blocking.length > 0;
  const splunkErrorText = blocking.map(m => m.text).join(" | ") || undefined;

  return {
    results,
    rowCount: results.length,
    splunkMessages,
    splunkServerError,
    splunkErrorText,
  };
}

/** Unwrap MCP JSON-RPC tool/call or tools/call response into parsed payload + raw RPC body. */
export function unwrapMcpRpcResponse(data: unknown): { parsed: unknown; raw: unknown } {
  const rpc = (data && typeof data === "object") ? data as Record<string, unknown> : {};
  const content = (rpc.result as { content?: unknown } | undefined)?.content ?? rpc.content;
  let parsed: unknown = data;

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object") {
        const block = item as { type?: string; text?: string };
        if (block.type === "text" && typeof block.text === "string") {
          try {
            parsed = JSON.parse(block.text);
          } catch {
            parsed = { results: [{ _raw: block.text }] };
          }
          break;
        }
      }
    }
  } else if (Array.isArray((rpc.result as { results?: unknown } | undefined)?.results)) {
    parsed = rpc.result;
  }

  return { parsed, raw: data };
}

// ── MCP JSON-RPC helpers ───────────────────────────────────────────────────────

export async function callMcpRpc(
  endpoint: string,
  headers: Record<string, string>,
  method: string,
  params: unknown,
  timeoutMs = 25_000,
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method:  "POST",
    headers,
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MCP RPC ${method} failed HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message ?? JSON.stringify(data.error));
  }
  return data;
}

/** Invoke a named MCP tool and return parsed payload. */
export async function runMcpToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  opts: McpSearchOptions,
): Promise<{ parsed: ParsedMcpPayload; endpoint: string; toolUsed: string; raw: unknown }> {
  const base     = normalizeMcpBase(opts.mcpUrl);
  const endpoint = `${base}/services/mcp`;
  const headers  = buildMcpHeaders(opts.mcpToken, opts.mcpAuthMethod, opts.mcpUsername, opts.mcpPassword, base);
  const data     = await callMcpRpc(endpoint, headers, "tools/call", { name: toolName, arguments: toolArgs }, opts.timeoutMs);
  const { parsed, raw } = unwrapMcpRpcResponse(data);
  const payload  = parseMcpPayload(parsed, raw);

  if (payload.splunkServerError && payload.splunkErrorText) {
    throw new Error(`Splunk server: ${payload.splunkErrorText}`);
  }

  return { parsed: payload, endpoint, toolUsed: toolName, raw: data };
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

    const { parsed, raw } = unwrapMcpRpcResponse(data);
    const payload = parseMcpPayload(parsed, raw);

    if (payload.splunkServerError && payload.splunkErrorText) {
      throw new Error(`Splunk server: ${payload.splunkErrorText}`);
    }

    return {
      results:           payload.results,
      raw,
      endpoint,
      toolUsed:          tool.name,
      rowCount:          payload.rowCount,
      splunkMessages:    payload.splunkMessages,
      splunkServerError: payload.splunkServerError,
    };
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
