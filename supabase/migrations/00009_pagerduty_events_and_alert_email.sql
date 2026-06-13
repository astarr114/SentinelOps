
-- PagerDuty event audit trail
CREATE TABLE pagerduty_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_id text NOT NULL,
  action      text NOT NULL CHECK (action IN ('trigger','acknowledge','resolve')),
  dedup_key   text NOT NULL,
  pd_status   text,
  pd_message  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagerduty_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION can_select_pagerduty_events(row_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT row_user_id = auth.uid();
$$;

CREATE POLICY "users can view own pd events"
  ON pagerduty_events FOR SELECT TO authenticated
  USING (can_select_pagerduty_events(user_id));

CREATE POLICY "service role full access pd events"
  ON pagerduty_events FOR ALL TO service_role
  USING (true);

-- Add PagerDuty routing key + email fields to splunk_configs (stored per user)
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS pagerduty_routing_key text,
  ADD COLUMN IF NOT EXISTS alert_email            text;

-- Add email action type to alert_rules (existing enum-like text column)
-- No schema change needed — action is already a text column.
-- We just document the new values: 'email', 'toast_and_email', 'pagerduty', 'all_channels'
COMMENT ON COLUMN splunk_configs.pagerduty_routing_key IS
  'PagerDuty Events API v2 routing key for this user''s integration';
COMMENT ON COLUMN splunk_configs.alert_email IS
  'Email address to receive CRITICAL/HIGH alert notifications';
