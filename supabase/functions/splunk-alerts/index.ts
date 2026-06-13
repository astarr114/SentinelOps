// Edge Function: splunk-alerts
// Bidirectional Splunk saved-alerts integration.
//
// POST { splunkHost, splunkToken }
//   → fetches /services/saved/searches from Splunk REST API
//   → returns normalised alert objects (with auto-detected severity) for the
//     client to upsert into splunk_saved_alerts
//
// POST { mode: "run-now", splunkHost, splunkToken, spl }
//   → executes an arbitrary SPL via Splunk REST and returns results
//     (used by the "Run Now" button on saved alert cards)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SplunkAlert {
  splunkName:   string;
  alertName:    string;
  search:       string;
  cronSchedule: string | null;
  nextFireTime: string | null;
  isEnabled:    boolean;
  alertType:    string;
  actions:      string[];
  severity:     string; // auto-detected
  raw:          Record<string, unknown>;
}

// ── Severity heuristic ────────────────────────────────────────────────────────
// Inspects SPL text and the alert name for risk signals and assigns one of:
//   critical → high-risk terms: security indexes, "critical", "failed login", etc.
//   high     → "error", "failure", "exception", severity=high/priority=high
//   medium   → "warn", general error/log patterns
//   low      → none of the above (informational / performance)
//
// This is intentionally simple and rule-based so it is easy to audit.
// When the caller passes a severityRules object, it overrides the built-in defaults.
interface SeverityRules {
  critical?: string[];
  high?:     string[];
  medium?:   string[];
  low?:      string[];
}

function detectSeverity(spl: string, alertName: string, rules?: SeverityRules | null): string {
  const text = `${spl} ${alertName}`.toLowerCase();

  // Use caller-supplied keyword lists if provided, otherwise fall back to built-in defaults.
  const criticalKeywords: (string | RegExp)[] = rules?.critical?.length
    ? rules.critical
    : [
        /index\s*=\s*(security|audit|auth|intrusion|firewall|ids|ips)/,
        /\bcritical\b/,
        /failed\s+login/,
        /authentication\s+failure/,
        /brute[_\s]?force/,
        /privilege\s+escalat/,
        /ransomware/,
        /malware/,
        /severity\s*=\s*critical/,
        /priority\s*=\s*critical/,
        /alert_severity\s*=\s*critical/,
      ];

  const highKeywords: (string | RegExp)[] = rules?.high?.length
    ? rules.high
    : [
        /\berror\b/,
        /\bfailure\b/,
        /\bfailed\b/,
        /\bexception\b/,
        /\bcrash\b/,
        /\boutage\b/,
        /\bdown\b/,
        /severity\s*=\s*high/,
        /priority\s*=\s*high/,
        /alert_severity\s*=\s*high/,
        /level\s*=\s*error/,
        /status\s*[=>]\s*[45]\d{2}/,
      ];

  const mediumKeywords: (string | RegExp)[] = rules?.medium?.length
    ? rules.medium
    : [
        /\bwarn(ing)?\b/,
        /\bthreshold\b/,
        /\blatency\b/,
        /\bslow\b/,
        /\btimeout\b/,
        /severity\s*=\s*medium/,
        /priority\s*=\s*medium/,
        /level\s*=\s*warn/,
      ];

  // Helper: test a keyword list — accepts plain strings (substring match) or RegExp
  const matches = (keywords: (string | RegExp)[]) =>
    keywords.some(k => typeof k === "string" ? text.includes(k.toLowerCase()) : k.test(text));

  if (matches(criticalKeywords)) return "critical";
  if (matches(highKeywords))     return "high";
  if (matches(mediumKeywords))   return "medium";
  return "low";
}

