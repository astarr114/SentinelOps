// Edge Function: alert-email
// Sends a CRITICAL/HIGH incident notification email via Resend.
// POST { incidentId, title, severity, service, summary, recipientEmail }
// Returns { id, status }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_URL = "https://api.resend.com/emails";

const SEV_COLOUR: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#eab308",
  LOW:      "#3b82f6",
};

function buildHtml(
  incidentId: string, title: string, severity: string,
  service: string, summary: string, dashUrl: string,
): string {
  const colour = SEV_COLOUR[severity.toUpperCase()] ?? "#6366f1";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SentinelOps Alert</title></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:32px auto;background:#1e2330;border-radius:12px;overflow:hidden;border:1px solid #2d3748;">
    <!-- Header -->
    <div style="background:${colour}22;border-bottom:2px solid ${colour};padding:20px 28px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:12px;height:12px;border-radius:50%;background:${colour};flex-shrink:0;"></div>
        <span style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${colour};">
          ${severity} Incident
        </span>
      </div>
      <h1 style="margin:12px 0 4px;font-size:18px;font-weight:700;color:#f8fafc;line-height:1.3;">${title}</h1>
      <p style="margin:0;font-size:12px;color:#94a3b8;font-family:monospace;">${incidentId} · ${service}</p>
    </div>
    <!-- Body -->
    <div style="padding:24px 28px;space-y:16px;">
      <p style="margin:0 0 16px;font-size:14px;color:#cbd5e1;line-height:1.6;">${summary}</p>
      <div style="background:#0f1117;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <table style="width:100%;font-size:12px;color:#94a3b8;border-collapse:collapse;">
          <tr><td style="padding:4px 0;width:30%;">Service</td><td style="color:#e2e8f0;font-family:monospace;">${service}</td></tr>
          <tr><td style="padding:4px 0;">Severity</td><td style="color:${colour};font-weight:600;">${severity}</td></tr>
          <tr><td style="padding:4px 0;">Incident&nbsp;ID</td><td style="color:#e2e8f0;font-family:monospace;">${incidentId}</td></tr>
          <tr><td style="padding:4px 0;">Detected</td><td style="color:#e2e8f0;">${new Date().toUTCString()}</td></tr>
        </table>
      </div>
      <a href="${dashUrl}"
        style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;
               font-size:13px;padding:10px 22px;border-radius:8px;letter-spacing:0.02em;">
        View in SentinelOps →
      </a>
    </div>
    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #2d3748;">
      <p style="margin:0;font-size:11px;color:#475569;">
        Sent by <strong style="color:#6366f1;">SentinelOps</strong> alert routing rule.
        You are receiving this because a rule matched severity=${severity}, service=${service}.
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const {
      incidentId,
      title,
      severity      = "HIGH",
      service       = "unknown-service",
      summary       = title,
      recipientEmail,
      // Allow user to pass their own Resend key from Settings (future)
      resendApiKey: bodyKey,
    } = body;

    if (!incidentId || !title) {
      return new Response(
        JSON.stringify({ error: "incidentId and title are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "recipientEmail is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const resendKey = (bodyKey as string | undefined) || Deno.env.get("RESEND_API_KEY") || "";
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "Resend API key not configured. Set RESEND_API_KEY in Supabase secrets." }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const appUrl   = Deno.env.get("VITE_APP_URL") ?? "https://sentinelops.app";
    const dashUrl  = `${appUrl}/dashboard?incident=${incidentId}`;
    const sevLabel = severity.toUpperCase();

    const emailPayload = {
      from:    "SentinelOps Alerts <alerts@sentinelops.app>",
      to:      [recipientEmail],
      subject: `[${sevLabel}] ${title} — ${incidentId}`,
      html:    buildHtml(incidentId, title, sevLabel, service, summary, dashUrl),
      text: [
        `[SentinelOps] ${sevLabel} INCIDENT: ${title}`,
        `Incident ID: ${incidentId}`,
        `Service: ${service}`,
        `Severity: ${sevLabel}`,
        `Summary: ${summary}`,
        ``,
        `View in SentinelOps: ${dashUrl}`,
      ].join("\n"),
      tags: [
        { name: "incident_id", value: incidentId.replace(/[^a-zA-Z0-9-_]/g, "-") },
        { name: "severity",    value: sevLabel },
      ],
    };

    const res = await fetch(RESEND_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
      body:    JSON.stringify(emailPayload),
      signal:  AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Resend error ${res.status}`, detail: data }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ id: data.id, status: "sent", recipient: recipientEmail }),
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
