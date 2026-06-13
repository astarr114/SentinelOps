# SentinelOps Changelog

All notable changes to SentinelOps are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — newest version first.

---

## [v51.0.0] — 2026-05-21

### Added
- **Named Token Budget Presets** — Three named presets replace the generic numeric buttons in Settings → AI Analysis Configuration:
  - **Quick (2k)** — Fast triage; delivers an executive summary only. Best for initial on-call assessment under time pressure.
  - **Standard (8k)** — Balanced depth; full hypotheses, blast radius, timeline, and recommended actions. Recommended default.
  - **Deep Dive (16k)** — Exhaustive investigation; maximum detail across every section. Use for post-mortems and complex multi-service incidents.
  - Each preset card shows its token budget badge, a bold label, and a one-line recommended use-case description.
  - Fine-tune buttons (4k / 6k / 12k) remain available below the preset cards for custom values.
  - The active preset shows a `✓ Active` indicator and a highlighted ring.
- **Auto-save Streaming Analysis Draft** — Partial analysis results are saved to `localStorage` every 30 seconds while streaming is in progress, keyed by incident ID (`sentinelops_draft_<incidentId>`).
  - If the browser is refreshed or the tab is closed mid-stream, selecting the same incident again shows a yellow **Draft Recovery Banner** at the top of the detail panel.
  - Banner shows the draft age (e.g. "Interrupted analysis from 3m ago recovered, 4,821 tokens") with **Restore** and **Dismiss** actions.
  - Restoring loads the partial analysis and sets a `streamStopReason` banner explaining it is a recovered draft.
  - Draft is automatically cleared when a full successful analysis completes.
  - Auto-save interval is cleaned up in the `finally` block of `handleAnalyze` and on budget-limit cancellation.
- **Email Comparison Report in Analysis Diff** — New **Send Report** button in the diff toolbar sends the full comparison to any email address via `mailto:`.
  - If a recipient email is already configured in Settings → Alert Email Address, the mailto link is opened immediately.
  - If no email is configured, an inline input row appears below the toolbar so the user can enter an address on the spot. Press Enter or click **Open in Mail Client**.
  - Email body includes: incident title, both analysis timestamps and data-source modes, changed-section count, and full before/after text for every changed section.
  - Subject line: `[SentinelOps] Analysis Comparison: <Incident Title>`.

### Changed
- `IncidentDetail` now calls `useSplunk()` directly (in addition to `PagerDutyButton`) to pass `config.alertEmail` to `AnalysisDiff`.
- `AnalysisDiff` accepts two new optional props: `incidentTitle` and `alertEmail`.
- `handleSelectIncident` in `DashboardPage` now checks for a saved draft on selection and sets `draftRestoreId` state.
- `handleAnalyze` clears any existing draft before starting a new analysis and stops the auto-save interval in all exit paths (success, budget hit, error, finally).

---

## [v50.0.0] — 2026-05-21

### Added
- **Configurable Max Token Budget** — New slider + numeric input in Settings → AI Analysis Configuration. Range: 1,000–16,000 tokens (step 500). Default: 8,000. Value is persisted to `localStorage` via `LlmContext`.
- **Token Budget Enforcement** — During streaming, each incoming token chunk increments a running counter. When `streamTokens >= maxTokenBudget`, the stream is cancelled via `AbortController`, the partial result is saved, and a yellow warning banner appears in `IncidentDetail` explaining the stop reason and linking to Settings.
- **Partial Result Preservation on Budget Hit** — The partial analysis accumulated up to the budget limit is saved to the DB cache and displayed in the UI. The AI brief fragment is retained as `aiBrief.executiveSummary`.
- **Token-Budget Toast** — A `sonner` warning toast fires when the budget is reached, with an "Increase budget →" action that navigates to Settings.
- **Export Analysis Button** — New **Export** dropdown in the incident header (visible when an analysis result exists):
  - **Export as Markdown** — Builds a full `.md` document from all analysis sections + incident metadata and triggers a Blob download. Filename: `incident_<ID>_analysis_<timestamp>.md`.
  - **Export as PDF** — Sets `document.title` to the filename pattern and calls `window.print()` so the browser's print-to-PDF dialog uses it as the default filename. Accompanied by comprehensive `@media print` CSS that hides sidebars, navigation, and non-analysis UI.
- **Side-by-Side Analysis Diff** — New comparison view in the Past Analyses history panel:
  - Each row now has a checkbox. When exactly 2 analyses are checked, a **Compare** button appears in the panel header.
  - Opens a 70vh split-pane `AnalysisDiff` component with older analysis on the left (red tint) and newer on the right (green tint).
  - Word-level Myers diff via the `diff` package highlights added text in green and removed text in red with strikethrough.
  - All 11 sections diffed: Executive Summary, Technical Findings, Immediate Risk, Root Cause Hypotheses, Recommended Actions, Open Questions, Event Timeline, Blast Radius Services, Blast Radius Endpoints, Error Patterns, Deployment Events.
  - Synchronized scrolling: scrolling either column mirrors the other proportionally.
  - Changed-section count shown in a yellow badge in the toolbar; "identical" badge when no differences exist.
  - **Back** button returns to the incident detail.
- **`streamStopReason` Banner** — Yellow banner with `OctagonAlert` icon shown in `IncidentDetail` when streaming stopped early (token budget or draft restore). Links to Settings for budget increase.
- **Print CSS** — Comprehensive `@media print` block in `index.css` hides sidebar, nav, and header; expands content area; preserves severity/status badge colours for PDF output.

### Changed
- `IncidentDetail` now accepts `streamStopReason?: string` prop.
- Export Markdown helper (`buildMarkdown`) and `exportPdf` function added as module-level helpers in `IncidentDetail.tsx`.
- History panel **Clear** and **Back to current** controls moved to the panel header action row.
- Clicking the **History** button now also resets `compareIds` and `showDiff` state.

---

## [v49.0.0] — 2026-05-21

### Added
- **Real Incident Context in AI Prompt** — `buildAnalysisPrompt()` now embeds actual incident `title`, `summary`, `severity`, and `affected_endpoints` into the LLM prompt. Analysis is fully incident-specific; no more generic demo copy.
- **Live Token Counter** — `streamTokens` state increments on every SSE token event (chars ÷ 4 heuristic). Displayed as `~N tokens · ~$0.0000` in the incident detail token meter, updated in real time during streaming.
- **Configurable Cache TTL** — `cacheTtlMinutes` added to `LlmContext` with `localStorage` persistence. Settings slider (1–240 min) with preset buttons (15m / 30m / 1h / 4h / 24h). Cache is skipped when the stored result is older than the configured TTL.
- **Past Analyses Panel** — Collapsible history panel in the incident detail. Queries `incident_analyses` for all prior analyses for the selected incident, sorted newest-first. Clicking a row loads that historical result into the detail view. Source-mode badge (live / mcp / demo) shown per row.

