Requirements Document
1. Application Overview
1.1 Application Name
SentinelOps — Agentic Incident Commander for Splunk

1.2 Application Description
SentinelOps is an AI-powered agentic incident commander web application designed for the Splunk Agentic Ops Hackathon (Observability track). It helps on-call engineers investigate incidents faster by pulling incident evidence from Splunk or demo data, correlating logs and deployment events, generating AI-assisted incident briefs via Gemini 2.5 Flash LLM, showing blast radius and timeline, recommending next actions, and exporting stakeholder-ready updates.

1.3 Hackathon Context
Target Track: Observability
Bonus Prize Targets: Best Use of Splunk MCP Server, Best Use of Splunk Hosted Models, Best Use of Splunk Developer Tools
Judging Criteria: Technological Implementation, Design, Potential Impact, Quality of the Idea (equally weighted)
1.4 Core Value Proposition
Turns noisy Splunk signals into a guided incident response brief with evidence, ranked hypotheses, and next actions. Reduces mean time to understand and mean time to respond for engineering and operations teams.

2. Users and Use Scenarios
2.1 Target Users
SREs (Site Reliability Engineers)
DevOps engineers
NOC analysts
Security analysts investigating service-impact events
Engineering managers or incident commanders
2.2 Core Use Scenarios
Scenario 1: A deployment to checkout-service happens at 10:37. At 10:42, latency spikes and 5xx errors rise. User opens SentinelOps, selects the incident, clicks Analyze Incident, and receives a response brief correlating the deploy window, log patterns, impacted endpoints, and service relationships with recommended actions.
Scenario 2: User needs to understand what changed before an incident spike, uses follow-up prompts to investigate top failing endpoints and affected services.
Scenario 3: User exports incident analysis as Markdown report or Slack-style update to share with stakeholders.
Scenario 4: User configures Splunk connection in settings to connect to live Splunk instance instead of demo mode.
Scenario 5: User generates PowerPoint briefing from incident analysis and downloads it for stakeholder presentation.
Scenario 6: A new CRITICAL incident is detected, user receives real-time toast notification and sees alert banner on dashboard.
Scenario 7: User clicks Simulate Alert button to test real-time alerting pipeline by inserting a test incident into live_incidents table.
Scenario 8: User enters natural language question in NL→SPL tab, system generates SPL query and executes it via Splunk MCP Server.
Scenario 9: Scheduled synthetic alert job automatically inserts test incidents every hour to continuously validate alert pipeline.
Scenario 10: User views SPL query history in NL→SPL tool, clicks a previous query to re-run it.
Scenario 11: After incident analysis completes, user sees top 3 suggested SPL queries pre-populated in NL→SPL tool and clicks one to execute.
Scenario 12 [NEW v13]: User navigates to the Analytics page to view enterprise KPI cards, 14-day incident trend, MTTR-by-service, and operational readiness radar — all populated from live Supabase data.
Scenario 13 [NEW v13]: User enables 5-minute auto-run in the Query History panel; SentinelOps re-runs all saved SPL queries automatically and shows a pass/fail summary with countdown timer.
Scenario 14 [NEW v13]: After importing Splunk alerts, user sees a severity breakdown dialog showing CRITICAL/HIGH/MEDIUM/LOW import counts.
Scenario 15 [NEW v13]: User downloads the webhook delivery log as a CSV file for audit trail purposes.
Scenario 16 [NEW v42]: User opens Command Center, types "Scale checkout-service to handle the load spike" — AI responds with scaling steps and risk analysis, and a Scale action card appears. User clicks Scale; the executed action is logged in the Action History panel.
Scenario 17 [NEW v42]: User opens Command Center, says "Notify the payments team about INC-1001" in French using voice input — Language Selector is set to French; SpeechRecognition transcribes in French; AI drafts a notification and presents a Notify action card.
Scenario 18 [NEW v42]: User views the Action History panel in Command Center to audit all AI-suggested actions executed during the session and their timestamps.
Scenario 19 [NEW v42]: User enters their ngrok Splunk URL in Settings → Splunk MCP Server, clicks "Test MCP" — SentinelOps correctly probes /services/mcp using splunk_run_search (Splunk MCP 1.2), reports tool count, and shows green "MCP Server reachable" badge.
Scenario 20 [NEW v43]: User opens Settings → Splunk MCP Server, enters ngrok HTTPS URL + bearer token, clicks Test MCP Connection — system runs initialize + tools/list, shows server name, version, and all 10 discovered tools. User clicks Save; all data persists to database.
Scenario 21 [NEW v43]: User expands MCP Tool Explorer panel, filters to "Indexes" category, clicks Run Tool on splunk_get_indexes card — index list appears inline.
Scenario 22 [NEW v43]: User types "Show me the top 10 errors in the last hour" in the NL→SPL via MCP panel, clicks Generate SPL, reviews output, clicks Run via MCP — results appear inline.
Scenario 23 [NEW v43]: User views Dashboard header and sees MCP status badge with green pulsing dot. Hovering shows server name, version, and tool count tooltip.
2.3 Jobs to be Done
Understand what changed before impact
See the most relevant evidence in one place
Get a useful root-cause starting point
Assess scope and urgency
Share status clearly with stakeholders
Configure live Splunk connection for real data
Generate executive briefing presentations
Receive immediate alerts for critical incidents
Test real-time alerting pipeline with simulated incidents
Query Splunk data using natural language via MCP Server
Continuously validate alert pipeline with automated synthetic incidents
Review and reuse previously generated SPL queries
Quickly run relevant SPL queries suggested by incident analysis
Monitor enterprise operational health via charts and KPIs [NEW v13]
Schedule periodic re-validation of all saved SPL queries [NEW v13]
Export webhook and alert audit data as CSV [NEW v13]
Execute scale and notify remediation actions via voice or text command [NEW v42]
Speak commands in multiple languages via configurable voice input [NEW v42]
Audit executed AI actions within a session via history panel [NEW v42]
Connect to ngrok-exposed local Splunk with correct MCP 1.2 protocol [NEW v42]
Discover all 10 Splunk MCP tools via server handshake [NEW v43]
Invoke any Splunk MCP tool interactively from Settings UI [NEW v43]
Run NL→SPL queries through MCP via the quick-run panel [NEW v43]
Monitor MCP connection status from the Dashboard header [NEW v43]
Persist MCP server metadata (name, version, tool list) across sessions [NEW v43]
3. Page Structure and Functional Description
3.1 Page Structure
SentinelOps Application
├── Login Page (SentinelOps brand logo + credentials)
├── Analytics Page (/analytics) [NEW v13]
│   ├── KPI Summary Row (6 cards)
│   ├── 14-Day Incident Trend (stacked bar)
│   ├── Severity Distribution (donut)
│   ├── Incidents by Service (horizontal bar)
│   ├── Incident Status Overview (pie)
│   ├── MTTR by Service (horizontal bar)
│   ├── 30-Day MTTR Trend (rolling line chart) [NEW v35]
│   ├── SPL Query Activity (area chart)
│   ├── Splunk Alert Severity (donut)
│   ├── Operational Readiness Radar
│   └── Cumulative Velocity (line chart)
├── Command Center (/command) [NEW v42]
│   ├── AI Chat (Gemini 2.5 Flash streaming)
│   ├── Voice Input with Language Selector (10 languages) [NEW v42]
│   ├── Action Cards: resolve, status, query, escalate, scale, notify [NEW v42]
│   ├── Action Execution History Panel [NEW v42]
│   └── Quick Command Chips
├── Settings Page (two-column balanced grid) [UPDATED v42]
│   ├── Left Column
│   │   ├── Splunk Connection Configuration
│   │   ├── Webhook Delivery Log (CSV Export) [NEW v13]
│   │   ├── Severity Classification Rules
│   │   └── Splunk MCP Server Configuration [UPDATED v42 — MCP 1.2 + ngrok guidance]
│   └── Right Column
│       ├── Integrations (PagerDuty, Email, Slack)
│       ├── AI Model Configuration
│       ├── Alert Routing Rules
│       ├── Simulate Alert Button
│       ├── Demo Mode Info
│       └── Account Info
├── Incident Dashboard
│   ├── Analytics icon button in header [NEW v13]
│   ├── Simulate Alert Button (Header)
│   ├── Alert Banner (for critical incidents)
│   ├── Left Sidebar (Incident List)
│   ├── Center Panel (Incident Detail)
│   └── Right/Bottom Panel (Tools & Actions)
├── Incident Detail View
│   ├── Overview Card
│   ├── Evidence Sections
│   └── Analysis Results
└── Tools Panel
    ├── Web Search
    ├── AI Search
    ├── OCR Upload
    ├── Web Reader
    ├── Data Analysis
    ├── NL→SPL (Natural Language to SPL)
    │   ├── Suggested Queries Section
    │   ├── Query Input Area
    │   └── Query History Panel
    │       └── Scheduled Auto-run (configurable interval) [NEW v13]
    ├── Splunk Alerts Panel
    │   ├── Import from Splunk REST API
    │   └── Severity Breakdown Dialog (post-import) [NEW v13]
    └── Export Options
        ├── Markdown Report
        ├── Slack-style Update
        ├── Jira-style Summary
        └── PowerPoint Briefing
