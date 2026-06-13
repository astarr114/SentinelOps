# SentinelOps Winning Requirements

## Project name

SentinelOps — Agentic Incident Commander for Splunk

## Winning objective

This project must be built not only to qualify for the Splunk Agentic Ops Hackathon, but to maximize scoring across all four equally weighted judging criteria: **Technological Implementation**, **Design**, **Potential Impact**, and **Quality of the Idea**.[cite:1][cite:12]

The project must also be intentionally designed to compete for at least one bonus prize, especially **Best Use of Splunk MCP Server**, while remaining eligible for **Best Use of Splunk Hosted Models** and **Best Use of Splunk Developer Tools**.[cite:1][cite:12]

## Hackathon alignment

The hackathon requires entrants to submit an innovative AI-powered solution in one of three tracks: **Observability**, **Security**, or **Platform & Developer Experience**.[cite:1][cite:12] The project must clearly identify a chosen track and use one or more of Splunk’s latest AI capabilities such as AI agents for Splunk apps, Splunk MCP Server, hosted models, AI Assistant, or AI-powered app development tools.[cite:12]

### Chosen track

**Primary track:** Observability.[cite:1][cite:12]

### Secondary prize strategy

The implementation should also visibly target:
- Best Use of Splunk MCP Server.[cite:1][cite:12]
- Best Use of Splunk Hosted Models.[cite:1][cite:12]
- Best Use of Splunk Developer Tools.[cite:1][cite:12]

## Project thesis

Incident response is still too manual. Teams lose time switching between alerts, logs, deployments, service metadata, and response notes before they can form a useful hypothesis. SentinelOps solves this by turning Splunk telemetry into an **agentic incident command workflow** that retrieves evidence, explains what changed, ranks likely causes, estimates blast radius, and produces stakeholder-ready outputs.[cite:12][cite:1]

This should not feel like a generic chat app. It must feel like a high-value operational product that could realistically reduce mean time to understand and mean time to respond in engineering and operations teams.[cite:12]

## Product positioning

### One-line pitch

SentinelOps turns noisy Splunk signals into a guided incident response brief with evidence, ranked hypotheses, and next actions.[cite:12]

### Stronger narrative for judges

This project should be presented as an **AI-powered incident commander** for on-call, SRE, DevOps, and security-adjacent responders. It combines Splunk operational data with agentic reasoning so users can move from “something is broken” to “here is what changed, what is affected, and what to do next” in one interface.[cite:12]

## Core demo use case

A deployment to `checkout-service` happens at 10:37. At 10:42, latency spikes and 5xx errors rise. SentinelOps correlates the deploy window, log patterns, impacted endpoints, and service relationships, then generates a response brief that recommends rollback verification and database timeout investigation.

This use case is ideal because it is easy to understand, strongly tied to observability, and visually demoable in under three minutes, which matches the hackathon submission requirement for the video.[cite:1][cite:12]

## Winning strategy by judging criteria

### 1. Technological Implementation

To score highly here, the project must demonstrate quality software engineering and real Splunk-centric implementation depth.[cite:1][cite:12]

Required signals:
- Working full-stack application, not just notebooks or slides.
- Clean frontend/backend separation.
- Modular code structure.
- Real or realistically simulated Splunk integration layer.
- Deterministic fallback demo mode.
- Clear API contracts.
- Error handling and loading states.
- Export features that prove end-to-end usefulness.

### 2. Design

To score highly here, the project must feel polished and intentional.[cite:1][cite:12]

Required signals:
- Dashboard-first product UX.
- Distinct incident list, analysis panel, evidence sections, and action area.
- Excellent information hierarchy.
- Premium dark-mode design.
- Smooth loading, empty, and error states.
- Clear visual explanation of severity, confidence, blast radius, and timeline.

### 3. Potential Impact

To score highly here, the project must solve a recognizable enterprise problem and make the value obvious.[cite:1][cite:12]

Required signals:
- Strong problem statement around alert fatigue and slow triage.
- Specific ROI framing: faster triage, better context sharing, reduced investigation time.
- Outputs useful for actual teams: incident summary, action plan, stakeholder update.

### 4. Quality of the Idea

To score highly here, the project must be more than “chat with logs.”[cite:1][cite:12]

Required signals:
- Agentic workflow, not passive Q&A.
- Clear incident investigation orchestration.
- Blending observability evidence, timeline logic, and recommended response.
- Bonus if the architecture is future-ready for security workflows and platform tooling.

## Bonus prize strategy

### Best Use of Splunk MCP Server

