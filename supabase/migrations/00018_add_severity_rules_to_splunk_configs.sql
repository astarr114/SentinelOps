
-- Add a JSONB column to store per-user severity keyword rules.
-- Structure: { critical: string[], high: string[], medium: string[], low: string[] }
-- NULL means "use built-in defaults in the edge function".
ALTER TABLE splunk_configs
  ADD COLUMN severity_rules jsonb DEFAULT NULL;

-- Ensure user_id on splunk_saved_alerts has a DB-level default to auth.uid()
-- so client-side upserts without an explicit user_id still work.
ALTER TABLE splunk_saved_alerts
  ALTER COLUMN user_id SET DEFAULT auth.uid();
