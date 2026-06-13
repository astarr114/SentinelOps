// Edge Function: ocr-extract
// Extract text from log screenshots and error images via OCR.space
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let imageUrl: string | undefined;
  let base64Image: string | undefined;

  try {
    const body = await req.json();
    imageUrl = body.imageUrl;
    base64Image = body.base64Image;
    if (!imageUrl && !base64Image) throw new Error("Missing imageUrl or base64Image");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Platform-managed key — injected by Supabase secrets, never exposed to client
  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error: missing INTEGRATIONS_API_KEY" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const formData = new FormData();
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

  if (imageUrl) {
    formData.append("url", imageUrl);
  } else if (base64Image) {
    formData.append("base64Image", base64Image);
  }

  const upstream = await fetch(
    "https://app-bs8qtod6o9hd-api-W9z3M6eONl3L.gateway.appmedo.com/parse/image",
    {
      method: "POST",
      headers: { "X-Gateway-Authorization": apiKey },
      body: formData,
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `OCR service error: ${upstream.status}` }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const data = await upstream.json();
  const result = data?.ParsedResults?.[0];
  return new Response(JSON.stringify({
    text: result?.ParsedText ?? "",
    exitCode: data?.OCRExitCode ?? 3,
    errorMessage: result?.ErrorMessage ?? null,
  }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
