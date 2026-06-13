// Edge Function: pagerduty-event
// Creates or updates a PagerDuty incident via Events API v2.
// POST { action, incidentId, title, severity, service, summary, source?, dedup_key? }
// action: 'trigger' | 'acknowledge' | 'resolve'
// Returns { dedup_key, status, message }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PD_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const PD_CHANGE_URL = "https://events.pagerduty.com/v2/change/enqueue";

// PagerDuty severity mapping from SentinelOps severity
const SEV_MAP: Record<string, string> = {
  CRITICAL: "critical",
  HIGH:     "error",
  MEDIUM:   "warning",
  LOW:      "info",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const {
      action     = "trigger",           // trigger | acknowledge | resolve
      incidentId,
      title,
      severity   = "HIGH",
      service    = "unknown-service",
      summary,
      source     = "SentinelOps",
      dedup_key: clientDedupKey,
      // User can pass their own routing key from Settings; fall back to server secret
      routingKey: bodyRoutingKey,
    } = body;

    if (!incidentId || !title) {
      return new Response(
        JSON.stringify({ error: "incidentId and title are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Resolve routing key: body > Supabase secret
    const routingKey = (bodyRoutingKey as string | undefined) || Deno.env.get("PAGERDUTY_ROUTING_KEY") || "";
    if (!routingKey) {
      return new Response(
        JSON.stringify({ error: "PagerDuty routing key not configured. Set PAGERDUTY_ROUTING_KEY in Settings or Supabase secrets." }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Stable dedup key = incidentId so repeated triggers don't create duplicates
    const dedup_key = clientDedupKey || `sentinelops-${incidentId}`;
    const pd_severity = SEV_MAP[severity.toUpperCase()] ?? "error";

    let payload: Record<string, unknown>;

    if (action === "trigger") {
      payload = {
        routing_key: routingKey,
        event_action: "trigger",
        dedup_key,
        payload: {
          summary:   `[${severity}] ${title}`,
          source,
          severity:  pd_severity,
          timestamp: new Date().toISOString(),
          component: service,
          group:     "SentinelOps",
          class:     "incident",
          custom_details: {
            incident_id: incidentId,
            service,
            summary:     summary ?? title,
            sentinelops_url: `${Deno.env.get("VITE_APP_URL") ?? "https://sentinelops.app"}/dashboard?incident=${incidentId}`,
          },
        },
        links: [
          {
            href: `${Deno.env.get("VITE_APP_URL") ?? "https://sentinelops.app"}/dashboard?incident=${incidentId}`,
            text: "View in SentinelOps",
          },
        ],
      };
    } else {
      // acknowledge or resolve
      payload = {
        routing_key: routingKey,
        event_action: action,  // "acknowledge" | "resolve"
        dedup_key,
      };
    }

    const pdRes = await fetch(PD_EVENTS_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10000),
    });

    const pdData = await pdRes.json().catch(() => ({}));

    if (!pdRes.ok) {
      return new Response(
        JSON.stringify({ error: `PagerDuty error ${pdRes.status}`, detail: pdData }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Persist the PD event to the pagerduty_events table for audit trail
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Get user from JWT
      const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      const { data: { user } } = await supabase.auth.getUser(jwt);

      await supabase.from("pagerduty_events").insert({
        user_id:     user?.id ?? null,
        incident_id: incidentId,
        action,
        dedup_key,
        pd_status:   pdData.status ?? "sent",
        pd_message:  pdData.message ?? null,
      });
    } catch {
      // Audit log failure is non-fatal
    }

    return new Response(
      JSON.stringify({ dedup_key, status: pdData.status ?? "sent", message: pdData.message ?? `${action} sent to PagerDuty` }),
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
