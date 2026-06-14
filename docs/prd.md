# Requirements Document

## 1. Application Overview

### 1.1 Application Name

SentinelOps — Agentic Incident Commander for Splunk

### 1.2 Application Description

SentinelOps is an AI-powered agentic incident commander web application designed for the Splunk Agentic Ops Hackathon (Observability track). It helps on-call engineers investigate incidents faster by pulling incident evidence from Splunk or demo data, correlating logs and deployment events, generating AI-assisted incident briefs via Gemini 2.5 Flash LLM, showing blast radius and timeline, recommending next actions, and exporting stakeholder-ready updates.

### 1.3 Hackathon Context

- **Target Track**: Observability
- **Bonus Prize Targets**: Best Use of Splunk MCP Server, Best Use of Splunk Hosted Models, Best Use of Splunk Developer Tools
- **Judging Criteria**: Technological Implementation, Design, Potential Impact, Quality of the Idea (equally weighted)

### 1.4 Core Value Proposition

Turns noisy Splunk signals into a guided incident response brief with evidence, ranked hypotheses, and next actions. Reduces mean time to understand and mean time to respond for engineering and operations teams.

## 2. Users and Use Scenarios

### 2.1 Target Users

- SREs (Site Reliability Engineers)
- DevOps engineers
- NOC analysts
- Security analysts investigating service-impact events
- Engineering managers or incident commanders

### 2.2 Core Use Scenarios

- **Scenario 1**: A deployment to checkout-service happens at 10:37. At 10:42, latency spikes and 5xx errors rise. User opens SentinelOps, selects the incident, clicks Analyze Incident, and receives a response brief correlating the deploy window, log patterns, impacted endpoints, and service relationships with recommended actions.
- **Scenario 2**: User needs to understand what changed before an incident spike, uses follow-up prompts to investigate top failing endpoints and affected services.
- **Scenario 3**: User exports incident analysis as Markdown report or Slack-style update to share with stakeholders.
- **Scenario 4**: User configures Splunk connection in settings to connect to live Splunk instance instead of demo mode.
- **Scenario 5**: User generates PowerPoint briefing from incident analysis and downloads it for stakeholder presentation.
- **Scenario 6**: A new CRITICAL incident is detected, user receives real-time toast notification and sees alert banner on dashboard.
- **Scenario 7**: User clicks Simulate Alert button to test real-time alerting pipeline by inserting a test incident into live_incidents table.
- **Scenario 8**: User enters natural language question in NL→SPL tab, system generates SPL query and executes it via Splunk MCP Server.
- **Scenario 9**: Scheduled synthetic alert job automatically inserts test incidents every hour to continuously validate alert pipeline.
- **Scenario 10**: User views SPL query history in NL→SPL tool, clicks a previous query to re-run it.
- **Scenario 11**: After incident analysis completes, user sees top 3 suggested SPL queries pre-populated in NL→SPL tool and clicks one to execute.
- **Scenario 12**: User toggles synthetic incident filter to hide test incidents from incident list, sees only real incidents.
- **Scenario 13**: User searches SPL query history by keyword to find previous queries related to specific service.
- **Scenario 14**: User clicks Share button after generating SPL query, copies deep-link URL to share with team member.
- **Scenario 15**: User filters incident list by severity and status to focus on open critical incidents.
- **Scenario 16**: User clicks notification bell icon to review full alert history after dismissing toast notifications.
- **Scenario 17**: User sees deduplication indicator on incident card when multiple incidents affect same service.
- **Scenario 18**: User exports SPL query results as CSV file for offline analysis.
- **Scenario 19**: User enables PagerDuty Auto-Sync toggle in Settings, configures sync interval to 120 seconds, and sees live timestamp showing last sync time updating automatically.
- **Scenario 20**: User opens Saved Queries panel, sees Templates category with built-in SPL query templates, clicks Error Rate Analysis template, and system loads parameterized query with current incident service and time window.
- **Scenario 21**: User opens Alert Rules editor in Settings, drags a rule card to reorder priority, sees priority badges update live, and saves new rule order.
- **Scenario 22**: User clicks Mark as Resolved button on incident card, system updates incident status to RESOLVED and stamps resolved_at timestamp.
- **Scenario 23**: User opens Analytics page, views 30-day rolling MTTR trend line chart showing daily average resolution time.
- **Scenario 24**: User clicks Export PDF button on Analytics page, modal opens with checkboxes for each KPI card and chart section, user selects desired sections and clicks Export PDF to trigger print preview.
- **Scenario 25**: User switches to light mode, all severity chips, status badges, banners, chart labels, and tooltips display with proper contrast.
- **Scenario 26**: User configures 7-day rolling MTTR threshold to 60 minutes in Settings, enables threshold alert, and sees warning banner on Dashboard when rolling average MTTR exceeds 60 minutes.
- **Scenario 27**: User enables Auto-Resolve Rule in Settings with 4-hour timeout, system automatically marks stale incidents as RESOLVED after 4 hours of inactivity.
- **Scenario 28**: User activates bulk-select mode on incident list, selects multiple OPEN incidents, clicks Resolve Selected button, and system batch-updates all selected incidents to RESOLVED.
- **Scenario 29**: User navigates to Incident History page, filters by RESOLVED status and date range, and views all resolved incidents with MTTR values.
- **Scenario 30**: User configures max-token budget to 4000 tokens in Settings, triggers incident analysis, and system stops streaming when token limit is reached, displaying partial result.
- **Scenario 31**: User clicks Export Analysis button on incident detail panel, selects PDF format, and downloads complete analysis report with incident metadata and all sections.
- **Scenario 32**: User opens Past Analyses panel, selects two historical analyses for same incident, clicks Compare button, and views side-by-side diff with highlighted changes.

### 2.3 Jobs to be Done

- Understand what changed before impact
- See the most relevant evidence in one place
- Get a useful root-cause starting point
- Assess scope and urgency
- Share status clearly with stakeholders
- Configure live Splunk connection for real data
- Generate executive briefing presentations
- Receive immediate alerts for critical incidents
- Test real-time alerting pipeline with simulated incidents
- Query Splunk data using natural language via MCP Server
- Continuously validate alert pipeline with automated synthetic incidents
- Review and reuse previously generated SPL queries
- Quickly run relevant SPL queries suggested by incident analysis
- Filter out synthetic test incidents from real incidents
- Search query history efficiently
- Share SPL queries with team members
- Filter incidents by severity and status
- Review full alert notification history
- Identify duplicate incidents
- Export query results for offline analysis
- Automatically sync PagerDuty incidents on configurable interval
- Use built-in SPL query templates for common analysis tasks
- Prioritize alert routing rules by drag-to-reorder
- Mark incidents as resolved with timestamp
- Track MTTR trends over 30-day rolling window
- Export analytics reports with selected sections
- View application in light mode with proper contrast
- Monitor 7-day rolling MTTR against configured threshold
- Automatically close stale incidents after timeout
- Bulk-resolve multiple incidents at once
- View complete incident history including resolved incidents
- Control AI analysis output length with configurable token budget
- Export incident analysis as PDF or Markdown for offline review
- Compare historical analyses to track investigation evolution

## 3. Page Structure and Functional Description

### 3.1 Page Structure

```
SentinelOps Application
├── Login Page
├── Settings Page
│   ├── Splunk Connection Configuration
│   ├── Splunk MCP Server Configuration
│   ├── PagerDuty Configuration
│   │   ├── PagerDuty API Token Input
│   │   ├── Auto-Sync Toggle
│   │   ├── Sync Interval Input
│   │   └── Last Synced Timestamp Display
│   ├── Alert Rules Editor
│   │   ├── Rule Cards with Drag Handles
│   │   └── Priority Badges
│   ├── MTTR Threshold Alert Configuration
│   │   ├── Enable/Disable Toggle
│   │   └── Threshold Value Input (minutes)
│   ├── Auto-Resolve Rule Configuration
│   │   ├── Enable/Disable Toggle
│   │   └── Timeout Duration Input (hours)
│   ├── AI Analysis Configuration
│   │   └── Max Token Budget Slider
│   └── Simulate Alert Button
├── Incident Dashboard
│   ├── Header
│   │   ├── Simulate Alert Button
│   │   ├── Notification Center Bell Icon
│   │   └── History Page Link
│   ├── MTTR Threshold Warning Banner (conditional)
│   ├── Alert Banner (for critical incidents)
│   ├── Left Sidebar (Incident List)
│   │   ├── Bulk-Select Mode Toggle
│   │   ├── Select All / Deselect All Actions
│   │   ├── Resolve Selected Button
│   │   ├── Synthetic Incident Filter Toggle
│   │   ├── Advanced Filters (Severity, Status, Keyword)
│   │   └── Incident Cards (with checkboxes in bulk-select mode, deduplication indicator, Mark as Resolved button)
│   ├── Center Panel (Incident Detail)
│   └── Right/Bottom Panel (Tools & Actions)
├── Incident Detail View
│   ├── Overview Card
│   ├── Evidence Sections
│   ├── Analysis Results
│   ├── Export Analysis Button
│   └── Past Analyses Panel
│       └── Compare Analyses Button
├── Analysis Comparison View
│   ├── Side-by-Side Diff Display
│   └── Change Highlights
├── Incident History Page
│   ├── Page Header
│   ├── Filter Controls (Status, Severity, Service, Date Range)
│   └── Incident History Table (ID, Title, Service, Severity, Status, Opened At, Resolved At, MTTR)
├── Analytics Page
│   ├── MTTR Threshold Warning Banner (conditional)
│   ├── KPI Cards
│   ├── 30-day Rolling MTTR Trend Chart
│   ├── Other Charts
│   └── Export PDF Button (opens print-preview modal)
├── Print-Preview Modal
│   ├── Section Checkboxes (KPI cards, charts)
│   └── Export PDF Button
├── Notification Center Panel
│   └── Alert History List
└── Tools Panel
    ├── Web Search
    ├── AI Search
    ├── OCR Upload
    ├── Web Reader
    ├── Data Analysis
    ├── NL→SPL (Natural Language to SPL)
    │   ├── Suggested Queries Section
    │   ├── Query Input Area
    │   ├── Query Results Area (with Export CSV button)
    │   ├── Share Button
    │   └── Query History Panel (with search box)
    ├── Saved Queries Panel
    │   ├── Templates Category (read-only)
    │   └── User Saved Queries Category
    └── Export Options
        ├── Markdown Report
        ├── Slack-style Update
        ├── Jira-style Summary
        └── PowerPoint Briefing
```

### 3.2 Login Page

**Purpose**: User authentication and registration

**Functional Description**:

- User enters username and password to log in
- User can register new account with username and password
- Authentication uses Supabase Auth with @sentinelops.app email simulation
- After successful login, user is redirected to Incident Dashboard

**Integration**:

- Uses <SKILL>login</SKILL> for authentication

### 3.3 Settings Page

**Purpose**: Configure Splunk connection, MCP server, PagerDuty integration, alert rules, MTTR threshold alert, auto-resolve rule, AI analysis settings, and application settings

#### 3.3.1 Splunk Connection Configuration

**Functional Description**:

- User enters SPLUNK_HOST (Splunk instance URL)
- User enters SPLUNK_TOKEN (authentication token)
- User clicks Save Configuration button to store credentials
- System validates connection by testing connectivity
- System displays connection status (Connected/Disconnected)
- User can toggle between Live Mode and Demo Mode
- Configuration is stored in backend environment variables or user settings

**Display Requirements**:

- Show current connection mode (Live/Demo) clearly in settings UI
- Display last successful connection timestamp when in Live Mode
- Show validation errors if connection fails
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.2 Splunk MCP Server Configuration

**Purpose**: Configure Splunk MCP Server connection for natural language SPL generation and execution

**Functional Description**:

- User enters SPLUNK_MCP_URL (Splunk MCP Server endpoint URL)
- User enters SPLUNK_MCP_TOKEN (MCP Server authentication token)
- User clicks Save MCP Configuration button to store credentials
- System validates MCP connection by testing connectivity
- System displays MCP connection status (Connected/Disconnected)
- Configuration is stored in backend environment variables or user settings

**Display Requirements**:

- Show MCP connection status clearly in settings UI
- Display last successful MCP connection timestamp when connected
- Show validation errors if MCP connection fails
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.3 PagerDuty Configuration

**Purpose**: Configure PagerDuty integration with auto-sync capability

##### 3.3.3.1 PagerDuty API Token Input

**Functional Description**:

- User enters PAGERDUTY_API_TOKEN (PagerDuty API authentication token)
- User clicks Save PagerDuty Configuration button to store credentials
- System validates token by testing PagerDuty API connectivity
- System displays PagerDuty connection status (Connected/Disconnected)
- Configuration is stored in backend environment variables or user settings

**Display Requirements**:

- Show PagerDuty connection status clearly in settings UI
- Display last successful connection timestamp when connected
- Show validation errors if connection fails
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.3.2 Auto-Sync Toggle

**Purpose**: Enable automatic background synchronization of PagerDuty incidents

**Functional Description**:

- Toggle button labeled \"Auto-Sync PagerDuty Incidents\"
- Default state: OFF
- When toggle is ON:
  + System starts background sync job that runs on configured interval
  + System pulls PagerDuty incidents via PagerDuty API
  + System inserts or updates incidents in live_incidents table
  + Sync runs continuously without user interaction
- When toggle is OFF:
  + System stops background sync job
  + User must manually trigger sync via Sync Now button
- Toggle state persists in app configuration

**Display Requirements**:

- Toggle button with clear ON/OFF visual state
- Disabled state when PagerDuty API token not configured
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.3.3 Sync Interval Input

**Purpose**: Configure auto-sync interval in seconds

**Functional Description**:

- Number input field labeled \"Sync Interval (seconds)\"
- Default value: 60 seconds
- Minimum value: 30 seconds
- Maximum value: 3600 seconds (1 hour)
- User enters desired interval value
- User clicks Save Configuration button to persist interval
- Interval value stored in app configuration
- When auto-sync is enabled, system uses configured interval for background sync job

**Display Requirements**:

- Number input with validation for min/max range
- Helper text showing valid range (30-3600 seconds)
- Disabled state when auto-sync toggle is OFF
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.3.4 Last Synced Timestamp Display

**Purpose**: Show live timestamp of last successful PagerDuty sync

**Functional Description**:

- Display area showing \"Last synced X seconds ago\" or \"Last synced at [timestamp]\"
- Timestamp updates in real-time as sync job runs
- When auto-sync is enabled:
  + Display updates every second to show elapsed time since last sync
  + Format: \"Last synced 15 seconds ago\"
- When auto-sync is disabled:
  + Display shows last manual sync timestamp
  + Format: \"Last synced at 2026-05-24 10:30:45\"
- If no sync has occurred:
  + Display shows \"Never synced\"

**Display Requirements**:

- Live updating timestamp with relative time format
- Clear visual indication when sync is in progress (loading spinner)
- Display last sync status (success/failure)
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.4 Alert Rules Editor

**Purpose**: Configure and prioritize alert routing rules with drag-to-reorder functionality

##### 3.3.4.1 Rule Cards with Drag Handles

**Functional Description**:

- Display list of alert routing rules as draggable cards
- Each rule card shows:
  + Priority badge (#1, #2, #3, etc.)
  + Rule name
  + Rule conditions (severity, service, keywords)
  + Rule actions (notification channels, assignees)
  + Drag handle icon (vertical dots or hamburger icon)
- User clicks and holds drag handle to drag rule card
- User drags rule card up or down to reorder
- System provides visual feedback during drag (card elevation, drop zone indicators)
- When user drops rule card:
  + System updates rule order in UI immediately
  + Priority badges update live to reflect new order
  + System marks configuration as unsaved
- User clicks Save Rules button to persist new order
- System saves rule order to backend configuration

**Display Requirements**:

- Drag handle icon visible on left side of each rule card
- Visual feedback during drag (card shadow, drop zone highlight)
- Smooth animation when cards reorder
- Disabled drag state when rules are being saved
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.4.2 Priority Badges

**Purpose**: Show visual priority ranking of alert routing rules

**Functional Description**:

- Each rule card displays priority badge showing rule position
- Badge format: #1, #2, #3, etc.
- Badge positioned at top-left corner of rule card
- Badge updates live as rules are reordered via drag-and-drop
- Badge color-coded by priority:
  + #1: Red (highest priority)
  + #2-3: Orange (high priority)
  + #4+: Blue (normal priority)
- Rules are evaluated in order from #1 to last when processing alerts

**Display Requirements**:

- Badge with clear numeric priority indicator
- Color-coded badge background with WCAG AA contrast in light mode
- Badge updates immediately during drag-and-drop

#### 3.3.5 MTTR Threshold Alert Configuration

**Purpose**: Configure 7-day rolling MTTR threshold alert

##### 3.3.5.1 Enable/Disable Toggle

**Functional Description**:

- Toggle button labeled \"Enable MTTR Threshold Alert\"
- Default state: OFF
- When toggle is ON:
  + System monitors 7-day rolling average MTTR
  + When rolling average exceeds configured threshold, system displays warning banner on Dashboard and Analytics pages
- When toggle is OFF:
  + System does not monitor MTTR threshold
  + Warning banner does not appear
- Toggle state persists in app configuration

**Display Requirements**:

- Toggle button with clear ON/OFF visual state
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.5.2 Threshold Value Input (minutes)

**Functional Description**:

- Number input field labeled \"MTTR Threshold (minutes)\"
- Default value: 60 minutes
- Minimum value: 1 minute
- Maximum value: 1440 minutes (24 hours)
- User enters desired threshold value
- User clicks Save Configuration button to persist threshold
- Threshold value stored in app configuration
- System uses threshold to compare against 7-day rolling average MTTR

**Display Requirements**:

- Number input with validation for min/max range
- Helper text showing valid range (1-1440 minutes)
- Disabled state when threshold alert toggle is OFF
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.6 Auto-Resolve Rule Configuration

**Purpose**: Configure automatic resolution of stale incidents

##### 3.3.6.1 Enable/Disable Toggle

**Functional Description**:

- Toggle button labeled \"Enable Auto-Resolve Rule\"
- Default state: OFF
- When toggle is ON:
  + System monitors incidents with status OPEN or INVESTIGATING
  + When incident has not been updated (no change to updated_at) for longer than configured timeout, system automatically sets status to RESOLVED and stamps resolved_at timestamp
- When toggle is OFF:
  + System does not auto-resolve incidents
- Toggle state persists in app configuration

**Display Requirements**:

- Toggle button with clear ON/OFF visual state
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.3.6.2 Timeout Duration Input (hours)

**Functional Description**:

- Number input field labeled \"Auto-Resolve Timeout (hours)\"
- Default value: 4 hours
- Minimum value: 1 hour
- Maximum value: 168 hours (7 days)
- User enters desired timeout duration
- User clicks Save Configuration button to persist timeout
- Timeout value stored in app configuration
- System uses timeout to determine when to auto-resolve stale incidents

**Display Requirements**:

- Number input with validation for min/max range
- Helper text showing valid range (1-168 hours)
- Disabled state when auto-resolve toggle is OFF
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.7 AI Analysis Configuration

**Purpose**: Configure AI analysis behavior including max token budget

##### 3.3.7.1 Max Token Budget Slider

**Purpose**: Set maximum output token limit for AI analysis streaming

**Functional Description**:

- Slider control labeled \"Max Token Budget\"
- Default value: 8000 tokens
- Minimum value: 1000 tokens
- Maximum value: 16000 tokens
- User drags slider to adjust token budget
- Current value displayed next to slider (e.g., \"8000 tokens\")
- User clicks Save Configuration button to persist value
- Configuration stored in localStorage via LlmContext
- When AI analysis runs:
  + System monitors token count during streaming
  + When token count reaches configured limit, streaming stops gracefully
  + Partial result is saved and displayed
  + System displays message: \"Analysis stopped at token limit ([value] tokens)\"

**Display Requirements**:

- Slider with clear min/max labels
- Current value display updating in real-time as slider moves
- Helper text explaining token budget purpose
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.3.8 Simulate Alert Button

**Purpose**: Test real-time alerting pipeline by inserting test incident into live_incidents table

**Functional Description**:

- User clicks Simulate Alert button in Settings page
- System displays modal or form with following fields:
  + Severity dropdown (CRITICAL or HIGH)
  + Service name text input (optional, defaults to test-service)
- User selects severity and optionally enters service name
- User clicks Confirm button
- System generates realistic incident ID (e.g., INC-2001, INC-2002)
- System generates realistic incident title based on service and severity
- System inserts new row into live_incidents Supabase table with:
  + Generated incident ID
  + Generated title
  + Selected severity
  + Service name
  + Status: OPEN
  + Opened timestamp: current time
  + is_synthetic: true
- System displays success toast confirming row was inserted
- Because frontend subscribes to Supabase Realtime postgres_changes on live_incidents table, the insertion triggers alert banner and toast notification

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.4 Incident Dashboard

**Purpose**: Main operational interface for incident management

**Layout**:

- Header with Simulate Alert button, Notification Center bell icon, and History Page link
- MTTR Threshold Warning Banner (conditional, visible when 7-day rolling MTTR exceeds threshold)
- Alert banner at top (visible when critical incidents detected)
- Left sidebar displays incident list with filters and bulk-select controls
- Center panel shows selected incident detail
- Right or bottom panel provides tools and actions

#### 3.4.1 Dashboard Header

**Functional Description**:

- Contains Simulate Alert button (same functionality as Settings page version)
- Contains Notification Center bell icon
- Contains History Page link (navigates to /history)
- Displays connection mode indicator

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.4.2 MTTR Threshold Warning Banner

**Purpose**: Display warning when 7-day rolling average MTTR exceeds configured threshold

**Functional Description**:

- Banner appears at top of Dashboard (below header, above alert banner) when MTTR threshold alert is enabled and 7-day rolling average MTTR exceeds configured threshold
- Displays message: \"Warning: 7-day rolling average MTTR ([value] minutes) exceeds threshold ([threshold] minutes)\"
- User can dismiss banner
- Banner reappears on next page load if condition still met
- Banner also appears on Analytics page when condition met

**Display Requirements**:

- Yellow/orange background with WCAG AA contrast text in light mode
- Dismiss button on right side
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.4.3 Notification Center Bell Icon

**Purpose**: Provide access to full alert notification history

**Functional Description**:

- Bell icon displayed in dashboard header
- Shows unread count badge when new CRITICAL or HIGH alerts received
- User clicks bell icon to open Notification Center panel
- Panel displays list of all alert events with:
  + Timestamp
  + Severity badge
  + Service name
  + Incident title
  + Incident ID
- List sorted by timestamp (newest first)
- User can click any alert entry to navigate to incident detail
- User can mark alerts as read or clear notification history
- Notification history persists across sessions

**Display Requirements**:

- Bell icon with unread count badge
- Notification panel slides in from right or displays as dropdown
- Alert entries color-coded by severity with WCAG AA contrast in light mode

#### 3.4.4 Alert Banner

**Purpose**: Display real-time critical incident alerts

**Functional Description**:

- Banner appears at top of dashboard when new CRITICAL or HIGH severity incident detected
- Displays incident ID, severity badge, and title
- User can click banner to navigate to incident detail
- User can dismiss banner
- Banner remains visible until dismissed or incident status changes
- When banner is dismissed, alert is logged to Notification Center

**Visual Requirements**:

- CRITICAL incidents: red background with WCAG AA contrast text in light mode
- HIGH incidents: orange background with WCAG AA contrast text in light mode
- Includes timestamp of incident detection

#### 3.4.5 Toast Notifications

**Purpose**: Provide immediate notification of new critical incidents

**Functional Description**:

- Toast notification appears when new CRITICAL or HIGH severity incident inserted into live_incidents table
- Displays incident ID, severity, and title
- Auto-dismisses after 10 seconds or user can dismiss manually
- Clicking toast navigates to incident detail
- Multiple toasts stack vertically if multiple incidents occur
- When toast is dismissed, alert is logged to Notification Center

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.4.6 Connection Mode Indicator

**Functional Description**:

- Display current mode (Live/Demo) in dashboard header or footer
- Live Mode: show green indicator with \"Connected to Splunk\"
- Demo Mode: show blue indicator with \"Demo Mode\"
- User can click indicator to navigate to Settings page

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.4.7 Left Sidebar - Incident List

**Functional Description**:

- Displays list of incidents with status OPEN or INVESTIGATING (excludes RESOLVED incidents)
- Shows following information for each incident:
  + Incident ID (e.g., INC-1001)
  + Title
  + Service name
  + Severity badge (CRITICAL/HIGH/MEDIUM/LOW)
  + Status (OPEN/INVESTIGATING)
  + Opened timestamp
  + Quick summary
  + Deduplication indicator (if applicable)
  + Mark as Resolved button (for non-RESOLVED incidents)
  + Checkbox (visible in bulk-select mode)
- User can click on any incident to view details in center panel
- At least 3 demo incidents available:
  + INC-1001: checkout-service latency spike after deployment v1.8.3 (CRITICAL)
  + INC-1002: payment-api 5xx errors spike (HIGH)
  + INC-1003: auth-service slow login (MEDIUM)

**Display Requirements**:

- All severity badges and status badges must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.1 Bulk-Select Mode Toggle

**Purpose**: Enable bulk selection of incidents for batch operations

**Functional Description**:

- Toggle button labeled \"Select\" displayed at top of incident list sidebar
- Default state: OFF
- When toggle is ON:
  + Checkbox appears on each incident card
  + Select All / Deselect All actions appear
  + Resolve Selected button appears at bottom of incident list
- When toggle is OFF:
  + Checkboxes hidden
  + Select All / Deselect All actions hidden
  + Resolve Selected button hidden
- Toggle state does not persist (resets to OFF on page reload)

**Display Requirements**:

- Toggle button with clear ON/OFF visual state
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.2 Select All / Deselect All Actions

**Purpose**: Quickly select or deselect all incidents in list

**Functional Description**:

- Buttons displayed at top of incident list when bulk-select mode is ON
- Select All button: checks all incident checkboxes
- Deselect All button: unchecks all incident checkboxes
- Buttons only affect incidents currently visible in filtered list

**Display Requirements**:

- Buttons positioned next to bulk-select toggle
- Clear button labels
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.3 Resolve Selected Button

**Purpose**: Batch-resolve multiple selected incidents

**Functional Description**:

- Button labeled \"Resolve Selected\" displayed at bottom of incident list when bulk-select mode is ON and at least one incident is selected
- Button disabled when no incidents selected
- User clicks button
- System displays confirmation dialog: \"Resolve [count] selected incidents?\"
- User confirms
- System batch-updates all selected incidents with status OPEN or INVESTIGATING to:
  + status: RESOLVED
  + resolved_at: current timestamp
- System uses single Supabase batch update operation
- System displays success toast: \"[count] incidents resolved\"
- Incident cards update immediately to show RESOLVED status
- Resolved incidents disappear from Dashboard incident list (filtered out)
- Bulk-select mode automatically turns OFF after batch operation completes

**Display Requirements**:

- Button with clear enabled/disabled state
- Confirmation dialog with incident count
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.4 Mark as Resolved Button

**Purpose**: Allow users to mark incidents as resolved with timestamp

**Functional Description**:

- Button displayed on each incident card in incident list
- Button label: \"Mark as Resolved\" or \"Resolve\"
- Button only visible for incidents with status OPEN or INVESTIGATING
- Button hidden for incidents with status RESOLVED
- User clicks button
- System updates incident in live_incidents table:
  + status: RESOLVED
  + resolved_at: current timestamp (2026-06-12 00:45:30)
- System displays success toast: \"Incident [ID] marked as resolved\"
- Incident card updates immediately to show RESOLVED status
- Mark as Resolved button disappears from card
- Resolved incident disappears from Dashboard incident list (filtered out)
- If incident had deduplication indicator, system removes indicator from related incidents

**Display Requirements**:

- Button with clear visual state (enabled/disabled)
- Button positioned at bottom of incident card or in action menu
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.5 Synthetic Incident Filter Toggle

**Purpose**: Hide synthetic test incidents from incident list

**Functional Description**:

- Toggle button displayed at top of incident list sidebar
- Label: \"Hide Synthetic Incidents\"
- Default state: ON (synthetic incidents hidden)
- When toggle is ON:
  + System filters out incidents where is_synthetic = true
  + Display count badge showing number of hidden synthetic incidents (e.g., \"3 hidden\")
- When toggle is OFF:
  + System displays all incidents including synthetic ones
  + Synthetic incidents visually distinguished with badge or icon
- Toggle state persists in user session

**Display Requirements**:

- Toggle button with clear ON/OFF visual state
- Count badge visible when filter is active
- Synthetic incidents marked with \"TEST\" badge when filter is OFF
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.6 Advanced Filters

**Purpose**: Filter incident list by keyword, severity, and status

**Functional Description**:

- **Keyword Search**: Text input box at top of incident list
  + User enters keyword to search incident title, service name, or incident ID
  + System filters incident list in real-time as user types
  + Search is case-insensitive
- **Severity Filter**: Multi-select dropdown or checkbox group
  + Options: CRITICAL, HIGH, MEDIUM, LOW
  + User selects one or more severity levels
  + System filters incident list to show only selected severities
  + Default: all severities selected
- **Status Filter**: Multi-select dropdown or checkbox group
  + Options: OPEN, INVESTIGATING
  + User selects one or more statuses
  + System filters incident list to show only selected statuses
  + Default: OPEN and INVESTIGATING selected
  + RESOLVED option not available (resolved incidents excluded from Dashboard)
- All filters work together (AND logic)
- User can clear all filters with \"Clear Filters\" button
- Filter state persists in user session

**Display Requirements**:

- Filters displayed above incident list
- Active filter count badge (e.g., \"3 filters active\")
- Clear visual indication of active filters
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.4.7.7 Incident Deduplication Indicator

**Purpose**: Flag potential duplicate incidents affecting same service

**Functional Description**:

- When new incident is inserted with status OPEN:
  + System checks if another OPEN incident exists for same service
  + If duplicate found, system adds visual indicator to incident card
- Indicator displayed as badge or warning icon on incident card
- Tooltip shows: \"Possible duplicate: [other incident ID] also affects [service]\"
- User can click indicator to view related incidents
- Indicator removed when one of the duplicate incidents is resolved

**Display Requirements**:

- Warning icon or badge on incident card
- Tooltip with duplicate incident information
- Visual distinction from other badges
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.4.8 Center Panel - Incident Detail

**Functional Description**:

- **Overview Card**: Displays incident summary, severity badge, status badge, service name, selected time window
- **Analyze Incident CTA**: Primary action button to trigger incident analysis
- **Evidence Area**: Shows evidence sections after analysis (initially empty)
- **Action/Export Area**: Provides follow-up prompts and export options after analysis
- **Export Analysis Button**: Allows exporting current analysis as PDF or Markdown
- **Past Analyses Panel**: Displays historical analyses for current incident with compare functionality

**Display Requirements**:

- All severity badges and status badges must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.5 Incident Analysis Flow

**Trigger**: User clicks \"Analyze Incident\" button

**Process**:

1. Backend gathers evidence from demo data, Splunk REST API, or Splunk MCP Server (based on connection mode and configuration)
2. Backend assembles structured evidence bundle
3. Backend generates AI incident brief using Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL>
4. Backend monitors token count during streaming
5. If token count reaches configured max token budget:
   - Streaming stops gracefully
   - Partial result is saved
   - System displays message: \"Analysis stopped at token limit ([value] tokens)\"
6. Backend generates top 3 suggested SPL queries relevant to the incident
7. Frontend renders analysis results
8. Frontend auto-populates NL→SPL tool with suggested queries
9. Analysis is saved to incident_analyses table for historical comparison

**Analysis Results Display**:

#### 3.5.1 AI Brief Section

- **Summary**: Concise incident summary
- **Ranked Hypotheses**: List of potential root causes with:
  + Hypothesis title
  + Confidence score (0-1)
  + Supporting evidence bullets
- **Blast Radius**: Shows affected services and endpoints
- **Recommended Actions**: List of next steps
- **Open Questions**: Unresolved investigation points

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.5.2 Evidence Sections

- **Top Error Patterns**: Most frequent error messages or patterns
- **Recent Deployment/Change Events**: Timeline of deployments or configuration changes
- **Affected Services/Endpoints**: List of impacted services and API endpoints
- **Metadata Summary**: Relevant service metadata
- **Timeline**: Chronological sequence of relevant events with timestamps

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.5.3 Follow-up Investigation

**Functional Description**:

- User can select from predefined follow-up prompts:
  + \"What changed before the spike?\"
  + \"Show top failing endpoints\"
  + \"What services are affected?\"
  + \"Draft stakeholder update\"
- System processes follow-up question and displays additional analysis
- Uses streaming response via <SKILL>large-language-model</SKILL>
- Token budget applies to follow-up analysis as well

### 3.6 Export Analysis Button

**Purpose**: Export current incident analysis as PDF or Markdown file

**Functional Description**:

- Button labeled \"Export Analysis\" displayed on incident detail panel after analysis completes
- User clicks button
- System displays format selection dropdown or modal:
  + PDF format
  + Markdown format
- User selects desired format
- System generates export file containing:
  + Incident metadata:
    - Incident ID
    - Title
    - Severity
    - Service
    - Status
    - Opened timestamp
    - Time window
  + All analysis sections:
    - Executive Summary
    - Ranked Hypotheses (with confidence scores and evidence)
    - Blast Radius
    - Recommended Actions
    - Open Questions
    - Timeline
    - Top Error Patterns
    - Recent Deployment/Change Events
    - Affected Services/Endpoints
- For PDF format:
  + System uses browser print API or PDF generation library
  + Formatted with proper headings, spacing, and styling
  + Filename: `incident_[ID]_analysis_[timestamp].pdf`
- For Markdown format:
  + System generates .md file with Markdown syntax
  + Includes proper heading levels, lists, and code blocks
  + Filename: `incident_[ID]_analysis_[timestamp].md`
- Browser downloads file automatically

**Display Requirements**:

- Button positioned prominently on incident detail panel
- Format selection UI with clear options
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.7 Past Analyses Panel

**Purpose**: Display historical analyses for current incident and enable comparison

**Functional Description**:

- Panel displayed on incident detail view below current analysis
- Shows list of all previous analyses for current incident
- Each analysis entry displays:
  + Analysis timestamp
  + Analysis version number (e.g., \"Analysis #1\", \"Analysis #2\")
  + Brief summary or first line of executive summary
  + Token count (if available)
- List sorted by timestamp (newest first)
- User can click any analysis entry to view full historical analysis
- User can select two analyses by clicking checkboxes next to entries
- When two analyses selected, \"Compare\" button becomes enabled
- User clicks \"Compare\" button
- System navigates to Analysis Comparison View

**Display Requirements**:

- Panel with collapsible/expandable sections
- Checkboxes for analysis selection
- \"Compare\" button disabled until two analyses selected
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

**Database Schema**:

- Table: incident_analyses
- Columns: id, incident_id, analysis_timestamp, executive_summary, hypotheses, recommended_actions, open_questions, timeline, token_count, user_id

### 3.8 Analysis Comparison View

**Purpose**: Display side-by-side diff of two historical analyses with change highlights

**Layout**:

- Split-screen layout with two columns
- Left column: Earlier analysis (Analysis A)
- Right column: Later analysis (Analysis B)
- Header shows analysis timestamps and version numbers
- Back button to return to incident detail view

**Functional Description**:

- System retrieves both selected analyses from incident_analyses table
- System performs text diff comparison for each section:
  + Executive Summary
  + Hypotheses
  + Recommended Actions
  + Open Questions
  + Timeline
- Diff algorithm identifies:
  + Added content (present in Analysis B but not in Analysis A)
  + Removed content (present in Analysis A but not in Analysis B)
  + Changed content (modified between analyses)
  + Unchanged content (identical in both analyses)
- System displays both analyses side-by-side with synchronized scrolling
- Change highlights applied:
  + Added content: green background
  + Removed content: red background with strikethrough
  + Changed content: yellow background
  + Unchanged content: no highlight
- User can scroll through both analyses simultaneously
- User can click \"Export Diff\" button to download comparison as PDF or Markdown

**Display Requirements**:

- Clear visual distinction between left and right columns
- Color-coded highlights with WCAG AA contrast in light mode:
  + Added: green background (#D1FAE5) with dark text (#065F46)
  + Removed: red background (#FEE2E2) with dark text (#991B1B) and strikethrough
  + Changed: yellow background (#FEF3C7) with dark text (#92400E)
- Synchronized scrolling between columns
- Section headers aligned horizontally
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.9 Incident History Page

**Purpose**: Display complete incident history including resolved incidents

**Layout**:

- Page header with title \"Incident History\"
- Filter controls (Status, Severity, Service, Date Range)
- Incident history table with columns: ID, Title, Service, Severity, Status, Opened At, Resolved At, MTTR
- Pagination controls

#### 3.9.1 Page Header

**Functional Description**:

- Displays page title \"Incident History\"
- Includes back button or breadcrumb navigation to Dashboard

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.9.2 Filter Controls

**Purpose**: Filter incident history by status, severity, service, and date range

**Functional Description**:

- **Status Filter**: Multi-select dropdown or checkbox group
  + Options: All, OPEN, INVESTIGATING, RESOLVED
  + Default: All
  + User selects one or more statuses
  + System filters table to show only selected statuses
- **Severity Filter**: Multi-select dropdown or checkbox group
  + Options: CRITICAL, HIGH, MEDIUM, LOW
  + Default: all severities selected
  + User selects one or more severity levels
  + System filters table to show only selected severities
- **Service Filter**: Dropdown or text input with autocomplete
  + User selects or enters service name
  + System filters table to show only incidents for selected service
  + Default: all services
- **Date Range Filter**: Date range picker
  + User selects start date and end date
  + System filters table to show only incidents opened within date range
  + Default: last 30 days
- All filters work together (AND logic)
- User can clear all filters with \"Clear Filters\" button
- Filter state persists in user session

**Display Requirements**:

- Filters displayed above incident history table
- Active filter count badge (e.g., \"3 filters active\")
- Clear visual indication of active filters
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.9.3 Incident History Table

**Purpose**: Display all incidents in tabular format with key metrics

**Functional Description**:

- Table displays following columns:
  + **ID**: Incident ID (e.g., INC-1001)
  + **Title**: Incident title
  + **Service**: Service name
  + **Severity**: Severity badge (CRITICAL/HIGH/MEDIUM/LOW)
  + **Status**: Status badge (OPEN/INVESTIGATING/RESOLVED)
  + **Opened At**: Timestamp when incident was opened (format: YYYY-MM-DD HH:MM:SS)
  + **Resolved At**: Timestamp when incident was resolved (format: YYYY-MM-DD HH:MM:SS, empty if not resolved)
  + **MTTR**: Mean Time to Resolve in minutes (calculated as resolved_at - opened_at, empty if not resolved)
- Table rows sorted by Opened At timestamp (newest first) by default
- User can click column headers to sort by that column
- User can click any row to navigate to incident detail view
- Table supports pagination (default 50 rows per page)

**Display Requirements**:

- All severity badges and status badges must meet WCAG AA contrast ratio (≥4.5:1) in light mode
- Table headers with sort indicators
- Hover state on table rows
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.9.4 Pagination Controls

**Functional Description**:

- Pagination controls displayed at bottom of table
- Shows current page number and total pages
- Previous/Next buttons to navigate pages
- Page size selector (25, 50, 100 rows per page)
- Jump to page input

**Display Requirements**:

- Clear pagination controls
- Disabled state for Previous button on first page and Next button on last page
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.10 Analytics Page

**Purpose**: Display incident analytics and metrics

**Layout**:

- MTTR Threshold Warning Banner (conditional, visible when 7-day rolling MTTR exceeds threshold)
- KPI Cards (total incidents, MTTR, open incidents, etc.)
- 30-day Rolling MTTR Trend Chart
- Other charts (incident volume, severity distribution, etc.)
- Export PDF Button

#### 3.10.1 KPI Cards

**Functional Description**:

- Display key performance indicators:
  + Total incidents (last 30 days)
  + Average MTTR (last 30 days)
  + Open incidents (current)
  + Critical incidents (last 7 days)
- Each KPI card shows metric value and trend indicator

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.10.2 30-day Rolling MTTR Trend Chart

**Purpose**: Display Mean Time to Resolve trend over 30-day rolling window

**Functional Description**:

- Line chart showing daily average MTTR for last 30 days
- X-axis: Date (daily)
- Y-axis: Average MTTR in minutes
- Data source: live_incidents table
- Calculation:
  + For each day in last 30 days:
    - Filter incidents resolved on that day (resolved_at date matches)
    - Calculate MTTR for each incident: (resolved_at - opened_at) in minutes
    - Calculate average MTTR for all incidents resolved that day
  + Plot daily average MTTR as line chart
- If no real data available, system displays demo curve with realistic MTTR values

**Display Requirements**:

- Chart title: \"30-day Rolling MTTR Trend\"
- X-axis label: \"Date\"
- Y-axis label: \"Average MTTR (minutes)\"
- Tooltip shows date and MTTR value on hover
- All axis labels, tick labels, and tooltip text must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.10.3 Export PDF Button

**Purpose**: Open print-preview modal for selective PDF export

**Functional Description**:

- Button labeled \"Export PDF\" displayed on Analytics page
- User clicks button
- System opens Print-Preview Modal

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.11 Print-Preview Modal

**Purpose**: Allow users to select sections for PDF export

**Layout**:

- Modal header with title \"Export Analytics Report\"
- Section checkboxes for each KPI card and chart
- Export PDF button at bottom
- Cancel button

#### 3.11.1 Section Checkboxes

**Functional Description**:

- Display checkbox for each exportable section:
  + Total Incidents KPI Card
  + Average MTTR KPI Card
  + Open Incidents KPI Card
  + Critical Incidents KPI Card
  + 30-day Rolling MTTR Trend Chart
  + Incident Volume Chart
  + Severity Distribution Chart
  + Other charts (if applicable)
- All checkboxes selected by default
- User can select/deselect any checkbox
- At least one checkbox must be selected to enable Export PDF button

**Display Requirements**:

- Checkboxes with clear labels
- Visual indication of selected/deselected state
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.11.2 Export PDF Button (inside modal)

**Purpose**: Trigger print preview with selected sections

**Functional Description**:

- Button labeled \"Export PDF\" at bottom of modal
- Button disabled if no sections selected
- User clicks button
- System hides all unselected sections in DOM
- System calls window.print() to trigger browser print dialog
- User can save as PDF or print to printer
- After print dialog closes, system restores all sections to visible state
- System closes modal

**Display Requirements**:

- Button with clear enabled/disabled state
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

### 3.12 Tools Panel

**Purpose**: Provides additional investigation and export capabilities

#### 3.12.1 Web Search

- User enters search query for incident context, known issues, or CVEs
- Uses <SKILL>web-search</SKILL> to retrieve results
- Displays search results in panel

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.2 AI Search

- User enters query for web-grounded AI search on incident patterns
- Uses <SKILL>ai-search</SKILL> for intelligent search
- Displays AI-enhanced search results

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.3 OCR Upload

- User uploads log screenshots or error images
- Uses <SKILL>ocr-space</SKILL> to extract text from images
- Displays extracted text for analysis

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.4 Web Reader

- User enters runbook or documentation URL
- Uses <SKILL>web-reader</SKILL> to fetch and analyze URL content
- Displays fetched content for context

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.5 Data Analysis

- User selects metrics to visualize (latency, error rate, etc.)
- Uses <SKILL>data-analysis</SKILL> to generate charts and timelines
- Displays visualization in panel

**Display Requirements**:

- All chart axes, tick labels, and tooltip text must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.6 NL→SPL (Natural Language to SPL)

**Purpose**: Generate and execute SPL queries from natural language questions

**Layout**:

- Suggested Queries Section (top)
- Query Input Area (middle)
- Query Results Area (with Export CSV button)
- Share Button
- Query History Panel (bottom, with search box)

##### 3.12.6.1 Suggested Queries Section

**Purpose**: Display auto-populated suggested SPL queries after incident analysis

**Functional Description**:

- After incident analysis completes, system automatically generates top 3 most relevant SPL queries for the selected incident
- Suggested queries displayed as clickable chips or buttons
- Each chip shows query description (e.g., \"Error spike query\", \"Deployment correlation query\", \"Endpoint latency query\")
- User clicks any chip to auto-populate query input and execute
- Suggested queries remain visible until user selects different incident or manually clears

**Example Suggested Queries**:

- \"Show error rate spike for [service] in last 30 minutes\"
- \"Find deployments before incident start time\"
- \"List top failing endpoints for [service]\"

**Display Requirements**:

- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.12.6.2 Query Input Area

**Functional Description**:

- User enters natural language question in text input (e.g., \"Show me error rate for checkout-service in the last 30 minutes\")
- User clicks \"Generate & Run SPL\" button
- System calls splunk-mcp Supabase Edge Function with the question
- Edge function uses Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL> to generate valid SPL query from question
- If SPLUNK_MCP_URL is configured:
  + Edge function sends generated SPL to Splunk MCP Server /tools/call endpoint
  + Uses MCP tool: search
  + Edge function returns SPL query and execution results
- If SPLUNK_MCP_URL is not configured:
  + Edge function returns generated SPL query with demo explanation
- System displays generated SPL query in code block
- System displays execution results or demo explanation
- System saves query to spl_query_history database table

**Display Requirements**:

- Show natural language question input field
- Show \"Generate & Run SPL\" button
- Show generated SPL query in formatted code block
- Show execution results in table or text format
- Show demo explanation if MCP not configured
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

**Integration**:

- Uses splunk-mcp Supabase Edge Function
- Uses <SKILL>large-language-model</SKILL> for SPL generation

##### 3.12.6.3 Query Results Area with Export CSV Button

**Purpose**: Display SPL query execution results and allow CSV export

**Functional Description**:

- After SPL query executes, system displays results in table format
- Results table shows columns returned by SPL query
- User clicks \"Export CSV\" button to download results
- System converts results table to CSV format
- Browser downloads CSV file with filename: `spl_results_[timestamp].csv`
- CSV includes column headers and all result rows

**Display Requirements**:

- Results displayed in scrollable table
- \"Export CSV\" button visible above or below results table
- Button disabled if no results available
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.12.6.4 Share Button

**Purpose**: Generate shareable deep-link URL for SPL query

**Functional Description**:

- After SPL query is generated, \"Share\" button appears next to \"Copy SPL\" button
- User clicks \"Share\" button
- System generates deep-link URL with following format:
  + `https://[app-domain]/dashboard?nlq=[encoded_question]&service=[service]`
  + `nlq` parameter: URL-encoded natural language question
  + `service` parameter: service name from incident context (if available)
- System copies URL to clipboard
- System displays toast notification: \"Link copied!\"
- When another user opens the deep-link URL:
  + System auto-populates NL→SPL query input with decoded question
  + System auto-executes query if service parameter matches current incident context

**Display Requirements**:

- \"Share\" button with share icon
- Toast notification confirming link copied
- Button positioned next to \"Copy SPL\" button
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.12.6.5 Query History Panel with Search Box

**Purpose**: Persist and display previously generated SPL queries with search capability

**Functional Description**:

- System stores each generated SPL query to spl_query_history database table with following fields:
  + user_id (current authenticated user)
  + query_text (natural language question)
  + generated_spl (SPL query)
  + timestamp (query execution time)
  + service_context (optional, service name if available)
  + incident_id (optional, if query generated from incident analysis)
- **Search Box**: Text input at top of Query History Panel
  + User enters keyword to search query history
  + System filters history list in real-time by matching keyword against query_text and generated_spl fields
  + Search is case-insensitive
  + Filtering performed client-side on already-loaded history list
- Query history panel displays filtered list of previous queries in reverse chronological order (newest first)
- Each history item shows:
  + Query text
  + Generated SPL (truncated or collapsed)
  + Timestamp
  + Service context (if available)
- User clicks any history item to replay/re-run the query
- Clicking history item auto-populates query input area and executes query
- User can click \"Clear History\" button to delete all query history for current user
- Query history is per-user (isolated by user_id)

**Display Requirements**:

- Search box at top of Query History Panel with placeholder \"Search query history...\"
- Query history list with scrollable area
- \"Clear History\" button at top or bottom of panel
- Empty state message when no history exists or no search results found
- Highlight clicked history item
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

**Database Schema**:

- Table: spl_query_history
- Columns: id, user_id, query_text, generated_spl, timestamp, service_context, incident_id

#### 3.12.7 Saved Queries Panel

**Purpose**: Provide access to built-in SPL query templates and user-saved queries

**Layout**:

- Templates Category (read-only, pre-loaded)
- User Saved Queries Category

##### 3.12.7.1 Templates Category

**Purpose**: Provide curated library of built-in SPL query templates for common use cases

**Functional Description**:

- System pre-loads built-in SPL query templates in Templates category
- Templates are read-only and cannot be deleted or modified by users
- Each template includes:
  + Template name
  + Template description
  + Parameterized SPL query
- Templates are parameterized with placeholders for:
  + Service name (e.g., `{service}`)
  + Time window (e.g., `{time_window}`)
- When user clicks a template:
  + System loads template into NL→SPL query input area
  + System replaces placeholders with current incident context:
    - `{service}` → current incident service name
    - `{time_window}` → current incident time window
  + User can edit parameterized query before running
  + User clicks \"Generate & Run SPL\" button to execute query
- Templates displayed in collapsible list or grid view

**Built-in Templates**:

1. **Error Rate Analysis**
   - Description: Analyze error rate trends for a service
   - SPL: `index=main service={service} earliest={time_window} | stats count by status | where status>=400`

2. **Latency Percentiles (p50/p95/p99)**
   - Description: Calculate latency percentiles for a service
   - SPL: `index=main service={service} earliest={time_window} | stats p50(latency), p95(latency), p99(latency)`

3. **Deployment Correlation**
   - Description: Find deployments before incident start time
   - SPL: `index=deployments service={service} earliest={time_window} | table _time, version, deployer`

4. **Top Error Messages**
   - Description: Show most frequent error messages
   - SPL: `index=main service={service} earliest={time_window} status>=400 | top limit=10 error_message`

5. **User Impact (Distinct Users Affected)**
   - Description: Count distinct users affected by errors
   - SPL: `index=main service={service} earliest={time_window} status>=400 | stats dc(user_id) as affected_users`

6. **Service Availability**
   - Description: Calculate service availability percentage
   - SPL: `index=main service={service} earliest={time_window} | stats count(eval(status<400)) as success, count as total | eval availability=round(success/total*100, 2)`

7. **Log Volume Anomaly Detection**
   - Description: Detect unusual log volume spikes
   - SPL: `index=main service={service} earliest={time_window} | timechart span=1m count | anomalydetection count`

8. **Slow Endpoint Detection**
   - Description: Identify endpoints with high latency
   - SPL: `index=main service={service} earliest={time_window} | stats avg(latency) as avg_latency by endpoint | where avg_latency>1000 | sort -avg_latency`

**Display Requirements**:

- Templates category clearly labeled as \"Templates\" with read-only indicator
- Each template displayed as card or list item with name and description
- Template cards show preview of SPL query
- Click to load template into query input area
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

##### 3.12.7.2 User Saved Queries Category

**Purpose**: Allow users to save and reuse custom SPL queries

**Functional Description**:

- User can save custom SPL queries to User Saved Queries category
- User clicks \"Save Query\" button after generating SPL query
- System prompts user to enter query name and optional description
- System saves query to user_saved_queries database table
- Saved queries displayed in User Saved Queries category
- User can click saved query to load into query input area
- User can delete saved queries
- Saved queries are per-user (isolated by user_id)

**Display Requirements**:

- User Saved Queries category clearly labeled
- Each saved query displayed as card or list item with name and description
- Delete button visible on each saved query card
- All text and backgrounds must meet WCAG AA contrast ratio (≥4.5:1) in light mode

#### 3.12.8 Export Options

**Purpose**: Export incident analysis for stakeholder communication

**Export Formats**:

- **Markdown Report**: Complete incident report in Markdown format
- **Slack-style Update**: Formatted text suitable for Slack channels
- **Jira-style Summary**: Formatted text suitable for Jira tickets
- **PowerPoint Briefing**: Executive presentation with incident analysis

**Functional Description**:

- User clicks export button and selects format
- System generates formatted content
- User can copy to clipboard or download as file

##### 3.12.8.1 PowerPoint Briefing Export

**Purpose**: Generate executive briefing presentation from incident analysis

**Functional Description**:

- User clicks \"Generate Briefing PPT\" button in Tools Panel
- System calls ppt-export Supabase Edge Function
- Edge function uses <SKILL>ppt-generator</SKILL> to create PowerPoint file
- Generated .pptx file contains following slides:
  1. **Cover Slide**: Incident ID, title, severity, timestamp
  2. **Incident Summary**: Overview, affected services, time window
  3. **Root Cause Hypotheses**: Ranked hypotheses with confidence bars (visual representation of confidence scores)
  4. **Blast Radius**: Affected services, endpoints, dependencies
  5. **Event Timeline**: Chronological sequence of key events
  6. **Recommended Actions**: Next steps and action items
- System returns binary .pptx file
- Browser downloads file automatically

**Integration**:

- Uses <SKILL>ppt-generator</SKILL> for PowerPoint generation

### 3.13 Notification Center Panel

**Purpose**: Display full alert notification history

**Functional Description**:

- Panel displays list of all alert events with:
  + Timestamp
  + Severity badge
  + Service name
  + Incident title
  + Incident ID
- List sorted by timestamp (newest first)
- User can click any alert entry to navigate to incident detail
- User can mark alerts as read or clear notification history
- Notification history persists across sessions

**Display Requirements**:

- Notification panel slides in from right or displays as dropdown
- Alert entries color-coded by severity with WCAG AA contrast in light mode

### 3.14 CHANGELOG.md Document

**Purpose**: Track all version changes for SentinelOps application

**Location**: Project root directory

**Structure**:

```markdown
# SentinelOps Changelog

All notable changes to SentinelOps will be documented in this file.

## [v9.0.0] - 2026-06-12

### Added
- Max Token Budget slider in Settings → AI Analysis Configuration (range 1000-16000 tokens, default 8000)
- Token budget enforcement during AI analysis streaming with graceful stop when limit reached
- Token budget configuration persisted in localStorage via LlmContext
- Export Analysis button on incident detail panel with PDF and Markdown format options
- Analysis export includes incident metadata and all analysis sections
- Past Analyses panel displaying historical analyses for current incident
- Analysis comparison functionality allowing side-by-side diff of two historical analyses
- Visual change highlights in comparison view (added/removed/changed content)
- incident_analyses database table for storing historical analysis data
- Synchronized scrolling in analysis comparison view

### Changed
- AI analysis flow now monitors token count and stops streaming at configured limit
- Incident detail view enhanced with export and comparison capabilities

## [v8.0.0] - 2026-05-29

### Added
- MTTR Threshold Alert configuration in Settings page with enable/disable toggle and threshold value input (minutes)
- 7-day rolling MTTR calculation and threshold monitoring
- MTTR Threshold Warning Banner on Dashboard and Analytics pages when rolling average exceeds threshold
- Auto-Resolve Rule configuration in Settings page with enable/disable toggle and timeout duration input (hours)
- Automated incident resolution for stale incidents (no update for configured timeout)
- Bulk-Select Mode on incident list with Select toggle, checkboxes on incident cards, Select All/Deselect All actions, and Resolve Selected button
- Batch incident resolution via single Supabase update operation
- Incident History Page (/history) with filterable, paginated table showing all incidents (open and resolved)
- Filter controls on History page: status (All/Open/Investigating/Resolved), severity, service, date range
- MTTR column in Incident History table showing resolution time in minutes
- History Page link in Dashboard header

### Changed
- Dashboard incident list now excludes RESOLVED incidents (only shows OPEN and INVESTIGATING)
- Dashboard status filter options reduced to OPEN and INVESTIGATING (RESOLVED removed)
- Incident list filtering logic updated to exclude resolved incidents from Dashboard view

## [v7.0.0] - 2026-05-29

### Added
- Mark as Resolved button on incident cards in incident list
- resolved_at timestamp field in live_incidents table
- 30-day rolling MTTR trend line chart on Analytics page
- Print-preview modal for selective PDF export with section checkboxes
- Export PDF button inside print-preview modal triggering window.print()

### Changed
- Replaced one-click Export PDF button with modal-based preview workflow
- Enhanced Analytics page with MTTR trend visualization

### Fixed
- Comprehensive light-mode contrast fixes across all components

## [v6.0.0] - 2026-05-24

### Added
- PagerDuty Auto-Sync Toggle with configurable interval
- Live last synced timestamp display for PagerDuty sync
- Built-in SPL Query Templates library with 8 common use cases
- Templates category in Saved Queries Panel
- Drag-to-reorder functionality for Alert Routing Rules
- Live priority badges on alert rule cards
- User Saved Queries category in Saved Queries Panel

### Changed
- Enhanced Settings page with PagerDuty configuration section
- Enhanced Alert Rules editor with drag-and-drop reordering capability
- Enhanced Saved Queries Panel with Templates and User Saved Queries categories

## [v5.0.0] - 2026-05-21

### Added
- Synthetic incident filter toggle
- Search box in SPL Query History Panel
- Share button for generated SPL results
- Advanced filtering in incident list
- Notification Center bell icon
- Incident deduplication indicator
- Export CSV button for SPL query results

### Changed
- Enhanced incident list sidebar with multiple filter options
- Improved NL→SPL tool with search and share capabilities

## [v4.0.0] - 2026-05-20

### Added
- Scheduled synthetic alert job running hourly
- Automated synthetic incident generation
- is_synthetic flag in live_incidents table

### Changed
- Enhanced Simulate Alert functionality with synthetic incident tracking

## [v3.0.0] - 2026-05-19

### Added
- Natural Language to SPL (NL→SPL) tool
- Splunk MCP Server configuration
- SPL query generation from natural language
- SPL query execution via Splunk MCP Server
- SPL query history persistence
- Suggested SPL queries auto-populated after incident analysis
- Query History Panel in NL→SPL tool

### Changed
- Enhanced incident analysis to generate top 3 suggested SPL queries
- Improved Tools Panel with NL→SPL tab

## [v2.0.0] - 2026-05-18

### Added
- Real-time critical incident alerting with Supabase Realtime
- Alert banner for CRITICAL and HIGH severity incidents
- Toast notifications for new incidents
- Simulate Alert button
- live_incidents Supabase table
- Supabase Realtime postgres_changes subscription

### Changed
- Enhanced dashboard with real-time alerting capabilities
- Improved incident detection and notification flow

## [v1.0.0] - 2026-05-17

### Added
- Initial release of SentinelOps
- User authentication and registration
- Incident Dashboard
- AI-powered incident analysis
- Splunk connection configuration
- Evidence gathering from Splunk REST API or demo data
- AI incident brief generation
- Blast radius calculation and timeline correlation
- Follow-up investigation prompts
- Tools Panel with multiple investigation tools
- Export options for stakeholder communication
- PowerPoint briefing generation
- Demo mode with sample incident data
```

**Functional Description**:

- Document maintained in project root as CHANGELOG.md
- Each version entry includes:
  + Version number (semantic versioning)
  + Release date
  + Added features
  + Changed features
  + Removed features (if applicable)
  + Fixed issues (if applicable)
- Entries sorted in reverse chronological order (newest first)
- Follows Keep a Changelog format

## 4. Business Rules and Logic

### 4.1 Splunk Integration Abstraction

**Purpose**: Provide unified interface for Splunk data retrieval supporting multiple modes

**Supported Modes**:

- Demo/mock mode (default, works without Splunk credentials)
- Live Splunk REST API mode (when SPLUNK_HOST and SPLUNK_TOKEN configured)
- Splunk MCP Server mode (when SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN configured)

**Configuration Logic**:

- When SPLUNK_HOST and SPLUNK_TOKEN environment variables are set, system uses Live Mode
- When SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN are set, system can use MCP Server mode
- When environment variables are not set, system falls back to Demo Mode
- incident-analyze edge function checks configuration at runtime
- Connection mode is displayed clearly in UI

**Interface Methods**:

- `run_splunk_query(query, time_window)`: Execute Splunk query and return results
- `get_metadata(entity_type)`: Retrieve metadata for services, hosts, or other entities
- `generate_spl(question)`: Generate SPL query from natural language question
- `explain_spl(query)`: Explain what a SPL query does
- `get_saved_searches()`: Optional method to retrieve saved Splunk searches
- `run_mcp_search(spl_query)`: Execute SPL query via Splunk MCP Server

**Demo Mode Behavior**:

- When Splunk credentials not available, system uses bundled sample data
- Sample data includes: incidents.json, alerts.json, app_logs.json, deploy_events.json, metadata.json
- Mock analysis returns deterministic, realistic incident outputs
- All primary flows remain functional without live Splunk connection

**Live Mode Behavior**:

- System connects to Splunk REST API using configured SPLUNK_HOST and SPLUNK_TOKEN
- Queries execute against live Splunk data
- Connection failures trigger fallback to Demo Mode with user notification

**MCP Server Mode Behavior**:

- When SPLUNK_MCP_URL is configured, incident-analyze edge function uses MCP Server to gather evidence
- System sends SPL queries to Splunk MCP Server /tools/call endpoint with tool: search
- MCP Server executes queries and returns results
- If MCP Server fails, system falls back to Live Mode or Demo Mode

### 4.2 Analysis Orchestration Logic

**Evidence Gathering**:

1. Retrieve incident details (service, time window, severity)
2. Query logs for error patterns within time window
3. Query deployment events within time window
4. Retrieve service metadata and dependencies
5. Assemble evidence bundle
6. If SPLUNK_MCP_URL configured, use MCP Server to execute queries; otherwise use REST API or demo data

**AI Brief Generation**:

1. Send evidence bundle to Gemini 2.5 Flash LLM
2. Request structured output with summary, hypotheses, blast radius, actions, questions
3. Monitor token count during streaming
4. If token count reaches configured max token budget:
   - Stop streaming gracefully
   - Save partial result
   - Display message: \"Analysis stopped at token limit ([value] tokens)\"
5. Parse LLM response into structured format
6. Generate top 3 suggested SPL queries based on incident context
7. Save analysis to incident_analyses table with:
   - incident_id
   - analysis_timestamp
   - executive_summary
   - hypotheses
   - recommended_actions
   - open_questions
   - timeline
   - token_count
   - user_id
8. Return analysis results and suggested queries to frontend

**Hypothesis Ranking Logic**:

- Hypotheses ranked by confidence score (0-1)
- Confidence based on evidence strength and temporal correlation
- Each hypothesis includes supporting evidence bullets

**Suggested SPL Query Generation Logic**:

- After incident analysis completes, system generates top 3 most relevant SPL queries
- Query generation based on:
  + Incident service name
  + Incident time window
  + Identified error patterns
  + Deployment events
  + Affected endpoints
- Example queries:
  + Error spike query: \"Show error rate for [service] in last [time_window]\"
  + Deployment correlation query: \"Find deployments for [service] before [incident_start_time]\"
  + Endpoint latency query: \"List top failing endpoints for [service] in last [time_window]\"
- Queries formatted as natural language questions suitable for NL→SPL tool
- Queries automatically populate NL→SPL Suggested Queries Section

### 4.3 Max Token Budget Enforcement Logic

**Purpose**: Control AI analysis output length by enforcing configurable token limit

**Configuration**:

- User configures max token budget in Settings → AI Analysis Configuration
- Default value: 8000 tokens
- Range: 1000-16000 tokens
- Configuration stored in localStorage via LlmContext

**Enforcement Process**:

1. When AI analysis starts, system retrieves configured token budget from localStorage
2. System initializes token counter at 0
3. During streaming response from Gemini 2.5 Flash LLM:
   - System counts tokens in each streamed chunk
   - System accumulates token count
   - After each chunk, system checks if accumulated count >= configured budget
4. When token count reaches or exceeds budget:
   - System stops streaming immediately
   - System saves partial analysis result to incident_analyses table
   - System displays partial result in UI
   - System displays message: \"Analysis stopped at token limit ([value] tokens)\"
5. If streaming completes before reaching budget:
   - System saves complete analysis result
   - System displays complete result in UI
   - No token limit message displayed

**Token Counting Method**:

- Use LLM API token count if available
- Otherwise estimate tokens using character count / 4 (approximate)

### 4.4 Analysis Export Logic

**Purpose**: Export incident analysis as PDF or Markdown file

**Export Process**:

1. User clicks \"Export Analysis\" button on incident detail panel
2. System displays format selection dropdown or modal (PDF or Markdown)
3. User selects desired format
4. System retrieves current analysis data from UI state or database
5. System assembles export content:
   - Incident metadata section:
     + Incident ID
     + Title
     + Severity
     + Service
     + Status
     + Opened timestamp
     + Time window
   - Analysis sections:
     + Executive Summary
     + Ranked Hypotheses (with confidence scores and evidence bullets)
     + Blast Radius
     + Recommended Actions
     + Open Questions
     + Timeline
     + Top Error Patterns
     + Recent Deployment/Change Events
     + Affected Services/Endpoints
6. For PDF format:
   - System uses browser print API or PDF generation library
   - Content formatted with proper headings, spacing, and styling
   - Filename: `incident_[ID]_analysis_[timestamp].pdf`
   - Browser triggers download
7. For Markdown format:
   - System generates .md file with Markdown syntax
   - Includes proper heading levels (#, ##, ###), lists (-, *), and code blocks (```)
   - Filename: `incident_[ID]_analysis_[timestamp].md`
   - Browser triggers download

**Markdown Format Example**:

```markdown
# Incident Analysis Report

## Incident Metadata

- **Incident ID**: INC-1001
- **Title**: checkout-service latency spike after deployment v1.8.3
- **Severity**: CRITICAL
- **Service**: checkout-service
- **Status**: OPEN
- **Opened At**: 2026-06-12 00:30:00
- **Time Window**: Last 30 minutes

## Executive Summary

[Summary text]

## Ranked Hypotheses

### Hypothesis 1: Deployment-related regression (Confidence: 0.85)

- Evidence 1
- Evidence 2

### Hypothesis 2: Database connection pool exhaustion (Confidence: 0.65)

- Evidence 1
- Evidence 2

## Blast Radius

- Affected services: checkout-service, payment-api
- Affected endpoints: /checkout, /payment

## Recommended Actions

1. Action 1
2. Action 2

## Open Questions

- Question 1
- Question 2

## Timeline

- 10:37 - Deployment v1.8.3 started
- 10:42 - Latency spike detected
- 10:45 - 5xx errors increased

## Top Error Patterns

- Error pattern 1
- Error pattern 2

## Recent Deployment/Change Events

- Deployment v1.8.3 at 10:37

## Affected Services/Endpoints

- checkout-service: /checkout, /payment
- payment-api: /process
```

### 4.5 Historical Analysis Storage Logic

**Purpose**: Persist analysis results for historical comparison

**Storage Process**:

1. After AI analysis completes (or stops at token limit), system saves analysis to incident_analyses table
2. Stored fields:
   - incident_id: ID of analyzed incident
   - analysis_timestamp: timestamp when analysis was generated
   - executive_summary: summary text
   - hypotheses: JSON array of hypothesis objects with title, confidence, evidence
   - recommended_actions: JSON array of action strings
   - open_questions: JSON array of question strings
   - timeline: JSON array of timeline event objects with timestamp and description
   - token_count: total tokens used in analysis
   - user_id: ID of user who triggered analysis
3. System enforces per-incident isolation (analyses grouped by incident_id)

**Retrieval Process**:

1. When user opens incident detail view, system queries incident_analyses table filtered by incident_id
2. System retrieves all analyses for current incident in reverse chronological order (newest first)
3. System displays analyses in Past Analyses panel

**Database Schema**:

- Table: incident_analyses
- Columns:
  + id (primary key)
  + incident_id (foreign key to live_incidents)
  + analysis_timestamp (timestamp)
  + executive_summary (text)
  + hypotheses (jsonb)
  + recommended_actions (jsonb)
  + open_questions (jsonb)
  + timeline (jsonb)
  + token_count (integer)
  + user_id (foreign key to users)

### 4.6 Analysis Comparison Logic

**Purpose**: Compare two historical analyses side-by-side with change highlights

**Comparison Process**:

1. User selects two analyses in Past Analyses panel by clicking checkboxes
2. User clicks \"Compare\" button
3. System retrieves both analyses from incident_analyses table
4. System determines earlier analysis (Analysis A) and later analysis (Analysis B) based on analysis_timestamp
5. System performs text diff comparison for each section:
   - Executive Summary
   - Hypotheses (compare hypothesis titles and evidence bullets)
   - Recommended Actions (compare action strings)
   - Open Questions (compare question strings)
   - Timeline (compare timeline events)
6. Diff algorithm identifies:
   - Added content: present in Analysis B but not in Analysis A
   - Removed content: present in Analysis A but not in Analysis B
   - Changed content: modified between analyses (e.g., hypothesis confidence score changed)
   - Unchanged content: identical in both analyses
7. System navigates to Analysis Comparison View
8. System renders both analyses side-by-side with synchronized scrolling
9. System applies visual highlights:
   - Added content: green background (#D1FAE5) with dark text (#065F46)
   - Removed content: red background (#FEE2E2) with dark text (#991B1B) and strikethrough
   - Changed content: yellow background (#FEF3C7) with dark text (#92400E)
   - Unchanged content: no highlight

**Diff Algorithm**:

- Use line-by-line or word-by-word diff algorithm (e.g., Myers diff algorithm)
- For structured data (hypotheses, actions, questions), compare JSON objects
- For text data (summary, timeline descriptions), compare strings

**Synchronized Scrolling**:

- When user scrolls left column, right column scrolls to same position
- When user scrolls right column, left column scrolls to same position
- Scroll position synchronized by percentage or pixel offset

### 4.7 Timeline Correlation Logic

**Purpose**: Correlate events to identify causal relationships

**Process**:

1. Collect all events within incident time window (deployments, config changes, alerts)
2. Sort events chronologically
3. Identify events occurring shortly before incident start (within 5-15 minutes)
4. Highlight temporal correlations in timeline display

### 4.8 Blast Radius Calculation

**Purpose**: Determine scope of incident impact

**Calculation**:

- Identify directly affected service from incident metadata
- Query service dependency graph to find downstream services
- Identify affected endpoints from error logs
- Aggregate into blast radius summary

### 4.9 Real-time Critical Incident Alerting Logic

**Purpose**: Notify users immediately when critical incidents occur

**Implementation**:

- System uses Supabase Realtime postgres_changes subscription on live_incidents table
- When new row inserted with severity CRITICAL or HIGH, trigger alert
- Frontend receives real-time event via Supabase Realtime
- System displays toast notification with incident details
- System shows alert banner at top of dashboard
- System logs alert to Notification Center
- Alert remains until user dismisses or incident status changes

**Fallback for Demo Mode**:

- When live_incidents table not available, system can simulate alerts by polling demo data
- Polling interval: every 30 seconds
- Simulated alerts use demo incident data

### 4.10 Simulate Alert Logic

**Purpose**: Test real-time alerting pipeline end-to-end

**Process**:

1. User clicks Simulate Alert button (Settings page or Dashboard header)
2. User selects severity (CRITICAL or HIGH) and optionally enters service name
3. System generates incident ID using sequential numbering (e.g., INC-2001, INC-2002)
4. System generates realistic incident title based on service and severity:
   - CRITICAL: \"[Service] critical failure detected\"
   - HIGH: \"[Service] high error rate spike\"
5. System inserts row into live_incidents table with:
   - incident_id: generated ID
   - title: generated title
   - severity: selected severity
   - service: entered service name or \"test-service\"
   - status: \"OPEN\"
   - opened_at: current timestamp
   - is_synthetic: true
6. System displays success toast: \"Test incident [ID] inserted successfully\"
7. Supabase Realtime subscription detects new row insertion
8. Frontend triggers alert banner and toast notification
9. System logs alert to Notification Center
10. User can verify alert pipeline works end-to-end

### 4.11 Scheduled Synthetic Alert Job Logic

**Purpose**: Continuously test real-time alert pipeline with automated synthetic incidents

**Implementation**:

- System uses Supabase Edge Function with pg_cron scheduled job
- Job runs every hour (cron expression: `0 * * * *`)
- Edge function name: synthetic-alert-job

**Job Process**:

1. Job triggers at top of every hour
2. System generates synthetic incident with following logic:
   - Rotate through service names: checkout-service, payment-api, auth-service, inventory-service, notification-service
   - Rotate through severity levels: CRITICAL, HIGH
   - Generate sequential incident ID (e.g., INC-3001, INC-3002)
   - Generate realistic incident title based on service and severity
3. System inserts row into live_incidents table with:
   - incident_id: generated ID
   - title: generated title (e.g., \"[Service] synthetic alert test\")
   - severity: rotated severity
   - service: rotated service name
   - status: \"OPEN\"
   - opened_at: current timestamp
   - is_synthetic: true
4. Supabase Realtime subscription detects insertion and triggers alert banner and toast notification
5. System logs alert to Notification Center
6. Job logs execution result to system logs

**Rotation Logic**:

- Service rotation: Use modulo operation based on hour of day (hour % 5)
- Severity rotation: Alternate between CRITICAL and HIGH (hour % 2)

**Database Schema Addition**:

- Add is_synthetic column to live_incidents table (boolean, default false)
- Allows filtering synthetic alerts from real incidents in UI

### 4.12 Natural Language SPL Generation Logic

**Purpose**: Convert natural language questions to SPL queries and execute via MCP Server

**Process**:

1. User enters natural language question in NL→SPL tab
2. User clicks \"Generate & Run SPL\" button
3. Frontend calls splunk-mcp Supabase Edge Function with question
4. Edge function sends question to Gemini 2.5 Flash LLM via <SKILL>large-language-model</SKILL>
5. LLM generates valid SPL query from question
6. If SPLUNK_MCP_URL configured:
   - Edge function sends SPL query to Splunk MCP Server /tools/call endpoint
   - Request body includes: tool: \"search\", arguments: {query: generated_spl}
   - MCP Server executes query and returns results
   - Edge function returns {spl: generated_spl, results: mcp_results}
7. If SPLUNK_MCP_URL not configured:
   - Edge function returns {spl: generated_spl, explanation: \"Demo mode: MCP not configured\"}
8. Frontend displays generated SPL and results or explanation
9. System saves query to spl_query_history table

**SPL Generation Guidelines**:

- LLM generates SPL based on common Splunk query patterns
- Includes time range, search terms, aggregations, and formatting
- Example: \"Show me error rate for checkout-service in the last 30 minutes\" → `index=main service=checkout-service earliest=-30m | stats count by status | where status>=400`

### 4.13 SPL Query History Persistence Logic

**Purpose**: Store and retrieve user's SPL query history for reuse

**Storage Process**:

1. After SPL query generation and execution, system saves query to spl_query_history table
2. Stored fields:
   - user_id: current authenticated user ID
   - query_text: natural language question entered by user
   - generated_spl: SPL query generated by LLM
   - timestamp: query execution timestamp
   - service_context: service name if available from incident context
   - incident_id: incident ID if query generated from incident analysis
3. System enforces per-user isolation (queries only visible to owner)

**Retrieval Process**:

1. When user opens NL→SPL tool, system queries spl_query_history table filtered by user_id
2. System retrieves queries in reverse chronological order (newest first)
3. System displays query history in Query History Panel

**Search Process**:

1. User enters keyword in search box at top of Query History Panel
2. System filters displayed history list in real-time
3. Filtering matches keyword against query_text and generated_spl fields (case-insensitive)
4. Filtering performed client-side on already-loaded history list
5. System displays filtered results or empty state if no matches

**Replay Process**:

1. User clicks any history item
2. System auto-populates query input area with query_text from history item
3. System automatically triggers \"Generate & Run SPL\" action
4. System displays generated SPL and execution results

**Clear History Process**:

1. User clicks \"Clear History\" button
2. System displays confirmation dialog
3. User confirms deletion
4. System deletes all rows from spl_query_history table where user_id matches current user
5. System refreshes Query History Panel to show empty state

### 4.14 Synthetic Incident Filter Logic

**Purpose**: Hide synthetic test incidents from incident list

**Process**:

1. System loads all incidents from live_incidents table
2. If synthetic filter toggle is ON (default):
   - System filters out incidents where is_synthetic = true
   - System counts number of filtered incidents
   - System displays count badge (e.g., \"3 hidden\")
3. If synthetic filter toggle is OFF:
   - System displays all incidents including synthetic ones
   - Synthetic incidents marked with \"TEST\" badge
4. Toggle state persists in user session (localStorage or session state)

### 4.15 Advanced Incident Filtering Logic

**Purpose**: Filter incident list by keyword, severity, and status

**Process**:

1. System loads all incidents from live_incidents table
2. Apply synthetic filter if enabled
3. Apply keyword filter:
   - Match keyword against incident title, service name, and incident ID (case-insensitive)
4. Apply severity filter:
   - Include only incidents with selected severity levels
5. Apply status filter:
   - Include only incidents with selected statuses
6. All filters use AND logic (incident must match all active filters)
7. System displays filtered incident list
8. Filter state persists in user session

### 4.16 Incident Deduplication Detection Logic

**Purpose**: Identify potential duplicate incidents affecting same service

**Process**:

1. When new incident is inserted with status OPEN:
   - System checks if another OPEN incident exists for same service
2. If duplicate found:
   - System adds deduplication indicator to incident card
   - Indicator shows other incident ID and service name
3. When one of the duplicate incidents is resolved:
   - System removes deduplication indicator from remaining incident

### 4.17 Notification Center Logic

**Purpose**: Persist and display full alert notification history

**Implementation**:

- System uses alert_notifications table to store all alert events
- When CRITICAL or HIGH incident triggers alert:
  + System inserts row into alert_notifications table with:
    - user_id: current authenticated user
    - incident_id: incident ID
    - severity: incident severity
    - service: service name
    - title: incident title
    - timestamp: alert timestamp
    - is_read: false
- Notification Center displays all alerts for current user
- User can mark alerts as read or clear notification history
- Unread count badge updates in real-time

**Database Schema**:

- Table: alert_notifications
- Columns: id, user_id, incident_id, severity, service, title, timestamp, is_read

### 4.18 SPL Query Deep-Link Logic

**Purpose**: Generate and handle shareable deep-link URLs for SPL queries

**URL Generation**:

1. User clicks \"Share\" button after SPL query is generated
2. System constructs URL with following format:
   - Base URL: `https://[app-domain]/dashboard`
   - Query parameters:
     + `nlq`: URL-encoded natural language question
     + `service`: service name from incident context (if available)
   - Example: `https://app.sentinelops.com/dashboard?nlq=Show%20error%20rate%20for%20checkout-service&service=checkout-service`
3. System copies URL to clipboard using browser Clipboard API
4. System displays toast notification: \"Link copied!\"

**URL Handling**:

1. When user opens deep-link URL:
   - System extracts `nlq` and `service` query parameters
   - System decodes `nlq` parameter
2. System auto-populates NL→SPL query input with decoded question
3. If `service` parameter matches current incident context:
   - System auto-executes query
4. If `service` parameter does not match or is missing:
   - System populates query input but does not auto-execute
   - User can manually click \"Generate & Run SPL\" button

### 4.19 CSV Export Logic

**Purpose**: Export SPL query results as CSV file

**Process**:

1. After SPL query executes and results are displayed
2. User clicks \"Export CSV\" button
3. System converts results table to CSV format:
   - First row: column headers
   - Subsequent rows: result data
   - Fields separated by commas
   - Text fields enclosed in double quotes if they contain commas or quotes
4. System generates filename: `spl_results_[timestamp].csv`
5. System triggers browser download using Blob API
6. CSV file downloads to user's default download location

### 4.20 Export Content Generation

**Markdown Report**:

- Includes incident ID, title, severity, status, time window
- Includes AI brief summary
- Includes all hypotheses with evidence
- Includes blast radius and timeline
- Includes recommended actions

**Slack-style Update**:

- Concise format with severity emoji equivalent (text-based)
- Key findings and recommended actions
- Link to full analysis

**Jira-style Summary**:

- Structured format with sections: Summary, Impact, Root Cause Analysis, Next Steps
- Suitable for pasting into Jira ticket description

**PowerPoint Briefing**:

- Generated using ppt-generator skill
- Contains 6 slides covering incident overview, analysis, and recommendations
- Confidence scores visualized as horizontal bars
- Timeline presented chronologically with timestamps
- Formatted for executive stakeholder presentation

### 4.21 PagerDuty Auto-Sync Logic

**Purpose**: Automatically synchronize PagerDuty incidents on configurable interval

**Configuration**:

- User enables Auto-Sync toggle in Settings → PagerDuty section
- User configures sync interval (default 60 seconds, range 30-3600 seconds)
- Configuration persisted in app_config table or user settings

**Background Sync Process**:

1. When auto-sync is enabled, system starts background sync job
2. Job runs on configured interval (e.g., every 60 seconds)
3. Job calls PagerDuty API to retrieve incidents:
   - Endpoint: `/incidents`
   - Filters: status=triggered,acknowledged
   - Time range: last 24 hours
4. For each PagerDuty incident:
   - System checks if incident already exists in live_incidents table (match by external_id)
   - If new incident: insert row into live_incidents table with:
     + incident_id: generated ID
     + title: PagerDuty incident title
     + severity: mapped from PagerDuty urgency (high → CRITICAL, low → HIGH)
     + service: extracted from PagerDuty service name
     + status: mapped from PagerDuty status (triggered → OPEN, acknowledged → INVESTIGATING)
     + opened_at: PagerDuty created_at timestamp
     + external_id: PagerDuty incident ID
     + is_synthetic: false
   - If existing incident: update status and other fields if changed
5. System updates last_synced_at timestamp in app_config
6. Job logs sync result (success/failure, number of incidents synced)

**Live Timestamp Display**:

- Settings page displays \"Last synced X seconds ago\" or \"Last synced at [timestamp]\"
- Timestamp updates every second when auto-sync is enabled
- Calculation: current_time - last_synced_at
- Format: \"Last synced 15 seconds ago\" (if < 60s), \"Last synced 2 minutes ago\" (if < 60m), \"Last synced at 2026-05-24 10:30:45\" (if > 60m)

**Manual Sync**:

- When auto-sync is disabled, user can click \"Sync Now\" button to trigger one-time sync
- Manual sync follows same process as background sync

**Error Handling**:

- If PagerDuty API call fails, system logs error and retries on next interval
- System displays error message in Settings page if sync fails repeatedly
- System does not stop background job on transient failures

### 4.22 Built-in SPL Query Templates Logic

**Purpose**: Provide curated library of parameterized SPL query templates for common use cases

**Template Loading**:

- System pre-loads 8 built-in templates when Saved Queries Panel is opened
- Templates stored in frontend code or backend configuration (not in database)
- Templates are read-only and cannot be modified or deleted by users

**Template Parameterization**:

- Each template contains placeholders: `{service}` and `{time_window}`
- When user clicks template:
  + System loads template SPL into NL→SPL query input area
  + System replaces placeholders with current incident context:
    - `{service}` → current incident service name (e.g., \"checkout-service\")
    - `{time_window}` → current incident time window (e.g., \"-30m\" for last 30 minutes)
  + If no incident context available, system prompts user to enter service name and time window
- User can edit parameterized query before running

**Template Execution**:

- After template is loaded and parameterized, user clicks \"Generate & Run SPL\" button
- System executes parameterized SPL query via Splunk MCP Server or REST API
- System displays query results in Query Results Area

**Template List**:

1. Error Rate Analysis
2. Latency Percentiles (p50/p95/p99)
3. Deployment Correlation
4. Top Error Messages
5. User Impact (Distinct Users Affected)
6. Service Availability
7. Log Volume Anomaly Detection
8. Slow Endpoint Detection

### 4.23 Drag-to-Reorder Alert Routing Rules Logic

**Purpose**: Allow users to prioritize alert routing rules by dragging them up or down

**Drag-and-Drop Implementation**:

- Each alert rule card displays drag handle icon (vertical dots or hamburger icon) on left side
- User clicks and holds drag handle to initiate drag
- System provides visual feedback:
  + Dragged card elevates with shadow effect
  + Drop zones highlighted between rule cards
  + Placeholder shown at drop position
- User drags card up or down to reorder
- User releases mouse to drop card at new position
- System updates rule order immediately in UI

**Priority Badge Update**:

- Each rule card displays priority badge (#1, #2, #3, etc.) at top-left corner
- Badge color-coded by priority:
  + #1: Red (highest priority)
  + #2-3: Orange (high priority)
  + #4+: Blue (normal priority)
- When user reorders rules via drag-and-drop:
  + System recalculates priority numbers based on new order
  + Priority badges update live during drag operation
  + Badge colors update based on new priority

**Rule Evaluation Order**:

- Alert routing rules are evaluated in order from top to bottom (#1 to last)
- When new alert is triggered:
  + System evaluates rules in priority order
  + First matching rule determines alert routing (notification channels, assignees)
  + Subsequent rules are not evaluated after first match

**Persistence**:

- User clicks \"Save Rules\" button to persist new rule order
- System saves rule order to alert_rules table with priority field
- System displays success toast: \"Rule order saved\"
- If user navigates away without saving, system prompts confirmation dialog

**Database Schema**:

- Table: alert_rules
- Columns: id, user_id, rule_name, conditions, actions, priority (integer, 1 = highest)

### 4.24 Mark as Resolved Logic

**Purpose**: Allow users to mark incidents as resolved with timestamp

**Process**:

1. User clicks \"Mark as Resolved\" button on incident card
2. System updates incident in live_incidents table:
   - status: RESOLVED
   - resolved_at: current timestamp (2026-06-12 00:45:30)
3. System displays success toast: \"Incident [ID] marked as resolved\"
4. Incident card updates immediately to show RESOLVED status badge
5. Mark as Resolved button disappears from card
6. Resolved incident disappears from Dashboard incident list (filtered out)
7. If incident had deduplication indicator, system removes indicator from related incidents

**Database Schema Update**:

- Table: live_incidents
- Add column: resolved_at (timestamp, nullable)

### 4.25 30-day Rolling MTTR Calculation Logic

**Purpose**: Calculate and display Mean Time to Resolve trend over 30-day rolling window

**Calculation Process**:

1. System queries live_incidents table for incidents resolved in last 30 days
2. For each day in last 30 days:
   - Filter incidents where resolved_at date matches current day
   - For each incident, calculate MTTR: (resolved_at - opened_at) in minutes
   - Calculate average MTTR for all incidents resolved that day
   - If no incidents resolved on that day, MTTR = null (no data point)
3. System generates array of data points: [{date: \"2026-05-13\", mttr: 45}, {date: \"2026-05-14\", mttr: 52}, ...]
4. System renders line chart with data points

**Demo Mode Fallback**:

- If no real data available (no resolved incidents in last 30 days), system displays demo curve
- Demo curve shows realistic MTTR values with slight variation (e.g., 40-60 minutes)

**Chart Display**:

- X-axis: Date (daily, format: \"MMM DD\")
- Y-axis: Average MTTR in minutes
- Line chart with data points connected
- Tooltip shows date and MTTR value on hover

### 4.26 Print-Preview Modal Logic

**Purpose**: Allow users to select sections for PDF export

**Modal Workflow**:

1. User clicks \"Export PDF\" button on Analytics page
2. System opens Print-Preview Modal
3. Modal displays checkboxes for each exportable section
4. All checkboxes selected by default
5. User can select/deselect any checkbox
6. At least one checkbox must be selected to enable \"Export PDF\" button inside modal
7. User clicks \"Export PDF\" button inside modal
8. System hides all unselected sections in DOM (using CSS display: none or visibility: hidden)
9. System calls window.print() to trigger browser print dialog
10. User can save as PDF or print to printer
11. After print dialog closes, system restores all sections to visible state
12. System closes modal

**Section Visibility Control**:

- System uses CSS classes or inline styles to hide/show sections
- Hidden sections are not rendered in print output
- Visible sections maintain original layout and styling

### 4.27 Light-Mode Contrast Fix Logic

**Purpose**: Ensure all UI components meet WCAG AA contrast ratio (≥4.5:1) in light mode

**Affected Components**:

- Severity chips (CRITICAL/HIGH/MEDIUM/LOW)
- Status badges (OPEN/INVESTIGATING/RESOLVED)
- Alert banners
- Chart axes tick labels
- Tooltip text
- Card backgrounds
- All text on white or light backgrounds

**Implementation Strategy**:

- Replace all hardcoded dark-palette HSL values (e.g., text-teal-300, bg-teal-950, text-slate-400) with adaptive semantic tokens
- Use CSS utility classes that switch correctly between dark and light themes
- Example:
  + Dark mode: text-teal-300 (light text on dark background)
  + Light mode: text-teal-700 (dark text on light background)
- Apply fixes across all pages: SettingsPage, AnalyticsPage, DashboardPage, and shared components

**Severity Chip Colors (Light Mode)**:

- CRITICAL: Red background (#DC2626) with white text (#FFFFFF)
- HIGH: Orange background (#EA580C) with white text (#FFFFFF)
- MEDIUM: Yellow background (#CA8A04) with black text (#000000)
- LOW: Blue background (#2563EB) with white text (#FFFFFF)

**Status Badge Colors (Light Mode)**:

- OPEN: Red background (#DC2626) with white text (#FFFFFF)
- INVESTIGATING: Orange background (#EA580C) with white text (#FFFFFF)
- RESOLVED: Green background (#16A34A) with white text (#FFFFFF)

**Chart Label Colors (Light Mode)**:

- Axis labels: Dark gray (#374151)
- Tick labels: Dark gray (#374151)
- Tooltip text: Black (#000000) on white background (#FFFFFF)

**Validation**:

- All color combinations must meet WCAG AA contrast ratio (≥4.5:1)
- Use contrast checker tools to validate all color pairs

### 4.28 MTTR Threshold Alert Logic

**Purpose**: Monitor 7-day rolling average MTTR and display warning when threshold exceeded

**Configuration**:

- User enables MTTR Threshold Alert toggle in Settings
- User configures threshold value in minutes (default 60, range 1-1440)
- Configuration persisted in app_config table or user settings

**7-day Rolling MTTR Calculation**:

1. System queries live_incidents table for incidents resolved in last 7 days
2. For each resolved incident:
   - Calculate MTTR: (resolved_at - opened_at) in minutes
3. Calculate average MTTR across all incidents resolved in last 7 days
4. Result is 7-day rolling average MTTR

**Threshold Monitoring**:

- When MTTR threshold alert is enabled:
  + System calculates 7-day rolling average MTTR on Dashboard and Analytics page load
  + System compares rolling average against configured threshold
  + If rolling average > threshold:
    - System displays MTTR Threshold Warning Banner on Dashboard and Analytics pages
  + If rolling average ≤ threshold:
    - System hides warning banner
- Threshold check runs on every page load and after incident status changes

**Warning Banner Display**:

- Banner appears at top of Dashboard (below header, above alert banner) and Analytics page
- Banner message: \"Warning: 7-day rolling average MTTR ([value] minutes) exceeds threshold ([threshold] minutes)\"
- Banner background: Yellow/orange with WCAG AA contrast text in light mode
- User can dismiss banner
- Banner reappears on next page load if condition still met

### 4.29 Auto-Resolve Rule Logic

**Purpose**: Automatically resolve stale incidents after configured timeout

**Configuration**:

- User enables Auto-Resolve Rule toggle in Settings
- User configures timeout duration in hours (default 4, range 1-168)
- Configuration persisted in app_config table or user settings

**Stale Incident Detection**:

- System monitors incidents with status OPEN or INVESTIGATING
- Incident is considered stale when:
  + Current time - updated_at > configured timeout duration
  + updated_at field tracks last modification timestamp (status change, comment, etc.)

**Auto-Resolve Process**:

- System runs auto-resolve check via Supabase Edge Function on scheduled basis (e.g., every 15 minutes) or on Dashboard page load
- Edge function queries live_incidents table for stale incidents:
  + Filter: status IN ('OPEN', 'INVESTIGATING')
  + Filter: updated_at < (current_time - timeout_duration)
- For each stale incident:
  + System updates incident:
    - status: RESOLVED
    - resolved_at: current timestamp
  + System logs auto-resolve action to incident history or audit log
- System displays toast notification: \"[count] stale incidents auto-resolved\"

**Database Schema Update**:

- Table: live_incidents
- Add column: updated_at (timestamp, default current_timestamp, updated on any modification)

### 4.30 Bulk-Select Mode Logic

**Purpose**: Enable batch resolution of multiple incidents

**Activation**:

- User clicks \"Select\" toggle button at top of incident list
- Bulk-select mode activates
- Checkboxes appear on each incident card
- Select All / Deselect All actions appear
- Resolve Selected button appears at bottom of incident list

**Selection Process**:

- User clicks checkbox on incident card to select/deselect
- User clicks \"Select All\" to check all visible incident checkboxes
- User clicks \"Deselect All\" to uncheck all incident checkboxes
- Selected incidents visually highlighted
- Selection state tracked in frontend component state

**Batch Resolution**:

1. User clicks \"Resolve Selected\" button
2. System displays confirmation dialog: \"Resolve [count] selected incidents?\"
3. User confirms
4. System collects IDs of all selected incidents with status OPEN or INVESTIGATING
5. System performs single Supabase batch update:
   - Update live_incidents table
   - Set status = 'RESOLVED' and resolved_at = current_timestamp
   - Where incident_id IN (selected_ids) AND status IN ('OPEN', 'INVESTIGATING')
6. System displays success toast: \"[count] incidents resolved\"
7. Incident cards update immediately to show RESOLVED status
8. Resolved incidents disappear from Dashboard incident list (filtered out)
9. Bulk-select mode automatically turns OFF
10. Checkboxes disappear from incident cards

**Deactivation**:

- User clicks \"Select\" toggle button again to turn OFF bulk-select mode
- Checkboxes disappear
- Select All / Deselect All actions disappear
- Resolve Selected button disappears
- Selection state cleared

### 4.31 Dashboard Incident List Filtering Logic

**Purpose**: Exclude resolved incidents from Dashboard incident list

**Filtering Process**:

1. System queries live_incidents table
2. Apply base filter: status IN ('OPEN', 'INVESTIGATING')
3. Apply synthetic filter if enabled: is_synthetic = false
4. Apply advanced filters (keyword, severity, status)
5. System displays filtered incident list on Dashboard
6. Resolved incidents (status = 'RESOLVED') never appear on Dashboard

**Status Filter Options**:

- Dashboard status filter dropdown shows only: OPEN, INVESTIGATING
- RESOLVED option not available in Dashboard status filter
- Default: OPEN and INVESTIGATING selected

### 4.32 Incident History Page Logic

**Purpose**: Display complete incident history including resolved incidents

**Data Loading**:

1. System queries live_incidents table for all incidents
2. No base status filter applied (includes OPEN, INVESTIGATING, RESOLVED)
3. Apply user-selected filters (status, severity, service, date range)
4. System displays filtered incidents in table format
5. Default date range: last 30 days
6. Default status filter: All

**MTTR Calculation**:

- For each incident in table:
  + If status = RESOLVED and resolved_at is not null:
    - Calculate MTTR: (resolved_at - opened_at) in minutes
    - Display MTTR value in MTTR column
  + If status ≠ RESOLVED or resolved_at is null:
    - Display empty cell or \"N/A\" in MTTR column

**Pagination**:

- Default page size: 50 rows per page
- User can change page size: 25, 50, 100 rows per page
- Pagination controls at bottom of table
- Previous/Next buttons to navigate pages
- Jump to page input

**Sorting**:

- Default sort: Opened At timestamp (newest first)
- User can click column headers to sort by that column
- Supported sort columns: ID, Title, Service, Severity, Status, Opened At, Resolved At, MTTR
- Sort order toggles between ascending and descending

**Navigation**:

- User clicks any table row to navigate to incident detail view
- Incident detail view shows full incident information and analysis results

## 5. Exception and Boundary Conditions

| Scenario                              | Handling                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Splunk integration fails              | Fall back to demo mode gracefully, display notice to user                                     |
| Invalid Splunk credentials            | Display error message in settings, prevent saving invalid configuration                       |
| Splunk connection timeout             | Display timeout error, suggest checking SPLUNK_HOST and network connectivity                  |
| Invalid MCP credentials               | Display error message in settings, prevent saving invalid MCP configuration                   |
| MCP Server connection timeout         | Display timeout error, suggest checking SPLUNK_MCP_URL and network connectivity               |
| MCP Server returns error              | Display error message, fall back to REST API or demo mode                                     |
| No evidence found for incident        | Display message indicating insufficient data, suggest expanding time window                   |
| AI brief generation fails             | Display error message, allow retry, fall back to raw evidence display                         |
| Token budget reached during streaming | Stop streaming gracefully, save partial result, display token limit message                   |
| Token counting fails                  | Use character count / 4 as fallback estimate                                                  |
| Export Analysis button clicked but no analysis available | Display error message \"No analysis to export\"                          |
| PDF generation fails                  | Display error message, allow retry                                                            |
| Markdown generation fails             | Display error message, allow retry                                                            |
| Browser blocks file download          | Display message instructing user to allow downloads                                           |
| incident_analyses table not exists    | Display error message, Past Analyses panel unavailable                                        |
| Analysis save to database fails       | Display error toast, analysis still displayed in UI but not persisted                         |
| Past Analyses panel load fails        | Display error message, show empty state                                                       |
| User selects only one analysis for comparison | Disable Compare button, display message \"Select two analyses to compare\"              |
| User selects more than two analyses   | Disable Compare button, display message \"Select exactly two analyses to compare\"              |
| Analysis comparison diff fails        | Display error message, show both analyses without highlights                                  |
| Synchronized scrolling fails          | Display warning, allow independent scrolling                                                  |
| Export Diff button clicked but comparison not loaded | Display error message \"No comparison to export\"                            |
| Follow-up question timeout            | Display timeout message, allow retry                                                          |
| Export generation fails               | Display error message, allow retry                                                            |
| PowerPoint generation fails           | Display error message indicating PPT export failure, allow retry                              |
| OCR upload fails                      | Display error message indicating image processing failure                                     |
| Web search returns no results         | Display \"No results found\" message                                                            |
| Invalid time window selected          | Display validation error, suggest valid time range                                            |
| User not authenticated                | Redirect to login page                                                                        |
| Sample data files missing             | Display error message indicating demo mode unavailable                                        |
| live_incidents table not exists       | Fall back to polling demo data for alert simulation                                           |
| Realtime subscription fails           | Display warning, fall back to manual refresh or polling                                       |
| Multiple critical incidents at once   | Stack toast notifications, show count in alert banner                                         |
| PPT file download blocked by browser  | Display message instructing user to allow downloads                                           |
| SPLUNK_HOST or SPLUNK_TOKEN empty     | Automatically use Demo Mode, display indicator in UI                                          |
| Simulate Alert button clicked without selecting severity | Display validation error requiring severity selection                      |
| Simulate Alert insert fails           | Display error toast with failure reason                                                       |
| NL→SPL query generation fails         | Display error message, allow retry                                                            |
| Generated SPL is invalid              | Display warning, show generated SPL for user review                                           |
| MCP Server /tools/call endpoint fails | Display error message, return generated SPL without execution results                         |
| Natural language question is ambiguous| LLM generates best-effort SPL, user can refine question                                       |
| Scheduled synthetic alert job fails   | Log error to system logs, retry on next scheduled run                                         |
| pg_cron job not configured            | Display warning in settings, synthetic alerts will not run                                    |
| spl_query_history table not exists    | Display error message, query history feature unavailable                                      |
| Query history retrieval fails         | Display error message, show empty state                                                       |
| Clear history operation fails         | Display error toast, allow retry                                                              |
| Suggested queries generation fails    | Display warning, NL→SPL tool remains functional without suggestions                           |
| User clicks suggested query chip but generation fails | Display error message, allow manual retry                                  |
| Query history exceeds display limit   | Implement pagination or limit display to most recent 50 queries                               |
| Synthetic filter toggle fails         | Display error message, show all incidents without filtering                                   |
| Advanced filter application fails     | Display error message, reset filters to default state                                         |
| Deduplication detection fails         | Log error, continue without showing deduplication indicator                                   |
| Notification Center load fails        | Display error message, show empty state                                                       |
| Alert notification insert fails       | Log error, continue with toast and banner display                                             |
| Deep-link URL generation fails        | Display error toast, allow manual copy of query text                                          |
| Deep-link URL parsing fails           | Display error message, redirect to dashboard without auto-populating query                    |
| CSV export fails                      | Display error toast, allow retry                                                              |
| CSV download blocked by browser       | Display message instructing user to allow downloads                                           |
| Query history search returns no results | Display empty state message \"No matching queries found\"                                      |
| Clipboard API not available           | Display error message, show URL in modal for manual copy                                      |
| PagerDuty API token invalid           | Display error message in settings, prevent saving invalid token                               |
| PagerDuty API call fails              | Log error, retry on next sync interval, display error in settings if repeated failures        |
| PagerDuty API returns no incidents    | Display \"No incidents found\" message, update last_synced_at timestamp                         |
| Auto-sync interval out of range       | Display validation error, enforce min/max range (30-3600 seconds)                             |
| Auto-sync toggle enabled without API token | Display error message, disable toggle until token configured                              |
| Background sync job crashes           | Log error, restart job on next interval                                                       |
| Template parameterization fails       | Display error message, show template with placeholders for manual editing                     |
| No incident context for template      | Prompt user to enter service name and time window manually                                    |
| Template execution fails              | Display error message, allow retry                                                            |
| Drag-and-drop operation fails         | Display error message, reset rule order to last saved state                                   |
| Save rule order fails                 | Display error toast, allow retry                                                              |
| User navigates away without saving rule order | Display confirmation dialog: \"Unsaved changes will be lost. Continue?\"                |
| alert_rules table not exists          | Display error message, drag-to-reorder feature unavailable                                    |
| Priority badge calculation fails      | Display error message, show rules without priority badges                                     |
| Mark as Resolved button clicked but update fails | Display error toast with failure reason, allow retry                               |
| resolved_at timestamp not set         | Display error message, incident remains in previous status                                    |
| MTTR calculation fails (no resolved incidents) | Display demo curve with realistic MTTR values                                        |
| MTTR chart rendering fails            | Display error message, show empty chart area                                                  |
| Print-Preview Modal fails to open     | Display error toast, allow retry                                                              |
| No sections selected in modal         | Disable \"Export PDF\" button inside modal                                                      |
| window.print() fails                  | Display error message, suggest using browser print function manually                          |
| Section visibility toggle fails       | Display error message, show all sections in print output                                      |
| Light-mode contrast validation fails  | Log warning, continue with current color scheme                                               |
| Adaptive semantic tokens not applied  | Display error message, fall back to default theme colors                                      |
| MTTR threshold value out of range     | Display validation error, enforce min/max range (1-1440 minutes)                              |
| MTTR threshold toggle enabled but threshold not set | Use default threshold value (60 minutes)                                          |
| 7-day rolling MTTR calculation fails (no resolved incidents in last 7 days) | Hide warning banner, display \"Insufficient data\" message in settings |
| Auto-resolve timeout value out of range | Display validation error, enforce min/max range (1-168 hours)                                |
| Auto-resolve toggle enabled but timeout not set | Use default timeout value (4 hours)                                                   |
| Auto-resolve Edge Function fails      | Log error, retry on next scheduled run                                                        |
| updated_at field not set on incident  | Use opened_at as fallback for stale detection                                                 |
| Bulk-select mode activated but no incidents visible | Display message \"No incidents to select\"                                          |
| Resolve Selected clicked with no incidents selected | Display validation error \"No incidents selected\"                                  |
| Batch update fails for some incidents | Display partial success message with count of successfully resolved incidents                 |
| Incident History page load fails      | Display error message, allow retry                                                            |
| Incident History table query timeout  | Display timeout error, suggest reducing date range or applying more filters                   |
| Incident History pagination fails     | Display error message, reset to first page                                                    |
| Incident History sort fails           | Display error message, reset to default sort order                                            |
| Incident History filter application fails | Display error message, reset filters to default state                                        |
| MTTR column calculation fails for specific incident | Display \"N/A\" in MTTR column for that incident                                    |
| User clicks incident row but detail view fails to load | Display error message, allow retry                                            |
| Max token budget slider value out of range | Display validation error, enforce min/max range (1000-16000 tokens)                      |
| Max token budget not set in localStorage | Use default value (8000 tokens)                                                          |
| Token budget configuration save fails | Display error toast, allow retry                                                              |
| Analysis export format selection fails | Display error message, allow retry                                                           |
| No analysis sections available for export | Display error message \"No analysis content to export\"                                     |
| Past Analyses panel displays no analyses | Display empty state message \"No previous analyses found\"                                  |
| User selects same analysis twice for comparison | Display error message \"Cannot compare analysis with itself\"                          |
| Analysis comparison view navigation fails | Display error message, return to incident detail view                                     |
| Diff algorithm fails to detect changes | Display both analyses without highlights, log warning                                         |
| Export Diff format selection fails    | Display error message, allow retry                                                            |

## 6. Acceptance Criteria

1. User logs in with username and password
2. User navigates to Settings page and configures SPLUNK_HOST and SPLUNK_TOKEN
3. System validates connection and displays \"Connected to Splunk\" indicator
4. User configures SPLUNK_MCP_URL and SPLUNK_MCP_TOKEN in Settings page
5. System validates MCP connection and displays \"MCP Connected\" indicator
6. User configures PAGERDUTY_API_TOKEN in Settings → PagerDuty section
7. System validates PagerDuty connection and displays \"Connected\" status
8. User enables PagerDuty Auto-Sync toggle
9. User sets sync interval to 120 seconds
10. User clicks Save Configuration button
11. System starts background sync job and displays \"Last synced 0 seconds ago\"
12. System automatically syncs PagerDuty incidents every 120 seconds
13. Live timestamp updates every second showing elapsed time since last sync
14. User enables MTTR Threshold Alert toggle in Settings
15. User sets threshold value to 60 minutes
16. User clicks Save Configuration button
17. System persists MTTR threshold configuration
18. User enables Auto-Resolve Rule toggle in Settings
19. User sets timeout duration to 4 hours
20. User clicks Save Configuration button
21. System persists auto-resolve rule configuration
22. User adjusts Max Token Budget slider to 4000 tokens in Settings → AI Analysis Configuration
23. User clicks Save Configuration button
24. System persists token budget to localStorage via LlmContext
25. User clicks Simulate Alert button in Settings page
26. User selects CRITICAL severity and enters \"checkout-service\" as service name
27. System inserts test incident into live_incidents table with is_synthetic = true and displays success toast
28. Alert banner appears at top of dashboard showing test incident
29. Toast notification appears showing test incident details
30. Notification Center bell icon shows unread count badge
31. User clicks bell icon and sees alert logged in Notification Center
32. User returns to Incident Dashboard and sees Live Mode indicator
33. System calculates 7-day rolling average MTTR
34. If rolling average exceeds 60 minutes, MTTR Threshold Warning Banner appears on Dashboard
35. Warning banner displays message: \"Warning: 7-day rolling average MTTR ([value] minutes) exceeds threshold (60 minutes)\"
36. User dismisses warning banner
37. User sees synthetic incident filter toggle at top of incident list, defaulting to ON
38. System displays count badge showing number of hidden synthetic incidents
39. User toggles synthetic filter OFF and sees test incident with \"TEST\" badge
40. User toggles synthetic filter back ON and test incident is hidden
41. User sees only OPEN and INVESTIGATING incidents in Dashboard incident list (RESOLVED incidents excluded)
42. User enters keyword \"checkout\" in incident list search box
43. System filters incident list to show only incidents matching keyword
44. User selects CRITICAL severity in severity filter
45. System filters incident list to show only CRITICAL incidents
46. User selects OPEN status in status filter
47. System filters incident list to show only OPEN incidents
48. User sees deduplication indicator on incident card when multiple OPEN incidents affect same service
49. User clicks \"Select\" toggle button at top of incident list
50. Bulk-select mode activates, checkboxes appear on incident cards
51. Select All / Deselect All actions appear
52. Resolve Selected button appears at bottom of incident list
53. User clicks \"Select All\" button
54. All visible incident checkboxes are checked
55. User clicks \"Resolve Selected\" button
56. System displays confirmation dialog: \"Resolve [count] selected incidents?\"
57. User confirms
58. System batch-updates all selected OPEN/INVESTIGATING incidents to RESOLVED with resolved_at timestamp
59. System displays success toast: \"[count] incidents resolved\"
60. Resolved incidents disappear from Dashboard incident list
61. Bulk-select mode automatically turns OFF
62. User clicks History Page link in Dashboard header
63. System navigates to Incident History page (/history)
64. Incident History page displays filterable, paginated table with all incidents (OPEN, INVESTIGATING, RESOLVED)
65. Table shows columns: ID, Title, Service, Severity, Status, Opened At, Resolved At, MTTR
66. User selects RESOLVED status in status filter
67. System filters table to show only RESOLVED incidents
68. User selects date range: 2026-05-13 to 2026-06-12
69. System filters table to show only incidents opened within date range
70. User sees MTTR values in MTTR column for resolved incidents (calculated as resolved_at - opened_at in minutes)
71. User clicks incident row in table
72. System navigates to incident detail view
73. User returns to Dashboard
74. User views incident list and selects INC-1001 (checkout-service latency spike)
75. User clicks \"Analyze Incident\" button
76. System displays AI brief with summary, ranked hypotheses, blast radius, timeline, and recommended actions (using MCP Server if configured)
77. System monitors token count during streaming
78. When token count reaches 4000 tokens, streaming stops gracefully
79. System displays partial analysis result
80. System displays message: \"Analysis stopped at token limit (4000 tokens)\"
81. System saves partial analysis to incident_analyses table
82. System auto-populates NL→SPL tool with top 3 suggested queries
83. User clicks \"Export Analysis\" button on incident detail panel
84. System displays format selection dropdown (PDF or Markdown)
85. User selects PDF format
86. System generates PDF file with incident metadata and all analysis sections
87. Browser downloads PDF file: `incident_INC-1001_analysis_[timestamp].pdf`
88. User clicks \"Export Analysis\" button again
89. User selects Markdown format
90. System generates Markdown file with proper syntax
91. Browser downloads Markdown file: `incident_INC-1001_analysis_[timestamp].md`
92. User opens Past Analyses panel on incident detail view
93. System displays list of historical analyses for INC-1001
94. Each analysis entry shows timestamp, version number, and brief summary
95. User clicks checkbox next to first analysis (Analysis #1)
96. User clicks checkbox next to second analysis (Analysis #2)
97. \"Compare\" button becomes enabled
98. User clicks \"Compare\" button
99. System navigates to Analysis Comparison View
100. System displays both analyses side-by-side with synchronized scrolling
101. System applies visual highlights:
     - Added content: green background
     - Removed content: red background with strikethrough
     - Changed content: yellow background
     - Unchanged content: no highlight
102. User scrolls left column, right column scrolls to same position
103. User clicks \"Export Diff\" button
104. System displays format selection dropdown (PDF or Markdown)
105. User selects PDF format
106. System generates PDF file with side-by-side comparison
107. Browser downloads PDF file: `incident_INC-1001_comparison_[timestamp].pdf`
108. User clicks back button to return to incident detail view
109. User opens Saved Queries Panel and sees Templates category
110. User clicks \"Error Rate Analysis\" template
111. System loads template into NL→SPL query input with parameterized service name and time window
112. User clicks \"Generate & Run SPL\" button
113. System executes parameterized SPL query and displays results
114. User clicks \"Latency Percentiles\" template
115. System loads template with current incident context and executes query
116. User clicks \"Export CSV\" button in query results area
117. System downloads CSV file with query results
118. User clicks \"Share\" button next to \"Copy SPL\" button
119. System copies deep-link URL to clipboard and displays \"Link copied!\" toast
120. User navigates to Query History Panel in NL→SPL tool
121. System displays list of previously generated queries with timestamps
122. User enters keyword \"error\" in query history search box
123. System filters query history list to show only queries matching keyword
124. User clicks a query from filtered history
125. System replays query and displays results
126. User clicks \"Clear History\" button and confirms deletion
127. System clears all query history for current user
128. User navigates to Settings → Alert Rules editor
129. User sees list of alert routing rules with drag handles and priority badges
130. User clicks and drags rule #3 to position #1
131. System updates priority badges live during drag operation
132. User drops rule at new position
133. System recalculates priority badges (#1, #2, #3, etc.)
134. User clicks \"Save Rules\" button
135. System persists new rule order and displays success toast
136. User waits for scheduled synthetic alert job to run (next hour)
137. System automatically inserts synthetic incident into live_incidents table with is_synthetic = true
138. Alert banner and toast notification appear for synthetic incident
139. Notification Center logs synthetic alert
140. User clicks \"Mark as Resolved\" button on incident card
141. System updates incident status to RESOLVED and stamps resolved_at timestamp (2026-06-12 00:45:30)
142. System displays success toast: \"Incident [ID] marked as resolved\"
143. Incident card updates to show RESOLVED status badge
144. Mark as Resolved button disappears from card
145. Resolved incident disappears from Dashboard incident list
146. User navigates to Analytics page
147. If 7-day rolling average MTTR exceeds threshold, MTTR Threshold Warning Banner appears on Analytics page
148. User sees 30-day Rolling MTTR Trend Chart with daily average MTTR values
149. Chart displays X-axis (Date) and Y-axis (Average MTTR in minutes)
150. User hovers over data point and sees tooltip with date and MTTR value
151. User clicks \"Export PDF\" button on Analytics page
152. Print-Preview Modal opens with checkboxes for each KPI card and chart section
153. All checkboxes are selected by default
154. User deselects \"Incident Volume Chart\" checkbox
155. User clicks \"Export PDF\" button inside modal
156. System hides unselected sections and calls window.print()
157. Browser print dialog opens
158. User saves as PDF or prints to printer
159. After print dialog closes, system restores all sections to visible state
160. System closes modal
161. User switches to light mode
162. All severity chips (CRITICAL/HIGH/MEDIUM/LOW) display with proper contrast (≥4.5:1)
163. All status badges (OPEN/INVESTIGATING/RESOLVED) display with proper contrast (≥4.5:1)
164. Alert banners display with proper contrast (≥4.5:1)
165. Chart axes tick labels display with proper contrast (≥4.5:1)
166. Tooltip text displays with proper contrast (≥4.5:1)
167. Card backgrounds display with proper contrast (≥4.5:1)
168. User waits 4 hours without updating any OPEN incident
169. Auto-resolve Edge Function runs on scheduled basis
170. System automatically marks stale incident as RESOLVED with resolved_at timestamp
171. System displays toast notification: \"[count] stale incidents auto-resolved\"
172. User opens project root directory and finds CHANGELOG.md file
173. CHANGELOG.md contains version entries from v1 through v9 with detailed change descriptions

## 7. Good to have for This Release

### 7.1 Good to have features

- Full enterprise authentication (SSO, SAML, LDAP integration)
- Real production write-back integrations to Splunk
- Full Splunk app packaging and App Inspect compliance
- Multi-tenant architecture with tenant isolation
- Advanced RBAC (role-based access control) beyond basic authentication
- Live streaming analytics beyond sample/demo needs
- Integration with incident management platforms beyond PagerDuty (Opsgenie, VictorOps)
- Custom dashboard creation and saved views
- Historical incident trend analysis and pattern detection
- Automated remediation actions or runbook execution
- Mobile application or responsive mobile optimization
- Collaborative investigation features (comments, annotations, shared workspaces)
- Customizable severity levels and status workflows
- Integration with CI/CD pipelines for deployment tracking
- Performance metrics and SLA tracking
- Audit logging and compliance reporting
- Custom AI model training or fine-tuning
- Multi-language support beyond English
- Dark/light theme toggle (dark mode only)
- Keyboard shortcuts and accessibility features
- Browser compatibility testing beyond Chrome/Firefox
- Load testing and performance optimization for large-scale deployments
- Customizable PowerPoint templates for different stakeholder audiences
- Scheduled incident report generation and email delivery
- Alert notification channels beyond toast and Notification Center (email, SMS, webhook)
- Alert filtering and routing rules based on severity or service (beyond drag-to-reorder)
- Incident correlation across multiple services
- Automatic incident deduplication (beyond visual indicator)
- Custom alert sound or visual effects
- Alert history export functionality
- Batch simulate alert generation for load testing
- SPL query validation and syntax highlighting
- Advanced SPL query builder UI
- MCP Server health monitoring and diagnostics
- Support for additional MCP tools beyond search
- Natural language query suggestions and autocomplete
- Query result export in multiple formats beyond CSV (JSON, Excel)
- Query result visualization and charting
- Configurable synthetic alert job schedule (beyond hourly)
- Synthetic alert job monitoring dashboard
- Query history export functionality
- Suggested queries customization and user preferences
- Suggested queries ranking based on user feedback
- Advanced incident list sorting options (by severity, timestamp, service)
- Incident list pagination for large datasets
- Notification Center filtering by severity or date range
- Notification Center export functionality
- Deep-link URL shortening service integration
- Query sharing via email or messaging platforms
- CSV export with custom column selection
- CSV export with formatting options
- PagerDuty bidirectional sync (write incidents back to PagerDuty)
- PagerDuty webhook integration for real-time incident updates
- Configurable PagerDuty incident filters (by service, urgency, status)
- PagerDuty sync history and audit log
- Template customization and user-defined templates
- Template versioning and rollback
- Template sharing across team members
- Alert rule templates and presets
- Alert rule testing and simulation
- Alert rule analytics and effectiveness tracking
- Drag-to-reorder for other UI elements (incident list, query history)
- Undo/redo for rule reordering
- Bulk rule operations (enable/disable, delete)
- Rule grouping and categorization
- Bulk incident status updates (beyond bulk-resolve)
- Incident status change history and audit trail
- Customizable MTTR calculation logic (exclude weekends, business hours only)
- MTTR trend comparison (week-over-week, month-over-month)
- Additional analytics charts (incident volume by service, resolution time distribution)
- Print-preview modal with live preview rendering
- Custom PDF export templates
- Scheduled analytics report generation and email delivery
- Accessibility audit and WCAG AAA compliance
- High-contrast mode for visually impaired users
- Screen reader optimization
- Configurable MTTR threshold alert notification channels (email, Slack, webhook)
- MTTR threshold alert history and audit log
- Auto-resolve rule exclusion list (services or incident types to exclude from auto-resolve)
- Auto-resolve notification to incident assignees
- Bulk-select mode with partial selection (select incidents matching criteria)
- Bulk incident assignment or tagging
- Incident History page export functionality (CSV, Excel)
- Incident History page advanced search (full-text search across all fields)
- Incident History page saved filter presets
- Incident History page column customization (show/hide columns)
- Real-time incident updates on History page (via Supabase Realtime)
- Configurable token budget per analysis type (initial analysis vs follow-up)
- Token usage analytics and reporting
- Analysis export with custom section selection
- Analysis export templates for different stakeholder audiences
- Scheduled analysis export and email delivery
- Analysis versioning and rollback
- Analysis comparison with more than two analyses (multi-way diff)
- Analysis comparison export with custom format options
- Analysis comparison visualization (charts showing metric changes over time)
- Historical analysis search and filtering
- Analysis tagging and categorization
- Collaborative analysis features (comments, annotations)
- Analysis approval workflow
- Analysis sharing with external stakeholders
