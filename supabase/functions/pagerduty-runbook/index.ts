// Edge Function: pagerduty-runbook
// Fetches PagerDuty Response Plays for a given service name.
// GET ?restApiKey=<key>&serviceName=<name>
// Returns { plays: PdResponsePlay[] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PD_BASE = "https://api.pagerduty.com";

interface PdResponsePlay {
  id: string;
  name: string;
  description: string | null;
  team: { id: string; summary: string } | null;
  responders: Array<{ id: string; summary: string; type: string }>;
  subscribers: Array<{ id: string; summary: string; type: string }>;
  responders_message: string | null;
  runnability: string;
  html_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const url = new URL(req.url);
    const restApiKey = url.searchParams.get("restApiKey") || Deno.env.get("PAGERDUTY_REST_API_KEY") || "";
    const serviceName = url.searchParams.get("serviceName") || "";

    if (!restApiKey) {
      return new Response(
        JSON.stringify({ plays: [], error: "PagerDuty REST API key not configured." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const pdHeaders = {
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": `Token token=${restApiKey}`,
      "Content-Type": "application/json",
    };

    // 1. Fetch all response plays (PD API doesn't filter by service directly)
    const playsRes = await fetch(`${PD_BASE}/response_plays?limit=100`, {
      headers: pdHeaders,
      signal: AbortSignal.timeout(10000),
    });

    if (!playsRes.ok) {
      const txt = await playsRes.text();
      return new Response(
        JSON.stringify({ plays: [], error: `PagerDuty API ${playsRes.status}: ${txt.slice(0, 200)}` }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const playsData = await playsRes.json();
    const allPlays: PdResponsePlay[] = playsData.response_plays ?? [];

    // 2. If serviceName provided, try to find matching PD service and filter plays
    let plays = allPlays;
    if (serviceName) {
      // Search for the service by name
      const svcRes = await fetch(
        `${PD_BASE}/services?query=${encodeURIComponent(serviceName)}&limit=5`,
        { headers: pdHeaders, signal: AbortSignal.timeout(8000) },
      );
      if (svcRes.ok) {
        const svcData = await svcRes.json();
        const services = svcData.services ?? [];
        // If no match just return all plays (sorted)
        // PD Response Plays are not directly linked to services in the API,
        // so we return all plays but rank by name similarity
        if (services.length > 0) {
          const svcName = services[0]?.name?.toLowerCase() ?? "";
          plays = allPlays.sort((a, b) => {
            const aMatch = a.name.toLowerCase().includes(svcName) || a.description?.toLowerCase().includes(svcName) ? -1 : 0;
            const bMatch = b.name.toLowerCase().includes(svcName) || b.description?.toLowerCase().includes(svcName) ? -1 : 0;
            return aMatch - bMatch;
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ plays: plays.slice(0, 10) }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ plays: [], error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