This is the bonus prize the project should explicitly optimize for. The rules describe this prize as recognizing solutions that connect AI agents to Splunk data for automated investigation, contextual insights, and real-time decision-making.[cite:1]

Implementation requirements:
- Use the Splunk MCP Server 1.2 specification exactly: endpoint POST {base}/services/mcp (Streamable HTTP transport), tool name splunk_run_search, args { search, earliest_time, latest_time, max_count }.
- Probe order: /services/mcp (primary) → supplied URL → /mcp → /messages (legacy fallback).
- For ngrok-exposed Splunk: inject ngrok-skip-browser-warning: true header automatically — no user config needed.
- Expose clear method names such as splunk_run_search, get_metadata, generate_spl, and explain_spl.
- Mention MCP usage in README, UI wording, architecture diagram, and demo video.
- Show at least one visible agent-driven workflow enabled by Splunk data retrieval.
- Settings page shows inline documentation for MCP 1.2 endpoint and ngrok setup.

### Best Use of Splunk Hosted Models

The rules note that hosted models can support anomaly detection, forecasting, and natural language understanding for actionable insights.[cite:1]

Implementation requirements:
- Include an AI layer abstraction that can work with hosted models.
- Use the summary/hypothesis flow as the hosted-model story even if mock mode is also present.
- Mention this capability in README and architecture diagram.

### Best Use of Splunk Developer Tools

The rules highlight SDKs, App Inspect, and developer tooling, and judges will prioritize clean architecture, ease of use, and alignment with Splunk platform standards.[cite:1]

Implementation requirements:
- Maintain a clean repo with documentation and clear setup.
- Include architecture diagram and .env.example.
- Use maintainable modules and consistent naming.
- Add developer notes for future packaging or App Inspect compatibility where applicable.

## Required submission compliance

The final project must include the following mandatory submission assets:

- Public code repository.[cite:1][cite:12]
- Repository must be open source and include an open-source license visible at the top of the repo page.[cite:1][cite:12]
- Clear README documentation.[cite:1][cite:12]
- Setup and run instructions.[cite:1][cite:12]
- Required dependencies.[cite:1][cite:12]
- Example configurations or datasets if applicable.[cite:1][cite:12]
- Architecture diagram at the root of the repository named `architecture_diagram.md`, `architecture_diagram.pdf`, or `architecture_diagram.png`.[cite:1][cite:12]
- Demo video under three minutes, publicly visible on YouTube, Vimeo, or Youku.[cite:1][cite:12]
- Text description explaining features and functionality.[cite:1][cite:12]
- Clear explanation of how AI is used.[cite:1][cite:12]
- Project must function as depicted in the video and text description.[cite:1]

## Product scope

### In scope for MVP

- Full-stack web app
- Incident list and incident detail workflow
- Analyze Incident action
- Splunk evidence retrieval abstraction
- Demo/sample data mode
- AI-generated incident brief
- Follow-up investigative prompts
- Markdown export
- README and architecture diagram
- Demo script support files

### Out of scope for MVP

- Full enterprise authentication
- Real production write-back integrations
- Full Splunk app packaging
- Multi-tenant architecture
- Advanced RBAC
- Live streaming analytics beyond sample/demo needs

## Users

### Primary users

- SREs
- DevOps engineers
- NOC analysts
- Security analysts investigating service-impact events
- Engineering managers or incident commanders

### Jobs to be done

- Understand what changed before impact.
- See the most relevant evidence in one place.
- Get a useful root-cause starting point.
- Assess scope and urgency.
- Share status clearly with stakeholders.

## Functional requirements

### FR-1 Incident list

The app must display a list of incidents with:
- incident ID
- title
- service
- severity
- status
- opened timestamp
- quick summary

At least 3 incidents must exist in demo mode.

### FR-2 Incident detail screen

The app must provide a dedicated incident investigation screen showing:
- incident overview card
- severity and status badges
- selected time window
- primary Analyze Incident CTA
- evidence area
- action/export area

### FR-3 Analysis orchestration

When the user clicks Analyze Incident:
- the backend must gather evidence from mock/demo data and optionally Splunk
- the backend must assemble a structured evidence bundle
- the backend must generate an incident brief
- the frontend must render summary, evidence, hypotheses, blast radius, timeline, and actions

### FR-4 Splunk integration abstraction

The backend must include a Splunk integration layer that supports:
- demo/mock mode
- Splunk REST API mode (SPLUNK_HOST + SPLUNK_TOKEN)
- Splunk MCP Server 1.2 mode (POST {base}/services/mcp, tool: splunk_run_search)
- ngrok-exposed local Splunk (automatic ngrok-skip-browser-warning header)