3.2 Login Page
Purpose: User authentication and registration

Functional Description:

User enters username and password to log in
User can register new account with username and password
Authentication uses Supabase Auth with @miaoda.com email simulation
After successful login, user is redirected to Incident Dashboard
Integration:

Uses <SKILL>login</SKILL> for authentication
3.3 Settings Page
Purpose: Configure Splunk connection, MCP server, and application settings

3.3.1 Splunk Connection Configuration
Functional Description:

User enters SPLUNK_HOST (Splunk instance URL)
User enters SPLUNK_TOKEN (authentication token)
User clicks Save Configuration button to store credentials
System validates connection by testing connectivity
System displays connection status (Connected/Disconnected)
User can toggle between Live Mode and Demo Mode
Configuration is stored in backend environment variables or user settings
Display Requirements:

Show current connection mode (Live/Demo) clearly in settings UI
Display last successful connection timestamp when in Live Mode
Show validation errors if connection fails
3.3.2 Splunk MCP Server Configuration [UPDATED v43]
Purpose: Configure a remote Splunk MCP Server connection over HTTPS (JSON-RPC 2.0 Streamable HTTP transport) for server discovery, full tool invocation, and NL→SPL execution.
Protocol: Splunk MCP Server 1.2 — Streamable HTTP transport; endpoint POST {base}/services/mcp
Primary tool: splunk_run_query (args: query, earliest_time, latest_time, max_results)
Fallback tool: splunk_run_search (args: search, earliest_time, latest_time, max_count)
Ngrok support: ngrok-skip-browser-warning header auto-injected; manual toggle override available

