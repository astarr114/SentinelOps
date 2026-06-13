# SentinelOps — Splunk Runtime Compliance Changelog

> **Hackathon:** Splunk Agentic Ops Hackathon  
> **Previous audit verdict:** PARTIAL  
> **Updated verdict target:** FULL  
> **Date:** 2026-05-21

---

## Summary

SentinelOps has been refactored to use live Splunk capabilities as the **primary runtime data layer** in every judge-facing flow. The app no longer silently falls back to demo data when live credentials are configured, and the UI now visibly proves which data path was used for every analysis.

---

## Changes Made

### A. Shared Splunk MCP 1.2 Client (`_shared/splunkClient.ts`)

A single, canonical MCP 1.2 client implementation now serves all three Splunk integration points:

- **`incident-analyze`** — primary incident analysis
- **`splunk-mcp`** — NL→SPL tool flow and direct tool calls
- **`splunk-test`** — Settings connectivity test and tools/list probe

**Key implementation details:**
- Transport: `POST {base}/services/mcp` (Streamable HTTP per MCP 1.2 spec)
- Protocol: JSON-RPC 2.0 (`{ jsonrpc, id, method: "tools/call", params: { name, arguments } }`)
- Tool cascade: tries `splunk_run_query` → falls back to `splunk_run_search`
- Arguments: `{ query | search, earliest_time, latest_time, max_results | max_count }`
- URL normalisation: strips `/services/mcp`, `/mcp`, `/messages` suffixes before appending `/services/mcp`
- ngrok support: auto-injects `ngrok-skip-browser-warning: true` for ngrok-hosted instances
- Auth: bearer token (`Authorization: Bearer <token>`) or HTTP Basic depending on `mcpAuthMethod`
- Error handling: distinct errors for 401 (bad token), 403 (no permission), 404 (tool not found), network failure

No other Splunk call in the codebase uses a different MCP pattern.

---

### B. Incident-Analyze Edge Function — Explicit Runtime Routing

The `incident-analyze` edge function now uses a strict priority routing system with **no silent fallback**:

| Priority | Path | Condition |
|----------|------|-----------|
| 1 | **live-mcp** | `mcpUrl` is configured (and `forceDemoMode` is not set) |
| 2 | **live-rest** | `splunkHost` + `splunkToken` are configured (and `forceDemoMode` is not set) |
| 3 | **demo** | No credentials configured, OR user explicitly chose demo after a live failure |

**Error modes added:**
- `error-mcp` — MCP URL configured but query failed (network, auth, tool not found)
- `error-rest` — REST host/token configured but query failed

When either error mode occurs, the function **does not substitute demo data**. It emits a `live_error` SSE event with the exact failure reason, and the frontend surfaces the error with Retry and explicit "Use demo data" options.

**`forceDemoMode` flag:**  
The frontend can send `forceDemoMode: true` to skip live paths intentionally (only after the user clicks "Use demo data" following a live failure). Demo mode is never triggered automatically when credentials are present.

**RuntimeTrace object (attached to every response):**
```json
{
  "mode": "live-mcp",
  "endpoint": "https://your-ngrok-url.ngrok-free.app/services/mcp",
  "toolUsed": "splunk_run_query",
  "queriesIssued": ["index=main service=... | stats count by message | head 20", "..."],
  "rowCounts": { "errors": 14, "deploys": 2, "meta": 0 },
  "timestamp": "2026-05-21T10:42:00.000Z",
  "errorMessage": null,
  "reasoningProvider": "gemini"
}
```

---

### C. Live vs Demo Evidence Separation

The `buildLiveEvidence()` and `buildDemoEvidence()` functions are now fully separate:

- **`buildLiveEvidence()`** — constructs the analysis object from real Splunk query results. Uses embedded service metadata only for fields not available from Splunk (blast radius estimates, SLA figures), and labels those fields as derived.
- **`buildDemoEvidence()`** — constructs from hardcoded sample arrays. Only called when `mode === "demo"`.

The primary `generateFullAnalysis()` / streaming path never starts from hardcoded incident arrays when live mode is active.

---

### D. Dashboard — Error State UI, No Silent Fallback

The `DashboardPage` now:

1. Sends all Splunk + MCP + reasoning credentials to the edge function:
   - `splunkHost`, `splunkToken` (REST)
   - `mcpUrl`, `mcpToken`, `mcpAuthMethod`, `mcpUsername`, `mcpPassword` (MCP)
   - `reasoningProvider`, `splunkHostedModelEndpoint`, `splunkHostedModelToken`

2. Handles all new `splunkMode` values with correct toast labels:
   - `live-mcp` → `"Analysis complete — AI brief ready (Live · Splunk MCP)"`
   - `live-rest` → `"Analysis complete — AI brief ready (Live · Splunk REST)"`
   - `error-mcp` / `error-rest` → clears analysis, shows error banner with the exact failure message
   - `demo` → `"Analysis complete — AI brief ready (Demo data)"`

3. Shows a persistent **live-error banner** when MCP/REST fails:
   - Exact error message from the edge function
   - **Retry** button (re-runs with same live config)
   - **Use demo data** button (sets `forceDemoMode: true`, re-runs)
   - **Dismiss** button
   - Demo data is never loaded automatically

