// Edge Function: splunk-history
// Bidirectional Splunk integration — pulls recent search jobs from Splunk REST API
// so SentinelOps can import them into the local spl_query_history table.
//
// GET  → list recent jobs from Splunk:  ?splunkHost=...&splunkToken=...&count=20
// POST { splunkHost, splunkToken, count? }
//   → returns { jobs: [{ id, query, user, createdAt, status, resultCount }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SplunkJob {
  id: string;
  query: string;
  user: string;
  createdAt: string;
  status: string;
  resultCount: number;
  duration: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let splunkHost = "";
    let splunkToken = "";
    let count = 20;

    if (req.method === "GET") {
      const url = new URL(req.url);
      splunkHost  = url.searchParams.get("splunkHost")  ?? "";
      splunkToken = url.searchParams.get("splunkToken") ?? "";
      count       = parseInt(url.searchParams.get("count") ?? "20", 10);
    } else if (req.method === "POST") {
      const body = await req.json();
      splunkHost  = (body.splunkHost  ?? "").trim();
      splunkToken = (body.splunkToken ?? "").trim();
      count       = Math.min(parseInt(body.count ?? "20", 10), 100);
    } else {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    splunkHost = splunkHost.replace(/\/$/, "");

    if (!splunkHost || !splunkToken) {
      return new Response(
        JSON.stringify({ error: "splunkHost and splunkToken are required." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Fetch recent search jobs from Splunk REST API
    // /services/search/jobs returns a list of all search jobs visible to the token
    const url = `${splunkHost}/services/search/jobs?output_mode=json&count=${count}&sort_key=dispatch_time&sort_dir=desc`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${splunkToken}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return new Response(
        JSON.stringify({ error: `Cannot reach Splunk: ${msg}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({ error: `Splunk returned HTTP ${res.status}: ${body.slice(0, 200)}` }),
        { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const entries: unknown[] = Array.isArray(data?.entry) ? data.entry : [];

    const jobs: SplunkJob[] = entries.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const content = (e?.content ?? {}) as Record<string, unknown>;
      const rawSearch = String(content?.search ?? content?.request?.search ?? "");
      // Strip leading "search " prefix that Splunk sometimes prepends
      const query = rawSearch.startsWith("search ") ? rawSearch.slice(7) : rawSearch;

      return {
        id:           String(e?.name ?? e?.id ?? ""),
        query,
        user:         String(content?.eai_acl_owner ?? content?.["eai:acl.owner"] ?? "unknown"),
        createdAt:    String(content?.published ?? e?.published ?? ""),
        status:       String(content?.dispatchState ?? "UNKNOWN"),
        resultCount:  parseInt(String(content?.resultCount ?? "0"), 10),
        duration:     parseFloat(String(content?.runDuration ?? "0")),
      };
    }).filter(j => j.query.trim().length > 0); // skip system / empty jobs

    return new Response(
      JSON.stringify({ jobs, total: jobs.length }),
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