Preferred interface methods:
- `splunk_run_search(search, earliest_time, latest_time, max_count)` — MCP 1.2 primary
- `run_splunk_query(query, time_window)` — REST API compatible
- `get_metadata(entity_type)`
- `generate_spl(question)`
- `explain_spl(query)`
- `get_saved_searches()` optional

### FR-5 Evidence sections

The UI must show at least these evidence sections:
- top error patterns
- recent deployment/change events
- affected services/endpoints
- metadata summary
- timeline of relevant events

### FR-6 AI brief

The AI brief must include:
- summary
- ranked hypotheses
- supporting evidence bullets
- blast radius
- recommended next actions
- open questions

### FR-7 Follow-up investigation

The UI must support at least 4 follow-up prompts:
- What changed before the spike?
- Show top failing endpoints.
- What services are affected?
- Draft stakeholder update.

### FR-8 Export capability

The app must support export or copy for:
- Markdown incident report
- Slack-style incident update
- Jira-style summary text

### FR-9 Demo reliability

The app must work without live Splunk credentials.

Requirements:
- sample data bundled in repo
- deterministic mock analysis fallback
- realistic incident outputs
- no broken primary flows when offline

## Non-functional requirements

### NFR-1 Design quality

The UI must be polished enough to compete on design scoring.[cite:1][cite:12]

Requirements:
- premium dark dashboard aesthetic
- restrained colors
- readable spacing and hierarchy
- loading skeletons
- clean empty/error states
- avoid generic chatbot look

### NFR-2 Performance

- Sample incident analysis should complete in under 10 seconds.
- App should feel responsive in demo conditions.
- Frontend should show progressive loading states.

### NFR-3 Stability

- If Splunk integration fails, app must fall back gracefully.
- Errors must be surfaced clearly.
- The main demo scenario must always remain usable.

### NFR-4 Maintainability

- Use modular architecture.
- Use descriptive filenames and service layers.
- Keep setup steps simple.
- Use `.env.example` for all configs.

## Technical requirements

### Frontend stack

Preferred:
- React
- Vite
- TypeScript
- Tailwind CSS

Frontend features:
- sidebar for incidents
- center panel for summary and evidence
- right or bottom panel for actions/export
- responsive layout for laptop demo
- dark mode

### Backend stack

Preferred:
- Python 3.11+
- FastAPI
- Pydantic

Backend modules:
- API routes
- incident agent/orchestrator
- Splunk service layer
- mock data service
- exporter utility
- schema models

### Data requirements

Repository must include realistic sample JSON for:
- incidents
- alerts
- app logs
- deploy events
- optional metadata

## Information architecture

### Main screens

1. Incident list dashboard
2. Incident detail page
3. Analysis results state
4. Export panel/modal

### Screen content priority

Top of page:
- incident summary
- severity
- service
- status
- time window
- Analyze Incident CTA

Middle:
- AI brief
- hypotheses
- evidence tabs/cards
- timeline

Secondary area:
- follow-up prompts
- export actions
- stakeholder summary

## Suggested API contract

### GET `/api/incidents`
Returns incident list.

### GET `/api/incidents/{incidentId}`
Returns incident detail.

### POST `/api/incidents/analyze`
Request:

```json
{
  "incidentId": "INC-1001",
  "service": "checkout-service",
  "timeWindow": "last_30m"
}
```

Response:

```json
{
  "incidentId": "INC-1001",
  "summary": "Checkout latency increased shortly after deployment v1.8.3.",
  "hypotheses": [
    {
      "title": "Deployment regression",
      "confidence": 0.82,
      "evidence": [
        "Latency spike began 5 minutes after deploy",
        "Database timeout exceptions increased 3.8x"
      ]
    }
  ],
  "blastRadius": {
    "services": ["checkout-service", "payment-api"],
    "endpoints": ["/checkout", "/payment/submit"]
  },
  "recommendedActions": [
    "Validate deployment rollback readiness",
    "Inspect DB timeout patterns",
    "Notify backend on-call owner"
  ],
  "timeline": [
    {"timestamp": "2026-05-21T10:37:00Z", "event": "deployment v1.8.3 released"},
    {"timestamp": "2026-05-21T10:42:00Z", "event": "latency spike detected"}
  ],
  "openQuestions": [
    "Did DB connection pool saturation start before or after the deploy?"
  ]
}
```