Functional Description:

User enters SPLUNK_MCP_URL (base URL — /services/mcp appended automatically)
User selects auth method: Bearer Token (token field) or Basic Auth (username + password)
User toggles "Skip ngrok browser warning" to force ngrok header override (auto-detected from URL)
User clicks Test MCP Connection — system runs initialize (get serverName + serverVersion) then tools/list (get all tools)
System shows connected server info badge: name, version, tool count
User clicks Save Configuration — mcp_skip_ngrok, mcp_server_name, mcp_server_version, mcp_tool_list persisted to database

MCP Tool Explorer Panel (collapsible):
All 10 discovered tools shown as interactive cards with: name, description, category badge, JSON args editor, Run button
Category filter pills: All, Search, Server, Indexes, Users, Metadata, KV Store, Knowledge, Saved Searches
Clicking Run invokes the tool via splunk-mcp edge function tool-call mode; result shown inline

NL→SPL via MCP Panel (collapsible):
User types natural language query → clicks Generate SPL → SPL shown in editable textarea
User clicks Run via MCP → SPL executed via splunk_run_query → results shown inline

Error Handling:
HTTP 401/403 → bad token message
HTTP 404/405 → endpoint/app installation message
Timeout → ngrok tunnel check message
All failures show 4-bullet actionable troubleshooting list

Display Requirements:
Connected server badge at top of section after successful test (purple border, server name, version, tool count, green check)
Ngrok toggle with ToggleRight (on) / ToggleLeft (off) icons
URL hint: "SentinelOps appends /services/mcp automatically (Splunk MCP 1.2)"
MCP status indicator in Dashboard header: green pulsing dot (connected) / grey dot (not configured)
3.3.3 Simulate Alert Button
Purpose: Test real-time alerting pipeline by inserting test incident into live_incidents table

Functional Description:

User clicks Simulate Alert button in Settings page
System displays modal or form with following fields:
Severity dropdown (CRITICAL or HIGH)
Service name text input (optional, defaults to test-service)
User selects severity and optionally enters service name
User clicks Confirm button
System generates realistic incident ID (e.g., INC-2001, INC-2002)
System generates realistic incident title based on service and severity
System inserts new row into live_incidents Supabase table with:
Generated incident ID
Generated title
Selected severity
Service name
Status: OPEN
Opened timestamp: current time
System displays success toast confirming row was inserted
Because frontend subscribes to Supabase Realtime postgres_changes on live_incidents table, the insertion triggers alert banner and toast notification
3.4 Incident Dashboard
Purpose: Main operational interface for incident management

Layout:

Simulate Alert button in dashboard header
Alert banner at top (visible when critical incidents detected)
Left sidebar displays incident list
Center panel shows selected incident detail
Right or bottom panel provides tools and actions
3.4.1 Simulate Alert Button (Header)
Purpose: Quick access to test real-time alerting pipeline from dashboard

Functional Description:

Button visible in dashboard header
Clicking button displays same modal/form as Settings page version
User selects severity (CRITICAL or HIGH) and optionally enters service name
User clicks Confirm button
System generates incident ID and title
System inserts row into live_incidents table
System displays success toast
Alert banner and toast notification triggered by Realtime subscription
3.4.2 Alert Banner
Purpose: Display real-time critical incident alerts

Functional Description:

Banner appears at top of dashboard when new CRITICAL or HIGH severity incident detected
Displays incident ID, severity badge, and title
User can click banner to navigate to incident detail
User can dismiss banner
Banner remains visible until dismissed or incident status changes
Visual Requirements:

CRITICAL incidents: red background
HIGH incidents: orange background
Includes timestamp of incident detection
3.4.3 Toast Notifications
Purpose: Provide immediate notification of new critical incidents

Functional Description:

Toast notification appears when new CRITICAL or HIGH severity incident inserted into live_incidents table
Displays incident ID, severity, and title
Auto-dismisses after 10 seconds or user can dismiss manually
Clicking toast navigates to incident detail
Multiple toasts stack vertically if multiple incidents occur
3.4.4 Connection Mode Indicator
Functional Description:

Display current mode (Live/Demo) in dashboard header or footer
Live Mode: show green indicator with "Connected to Splunk"
Demo Mode: show blue indicator with "Demo Mode"
User can click indicator to navigate to Settings page
3.4.5 Left Sidebar - Incident List
Functional Description:

Displays list of all incidents with following information:
Incident ID (e.g., INC-1001)
Title
Service name
Severity badge (CRITICAL/HIGH/MEDIUM/LOW)
Status (OPEN/INVESTIGATING/RESOLVED)
Opened timestamp
Quick summary
User can click on any incident to view details in center panel
At least 3 demo incidents available:
INC-1001: checkout-service latency spike after deployment v1.8.3 (CRITICAL)
INC-1002: payment-api 5xx errors spike (HIGH)
INC-1003: auth-service slow login (MEDIUM)
3.4.6 Center Panel - Incident Detail
Functional Description:

Overview Card: Displays incident summary, severity badge, status badge, service name, selected time window
Analyze Incident CTA: Primary action button to trigger incident analysis
Evidence Area: Shows evidence sections after analysis (initially empty)
Action/Export Area: Provides follow-up prompts and export options after analysis
3.5 Incident Analysis Flow
Trigger: User clicks "Analyze Incident" button

Process:

Backend gathers evidence from demo data, Splunk REST API, or Splunk MCP Server (based on connection mode and configuration)
Backend assembles structured evidence bundle
Backend generates AI incident brief using Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL>
Backend generates top 3 suggested SPL queries relevant to the incident
Frontend renders analysis results
Frontend auto-populates NL→SPL tool with suggested queries
Analysis Results Display:

3.5.1 AI Brief Section
Summary: Concise incident summary
Ranked Hypotheses: List of potential root causes with:
Hypothesis title
Confidence score (0-1)
Supporting evidence bullets
Blast Radius: Shows affected services and endpoints
Recommended Actions: List of next steps
Open Questions: Unresolved investigation points
3.5.2 Evidence Sections
Top Error Patterns: Most frequent error messages or patterns
Recent Deployment/Change Events: Timeline of deployments or configuration changes
Affected Services/Endpoints: List of impacted services and API endpoints
Metadata Summary: Relevant service metadata
Timeline: Chronological sequence of relevant events with timestamps
3.5.3 Follow-up Investigation
Functional Description:

User can select from predefined follow-up prompts:
"What changed before the spike?"
"Show top failing endpoints"
"What services are affected?"
"Draft stakeholder update"
System processes follow-up question and displays additional analysis
Uses streaming response via <SKILL>large-language-model</SKILL>
3.6 Tools Panel
Purpose: Provides additional investigation and export capabilities

3.6.1 Web Search
User enters search query for incident context, known issues, or CVEs
Uses <SKILL>web-search</SKILL> to retrieve results
Displays search results in panel
3.6.2 AI Search
User enters query for web-grounded AI search on incident patterns
Uses <SKILL>ai-search</SKILL> for intelligent search
Displays AI-enhanced search results
3.6.3 OCR Upload
User uploads log screenshots or error images
Uses <SKILL>ocr-space</SKILL> to extract text from images
Displays extracted text for analysis
3.6.4 Web Reader
User enters runbook or documentation URL
Uses <SKILL>web-reader</SKILL> to fetch and analyze URL content
Displays fetched content for context
3.6.5 Data Analysis
User selects metrics to visualize (latency, error rate, etc.)
Uses <SKILL>data-analysis</SKILL> to generate charts and timelines
Displays visualization in panel
3.6.6 NL→SPL (Natural Language to SPL)
Purpose: Generate and execute SPL queries from natural language questions

Layout:

Suggested Queries Section (top)
Query Input Area (middle)
Query History Panel (bottom)
3.6.6.1 Suggested Queries Section
Purpose: Display auto-populated suggested SPL queries after incident analysis

Functional Description:

After incident analysis completes, system automatically generates top 3 most relevant SPL queries for the selected incident
Suggested queries displayed as clickable chips or buttons
Each chip shows query description (e.g., "Error spike query", "Deployment correlation query", "Endpoint latency query")
User clicks any chip to auto-populate query input and execute
Suggested queries remain visible until user selects different incident or manually clears
Example Suggested Queries:

"Show error rate spike for [service] in last 30 minutes"
"Find deployments before incident start time"
"List top failing endpoints for [service]"
3.6.6.2 Query Input Area
Functional Description:

User enters natural language question in text input (e.g., "Show me error rate for checkout-service in the last 30 minutes")
User clicks "Generate & Run SPL" button
System calls splunk-mcp Supabase Edge Function with the question
Edge function uses Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL> to generate valid SPL query from question
If SPLUNK_MCP_URL is configured:
Edge function sends generated SPL to Splunk MCP Server POST {base}/services/mcp endpoint
Uses MCP tool: splunk_run_search (Splunk MCP 1.2) with args { search, earliest_time, latest_time, max_count }
Edge function returns SPL query and execution results
If SPLUNK_MCP_URL is not configured:
Edge function returns generated SPL query with demo explanation
System displays generated SPL query in code block
System displays execution results or demo explanation
System saves query to query history database table
Display Requirements:

Show natural language question input field
Show "Generate & Run SPL" button
Show generated SPL query in formatted code block
Show execution results in table or text format
Show demo explanation if MCP not configured
Integration:

Uses splunk-mcp Supabase Edge Function
Uses <SKILL>large-language-model</SKILL> for SPL generation
3.6.6.3 Query History Panel
Purpose: Persist and display previously generated SPL queries for reuse

Functional Description:

System stores each generated SPL query to spl_query_history database table with following fields:
user_id (current authenticated user)
query_text (natural language question)
generated_spl (SPL query)
timestamp (query execution time)
service_context (optional, service name if available)
incident_id (optional, if query generated from incident analysis)
Query history panel displays list of previous queries in reverse chronological order (newest first)
Each history item shows:
Query text
Generated SPL (truncated or collapsed)
Timestamp
Service context (if available)
User clicks any history item to replay/re-run the query
Clicking history item auto-populates query input area and executes query
User can click "Clear History" button to delete all query history for current user
Query history is per-user (isolated by user_id)
Display Requirements:

Show query history list with scrollable area
Show "Clear History" button at top or bottom of panel
Show empty state message when no history exists
Highlight clicked history item
Database Schema:

Table: spl_query_history
Columns: id, user_id, query_text, generated_spl, timestamp, service_context, incident_id
3.6.7 Export Options
Purpose: Export incident analysis for stakeholder communication

Export Formats:

Markdown Report: Complete incident report in Markdown format
Slack-style Update: Formatted text suitable for Slack channels
Jira-style Summary: Formatted text suitable for Jira tickets
PowerPoint Briefing: Executive presentation with incident analysis
Functional Description:

User clicks export button and selects format
System generates formatted content
User can copy to clipboard or download as file
3.6.7.1 PowerPoint Briefing Export
Purpose: Generate executive briefing presentation from incident analysis

Functional Description:

User clicks "Generate Briefing PPT" button in Tools Panel
System calls ppt-export Supabase Edge Function
Edge function uses <SKILL>ppt-generator</SKILL> to create PowerPoint file
Generated .pptx file contains following slides:
Cover Slide: Incident ID, title, severity, timestamp
Incident Summary: Overview, affected services, time window
Root Cause Hypotheses: Ranked hypotheses with confidence bars (visual representation of confidence scores)
Blast Radius: Affected services, endpoints, dependencies
Event Timeline: Chronological sequence of key events
Recommended Actions: Next steps and action items
System returns binary .pptx file
Browser downloads file automatically
Integration:

Uses <SKILL>ppt-generator</SKILL> for PowerPoint generation
3.7 Command Center Page [NEW v42]
Route: /command
Purpose: Voice and natural language AI operations hub for real-time incident command

Functional Description:

User navigates to /command from Dashboard header or direct URL
Page displays AI chat interface powered by Gemini 2.5 Flash via large-language-model edge function
User types or speaks natural language commands relating to incidents, services, or operations
AI responds with streaming text, analysis, and actionable suggestions
AI ends responses with JSON action blocks which render as colour-coded action cards

3.7.1 Voice Input with Language Selector [NEW v42]
Language selector (Volume2 icon → dropdown) lists 10 supported speech recognition languages:
en-US (English US), en-GB (English UK), en-IN (English India), es-ES (Spanish),
fr-FR (French), de-DE (German), ja-JP (Japanese), zh-CN (Mandarin), pt-BR (Portuguese Brazil), ko-KR (Korean)
Microphone button activates browser Web Speech API SpeechRecognition with recognition.lang = selected language
Active recognition shown with pulsing red MicOff button and "Listening (language)…" placeholder
Transcript auto-submitted as message when recognition ends

3.7.2 Action Types [NEW v42 adds scale + notify]
resolve  — Mark incident resolved (emerald / CheckCircle2)
status   — Check service status (blue / Activity)
query    — Run NL query (primary / Terminal)
escalate — Escalate incident (red / AlertTriangle)
scale    — Scale a service horizontally (orange / TrendingUp) [NEW v42]
notify   — Send team notification draft (violet / Bell) [NEW v42]
Each action type has distinct colour scheme, icon, and AI prompt template
Unknown types render with neutral fallback style (no crash)

3.7.3 Action Execution History Panel [NEW v42]
Toggle button in header (History icon) with entry-count badge
Slide-in panel (272px) from right side, does not push/compress chat
Each entry shows: type badge with icon, action label, service/target metadata, execution timestamp
Entries listed newest-first
Clear-all button with Trash2 icon
Empty state: History icon + instructional copy
Auto-opens on first action execution in session

3.8 Analytics Page [NEW v13]
Route: /analytics
Purpose: Enterprise operational health monitoring with KPI cards and 11+ charts

Functional Description:

KPI Summary Row: Total Incidents, Open, Critical, Avg MTTR, Splunk Alerts, SPL Queries
14-Day Incident Trend: Stacked bar chart by severity
Severity Distribution: Donut chart
Incidents by Service: Horizontal bar chart
Incident Status Overview: Pie chart
MTTR by Service: Horizontal bar chart
30-Day MTTR Trend: Rolling line chart (newest addition) [NEW v35]
SPL Query Activity: Area chart
Splunk Alert Severity: Donut chart
Operational Readiness Radar: Radar chart across 6 dimensions
Cumulative Velocity: Line chart of incidents over time
All charts hydrate from live Supabase data with intelligent demo fallback
PDF Export: Print-preview modal with per-section checkboxes

4. Business Rules and Logic
4.1 Splunk Integration Abstraction
Purpose: Provide unified interface for Splunk data retrieval supporting multiple modes

Supported Modes:

Demo/mock mode (default, works without Splunk credentials)
Live Splunk REST API mode (when SPLUNK_HOST and SPLUNK_TOKEN configured)
Splunk MCP Server mode (when SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN configured)
Configuration Logic:

