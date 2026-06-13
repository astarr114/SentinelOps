// Edge Function: splunk-mcp
// Natural Language → SPL generation via multi-provider LLM, then optional execution via:
//   1. Splunk MCP Server 1.2 (JSON-RPC 2.0 over Streamable HTTP — POST /services/mcp)
//      Primary search tool: "splunk_run_query"  (as confirmed by real Splunk MCP Server)
//      Fallback search tool: "splunk_run_search" (alternate name used by some deployments)
//      Ngrok deployments: adds "ngrok-skip-browser-warning: true" header automatically
//   2. Splunk REST API directly (POST /services/search/jobs)
//
// POST modes:
//   { question, service?, timeWindow?, llmProvider?, ... }          → NL→SPL + execute
//   { mode: 'tool-call', toolName, toolArgs, mcpUrl, mcpToken? }    → direct MCP tool call
//
// Returns { spl?, results?, explanation?, mcpMode, execPath?, toolName?, toolResult? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLlm, extractTextFromResponse, type LlmProvider, type LlmFallbackSlot } from "../_shared/llmRouter.ts";
import { runMcpSearch, runSplunkRestSearch, type McpAuthMethod } from "../_shared/splunkClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── SPL generation via LLM ────────────────────────────────────────────────────
async function generateSPL(
  question: string, service: string, timeWindow: string,
  provider: LlmProvider, apiKey: string, modelId: string, gatewayKey: string,
  fallbackChain: LlmFallbackSlot[] = [],
): Promise<string> {
  const timeMap: Record<string, string> = {
    "last_15m": "15 minutes", "last_30m": "30 minutes",
    "last_1h": "1 hour", "last_2h": "2 hours",
    "last_4h": "4 hours", "last_6h": "6 hours", "last_24h": "24 hours",
  };
  const earliestMap: Record<string, string> = {
    "last_15m": "-15m", "last_30m": "-30m",
    "last_1h": "-1h", "last_2h": "-2h",
    "last_4h": "-4h", "last_6h": "-6h", "last_24h": "-24h",
  };
  const humanTime = timeMap[timeWindow] ?? "1 hour";
  const earliest  = earliestMap[timeWindow] ?? "-1h";

  const systemPrompt = `You are a Splunk expert. Generate a single valid SPL (Search Processing Language) query.
Rules:
- Output ONLY the raw SPL query — no markdown fences, no explanation, no preamble.
- Always include: earliest=${earliest} latest=now
- Always scope to service="${service}": index=main service="${service}"
- Use | stats, | timechart, | top, | table as appropriate.
Patterns:
  * Error rate: index=main service="${service}" earliest=${earliest} | stats count by status | where status>=400
  * Latency: index=main service="${service}" earliest=${earliest} | timechart span=1m avg(duration_ms) as avg_latency
  * Errors: index=main service="${service}" level=ERROR earliest=${earliest} | top limit=20 message
  * Top endpoints: index=main service="${service}" earliest=${earliest} | top limit=10 endpoint`;

  const res = await callLlm({
    provider, apiKey, modelId, gatewayApiKey: gatewayKey,
    fallbackChain,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Question: ${question}\nService: ${service}\nTime window: ${humanTime}` },
    ],
    stream: false, maxTokens: 512, temperature: 0.1,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const text = await extractTextFromResponse(res, provider);
  return text.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
}

// ── MCP Server execution (Splunk MCP 1.2 — Streamable HTTP transport) ────────
//
// Splunk MCP Server 1.2 uses the MCP Streamable HTTP transport.
// The canonical endpoint is:  POST {splunk_host}/services/mcp
// Real Splunk MCP Server tool: "splunk_run_query"  (confirmed by tools/list)
// Fallback tool name:          "splunk_run_search" (some alternate deployments)
// Arguments per Splunk docs:  { query, earliest_time?, latest_time?, max_results? }
//
// For ngrok-exposed Splunk instances the browser-warning interstitial must be
// bypassed by adding "ngrok-skip-browser-warning: true" to all requests.
//
async function runMcpSearch(
  mcpUrl: string,
  mcpToken: string,
  spl: string,
  mcpAuthMethod: "bearer" | "basic" = "bearer",
  mcpUsername = "",
  mcpPassword = "",
) {
  const base = mcpUrl.replace(/\/$/, "")
    .replace(/\/services\/mcp$/, "")
    .replace(/\/mcp$/, "")
    .replace(/\/messages$/, "");

  const endpoint = `${base}/services/mcp`;
  const isNgrok  = base.includes("ngrok");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mcpAuthMethod === "basic" && mcpUsername) {
    headers["Authorization"] = `Basic ${btoa(`${mcpUsername}:${mcpPassword}`)}`;
  } else if (mcpToken) {
    headers["Authorization"] = `Bearer ${mcpToken}`;
  }
  if (isNgrok) headers["ngrok-skip-browser-warning"] = "true";

  // Try splunk_run_query first (actual tool name on real Splunk MCP Server),
  // fall back to splunk_run_search (used by some alternate deployments).
  const toolCandidates = [
    {
      name: "splunk_run_query",
      arguments: { query: spl, earliest_time: "-1h", latest_time: "now", max_results: 50 },
    },
    {
      name: "splunk_run_search",
      arguments: { search: spl, earliest_time: "-1h", latest_time: "now", max_count: 50 },
    },
  ];

  let lastErr = "";
  for (const tool of toolCandidates) {
    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool.name, arguments: tool.arguments },
    });

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: rpcBody,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      throw new Error(`MCP Server unreachable at ${endpoint}: ${lastErr}`);
    }

    if (!res.ok) {
      if (res.status === 401) throw new Error("MCP authentication failed (HTTP 401). Check your bearer token.");
      if (res.status === 403) throw new Error("MCP access denied (HTTP 403). Token lacks required permissions.");
      if (res.status === 404) { lastErr = `tool ${tool.name} → 404`; continue; }
      const body = await res.text();
      throw new Error(`MCP Server error ${res.status} at ${endpoint}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();

    if (data?.error) {
      const errMsg: string = data.error.message ?? JSON.stringify(data.error);
      // "Tool not found" type errors → try next tool name
      if (/not found|unknown tool|invalid tool/i.test(errMsg)) {
        lastErr = `${tool.name}: ${errMsg}`;
        continue;
      }
      throw new Error(`MCP JSON-RPC error: ${errMsg}`);
    }

    // Unwrap result — MCP returns { result: { content: [...] } }
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
          } catch { results = [{ _raw: item.text }]; }
          break;
        }
      }
    } else if (Array.isArray(data?.result?.results)) {
      results = data.result.results;
    } else if (Array.isArray(data?.results)) {
      results = data.results;
    }
    return { results, raw, endpoint, toolUsed: tool.name };
  }

  throw new Error(`MCP search failed on all tool names. Last error: ${lastErr}`);
}