### POST `/api/incidents/follow-up`
Supports follow-up questions.

### POST `/api/incidents/export-markdown`
Returns markdown artifact content for download or copy.

## Repository structure

```text
sentinelops/
├── README.md
├── LICENSE
├── architecture_diagram.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── services/
│   │   ├── agents/
│   │   ├── models/
│   │   └── utils/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── lib/
│   ├── package.json
│   └── vite.config.ts
├── sample-data/
│   ├── incidents.json
│   ├── alerts.json
│   ├── app_logs.json
│   ├── deploy_events.json
│   └── metadata.json
└── docs/
    └── demo-script.md
```

## README requirements

The README must include:
- overview
- problem
- solution
- track selection
- AI usage explanation
- Splunk usage explanation
- MCP usage explanation
- architecture summary
- setup instructions
- demo mode explanation
- sample data explanation
- submission alignment checklist

## Architecture diagram requirements

The architecture diagram at repo root must clearly show:
- incident simulator or demo data source
- Splunk ingestion/indexes
- frontend application
- FastAPI backend
- incident agent/orchestrator
- Splunk integration or MCP layer
- AI summarization/hosted model layer
- export artifacts

## Demo video requirements support

The system must be built so the demo video can clearly show:
- the problem being solved
- the app working live
- how AI is used
- the value of the output
- the project functioning on its intended platform
- a full narrative in under 3 minutes.[cite:1][cite:12]

## Acceptance criteria for winning-level MVP

The MVP is complete only when all of the following are true:
- The app runs locally with sample data.
- A user can open an incident and analyze it end-to-end.
- The app renders a polished dashboard experience.
- The app visibly uses a Splunk-centered retrieval layer.
- The app produces a convincing AI-generated incident brief.
- The app exports a stakeholder-ready markdown update.
- The repo contains all mandatory hackathon assets and instructions.[cite:1][cite:12]
- The architecture and demo narrative clearly support a bonus prize story around MCP and hosted models.[cite:1]

## Implementation priority

1. Demoable incident flow
2. Polished UI and information hierarchy
3. Splunk integration abstraction and MCP story
4. Exportable artifacts
5. Documentation and submission readiness

## Final guidance

Always optimize for a convincing, working, visually strong submission that maps directly to the judging criteria and required assets. A smaller polished system will score better than a broad unfinished platform.[cite:1][cite:12]

---

## Delivered Features — v13.0.0 (Current)

The following enterprise-grade features have been fully implemented and are production-ready as of v13.0.0:

### Enterprise Analytics & Observability
- **Analytics Page (`/analytics`)** — Dedicated enterprise analytics dashboard with 10+ interactive Recharts visualisations: 14-day stacked incident trend bar chart, severity distribution donut, incidents-by-service horizontal bar, incident status overview pie chart, MTTR-by-service bar chart, SPL query activity area chart, Splunk alert severity donut, operational readiness radar, and cumulative velocity line chart.
- **KPI Summary Row** — Six live KPI cards (Total Incidents, Open, Critical, Avg MTTR, Splunk Alerts, SPL Queries) with trend badges, hydrated from real Supabase data with intelligent demo fallback.
- **Analytics Navigation** — BarChart2 icon button in the Dashboard header links directly to the Analytics page.

### Splunk Integration
- **Splunk Alert Import Severity Breakdown** — After a successful Splunk alert import, a Modal Dialog shows a colour-coded 2×2 grid with CRITICAL / HIGH / MEDIUM / LOW counts. Provides immediate visibility into the security posture of imported alerts.
- **Scheduled Auto-run for Query History** — Configurable interval selector (Off / 1 min / 5 min / 15 min / 30 min) in the Query History panel header. Live countdown timer and last-run timestamp. Automatically re-executes all saved SPL queries at the chosen interval — supports continuous Splunk monitoring workflows.
- **Webhook Delivery Log CSV Export** — Download button generates `webhook-delivery-log.csv` with columns: timestamp, result, detail, secret — supporting compliance and audit workflows.

### UI/UX & Branding
- **SentinelOps Logo** — Official brand logo placed on: Login page hero, Dashboard header (top-left), Settings header, and empty-state hero. Professional enterprise-grade visual identity.
- **Settings Two-Column Layout** — SettingsPage rebalanced from single-column to a full-width `lg:grid-cols-2` responsive grid (Left: Splunk REST + Webhook + Severity Rules + MCP; Right: Integrations + AI Model + Alert Routing + Simulate + Account). Maximises screen real-estate on widescreen displays.

