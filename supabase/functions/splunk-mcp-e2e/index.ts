/**
 * splunk-mcp-e2e — End-to-end MCP connectivity test
 *
 * Runs 3 representative SPL queries via the configured MCP Server and asserts
 * that each returns a non-empty result set (rowCount > 0). Optionally runs a
 * 4th assertion that verifies the Splunk Hosted Model streaming endpoint is
 * reachable (HTTP 200 or 401 — either proves the server is up).
 *
 * POST body:
 *   mcpUrl                    string  (required) — MCP server base URL
 *   mcpToken                  string  (optional) — bearer token
 *   mcpAuthMethod             "bearer" | "basic"
 *   mcpUsername               string  (optional)
 *   mcpPassword               string  (optional)
 *   skipNgrok                 boolean (optional) — skip ngrok header injection
 *   splunkHostedModelEndpoint string  (optional) — OpenAI-compat endpoint URL
 *   splunkHostedModelToken    string  (optional) — token for hosted model
 *
 * Response 200:
 *   {
 *     ok: boolean,               // true when ALL assertions pass
 *     assertions: Assertion[],   // one entry per query (3 or 4)
 *     durationMs: number,        // total wall-clock time
 *     mcpUrl: string,
 *   }
 *
 * Response 400 / 500 on bad input / unexpected server error.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runMcpSearch, type McpAuthMethod } from "../_shared/splunkClient.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Assertion {
  name:       string;
  spl:        string;
  passed:     boolean;
  rowCount:   number;
  durationMs: number;
  error?:     string;
  toolUsed?:  string;
}

// Three broad queries that should return data on any populated Splunk index.
// They deliberately use wildcard indexes so they work whether the target is
// production, lab, or Splunk Developer Edition with synthetic events.
const TEST_QUERIES: Array<{ name: string; spl: string }> = [
  {
    name: "Recent events (any index)",
    spl:  `index=* earliest=-15m | head 5 | table _time index sourcetype`,
  },
  {
    name: "Error-level events (last hour)",
    spl:  `index=* earliest=-1h (log_level=ERROR OR level=error OR severity=error) | head 5 | table _time sourcetype message`,
  },
  {
    name: "Host inventory",
    spl:  `index=* earliest=-24h | stats count by host | sort -count | head 10`,
  },
];

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
  const splunkHostedModelEndpoint = (body.splunkHostedModelEndpoint as string | undefined)?.trim() ?? "";
  const splunkHostedModelToken    = (body.splunkHostedModelToken    as string | undefined)?.trim() ?? "";

  if (!mcpUrl) {
    return new Response(
      JSON.stringify({ error: "mcpUrl is required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const wallStart   = Date.now();
  const assertions: Assertion[] = [];

  // ── Assertions 1–3: SPL via MCP ─────────────────────────────────────────
  for (const q of TEST_QUERIES) {
    const qStart = Date.now();
    try {
      const result = await runMcpSearch(q.spl, {
        mcpUrl,
        mcpToken,
        mcpAuthMethod,
        mcpUsername,
        mcpPassword,
        earliestTime: "-24h",
        latestTime:   "now",
        maxResults:   10,
        timeoutMs:    25_000,
      });

      assertions.push({
        name:       q.name,
        spl:        q.spl,
        passed:     result.rowCount > 0,
        rowCount:   result.rowCount,
        durationMs: Date.now() - qStart,
        toolUsed:   result.toolUsed,
        ...(result.rowCount === 0 ? { error: "Query returned 0 rows — index may be empty or SPL too restrictive" } : {}),
      });
    } catch (err) {
      assertions.push({
        name:       q.name,
        spl:        q.spl,
        passed:     false,
        rowCount:   0,
        durationMs: Date.now() - qStart,
        error:      err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Assertion 4 (optional): Splunk Hosted Model endpoint reachability ────
  // Sends a minimal POST to {endpoint}/chat/completions.  HTTP 200 or 401
  // both indicate the server is alive — any network/DNS error is a failure.
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
      // 200, 400 (bad request), 401 (auth required), 422 all prove the server responded.
      const reachable = res.status < 500;
      assertions.push({
        name:       "Splunk Hosted Model endpoint reachable",
        spl:        `POST ${endpointUrl}`,
        passed:     reachable,
        rowCount:   reachable ? 1 : 0,
        durationMs: Date.now() - qStart,
        toolUsed:   "http-probe",
        ...(!reachable ? { error: `HTTP ${res.status} — server returned 5xx, endpoint may be down` } : {}),
      });
    } catch (err) {
      assertions.push({
        name:       "Splunk Hosted Model endpoint reachable",
        spl:        `POST ${endpointUrl}`,
        passed:     false,
        rowCount:   0,
        durationMs: Date.now() - qStart,
        toolUsed:   "http-probe",
        error:      err instanceof Error ? err.message : "Network error — endpoint unreachable",
      });
    }
  }

  const allPassed = assertions.every(a => a.passed);

  return new Response(
    JSON.stringify({
      ok:          allPassed,
      assertions,
      durationMs:  Date.now() - wallStart,
      mcpUrl,
      passCount:   assertions.filter(a => a.passed).length,
      totalCount:  assertions.length,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
