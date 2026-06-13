#!/usr/bin/env node
/**
 * LLM Fallback Chain Smoke Test
 * ─────────────────────────────
 * Verifies that the fallback chain logic correctly:
 *   1. Retries the next configured provider when the primary returns HTTP 500
 *   2. Retries on network-level errors (fetch throws)
 *   3. Returns success immediately on the first successful provider
 *   4. Returns a 502 error when ALL providers fail
 *   5. Returns a 400 when no providers are configured at all
 *   6. Tags the response with X-Llm-Provider-Used header on success
 *
 * Run: node tasks/smoke-test-llm-fallback.mjs
 */

// ── Minimal re-implementation of the fallback dispatch logic ─────────────────
// (mirrors supabase/functions/_shared/llmRouter.ts callLlm() fallback logic)

const DEFAULT_MODELS = {
  gemini:    'gemini-2.5-flash',
  openai:    'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  grok:      'grok-3',
  deepseek:  'deepseek-chat',
};

/**
 * Simplified callLlm that accepts an injected `fetchImpl` for testing.
 * Mirrors the production fallback chain logic from llmRouter.ts.
 */
async function callLlmWithFetch(opts, fetchImpl) {
  const {
    provider      = 'gemini',
    apiKey        = '',
    modelId,
    messages,
    stream        = false,
    maxTokens     = 512,
    temperature   = 0.1,
    gatewayApiKey = '',
    fallbackChain = [],
  } = opts;

  // Build ordered candidate list
  const candidates = [];

  // Gateway Gemini slot helper
  const isGatewaySlot = (c) => c._useGateway === true;

  if (provider === 'gemini' && !apiKey && gatewayApiKey) {
    candidates.push({ provider: 'gemini', apiKey: '', modelId, _useGateway: true });
  } else if (apiKey) {
    candidates.push({ provider, apiKey, modelId });
  }

  for (const slot of fallbackChain) {
    if (slot.apiKey && slot.provider !== provider) {
      candidates.push(slot);
    }
  }

  if (gatewayApiKey && !candidates.some(isGatewaySlot)) {
    candidates.push({ provider: 'gemini', apiKey: '', _useGateway: true });
  }

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No LLM provider configured.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors = [];

  for (const candidate of candidates) {
    let response;
    try {
      // In production this is a real fetch; here we use the injected mock
      response = await fetchImpl(candidate.provider ?? 'gemini', candidate.apiKey);
    } catch (err) {
      errors.push(`${candidate.provider}: network error — ${err.message}`);
      continue;
    }

    if (response.ok) {
      const body = await response.text();
      const usedProvider = candidate.provider ?? 'gemini';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Llm-Provider-Used': usedProvider,
        },
      });
    }

    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    errors.push(`${candidate.provider}: ${errText.slice(0, 120)}`);
  }

  return new Response(
    JSON.stringify({ error: `All LLM providers failed. Errors: ${errors.join(' | ')}` }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  );
}

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    results.push({ name, ok: true });
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`       ${err.message}`);
    results.push({ name, ok: false, error: err.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Mock fetch factory ───────────────────────────────────────────────────────

/**
 * Creates a mock fetch that returns:
 *   - failOn:  set of provider names that return HTTP 500
 *   - throwOn: set of provider names that throw a network error
 *   - success: all others return HTTP 200 with mock JSON
 */
function makeFetch({ failOn = new Set(), throwOn = new Set() } = {}) {
  const calls = [];
  const impl = async (provider, apiKey) => {
    calls.push({ provider, apiKey });
    if (throwOn.has(provider)) {
      throw new Error(`ECONNREFUSED: ${provider} endpoint unreachable`);
    }
    if (failOn.has(provider)) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: `Hello from ${provider}` } }] }),
      { status: 200 },
    );
  };
  impl.calls = calls;
  return impl;
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🔬  LLM Fallback Chain Smoke Tests\n');

// 1. Primary succeeds — no fallback needed
await test('Primary provider succeeds on first attempt', async () => {
  const fetch = makeFetch();
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [{ provider: 'anthropic', apiKey: 'ant-test' }],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  assertEqual(fetch.calls.length, 1, 'fetch call count');
  assertEqual(fetch.calls[0].provider, 'openai', 'called provider');
  assertEqual(res.headers.get('X-Llm-Provider-Used'), 'openai', 'provider header');
});

// 2. Primary returns 500 → retries first fallback provider
await test('Primary returns HTTP 500 → retries next provider in chain', async () => {
  const fetch = makeFetch({ failOn: new Set(['openai']) });
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [{ provider: 'anthropic', apiKey: 'ant-test' }],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  assertEqual(fetch.calls.length, 2, 'fetch call count — should have tried both');
  assertEqual(fetch.calls[0].provider, 'openai',    'first call = primary');
  assertEqual(fetch.calls[1].provider, 'anthropic', 'second call = fallback');
  assertEqual(res.headers.get('X-Llm-Provider-Used'), 'anthropic', 'provider header = fallback');
});