### Fixed
- **Demo-Data Bug** — Edge function `buildAnalysis()` was using hardcoded demo incident data instead of the incident context sent from the frontend. Now uses `incidentTitle`, `incidentSummary`, `incidentSeverity`, `incidentEndpoints` from the request body.
- **Robust JSON Parsing** — `extractJson()` strips markdown fences (` ```json ``` `) and trailing commas before `JSON.parse`, eliminating parse failures on LLM responses with decorative formatting.

---

## [v43.0.0] — 2026-05-21

### Added
- **Full Splunk MCP Server Connectivity** — Remote MCP endpoint support using JSON-RPC 2.0 over HTTPS (Splunk MCP 1.2 Streamable HTTP transport), configurable via the Settings page.
- **MCP Settings Section — Server Info Display** — After a successful Test MCP Connection, the Settings page shows a server info badge with the server name, version, and number of discovered tools. Persisted in the database.
- **MCP Settings Section — Ngrok Skip Warning Toggle** — Manual toggle to force the `ngrok-skip-browser-warning: true` header on all MCP requests. Auto-detected when URL contains "ngrok"; can be overridden per user preference.
- **MCP Settings Section — URL Auto-Normalisation** — If the user enters a base ngrok URL without the `/services/mcp` suffix, it is appended automatically. Handles `/mcp`, `/messages`, and trailing slashes.
- **`mcp-full` Test Mode** — New `splunk-test` edge function mode that runs `initialize` (to fetch `serverName` + `serverVersion`) followed by `tools/list` (to fetch the full tool catalog) in a single connection test.
- **`mcp-tool-call` Mode** — New `splunk-test` edge function mode for calling any named Splunk MCP tool with custom arguments.
- **`tool-call` Mode in `splunk-mcp`** — New mode for direct MCP tool invocation. Accepts `{ mode: 'tool-call', toolName, toolArgs, mcpUrl, mcpToken }`.
- **`splunk_run_query` Tool Name** — Updated primary search tool name from `splunk_run_search` to `splunk_run_query`. Both names tried, `splunk_run_query` first.
- **MCP Tool Explorer Panel** — Interactive cards for all 10 Splunk MCP tools with category filter pills.
- **NL→SPL via MCP Quick-Run Panel** — Generate SPL → review/edit → execute via `splunk_run_query`.
- **MCP Status Indicator in Dashboard Header** — Green pulsing dot when MCP is configured; grey when not. Hover shows server name, version, and tool count.

### Fixed
- **`splunk_run_search` → `splunk_run_query`** — Real Splunk MCP Server 1.2 exposes `splunk_run_query`; the previous name would always return "Tool not found".

---

## [v42.0.0] — 2026-05-21

### Added
- **Splunk MCP 1.2 Compliance** — Endpoint `/services/mcp`, tool name `splunk_run_query`, Splunk 1.2 argument schema.
- **Ngrok Support** — Auto-inject `ngrok-skip-browser-warning: true` header.
- **`scale` and `notify` Action Types** — Command Center AI can suggest scaling and team-notification actions.
- **Voice Language Selector** — 10-language voice input (EN-US/UK/IN, ES, FR, DE, JA, ZH, PT-BR, KO).
- **Action Execution History Panel** — Session-scoped history of all executed AI-suggested actions.

---

## [v41.0.0] — 2026-05-21

### Fixed
- **ActionCard crash on unknown action type** — `META_MAP` lookup with safe fallback.
- **TypeScript `SpeechRecognition` compile error** — Local `ISpeechRecognition` / `ISpeechRecognitionCtor` interface shim.

---

## [v35.0.0] — 2026-05-21

### Added
- **Mark as Resolved** — Green button on every OPEN/INVESTIGATING incident card.
- **30-Day Rolling MTTR Trend Line Chart** — Full-width daily average resolution time chart on the Analytics page.
- **Print-Preview Modal for Analytics PDF Export** — Checkbox-gated section selector before `window.print()`.

---

## [v13.0.0] — 2026-05-21

### Added
- **Enterprise Analytics Page** — `/analytics` route with 10+ charts and KPI cards.
- **Scheduled Auto-run for Query History** — Configurable interval selector.
- **SentinelOps Logo** — Official brand logo on Login, Dashboard, Settings, empty state.
- **Splunk Alert Import Severity Breakdown Dialog** — Colour-coded grid after import.
- **Webhook Delivery Log CSV Export** — `Export CSV` button.

---

## [v12.0.0] — 2026-05-21

### Fixed
- **Critical crash: `useLlm must be used within LlmProvider`** — Component renamed to `LlmContextProvider` to resolve name collision.

---

## [v11.0.0] — 2026-05-21

### Added
- **LLM Fallback Chain** — Automatic retry across configured providers on failure.
- **SPL Autocomplete** — 60+ SPL commands, 20+ field names, 25+ aggregation functions.
- **Alert Rule Live Preview** — Real-time rule matching against 8 sample incidents.
- **Keyboard navigation shortcuts** — j/k, Enter/Space, t, f, Esc.

---

## [v5.0.0] — 2026-05-21

### Added
- **Notification Center** — Bell icon with unread-count badge, alert history panel, per-user RLS.
- **Synthetic Incident Filter Toggle** — Hides TEST incidents by default.
- **Advanced Incident Filters** — Keyword search, severity/status multi-select.
- **Incident Deduplication Indicator** — Warning badge when same service has multiple open incidents.

---

## [v4.0.0] — 2026-05-20

### Added
- **Scheduled Synthetic Alert Job** — Hourly `pg_cron` job exercises alert pipeline.
- **SPL Query History Panel** — Persist-and-replay per-user query history.
- **Suggested Queries Chips** — AI-generated SPL query suggestions after incident analysis.

---

## [v3.0.0] — 2026-05-19

### Added
- **NL→SPL Tool** — Natural language to SPL using Gemini 2.5 Flash.
- **Splunk MCP Server Integration** — `splunk-mcp` edge function with JSON-RPC 2.0.
- **MCP Server Settings** — URL + token configuration with connectivity validation.

---

## [v2.0.0] — 2026-05-18

### Added
- **Real-Time Critical Incident Alerting** — Supabase Realtime subscription on `live_incidents`.
- **Simulate Alert Button** — Test end-to-end alert pipeline.
- **`useLiveAlerts` Hook** — Realtime deduplication and toast management.

---

## [v1.0.0] — 2026-05-17

### Added
- **Initial Release** — AI Incident Commander for Splunk. Authentication, incident dashboard, AI analysis, Splunk integration, export tools, dark cybersecurity theme.


All notable changes to SentinelOps are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — newest version first.

---

## [v43.0.0] — 2026-05-21