### Prior Releases (v1–v12)
All prior features remain fully operational. Key highlights per version:
- **v12**: LLM fallback chain, LLM provider name-collision fix, fallback chain order indicator in Settings
- **v11**: LLM Fallback Chain, SPL Autocomplete (60+ commands), Alert Rule Live Preview, keyboard navigation shortcuts
- **v5–v10**: Notification Center, Incident Filters, Query History Search, Share/Deep-link, CSV export for SPL results, Splunk alert import, webhook delivery, PagerDuty/email/Slack integrations
- **v4**: Scheduled synthetic alert job (pg_cron), SPL Query History Panel, Suggested Queries Chips
- **v3**: NL→SPL Tool, Splunk MCP Server integration
- **v2**: Real-time alerting (Supabase Realtime), Simulate Alert pipeline
- **v1**: Initial release — Auth, Dashboard, AI analysis, Splunk abstraction, export, dark theme

---

## Delivered Features — v42.0.0 (Latest — 2026-05-21)

The following features have been fully implemented in v42 and directly strengthen the hackathon submission for the **Best Use of Splunk MCP Server** bonus prize and overall judging criteria.

### Splunk MCP Server 1.2 Full Compliance (Best MCP Prize Critical)

- **Correct endpoint** — Both `splunk-mcp` and `splunk-test` edge functions now POST to `{base}/services/mcp` (Splunk MCP 1.2 Streamable HTTP transport). Previous implementation incorrectly used `/messages` and `/mcp`.
- **Correct tool name** — Tool calls now use `splunk_run_search` (Splunk MCP 1.2 namespaced tool). Previous implementation used `"search"` which does not exist in MCP 1.2 and caused silent failures.
- **Correct argument schema** — Arguments updated to `{ search, earliest_time, latest_time, max_count }` per Splunk MCP 1.2 documentation.
- **Probe fallback chain** — Primary: `/services/mcp` → user-supplied URL → `/mcp` → `/messages` — ensures both 1.2 and legacy MCP deployments are tested.
- **Connectivity test** — `tools/list` call now reports tool count and first 3 tool names on success, providing strong visual confirmation that MCP is live.

### Ngrok Support for Local Splunk (Demo & Dev Friendliness)

- Automatic detection of ngrok-hosted URLs (`ngrok-free.app` / `ngrok.io`).
- `ngrok-skip-browser-warning: true` header injected on all requests — bypasses the interstitial page that previously caused JSON parse failures.
- Settings page MCP URL field shows ngrok placeholder (`https://battered-lukewarm-had.ngrok-free.dev`) and inline documentation explaining `/services/mcp` is appended automatically.
- Enables judges and evaluators to test against a real local Splunk instance during live demo.

### Command Center Enhancements (Agentic UX)

- **`scale` action type** — AI can now suggest horizontal scaling actions for services, rendered as orange TrendingUp action cards. System prompt includes scale as an explicit action.
- **`notify` action type** — AI can now draft and suggest team notifications, rendered as violet Bell action cards. System prompt includes notify as an explicit action.
- **Voice Language Selector** — 10 languages supported for voice input: English US/UK/India, Spanish, French, German, Japanese, Mandarin, Portuguese Brazil, Korean. Language picker appears next to the microphone button. Listening placeholder reflects active language.
- **Action Execution History Panel** — Slide-in right panel tracks every AI-suggested action executed in the session. Shows: type badge with colour-coded icon, action label, service/target metadata, execution timestamp. Entry count badge on History toggle button. Clear-all action. Auto-opens on first action execution.
- **ActionCard crash fix** — Unknown action types from LLM now render with neutral fallback style instead of crashing.
- **TypeScript SpeechRecognition shim** — Local interface shim eliminates TS2552 compile errors for Web Speech API types.

### Quick-command chips updated
- "Scale checkout-service to handle increased load"
- "Notify the on-call team about the payment outage"

### Scoring impact

| Criterion | v42 contribution |
|-----------|-----------------|
| Technological Implementation | MCP 1.2 compliance is correct protocol-level engineering; ngrok header fix resolves a real integration bug |
| Design | Action History panel + language selector add depth to the Command Center UX |
| Potential Impact | Scale/notify actions extend the agentic remediation story beyond read-only analysis |
| Quality of the Idea | MCP 1.2 compliance + multi-language voice = enterprise-grade, globally deployable incident command platform |
| **Best Use of Splunk MCP Server** | ✅ Endpoint correct, tool name correct, arg schema correct, ngrok-ready, connectivity tested |
