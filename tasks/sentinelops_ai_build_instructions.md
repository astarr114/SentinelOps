# SentinelOps AI Build Instructions

## Objective
This document provides phase-wise prompts and build instructions for the AI agent generating SentinelOps features. The AI should implement the product as an agentic decision platform that predicts, explains, and safely executes operational actions.

## Phase 1: Core Differentiators
Build the foundational intelligence layer first.

### Prompt 1: Predictive Risk Engine
Build a SentinelOps Predictive Risk Engine page for DevSecOps.
Requirements:
- Ingest mock logs, metrics, deployment events, and security alerts.
- Generate a risk score from 0 to 100 for each service.
- Show likely incident predictions for the next 30 minutes.
- Include trend arrows, confidence score, and top contributing signals.
- Add a timeline chart and a ranked incident watchlist.
- Include a side panel explaining why the model scored each service.
- Use a dark security-themed UI with a polished enterprise dashboard layout.

### Prompt 2: Incident Correlation Graph
Build a SentinelOps Incident Correlation Graph page.
Requirements:
- Visualize logs, metrics, traces, alerts, and cloud events as connected nodes.
- Allow users to click a node to see evidence, timestamps, and related signals.
- Show root cause candidates, blast radius, and impacted services.
- Include filters for time range, environment, severity, and service.
- Add an AI-generated plain-English summary card.
- Use an interactive graph UI with security dashboard styling.

### Prompt 3: Explainable Decision Journal
Build a SentinelOps Decision Journal page.
Requirements:
- Show a chronological list of AI recommendations, approvals, rejections, and executed actions.
- Each entry must include rationale, evidence, policy checks, confidence score, and outcome.
- Add search, filters, tags, and export to PDF/CSV.
- Include an expandable section titled "Why was this action suggested?".
- Design it as an immutable audit-friendly enterprise interface.

## Phase 2: Safe Autonomy
Add controlled execution with policy and rollback.

### Prompt 4: Autonomous Remediation With Approval Gates
Build a SentinelOps Autonomous Remediation module.
Requirements:
- Show detected issue, recommended fix, safety checks, and approval status.
- Include runbook steps like restart service, scale instance, rotate secret, block IP, or rollback deploy.
- Add human approval gates for risky actions.
- Include dry-run mode, execution logs, rollback option, and audit trail.
- Show safe, risky, and blocked-by-policy badges.
- Make the UI feel like a mission-control operations console.

### Prompt 5: Policy Guardrails
Build a SentinelOps Policy Guardrails page.
Requirements:
- Let admins define allowed actions, blocked actions, approval thresholds, and severity-based automation rules.
- Include editable policy cards and a policy simulation tester.
- Show what the AI can do automatically versus what requires approval.
- Add a policy conflict detector and validation warnings.
- Make it feel like a governance control plane for AI operations.

### Prompt 6: Incident Learning Loop
Build a SentinelOps Incident Learning Loop page.
Requirements:
- Store past incidents, resolution steps, and outcome ratings.
- Show which remediation actions were effective, partially effective, or failed.
- Recommend better actions based on historical outcomes.
- Include clustering of similar incidents and a lessons-learned panel.
- Add feedback buttons for analysts to mark AI suggestions as helpful or not.
- Design it like a learning dashboard for an autonomous SOC.

## Phase 3: Enterprise Trust
Strengthen auditability and compliance readiness.

### Prompt 7: Compliance Evidence Pack Generator
Build a SentinelOps Compliance Evidence Pack generator.
Requirements:
- Create an incident report builder that compiles timeline, evidence, decisions, approvals, and remediation actions.
- Support export to PDF and JSON.
- Auto-map findings to controls like access, change management, logging, and incident response.
- Include a checklist for auditors and a risk summary.
- Add templates for ISO 27001, SOC 2, and internal security reviews.
- Clean enterprise UI with export controls and status badges.

### Prompt 8: Immutable Audit Trail
Build a SentinelOps Immutable Audit Trail page.
Requirements:
- Maintain an append-only journal of decisions and actions.
- Log approvals, rejections, and execution outcomes.
- Support filtering and export for audits.
- Preserve traceability across incidents and automated workflows.
- Show timestamps, actors, policy checks, and linked incident IDs.
- Use a secure, compliance-first interface.

## Phase 4: Premium Capabilities
Add advanced decision support and interaction layers.

### Prompt 9: Cost-Security-Reliability Optimizer
Build a SentinelOps optimization page that balances cost, security, and reliability.
Requirements:
- Display three competing scores for each service: cost efficiency, security posture, reliability.
- Show recommended actions with tradeoff explanations.
- Include what-if simulation sliders for scaling, patching, and isolation.
- Highlight when a recommendation improves one area but hurts another.
- Add a decision summary that recommends the best overall action.
- Premium enterprise UI with clear charts and side-by-side comparisons.

### Prompt 10: Voice and Natural Language Command Center
Build a SentinelOps Voice and Natural Language Command Center.
Requirements:
- Allow users to ask questions in plain English.
- Trigger workflows through natural language.
- Explain system recommendations conversationally.
- Support guided operator actions and quick commands.
- Include a transcript panel, action preview, and confirmation step.
- Make the experience feel like an AI operations copilot.

## Global AI Build Instructions
The agentic AI should follow these rules across all phases:
- Prefer detection, explanation, and safe recommendation before automated execution.
- Use policy checks before any action is taken.
- Keep every decision auditable.
- Learn from outcomes and analyst feedback.
- Escalate uncertainty instead of acting blindly.
- Always preserve enterprise-grade visuals and a dark security-focused design language.

## Implementation Priority
Recommended order of execution:
1. Predictive Risk Engine.
2. Incident Correlation Graph.
3. Explainable Decision Journal.
4. Autonomous Remediation With Approval Gates.
5. Policy Guardrails.
6. Compliance Evidence Pack Generator.
7. Incident Learning Loop.
8. Immutable Audit Trail.
9. Cost-Security-Reliability Optimizer.
10. Voice and Natural Language Command Center.

## Delivery Goal
When complete, SentinelOps should be perceived as a decision platform for security and operations teams, not just a monitoring dashboard.