### Added
- **Full Splunk MCP Server Connectivity** — Remote MCP endpoint support using JSON-RPC 2.0 over HTTPS (Splunk MCP 1.2 Streamable HTTP transport), configurable via the Settings page.
- **MCP Settings Section — Server Info Display** — After a successful Test MCP Connection, the Settings page shows a server info badge with the server name, version, and number of discovered tools. Persisted in the database.
- **MCP Settings Section — Ngrok Skip Warning Toggle** — Manual toggle to force the `ngrok-skip-browser-warning: true` header on all MCP requests. Auto-detected when URL contains "ngrok"; can be overridden per user preference.
- **MCP Settings Section — URL Auto-Normalisation** — If the user enters a base ngrok URL without the `/services/mcp` suffix, it is appended automatically. Handles `/mcp`, `/messages`, and trailing slashes.
- **`mcp-full` Test Mode** — New `splunk-test` edge function mode that runs `initialize` (to fetch `serverName` + `serverVersion`) followed by `tools/list` (to fetch the full tool catalog) in a single connection test. Returns `{ ok, serverName, serverVersion, toolList }`.
- **`mcp-tool-call` Mode** — New `splunk-test` edge function mode for calling any named Splunk MCP tool with custom arguments. Returns `{ ok, toolName, result, raw }`.
- **`tool-call` Mode in `splunk-mcp`** — New mode in the `splunk-mcp` edge function for direct MCP tool invocation. Accepts `{ mode: 'tool-call', toolName, toolArgs, mcpUrl, mcpToken }`. Returns `{ ok, toolName, toolResult, raw, endpoint }`.
- **`splunk_run_query` Tool Name** — Updated primary search tool name from `splunk_run_search` to `splunk_run_query` (matches the actual tool name returned by `tools/list` on a real Splunk MCP Server 1.2 instance). `splunk_run_search` remains as fallback for alternate deployments.
- **MCP Tool Explorer Panel** — New collapsible "MCP Tool Explorer" panel in the Settings MCP section. Displays all 10 Splunk MCP tools as interactive cards, each showing: tool name, description, category badge, editable JSON args field, and a Run button. Results shown inline below each card. Category filter pills: All, Search, Server, Indexes, Users, Metadata, KV Store, Knowledge, Saved Searches.
- **NL→SPL via MCP Quick-Run Panel** — New collapsible panel in Settings. Workflow: (1) enter natural language query → (2) click Generate SPL → (3) review/edit generated SPL → (4) click Run via MCP → view results inline. Routes execution through the `splunk_run_query` MCP tool.
- **MCP Status Indicator in Dashboard Header** — New `[MCP ●]` badge in the top navigation bar. Green pulsing dot when MCP is configured; grey dot when not. Hover tooltip shows: server name, version, tool count. Clicking navigates to Settings for configuration.
- **Improved MCP Error Messages** — All 401/403/404/405 errors, timeout/network errors, and invalid token errors now return specific, actionable messages with troubleshooting hints (ngrok tunnel status, Splunkbase app installation, HTTPS requirement).
- **`McpTool` Interface** — New exported type `McpTool { name, description, inputSchema? }` in `SplunkContext` for typed tool list handling across the app.
- **New DB Fields** — `mcp_skip_ngrok` (boolean), `mcp_server_name` (text), `mcp_server_version` (text), `mcp_tool_list` (jsonb) added to the `splunk_configs` table. All persisted on Save.

### Changed
- **`testMcpConnection`** — Now calls `mcp-full` (instead of `mcp`) to perform initialize + tools/list in a single click. Discovered server name, version, and tool list are stored directly in the app config state and persisted to the database.
- **`saveConfig`** — Now includes `mcp_skip_ngrok`, `mcp_server_name`, `mcp_server_version`, `mcp_tool_list` in the upsert payload.
- **Test MCP button label** — Changed from "Test MCP" to "Test MCP Connection" for clarity.
- **Error hint block** — MCP fail banner now shows a structured bullet-list of troubleshooting steps instead of a single-line error message.

### Fixed
- **`splunk_run_search` → `splunk_run_query`** — Real Splunk MCP Server 1.2 exposes `splunk_run_query` as the search tool; the previous name `splunk_run_search` would always return "Tool not found". Both names are now tried, with `splunk_run_query` first.
- **Supabase query field selection** — `splunk_configs` SELECT now explicitly includes the 4 new MCP fields to ensure they are populated on load.

---

## [v42.0.0] — 2026-05-21

### Added
- **Splunk MCP 1.2 Compliance** — `splunk-mcp` and `splunk-test` edge functions completely updated to match the Splunk MCP Server 1.2 specification:
  - Primary endpoint changed from `/messages` / `/mcp` to `/services/mcp` (Splunk 1.2 Streamable HTTP transport)
  - Tool name changed from `"search"` to `"splunk_run_search"` (Splunk namespaced tools per 1.2 spec)
  - Arguments updated from `{ query, count }` to `{ search, earliest_time, latest_time, max_count }` (Splunk 1.2 schema)
  - Probe order: `/services/mcp` (primary) → user-supplied URL → `/mcp` → `/messages` (legacy fallback)
  - `tools/list` connectivity test now reports tool count + first 3 tool names for confirmation
- **Ngrok Support** — Both edge functions detect ngrok-exposed Splunk instances and automatically add the `ngrok-skip-browser-warning: true` header to bypass the interstitial redirect page
- **MCP URL Helper Text** — Settings page MCP Server URL field now shows: correct placeholder (`https://battered-lukewarm-had.ngrok-free.dev`), inline documentation explaining `/services/mcp` is appended automatically, and a note that ngrok URLs require no port suffix
- **`scale` Action Type** — Command Center action cards now support `scale` type (orange/TrendingUp icon). When executed, the AI provides scaling steps and risk considerations for the target service
- **`notify` Action Type** — Command Center action cards now support `notify` type (violet/Bell icon). When executed, the AI drafts a notification message to the specified team/target and confirms
- **Voice Language Selector** — New language picker in the Command Center input bar (Volume2 icon → dropdown). Supports 10 languages: English (US/UK/India), Spanish, French, German, Japanese, Mandarin, Portuguese (Brazil), Korean. Selected language is applied to the Web Speech API `recognition.lang` property. Listening placeholder shows the active language
- **Action Execution History Panel** — Slide-in panel in the Command Center showing all AI-suggested actions that have been executed in the current session. Features: type badge with colour-coded icon, service/target metadata, execution timestamp, entry count badge on History button, clear-all action, auto-opens on first action execution, closes via X button

### Changed
- **Command Center system prompt** — Updated to include `scale` and `notify` in the action type list and example patterns, so the AI reliably suggests them for capacity and notification scenarios
- **Command Center welcome message** — Updated to show `scale` and `notify` example commands
- **Command Center quick command chips** — Updated: "Scale checkout-service to handle increased load" and "Notify the on-call team about the payment outage" replace two previous chips
- **MCP error messages** — Improved to explicitly reference ngrok setup and the Splunkbase MCP Server App requirement

