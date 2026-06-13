// Edge Function: synthetic-alert-job
// Invoked by pg_cron every hour to insert a synthetic CRITICAL/HIGH incident
// into live_incidents, triggering the Supabase Realtime alert pipeline.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICES = [
  "checkout-service",
  "payment-api",
  "auth-service",
  "inventory-service",
  "notification-service",
];

const SEVERITIES: Array<"CRITICAL" | "HIGH"> = ["CRITICAL", "HIGH"];

function buildTitle(service: string, severity: "CRITICAL" | "HIGH"): string {
  if (severity === "CRITICAL") {
    const variants = [
      `${service} critical failure detected`,
      `${service} complete service outage`,
      `${service} database connection pool exhausted`,
      `${service} null pointer exception cascade`,
      `${service} P99 latency exceeded SLA by 10x`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }
  const variants = [
    `${service} high error rate spike`,
    `${service} elevated 5xx responses`,
    `${service} memory usage at 92%`,
    `${service} slow query timeout warnings`,
    `${service} circuit breaker opened`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

function buildSummary(service: string, severity: "CRITICAL" | "HIGH"): string {
  const now = new Date().toISOString().slice(11, 16); // HH:MM
  if (severity === "CRITICAL") {
    return `Synthetic test — ${service} reported critical failure at ${now} UTC. Error rate exceeded threshold. This is an automated pipeline validation incident.`;
  }
  return `Synthetic test — ${service} reported elevated error rate at ${now} UTC. Latency P99 above baseline. This is an automated pipeline validation incident.`;
}

// Sequential counter stored in a lightweight counter key using DB
async function getNextIncidentId(supabase: ReturnType<typeof createClient>): Promise<string> {
  // Use a simple time-based ID to avoid race conditions without a sequence table
  const ts = Date.now().toString(36).toUpperCase();
  return `INC-SYN-${ts}`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Accept GET (from pg_cron http extension) or POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Rotation based on current hour
  const hour = new Date().getUTCHours();
  const service  = SERVICES[hour % SERVICES.length];
  const severity = SEVERITIES[hour % SEVERITIES.length];

  const incidentId   = await getNextIncidentId(supabase);
  const title        = buildTitle(service, severity);
  const summary      = buildSummary(service, severity);

  const { error } = await supabase.from("live_incidents").insert({
    id:           incidentId,
    title,
    severity,
    status:       "OPEN",
    service,
    summary,
    opened_at:    new Date().toISOString(),
    is_synthetic: true,
  });

  if (error) {
    console.error("synthetic-alert-job insert error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log(`synthetic-alert-job: inserted ${incidentId} [${severity}] ${service}`);

  return new Response(
    JSON.stringify({ ok: true, incidentId, severity, service }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
