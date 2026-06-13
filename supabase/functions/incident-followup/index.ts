// Edge Function: incident-followup
// Multi-provider streaming LLM for incident follow-up questions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLlm, type LlmProvider, type LlmFallbackSlot } from "../_shared/llmRouter.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let question: string, incidentContext: Record<string, unknown>;
  let llmProvider: LlmProvider, llmApiKey: string, llmModel: string, llmFallbackChain: LlmFallbackSlot[];
  try {
    const body         = await req.json();
    question           = body.question;
    incidentContext    = body.incidentContext ?? {};
    llmProvider        = body.llmProvider ?? "gemini";
    llmApiKey          = body.llmApiKey   ?? "";
    llmModel           = body.llmModel    ?? "";
    llmFallbackChain   = Array.isArray(body.llmFallbackChain) ? body.llmFallbackChain : [];
    if (!question) throw new Error("Missing question");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const gatewayKey = Deno.env.get("INTEGRATIONS_API_KEY") ?? "";

  const systemContent = `You are SentinelOps, an AI incident commander analyzing a production incident.

Current incident context:
- Incident ID: ${incidentContext.incidentId ?? "INC-1001"}
- Service: ${incidentContext.service ?? "checkout-service"}
- Severity: ${incidentContext.severity ?? "CRITICAL"}
- Summary: ${incidentContext.summary ?? "Service experiencing latency spike after deployment"}
- Top hypothesis: ${incidentContext.topHypothesis ?? "Deployment regression"}
- Blast radius: ${Array.isArray(incidentContext.blastServices) ? (incidentContext.blastServices as string[]).join(", ") : "checkout-service"}

Be specific, actionable, and concise. Use markdown. Include metrics, timestamps, and SPL queries where relevant.`;

  const upstream = await callLlm({
    provider: llmProvider, apiKey: llmApiKey, modelId: llmModel,
    gatewayApiKey: gatewayKey,
    stream: true,
    fallbackChain: llmFallbackChain,
    maxTokens: 1024, temperature: 0.4,
    messages: [
      { role: 'system',    content: systemContent },
      { role: 'assistant', content: "Understood. I'm SentinelOps, ready to assist with incident investigation. What do you need to know?" },
      { role: 'user',      content: question },
    ],
  });

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});