### Fixed
- **MCP Server unreachable for ngrok Splunk** — The browser-warning interstitial page returned by ngrok was causing all MCP/REST requests to get HTML back instead of JSON. The new `ngrok-skip-browser-warning: true` header resolves this transparently
- **Wrong Splunk MCP tool name** — Previous code called `tools/call` with `name: "search"` which does not exist in Splunk MCP 1.2. Correct name is `splunk_run_search`

---

## [v41.0.0] — 2026-05-21

### Fixed
- **ActionCard crash on unknown action type** — LLM occasionally returns action types not in the known set. Changed direct object-literal lookup `{}[action.type]` to a named `META_MAP` with a `?? fallback` default. Any unknown type now renders gracefully with a neutral style instead of crashing with `Cannot read properties of undefined (reading 'bg')`
- **TypeScript `SpeechRecognition` compile error** — Added local `ISpeechRecognition` / `ISpeechRecognitionCtor` interface shim to replace missing `SpeechRecognition` global type. Eliminates `TS2552` errors in `CommandCenterPage.tsx`

---

## [v35.0.0] — 2026-05-21

### Added
- **Mark as Resolved button on incident cards** — Every OPEN or INVESTIGATING incident card now has a green "Mark as Resolved" button at the bottom. Clicking it issues a Supabase `UPDATE` on `live_incidents` setting `status = 'RESOLVED'` and `resolved_at = now()`. The card updates immediately via optimistic state in `DashboardPage`, shows a success toast, and the button disappears once resolved. A spinner is shown while the request is in flight.
- **30-Day Rolling MTTR Trend Line Chart** — New full-width `LineChart` on the Analytics page (Row 5, between the Radar chart and the Velocity chart) showing daily average resolution time (minutes) over the last 30 days. When real resolved incidents with `resolved_at` timestamps exist, the chart hydrates from live data grouped by day. Falls back to a smooth sinusoidal demo curve otherwise, with a helper prompt to mark incidents as resolved. Section ID `section-mttr-trend` is included in the print registry.
- **Print-Preview Modal for Analytics PDF Export** — The "Export PDF" button in the Analytics header now opens a modal (`Dialog`) instead of immediately calling `window.print()`. The modal lists all 11 chart/KPI sections with checkboxes (all checked by default), plus "Select all" / "Deselect all" quick actions and a live count. Clicking "Export PDF" hides unchecked sections from the DOM, calls `window.print()`, then restores visibility. Cancel closes without printing.

### Changed
- **`ChartCard` component** — Accepts an optional `id` prop forwarded to its root `<div>`, enabling per-section DOM targeting for the print-preview hide/restore logic.
- **`useChartTheme` hook** — Light-mode axis tick colours darkened to `hsl(220,15%,35%)` (≈7:1 contrast on white) and `hsl(220,15%,25%)` (≈10:1) for `tickCat`/`pieLabel`; `radarTick` updated from `hsl(220,10%,56%)` to `hsl(220,15%,35%)` — all now WCAG AA compliant in light mode.

### Fixed
- **Comprehensive light-mode contrast** — All severity chips, status badges, banners, and UI elements now pass WCAG AA (≥4.5:1) in light mode.

---

## [v13.0.0] — 2026-05-21

### Added
- **Enterprise Analytics Page** — Dedicated `/analytics` route with 10+ enterprise-grade charts and KPI cards.
- **Analytics KPI Summary Row** — Six KPI cards at top of analytics page.
- **Scheduled Auto-run for Query History** — Configurable interval selector (Off / 1 min / 5 min / 15 min / 30 min).
- **SentinelOps Logo** — Official brand logo on Login page, Dashboard header, SettingsPage, empty state.
- **Splunk Alert Import Severity Breakdown Dialog** — Colour-coded 2×2 grid after successful import.
- **Webhook Delivery Log CSV Export** — "Export CSV" button downloads full log.

### Changed
- **SettingsPage layout** — Converted to full-width two-column `lg:grid-cols-2` responsive grid.

---

## [v12.0.0] — 2026-05-21

### Fixed
- **Critical crash: `useLlm must be used within LlmProvider`** — Name collision between `LlmProvider` type alias and React context component. Fixed by renaming component to `LlmContextProvider`.

---

## [v11.0.0] — 2026-05-21

### Added
- **LLM Fallback Chain** — Automatic retry across configured providers on failure.
- **SPL Autocomplete** — 60+ SPL commands, 20+ field names, 25+ aggregation functions, pattern suggestions.
- **Alert Rule Live Preview** — Real-time rule matching against 8 sample incidents.
- **Keyboard navigation shortcuts** — j/k, Enter/Space, t, f, Esc.

---

## [v5.0.0] — 2026-05-21

### Added
- **Notification Center** — Bell icon with unread-count badge, alert history panel, per-user RLS.
- **Synthetic Incident Filter Toggle** — Hides TEST incidents by default.
- **Advanced Incident Filters** — Keyword search, severity/status multi-select.
- **Incident Deduplication Indicator** — Warning badge when same service has multiple open incidents.

---

## [v4.0.0] — 2026-05-20

### Added
- **Scheduled Synthetic Alert Job** — Hourly `pg_cron` job exercises alert pipeline.
- **SPL Query History Panel** — Persist-and-replay per-user query history.
- **Suggested Queries Chips** — AI-generated SPL query suggestions after incident analysis.

---

## [v3.0.0] — 2026-05-19

### Added
- **NL→SPL Tool** — Natural language to SPL using Gemini 2.5 Flash.
- **Splunk MCP Server Integration** — `splunk-mcp` edge function with JSON-RPC 2.0.
- **MCP Server Settings** — URL + token configuration with connectivity validation.

---

## [v2.0.0] — 2026-05-18

### Added
- **Real-Time Critical Incident Alerting** — Supabase Realtime subscription on `live_incidents`.
- **Simulate Alert Button** — Test end-to-end alert pipeline.
- **`useLiveAlerts` Hook** — Realtime deduplication and toast management.

---

## [v1.0.0] — 2026-05-17

### Added
- **Initial Release** — AI Incident Commander for Splunk. Authentication, incident dashboard, AI analysis, Splunk integration, export tools, dark cybersecurity theme.


### Added
- **Mark as Resolved button on incident cards** — Every OPEN or INVESTIGATING incident card now has a green "Mark as Resolved" button at the bottom. Clicking it issues a Supabase `UPDATE` on `live_incidents` setting `status = 'RESOLVED'` and `resolved_at = now()`. The card updates immediately via optimistic state in `DashboardPage`, shows a success toast, and the button disappears once resolved. A spinner is shown while the request is in flight.
- **30-Day Rolling MTTR Trend Line Chart** — New full-width `LineChart` on the Analytics page (Row 5, between the Radar chart and the Velocity chart) showing daily average resolution time (minutes) over the last 30 days. When real resolved incidents with `resolved_at` timestamps exist, the chart hydrates from live data grouped by day. Falls back to a smooth sinusoidal demo curve otherwise, with a helper prompt to mark incidents as resolved. Section ID `section-mttr-trend` is included in the print registry.
- **Print-Preview Modal for Analytics PDF Export** — The "Export PDF" button in the Analytics header now opens a modal (`Dialog`) instead of immediately calling `window.print()`. The modal lists all 11 chart/KPI sections with checkboxes (all checked by default), plus "Select all" / "Deselect all" quick actions and a live count. Clicking "Export PDF" hides unchecked sections from the DOM, calls `window.print()`, then restores visibility. Cancel closes without printing.

