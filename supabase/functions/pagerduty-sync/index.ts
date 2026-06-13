// Edge Function: pagerduty-sync
// Fetches open incidents from PagerDuty REST API v2 and upserts them into live_incidents.
// POST { restApiKey, teamIds?, serviceIds?, limit? }
// Returns { synced, skipped, errors[], incidents[] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PD_BASE = "https://api.pagerduty.com";

// Map PagerDuty urgency/priority to SentinelOps severity
function mapSeverity(urgency: string, priority?: string): string {
  if (priority === 'P1') return 'CRITICAL';
  if (priority === 'P2') return 'HIGH';
  if (urgency === 'high') return 'HIGH';
  if (urgency === 'low')  return 'MEDIUM';
  return 'LOW';
}

// Map PagerDuty status to SentinelOps status
function mapStatus(pdStatus: string): string {
  if (pdStatus === 'triggered')     return 'OPEN';
  if (pdStatus === 'acknowledged')  return 'INVESTIGATING';
  if (pdStatus === 'resolved')      return 'RESOLVED';
  return 'OPEN';
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let restApiKey = "";
  let teamIds: string[] = [];
  let serviceIds: string[] = [];
  let limit = 50;

  try {
    const body = await req.json();
    restApiKey  = body.restApiKey || Deno.env.get("PAGERDUTY_REST_API_KEY") || "";
    teamIds     = Array.isArray(body.teamIds)    ? body.teamIds    : [];
    serviceIds  = Array.isArray(body.serviceIds) ? body.serviceIds : [];
    limit       = typeof body.limit === "number"  ? Math.min(body.limit, 100) : 50;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!restApiKey) {
    return new Response(
      JSON.stringify({
        error: "PagerDuty REST API key not configured.",
        hint:  "Add your PagerDuty REST API key in Settings → Integrations.",
      }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Build PagerDuty incidents query
  const params = new URLSearchParams({
    "statuses[]":   "triggered",
    "sort_by":      "created_at:desc",
    "limit":        String(limit),
    "include[]":    "services",
  });
  // optionally filter by team or service
  teamIds.forEach(id    => params.append("team_ids[]",    id));
  serviceIds.forEach(id => params.append("service_ids[]", id));
  // also fetch acknowledged
  params.append("statuses[]", "acknowledged");

  const pdRes = await fetch(`${PD_BASE}/incidents?${params.toString()}`, {
    headers: {
      "Accept":        "application/vnd.pagerduty+json;version=2",
      "Authorization": `Token token=${restApiKey}`,
      "Content-Type":  "application/json",
    },
  });

  if (!pdRes.ok) {
    const errText = await pdRes.text();
    return new Response(
      JSON.stringify({ error: `PagerDuty API error: ${pdRes.status}`, detail: errText.slice(0, 300) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const pdData = await pdRes.json();
  const pdIncidents: Record<string, unknown>[] = Array.isArray(pdData.incidents) ? pdData.incidents : [];

  // Init Supabase admin client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  const upserted: Record<string, unknown>[] = [];

  for (const inc of pdIncidents) {
    try {
      const pdId       = String(inc.id ?? "");
      const title      = String(inc.title ?? "PagerDuty incident");
      const urgency    = String((inc as Record<string, unknown>).urgency ?? "high");
      const pdStatus   = String(inc.status ?? "triggered");
      const service    = String(
        ((inc as Record<string, unknown>).service as Record<string, unknown>)?.summary
        ?? "pagerduty"
      );
      const priority   = String(
        ((inc as Record<string, unknown>).priority as Record<string, unknown>)?.name ?? ""
      );
      const summary    = String((inc as Record<string, unknown>).description ?? inc.title ?? "");
      const openedAt   = String((inc as Record<string, unknown>).created_at ?? new Date().toISOString());

      if (!pdId) { skipped++; continue; }

      const row = {
        id:             `PD-${pdId}`,
        pd_incident_id: pdId,
        title,
        severity:    mapSeverity(urgency, priority),
        status:      mapStatus(pdStatus),
        service:     service.toLowerCase().replace(/\s+/g, "-").slice(0, 80),
        summary:     summary.slice(0, 500) || null,
        opened_at:   openedAt,
        is_synthetic: false,
        time_window:  "last_30m",
        tags:         ["pagerduty"],
      };

      const { error: upsertErr } = await supabase
        .from("live_incidents")
        .upsert(row, { onConflict: "pd_incident_id", ignoreDuplicates: false });

      if (upsertErr) { errors.push(`${pdId}: ${upsertErr.message}`); continue; }
      synced++;
      upserted.push({ id: row.id, title: row.title, severity: row.severity, status: row.status, service: row.service });
    } catch (e) {
      errors.push(String(e));
    }
  }

  return new Response(
    JSON.stringify({ synced, skipped, errors, incidents: upserted }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
