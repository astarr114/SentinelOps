# SentinelOps — Architecture Diagram

> **Splunk Agentic Ops Hackathon 2026 · Observability Track**

SentinelOps is a hybrid **dual-layer** system: **Layer A** gathers evidence from Splunk; **Layer B** runs AI reasoning. Every analysis records `evidenceSource` and `reasoningSource` in the UI and API payload.

---

## High-Level System Overview

```mermaid
flowchart TB
  subgraph Client["Browser — React 18 + Vite"]
    UI[Dashboard / Settings / Command Center]
    AuthCtx[AuthContext]
    SplunkCtx[SplunkContext]
    LlmCtx[LlmContext]
  end

  subgraph Supabase["Supabase Platform"]
    Auth[Supabase Auth]
    DB[(PostgreSQL + RLS)]
    RT[Realtime — live_incidents]
    EF[Edge Functions — Deno]
  end

  subgraph LayerA["Layer A — Evidence (Splunk)"]
    MCP[Splunk MCP Server 1.2\nPOST /services/mcp]
    REST[Splunk REST API\n:8089]
    Demo[Embedded Demo Data]
  end

  subgraph LayerB["Layer B — Reasoning (AI)"]
    Gemini[Gemini 2.5 Flash]
    Hosted[Splunk Hosted Model\nCloud only]
    Other[OpenAI / Anthropic optional]
  end

  UI --> AuthCtx --> Auth
  UI --> SplunkCtx --> DB
  UI --> LlmCtx --> DB
  UI --> EF
  UI --> RT

  EF --> DB
  EF --> MCP
  EF --> REST
  EF --> Demo
  EF --> Gemini
  EF --> Hosted
  EF --> Other

  MCP ---|ngrok TLS tunnel| SplunkEnt[Splunk Enterprise]
  REST ---|ngrok TLS tunnel| SplunkEnt
```

---

## Incident Analyze — Data Flow

Primary agentic workflow when a user clicks **Analyze** on an incident.

```mermaid
sequenceDiagram
  participant User
  participant React as React App
  participant IA as incident-analyze<br/>(Edge Function)
  participant MCP as Splunk MCP 1.2<br/>/services/mcp
  participant REST as Splunk REST
  participant LLM as Gemini 2.5 Flash
  participant DB as PostgreSQL

  User->>React: Select incident → Analyze
  React->>IA: POST /functions/v1/incident-analyze<br/>(SSE stream)

  alt MCP configured (priority)
    IA->>MCP: JSON-RPC tools/call<br/>splunk_run_query
    MCP-->>IA: Live SPL results
  else REST configured
    IA->>REST: POST /services/search/jobs
    REST-->>IA: Job results
  else No credentials
    IA->>IA: Load embedded demo evidence
  end

  IA->>LLM: Structured evidence + incident context
  LLM-->>IA: Hypotheses, blast radius, actions
  IA-->>React: SSE chunks (summary, timeline, …)
  React->>DB: Persist incident_analyses
  React-->>User: Render brief + LIVE·MCP badge
```

---

## Splunk MCP Integration (Layer A)

```mermaid
flowchart LR
  subgraph SentinelOps
    Settings[Settings Page]
    Test[splunk-test]
    E2E[splunk-mcp-e2e]
    MCPFn[splunk-mcp]
    Analyze[incident-analyze]
    Shared[_shared/splunkClient.ts]
  end

  subgraph Tunnel["Local dev tunnel"]
    Ngrok[ngrok HTTPS]
  end

  subgraph Splunk["Splunk Enterprise"]
    MCPApp[MCP Server App 1.2]
    Indexes[(Indexes)]
  end

  Settings -->|Save mcpUrl + token| DB[(splunk_configs)]
  Test --> Shared
  E2E --> Shared
  MCPFn --> Shared
  Analyze --> Shared
  Shared -->|POST JSON-RPC 2.0| Ngrok
  Ngrok -->|/services/mcp| MCPApp
  MCPApp --> Indexes
```

**Protocol details (MCP 1.2):**

| Item | Value |
|------|--------|
| Transport | Streamable HTTP — `POST {base}/services/mcp` |
| Protocol | JSON-RPC 2.0 |
| Primary tool | `splunk_run_query` |
| Fallback tool | `splunk_run_search` |
| Discovery | `initialize` + `tools/list` |
| ngrok | Auto `ngrok-skip-browser-warning: true` header |

