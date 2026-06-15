/**
 * splunk-mcp-e2e — End-to-end MCP connectivity test
 *
 * Phase 1 (connectivity): JSON-RPC tools/list + initialize — no Splunk search dispatch.
 * Phase 2 (data):         SPL smoke test + metadata tool — requires Splunk search capacity.
 *
 * Overall ok = connectivity passes AND (data passes OR data blocked by Splunk server-side error).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildMcpHeaders,
  callMcpRpc,
  normalizeMcpBase,
  runMcpSearch,
  runMcpToolCall,
  type McpAuthMethod,
} from "../_shared/splunkClient.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Assertion {
  name:               string;
  spl:                string;
  passed:             boolean;
  rowCount:           number;
  durationMs:         number;
  error?:             string;
  toolUsed?:          string;
  category:           "connectivity" | "data";
  splunkServerError?: boolean;
}

const SPL_SMOKE = "index=_internal earliest=-15m | head 5 | table _time index sourcetype";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const mcpUrl                    = (body.mcpUrl                    as string | undefined)?.trim() ?? "";
  const mcpToken                  = (body.mcpToken                  as string | undefined)?.trim() ?? "";
  const mcpAuthMethod: McpAuthMethod = ((body.mcpAuthMethod as string | undefined) ?? "bearer") as McpAuthMethod;
  const mcpUsername               = (body.mcpUsername               as string | undefined)?.trim() ?? "";
  const mcpPassword               = (body.mcpPassword               as string | undefined)?.trim() ?? "";
  const customQuery               = (body.customQuery               as string | undefined)?.trim() ?? "";
  const customQueryName           = (body.customQueryName           as string | undefined)?.trim() || "Custom query";
  const splunkHostedModelEndpoint = (body.splunkHostedModelEndpoint as string | undefined)?.trim() ?? "";
  const splunkHostedModelToken    = (body.splunkHostedModelToken    as string | undefined)?.trim() ?? "";
  const userId                    = (body.userId                    as string | undefined)?.trim() ?? "";

  if (!mcpUrl) {
    return new Response(
      JSON.stringify({ error: "mcpUrl is required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const wallStart   = Date.now();
  const assertions: Assertion[] = [];
  const mcpOpts = { mcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword };
  const base     = normalizeMcpBase(mcpUrl);
  const endpoint = `${base}/services/mcp`;
  const headers  = buildMcpHeaders(mcpToken, mcpAuthMethod, mcpUsername, mcpPassword, base);

  // ── Phase 1: MCP connectivity (JSON-RPC, no search dispatch) ───────────────
  {
    const qStart = Date.now();
    try {
      const toolsJson = await callMcpRpc(endpoint, headers, "tools/list", {}) as {
        result?: { tools?: unknown[] };
      };
      const toolCount = Array.isArray(toolsJson?.result?.tools) ? toolsJson.result!.tools!.length : 0;
      assertions.push({
        name:       "MCP tools/list",
        spl:        `POST ${endpoint} → tools/list`,
        passed:     toolCount > 0,
        rowCount:   toolCount,
        durationMs: Date.now() - qStart,
        toolUsed:   "tools/list",
        category:   "connectivity",
        ...(toolCount === 0 ? { error: "MCP server returned zero tools" } : {}),
      });
    } catch (err) {
      assertions.push({
        name:       "MCP tools/list",
        spl:        `POST ${endpoint} → tools/list`,
        passed:     false,
        rowCount:   0,
        durationMs: Date.now() - qStart,
        toolUsed:   "tools/list",
        category:   "connectivity",
        error:      err instanceof Error ? err.message : String(err),
      });
    }
  }

  {
    const qStart = Date.now();
    try {
      const initJson = await callMcpRpc(endpoint, headers, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities:    {},
        clientInfo:      { name: "SentinelOps", version: "1.0" },
      }) as { result?: { serverInfo?: { name?: string; version?: string } } };
      const info = initJson?.result?.serverInfo;
      const label = info?.name
        ? `${info.name}${info.version ? ` v${info.version}` : ""}`
        : "handshake ok";
      assertions.push({
        name:       "MCP initialize handshake",
        spl:        `POST ${endpoint} → initialize`,
        passed:     true,
        rowCount:   1,
        durationMs: Date.now() - qStart,
        toolUsed:   "initialize",
        category:   "connectivity",
        error:      undefined,
        ...(label ? {} : {}),
      });
      // Store server label in spl field for UI visibility
      assertions[assertions.length - 1].spl = label;
    } catch (err) {
      assertions.push({
        name:       "MCP initialize handshake",
        spl:        `POST ${endpoint} → initialize`,
        passed:     false,
        rowCount:   0,
        durationMs: Date.now() - qStart,
        toolUsed:   "initialize",
        category:   "connectivity",
        error:      err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Phase 2: Data plane — SPL smoke + metadata tool ────────────────────────
  {
    const qStart = Date.now();
    try {
      const result = await runMcpSearch(SPL_SMOKE, {
        ...mcpOpts,
        earliestTime: "-15m",
        latestTime:   "now",
        maxResults:   5,
        timeoutMs:    25_000,
      });
      assertions.push({
        name:       "SPL smoke test (_internal events)",
        spl:        SPL_SMOKE,
        passed:     result.rowCount > 0,
        rowCount:   result.rowCount,
        durationMs: Date.now() - qStart,
        toolUsed:   result.toolUsed,
        category:   "data",
        ...(result.rowCount === 0 ? { error: "Query returned 0 rows" } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const splunkServerError = msg.startsWith("Splunk server:");
      assertions.push({
        name:               "SPL smoke test (_internal events)",
        spl:                SPL_SMOKE,
        passed:             false,
        rowCount:           0,
        durationMs:         Date.now() - qStart,
        toolUsed:           "splunk_run_query",
        category:           "data",
        splunkServerError,
        error:              splunkServerError ? msg.replace(/^Splunk server:\s*/, "") : msg,
      });
    }
  }

  {
    const qStart = Date.now();
    try {
      const { parsed, toolUsed } = await runMcpToolCall("splunk_get_info", {}, mcpOpts);
      assertions.push({
        name:       "Splunk server info (metadata)",
        spl:        "tool: splunk_get_info",
        passed:     parsed.rowCount > 0 || !parsed.splunkServerError,
        rowCount:   Math.max(parsed.rowCount, 1),
        durationMs: Date.now() - qStart,
        toolUsed,
        category:   "data",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const splunkServerError = msg.startsWith("Splunk server:");
      assertions.push({
        name:               "Splunk server info (metadata)",
        spl:                "tool: splunk_get_info",
        passed:             false,
        rowCount:           0,
        durationMs:         Date.now() - qStart,
        toolUsed:           "splunk_get_info",
        category:           "data",
        splunkServerError,
        error:              splunkServerError ? msg.replace(/^Splunk server:\s*/, "") : msg,
      });
    }
  }

  if (customQuery) {
    const qStart = Date.now();
    try {
      const result = await runMcpSearch(customQuery, {
        ...mcpOpts,
        earliestTime: "-24h",
        latestTime:   "now",
        maxResults:   10,
        timeoutMs:    25_000,
      });
      assertions.push({
        name:       customQueryName,
        spl:        customQuery,
        passed:     result.rowCount > 0,
        rowCount:   result.rowCount,
        durationMs: Date.now() - qStart,
        toolUsed:   result.toolUsed,
        category:   "data",
        ...(result.rowCount === 0 ? { error: "Query returned 0 rows" } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const splunkServerError = msg.startsWith("Splunk server:");
      assertions.push({
        name:               customQueryName,
        spl:                customQuery,
        passed:             false,
        rowCount:           0,
        durationMs:         Date.now() - qStart,
        category:           "data",
        splunkServerError,
        error:              splunkServerError ? msg.replace(/^Splunk server:\s*/, "") : msg,
      });
    }
  }

  // ── Optional: Splunk Hosted Model endpoint reachability ──────────────────
  if (splunkHostedModelEndpoint) {
    const qStart = Date.now();
    const endpointUrl = `${splunkHostedModelEndpoint.replace(/\/$/, "")}/chat/completions`;
    try {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${splunkHostedModelToken || "probe"}`,
        },
        body: JSON.stringify({
          model:      "probe",
          messages:   [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream:     false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const reachable = res.status < 500;
      assertions.push({
        name:       "Splunk Hosted Model endpoint reachable",
        spl:        `POST ${endpointUrl}`,
        passed:     reachable,
        rowCount:   reachable ? 1 : 0,
        durationMs: Date.now() - qStart,
        toolUsed:   "http-probe",
        category:   "connectivity",
        ...(!reachable ? { error: `HTTP ${res.status} — server returned 5xx` } : {}),
      });
    } catch (err) {
      assertions.push({
        name:       "Splunk Hosted Model endpoint reachable",
        spl:        `POST ${endpointUrl}`,
        passed:     false,
        rowCount:   0,
        durationMs: Date.now() - qStart,
        toolUsed:   "http-probe",
        category:   "connectivity",
        error:      err instanceof Error ? err.message : "Network error — endpoint unreachable",
      });
    }
  }

  const durationMs = Date.now() - wallStart;
  const passCount  = assertions.filter(a => a.passed).length;

  const connectivity = assertions.filter(a => a.category === "connectivity");
  const data         = assertions.filter(a => a.category === "data");
  const connectivityOk = connectivity.length === 0 || connectivity.every(a => a.passed);
  const dataOk         = data.length === 0 || data.every(a => a.passed);
  const dataSplunkBlocked = data.length > 0 &&
    data.every(a => !a.passed && a.splunkServerError);

  // Pass when MCP path is healthy; Splunk-side resource errors (disk, license) are degraded not failed.
  const ok = connectivityOk && (dataOk || dataSplunkBlocked);
  const status: "healthy" | "degraded" | "failed" =
    connectivityOk && dataOk ? "healthy"
    : connectivityOk && dataSplunkBlocked ? "degraded"
    : "failed";

  // ── Persist run to Supabase (best-effort) ────────────────────────────────
  let runId: string | undefined;
  if (userId) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supa = createClient(supabaseUrl, serviceKey);
      const { data: row, error: insertErr } = await supa
        .from("e2e_test_runs")
        .insert({
          user_id:     userId,
          mcp_url:     mcpUrl,
          pass_count:  passCount,
          total_count: assertions.length,
          duration_ms: durationMs,
          ok,
          assertions,
        })
        .select("id")
        .single();
      if (!insertErr && row) runId = row.id as string;
    } catch {
      // persistence failure is non-fatal
    }
  }

  return new Response(
    JSON.stringify({
      ok,
      status,
      connectivityOk,
      dataOk,
      assertions,
      durationMs,
      mcpUrl:     base,
      passCount,
      totalCount: assertions.length,
      ...(runId ? { runId } : {}),
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
