# SentinelOps — Use Cases & Future Roadmap

> This document covers the real-world problems SentinelOps solves today and the advanced capabilities planned for future releases.

---

## Current Use Cases

### 1. On-Call Triage — "What is broken and why?"

**Problem**: A 3am PagerDuty alert fires. The on-call engineer opens Splunk, runs a dozen searches across multiple indexes, checks the deploy calendar, correlates error patterns — all manually, under pressure, half-asleep.

**SentinelOps solution**:
1. Select the incident from the live feed
2. Click **Analyze** (or use the Quick 2k preset for a 10-second triage summary)
3. Receive: ranked root-cause hypotheses, affected services/endpoints, blast radius, and immediate recommended action — in under 30 seconds

**Outcome**: MTTU (Mean Time To Understand) drops from 20–45 minutes to under 2 minutes. The on-call engineer arrives at the war room with a hypothesis already in hand.

---

### 2. Post-Incident Post-Mortem — "What exactly changed between then and now?"

**Problem**: After an incident is resolved, teams spend hours writing post-mortems, comparing the pre-incident state to the degraded state, and tracking which mitigations actually worked across multiple analysis sessions.

**SentinelOps solution**:
- **Past Analyses panel** stores every AI analysis run on an incident, timestamped and labelled by data source
- **Side-by-side diff view** compares any two historical analyses word-by-word across all 11 sections (hypotheses, timeline, blast radius, recommended actions, etc.)
- Changed-section count badge shows exactly how much the incident evolved
- **Export as Markdown or PDF** for the post-mortem document — all sections formatted, ready to paste into Confluence or Notion

**Outcome**: Post-mortem writing time cut from 2–3 hours to 20–30 minutes. Objective diff evidence replaces subjective memory.

---

### 3. Multi-Service Incident War Room — "How far has this spread?"

**Problem**: A checkout failure cascades to payment-api, then inventory-service. Three teams are on a bridge call, each pulling their own dashboards, with no single source of truth for blast radius.

**SentinelOps solution**:
- Blast radius section lists all affected downstream services and endpoints
- User impact estimate (e.g. "12,400 users") and revenue impact estimate (e.g. "$4,200/min") give business-language context
- **Command Center** voice mode lets team leads issue spoken commands ("What's the status of payment-api?") while keeping their hands free on the bridge call
- **Email Comparison Report** sends the full diff between two analysis snapshots to the war room distribution list in one click

**Outcome**: Single shared AI-generated source of truth reduces cross-team confusion and duplicate investigation effort.

---

### 4. SRE Capacity Planning — "Should we scale now, or wait?"

**Problem**: Sustained high error rate with growing latency — is this a code regression or a traffic spike? Scaling prematurely wastes money; waiting too long extends the incident.

**SentinelOps solution**:
- **Deep Dive (16k) preset** runs an exhaustive analysis: full timeline, error pattern breakdown, deploy event correlation, and open questions flagged for investigation
- **Command Center `scale` action** — asking "Should I scale checkout-service?" returns an AI recommendation with risk considerations and step-by-step scaling instructions
- Historical analyses let SREs compare traffic patterns across multiple incidents to identify repeat capacity thresholds

**Outcome**: Data-backed scaling decisions in minutes instead of hours of manual SPL analysis.

---

### 5. Splunk MCP Tool Discovery — "What can my Splunk instance actually do?"

**Problem**: New team members joining a Splunk deployment don't know which saved searches exist, which indexes are available, or how to construct valid SPL for their specific environment.

**SentinelOps solution**:
- **MCP Tool Explorer** lists all 10 Splunk MCP Server 1.2 tools with descriptions, category badges, and interactive run cards
- **NL→SPL tool** converts plain-English questions into valid SPL, executable directly via MCP with results shown inline
- **SPL Query History** persists every generated query per user — replay any previous query with one click
- **SPL Autocomplete** suggests commands, field names, and aggregation functions as you type

**Outcome**: New team members become productive in Splunk in days instead of weeks.

---

### 6. Alert Fatigue Reduction — "Which alerts actually matter?"

**Problem**: Splunk fires hundreds of alerts daily. 80% are noise. On-call engineers become desensitised and miss the critical 20%.

**SentinelOps solution**:
- **Alert routing rules** filter by severity, service, and status — only CRITICAL and HIGH alerts surface as banners and toasts
- **Incident deduplication indicator** flags when multiple open incidents share the same service, preventing duplicate investigation
- **Synthetic incident filter** hides TEST alerts from the live feed
- **Notification Center** maintains a full, clearable alert history so nothing is permanently lost even when banners are dismissed

