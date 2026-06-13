// Shared multi-provider LLM router for Supabase Edge Functions
// Supports: Gemini, OpenAI, Anthropic, Grok (xAI), DeepSeek
// Includes automatic fallback chain: if active provider errors, retries next configured provider

export type LlmProvider = 'gemini' | 'openai' | 'anthropic' | 'grok' | 'deepseek';

export interface LlmMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

/** A single provider slot in a fallback chain */
export interface LlmFallbackSlot {
  provider: LlmProvider;
  apiKey:   string;
  modelId?: string;
}

export interface LlmCallOptions {
  provider?:  LlmProvider;
  apiKey?:    string;
  modelId?:   string;
  messages:   LlmMessage[];
  stream?:    boolean;
  maxTokens?: number;
  temperature?: number;
  // Fallback gateway key used when no user key supplied (Gemini only)
  gatewayApiKey?: string;
  /**
   * Ordered list of fallback providers to try if the primary fails.
   * Each slot must have a valid apiKey (or be the gateway Gemini slot).
   */
  fallbackChain?: LlmFallbackSlot[];
}

// Default models per provider
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini:    'gemini-2.5-flash',
  openai:    'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  grok:      'grok-3',
  deepseek:  'deepseek-chat',
};

// ── Gemini (Google AI) ─────────────────────────────────────────────────────────
function buildGeminiRequest(messages: LlmMessage[], model: string, stream: boolean, maxTokens: number, temp: number, apiKey: string) {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const systemMsg = messages.find(m => m.role === 'system');
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
  };
  if (systemMsg) {
    body.systemInstruction = { role: 'user', parts: [{ text: systemMsg.content }] };
  }

  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  return { url: endpoint, body, headers: { 'Content-Type': 'application/json' } };
}

// ── Gateway fallback for Gemini (uses INTEGRATIONS_API_KEY) ───────────────────
function buildGatewayRequest(messages: LlmMessage[], model: string, stream: boolean, maxTokens: number, temp: number, gatewayKey: string) {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const endpoint = stream
    ? `https://app-bs8qtod6o9hd-api-VaOwP8E7dJqa.gateway.appmedo.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
    : `https://app-bs8qtod6o9hd-api-VaOwP8E7dJqa.gateway.appmedo.com/v1beta/models/${model}:generateContent`;

  return {
    url: endpoint,
    body: { contents, generationConfig: { temperature: temp, maxOutputTokens: maxTokens } },
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Authorization': `Bearer ${gatewayKey}` },
  };
}

// ── OpenAI-compatible (OpenAI, Grok, DeepSeek) ───────────────────────────────
function buildOpenAICompatibleRequest(
  messages: LlmMessage[], model: string, stream: boolean, maxTokens: number, temp: number,
  apiKey: string, baseUrl: string,
) {
  const oaiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  return {
    url: `${baseUrl}/chat/completions`,
    body: { model, messages: oaiMessages, stream, max_tokens: maxTokens, temperature: temp },
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
  };
}

// ── Anthropic Messages API ─────────────────────────────────────────────────────
function buildAnthropicRequest(messages: LlmMessage[], model: string, stream: boolean, maxTokens: number, temp: number, apiKey: string) {
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: temp,
    stream,
    messages: nonSystem.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  };
  if (systemMsg) body.system = systemMsg.content;
  return {
    url: 'https://api.anthropic.com/v1/messages',
    body,
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    '2023-06-01',
    },
  };
}

/** Build a fetch request for a single provider slot (non-gateway) */
function buildRequest(
  provider: LlmProvider, apiKey: string, modelId: string | undefined,
  messages: LlmMessage[], stream: boolean, maxTokens: number, temp: number,
): { url: string; body: unknown; headers: Record<string, string> } {
  const model = modelId || DEFAULT_MODELS[provider];
  switch (provider) {
    case 'gemini':
      return buildGeminiRequest(messages, model, stream, maxTokens, temp, apiKey);
    case 'openai':
      return buildOpenAICompatibleRequest(messages, model, stream, maxTokens, temp, apiKey, 'https://api.openai.com/v1');
    case 'anthropic':
      return buildAnthropicRequest(messages, model, stream, maxTokens, temp, apiKey);
    case 'grok':
      return buildOpenAICompatibleRequest(messages, model, stream, maxTokens, temp, apiKey, 'https://api.x.ai/v1');
    case 'deepseek':
      return buildOpenAICompatibleRequest(messages, model, stream, maxTokens, temp, apiKey, 'https://api.deepseek.com/v1');
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/** Attempt one provider slot, returns { ok, response } */
async function attemptSlot(
  slot: LlmFallbackSlot,
  messages: LlmMessage[], stream: boolean, maxTokens: number, temp: number,
): Promise<{ ok: boolean; response: Response; provider: LlmProvider }> {
  const req = buildRequest(slot.provider, slot.apiKey, slot.modelId, messages, stream, maxTokens, temp);
  let response: Response;
  try {
    response = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(60000),
    });
  } catch (err) {
    // Network-level error — treat as fail
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, response: new Response(errMsg, { status: 503 }), provider: slot.provider };
  }
  // Treat 4xx/5xx as failure so we can try next provider
  return { ok: response.ok || response.status === 200, response, provider: slot.provider };
}