### Changed
- **`ChartCard` component** — Accepts an optional `id` prop forwarded to its root `<div>`, enabling per-section DOM targeting for the print-preview hide/restore logic.
- **`useChartTheme` hook** — Light-mode axis tick colours darkened to `hsl(220,15%,35%)` (≈7:1 contrast on white) and `hsl(220,15%,25%)` (≈10:1) for `tickCat`/`pieLabel`; `radarTick` updated from `hsl(220,10%,56%)` to `hsl(220,15%,35%)` — all now WCAG AA compliant in light mode.

### Fixed
- **Comprehensive light-mode contrast** — All severity chips, status badges, banners, and UI elements now pass WCAG AA (≥4.5:1) in light mode:
  - `badges.tsx` (`SEVERITY_CONFIG`, `STATUS_CONFIG`) — replaced hardcoded dark-only Tailwind chains with semantic CSS class names (`severity-critical`, `status-open`, etc.)
  - `index.css` — 24+ adaptive utility classes with `.light` theme overrides: status/severity badges, Splunk badge, critical count badge, mode indicator, trend badges, severity dots and text colours, resolve button
  - `DashboardPage.tsx` — mode pill, pulse dot, severity dot, severity text use adaptive classes
  - `IncidentList.tsx` — Splunk badge, critical count, deep-link text, severity dots use adaptive classes
  - `SettingsPage.tsx` — priority rank badges, error text spans, alert-level banners, severity preview result banners, webhook test result banner, diagnostic error text, routing rule labels, and action labels all updated with `dark:` prefix variants

---

## [v13.0.0] — 2026-05-21

### Added
- **Enterprise Analytics Page** — Dedicated `/analytics` route with 10+ enterprise-grade charts and KPI cards. Includes: 14-day stacked incident trend bar chart, severity distribution donut, incident-by-service horizontal bar chart, incident status overview pie chart, MTTR-by-service bar chart, SPL query activity area chart, Splunk alert severity donut, operational readiness radar chart, and cumulative incident velocity line chart. All charts hydrate from real Supabase data with intelligent demo fallback. Accessible from the dashboard header via the BarChart2 icon.
- **Analytics KPI Summary Row** — Six KPI cards at top of analytics page showing: Total Incidents, Open Incidents, Critical Alerts, Avg MTTR (min), Splunk Alerts imported, and SPL Queries run — each with trend badges and contextual colour coding.
- **Scheduled Auto-run for Query History** — Configurable interval selector (Off / 1 min / 5 min / 15 min / 30 min) in the Query History panel header. When active, automatically re-runs all saved queries at the selected interval. Live countdown timer and last-run timestamp displayed inline. Implemented with `setInterval` + cleanup on unmount / interval change.
- **SentinelOps Logo** — Official brand logo (`SentinelOps logo Final.png`) now displayed on: Login page (large centered hero), Dashboard top-left header, SettingsPage header, and Dashboard empty-state hero. Replaces all previous Shield icon placeholders.
- **Splunk Alert Import Severity Breakdown Dialog** — After a successful Splunk alert import, a Dialog displays a colour-coded 2×2 severity grid showing counts for CRITICAL / HIGH / MEDIUM / LOW alerts imported. Implemented in `SplunkAlertsPanel.tsx`.
- **Webhook Delivery Log CSV Export** — "Export CSV" button in the webhook delivery log header downloads the full log as `webhook-delivery-log.csv` with columns: `timestamp`, `result`, `detail`, `secret`. Proper CSV escaping (double-quotes doubled). Implemented with `Blob` + `URL.createObjectURL`.

### Changed
- **SettingsPage layout** — Converted from single-column `max-w-2xl` layout to a full-width two-column `lg:grid-cols-2` responsive grid. Left column: Splunk REST API + Webhook log + Severity Rules + Splunk MCP Server. Right column: Integrations + AI Model + Alert Routing + Simulate Alert + Demo Info + Account. Connection status banner remains full-width above the grid.
- **Dashboard header** — Added Analytics icon button (BarChart2) linking to `/analytics`, alongside the existing Settings button.
- **DashboardPage empty state** — Brand logo replaces generic Shield icon in the "SentinelOps Ready" hero section.

### Fixed
- **`Download` icon missing from `SettingsPage.tsx` lucide imports** — CSV export button previously caused a lint/runtime error due to `Download` not being imported. Added to the import statement.

---

## [v12.0.0] — 2026-05-21

### Fixed
- **Critical crash: `useLlm must be used within LlmProvider`** — Root cause was a name collision in `LlmContext.tsx` where `LlmProvider` was exported as both a type alias (`export type LlmProvider = 'gemini' | …`) and as the React context component (`export function LlmProvider`). Vite's bundler resolved the ambiguous binding and silently failed to provide the context, causing `useContext(LlmContext)` to return `null` on the Settings page. Fixed by renaming the component to `LlmContextProvider` (distinct from the type), and updating the import in `App.tsx`.

### Added
- **Type/Component name collision lint rule** — `check.sh` now runs a Python-based static analysis pass over all `src/**/*.ts{x}` files. Any file that exports the same identifier as both a `type` alias and a `function`/`const`/`class` is flagged as an error at lint time, preventing the class of runtime crash fixed above.
- **`no-type-component-name-collision.yml`** — Companion ast-grep rule warning on any `export function *Provider` pattern, surfacing provider-naming risks for code review.
- **LLM fallback chain smoke test** (`tasks/smoke-test-llm-fallback.mjs`) — Eight standalone Node.js tests covering: primary success (no retry), HTTP 500 → retry next, network throw → retry next, multi-level 3-provider chain, all-fail → 502, empty config → 400, duplicate-provider skip, and gateway Gemini slot. Run with `node tasks/smoke-test-llm-fallback.mjs`.
- **Fallback chain order indicator in Settings** — Live panel in the AI Model Configuration card (below the Save button) shows the ordered sequence of providers that will be tried on failure. Each slot displays its 1-indexed position, provider label, and "active" badge for the primary. Updates instantly as API keys are added or removed without saving. Single-provider hint prompts users to add more keys to enable failover.

---

## [v11.0.0] — 2026-05-21

