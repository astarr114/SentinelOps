# Windsurf Prompt — Build a Winning Splunk Hackathon Project

Build a complete, hackathon-winning, full-stack application called **SentinelOps**.

## Mission

This project is for the **Splunk Agentic Ops Hackathon**. The app must be designed to maximize scores on:

- Technological Implementation
- Design
- Potential Impact
- Quality of the Idea

It must also be intentionally built to compete for:
- Best Use of Splunk MCP Server
- Best Use of Splunk Hosted Models
- Best Use of Splunk Developer Tools

## Product concept

SentinelOps is an **Agentic Incident Commander for Splunk**.

It helps on-call engineers and operators investigate incidents faster by:
- pulling incident evidence from Splunk or demo data
- correlating logs, deployment events, and metadata
- generating an AI-assisted incident brief
- showing blast radius and timeline
- recommending next actions
- exporting a stakeholder-ready update

This is **not** a generic chatbot. It must feel like a real operational product.

## Track strategy

Build this primarily for the **Observability** track, but architect it so it can later support Security workflows too.

## Critical hackathon requirements to satisfy

The generated project must include all required submission materials:

- public-repo-ready codebase
- open-source license file
- strong README
- setup and run instructions
- example config or dataset
- architecture diagram file at repo root named `architecture_diagram.md`
- demo-ready app that works as shown
- obvious explanation of AI usage
- obvious explanation of Splunk usage

The project must function as depicted and be demoable in a video under 3 minutes.

## High-level user story

A deployment happens to `checkout-service`. Minutes later, latency spikes and 5xx errors rise. The user opens SentinelOps, clicks **Analyze Incident**, and sees:
- likely cause
- deployment correlation
- top errors
- affected endpoints
- impacted services
- blast radius
- recommended next actions
- exportable stakeholder summary

## Exact output expected

Generate the entire codebase with real working code, not a shallow scaffold.

Create:
- frontend
- backend
- sample data
- export logic
- architecture diagram
- README
- docs/demo-script.md
- .env.example
- license file

## Tech stack

Use:
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Python 3.11+ + FastAPI + Pydantic
- Data: local JSON demo datasets

## Project structure

Create exactly this structure:

```text
sentinelops/
├── README.md
├── LICENSE
├── architecture_diagram.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   └── incidents.py
│   │   ├── agents/
│   │   │   └── incident_agent.py
│   │   ├── services/
│   │   │   ├── splunk_service.py
│   │   │   └── mock_data_service.py
│   │   ├── models/
│   │   │   └── schemas.py
│   │   └── utils/
│   │       └── exporter.py
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

## Required product behavior

### Incident dashboard

Build a polished dashboard with:
- left sidebar incident list
- center panel for incident overview and AI brief
- evidence sections or tabs
- right or bottom actions panel

### Incident list

Show at least 3 incidents with:
- id
- title
- service
- severity
- status
- timestamp

### Main use case

The main incident should be:
- checkout-service latency spike after deployment
- DB timeout or backend failure evidence
- affected endpoints `/checkout` and `/payment/submit`

### Analyze Incident button

This is the primary CTA. When clicked:
- call backend analyze API
- gather demo evidence
- generate structured summary
- show loading state
- render complete result

### Result sections

Display:
- summary
- ranked hypotheses with confidence
- key evidence bullets
- blast radius
- timeline
- recommended actions
- open questions

### Follow-up prompts

Provide clickable prompts:
- What changed before the spike?
- Show top failing endpoints.
- What services are affected?
- Draft stakeholder update.

### Export feature

Implement export to Markdown incident report.
Also support copyable text blocks for Slack and Jira style summaries.

## Splunk + MCP story

This is extremely important.

Design the backend so it clearly supports:
- mock mode
- future live Splunk API mode
- future Splunk MCP Server mode

In `splunk_service.py`, create clear methods such as:
- `run_splunk_query()`
- `get_metadata()`
- `generate_spl()`
- `explain_spl()`

Even if mock data is used for the working demo, the architecture, service naming, README, and architecture diagram must make the MCP-based agent workflow obvious.

## AI behavior

Implement an `incident_agent.py` that:
- accepts structured incident context and evidence
- returns summary
- ranks hypotheses
- identifies blast radius
- proposes next actions
- produces open questions

If no real LLM is configured, use a strong deterministic mock summarizer that still feels believable and high quality.

## Design requirements

The UI must feel premium and judge-friendly.

Design language:
- dark operational dashboard
- premium but restrained
- excellent spacing and hierarchy
- compact cards
- enterprise-grade visual polish
- readable typography

Do NOT create:
- generic chatbot landing page
- colorful startup marketing site
- overblown gradients
- unstructured wall of logs

Use:
- severity badges
- confidence chips
- timeline cards
- metric/evidence tiles
- loading skeletons
- friendly error and empty states

## README requirements

Generate a strong README with these sections:
- project overview
- problem statement
- why it matters
- solution overview
- features
- architecture summary
- Splunk integration strategy
- MCP/AI usage explanation
- setup instructions
- demo mode instructions
- folder structure
- hackathon submission checklist

The README should make judges immediately understand:
- what the app does
- why it is impactful
- how Splunk is used
- how AI is used
- why it is a strong hackathon submission

## Architecture diagram

Create `architecture_diagram.md` with a Mermaid diagram showing:
- sample incident generator or data source
- Splunk ingestion / indexes
- frontend UI
- FastAPI backend
- incident agent
- Splunk service / MCP layer
- AI reasoning layer
- markdown/slack/jira export output

## API requirements

Implement these endpoints:
- `GET /api/incidents`
- `GET /api/incidents/{incident_id}`
- `POST /api/incidents/analyze`
- `POST /api/incidents/follow-up`
- `POST /api/incidents/export-markdown`

## Backend expectations

Implement real logic using sample JSON files.
The backend should:
- read sample data
- correlate incident with deploy events and logs
- identify top error patterns
- find impacted endpoints/services
- produce timeline data
- return structured analysis JSON

## Frontend expectations

Implement a clean working UI that:
- loads incidents from API
- opens detail view
- runs analysis
- renders structured result beautifully
- supports follow-up prompts
- supports markdown export

## Demo readiness

Build the project so it is immediately demoable after install.
No hidden dependencies. No broken flows. No empty placeholder screens.

## Code quality bar

Write production-style hackathon code:
- clean filenames
- modular functions
- typed interfaces where possible
- simple but real implementations
- readable comments only where useful

## Build order

Generate the project in this order:
1. sample data
2. backend models/services/apis
3. frontend layout and components
4. API integration
5. export logic
6. README
7. architecture diagram
8. demo script

## Final instruction

Generate the entire project so that a developer can clone it, install dependencies, run frontend and backend locally, and immediately demonstrate a strong Splunk hackathon submission.