When SPLUNK_HOST and SPLUNK_TOKEN environment variables are set, system uses Live Mode
When SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN are set, system can use MCP Server mode
When environment variables are not set, system falls back to Demo Mode
incident-analyze edge function checks configuration at runtime
Connection mode is displayed clearly in UI
Interface Methods:

run_splunk_query(query, time_window): Execute Splunk query and return results
get_metadata(entity_type): Retrieve metadata for services, hosts, or other entities
generate_spl(question): Generate SPL query from natural language question
explain_spl(query): Explain what a SPL query does
get_saved_searches(): Optional method to retrieve saved Splunk searches
run_mcp_search(spl_query): Execute SPL query via Splunk MCP Server 1.2 (tool: splunk_run_search)
Demo Mode Behavior:

When Splunk credentials not available, system uses bundled sample data
Sample data includes: incidents.json, alerts.json, app_logs.json, deploy_events.json, metadata.json
Mock analysis returns deterministic, realistic incident outputs
All primary flows remain functional without live Splunk connection
Live Mode Behavior:

System connects to Splunk REST API using configured SPLUNK_HOST and SPLUNK_TOKEN
Queries execute against live Splunk data
Connection failures trigger fallback to Demo Mode with user notification
MCP Server Mode Behavior (Splunk MCP 1.2):

When SPLUNK_MCP_URL is configured, incident-analyze edge function uses Splunk MCP Server
System sends SPL queries to POST {base}/services/mcp with JSON-RPC 2.0 method tools/call
Tool name: splunk_run_search; args: { search, earliest_time, latest_time, max_count }
Ngrok-exposed Splunk: ngrok-skip-browser-warning header added automatically
If MCP Server fails, system falls back to Live Mode or Demo Mode
4.2 Analysis Orchestration Logic
Evidence Gathering:

Retrieve incident details (service, time window, severity)
Query logs for error patterns within time window
Query deployment events within time window
Retrieve service metadata and dependencies
Assemble evidence bundle
If SPLUNK_MCP_URL configured, use MCP Server to execute queries; otherwise use REST API or demo data
AI Brief Generation:

Send evidence bundle to Gemini 2.5 Flash LLM
Request structured output with summary, hypotheses, blast radius, actions, questions
Parse LLM response into structured format
Generate top 3 suggested SPL queries based on incident context
Return analysis results and suggested queries to frontend
Hypothesis Ranking Logic:

Hypotheses ranked by confidence score (0-1)
Confidence based on evidence strength and temporal correlation
Each hypothesis includes supporting evidence bullets
Suggested SPL Query Generation Logic:

After incident analysis completes, system generates top 3 most relevant SPL queries
Query generation based on:
Incident service name
Incident time window
Identified error patterns
Deployment events
Affected endpoints
Example queries:
Error spike query: "Show error rate for [service] in last [time_window]"
Deployment correlation query: "Find deployments for [service] before [incident_start_time]"
Endpoint latency query: "List top failing endpoints for [service] in last [time_window]"
Queries formatted as natural language questions suitable for NL→SPL tool
Queries automatically populate NL→SPL Suggested Queries Section
4.3 Timeline Correlation Logic
Purpose: Correlate events to identify causal relationships

Process:

Collect all events within incident time window (deployments, config changes, alerts)
Sort events chronologically
Identify events occurring shortly before incident start (within 5-15 minutes)
Highlight temporal correlations in timeline display
4.4 Blast Radius Calculation
Purpose: Determine scope of incident impact

Calculation:

Identify directly affected service from incident metadata
Query service dependency graph to find downstream services
Identify affected endpoints from error logs
Aggregate into blast radius summary
4.5 Real-time Critical Incident Alerting Logic
Purpose: Notify users immediately when critical incidents occur

Implementation:

System uses Supabase Realtime postgres_changes subscription on live_incidents table
When new row inserted with severity CRITICAL or HIGH, trigger alert
Frontend receives real-time event via Supabase Realtime
System displays toast notification with incident details
System shows alert banner at top of dashboard
Alert remains until user dismisses or incident status changes
Fallback for Demo Mode:

When live_incidents table not available, system can simulate alerts by polling demo data
Polling interval: every 30 seconds
Simulated alerts use demo incident data
4.6 Simulate Alert Logic
Purpose: Test real-time alerting pipeline end-to-end

Process:

User clicks Simulate Alert button (Settings page or Dashboard header)
User selects severity (CRITICAL or HIGH) and optionally enters service name
System generates incident ID using sequential numbering (e.g., INC-2001, INC-2002)
System generates realistic incident title based on service and severity:
CRITICAL: "[Service] critical failure detected"
HIGH: "[Service] high error rate spike"
System inserts row into live_incidents table with:
incident_id: generated ID
title: generated title
severity: selected severity
service: entered service name or "test-service"
status: "OPEN"
opened_at: current timestamp
System displays success toast: "Test incident [ID] inserted successfully"
Supabase Realtime subscription detects new row insertion
Frontend triggers alert banner and toast notification
User can verify alert pipeline works end-to-end
4.7 Scheduled Synthetic Alert Job Logic
Purpose: Continuously test real-time alert pipeline with automated synthetic incidents