### Added
- **LLM Fallback Chain** — `_shared/llmRouter.ts` extended with an `LlmFallbackSlot[]` parameter. When the active provider returns a non-2xx response or throws a network error, the router automatically retries each subsequent slot in order and logs per-provider failures. The final response includes an `X-Llm-Provider-Used` header identifying which provider succeeded.
- **`buildFallbackChain()` helper in `LlmContext`** — Returns an ordered array of configured providers: active provider first, then all other providers that have a non-empty API key. Exposed via `useLlm()` context.
- **SPL Autocomplete** (`SplAutocomplete.tsx`) — Replaces the bare Textarea in the NL→SPL query box. Provides inline suggestions for 60+ SPL commands, 20+ common field names, 25+ aggregation functions, and 10 pre-built natural-language query patterns. Ctrl+Space force-opens the full pattern menu. Arrow keys navigate, Tab applies, Enter submits.
- **Alert Rule Live Preview** (`AlertRulePreview.tsx`) — Embedded under each alert rule row in Settings. Matches the rule's severity/service criteria against 8 representative sample incidents in real time. Shows match count (`N/8`), a colour-coded progress bar (red <30 %, yellow 30–60 %, green >60 %), matched incident list with severity badges, and a warning when the rule is disabled.
- **Keyboard navigation shortcuts** — Dashboard supports: `j` / `↓` next incident, `k` / `↑` previous incident, `Enter` / `Space` analyze selected incident, `t` switch to Tools panel, `f` switch to Follow-up panel, `Esc` deselect. Shortcuts are suppressed when focus is inside an input, textarea, or select.
- **Keyboard shortcut legend** — Hover tooltip on a Keyboard icon in the dashboard header listing all shortcuts. Hidden on mobile to avoid clutter.
- **Shortcut hint in incident list** — Subtle `j/k or ↑/↓ to navigate · Enter to analyze` hint below the "Incidents" header on desktop breakpoints.

### Changed
- `incident-analyze`, `incident-followup`, `splunk-mcp` Edge Functions all accept and propagate `llmFallbackChain` parameter to `callLlm()`.
- `DashboardPage`, `FollowUpPanel`, `ToolsPanel` all call `buildFallbackChain()` before invoking edge functions.
- `SettingsPage` — `AlertRulePreview` wired into each rule card.

---

## [v5.0.0] — 2026-05-21

### Added
- **Notification Center** — Bell icon in dashboard header with unread-count badge. Sliding panel shows full alert history (CRITICAL/HIGH only), color-coded by severity. Alerts persist to new `alert_notifications` Supabase table with per-user RLS. Supports mark-all-read and clear-history actions.
- **Synthetic Incident Filter Toggle** — Toggle at the top of the incident list sidebar (default ON = hidden). Shows count badge of hidden synthetic items. Synthetic incidents display a "TEST" badge when the toggle is OFF.
- **Advanced Incident Filters** — Keyword search input, severity multi-select dropdown (CRITICAL/HIGH/MEDIUM/LOW), and status multi-select (default: OPEN + INVESTIGATING). All filters use AND logic. Active-filter count badge and Clear Filters button included.
- **Incident Deduplication Indicator** — Warning icon badge on incident cards when another OPEN incident affects the same service. Tooltip shows the related incident ID.
- **SPL Query History Search** — Real-time keyword search box at the top of the Query History Panel. Filters the loaded history client-side against `query_text` and `generated_spl` (case-insensitive). Shows empty state when no matches found.
- **Share Button for SPL Results** — "Share link" button appears next to "Copy SPL" after a query is generated. Copies a deep-link URL with `?nlq=<encoded_question>&service=<service>` to clipboard; shows "Link copied!" toast.
- **Deep-Link URL Handling** — Dashboard reads `?nlq=` and `?service=` URL parameters on load. Pre-fills the NL→SPL query input and auto-executes if the service matches the current incident context.
- **Export CSV for SPL Results** — "Export CSV" button appears above the results table after a query executes. Downloads `spl_results_<timestamp>.csv` using the Blob API with all result rows and column headers.
- **`alert_notifications` Database Table** — Stores per-user alert history. Columns: `id`, `user_id`, `incident_id`, `severity`, `service`, `title`, `is_read`, `created_at`. Full RLS with helper functions.

### Changed
- `useLiveAlerts` hook now persists CRITICAL/HIGH alerts to `alert_notifications` and exposes `notifications`, `unreadCount`, `markAllRead`, and `clearNotifications` to consumers.
- `IncidentList` component rebuilt with filter controls; accepts `is_synthetic` field on incidents.
- `ToolsPanel` and `NlSplTool` updated with `deepLinkQuery` / `deepLinkService` props.
- `DashboardPage` header now includes `NotificationCenter` component; reads URL search params for deep-link support.

---

## [v4.0.0] — 2026-05-20

### Added
- **Scheduled Synthetic Alert Job** — `synthetic-alert-job` Supabase Edge Function deployed with an hourly `pg_cron` schedule (`0 * * * *`). Rotates across 5 services and 2 severity levels to continuously exercise the Realtime alert pipeline.
- **`is_synthetic` Column** — Boolean flag added to `live_incidents` table (default `false`). Allows the UI to distinguish automated test incidents from real production incidents.
- **SPL Query History Panel** — Persist-and-replay UI inside the NL→SPL tool. History stored per-user in `spl_query_history` table (RLS-isolated). Supports replay-on-click and Clear History with confirmation dialog.
- **Suggested Queries Chips** — `incident-analyze` Edge Function returns `suggestedQueries[]` (3 NL questions based on service/timeWindow/top errors/deploy events). Rendered as clickable chips in NL→SPL that auto-fill and execute on click.

### Changed
- `incident-analyze` Edge Function extended with `buildSuggestedQueries()` function.
- `AnalysisResult` type extended with `suggestedQueries?: string[]`.
- `ToolsPanel` wired to receive and render `suggestedQueries` from `DashboardPage`.

---

## [v3.0.0] — 2026-05-19

### Added
- **NL→SPL Tool** — Natural Language to SPL conversion tab in the Tools Panel. Uses Gemini 2.5 Flash via `large-language-model` skill to generate valid SPL from plain-English questions.
- **Splunk MCP Server Integration** — `splunk-mcp` Supabase Edge Function. When `SPLUNK_MCP_URL` is configured, generated SPL is sent to the MCP Server `/tools/call` endpoint for live execution; results returned to UI.
- **SPL Query History** — `spl_query_history` Supabase table with per-user RLS. Columns: `id`, `user_id`, `query_text`, `generated_spl`, `service_context`, `incident_id`, `created_at`.
- **MCP Server Settings** — New configuration fields (`SPLUNK_MCP_URL`, `SPLUNK_MCP_TOKEN`) added to the Settings page with connectivity validation.

### Changed
- Settings page now has a dedicated "Splunk MCP Server" section.
- Tools Panel NL→SPL tab replaces the previous placeholder.

---

## [v2.0.0] — 2026-05-18