---

## AI Reasoning Integration (Layer B)

```mermaid
flowchart TB
  subgraph Triggers
    Analyze[Analyze Incident]
    FollowUp[Follow-up Q&A]
    Cmd[Command Center chat]
    NLSPL[NL → SPL generation]
  end

  subgraph Router["_shared/llmRouter.ts"]
    Route{Provider router}
    Fallback[Fallback chain]
  end

  subgraph Providers
    G[Gemini 2.5 Flash — default]
    SHM[Splunk Hosted Model — Cloud]
    OAI[OpenAI GPT-4o]
    ANT[Anthropic Claude]
  end

  Analyze --> Route
  FollowUp --> Route
  Cmd --> Route
  NLSPL --> Route
  Route --> Fallback
  Fallback --> G
  Fallback --> SHM
  Fallback --> OAI
  Fallback --> ANT
```

**Attribution:** UI badges show `GEMINI`, `SPLUNK HOSTED MODEL`, etc. Analysis JSON includes `reasoningSource`.

---

## Edge Functions Map

| Function | Role |
|----------|------|
| `incident-analyze` | Core orchestration — evidence + AI brief (SSE) |
| `incident-followup` | Streaming follow-up chat |
| `splunk-mcp` | MCP relay — NL→SPL, direct tool calls |
| `splunk-test` | REST/MCP connectivity + auth debug |
| `splunk-mcp-e2e` | Health check — tools/list + SPL smoke tests |
| `large-language-model` | Gemini proxy for Command Center |
| `splunk-alerts` / `splunk-search` | Saved alerts + SPL execution |
| `splunk-alert-webhook` | Inbound Splunk alert → `live_incidents` |
| `ai-search` / `web-search` / `web-reader` | Investigation tools |
| `pagerduty-sync` / `slack-alert` / `alert-email` | Alert routing |

---

## Database (key tables)

```mermaid
erDiagram
  profiles ||--o{ splunk_configs : owns
  profiles ||--o{ incident_analyses : saves
  profiles ||--o{ live_incidents : views
  profiles ||--o{ e2e_test_runs : runs

  profiles {
    uuid id PK
    text username
    user_role role
  }
  splunk_configs {
    uuid user_id FK
    text splunk_host
    text splunk_mcp_url
    text mode
    jsonb mcp_tool_list
  }
  live_incidents {
    text incident_id
    text service
    text severity
    timestamptz opened_at
  }
  incident_analyses {
    uuid id PK
    jsonb analysis_result
    text incident_id
  }
```

---

## Deployment Topology

```mermaid
flowchart LR
  Dev[Developer laptop\npnpm dev :5173]
  Vercel[Vercel / static host\nvercel.json SPA]
  SupaCloud[Supabase Cloud\nAuth + DB + Edge Functions]
  SplunkLocal[Splunk Enterprise\nlocalhost:8089]
  Ngrok[ngrok tunnel]

  Dev --> Vercel
  Dev --> SupaCloud
  Vercel --> SupaCloud
  SupaCloud --> Ngrok
  Ngrok --> SplunkLocal
```

---

## Evidence vs Reasoning — Configuration Modes

| Mode | Evidence badge | Source |
|------|----------------|--------|
| Demo | `DEMO` | Embedded sample incidents (no Splunk) |
| Live REST | `LIVE · REST` | Splunk REST API via ngrok or direct HTTPS |
| Live MCP | `LIVE · MCP` | Splunk MCP Server 1.2 via ngrok or direct HTTPS |

MCP takes priority over REST when both are configured.

---

## Hackathon Submission Notes

- **Track:** Observability — agentic incident commander for on-call / SRE teams
- **Splunk MCP Server:** Full MCP 1.2 compliance — tool discovery, `splunk_run_query`, E2E panel
- **Splunk Hosted Models:** Supported when Splunk Cloud AI endpoint is configured; local Enterprise uses Gemini for reasoning
- **Demo reliability:** Demo mode works without Splunk credentials for judges

---

_SentinelOps · Splunk Agentic Ops Hackathon 2026_
