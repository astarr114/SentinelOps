// Edge Function: web-search
// Smart web search via Bing index for incident context lookup
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let q: string;
  let count: string | undefined;
  let freshness: string | undefined;

  try {
    const body = await req.json();
    q = body.q;
    if (!q) throw new Error("Missing q");
    count = body.count !== undefined ? String(body.count) : undefined;
    freshness = body.freshness;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams({ q });
  if (count) params.set("count", count);
  if (freshness) params.set("freshness", freshness);

  const upstream = await fetch(
    `https://app-bs8qtod6o9hd-api-VaOwP8E7dKEa.gateway.appmedo.com/search/FgEFxazBTfRUumJx/smart?${params.toString()}`,
    { method: "GET", headers: { "X-Gateway-Authorization": `Bearer ${apiKey}` } }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