### Added
- **Real-Time Critical Incident Alerting** — Supabase Realtime `postgres_changes` subscription on `live_incidents` table. CRITICAL and HIGH inserts trigger toast notifications (10-second duration) and a dismissible alert banner at the top of the dashboard.
- **`live_incidents` Table** — Supabase table to receive simulated and real incident rows. Columns: `id`, `incident_id`, `title`, `severity`, `status`, `service`, `summary`, `opened_at`.
- **Simulate Alert Button** — Available in the dashboard header and Settings page. Opens a dialog to select severity and service name, inserts a test row, and exercises the full Realtime → banner → toast pipeline.
- **`useLiveAlerts` Hook** — Encapsulates Realtime subscription, deduplication (seenIds ref), toast firing, and banner state management.
- **Alert Banner Component** — Sticky banner below the header showing active CRITICAL/HIGH incidents with dismiss action.

### Changed
- Dashboard header now includes the Simulate Alert button.
- Settings page includes both Splunk connection config and alert simulation.

---

## [v1.0.0] — 2026-05-17

### Added
- **Initial Release** of SentinelOps — AI Incident Commander for Splunk (Hackathon entry, Observability track).
- **User Authentication** — Supabase Auth with username/password login and registration via `login` skill.
- **Incident Dashboard** — Three-column layout: incident list sidebar, central detail panel, right-side tools/follow-up panel.
- **AI-Powered Incident Analysis** — `incident-analyze` Supabase Edge Function calls Gemini 2.5 Flash (`large-language-model` skill) to produce ranked root-cause hypotheses, blast radius, timeline, and recommended actions.
- **Splunk Integration Abstraction** — Supports Demo Mode (bundled sample JSON), Live Mode (Splunk REST API via `SPLUNK_HOST` + `SPLUNK_TOKEN`). Fallback to demo on connection failure.
- **Evidence Sections** — Top error patterns, deploy/change events, affected services/endpoints, and metadata summary rendered from analysis results.
- **Follow-Up Investigation** — Predefined prompt chips ("What changed before the spike?", "Show top failing endpoints", etc.) stream additional AI analysis via `large-language-model` SSE.
- **Tools Panel** — Tabbed panel with Web Search (`web-search`), AI Search (`ai-search`), OCR Upload (`ocr-space`), Web Reader (`web-reader`), Data Viz (`data-analysis`), and Export tools.
- **Export Options** — Markdown report, Slack-style update, Jira-style summary, and PowerPoint briefing (6-slide deck via `ppt-generator` skill).
- **Settings Page** — Splunk Host, Splunk Token configuration with live/demo mode toggle and connection validation.
- **Demo Incidents** — Three pre-loaded incidents: INC-1001 (checkout-service CRITICAL), INC-1002 (payment-api HIGH), INC-1003 (auth-service MEDIUM).
- **Dark Cybersecurity Theme** — Navy/slate background, cyan/orange accents, glass-morphic cards, monospace SPL elements.

---

## Pending — Good-to-Have Features

The following features are tracked from the PRD (§7 Good-to-Have) and deferred to future releases.  
Items are grouped by area and roughly ordered by impact vs. effort.

### 🔔 Alert & Notification Channels
- Email, SMS, and webhook notification channels for alert routing rules (beyond toast)
- Alert history audit trail — full log of every triggered rule with timestamps and matched fields
- Custom alert sound or visual pulse effect for CRITICAL severity
- Batch synthetic alert generation for load testing the notification pipeline

### 🔍 Incident Investigation
- Incident correlation across multiple services — link related incidents in a dependency graph view
- Automatic incident deduplication — suppress duplicates based on service + error fingerprint, not just open incidents on same service
- Collaborative investigation — comments, annotations, and shared workspace per incident
- Customizable severity levels and status workflow (e.g. add WARN, P0/P1/P2 terminology)
- Historical incident trend analysis — charts showing MTTR, recurrence rate, top services by incident count over time

### 🔎 SPL Query & Tools
- SPL syntax highlighting in the generated query output block (commands in cyan, fields in green, values in yellow)
- Advanced SPL query builder UI — visual clause composer with field pickers
- SPL query validation — pre-flight check that generated SPL is syntactically correct before MCP execution
- Natural language query suggestions ranking based on user feedback / thumbs-up
- Query result export in multiple formats (JSON, Excel) in addition to existing CSV
- Query result visualization — inline Recharts bar/line chart for numeric SPL results
- Query history export — download full history as CSV
- Configurable suggested queries — user can pin, remove, and reorder chips

### 🤖 AI & LLM
- SPL autocomplete field-name suggestions from live Splunk schema (phase 2 of existing autocomplete)
- Custom AI model fine-tuning or BYOM (bring-your-own-model) endpoint support
- E2E LLM fallback test — automated integration test that simulates primary provider returning 429/500 and verifies secondary provider handles the request

### 📊 Dashboard & Reporting
- Custom dashboard creation and saved views per user
- Performance metrics and SLA tracking — MTTD, MTTR, SLA breach indicators
- Scheduled incident report generation and email delivery
- Customizable PowerPoint templates for different stakeholder audiences (executive, technical, compliance)
- Configurable synthetic alert job schedule (beyond hourly; cron expression input)
- Synthetic alert job monitoring dashboard — last run time, success/failure rate

### 🔒 Security & Enterprise
- Full enterprise authentication: SSO, SAML, LDAP integration
- Advanced RBAC — viewer / analyst / admin / auditor roles with per-feature permission gates
- Audit logging and compliance reporting — immutable log of all AI analyses, SPL executions, and config changes
- Multi-tenant architecture with full tenant isolation (separate DB schemas or RLS tenant_id)
- Real production Splunk write-back (update incident status from SentinelOps back to Splunk)
- Full Splunk app packaging and App Inspect compliance for Splunkbase submission

### 🔗 Integrations
- PagerDuty / Opsgenie integration — create/update/acknowledge incidents from SentinelOps
- CI/CD pipeline integration — ingest deployment events from GitHub Actions / Jenkins for deploy-correlate analysis
- Support for additional MCP tools beyond `search` (e.g. `savedsearch`, `index`, `field_summary`)
- MCP Server health monitoring panel in Settings

### 📱 Experience
- Mobile application or fully responsive mobile-optimised layout
- Multi-language support (i18n framework with at least Spanish and Japanese as first targets)
- Dark/light theme toggle (currently dark-only)
- Browser compatibility testing matrix beyond Chrome/Firefox (Safari, Edge)
- Load testing and performance optimisation for deployments with 10k+ incidents