// 3. Primary throws network error → retries fallback
await test('Primary throws network error → retries next provider in chain', async () => {
  const fetch = makeFetch({ throwOn: new Set(['openai']) });
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [{ provider: 'deepseek', apiKey: 'ds-test' }],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  // Both providers are attempted: primary throws (still recorded), fallback succeeds
  assertEqual(fetch.calls.length, 2, 'primary attempted (threw) + fallback fetched');
  assertEqual(fetch.calls[0].provider, 'openai',   'first attempt = primary (threw)');
  assertEqual(fetch.calls[1].provider, 'deepseek', 'fallback provider called after throw');
  assertEqual(res.headers.get('X-Llm-Provider-Used'), 'deepseek', 'provider header = fallback');
});

// 4. Multi-level fallback — first two fail, third succeeds
await test('Multi-level fallback: first 2 providers fail, third succeeds', async () => {
  const fetch = makeFetch({ failOn: new Set(['openai', 'anthropic']) });
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [
      { provider: 'anthropic', apiKey: 'ant-test' },
      { provider: 'deepseek',  apiKey: 'ds-test'  },
    ],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  assertEqual(fetch.calls.length, 3, 'fetch call count');
  assertEqual(fetch.calls[2].provider, 'deepseek', 'third call = deepseek');
  assertEqual(res.headers.get('X-Llm-Provider-Used'), 'deepseek', 'provider header');
});

// 5. All providers fail → 502 returned
await test('All providers fail → 502 returned with error summary', async () => {
  const fetch = makeFetch({ failOn: new Set(['openai', 'anthropic', 'deepseek']) });
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [
      { provider: 'anthropic', apiKey: 'ant-test' },
      { provider: 'deepseek',  apiKey: 'ds-test'  },
    ],
  }, fetch);
  assertEqual(res.status, 502, 'status should be 502');
  assertEqual(fetch.calls.length, 3, 'all 3 providers attempted');
  const body = await res.json();
  assert(body.error.includes('All LLM providers failed'), 'error message present');
  assert(body.error.includes('openai'), 'openai failure mentioned');
  assert(body.error.includes('anthropic'), 'anthropic failure mentioned');
});

// 6. No providers configured → 400 returned
await test('No providers configured → 400 returned immediately', async () => {
  const fetch = makeFetch();
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: '', messages: [{ role: 'user', content: 'hi' }],
    // No apiKey and no gatewayApiKey → candidates list is empty
    fallbackChain: [],
    gatewayApiKey: '',
  }, fetch);
  assertEqual(res.status, 400, 'status should be 400');
  assertEqual(fetch.calls.length, 0, 'no fetch calls made');
  const body = await res.json();
  assert(body.error.includes('No LLM provider configured'), 'error message present');
});

// 7. Fallback skips same-provider duplicates
await test('Fallback chain skips duplicate of active provider', async () => {
  const fetch = makeFetch({ failOn: new Set(['openai']) });
  const res = await callLlmWithFetch({
    provider: 'openai', apiKey: 'sk-test', messages: [{ role: 'user', content: 'hi' }],
    fallbackChain: [
      { provider: 'openai',    apiKey: 'sk-test2' }, // same provider — should be skipped
      { provider: 'anthropic', apiKey: 'ant-test' },
    ],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  // Calls: openai (primary fail) + anthropic (fallback success)
  // openai duplicate in chain should not be called again
  const providersCalled = fetch.calls.map(c => c.provider);
  assert(!providersCalled.slice(1).includes('openai'), 'openai not retried from fallback chain');
  assertEqual(fetch.calls[1].provider, 'anthropic', 'jumped to anthropic');
});

// 8. Gateway Gemini used when no user key, then falls back on gateway failure
await test('Gateway slot used when no user API key provided', async () => {
  const fetch = makeFetch(); // gateway slot succeeds
  const res = await callLlmWithFetch({
    provider: 'gemini', apiKey: '', messages: [{ role: 'user', content: 'hi' }],
    gatewayApiKey: 'gw-key-123',
    fallbackChain: [],
  }, fetch);
  assertEqual(res.status, 200, 'status');
  assertEqual(fetch.calls.length, 1, 'one fetch call');
  assert(fetch.calls[0].provider === 'gemini', 'gemini gateway called');
});

// ── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.ok).forEach(r => console.log(`  • ${r.name}: ${r.error}`));
  console.log('');
  process.exit(1);
} else {
  console.log('\n🎉  All fallback chain tests passed!\n');
  process.exit(0);
}