// ── Splunk REST: run SPL and return up to 50 results ─────────────────────────
async function runSpl(
  splunkHost: string,
  splunkToken: string,
  spl: string,
): Promise<{ results: Array<Record<string, string>>; raw: unknown }> {
  const base = splunkHost.replace(/\/$/, "");
  // Splunk REST requires the `search` keyword prefix when using /services/search/jobs
  const splForRest = /^\s*search\s+/i.test(spl) ? spl : `search ${spl}`;

  // 1 — submit async job
  const createRes = await fetch(`${base}/services/search/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${splunkToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ search: splForRest, output_mode: "json" }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    // Provide structured error type for the frontend to display clearly
    const errorType = createRes.status === 401 ? "auth_error"
      : createRes.status === 403 ? "permission_error"
      : `splunk_error_status_${createRes.status}`;
    throw Object.assign(
      new Error(`Splunk returned HTTP ${createRes.status}: ${errBody.slice(0, 200)}`),
      { errorType },
    );
  }

  const createData = await createRes.json();
  const sid: string = createData?.sid;
  if (!sid) throw Object.assign(new Error("Splunk REST: no search ID returned"), { errorType: "parse_error" });

  // 2 — poll until done (max 25s)
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`${base}/services/search/jobs/${sid}?output_mode=json`, {
      headers: { Authorization: `Bearer ${splunkToken}` },
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
    { headers: { Authorization: `Bearer ${splunkToken}` }, signal: AbortSignal.timeout(10000) },
  );
  if (!resultsRes.ok) {
    throw Object.assign(
      new Error(`Splunk results fetch failed: HTTP ${resultsRes.status}`),
      { errorType: `splunk_error_status_${resultsRes.status}` },
    );
  }
  const resultsData = await resultsRes.json();
  return {
    results: Array.isArray(resultsData?.results) ? resultsData.results : [],
    raw: resultsData,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body", errorType: "parse_error" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const splunkHost    = ((body.splunkHost  ?? "") as string).trim().replace(/\/$/, "");
  const splunkToken   = ((body.splunkToken ?? "") as string).trim();
  const mode          = (body.mode as string | undefined) ?? "import";
  // Optional per-user severity keyword rules forwarded from the frontend (Settings).
  // Null means use built-in defaults inside detectSeverity().
  const severityRules = (body.severityRules as SeverityRules | null | undefined) ?? null;

  if (!splunkHost || !splunkToken) {
    return new Response(
      JSON.stringify({ error: "splunkHost and splunkToken are required.", errorType: "config_error" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // ── mode: run-now ─────────────────────────────────────────────────────────
  // Executes a single SPL query and returns results. Used by the "Run Now"
  // button on saved alert cards in the Alerts tab.
  if (mode === "run-now") {
    const spl = ((body.spl ?? "") as string).trim();
    if (!spl) {
      return new Response(
        JSON.stringify({ error: "spl is required for run-now mode.", errorType: "config_error" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    try {
      const { results, raw } = await runSpl(splunkHost, splunkToken, spl);
      return new Response(
        JSON.stringify({ ok: true, results, raw, resultCount: results.length }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    } catch (err) {
      const msg       = err instanceof Error ? err.message : "Execution failed";
      const errorType = (err as { errorType?: string }).errorType ?? "splunk_error";
      console.error(`splunk-alerts run-now error [${errorType}]:`, msg);
      return new Response(
        JSON.stringify({ ok: false, error: msg, errorType }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
  }

  // ── mode: import (default) ────────────────────────────────────────────────
  // Fetch saved searches from Splunk and return normalised alert objects with
  // auto-detected severity. The client upserts these into splunk_saved_alerts.
  const url = `${splunkHost}/services/saved/searches?output_mode=json&count=200&sort_key=name`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${splunkToken}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const isTls = msg.toLowerCase().includes("cert") || msg.toLowerCase().includes("ssl") || msg.toLowerCase().includes("tls");
    const errorType = isTls ? "tls_error" : "connection_error";
    console.error(`splunk-alerts import [${errorType}]:`, msg);
    return new Response(
      JSON.stringify({
        error: isTls
          ? `SSL/TLS error — check Splunk host URL and certificate. Detail: ${msg}`
          : `Cannot reach Splunk at ${splunkHost}. Check the host URL and network. Detail: ${msg}`,
        errorType,
      }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const errorType = res.status === 401 ? "auth_error"
      : res.status === 403 ? "permission_error"
      : `splunk_error_status_${res.status}`;
    const userMsg = res.status === 401
      ? "Authentication failed — check your Splunk token."
      : res.status === 403
        ? `Access denied (HTTP 403) — token may lack the list_saved_searches capability. Detail: ${errBody.slice(0, 120)}`
        : `Splunk returned HTTP ${res.status}. Detail: ${errBody.slice(0, 120)}`;
    console.error(`splunk-alerts import [${errorType}]: HTTP ${res.status}`, errBody.slice(0, 300));
    return new Response(
      JSON.stringify({ error: userMsg, errorType }),
      { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : "JSON parse failed";
    console.error("splunk-alerts import [parse_error]:", msg);
    return new Response(
      JSON.stringify({ error: `Splunk response could not be parsed: ${msg}`, errorType: "parse_error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const entries: unknown[] = Array.isArray(data?.entry) ? data.entry : [];

  const alerts: SplunkAlert[] = entries
    .map((entry: unknown) => {
      const e       = entry as Record<string, unknown>;
      const content = (e?.content ?? {}) as Record<string, unknown>;
      const name    = String(e?.name ?? "");

      // Include entry if it has any alert/schedule indicator.
      // We intentionally accept entries WITHOUT a cron_schedule because
      // real-time alerts and alerts without a schedule still have alert_type set.
      // Plain saved searches that are pure searches (no alert configuration)
      // have alert_type="" AND is_scheduled=false — we skip only those.
      const cronSchedule = content?.cron_schedule ? String(content.cron_schedule) : null;
      const isScheduled  = content?.is_scheduled === "1" || content?.is_scheduled === true;
      const alertType    = String(content?.alert_type ?? "");
      const isAlert = !!cronSchedule || isScheduled || alertType !== "";

      // Skip pure saved-searches with no alert configuration and no SPL
      const search = String(content?.search ?? "").trim();
      if (!isAlert && !search) return null;

      const actionsRaw = content?.actions;
      const actions: string[] = typeof actionsRaw === "string"
        ? actionsRaw.split(",").map(s => s.trim()).filter(Boolean)
        : Array.isArray(actionsRaw) ? actionsRaw.map(String)
        : [];

      const alertName = String(content?.displayName ?? name);

      // Safely coerce next_scheduled_time — Splunk can return:
      //   • Unix epoch number/string (e.g. "1748520060")
      //   • ISO 8601 string        (e.g. "2026-05-29T12:21:00.000Z")
      //   • Locale string          (e.g. "2026-05-29 12:21:00 India Standard Time")
      //   • Sentinel values 0 / -1 (meaning "not scheduled")
      // We always normalise to ISO 8601 UTC, or null if unparseable.
      const rawNextTime = content?.next_scheduled_time;
      let nextFireTime: string | null = null;
      if (rawNextTime !== undefined && rawNextTime !== null && rawNextTime !== "") {
        const candidate = String(rawNextTime).trim();
        const asNum = Number(candidate);
        if (!isNaN(asNum) && asNum > 0) {
          // Unix epoch seconds → ISO
          nextFireTime = new Date(asNum * 1000).toISOString();
        } else if (isNaN(asNum) && candidate.length > 4) {
          // Try to parse as a Date (handles ISO strings and locale strings)
          const parsed = new Date(candidate);
          if (!isNaN(parsed.getTime())) {
            nextFireTime = parsed.toISOString();
          }
          // Otherwise null — unparseable timestamp discarded
        }
      }

      return {
        splunkName:   name,
        alertName,
        search:       search || String(content?.search ?? ""),
        cronSchedule,
        nextFireTime,
        isEnabled:    content?.disabled !== "1" && content?.disabled !== true,
        alertType:    alertType || "number_of_events",
        actions,
        // Auto-detect severity using caller-supplied rules or built-in defaults
        severity:     detectSeverity(search, alertName, severityRules),
        raw:          content as Record<string, unknown>,
      } satisfies SplunkAlert;
    })
    .filter((a): a is SplunkAlert => a !== null && a.search.trim() !== "");

  return new Response(
    JSON.stringify({ alerts, total: alerts.length }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
