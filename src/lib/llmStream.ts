/**
 * Parse streaming LLM SSE payloads from Gemini, OpenAI-compatible, and Anthropic APIs.
 */

export function extractLlmStreamDelta(raw: string): string | null {
  if (!raw || raw === '[DONE]') return null;

  try {
    const frame = JSON.parse(raw) as Record<string, unknown>;

    // Google Gemini
    const candidates = frame.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const geminiText = candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof geminiText === 'string') return geminiText;

    // OpenAI-compatible (OpenAI, Grok, DeepSeek)
    const choices = frame.choices as Array<{ delta?: { content?: string }; message?: { content?: string } }> | undefined;
    const openAiText = choices?.[0]?.delta?.content ?? choices?.[0]?.message?.content;
    if (typeof openAiText === 'string') return openAiText;

    // Anthropic Messages API
    if (frame.type === 'content_block_delta') {
      const text = (frame.delta as { text?: string } | undefined)?.text;
      if (typeof text === 'string') return text;
    }

    return null;
  } catch {
    return null;
  }
}

/** Read an upstream LLM SSE body and invoke `onDelta` for each text chunk. Returns true if any text was received. */
export async function readLlmSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasContent = false;

  const processLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const text = extractLlmStreamDelta(line.slice(5).trim());
    if (text) {
      hasContent = true;
      onDelta(text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) processLine(line);
  }

  if (buffer.trim()) processLine(buffer.trim());

  return hasContent;
}

/** Parse error text from a failed edge-function response. */
export function parseLlmErrorResponse(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? raw;
  } catch {
    return raw || `HTTP ${status}`;
  }
}