4. Persists `runtimeTrace` in the analysis state and cache so the evidence panel can show it after a page reload.

---

### E. Analysis Source Badge & Runtime Evidence Panel

Every analysis result now carries two new UI components:

**`AnalysisSourceBadge`** — persistent badge in the analysis header:
- `LIVE · SPLUNK MCP` (green, animated pulse dot)
- `LIVE · SPLUNK REST` (blue, animated pulse dot)
- `DEMO DATA` (amber, warning icon)
- `ERROR · MCP` / `ERROR · REST` (red, error icon)

**`RuntimeEvidencePanel`** — collapsible judge-facing panel below the badge:
- Endpoint URL used
- MCP or REST mode
- Timestamp of the analysis
- Tool name invoked (`splunk_run_query` or `splunk_run_search`)
- Row counts returned (errors, deploys, meta)
- Reasoning provider (Gemini or Splunk Hosted Model)
- Full error message if mode is error

**`downloadDiagnosticReport()`** — exports a downloadable `sentinel-diagnostic-<timestamp>.json` containing the full `RuntimeTrace` plus incident metadata. Available from the Export dropdown in `IncidentDetail`.

---

### F. Settings — Reasoning Provider Selector

A new **Reasoning Provider** section in Settings:

- **Gemini 2.5 Flash** (default): Splunk provides live evidence; Gemini synthesises the analysis brief.
- **Splunk Hosted Model**: Routes incident summary generation through a user-supplied Splunk-hosted LLM endpoint (OpenAI-compatible chat completions format). Requires endpoint URL and bearer token.

The settings panel shows an honest attribution footer:
> "Data layer: Splunk (MCP or REST) provides live operational evidence. Reasoning layer: Gemini 2.5 Flash — Splunk provides data; Gemini synthesises the analysis brief."  
> (Updated to "Splunk Hosted Model" when the hosted endpoint is configured.)

**No false claims**: the UI never says "Splunk Hosted Models are integrated" unless the endpoint URL and token are actually configured and the reasoning provider is set to `splunk-hosted-model`.

---

### G. Settings — Verify Live Splunk Button

A new **Verify Live Splunk Connection** action in the MCP settings section:

- Calls `verifyLiveConnection()` on `SplunkContext`
- Runs a minimal live query (`index=_internal | head 1`) against the configured MCP or REST endpoint
- On success: records `lastLiveVerifiedAt` timestamp in the database and displays it
- On failure: shows the exact error
- The timestamp is shown persistently as "Last verified: May 21 10:42:33" for judges to inspect

---

### H. Accurate Copy Throughout

All UI copy, settings labels, and tooltips now accurately state:
- **Splunk provides live operational evidence** via MCP or REST
- **The reasoning layer uses Gemini** unless Splunk Hosted Model is explicitly configured
- No claim that "Splunk AI" or "Splunk ML" is doing the reasoning unless `reasoningProvider === 'splunk-hosted-model'` with a real endpoint

---

## Acceptance Criteria — Status

| Criterion | Status |
|-----------|--------|
| Judge configures Splunk MCP → clicks Analyze → uses live MCP | ✅ |
| No silent fallback to demo data when live MCP/REST fails | ✅ |
| Demo mode is clearly labeled and only used intentionally | ✅ |
| UI visibly proves whether analysis used live Splunk or demo | ✅ |
| One shared, correct MCP 1.2 client reused by test/NL→SPL/analysis | ✅ |
| App no longer falsely suggests Splunk-hosted-model is active unless configured | ✅ |
| If Splunk-hosted-model is configured, the runtime path is selectable and visible | ✅ |

---

## Files Changed

### Edge Functions
| File | Change |
|------|--------|
| `supabase/functions/_shared/splunkClient.ts` | **NEW** — canonical MCP 1.2 + REST client |
| `supabase/functions/incident-analyze/splunkClient.ts` | **NEW** — local copy for bundler compatibility |
| `supabase/functions/incident-analyze/index.ts` | Full rewrite of evidence gathering + serve() handler |
| `supabase/functions/splunk-mcp/index.ts` | Updated to use shared client |

### Frontend
| File | Change |
|------|--------|
| `src/contexts/SplunkContext.tsx` | Added `ReasoningProvider` type; new config fields; `verifyLiveConnection()` |
| `src/components/incident/AnalysisSourceBadge.tsx` | **NEW** — mode badge component |
| `src/components/incident/RuntimeEvidencePanel.tsx` | **NEW** — collapsible evidence panel + diagnostic download |
| `src/components/incident/IncidentDetail.tsx` | Integrated badge, panel, `runtimeTrace` prop, diagnostic export |
| `src/pages/DashboardPage.tsx` | Sends all credentials; handles error modes; live-error banner |
| `src/pages/SettingsPage.tsx` | Reasoning provider selector; verify live button; accurate copy |

### Database
| Migration | Change |
|-----------|--------|
| `add_reasoning_provider_fields` | Adds `reasoning_provider`, `splunk_hosted_model_endpoint`, `splunk_hosted_model_token`, `last_live_verified_at` to `splunk_configs` |
