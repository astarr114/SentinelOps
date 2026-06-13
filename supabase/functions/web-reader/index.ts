// Edge Function: web-reader
// Fetches and parses web pages (runbooks, docs, postmortems) as Markdown
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let targetUrl: string;
  let returnFormat: string | undefined;

  try {
    const body = await req.json();
    targetUrl = body.url;
    if (!targetUrl) throw new Error("Missing url");
    returnFormat = body.returnFormat;
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

  const upstreamHeaders: Record<string, string> = {
    "X-Gateway-Authorization": `Bearer ${apiKey}`,
  };
  if (returnFormat) upstreamHeaders["X-Return-Format"] = returnFormat;

  const encodedUrl = encodeURIComponent(targetUrl);
  const upstream = await fetch(
    `https://api-ELbWqODdAgNY@36oqjsxjo775h3odjp3eev3y740deicu.lambda-url.us-west-2.on.aws/${encodedUrl}`,
    { method: "GET", headers: upstreamHeaders }
  );

  if (upstream.status === 401 || upstream.status === 403 || upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: errText || `Upstream error: ${upstream.status}` }), {
      status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const content = await upstream.text();
  return new Response(JSON.stringify({ content }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
