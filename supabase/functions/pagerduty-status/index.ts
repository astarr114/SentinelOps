// Edge Function: pagerduty-status
// Fetches open, acknowledged, and resolved incident counts from PagerDuty REST API v2.
// GET ?since=<ISO>&until=<ISO>  (optional, defaults to last 24h)
// Returns { open, acknowledged, resolved, total, incidents[] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PD_BASE = "https://api.pagerduty.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const url = new URL(req.url);
    // Accept REST API key from query param (passed by client from user's saved config)
    // or fall back to Supabase server secret
    const restApiKey =
      url.searchParams.get("restApiKey") ||
      Deno.env.get("PAGERDUTY_REST_API_KEY") ||
      "";

    if (!restApiKey) {
      return new Response(
        JSON.stringify({
          error: "PagerDuty REST API key not configured.",
          hint: "Add your PagerDuty REST API key in Settings → Integrations.",
          mock: true,
          open: 0, acknowledged: 0, resolved: 0, total: 0, incidents: [],
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const since = url.searchParams.get("since") ||
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const until = url.searchParams.get("until") || new Date().toISOString();

    // Fetch triggered + acknowledged (open) incidents
    const fetchPage = async (statuses: string[], offset = 0) => {
      const params = new URLSearchParams({
        "time_zone": "UTC",
        "since": since,
        "until": until,
        "limit": "100",
        "offset": String(offset),
      });
      statuses.forEach(s => params.append("statuses[]", s));

      const res = await fetch(`${PD_BASE}/incidents?${params}`, {
        headers: {
          "Accept": "application/vnd.pagerduty+json;version=2",
          "Authorization": `Token token=${restApiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`PD API ${res.status}: ${txt}`);
      }
      return res.json();
    };

    // Fetch triggered+acknowledged and resolved in parallel
    const [openData, resolvedData] = await Promise.all([
      fetchPage(["triggered", "acknowledged"]),
      fetchPage(["resolved"]),
    ]);

    const openIncidents = openData.incidents ?? [];
    const resolvedIncidents = resolvedData.incidents ?? [];

    const triggered     = openIncidents.filter((i: { status: string }) => i.status === "triggered").length;
    const acknowledged  = openIncidents.filter((i: { status: string }) => i.status === "acknowledged").length;
    const resolved      = resolvedIncidents.length;

    // Build summary list (most recent 10 across all statuses)
    const allIncidents = [...openIncidents, ...resolvedIncidents]
      .sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 10)
      .map((i: {
        id: string; summary: string; status: string;
        urgency: string; created_at: string; html_url: string;
        service?: { summary: string };
      }) => ({
        id:         i.id,
        title:      i.summary,
        status:     i.status,
        urgency:    i.urgency,
        created_at: i.created_at,
        html_url:   i.html_url,
        service:    i.service?.summary ?? "unknown",
      }));

    return new Response(
      JSON.stringify({
        open:         triggered,
        acknowledged,
        resolved,
        total:        triggered + acknowledged + resolved,
        incidents:    allIncidents,
        since,
        until,
        mock:         false,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