Implementation:

System uses Supabase Edge Function with pg_cron scheduled job
Job runs every hour (cron expression: 0 * * * *)
Edge function name: synthetic-alert-job
Job Process:

Job triggers at top of every hour
System generates synthetic incident with following logic:
Rotate through service names: checkout-service, payment-api, auth-service, inventory-service, notification-service
Rotate through severity levels: CRITICAL, HIGH
Generate sequential incident ID (e.g., INC-3001, INC-3002)
Generate realistic incident title based on service and severity
System inserts row into live_incidents table with:
incident_id: generated ID
title: generated title (e.g., "[Service] synthetic alert test")
severity: rotated severity
service: rotated service name
status: "OPEN"
opened_at: current timestamp
is_synthetic: true (flag to distinguish from real incidents)
Supabase Realtime subscription detects insertion and triggers alert banner and toast notification
Job logs execution result to system logs
Rotation Logic:

Service rotation: Use modulo operation based on hour of day (hour % 5)
Severity rotation: Alternate between CRITICAL and HIGH (hour % 2)
Database Schema Addition:

Add is_synthetic column to live_incidents table (boolean, default false)
Allows filtering synthetic alerts from real incidents in UI
4.8 Natural Language SPL Generation Logic
Purpose: Convert natural language questions to SPL queries and execute via MCP Server

Process:

User enters natural language question in NL→SPL tab
User clicks "Generate & Run SPL" button
Frontend calls splunk-mcp Supabase Edge Function with question
Edge function sends question to Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL>
LLM generates valid SPL query from question
If SPLUNK_MCP_URL configured:
Edge function sends SPL to Splunk MCP Server POST {base}/services/mcp (Splunk MCP 1.2 Streamable HTTP)
Tool: splunk_run_search with args { search: generated_spl, earliest_time: "-1h", latest_time: "now", max_count: 50 }
Ngrok URLs receive ngrok-skip-browser-warning: true header automatically
MCP Server executes query and returns results in MCP content format
Edge function returns {spl: generated_spl, results: mcp_results}
If SPLUNK_MCP_URL not configured:
Edge function returns {spl: generated_spl, explanation: "Demo mode: MCP not configured"}
Frontend displays generated SPL and results or explanation
System saves query to spl_query_history table
SPL Generation Guidelines:

LLM generates SPL based on common Splunk query patterns
Includes time range, search terms, aggregations, and formatting
Example: "Show me error rate for checkout-service in the last 30 minutes" → index=main service=checkout-service earliest=-30m | stats count by status | where status>=400
4.9 SPL Query History Persistence Logic
Purpose: Store and retrieve user's SPL query history for reuse

Storage Process:

After SPL query generation and execution, system saves query to spl_query_history table
Stored fields:
user_id: current authenticated user ID
query_text: natural language question entered by user
generated_spl: SPL query generated by LLM
timestamp: query execution timestamp
service_context: service name if available from incident context
incident_id: incident ID if query generated from incident analysis
System enforces per-user isolation (queries only visible to owner)
Retrieval Process:

When user opens NL→SPL tool, system queries spl_query_history table filtered by user_id
System retrieves queries in reverse chronological order (newest first)
System displays query history in Query History Panel
Replay Process:

User clicks any history item
System auto-populates query input area with query_text from history item
System automatically triggers "Generate & Run SPL" action
System displays generated SPL and execution results
Clear History Process:

User clicks "Clear History" button
System displays confirmation dialog
User confirms deletion
System deletes all rows from spl_query_history table where user_id matches current user
System refreshes Query History Panel to show empty state
4.10 Export Content Generation
Markdown Report:

Includes incident ID, title, severity, status, time window
Includes AI brief summary
Includes all hypotheses with evidence
Includes blast radius and timeline
Includes recommended actions
Slack-style Update:

Concise format with severity emoji equivalent (text-based)
Key findings and recommended actions
Link to full analysis
Jira-style Summary:

Structured format with sections: Summary, Impact, Root Cause Analysis, Next Steps
Suitable for pasting into Jira ticket description
PowerPoint Briefing:

Generated using ppt-generator skill
Contains 6 slides covering incident overview, analysis, and recommendations
Confidence scores visualized as horizontal bars
Timeline presented chronologically with timestamps
Formatted for executive stakeholder presentation
5. Exception and Boundary Conditions
Scenario    Handling
Splunk integration fails    Fall back to demo mode gracefully, display notice to user
Invalid Splunk credentials    Display error message in settings, prevent saving invalid configuration
Splunk connection timeout    Display timeout error, suggest checking SPLUNK_HOST and network connectivity
Invalid MCP credentials    Display error message in settings, prevent saving invalid MCP configuration
MCP Server connection timeout    Display timeout error, suggest checking SPLUNK_MCP_URL and network connectivity
MCP Server returns error    Display error message, fall back to REST API or demo mode
No evidence found for incident    Display message indicating insufficient data, suggest expanding time window
AI brief generation fails    Display error message, allow retry, fall back to raw evidence display
Follow-up question timeout    Display timeout message, allow retry
Export generation fails    Display error message, allow retry
PowerPoint generation fails    Display error message indicating PPT export failure, allow retry
OCR upload fails    Display error message indicating image processing failure
Web search returns no results    Display "No results found" message
Invalid time window selected    Display validation error, suggest valid time range
User not authenticated    Redirect to login page
Sample data files missing    Display error message indicating demo mode unavailable
live_incidents table not exists    Fall back to polling demo data for alert simulation
Realtime subscription fails    Display warning, fall back to manual refresh or polling
Multiple critical incidents at once    Stack toast notifications, show count in alert banner
PPT file download blocked by browser    Display message instructing user to allow downloads
SPLUNK_HOST or SPLUNK_TOKEN empty    Automatically use Demo Mode, display indicator in UI
Simulate Alert button clicked without selecting severity    Display validation error requiring severity selection
Simulate Alert insert fails    Display error toast with failure reason
NL→SPL query generation fails    Display error message, allow retry
Generated SPL is invalid    Display warning, show generated SPL for user review
MCP Server /services/mcp endpoint fails    Display error message, return generated SPL without execution results
Natural language question is ambiguous    LLM generates best-effort SPL, user can refine question
Scheduled synthetic alert job fails    Log error to system logs, retry on next scheduled run
pg_cron job not configured    Display warning in settings, synthetic alerts will not run
spl_query_history table not exists    Display error message, query history feature unavailable
Query history retrieval fails    Display error message, show empty state
Clear history operation fails    Display error toast, allow retry
Suggested queries generation fails    Display warning, NL→SPL tool remains functional without suggestions
User clicks suggested query chip but generation fails    Display error message, allow manual retry
Query history exceeds display limit    Implement pagination or limit display to most recent 50 queries
6. Acceptance Criteria
User logs in with username and password
User navigates to Settings page and configures SPLUNK_HOST and SPLUNK_TOKEN
System validates connection and displays "Connected to Splunk" indicator
User configures SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN in Settings page
System validates MCP connection and displays "MCP Connected" indicator
User clicks Simulate Alert button in Settings page
User selects CRITICAL severity and enters "checkout-service" as service name
System inserts test incident into live_incidents table and displays success toast
Alert banner appears at top of dashboard showing test incident
Toast notification appears showing test incident details
User returns to Incident Dashboard and sees Live Mode indicator
User views incident list and selects INC-1001 (checkout-service latency spike)
User clicks "Analyze Incident" button
System displays AI brief with summary, ranked hypotheses, blast radius, timeline, and recommended actions (using MCP Server if configured)
System auto-populates NL→SPL tool with top 3 suggested queries (e.g., "Show error rate spike", "Find deployments before incident", "List top failing endpoints")
User clicks first suggested query chip in NL→SPL tool
System auto-populates query input and executes query, displays generated SPL and results
User navigates to Query History Panel in NL→SPL tool
System displays list of previously generated queries with timestamps
User clicks a query from history
System replays query and displays results
User clicks "Clear History" button and confirms deletion
System clears all query history for current user
User waits for scheduled synthetic alert job to run (next hour)
System automatically inserts synthetic incident into live_incidents table
Alert banner and toast notification appear for synthetic incident
User clicks "Generate Briefing PPT" button in Tools Panel
System generates PowerPoint file with 6 slides and downloads it to user's device
7. Good to have for This Release
7.1 Good to have features
Full enterprise authentication (SSO, SAML, LDAP integration)
Real production write-back integrations to Splunk
Full Splunk app packaging and App Inspect compliance
Multi-tenant architecture with tenant isolation
Advanced RBAC (role-based access control) beyond basic authentication
Live streaming analytics beyond sample/demo needs
Integration with incident management platforms (PagerDuty, Opsgenie)
Custom dashboard creation and saved views
Historical incident trend analysis and pattern detection
Automated remediation actions or runbook execution
Mobile application or responsive mobile optimization
Collaborative investigation features (comments, annotations, shared workspaces)
Advanced filtering and search within incident list
Customizable severity levels and status workflows
Integration with CI/CD pipelines for deployment tracking
Performance metrics and SLA tracking
Audit logging and compliance reporting
Custom AI model training or fine-tuning
Multi-language support beyond English
Dark/light theme toggle (dark mode only)
Keyboard shortcuts and accessibility features
Browser compatibility testing beyond Chrome/Firefox
Load testing and performance optimization for large-scale deployments
Customizable PowerPoint templates for different stakeholder audiences
Scheduled incident report generation and email delivery
Alert notification channels beyond toast (email, SMS, webhook)
Alert filtering and routing rules based on severity or service
Incident correlation across multiple services
Automatic incident deduplication
Custom alert sound or visual effects
Alert history and audit trail
Batch simulate alert generation for load testing
SPL query validation and syntax highlighting
Advanced SPL query builder UI
MCP Server health monitoring and diagnostics
Support for additional MCP tools beyond search
Natural language query suggestions and autocomplete
Query result export in multiple formats (CSV, JSON, Excel)
Query result visualization and charting
Configurable synthetic alert job schedule (beyond hourly)
Synthetic alert job monitoring dashboard
Query history search and filtering
Query history export functionality
Suggested queries customization and user preferences
Suggested queries ranking based on user feedback