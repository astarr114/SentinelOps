// Edge Function: slack-alert
// Sends a SentinelOps incident alert to a Slack Incoming Webhook.
// POST { incidentId, title, severity, service, summary, webhookUrl? }
// Returns { ok: true }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEV_EMOJI: Record<string, string> = {
  CRITICAL: ":red_circle:",
  HIGH:     ":large_orange_circle:",
  MEDIUM:   ":large_yellow_circle:",
  LOW:      ":large_blue_circle:",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const {
      incidentId,
      title,
      severity   = "HIGH",
      service    = "unknown-service",
      summary    = title,
      webhookUrl: bodyWebhook,
    } = body;

    if (!incidentId || !title) {
      return new Response(
        JSON.stringify({ error: "incidentId and title are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const webhookUrl = (bodyWebhook as string | undefined) || Deno.env.get("SLACK_WEBHOOK_URL") || "";
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "Slack webhook URL not configured. Add it in Settings → Integrations." }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const appUrl  = Deno.env.get("VITE_APP_URL") ?? "https://sentinelops.app";
    const dashUrl = `${appUrl}/dashboard?incident=${incidentId}`;
    const emoji   = SEV_EMOJI[severity.toUpperCase()] ?? ":white_circle:";
    const sevLabel = severity.toUpperCase();

    const slackPayload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} ${sevLabel} Incident: ${incidentId}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${title}*` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Service*\n\`${service}\`` },
            { type: "mrkdwn", text: `*Severity*\n${sevLabel}` },
            { type: "mrkdwn", text: `*Incident ID*\n\`${incidentId}\`` },
            { type: "mrkdwn", text: `*Detected*\n${new Date().toUTCString()}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Summary*\n${summary}` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View in SentinelOps", emoji: true },
              url: dashUrl,
              style: "primary",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Sent by *SentinelOps* alert routing rule • severity=${sevLabel}, service=${service}`,
            },
          ],
        },
      ],
    };

    const slackRes = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(slackPayload),
      signal:  AbortSignal.timeout(10000),
    });

    if (!slackRes.ok) {
      const txt = await slackRes.text();
      return new Response(
        JSON.stringify({ error: `Slack webhook error ${slackRes.status}: ${txt}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, status: "sent" }),
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
