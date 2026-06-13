// Edge Function: splunk-alert-webhook
// Receives Splunk Webhook alert payloads and inserts a new incident row into
// live_incidents, triggering the existing Supabase Realtime alert pipeline.
//
// Auth: ?secret=<SPLUNK_WEBHOOK_SECRET> query parameter.
//   Splunk Enterprise 10.x Webhook action only supports a URL field — it cannot
//   set custom headers — so the shared secret must be passed as a query param.
//   Configure the Webhook URL in Splunk as:
//     https://<project>.functions.supabase.co/splunk-alert-webhook?secret=<value>
//
// Method: POST only (OPTIONS handled for CORS preflight).
//
// Expected Splunk webhook payload (default format):
// {
//   "result": {
//     "_time": "2025-01-15T10:30:00.000+00:00",
//     "service": "checkout-service",
//     "severity": "CRITICAL",
//     "message": "Error rate exceeded threshold"
//   },
//   "sid": "scheduler_admin_search__RMD5d8ab...",
//   "results_link": "https://splunk.example.com/app/search/@go?sid=...",
//   "search_name": "SentinelOps - High error rate",
//   "owner": "admin",
//   "app": "search"
// }

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const DEFAULT_SEVERITY   = "HIGH";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a raw severity string to a known value or fall back to DEFAULT. */
function normaliseSeverity(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SEVERITY;
  const upper = raw.trim().toUpperCase();
  return ALLOWED_SEVERITIES.has(upper) ? upper : DEFAULT_SEVERITY;
}

/**
 * Build a stable incident ID from the Splunk SID.
 * Uses the first 8 characters of the SID so the same alert firing twice
 * on the same SID can be detected by the caller (not deduplicated at DB
 * level — dedup is intentionally left to the Splunk schedule).
 */
function buildIncidentId(sid: unknown): string {
  if (typeof sid === "string" && sid.trim().length > 0) {
    const slug = sid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
    if (slug.length > 0) return `INC-SPLUNK-${slug}`;
  }
  // Fallback: time-based unique ID
  return `INC-SPLUNK-${Date.now().toString(36).toUpperCase()}`;
}

/** Extract a human-readable service name from the result object. */
function extractService(result: Record<string, unknown>): string {
  for (const key of ["service", "service_name", "host", "source"]) {
    const val = result[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
  }
  return "unknown-service";
}

/** Build a plain-text summary from the Splunk result fields. */
function buildSummary(
  result: Record<string, unknown>,
  searchName: string,
  sid: string,
): string {
  const message   = typeof result.message   === "string" ? result.message.trim()   : "";
  const eventTime = typeof result._time     === "string" ? result._time            : new Date().toISOString();
  const host      = typeof result.host      === "string" ? ` on ${result.host}`    : "";
  const base      = message || `Alert fired: ${searchName || "Splunk search"}`;
  return `${base}${host}. Event time: ${eventTime}. Search ID: ${sid}.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Auth: shared secret via ?secret= query parameter ─────────────────────
  const url            = new URL(req.url);
  const actualSecret   = url.searchParams.get("secret") ?? "";
  const expectedSecret = Deno.env.get("SPLUNK_WEBHOOK_SECRET") ?? "";
  // Allow _test=1 ping from the Settings page (bypasses secret check so
  // users can verify connectivity before the secret is configured).
  const isTestPing = url.searchParams.get("_test") === "1";

  if (!expectedSecret) {
    console.warn(
      "splunk-alert-webhook: SPLUNK_WEBHOOK_SECRET is not set. " +
      "Set it in Supabase Edge Function secrets and add ?secret=<value> to the Splunk Webhook URL.",
    );
  } else if (!isTestPing && actualSecret !== expectedSecret) {
    console.warn("splunk-alert-webhook: unauthorised request — secret mismatch");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Test-ping short-circuit ───────────────────────────────────────────────
  // When the Settings page fires a test ping, we validate auth+connectivity
  // only and return without touching the database.
  if (isTestPing || payload.__test === true) {
    const secretStatus = !expectedSecret
      ? "not_configured"
      : actualSecret === expectedSecret ? "ok" : "mismatch";
    return new Response(
      JSON.stringify({ ok: true, ping: true, secretStatus }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Splunk Webhook payloads always wrap event fields under "result"
  const result: Record<string, unknown> =
    payload.result && typeof payload.result === "object"
      ? (payload.result as Record<string, unknown>)
      : {};

  const sid          = typeof payload.sid          === "string" ? payload.sid          : "";
  const resultsLink  = typeof payload.results_link === "string" ? payload.results_link : null;
  const searchName   = typeof payload.search_name  === "string" ? payload.search_name  : "";

  // ── Map to live_incidents fields ──────────────────────────────────────────
  const incidentId = buildIncidentId(sid);
  const service    = extractService(result);
  const severity   = normaliseSeverity(result.severity ?? result.alert_severity ?? result.level);
  const now        = new Date().toISOString();

  // Title: prefer search_name → result.title → generated fallback
  const title: string =
    searchName.trim()                                            ||
    (typeof result.title   === "string" ? result.title.trim() : "") ||
    (typeof result.message === "string" ? result.message.slice(0, 120).trim() : "") ||
    `Splunk alert for service ${service}`;

  const summary = buildSummary(result, searchName, sid || incidentId);

  // ── Supabase insert ───────────────────────────────────────────────────────
  const supabaseUrl    = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("splunk-alert-webhook: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const row = {
    id:                  incidentId,
    title,
    severity,
    status:              "OPEN",
    service,
    summary,
    opened_at:           now,
    is_synthetic:        false,
    source:              "splunk-webhook",
    splunk_results_link: resultsLink,
  };

  const { error: dbError } = await supabase.from("live_incidents").insert(row);

  if (dbError) {
    console.error("splunk-alert-webhook: DB insert failed →", dbError.message, dbError.details);
    return new Response(
      JSON.stringify({ error: "Database insert failed", detail: dbError.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  console.log(`splunk-alert-webhook: inserted ${incidentId} [${severity}] ${service} — "${title}"`);

  return new Response(
    JSON.stringify({ ok: true, incident_id: incidentId }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