// ── Main router: tries primary then fallback chain ─────────────────────────────
export async function callLlm(opts: LlmCallOptions): Promise<Response> {
  const {
    provider      = 'gemini',
    apiKey        = '',
    modelId,
    messages,
    stream        = false,
    maxTokens     = 2048,
    temperature   = 0.3,
    gatewayApiKey = '',
    fallbackChain = [],
  } = opts;

  // ── Build the ordered candidate list ─────────────────────────────────────────
  // Primary slot first
  const primarySlot: LlmFallbackSlot = { provider, apiKey, modelId };

  // If primary is Gemini with no user key, use gateway slot as the "primary"
  const candidates: Array<LlmFallbackSlot & { useGateway?: boolean }> = [];

  if (provider === 'gemini' && !apiKey && gatewayApiKey) {
    candidates.push({ provider: 'gemini', apiKey: '', modelId, useGateway: true });
  } else if (apiKey) {
    candidates.push(primarySlot);
  }

  // Append fallback chain entries that have an apiKey
  for (const slot of fallbackChain) {
    if (slot.apiKey && slot.provider !== provider) {
      candidates.push(slot);
    }
  }

  // Last-resort: gateway Gemini if not already added
  if (gatewayApiKey && !candidates.some(c => (c as { useGateway?: boolean }).useGateway)) {
    candidates.push({ provider: 'gemini', apiKey: '', modelId: undefined, useGateway: true });
  }

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No LLM provider configured. Add an API key in Settings → AI Model.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors: string[] = [];

  for (const candidate of candidates) {
    let result: { ok: boolean; response: Response; provider: LlmProvider };

    if ((candidate as { useGateway?: boolean }).useGateway && gatewayApiKey) {
      const model = candidate.modelId || DEFAULT_MODELS['gemini'];
      const req   = buildGatewayRequest(messages, model, stream, maxTokens, temperature, gatewayApiKey);
      try {
        const response = await fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body:    JSON.stringify(req.body),
          signal:  AbortSignal.timeout(60000),
        });
        result = { ok: response.ok, response, provider: 'gemini' };
      } catch (err) {
        errors.push(`gateway-gemini: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    } else if (candidate.apiKey) {
      result = await attemptSlot(
        { provider: candidate.provider, apiKey: candidate.apiKey, modelId: candidate.modelId },
        messages, stream, maxTokens, temperature,
      );
    } else {
      continue;
    }

    if (result.ok) {
      // Success — tag which provider was actually used in a custom header
      const headers: Record<string, string> = { 'X-Llm-Provider-Used': result.provider };
      // We can't clone a streaming response without consuming it, so only tag non-streaming
      if (!stream) {
        const body = await result.response.text();
        return new Response(body, {
          status:  result.response.status,
          headers: { ...Object.fromEntries(result.response.headers.entries()), ...headers },
        });
      }
      return result.response;
    }

    // Log the failure and try next
    const errText = await result.response.text().catch(() => `HTTP ${result.response.status}`);
    errors.push(`${result.provider}: ${errText.slice(0, 200)}`);
    console.warn(`[llmRouter] Provider ${result.provider} failed, trying next. Error: ${errText.slice(0, 100)}`);
  }

  // All candidates exhausted
  return new Response(
    JSON.stringify({ error: `All LLM providers failed. Errors: ${errors.join(' | ')}` }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  );
}

// ── Extract text from non-streaming response ──────────────────────────────────
export async function extractTextFromResponse(upstream: Response, provider: LlmProvider): Promise<string> {
  const data = await upstream.json();
  switch (provider) {
    case 'gemini':
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    case 'openai':
    case 'grok':
    case 'deepseek':
      return data?.choices?.[0]?.message?.content ?? '';
    case 'anthropic':
      return data?.content?.[0]?.text ?? '';
    default:
      return '';
  }
}

