// Edge Function: splunk-test
// Server-side proxy for testing Splunk REST API + MCP Server connectivity.
// Runs inside Deno (no browser CORS restrictions).
//
// POST { mode: "rest", splunkHost, splunkToken }
//   → hits /services/server/info on the Splunk REST API
//
// POST { mode: "mcp", mcpUrl, mcpToken? }
//   → calls tools/list on the Splunk MCP Server (primary: /services/mcp per 1.2 spec)
//   → adds "ngrok-skip-browser-warning: true" for ngrok-exposed instances
//   → returns { ok, message }
//
// POST { mode: "mcp-full", mcpUrl, mcpToken? }
//   → runs initialize (to get serverName + serverVersion) THEN tools/list (full tool list)
//   → returns { ok, message, serverName, serverVersion, toolList: [{name,description},...] }
//
// POST { mode: "mcp-tool-call", mcpUrl, mcpToken?, toolName, toolArgs? }
//   → calls a specific Splunk MCP tool by name with given args
//   → returns { ok, toolName, result, raw }
//
// POST { mode: "mcp-debug", mcpUrl, mcpToken?, rpcMethod, rpcParams? }
//   → raw JSON-RPC probe across all candidate endpoints
//   → returns { ok, requestPayload, probeResults }
//
// POST { mode: "mcp-auth-debug", mcpUrl, mcpToken?, mcpAuthMethod?, mcpUsername?, mcpPassword? }
//   → performs a single tools/list call and captures FULL request + response headers
//   → auth token is redacted in output (first 8 chars + "***")
//   → returns { ok, status, requestHeaders, responseHeaders, responseBody, requestPayload, endpoint, durationMs }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method Not Allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const mode: "rest" | "mcp" | "mcp-full" | "mcp-tool-call" | "mcp-debug" | "mcp-auth-debug" = body.mode ?? "rest";

    // ── Splunk REST API test ─────────────────────────────────────────────────
    if (mode === "rest") {
      const splunkHost: string = (body.splunkHost ?? "").trim().replace(/\/$/, "");
      const splunkToken: string = (body.splunkToken ?? "").trim();

      if (!splunkHost || !splunkToken) {
        return new Response(
          JSON.stringify({ ok: false, message: "splunkHost and splunkToken are required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const url = `${splunkHost}/services/server/info?output_mode=json`;
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${splunkToken}` },
          signal: AbortSignal.timeout(10000),
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const isTls = msg.toLowerCase().includes('cert') || msg.toLowerCase().includes('ssl') || msg.toLowerCase().includes('tls');
        return new Response(
          JSON.stringify({
            ok: false,
            message: isTls
              ? "SSL/TLS error — Splunk may be using a self-signed certificate. Ensure the host URL is correct and the certificate is trusted."
              : "Cannot reach Splunk host. Check the URL (e.g. https://splunk.company.com:8089) and network connectivity.",
            detail: msg,
          }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      if (res.ok || res.status === 200) {
        let serverName = splunkHost;
        try {
          const json = await res.json();
          serverName = json?.entry?.[0]?.content?.serverName ?? splunkHost;
        } catch { /* ignore */ }
        return new Response(
          JSON.stringify({ ok: true, message: `Connected to Splunk: ${serverName}` }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      // 401 = bad token, 403 = permission denied
      if (res.status === 401) {
        return new Response(
          JSON.stringify({ ok: false, message: "Authentication failed. Check your Splunk token." }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      if (res.status === 403) {
        return new Response(
          JSON.stringify({ ok: false, message: "Access denied (HTTP 403). Token lacks required permissions." }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: false, message: `Splunk returned HTTP ${res.status}. Check host URL and token.` }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── MCP Server test ──────────────────────────────────────────────────────
    // Shared helper: build normalised base URL + headers for MCP calls
    function buildMcpContext(rawUrl: string, token: string, authMethod: string, username: string, password: string) {
      const base = rawUrl.trim().replace(/\/$/, "")
        .replace(/\/services\/mcp$/, "")
        .replace(/\/mcp$/, "")
        .replace(/\/messages$/, "");
      const isNgrok = base.includes("ngrok");
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (authMethod === "basic" && username) {
        hdrs["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      } else if (token) {
        hdrs["Authorization"] = `Bearer ${token}`;
      }
      if (isNgrok) hdrs["ngrok-skip-browser-warning"] = "true";
      // Always use /services/mcp — Splunk MCP 1.2 canonical endpoint
      const endpoint = `${base}/services/mcp`;
      return { base, endpoint, hdrs, isNgrok };
    }

    async function mcpRpc(endpoint: string, hdrs: Record<string, string>, method: string, params: unknown, id = 1): Promise<unknown> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw Object.assign(new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`), { status: res.status });
      }
      const json = await res.json();
      if (json?.error) throw new Error(`JSON-RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
      return json;
    }

    // ── Helper: extract common MCP request params ────────────────────────────
    const rawMcpUrl: string = (body.mcpUrl ?? "").trim();
    const mcpToken: string  = (body.mcpToken ?? "").trim();
    const mcpAuthMethod: "bearer" | "basic" = body.mcpAuthMethod === "basic" ? "basic" : "bearer";
    const mcpUsername: string = (body.mcpUsername ?? "").trim();
    const mcpPassword: string = (body.mcpPassword ?? "").trim();

    // ── mode: mcp  ── quick reachability test (tools/list) ───────────────────
    if (mode === "mcp") {
      if (!rawMcpUrl) {
        return new Response(JSON.stringify({ ok: false, message: "mcpUrl is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { endpoint, hdrs } = buildMcpContext(rawMcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword);
      try {
        const json = await mcpRpc(endpoint, hdrs, "tools/list", {}) as Record<string, unknown>;
        const tools = (json as { result?: { tools?: unknown[] } })?.result?.tools ?? [];
        const toolCount = Array.isArray(tools) ? tools.length : "?";
        const first3 = Array.isArray(tools)
          ? tools.slice(0, 3).map((t: unknown) => (t as { name?: string })?.name ?? "?").join(", ")
          : "";
        return new Response(JSON.stringify({
          ok: true,
          message: `MCP Server reachable at ${endpoint}. ${toolCount} tools available (${first3}${Number(toolCount) > 3 ? "…" : ""}).`,
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = (e as { status?: number })?.status;
        let userMsg = msg;
        if (status === 401) userMsg = "Authentication failed (HTTP 401). Check your bearer token.";
        else if (status === 403) userMsg = "Access denied (HTTP 403). Token lacks required permissions.";
        else if (status === 404 || status === 405) userMsg = `Endpoint not found at ${endpoint}. Ensure Splunk MCP Server App is installed and the base URL is correct.`;
        else if (msg.toLowerCase().includes("ngrok")) userMsg = `${msg} — Ensure the ngrok tunnel is running and the URL is current.`;
        return new Response(JSON.stringify({ ok: false, message: userMsg, detail: msg }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    // ── mode: mcp-full  ── initialize + tools/list → full server info ─────────
    // Returns: { ok, message, serverName, serverVersion, toolList: [{name, description, inputSchema?}] }
    if (mode === "mcp-full") {
      if (!rawMcpUrl) {
        return new Response(JSON.stringify({ ok: false, message: "mcpUrl is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { endpoint, hdrs } = buildMcpContext(rawMcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword);
      let serverName = "";
      let serverVersion = "";
      // Step 1: initialize — get server name + version
      try {
        const initJson = await mcpRpc(endpoint, hdrs, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "SentinelOps", version: "1.0" },
        }) as Record<string, unknown>;
        const serverInfo = (initJson as { result?: { serverInfo?: { name?: string; version?: string } } })?.result?.serverInfo;
        serverName    = serverInfo?.name    ?? "";
        serverVersion = serverInfo?.version ?? "";
      } catch { /* initialize may not be required by all servers */ }

      // Step 2: tools/list — get full tool catalog
      try {
        const toolsJson = await mcpRpc(endpoint, hdrs, "tools/list", {}) as Record<string, unknown>;
        const rawTools = (toolsJson as { result?: { tools?: unknown[] } })?.result?.tools ?? [];
        const toolList = Array.isArray(rawTools)
          ? rawTools.map((t: unknown) => {
              const tool = t as { name?: string; description?: string; inputSchema?: unknown };
              return { name: tool.name ?? "", description: tool.description ?? "", inputSchema: tool.inputSchema };
            })
          : [];
        return new Response(JSON.stringify({
          ok: true,
          message: `Connected to ${serverName || "Splunk MCP Server"}${serverVersion ? ` v${serverVersion}` : ""}. ${toolList.length} tools available.`,
          serverName,
          serverVersion,
          toolList,
          endpoint,
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = (e as { status?: number })?.status;
        let userMsg = `tools/list failed: ${msg}`;
        if (status === 401) userMsg = "Authentication failed (HTTP 401). Check your bearer token.";
        else if (status === 403) userMsg = "Access denied (HTTP 403). Token lacks required permissions.";
        else if (status === 404 || status === 405) userMsg = `MCP endpoint not found at ${endpoint}. Check base URL and ensure Splunk MCP Server App is installed.`;
        return new Response(JSON.stringify({ ok: false, message: userMsg, detail: msg }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    // ── mode: mcp-tool-call  ── call any Splunk MCP tool by name ─────────────
    // Body: { mcpUrl, mcpToken?, toolName, toolArgs? }
    // Returns: { ok, toolName, result, raw }
    if (mode === "mcp-tool-call") {
      if (!rawMcpUrl) {
        return new Response(JSON.stringify({ ok: false, message: "mcpUrl is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const toolName: string   = (body.toolName ?? "").trim();
      const toolArgs: unknown  = body.toolArgs ?? {};
      if (!toolName) {
        return new Response(JSON.stringify({ ok: false, message: "toolName is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { endpoint, hdrs } = buildMcpContext(rawMcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword);
      try {
        const raw = await mcpRpc(endpoint, hdrs, "tools/call", { name: toolName, arguments: toolArgs });
        // Unwrap MCP result content array → plain value
        const content = (raw as { result?: { content?: unknown[] } })?.result?.content;
        let result: unknown = raw;
        if (Array.isArray(content) && content.length > 0) {
          const first = content[0] as { type?: string; text?: string };
          if (first.type === "text" && first.text) {
            try { result = JSON.parse(first.text); } catch { result = first.text; }
          } else {
            result = content;
          }
        }
        return new Response(JSON.stringify({ ok: true, toolName, result, raw }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = (e as { status?: number })?.status;
        let userMsg = `Tool call failed: ${msg}`;
        if (status === 401) userMsg = "Authentication failed (HTTP 401). Check your bearer token.";
        else if (status === 403) userMsg = "Access denied (HTTP 403). Token lacks required permissions.";
        return new Response(JSON.stringify({ ok: false, message: userMsg, toolName, detail: msg }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    // ── MCP Debug: raw JSON-RPC probe ────────────────────────────────────────
    if (mode === "mcp-debug") {
      const mcpUrl: string = (body.mcpUrl ?? "").trim().replace(/\/$/, "");
      const mcpToken: string = (body.mcpToken ?? "").trim();
      const method: string  = body.rpcMethod ?? "tools/list";
      const params: unknown = body.rpcParams  ?? {};

      if (!mcpUrl) {
        return new Response(
          JSON.stringify({ ok: false, message: "mcpUrl is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const isNgrok = mcpUrl.includes("ngrok");

      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (mcpToken) reqHeaders["Authorization"] = `Bearer ${mcpToken}`;
      if (isNgrok) reqHeaders["ngrok-skip-browser-warning"] = "true";

      const requestPayload = { jsonrpc: "2.0", id: 1, method, params };
      // Normalise base and probe standard Splunk 1.2 endpoint first
      const normBase = mcpUrl.replace(/\/services\/mcp$/, "").replace(/\/mcp$/, "").replace(/\/messages$/, "");
      const candidates = [
        `${normBase}/services/mcp`,  // Splunk MCP 1.2 standard
        normBase,
        `${normBase}/mcp`,
        `${normBase}/messages`,
      ];
      const seenD = new Set<string>();
      const endpoints = candidates.filter(u => {
        const k = u.replace(/\/$/, ""); return seenD.has(k) ? false : (seenD.add(k), true);
      });

      const probeResults: Array<{
        endpoint: string; status: number | null; ok: boolean;
        responseBody: unknown; durationMs: number; error?: string;
      }> = [];

      for (const endpoint of endpoints) {
        const t0 = Date.now();
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify(requestPayload),
            signal: AbortSignal.timeout(10000),
          });
          let responseBody: unknown = null;
          const ct = r.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            try { responseBody = await r.json(); } catch { responseBody = await r.text(); }
          } else {
            responseBody = await r.text();
          }
          probeResults.push({ endpoint, status: r.status, ok: r.ok, responseBody, durationMs: Date.now() - t0 });
        } catch (e) {
          probeResults.push({
            endpoint, status: null, ok: false, responseBody: null,
            durationMs: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, requestPayload, probeResults }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── mode: mcp-auth-debug  ── verbose header capture on 401/403 ──────────
    // Performs a single tools/list call and returns FULL request + response
    // headers so engineers can diagnose authentication failures precisely.
    // The auth token value is redacted: only the first 8 chars are shown.
    if (mode === "mcp-auth-debug") {
      if (!rawMcpUrl) {
        return new Response(JSON.stringify({ ok: false, message: "mcpUrl is required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const { endpoint, hdrs, isNgrok } = buildMcpContext(rawMcpUrl, mcpToken, mcpAuthMethod, mcpUsername, mcpPassword);

      const requestPayload = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

      // Build a redacted copy of outgoing headers for the report
      const redactedRequestHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(hdrs)) {
        if (k.toLowerCase() === "authorization") {
          const parts = v.split(" ");
          const scheme = parts[0] ?? "Bearer";
          const cred   = parts[1] ?? "";
          redactedRequestHeaders[k] = `${scheme} ${cred.slice(0, 8)}${"*".repeat(Math.max(0, cred.length - 8))}`;
        } else {
          redactedRequestHeaders[k] = v;
        }
      }
      redactedRequestHeaders["X-Debug-Endpoint"]      = endpoint;
      redactedRequestHeaders["X-Debug-NgrokDetected"] = String(isNgrok);
      redactedRequestHeaders["X-Debug-AuthMethod"]    = mcpAuthMethod;

      const t0 = Date.now();
      let status: number | null = null;
      let responseHeaders: Record<string, string> = {};
      let responseBody: unknown = null;
      let networkError: string | null = null;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(12000),
        });

        status = res.status;
        res.headers.forEach((value, key) => { responseHeaders[key] = value; });

        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          try { responseBody = await res.json(); }
          catch { responseBody = await res.text().catch(() => "<unreadable>"); }
        } else {
          responseBody = await res.text().catch(() => "<unreadable>");
        }
      } catch (e) {
        networkError = e instanceof Error ? e.message : String(e);
      }

      const durationMs = Date.now() - t0;

      let diagnosis = "";
      if (networkError) {
        diagnosis = `Network error — ${networkError}. Check that the ngrok tunnel is running and the URL is current.`;
      } else if (status === 401) {
        const authHdr = redactedRequestHeaders["Authorization"] ?? "";
        diagnosis =
          `HTTP 401 Unauthorized — server rejected the credentials.\n` +
          `• Sent: ${authHdr}\n` +
          `• Verify the token matches your Splunk user's API token exactly\n` +
          `• Confirm the Splunk user has the 'admin' or 'power' role\n` +
          `• Ensure the Splunk MCP Server App is installed and enabled\n` +
          `• If using ngrok, confirm the tunnel is active and the URL is current`;
      } else if (status === 403) {
        diagnosis =
          `HTTP 403 Forbidden — token valid but lacks permission.\n` +
          `• Grant the Splunk user 'list_inputs' and 'search' capabilities\n` +
          `• Consider assigning the 'power' role in Splunk → Settings → Users`;
      } else if (status === 404 || status === 405) {
        diagnosis =
          `HTTP ${status} — Endpoint not found at ${endpoint}.\n` +
          `• Confirm Splunk MCP Server App is installed (Splunkbase: "Splunk MCP")\n` +
          `• Enter only the base URL — SentinelOps appends /services/mcp automatically\n` +
          `• Splunk MCP Server must be version 1.2 or later`;
      } else if (status && status >= 200 && status < 300) {
        diagnosis = `HTTP ${status} — Request succeeded. No auth failure detected.`;
      } else if (status) {
        diagnosis = `HTTP ${status} — Unexpected status. See response body for details.`;
      }

      return new Response(JSON.stringify({
        ok: !networkError && status !== null && status >= 200 && status < 300,
        status,
        diagnosis,
        endpoint,
        durationMs,
        requestHeaders: redactedRequestHeaders,
        requestPayload,
        responseHeaders,
        responseBody,
        networkError,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ ok: false, message: `Unknown mode: ${mode}` }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ ok: false, message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