// ── Splunk REST API execution (direct fallback) ───────────────────────────────
// Uses the same /services/search/jobs pattern as incident-analyze edge function.
async function runRestSearch(
  splunkHost: string, splunkToken: string, spl: string,
): Promise<{ results: Array<Record<string, string>>; raw: unknown }> {
  const base = splunkHost.replace(/\/$/, "");

  // Splunk REST API requires the query to begin with the `search` command keyword.
  // Generated SPL often starts with `index=...` directly — prepend if missing.
  const splForRest = /^\s*search\s+/i.test(spl) ? spl : `search ${spl}`;

  // 1 — submit async search job
  const createRes = await fetch(`${base}/services/search/jobs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${splunkToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ search: splForRest, output_mode: "json" }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!createRes.ok) {
    const msg = await createRes.text();
    throw new Error(`Splunk REST error ${createRes.status}: ${msg.slice(0, 200)}`);
  }
  const createData = await createRes.json();
  const sid: string = createData?.sid;
  if (!sid) throw new Error("Splunk REST: no search ID returned");

  // 2 — poll until done (max 25s)
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`${base}/services/search/jobs/${sid}?output_mode=json`, {
      headers: { "Authorization": `Bearer ${splunkToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const state: string = statusData?.entry?.[0]?.content?.dispatchState ?? "";
    if (state === "DONE" || state === "FAILED") break;
  }

  // 3 — fetch results
  const resultsRes = await fetch(
    `${base}/services/search/jobs/${sid}/results?output_mode=json&count=50`,
    { headers: { "Authorization": `Bearer ${splunkToken}` }, signal: AbortSignal.timeout(10000) }
  );
  if (!resultsRes.ok) throw new Error(`Splunk results error ${resultsRes.status}`);
  const resultsData = await resultsRes.json();
  return {
    results: Array.isArray(resultsData?.results) ? resultsData.results : [],
    raw: resultsData,
  };
}

function buildDemoExplanation(spl: string, service: string): string {
  return `No execution backend configured. SPL generated and ready to run.\n\nCopy to Splunk Search: "${spl}"\n\nTo enable live execution, configure either:\n• Splunk MCP Server URL + token in Settings → MCP Server\n• Splunk REST API URL + token in Settings → Splunk Connection\nService: "${service}"`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();

    // Accept credentials from request body (user's saved Settings config)
    const mcpUrl      = (body.mcpUrl      as string | undefined)?.trim() || Deno.env.get("SPLUNK_MCP_URL")   || "";
    const mcpToken    = (body.mcpToken    as string | undefined)?.trim() || Deno.env.get("SPLUNK_MCP_TOKEN") || "";
    const mcpAuthMethod: "bearer" | "basic" = body.mcpAuthMethod === "basic" ? "basic" : "bearer";
    const mcpUsername = (body.mcpUsername as string | undefined)?.trim() || "";
    const mcpPassword = (body.mcpPassword as string | undefined)?.trim() || "";

    // ── mode: tool-call  ── direct MCP tool invocation (bypass NL→SPL) ───────
    // Body: { mode: 'tool-call', toolName, toolArgs, mcpUrl, mcpToken? }
    if (body.mode === "tool-call") {
      const toolName: string  = (body.toolName ?? "").trim();
      const toolArgs: unknown = body.toolArgs ?? {};
      if (!mcpUrl) {
        return new Response(JSON.stringify({ error: "mcpUrl is required for tool-call mode." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      if (!toolName) {
        return new Response(JSON.stringify({ error: "toolName is required for tool-call mode." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const base     = mcpUrl.replace(/\/$/, "").replace(/\/services\/mcp$/, "").replace(/\/mcp$/, "").replace(/\/messages$/, "");
      const endpoint = `${base}/services/mcp`;
      const isNgrok  = base.includes("ngrok");

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (mcpAuthMethod === "basic" && mcpUsername) {
        headers["Authorization"] = `Basic ${btoa(`${mcpUsername}:${mcpPassword}`)}`;
      } else if (mcpToken) {
        headers["Authorization"] = `Bearer ${mcpToken}`;
      }
      if (isNgrok) headers["ngrok-skip-browser-warning"] = "true";

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: toolArgs } }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 401) throw new Error("Authentication failed (HTTP 401). Check your bearer token.");
        if (res.status === 403) throw new Error("Access denied (HTTP 403). Token lacks required permissions.");
        throw new Error(`MCP tool call failed HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }

      const data = await res.json();
      if (data?.error) throw new Error(`MCP JSON-RPC error: ${data.error.message ?? JSON.stringify(data.error)}`);

      // Unwrap content array
      const content = data?.result?.content ?? data?.content;
      let toolResult: unknown = data;
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as { type?: string; text?: string };
        if (first.type === "text" && first.text) {
          try { toolResult = JSON.parse(first.text); } catch { toolResult = first.text; }
        } else {
          toolResult = content;
        }
      }
      return new Response(
        JSON.stringify({ ok: true, toolName, toolResult, raw: data, endpoint }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── NL→SPL mode ──────────────────────────────────────────────────────────
    const { question, service = "unknown-service", timeWindow = "last_30m" } = body;
    const llmProvider: LlmProvider   = body.llmProvider ?? "gemini";
    const llmApiKey:   string        = body.llmApiKey   ?? "";
    const llmModel:    string        = body.llmModel    ?? "";
    const llmFallbackChain: LlmFallbackSlot[] = Array.isArray(body.llmFallbackChain) ? body.llmFallbackChain : [];

    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const gatewayKey  = Deno.env.get("INTEGRATIONS_API_KEY") ?? "";
    const splunkHost  = (body.splunkHost  as string | undefined)?.trim() || Deno.env.get("SPLUNK_HOST")  || "";
    const splunkToken = (body.splunkToken as string | undefined)?.trim() || Deno.env.get("SPLUNK_TOKEN") || "";

    // generateOnly = true: just produce SPL, skip execution (user will click Run SPL separately)
    const generateOnly: boolean = body.generateOnly === true;

    // explicitSpl: skip LLM entirely, execute the provided SPL directly
    const explicitSpl: string = (body.explicitSpl as string | undefined)?.trim() || "";

    // ── Resolve SPL ──────────────────────────────────────────────────────────
    const spl = explicitSpl
      ? explicitSpl
      : await generateSPL(question.trim(), service, timeWindow, llmProvider, llmApiKey, llmModel, gatewayKey, llmFallbackChain);

    // ── Generate-only mode: return SPL without executing ────────────────────
    // Triggered by the "Generate SPL" button — the user reviews / edits the
    // SPL, then explicitly clicks "Run SPL" to execute it.
    if (generateOnly && !explicitSpl) {
      return new Response(
        JSON.stringify({ spl, results: [], mcpMode: "idle", service, timeWindow }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Try MCP execution ────────────────────────────────────────────────────
    if (mcpUrl && (mcpToken || (mcpAuthMethod === "basic" && mcpUsername))) {
      try {
        const { results, raw, endpoint, toolUsed } = await runMcpSearch(mcpUrl, mcpToken, spl, mcpAuthMethod, mcpUsername, mcpPassword);
        return new Response(
          JSON.stringify({ spl, results, raw, mcpMode: "live", execPath: "mcp", endpoint, toolUsed, service, timeWindow }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      } catch (mcpErr) {
        const mcpErrMsg = mcpErr instanceof Error ? mcpErr.message : "MCP execution failed";

        // If REST credentials are also available, fall through to REST instead of erroring
        if (splunkHost && splunkToken) {
          try {
            const { results, raw } = await runRestSearch(splunkHost, splunkToken, spl);
            return new Response(
              JSON.stringify({
                spl, results, raw, mcpMode: "live", execPath: "rest",
                mcpFallbackNote: `MCP failed (${mcpErrMsg}), executed via Splunk REST API.`,
                service, timeWindow,
              }),
              { headers: { ...CORS, "Content-Type": "application/json" } },
            );
          } catch (restErr) {
            const restErrMsg = restErr instanceof Error ? restErr.message : "REST execution failed";
            return new Response(
              JSON.stringify({
                spl, results: [], mcpMode: "error",
                mcpError: `MCP: ${mcpErrMsg} | REST: ${restErrMsg}`,
                service, timeWindow,
              }),
              { headers: { ...CORS, "Content-Type": "application/json" } },
            );
          }
        }

        // No REST fallback — return error but keep SPL
        return new Response(
          JSON.stringify({ spl, results: [], mcpMode: "error", mcpError: mcpErrMsg, service, timeWindow }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Try Splunk REST API directly (no MCP configured) ────────────────────
    if (splunkHost && splunkToken) {
      try {
        const { results, raw } = await runRestSearch(splunkHost, splunkToken, spl);
        return new Response(
          JSON.stringify({ spl, results, raw, mcpMode: "live", execPath: "rest", service, timeWindow }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      } catch (restErr) {
        const restErrMsg = restErr instanceof Error ? restErr.message : "REST execution failed";
        return new Response(
          JSON.stringify({ spl, results: [], mcpMode: "error", mcpError: restErrMsg, service, timeWindow }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Demo mode: no backend configured ────────────────────────────────────
    return new Response(
      JSON.stringify({ spl, results: [], mcpMode: "demo", explanation: buildDemoExplanation(spl, service), service, timeWindow }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
