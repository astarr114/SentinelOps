-- ── Phase 2: Autonomous Remediation ─────────────────────────────────────
CREATE TABLE remediation_actions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    text NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL,
  playbook       text NOT NULL DEFAULT 'default',
  action_type    text NOT NULL DEFAULT 'restart',   -- restart|scale|rollback|notify|custom
  target_service text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',   -- pending|awaiting_approval|approved|running|success|failed|rejected|skipped
  risk_level     text NOT NULL DEFAULT 'medium',    -- low|medium|high|critical
  requires_approval boolean NOT NULL DEFAULT true,
  auto_approved  boolean NOT NULL DEFAULT false,
  approved_by    text,
  approved_at    timestamptz,
  rejected_by    text,
  rejected_at    timestamptz,
  rejection_reason text,
  started_at     timestamptz,
  completed_at   timestamptz,
  output_log     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE remediation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rem_select ON remediation_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY rem_insert ON remediation_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rem_update ON remediation_actions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── Phase 2: Policy Guardrails ────────────────────────────────────────────
CREATE TABLE policy_guardrails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL DEFAULT 'safety',   -- safety|compliance|cost|performance
  scope       text NOT NULL DEFAULT 'all',      -- all|service:<name>|env:<prod|staging>
  rule_type   text NOT NULL DEFAULT 'deny',     -- deny|require_approval|rate_limit|notify
  condition   text NOT NULL,
  action_types text[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  priority    int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE policy_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY pg_select ON policy_guardrails FOR SELECT TO authenticated USING (true);
CREATE POLICY pg_insert ON policy_guardrails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pg_update ON policy_guardrails FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pg_delete ON policy_guardrails FOR DELETE TO authenticated USING (true);

-- ── Phase 2: Incident Learning Loop ──────────────────────────────────────
CREATE TABLE incident_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     text NOT NULL,
  action_id       uuid REFERENCES remediation_actions(id) ON DELETE SET NULL,
  feedback_type   text NOT NULL,   -- helpful|not_helpful|false_positive|missed|correct_diagnosis
  comment         text,
  submitted_by    text,
  confidence_delta int,            -- -100..+100 effect on model confidence
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE incident_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_select ON incident_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY fb_insert ON incident_feedback FOR INSERT TO authenticated WITH CHECK (true);

-- ── Phase 3: Immutable Audit Trail ────────────────────────────────────────
CREATE TABLE audit_trail (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type   text NOT NULL,
  actor        text NOT NULL DEFAULT 'system',
  target_type  text,
  target_id    text,
  description  text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}',
  ip_address   text,
  session_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY at_select ON audit_trail FOR SELECT TO authenticated USING (true);
CREATE POLICY at_insert ON audit_trail FOR INSERT TO authenticated WITH CHECK (true);
-- Audit trail is immutable — no UPDATE or DELETE policies

-- ── Phase 3: Compliance Evidence Packs ───────────────────────────────────
CREATE TABLE compliance_packs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  framework    text NOT NULL DEFAULT 'SOC2',  -- SOC2|ISO27001|HIPAA|PCI-DSS|GDPR|NIST
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'draft', -- draft|generating|ready|exported
  generated_by text,
  evidence_count int NOT NULL DEFAULT 0,
  download_url text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE compliance_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_select ON compliance_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY cp_insert ON compliance_packs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cp_update ON compliance_packs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── Seed default policy guardrails ───────────────────────────────────────
INSERT INTO policy_guardrails (name, description, category, scope, rule_type, condition, action_types, priority) VALUES
  ('No prod DB deletion', 'Prevent any DROP or DELETE SQL on production databases without DBA approval', 'safety', 'env:prod', 'deny', 'action_type = "db_delete" AND environment = "prod"', ARRAY['db_delete'], 1),
  ('Scale limit: max 10 pods', 'Horizontal scaling cannot exceed 10 replicas without approval', 'cost', 'all', 'require_approval', 'action_type = "scale" AND replicas > 10', ARRAY['scale'], 10),
  ('Rollback requires owner sign-off', 'Production rollbacks need service owner approval unless P1', 'compliance', 'env:prod', 'require_approval', 'action_type = "rollback" AND severity != "P1"', ARRAY['rollback'], 20),
  ('Notify on any IP block', 'All IP blocking actions must notify the security team', 'safety', 'all', 'notify', 'action_type = "ip_block"', ARRAY['ip_block'], 30),
  ('Rate limit restarts: max 3/hour', 'Pod restarts are limited to 3 per service per hour', 'performance', 'all', 'rate_limit', 'action_type = "restart" AND count > 3', ARRAY['restart'], 40),
  ('No change-freeze deploys', 'Block deployments during declared change-freeze windows', 'compliance', 'env:prod', 'deny', 'action_type = "deploy" AND change_freeze = true', ARRAY['deploy', 'rollback'], 5),
  ('Require MFA for config changes', 'Configuration changes require MFA-verified session', 'safety', 'all', 'require_approval', 'action_type = "config_change"', ARRAY['config_change'], 15),
  ('Cost guardrail: $500/action', 'Actions estimated to cost more than $500 require finance approval', 'cost', 'all', 'require_approval', 'estimated_cost > 500', ARRAY['scale', 'provision'], 25);

-- Seed audit trail entries
INSERT INTO audit_trail (event_type, actor, target_type, target_id, description, metadata) VALUES
  ('incident.resolved', 'AI System', 'incident', 'INC-0041', 'Incident auto-resolved after timeout', '{"method":"auto_resolve","timeout_hours":4}'),
  ('remediation.executed', 'AI System', 'service', 'checkout-service', 'Pod restart executed autonomously', '{"action":"restart","pod":"checkout-svc-3","result":"success"}'),
  ('policy.evaluated', 'Policy Engine', 'action', 'scale-payment-gateway', 'Scale action approved by policy engine', '{"policy":"scale_limit","result":"approved","replicas":8}'),
  ('user.login', 'admin', 'session', NULL, 'User signed in', '{"method":"email"}'),
  ('config.changed', 'admin', 'settings', 'splunk_connection', 'Splunk host updated', '{"field":"splunk_host"}'),
  ('alert.fired', 'splunk-webhook', 'incident', 'INC-0042', 'Splunk alert received via webhook', '{"search_name":"High error rate","severity":"HIGH"}');

-- Seed compliance pack (demo)
INSERT INTO compliance_packs (title, framework, period_start, period_end, status, generated_by, evidence_count) VALUES
  ('SOC 2 Type II — Q1 2026', 'SOC2', '2026-01-01', '2026-03-31', 'ready', 'admin', 147),
  ('ISO 27001 Annual Review', 'ISO27001', '2025-07-01', '2026-06-30', 'draft', NULL, 0);