**Outcome**: On-call engineers focus on actionable alerts; alert fatigue decreases measurably.

---

### 7. Interrupted Investigation Recovery — "I was in the middle of something"

**Problem**: A long-running AI analysis is cut short by a page refresh, network drop, or browser crash. The engineer has to start from scratch.

**SentinelOps solution**:
- **Auto-save draft** stores partial streaming results to `localStorage` every 30 seconds keyed by incident ID
- On re-selecting the incident, a **Draft Recovery Banner** offers one-click restore of the partial result with draft age and token count displayed
- **Token Budget Control** lets engineers intentionally stop at 2k tokens for a quick summary and re-run at 16k for full depth when time allows

**Outcome**: No lost work from interruptions; engineers can deliberately trade analysis depth for speed depending on time pressure.

---

## Future Advanced Features

### Near-Term (6–12 months)

#### Incident Correlation Graph
Visualise dependency relationships between simultaneous incidents as a directed graph. Automatically detect when a root incident is causing cascading failures in downstream services and group them under a single investigation.

#### Automated Runbook Execution
When SentinelOps recommends "restart the payment-api pods", a **Run** button executes the corresponding runbook step via the Splunk MCP `splunk_run_saved_search` tool or a connected Kubernetes/AWS API — with approval workflow and full audit trail.

#### Proactive Anomaly Detection
Instead of waiting for PagerDuty to fire, SentinelOps monitors Splunk indexes on a configurable schedule and surfaces emerging anomalies (rising error rates, latency percentile shifts) before they cross alert thresholds.

#### Real-Time Collaborative Investigation
Multiple engineers can join the same incident investigation simultaneously. Comments, hypothesis votes, and evidence pins are synchronised via Supabase Realtime, creating a shared living document of the investigation.

#### PagerDuty / Opsgenie Bi-directional Sync
- Create PD incidents from SentinelOps with pre-populated AI brief
- Acknowledge and resolve PD incidents from the incident detail panel
- Pull PD alert history into the timeline section

---

### Medium-Term (12–24 months)

#### Fine-Tuned Incident LLM
Fine-tune a specialised model on anonymised historical incident data from the organisation. Hypotheses and recommended actions become increasingly accurate as the model learns the specific failure patterns of the infrastructure.

#### SPL Query Validation & Safety Check
Before executing SPL via MCP, validate syntax and scan for dangerous patterns (unbounded searches, high-cardinality fields without time limits) that could overload the Splunk indexer.

#### CI/CD Deploy Correlation Pipeline
Ingest deployment events directly from GitHub Actions, Jenkins, or Argo CD webhooks. Automatically correlate every deploy event with the incident timeline without relying on Splunk deploy-event searches.

#### Custom Dashboard Builder
Drag-and-drop widget-based dashboard builder. Save named views per user or team. Embed specific chart types, KPI cards, and incident lists in any layout — with scheduled PDF email delivery.

#### Multi-Tenant Enterprise Mode
Full tenant isolation via `tenant_id` RLS policies. Separate Splunk configurations, AI providers, alert rules, and analytics per business unit or customer — under a single SentinelOps deployment.

---

### Long-Term Vision (24+ months)

#### Autonomous Incident Responder
SentinelOps moves from **assistant** to **agent**: it monitors, detects, analyses, executes approved runbook steps, and drafts the post-mortem — all without human initiation. Engineers review and approve, rather than drive.

#### Cross-Platform Observability Fusion
Ingest signals from Datadog, Grafana, New Relic, and CloudWatch alongside Splunk. Correlate signals across platforms in a unified incident timeline, with AI understanding of which platform owns which signal.

#### Predictive Incident Prevention
Train on historical incident data to predict which combination of deployment patterns, traffic profiles, and error rate trends is likely to produce an incident within the next N hours — and recommend pre-emptive action.

#### Natural Language SLA Management
Define SLA contracts in plain English ("checkout-service P99 must be under 500ms for 99.9% of requests in any 30-minute window"). SentinelOps monitors compliance, fires alerts on breach risk, and auto-generates SLA reports for stakeholders.

#### Voice-First Mobile Operations
A dedicated mobile companion app optimised for on-call engineers. Voice commands, push notifications with AI summaries, one-tap runbook execution, and offline draft analysis caching — all from a phone during an incident.

---

_SentinelOps · Built for Splunk Agentic Ops Hackathon 2026_