### Added
- **Notification Center** — Bell icon in dashboard header with unread-count badge. Sliding panel shows full alert history (CRITICAL/HIGH only), color-coded by severity. Alerts persist to new `alert_notifications` Supabase table with per-user RLS. Supports mark-all-read and clear-history actions.
- **Synthetic Incident Filter Toggle** — Toggle at the top of the incident list sidebar (default ON = hidden). Shows count badge of hidden synthetic items. Synthetic incidents display a "TEST" badge when the toggle is OFF.
- **Advanced Incident Filters** — Keyword search input, severity multi-select dropdown (CRITICAL/HIGH/MEDIUM/LOW), and status multi-select (default: OPEN + INVESTIGATING). All filters use AND logic. Active-filter count badge and Clear Filters button included.
- **Incident Deduplication Indicator** — Warning icon badge on incident cards when another OPEN incident affects the same service. Tooltip shows the related incident ID.
- **SPL Query History Search** — Real-time keyword search box at the top of the Query History Panel. Filters the loaded history client-side against `query_text` and `generated_spl` (case-insensitive). Shows empty state when no matches found.
- **Share Button for SPL Results** — "Share link" button appears next to "Copy SPL" after a query is generated. Copies a deep-link URL with `?nlq=<encoded_question>&service=<service>` to clipboard; shows "Link copied!" toast.
- **Deep-Link URL Handling** — Dashboard reads `?nlq=` and `?service=` URL parameters on load. Pre-fills the NL→SPL query input and auto-executes if the service matches the current incident context.
- **Export CSV for SPL Results** — "Export CSV" button appears above the results table after a query executes. Downloads `spl_results_<timestamp>.csv` using the Blob API with all result rows and column headers.
- **`alert_notifications` Database Table** — Stores per-user alert history. Columns: `id`, `user_id`, `incident_id`, `severity`, `service`, `title`, `is_read`, `created_at`. Full RLS with helper functions.

### Changed
- `useLiveAlerts` hook now persists CRITICAL/HIGH alerts to `alert_notifications` and exposes `notifications`, `unreadCount`, `markAllRead`, and `clearNotifications` to consumers.
- `IncidentList` component rebuilt with filter controls; accepts `is_synthetic` field on incidents.
- `ToolsPanel` and `NlSplTool` updated with `deepLinkQuery` / `deepLinkService` props.
- `DashboardPage` header now includes `NotificationCenter` component; reads URL search params for deep-link support.

---

## [v4.0.0] — 2026-05-20

### Added
- **Scheduled Synthetic Alert Job** — `synthetic-alert-job` Supabase Edge Function deployed with an hourly `pg_cron` schedule (`0 * * * *`). Rotates across 5 services and 2 severity levels to continuously exercise the Realtime alert pipeline.
- **`is_synthetic` Column** — Boolean flag added to `live_incidents` table (default `false`). Allows the UI to distinguish automated test incidents from real production incidents.
- **SPL Query History Panel** — Persist-and-replay UI inside the NL→SPL tool. History stored per-user in `spl_query_history` table (RLS-isolated). Supports replay-on-click and Clear History with confirmation dialog.
- **Suggested Queries Chips** — `incident-analyze` Edge Function returns `suggestedQueries[]` (3 NL questions based on service/timeWindow/top errors/deploy events). Rendered as clickable chips in NL→SPL that auto-fill and execute on click.

### Changed
- `incident-analyze` Edge Function extended with `buildSuggestedQueries()` function.
- `AnalysisResult` type extended with `suggestedQueries?: string[]`.
- `ToolsPanel` wired to receive and render `suggestedQueries` from `DashboardPage`.

---

## [v3.0.0] — 2026-05-19

### Added
- **NL→SPL Tool** — Natural Language to SPL conversion tab in the Tools Panel. Uses Gemini 2.5 Flash via `large-language-model` skill to generate valid SPL from plain-English questions.
- **Splunk MCP Server Integration** — `splunk-mcp` Supabase Edge Function. When `SPLUNK_MCP_URL` is configured, generated SPL is sent to the MCP Server `/tools/call` endpoint for live execution; results returned to UI.
- **SPL Query History** — `spl_query_history` Supabase table with per-user RLS. Columns: `id`, `user_id`, `query_text`, `generated_spl`, `service_context`, `incident_id`, `created_at`.
- **MCP Server Settings** — New configuration fields (`SPLUNK_MCP_URL`, `SPLUNK_MCP_TOKEN`) added to the Settings page with connectivity validation.

### Changed
- Settings page now has a dedicated "Splunk MCP Server" section.
- Tools Panel NL→SPL tab replaces the previous placeholder.

---

## [v2.0.0] — 2026-05-18

### Added
- **Real-Time Critical Incident Alerting** — Supabase Realtime `postgres_changes` subscription on `live_incidents` table. CRITICAL and HIGH inserts trigger toast notifications (10-second duration) and a dismissible alert banner at the top of the dashboard.
- **`live_incidents` Table** — Supabase table to receive simulated and real incident rows. Columns: `id`, `incident_id`, `title`, `severity`, `status`, `service`, `summary`, `opened_at`.
- **Simulate Alert Button** — Available in the dashboard header and Settings page. Opens a dialog to select severity and service name, inserts a test row, and exercises the full Realtime → banner → toast pipeline.
- **`useLiveAlerts` Hook** — Encapsulates Realtime subscription, deduplication (seenIds ref), toast firing, and banner state management.
- **Alert Banner Component** — Sticky banner below the header showing active CRITICAL/HIGH incidents with dismiss action.

### Changed
- Dashboard header now includes the Simulate Alert button.
- Settings page includes both Splunk connection config and alert simulation.

---

## [v1.0.0] — 2026-05-17

### Added
- **Initial Release** of SentinelOps — AI Incident Commander for Splunk (Hackathon entry, Observability track).
- **User Authentication** — Supabase Auth with username/password login and registration via `login` skill.
- **Incident Dashboard** — Three-column layout: incident list sidebar, central detail panel, right-side tools/follow-up panel.
- **AI-Powered Incident Analysis** — `incident-analyze` Supabase Edge Function calls Gemini 2.5 Flash (`large-language-model` skill) to produce ranked root-cause hypotheses, blast radius, timeline, and recommended actions.
- **Splunk Integration Abstraction** — Supports Demo Mode (bundled sample JSON), Live Mode (Splunk REST API via `SPLUNK_HOST` + `SPLUNK_TOKEN`). Fallback to demo on connection failure.
- **Evidence Sections** — Top error patterns, deploy/change events, affected services/endpoints, and metadata summary rendered from analysis results.
- **Follow-Up Investigation** — Predefined prompt chips ("What changed before the spike?", "Show top failing endpoints", etc.) stream additional AI analysis via `large-language-model` SSE.
- **Tools Panel** — Tabbed panel with Web Search (`web-search`), AI Search (`ai-search`), OCR Upload (`ocr-space`), Web Reader (`web-reader`), Data Viz (`data-analysis`), and Export tools.
- **Export Options** — Markdown report, Slack-style update, Jira-style summary, and PowerPoint briefing (6-slide deck via `ppt-generator` skill).
- **Settings Page** — Splunk Host, Splunk Token configuration with live/demo mode toggle and connection validation.
- **Demo Incidents** — Three pre-loaded incidents: INC-1001 (checkout-service CRITICAL), INC-1002 (payment-api HIGH), INC-1003 (auth-service MEDIUM).
- **Dark Cybersecurity Theme** — Navy/slate background, cyan/orange accents, glass-morphic cards, monospace SPL elements.
